/* Island Pin Beats · Multitrack recorder + basic timeline (Studio step 1). Session autosaves to IndexedDB until Save & exit. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var MAXT = 8, ctx = null, master = null, workletReady = null;
  var bufs = {};        // bufId -> { buf: AudioBuffer, peaks: Float32Array, pps }
  var streams = {};     // deviceId -> { stream, src, split, chans, settings }
  var nid = 1; function uid(p) { return p + (nid++); }
  var S = { bpm: 90, tracks: [], range: null, sel: null, playhead: 0 };
  var pxs = 60;         // pixels per second
  var undoS = [], redoS = [];
  var latMs = +(localStorage.getItem("ipb_mt_latency_ms") || 0) || 0;
  var devices = [];
  var play = null;      // { passes:[{t,from,to}], srcs:[], timer, rec }
  var loopOn = false, punchOn = false, clickOn = false;

  function toast(m, ms) { var t = $("toast"); t.textContent = m; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(function () { t.hidden = true; }, ms || 2600); }
  function beat() { return 60 / S.bpm; }
  function snapV() { return +$("snap").value * beat(); }
  function snap(x) { var g = snapV(); return g ? Math.max(0, Math.round(x / g) * g) : Math.max(0, x); }
  function fmt(t) { var b = beat(), bar = Math.floor(t / (b * 4)) + 1, bt = Math.floor((t / b) % 4) + 1, m = Math.floor(t / 60), s = t - m * 60; return bar + "." + bt + " · " + m + ":" + (s < 10 ? "0" : "") + s.toFixed(2); }

  /* ---------- audio ---------- */
  function ac() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext; try { ctx = new AC({ latencyHint: "interactive", sampleRate: 48000 }); } catch (e) { ctx = new AC({ latencyHint: "interactive" }); }
      master = ctx.createGain(); master.gain.value = S.mvol == null ? 1 : S.mvol; master.connect(ctx.destination);
      S.tracks.forEach(trackNodes); S.tracks.forEach(rebuildFx);
      workletReady = ctx.audioWorklet ? ctx.audioWorklet.addModule("multitrack-worklet.js?v=20261023a") : Promise.reject(new Error("AudioWorklet not supported"));
      workletReady.catch(function () { toast("This browser cannot record here (no AudioWorklet). Update Chrome.", 5000); });
      latHint();
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }
  function trackNodes(t) { if (!ctx || t.gain) return; t.gain = ctx.createGain(); t.fxIn = ctx.createGain(); t.fxIn.connect(t.gain); t.pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null; if (t.pan) { t.gain.connect(t.pan); t.pan.connect(master); } else t.gain.connect(master); }
  function applyMS() {
    var anySolo = S.tracks.some(function (t) { return t.solo; });
    S.tracks.forEach(function (t) { if (t.gain) t.gain.gain.value = t.mute ? 0 : (anySolo && !t.solo ? 0 : (t.vol == null ? 1 : t.vol)); if (t.pan) t.pan.pan.value = t.pn || 0; }); if (master) master.gain.value = S.mvol == null ? 1 : S.mvol;
    if (curT && !$("sh-trk").hidden && document.activeElement !== $("tk-vol") && document.activeElement !== $("tk-pan")) { $("tk-vol").value = curT.vol == null ? 1 : curT.vol; $("tk-pan").value = curT.pn || 0; }
    if (window.IPBMixerSync) window.IPBMixerSync(); save();
  }
  function addBuf(buf) {
    var id = uid("b"), pps = 200, n = Math.ceil(buf.duration * pps), pk = new Float32Array(n), d0 = buf.getChannelData(0), d1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : null, step = buf.sampleRate / pps;
    for (var i = 0; i < n; i++) { var a = Math.floor(i * step), b = Math.min(d0.length, Math.floor((i + 1) * step)), m = 0; for (var j = a; j < b; j++) { var v = Math.abs(d0[j]); if (d1) v = Math.max(v, Math.abs(d1[j])); if (v > m) m = v; } pk[i] = m; }
    bufs[id] = { buf: buf, peaks: pk, pps: pps }; return id;
  }

  /* ---------- model / undo ---------- */
  function newTrack(name, kind) { var t = { id: uid("t"), name: name, kind: kind || "audio", arm: false, mute: false, solo: false, dev: "", ch: "L", vol: 1, pn: 0, ins: [], mon: false, clips: [], takes: [] }; trackNodes(t); return t; }
  function snapshot() { return JSON.stringify({ bpm: S.bpm, tracks: S.tracks.map(function (t) { return { id: t.id, name: t.name, kind: t.kind, arm: t.arm, mute: t.mute, solo: t.solo, dev: t.dev, ch: t.ch, vol: t.vol, pn: t.pn, ins: (t.ins || []).map(function (s) { return { pid: s.pid, on: s.on, k: JSON.parse(JSON.stringify(s.k || {})) }; }), clips: t.clips, takes: t.takes }; }) }); }
  function restore(js) {
    var o = JSON.parse(js), old = {}; S.tracks.forEach(function (t) { old[t.id] = t; });
    S.bpm = o.bpm; $("bpm").value = S.bpm;
    S.tracks = o.tracks.map(function (x) { var t = old[x.id] || newTrack(x.name, x.kind); for (var k in x) t[k] = x[k]; trackNodes(t); return t; });
    Object.keys(old).forEach(function (k) { if (!S.tracks.some(function (t) { return t.id === k; }) && old[k].gain) old[k].gain.disconnect(); });
    if (S.sel && !clipById(S.sel)) S.sel = null;
    S.tracks.forEach(rebuildFx); applyMS(); render();
  }
  function edit() { undoS.push(snapshot()); if (undoS.length > 200) undoS.shift(); redoS = []; dirty = true; save(); }
  function undo() { if (!undoS.length) return toast("Nothing to undo"); redoS.push(snapshot()); restore(undoS.pop()); toast("Undo"); }
  function redo() { if (!redoS.length) return toast("Nothing to redo"); undoS.push(snapshot()); restore(redoS.pop()); toast("Redo"); }
  var dirty = false;
  function clipById(id) { for (var i = 0; i < S.tracks.length; i++) for (var j = 0; j < S.tracks[i].clips.length; j++) if (S.tracks[i].clips[j].id === id) return S.tracks[i].clips[j]; return null; }
  function trackOf(id) { return S.tracks.filter(function (t) { return t.clips.some(function (c) { return c.id === id; }); })[0]; }
  function clipEnd(c) { return c.start + c.dur * c.reps; }
  function mkClip(bufId, start, offset, dur, name) { return { id: uid("c"), buf: bufId, start: start, offset: offset, dur: dur, reps: 1, fi: 0, fo: 0, name: name || "Take" }; }
  function unloop(t, c) { // turn a looped clip into separate copies (needed before split / carve)
    if (c.reps <= 1) return [c];
    var out = []; for (var i = 0; i < c.reps; i++) { var n = JSON.parse(JSON.stringify(c)); n.id = i ? uid("c") : c.id; n.reps = 1; n.start = c.start + i * c.dur; n.fi = i === 0 ? c.fi : 0; n.fo = i === c.reps - 1 ? c.fo : 0; out.push(n); }
    t.clips.splice.apply(t.clips, [t.clips.indexOf(c), 1].concat(out)); return out;
  }
  function splitClip(t, c, x) { // returns right part or null
    var parts = unloop(t, c); c = parts.filter(function (p) { return x > p.start + 0.005 && x < clipEnd(p) - 0.005; })[0]; if (!c) return null;
    var r = JSON.parse(JSON.stringify(c)); r.id = uid("c"); var d = x - c.start;
    r.start = x; r.offset = c.offset + d; r.dur = c.dur - d; r.fi = 0; c.dur = d; c.fo = 0;
    t.clips.splice(t.clips.indexOf(c) + 1, 0, r); return r;
  }
  function carve(t, a, b) { // remove [a,b) from the playlist (the raw takes stay in t.takes)
    t.clips.slice().forEach(function (c) { if (clipEnd(c) > a && c.start < b) { splitClip(t, c, a); } });
    t.clips.slice().forEach(function (c) { if (clipEnd(c) > b && c.start < b) splitClip(t, c, b); });
    t.clips = t.clips.filter(function (c) { return !(c.start >= a - 0.001 && clipEnd(c) <= b + 0.001); });
  }

  /* ---------- transport ---------- */
  function projEnd() { var e = 0; S.tracks.forEach(function (t) { t.clips.forEach(function (c) { e = Math.max(e, clipEnd(c)); }); }); return e; }
  function schedPass(from, to, at) {
    S.tracks.forEach(function (t) {
      t.clips.forEach(function (c) {
        var B = bufs[c.buf]; if (!B) return; var cs = c.start, ce = clipEnd(c);
        for (var i = 0; i < c.reps; i++) {
          var s = cs + i * c.dur, e = s + c.dur, a = Math.max(s, from), b = Math.min(e, to); if (b - a < 0.002) continue;
          var src = ctx.createBufferSource(), g = ctx.createGain(); src.buffer = B.buf; src.connect(g); g.connect(t.fxIn || t.gain);
          var when = at + (a - from), env = function (x) { var v = 1; if (c.fi && x < cs + c.fi) v = Math.min(v, (x - cs) / c.fi); if (c.fo && x > ce - c.fo) v = Math.min(v, (ce - x) / c.fo); return Math.max(0, v); };
          g.gain.setValueAtTime(env(a), when);
          if (c.fi && cs + c.fi > a && cs + c.fi <= b) g.gain.linearRampToValueAtTime(1, at + (cs + c.fi - from));
          if (c.fo && ce - c.fo < b && ce <= b + 0.001) { var fs = Math.max(a, ce - c.fo); g.gain.setValueAtTime(env(fs), at + (fs - from)); g.gain.linearRampToValueAtTime(0, at + (ce - from)); }
          src.start(when, c.offset + (a - s), b - a); play.srcs.push(src);
        }
      });
    });
    if (clickOn) { var bt = beat(), k = Math.ceil(from / bt - 1e-6); for (var x = k * bt; x < Math.min(to, from + 600); x += bt, k++) clickAt(at + (x - from), k % 4 === 0); }
    play.passes.push({ t: at, from: from, to: to });
  }
  function clickAt(when, acc) { var o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = acc ? 1760 : 1175; g.gain.setValueAtTime(0.0001, when); g.gain.exponentialRampToValueAtTime(acc ? 0.5 : 0.3, when + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, when + 0.05); o.connect(g); g.connect(master); o.start(when); o.stop(when + 0.06); if (play) play.srcs.push(o); }
  function posNow() {
    if (!play) return S.playhead; var now = ctx.currentTime, p = play.passes[0];
    play.passes.forEach(function (q) { if (q.t <= now) p = q; });
    return Math.min(p.to, p.from + Math.max(0, now - p.t));
  }
  function start(rec) {
    ac(); if (play) stop();
    var useLoop = loopOn && S.range && !rec && S.playhead < S.range[1];
    play = { passes: [], srcs: [], rec: null };
    var t0 = ctx.currentTime + 0.12, p0 = S.playhead;
    if (useLoop) {
      schedPass(p0, S.range[1], t0);
      play.timer = setInterval(function () { var L = play.passes[play.passes.length - 1], end = L.t + (L.to - L.from); if (end - ctx.currentTime < 0.4) schedPass(S.range[0], S.range[1], end); play.srcs = play.srcs.filter(function (s) { return s._dead !== 1; }); }, 50);
    } else schedPass(p0, Infinity, t0);
    play.t0 = t0; play.p0 = p0;
    $("play").textContent = "■"; $("play").classList.add("on");
    if (rec) beginRec(t0, p0);
    tick();
  }
  function stop() {
    if (!play) return; var p = posNow();
    clearInterval(play.timer); play.srcs.forEach(function (s) { try { s.stop(); } catch (e) {} });
    var r = play.rec; play = null;
    if (r) endRec(r);
    S.playhead = Math.max(0, p); save(); $("play").textContent = "▶"; $("play").classList.remove("on"); $("rec").classList.remove("on"); drawPH();
  }
  function tick() {
    if (!play) return; var p = posNow(); drawPH(p);
    if (play.rec) play.rec.live.forEach(function (L) { var a = Math.max(L.a, 0); L.el.style.left = a * pxs + "px"; L.el.style.width = Math.max(0, Math.min(p, L.b) - a) * pxs + "px"; });
    if (!play.rec && !loopOn && p > projEnd() + 1) { stop(); return; }
    var tl = $("tl"), x = p * pxs + hw(), vw = tl.clientWidth; if (x > tl.scrollLeft + vw - 40 || x < tl.scrollLeft + hw()) tl.scrollLeft = Math.max(0, x - hw() - 40);
    requestAnimationFrame(tick);
  }

  /* ---------- inputs ---------- */
  var RAW = { echoCancellation: false, noiseSuppression: false, autoGainControl: false, googEchoCancellation: false, googNoiseSuppression: false, googAutoGainControl: false, googHighpassFilter: false, googTypingNoiseDetection: false, googAudioMirroring: false, voiceIsolation: false, sampleRate: { ideal: 48000 }, sampleSize: { ideal: 16 }, latency: { ideal: 0.01 }, channelCount: { ideal: 2 } };
  function listDevs() { return navigator.mediaDevices.enumerateDevices().then(function (d) { devices = d.filter(function (x) { return x.kind === "audioinput"; }); return devices; }); }
  var HS = /head ?set|head ?phone|wired|usb|earphone|earpiece|lightning|type-c|bluetooth|airpods|buds/i;
  function pickDefault() { // headset/USB mic first, Tab built-in mic only as fallback; remembered choice wins
    var saved = localStorage.getItem("ipb_mic_dev") || "";
    return listDevs().then(function (d) {
      if (saved && d.some(function (x) { return x.deviceId === saved; })) return saved;
      var h = d.filter(function (x) { return x.deviceId !== "default" && x.deviceId !== "communications" && HS.test(x.label) && !/bluetooth|airpods|buds/i.test(x.label); })[0] || d.filter(function (x) { return HS.test(x.label); })[0];
      return h ? h.deviceId : "";
    }).catch(function () { return ""; });
  }
  function openDev(dev) {
    if (!dev) return pickDefault().then(function (id) { return id ? openDev2(id).then(function (o) { streams["default"] = o; return o; }) : openDev2(""); });
    return openDev2(dev);
  }
  function openDev2(dev) {
    ac(); var key = dev || "default";
    if (streams[key]) return Promise.resolve(streams[key]);
    var c = {}; for (var k in RAW) c[k] = RAW[k]; if (dev) c.deviceId = { exact: dev };
    return navigator.mediaDevices.getUserMedia({ audio: c, video: false }).then(function (st) {
      var tr = st.getAudioTracks()[0], set = tr.getSettings ? tr.getSettings() : {};
      var src = ctx.createMediaStreamSource(st), sp = ctx.createChannelSplitter(2); src.connect(sp);
      var o = { stream: st, src: src, split: sp, settings: set, chans: set.channelCount || 1, label: tr.label };
      streams[key] = o; if (!dev && set.deviceId) streams[set.deviceId] = o;
      listDevs().then(renderDevs);
      return o;
    });
  }
  function tapFor(t) { // mono node carrying the track's chosen channel + meter + recorder
    return openDev(t.dev).then(function (o) {
      if (t.tap && t.tap.key === (t.dev || "default") + t.ch) return t.tap;
      if (t.tap) { try { t.tap.g.disconnect(); } catch (e) {} }
      var g = ctx.createGain(), an = ctx.createAnalyser(); an.fftSize = 1024;
      if (t.ch === "R" && o.chans > 1) o.split.connect(g, 1);
      else if (t.ch === "M" && o.chans > 1) { o.split.connect(g, 0); o.split.connect(g, 1); g.gain.value = 0.5; }
      else o.split.connect(g, 0);
      g.channelCount = 1; g.channelCountMode = "explicit"; g.connect(an);
      t.tap = { key: (t.dev || "default") + t.ch, g: g, an: an, o: o, buf: new Float32Array(1024) };
      return workletReady.then(function () {
        var n = new AudioWorkletNode(ctx, "mt-rec", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], channelCount: 1, channelCountMode: "explicit" });
        var z = ctx.createGain(); z.gain.value = 0; g.connect(n); n.connect(z); z.connect(ctx.destination);
        t.tap.node = n; monitor(t); return t.tap;
      });
    });
  }
  var mLast = 0;
  function meters(ts) {
    requestAnimationFrame(meters); if (document.hidden || (ts || 0) - mLast < 50) return; mLast = ts || 0;
    S.tracks.forEach(function (t) {
      var el = t._mEl && t._mEl.isConnected ? t._mEl : (t._mEl = document.querySelector('.row[data-t="' + t.id + '"] .meter b')); if (!el) return;
      if (!t.tap || !t.arm) { el.style.width = "0"; return; }
      t.tap.an.getFloatTimeDomainData(t.tap.buf); var m = 0; for (var i = 0; i < t.tap.buf.length; i++) m = Math.max(m, Math.abs(t.tap.buf[i]));
      t.peak = Math.max(m, (t.peak || 0) * 0.9); var db = 20 * Math.log10(t.peak + 1e-6); var w = Math.round(Math.max(0, Math.min(100, (db + 60) / 60 * 100))); if (t._mW !== w) { t._mW = w; el.style.width = w + "%"; }
    });
  }

  /* ---------- recording ---------- */
  function beginRec(t0, p0) {
    var armed = S.tracks.filter(function (t) { return t.arm && t.tap && t.tap.node; }), sr = ctx.sampleRate, lat = latMs / 1000;
    var a = p0, b = null;
    if (punchOn && S.range) { a = Math.max(p0, S.range[0]); b = S.range[1]; }
    var r = { tracks: [], live: [], a: a, b: b };
    armed.forEach(function (t) {
      var R = { t: t, chunks: [], done: null }; R.done = new Promise(function (res) { var fin = false; t.tap.node.port.onmessage = function (e) { if (e.data.type === "chunk") R.chunks.push(e.data.data); else if (!fin) { fin = true; res(); } }; });
      t.tap.node.port.postMessage({ cmd: "arm", from: Math.round((t0 + (a - p0) + lat) * sr), to: b == null ? null : Math.round((t0 + (b - p0) + lat) * sr) });
      r.tracks.push(R);
      var lane = document.querySelector('.row[data-t="' + t.id + '"] .lane'), el = document.createElement("div"); el.className = "recclip"; lane.appendChild(el); r.live.push({ el: el, a: a, b: b == null ? Infinity : b });
    });
    play.rec = r; $("rec").classList.add("on");
  }
  function endRec(r) {
    r.tracks.forEach(function (R) { R.t.tap.node.port.postMessage({ cmd: "stop" }); });
    Promise.all(r.tracks.map(function (R) { return R.done; })).then(function () {
      var made = 0; edit();
      r.tracks.forEach(function (R) {
        var n = R.chunks.reduce(function (s, c) { return s + c.length; }, 0); if (n < ctx.sampleRate * 0.05) return;
        var buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0), o = 0; R.chunks.forEach(function (c) { d.set(c, o); o += c.length; });
        var id = addBuf(buf), t = R.t, num = t.takes.length + 1, c = mkClip(id, r.a, 0, buf.duration, t.name + " take " + num);
        carve(t, r.a, r.a + buf.duration); t.clips.push(c); t.takes.push({ buf: id, name: c.name, at: r.a, dur: buf.duration }); made++;
      });
      if (!made) undoS.pop();
      render(); toast(made ? "Recorded " + made + " track" + (made > 1 ? "s" : "") + " (raw)." : "Nothing recorded (stopped too soon?)");
    });
  }
  function recBtn() {
    if (play && play.rec) { stop(); return; }
    var armed = S.tracks.filter(function (t) { return t.arm; }); if (!armed.length) return toast("Arm a track first (R).");
    ac(); Promise.all(armed.map(tapFor)).then(function () {
      if (punchOn) { if (!S.range) return toast("Drag on the ruler to choose the punch range first."); if (S.playhead >= S.range[1] || S.playhead > S.range[0]) S.playhead = Math.max(0, S.range[0] - 4 * beat()); }
      start(true);
    }).catch(function (e) { toast("Mic error: " + (e && e.message || e), 4500); });
  }

  /* ---------- latency calibration ---------- */
  function latHint() { if (!ctx) return; var o = ((ctx.outputLatency || 0) + (ctx.baseLatency || 0)) * 1000; $("lat-hint").textContent = "This Tab reports ~" + Math.round(o) + " ms output delay; calibrate to measure the real round trip."; }
  function setLat(v) { latMs = Math.max(0, Math.min(1000, Math.round(v))); $("lat").value = latMs; localStorage.setItem("ipb_mt_latency_ms", latMs); save(); }
  function calibrate(clap) {
    var t = S.tracks.filter(function (x) { return x.id === $("cal-trk").value; })[0]; if (!t) return;
    if (play) stop(); ac(); $("cal-out").textContent = clap ? "Get ready… clap on every click." : "Listening…";
    tapFor(t).then(function (tap) {
      var sr = ctx.sampleRate, N = clap ? 8 : 5, gap = clap ? 0.6 : 0.5, t0 = ctx.currentTime + 0.5, f0 = Math.round(t0 * sr), chunks = [];
      play = { passes: [{ t: t0, from: 0, to: 0 }], srcs: [], rec: null };
      for (var i = 0; i < N; i++) clickAt(t0 + i * gap, true);
      var done = new Promise(function (res) { var fin = false; tap.node.port.onmessage = function (e) { if (e.data.type === "chunk") chunks.push(e.data.data); else if (!fin) { fin = true; res(); } }; });
      tap.node.port.postMessage({ cmd: "arm", from: f0 - Math.round(0.2 * sr), to: f0 + Math.round((N * gap + 0.6) * sr) });
      done.then(function () {
        play = null; var n = 0; chunks.forEach(function (c) { n += c.length; }); var d = new Float32Array(n), o = 0; chunks.forEach(function (c) { d.set(c, o); o += c.length; });
        var base = Math.round(0.2 * sr), res = [];
        for (var i = clap ? 2 : 0; i < N; i++) {
          var c = base + Math.round(i * gap * sr), a = Math.max(0, c - Math.round((clap ? 0.15 : 0) * sr)), b = Math.min(n, c + Math.round(0.45 * sr)), m = 0, nf = 0, j;
          for (j = a; j < b; j++) m = Math.max(m, Math.abs(d[j]));
          for (j = Math.max(0, a - Math.round(0.05 * sr)); j < a; j++) nf = Math.max(nf, Math.abs(d[j]));
          if (m < 0.02 || m < nf * 3) continue;
          for (j = a; j < b; j++) if (Math.abs(d[j]) > m * 0.5) break;
          res.push((j - c) / sr * 1000);
        }
        if (res.length < (clap ? 3 : 2)) { $("cal-out").innerHTML = '<span class="bad">Could not hear the clicks clearly. Turn the monitors up a little, keep the mic close, and try again.</span>'; return; }
        res.sort(function (x, y) { return x - y; }); var med = res[Math.floor(res.length / 2)], spread = res[res.length - 1] - res[0];
        setLat(med); $("cal-out").innerHTML = '<span class="ok">Measured ' + Math.round(med) + " ms</span> (" + res.length + " hits, spread " + Math.round(spread) + " ms). Saved; new takes move " + Math.round(med) + " ms earlier.";
      });
    }).catch(function (e) { play = null; $("cal-out").textContent = "Mic error: " + (e && e.message || e); });
  }

  /* ---------- beat track ---------- */
  function beatTrack() { return S.tracks.filter(function (t) { return t.kind === "beat"; })[0]; }
  function placeBeat(buf, name, bpm) {
    ac(); edit(); var t = beatTrack(), id = addBuf(buf);
    if (bpm && bpm >= 40 && bpm <= 240) { S.bpm = bpm; $("bpm").value = bpm; }
    t.clips = [mkClip(id, 0, 0, buf.duration, name)]; S.beatName = name; render(); toast("Beat loaded: " + name + " (" + buf.duration.toFixed(1) + " s). Select it and press Loop + to repeat it.", 4000);
  }
  function decode(ab) { ac(); return new Promise(function (res, rej) { ctx.decodeAudioData(ab, res, rej); }); }
  function bpmOf(name) { var m = /(\d{2,3})\s*bpm/i.exec(name || ""); return m ? +m[1] : null; }
  function vaultList() {
    return new Promise(function (res) {
      var r; try { r = indexedDB.open("islandpinbeats", 1); } catch (e) { return res([]); }
      r.onupgradeneeded = function () { r.transaction.abort(); };
      r.onerror = function () { res([]); };
      r.onsuccess = function () { var d = r.result; if (!d.objectStoreNames.contains("vault")) return res([]); var q = d.transaction("vault").objectStore("vault").getAll(); q.onsuccess = function () { res((q.result || []).sort(function (a, b) { return b.created - a.created; })); }; q.onerror = function () { res([]); }; };
    });
  }
  function renderVault() {
    vaultList().then(function (items) {
      var L = $("vault"); L.innerHTML = "";
      if (!items.length) { L.innerHTML = "<li>Your Vault is empty. Use Bounce current beat, or Bounce loop in the beat maker.</li>"; return; }
      items.slice(0, 40).forEach(function (it) {
        var li = document.createElement("li"), b = document.createElement("button"); b.className = "btn"; b.textContent = "Use";
        li.innerHTML = "<span></span>"; li.firstChild.textContent = it.name || "Vault audio"; li.appendChild(b);
        b.onclick = function () { if (!it.blob) return toast("That item has no audio."); it.blob.arrayBuffer().then(decode).then(function (buf) { placeBeat(buf, (it.name || "Beat").split(" · ")[0], bpmOf(it.name)); $("sh-beat").hidden = true; }).catch(function () { toast("Could not read that Vault item."); }); };
        L.appendChild(li);
      });
    });
  }
  function bounceNow() {
    var fr = $("beatfr"), out = $("bb-out"); out.textContent = "Opening the beat maker in the background…";
    var bars = $("bb-bars").value, waited = 0;
    fr.src = "beats.html?embed=multitrack";
    fr.onload = function () {
      var iv = setInterval(function () {
        waited += 250; var w = null; try { w = fr.contentWindow.IPBBeats; } catch (e) {}
        if (w && w.bounceForStudio) {
          clearInterval(iv); out.textContent = "Bouncing " + bars + " bars… (can take a minute on the Tab)";
          w.bounceForStudio(bars).then(function (id) { return vaultList().then(function (items) { return items.filter(function (x) { return x.id === id; })[0]; }); })
            .then(function (it) { if (!it) throw new Error("bounce not found"); return it.blob.arrayBuffer().then(decode).then(function (buf) { placeBeat(buf, (it.name || "Beat").split(" · ")[0], bpmOf(it.name)); out.textContent = "Done."; fr.src = "about:blank"; $("sh-beat").hidden = true; renderVault(); }); })
            .catch(function (e) { out.textContent = "Bounce failed: " + (e && e.message || e) + ". Try Bounce loop in the beat maker, then pick it from the Vault."; fr.src = "about:blank"; });
        } else if (waited > 20000) { clearInterval(iv); out.textContent = "The beat maker did not open. Make a bounce there and pick it from the Vault."; }
      }, 250);
    };
  }

  /* ---------- rendering ---------- */
  function hw() { return parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--hw")) || 176; }
  function laneW() { return Math.max(($("tl").clientWidth - hw()), (Math.max(projEnd(), S.range ? S.range[1] : 0, S.playhead) + 16 * beat()) * pxs); }
  function render() {
    var W = laneW(), rows = $("rows"); rows.innerHTML = "";
    document.documentElement.style.setProperty("--bp", (beat() * pxs) + "px");
    S.tracks.forEach(function (t) {
      var row = document.createElement("div"); row.className = "row" + (t.kind === "beat" ? " beat" : ""); row.dataset.t = t.id;
      var dev = devices.filter(function (d) { return d.deviceId === t.dev; })[0], info = t.kind === "beat" ? "beat" : ((dev ? dev.label.slice(0, 14) : "Default") + " · " + t.ch);
      var h = '<div class="hdr"><button class="nm" data-a="cfg"><span></span><small>' + esc(info) + "</small></button>";
      if (t.kind === "beat") h += '<div class="bt"><button class="btn" data-a="load">Load</button><button class="btn mute' + (t.mute ? " on" : "") + '" data-a="mute">M</button><button class="btn solo' + (t.solo ? " on" : "") + '" data-a="solo">S</button></div>';
      else h += '<div class="bt"><button class="btn arm' + (t.arm ? " on" : "") + '" data-a="arm">R</button><button class="btn mute' + (t.mute ? " on" : "") + '" data-a="mute">M</button><button class="btn solo' + (t.solo ? " on" : "") + '" data-a="solo">S</button></div><div class="meter"><b></b></div>';
      row.innerHTML = h + '</div><div class="lane" style="width:' + W + 'px"></div>';
      row.querySelector(".nm span").textContent = t.name;
      var lane = row.querySelector(".lane");
      t.clips.forEach(function (c) { lane.appendChild(clipEl(c)); });
      rows.appendChild(row);
    });
    var ru = $("ruler"); ru.style.width = W + "px"; ru.innerHTML = "";
    var bt = beat(), every = bt * pxs < 18 ? 4 : 1;
    for (var k = 0; k * bt * pxs < W; k += every) { var i = document.createElement("i"); i.style.left = k * bt * pxs + "px"; if (k % 4 === 0) { i.className = "bar"; i.textContent = k / 4 + 1; } ru.appendChild(i); }
    if (S.range) { var r = document.createElement("div"); r.className = "range" + (loopOn ? " loop" : ""); r.style.left = S.range[0] * pxs + "px"; r.style.width = (S.range[1] - S.range[0]) * pxs + "px"; ru.appendChild(r); $("rangeinfo").textContent = "Range " + fmt(S.range[0]).split(" ·")[0] + "–" + fmt(S.range[1]).split(" ·")[0]; }
    else $("rangeinfo").textContent = "No range";
    $("undo").disabled = !undoS.length; $("redo").disabled = !redoS.length;
    $("addtrk").disabled = S.tracks.filter(function (t) { return t.kind === "audio"; }).length >= MAXT;
    clipBar(); drawPH(); if (window.IPBMixerSync) window.IPBMixerSync(true); save();
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function clipEl(c) {
    var el = document.createElement("div"), w = c.dur * c.reps * pxs; el.className = "clip" + (S.sel === c.id ? " sel" : ""); el.dataset.c = c.id;
    el.style.left = c.start * pxs + "px"; el.style.width = w + "px";
    el.innerHTML = '<canvas></canvas><span class="lbl"></span><i class="eh l"></i><i class="eh r"></i>';
    el.querySelector(".lbl").textContent = c.name + (c.reps > 1 ? " ×" + c.reps : "");
    for (var i = 1; i < c.reps; i++) { var r = document.createElement("i"); r.className = "rep"; r.style.left = i * c.dur * pxs + "px"; el.appendChild(r); }
    if (c.fi) { var f = document.createElement("i"); f.className = "fade"; f.style.left = 0; f.style.width = c.fi * pxs + "px"; f.style.clipPath = "polygon(0 0,100% 0,0 100%)"; el.appendChild(f); }
    if (c.fo) { var g = document.createElement("i"); g.className = "fade"; g.style.right = 0; g.style.width = c.fo * pxs + "px"; g.style.clipPath = "polygon(0 0,100% 0,100% 100%)"; el.appendChild(g); }
    var cv = el.querySelector("canvas"), B = bufs[c.buf], cw = Math.min(4000, Math.max(1, Math.round(w))); cv.width = cw; cv.height = 80;
    if (B) { var x2 = cv.getContext("2d"); x2.fillStyle = "rgba(220,230,255,.75)"; for (var x = 0; x < cw; x++) { var tt = (x / cw) * c.dur * c.reps % c.dur + c.offset, p = B.peaks[Math.min(B.peaks.length - 1, Math.floor(tt * B.pps))] || 0, hh = Math.max(1, p * 38); x2.fillRect(x, 40 - hh, 1, hh * 2); } }
    return el;
  }
  function drawPH(p) { p = p == null ? posNow() : p; $("ph").style.left = (hw() + p * pxs) + "px"; $("time").textContent = fmt(p); }
  function clipBar() {
    var c = S.sel && clipById(S.sel), bar = $("clipbar"); bar.hidden = !c; if (!c) return;
    $("cb-name").textContent = c.name; var tot = c.dur * c.reps;
    $("cb-fi").value = tot ? c.fi / (tot / 2) : 0; $("cb-fo").value = tot ? c.fo / (tot / 2) : 0;
    $("cb-fiv").textContent = Math.round(c.fi * 1000) + " ms"; $("cb-fov").textContent = Math.round(c.fo * 1000) + " ms"; $("cb-reps").textContent = "×" + c.reps;
  }
  function renderDevs() {
    var L = $("devs"); L.innerHTML = "";
    if (!devices.length || !devices[0].label) { L.innerHTML = "<li>Press Allow to see your inputs.</li>"; }
    else devices.forEach(function (d) {
      var o = streams[d.deviceId], li = document.createElement("li"), s = o && o.settings;
      li.innerHTML = "<span></span><small></small>"; li.firstChild.textContent = d.label || d.deviceId.slice(0, 8);
      li.lastChild.innerHTML = s ? ((s.echoCancellation || s.noiseSuppression || s.autoGainControl) ? '<span class="bad">processing ON</span>' : '<span class="ok">raw ✓</span>') + " · " + (s.channelCount || 1) + " ch · " + (s.sampleRate || ctx.sampleRate) + " Hz" : "not opened";
      L.appendChild(li);
    });
    var tk = $("tk-dev"); if (tk) { var v = tk.value; tk.innerHTML = '<option value="">Default input</option>' + devices.filter(function (d) { return d.deviceId && d.deviceId !== "default"; }).map(function (d) { return '<option value="' + esc(d.deviceId) + '">' + esc(d.label || "Input") + "</option>"; }).join(""); tk.value = v; }
  }

  /* ---------- gestures ---------- */
  function lanePos(e) { var r = $("ruler").getBoundingClientRect(); return (e.clientX - r.left) / pxs; }
  var drag = null;
  $("rows").addEventListener("pointerdown", function (e) {
    var el = e.target.closest(".clip"); if (!el) { if (e.target.closest(".lane")) { S.sel = null; render(); } return; }
    var c = clipById(el.dataset.c), t = trackOf(c.id); var mode = e.target.classList.contains("l") ? "l" : e.target.classList.contains("r") ? "r" : "m";
    if (S.sel !== c.id) { S.sel = c.id; render(); el = document.querySelector('.clip[data-c="' + c.id + '"]'); }
    drag = { c: c, t: t, mode: mode, x0: lanePos(e), o: JSON.parse(JSON.stringify(c)), el: el, moved: false, id: e.pointerId };
    try { el.setPointerCapture(e.pointerId); } catch (er) {}
    e.preventDefault();
  });
  window.addEventListener("pointermove", function (e) {
    if (!drag || e.pointerId !== drag.id) return; var dx = lanePos(e) - drag.x0, c = drag.c, o = drag.o, B = bufs[c.buf].buf;
    if (!drag.moved && Math.abs(dx * pxs) < 6) return; if (!drag.moved) { edit(); drag.moved = true; }
    if (drag.mode === "m") c.start = snap(o.start + dx);
    else if (drag.mode === "l") { var ns = snap(o.start + dx), d = ns - o.start; d = Math.max(-o.offset, Math.min(o.dur - 0.02, d)); c.start = o.start + d; c.offset = o.offset + d; c.dur = o.dur - d; }
    else { var ne = snap(o.start + o.dur * o.reps + dx), nd = (ne - o.start) / o.reps; c.dur = Math.max(0.02, Math.min(B.duration - o.offset, nd)); }
    c.fi = Math.min(c.fi, c.dur * c.reps / 2); c.fo = Math.min(c.fo, c.dur * c.reps / 2);
    var n = clipEl(c); drag.el.replaceWith(n); drag.el = n;
  });
  window.addEventListener("pointerup", function (e) { if (drag && e.pointerId === drag.id) { var m = drag.moved; drag = null; if (m) render(); } });
  window.addEventListener("pointercancel", function () { if (drag) { drag = null; render(); } });
  // ruler: tap = playhead, drag = range
  var rd = null;
  $("ruler").addEventListener("pointerdown", function (e) { rd = { a: snap(lanePos(e)), id: e.pointerId, moved: false, x: e.clientX }; try { $("ruler").setPointerCapture(e.pointerId); } catch (er) {} });
  $("ruler").addEventListener("pointermove", function (e) { if (!rd || e.pointerId !== rd.id) return; if (Math.abs(e.clientX - rd.x) > 8) rd.moved = true; if (rd.moved) { var b = snap(lanePos(e)); S.range = b > rd.a ? [rd.a, b] : b < rd.a ? [b, rd.a] : null; render(); } });
  $("ruler").addEventListener("pointerup", function (e) { if (!rd) return; if (!rd.moved) { var p = Math.max(0, lanePos(e)); S.playhead = snap(p); if (play) { start(!!play.rec); } else drawPH(); save(); } rd = null; });
  // pinch zoom (two fingers anywhere on the timeline)
  var pin = null;
  $("tl").addEventListener("touchstart", function (e) { if (e.touches.length === 2) { var a = e.touches[0], b = e.touches[1]; pin = { d: Math.abs(a.clientX - b.clientX) + 1, z: pxs, cx: (a.clientX + b.clientX) / 2 }; pin.t = (pin.cx - $("ruler").getBoundingClientRect().left) / pxs; drag = null; } }, { passive: true });
  $("tl").addEventListener("touchmove", function (e) { if (pin && e.touches.length === 2) { e.preventDefault(); var a = e.touches[0], b = e.touches[1], d = Math.abs(a.clientX - b.clientX) + 1; zoomTo(pin.z * d / pin.d, pin.t, pin.cx); } }, { passive: false });
  $("tl").addEventListener("scroll", function () { save(); }, { passive: true });
  $("tl").addEventListener("touchend", function (e) { if (e.touches.length < 2) pin = null; });
  function zoomTo(z, tAt, clientX) {
    z = Math.max(8, Math.min(800, z)); if (Math.abs(z - pxs) < 0.01) return; var tl = $("tl"), r = tl.getBoundingClientRect();
    if (tAt == null) { tAt = (tl.scrollLeft + tl.clientWidth / 2 - hw()) / pxs; clientX = r.left + hw() + (tl.clientWidth - hw()) / 2; }
    pxs = z; render(); tl.scrollLeft = Math.max(0, hw() + tAt * pxs - (clientX - r.left));
  }

  /* ---------- UI wiring ---------- */
  $("rows").addEventListener("click", function (e) {
    var b = e.target.closest("[data-a]"); if (!b) return; var t = S.tracks.filter(function (x) { return x.id === b.closest(".row").dataset.t; })[0], a = b.dataset.a;
    if (a === "arm") { t.arm = !t.arm; if (t.arm) { ac(); tapFor(t).then(function () { renderDevs(); }).catch(function (er) { t.arm = false; render(); toast("Mic error: " + (er && er.message || er), 4500); }); } render(); }
    else if (a === "mute") { t.mute = !t.mute; applyMS(); render(); }
    else if (a === "solo") { t.solo = !t.solo; applyMS(); render(); }
    else if (a === "load") openBeat();
    else if (a === "cfg") openTrk(t);
  });
  var curT = null;
  function openTrk(t) {
    curT = t; $("tk-ttl").textContent = t.kind === "beat" ? "Beat track" : "Track settings"; $("tk-name").value = t.name; renderDevs(); $("tk-dev").value = t.dev; $("tk-ch").value = t.ch; $("tk-vol").value = t.vol == null ? 1 : t.vol; $("tk-pan").value = t.pn || 0; renderIns(t); $("tk-mon").hidden = t.kind === "beat";
    $("tk-dev").disabled = $("tk-ch").disabled = t.kind === "beat"; $("tk-del").hidden = t.kind === "beat";
    var L = $("tk-takes"); L.innerHTML = t.takes.length ? "" : "<li>No takes yet.</li>";
    t.takes.forEach(function (k) { var li = document.createElement("li"), b = document.createElement("button"); li.innerHTML = "<span></span>"; li.firstChild.textContent = k.name + " · " + k.dur.toFixed(1) + " s"; b.className = "btn"; b.textContent = "Put back"; b.onclick = function () { edit(); carve(t, k.at, k.at + k.dur); t.clips.push(mkClip(k.buf, k.at, 0, k.dur, k.name)); $("sh-trk").hidden = true; render(); toast(k.name + " is back on the timeline."); }; li.appendChild(b); L.appendChild(li); });
    $("sh-trk").hidden = false;
  }
  $("tk-name").onchange = function () { if (!curT) return; edit(); curT.name = this.value.trim() || curT.name; render(); };
  $("tk-dev").onchange = function () { if (!curT) return; curT.dev = this.value; if (curT.arm) tapFor(curT).catch(function (e) { toast("Mic error: " + e.message); }); render(); };
  $("tk-ch").onchange = function () { if (!curT) return; curT.ch = this.value; if (curT.arm) tapFor(curT).then(function (tp) { if (curT.ch !== "L" && tp.o.chans < 2) toast("This input is mono, so Left is used. Pick the USB mixer input for 2 channels.", 4500); }); render(); };
  $("tk-vol").oninput = function () { if (curT) { curT.vol = +this.value; applyMS(); } };
  $("tk-pan").oninput = function () { if (curT) { curT.pn = +this.value; applyMS(); } };
  $("tk-del").onclick = function () { if (!curT) return; edit(); S.tracks = S.tracks.filter(function (t) { return t !== curT; }); if (curT.gain) curT.gain.disconnect(); $("sh-trk").hidden = true; render(); };
  document.querySelectorAll("[data-close]").forEach(function (b) { b.onclick = function () { b.closest(".sheet").hidden = true; }; });
  document.querySelectorAll(".sheet").forEach(function (s) { s.addEventListener("click", function (e) { if (e.target === s) s.hidden = true; }); });
  $("play").onclick = function () { if (play) stop(); else start(false); };
  $("rec").onclick = recBtn;
  $("home").onclick = function () { if (play && play.rec) return; var p = S.range && S.playhead > S.range[0] + 0.01 ? S.range[0] : 0; S.playhead = p; if (play) start(false); drawPH(); save(); $("tl").scrollLeft = Math.max(0, p * pxs - 40); };
  $("loop").onclick = function () { if (!loopOn && !S.range) return toast("Drag on the ruler to pick a loop range first."); loopOn = !loopOn; this.classList.toggle("on", loopOn); save(); if (play && !play.rec) start(false); render(); };
  $("punch").onclick = function () { if (!punchOn && !S.range) return toast("Drag on the ruler to pick the punch range first."); punchOn = !punchOn; this.classList.toggle("on", punchOn); save(); toast(punchOn ? "Punch on: ● records only inside the range (starts 1 bar before)." : "Punch off."); };
  $("click").onclick = function () { clickOn = !clickOn; this.classList.toggle("on", clickOn); save(); };
  $("undo").onclick = undo; $("redo").onclick = redo;
  $("zin").onclick = function () { zoomTo(pxs * 1.5); }; $("zout").onclick = function () { zoomTo(pxs / 1.5); };
  $("bpm").onchange = function () { var v = Math.max(40, Math.min(240, +this.value || 90)); edit(); S.bpm = v; this.value = v; rebuildAll(); render(); };
  $("addtrk").onclick = function () { var n = S.tracks.filter(function (t) { return t.kind === "audio"; }).length; if (n >= MAXT) return; edit(); var t = newTrack("Track " + (n + 1)); t.ch = n % 2 ? "R" : "L"; S.tracks.push(t); render(); };
  $("setup").onclick = function () { ac(); latHint(); $("lat").value = latMs; $("cal-trk").innerHTML = S.tracks.filter(function (t) { return t.kind === "audio"; }).map(function (t) { return '<option value="' + t.id + '">' + esc(t.name) + "</option>"; }).join(""); renderDevs(); $("sh-setup").hidden = false; };
  $("perm").onclick = function () { openDev("").then(function () { return listDevs(); }).then(function () { renderDevs(); render(); toast(devices.length + " input" + (devices.length === 1 ? "" : "s") + " found."); }).catch(function (e) { toast("Mic blocked: " + (e && e.message || e), 4500); }); };
  $("lat").onchange = function () { setLat(+this.value || 0); };
  [["lat-m10", -10], ["lat-m1", -1], ["lat-p1", 1], ["lat-p10", 10]].forEach(function (p) { $(p[0]).onclick = function () { setLat(latMs + p[1]); }; });
  $("cal-loop").onclick = function () { calibrate(false); }; $("cal-clap").onclick = function () { calibrate(true); };
  function openBeat() { $("sh-beat").hidden = false; $("bb-out").textContent = ""; renderVault(); }
  $("beat").onclick = openBeat;
  $("bb-now").onclick = bounceNow;
  $("bb-file").onclick = function () { $("bb-input").click(); };
  $("bb-input").onchange = function () { var f = this.files[0]; if (!f) return; f.arrayBuffer().then(decode).then(function (buf) { placeBeat(buf, f.name.replace(/\.[^.]+$/, ""), bpmOf(f.name)); $("sh-beat").hidden = true; }).catch(function () { toast("Could not read that file. Try WAV or MP3."); }); this.value = ""; };
  // clip bar
  function selC() { return S.sel && clipById(S.sel); }
  $("cb-split").onclick = function () { var c = selC(); if (!c) return; var p = posNow(); if (p <= c.start || p >= clipEnd(c)) return toast("Move the playhead inside the clip first."); edit(); var r = splitClip(trackOf(c.id), c, p); if (r) S.sel = r.id; render(); };
  var fadeEdit = false;
  function fade(k, v) { var c = selC(); if (!c) return; if (!fadeEdit) { edit(); fadeEdit = true; } c[k] = +v * c.dur * c.reps / 2; var n = clipEl(c), o = document.querySelector('.clip[data-c="' + c.id + '"]'); if (o) o.replaceWith(n); clipBar(); }
  $("cb-fi").oninput = function () { fade("fi", this.value); }; $("cb-fo").oninput = function () { fade("fo", this.value); };
  $("cb-fi").onchange = $("cb-fo").onchange = function () { fadeEdit = false; render(); };
  $("cb-lp").onclick = function () { var c = selC(); if (!c || c.reps >= 64) return; edit(); c.reps++; render(); };
  $("cb-lm").onclick = function () { var c = selC(); if (!c || c.reps <= 1) return; edit(); c.reps--; c.fi = Math.min(c.fi, c.dur * c.reps / 2); c.fo = Math.min(c.fo, c.dur * c.reps / 2); render(); };
  $("cb-del").onclick = function () { var c = selC(); if (!c) return; edit(); var t = trackOf(c.id); t.clips.splice(t.clips.indexOf(c), 1); S.sel = null; render(); };
  $("cb-x").onclick = function () { S.sel = null; render(); };
  document.addEventListener("keydown", function (e) {
    if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    else if (e.key === " ") { e.preventDefault(); $("play").click(); }
  });
  window.addEventListener("resize", function () { render(); });
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(function () {});

  /* ---------- plugins (data-only, see mt-plugins.js) ---------- */
  var PL = window.IPBPlugins, LIB = {}, MAXINS = 4, pick = null, edDef = null;
  PL.BUILTIN.forEach(function (d) { LIB[d.id] = d; });
  function rebuildFx(t) {
    if (!ctx || !t.fxIn) return;
    (t.fx || []).forEach(function (x) { x.dispose(); }); t.fx = []; try { t.fxIn.disconnect(); } catch (e) {}
    var at = t.fxIn; (t.ins || []).forEach(function (s) {
      var d = s && LIB[s.pid]; if (!d || !s.on) { if (s) Object.defineProperty(s, "inst", { value: null, writable: true, configurable: true, enumerable: false }); return; }
      var x = PL.build(ctx, d, s.k, S.bpm); at.connect(x.inp); at = x.out; t.fx.push(x); Object.defineProperty(s, "inst", { value: x, writable: true, configurable: true, enumerable: false });
    });
    at.connect(t.gain);
  }
  function rebuildAll() { S.tracks.forEach(rebuildFx); }
  function monitor(t) { if (!t.tap) return; try { t.tap.g.disconnect(t.fxIn); } catch (e) {} if (t.mon && t.fxIn) t.tap.g.connect(t.fxIn); }
  function knobUI(k, val, onv) {
    var w = document.createElement("label"), r = document.createElement("input"), o = document.createElement("output"); w.className = "knob";
    r.type = "range"; r.min = 0; r.max = 1000; var L = k.log && k.min > 0;
    function toS(v) { return L ? Math.log(v / k.min) / Math.log(k.max / k.min) * 1000 : (v - k.min) / (k.max - k.min) * 1000; }
    function toV(s) { return L ? k.min * Math.pow(k.max / k.min, s / 1000) : k.min + (k.max - k.min) * s / 1000; }
    function show(v) { o.textContent = (Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 100) / 100) + " " + (k.unit || ""); }
    r.value = toS(val); show(val);
    r.oninput = function () { var v = toV(+r.value); show(v); onv(v, false); }; r.onchange = function () { onv(toV(+r.value), true); };
    w.appendChild(document.createTextNode(k.label)); w.appendChild(r); w.appendChild(o); return w;
  }
  function renderIns(t) {
    var box = $("tk-ins"); box.innerHTML = ""; t.ins = t.ins || [];
    for (var i = 0; i < MAXINS; i++) (function (i) {
      var s = t.ins[i], d = s && LIB[s.pid], div = document.createElement("div"); div.className = "slot";
      if (!s) { var b = document.createElement("button"); b.className = "btn"; b.textContent = "＋ Insert " + (i + 1); b.onclick = function () { pick = { t: t, i: i }; openPlugins(); }; div.appendChild(b); box.appendChild(div); return; }
      var h = document.createElement("div"); h.className = "slothd"; var nm = document.createElement("b"); nm.textContent = (i + 1) + ". " + (d ? d.name : "Missing plugin"); h.appendChild(nm);
      [["on", s.on ? "On" : "Bypassed"], ["up", "↑"], ["dn", "↓"], ["rm", "✕"]].forEach(function (a) {
        var b = document.createElement("button"); b.className = "btn" + (a[0] === "on" && s.on ? " on" : ""); b.textContent = a[1];
        b.onclick = function () {
          edit();
          if (a[0] === "on") s.on = !s.on;
          else if (a[0] === "rm") t.ins.splice(i, 1);
          else { var j = a[0] === "up" ? i - 1 : i + 1; if (j < 0 || j >= t.ins.length) return; var x = t.ins[j]; t.ins[j] = s; t.ins[i] = x; }
          t.ins = t.ins.filter(Boolean); rebuildFx(t); renderIns(t); save();
        };
        h.appendChild(b);
      });
      div.appendChild(h);
      if (d) { var kd = document.createElement("div"); kd.className = "knobs"; d.knobs.forEach(function (k) { var v = s.k[k.id] != null ? s.k[k.id] : k.value; kd.appendChild(knobUI(k, v, function (v, fin) { s.k[k.id] = v; if (s.inst) s.inst.set(k.id, v); if (fin) save(); })); }); div.appendChild(kd); }
      box.appendChild(div);
    })(i);
    $("tk-mon").classList.toggle("on", !!t.mon); $("tk-mon").textContent = t.mon ? "🎧 Monitoring through inserts" : "🎧 Monitor off";
  }
  function slug(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30); }
  function addUser(d, quiet) { d = PL.validate(d); d.id = "u:" + slug(d.name) + "-" + Date.now().toString(36); LIB[d.id] = d; return tx(["plugins"], "readwrite", function (t) { t.objectStore("plugins").put(d, d.id); }).then(function () { if (!quiet) toast("Plugin saved: " + d.name); return d; }); }
  function loadUser() { return tx(["plugins"], "readonly", function (t) { var o = { v: [] }, c = t.objectStore("plugins").openCursor(); c.onsuccess = function () { var r = c.result; if (r) { try { var d = PL.validate(r.value); d.id = r.key; LIB[d.id] = d; } catch (e) {} r.continue(); } }; return o; }).catch(function () {}); }
  function exportDef(d) { var c = JSON.parse(JSON.stringify(d)); delete c.id; var url = URL.createObjectURL(new Blob([JSON.stringify(c, null, 2)], { type: "application/json" })), a = document.createElement("a"); a.href = url; a.download = slug(d.name) + ".ipbplug.json"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 5000); }
  function openPlugins() {
    var L = $("pl-list"); L.innerHTML = ""; $("pl-ttl").textContent = pick ? "Pick a plugin for insert " + (pick.i + 1) : "Plugins";
    var ids = Object.keys(LIB), cats = {}; ids.forEach(function (id) { var d = LIB[id], c = id[0] === "u" ? "★ Yours" : d.category; (cats[c] = cats[c] || []).push(d); });
    Object.keys(cats).sort(function (a, b) { return a[0] === "★" ? -1 : b[0] === "★" ? 1 : a < b ? -1 : 1; }).forEach(function (c) {
      var h = document.createElement("li"); h.className = "cat"; h.textContent = c; L.appendChild(h);
      cats[c].forEach(function (d) {
        var li = document.createElement("li"), sp = document.createElement("span"); sp.innerHTML = "<b></b><small></small>"; sp.firstChild.textContent = d.name; sp.lastChild.textContent = " " + d.about; li.appendChild(sp);
        function btn(txt, fn) { var b = document.createElement("button"); b.className = "btn"; b.textContent = txt; b.onclick = fn; li.appendChild(b); }
        if (pick) btn("Insert", function () { var t = pick.t; edit(); t.ins = t.ins || []; t.ins.splice(Math.min(pick.i, t.ins.length), 0, { pid: d.id, on: true, k: {} }); t.ins = t.ins.slice(0, MAXINS); rebuildFx(t); pick = null; $("sh-plug").hidden = true; renderIns(t); save(); });
        btn("✎ Copy", function () { var c = JSON.parse(JSON.stringify(d)); delete c.id; c.name = (d.name + " copy").slice(0, 40); openEditor(c); });
        btn("⬇", function () { exportDef(d); });
        if (d.id[0] === "u") btn("🗑", function () { if (!confirm("Delete plugin \"" + d.name + "\"? Tracks using it go silent-through (bypassed).")) return; delete LIB[d.id]; tx(["plugins"], "readwrite", function (t) { t.objectStore("plugins").delete(d.id); }).then(function () { rebuildAll(); openPlugins(); }); });
        L.appendChild(li);
      });
    });
    $("sh-plug").hidden = false;
  }
  /* simple editor: nodes in series (in → 1 → 2 → … → out); Advanced JSON for any graph */
  function serialWires(d) { var ids = ["in"].concat(d.nodes.map(function (n) { return n.id; })).concat(["out"]), w = []; for (var i = 0; i < ids.length - 1; i++) w.push(ids[i] + ">" + ids[i + 1]); return w; }
  function isSerial(d) { return JSON.stringify(d.wires) === JSON.stringify(serialWires(d)); }
  var DEFP = { compressor: { threshold: -20, ratio: 4, knee: 6, attack: 0.01, release: 0.15 }, biquad: { type: "peaking", frequency: 1000, Q: 1, gain: 0 }, gain: { gain: 1 }, panner: { pan: 0 }, delay: { delayTime: 0.25 }, shaper: { curve: "tape", amount: 30 }, convolver: { kind: "room", seconds: 1 } };
  function openEditor(d) {
    edDef = d || { format: "ipbplug", v: 1, name: "My plugin", category: "Custom", about: "", nodes: [], wires: [], knobs: [] };
    edSer = !edDef.nodes.length || isSerial(edDef); $("pe-name").value = edDef.name; $("pe-json").value = JSON.stringify(edDef, null, 2); renderEditor(); $("sh-ped").hidden = false;
  }
  function renderEditor() {
    var box = $("pe-nodes"), ser = edSer; box.innerHTML = "";
    $("pe-simple").hidden = !ser; $("pe-note").textContent = ser ? "Signal flows top to bottom. Tick ⦿ to give a setting a knob on the track." : "This plugin has a custom wiring graph: edit it in Advanced JSON below.";
    if (!ser) return;
    edDef.nodes.forEach(function (n, i) {
      var div = document.createElement("div"), h = document.createElement("div"); div.className = "slot"; h.className = "slothd"; h.innerHTML = "<b></b>"; h.firstChild.textContent = (i + 1) + ". " + n.type + " (" + n.id + ")";
      [["↑", -1], ["↓", 1], ["✕", 0]].forEach(function (a) { var b = document.createElement("button"); b.className = "btn"; b.textContent = a[0]; b.onclick = function () { if (!a[1]) { edDef.nodes.splice(i, 1); edDef.knobs = edDef.knobs.filter(function (k) { return k.to.every(function (t) { return t.n !== n.id; }); }); } else { var j = i + a[1]; if (j < 0 || j >= edDef.nodes.length) return; edDef.nodes[i] = edDef.nodes[j]; edDef.nodes[j] = n; } syncEd(); }; h.appendChild(b); });
      div.appendChild(h);
      var g = document.createElement("div"); g.className = "knobs";
      Object.keys(PL.ENUMS[n.type] || {}).forEach(function (k) { var l = document.createElement("label"), s = document.createElement("select"); l.className = "knob"; l.textContent = k; PL.ENUMS[n.type][k].forEach(function (v) { var o = document.createElement("option"); o.textContent = v; s.appendChild(o); }); s.value = n.params[k] || PL.ENUMS[n.type][k][0]; s.onchange = function () { n.params[k] = s.value; syncEd(); }; l.appendChild(s); g.appendChild(l); });
      Object.keys(PL.RANGES[n.type]).forEach(function (k) {
        var r = PL.RANGES[n.type][k], l = document.createElement("label"), inp = document.createElement("input"), cb = document.createElement("button"), kid = n.id + "_" + k, has = edDef.knobs.some(function (q) { return q.id === kid; });
        l.className = "knob"; l.textContent = k + " (" + r[0] + "…" + r[1] + ")"; inp.type = "number"; inp.step = "any"; inp.value = n.params[k] != null ? n.params[k] : "";
        inp.onchange = function () { if (inp.value === "") delete n.params[k]; else n.params[k] = Math.max(r[0], Math.min(r[1], +inp.value)); syncEd(); };
        cb.className = "btn" + (has ? " on" : ""); cb.textContent = "⦿"; cb.title = "Expose as a knob";
        cb.onclick = function () { if (has) edDef.knobs = edDef.knobs.filter(function (q) { return q.id !== kid; }); else { var lo = r[0], hi = r[1]; if (k === "frequency") { lo = 20; hi = 20000; } if (k === "threshold" && n.type === "compressor") lo = -60; edDef.knobs.push({ id: kid, label: (n.type + " " + k).slice(0, 24), min: lo, max: hi, value: n.params[k] != null ? n.params[k] : lo, log: k === "frequency", to: [{ n: n.id, p: k }] }); } syncEd(); };
        l.appendChild(inp); if ((PL.LIVE[n.type] || []).concat(PL.KNOBP[n.type] || []).indexOf(k) >= 0) l.appendChild(cb); g.appendChild(l);
      });
      div.appendChild(g); box.appendChild(div);
    });
  }
  var edSer = true;
  function syncEd() { edDef.name = $("pe-name").value.trim() || "My plugin"; if (edSer) edDef.wires = serialWires(edDef); $("pe-json").value = JSON.stringify(edDef, null, 2); renderEditor(); }
  $("pe-add").onclick = function () { var ty = $("pe-type").value, n = 1; while (edDef.nodes.some(function (x) { return x.id === ty + n; })) n++; if (!edSer) return toast("Custom graph: add nodes in Advanced JSON."); edDef.nodes.push({ id: ty + n, type: ty, params: JSON.parse(JSON.stringify(DEFP[ty] || {})) }); syncEd(); };
  $("pe-name").onchange = function () { edDef.name = this.value.trim() || "My plugin"; $("pe-json").value = JSON.stringify(edDef, null, 2); };
  $("pe-apply").onclick = function () { try { var d = PL.validate($("pe-json").value); edDef = d; edSer = !d.nodes.length || isSerial(d); $("pe-name").value = d.name; renderEditor(); toast("JSON OK"); } catch (e) { toast("Not valid: " + e.message, 6000); } };
  function edValid() { try { var d = PL.validate($("pe-json").value); if (d.name !== ($("pe-name").value.trim() || d.name)) d.name = $("pe-name").value.trim().slice(0, 40); return d; } catch (e) { toast("Not valid: " + e.message, 6000); return null; } }
  $("pe-save").onclick = function () { var d = edValid(); if (!d) return; addUser(d).then(function () { $("sh-ped").hidden = true; openPlugins(); }).catch(function (e) { toast("Save failed: " + e.message); }); };
  $("pe-export").onclick = function () { var d = edValid(); if (d) exportDef(d); };
  $("pe-test").onclick = function () { var d = edValid(); if (!d) return; ac(); try { var x = PL.build(ctx, d, {}, S.bpm); x.dispose(); toast("Builds OK ✓"); } catch (e) { toast("Build error: " + e.message, 6000); } };
  $("plugbtn").onclick = function () { pick = null; openPlugins(); };
  $("pl-new").onclick = function () { openEditor(null); };
  $("pl-up").onclick = function () { $("pl-file").click(); };
  $("pl-file").onchange = function () { var f = this.files[0]; this.value = ""; if (!f) return; if (f.size > 65536) return toast("Too big: plugin files are max 64 KB."); f.text().then(function (s) { return addUser(PL.validate(s)); }).then(function () { openPlugins(); }).catch(function (e) { toast("Rejected: " + (e && e.message || e), 7000); }); };
  $("tk-mon").onclick = function () { if (!curT || curT.kind === "beat") return; curT.mon = !curT.mon; if (curT.mon) { ac(); tapFor(curT).then(function () { monitor(curT); }).catch(function (e) { curT.mon = false; toast("Mic error: " + e.message); renderIns(curT); }); toast("Use headphones while monitoring. Recording stays raw."); } else monitor(curT); renderIns(curT); };
  /* ---------- persistence (IndexedDB) ---------- */
  var DBN = "ipb_multitrack", db = null, saveT = null, booting = true, savedBufs = {}, booted;
  function idb() {
    if (db) return Promise.resolve(db);
    return new Promise(function (res, rej) {
      var r = indexedDB.open(DBN, 2);
      r.onupgradeneeded = function () { var d = r.result; ["meta", "bufs", "sessions", "plugins"].forEach(function (n) { if (!d.objectStoreNames.contains(n)) d.createObjectStore(n); }); };
      r.onsuccess = function () { db = r.result; res(db); }; r.onerror = function () { rej(r.error); };
    });
  }
  function tx(stores, mode, fn) { return idb().then(function (d) { return new Promise(function (res, rej) { var t = d.transaction(stores, mode), out = fn(t); t.oncomplete = function () { res(out && out.v); }; t.onerror = t.onabort = function () { rej(t.error); }; }); }); }
  function rawOf(id) { var b = bufs[id].buf, ch = []; for (var i = 0; i < b.numberOfChannels; i++) ch.push(b.getChannelData(i).slice()); return { sr: b.sampleRate, ch: ch }; }
  function bufFrom(r) { var b = new AudioBuffer({ length: r.ch[0].length, numberOfChannels: r.ch.length, sampleRate: r.sr }); r.ch.forEach(function (d, i) { b.copyToChannel(d, i); }); return b; }
  function usedBufs() { var u = {}; S.tracks.forEach(function (t) { t.clips.forEach(function (c) { u[c.buf] = 1; }); t.takes.forEach(function (k) { u[k.buf] = 1; }); }); return Object.keys(u).filter(function (k) { return bufs[k]; }); }
  function state() {
    var o = JSON.parse(snapshot()); o.v = 1; o.nid = nid; o.beatName = S.beatName || ""; o.range = S.range; o.playhead = play ? posNow() : S.playhead;
    o.pxs = pxs; o.scroll = $("tl").scrollLeft; o.loopOn = loopOn; o.punchOn = punchOn; o.clickOn = clickOn; o.snap = $("snap").value; o.latMs = latMs; o.bufs = usedBufs(); o.saved = Date.now(); o.mvol = S.mvol == null ? 1 : S.mvol; o.plugs = []; S.tracks.forEach(function (t) { (t.ins || []).forEach(function (s) { if (s.pid[0] === "u" && LIB[s.pid] && !o.plugs.some(function (q) { return q.id === s.pid; })) o.plugs.push(LIB[s.pid]); }); });
    return o;
  }
  // No auto-save (Emmanuel, Oct 22): the live session is not written to IndexedDB; only 💾 Save & exit keeps it (Sessions list).
  function save() { }
  function saveNow() { return Promise.resolve(); }
  function saveNowOld() {
    if (booting) return Promise.resolve(); clearTimeout(saveT); var st = state();
    return tx(["meta", "bufs"], "readwrite", function (t) {
      var bs = t.objectStore("bufs");
      st.bufs.forEach(function (id) { if (!savedBufs[id]) { bs.put(rawOf(id), id); savedBufs[id] = 1; } });
      Object.keys(savedBufs).forEach(function (id) { if (st.bufs.indexOf(id) < 0) { bs.delete(id); delete savedBufs[id]; } });
      t.objectStore("meta").put(st, "active");
    }).catch(function (e) { toast("Could not autosave: " + (e && e.message || e) + " (storage full?)", 5000); });
  }
  function apply(st, raws) {
    (st.plugs || []).forEach(function (d) { try { var v = PL.validate(d); v.id = d.id; if (!LIB[v.id]) { LIB[v.id] = v; tx(["plugins"], "readwrite", function (t) { t.objectStore("plugins").put(v, v.id); }); } } catch (e) {} });
    ac(); Object.keys(raws).forEach(function (id) { var b = bufFrom(raws[id]); var nid0 = nid; var nb = addBuf(b); nid = nid0; if (nb !== id) { bufs[id] = bufs[nb]; delete bufs[nb]; } });
    S.tracks.forEach(function (t) { if (t.gain) t.gain.disconnect(); });
    S.tracks = []; restore(JSON.stringify(st)); nid = Math.max(nid, st.nid || 1);
    S.mvol = st.mvol == null ? 1 : st.mvol; S.beatName = st.beatName; S.range = st.range || null; S.playhead = st.playhead || 0; S.sel = null;
    loopOn = !!st.loopOn && !!S.range; punchOn = !!st.punchOn && !!S.range; clickOn = !!st.clickOn;
    $("loop").classList.toggle("on", loopOn); $("punch").classList.toggle("on", punchOn); $("click").classList.toggle("on", clickOn);
    if (st.snap != null) $("snap").value = st.snap; if (st.latMs != null) setLat(st.latMs);
    pxs = st.pxs || pxs; S.tracks.forEach(function (t) { t.arm = false; t.mon = false; }); undoS = []; redoS = []; applyMS(); render(); $("tl").scrollLeft = st.scroll || 0; drawPH(S.playhead);
  }
  function loadActive() {
    return tx(["meta", "bufs"], "readonly", function (t) {
      var out = { v: null }, q = t.objectStore("meta").get("active");
      q.onsuccess = function () { var st = q.result; if (!st) return; out.v = { st: st, raws: {} }; (st.bufs || []).forEach(function (id) { var g = t.objectStore("bufs").get(id); g.onsuccess = function () { if (g.result) out.v.raws[id] = g.result; }; }); };
      return out;
    });
  }
  function fresh() { S.tracks.forEach(function (t) { if (t.gain) t.gain.disconnect(); }); Object.keys(bufs).forEach(function (k) { delete bufs[k]; }); S.tracks = [newTrack("Beat", "beat"), newTrack("Mic 1"), newTrack("Mic 2")]; S.tracks[2].ch = "R"; S.bpm = 90; S.range = null; S.sel = null; S.playhead = 0; S.beatName = ""; S.mvol = 1; undoS = []; redoS = []; $("bpm").value = S.bpm; render(); }
  function clearActive() { savedBufs = {}; return tx(["meta", "bufs"], "readwrite", function (t) { t.objectStore("meta").delete("active"); t.objectStore("bufs").clear(); }); }
  function saveExit() {
    if (play) stop(); var nm = prompt("Name this session:", (S.beatName || "Session") + " · " + new Date().toLocaleDateString()); if (nm === null) return;
    booting = true; var st = state(), raws = {}; st.bufs.forEach(function (id) { raws[id] = rawOf(id); });
    var id = "s" + Date.now();
    tx(["sessions"], "readwrite", function (t) { t.objectStore("sessions").put({ id: id, name: nm || "Session", saved: Date.now(), st: st, raws: raws }, id); })
      .then(clearActive).then(function () { location.href = "./?hub=1"; })
      .catch(function (e) { booting = false; toast("Save failed: " + (e && e.message || e) + ". Session still kept.", 6000); });
  }
  function listSessions() { return tx(["sessions"], "readonly", function (t) { var o = { v: [] }, c = t.objectStore("sessions").openCursor(); c.onsuccess = function () { var r = c.result; if (r) { o.v.push({ id: r.key, name: r.value.name, saved: r.value.saved }); r.continue(); } }; return o; }); }
  function renderSessions() {
    listSessions().then(function (L) {
      var ul = $("ss-list"); ul.innerHTML = L.length ? "" : "<li>No saved sessions yet. Use 💾 Save &amp; exit.</li>";
      L.sort(function (a, b) { return b.saved - a.saved; }).forEach(function (s) {
        var li = document.createElement("li"), o = document.createElement("button"), d = document.createElement("button");
        li.innerHTML = "<span></span>"; li.firstChild.textContent = s.name + " · " + new Date(s.saved).toLocaleString();
        o.className = d.className = "btn"; o.textContent = "Open"; d.textContent = "🗑";
        o.onclick = function () { if (projEnd() > 0 && !confirm("Open this session? Your current work will be replaced (save it first with Save & exit).")) return; openSession(s.id); };
        d.onclick = function () { if (!confirm("Delete saved session \"" + s.name + "\"?")) return; tx(["sessions"], "readwrite", function (t) { t.objectStore("sessions").delete(s.id); }).then(renderSessions); };
        li.appendChild(o); li.appendChild(d); ul.appendChild(li);
      });
    });
  }
  function openSession(id) {
    if (play) stop();
    tx(["sessions"], "readonly", function (t) { var o = { v: null }, q = t.objectStore("sessions").get(id); q.onsuccess = function () { o.v = q.result; }; return o; }).then(function (s) {
      if (!s) return; booting = true; Object.keys(bufs).forEach(function (k) { delete bufs[k]; });
      return clearActive().then(function () { apply(s.st, s.raws); booting = false; return saveNow(); }).then(function () { $("sh-sess").hidden = true; toast("Opened: " + s.name); });
    }).catch(function (e) { booting = false; toast("Could not open: " + (e && e.message || e)); });
  }
  $("saveexit").onclick = saveExit;
  $("sessions").onclick = function () { renderSessions(); $("sh-sess").hidden = false; };
  $("newsess").onclick = function () { if (!confirm("Start a new empty session? Everything not saved with Save & exit will be lost.")) return; if (play) stop(); booting = true; clearActive().then(function () { fresh(); booting = false; saveNow(); $("sh-sess").hidden = true; toast("New session"); }); };
  $("snap").addEventListener("change", function () { save(); });
  window.addEventListener("beforeunload", function (e) { if (booting || play || !dirty || !projEnd()) return; e.preventDefault(); e.returnValue = ""; }); // unsaved takes: browser asks once
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});

  fresh(); requestAnimationFrame(meters);
  booted = loadUser().then(function () { return clearActive().catch(function () {}); }) // each open starts fresh; old autosave wiped
  .catch(function () {}).then(function () { booting = false; }).then(importInbox);
  /* Inbox: audio sent from other apps (Lyrics Lab, My Freestyles) lands on the first empty audio track at 0:00 */
  function importInbox() {
    if (!window.indexedDB) return;
    var r; try { r = indexedDB.open("ipb_inbox", 1); } catch (e) { return; }
    r.onupgradeneeded = function () { r.result.createObjectStore("items", { keyPath: "id" }); };
    r.onsuccess = function () {
      var d = r.result, q = d.transaction("items").objectStore("items").getAll();
      q.onsuccess = function () {
        var items = (q.result || []).filter(function (x) { return x.to === "multitrack" && x.blob; }); if (!items.length) { d.close(); return; }
        items.reduce(function (pr, it) {
          return pr.then(function () { return it.blob.arrayBuffer(); }).then(decode).then(function (buf) {
            var t = S.tracks.filter(function (x) { return x.kind !== "beat" && !x.clips.length; })[0] || S.tracks.filter(function (x) { return x.kind !== "beat"; })[0]; if (!t) return;
            edit(); var id = addBuf(buf), c = mkClip(id, 0, 0, buf.duration, it.name || "Imported");
            carve(t, 0, buf.duration); t.clips.push(c); t.takes.push({ buf: id, name: c.name, at: 0, dur: buf.duration });
            render(); toast("Added “" + (it.name || "audio") + "” to " + t.name);
          }).catch(function () { toast("Could not import " + (it.name || "audio")); }).then(function () {
            return new Promise(function (res) { var x = d.transaction("items", "readwrite"); x.objectStore("items").delete(it.id); x.oncomplete = res; x.onerror = res; });
          });
        }, Promise.resolve()).then(function () { d.close(); });
      };
    };
  }
  window.IPBMultitrack = { S: S, bufs: bufs, undo: undo, redo: redo, splitClip: splitClip, render: render, start: start, stop: stop, recBtn: recBtn, setLat: setLat, posNow: posNow, placeBeat: placeBeat, saveNow: function () { return saveNow(); }, ready: function () { return booted; }, zoomTo: zoomTo, ctx: function () { return ctx; }, master: function () { return master; }, ac: ac, applyMS: applyMS, openTrk: openTrk, save: save, renderIns: renderIns };
})();
