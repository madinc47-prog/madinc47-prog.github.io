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
  /* one channel strip: in → gate → shared insert chain (low cut → EQ → comp → de-ess → warmth → doubler; ../fx-chain.js)
     → pan (+ Wide) → fader → meter → out. Reverb / Delay are post-fader SENDS into shared buses (one bus per distinct
     setting, so a project usually runs a single convolver + delay line). */
  function makeStrip(c, out, useGate, buses) {
    var T = { buses: buses };
    T.input = c.createGain();
    T.gate = useGate ? new AudioWorkletNode(c, "ipb-gate", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] }) : c.createGain();
    T.X = window.IPBFx.build(c);
    T.post = c.createGain();
    T.pan = c.createStereoPanner();
    // Wide (per track, off by default): a 12 ms copy added left / subtracted right → wider in stereo, cancels in mono
    T.wd = c.createDelay(0.05); T.wd.delayTime.value = 0.012; T.wl = c.createGain(); T.wr = c.createGain(); T.wl.gain.value = 0; T.wr.gain.value = 0;
    T.wpl = c.createStereoPanner(); T.wpr = c.createStereoPanner(); T.wpl.pan.value = -1; T.wpr.pan.value = 1;
    T.fader = c.createGain();
    T.meter = c.createAnalyser(); T.meter.fftSize = 1024;
    T.input.connect(T.gate); T.gate.connect(T.X.input); T.X.out.connect(T.post);
    T.post.connect(T.pan);
    try { T.X.out.disconnect(T.X.revSend); T.X.out.disconnect(T.X.dlySend); } catch (e) { /* older engines: rewire below anyway */ }
    T.fader.connect(T.X.revSend); T.fader.connect(T.X.dlySend); // post-fader sends: a muted track sends nothing
    T.pan.connect(T.fader); T.fader.connect(T.meter); T.fader.connect(out);
    T.post.connect(T.wd); T.wd.connect(T.wl); T.wd.connect(T.wr); T.wl.connect(T.wpl); T.wr.connect(T.wpr); T.wpl.connect(T.fader); T.wpr.connect(T.fader);
    return T;
  }
  /* FX A/B (per track): every insert + send off (ramped); the track's level / pan stay */
  function fxAllOff(fx) { var o = {}; Object.keys(fx).forEach(function (k) { o[k] = Object.assign({}, fx[k], { on: false }); }); return o; }
  function applyFx(c, T, tr, P, solo) {
    var f = tr.fxOff ? fxAllOff(tr.fx) : tr.fx, t = c.currentTime;
    function set(p, v) { if (c instanceof OfflineAudioContext) p.value = v; else p.setTargetAtTime(v, t, 0.015); }
    if (T.gate.parameters) { T.gate.parameters.get("on").value = f.gate.on ? 1 : 0; T.gate.parameters.get("thr").value = f.gate.thr; T.gate.parameters.get("rel").value = f.gate.rel; }
    T.busKeys = window.IPBFx.apply(c, T.X, f, P.bpm, T.buses, !(c instanceof OfflineAudioContext));
    set(T.pan.pan, tr.pan);
    set(T.wl.gain, tr.wide && !tr.fxOff ? 0.32 : 0); set(T.wr.gain, tr.wide && !tr.fxOff ? -0.32 : 0);
    var audible = !tr.mute && (!solo || tr.solo);
    set(T.fader.gain, audible ? db(tr.vol + S.autoGain(tr)) : 0); // manual volume + auto level match (if on)
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
    // "interrupted" = iPhone/iPad after a call / Siri / another app: wake up from it as well as from "suspended"
    if (E.ctx) { if (E.ctx.state !== "running" && E.ctx.state !== "closed") { try { var pr = E.ctx.resume(); if (pr && pr.catch) pr.catch(function () {}); } catch (e) {} } return E.workletReady; }
    var AC = window.AudioContext || window.webkitAudioContext;
    try { if (navigator.audioSession && navigator.audioSession.type !== "playback") navigator.audioSession.type = "playback"; } catch (e) {} // play with the iPhone silent switch on
    try { E.ctx = new AC({ latencyHint: "interactive", sampleRate: S.SR }); } catch (e) { E.ctx = new AC(); }
    E.master = makeMaster(E.ctx);
    E.master.meter.connect(E.ctx.destination);
    E.workletReady = E.ctx.audioWorklet ? E.ctx.audioWorklet.addModule("worklets.js").then(function () { E.hasWorklet = true; }).catch(function (e) { console.warn("worklets unavailable", e); E.hasWorklet = false; }) : Promise.resolve().then(function () { E.hasWorklet = false; });
    // phones only let audio start inside a real tap (pointerup / touchend / click), not on pointerdown
    if (!E.unlockOn) { E.unlockOn = true; ["pointerup", "touchend", "click", "keydown"].forEach(function (ev) { document.addEventListener(ev, function () { if (E.ctx && E.ctx.state !== "running" && E.ctx.state !== "closed") { try { E.ctx.resume().catch(function () {}); } catch (e) {} } }, { capture: true, passive: true }); }); }
    return E.workletReady;
  }
  function syncGraph(P) {
    E.P = P;
    if (!E.ctx) return;
    var c = E.ctx, solo = anySolo(P), seen = {}, keep = {};
    if (!E.buses) E.buses = window.IPBFx.Buses(c, E.master.bus);
    S.autoMatch(P);
    P.tracks.forEach(function (tr) {
      if (!E.tracks[tr.id]) E.tracks[tr.id] = makeStrip(c, E.master.bus, E.hasWorklet, E.buses);
      applyFx(c, E.tracks[tr.id], tr, P, solo);
      (E.tracks[tr.id].busKeys || []).forEach(function (k) { keep[k] = 1; });
      seen[tr.id] = 1;
    });
    Object.keys(E.tracks).forEach(function (id) { if (!seen[id]) { try { E.tracks[id].fader.disconnect(); } catch (e) { /* gone */ } delete E.tracks[id]; } });
    E.buses.gc(keep);
    applyMaster(c, E.master, P);
    if (E.onSync) E.onSync();
  }

  /* ---- clip scheduling ---- */
  /* Tighten to beat (per track, off by default): the clip's syllable onsets nudged toward the project's 16th grid.
     A processed copy per clip position + strength (computed in match-worker.js); the source / raw take is untouched. */
  function trackOf(P, id) { for (var i = 0; i < P.tracks.length; i++) if (P.tracks[i].id === id) return P.tracks[i]; return null; }
  function tightOn(tr) { return tr && tr.tight && tr.tight.on && tr.tight.str > 0; }
  function tightKey(clip, tr, P) { return [clip.src, (+clip.start).toFixed(4), (+clip.offset || 0).toFixed(4), P.bpm, tr.tight.str].join(":"); }
  function tightBuf(clip, P) {
    if (!P) return null; var tr = trackOf(P, clip.track); if (!tightOn(tr)) return null;
    var s = S.sources[clip.src]; return s && s.tight ? s.tight[tightKey(clip, tr, P)] || null : null;
  }
  function prepTight(P) {
    if (!window.IPBMatch || !P) return Promise.resolve();
    var jobs = [];
    P.clips.forEach(function (cl) {
      var tr = trackOf(P, cl.track); if (!tightOn(tr)) return;
      var s = S.sources[cl.src]; if (!s || !s.buf) return;
      s.tight = s.tight || {}; var k = tightKey(cl, tr, P); if (s.tight[k] || s.tightP === k) return;
      var b = s.buf, mono = b.getChannelData(0);
      if (b.numberOfChannels > 1) { var r = b.getChannelData(1); mono = new Float32Array(b.length); for (var i = 0; i < b.length; i++) mono[i] = 0.5 * (b.getChannelData(0)[i] + r[i]); }
      s.tightP = k;
      jobs.push(window.IPBMatch.tighten(mono, b.sampleRate, { step: 60 / P.bpm / 4, swing: 0, offset: cl.start - (cl.offset || 0) }, tr.tight.str).then(function (res) {
        var mk = E.ctx || new OfflineAudioContext(1, 1, b.sampleRate), nb = mk.createBuffer(1, res.out.length, b.sampleRate);
        nb.getChannelData(0).set(res.out); s.tight[k] = nb; s.tightInfo = res.info; s.tightP = null; E.tightInfo = res.info;
      }, function () { s.tightP = null; }));
    });
    return Promise.all(jobs);
  }
  function clipSource(c, clip, dest, when, from, until, reg, P) {
    // plays the part of `clip` that lies in timeline [from, until) starting at context time `when`
    var s = S.sources[clip.src]; if (!s) return;
    var cs = clip.start, ce = clip.start + clip.dur;
    var a = Math.max(cs, from), b = Math.min(ce, until);
    if (b - a <= 0.0005) return;
    var src = c.createBufferSource(); src.buffer = tightBuf(clip, P || E.P) || s.buf;
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
    if (TD) { try { tdTick(); } catch (e) { /* debug only */ } }
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
  function play(P, from, pre) {
    return ensure().then(function () { return prepTight(P); }).then(function () {
      stop(false);
      syncGraph(P);
      var c = E.ctx, start = c.currentTime + 0.06, when = start + (pre || 0);
      if (pre) { // count-in: clicks before the timeline starts (bar accent on the first beat)
        var b0 = 60 / P.bpm, n = Math.max(1, Math.round(pre / b0));
        for (var i = 0; i < n; i++) click(c, c.destination, start + i * b0, i % 4 === 0);
      }
      E.countEnd = when;
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
  /* ?tapdebug=1 (here or on the Beats page around it): every 2 s of playback, the L / R level of the Studio output and of
     each playing track, plus each track's pan and its clips' source form (mono / L-only→mono / stereo) → the tap log */
  var TD = (function () { try { return /[?&]tapdebug/.test(location.search) || /[?&]tapdebug/.test(parent.location.search); } catch (e) { return /[?&]tapdebug/.test(location.search); } })();
  function tdLog(line, bad) {
    try { if (parent !== window && parent.__ipbTD && parent.__ipbTD.log) { parent.__ipbTD.log(line, bad); return; } } catch (e) { /* cross-origin */ }
    if (window.__ipbTD && window.__ipbTD.log) { window.__ipbTD.log(line, bad); return; }
    (window.__ipbStudioTD = window.__ipbStudioTD || []).push(line); console.log(line);
  }
  function lrTap(c, node) { // splitter → two analysers (debug only)
    var sp = c.createChannelSplitter(2), l = c.createAnalyser(), r = c.createAnalyser(); l.fftSize = r.fftSize = 2048;
    node.connect(sp); sp.connect(l, 0); sp.connect(r, 1); return { l: l, r: r, sl: 0, sr: 0, n: 0 };
  }
  function lrSample(T) { var a = new Float32Array(2048), s = 0, i; T.l.getFloatTimeDomainData(a); for (i = 0; i < a.length; i++) s += a[i] * a[i]; T.sl += s; s = 0; T.r.getFloatTimeDomainData(a); for (i = 0; i < a.length; i++) s += a[i] * a[i]; T.sr += s; T.n++; }
  function lrDb(x, n) { return n ? 10 * Math.log10(x / (n * 2048) + 1e-12) : -120; }
  function tdTick() {
    if (!TD || !E.ctx || !E.playing) return;
    var c = E.ctx, P = E.P; if (!P) return;
    if (!E.lrM) E.lrM = lrTap(c, E.master.out);
    lrSample(E.lrM);
    P.tracks.forEach(function (tr) { var T = E.tracks[tr.id]; if (!T) return; if (!T.lr) T.lr = lrTap(c, T.fader); lrSample(T.lr); });
    var now = performance.now(); if (E.lrT && now - E.lrT < 2000) return; var first = !E.lrT; E.lrT = now; if (first) return;
    var M = E.lrM, L = lrDb(M.sl, M.n), R = lrDb(M.sr, M.n), parts = [];
    P.tracks.forEach(function (tr) {
      var T = E.tracks[tr.id]; if (!T || !T.lr || !T.lr.n) return;
      var l = lrDb(T.lr.sl, T.lr.n), r = lrDb(T.lr.sr, T.lr.n); T.lr.sl = T.lr.sr = T.lr.n = 0;
      if (Math.max(l, r) < -70) return;
      var forms = {}; P.clips.forEach(function (cl) { if (cl.track === tr.id && S.sources[cl.src]) forms[S.sources[cl.src].form || "?"] = 1; });
      parts.push(tr.name + " L " + l.toFixed(1) + " R " + r.toFixed(1) + " (" + (l - r >= 0 ? "+" : "") + (l - r).toFixed(1) + " dB) pan " + (+tr.pan || 0).toFixed(2) + (tr.wide ? " wide" : "") + " src " + Object.keys(forms).join("/"));
    });
    M.sl = M.sr = M.n = 0;
    if (!parts.length && Math.max(L, R) < -90) return; // nothing playing yet (empty project / count-in)
    var off = Math.abs(L - R) > 6 && Math.max(L, R) > -60;
    tdLog("studio L/R 2s: out L " + L.toFixed(1) + " dB R " + R.toFixed(1) + " dB (balance " + (L - R >= 0 ? "+" : "") + (L - R).toFixed(1) + " dB" + (off ? " ONE-SIDED" : "") + ") · " + (parts.join(" · ") || "no track audio"), off);
  }
  function stop(natural) {
    if (E.timer) { clearInterval(E.timer); E.timer = null; }
    E.lrT = 0;
    E.passes.forEach(function (p) { p.srcs.forEach(function (s) { try { s.stop(); } catch (e) { /* ended */ } }); });
    E.passes = [];
    var was = E.playing; E.playing = false;
    if (was && E.onStop) E.onStop(natural, E.lastPos);
  }

  /* ---- mic recording onto armed tracks while the rest plays ---- */
  function autoLatency() { // seconds between "scheduled" and "heard + sung + captured" (output + input path)
    var c = E.ctx; if (!c) return 0;
    return (c.outputLatency || c.baseLatency || 0) + (E.inLat || 0) + 0.005;
  }
  function latency() { return E.P && E.P.latencyMs != null ? E.P.latencyMs / 1000 : autoLatency(); }
  function countLeft() { return E.playing && E.ctx && E.ctx.currentTime < E.countEnd ? E.countEnd - E.ctx.currentTime : 0; }
  // opts.speaker: no headphones (only remembered on the take; the mic is opened raw either way)
  function startRecord(P, from, pre, opts) {
    var spk = !!(opts && opts.speaker), vo = !!(opts && opts.voiceOnly);
    var armed = P.tracks.filter(function (t) { return t.arm; });
    if (!armed.length) return Promise.reject(new Error("Arm a track first (press R on a track)."));
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return Promise.reject(new Error("This browser cannot record from a microphone."));
    return ensure().then(function () {
      if (!E.hasWorklet) throw new Error("Recording needs AudioWorklet support (use an up-to-date browser).");
      // RAW takes in every mode: no browser / phone echo-cancel, noise suppression or auto-gain (the take is saved exactly
      // as the mic captured it; 🧹 Clean take is manual)
      var RAW = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
      // "No headphones — voice only" (manual toggle): browser echo-cancel + noise suppression on, auto-gain still off
      if (vo) RAW = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
      var _bai = (typeof window!=="undefined" && window.BeatAudioInput) || (typeof parent!=="undefined" && parent.BeatAudioInput) || null;
      var _want = vo ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 } : (_bai ? _bai.constraints(undefined,false) : { echoCancellation:false, noiseSuppression:false, autoGainControl:false, channelCount:{ideal:2} });
      return navigator.mediaDevices.getUserMedia({ audio: _want })
        .catch(function (e) { if (e && (e.name === "OverconstrainedError" || e.name === "TypeError")) return navigator.mediaDevices.getUserMedia({ audio: RAW }); throw e; });
    }).then(function (stream) {
      var mic = {}; try { mic = stream.getAudioTracks()[0].getSettings() || {}; } catch (e) { /* ignore */ }
      try { var st = stream.getAudioTracks()[0].getSettings(); E.inLat = st && typeof st.latency === "number" && st.latency < 0.5 ? st.latency : 0; } catch (e) { E.inLat = 0; }
      var c = E.ctx, src = c.createMediaStreamSource(stream), node = new AudioWorkletNode(c, "ipb-rec", { numberOfInputs: 1, numberOfOutputs: 0 });
      var R = { voiceOnly: vo, stream: stream, src: src, node: node, chunks: [], chunks2: [], t: [], armed: armed.map(function (t) { return t.id; }), from: from, an: c.createAnalyser(), speaker: spk, mic: { echoCancellation: !!mic.echoCancellation, noiseSuppression: !!mic.noiseSuppression, autoGainControl: !!mic.autoGainControl } };
      R.an.fftSize = 1024; src.connect(R.an);
      R.t0 = performance.now(); R.max = 0; R.lost = null;
      var mtr = stream.getAudioTracks()[0];
      if (mtr) { // Android gives the mic to an active call / privacy toggle off → muted or silent stream, no error
        mtr.addEventListener("ended", function () { R.lost = "ended"; });
        mtr.addEventListener("mute", function () { R.lost = "mute"; });
        if (mtr.muted) R.lost = "mute";
      }
      // keep EVERY mic channel: some tablets open the built-in mic as stereo with the voice in one side only
      node.port.onmessage = function (e) { if (e.data.ch) { R.chunks.push(e.data.ch[0]); R.chunks2.push(e.data.ch[1] || null); R.t.push(e.data.t); } };
      src.connect(node);
      E.rec = R; E.recording = true;
      return play(P, from, pre).then(function (when) {
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
        var _splitData=null, _modeData=null;
        if (R.chunks2.some(Boolean)) {
          var all2 = new Float32Array(n), o2 = 0;
          R.chunks2.forEach(function (ch, k) { var len = R.chunks[k].length; if (ch) all2.set(ch.subarray(0, len), o2); o2 += len; });
          var _bai2 = (typeof window!=="undefined" && window.BeatAudioInput) || null;
          var _mode = _bai2 ? _bai2.getMode() : "mix";
          if (_bai2 && (_mode==="mic1"||_mode==="mic2")) { _modeData=_bai2.applyMode(all,all2,_mode).mono; all=_modeData; if(TD) tdLog("studio take: USB mode "+_mode); }
          else if (_bai2 && _mode==="split") { _splitData={mic1:new Float32Array(all), mic2:new Float32Array(all2)}; if(TD) tdLog("studio take: USB split Mic1 L / Mic2 R, channels kept separate"); }
          else if (window.IPBFx) { var side = window.IPBFx.liveSide(all, all2), rl = window.IPBFx.rms(all), rr = window.IPBFx.rms(all2);
          if (TD) tdLog("studio take: stereo mic stream, L " + (20 * Math.log10(rl + 1e-9)).toFixed(1) + " dB R " + (20 * Math.log10(rr + 1e-9)).toFixed(1) + " dB → " + (side === 0 ? "left side only, saved mono (both ears)" : side === 1 ? "right side only, saved mono (both ears)" : "both sides live, summed to mono"));
          all = window.IPBFx.smartMono([all, all2]); }
        } else if (TD) tdLog("studio take: mono mic stream, saved mono (both ears)");
        // align: first captured frame's context time vs. when playback of `from` started, minus round-trip latency
        var firstT = R.t[0], lat = latency();
        var startTl = R.from + (firstT - R.when) - lat;
        var cut = 0;
        if (startTl < R.from) { cut = Math.round((R.from - startTl) * c.sampleRate); startTl = R.from; }
        var data = all.subarray(Math.min(cut, all.length - 1));
        var _res={ voiceOnly: R.voiceOnly, data: new Float32Array(data), start: startTl, armed: R.armed, sr: c.sampleRate, latency: lat, speaker: R.speaker, mic: R.mic };
        if (_splitData) { var _cut=Math.min(cut,_splitData.mic1.length-1); _res.split=true; _res.data=_splitData.mic1.subarray(_cut); _res.data=new Float32Array(_res.data); _res.data2=new Float32Array(_splitData.mic2.subarray(_cut)); _res.channels=2; }
        res(_res);
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
    return prepTight(P).then(function () { return c.audioWorklet.addModule("worklets.js"); }).then(function () { return true; }, function () { return false; }).then(function (gate) {
      var M = makeMaster(c); M.meter.connect(c.destination); applyMaster(c, M, P);
      var solo = anySolo(P), T = {}; S.autoMatch(P);
      var buses = window.IPBFx.Buses(c, M.bus);
      P.tracks.forEach(function (tr) { T[tr.id] = makeStrip(c, M.bus, gate, buses); applyFx(c, T[tr.id], tr, P, solo); });
      P.clips.forEach(function (cl) { if (T[cl.track]) clipSource(c, cl, T[cl.track].input, 0, from, to, null, P); });
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

  E.autoLatency = autoLatency; E.latency = latency; E.countLeft = countLeft; E.ensure = ensure; E.syncGraph = syncGraph; E.play = play; E.stop = stop; E.startRecord = startRecord; E.stopRecord = stopRecord;
  E.prepTight = prepTight; E.inputLevel = inputLevel; E.meters = meters; E.render = render; E.projectEnd = projectEnd; E.playBuffer = playBuffer; E.stopBuffer = stopBuffer; E.bufferPos = bufferPos;
  E.pos = function () { return E.playing ? posAt(E.ctx.currentTime) : null; };
  S.E = E;
})();
