/* DJ Psycho Fingers — 📁 MY RECORDINGS (v20261022x). One place for ● REC shows ("DJ Psycho Fingers Mix") and older saved takes.
 * REC streams to IndexedDB "pfdj_mixes" in ~3 s chunks (Opus blobs or 16-bit PCM for WAV) so memory stays flat for 5 h+ shows
 * and an unfinished show is recovered on the next load. Older takes from the retired live-rap section stay in their own legacy DB (OLDDB below), read as-is.
 * Nothing leaves the device; files download only when he taps Download. */
(function () {
  "use strict";
  var P = window.PFDJ; if (!P) return;
  var $ = function (id) { return document.getElementById(id); };
  var DBN = "pfdj_mixes", MIX = "DJ Psycho Fingers Mix", VID = "Video show", FS = "Older takes";
  /* v20261022x: the live-rap section was removed; its saved takes still play / download / share / rename / delete here. */
  var OLDDB = "pfdj_" + "free" + "style";   /* legacy IndexedDB name, kept only so old recordings stay readable */
  function odb() { return new Promise(function (res, rej) { var r = indexedDB.open(OLDDB, 1); r.onupgradeneeded = function () { var d = r.result; d.createObjectStore("takes", { keyPath: "id" }); d.createObjectStore("chunks", { autoIncrement: true }).createIndex("sid", "sid"); }; r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; }); }
  function otx(mode, fn) { return odb().then(function (d) { return new Promise(function (res, rej) { var t = d.transaction(["takes"], mode), out = fn(t.objectStore("takes")); t.oncomplete = function () { d.close(); res(out && out.result !== undefined ? out.result : undefined); }; t.onerror = function () { d.close(); rej(t.error); }; }); }); }
  var OLD = { list: function () { return otx("readonly", function (s) { return s.getAll(); }).then(function (r) { return r || []; }).catch(function () { return []; }); },
    put: function (t) { return otx("readwrite", function (s) { s.put(t); }); }, del: function (t) { return otx("readwrite", function (s) { s.delete(t.id); }); } };
  var LIST = [], Q = {}, urls = {}, filter = "all", DIR = null, conn = null, watch = null, warned = false, aud = null, playingId = null;
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () { /* ignore */ });
  function db() {
    if (conn) return conn;
    conn = new Promise(function (res, rej) {
      var r = indexedDB.open(DBN, 1);
      r.onupgradeneeded = function () { var d = r.result; d.createObjectStore("mixes", { keyPath: "id" }); d.createObjectStore("chunks", { autoIncrement: true }).createIndex("mid", "mid"); };
      r.onsuccess = function () { var d = r.result; d.onversionchange = function () { d.close(); conn = null; }; res(d); };
      r.onerror = function () { conn = null; rej(r.error); };
    });
    return conn;
  }
  function tx(stores, mode, fn) { return db().then(function (d) { return new Promise(function (res, rej) { var t = d.transaction(stores, mode), out = fn(t); t.oncomplete = function () { res(out && out.result !== undefined ? out.result : undefined); }; t.onerror = function () { rej(t.error); }; t.onabort = function () { rej(t.error); }; }); }); }
  function getMetas() { return tx(["mixes"], "readonly", function (t) { return t.objectStore("mixes").getAll(); }).then(function (r) { return r || []; }); }
  function getChunks(id) { return tx(["chunks"], "readonly", function (t) { return t.objectStore("chunks").index("mid").getAll(IDBKeyRange.only(id)); }).then(function (cs) { return (cs || []).sort(function (a, b) { return a.i - b.i; }); }); }
  function putMeta(m) { return tx(["mixes"], "readwrite", function (t) { t.objectStore("mixes").put(m); }); }
  function stamp(t) { return new Date(t).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); }
  function extOf(m) { if (m.video) return /mp4/.test(m.mime || "") ? "mp4" : "webm"; return m.kind === "mp3" || /mpeg/.test(m.mime || "") ? "mp3" : m.kind === "wav" || /wav/.test(m.mime || "") ? "wav" : /ogg/.test(m.mime) ? "ogg" : /mp4/.test(m.mime) ? "m4a" : "webm"; }
  function wavHeader(bytes, sr) {
    var b = new ArrayBuffer(44), v = new DataView(b), o = 0;
    function s(x) { for (var i = 0; i < x.length; i++) v.setUint8(o++, x.charCodeAt(i)); }
    s("RIFF"); v.setUint32(o, Math.min(0xffffffff, 36 + bytes), true); o += 4; s("WAVE"); s("fmt "); v.setUint32(o, 16, true); o += 4;
    v.setUint16(o, 1, true); o += 2; v.setUint16(o, 2, true); o += 2; v.setUint32(o, sr, true); o += 4; v.setUint32(o, sr * 4, true); o += 4;
    v.setUint16(o, 4, true); o += 2; v.setUint16(o, 16, true); o += 2; s("data"); v.setUint32(o, Math.min(0xffffffff, bytes), true);
    return b;
  }

  /* ---------- storage guard ---------- */
  function free() { return navigator.storage && navigator.storage.estimate ? navigator.storage.estimate().then(function (e) { return (e.quota || 0) - (e.usage || 0); }) : Promise.resolve(Infinity); }
  function checkSpace() {
    return free().then(function (f) {
      if (f < 150 * 1048576) { P.toast("Storage almost full — stopping the recording. Everything so far is saved in My Recordings."); if (P.stopRec) P.stopRec(); if (P.stopVideoRec) P.stopVideoRec(); return; }
      if (f < 1024 * 1048576 && !warned) { warned = true; P.toast("Low storage: about " + P.fmtSize(f) + " left on this device. Opus uses ~72 MB per hour."); }
    }).catch(function () { /* ignore */ });
  }

  /* ---------- REC API (used by dj.js) ---------- */
  function begin(kind, mime, sr, label, video) {
    var now = Date.now(), id = "mix_" + now.toString(36);
    var m = { id: id, type: "mix", name: (label || MIX) + " · " + stamp(now), created: now, kind: kind, mime: mime, sr: sr, done: false, bytes: 0, dur: 0 };
    if (video) m.video = true;   /* v20261023b: ● REC VIDEO shows save here too */
    Q[id] = { i: 0, bytes: 0, p: putMeta(m).catch(function () { P.toast("Couldn't open storage — this recording can't be saved here."); }), meta: m };
    warned = false; checkSpace(); clearInterval(watch); watch = setInterval(checkSpace, 20000);
    return id;
  }
  function chunk(id, blob) {
    var q = Q[id]; if (!q || !blob || !blob.size) return;
    var rec = { mid: id, i: q.i++, data: blob }; q.bytes += blob.size;
    q.p = q.p.then(function () { return tx(["chunks"], "readwrite", function (t) { t.objectStore("chunks").add(rec); }); })
      .catch(function (e) { if (!q.err) { q.err = true; P.toast("Couldn't save part of the recording (" + (e && e.name || "storage") + ") — stopping; what's saved is kept."); if (P.stopRec) P.stopRec(); if (P.stopVideoRec) P.stopVideoRec(); } });
  }
  function finalize(id, info, recovered) {
    return getChunks(id).then(function (cs) {
      return tx(["mixes"], "readonly", function (t) { return t.objectStore("mixes").get(id); }).then(function (m) {
        if (!m) return null;
        if (!cs.length) return tx(["mixes"], "readwrite", function (t) { t.objectStore("mixes").delete(id); }).then(function () { return null; });
        var bytes = cs.reduce(function (s, c) { return s + c.data.size; }, 0);
        m.bytes = bytes; m.done = true; m.n = cs.length;
        m.dur = info && info.dur ? info.dur : m.kind === "wav" ? bytes / (m.sr * 4) : cs.length * 3;
        if (info && info.peak != null) m.peak = info.peak;
        if (recovered) m.name += " (recovered)";
        return putMeta(m).then(function () { return m; });
      });
    });
  }
  function end(id, dur, peak) {
    var q = Q[id]; clearInterval(watch); watch = null;
    if (!q) return Promise.resolve(null);
    return q.p.then(function () { return finalize(id, { dur: dur, peak: peak }); }).then(function (m) {
      delete Q[id]; load();
      if (m && m.kind === "mp3" && window.PFMP3) blobOf(m).then(function (b) { window.PFMP3.autoSave(b, window.PFMP3.name(/Voice only/.test(m.name) ? "voice" : /Go Live/.test(m.name) ? "live" : "mix", m.created)); });   /* v20261022w: auto-save .mp3 */
      if (m && window.PFEXPORT && window.PFEXPORT.cfg().folder && m.kind !== "mp3") blobOf(m).then(function (b) { window.PFEXPORT.autoCopy(b, fname({ name: m.name, ext: extOf(m), created: m.created })); });
      return m;
    }).catch(function () { delete Q[id]; return null; });
  }
  function blobOf(m) {
    if (m.type === "fs") return Promise.resolve(m.t.blob);
    return getChunks(m.id).then(function (cs) {
      var parts = cs.map(function (c) { return c.data; });
      if (m.kind === "wav") parts.unshift(wavHeader(cs.reduce(function (s, c) { return s + c.data.size; }, 0), m.sr));
      if (m.video) return new Blob(parts, { type: (m.mime || "video/webm").split(";")[0] });
      return new Blob(parts, { type: m.kind === "wav" ? "audio/wav" : (m.mime || "audio/webm").split(";")[0] });
    });
  }
  function recover() {
    return getMetas().then(function (ms) {
      return Promise.all(ms.filter(function (m) { return !m.done && !Q[m.id]; }).map(function (m) { return finalize(m.id, null, true); }));
    }).then(function (r) { var n = r.filter(Boolean).length; if (n) P.toast("Recovered " + n + " unfinished mix" + (n > 1 ? "es" : "") + " into My Recordings"); });
  }

  /* ---------- list ---------- */
  function load() {
    var fsl = [];
    return OLD.list().then(function (o) { fsl = o; return getMetas(); }).catch(function () { return []; }).then(function (ms) {
      var a = ms.filter(function (m) { return m.done; }).map(function (m) { return { id: m.id, type: "mix", src: m.src || "DJ Decks", tag: m.src || (m.video ? VID : MIX), video: !!m.video, name: m.name, created: m.created, dur: m.dur, bytes: m.bytes, ext: extOf(m), m: m }; });
      var b = fsl.map(function (t) { return { id: t.id, type: "fs", src: "DJ Decks", tag: FS, name: t.name, created: t.created, dur: t.dur, bytes: t.blob ? t.blob.size : 0, ext: /mpeg/.test(t.mime) ? "mp3" : /ogg/.test(t.mime) ? "ogg" : /mp4/.test(t.mime) ? "m4a" : "webm", t: t }; });
      LIST = a.concat(b).sort(function (x, y) { return y.created - x.created; });
      srcButtons(); render();
    });
  }
  function fname(it) { if (it.ext === "mp3" && window.PFMP3) return window.PFMP3.name(it.type === "fs" ? "take" : /Voice only/.test(it.name) ? "voice" : /Go Live/.test(it.name) ? "live" : "mix", it.created); if (it.video) return "PsychoFingers_Video_" + (function (d) { var z = function (n) { return ("0" + n).slice(-2); }; return d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate()) + "_" + z(d.getHours()) + "-" + z(d.getMinutes()); })(new Date(it.created)) + "." + it.ext; return "PsychoFingers_" + it.name.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_") + "." + it.ext; }
  function getBlob(it) { return it.type === "fs" ? Promise.resolve(it.t.blob) : blobOf(it.m); }
  /* v20261022y: Download used to read the file from IndexedDB AFTER the tap; on Android Chrome the click() then ran outside
     the user gesture and was silently dropped. Now the file is prepared before the tap (same cache as Share) and saved synchronously. */
  function saveFile(f, name) {
    var u = URL.createObjectURL(f), a = document.createElement("a"); a.href = u; a.download = name; a.rel = "noopener"; a.style.display = "none";
    document.body.appendChild(a); a.click(); setTimeout(function () { a.remove(); }, 1000);
    setTimeout(function () { URL.revokeObjectURL(u); }, 60000);
  }
  function download(it) {
    var f = FILES[it.id];
    if (f) { if (window.PFEXPORT) window.PFEXPORT.export(f, fname(it)); else { saveFile(f, fname(it)); P.toast("Downloading " + fname(it)); } return; }
    P.toast("Getting the file ready — tap Export again"); prep(it).catch(function () { P.toast("Couldn't read this recording"); });
  }
  /* v20261022w: Share needs the file READY before the tap — awaiting IndexedDB inside the tap lost Android Chrome's user
     gesture, so navigator.share silently did nothing. Files are prepared when the list renders; the tap shares synchronously. */
  var FILES = {};
  function prep(it) {
    if (FILES[it.id]) return Promise.resolve(FILES[it.id]);
    return getBlob(it).then(function (b) { var f = new File([b], fname(it), { type: it.ext === "mp3" ? "audio/mpeg" : b.type }); FILES[it.id] = f; return f; });
  }
  function share(it) {
    var f = FILES[it.id];
    if (!f) { P.toast("Getting the file ready — tap Share again"); prep(it); return; }
    if (window.PFSHARE) window.PFSHARE.shareFile(f, it.name); else download(it);
  }
  function playVideo(it) {
    var o = document.createElement("div"); o.className = "recs-vov";
    o.innerHTML = '<div class="recs-vbox"><video controls playsinline autoplay></video><button type="button" class="btn">✕ Close</button></div>';
    var v = o.querySelector("video"), u = null;
    o.querySelector("button").onclick = function () { v.pause(); o.remove(); if (u) URL.revokeObjectURL(u); };
    document.body.appendChild(o);
    getBlob(it).then(function (b) { u = URL.createObjectURL(b); v.src = u; v.play().catch(function () { /* ignore */ }); });
  }
  /* v20261023b: swap a finished recording's data for a converted file (webm → mp4) */
  function replace(id, blob, mime) {
    return tx(["mixes", "chunks"], "readwrite", function (t) {
      var c = t.objectStore("chunks").index("mid").openKeyCursor(IDBKeyRange.only(id));
      c.onsuccess = function () { var k = c.result; if (k) { t.objectStore("chunks").delete(k.primaryKey); k.continue(); } else t.objectStore("chunks").add({ mid: id, i: 0, data: blob }); };
      var g = t.objectStore("mixes").get(id); g.onsuccess = function () { var m = g.result; if (m) { m.mime = mime; m.bytes = blob.size; m.n = 1; delete m.note; t.objectStore("mixes").put(m); } };
    }).then(function () { delete FILES[id]; return load(); });
  }
  function note(id, txt) { return tx(["mixes"], "readwrite", function (t) { var g = t.objectStore("mixes").get(id); g.onsuccess = function () { var m = g.result; if (m) { m.note = txt; t.objectStore("mixes").put(m); } }; }).then(load); }
  function play(it, btn) {
    if (it.video) { playVideo(it); return; }
    if (!aud) { aud = new Audio(); aud.onended = function () { playingId = null; render(); }; }
    if (playingId === it.id) { aud.pause(); playingId = null; render(); return; }
    getBlob(it).then(function (b) { if (urls.cur) URL.revokeObjectURL(urls.cur); urls.cur = URL.createObjectURL(b); aud.src = urls.cur; aud.play().catch(function () { /* ignore */ }); playingId = it.id; render(); });
  }
  function toDeck(it, d) {
    if (it.bytes > 300 * 1048576 && !confirm("This recording is " + P.fmtSize(it.bytes) + " — loading it onto a deck may be slow or run out of memory on a tablet. Try anyway?")) return;
    P.loadInto(d, { name: it.name, sub: "My Recordings · " + it.tag, key: "rec:" + it.id, get: function () { return getBlob(it).then(function (b) { return b.arrayBuffer(); }); } });
  }
  function rename(it) {
    var n = prompt("Name this recording", it.name); if (!n || !n.trim()) return; n = n.trim().slice(0, 80);
    if (it.type === "fs") { it.t.name = n; OLD.put(it.t).then(load); }
    else { it.m.name = n; putMeta(it.m).then(load); }
  }
  function del(it) {
    if (!confirm("Delete “" + it.name + "”? This can't be undone.")) return;
    if (playingId === it.id && aud) { aud.pause(); playingId = null; }
    if (it.type === "fs") { OLD.del(it.t).then(load); return; }
    tx(["mixes", "chunks"], "readwrite", function (t) {
      t.objectStore("mixes").delete(it.id);
      var c = t.objectStore("chunks").index("mid").openKeyCursor(IDBKeyRange.only(it.id));
      c.onsuccess = function () { var k = c.result; if (k) { t.objectStore("chunks").delete(k.primaryKey); k.continue(); } };
    }).then(load);
  }
  function copyToDir(m, blob) {
    if (!DIR) return;
    var it = { name: m.name, ext: extOf(m) };
    DIR.getFileHandle(fname(it), { create: true }).then(function (h) { return h.createWritable(); }).then(function (w) { return w.write(blob).then(function () { return w.close(); }); })
      .then(function () { P.toast("Also copied to your folder: " + fname(it)); }).catch(function () { P.toast("Couldn't copy to the folder — it's still in My Recordings"); });
  }
  function render() {
    LIST.slice(0, 12).forEach(function (it) { prep(it).catch(function () { /* ignore */ }); });
    var box = $("recs-list"); if (!box) return;
    var rows = LIST.filter(function (it) { return filter === "all" || (it.type === filter && !(it.m && it.m.src)) || (filter.indexOf("src:") === 0 && it.src === filter.slice(4)); });
    box.innerHTML = rows.length ? "" : '<p class="empty">Nothing here yet. Press ● REC (top bar) — every recording saves here by itself.</p>';
    document.querySelectorAll(".recs-filter button").forEach(function (b) { b.classList.toggle("on", b.dataset.f === filter); });
    rows.forEach(function (it) {
      var r = document.createElement("div"); r.className = "recs-item recs-row";
      r.innerHTML = '<div class="recs-main"><span class="recs-tag"></span> <strong></strong><span class="mono"></span></div>' +
        '<div class="recs-acts"><button type="button" class="btn">▶ Play</button><button type="button" class="btn">✎ Rename</button><button type="button" class="btn">⇩ Export</button><button type="button" class="btn">↗ Share</button><button type="button" class="btn">→ A</button><button type="button" class="btn">→ B</button><button type="button" class="btn danger">🗑 Delete</button></div>';
      var tag = r.querySelector(".recs-tag"); tag.textContent = it.tag; tag.classList.add(it.type === "fs" ? "fs" : it.m && it.m.src ? "app" : it.video ? "vid" : "mix"); var b4;
      r.querySelector("strong").textContent = it.name;
      r.querySelector(".mono").textContent = " " + P.fmtTime(it.dur || 0) + " · " + it.ext.toUpperCase() + " · " + P.fmtSize(it.bytes || 0) + (it.m && it.m.note ? " · " + it.m.note : "");
      if (it.video) { b4 = r.querySelectorAll(".recs-acts > button"); b4[4].hidden = b4[5].hidden = true; }
      var b = r.querySelectorAll(".recs-acts > button");
      b[0].textContent = playingId === it.id ? "■ Stop" : "▶ Play";
      b[0].onclick = function () { play(it); }; b[1].onclick = function () { rename(it); }; b[2].onclick = function () { download(it); }; b[3].onclick = function () { share(it); };
      b[4].onclick = function () { toDeck(it, P.DECKS[0]); }; b[5].onclick = function () { toDeck(it, P.DECKS[1]); }; b[6].onclick = function () { del(it); };
      box.appendChild(r);
    });
  }
  /* v20261023lib: one place for the whole suite — filter by the app that made it (shared/library.js sets m.src) */
  function srcButtons() {
    var bar = document.querySelector(".recs-filter"); if (!bar) return;
    var have = {}; LIST.forEach(function (it) { if (it.m && it.m.src) have[it.m.src] = 1; });
    Object.keys(have).forEach(function (s) {
      if (bar.querySelector('[data-f="src:' + CSS.escape(s) + '"]')) return;
      var b = document.createElement("button"); b.type = "button"; b.className = "btn small"; b.dataset.f = "src:" + s; b.textContent = s;
      b.onclick = function () { filter = b.dataset.f; render(); };
      var dirL = bar.querySelector(".recs-dir"); bar.insertBefore(b, dirL || null);
    });
  }
  window.addEventListener("storage", function (e) { if (e.key === "pflib_ping") load(); });
  document.addEventListener("visibilitychange", function () { if (!document.hidden) load(); });
  function build() {
    var s = document.createElement("section"); s.className = "recs-panel my-recs"; s.id = "my-recs"; s.setAttribute("aria-label", "My Recordings");
    s.innerHTML = '<div class="recs-head"><h2>📁 My Recordings</h2><span class="muted">REC shows, REC VIDEO shows (MP4), Voice only and Go Live recordings, plus songs, takes and exports from every app in the suite (Beats, Multitrack, Voice Over, Isle Voice…), saved automatically on this device. Newest first.</span></div>' +
      '<div class="recs-filter"><button type="button" class="btn small" data-f="all">All</button><button type="button" class="btn small" data-f="mix">' + MIX + '</button><button type="button" class="btn small" data-f="fs">' + FS + '</button>' +
      '</div>' +
      '<div id="recs-list" class="recs-items"></div>';
    var fs = null, lib = document.querySelector(".lib-tabs");
    if (fs && fs.parentNode) fs.parentNode.insertBefore(s, fs.nextSibling);
    else if (lib) { var sec = lib.closest("section") || lib.parentNode; sec.parentNode.insertBefore(s, sec); }
    else document.querySelector("main, body").appendChild(s);
    s.querySelectorAll(".recs-filter button").forEach(function (b) { b.onclick = function () { filter = b.dataset.f; render(); }; });
    var cb = $("recs-dir");
    if (cb) cb.onchange = function () {
      if (!cb.checked) { DIR = null; return; }
      window.showDirectoryPicker({ mode: "readwrite" }).then(function (d) { DIR = d; P.toast("New recordings will also be copied to “" + d.name + "” (until you close the app)"); }).catch(function () { cb.checked = false; });
    };
  }
  var style = document.createElement("style");
  style.textContent = ".recs-filter{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0}.recs-filter .on{outline:2px solid #c084fc}.recs-tag{display:inline-block;align-self:flex-start;width:max-content;font-size:11px;font-weight:700;padding:2px 7px;border-radius:9px;margin-right:4px;vertical-align:middle}.recs-tag.mix{background:#7c3aed;color:#fff}.recs-tag.fs{background:#f59e0b;color:#111}.recs-tag.vid{background:#0891b2;color:#fff}.recs-tag.app{background:#059669;color:#fff}.recs-vov{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center}.recs-vbox{display:flex;flex-direction:column;gap:8px;width:min(96vw,960px)}.recs-vbox video{width:100%;max-height:80vh;background:#000}.recs-dir input{margin-right:4px}";
  document.head.appendChild(style);
  build();
  recover().catch(function () { /* ignore */ }).then(load);
  window.PFREC = { prep: prep, files: FILES, begin: begin, chunk: chunk, end: end, load: load, list: function () { return LIST; }, blobOf: blobOf, replace: replace, note: note, _getChunks: getChunks };
})();
