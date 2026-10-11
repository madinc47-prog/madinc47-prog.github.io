/* Island Pin Beats — instrument library (window.IPBLibrary).
 * ~430 sounds listed in library/manifest.json (see library/CREDITS.md). Nothing downloads until a sound is previewed or picked;
 * downloaded files go into the Cache API ("ipb-library-v1") so they work offline next time. Decoded AudioBuffers are kept in a
 * small LRU (sounds in use by a layer are pinned) so a mid-range Android phone does not run out of memory.
 * Kinds: one (one-shot, optional root note r) · multi (zones z: [midi] or [midi, velocityLayer], v = layer split points)
 *        loop (bpm, key) · preset (built-in synth engine voice p: { i, tone, oct, lp } — no file).
 */
(function () {
  "use strict";
  var BASE = (function () { var s = document.currentScript && document.currentScript.src; return s ? s.replace(/[^/]*$/, "") + "library/" : "library/"; })();
  var CACHE = "ipb-library-v1", MAX_DECODED = 48e6; // bytes of decoded audio kept around (≈ 4.5 min mono @ 44.1 kHz)
  var man = null, byId = {}, ready = null, mem = {}, pending = {}, pinned = {}, dctx = null, listeners = [];
  function url(rel) { return BASE + rel; }
  function files(it) {
    if (!it || it.k === "preset") return [];
    if (it.k === "multi") return it.z.map(function (z) { return "inst/" + it.id + "/" + z[0] + (z.length > 1 ? "v" + z[1] : "") + ".mp3"; });
    if (it.f) return [it.f];
    return [it.k === "loop" ? "loops/" + it.id.slice(2) + ".mp3" : "snd/" + it.c + "/" + it.id + ".mp3"];
  }
  function cacheOpen() { return window.caches ? caches.open(CACHE).catch(function () { return null; }) : Promise.resolve(null); }
  /* cache-first fetch; network result is stored. Rejects when offline and not cached. */
  function fetchBytes(rel) {
    var u = url(rel);
    return cacheOpen().then(function (c) {
      return (c ? c.match(u) : Promise.resolve(null)).then(function (hit) {
        if (hit) return hit.arrayBuffer();
        return fetch(u).then(function (r) {
          if (!r.ok) throw new Error("HTTP " + r.status + " " + rel);
          if (c) c.put(u, r.clone()).catch(function () { /* storage full: still play it */ });
          return r.arrayBuffer();
        });
      });
    });
  }
  function init() {
    if (ready) return ready;
    ready = cacheOpen().then(function (c) {
      var u = url("manifest.json");
      var net = fetch(u, { cache: "no-cache" }).then(function (r) { if (!r.ok) throw new Error("manifest " + r.status); if (c) c.put(u, r.clone()); return r.json(); });
      return net.catch(function (e) { return c ? c.match(u).then(function (h) { if (!h) throw e; return h.json(); }) : Promise.reject(e); });
    }).then(function (m) {
      man = m; byId = {};
      m.items.forEach(function (it) { byId[it.id] = it; });
      return m;
    });
    ready.catch(function () { ready = null; });
    return ready;
  }
  function decodeCtx(c) {
    if (c && c.decodeAudioData && !(window.OfflineAudioContext && c instanceof OfflineAudioContext)) return c;
    if (!dctx) { var O = window.OfflineAudioContext || window.webkitOfflineAudioContext; dctx = new O(1, 1, 44100); }
    return dctx;
  }
  function decode(c, ab) {
    return new Promise(function (res, rej) { var p = decodeCtx(c).decodeAudioData(ab, res, rej); if (p && p.then) p.then(res, rej); }).then(edge);
  }
  // 1.5 ms fade-in so no file can click at its start (covers older files too)
  function edge(b) {
    var n = Math.min(b.length, Math.round(b.sampleRate * 0.0015));
    for (var c = 0; c < b.numberOfChannels; c++) { var d = b.getChannelData(c); for (var i = 0; i < n; i++) d[i] *= 0.5 - 0.5 * Math.cos(Math.PI * i / n); }
    return b;
  }
  function memBytes() { var n = 0; Object.keys(mem).forEach(function (k) { n += mem[k].bytes; }); return n; }
  function evict() {
    var keys = Object.keys(mem).filter(function (k) { return !pinned[k]; }).sort(function (a, b) { return mem[a].last - mem[b].last; });
    while (memBytes() > MAX_DECODED && keys.length) delete mem[keys.shift()];
  }
  /* silence before the first transient (s): first sample above 5 % of the peak, minus 2 ms; up to 150 ms trimmed */
  function leadOf(b) {
    var d = b.getChannelData(0), n = Math.min(d.length, Math.round(b.sampleRate * 0.3)), pk = 0, i;
    for (i = 0; i < d.length; i++) { var a = d[i] < 0 ? -d[i] : d[i]; if (a > pk) pk = a; }
    if (!pk) return 0;
    for (i = 0; i < n; i++) if ((d[i] < 0 ? -d[i] : d[i]) > pk * 0.05) break;
    var t = (i - Math.round(b.sampleRate * 0.002)) / b.sampleRate;
    return t > 0.004 && t <= 0.15 ? t : 0;
  }
  /* load(id, ctx) → Promise<sound>. sound = { it, zones: [{ root, v, buf }] } (presets: zones = []) */
  function load(id, c) {
    if (mem[id]) { mem[id].last = Date.now(); return Promise.resolve(mem[id].snd); }
    if (pending[id]) return pending[id];
    var p = init().then(function () {
      var it = byId[id];
      if (!it) throw new Error("Unknown sound " + id);
      var fs = files(it);
      return Promise.all(fs.map(function (rel) { return fetchBytes(rel).then(function (ab) { return decode(c, ab); }); })).then(function (bufs) {
        var swell = it.k === "loop" || /riser|swell|vinyl|fx/.test((it.s || "") + " " + (it.c || "")) && it.k !== "multi";
        if (!swell) bufs.forEach(function (b) { b._lead = leadOf(b); }); // hits that start late (MP3 / recorded silence) play on the beat
        var zones = bufs.map(function (b, i) {
          var z = it.k === "multi" ? it.z[i] : null;
          return { root: z ? z[0] : (it.r != null ? it.r : 60), v: z && z.length > 1 ? z[1] : 0, buf: b };
        });
        var bytes = 0; bufs.forEach(function (b) { bytes += b.length * b.numberOfChannels * 4; });
        var snd = { it: it, zones: zones };
        mem[id] = { snd: snd, bytes: bytes, last: Date.now() };
        evict();
        listeners.forEach(function (f) { try { f(id); } catch (e) { /* ignore */ } });
        return snd;
      });
    });
    pending[id] = p;
    p.then(function () { delete pending[id]; }, function () { delete pending[id]; });
    return p;
  }
  function get(id) { var m = mem[id]; if (m) { m.last = Date.now(); return m.snd; } return null; }
  /* nearest zone for a note (and the velocity layer for vel 0–1) */
  function zone(snd, midi, vel) {
    var it = snd.it, zs = snd.zones, layer = 0;
    if (it.v && it.v.length > 1) { layer = it.v.length - 1; for (var i = 0; i < it.v.length; i++) if ((vel == null ? 0.8 : vel) <= it.v[i]) { layer = i; break; } }
    var best = null, bd = 1e9;
    zs.forEach(function (z) { if (z.v !== layer && it.v) return; var d = Math.abs(z.root - midi) + (midi > z.root ? 0.1 : 0); if (d < bd) { bd = d; best = z; } });
    return best || zs[0];
  }
  function pin(ids) { pinned = {}; (ids || []).forEach(function (id) { if (id) pinned[id] = 1; }); evict(); }
  function want(ids, c) { return Promise.all((ids || []).filter(Boolean).map(function (id) { return load(id, c).catch(function () { return null; }); })); }
  function cachedIds() {
    return init().then(function () { return cacheOpen(); }).then(function (c) {
      if (!c) return {};
      return c.keys().then(function (reqs) {
        var have = {}; reqs.forEach(function (r) { have[r.url] = 1; });
        var out = {};
        man.items.forEach(function (it) { var fs = files(it); if (fs.length && fs.every(function (f) { return have[url(f)]; })) out[it.id] = 1; });
        return out;
      });
    });
  }
  function storage() {
    return init().then(cachedIds).then(function (ids) {
      var n = 0, b = 0; Object.keys(ids).forEach(function (id) { n++; b += byId[id].b || 0; });
      return { count: n, bytes: b, ids: ids };
    });
  }
  /* remove every cached file not used by `keep` (ids in use by layers) */
  function clearUnused(keep) {
    var k = {}; (keep || []).forEach(function (id) { if (byId[id]) files(byId[id]).forEach(function (f) { k[url(f)] = 1; }); });
    return cacheOpen().then(function (c) {
      if (!c) return 0;
      return c.keys().then(function (reqs) {
        var del = reqs.filter(function (r) { return !k[r.url] && !/manifest\.json/.test(r.url); });
        return Promise.all(del.map(function (r) { return c.delete(r); })).then(function () {
          Object.keys(mem).forEach(function (id) { if ((keep || []).indexOf(id) === -1) delete mem[id]; });
          return del.length;
        });
      });
    });
  }
  window.IPBLibrary = { edge: edge,
    init: init, load: load, get: get, zone: zone, want: want, pin: pin, files: files, url: url, storage: storage, clearUnused: clearUnused, cachedIds: cachedIds,
    item: function (id) { return byId[id] || null; }, manifest: function () { return man; }, onLoad: function (f) { listeners.push(f); },
    memory: function () { return { bytes: memBytes(), ids: Object.keys(mem), pinned: Object.keys(pinned) }; }
  };
})();
