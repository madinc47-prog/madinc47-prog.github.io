/* Island Pin Beats — keys / melodic instruments (window.IPBKeys).
 * Pure Web Audio synthesis (no samples, nothing to license). Shared by the Piano Roll, and meant to be reused by
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
    { id: "whine", name: "G-Funk Whine Lead", cat: "Synth", poly: false }
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
    }
  };

  /* play one note. dur = held length in seconds (release follows). gain = optional linear level trim. Returns { stop(t), end } */
  function play(c, dest, midi, when, dur, vel, instId, gain) {
    var fn = VOICES[instId] || VOICES.grand;
    if (gain != null && gain !== 1 && isFinite(gain)) { var g = c.createGain(); g.gain.value = clamp(gain, 0, 8); g.connect(dest); dest = g; }
    return fn(c, dest, clamp(Math.round(midi), 0, 127), Math.max(0, when), Math.max(0.02, dur || 0.25), clamp(vel == null ? 0.8 : +vel, 0.05, 1));
  }
  window.IPBKeys = { INSTRUMENTS: INSTRUMENTS, BY_ID: BY_ID, play: play, has: function (id) { return !!VOICES[id]; } };
})();
