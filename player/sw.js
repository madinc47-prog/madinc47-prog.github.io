// Psycho Fingers Player — service worker (app shell cache; audio is never cached here)
// v9: network-first for the app files (the old stale-while-revalidate served last version's code first, mixing
// old and new files after an update), versioned module URLs, fresh install fetches, and a one-time reload of
// pages still running the old code when upgrading from v8 or older.
const VERSION = 'pf-player-v9';
const V = '?v=9';
const SHELL = [
  './', './index.html', './player.css' + V, './player.js' + V, './scene.js' + V, './outfits.js' + V, './eq.js' + V, './hype.js' + V,
  './ladies.js' + V, './viz.js' + V, './util.js' + V, './kokoro-worker.js' + V,
  './manifest.webmanifest', './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png',
  '../shared/media-store.js', '../shared/ecosystem-nav.js',
];
self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    // cache:'reload' skips the browser's HTTP cache so we never store a stale copy of a file from the last version
    await Promise.all(SHELL.map(async (u) => {
      try { const r = await fetch(new Request(u, { cache: 'reload' })); if (r.ok) await c.put(u, r); } catch (_) { /* offline: filled on use */ }
    }));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    const old = keys.filter((k) => k.startsWith('pf-player-') && k !== VERSION && !k.endsWith('-voice'));
    const oldVoice = keys.filter((k) => k.startsWith('pf-player-') && k.endsWith('-voice') && k !== VERSION + '-voice');
    // keep downloaded hype clips: move them into the new voice cache
    for (const k of oldVoice) {
      try { const from = await caches.open(k), to = await caches.open(VERSION + '-voice'); for (const req of await from.keys()) { const r = await from.match(req); if (r) await to.put(req, r); } } catch (_) {}
      await caches.delete(k);
    }
    await Promise.all(old.map((k) => caches.delete(k)));
    await self.clients.claim();
    if (old.length) { // upgrading from an older version: pages opened with the old code reload once onto the new code
      const wins = await self.clients.matchAll({ type: 'window' });
      for (const w of wins) { try { if (new URL(w.url).pathname.includes('/player/')) w.navigate(w.url); } catch (_) {} }
    }
  })());
});
self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.includes('/player/voice/') && url.pathname.endsWith('.mp3')) { // hype-talk clips: small, cache on first use
    e.respondWith(caches.open(VERSION + '-voice').then(async (c) => (await c.match(req)) || fetch(req).then((r) => { if (r.ok) c.put(req, r.clone()); return r; })));
    return;
  }
  if (/\.(mp3|wav|ogg|m4a|aac|flac|opus|webm|mp4)$/i.test(url.pathname)) return; // stream audio from network
  const inShell = url.pathname.includes('/player/') || url.pathname.includes('/shared/');
  if (!inShell) return;
  // network-first (revalidated with the server), cached copy only when offline or the network is very slow
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const key = req.mode === 'navigate' ? './index.html' : req;
    const net = fetch(req, { cache: 'no-cache' }).then((res) => { if (res && res.ok && res.type === 'basic') cache.put(key, res.clone()); return res; });
    try {
      return await Promise.race([net, new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), req.mode === 'navigate' ? 4000 : 6000))]);
    } catch (_) {
      const cached = await cache.match(key, { ignoreSearch: req.mode === 'navigate' });
      if (cached) { e.waitUntil(net.catch(() => {})); return cached; }
      try { return await net; } catch (_) { return new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } }); }
    }
  })());
});
