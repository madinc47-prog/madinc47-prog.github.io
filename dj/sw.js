/* DJ Psycho Fingers PWA service worker (scope /dj/). Network-first for the app shell so updates always arrive;
 * falls back to cache offline. Pad samples: served from the "pfdj-pads-v4" cache (cache-first).
 * User music never touches this worker (it lives in IndexedDB / blob: URLs); media, ranges and cross-origin are passed through. */
var VER = "20261023d", SHELL = "pfdj-shell-" + VER, PADS = "pfdj-pads-v4";
var CORE = ["./", "index.html", "video.html", "dj.css", "manifest.webmanifest", "video.webmanifest", "icons/dj-192.png", "icons/vdj-192.png", "samples/manifest.json"];
self.addEventListener("install", function (e) { e.waitUntil(caches.open(SHELL).then(function (c) { return c.addAll(CORE); }).catch(function () {}).then(function () { return self.skipWaiting(); })); });
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return (k.indexOf("pfdj-shell-") === 0 && k !== SHELL) || (k.indexOf("pfdj-pads-") === 0 && k !== PADS); }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
self.addEventListener("fetch", function (e) {
  var r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || r.headers.has("range") || u.origin !== location.origin) return;
  var scope = new URL(self.registration.scope).pathname;
  if (u.pathname.indexOf(scope) !== 0) return;
  if (/\.(mp4|webm|m4a|wav|flac|ogg|opus|aac)$/i.test(u.pathname)) return;           // media: pass through
  if (u.pathname.indexOf(scope + "samples/") === 0 && /\.mp3$/i.test(u.pathname)) {   // pad pack: cache-first
    e.respondWith(caches.open(PADS).then(function (c) { return c.match(r, { ignoreSearch: true }).then(function (hit) {
      return hit || fetch(r).then(function (res) { if (res.ok) c.put(r, res.clone()); return res; }); }); }));
    return;
  }
  e.respondWith(fetch(r).then(function (res) {                                         // shell: network-first
    if (res.ok && res.type === "basic") { var cp = res.clone(); caches.open(SHELL).then(function (c) { c.put(r, cp); }); }
    return res;
  }).catch(function () { return caches.match(r, { ignoreSearch: true }).then(function (hit) { return hit || (r.mode === "navigate" ? caches.match(u.pathname.indexOf("video") >= 0 ? "video.html" : "index.html") : Response.error()); }); }));
});
