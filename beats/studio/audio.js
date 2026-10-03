/* Island Pin Beats Studio: audio engine (track FX chains, mixer, transport, loop, metronome, mic recording, offline mixdown) */
(function () {
  "use strict";
  var S = window.IPBS, db = S.db;
  var E = { ctx: null, P: null, playing: false, recording: false, t0: 0, ctx0: 0, tracks: {}, master: null, passes: [], timer: null, metroNext: 0,
    onTick: null, onStop: null, rec: null, workletReady: null, lastPos: 0 };

  var DIV = { "1/4": 1, "1/8": 0.5, "1/8d": 0.75, "1/16": 0.25, "1/4d": 1.5, "1/2": 2 };
  function impulse(c, secs) {
    var n = Math.round(c.sampleRate * secs), b = c.createBuffer(2, n, c.sampleRate);
    for (var ch = 0; ch < 2; ch++) {
      var d = b.getChannelData(ch), seed = 1234 + ch * 77;
      for (var i = 0; i < n; i++) { seed = (seed * 16807) % 2147483647; var t = i / n; d[i] = ((seed / 2147483647) * 2 - 1) * Math.pow(1 - t, 3.2) * (i < 64 ? i / 64 : 1); }
    }
    return b;
  }
  /* one channel strip: in → gate → EQ → comp → makeup → (dry | delay | reverb) → pan → fader → meter → out */
  function makeStrip(c, out, useGate) {
    var T = {};
    T.input = c.createGain();
    T.gate = useGate ? new AudioWorkletNode(c, "ipb-gate", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] }) : c.createGain();
    T.low = c.createBiquadFilter(); T.low.type = "lowshelf"; T.low.frequency.value = 120;
    T.mid = c.createBiquadFilter(); T.mid.type = "peaking"; T.mid.Q.value = 0.9;
    T.high = c.createBiquadFilter(); T.high.type = "highshelf"; T.high.frequency.value = 8000;
    T.comp = c.createDynamicsCompressor(); T.comp.knee.value = 6;
    T.makeup = c.createGain();
    T.post = c.createGain();
    T.dly = c.createDelay(4); T.fb = c.createGain(); T.dlyMix = c.createGain(); T.dlyLp = c.createBiquadFilter(); T.dlyLp.type = "lowpass"; T.dlyLp.frequency.value = 5000;
    T.rev = c.createConvolver(); T.revMix = c.createGain(); T.revSize = 0;
    T.pan = c.createStereoPanner();
    T.fader = c.createGain();
    T.meter = c.createAnalyser(); T.meter.fftSize = 1024;
    T.input.connect(T.gate); T.gate.connect(T.low); T.low.connect(T.mid); T.mid.connect(T.high); T.high.connect(T.comp); T.comp.connect(T.makeup); T.makeup.connect(T.post);
    T.post.connect(T.pan);
    T.post.connect(T.dly); T.dly.connect(T.dlyLp); T.dlyLp.connect(T.fb); T.fb.connect(T.dly); T.dlyLp.connect(T.dlyMix); T.dlyMix.connect(T.pan);
    T.post.connect(T.rev); T.rev.connect(T.revMix); T.revMix.connect(T.pan);
    T.pan.connect(T.fader); T.fader.connect(T.meter); T.fader.connect(out);
    return T;
  }
  function applyFx(c, T, tr, P, solo) {
    var f = tr.fx, t = c.currentTime;
    function set(p, v) { if (c instanceof OfflineAudioContext) p.value = v; else p.setTargetAtTime(v, t, 0.015); }
    if (T.gate.parameters) { T.gate.parameters.get("on").value = f.gate.on ? 1 : 0; T.gate.parameters.get("thr").value = f.gate.thr; T.gate.parameters.get("rel").value = f.gate.rel; }
    set(T.low.gain, f.eq.on ? f.eq.low : 0); set(T.mid.gain, f.eq.on ? f.eq.mid : 0); T.mid.frequency.value = f.eq.midF; set(T.high.gain, f.eq.on ? f.eq.high : 0);
    if (f.comp.on) { T.comp.threshold.value = f.comp.thr; T.comp.ratio.value = f.comp.ratio; T.comp.attack.value = f.comp.atk; T.comp.release.value = f.comp.rel; set(T.makeup.gain, db(f.comp.makeup)); }
    else { T.comp.threshold.value = 0; T.comp.ratio.value = 1; set(T.makeup.gain, 1); }
    var beat = 60 / P.bpm;
    T.dly.delayTime.value = Math.min(3.9, beat * (DIV[f.delay.div] || 0.75));
    set(T.fb.gain, f.delay.on ? Math.min(0.9, f.delay.fb) : 0); set(T.dlyMix.gain, f.delay.on ? f.delay.mix : 0);
    if (f.reverb.on && T.revSize !== f.reverb.size) { T.rev.buffer = impulse(c, f.reverb.size); T.revSize = f.reverb.size; }
    set(T.revMix.gain, f.reverb.on ? f.reverb.mix : 0);
    set(T.pan.pan, tr.pan);
    var audible = !tr.mute && (!solo || tr.solo);
    set(T.fader.gain, audible ? db(tr.vol) : 0);
  }
  function makeMaster(c) {
    var M = { bus: c.createGain(), lim: c.createDynamicsCompressor(), trim: c.createGain(), out: c.createGain(), meter: c.createAnalyser() };
    M.meter.fftSize = 2048;
    M.lim.knee.value = 0; M.lim.attack.value = 0.002; M.lim.release.value = 0.08;
    M.bus.connect(M.lim); M.lim.connect(M.trim); M.trim.connect(M.out); M.out.connect(M.meter);
    return M;
  }
  function applyMaster(c, M, P) {
    var m = P.master;
    if (m.limiter) { M.lim.threshold.value = m.ceiling - 3; M.lim.ratio.value = 20; M.trim.gain.value = db(-1.2); }
    else { M.lim.threshold.value = 0; M.lim.ratio.value = 1; M.trim.gain.value = 1; }
    M.out.gain.value = db(m.vol);
  }
  function anySolo(P) { return P.tracks.some(function (t) { return t.solo; }); }

  function ensure() {
    if (E.ctx) { if (E.ctx.state === "suspended") E.ctx.resume(); return E.workletReady; }
    var AC = window.AudioContext || window.webkitAudioContext;
    E.ctx = new AC({ latencyHint: "interactive", sampleRate: S.SR });
    E.master = makeMaster(E.ctx);
    E.master.meter.connect(E.ctx.destination);
    E.workletReady = E.ctx.audioWorklet.addModule("worklets.js").then(function () { E.hasWorklet = true; }).catch(function (e) { console.warn("worklets unavailable", e); E.hasWorklet = false; });
    return E.workletReady;
  }
  function syncGraph(P) {
    E.P = P;
    if (!E.ctx) return;
    var c = E.ctx, solo = anySolo(P), seen = {};
    P.tracks.forEach(function (tr) {
      if (!E.tracks[tr.id]) E.tracks[tr.id] = makeStrip(c, E.master.bus, E.hasWorklet);
      applyFx(c, E.tracks[tr.id], tr, P, solo);
      seen[tr.id] = 1;
    });
    Object.keys(E.tracks).forEach(function (id) { if (!seen[id]) { try { E.tracks[id].fader.disconnect(); } catch (e) { /* gone */ } delete E.tracks[id]; } });
    applyMaster(c, E.master, P);
  }

  /* ---- clip scheduling ---- */
  function clipSource(c, clip, dest, when, from, until, reg) {
    // plays the part of `clip` that lies in timeline [from, until) starting at context time `when`
    var s = S.sources[clip.src]; if (!s) return;
    var cs = clip.start, ce = clip.start + clip.dur;
    var a = Math.max(cs, from), b = Math.min(ce, until);
    if (b - a <= 0.0005) return;
    var src = c.createBufferSource(); src.buffer = s.buf;
    var g = c.createGain(), gv = db(clip.gain || 0), at = when + (a - from), off = clip.offset + (a - cs);
    var fi = Math.min(clip.fadeIn || 0, clip.dur), fo = Math.min(clip.fadeOut || 0, clip.dur);
    // fades as gain automation in timeline time, mapped to context time
    function lvl(tl) { var v = gv; if (fi > 0 && tl < cs + fi) v *= Math.max(0, (tl - cs) / fi); if (fo > 0 && tl > ce - fo) v *= Math.max(0, (ce - tl) / fo); return v; }
    g.gain.setValueAtTime(lvl(a), at);
    if (fi > 0 && a < cs + fi) g.gain.linearRampToValueAtTime(lvl(Math.min(b, cs + fi)), at + Math.min(b, cs + fi) - a);
    if (fo > 0 && b > ce - fo) { var fs = Math.max(a, ce - fo); g.gain.setValueAtTime(lvl(fs), at + fs - a); g.gain.linearRampToValueAtTime(lvl(b), at + b - a); }
    src.connect(g); g.connect(dest);
    src.start(at, off, b - a);
    if (reg) reg.push(src);
  }
  function projectEnd(P) { var e = 0; P.clips.forEach(function (c) { e = Math.max(e, c.start + c.dur); }); return e; }

  function schedulePass(from, until, when) {
    var P = E.P, reg = [];
    P.clips.forEach(function (cl) {
      var T = E.tracks[cl.track]; if (!T) return;
      clipSource(E.ctx, cl, T.input, when, from, until, reg);
    });
    E.passes.push({ from: from, until: until, when: when, srcs: reg });
  }
  function click(c, dest, when, accent) {
    var o = c.createOscillator(), g = c.createGain();
    o.frequency.value = accent ? 1760 : 1175; o.type = "square";
    g.gain.setValueAtTime(0.0001, when); g.gain.exponentialRampToValueAtTime(accent ? 0.35 : 0.22, when + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
    o.connect(g); g.connect(dest); o.start(when); o.stop(when + 0.06);
  }
  function posAt(t) {
    // timeline position for context time t (follows loop passes)
    for (var i = E.passes.length - 1; i >= 0; i--) { var p = E.passes[i]; if (t >= p.when) return Math.min(p.until, p.from + (t - p.when)); }
    return E.t0;
  }
  function tick() {
    if (!E.playing) return;
    var c = E.ctx, P = E.P, now = c.currentTime, last = E.passes[E.passes.length - 1];
    var loopOn = P.loop.on && P.loop.end - P.loop.start > 0.05 && !E.recording;
    var passEndCtx = last.when + (last.until - last.from);
    if (loopOn && now > passEndCtx - 0.25 && !last.next) {
      last.next = true;
      schedulePass(P.loop.start, P.loop.end, passEndCtx);
    }
    if (P.metro) {
      var beat = 60 / P.bpm;
      while (E.metroNext < now + 0.15) {
        var tl = posAt(E.metroNext);
        var bi = Math.round(tl / beat);
        if (Math.abs(tl - bi * beat) < 0.002) click(c, E.ctx.destination, E.metroNext, bi % 4 === 0);
        var nb = (Math.floor(tl / beat + 1e-6) + 1) * beat, dt = nb - tl;
        if (loopOn && tl + dt > P.loop.end) dt = P.loop.end - tl;
        E.metroNext += Math.max(0.01, dt);
      }
    }
    var pos = posAt(now);
    E.lastPos = pos;
    if (!loopOn && !E.recording && pos >= Math.max(projectEnd(P), E.endHint || 0) + 0.3) { stop(true); return; }
    if (E.onTick) E.onTick(pos);
  }
  function play(P, from) {
    return ensure().then(function () {
      stop(false);
      syncGraph(P);
      var c = E.ctx, when = c.currentTime + 0.06;
      if (P.loop.on && P.loop.end - P.loop.start > 0.05 && (from < P.loop.start || from >= P.loop.end) && !E.recording) from = P.loop.start;
      E.t0 = from; E.ctx0 = when; E.passes = []; E.playing = true;
      var loopOn = P.loop.on && P.loop.end - P.loop.start > 0.05 && !E.recording;
      schedulePass(from, loopOn ? P.loop.end : Math.max(projectEnd(P), from) + 600, when);
      var beat = 60 / P.bpm, nb = Math.ceil(from / beat - 1e-6) * beat;
      E.metroNext = when + (nb - from);
      E.timer = setInterval(tick, 25);
      return when;
    });
  }
  function stop(natural) {
    if (E.timer) { clearInterval(E.timer); E.timer = null; }
    E.passes.forEach(function (p) { p.srcs.forEach(function (s) { try { s.stop(); } catch (e) { /* ended */ } }); });
    E.passes = [];
    var was = E.playing; E.playing = false;
    if (was && E.onStop) E.onStop(natural, E.lastPos);
  }

  /* ---- mic recording onto armed tracks while the rest plays ---- */
  function startRecord(P, from) {
    var armed = P.tracks.filter(function (t) { return t.arm; });
    if (!armed.length) return Promise.reject(new Error("Arm a track first (press R on a track)."));
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return Promise.reject(new Error("This browser cannot record from a microphone."));
    return ensure().then(function () {
      if (!E.hasWorklet) throw new Error("Recording needs AudioWorklet support (use an up-to-date browser).");
      return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 } });
    }).then(function (stream) {
      var c = E.ctx, src = c.createMediaStreamSource(stream), node = new AudioWorkletNode(c, "ipb-rec", { numberOfInputs: 1, numberOfOutputs: 0 });
      var R = { stream: stream, src: src, node: node, chunks: [], t: [], armed: armed.map(function (t) { return t.id; }), from: from, an: c.createAnalyser() };
      R.an.fftSize = 1024; src.connect(R.an);
      node.port.onmessage = function (e) { if (e.data.ch) { R.chunks.push(e.data.ch[0]); R.t.push(e.data.t); } };
      src.connect(node);
      E.rec = R; E.recording = true;
      return play(P, from).then(function (when) {
        R.when = when;
        node.port.postMessage({ on: true });
        return R;
      });
    });
  }
  function stopRecord() {
    var R = E.rec; if (!R) return Promise.resolve(null);
    E.rec = null;
    return new Promise(function (res) {
      R.node.port.postMessage({ on: false });
      setTimeout(function () {
        E.recording = false; stop(false);
        R.stream.getTracks().forEach(function (t) { t.stop(); });
        try { R.src.disconnect(); R.node.disconnect(); } catch (e) { /* ignore */ }
        if (!R.chunks.length) { res(null); return; }
        var c = E.ctx, n = R.chunks.reduce(function (a, b) { return a + b.length; }, 0), all = new Float32Array(n), o = 0;
        R.chunks.forEach(function (ch) { all.set(ch, o); o += ch.length; });
        // align: first captured frame's context time vs. when playback of `from` started, minus round-trip latency
        var firstT = R.t[0], lat = (E.P.latencyMs != null ? E.P.latencyMs / 1000 : (c.outputLatency || c.baseLatency || 0) + 0.01);
        var startTl = R.from + (firstT - R.when) - lat;
        var cut = 0;
        if (startTl < R.from) { cut = Math.round((R.from - startTl) * c.sampleRate); startTl = R.from; }
        var data = all.subarray(Math.min(cut, all.length - 1));
        res({ data: new Float32Array(data), start: startTl, armed: R.armed, sr: c.sampleRate });
      }, 120);
    });
  }
  function inputLevel() {
    var R = E.rec; if (!R) return 0;
    var a = new Float32Array(R.an.fftSize); R.an.getFloatTimeDomainData(a);
    var pk = 0; for (var i = 0; i < a.length; i++) pk = Math.max(pk, Math.abs(a[i])); return pk;
  }
  function meter(an) {
    if (!an) return 0;
    var a = new Float32Array(an.fftSize); an.getFloatTimeDomainData(a);
    var pk = 0; for (var i = 0; i < a.length; i++) pk = Math.max(pk, Math.abs(a[i])); return pk;
  }
  function meters() {
    var o = { master: meter(E.master && E.master.meter), tracks: {} };
    Object.keys(E.tracks).forEach(function (id) { o.tracks[id] = meter(E.tracks[id].meter); });
    return o;
  }
  /* preview a buffer region (waveform editor) through the master */
  var prev = null;
  function playBuffer(buf, from, to, onEnd) {
    return ensure().then(function () {
      stopBuffer();
      var c = E.ctx, s = c.createBufferSource(); s.buffer = buf; s.connect(E.master.bus);
      var when = c.currentTime + 0.03; s.start(when, from, Math.max(0.01, to - from));
      prev = { src: s, when: when, from: from, to: to };
      s.onended = function () { if (prev && prev.src === s) { prev = null; onEnd && onEnd(); } };
      return prev;
    });
  }
  function stopBuffer() { if (prev) { try { prev.src.stop(); } catch (e) { /* ended */ } prev = null; } }
  function bufferPos() { return prev ? Math.min(prev.to, prev.from + Math.max(0, E.ctx.currentTime - prev.when)) : null; }

  /* ---- offline mixdown ---- */
  function render(P, from, to) {
    var dur = Math.max(0.1, to - from), tail = 2.5, c = new OfflineAudioContext(2, Math.ceil((dur + tail) * S.SR), S.SR);
    return c.audioWorklet.addModule("worklets.js").then(function () { return true; }, function () { return false; }).then(function (gate) {
      var M = makeMaster(c); M.meter.connect(c.destination); applyMaster(c, M, P);
      var solo = anySolo(P), T = {};
      P.tracks.forEach(function (tr) { T[tr.id] = makeStrip(c, M.bus, gate); applyFx(c, T[tr.id], tr, P, solo); });
      P.clips.forEach(function (cl) { if (T[cl.track]) clipSource(c, cl, T[cl.track].input, 0, from, to, null); });
      return c.startRendering();
    }).then(function (buf) {
      // trim the silent tail (keep reverb/delay decay), 10 ms fade at the very end
      var L = buf.getChannelData(0), R = buf.getChannelData(1), end = Math.round(dur * S.SR), n = buf.length;
      for (var i = n - 1; i > end; i--) if (Math.abs(L[i]) > 0.0005 || Math.abs(R[i]) > 0.0005) break;
      var len = Math.min(n, Math.max(end, i + Math.round(0.05 * S.SR)));
      var l = L.slice(0, len), r = R.slice(0, len), f = Math.min(len, Math.round(0.01 * S.SR));
      for (var k = 0; k < f; k++) { var g = k / f; l[len - 1 - k] *= g; r[len - 1 - k] *= g; }
      if (P.master.limiter) brickwall(l, r, db(P.master.ceiling), S.SR);
      return [l, r];
    });
  }
  /* look-ahead brickwall limiter for exports: 5 ms ramp-down before every peak, 80 ms release, hard ceiling */
  function brickwall(l, r, ceil, sr) {
    var n = l.length, N = Math.max(1, Math.round(0.005 * sr)), g = new Float32Array(n), i;
    for (i = 0; i < n; i++) { var pk = Math.max(Math.abs(l[i]), Math.abs(r[i])); g[i] = pk > ceil ? ceil / pk : 1; }
    for (i = n - 2; i >= 0; i--) { var lim = g[i + 1] + (1 - g[i + 1]) / N; if (lim < g[i]) g[i] = lim; }
    var rel = 1 - Math.exp(-1 / (0.08 * sr)), cur = 1;
    for (i = 0; i < n; i++) {
      cur = g[i] < cur ? g[i] : cur + (g[i] - cur) * rel;
      var a = l[i] * cur, b = r[i] * cur;
      l[i] = a > ceil ? ceil : a < -ceil ? -ceil : a; r[i] = b > ceil ? ceil : b < -ceil ? -ceil : b;
    }
  }

  E.ensure = ensure; E.syncGraph = syncGraph; E.play = play; E.stop = stop; E.startRecord = startRecord; E.stopRecord = stopRecord;
  E.inputLevel = inputLevel; E.meters = meters; E.render = render; E.projectEnd = projectEnd; E.playBuffer = playBuffer; E.stopBuffer = stopBuffer; E.bufferPos = bufferPos;
  E.pos = function () { return E.playing ? posAt(E.ctx.currentTime) : null; };
  S.E = E;
})();
