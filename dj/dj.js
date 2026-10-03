/* Island Pin DJ — two-deck browser DJ mixer (booth of DJ Psycho Fingers).
 * Web Audio only, nothing uploaded. Each deck plays a decoded AudioBuffer (sample-accurate cue / hot cues / loops /
 * sync); keylock compensates the pitch of the tempo change with a two-tap delay-line pitch shifter.
 * Chain per deck:  source → [keylock | dry] → trim → EQ low / mid / high → filter (LP ↔ HP) → channel fader → crossfader
 * Master: bus → master volume → limiter (compressor) → soft clipper (ceiling −0.2 dBFS) → speakers + recorder + meter.
 * Turntables: each deck also has an AudioWorklet scratch engine (scratch-worklet.js) that plays the same track at a signed,
 * variable rate. Grabbing the platter, vinyl start/brake, spinbacks and rewinds hand playback to the worklet; once the
 * motor is back at speed, playback is handed back (sample-aligned) to the normal buffer source.
 * Sampler, mic and video modules (dj-*.js) plug into window.PFDJ.
 */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function db2g(db) { return Math.pow(10, db / 20); }
  function fmtTime(s) { s = Math.max(0, s || 0); var m = Math.floor(s / 60), r = Math.floor(s % 60); return m + ":" + (r < 10 ? "0" : "") + r; }
  var PREFS_KEY = "ipb_dj_v1";
  var KL_D = 0.08;                    // keylock grain (s); audio through the keylock is KL_D/2 late on average
  var HOT_COLORS = ["#f43f5e", "#f59e0b", "#34d399", "#60a5fa"];
  var SEC_PER_REV = 1.8;              // 33⅓ RPM: one platter revolution = 1.8 s of record
  var EV = {};                        // tiny event bus for the add-on modules
  function on(ev, fn) { (EV[ev] = EV[ev] || []).push(fn); }
  function emit(ev, a, b) { (EV[ev] || []).forEach(function (fn) { try { fn(a, b); } catch (e) { console.warn(e); } }); }
  var ctx = null, M = null;           // audio context + master nodes
  var prefs = loadPrefs();

  /* ---------------- toast ---------------- */
  var toastT = null;
  function toast(msg) { var t = $("toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("show"); }, 2600); }

  /* ---------------- prefs ---------------- */
  function loadPrefs() {
    var d = { xf: 0, curve: "smooth", ham: false, recFmt: "wav", master: 0.85, decks: { A: {}, B: {} } };
    try { var s = JSON.parse(localStorage.getItem(PREFS_KEY) || "null"); if (s && typeof s === "object") { d.xf = clamp(+s.xf || 0, -1, 1); d.curve = s.curve === "cut" || s.curve === "scratch" ? s.curve : "smooth"; d.ham = s.ham === true; d.recFmt = s.recFmt === "webm" ? "webm" : "wav"; if (isFinite(+s.master)) d.master = clamp(+s.master, 0, 1); if (s.decks) { d.decks.A = s.decks.A || {}; d.decks.B = s.decks.B || {}; } } } catch (e) { /* ignore */ }
    return d;
  }
  var saveT = null;
  function savePrefs() {
    clearTimeout(saveT);
    saveT = setTimeout(function () {
      var o = { xf: X.xf, curve: X.curve, ham: X.ham, recFmt: X.recFmt, master: X.master, decks: {} };
      DECKS.forEach(function (d) { o.decks[d.id] = { vol: d.vol, eq: d.eq.slice(), filter: d.filter, range: d.range, keylock: d.keylock, vinyl: d.vinyl }; });
      try { localStorage.setItem(PREFS_KEY, JSON.stringify(o)); } catch (e) { /* ignore */ }
    }, 250);
  }

  /* ---------------- state ---------------- */
  var X = { xf: prefs.xf, curve: prefs.curve, ham: prefs.ham, recFmt: prefs.recFmt, master: prefs.master, rec: null };
  function newDeck(id) {
    var p = prefs.decks[id] || {};
    return {
      id: id, buf: null, name: "", src: null, srcTok: 0, playing: false, pos: 0, anchor: null,
      bpm: null, grid: 0, bpmSrc: "", pitch: 0, range: p.range === 16 ? 16 : 8, keylock: p.keylock === true, bend: 0,
      cue: 0, hot: [null, null, null, null], loop: { in: null, out: null, on: false },
      sync: false, trimDb: 0, autoDb: 0, vol: isFinite(+p.vol) ? clamp(+p.vol, 0, 1) : 0.8,
      eq: Array.isArray(p.eq) && p.eq.length === 3 ? p.eq.map(function (v) { return clamp(+v || 0, -26, 6); }) : [0, 0, 0], kill: [false, false, false],
      filter: isFinite(+p.filter) ? clamp(+p.filter, -1, 1) : 0, peaks: null, detail: null, taps: [], loading: false, n: null,
      vinyl: p.vinyl !== false, wl: null, wlBuf: null, scr: null, scrRep: null, tt: { hand: null, hp: 0, bendT: null }
    };
  }
  var DECKS = [newDeck("A"), newDeck("B")];
  var BY = { A: DECKS[0], B: DECKS[1] };
  function other(d) { return d === DECKS[0] ? DECKS[1] : DECKS[0]; }
  function rate(d) { return (1 + d.pitch / 100) * (1 + d.bend); }

  /* ---------------- audio graph ---------------- */
  function ensureCtx() {
    if (ctx) { if (ctx.state === "suspended") ctx.resume(); return ctx; }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { toast("This browser has no Web Audio."); return null; }
    ctx = new AC({ latencyHint: "interactive" });
    M = {};
    M.bus = ctx.createGain(); M.bus.gain.value = 0.8;                 // headroom before the limiter
    M.vol = ctx.createGain(); M.vol.gain.value = X.master;
    M.lim = ctx.createDynamicsCompressor();
    M.lim.threshold.value = -3; M.lim.knee.value = 0; M.lim.ratio.value = 20; M.lim.attack.value = 0.001; M.lim.release.value = 0.12;
    M.clip = ctx.createWaveShaper(); M.clip.curve = clipCurve(); M.clip.oversample = "none"; // no oversampling: its resampling filter could overshoot the ceiling
    M.an = ctx.createAnalyser(); M.an.fftSize = 1024;
    M.music = ctx.createGain();                                      // decks → music bus (mic talkover ducks this) → master bus
    M.music.connect(M.bus);
    M.bus.connect(M.vol); M.vol.connect(M.lim); M.lim.connect(M.clip); M.clip.connect(ctx.destination); M.clip.connect(M.an);
    // recorder tap (ScriptProcessor: supported everywhere; muted output keeps it running)
    M.tap = ctx.createScriptProcessor(4096, 2, 2);
    M.tapOut = ctx.createGain(); M.tapOut.gain.value = 0;
    M.clip.connect(M.tap); M.tap.connect(M.tapOut); M.tapOut.connect(ctx.destination);
    M.tap.onaudioprocess = function (e) {
      if (!X.rec || !X.rec.on || !X.rec.L) return;
      var L = e.inputBuffer.getChannelData(0), R = e.inputBuffer.numberOfChannels > 1 ? e.inputBuffer.getChannelData(1) : L;
      X.rec.L.push(new Float32Array(L)); X.rec.R.push(new Float32Array(R)); X.rec.n += L.length;
    };
    DECKS.forEach(buildDeckGraph);
    applyXf();
    ctx.onstatechange = audioState;
    audioState();
    if (ctx.audioWorklet && window.AudioWorkletNode) {
      M.wlP = ctx.audioWorklet.addModule("scratch-worklet.js").then(function () { M.wlOK = true; DECKS.forEach(initWl); }).catch(function (e) { console.warn("scratch worklet unavailable", e); });
    }
    emit("ctx", ctx, M);
    return ctx;
  }
  function audioState() { var el = $("audio-state"); if (!ctx) return; el.textContent = ctx.state === "running" ? "Audio on · " + Math.round(ctx.sampleRate / 100) / 10 + " kHz" : "Tap ▶ to start audio"; el.classList.toggle("on", ctx.state === "running"); }
  /* soft clipper: linear to 0.9, smooth knee, flat at 0.977 (−0.2 dBFS); inputs beyond ±1 clamp to the ceiling */
  function clipCurve() {
    var n = 4096, c = new Float32Array(n), K = 0.9, C = 0.977;
    for (var i = 0; i < n; i++) {
      var x = (i / (n - 1)) * 2 - 1, a = Math.abs(x), y;
      y = a <= K ? a : K + (C - K) * Math.tanh((a - K) / (C - K));
      c[i] = x < 0 ? -y : y;
    }
    return c;
  }
  function buildDeckGraph(d) {
    var n = d.n = {};
    n.dry = ctx.createGain();
    n.dryDelay = ctx.createDelay(0.5); n.dryDelay.delayTime.value = klOn(d) ? KL_D / 2 : 0; // same latency as the keylock path
    n.wet = ctx.createGain(); n.wet.gain.value = 0;
    n.sum = ctx.createGain();
    n.trim = ctx.createGain();
    n.low = ctx.createBiquadFilter(); n.low.type = "lowshelf"; n.low.frequency.value = 220;
    n.mid = ctx.createBiquadFilter(); n.mid.type = "peaking"; n.mid.frequency.value = 1000; n.mid.Q.value = 0.7;
    n.high = ctx.createBiquadFilter(); n.high.type = "highshelf"; n.high.frequency.value = 3800;
    n.filt = ctx.createBiquadFilter(); n.filt.type = "lowpass"; n.filt.frequency.value = ctx.sampleRate / 2; n.filt.Q.value = 0.707;
    n.fader = ctx.createGain(); n.xf = ctx.createGain();
    n.an = ctx.createAnalyser(); n.an.fftSize = 1024;
    n.dry.connect(n.dryDelay); n.dryDelay.connect(n.sum); n.wet.connect(n.sum);
    n.sum.connect(n.trim); n.trim.connect(n.low); n.low.connect(n.mid); n.mid.connect(n.high); n.high.connect(n.filt);
    n.filt.connect(n.fader); n.fader.connect(n.an); n.fader.connect(n.xf); n.xf.connect(M.music);
    buildKeylock(d);
    applyDeckMix(d, true);
  }
  /* keylock: two delay taps swept by sawtooth ramps half a cycle apart, crossfaded with sin² windows (sum = 1).
     Sweeping the delay at slope s shifts pitch by (1 − s); we cancel the tempo's pitch change: shift = 1 / rate. */
  function buildKeylock(d) {
    var n = d.n, sr = ctx.sampleRate, len = Math.round(sr), b = ctx.createBuffer(2, len, sr), r = b.getChannelData(0), w = b.getChannelData(1);
    for (var i = 0; i < len; i++) { var ph = i / len; r[i] = ph; w[i] = Math.pow(Math.sin(Math.PI * ph), 2); }
    n.klIn = ctx.createGain();
    n.kl = [0, 0.5].map(function (ph) {
      var src = ctx.createBufferSource(); src.buffer = b; src.loop = true; src.playbackRate.value = 0;
      var sp = ctx.createChannelSplitter(2); src.connect(sp);
      var dl = ctx.createDelay(1); var mg = ctx.createGain(); mg.gain.value = 0; sp.connect(mg, 0); mg.connect(dl.delayTime);
      var wg = ctx.createGain(); wg.gain.value = 0; sp.connect(wg.gain, 1);
      n.klIn.connect(dl); dl.connect(wg); wg.connect(n.wet);
      src.start(ctx.currentTime, ph * 1);
      return { src: src, dl: dl, mg: mg };
    });
  }
  /* the same shifter also does key shifts (Key Match / manual semitones): pitch factor = (keylock ? 1 / rate : 1) × 2^(semitones / 12) */
  function klOn(d) { return d.keylock || !!d.keyShift; }
  function applyKeylock(d, t) {
    if (!d.n) return;
    t = t || ctx.currentTime;
    var r = rate(d), pf = (d.keylock ? 1 / r : 1) * Math.pow(2, (d.keyShift || 0) / 12), on = klOn(d) && Math.abs(pf - 1) > 0.0004, n = d.n;
    n.dryDelay.delayTime.setValueAtTime(klOn(d) ? KL_D / 2 : 0, t);
    n.dry.gain.setTargetAtTime(on ? 0 : 1, t, 0.008);
    n.wet.gain.setTargetAtTime(on ? 1 : 0, t, 0.008);
    var p = pf, f = on ? Math.abs(1 - p) / KL_D : 0, up = p > 1;
    n.kl.forEach(function (k) {
      k.src.playbackRate.setValueAtTime(f, t);        // ramp buffer is 1 s long → playbackRate = sweeps per second
      k.dl.delayTime.setValueAtTime(up ? KL_D : 0, t);
      k.mg.gain.setValueAtTime(up ? -KL_D : KL_D, t);
    });
  }
  function eqDb(d, i) { return d.kill[i] ? -40 : d.eq[i]; }
  /* external decks (YouTube player): no Web Audio path — volume = channel fader × crossfader × trim × master via the player */
  function extVol(d) { if (d.ext) d.ext.vol(clamp(Math.pow(d.vol, 1.6) * xfGains()[d === DECKS[0] ? 0 : 1] * X.master * db2g(d.trimDb), 0, 1)); }
  function extRate(d) { if (d.ext) d.ext.rate(rate(d)); }
  function applyDeckMix(d, now) {
    extVol(d);
    if (!d.n || !ctx) return;
    var t = ctx.currentTime, n = d.n, tc = now ? 0.001 : 0.012;
    n.trim.gain.setTargetAtTime(db2g(d.autoDb + (d.rideDb || 0) + d.trimDb), t, tc);
    n.low.gain.setTargetAtTime(eqDb(d, 0), t, tc);
    n.mid.gain.setTargetAtTime(eqDb(d, 1), t, tc);
    n.high.gain.setTargetAtTime(eqDb(d, 2), t, tc);
    var f = d.filter, nyq = ctx.sampleRate / 2;
    if (Math.abs(f) < 0.02) { n.filt.type = "lowpass"; n.filt.Q.setTargetAtTime(0.707, t, tc); n.filt.frequency.setTargetAtTime(nyq, t, tc); }
    else if (f < 0) { n.filt.type = "lowpass"; n.filt.Q.setTargetAtTime(1.4, t, tc); n.filt.frequency.setTargetAtTime(Math.min(nyq, 18000 * Math.pow(60 / 18000, -f)), t, tc); }
    else { n.filt.type = "highpass"; n.filt.Q.setTargetAtTime(1.4, t, tc); n.filt.frequency.setTargetAtTime(25 * Math.pow(9000 / 25, f), t, tc); }
    n.fader.gain.setTargetAtTime(Math.pow(d.vol, 1.6), t, tc);   // audio taper
  }
  /* curves: smooth = equal power; cut = full volume until the last 6 %; scratch = razor cut in the last 1.5 % (fast attack).
     Hamster reverses the fader direction. */
  function xfGains() {
    var x = ((X.ham ? -X.xf : X.xf) + 1) / 2, w = X.curve === "scratch" ? 0.015 : 0.06;
    if (X.curve !== "smooth") return [x > 1 - w ? Math.max(0, (1 - x) / w) : 1, x < w ? Math.max(0, x / w) : 1];
    return [Math.cos(x * Math.PI / 2), Math.sin(x * Math.PI / 2)];
  }
  function applyXf() {
    DECKS.forEach(extVol);
    if (!ctx) return;
    var g = xfGains(), t = ctx.currentTime, tc = X.curve === "scratch" ? 0.0012 : 0.006;
    DECKS[0].n.xf.gain.setTargetAtTime(g[0], t, tc);
    DECKS[1].n.xf.gain.setTargetAtTime(g[1], t, tc);
  }

  /* ---------------- transport ---------------- */
  function rawPos(d) {
    if (d.ext) return d.playing ? clamp(d.ext.time(), 0, d.buf ? d.buf.duration : 1e9) : d.pos;
    if (d.scr && ctx) { var r = d.scrRep; if (!r) return d.scr.p0; return clamp(r.pos + Math.max(0, ctx.currentTime - r.time) * r.rate, 0, d.buf ? d.buf.duration : 1e9); }
    if (!d.playing || !d.anchor || !ctx) return d.pos;
    var p = d.anchor.pos + Math.max(0, ctx.currentTime - d.anchor.t) * d.anchor.rate;
    if (d.loop.on && d.loop.out > d.loop.in && p >= d.loop.out) p = d.loop.in + ((p - d.loop.in) % (d.loop.out - d.loop.in));
    return Math.min(p, d.buf ? d.buf.duration : p);
  }
  /* what you hear right now (the keylock / dry delay makes output KL_D/2 late) */
  function pos(d) {
    if (d.ext) return rawPos(d);
    var p = rawPos(d);
    if (d.scr) return klOn(d) ? Math.max(0, p - (KL_D / 2) * (d.scrRep ? d.scrRep.rate : 0)) : p;
    return d.playing && klOn(d) ? Math.max(0, p - (KL_D / 2) * rate(d)) : p;
  }
  function reanchor(d) { if (d.playing && !d.scr) d.anchor = { t: ctx.currentTime, pos: rawPos(d), rate: rate(d) }; }
  function startSrc(d, at, when) {
    if (d.ext) { d.ext.seek(at, true); d.ext.rate(rate(d)); d.ext.play(); d.anchor = { t: ctx ? ctx.currentTime : 0, pos: at, rate: rate(d) }; return; }
    if (d.scr) { scrSeek(d, at); scrLoop(d); return; }
    stopSrc(d);
    var s = ctx.createBufferSource(), tok = ++d.srcTok;
    s.buffer = d.buf;
    s.playbackRate.value = rate(d);
    if (d.loop.on && d.loop.out > d.loop.in) { s.loop = true; s.loopStart = d.loop.in; s.loopEnd = d.loop.out; }
    s.connect(d.n.dry); s.connect(d.n.klIn);
    when = when || ctx.currentTime + 0.005;
    s.start(when, clamp(at, 0, d.buf.duration - 0.001));
    s.onended = function () { if (tok === d.srcTok && d.playing) { d.playing = false; d.pos = d.buf.duration; d.src = null; ui(d); } };
    d.src = s; d.anchor = { t: when, pos: at, rate: rate(d) };
  }
  function stopSrc(d) { if (d.ext) { d.ext.pause(); return; } if (d.src) { d.srcTok++; try { d.src.stop(); } catch (e) { /* ignore */ } d.src.disconnect(); d.src = null; } }
  function play(d, instant) {
    if (d.ext && d.buf && !d.playing) { if (d.pos >= d.buf.duration - 0.3) d.pos = d.cue || 0; ensureCtx(); d.playing = true; var at0 = d.pos; if (d.sync && other(d).playing && !other(d).ext) at0 = phaseTarget(d, at0); startSrc(d, at0); ui(d); nowPlaying(); emit("play", d); return; }
    if (!d.buf || !ensureCtx()) { if (!d.buf) toast("Load a track into deck " + d.id + " first."); return; }
    if (d.playing) return;
    if (d.scr) { d.playing = true; if (!d.scr.hold) scrRate(d, rate(d), 0.07); ui(d); nowPlaying(); emit("play", d); return; }
    if (d.pos >= d.buf.duration - 0.05) d.pos = d.cue || 0;
    d.playing = true;
    var at = d.pos, o = other(d);
    if (d.sync && o.playing) { at = phaseTarget(d, at); instant = true; }
    if (d.vinyl && !instant && scratchOK(d)) {            // turntable motor: spin up from standstill (~0.25 s)
      d.pos = at; scrBegin(d, 0, at); scrRate(d, rate(d), 0.07);
    } else { applyKeylock(d); startSrc(d, at); }
    ui(d); nowPlaying(); emit("play", d);
  }
  function pause(d, instant) {
    if (!d.playing) return;
    if (d.scr) { d.playing = false; if (instant) scrKill(d); else if (!d.scr.hold) scrRate(d, 0, 0.2); ui(d); nowPlaying(); emit("pause", d); return; }
    if (d.vinyl && !instant && scratchOK(d)) { var bp = rawPos(d); d.playing = false; scrBegin(d, rate(d), bp); scrRate(d, 0, 0.2); ui(d); nowPlaying(); emit("pause", d); return; } // brake
    d.pos = rawPos(d); d.playing = false; stopSrc(d); ui(d); nowPlaying(); emit("pause", d);
  }
  function toggle(d) { d.playing ? pause(d) : play(d); }
  function seek(d, t) {
    if (!d.buf) return;
    t = clamp(t, 0, d.buf.duration - 0.01);
    if (d.loop.on && (t < d.loop.in || t >= d.loop.out)) setLoopOn(d, false);
    if (d.scr) scrSeek(d, t); else if (d.playing) startSrc(d, t); else { d.pos = t; if (d.ext) d.ext.seek(t, true); }
    ui(d);
  }

  /* ---------------- turntable scratch engine (AudioWorklet) ---------------- */
  function initWl(d) {
    if (d.wl || !M.wlOK) return;
    try { d.wl = new AudioWorkletNode(ctx, "pf-scratch", { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] }); }
    catch (e) { console.warn(e); return; }
    d.wl.connect(d.n.dry);
    d.wl.port.onmessage = function (e) {
      var m = e.data;
      if (m.t === "pos" || m.t === "settled") { if (d.scr) d.scrRep = { pos: m.pos, rate: m.rate, time: m.time }; if (d.tt.hand) { d.tt.rmax = Math.max(d.tt.rmax || 0, m.rate); d.tt.rmin = Math.min(d.tt.rmin || 0, m.rate); } }
      if (m.t === "settled") onSettled(d, m);
    };
    if (d.buf) sendBuf(d);
  }
  /* the worklet keeps a 16-bit copy of the track (half the memory of a float copy) */
  function sendBuf(d) {
    if (!d.wl || !d.buf || d.wlBuf === d.buf) return;
    var b = d.buf, n = b.length, c0 = b.getChannelData(0), c1 = b.numberOfChannels > 1 ? b.getChannelData(1) : null;
    var L = new Int16Array(n), R = c1 ? new Int16Array(n) : null;
    for (var i = 0; i < n; i++) { var x = c0[i]; L[i] = x >= 1 ? 32767 : x <= -1 ? -32768 : x * 32767; if (R) { var y = c1[i]; R[i] = y >= 1 ? 32767 : y <= -1 ? -32768 : y * 32767; } }
    var msg = { t: "buf", L: L, sr: b.sampleRate }, tr = [L.buffer];
    if (R) { msg.R = R; tr.push(R.buffer); }
    d.wl.port.postMessage(msg, tr);
    d.wlBuf = b;
  }
  function scratchOK(d) { return !!(ctx && M && M.wlOK && d.wl && d.buf && d.wlBuf === d.buf); }
  /* take playback over from the buffer source at the current position, starting at rate r0 */
  function scrBegin(d, r0, p) {
    if (d.scr) { d.scr.gen++; return d.scr; }
    if (p == null) p = rawPos(d);
    if (r0 == null) r0 = d.playing ? rate(d) : 0;
    stopSrc(d);
    d.scr = { gen: 1, p0: p, hold: false };
    d.scrRep = { pos: p, rate: r0, time: ctx.currentTime };
    d.wl.port.postMessage({ t: "start", pos: p, sr: d.buf.sampleRate, rate: r0, target: r0, mode: "rate", tau: 0.05 });
    scrLoop(d);
    var t = ctx.currentTime;
    d.n.dry.gain.cancelScheduledValues(t); d.n.dry.gain.setTargetAtTime(1, t, 0.004);
    d.n.wet.gain.cancelScheduledValues(t); d.n.wet.gain.setTargetAtTime(0, t, 0.004);
    return d.scr;
  }
  function scrLoop(d) { if (d.wl) d.wl.port.postMessage({ t: "loop", on: d.loop.on && d.loop.out > d.loop.in, lin: d.loop.in, lout: d.loop.out }); }
  function scrSeek(d, t) { d.wl.port.postMessage({ t: "seek", pos: t }); d.scrRep = { pos: t, rate: d.scrRep ? d.scrRep.rate : 0, time: ctx.currentTime }; }
  function scrRate(d, r, tau) { if (d.scr) { d.scr.want = r; d.wl.port.postMessage({ t: "rate", rate: r, tau: tau }); } }
  function scrKill(d) { if (!d.scr) return; d.pos = rawPos(d); d.wl.port.postMessage({ t: "stop" }); d.scr = null; d.scrRep = null; }
  function onSettled(d, m) {
    if (!d.scr || d.scr.hold || d.tt.hand) return;
    if (d.playing && m.rate > 0) {                     // motor at speed → hand back to the buffer source, sample-aligned
      var T = ctx.currentTime + 0.03, P = m.pos + (T - m.time) * m.rate;
      if (d.loop.on && d.loop.out > d.loop.in && P >= d.loop.out) P = d.loop.in + ((P - d.loop.in) % (d.loop.out - d.loop.in));
      d.wl.port.postMessage({ t: "stop", at: T });
      d.scr = null; d.scrRep = null;
      if (P >= d.buf.duration - 0.02) { d.playing = false; d.pos = d.buf.duration; ui(d); return; }
      applyKeylock(d, T); startSrc(d, P, T);
      ui(d);
    } else if (!d.playing && m.rate === 0) { d.pos = m.pos; d.wl.port.postMessage({ t: "stop" }); d.scr = null; d.scrRep = null; ui(d); }
    else scrRate(d, d.playing ? rate(d) : 0, 0.08);
  }
  /* classic wheel-up: the record is spun back hard, slows down (pitch drops), then drops in again from the cue point */
  function rewind(d) {
    if (!d.buf || !ensureCtx()) return;
    emit("manual", d);
    if (d.ext) { seek(d, d.cue || 0); if (!d.playing) play(d, true); toast("YouTube deck: back to the cue (no spin-back sound — the audio stays inside YouTube's player)"); return; }
    if (!scratchOK(d)) { var was = d.playing; seek(d, d.cue || 0); if (!was) play(d, true); toast("Rewind — back to the cue"); return; }
    var sc = scrBegin(d), g = ++sc.gen;
    sc.hold = true;
    scrRate(d, -6, 0.045);
    setTimeout(function () { if (d.scr && d.scr.gen === g) scrRate(d, 0, 0.26); }, 260);
    setTimeout(function () {
      if (!d.scr || d.scr.gen !== g) return;
      scrSeek(d, d.cue || 0); d.playing = true; d.scr.hold = false; scrRate(d, rate(d), 0.03); ui(d); nowPlaying();
    }, 1150);
    toast("Rewind! Deck " + d.id + " wheels up to the cue");
  }

  /* ---------------- platter: grab, scratch, spin back ---------------- */
  function ttAngle(el, e) { var r = el.getBoundingClientRect(); return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180 / Math.PI; }
  function handVel(d) { // record seconds per second over the last ~50 ms of hand movement
    var h = d.tt.hand, s = h && h.hist, now = performance.now();
    if (!s || s.length < 2 || now - s[s.length - 1].t > 45) return 0;
    var a = s[s.length - 1], b = a;
    for (var i = s.length - 2; i >= 0; i--) { b = s[i]; if (a.t - b.t > 50) break; }
    return a.t > b.t ? (a.p - b.p) / ((a.t - b.t) / 1000) : 0;
  }
  function ttDown(d, el, e) {
    if (e.button > 0 || d.tt.hand) return;
    e.preventDefault();
    if (!d.buf) { toast("Load a track into deck " + d.id + " to scratch."); return; }
    if (d.ext) { toast("Scratching isn't possible on a YouTube deck — YouTube's audio can't be processed. Use a file or a beat for scratching."); return; }
    if (!ensureCtx()) return;
    emit("manual", d);
    try { el.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ }
    var bendMode = !d.vinyl && d.playing && !d.scr;
    if (!bendMode && !scratchOK(d)) { toast(M.wlOK === undefined && M.wlP ? "Turntable engine starting…" : "Scratching needs AudioWorklet (Chrome / Edge / Firefox / Safari 14.1+)."); if (M.wlP && !M.wlOK) M.wlP.then(function () { DECKS.forEach(sendBuf); }); return; }
    var p = rawPos(d);
    d.tt.hand = { id: e.pointerId, a: ttAngle(el, e), cum: 0, p0: p, bend: bendMode, hist: [{ t: performance.now(), p: p }] };
    d.tt.hp = p; d.tt.rmax = 0; d.tt.rmin = 0;
    if (!bendMode) {
      var sc = scrBegin(d); sc.gen++; sc.hold = false;
      d.wl.port.postMessage({ t: "pos", pos: p, tau: 0.012 });
    }
    el.classList.add("grab"); d.el.root.classList.add("scratching");
  }
  function ttMove(d, el, e) {
    var h = d.tt.hand;
    if (!h || h.id !== e.pointerId) return;
    var a = ttAngle(el, e), da = a - h.a;
    if (da > 180) da -= 360; else if (da < -180) da += 360;
    h.a = a; h.cum += da;
    var target = Math.max(0, h.p0 + h.cum / 360 * SEC_PER_REV), now = performance.now();
    h.hist.push({ t: now, p: target }); if (h.hist.length > 24) h.hist.shift();
    d.tt.hp = target;
    if (h.bend) {                                             // CDJ jog: nudge the tempo while turning
      setBend(d, clamp(handVel(d) * 0.06, -0.25, 0.25));
      clearTimeout(d.tt.bendT); d.tt.bendT = setTimeout(function () { if (d.bend) setBend(d, 0); }, 70);
    } else d.wl.port.postMessage({ t: "pos", pos: target, tau: 0.012 });
  }
  function ttUp(d, el, e) {
    var h = d.tt.hand;
    if (!h || h.id !== e.pointerId) return;
    var v = handVel(d);
    d.tt.hand = null; el.classList.remove("grab"); d.el.root.classList.remove("scratching");
    if (h.bend) { clearTimeout(d.tt.bendT); setBend(d, 0); return; }
    if (!d.scr) return;
    d.lastFlick = v;
    if (v < -2.2) { rewind(d); return; }                       // fast backward flick → rewind / wheel-up
    // let go: the motor brings the record back to speed (or the deck stays stopped if it was paused)
    d.wl.port.postMessage({ t: "rate", rate: d.playing ? rate(d) : 0, tau: d.playing ? 0.085 : 0.05 });
    d.scr.want = d.playing ? rate(d) : 0;
  }
  /* CDJ cue: paused → set the cue here; playing → jump back to the cue and stop */
  function cue(d) {
    if (!d.buf) return;
    ensureCtx();
    if (d.scr && !d.playing) scrKill(d);
    if (d.playing) { pause(d, true); d.pos = d.cue; if (d.ext) d.ext.seek(d.cue, true); }
    else if (Math.abs(d.pos - d.cue) < 0.01) { /* already at the cue */ }
    else { d.cue = snapBeat(d, d.pos, true); d.pos = d.cue; toast("Deck " + d.id + " cue set at " + fmtTime(d.cue)); }
    ui(d);
  }
  function setPitch(d, pct) {
    d.pitch = clamp(pct, -d.range, d.range);
    if (d.ext) { d.pitch = d.ext.quant(d.pitch); extRate(d); }
    if (d.scr && !d.scr.hold && !d.tt.hand && d.playing) scrRate(d, rate(d), 0.05);
    if (d.playing && d.src) { reanchor(d); d.src.playbackRate.setValueAtTime(rate(d), ctx.currentTime); }
    if (ctx) applyKeylock(d);
    DECKS.forEach(function (x) { if (x !== d && x.sync && isMaster(d)) followTempo(x); });
    ui(d);
  }
  function setKeyShift(d, st) {
    if (d.ext) { d.keyShift = 0; if (st) toast("Key shift isn't possible on a YouTube deck — its audio stays inside YouTube's player."); return; }
    d.keyShift = clamp(Math.round(st || 0), -6, 6);
    reanchor(d); if (ctx) applyKeylock(d);
    ui(d); emit("keyshift", d);
  }
  function setBend(d, b) {
    d.bend = b;
    if (d.ext) { extRate(d); return; }
    if (d.playing && d.src) { reanchor(d); d.src.playbackRate.setValueAtTime(rate(d), ctx.currentTime); applyKeylock(d); }
  }

  /* ---------------- tempo, grid, sync ---------------- */
  function beatLen(d) { return d.bpm ? 60 / d.bpm : 0; }
  function snapBeat(d, t, onlyNear) {
    var L = beatLen(d);
    if (!L) return t;
    var k = Math.round((t - d.grid) / L), s = d.grid + k * L;
    return (!onlyNear || Math.abs(s - t) < 0.04) && s >= 0 ? s : t;
  }
  function effBpm(d) { return d.bpm ? d.bpm * rate(d) : null; }
  function isMaster(d) { return !d.sync || !other(d).playing; }
  function matchRatio(d, o) { // tempo ratio incl. double / half time (70 ↔ 140)
    var r = effBpm(o) / d.bpm, best = r;
    [0.5, 2].forEach(function (m) { if (Math.abs(r * m - 1) < Math.abs(best - 1)) best = r * m; });
    return best;
  }
  function followTempo(d) {
    var o = other(d);
    if (!d.bpm || !o.bpm) return false;
    var pct = (matchRatio(d, o) - 1) * 100;
    if (Math.abs(pct) > 16) { toast("Tempos too far apart to sync (" + Math.round(effBpm(o)) + " vs " + Math.round(d.bpm) + " BPM)."); return false; }
    if (Math.abs(pct) > d.range) { d.range = 16; }
    d.pitch = pct;
    if (d.ext) { d.pitch = d.ext.quant(pct); extRate(d); }
    if (d.playing && d.src) { reanchor(d); d.src.playbackRate.setValueAtTime(rate(d), ctx.currentTime); }
    if (ctx) applyKeylock(d);
    ui(d);
    return true;
  }
  /* position in `d` whose beat phase matches the other deck's (heard) phase, nearest to `at` */
  function phaseTarget(d, at) {
    var o = other(d), Lo = beatLen(o), Ld = beatLen(d);
    if (!Lo || !Ld) return at;
    var m = Math.pow(2, Math.round(Math.log(matchRatio(d, o) / (effBpm(o) / d.bpm)) / Math.LN2)); // 1, or 2 / ½ for double / half time
    var ph = ((((pos(o) + 0.005 * rate(o) - o.grid) / Lo) % 1) + 1) % 1; // other deck's phase when our source starts (+5 ms)
    var LdEff = Ld * m;
    var lat = klOn(d) ? (KL_D / 2) * rate(d) : 0; // our output will be this much behind the source position
    var f = (at - d.grid) / LdEff, k = Math.round(f - ph);
    return Math.max(0, d.grid + (k + ph) * LdEff + lat);
  }
  function doSync(d) {
    var o = other(d);
    if (!d.buf || !o.buf) { toast("Load both decks to sync."); return; }
    if (!d.bpm || !o.bpm) { toast("Both decks need a BPM — tap it in with TAP."); return; }
    if (d.sync) { d.sync = false; ui(d); return; }
    if (d.ext && !o.ext) { toast("YouTube speeds only go in 5% steps — syncing deck " + o.id + " to this YouTube deck instead."); doSync(o); return; }
    if (!followTempo(d)) return;
    d.sync = true; o.sync = false;
    if (d.playing && o.playing) startSrc(d, phaseTarget(d, rawPos(d)));
    ui(d); ui(o);
    toast("Deck " + d.id + " synced to " + o.id + " · " + effBpm(d).toFixed(1) + " BPM");
  }
  var taps = { A: [], B: [] };
  function tapTempo(d) {
    var now = performance.now(), t = taps[d.id];
    if (t.length && now - t[t.length - 1] > 2000) t.length = 0;
    t.push(now);
    if (t.length >= 4) {
      var iv = (t[t.length - 1] - t[0]) / (t.length - 1), bpm = 60000 / iv / rate(d);
      d.bpm = Math.round(bpm * 10) / 10; d.bpmSrc = "tap";
      if (d.playing) d.grid = rawPos(d) % (60 / d.bpm); // your tap = a beat
      ui(d);
    } else toast("Tap " + (4 - t.length) + " more…");
    if (t.length > 12) t.shift();
  }
  function scaleBpm(d, m) { if (!d.bpm) return; d.bpm = Math.round(d.bpm * m * 10) / 10; ui(d); }

  /* onset-envelope autocorrelation tempo estimate (+ beat phase) */
  function estimateBpm(buf) {
    var sr = buf.sampleRate, c0 = buf.getChannelData(0), c1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : c0;
    var maxSec = Math.min(buf.duration, 90), n = Math.floor(maxSec * sr);
    if (n < sr * 6) return null;
    var hop = Math.round(sr / 172), nf = Math.floor(n / hop), lowE = new Float32Array(nf), allE = new Float32Array(nf);
    var lp = 0, a = 1 - Math.exp(-2 * Math.PI * 180 / sr);
    for (var f = 0, i = 0; f < nf; f++) {
      var el = 0, ea = 0;
      for (var j = 0; j < hop; j++, i++) { var x = (c0[i] + c1[i]) * 0.5; lp += a * (x - lp); el += lp * lp; ea += x * x; }
      lowE[f] = Math.log(1e-9 + el); allE[f] = Math.log(1e-9 + ea);
    }
    var on = new Float32Array(nf);
    for (f = 1; f < nf; f++) on[f] = 1.5 * Math.max(0, lowE[f] - lowE[f - 1]) + Math.max(0, allE[f] - allE[f - 1]);
    var mean = 0; for (f = 0; f < nf; f++) mean += on[f]; mean /= nf;
    for (f = 0; f < nf; f++) on[f] = Math.max(0, on[f] - mean);
    var fps = sr / hop, minL = Math.floor(fps * 60 / 180), maxL = Math.ceil(fps * 60 / 70) * 2 + 2, ac = new Float32Array(maxL + 1);
    for (var L = minL >> 1; L <= maxL; L++) { var s = 0; for (f = 0; f + L < nf; f++) s += on[f] * on[f + L]; ac[L] = s / (nf - L); }
    function at(v) { var k = Math.floor(v), fr = v - k; return k + 1 > maxL ? 0 : ac[k] * (1 - fr) + ac[k + 1] * fr; }
    var best = 0, bestL = 0;
    for (L = fps * 60 / 170; L <= fps * 60 / 72; L += 0.05) { var sc = at(L) + 0.5 * at(2 * L) + 0.25 * at(L / 2); if (sc > best) { best = sc; bestL = L; } }
    if (!bestL) return null;
    var bpm = 60 * fps / bestL;
    if (bpm < 75) bpm *= 2; if (bpm >= 165) bpm /= 2;
    bpm = Math.round(bpm * 10) / 10;
    if (Math.abs(bpm - Math.round(bpm)) < 0.25) bpm = Math.round(bpm);
    var Lb = 60 * fps / bpm, bestP = 0, bestS = -1;
    for (var p = 0; p < Lb; p += 0.5) { var ss = 0; for (var q = p; q < nf; q += Lb) ss += on[Math.round(q)] || 0; if (ss > bestS) { bestS = ss; bestP = p; } }
    return { bpm: bpm, grid: bestP / fps };
  }

  /* ---------------- hot cues + loops ---------------- */
  function hotCue(d, i, clear) {
    if (!d.buf) return;
    ensureCtx();
    if (clear) { d.hot[i] = null; toast("Hot cue " + (i + 1) + " cleared"); ui(d); return; }
    if (d.hot[i] == null) { d.hot[i] = snapBeat(d, pos(d), true); toast("Deck " + d.id + " hot cue " + (i + 1) + " set"); }
    else { if (d.playing || d.scr) startSrc(d, d.hot[i]); else { d.pos = d.hot[i]; if (d.ext) d.ext.seek(d.pos, true); } }
    ui(d);
  }
  function setLoopOn(d, on) {
    var l = d.loop;
    if (on && !(l.out > l.in)) return;
    if (d.playing) { var p = rawPos(d); l.on = on; if (on && (p < l.in || p >= l.out)) p = l.in; startSrc(d, p); }
    else { l.on = on; if (on && (d.pos < l.in || d.pos >= l.out)) d.pos = l.in; }
    ui(d);
  }
  function loopIn(d) { if (!d.buf || extNo(d, "Loops")) return; d.loop.in = snapBeat(d, pos(d), true); d.loop.out = null; if (d.loop.on) setLoopOn(d, false); ui(d); }
  function extNo(d, what) { if (!d.ext) return false; toast(what + " aren't available on a YouTube deck — the player can only jump, not loop seamlessly."); return true; }
  function loopOut(d) {
    if (d.buf && extNo(d, "Loops")) return;
    if (!d.buf || d.loop.in == null) { toast("Set loop IN first."); return; }
    var o = snapBeat(d, pos(d), true);
    if (o <= d.loop.in + 0.05) { toast("Loop OUT must be after IN."); return; }
    d.loop.out = o; setLoopOn(d, true);
  }
  function autoLoop(d, beats) {
    if (!d.buf || extNo(d, "Loops")) return;
    if (!d.bpm) { toast("Loops by beat need a BPM — use IN / OUT or TAP."); return; }
    var L = beatLen(d), p = pos(d), start = d.grid + Math.floor((p - d.grid) / L + 1e-6) * L;
    if (start < 0) start = 0;
    d.loop.in = start; d.loop.out = Math.min(d.buf.duration, start + beats * L);
    setLoopOn(d, true);
  }
  function loopScale(d, m) {
    var l = d.loop;
    if (!(l.out > l.in)) return;
    var len = (l.out - l.in) * m;
    if (len < 0.03 || l.in + len > d.buf.duration) return;
    l.out = l.in + len;
    if (d.playing && l.on) { var p = rawPos(d); if (p >= l.out) p = l.in + ((p - l.in) % len); startSrc(d, p); }
    ui(d);
  }

  /* ---------------- loading ---------------- */
  function decode(ab) {
    return new Promise(function (res, rej) {
      var c = ensureCtx(); if (!c) { rej(new Error("no audio")); return; }
      var done = false, pr = c.decodeAudioData(ab, function (b) { done = true; res(b); }, function (e) { if (!done) rej(e || new Error("decode")); });
      if (pr && pr.catch) pr.catch(function (e) { if (!done) rej(e || new Error("decode")); });
    });
  }
  function computePeaks(buf) {
    var c0 = buf.getChannelData(0), c1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : c0, n = buf.length;
    var cols = 1000, per = Math.max(1, Math.floor(n / cols)), ov = new Float32Array(cols);
    var bs = 256, nb = Math.ceil(n / bs), dmax = new Float32Array(nb), dlow = new Float32Array(nb), lp = 0, a = 1 - Math.exp(-2 * Math.PI * 200 / buf.sampleRate);
    for (var b = 0, i = 0; b < nb; b++) {
      var m = 0, ml = 0, e = Math.min(n, i + bs);
      for (; i < e; i++) { var x = (c0[i] + c1[i]) * 0.5, ax = x < 0 ? -x : x; lp += a * (x - lp); if (ax > m) m = ax; var al = lp < 0 ? -lp : lp; if (al > ml) ml = al; }
      dmax[b] = m; dlow[b] = ml;
    }
    for (var c = 0; c < cols; c++) { var s = Math.floor(c * per / bs), e2 = Math.max(s + 1, Math.floor((c + 1) * per / bs)), mm = 0; for (var k = s; k < e2 && k < nb; k++) if (dmax[k] > mm) mm = dmax[k]; ov[c] = mm; }
    return { ov: ov, dmax: dmax, dlow: dlow, bs: bs };
  }
  function rmsDb(buf) {
    var c0 = buf.getChannelData(0), n = c0.length, st = Math.max(1, Math.floor(n / 400000)), s = 0, k = 0;
    for (var i = 0; i < n; i += st) { s += c0[i] * c0[i]; k++; }
    return 10 * Math.log10(s / Math.max(1, k) + 1e-12);
  }
  /* item: { name, get: () => Promise<ArrayBuffer|AudioBuffer>, bpm?, grid?, sub? } */
  function loadInto(d, item, force) {
    if (d.playing && !force && !confirm("Deck " + d.id + " is playing. Load “" + item.name + "” anyway?")) return Promise.resolve(false);
    if (item.load) return item.load(d, true);
    if (!ensureCtx()) return Promise.resolve(false);
    var tok = (d.loadTok = (d.loadTok || 0) + 1);
    d.loading = true; ui(d);
    toast("Loading “" + item.name + "” into deck " + d.id + "…");
    return item.get().then(function (x) { return x instanceof AudioBuffer ? x : decode(x); }).then(function (buf) {
      if (tok !== d.loadTok) return false;
      pause(d, true); scrKill(d);
      if (d.ext) { var ox = d.ext; d.ext = null; ox.destroy(); }
      d.buf = buf; d.name = item.name; d.sub = item.sub || ""; d.pos = 0; d.cue = item.grid || 0; d.hot = [null, null, null, null];
      d.loop = { in: null, out: null, on: false }; d.sync = false; d.pitch = 0; d.bend = 0;
      d.peaks = computePeaks(buf); d.ovDirty = true;
      d.autoDb = clamp(-15 - rmsDb(buf), -12, 6); d.trimDb = 0; d.rideDb = 0; d.keyShift = 0; d.key = null; // auto-match (dj-automatch.js) refines autoDb + key on "loaded"
      d.bpm = item.bpm || null; d.grid = item.grid || 0; d.bpmSrc = item.bpm ? "tag" : "";
      if (!item.bpm) {
        setTimeout(function () {
          if (tok !== d.loadTok) return;
          try { var r = estimateBpm(buf); if (r) { d.bpm = r.bpm; d.grid = r.grid; d.bpmSrc = "auto"; if (item.bpmHint) { d.bpm = item.bpmHint; d.bpmSrc = "tag"; } } } catch (e) { /* no tempo */ }
          if (!d.bpm && item.bpmHint) { d.bpm = item.bpmHint; d.bpmSrc = "tag"; }
          ui(d);
        }, 30);
      }
      d.loading = false;
      applyDeckMix(d); applyKeylock(d);
      setTimeout(function () { if (d.buf === buf) sendBuf(d); }, 60);
      d.item = item;
      ui(d); nowPlaying(); emit("loaded", d, item);
      toast("Deck " + d.id + ": " + item.name + (d.bpm ? " · " + d.bpm + " BPM" : ""));
      return true;
    }).catch(function (e) {
      if (tok === d.loadTok) { d.loading = false; ui(d); }
      toast("Couldn't load that audio" + (e && e.message ? " (" + e.message + ")" : "") + ".");
      return false;
    });
  }
  /* external source (YouTube player) on a deck: ext = { kind, duration(), time(), play(), pause(), seek(t), rate(r), quant(pct), vol(v), destroy() } */
  function setExt(d, ext, item) {
    d.loadTok = (d.loadTok || 0) + 1;
    pause(d, true); scrKill(d); stopSrc(d);
    if (d.ext && d.ext !== ext) { var ox = d.ext; d.ext = null; ox.destroy(); }
    d.ext = ext;
    d.buf = { ext: true, duration: ext.duration() || 1, sampleRate: 44100, length: 0, numberOfChannels: 0 };
    d.name = item.name; d.sub = item.sub || ""; d.pos = item.start || 0; d.cue = item.start || 0; d.hot = [null, null, null, null];
    d.loop = { in: null, out: null, on: false }; d.sync = false; d.pitch = 0; d.bend = 0; d.peaks = null; d.ovDirty = true;
    d.autoDb = 0; d.rideDb = 0; d.keyShift = 0; d.trimDb = 0; d.bpm = item.bpm || bpmFromName(item.name) || null; d.grid = item.grid || 0; d.bpmSrc = d.bpm ? "tag" : "";
    d.loading = false; d.item = item; d.wlBuf = null;
    extVol(d); extRate(d);
    if (CTL[d.id + ".trim"]) CTL[d.id + ".trim"].set(0);
    ui(d); nowPlaying(); emit("loaded", d, item);
    toast("Deck " + d.id + ": " + item.name + " (YouTube) — tap TAP on the beat to set its BPM");
  }
  function extEnded(d) { if (!d.ext) return; d.playing = false; d.pos = d.buf.duration; ui(d); nowPlaying(); }
  function extState(d, playing) { if (!d.ext || d.playing === playing) return; if (!playing) d.pos = d.ext.time(); d.playing = playing; ui(d); nowPlaying(); emit(playing ? "play" : "pause", d); }
  function fileItem(f) { return { name: f.name.replace(/\.[a-z0-9]+$/i, ""), sub: "Your file", get: function () { return f.arrayBuffer(); }, bpmHint: bpmFromName(f.name) }; }
  function bpmFromName(s) { var m = /(\d{2,3}(?:\.\d)?)\s*bpm/i.exec(s || ""); var v = m ? +m[1] : NaN; return v >= 60 && v <= 200 ? v : null; }
  function fetchAB(url) { return fetch(url).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.arrayBuffer(); }); }

  /* ---------------- built-in crate: his beats + synthesized demo loops ---------------- */
  var BUILTIN = [
    { id: "gunwalk", name: "Gunwalk — DJ Psycho Fingers", sub: "His own beat · instrumental · 96 BPM · 3:18", bpm: 96, grid: 0.36,
      get: function () { return fetchAB("../beats/tracks/gunwalk-instrumental.mp3"); } },
    { id: "demo-bap", name: "Booth Loop 92 (boom-bap demo)", sub: "Synthesized here · 92 BPM · 16 bars", bpm: 92, grid: 0, get: function () { return synthDemo("bap"); } },
    { id: "demo-bounce", name: "Island Bounce 100 (demo)", sub: "Synthesized here · 100 BPM · 16 bars", bpm: 100, grid: 0, get: function () { return synthDemo("bounce"); } }
  ];
  var demoCache = {};
  function synthDemo(kind) {
    if (demoCache[kind]) return Promise.resolve(demoCache[kind]);
    var bpm = kind === "bap" ? 92 : 100, bars = 16, beat = 60 / bpm, sr = ctx ? ctx.sampleRate : 44100;
    var dur = bars * 4 * beat, c = new OfflineAudioContext(2, Math.ceil(sr * dur), sr);
    var bus = c.createDynamicsCompressor(); bus.threshold.value = -14; bus.ratio.value = 3; bus.connect(c.destination);
    var nb = c.createBuffer(1, sr, sr), nd = nb.getChannelData(0), seed = 7;
    for (var i = 0; i < sr; i++) { seed = (seed * 16807) % 2147483647; nd[i] = seed / 1073741823.5 - 1; }
    function env(g, t, a, peak, dec) { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.setTargetAtTime(0, t + a, dec); }
    function kick(t, v) { var o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(44, t + 0.12); env(g, t, 0.002, 0.9 * v, 0.12); o.connect(g); g.connect(bus); o.start(t); o.stop(t + 0.8); }
    function noise(t, v, type, f, q, dec, pan) {
      var s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain(), p = c.createStereoPanner();
      s.buffer = nb; fl.type = type; fl.frequency.value = f; fl.Q.value = q; env(g, t, 0.001, v, dec); p.pan.value = pan || 0;
      s.connect(fl); fl.connect(g); g.connect(p); p.connect(bus); s.start(t, (t * 7.3) % 0.5); s.stop(t + dec * 6 + 0.05);
    }
    function snare(t, v) { noise(t, 0.5 * v, "bandpass", 1800, 0.8, 0.07); var o = c.createOscillator(), g = c.createGain(); o.frequency.value = 190; env(g, t, 0.001, 0.35 * v, 0.05); o.connect(g); g.connect(bus); o.start(t); o.stop(t + 0.4); }
    function hat(t, v, open) { noise(t, 0.16 * v, "highpass", 7500, 0.7, open ? 0.12 : 0.025, 0.25); }
    function tone(t, midi, len, v, type, cut) {
      var o = c.createOscillator(), g = c.createGain(), fl = c.createBiquadFilter();
      o.type = type; o.frequency.value = 440 * Math.pow(2, (midi - 69) / 12); fl.type = "lowpass"; fl.frequency.value = cut;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.01); g.gain.setTargetAtTime(v * 0.6, t + 0.01, 0.2); g.gain.setTargetAtTime(0, t + len, 0.06);
      o.connect(fl); fl.connect(g); g.connect(bus); o.start(t); o.stop(t + len + 0.5);
    }
    var sw = kind === "bap" ? 0.16 : 0.04; // swing (fraction of a 16th)
    for (var bar = 0; bar < bars; bar++) {
      for (var s16 = 0; s16 < 16; s16++) {
        var t = (bar * 16 + s16) * beat / 4 + (s16 % 2 ? sw * beat / 4 : 0);
        if (kind === "bap") {
          if (s16 === 0 || s16 === 10 || (s16 === 7 && bar % 2)) kick(t, s16 === 0 ? 1 : 0.8);
          if (s16 === 4 || s16 === 12) snare(t, 1);
          if (s16 % 2 === 0) hat(t, s16 % 4 ? 0.6 : 1, s16 === 14);
        } else {
          if (s16 % 4 === 0) kick(t, 1);
          if (s16 === 4 || s16 === 12) { snare(t, 0.8); noise(t + 0.012, 0.3, "bandpass", 1200, 1.2, 0.05, -0.2); }
          hat(t, s16 % 2 ? 0.55 : 0.85, false);
          if (s16 === 3 || s16 === 11) noise(t, 0.12, "bandpass", 5200, 2, 0.04, -0.4);
        }
      }
      var roots = kind === "bap" ? [38, 43, 41, 36] : [45, 43, 41, 43], root = roots[bar % 4], b0 = bar * 4 * beat;
      if (kind === "bap") {
        tone(b0, root, beat * 1.4, 0.32, "sine", 400); tone(b0 + beat * 2.5, root + (bar % 2 ? 7 : 5), beat * 1.2, 0.26, "sine", 400);
        [0, 3, 7, 10, 14].forEach(function (iv) { tone(b0 + beat * 0.02, root + 24 + iv, beat * 1.7, 0.035, "triangle", 1800); tone(b0 + beat * 2.52, root + 24 + iv, beat * 0.9, 0.028, "triangle", 1600); });
      } else {
        for (var k = 0; k < 4; k++) tone(b0 + (k + 0.5) * beat, root, beat * 0.4, 0.3, "sawtooth", 500);
        [0, 4, 7, 11].forEach(function (iv) { [0.75, 1.75, 2.75, 3.75].forEach(function (bt) { tone(b0 + bt * beat, root + 24 + iv, beat * 0.2, 0.03, "square", 2400); }); });
      }
    }
    return c.startRendering().then(function (b) { demoCache[kind] = b; return b; });
  }

  /* ---------------- Island Pin Beats Vault (same-origin IndexedDB, read-only) ---------------- */
  function vaultList() {
    return new Promise(function (res) {
      if (!window.indexedDB) { res([]); return; }
      var r;
      try { r = indexedDB.open("islandpinbeats"); } catch (e) { res([]); return; }
      r.onupgradeneeded = function () { var db = r.result; if (!db.objectStoreNames.contains("vault")) db.createObjectStore("vault", { keyPath: "id" }); if (!db.objectStoreNames.contains("pads")) db.createObjectStore("pads", { keyPath: "key" }); };
      r.onerror = function () { res([]); };
      r.onsuccess = function () {
        var db = r.result;
        if (!db.objectStoreNames.contains("vault")) { db.close(); res([]); return; }
        var q = db.transaction("vault", "readonly").objectStore("vault").getAll();
        q.onsuccess = function () { db.close(); res((q.result || []).filter(function (x) { return x && x.blob; }).sort(function (a, b) { return (b.created || 0) - (a.created || 0); })); };
        q.onerror = function () { db.close(); res([]); };
      };
    });
  }

  /* ---------------- mix recorder ---------------- */
  function audioStream() {           // master output as a MediaStream (for compressed / video recording)
    if (!ensureCtx()) return null;
    if (!M.dest) { M.dest = ctx.createMediaStreamDestination(); M.clip.connect(M.dest); }
    return M.dest.stream;
  }
  function pickMime(list) { if (!window.MediaRecorder) return null; for (var i = 0; i < list.length; i++) if (MediaRecorder.isTypeSupported(list[i])) return list[i]; return null; }
  function addMix(blob, dur, ext, label) {
    var item = { id: "mix_" + Date.now().toString(36), name: (label || "DJ Psycho Fingers mix") + " · " + new Date().toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }), dur: dur, blob: blob, url: URL.createObjectURL(blob), ext: ext };
    MIXES.unshift(item); showLib("mixes"); setTimeout(function () { emit("mix", item); }, 0); return item;
  }
  function fmtSize(b) { return b > 1073741824 ? (b / 1073741824).toFixed(2) + " GB" : b < 1048576 ? Math.max(1, Math.round(b / 1024)) + " KB" : (b / 1048576).toFixed(1) + " MB"; }
  function toggleRec() {
    if (!ensureCtx()) return;
    if (X.rec && X.rec.on && X.rec.mr) { X.rec.on = false; try { X.rec.mr.stop(); } catch (e) { /* ignore */ } return; }
    if (!(X.rec && X.rec.on) && X.recFmt === "webm") {
      var mime = pickMime(["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4", "audio/webm"]);
      if (!mime) { toast("This browser can't record compressed audio — using WAV."); X.recFmt = "wav"; $("rec-fmt").value = "wav"; }
      else {
        var mr = new MediaRecorder(audioStream(), { mimeType: mime, audioBitsPerSecond: 160000 }), chunks = [], r = { on: true, mr: mr, bytes: 0, t0: performance.now(), mime: mime };
        mr.ondataavailable = function (e) { if (e.data && e.data.size) { chunks.push(e.data); r.bytes += e.data.size; } };
        mr.onstop = function () {
          var blob = new Blob(chunks, { type: mime.split(";")[0] }), dur = (performance.now() - r.t0) / 1000;
          X.rec = null; recUI(false);
          addMix(blob, dur, /ogg/.test(mime) ? "ogg" : /mp4/.test(mime) ? "m4a" : "webm");
          toast("Show recorded · " + fmtTime(dur) + " · " + fmtSize(blob.size) + " · download it in the crate below");
        };
        mr.start(1000); X.rec = r; recUI(true);
        toast("Recording the whole show (decks, sampler, mic) — compressed Opus ~1.2 MB/min");
        return;
      }
    }
    if (X.rec && X.rec.on) {
      X.rec.on = false;
      var r = X.rec, sr = ctx.sampleRate, blob = encodeWav(r.L, r.R, r.n, sr), dur = r.n / sr;
      X.rec = null; recUI(false);
      var item = addMix(blob, dur, "wav"); item.peak = r.peak;
      toast("Show recorded · " + fmtTime(dur) + " · " + fmtSize(blob.size) + " WAV · download it in the crate below");
      return;
    }
    X.rec = { on: true, L: [], R: [], n: 0, t0: ctx.currentTime };
    recUI(true);
    toast("Recording the whole show (decks, sampler, mic) to WAV — ~10 MB/min");
  }
  function recUI(on) { $("rec").classList.toggle("on", on); $("rec").textContent = on ? "■ STOP" : "● REC"; $("rec-time").hidden = !on; $("rec-fmt").disabled = on; }
  function recStatus() {
    var r = X.rec; if (!r || !r.on) return "";
    if (r.mr) { var el = (performance.now() - r.t0) / 1000; return fmtTime(el) + " · " + fmtSize(Math.max(r.bytes, el * 20000)); }
    return fmtTime(r.n / ctx.sampleRate) + " · " + fmtSize(44 + r.n * 4);
  }
  var MIXES = [];
  function encodeWav(Ls, Rs, n, sr) {
    var buf = new ArrayBuffer(44 + n * 4), v = new DataView(buf), o = 0, peak = 0;
    function str(s) { for (var i = 0; i < s.length; i++) v.setUint8(o++, s.charCodeAt(i)); }
    str("RIFF"); v.setUint32(o, 36 + n * 4, true); o += 4; str("WAVE"); str("fmt "); v.setUint32(o, 16, true); o += 4;
    v.setUint16(o, 1, true); o += 2; v.setUint16(o, 2, true); o += 2; v.setUint32(o, sr, true); o += 4; v.setUint32(o, sr * 4, true); o += 4;
    v.setUint16(o, 4, true); o += 2; v.setUint16(o, 16, true); o += 2; str("data"); v.setUint32(o, n * 4, true); o += 4;
    for (var c = 0; c < Ls.length; c++) {
      var L = Ls[c], R = Rs[c];
      for (var i = 0; i < L.length; i++) {
        var l = clamp(L[i], -1, 1), r = clamp(R[i], -1, 1);
        if (Math.abs(l) > peak) peak = Math.abs(l); if (Math.abs(r) > peak) peak = Math.abs(r);
        v.setInt16(o, l < 0 ? l * 0x8000 : l * 0x7fff, true); v.setInt16(o + 2, r < 0 ? r * 0x8000 : r * 0x7fff, true); o += 4;
      }
    }
    if (X.rec) X.rec.peak = peak;
    return new Blob([buf], { type: "audio/wav" });
  }

  /* ---------------- controls: knobs + faders (pointer, touch, keyboard) ---------------- */
  var CTL = {};
  function control(el, o) {
    var v = o.value, drag = null, lastTap = 0;
    el.tabIndex = 0; el.setAttribute("role", "slider"); el.setAttribute("aria-label", el.dataset.label || o.name);
    el.setAttribute("aria-valuemin", o.min); el.setAttribute("aria-valuemax", o.max);
    if (o.kind === "knob") el.innerHTML = '<span class="knob-cap"><span class="knob-dot"></span></span><span class="knob-val mono"></span>';
    else el.innerHTML = '<span class="track"><span class="fill"></span><span class="center"></span><span class="thumb"></span></span>';
    var thumb = el.querySelector(".thumb"), cap = el.querySelector(".knob-cap"), val = el.querySelector(".knob-val"), track = el.querySelector(".track"), fill = el.querySelector(".fill");
    function render() {
      var f = (v - o.min) / (o.max - o.min);
      if (o.kind === "knob") { cap.style.transform = "rotate(" + (-135 + f * 270) + "deg)"; val.textContent = o.fmt ? o.fmt(v) : v.toFixed(1); }
      else if (o.kind === "vfader") { thumb.style.bottom = "calc(" + (f * 100) + "% - " + (f * 34) + "px)"; if (fill) fill.style.height = (f * 100) + "%"; }
      else { thumb.style.left = "calc(" + (f * 100) + "% - " + (f * 40) + "px)"; }
      el.setAttribute("aria-valuenow", Math.round(v * 100) / 100);
      el.setAttribute("aria-valuetext", o.fmt ? o.fmt(v) : String(Math.round(v * 100) / 100));
      el.classList.toggle("off-center", o.center != null && Math.abs(v - o.center) > (o.max - o.min) * 0.01);
    }
    function set(nv, user) {
      nv = clamp(nv, o.min, o.max);
      if (o.snap != null && Math.abs(nv - o.snap) < (o.max - o.min) * 0.015) nv = o.snap; // soft detent at centre
      if (nv === v && !user) { render(); return; }
      v = nv; render();
      if (user) o.onChange(v);
    }
    function fromPointer(e) {
      var r = track.getBoundingClientRect();
      if (o.kind === "vfader") { var h = r.height - 34; return o.min + clamp((r.bottom - 17 - e.clientY) / h, 0, 1) * (o.max - o.min); }
      var w = r.width - 40; return o.min + clamp((e.clientX - r.left - 20) / w, 0, 1) * (o.max - o.min);
    }
    el.addEventListener("pointerdown", function (e) {
      if (e.button > 0) return;
      e.preventDefault(); el.focus({ preventScroll: true });
      var now = performance.now();
      if (now - lastTap < 320 && o.def != null) { set(o.def, true); lastTap = 0; return; } // double-tap = reset
      lastTap = now;
      try { el.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ }
      if (o.kind === "knob") drag = { id: e.pointerId, y: e.clientY, x: e.clientX, v: v };
      else {
        var onThumb = e.target === thumb;
        drag = { id: e.pointerId, off: onThumb ? v - fromPointer(e) : 0 };
        if (!onThumb) set(fromPointer(e), true);
      }
      el.classList.add("active");
    });
    el.addEventListener("pointermove", function (e) {
      if (!drag || drag.id !== e.pointerId) return;
      if (o.kind === "knob") { var dd = (drag.y - e.clientY) + (e.clientX - drag.x) * 0.5; set(drag.v + dd / 180 * (o.max - o.min), true); }
      else set(fromPointer(e) + drag.off, true);
    });
    function end(e) { if (drag && drag.id === e.pointerId) { drag = null; el.classList.remove("active"); } }
    el.addEventListener("pointerup", end); el.addEventListener("pointercancel", end);
    el.addEventListener("dblclick", function () { if (o.def != null) set(o.def, true); });
    el.addEventListener("keydown", function (e) {
      var st = (o.max - o.min) / (e.shiftKey ? 100 : 25), k = e.key;
      if (k === "ArrowUp" || k === "ArrowRight") set(v + st, true);
      else if (k === "ArrowDown" || k === "ArrowLeft") set(v - st, true);
      else if (k === "Home" && o.def != null) set(o.def, true);
      else return;
      e.preventDefault(); e.stopPropagation();
    });
    render();
    var api = { get: function () { return v; }, set: set, el: el };
    CTL[o.name] = api;
    return api;
  }

  /* ---------------- UI build ---------------- */
  function deckHTML(id) {
    return '<div class="deck-head"><span class="deck-letter">' + id + '</span><div class="deck-title"><strong class="d-name">Empty deck</strong><span class="d-sub">Load a track from the crate or your device</span></div>' +
      '<label class="btn small file-btn d-loadbtn" title="Load an audio file from this device into deck ' + id + '">Load<input type="file" class="d-file" accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac" hidden></label></div>' +
      '<canvas class="overview" height="46"></canvas>' +
      '<div class="d-info"><span class="d-time mono">0:00.0</span><span class="d-remain mono">-0:00</span><span class="d-bpm"><b class="mono d-bpmv">---.-</b><small>BPM</small></span><span class="d-pitchv mono">0.0%</span></div>' +
      '<div class="d-tt">' +
        '<div class="tt" title="Drag the record to scratch · flick it backwards fast to rewind">' +
          '<div class="platter"><div class="disc">' + discSVG(id) + '</div><div class="sheen"></div><div class="spindle"></div></div>' +
          '<svg class="arm" viewBox="0 0 60 160" aria-hidden="true"><circle cx="40" cy="20" r="15" fill="#2a3244" stroke="#5b6680" stroke-width="2"/><circle cx="40" cy="20" r="6" fill="#8a93a8"/>' +
            '<path d="M40 20 L44 112 L30 140" fill="none" stroke="#c9d1e0" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><rect x="20" y="134" width="20" height="22" rx="3" fill="#1a1f2b" stroke="#c9d1e0" stroke-width="2" transform="rotate(25 30 145)"/></svg>' +
          '<span class="tt-rpm mono">33⅓</span>' +
        '</div>' +
        '<div class="d-pitch"><span class="d-label">PITCH</span><div class="ctl vfader pitch" data-label="Deck ' + id + ' pitch"></div></div>' +
      '</div>' +
      '<div class="d-row d-ttrow"><button type="button" class="pill small d-vinyl" title="Vinyl: touching the record stops it and scratches; motor start / brake. CDJ: the platter nudges tempo while playing">VINYL</button><button type="button" class="pill small d-rw" title="Rewind / wheel-up: spin back and drop in again from the cue (or flick the record backwards)">↺ REWIND</button></div>' +
      '<div class="d-body">' +
        '<div class="d-main">' +
          '<div class="d-transport"><button type="button" class="big cue d-cue" title="Cue: paused = set cue, playing = back to cue">CUE</button><button type="button" class="big play d-play" aria-label="Play / pause deck ' + id + '">▶</button></div>' +
          '<div class="d-row"><button type="button" class="pill d-sync" title="Match tempo + beat to the other deck">SYNC</button><button type="button" class="pill d-key" title="Keylock: change tempo without changing pitch">KEY</button><button type="button" class="pill d-range" title="Pitch range">±8%</button><button type="button" class="pill d-tap" title="Tap the beat 4+ times to set BPM">TAP</button></div>' +
          '<div class="d-row d-bpmrow"><button type="button" class="pill small d-half" title="Half the BPM">½×</button><button type="button" class="pill small d-dbl" title="Double the BPM">2×</button><button type="button" class="pill small d-nudge" data-b="-1" title="Hold to slow down (nudge)">◀◀</button><button type="button" class="pill small d-nudge" data-b="1" title="Hold to speed up (nudge)">▶▶</button><button type="button" class="pill small d-p0" title="Pitch to 0%">0%</button></div>' +
          '<div class="d-label">HOT CUES <small>tap = set / jump · hold = clear</small></div>' +
          '<div class="d-hot">' + [0, 1, 2, 3].map(function (i) { return '<button type="button" class="hot" data-i="' + i + '" style="--hc:' + HOT_COLORS[i] + '">' + (i + 1) + '</button>'; }).join("") + '</div>' +
          '<div class="d-label">LOOP</div>' +
          '<div class="d-loop"><button type="button" class="pill small d-lin">IN</button><button type="button" class="pill small d-lout">OUT</button><button type="button" class="pill small d-l4" title="4-beat loop">4 BT</button><button type="button" class="pill small d-lhalf">½</button><button type="button" class="pill small d-ldbl">×2</button><button type="button" class="pill small d-lexit">EXIT</button></div>' +
        '</div>' +
      '</div>';
  }
  /* record + label art: DJ Psycho Fingers label in the deck colour, grooves, curved text */
  function discSVG(id) {
    var c = id === "A" ? ["#22d3ee", "#0e7490"] : ["#c084fc", "#7e22ce"], g = "";
    for (var r = 50; r <= 96; r += 2.3) g += '<circle cx="100" cy="100" r="' + r.toFixed(1) + '" fill="none" stroke="rgba(255,255,255,' + (r % 9 < 2.3 ? 0.09 : 0.035) + ')" stroke-width="0.6"/>';
    return '<svg viewBox="0 0 200 200" aria-hidden="true"><defs><radialGradient id="lbl' + id + '" cx="40%" cy="35%"><stop offset="0" stop-color="' + c[0] + '"/><stop offset="1" stop-color="' + c[1] + '"/></radialGradient>' +
      '<path id="arc' + id + '" d="M100,100 m-33,0 a33,33 0 1,1 66,0 a33,33 0 1,1 -66,0"/></defs>' +
      '<circle cx="100" cy="100" r="99" fill="#0a0b0e"/><circle cx="100" cy="100" r="98" fill="none" stroke="#1d212b" stroke-width="2"/>' + g +
      '<path d="M100 4 A96 96 0 0 1 168 32" stroke="rgba(255,255,255,.10)" stroke-width="10" fill="none"/>' +
      '<circle cx="100" cy="100" r="44" fill="url(#lbl' + id + ')"/><circle cx="100" cy="100" r="44" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="1.5"/>' +
      '<text font-size="6.6" font-weight="800" fill="#0b0d12" font-family="system-ui,sans-serif"><textPath href="#arc' + id + '" textLength="203" lengthAdjust="spacingAndGlyphs">DJ PSYCHO FINGERS • NATURE ISLE • DOMINICA •</textPath></text>' +
      '<text x="100" y="104" text-anchor="middle" font-size="19" font-weight="900" fill="#0b0d12" font-family="system-ui,sans-serif">PF</text>' +
      '<text x="100" y="117" text-anchor="middle" font-size="5.6" font-weight="700" fill="#0b0d12" font-family="system-ui,sans-serif">SIDE ' + id + ' · 33⅓</text>' +
      '<rect x="98.6" y="57" width="2.8" height="13" rx="1" fill="#fff" opacity=".9"/></svg>';
  }
  function stripHTML(id) {
    return '<div class="strip" data-deck="' + id + '"><span class="strip-letter">' + id + '</span>' +
      '<div class="ctl knob s-trim" data-label="Deck ' + id + ' gain"></div><span class="k-lbl">GAIN</span>' +
      ['HI', 'MID', 'LOW'].map(function (b, j) { var i = 2 - j; return '<div class="eqrow"><div class="ctl knob s-eq" data-i="' + i + '" data-label="Deck ' + id + ' EQ ' + b + '"></div><button type="button" class="kill" data-i="' + i + '" title="Kill ' + b + '">' + b + '</button></div>'; }).join("") +
      '<div class="ctl knob s-filter" data-label="Deck ' + id + ' filter"></div><span class="k-lbl">FILTER</span>' +
      '<div class="fader-row"><div class="meter"><span class="meter-fill"></span></div><div class="ctl vfader chan" data-label="Deck ' + id + ' volume"></div></div>' +
      '</div>';
  }
  function buildUI() {
    DECKS.forEach(function (d) { $("deck-" + d.id).innerHTML = deckHTML(d.id); });
    $("mixer").innerHTML = '<div class="mix-title"><span class="label">MIXER</span><span class="lim" id="lim" title="Master limiter working">LIMIT</span></div>' +
      '<div class="strips">' + stripHTML("A") + stripHTML("B") + '</div>' +
      '<div class="master"><div class="ctl knob m-vol" data-label="Master volume"></div><span class="k-lbl">MASTER</span><div class="meter meter-h" id="master-meter"><span class="meter-fill"></span></div><span class="clip" id="clip" title="Clip">CLIP</span></div>';
    DECKS.forEach(function (d) {
      var root = $("deck-" + d.id), strip = document.querySelector('.strip[data-deck="' + d.id + '"]'), q = function (s) { return root.querySelector(s); };
      var tt = q(".tt"), plat = q(".platter");
      d.el = { tt: tt, plat: plat, disc: q(".disc"), arm: q(".arm"), vinyl: q(".d-vinyl"), root: root, strip: strip, name: q(".d-name"), sub: q(".d-sub"), ov: q(".overview"), time: q(".d-time"), remain: q(".d-remain"), bpm: q(".d-bpmv"), pitchv: q(".d-pitchv"),
        play: q(".d-play"), cue: q(".d-cue"), sync: q(".d-sync"), key: q(".d-key"), range: q(".d-range"), hot: root.querySelectorAll(".hot"), lexit: q(".d-lexit"),
        lin: q(".d-lin"), lout: q(".d-lout"), meter: strip.querySelector(".meter-fill"), kills: strip.querySelectorAll(".kill"), zoom: $("zoom-" + d.id), xfPlay: document.querySelector('.xf-play[data-deck="' + d.id + '"]') };
      q(".d-play").addEventListener("click", function () { toggle(d); });
      plat.addEventListener("pointerdown", function (e) { ttDown(d, plat, e); });
      plat.addEventListener("pointermove", function (e) { ttMove(d, plat, e); });
      plat.addEventListener("pointerup", function (e) { ttUp(d, plat, e); });
      plat.addEventListener("pointercancel", function (e) { ttUp(d, plat, e); });
      plat.addEventListener("lostpointercapture", function (e) { ttUp(d, plat, e); });
      plat.addEventListener("contextmenu", function (e) { e.preventDefault(); });
      q(".d-vinyl").addEventListener("click", function () { d.vinyl = !d.vinyl; ui(d); savePrefs(); toast("Deck " + d.id + (d.vinyl ? ": VINYL mode — touch the record to stop & scratch, motor start/brake" : ": CDJ mode — platter nudges tempo while playing, scratches when paused, instant start/stop")); });
      q(".d-rw").addEventListener("click", function () { rewind(d); });
      q(".d-cue").addEventListener("click", function () { cue(d); });
      q(".d-sync").addEventListener("click", function () { doSync(d); });
      q(".d-key").addEventListener("click", function () { if (d.ext) { toast("YouTube decks always keep their key when the speed changes (the player preserves pitch)."); return; } d.keylock = !d.keylock; reanchor(d); if (ctx) applyKeylock(d); ui(d); savePrefs(); toast("Deck " + d.id + " keylock " + (d.keylock ? "on" : "off")); });
      q(".d-range").addEventListener("click", function () { d.range = d.range === 8 ? 16 : 8; setPitch(d, d.pitch); CTL[d.id + ".pitch"].set(d.pitch / d.range); savePrefs(); });
      q(".d-tap").addEventListener("click", function () { tapTempo(d); });
      q(".d-half").addEventListener("click", function () { scaleBpm(d, 0.5); });
      q(".d-dbl").addEventListener("click", function () { scaleBpm(d, 2); });
      q(".d-p0").addEventListener("click", function () { d.sync = false; setPitch(d, 0); CTL[d.id + ".pitch"].set(0); });
      root.querySelectorAll(".d-nudge").forEach(function (b) {
        var on = function (e) { e.preventDefault(); setBend(d, 0.04 * +b.dataset.b); b.classList.add("held"); };
        var off = function () { if (d.bend) setBend(d, 0); b.classList.remove("held"); };
        b.addEventListener("pointerdown", on); b.addEventListener("pointerup", off); b.addEventListener("pointerleave", off); b.addEventListener("pointercancel", off);
      });
      d.el.hot.forEach(function (b) {
        var i = +b.dataset.i, timer = null, long = false;
        b.addEventListener("pointerdown", function () { long = false; timer = setTimeout(function () { long = true; if (d.hot[i] != null) hotCue(d, i, true); }, 600); });
        var up = function () { clearTimeout(timer); };
        b.addEventListener("pointerup", up); b.addEventListener("pointerleave", up); b.addEventListener("pointercancel", up);
        b.addEventListener("click", function () { if (!long) hotCue(d, i); });
        b.addEventListener("contextmenu", function (e) { e.preventDefault(); });
      });
      q(".d-lin").addEventListener("click", function () { loopIn(d); });
      q(".d-lout").addEventListener("click", function () { loopOut(d); });
      q(".d-l4").addEventListener("click", function () { autoLoop(d, 4); });
      q(".d-lhalf").addEventListener("click", function () { loopScale(d, 0.5); });
      q(".d-ldbl").addEventListener("click", function () { loopScale(d, 2); });
      q(".d-lexit").addEventListener("click", function () { if (d.loop.out > d.loop.in) setLoopOn(d, !d.loop.on); });
      q(".d-file").addEventListener("change", function (e) { var f = e.target.files[0]; e.target.value = ""; if (f) loadInto(d, fileItem(f)); });
      d.el.ov.addEventListener("pointerdown", function (e) { if (!d.buf) return; var r = d.el.ov.getBoundingClientRect(); seek(d, (e.clientX - r.left) / r.width * d.buf.duration); });
      root.addEventListener("dragover", function (e) { e.preventDefault(); root.classList.add("drop"); });
      root.addEventListener("dragleave", function () { root.classList.remove("drop"); });
      root.addEventListener("drop", function (e) { e.preventDefault(); root.classList.remove("drop"); var f = e.dataTransfer.files[0]; if (f) loadInto(d, fileItem(f)); });
      d.el.xfPlay.addEventListener("click", function () { toggle(d); });
      control(q(".pitch"), { name: d.id + ".pitch", kind: "vfader", min: -1, max: 1, value: 0, def: 0, snap: 0, center: 0,
        onChange: function (v) { d.sync = false; setPitch(d, v * d.range); } });
      control(strip.querySelector(".s-trim"), { name: d.id + ".trim", kind: "knob", min: -12, max: 12, value: 0, def: 0, snap: 0, center: 0, fmt: function (v) { return (v > 0 ? "+" : "") + v.toFixed(1); },
        onChange: function (v) { d.trimDb = v; applyDeckMix(d); } });
      strip.querySelectorAll(".s-eq").forEach(function (k) {
        var i = +k.dataset.i;
        control(k, { name: d.id + ".eq" + ["Low", "Mid", "High"][i], kind: "knob", min: -26, max: 6, value: d.eq[i], def: 0, snap: 0, center: 0, fmt: function (v) { return (v > 0 ? "+" : "") + Math.round(v); },
          onChange: function (v) { d.eq[i] = v; applyDeckMix(d); savePrefs(); } });
      });
      d.el.kills.forEach(function (b) { b.addEventListener("click", function () { var i = +b.dataset.i; d.kill[i] = !d.kill[i]; b.classList.toggle("on", d.kill[i]); ensureCtx(); applyDeckMix(d); }); });
      control(strip.querySelector(".s-filter"), { name: d.id + ".filter", kind: "knob", min: -1, max: 1, value: d.filter, def: 0, snap: 0, center: 0,
        fmt: function (v) { return Math.abs(v) < 0.02 ? "OFF" : (v < 0 ? "LP " : "HP ") + Math.round(Math.abs(v) * 100); },
        onChange: function (v) { d.filter = v; applyDeckMix(d); savePrefs(); } });
      control(strip.querySelector(".chan"), { name: d.id + ".vol", kind: "vfader", min: 0, max: 1, value: d.vol, def: 0.8,
        onChange: function (v) { d.vol = v; applyDeckMix(d); savePrefs(); } });
      ui(d);
    });
    control($("xf"), { name: "xf", kind: "hfader", min: -1, max: 1, value: X.xf, def: 0, snap: 0, center: 0, onChange: function (v) { X.xf = v; applyXf(); savePrefs(); } });
    control(document.querySelector(".m-vol"), { name: "master", kind: "knob", min: 0, max: 1, value: X.master, def: 0.85, fmt: function (v) { return Math.round(v * 100) + "%"; },
      onChange: function (v) { X.master = v; DECKS.forEach(extVol); if (ctx) M.vol.gain.setTargetAtTime(v, ctx.currentTime, 0.01); savePrefs(); emit("master", v); } });
    var curveName = function () { return X.curve === "cut" ? "Cut" : X.curve === "scratch" ? "Scratch" : "Smooth"; };
    $("xf-curve").textContent = curveName();
    $("xf-curve").addEventListener("click", function () { X.curve = X.curve === "smooth" ? "cut" : X.curve === "cut" ? "scratch" : "smooth"; $("xf-curve").textContent = curveName(); applyXf(); savePrefs(); toast("Crossfader curve: " + curveName() + (X.curve === "scratch" ? " (razor-sharp cut for scratching)" : X.curve === "cut" ? " (fast cut)" : " (smooth blend)")); });
    $("xf-ham").classList.toggle("on", X.ham);
    $("xf-ham").addEventListener("click", function () { X.ham = !X.ham; $("xf-ham").classList.toggle("on", X.ham); applyXf(); savePrefs(); toast(X.ham ? "Hamster on: crossfader reversed" : "Hamster off"); });
    $("rec-fmt").value = X.recFmt;
    $("rec-fmt").addEventListener("change", function () { X.recFmt = $("rec-fmt").value === "webm" ? "webm" : "wav"; savePrefs(); });
    $("rec").addEventListener("click", toggleRec);
    document.querySelectorAll(".lib-tab").forEach(function (b) { b.addEventListener("click", function () { showLib(b.dataset.lib); }); });
    $("lib-file").addEventListener("change", function (e) {
      var f = e.target.files[0]; e.target.value = "";
      if (!f) return;
      var d = !DECKS[0].buf ? DECKS[0] : !DECKS[1].buf ? DECKS[1] : !DECKS[0].playing ? DECKS[0] : DECKS[1];
      loadInto(d, fileItem(f));
    });
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", sizeCanvases);
    sizeCanvases();
    showLib("beats");
  }
  function onKey(e) {
    if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
    var k = e.key.toLowerCase(), A = DECKS[0], B = DECKS[1], map = { q: [toggle, A], p: [toggle, B], w: [cue, A], o: [cue, B], a: [doSync, A], l: [doSync, B] };
    if (map[k]) { emit("manual"); map[k][0](map[k][1]); e.preventDefault(); return; }
    if (k === "z") { rewind(A); e.preventDefault(); return; }
    if (k === "x") { rewind(B); e.preventDefault(); return; }
    var hi = "1234".indexOf(k), hj = "7890".indexOf(k);
    if (hi >= 0) { hotCue(A, hi); e.preventDefault(); } else if (hj >= 0) { hotCue(B, hj); e.preventDefault(); }
  }

  /* ---------------- crate list ---------------- */
  var libTab = "beats", LIBTABS = {};
  function row(item) {
    var r = document.createElement("div");
    r.className = "lib-row";
    r.innerHTML = '<div class="lib-main"><strong></strong><span class="mono"></span></div><div class="lib-acts"><button type="button" class="btn small to-a">→ A</button><button type="button" class="btn small to-b">→ B</button></div>';
    r.querySelector("strong").textContent = item.name; r.querySelector(".mono").textContent = item.sub || "";
    r.querySelector(".to-a").addEventListener("click", function () { loadInto(DECKS[0], item); });
    r.querySelector(".to-b").addEventListener("click", function () { loadInto(DECKS[1], item); });
    if (item.url) { var ext = item.ext || "wav", a = document.createElement("a"); a.className = "btn small ghost"; a.textContent = "Download " + ext.toUpperCase(); a.href = item.url; a.download = item.name.replace(/[^\w\- ]+/g, "").replace(/\s+/g, "_") + "." + ext; r.querySelector(".lib-acts").appendChild(a); }
    if (item.noDeck) { r.querySelector(".to-a").remove(); r.querySelector(".to-b").remove(); }
    if (item.mix && window.PFECO) { var sp = document.createElement("button"); sp.type = "button"; sp.className = "btn small eco-send"; sp.textContent = item.mix.playerId ? "In Player ✓" : "Send to Player"; sp.title = "Save this recording to the Psycho Fingers Player library"; sp.addEventListener("click", function () { window.PFECO.sendMix(item.mix, sp); }); r.querySelector(".lib-acts").appendChild(sp); }
    return r;
  }
  function showLib(tab) {
    libTab = tab;
    document.querySelectorAll(".lib-tab").forEach(function (b) { b.classList.toggle("on", b.dataset.lib === tab); });
    var list = $("lib-list"); list.innerHTML = "";
    if (tab === "beats") BUILTIN.forEach(function (it) { list.appendChild(row(it)); });
    else if (tab === "mixes") {
      if (!MIXES.length) list.innerHTML = '<p class="empty">Press ● REC in the top bar to record your mix (master output, after the limiter). Recordings stay in this tab until you leave the page — download them to keep.</p>';
      MIXES.forEach(function (m) { list.appendChild(row({ name: m.name, sub: fmtTime(m.dur) + " · " + (m.ext || "wav").toUpperCase() + " · " + fmtSize(m.blob.size), url: m.url, ext: m.ext, noDeck: m.video, mix: m, get: function () { return m.blob.arrayBuffer(); } })); });
    } else if (LIBTABS[tab]) { LIBTABS[tab](list);
    } else {
      list.innerHTML = '<p class="empty">Reading the Island Pin Beats Vault…</p>';
      vaultList().then(function (rows) {
        if (libTab !== "vault") return;
        list.innerHTML = "";
        if (!rows.length) { list.innerHTML = '<p class="empty">No bounces or takes yet. Make a beat in <a href="../beats/">Island Pin Beats</a>, then Bounce or Record — it shows up here on this device.</p>'; return; }
        rows.forEach(function (x) {
          list.appendChild(row({ name: x.name || "Vault item", sub: "Beats Vault · " + fmtTime(x.duration) + (x.created ? " · " + new Date(x.created).toLocaleDateString([], { month: "short", day: "numeric" }) : ""),
            bpmHint: bpmFromName(x.name), get: function () { return x.blob.arrayBuffer(); } }));
        });
      });
    }
  }

  /* ---------------- rendering ---------------- */
  function sizeCanvases() {
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    document.querySelectorAll("canvas.zoom, canvas.overview").forEach(function (c) {
      var w = Math.max(50, c.clientWidth), h = c.classList.contains("zoom") ? (window.innerWidth < 560 ? 52 : 64) : 46;
      c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); c._dpr = dpr;
    });
    DECKS.forEach(function (d) { d.ovDirty = true; });
  }
  function deckColor(d) { return d.id === "A" ? "#22d3ee" : "#c084fc"; }
  function drawOverview(d) {
    var c = d.el.ov, g = c.getContext("2d"), W = c.width, H = c.height, dpr = c._dpr || 1;
    if (!d.ovImg || d.ovDirty) {
      g.clearRect(0, 0, W, H);
      g.fillStyle = "#0e1118"; g.fillRect(0, 0, W, H);
      if (d.peaks) {
        var ov = d.peaks.ov, n = ov.length;
        g.fillStyle = deckColor(d) + "88";
        for (var x = 0; x < W; x++) { var v = ov[Math.floor(x / W * n)] || 0, h = Math.max(1, v * (H - 4)); g.fillRect(x, (H - h) / 2, 1, h); }
      }
      d.ovImg = g.getImageData(0, 0, W, H); d.ovDirty = false;
    } else g.putImageData(d.ovImg, 0, 0);
    if (!d.buf) return;
    var dur = d.buf.duration, p = pos(d) / dur;
    g.fillStyle = "rgba(255,255,255,.10)"; g.fillRect(0, 0, p * W, H);
    if (d.loop.out > d.loop.in) { g.fillStyle = d.loop.on ? "rgba(52,211,153,.30)" : "rgba(52,211,153,.14)"; g.fillRect(d.loop.in / dur * W, 0, Math.max(2, (d.loop.out - d.loop.in) / dur * W), H); }
    g.fillStyle = "#f59e0b"; g.fillRect(d.cue / dur * W - dpr, 0, 2 * dpr, 7 * dpr);
    d.hot.forEach(function (h, i) { if (h != null) { g.fillStyle = HOT_COLORS[i]; g.fillRect(h / dur * W - dpr, H - 6 * dpr, 2 * dpr, 6 * dpr); } });
    g.fillStyle = "#fff"; g.fillRect(p * W - dpr, 0, 2 * dpr, H);
  }
  function drawZoom(d) {
    var c = d.el.zoom, g = c.getContext("2d"), W = c.width, H = c.height, dpr = c._dpr || 1, mid = H / 2;
    g.fillStyle = "#0b0e15"; g.fillRect(0, 0, W, H);
    g.fillStyle = "rgba(255,255,255,.35)"; g.font = (10 * dpr) + "px ui-monospace, monospace"; g.fillText(d.id, 5 * dpr, 12 * dpr);
    if (!d.buf || !d.peaks) { g.fillStyle = "rgba(255,255,255,.25)"; g.fillText(d.ext ? "Deck " + d.id + " · YouTube — no waveform (audio stays in YouTube's player) · " + (d.playing ? "▶ " : "") + fmtTime(pos(d)) : "Deck " + d.id + " · empty", 18 * dpr, 12 * dpr); return; }
    var span = 6, p = pos(d), sr = d.buf.sampleRate, bs = d.peaks.bs, dm = d.peaks.dmax, dl = d.peaks.dlow, t0 = p - span / 2, col = deckColor(d);
    var secPerPx = span / W;
    for (var x = 0; x < W; x++) {
      var ta = t0 + x * secPerPx, tb = ta + secPerPx;
      if (tb < 0 || ta > d.buf.duration) continue;
      var ia = Math.max(0, Math.floor(ta * sr / bs)), ib = Math.min(dm.length, Math.ceil(tb * sr / bs)), m = 0, ml = 0;
      for (var i = ia; i < ib; i++) { if (dm[i] > m) m = dm[i]; if (dl[i] > ml) ml = dl[i]; }
      var h = m * (H - 6) / 2, hl = Math.min(h, ml * 1.6 * (H - 6) / 2);
      g.fillStyle = col; g.globalAlpha = 0.55; g.fillRect(x, mid - h, 1, 2 * h);
      g.globalAlpha = 1; g.fillStyle = "#f8fafc"; g.fillRect(x, mid - hl, 1, 2 * hl);
    }
    g.globalAlpha = 1;
    var L = beatLen(d);
    if (L) {
      var k0 = Math.ceil((t0 - d.grid) / L);
      for (var k = k0; d.grid + k * L < t0 + span; k++) { var bx = (d.grid + k * L - t0) / secPerPx; g.fillStyle = k % 4 === 0 ? "rgba(255,255,255,.45)" : "rgba(255,255,255,.14)"; g.fillRect(bx, 0, k % 4 === 0 ? 1.5 * dpr : dpr, H); }
    }
    if (d.loop.out > d.loop.in) { g.fillStyle = d.loop.on ? "rgba(52,211,153,.22)" : "rgba(52,211,153,.10)"; g.fillRect((d.loop.in - t0) / secPerPx, 0, (d.loop.out - d.loop.in) / secPerPx, H); }
    g.fillStyle = "#f59e0b"; g.fillRect((d.cue - t0) / secPerPx - dpr, 0, 2 * dpr, H * 0.3);
    d.hot.forEach(function (h, i) { if (h != null) { g.fillStyle = HOT_COLORS[i]; g.fillRect((h - t0) / secPerPx - dpr, H * 0.7, 2 * dpr, H * 0.3); } });
    g.fillStyle = "#f43f5e"; g.fillRect(W / 2 - dpr, 0, 2 * dpr, H);
  }
  function peakOf(an) { var a = an._buf || (an._buf = new Float32Array(an.fftSize)); an.getFloatTimeDomainData(a); var m = 0; for (var i = 0; i < a.length; i++) { var v = a[i] < 0 ? -a[i] : a[i]; if (v > m) m = v; } return m; }
  var clipHold = 0, masterPeakMax = 0;
  function frame() {
    DECKS.forEach(function (d) {
      drawOverview(d); drawZoom(d);
      var ang = ((d.tt.hand && !d.tt.hand.bend ? d.tt.hp : pos(d)) * 360 / SEC_PER_REV) % 360;
      if (d.el.disc._a !== ang) { d.el.disc.style.transform = "rotate(" + ang.toFixed(2) + "deg)"; d.el.disc._a = ang; }
      var arm = d.buf ? 14 + 20 * clamp(pos(d) / d.buf.duration, 0, 1) : -14;
      if (d.el.arm._a !== arm) { d.el.arm.style.transform = "rotate(" + arm.toFixed(2) + "deg)"; d.el.arm._a = arm; }
      if (d.buf) {
        var p = pos(d); d.el.time.textContent = fmtTime(p) + "." + Math.floor((p % 1) * 10); d.el.remain.textContent = "-" + fmtTime(d.buf.duration - p);
      }
      if (ctx && d.n) { var pk = peakOf(d.n.an); d.el.meter.style.height = Math.min(100, Math.sqrt(pk) * 100) + "%"; d.el.meter.classList.toggle("hot", pk > 0.9); }
    });
    if (ctx && M) {
      var mp = peakOf(M.an); masterPeakMax = Math.max(masterPeakMax, mp);
      var mm = document.querySelector("#master-meter .meter-fill"); mm.style.width = Math.min(100, Math.sqrt(mp) * 100) + "%";
      if (mp >= 0.985) clipHold = performance.now() + 1500;
      $("clip").classList.toggle("on", performance.now() < clipHold);
      $("lim").classList.toggle("on", M.lim.reduction < -0.8);
      if (X.rec && X.rec.on) $("rec-time").textContent = recStatus();
    }
    requestAnimationFrame(frame);
  }
  function ui(d) {
    var e = d.el;
    if (!e) return;
    e.name.textContent = d.line ? "LINE IN · " + d.line.label : d.loading ? "Loading…" : d.buf ? d.name : "Empty deck";
    e.sub.textContent = d.line ? "Live input · processing off · through EQ, filter, fader" + (d.buf ? " · track paused: " + d.name : "") : d.buf ? (d.sub ? d.sub + " · " : "") + fmtTime(d.buf.duration) : "Load a track from the crate or your device";
    e.root.classList.toggle("line", !!d.line);
    e.play.textContent = d.playing ? "❚❚" : "▶"; e.play.classList.toggle("on", d.playing);
    e.xfPlay.textContent = d.id === "A" ? (d.playing ? "❚❚ A" : "▶ A") : (d.playing ? "B ❚❚" : "B ▶"); e.xfPlay.classList.toggle("on", d.playing);
    e.cue.classList.toggle("at", !!d.buf && !d.playing && Math.abs(d.pos - d.cue) < 0.01);
    var eb = effBpm(d);
    e.bpm.textContent = eb ? eb.toFixed(1) : "---.-";
    e.bpm.title = d.bpm ? "Track " + d.bpm + " BPM (" + (d.bpmSrc === "auto" ? "detected" : d.bpmSrc === "tap" ? "tapped" : "tagged") + ")" : "No BPM yet — tap it";
    e.pitchv.textContent = (d.pitch >= 0 ? "+" : "") + d.pitch.toFixed(1) + "%";
    e.sync.classList.toggle("on", d.sync); e.key.classList.toggle("on", d.keylock); e.range.textContent = "±" + d.range + "%";
    e.hot.forEach(function (b, i) { b.classList.toggle("set", d.hot[i] != null); });
    e.lin.classList.toggle("on", d.loop.in != null); e.lout.classList.toggle("on", d.loop.out != null);
    e.lexit.textContent = d.loop.on ? "EXIT" : "RELOOP"; e.lexit.classList.toggle("on", d.loop.on);
    e.root.classList.toggle("playing", d.playing); e.root.classList.toggle("loaded", !!d.buf);
    e.vinyl.textContent = d.vinyl ? "VINYL" : "CDJ"; e.vinyl.classList.toggle("on", d.vinyl);
    e.root.classList.toggle("ext", !!d.ext); e.strip.classList.toggle("ext", !!d.ext);
    var pc = CTL[d.id + ".pitch"]; if (pc && Math.abs(pc.get() * d.range - d.pitch) > 0.01) pc.set(d.pitch / d.range);
  }
  function nowPlaying() {
    var live = DECKS.filter(function (d) { return d.playing; }).map(function (d) { return d.id + ": " + d.name; });
    $("now-playing").textContent = live.length ? "Now playing — " + live.join(" · ") : DECKS.some(function (d) { return d.buf; }) ? "Decks loaded: " + DECKS.filter(function (d) { return d.buf; }).map(function (d) { return d.id + ": " + d.name; }).join(" · ") : "Two decks, EQ, filter, sync & crossfader. Load a beat to start.";
  }

  /* ---------------- test / debug hook ---------------- */
  window.IPBDJ = {
    info: function () {
      return {
        ctx: ctx ? ctx.state : "none", sr: ctx ? ctx.sampleRate : 0, xf: X.xf, curve: X.curve, xfGains: xfGains(), master: X.master, masterPeakMax: masterPeakMax,
        limiting: M ? M.lim.reduction : 0, rec: !!(X.rec && X.rec.on), mixes: MIXES.map(function (m) { return { name: m.name, dur: m.dur, size: m.blob.size, peak: m.peak }; }),
        decks: DECKS.map(function (d) {
          return { id: d.id, ext: d.ext ? d.ext.kind : null, name: d.name, loaded: !!d.buf, dur: d.buf ? d.buf.duration : 0, playing: d.playing, pos: pos(d), raw: rawPos(d), cue: d.cue, bpm: d.bpm, grid: d.grid, bpmSrc: d.bpmSrc,
            eff: effBpm(d), rate: rate(d), pitch: d.pitch, range: d.range, keylock: d.keylock, sync: d.sync, hot: d.hot.slice(), loop: JSON.parse(JSON.stringify(d.loop)),
            vol: d.vol, eq: d.eq.slice(), kill: d.kill.slice(), filter: d.filter, trimDb: d.trimDb, autoDb: d.autoDb, rideDb: d.rideDb || 0, keyShift: d.keyShift || 0, key: d.key || null, line: !!d.line,
            filt: d.n ? { type: d.n.filt.type, f: d.n.filt.frequency.value } : null, gains: d.n ? { low: d.n.low.gain.value, mid: d.n.mid.gain.value, high: d.n.high.gain.value, fader: d.n.fader.gain.value, xf: d.n.xf.gain.value } : null,
            peak: d.n ? peakOf(d.n.an) : 0 };
        })
      };
    },
    peak: function () { return M ? peakOf(M.an) : 0; },
    resetPeak: function () { masterPeakMax = 0; },
    set: function (name, v) { var c = CTL[name]; if (c) c.set(v, true); return !!c; },
    load: function (deck, id) { var it = BUILTIN.filter(function (b) { return b.id === id; })[0]; return it ? loadInto(BY[deck], it) : Promise.resolve(false); },
    scratch: function (deck) { var d = BY[deck]; return { engine: scratchOK(d), scr: !!d.scr, hand: !!d.tt.hand, rate: d.scr && d.scrRep ? d.scrRep.rate : (d.playing ? rate(d) : 0), handVel: d.tt.hand ? handVel(d) : 0, lastFlick: d.lastFlick || 0, rateMax: d.tt.rmax || 0, rateMin: d.tt.rmin || 0, pos: pos(d), hp: d.tt.hp, vinyl: d.vinyl, playing: d.playing, src: !!d.src }; },
    rewind: function (deck) { rewind(BY[deck]); },
    phase: function () { // beat-phase difference between the decks (in beats, heard positions)
      var A = DECKS[0], B = DECKS[1]; if (!A.bpm || !B.bpm) return null;
      var pa = ((pos(A) - A.grid) / beatLen(A)) % 1, pb = ((pos(B) - B.grid) / beatLen(B)) % 1, d = pa - pb; d -= Math.round(d); return d;
    }
  };

  /* ---------------- API for the add-on modules (sampler, mic, video, library, auto DJ) ---------------- */
  window.PFDJ = {
    get ctx() { return ctx; }, get M() { return M; }, X: X, DECKS: DECKS, BY: BY, BUILTIN: BUILTIN, MIXES: MIXES, CTL: CTL,
    on: on, emit: emit, ensureCtx: ensureCtx, toast: toast, fmtTime: fmtTime, fmtSize: fmtSize, clamp: clamp, db2g: db2g, decode: decode,
    loadInto: loadInto, play: play, pause: pause, toggle: toggle, seek: seek, cue: cue, doSync: doSync, setPitch: setPitch, rewind: rewind,
    pos: pos, rawPos: rawPos, rate: rate, effBpm: effBpm, beatLen: beatLen, estimateBpm: estimateBpm, applyDeckMix: applyDeckMix, applyXf: applyXf, xfGains: xfGains,
    ui: ui, other: other, showLib: showLib, LIBTABS: LIBTABS, addMix: addMix, audioStream: audioStream, pickMime: pickMime, bpmFromName: bpmFromName, isMaster: isMaster,
    control: control, savePrefs: savePrefs, setKeyShift: setKeyShift, applyKeylock: applyKeylock, KL_D: KL_D, nowPlaying: nowPlaying,
    setExt: setExt, extEnded: extEnded, extState: extState, extVol: extVol,
    get libTab() { return libTab; }, get recording() { return !!(X.rec && X.rec.on); }
  };
  buildUI();
  requestAnimationFrame(frame);
  document.addEventListener("pointerdown", function once() { ensureCtx(); document.removeEventListener("pointerdown", once, true); }, true);
})();
