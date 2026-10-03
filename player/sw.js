// Psycho Fingers Player — service worker (app shell cache; audio is never cached here)
const VERSION = 'pf-player-v6';
const SHELL = [
  './', './index.html', './player.css?v=6', './player.js?v=6', './scene.js', './outfits.js', './eq.js', './viz.js', './util.js',
  './manifest.webmanifest', './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png',
  '../shared/media-store.js', '../shared/ecosystem-nav.js',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('pf-player-') && k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (/\.(mp3|wav|ogg|m4a|aac|flac|opus|webm|mp4)$/i.test(url.pathname)) return; // stream audio from network
  const inShell = url.pathname.includes('/player/') || url.pathname.includes('/shared/');
  if (!inShell) return;
  // stale-while-revalidate for the shell; navigation falls back to the cached page offline
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const key = req.mode === 'navigate' ? './index.html' : req;
    const cached = await cache.match(key, { ignoreSearch: req.mode === 'navigate' });
    const net = fetch(req).then((res) => { if (res && res.ok && res.type === 'basic') cache.put(key, res.clone()); return res; }).catch(() => null);
    if (cached) { e.waitUntil(net); return cached; }
    const res = await net; if (res) return res;
    return new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
  })());
});
