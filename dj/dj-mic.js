/* DJ Psycho Fingers — live mic / MC channel: echo cancellation, noise suppression and auto-gain toggles, gain, 3-band EQ,
 * reverb + echo sends, talkover (ducks the music while you speak), mute, level meter. Feeds the master (so REC gets it). */
(function () {
  "use strict";
  var P = window.PFDJ; if (!P) return;
  var $ = function (id) { return document.getElementById(id); };
  var MK = "pfdj_mic_v2", d0 = { ec: false, ns: false, agc: false, gate: false, hp: "auto", gain: 0, eq: [0, 0, 0], verb: 0.12, echo: 0, duck: true, depth: 10, mute: false };
  var C = d0; try { var s = JSON.parse(localStorage.getItem(MK) || localStorage.getItem("pfdj_mic_v1") || "null"); if (s && !localStorage.getItem(MK)) { s.ec = true; s.ns = true; s.agc = true; } if (s) { C = Object.assign({}, d0, s); C.mute = false; } } catch (e) { /* ignore */ }
  /* v20261022r FULLY RAW: no browser processing, no gate/reverb/echo, no auto talkover — forced off once, never re-enabled */
  try { if (localStorage.getItem("pfdj_mic_raw") !== "1") { C.ec = C.ns = C.agc = C.gate = C.duck = false; C.verb = 0; C.echo = 0; localStorage.setItem("pfdj_mic_raw", "1"); localStorage.setItem(MK, JSON.stringify(C)); } } catch (e) { /* ignore */ }
  C.ec = C.ns = C.agc = C.gate = false; C.verb = C.echo = 0;
  var N = null, stream = null, on = false, blocked = false, phones = false, gateOpen = false, gateHold = 0, reacq = null, duckOn = false, holdUntil = 0, timer = null, starting = false;
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
    N.hp = ctx.createBiquadFilter(); N.hp.type = "highpass"; N.hp.frequency.value = 100; N.hp.Q.value = 0.7;
    N.low = ctx.createBiquadFilter(); N.low.type = "lowshelf"; N.low.frequency.value = 200;
    N.mid = ctx.createBiquadFilter(); N.mid.type = "peaking"; N.mid.frequency.value = 1500; N.mid.Q.value = 0.8;
    N.high = ctx.createBiquadFilter(); N.high.type = "highshelf"; N.high.frequency.value = 5000;
    N.comp = ctx.createDynamicsCompressor(); N.comp.threshold.value = -22; N.comp.ratio.value = 4; N.comp.attack.value = 0.004; N.comp.release.value = 0.15; N.comp.knee.value = 8;
    N.gate = ctx.createGain(); N.gate.gain.value = 0.06; N.pre = ctx.createAnalyser(); N.pre.fftSize = 1024;
    N.mute = ctx.createGain(); N.post = ctx.createGain();
    N.out = ctx.createGain(); N.out.gain.value = 1.3;
    N.an = ctx.createAnalyser(); N.an.fftSize = 1024;
    N.vs = ctx.createGain(); N.conv = ctx.createConvolver(); N.conv.buffer = ir(ctx, 2.2);
    N.es = ctx.createGain(); N.dl = ctx.createDelay(2); N.fb = ctx.createGain(); N.fb.gain.value = 0.38; N.elp = ctx.createBiquadFilter(); N.elp.type = "lowpass"; N.elp.frequency.value = 3200;
    N.inG.connect(N.hp); N.hp.connect(N.low); N.low.connect(N.mid); N.mid.connect(N.high); N.high.connect(N.comp); N.comp.connect(N.pre); N.comp.connect(N.gate); N.gate.connect(N.mute);
    N.mute.connect(N.out); N.mute.connect(N.an); N.out.connect(N.post);
    N.mute.connect(N.vs); N.vs.connect(N.conv); N.conv.connect(N.post);
    N.mute.connect(N.es); N.es.connect(N.dl); N.dl.connect(N.elp); N.elp.connect(N.fb); N.fb.connect(N.dl); N.elp.connect(N.post);
    /* v20261022r: the mic signal used everywhere = raw, unity gain, channels untouched (stereo stays stereo). The old chain is no longer fed. */
    N.raw = ctx.createGain(); N.raw.gain.value = 1; N.raw.channelCountMode = "max"; N.raw.channelInterpretation = "discrete";
    N.raw.connect(N.post); N.raw.connect(N.an); N.raw.connect(N.pre);
    try { N.out.disconnect(); N.vs.disconnect(); N.es.disconnect(); N.conv.disconnect(); N.elp.disconnect(); } catch (e) { /* ignore */ }
    route();
    apply();
    return N;
  }
  /* speakers vs headphones: with no headphones the mic goes ONLY into the show recording (never out of the speaker) → no howl, no echo */
  function nohp() { try { return localStorage.getItem("pfdj_nohp") === "1"; } catch (e) { return false; } }
  function toSpeakers() { if (nohp()) return false; return C.hp === "on" || (C.hp === "auto" && phones); }
  function route() {
    if (!N || !P.M) return;
    try { N.post.disconnect(); } catch (e) { /* ignore */ }
    N.post.connect(toSpeakers() ? P.M.bus : (P.M.recMix || P.M.bus));
    ui();
  }
  function detectPhones() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return Promise.resolve(false);
    return navigator.mediaDevices.enumerateDevices().then(function (ds) {
      var re = /head|ear|bluetooth|\bbt\b|wired|airpod|buds|usb|hands-?free|jack/i;
      phones = ds.some(function (d) { return (d.kind === "audiooutput" || d.kind === "audioinput") && d.deviceId !== "default" && d.deviceId !== "communications" && re.test(d.label || ""); });
      route(); return phones;
    }).catch(function () { return false; });
  }
  function reacquire(why) {
    clearTimeout(reacq);
    reacq = setTimeout(function () { detectPhones().then(function () { if (on) { start(true); P.toast("🎤 " + (why || "Audio device changed") + " — mic re-connected" + (toSpeakers() ? " (headphones)" : " (speaker-safe)")); } }); }, 700);
  }
  if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) navigator.mediaDevices.addEventListener("devicechange", function () { reacquire("Headphones changed"); });
  function echoTime() {
    var d = P.DECKS.filter(function (x) { return x.playing && x.bpm; })[0];
    return d ? P.clamp(0.75 * 60 / P.effBpm(d), 0.15, 1.2) : 0.375; // dotted 8th of the playing deck
  }
  function apply() {
    $("mic-mute").classList.toggle("on", C.mute); $("mic-mute").textContent = C.mute ? "MUTED" : "MUTE";
    ["ec", "ns", "agc", "duck", "gate"].forEach(function (k) { $("mic-" + k).classList.toggle("on", !!C[k]); });
    if (!N) return;
    var t = P.ctx.currentTime;
    N.inG.gain.setTargetAtTime(P.db2g(C.gain), t, 0.02);
    N.low.gain.setTargetAtTime(C.eq[0], t, 0.02); N.mid.gain.setTargetAtTime(C.eq[1], t, 0.02); N.high.gain.setTargetAtTime(C.eq[2], t, 0.02);
    N.mute.gain.setTargetAtTime(C.mute || !on ? 0 : 1, t, 0.01); N.raw.gain.setTargetAtTime(C.mute || !on ? 0 : 1, t, 0.01);
    N.vs.gain.setTargetAtTime(C.verb * 0.9, t, 0.02);
    N.es.gain.setTargetAtTime(C.echo * 0.8, t, 0.02);
    N.dl.delayTime.setTargetAtTime(echoTime(), t, 0.05);
  }
  function start(quiet) {
    if (starting) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { P.toast("This browser can't use the microphone here (needs HTTPS and mic permission)."); return; }
    if (!graph()) return;
    starting = true;
    navigator.mediaDevices.getUserMedia({ audio: (function () { var c = { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: { ideal: 2 }, sampleRate: { ideal: 48000 } }; /* v20261022r: always fully raw */ if (window.PFDJ_MICDEV) c.deviceId = { exact: window.PFDJ_MICDEV }; return c; })(), video: false }).then(function (st) {
      starting = false;
      stopStream();
      stream = st; N.src = P.ctx.createMediaStreamSource(st); N.src.connect(N.raw);
      st.getAudioTracks().forEach(function (t) { t.onended = function () { if (on && stream === st) reacquire("Mic dropped"); }; });
      on = true; blocked = false; try { localStorage.setItem("pfdj_mic_ok", "1"); } catch (e) { /* ignore */ }
      if (P.ctx.state === "suspended") P.ctx.resume();
      apply(); detectPhones(); ui();
      if (!timer) timer = setInterval(tick, 30);
      if (!quiet) P.toast("Mic live 🎤 — music ducks while you talk" + (toSpeakers() ? "" : " · no headphones: your voice goes into the recording, not the speaker"));
    }).catch(function (e) { starting = false; on = false; blocked = /NotAllowed|Security/.test(e && e.name || ""); ui(); P.toast("Mic blocked or unavailable" + (e && e.name ? " (" + e.name + ")" : "") + " — allow the microphone for this site."); });
  }
  function stopStream() { if (N && N.src) { try { N.src.disconnect(); } catch (e) { /* ignore */ } N.src = null; } if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; } }
  function stop() { stopStream(); on = false; apply(); ui(); setDuck(false); if (N) { gateOpen = false; N.gate.gain.value = 0.06; } }
  function setDuck(v) {
    if (v === duckOn || !P.M) return; duckOn = v;
    var g = P.M.music.gain, t = P.ctx.currentTime;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t);
    g.setTargetAtTime(v ? P.db2g(-C.depth) : 1, t, v ? 0.035 : 0.28);
    $("mic-duckled").classList.toggle("on", v);
  }
  var lvlBuf = null;
  function level() { if (!N) return 0; lvlBuf = lvlBuf || new Float32Array(N.an.fftSize); N.an.getFloatTimeDomainData(lvlBuf); var s = 0, m = 0; for (var i = 0; i < lvlBuf.length; i++) { s += lvlBuf[i] * lvlBuf[i]; m = Math.max(m, Math.abs(lvlBuf[i])); } return { rms: Math.sqrt(s / lvlBuf.length), peak: m }; }
  var preBuf = null;
  function preLevel() { preBuf = preBuf || new Float32Array(N.pre.fftSize); N.pre.getFloatTimeDomainData(preBuf); var s = 0; for (var i = 0; i < preBuf.length; i++) s += preBuf[i] * preBuf[i]; return Math.sqrt(s / preBuf.length); }
  function tick() {
    if (!on) { setDuck(false); return; }
    var l = level(), now = performance.now();
    var g = preLevel();                                              // gentle expander: closes to -24 dB between phrases (room hiss / beat bleed)
    if (g > 0.012) { gateHold = now + 280; }
    var open = true; /* v20261022r: no gate */
    if (open !== gateOpen) { gateOpen = open; N.gate.gain.setTargetAtTime(open ? 1 : 0.06, P.ctx.currentTime, open ? 0.004 : 0.09); }
    if (C.duck && !C.mute && gateOpen && l.rms > 0.012) holdUntil = now + 450;
    setDuck(C.duck && !C.mute && now < holdUntil);
    var mm = $("mic-meter").firstChild; mm.style.width = Math.min(100, Math.sqrt(l.peak) * 100) + "%";
    $("mic-clip").classList.toggle("on", l.peak > 0.97);
  }
  function state() { return blocked ? "blocked" : !on ? "off" : C.mute ? "muted" : "live"; }
  function ui() {
    var b = $("mic-on"); if (b) { b.textContent = on ? "🎤 Mic ON" : "🎤 Mic off"; b.classList.toggle("on", on); }
    if ($("mic")) $("mic").classList.toggle("live", on);
    var st = state(), t = $("talk-btn");
    if (t) {
      t.dataset.state = st;
      t.querySelector(".talk-l").textContent = { off: "🎤 TALK", live: "● LIVE", muted: "MUTED", blocked: "MIC BLOCKED" }[st];
      t.querySelector(".talk-s").textContent = { off: "tap to talk over the mix", live: (toSpeakers() ? "🎧 headphones" : "🔇 speaker-safe") + " · tap to stop", muted: "tap UNMUTE to talk", blocked: "allow mic in Chrome ⓘ, then tap" }[st];
      $("talk-mute").hidden = !on; $("talk-mute").textContent = C.mute ? "UNMUTE" : "MUTE";
    }
    var hb = $("mic-hp"); if (hb) hb.textContent = "SPEAKER OUT: " + ({ auto: "AUTO (" + (phones ? "🎧 on" : "off") + ")", on: "ON", off: "OFF" })[C.hp];
  }
  function talkUI() {
    if ($("talk-btn")) return;
    var w = document.createElement("div"); w.className = "talk-dock";
    w.innerHTML = '<button type="button" id="talk-btn" class="talk-btn" data-state="off" aria-label="Talk over the mix"><span class="talk-l">🎤 TALK</span><span class="talk-s"></span></button><button type="button" id="talk-mute" class="talk-mute" hidden>MUTE</button>';
    document.body.appendChild(w);
    $("talk-btn").addEventListener("click", function () { if (on) stop(); else start(); });
    $("talk-mute").addEventListener("click", function () { C.mute = !C.mute; apply(); ui(); });
  }
  function build() {
    if (!$("mic")) return;
    $("mic-on").addEventListener("click", function () { if (on) stop(); else start(); });
    $("mic-mute").addEventListener("click", function () { C.mute = !C.mute; apply(); ui(); });
    
    $("mic-hp").addEventListener("click", function () { C.hp = { auto: "on", on: "off", off: "auto" }[C.hp]; save(); route(); P.toast(C.hp === "auto" ? "Mic to speakers: automatic (only with headphones)" : C.hp === "on" ? "Mic to speakers: ON — use headphones or it may howl" : "Mic to speakers: OFF — mic goes into the recording only"); });
    /* v20261022r: processing toggles + reverb/echo/EQ/gain knobs removed from use (mic is fully raw) */
    ["mic-ec", "mic-ns", "mic-agc", "mic-gate"].forEach(function (id) { var b = $(id); if (b) b.hidden = true; });
    ["k-verb", "k-echo", "k-low", "k-mid", "k-high", "k-gain"].forEach(function (c) { var k = document.querySelector("#mic ." + c); if (k && k.closest(".kn")) k.closest(".kn").hidden = true; });
    $("mic-duck").addEventListener("click", function () { C.duck = !C.duck; save(); apply(); if (!C.duck) setDuck(false); P.toast(C.duck ? "Talkover on — the music dips " + C.depth + " dB while you talk" : "Talkover off"); });
    var mk = function (sel, o) { o.kind = "knob"; P.control(document.querySelector(sel), o); };
    mk("#mic .k-gain", { name: "mic.gain", min: -12, max: 24, value: C.gain, def: 0, snap: 0, fmt: function (v) { return (v > 0 ? "+" : "") + Math.round(v) + "dB"; }, onChange: function (v) { C.gain = v; save(); apply(); } });
    ["low", "mid", "high"].forEach(function (b, i) {
      mk("#mic .k-" + b, { name: "mic." + b, min: -15, max: 12, value: C.eq[i], def: 0, snap: 0, center: 0, fmt: function (v) { return (v > 0 ? "+" : "") + Math.round(v); }, onChange: function (v) { C.eq[i] = v; save(); apply(); } });
    });
    mk("#mic .k-verb", { name: "mic.verb", min: 0, max: 1, value: C.verb, def: 0.12, fmt: function (v) { return Math.round(v * 100) + "%"; }, onChange: function (v) { C.verb = v; save(); apply(); } });
    mk("#mic .k-echo", { name: "mic.echo", min: 0, max: 1, value: C.echo, def: 0, fmt: function (v) { return Math.round(v * 100) + "%"; }, onChange: function (v) { C.echo = v; save(); apply(); } });
    mk("#mic .k-depth", { name: "mic.depth", min: 3, max: 24, value: C.depth, def: 10, fmt: function (v) { return "-" + Math.round(v) + "dB"; }, onChange: function (v) { C.depth = v; save(); if (duckOn) { duckOn = false; setDuck(true); } } });
    talkUI(); detectPhones(); apply(); ui();
    P.on("play", function () { if (N) apply(); });
  }
  build();
  window.PFMIC = { stream: function () { return stream; }, nohp: nohp, start: start, stop: stop, state: state, route: route, info: function () { return { on: on, state: state(), phones: phones, speakers: toSpeakers(), gate: gateOpen, C: C, duck: duckOn, music: P.M ? P.M.music.gain.value : 1, level: on ? level() : null }; } };
})();
