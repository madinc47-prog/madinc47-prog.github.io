/* Island Pin Beats — keys / melodic instruments (window.IPBKeys).
 * Mostly pure Web Audio synthesis. The Orchestra instruments (strings, pizzicato, brass, flute, clarinet, orchestral
 * hit) and the Marimba play compact multisamples cut from Versilian Studios' VS Chamber Orchestra 2: Community
 * Edition (CC0 1.0, see samples/orch/CREDITS.txt); they load on first use and fall back to a synth voice until ready. Shared by the Piano Roll, and meant to be reused by
 * future loop banks: every voice is play(ctx, destination, midi, when, dur, vel, instId) and works the same in a live
 * AudioContext and an OfflineAudioContext, so live playback, Record, Bounce and exports sound identical.
 * Levels: one voice peaks around −12 dBFS at full velocity so chords stay clean into the master limiter.
 */
(function () {
  "use strict";
  function mf(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  var INSTRUMENTS = [
    { id: "grand", name: "Grand Piano", cat: "Keys", poly: true },
    { id: "rhodes", name: "Rhodes EP", cat: "Keys", poly: true },
    { id: "lofi", name: "Dusty Keys (lo-fi EP)", cat: "Keys", poly: true },
    { id: "organ", name: "Soul Organ", cat: "Keys", poly: true },
    { id: "pad", name: "Dark Pad", cat: "Pads", poly: true },
    { id: "strings", name: "Cinematic Strings", cat: "Pads", poly: true },
    { id: "bass", name: "Sub Bass", cat: "Bass", poly: false },
    { id: "synthbass", name: "Analog Bass", cat: "Bass", poly: false },
    { id: "pluck", name: "Pluck", cat: "Synth", poly: true },
    { id: "bell", name: "Bell / Glock", cat: "Synth", poly: true },
    { id: "lead", name: "Soft Lead", cat: "Synth", poly: false },
    { id: "whine", name: "G-Funk Whine Lead", cat: "Synth", poly: false },
    { id: "ostrings", name: "Ensemble Strings (legato)", cat: "Orchestra", poly: true, smp: true },
    { id: "pizz", name: "Pizzicato Strings", cat: "Orchestra", poly: true, smp: true },
    { id: "brass", name: "Brass Section Stab", cat: "Orchestra", poly: true, smp: true },
    { id: "flute", name: "Flute", cat: "Orchestra", poly: true, smp: true },
    { id: "clarinet", name: "Clarinet", cat: "Orchestra", poly: true, smp: true },
    { id: "orchhit", name: "Orchestral Hit", cat: "Orchestra", poly: true, smp: true },
    { id: "steelpan", name: "Steel Pan", cat: "Island", poly: true },
    { id: "marimba", name: "Marimba", cat: "Island", poly: true, smp: true },
    { id: "kalimba", name: "Kalimba", cat: "Island", poly: true }
  ];
  var BY_ID = {};
  INSTRUMENTS.forEach(function (i) { BY_ID[i.id] = i; });

  /* per-context caches (PeriodicWaves and noise can't be shared between contexts) */
  var caches = typeof WeakMap === "function" ? new WeakMap() : null;
  function cache(c) {
    if (!caches) return (c.__ipbk || (c.__ipbk = {}));
    var o = caches.get(c);
    if (!o) { o = {}; caches.set(c, o); }
    return o;
  }
  function wave(c, key, amps) {
    var k = cache(c);
    if (k[key]) return k[key];
    var re = new Float32Array(amps.length + 1), im = new Float32Array(amps.length + 1);
    for (var i = 0; i < amps.length; i++) im[i + 1] = amps[i];
    return (k[key] = c.createPeriodicWave(re, im, { disableNormalization: false }));
  }
  function noise(c) {
    var k = cache(c);
    if (k.noise) return k.noise;
    var n = Math.floor(c.sampleRate * 0.25), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0), x = 22222;
    for (var i = 0; i < n; i++) { x = (x * 1103515245 + 12345) & 0x7fffffff; d[i] = (x / 0x3fffffff) - 1; } // deterministic
    return (k.noise = b);
  }
  /* piano-ish spectrum: odd/even partials, soft top */
  var PIANO_AMPS = [1, 0.62, 0.38, 0.26, 0.2, 0.13, 0.1, 0.07, 0.05, 0.035, 0.025, 0.018];
  var EP_AMPS = [1, 0.08, 0.03];
  var ORGAN_AMPS = [1, 0.7, 0.45, 0.5, 0.12, 0.3, 0, 0.25]; // 16' 8' 5⅓' 4' … drawbar-ish

  /* voice helper: out gain → dest; returns a voice with stop(t) */
  function voiceBase(c, dest, t) {
    var out = c.createGain();
    out.gain.setValueAtTime(0, t);
    out.connect(dest);
    return { out: out, nodes: [], t: t, end: t };
  }
  function osc(v, c, type, freq, t, det, target, per) {
    var o = c.createOscillator();
    if (per) o.setPeriodicWave(per); else o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (det) o.detune.setValueAtTime(det, t);
    o.connect(target || v.out);
    o.start(t);
    v.nodes.push(o);
    return o;
  }
  function finish(v, stopAt) {
    v.end = stopAt;
    v.nodes.forEach(function (n) { try { n.stop(stopAt); } catch (e) { /* ignore */ } });
    v.stop = function (t) { // cut early (transport stop / pattern change) with a short fade
      try {
        var g = v.out.gain;
        if (g.cancelAndHoldAtTime) g.cancelAndHoldAtTime(t); else { g.cancelScheduledValues(t); }
        g.setTargetAtTime(0, t, 0.02);
        v.nodes.forEach(function (n) { try { n.stop(t + 0.15); } catch (e) { /* ignore */ } });
      } catch (e) { /* already stopped */ }
      v.end = Math.min(v.end, t + 0.15);
    };
    return v;
  }
  /* ADSR on v.out: peak at `a`, decays toward `sus` with time-constant `dk`, release `rel` after note end */
  function env(v, t, dur, peak, a, sus, dk, rel) {
    var g = v.out.gain;
    g.setValueAtTime(0, t);
    g.linearRampToValueAtTime(peak, t + a);
    g.setTargetAtTime(peak * sus, t + a, dk);
    var off = t + Math.max(a + 0.005, dur);
    g.setTargetAtTime(0, off, rel / 4);
    return off + rel * 1.6 + 0.05;
  }


  /* ---- multisample engine (Orchestra + Marimba) ----
   * One mono MP3 per instrument: a sync click at 50 ms, then the zones. Zone times are relative to the click, so any
   * decoder padding (MP3 encoder delay) is measured and removed at load. Sustained zones carry a crossfaded loop with a
   * continuation tail, so long notes hold seamlessly. AudioBuffers are context-free: one decode serves live playback,
   * Record and offline Bounce. */
  var SMP = {"ostrings":{"file":"samples/orch/ostrings.mp3","kind":"sus","zones":[{"m":40,"s":0.13,"l":3.35,"ls":1.4,"le":3.2},{"m":43,"s":3.54,"l":3.35,"ls":1.4,"le":3.2},{"m":47,"s":6.95,"l":3.35,"ls":1.4,"le":3.2},{"m":50,"s":10.36,"l":3.35,"ls":1.4,"le":3.2},{"m":53,"s":13.77,"l":3.35,"ls":1.4,"le":3.2},{"m":55,"s":17.18,"l":3.35,"ls":1.4,"le":3.2},{"m":59,"s":20.59,"l":3.35,"ls":1.4,"le":3.2},{"m":62,"s":24.0,"l":3.35,"ls":1.4,"le":3.2},{"m":66,"s":27.41,"l":3.35,"ls":1.4,"le":3.2},{"m":69,"s":30.82,"l":3.35,"ls":1.4,"le":3.2},{"m":72,"s":34.23,"l":3.35,"ls":1.4,"le":3.2},{"m":76,"s":37.64,"l":3.35,"ls":1.4,"le":3.2},{"m":79,"s":41.05,"l":3.35,"ls":1.4,"le":3.2},{"m":83,"s":44.46,"l":3.35,"ls":1.4,"le":3.2},{"m":86,"s":47.87,"l":3.35,"ls":1.4,"le":3.2}]},"pizz":{"file":"samples/orch/pizz.mp3","kind":"dec","zones":[{"m":40,"s":0.13,"l":1.25},{"m":43,"s":1.44,"l":1.25},{"m":47,"s":2.75,"l":1.25},{"m":48,"s":4.06,"l":1.25},{"m":52,"s":5.37,"l":0.9993},{"m":55,"s":6.42927,"l":1.25},{"m":59,"s":7.73927,"l":1.25},{"m":62,"s":9.04927,"l":1.25},{"m":66,"s":10.35927,"l":0.8875},{"m":69,"s":11.30676,"l":1.1018},{"m":72,"s":12.46855,"l":1.0483},{"m":76,"s":13.57683,"l":1.1564},{"m":79,"s":14.79324,"l":1.0804},{"m":83,"s":15.93361,"l":0.6009},{"m":86,"s":16.59451,"l":0.6458}]},"brass":{"file":"samples/orch/brass.mp3","kind":"dec","zones":[{"m":41,"s":0.13,"l":0.85},{"m":46,"s":1.04,"l":0.85},{"m":50,"s":1.95,"l":0.7932},{"m":53,"s":2.80324,"l":0.85},{"m":57,"s":3.71324,"l":0.85},{"m":60,"s":4.62324,"l":0.85},{"m":63,"s":5.53324,"l":0.85},{"m":65,"s":6.44324,"l":0.85},{"m":67,"s":7.35324,"l":0.85},{"m":70,"s":8.26324,"l":0.85},{"m":74,"s":9.17324,"l":0.85},{"m":77,"s":10.08324,"l":0.85},{"m":81,"s":10.99324,"l":0.85},{"m":84,"s":11.90324,"l":0.85}]},"flute":{"file":"samples/orch/flute.mp3","kind":"sus","zones":[{"m":60,"s":0.13,"l":3.15,"ls":1.3,"le":3.0},{"m":64,"s":3.34,"l":3.15,"ls":1.3,"le":3.0},{"m":69,"s":6.55,"l":3.15,"ls":1.3,"le":3.0},{"m":72,"s":9.76,"l":3.15,"ls":1.3,"le":3.0},{"m":76,"s":12.97,"l":3.15,"ls":1.3,"le":3.0},{"m":81,"s":16.18,"l":3.15,"ls":1.3,"le":3.0},{"m":84,"s":19.39,"l":3.15,"ls":1.3,"le":3.0},{"m":88,"s":22.6,"l":3.15,"ls":1.3,"le":3.0},{"m":93,"s":25.81,"l":3.15,"ls":1.3,"le":3.0},{"m":96,"s":29.02,"l":3.15,"ls":1.3,"le":3.0}]},"clarinet":{"file":"samples/orch/clarinet.mp3","kind":"sus","zones":[{"m":50,"s":0.13,"l":3.15,"ls":1.3,"le":3.0},{"m":53,"s":3.34,"l":3.15,"ls":1.3,"le":3.0},{"m":58,"s":6.55,"l":3.15,"ls":1.3,"le":3.0},{"m":62,"s":9.76,"l":3.15,"ls":1.3,"le":3.0},{"m":65,"s":12.97,"l":3.15,"ls":1.3,"le":3.0},{"m":70,"s":16.18,"l":3.15,"ls":1.3,"le":3.0},{"m":74,"s":19.39,"l":3.15,"ls":1.3,"le":3.0},{"m":77,"s":22.6,"l":3.15,"ls":1.3,"le":3.0},{"m":82,"s":25.81,"l":3.15,"ls":1.3,"le":3.0},{"m":86,"s":29.02,"l":3.15,"ls":1.3,"le":3.0},{"m":89,"s":32.23,"l":3.15,"ls":1.3,"le":3.0}]},"marimba":{"file":"samples/orch/marimba.mp3","kind":"dec","zones":[{"m":41,"s":0.13,"l":1.6},{"m":48,"s":1.79,"l":1.6},{"m":55,"s":3.45,"l":1.6},{"m":59,"s":5.11,"l":1.6},{"m":65,"s":6.77,"l":1.6},{"m":72,"s":8.43,"l":1.6},{"m":79,"s":10.09,"l":1.6},{"m":83,"s":11.75,"l":1.6},{"m":89,"s":13.41,"l":1.6},{"m":96,"s":15.07,"l":1.6}]},"orchhit":{"file":"samples/orch/orchhit.mp3","kind":"dec","zones":[{"m":48,"s":0.13,"l":1.8},{"m":53,"s":1.99,"l":1.8},{"m":58,"s":3.85,"l":1.8},{"m":63,"s":5.71,"l":1.8},{"m":68,"s":7.57,"l":1.8}]}};
  /* level trims: one note at velocity 0.8 sits at the same loudness as the synth voices (measured offline) */
  var SLVL = { ostrings: 0.88, pizz: 1.0, brass: 0.85, flute: 0.87, clarinet: 0.94, orchhit: 1.0, marimba: 0.94 };
  var SREL = { ostrings: 0.5, flute: 0.28, clarinet: 0.3, brass: 0.16, pizz: 0.12, marimba: 0.25, orchhit: 0.3 };
  var BASE = (document.currentScript && document.currentScript.src) || (typeof location !== "undefined" ? location.href : "");
  var SBUF = {}, SLOAD = {};
  function smpUrl(f) { try { return new URL(f, BASE).href; } catch (e) { return f; } }
  function decodeAB(ab) {
    return new Promise(function (res, rej) {
      var C = window.OfflineAudioContext || window.webkitOfflineAudioContext, c = new C(1, 2, 44100), done = false;
      var p = c.decodeAudioData(ab, function (b) { done = true; res(b); }, function (e) { if (!done) rej(e || new Error("decode")); });
      if (p && p.catch) p.catch(function (e) { if (!done) rej(e || new Error("decode")); });
    });
  }
  function syncOffset(b) {
    var d = b.getChannelData(0), n = Math.min(d.length, Math.round(b.sampleRate * 0.25)), bi = 0, bv = 0;
    for (var i = 0; i < n; i++) { var a = Math.abs(d[i]); if (a > bv) { bv = a; bi = i; } }
    return bi / b.sampleRate - 0.05;
  }
  function loadOne(id) {
    if (!SMP[id]) return Promise.resolve(true);
    if (SBUF[id]) return Promise.resolve(true);
    if (SLOAD[id]) return SLOAD[id];
    SLOAD[id] = fetch(smpUrl(SMP[id].file)).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.arrayBuffer();
    }).then(decodeAB).then(function (b) {
      SBUF[id] = { buf: b, off: syncOffset(b) };
      return true;
    }).catch(function () { SLOAD[id] = null; return false; });
    return SLOAD[id];
  }
  /* load the sample sets for these instrument ids (strings or arrays; non-sampled ids are ignored) */
  function load(ids) {
    var list = [].concat(ids || []).filter(function (id, i, a) { return SMP[id] && a.indexOf(id) === i; });
    return Promise.all(list.map(loadOne)).then(function (r) { return r.every(Boolean); });
  }
  function ready(ids) { return [].concat(ids || []).every(function (id) { return !SMP[id] || !!SBUF[id]; }); }
  function sampled(c, dest, m, t, dur, vel, id) {
    var S = SMP[id], B = SBUF[id];
    if (!B) { loadOne(id); return VOICES[FALLBACK[id]](c, dest, m, t, dur, vel); }
    var z = S.zones[0], best = 1e9;
    S.zones.forEach(function (q) { var d = Math.abs(m - q.m) + (m > q.m ? 0.1 : 0); if (d < best) { best = d; z = q; } }); // tie → pitch down
    var rate = Math.pow(2, (m - z.m) / 12), st = Math.max(0, B.off + z.s), sus = S.kind === "sus";
    var v = voiceBase(c, dest, t), src = c.createBufferSource();
    src.buffer = B.buf; src.playbackRate.setValueAtTime(rate, t);
    var lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 0.5;
    lp.frequency.setValueAtTime(Math.min(18000, (sus ? 1600 : 2600) + vel * vel * 15000), t);
    src.connect(lp); lp.connect(v.out);
    var amp = (SLVL[id] || 0.5) * (sus ? 0.35 + 0.65 * vel : 0.2 + 0.8 * Math.pow(vel, 1.2)) / 0.84, g = v.out.gain, rel = SREL[id] || 0.2, end;
    g.setValueAtTime(0, t); g.linearRampToValueAtTime(amp, t + (sus ? 0.012 : 0.002));
    var natural = t + z.l / rate - 0.005;
    if (z.ls != null) {
      src.loop = true; src.loopStart = st + z.ls; src.loopEnd = st + z.le;
      var off = t + Math.max(0.06, dur);
      g.setTargetAtTime(0, off, rel / 4); end = off + rel * 1.6 + 0.05;
    } else if (id === "brass") {
      var offb = t + Math.max(0.16, dur);
      if (offb < natural) { g.setTargetAtTime(0, offb, rel / 4); end = Math.min(natural, offb + rel * 1.6 + 0.05); } else end = natural;
    } else {
      end = natural; // pizzicato, marimba, hits ring out naturally
      if (natural - t > 0.05) { g.setValueAtTime(amp, natural - 0.04); g.linearRampToValueAtTime(0, natural); }
    }
    src.start(t, st); v.nodes.push(src);
    return finish(v, end);
  }

  var VOICES = {
    grand: function (c, dest, m, t, dur, vel) {
      var v = voiceBase(c, dest, t), f = mf(m), per = wave(c, "piano", PIANO_AMPS);
      var lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 0.4; lp.connect(v.out);
      var bright = 900 + vel * vel * 5200 + f * 2.2;
      lp.frequency.setValueAtTime(Math.min(16000, bright), t);
      lp.frequency.setTargetAtTime(Math.min(16000, 500 + f * 2.5), t + 0.01, 0.35 + 0.4 * (1 - m / 108));
      osc(v, c, null, f, t, -1.6, lp, per); osc(v, c, null, f, t, 1.8, lp, per);
      var sub = c.createGain(); sub.gain.value = m < 60 ? 0.25 : 0.1; sub.connect(lp);
      osc(v, c, "sine", f, t, 0, sub);
      // hammer: short band-passed noise
      var nb = c.createBufferSource(); nb.buffer = noise(c);
      var bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = Math.min(9000, f * 5 + 1200); bp.Q.value = 0.9;
      var ng = c.createGain(); ng.gain.setValueAtTime(0.12 * vel, t); ng.gain.exponentialRampToValueAtTime(0.0005, t + 0.035);
      nb.connect(bp); bp.connect(ng); ng.connect(v.out); nb.start(t); v.nodes.push(nb);
      var decay = 1.4 + 3.5 * (1 - (m - 21) / 88); // low notes ring longer
      var end = env(v, t, dur, 0.2 * (0.35 + 0.65 * vel), 0.003, 0.0001, decay / 3.2, 0.28);
      return finish(v, end);
    },
    rhodes: function (c, dest, m, t, dur, vel) {
      var v = voiceBase(c, dest, t), f = mf(m);
      var car = osc(v, c, null, f, t, 0, null, wave(c, "ep", EP_AMPS));
      var mod = c.createOscillator(); mod.type = "sine"; mod.frequency.setValueAtTime(f, t);
      var mi = c.createGain(); var idx = f * (0.6 + vel * 2.6);
      mi.gain.setValueAtTime(idx, t); mi.gain.setTargetAtTime(f * 0.25, t, 0.18 + (1 - vel) * 0.2);
      mod.connect(mi); mi.connect(car.frequency); mod.start(t); v.nodes.push(mod);
      // tine "bark"
      var tg = c.createGain(); tg.gain.setValueAtTime(0.18 * vel * vel, t); tg.gain.setTargetAtTime(0, t, 0.05); tg.connect(v.out);
      osc(v, c, "sine", f * 7.1, t, 0, tg);
      var end = env(v, t, dur, 0.21 * (0.4 + 0.6 * vel), 0.004, 0.25, 0.9, 0.35);
      return finish(v, end);
    },
    lofi: function (c, dest, m, t, dur, vel) {
      var v = voiceBase(c, dest, t), f = mf(m);
      var lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2400; lp.Q.value = 0.7; lp.connect(v.out);
      var car = osc(v, c, null, f, t, 0, lp, wave(c, "ep", EP_AMPS));
      var mod = c.createOscillator(); mod.type = "sine"; mod.frequency.setValueAtTime(f * 2, t);
      var mi = c.createGain(); mi.gain.setValueAtTime(f * (0.4 + vel * 1.2), t); mi.gain.setTargetAtTime(f * 0.1, t, 0.3);
      mod.connect(mi); mi.connect(car.frequency); mod.start(t); v.nodes.push(mod);
      // tape wow: slow detune wobble
      var wob = c.createOscillator(); wob.frequency.value = 0.6 + (m % 5) * 0.07;
      var wg = c.createGain(); wg.gain.value = 9; wob.connect(wg); wg.connect(car.detune); wob.start(t); v.nodes.push(wob);
      osc(v, c, "triangle", f, t, 7, lp);
      var end = env(v, t, dur, 0.17 * (0.45 + 0.55 * vel), 0.012, 0.35, 1.1, 0.45);
      return finish(v, end);
    },
    organ: function (c, dest, m, t, dur, vel) {
      var v = voiceBase(c, dest, t), f = mf(m) / 2, per = wave(c, "organ", ORGAN_AMPS);
      var lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 5200; lp.connect(v.out);
      osc(v, c, null, f, t, -3, lp, per); osc(v, c, null, f, t, 3, lp, per);
      // key click
      var kc = c.createGain(); kc.gain.setValueAtTime(0.05, t); kc.gain.setTargetAtTime(0, t, 0.004); kc.connect(v.out);
      osc(v, c, "square", mf(m) * 4, t, 0, kc);
      var end = env(v, t, dur, 0.11 * (0.6 + 0.4 * vel), 0.008, 0.92, 0.2, 0.09);
      return finish(v, end);
    },
    pad: function (c, dest, m, t, dur, vel) {
      var v = voiceBase(c, dest, t), f = mf(m);
      var lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 0.8; lp.connect(v.out);
      lp.frequency.setValueAtTime(500, t); lp.frequency.linearRampToValueAtTime(1100 + vel * 900, t + 0.6);
      osc(v, c, "sawtooth", f, t, -9, lp); osc(v, c, "sawtooth", f, t, 9, lp); osc(v, c, "sine", f / 2, t, 0, lp);
      var end = env(v, t, dur, 0.11 * (0.5 + 0.5 * vel), 0.35, 0.85, 0.8, 1.1);
      return finish(v, end);
    },
    strings: function (c, dest, m, t, dur, vel) {
      var v = voiceBase(c, dest, t), f = mf(m);
      var lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2600 + vel * 1600; lp.Q.value = 0.5; lp.connect(v.out);
      var hp = c.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 180; hp.connect(lp);
      [-12, -4, 4, 12].forEach(function (d) { osc(v, c, "sawtooth", f, t, d, hp); });
      var vib = c.createOscillator(); vib.frequency.value = 5.2; var vg = c.createGain(); vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(6, t + 0.8);
      vib.connect(vg); v.nodes.forEach(function (o) { if (o.detune) vg.connect(o.detune); }); vib.start(t); v.nodes.push(vib);
      var end = env(v, t, dur, 0.075 * (0.5 + 0.5 * vel), 0.22, 0.9, 0.6, 0.7);
      return finish(v, end);
    },
    bass: function (c, dest, m, t, dur, vel) {
      var v = voiceBase(c, dest, t), f = mf(m);
      var sh = c.createWaveShaper(), cur = new Float32Array(1024);
      for (var i = 0; i < 1024; i++) { var x = i / 511.5 - 1; cur[i] = Math.tanh(1.8 * x) / Math.tanh(1.8); }
      sh.curve = cur; sh.connect(v.out);
      var o = osc(v, c, "sine", f, t, 0, sh);
      o.frequency.setValueAtTime(f * 1.5, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.03); // soft click-in
      var h = c.createGain(); h.gain.value = 0.18; h.connect(sh); osc(v, c, "triangle", f * 2, t, 0, h);
      var end = env(v, t, dur, 0.26 * (0.5 + 0.5 * vel), 0.005, 0.8, 0.6, 0.08);
      return finish(v, end);
    },
    synthbass: function (c, dest, m, t, dur, vel) {
      var v = voiceBase(c, dest, t), f = mf(m);
      var lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 5; lp.connect(v.out);
      lp.frequency.setValueAtTime(180 + vel * 2200, t); lp.frequency.setTargetAtTime(160 + f, t, 0.12);
      osc(v, c, "sawtooth", f, t, -6, lp); osc(v, c, "square", f, t, 6, lp); osc(v, c, "sine", f / 2, t, 0, lp);
      var end = env(v, t, dur, 0.13 * (0.5 + 0.5 * vel), 0.004, 0.7, 0.3, 0.07);
      return finish(v, end);
    },
    pluck: function (c, dest, m, t, dur, vel) {
      var v = voiceBase(c, dest, t), f = mf(m);
      var lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 3; lp.connect(v.out);
      lp.frequency.setValueAtTime(1500 + vel * 4000, t); lp.frequency.exponentialRampToValueAtTime(Math.max(200, f * 1.2), t + 0.35);
      osc(v, c, "sawtooth", f, t, 0, lp); osc(v, c, "square", f, t, 5, lp);
      var end = env(v, t, Math.min(dur, 1.2), 0.15 * (0.4 + 0.6 * vel), 0.003, 0.0001, 0.28, 0.2);
      return finish(v, end);
    },
    bell: function (c, dest, m, t, dur, vel) {
      var v = voiceBase(c, dest, t), f = mf(m);
      osc(v, c, "sine", f, t); var g2 = c.createGain(); g2.gain.value = 0.35; g2.connect(v.out); osc(v, c, "sine", f * 2.76, t, 0, g2);
      var g3 = c.createGain(); g3.gain.setValueAtTime(0.18, t); g3.gain.setTargetAtTime(0, t, 0.25); g3.connect(v.out); osc(v, c, "sine", f * 5.4, t, 0, g3);
      var end = env(v, t, Math.max(dur, 0.6), 0.15 * (0.4 + 0.6 * vel), 0.002, 0.0001, 0.8, 0.5);
      return finish(v, end);
    },
    lead: function (c, dest, m, t, dur, vel) {
      var v = voiceBase(c, dest, t), f = mf(m);
      var lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 1800 + vel * 2500; lp.Q.value = 1.2; lp.connect(v.out);
      var o1 = osc(v, c, "square", f, t, -5, lp), o2 = osc(v, c, "sawtooth", f, t, 5, lp);
      var vib = c.createOscillator(); vib.frequency.value = 5.5; var vg = c.createGain(); vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(12, t + 0.4);
      vib.connect(vg); vg.connect(o1.detune); vg.connect(o2.detune); vib.start(t); v.nodes.push(vib);
      var end = env(v, t, dur, 0.09 * (0.5 + 0.5 * vel), 0.02, 0.8, 0.3, 0.18);
      return finish(v, end);
    },
    /* West Coast "whine": sine + soft triangle, scoops up into the note, slow wide vibrato fades in */
    whine: function (c, dest, m, t, dur, vel) {
      var v = voiceBase(c, dest, t), f = mf(m);
      var lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2400 + vel * 1800; lp.Q.value = 0.9; lp.connect(v.out);
      var o1 = osc(v, c, "sine", f, t, 0, lp);
      var tg = c.createGain(); tg.gain.value = 0.42; tg.connect(lp);
      var o2 = osc(v, c, "triangle", f, t, 4, tg);
      [o1, o2].forEach(function (o) { o.frequency.setValueAtTime(f * 0.945, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.075); });
      var vib = c.createOscillator(); vib.frequency.value = 5.4;
      var vg = c.createGain(); vg.gain.setValueAtTime(0, t); vg.gain.setValueAtTime(0, t + 0.14); vg.gain.linearRampToValueAtTime(24, t + 0.55);
      vib.connect(vg); vg.connect(o1.detune); vg.connect(o2.detune); vib.start(t); v.nodes.push(vib);
      var end = env(v, t, dur, 0.13 * (0.5 + 0.5 * vel), 0.025, 0.85, 0.5, 0.22);
      return finish(v, end);
    },
    /* ---- Island colours (synthesized) ---- */
    /* steel pan: fundamental + tuned octave and twelfth (the pan's note-area modes), the octave blooms in just after
       the stick; a soft rubber-stick thump and a slight pitch settle */
    steelpan: function (c, dest, m, t, dur, vel) {
      var v = voiceBase(c, dest, t), f = mf(m), lpf = c.createBiquadFilter();
      lpf.type = "lowpass"; lpf.frequency.value = Math.min(15000, 2500 + vel * 6000 + f * 3); lpf.connect(v.out);
      var ring = 0.5 + 1.1 * clamp((84 - m) / 36, 0, 1);
      [[1, 1, 0, ring], [1, 0.5, 3, ring * 0.9], [2, 0.55, 2, ring * 0.55], [3, 0.2, -3, ring * 0.3], [4, 0.07, 4, ring * 0.18]].forEach(function (pp, i) {
        var g = c.createGain(), pk = pp[1] * (i === 2 ? 0.6 + 0.4 * vel : 1);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(pk * (i === 2 ? 0.35 : 1), t + 0.004);
        if (i === 2) g.gain.linearRampToValueAtTime(pk, t + 0.045); // octave bloom
        g.gain.setTargetAtTime(0, t + 0.05, pp[3] / 3);
        g.connect(lpf);
        var o = osc(v, c, "sine", f * pp[0], t, pp[2], g);
        o.frequency.setValueAtTime(f * pp[0] * 1.012, t); o.frequency.exponentialRampToValueAtTime(f * pp[0], t + 0.035);
      });
      var nb = c.createBufferSource(); nb.buffer = noise(c);
      var bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = Math.min(6000, f * 3 + 900); bp.Q.value = 1.2;
      var ng = c.createGain(); ng.gain.setValueAtTime(0.18 * vel, t); ng.gain.exponentialRampToValueAtTime(0.0005, t + 0.02);
      nb.connect(bp); bp.connect(ng); ng.connect(v.out); nb.start(t); v.nodes.push(nb);
      var end = env(v, t, Math.max(dur, ring * 0.8), 0.127 * (0.35 + 0.65 * vel), 0.002, 0.6, ring / 2, 0.35);
      return finish(v, end);
    },
    /* kalimba: sine tine with its high inharmonic overtone, a short pluck click and a little box warmth */
    kalimba: function (c, dest, m, t, dur, vel) {
      var v = voiceBase(c, dest, t), f = mf(m);
      var ring = 0.7 + 1.4 * clamp((96 - m) / 48, 0, 1);
      var o = osc(v, c, "sine", f, t);
      o.frequency.setValueAtTime(f * 1.006, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.05);
      var g2 = c.createGain(); g2.gain.setValueAtTime(0.32 * (0.5 + 0.5 * vel), t); g2.gain.setTargetAtTime(0, t, 0.06); g2.connect(v.out);
      osc(v, c, "sine", f * 5.92, t, 0, g2);
      var g3 = c.createGain(); g3.gain.setValueAtTime(0.1 * vel, t); g3.gain.setTargetAtTime(0, t, 0.02); g3.connect(v.out);
      osc(v, c, "sine", f * 13.3, t, 0, g3);
      var g4 = c.createGain(); g4.gain.setValueAtTime(0.14, t); g4.gain.setTargetAtTime(0, t, ring / 4); g4.connect(v.out);
      osc(v, c, "triangle", f * 2, t, 2, g4);
      var nb = c.createBufferSource(); nb.buffer = noise(c);
      var hp = c.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 2500;
      var ng = c.createGain(); ng.gain.setValueAtTime(0.1 * vel, t); ng.gain.exponentialRampToValueAtTime(0.0005, t + 0.008);
      nb.connect(hp); hp.connect(ng); ng.connect(v.out); nb.start(t); v.nodes.push(nb);
      var end = env(v, t, Math.max(dur, ring * 0.7), 0.17 * (0.35 + 0.65 * vel), 0.002, 0.5, ring / 2.5, 0.3);
      return finish(v, end);
    },
    /* fallbacks while a sample set is still loading */
    brasssynth: function (c, dest, m, t, dur, vel) {
      var v = voiceBase(c, dest, t), f = mf(m);
      var lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 1; lp.connect(v.out);
      lp.frequency.setValueAtTime(f * 1.5, t); lp.frequency.linearRampToValueAtTime(Math.min(12000, f * (4 + vel * 6)), t + 0.04); lp.frequency.setTargetAtTime(f * 3, t + 0.05, 0.2);
      osc(v, c, "sawtooth", f, t, -6, lp); osc(v, c, "sawtooth", f, t, 6, lp);
      var end = env(v, t, Math.min(dur, 0.5), 0.09 * (0.5 + 0.5 * vel), 0.02, 0.6, 0.2, 0.12);
      return finish(v, end);
    },
    marimbasynth: function (c, dest, m, t, dur, vel) {
      var v = voiceBase(c, dest, t), f = mf(m);
      osc(v, c, "sine", f, t);
      var g2 = c.createGain(); g2.gain.setValueAtTime(0.3 * vel, t); g2.gain.setTargetAtTime(0, t, 0.05); g2.connect(v.out); osc(v, c, "sine", f * 4, t, 0, g2);
      var end = env(v, t, 0.8, 0.18 * (0.35 + 0.65 * vel), 0.002, 0.0001, 0.35 * clamp((100 - m) / 50, 0.3, 1.2), 0.2);
      return finish(v, end);
    }
  };
  var FALLBACK = { ostrings: "strings", pizz: "pluck", brass: "brasssynth", flute: "lead", clarinet: "lead", orchhit: "brasssynth", marimba: "marimbasynth" };
  Object.keys(SMP).forEach(function (id) { VOICES[id] = function (c, dest, m, t, dur, vel) { return sampled(c, dest, m, t, dur, vel, id); }; });

  /* play one note. dur = held length in seconds (release follows). gain = optional linear level trim. Returns { stop(t), end } */
  function play(c, dest, midi, when, dur, vel, instId, gain) {
    var fn = VOICES[instId] || VOICES.grand;
    if (gain != null && gain !== 1 && isFinite(gain)) { var g = c.createGain(); g.gain.value = clamp(gain, 0, 8); g.connect(dest); dest = g; }
    return fn(c, dest, clamp(Math.round(midi), 0, 127), Math.max(0, when), Math.max(0.02, dur || 0.25), clamp(vel == null ? 0.8 : +vel, 0.05, 1));
  }
  window.IPBKeys = { INSTRUMENTS: INSTRUMENTS, BY_ID: BY_ID, play: play, has: function (id) { return !!VOICES[id]; },
    load: load, ready: ready, isSampled: function (id) { return !!SMP[id]; }, CREDITS: "samples/orch/CREDITS.txt" };
})();
