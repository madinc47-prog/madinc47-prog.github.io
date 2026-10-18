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
      bleed: { on: false }, nr: { on: false }, // manual take cleanup: processed per clip after you turn it on; raw kept (clip.orig)
      gate: { on: false, thr: -50, rel: 0.12 },
      lowcut: { on: false, f: 90 },
      eq: { on: false, low: 0, mid: 0, midF: 1200, high: 0 },
      comp: { on: false, thr: -22, ratio: 4, atk: 0.008, rel: 0.15, makeup: 5 },
      deess: { on: false, amt: 0.5 },
      sat: { on: false, amt: 0.3 },
      chorus: { on: false, mix: 0.35 },
      delay: { on: false, div: "1/8d", pp: false, fb: 0.3, mix: 0.2 },
      reverb: { on: false, type: "plate", decay: 1.8, pre: 0.02, mix: 0.25 }
    };
  }
  /* saved projects → current fx shape. Every new effect starts OFF; older reverbs ("size") become a Plate of that decay */
  function normFx(fx) {
    var d = defaultFx(), o = {};
    fx = fx && typeof fx === "object" ? fx : {};
    Object.keys(d).forEach(function (k) { o[k] = Object.assign({}, d[k], fx[k] && typeof fx[k] === "object" ? fx[k] : {}); o[k].on = !!o[k].on; });
    if (fx.reverb && fx.reverb.decay == null && fx.reverb.size != null) o.reverb.decay = +fx.reverb.size || 1.8;
    delete o.reverb.size;
    if (!o.reverb.on && +o.reverb.mix === 0.18) o.reverb.mix = 0.25; // untouched reverb: the clearer new default
    if (o.comp.amt != null) delete o.comp.amt; // Studio uses the detailed compressor
    return o;
  }
  function newTrack(i, name) {
    var nm = name || ("Track " + (i + 1));
    // auto level match: ON for new vocal tracks (not the beat track); offset = vocal vs beat in dB
    return { id: uid("t"), name: nm, color: COLORS[i % COLORS.length], vol: 0, pan: 0, mute: false, solo: false, arm: false, fx: defaultFx(), auto: false, autoOff: 1, fxOff: false, tight: { on: false, str: 0.5 } };
  }
  /* saved projects: tracks without the auto-match fields load with it OFF (old saves keep their sound) */
  function normTrack(t) {
    t.fx = normFx(t.fx);
    t.auto = typeof t.auto === "boolean" ? t.auto : false;
    t.autoOff = isFinite(+t.autoOff) && t.autoOff != null ? clamp(+t.autoOff, -12, 12) : 1;
    t.fxOff = !!t.fxOff;
    t.tight = { on: !!(t.tight && t.tight.on), str: t.tight && isFinite(+t.tight.str) ? clamp(+t.tight.str, 0, 1) : 0.5 }; // Tighten to beat: off unless turned on
    return t;
  }

  /* ---- auto level match (non-destructive): each vocal track's gain = beat loudness (beat track, over the vocal's
     region, incl. the beat track's volume) + offset − the vocal's gated loudness (silence ignored). The clips are
     never changed; the gain sits in the track's fader on top of the manual volume. Measurements are cached per
     clip layout, so moving the beat volume re-matches instantly and a new take re-measures only its own track. */
  var autoDb = {}, autoCache = {}, autoInfo = {};
  function beatTrackId(P) { var t = P.tracks.filter(function (t) { return /beat/i.test(t.name); })[0] || P.tracks[0]; return t && t.id; }
  function regionMeasure(P, trackId, a, b, mono) {
    var cl = P.clips.filter(function (c) { return c.track === trackId && c.start < b && c.start + c.dur > a && sources[c.src]; });
    if (!cl.length) return null;
    var key = (mono ? "m" : "s") + a.toFixed(3) + "|" + b.toFixed(3) + "|" + cl.map(function (c) { return [c.src, c.start, c.offset, c.dur, c.gain || 0].join(","); }).join(";");
    if (autoCache[key]) return autoCache[key];
    var sr = sources[cl[0].src].buf.sampleRate || SR, n = Math.max(1, Math.round((b - a) * sr));
    var L = new Float32Array(n), R = mono ? null : new Float32Array(n), peak = 0;
    cl.forEach(function (c) {
      var buf = sources[c.src].buf, g = db(c.gain || 0), ch0 = buf.getChannelData(0), ch1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : ch0;
      var s0 = Math.max(a, c.start), s1 = Math.min(b, c.start + c.dur), i0 = Math.round((s0 - a) * sr), i1 = Math.round((s1 - a) * sr), o = Math.round((c.offset + s0 - c.start) * sr) - i0;
      for (var i = i0; i < i1 && i < n; i++) { var j = i + o; if (j < 0 || j >= ch0.length) continue;
        if (mono) L[i] += (buf.numberOfChannels > 1 ? 0.5 * (ch0[j] + ch1[j]) : ch0[j]) * g; else { L[i] += ch0[j] * g; R[i] += ch1[j] * g; } }
    });
    for (var k = 0; k < n; k++) { var v = Math.abs(L[k]); if (v > peak) peak = v; if (R) { v = Math.abs(R[k]); if (v > peak) peak = v; } }
    // a mono take plays the same signal on both sides (strip upmix → centre), so its loudness is the mono value + 3 dB
    var r = { lufs: window.IPBFx.lufs(mono ? [L] : [L, R], sr) + (mono ? 10 * Math.log10(2) : 0), peak: peak };
    var ks = Object.keys(autoCache); if (ks.length > 40) delete autoCache[ks[0]];
    autoCache[key] = r; return r;
  }
  function autoMatch(P) {
    autoDb = {}; autoInfo = {};
    if (!window.IPBFx || !window.IPBFx.lufs) return autoDb;
    var bid = beatTrackId(P), bt = P.tracks.filter(function (t) { return t.id === bid; })[0];
    P.tracks.forEach(function (tr) {
      if (!tr.auto || tr.id === bid) return;
      var cl = P.clips.filter(function (c) { return c.track === tr.id; });
      if (!cl.length) { autoInfo[tr.id] = { state: "no take yet" }; return; }
      var a = Math.min.apply(null, cl.map(function (c) { return c.start; })), b = Math.max.apply(null, cl.map(function (c) { return c.start + c.dur; }));
      var v = regionMeasure(P, tr.id, a, b, true), bm = bt ? regionMeasure(P, bid, a, b, false) : null; // the beat's level setting counts, not mute / solo
      if (!v || !isFinite(v.lufs)) { autoInfo[tr.id] = { state: "take is silent" }; return; }
      if (!bm || !isFinite(bm.lufs)) { autoInfo[tr.id] = { state: "no beat under this take" }; return; }
      var beatL = bm.lufs + (bt.vol || 0), g = window.IPBFx.autoGainDb(beatL, v.lufs, tr.autoOff), capped = false;
      var room = v.peak > 0 ? -toDb(v.peak) - 0.3 : 99; // never push the take itself past full scale (the master limiter guards the mix)
      if (g > room) { g = room; capped = true; }
      autoDb[tr.id] = g;
      autoInfo[tr.id] = { state: "ok", db: g, beat: beatL, vocal: v.lufs, target: beatL + tr.autoOff, capped: capped || g >= window.IPBFx.AUTO.max - 0.01 };
    });
    return autoDb;
  }
  function autoGain(tr) { return tr.auto && autoDb[tr.id] != null ? autoDb[tr.id] : 0; }
  function newProject() {
    var p = { v: 1, id: uid("p"), name: "My Song", bpm: 96, snap: true, metro: false, loop: { on: false, start: 0, end: 8 },
      tracks: [], clips: [], master: { vol: 0, limiter: true, ceiling: -1 }, latencyMs: null, countIn: 1 };
    for (var i = 0; i < 4; i++) p.tracks.push(newTrack(i, ["Beat", "Vocals", "Vocals 2", "Ad-libs"][i]));
    return p;
  }

  /* ---- audio source pool: immutable AudioBuffers referenced by clips (edits always create a new source) ---- */
  var sources = {};
  function addSource(buf, name, id) {
    id = id || uid("s");
    // a stereo take / import with one dead side (built-in tablet mic recorded as stereo, voice left only) → mono, so it
    // plays centred. Real stereo (beats, mixes) is untouched.
    var was = buf ? buf.numberOfChannels : 0, side = -1;
    if (buf && buf.numberOfChannels === 2 && window.IPBFx) {
      side = window.IPBFx.liveSide(buf.getChannelData(0), buf.getChannelData(1));
      if (side >= 0) buf = bufFrom([buf.getChannelData(side)], buf.sampleRate);
    }
    // a 3+ channel file: keep the first two (Web Audio would down-mix it anyway)
    sources[id] = { id: id, name: name || "Audio", buf: buf, form: was === 1 ? "mono" : side >= 0 ? (side ? "R-only→mono" : "L-only→mono") : was === 2 ? "stereo" : was + "ch" };
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
  function usedSources(P) { var u = {}; P.clips.forEach(function (c) { u[c.src] = 1; if (c.orig && c.orig.src) u[c.orig.src] = 1; }); return Object.keys(u); } // originals of edited clips are kept too
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
    SR: SR, COLORS: COLORS, uid: uid, clamp: clamp, db: db, toDb: toDb, defaultFx: defaultFx, normFx: normFx, newTrack: newTrack, newProject: newProject, normTrack: normTrack,
    autoMatch: autoMatch, autoGain: autoGain, autoInfo: function (id) { return autoInfo[id] || null; }, beatTrackId: beatTrackId,
    sources: sources, addSource: addSource, makeBuffer: makeBuffer, bufFrom: bufFrom, chans: chans,
    H: H, pushUndo: pushUndo, undo: undo, redo: redo, clearHistory: clearHistory,
    encodeWav: encodeWav, encodeMp3: encodeMp3, loadScript: loadScript,
    saveProject: saveProject, listProjects: listProjects, loadProject: loadProject, deleteProject: deleteProject, vaultList: vaultList, beatsDb: beatsDb,
    exportProjectFile: exportProjectFile, importProjectFile: importProjectFile, download: download
  });
})();
