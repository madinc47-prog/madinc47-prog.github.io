/* DJ Psycho Fingers — live mic / MC channel: echo cancellation, noise suppression and auto-gain toggles, gain, 3-band EQ,
 * reverb + echo sends, talkover (ducks the music while you speak), mute, level meter. Feeds the master (so REC gets it). */
(function () {
  "use strict";
  var P = window.PFDJ; if (!P) return;
  var $ = function (id) { return document.getElementById(id); };
  var MK = "pfdj_mic_v1", d0 = { ec: true, ns: true, agc: false, gain: 0, eq: [0, 0, 0], verb: 0.12, echo: 0, duck: true, depth: 10, mute: false };
  var C = d0; try { var s = JSON.parse(localStorage.getItem(MK) || "null"); if (s) { C = Object.assign({}, d0, s); C.mute = false; } } catch (e) { /* ignore */ }
  var N = null, stream = null, on = false, duckOn = false, holdUntil = 0, timer = null, starting = false;
  function save() { try { localStorage.setItem(MK, JSON.stringify(C)); } catch (e) { /* ignore */ } }
  function ir(ctx, sec) {
    var n = Math.round(ctx.sampleRate * sec), b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (var c = 0; c < 2; c++) { var d = b.getChannelData(c), lp = 0; for (var i = 0; i < n; i++) { var x = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3.2); lp += 0.55 * (x - lp); d[i] = lp; } }
    return b;
  }
  function graph() {
    if (N) return N;
    var ctx = P.ensureCtx(); if (!ctx) return null;
    N = {};
    N.inG = ctx.createGain();
    N.hp = ctx.createBiquadFilter(); N.hp.type = "highpass"; N.hp.frequency.value = 90;
    N.low = ctx.createBiquadFilter(); N.low.type = "lowshelf"; N.low.frequency.value = 200;
    N.mid = ctx.createBiquadFilter(); N.mid.type = "peaking"; N.mid.frequency.value = 1500; N.mid.Q.value = 0.8;
    N.high = ctx.createBiquadFilter(); N.high.type = "highshelf"; N.high.frequency.value = 5000;
    N.comp = ctx.createDynamicsCompressor(); N.comp.threshold.value = -22; N.comp.ratio.value = 4; N.comp.attack.value = 0.004; N.comp.release.value = 0.15; N.comp.knee.value = 8;
    N.mute = ctx.createGain();
    N.out = ctx.createGain(); N.out.gain.value = 1.3;
    N.an = ctx.createAnalyser(); N.an.fftSize = 1024;
    N.vs = ctx.createGain(); N.conv = ctx.createConvolver(); N.conv.buffer = ir(ctx, 2.2);
    N.es = ctx.createGain(); N.dl = ctx.createDelay(2); N.fb = ctx.createGain(); N.fb.gain.value = 0.38; N.elp = ctx.createBiquadFilter(); N.elp.type = "lowpass"; N.elp.frequency.value = 3200;
    N.inG.connect(N.hp); N.hp.connect(N.low); N.low.connect(N.mid); N.mid.connect(N.high); N.high.connect(N.comp); N.comp.connect(N.mute);
    N.mute.connect(N.out); N.mute.connect(N.an); N.out.connect(P.M.bus);
    N.mute.connect(N.vs); N.vs.connect(N.conv); N.conv.connect(P.M.bus);
    N.mute.connect(N.es); N.es.connect(N.dl); N.dl.connect(N.elp); N.elp.connect(N.fb); N.fb.connect(N.dl); N.elp.connect(P.M.bus);
    apply();
    return N;
  }
  function echoTime() {
    var d = P.DECKS.filter(function (x) { return x.playing && x.bpm; })[0];
    return d ? P.clamp(0.75 * 60 / P.effBpm(d), 0.15, 1.2) : 0.375; // dotted 8th of the playing deck
  }
  function apply() {
    $("mic-mute").classList.toggle("on", C.mute); $("mic-mute").textContent = C.mute ? "MUTED" : "MUTE";
    ["ec", "ns", "agc", "duck"].forEach(function (k) { $("mic-" + k).classList.toggle("on", !!C[k]); });
    if (!N) return;
    var t = P.ctx.currentTime;
    N.inG.gain.setTargetAtTime(P.db2g(C.gain), t, 0.02);
    N.low.gain.setTargetAtTime(C.eq[0], t, 0.02); N.mid.gain.setTargetAtTime(C.eq[1], t, 0.02); N.high.gain.setTargetAtTime(C.eq[2], t, 0.02);
    N.mute.gain.setTargetAtTime(C.mute || !on ? 0 : 1, t, 0.01);
    N.vs.gain.setTargetAtTime(C.verb * 0.9, t, 0.02);
    N.es.gain.setTargetAtTime(C.echo * 0.8, t, 0.02);
    N.dl.delayTime.setTargetAtTime(echoTime(), t, 0.05);
  }
  function start() {
    if (starting) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { P.toast("This browser can't use the microphone here (needs HTTPS and mic permission)."); return; }
    if (!graph()) return;
    starting = true;
    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: C.ec, noiseSuppression: C.ns, autoGainControl: C.agc, channelCount: 1 }, video: false }).then(function (st) {
      starting = false;
      stopStream();
      stream = st; N.src = P.ctx.createMediaStreamSource(st); N.src.connect(N.inG);
      on = true; apply(); ui();
      if (!timer) timer = setInterval(tick, 30);
      P.toast("Mic live 🎤 — wear headphones (or keep the mic away from the speakers) to avoid feedback");
    }).catch(function (e) { starting = false; on = false; ui(); P.toast("Mic blocked or unavailable" + (e && e.name ? " (" + e.name + ")" : "") + " — allow the microphone for this site."); });
  }
  function stopStream() { if (N && N.src) { try { N.src.disconnect(); } catch (e) { /* ignore */ } N.src = null; } if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; } }
  function stop() { stopStream(); on = false; apply(); ui(); setDuck(false); }
  function setDuck(v) {
    if (v === duckOn || !P.M) return; duckOn = v;
    var g = P.M.music.gain, t = P.ctx.currentTime;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t);
    g.setTargetAtTime(v ? P.db2g(-C.depth) : 1, t, v ? 0.035 : 0.28);
    $("mic-duckled").classList.toggle("on", v);
  }
  var lvlBuf = null;
  function level() { if (!N) return 0; lvlBuf = lvlBuf || new Float32Array(N.an.fftSize); N.an.getFloatTimeDomainData(lvlBuf); var s = 0, m = 0; for (var i = 0; i < lvlBuf.length; i++) { s += lvlBuf[i] * lvlBuf[i]; m = Math.max(m, Math.abs(lvlBuf[i])); } return { rms: Math.sqrt(s / lvlBuf.length), peak: m }; }
  function tick() {
    if (!on) { setDuck(false); return; }
    var l = level(), now = performance.now();
    if (C.duck && !C.mute && l.rms > 0.018) holdUntil = now + 450;
    setDuck(C.duck && !C.mute && now < holdUntil);
    var mm = $("mic-meter").firstChild; mm.style.width = Math.min(100, Math.sqrt(l.peak) * 100) + "%";
    $("mic-clip").classList.toggle("on", l.peak > 0.97);
  }
  function ui() { var b = $("mic-on"); b.textContent = on ? "🎤 Mic ON" : "🎤 Mic off"; b.classList.toggle("on", on); $("mic").classList.toggle("live", on); }
  function build() {
    if (!$("mic")) return;
    $("mic-on").addEventListener("click", function () { if (on) stop(); else start(); });
    $("mic-mute").addEventListener("click", function () { C.mute = !C.mute; apply(); });
    ["ec", "ns", "agc"].forEach(function (k) {
      $("mic-" + k).addEventListener("click", function () { C[k] = !C[k]; save(); apply(); if (on) start(); });
    });
    $("mic-duck").addEventListener("click", function () { C.duck = !C.duck; save(); apply(); if (!C.duck) setDuck(false); P.toast(C.duck ? "Talkover on — the music dips " + C.depth + " dB while you talk" : "Talkover off"); });
    var mk = function (sel, o) { o.kind = "knob"; P.control(document.querySelector(sel), o); };
    mk("#mic .k-gain", { name: "mic.gain", min: -12, max: 24, value: C.gain, def: 0, snap: 0, fmt: function (v) { return (v > 0 ? "+" : "") + Math.round(v) + "dB"; }, onChange: function (v) { C.gain = v; save(); apply(); } });
    ["low", "mid", "high"].forEach(function (b, i) {
      mk("#mic .k-" + b, { name: "mic." + b, min: -15, max: 12, value: C.eq[i], def: 0, snap: 0, center: 0, fmt: function (v) { return (v > 0 ? "+" : "") + Math.round(v); }, onChange: function (v) { C.eq[i] = v; save(); apply(); } });
    });
    mk("#mic .k-verb", { name: "mic.verb", min: 0, max: 1, value: C.verb, def: 0.12, fmt: function (v) { return Math.round(v * 100) + "%"; }, onChange: function (v) { C.verb = v; save(); apply(); } });
    mk("#mic .k-echo", { name: "mic.echo", min: 0, max: 1, value: C.echo, def: 0, fmt: function (v) { return Math.round(v * 100) + "%"; }, onChange: function (v) { C.echo = v; save(); apply(); } });
    mk("#mic .k-depth", { name: "mic.depth", min: 3, max: 24, value: C.depth, def: 10, fmt: function (v) { return "-" + Math.round(v) + "dB"; }, onChange: function (v) { C.depth = v; save(); if (duckOn) { duckOn = false; setDuck(true); } } });
    apply(); ui();
    P.on("play", function () { if (N) apply(); });
  }
  build();
  window.PFMIC = { start: start, stop: stop, info: function () { return { on: on, C: C, duck: duckOn, music: P.M ? P.M.music.gain.value : 1, level: on ? level() : null }; } };
})();
