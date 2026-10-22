/* DJ Psycho Fingers — 📁 MY RECORDINGS (v20261022n). One place for ● REC shows ("DJ Psycho Fingers Mix") and Live Freestyles.
 * REC streams to IndexedDB "pfdj_mixes" in ~3 s chunks (Opus blobs or 16-bit PCM for WAV) so memory stays flat for 5 h+ shows
 * and an unfinished show is recovered on the next load. Freestyles keep living in their own DB ("pfdj_freestyle"), read as-is.
 * Nothing leaves the device; files download only when he taps Download. */
(function () {
  "use strict";
  var P = window.PFDJ; if (!P) return;
  var $ = function (id) { return document.getElementById(id); };
  var DBN = "pfdj_mixes", MIX = "DJ Psycho Fingers Mix", FS = "Freestyle";
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
  function extOf(m) { return m.kind === "wav" ? "wav" : /ogg/.test(m.mime) ? "ogg" : /mp4/.test(m.mime) ? "m4a" : "webm"; }
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
      if (f < 150 * 1048576) { P.toast("Storage almost full — stopping the recording. Everything so far is saved in My Recordings."); if (P.stopRec) P.stopRec(); return; }
      if (f < 1024 * 1048576 && !warned) { warned = true; P.toast("Low storage: about " + P.fmtSize(f) + " left on this device. Opus uses ~72 MB per hour."); }
    }).catch(function () { /* ignore */ });
  }

  /* ---------- REC API (used by dj.js) ---------- */
  function begin(kind, mime, sr) {
    var now = Date.now(), id = "mix_" + now.toString(36);
    var m = { id: id, type: "mix", name: MIX + " · " + stamp(now), created: now, kind: kind, mime: mime, sr: sr, done: false, bytes: 0, dur: 0 };
    Q[id] = { i: 0, bytes: 0, p: putMeta(m).catch(function () { P.toast("Couldn't open storage — this recording can't be saved here."); }), meta: m };
    warned = false; checkSpace(); clearInterval(watch); watch = setInterval(checkSpace, 20000);
    return id;
  }
  function chunk(id, blob) {
    var q = Q[id]; if (!q || !blob || !blob.size) return;
    var rec = { mid: id, i: q.i++, data: blob }; q.bytes += blob.size;
    q.p = q.p.then(function () { return tx(["chunks"], "readwrite", function (t) { t.objectStore("chunks").add(rec); }); })
      .catch(function (e) { if (!q.err) { q.err = true; P.toast("Couldn't save part of the recording (" + (e && e.name || "storage") + ") — stopping; what's saved is kept."); if (P.stopRec) P.stopRec(); } });
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
      delete Q[id]; load(); if (m && DIR) blobOf(m).then(function (b) { copyToDir(m, b); });
      return m;
    }).catch(function () { delete Q[id]; return null; });
  }
  function blobOf(m) {
    if (m.type === "fs") return Promise.resolve(m.t.blob);
    return getChunks(m.id).then(function (cs) {
      var parts = cs.map(function (c) { return c.data; });
      if (m.kind === "wav") parts.unshift(wavHeader(cs.reduce(function (s, c) { return s + c.data.size; }, 0), m.sr));
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
    var fsl = window.PFFREESTYLE ? window.PFFREESTYLE.list() : [];
    return getMetas().catch(function () { return []; }).then(function (ms) {
      var a = ms.filter(function (m) { return m.done; }).map(function (m) { return { id: m.id, type: "mix", tag: MIX, name: m.name, created: m.created, dur: m.dur, bytes: m.bytes, ext: extOf(m), m: m }; });
      var b = fsl.map(function (t) { return { id: t.id, type: "fs", tag: FS, name: t.name, created: t.created, dur: t.dur, bytes: t.blob ? t.blob.size : 0, ext: /ogg/.test(t.mime) ? "ogg" : /mp4/.test(t.mime) ? "m4a" : "webm", t: t }; });
      LIST = a.concat(b).sort(function (x, y) { return y.created - x.created; });
      render();
    });
  }
  function fname(it) { return "PsychoFingers_" + it.name.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_") + "." + it.ext; }
  function getBlob(it) { return it.type === "fs" ? Promise.resolve(it.t.blob) : blobOf(it.m); }
  function download(it) {
    getBlob(it).then(function (b) {
      var u = URL.createObjectURL(b), a = document.createElement("a"); a.href = u; a.download = fname(it); document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(u); }, 60000);
    });
  }
  function share(it) {
    getBlob(it).then(function (b) {
      var f = new File([b], fname(it), { type: b.type });
      if (b.size < 200 * 1048576 && navigator.canShare && navigator.canShare({ files: [f] })) navigator.share({ files: [f], title: it.name }).catch(function () { /* cancelled */ });
      else download(it);
    });
  }
  function play(it, btn) {
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
    if (it.type === "fs") { it.t.name = n; window.PFFREESTYLE.put(it.t).then(load); }
    else { it.m.name = n; putMeta(it.m).then(load); }
  }
  function del(it) {
    if (!confirm("Delete “" + it.name + "”? This can't be undone.")) return;
    if (playingId === it.id && aud) { aud.pause(); playingId = null; }
    if (it.type === "fs") { window.PFFREESTYLE.del(it.t).then(load); return; }
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
    var box = $("recs-list"); if (!box) return;
    var rows = LIST.filter(function (it) { return filter === "all" || it.type === filter; });
    box.innerHTML = rows.length ? "" : '<p class="empty">Nothing here yet. Press ● REC (top bar) or 🎤 LIVE FREESTYLE — every recording saves here by itself.</p>';
    document.querySelectorAll(".recs-filter button").forEach(function (b) { b.classList.toggle("on", b.dataset.f === filter); });
    rows.forEach(function (it) {
      var r = document.createElement("div"); r.className = "fs-row recs-row";
      r.innerHTML = '<div class="fs-main"><span class="recs-tag"></span> <strong></strong><span class="mono"></span></div>' +
        '<div class="fs-acts"><button type="button" class="btn">▶ Play</button><button type="button" class="btn">✎ Rename</button><button type="button" class="btn">⇩ Download</button><button type="button" class="btn">↗ Share</button><button type="button" class="btn">→ A</button><button type="button" class="btn">→ B</button><button type="button" class="btn danger">🗑 Delete</button></div>';
      var tag = r.querySelector(".recs-tag"); tag.textContent = it.tag; tag.classList.add(it.type === "fs" ? "fs" : "mix");
      r.querySelector("strong").textContent = it.name;
      r.querySelector(".mono").textContent = " " + P.fmtTime(it.dur || 0) + " · " + it.ext.toUpperCase() + " · " + P.fmtSize(it.bytes || 0);
      var b = r.querySelectorAll(".fs-acts > button");
      b[0].textContent = playingId === it.id ? "■ Stop" : "▶ Play";
      b[0].onclick = function () { play(it); }; b[1].onclick = function () { rename(it); }; b[2].onclick = function () { download(it); }; b[3].onclick = function () { share(it); };
      b[4].onclick = function () { toDeck(it, P.DECKS[0]); }; b[5].onclick = function () { toDeck(it, P.DECKS[1]); }; b[6].onclick = function () { del(it); };
      box.appendChild(r);
    });
  }
  function build() {
    var s = document.createElement("section"); s.className = "freestyle my-recs"; s.id = "my-recs"; s.setAttribute("aria-label", "My Recordings");
    s.innerHTML = '<div class="fs-head"><h2>📁 My Recordings</h2><span class="muted">REC shows and Live Freestyles, saved automatically on this device. Newest first.</span></div>' +
      '<div class="recs-filter"><button type="button" class="btn small" data-f="all">All</button><button type="button" class="btn small" data-f="mix">' + MIX + '</button><button type="button" class="btn small" data-f="fs">' + FS + '</button>' +
      (window.showDirectoryPicker ? '<label class="btn small recs-dir"><input type="checkbox" id="recs-dir"> Also copy to a folder on this device</label>' : "") + '</div>' +
      '<div id="recs-list" class="fs-list"></div>';
    var fs = $("freestyle"), lib = document.querySelector(".lib-tabs");
    if (fs && fs.parentNode) fs.parentNode.insertBefore(s, fs.nextSibling);
    else if (lib) { var sec = lib.closest("section") || lib.parentNode; sec.parentNode.insertBefore(s, sec); }
    else document.querySelector("main, body").appendChild(s);
    s.querySelectorAll(".recs-filter button").forEach(function (b) { b.onclick = function () { filter = b.dataset.f; render(); }; });
    var cb = $("recs-dir");
    if (cb) cb.onchange = function () {
      if (!cb.checked) { DIR = null; return; }
      window.showDirectoryPicker({ mode: "readwrite" }).then(function (d) { DIR = d; P.toast("New recordings will also be copied to “" + d.name + "” (until you close the app)"); }).catch(function () { cb.checked = false; });
    };
    if (fs) { var h = fs.querySelector("h3"), l = $("fs-list"); if (h) h.hidden = true; if (l) l.hidden = true; }   // freestyles now listed in My Recordings
  }
  var style = document.createElement("style");
  style.textContent = ".recs-filter{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0}.recs-filter .on{outline:2px solid #c084fc}.recs-tag{display:inline-block;align-self:flex-start;width:max-content;font-size:11px;font-weight:700;padding:2px 7px;border-radius:9px;margin-right:4px;vertical-align:middle}.recs-tag.mix{background:#7c3aed;color:#fff}.recs-tag.fs{background:#f59e0b;color:#111}.recs-dir input{margin-right:4px}";
  document.head.appendChild(style);
  build();
  recover().catch(function () { /* ignore */ }).then(load);
  window.PFREC = { begin: begin, chunk: chunk, end: end, load: load, list: function () { return LIST; }, blobOf: blobOf, _getChunks: getChunks };
})();
