/* Island Pin Beats Studio: project model, undo/redo, audio source pool, WAV, IndexedDB, project files */
(function () {
  "use strict";
  var SR = 44100;
  var COLORS = ["#22d3ee", "#f5b301", "#f43f5e", "#34d399", "#a78bfa", "#fb923c", "#60a5fa", "#e879f9"];
  var uid = (function () { var n = 0; return function (p) { return (p || "x") + Date.now().toString(36) + (n++).toString(36); }; })();
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function db(x) { return Math.pow(10, x / 20); }
  function toDb(g) { return g > 0 ? 20 * Math.log10(g) : -Infinity; }

  function defaultFx() {
    return {
      eq: { on: false, low: 0, mid: 0, midF: 1200, high: 0 },
      comp: { on: false, thr: -18, ratio: 3, atk: 0.01, rel: 0.15, makeup: 3 },
      gate: { on: false, thr: -50, rel: 0.12 },
      delay: { on: false, div: "1/8d", fb: 0.3, mix: 0.2 },
      reverb: { on: false, size: 1.8, mix: 0.18 }
    };
  }
  function newTrack(i, name) {
    return { id: uid("t"), name: name || ("Track " + (i + 1)), color: COLORS[i % COLORS.length], vol: 0, pan: 0, mute: false, solo: false, arm: false, fx: defaultFx() };
  }
  function newProject() {
    var p = { v: 1, id: uid("p"), name: "My Song", bpm: 96, snap: true, metro: false, loop: { on: false, start: 0, end: 8 },
      tracks: [], clips: [], master: { vol: 0, limiter: true, ceiling: -1 }, latencyMs: null };
    for (var i = 0; i < 4; i++) p.tracks.push(newTrack(i, ["Beat", "Vocals", "Vocals 2", "Ad-libs"][i]));
    return p;
  }

  /* ---- audio source pool: immutable AudioBuffers referenced by clips (edits always create a new source) ---- */
  var sources = {};
  function addSource(buf, name, id) {
    id = id || uid("s");
    sources[id] = { id: id, name: name || "Audio", buf: buf };
    return id;
  }
  function makeBuffer(chs, len, sr) {
    return new AudioBuffer({ length: Math.max(1, len), numberOfChannels: chs, sampleRate: sr || SR });
  }
  function bufFrom(arrays, sr) {
    var b = makeBuffer(arrays.length, arrays[0].length, sr);
    arrays.forEach(function (a, c) { b.getChannelData(c).set(a); });
    return b;
  }
  function chans(buf) { var o = []; for (var c = 0; c < buf.numberOfChannels; c++) o.push(buf.getChannelData(c)); return o; }

  /* ---- undo / redo: snapshots of the model (sources are immutable so they are shared) ---- */
  var H = { undo: [], redo: [], max: 120 };
  function snap(P) { return JSON.stringify({ tracks: P.tracks, clips: P.clips, bpm: P.bpm, loop: P.loop, master: P.master, name: P.name }); }
  function pushUndo(P, label) {
    H.undo.push({ s: snap(P), label: label || "" });
    if (H.undo.length > H.max) H.undo.shift();
    H.redo.length = 0;
  }
  function restore(P, s) { var o = JSON.parse(s); P.tracks = o.tracks; P.clips = o.clips; P.bpm = o.bpm; P.loop = o.loop; P.master = o.master; P.name = o.name; }
  function undo(P) { var e = H.undo.pop(); if (!e) return null; H.redo.push({ s: snap(P), label: e.label }); restore(P, e.s); return e.label; }
  function redo(P) { var e = H.redo.pop(); if (!e) return null; H.undo.push({ s: snap(P), label: e.label }); restore(P, e.s); return e.label; }
  function clearHistory() { H.undo.length = 0; H.redo.length = 0; }

  /* ---- WAV (16-bit PCM) ---- */
  function encodeWav(chArr, sr, bits) {
    bits = bits || 16;
    var n = chArr[0].length, ch = chArr.length, bps = bits / 8, size = 44 + n * ch * bps;
    var ab = new ArrayBuffer(size), dv = new DataView(ab);
    function ws(o, s) { for (var i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); }
    ws(0, "RIFF"); dv.setUint32(4, size - 8, true); ws(8, "WAVE"); ws(12, "fmt "); dv.setUint32(16, 16, true);
    dv.setUint16(20, 1, true); dv.setUint16(22, ch, true); dv.setUint32(24, sr, true); dv.setUint32(28, sr * ch * bps, true);
    dv.setUint16(32, ch * bps, true); dv.setUint16(34, bits, true); ws(36, "data"); dv.setUint32(40, n * ch * bps, true);
    var o = 44;
    for (var i = 0; i < n; i++) for (var c = 0; c < ch; c++) {
      var v = clamp(chArr[c][i], -1, 1);
      if (bits === 16) { dv.setInt16(o, v < 0 ? v * 32768 : v * 32767, true); o += 2; }
      else { var x = Math.round(v < 0 ? v * 8388608 : v * 8388607); dv.setUint8(o, x & 255); dv.setUint8(o + 1, (x >> 8) & 255); dv.setUint8(o + 2, (x >> 16) & 255); o += 3; }
    }
    return new Blob([ab], { type: "audio/wav" });
  }
  function encodeMp3(chArr, sr, kbps) {
    if (!window.lamejs) throw new Error("MP3 encoder not loaded");
    var ch = Math.min(2, chArr.length), enc = new lamejs.Mp3Encoder(ch, sr, kbps || 192), out = [], blk = 1152;
    function i16(a, s, e) { var r = new Int16Array(e - s); for (var i = s; i < e; i++) { var v = clamp(a[i], -1, 1); r[i - s] = v < 0 ? v * 32768 : v * 32767; } return r; }
    for (var i = 0; i < chArr[0].length; i += blk) {
      var e = Math.min(chArr[0].length, i + blk), l = i16(chArr[0], i, e);
      var m = ch === 2 ? enc.encodeBuffer(l, i16(chArr[1], i, e)) : enc.encodeBuffer(l);
      if (m.length) out.push(new Uint8Array(m));
    }
    var f = enc.flush(); if (f.length) out.push(new Uint8Array(f));
    return new Blob(out, { type: "audio/mpeg" });
  }
  function loadScript(src) {
    return new Promise(function (res, rej) { var s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = function () { rej(new Error("Could not load " + src)); }; document.head.appendChild(s); });
  }

  /* ---- IndexedDB: "ipbstudio" (projects + sources) and read-only access to the Beats Vault ---- */
  function openDb(name, ver, up) {
    return new Promise(function (res, rej) {
      var r = indexedDB.open(name, ver);
      r.onupgradeneeded = function () { up && up(r.result); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
  }
  function sdb() {
    return openDb("ipbstudio", 1, function (d) {
      if (!d.objectStoreNames.contains("projects")) d.createObjectStore("projects", { keyPath: "id" });
      if (!d.objectStoreNames.contains("sources")) d.createObjectStore("sources", { keyPath: "id" });
    });
  }
  function tx(d, store, mode, fn) {
    return new Promise(function (res, rej) {
      var t = d.transaction(store, mode), st = t.objectStore(store), out = fn(st);
      t.oncomplete = function () { res(out && out.result !== undefined ? out.result : out); };
      t.onerror = function () { rej(t.error); };
      t.onabort = function () { rej(t.error || new Error("aborted")); };
    });
  }
  function usedSources(P) { var u = {}; P.clips.forEach(function (c) { u[c.src] = 1; }); return Object.keys(u); }
  function packSource(id) {
    var s = sources[id]; if (!s) return null;
    return { id: id, name: s.name, sr: s.buf.sampleRate, ch: chans(s.buf).map(function (a) { return a.slice(0); }) };
  }
  function saveProject(P) {
    return sdb().then(function (d) {
      var ids = usedSources(P);
      return tx(d, "sources", "readonly", function (st) { return st.getAllKeys(); }).then(function (have) {
        var need = ids.filter(function (id) { return have.indexOf(id) === -1; });
        return tx(d, "sources", "readwrite", function (st) { need.forEach(function (id) { var p = packSource(id); if (p) st.put(p); }); return null; });
      }).then(function () {
        return tx(d, "projects", "readwrite", function (st) { st.put({ id: P.id, name: P.name, updated: Date.now(), json: JSON.stringify(P), srcs: ids }); return null; });
      }).then(function () { return gcSources(d); });
    });
  }
  function gcSources(d) {
    return tx(d, "projects", "readonly", function (st) { return st.getAll(); }).then(function (all) {
      var keep = {}; all.forEach(function (p) { (p.srcs || []).forEach(function (id) { keep[id] = 1; }); });
      return tx(d, "sources", "readonly", function (st) { return st.getAllKeys(); }).then(function (keys) {
        var del = keys.filter(function (k) { return !keep[k]; });
        if (!del.length) return null;
        return tx(d, "sources", "readwrite", function (st) { del.forEach(function (k) { st.delete(k); }); return null; });
      });
    });
  }
  function listProjects() {
    return sdb().then(function (d) { return tx(d, "projects", "readonly", function (st) { return st.getAll(); }); })
      .then(function (a) { return (a || []).map(function (p) { return { id: p.id, name: p.name, updated: p.updated }; }).sort(function (x, y) { return y.updated - x.updated; }); });
  }
  function loadProject(id) {
    return sdb().then(function (d) {
      return tx(d, "projects", "readonly", function (st) { return st.get(id); }).then(function (row) {
        if (!row) throw new Error("Project not found");
        var P = JSON.parse(row.json);
        return Promise.all((row.srcs || []).map(function (sid) {
          if (sources[sid]) return null;
          return tx(d, "sources", "readonly", function (st) { return st.get(sid); }).then(function (s) { if (s) addSource(bufFrom(s.ch, s.sr), s.name, s.id); });
        })).then(function () { return P; });
      });
    });
  }
  function deleteProject(id) {
    return sdb().then(function (d) { return tx(d, "projects", "readwrite", function (st) { st.delete(id); return null; }).then(function () { return gcSources(d); }); });
  }
  /* opens the Beats database without ever creating it (an upgrade here means Beats was never used: abort) */
  function beatsDb() {
    return new Promise(function (res, rej) {
      var r = indexedDB.open("islandpinbeats", 1);
      r.onupgradeneeded = function () { r.transaction.abort(); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
  }
  function vaultList() {
    return beatsDb().then(function (d) {
      if (!d.objectStoreNames.contains("vault")) return [];
      return tx(d, "vault", "readonly", function (st) { return st.getAll(); });
    }).then(function (a) { return (a || []).sort(function (x, y) { return y.created - x.created; }); }).catch(function () { return []; });
  }

  /* ---- project file (.ipbstudio): "IPBSTUDIO1\n" + uint32 header length + JSON header + 16-bit PCM blocks ---- */
  var MAGIC = "IPBSTUDIO1\n";
  function exportProjectFile(P) {
    var ids = usedSources(P), meta = [], blobs = [], off = 0;
    ids.forEach(function (id) {
      var s = sources[id]; if (!s) return;
      var ch = chans(s.buf), n = ch[0].length, pcm = new Int16Array(n * ch.length);
      for (var c = 0; c < ch.length; c++) for (var i = 0; i < n; i++) { var v = clamp(ch[c][i], -1, 1); pcm[c * n + i] = v < 0 ? v * 32768 : v * 32767; }
      meta.push({ id: id, name: s.name, sr: s.buf.sampleRate, ch: ch.length, len: n, off: off, bytes: pcm.byteLength });
      blobs.push(pcm); off += pcm.byteLength;
    });
    var head = new TextEncoder().encode(JSON.stringify({ project: P, sources: meta, app: "Island Pin Beats Studio", saved: new Date().toISOString() }));
    var mg = new TextEncoder().encode(MAGIC), len = new Uint8Array(4); new DataView(len.buffer).setUint32(0, head.length, true);
    return new Blob([mg, len, head].concat(blobs), { type: "application/octet-stream" });
  }
  function importProjectFile(ab) {
    var u8 = new Uint8Array(ab), mg = new TextDecoder().decode(u8.subarray(0, MAGIC.length));
    if (mg !== MAGIC) throw new Error("Not an Island Pin Beats Studio project file");
    var hl = new DataView(ab, MAGIC.length, 4).getUint32(0, true), base = MAGIC.length + 4 + hl;
    var H2 = JSON.parse(new TextDecoder().decode(u8.subarray(MAGIC.length + 4, base)));
    H2.sources.forEach(function (m) {
      var pcm = new Int16Array(ab.slice(base + m.off, base + m.off + m.bytes)), arr = [];
      for (var c = 0; c < m.ch; c++) { var a = new Float32Array(m.len); for (var i = 0; i < m.len; i++) a[i] = pcm[c * m.len + i] / 32768; arr.push(a); }
      addSource(bufFrom(arr, m.sr), m.name, m.id);
    });
    return H2.project;
  }
  function download(blob, name) {
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }

  window.IPBS = window.IPBS || {};
  Object.assign(window.IPBS, {
    SR: SR, COLORS: COLORS, uid: uid, clamp: clamp, db: db, toDb: toDb, defaultFx: defaultFx, newTrack: newTrack, newProject: newProject,
    sources: sources, addSource: addSource, makeBuffer: makeBuffer, bufFrom: bufFrom, chans: chans,
    H: H, pushUndo: pushUndo, undo: undo, redo: redo, clearHistory: clearHistory,
    encodeWav: encodeWav, encodeMp3: encodeMp3, loadScript: loadScript,
    saveProject: saveProject, listProjects: listProjects, loadProject: loadProject, deleteProject: deleteProject, vaultList: vaultList, beatsDb: beatsDb,
    exportProjectFile: exportProjectFile, importProjectFile: importProjectFile, download: download
  });
})();
