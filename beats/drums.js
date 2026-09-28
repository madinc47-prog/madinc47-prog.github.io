/* Island Pin Beats — drum library (2026 kits).
 * Every pad is rendered offline once per kit load: synthesis (recipes in the research notes) plus optional
 * CC0 sample layers (beats/samples/CREDITS.md), then kit colour (SP-1200-style 12-bit crush, low-pass,
 * saturation) is baked in and the pad is peak-normalised to its designed level.
 * Exposes window.IPBDrums; app.js does sequencing, per-pad controls, mixing and the drum bus.
 */
(function () {
  "use strict";
  var SR = 44100;
  function mf(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function db(v) { return Math.pow(10, v / 20); }
  /* seeded noise: every pad renders identically on every load (repeatable bounces) */
  var seedState = 1;
  function R() { seedState = (seedState + 0x6d2b79f5) | 0; var t = Math.imul(seedState ^ (seedState >>> 15), 1 | seedState); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  function seed(str) { var h = 2166136261; str = String(str); for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } seedState = h | 0; }
  function rnd(a) { return 1 + (R() * 2 - 1) * a; }

  /* ---------------- DSP helpers ---------------- */
  function noiseBuf(c, sec) {
    var n = Math.max(1, Math.ceil(sec * c.sampleRate)), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = R() * 2 - 1;
    return b;
  }
  function noise(c, sec, t) {
    var s = c.createBufferSource(); s.buffer = noiseBuf(c, sec); s.start(t || 0); return s;
  }
  var curveCache = {};
  function tanhCurve(k) {
    var key = "t" + k; if (curveCache[key]) return curveCache[key];
    var n = 4096, cv = new Float32Array(n), norm = Math.tanh(k);
    for (var i = 0; i < n; i++) { var x = (i / (n - 1)) * 2 - 1; cv[i] = Math.tanh(k * x) / norm; }
    return (curveCache[key] = cv);
  }
  function asymCurve(k, bias) {
    var key = "a" + k + "_" + bias; if (curveCache[key]) return curveCache[key];
    var f = function (x) { return Math.tanh(k * (x + bias)) - Math.tanh(k * bias); };
    var m = Math.max(Math.abs(f(1)), Math.abs(f(-1))), n = 4096, cv = new Float32Array(n);
    for (var i = 0; i < n; i++) { var x = (i / (n - 1)) * 2 - 1; cv[i] = f(x) / m; }
    return (curveCache[key] = cv);
  }
  function clipCurve(knee) {
    var key = "c" + knee; if (curveCache[key]) return curveCache[key];
    var n = 4096, cv = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      var x = (i / (n - 1)) * 2 - 1, a = Math.abs(x);
      var y = a < knee ? a : knee + (1 - knee) * Math.tanh((a - knee) / (1 - knee));
      cv[i] = (x < 0 ? -1 : 1) * y;
    }
    return (curveCache[key] = cv);
  }
  function shaper(c, curve, os) { var s = c.createWaveShaper(); s.curve = curve; s.oversample = os || "none"; return s; }
  function bq(c, type, f, Q, g) {
    var b = c.createBiquadFilter(); b.type = type; b.frequency.value = f;
    if (Q != null) b.Q.value = Q; if (g != null) b.gain.value = g; return b;
  }
  function gain(c, v) { var g = c.createGain(); g.gain.value = v == null ? 1 : v; return g; }
  function chain() { for (var i = 0; i < arguments.length - 1; i++) arguments[i].connect(arguments[i + 1]); return arguments[arguments.length - 1]; }
  /* linear attack, exponential decay to -80 dB */
  function env(param, t, peak, a, d, hold) {
    param.setValueAtTime(0.0001, t);
    param.linearRampToValueAtTime(peak, t + a);
    if (hold) param.setValueAtTime(peak, t + a + hold);
    param.exponentialRampToValueAtTime(0.0001, t + a + (hold || 0) + d);
  }
  function osc(c, type, f, t, stop) {
    var o = c.createOscillator(); o.type = type; o.frequency.value = f; o.start(t || 0); if (stop) o.stop(stop); return o;
  }
  function roomIR(c, sec, power) {
    var n = Math.ceil(sec * c.sampleRate), b = c.createBuffer(2, n, c.sampleRate);
    for (var ch = 0; ch < 2; ch++) {
      var d = b.getChannelData(ch);
      for (var i = 0; i < n; i++) d[i] = (R() * 2 - 1) * Math.pow(1 - i / n, power || 4);
    }
    return b;
  }
  function room(c, input, out, amt, sec, lp) {
    if (!amt) return;
    var cv = c.createConvolver(); cv.buffer = roomIR(c, sec || 0.25, 4);
    chain(input, cv, bq(c, "lowpass", lp || 5000, 0.5), gain(c, amt), out);
  }
  var HAT_F = [205.3, 304.4, 369.6, 522.7, 540, 800];

  /* ---------------- Voices: function (ctx, out, params, variant) ---------------- */
  var V = {};
  V.kick = function (c, out, p, vi) {
    var f0 = (p.f0 || 165) * (vi ? rnd(0.01) : 1), f1 = p.f1 || 52, fe = p.fEnd || f1 * 0.9;
    var pt = p.pitchT || 0.045, dec = p.dec || 0.38, hold = p.hold == null ? 0.02 : p.hold;
    var sum = gain(c, 0.9);
    var body = osc(c, "sine", f0, 0, dec + hold + 0.1);
    body.frequency.setValueAtTime(f0, 0);
    body.frequency.exponentialRampToValueAtTime(f1, pt);
    body.frequency.exponentialRampToValueAtTime(fe, dec + hold);
    var bg = gain(c, 0); env(bg.gain, 0, 1, 0.001, dec, hold);
    chain(body, bg, sum);
    if (p.knock !== 0) {
      var kn = osc(c, "triangle", p.knockF || 130, 0, 0.25);
      kn.frequency.exponentialRampToValueAtTime((p.knockF || 130) * 0.73, 0.05);
      var kg = gain(c, 0); env(kg.gain, 0, p.knock == null ? 0.45 : p.knock, 0.001, p.knockDec || 0.07);
      chain(kn, kg, sum);
    }
    if (p.click !== 0) {
      var cg = gain(c, 0); env(cg.gain, 0, p.click == null ? 0.35 : p.click, 0.0005, p.clickDec || 0.006);
      chain(noise(c, 0.04), bq(c, p.clickHP ? "highpass" : "bandpass", p.clickF || 3500, 0.9), cg, sum);
    }
    if (p.sub) {
      var so = osc(c, "sine", fe, 0, (p.subDec || 0.6) + 0.1);
      var sg = gain(c, 0); env(sg.gain, 0, p.sub, 0.004, p.subDec || 0.6, 0.03);
      chain(so, sg, sum);
    }
    var sh = shaper(c, p.clip ? clipCurve(p.clip) : tanhCurve(p.drive || 3));
    var pre = gain(c, p.clip ? (p.drive || 3) * 0.5 : 1);
    chain(sum, pre, sh, bq(c, "lowpass", p.lp || 9000, 0.5), bq(c, "highpass", p.hp || 30, 0.7), out);
  };
  V.snare = function (c, out, p, vi) {
    function hit(t, amp) {
      var mix = gain(c, amp), t1 = (p.tone1 || 185) * (vi ? rnd(0.012) : 1), t2 = p.tone2 || 330;
      var bd = p.bodyDec || 0.09, nd = p.noiseDec || 0.2;
      [[t1, p.body1 == null ? 0.7 : p.body1], [t2, p.body2 == null ? 0.35 : p.body2]].forEach(function (fg) {
        var o = osc(c, "triangle", fg[0] * 1.25, t, t + bd + 0.08);
        o.frequency.setValueAtTime(fg[0] * 1.25, t);
        o.frequency.exponentialRampToValueAtTime(fg[0], t + 0.02);
        var og = gain(c, 0); env(og.gain, t, fg[1], 0.001, bd);
        chain(o, og, mix);
      });
      var ng = gain(c, 0); env(ng.gain, t, p.noise == null ? 0.8 : p.noise, 0.001, nd);
      chain(noise(c, nd + 0.15, t), bq(c, "highpass", p.noiseHP || 1200, 0.7), bq(c, "peaking", p.peakF || 4500, 0.8, p.peakG == null ? 6 : p.peakG), ng, mix);
      var cg = gain(c, 0); env(cg.gain, t, p.crack == null ? 0.6 : p.crack, 0.0003, 0.008);
      chain(noise(c, 0.03, t), bq(c, "bandpass", p.crackF || 2200, 0.7), cg, mix);
      return mix;
    }
    var bus = gain(c, 1);
    if (p.flam) { hit(0, 0.45).connect(bus); hit(p.flam, 1).connect(bus); } else hit(0, 1).connect(bus);
    var post = bq(c, "highpass", p.hp || 120, 0.7);
    chain(bus, shaper(c, asymCurve(p.drive || 2.5, 0.15)), post);
    var o2 = post;
    if (p.lp) { o2 = bq(c, "lowpass", p.lp, 0.6); post.connect(o2); }
    o2.connect(out);
    room(c, o2, out, p.room == null ? 0.18 : p.room, p.roomLen || 0.25, 5000);
  };
  V.clap = function (c, out, p, vi) {
    var n = p.bursts || 4, sp = p.spread || 0.0105, dec = p.dec || 0.22;
    var g = gain(c, 0);
    g.gain.setValueAtTime(0.0001, 0);
    for (var i = 0; i < n - 1; i++) {
      var t = i * sp * (vi ? rnd(0.15) : 1);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.85, t + 0.0008);
      g.gain.exponentialRampToValueAtTime(0.12, t + sp * 0.85);
    }
    var tl = (n - 1) * sp;
    g.gain.setValueAtTime(0.0001, tl);
    g.gain.linearRampToValueAtTime(1, tl + 0.0008);
    g.gain.exponentialRampToValueAtTime(0.0001, tl + dec);
    var bp = bq(c, "bandpass", (p.f || 1250) * (vi ? rnd(0.04) : 1), p.Q || 1.1);
    var post = gain(c, 1);
    chain(noise(c, tl + dec + 0.1), bq(c, "highpass", 500, 0.7), bp, g, shaper(c, tanhCurve(p.drive || 1.6)), post);
    post.connect(out);
    room(c, post, out, p.room == null ? 0.2 : p.room, p.roomLen || 0.3, 6000);
  };
  V.rim = function (c, out, p, vi) {
    var f = (p.f || 1700) * (vi ? rnd(0.01) : 1), dec = p.dec || 0.035;
    var sum = gain(c, 1);
    var o = osc(c, "triangle", f, 0, 0.15); o.frequency.exponentialRampToValueAtTime(f * 0.92, 0.012);
    var og = gain(c, 0); env(og.gain, 0, 0.8, 0.0005, dec); chain(o, og, sum);
    var b = osc(c, "sine", f * 0.28, 0, 0.12); var bg = gain(c, 0); env(bg.gain, 0, 0.55, 0.0005, dec * 0.9); chain(b, bg, sum);
    var ng = gain(c, 0); env(ng.gain, 0, 0.5, 0.0003, 0.01); chain(noise(c, 0.03), bq(c, "bandpass", 3200, 1), ng, sum);
    chain(sum, shaper(c, tanhCurve(1.8)), bq(c, "highpass", p.hp || 300, 0.7), out);
  };
  V.snap = function (c, out, p, vi) {
    var sum = gain(c, 1), dec = p.dec || 0.08;
    [0, 0.007].forEach(function (t, i) {
      var g = gain(c, 0); env(g.gain, t, i ? 0.9 : 0.4, 0.0005, i ? dec : 0.006);
      chain(noise(c, dec + 0.05, t), bq(c, "bandpass", (p.f || 2800) * (vi ? rnd(0.05) : 1), 2.2), g, sum);
    });
    var o = osc(c, "sine", 1900, 0, 0.06); var og = gain(c, 0); env(og.gain, 0, 0.2, 0.0005, 0.02); chain(o, og, sum);
    chain(sum, bq(c, "highpass", 600, 0.7), out);
    room(c, sum, out, p.room == null ? 0.12 : p.room, 0.2, 7000);
  };
  V.hat = function (c, out, p, vi) {
    var dec = p.dec || 0.05, br = (p.bright || 1) * (vi ? rnd(0.006) : 1);
    var mix = gain(c, 0.25);
    HAT_F.forEach(function (f) { osc(c, "square", f * br, 0, dec + 0.1).connect(mix); });
    var ng = gain(c, p.noiseAmt == null ? 0.35 : p.noiseAmt); chain(noise(c, dec + 0.1), ng, mix);
    var g = gain(c, 0);
    if (dec > 0.15) { g.gain.setValueAtTime(0.0001, 0); g.gain.linearRampToValueAtTime(1, 0.001); g.gain.setTargetAtTime(0, 0.001, dec / 4.5); }
    else env(g.gain, 0, 1, 0.0008, dec);
    var lp = p.dusty ? (p.lp || 8500) : (p.lp || 16000);
    chain(mix, bq(c, "bandpass", p.bpf || 10000, 0.7), bq(c, "highpass", p.hp || 7000, 0.7), bq(c, "lowpass", lp, 0.6), g, out);
    if (p.chick) {
      var cg = gain(c, 0); env(cg.gain, 0, p.chick, 0.001, 0.02);
      chain(noise(c, 0.05), bq(c, "bandpass", 1600, 1.5), cg, out);
    }
  };
  V.shaker = function (c, out, p, vi) {
    var a = p.a || 0.012, dec = p.dec || 0.07;
    var g = gain(c, 0); env(g.gain, 0, 1, a * (vi ? rnd(0.3) : 1), dec);
    chain(noise(c, a + dec + 0.1), bq(c, "highpass", p.hp || 4000, 0.7), bq(c, "bandpass", (p.f || 7500) * (vi ? rnd(0.05) : 1), p.Q || 0.8), g, out);
    if (p.dbl) {
      var g2 = gain(c, 0); env(g2.gain, p.dbl, 0.55, a, dec * 0.8);
      chain(noise(c, a + dec + 0.1, 0), bq(c, "bandpass", (p.f || 7500) * 1.1, 0.9), g2, out);
    }
  };
  V.tamb = function (c, out, p, vi) {
    var dec = p.dec || 0.18, mix = gain(c, 0.18);
    [5800, 7150, 8900, 10400, 12100].forEach(function (f) { osc(c, "square", f * (vi ? rnd(0.01) : 1), 0, dec + 0.1).connect(mix); });
    chain(noise(c, dec + 0.1), gain(c, 0.6), mix);
    var g = gain(c, 0);
    g.gain.setValueAtTime(0.0001, 0);
    [0, 0.009, 0.02].forEach(function (t, i) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(i === 0 ? 1 : 0.6, t + 0.001); g.gain.exponentialRampToValueAtTime(0.2, t + 0.008); });
    g.gain.exponentialRampToValueAtTime(0.0001, 0.02 + dec);
    chain(mix, bq(c, "highpass", 5000, 0.7), g, out);
  };
  /* 808: sine with pitch punch, clean sub + parallel distorted harmonics (glides happen live via playbackRate) */
  V.bass808 = function (c, out, p) {
    var f = mf(p.note || 36), dec = p.dec || 1.4, hold = p.hold == null ? 0.06 : p.hold;
    var o = osc(c, "sine", f, 0, dec + hold + 0.4);
    if (p.from) {
      o.frequency.setValueAtTime(f * Math.pow(2, p.from / 12), 0);
      o.frequency.exponentialRampToValueAtTime(f, p.glideT || 0.12);
    } else if (p.punch !== 0) {
      o.frequency.setValueAtTime(f * Math.pow(2, (p.punch || 12) / 12), 0);
      o.frequency.exponentialRampToValueAtTime(f, p.punchT || 0.025);
    }
    var amp = gain(c, 0);
    amp.gain.setValueAtTime(0.0001, 0);
    amp.gain.linearRampToValueAtTime(1, 0.003);
    amp.gain.setValueAtTime(1, 0.003 + hold);
    amp.gain.setTargetAtTime(0, 0.003 + hold, dec / 5);
    var o2 = gain(c, p.level || 0.6);
    o.connect(amp);
    chain(amp, bq(c, "lowpass", p.subLP || 140, 0.7), o2);
    if (p.dirty !== 0) {
      var pre = gain(c, 1);
      chain(amp, pre, shaper(c, tanhCurve(p.drive || 6)), bq(c, "highpass", p.dirtyHP || 90, 0.7), bq(c, "lowpass", p.dirtyLP || 4500, 0.6), gain(c, p.dirty == null ? 0.45 : p.dirty), o2);
    }
    if (p.click) { var cg = gain(c, 0); env(cg.gain, 0, p.click, 0.0005, 0.008); chain(noise(c, 0.03), bq(c, "bandpass", 2500, 1), cg, o2); }
    o2.connect(out);
  };
  /* Havoc-style filtered bass/piano note */
  V.bassHit = function (c, out, p) {
    var f = mf(p.note || 36), dec = p.dec || 0.9, lp = p.lp || 520;
    var mix = gain(c, 0.35);
    [[1, "sawtooth", 0.6], [1.004, "sawtooth", 0.5], [2, "sine", 0.35], [1, "sine", 0.9]].forEach(function (x) {
      var o = osc(c, x[1], f * x[0], 0, dec + 0.2); var g = gain(c, x[2]); chain(o, g, mix);
    });
    var flt = bq(c, "lowpass", lp * 3, 1.4);
    flt.frequency.setValueAtTime(lp * 3.5, 0); flt.frequency.exponentialRampToValueAtTime(lp, 0.15);
    var a = gain(c, 0); env(a.gain, 0, 1, 0.004, dec, 0.02);
    chain(mix, flt, a, shaper(c, tanhCurve(2)), out);
    var hg = gain(c, 0); env(hg.gain, 0, 0.25, 0.0005, 0.012); chain(noise(c, 0.03), bq(c, "lowpass", 2000, 0.7), hg, out);
  };
  /* amapiano log drum: FM pluck with pitch drop + sub body */
  V.logDrum = function (c, out, p) {
    var f = mf(p.note || 36), dec = p.dec || 0.45;
    var car = osc(c, "sine", f, 0, dec + 0.3), mod = osc(c, "sine", f * (p.ratio || 1.5), 0, dec + 0.3);
    car.frequency.setValueAtTime(f * 1.5, 0); car.frequency.exponentialRampToValueAtTime(f, 0.03);
    var ix = gain(c, 0);
    ix.gain.setValueAtTime(0, 0); ix.gain.linearRampToValueAtTime(f * (p.idx || 2.4), 0.001); ix.gain.exponentialRampToValueAtTime(f * 0.08, 0.14);
    chain(mod, ix, car.frequency);
    var a = gain(c, 0); env(a.gain, 0, 1, 0.002, dec, 0.03);
    var sub = osc(c, "sine", f, 0, dec + 0.3), sg = gain(c, 0); env(sg.gain, 0, 0.45, 0.003, dec * 1.1, 0.03);
    var sum = gain(c, 0.8);
    chain(car, a, sum); chain(sub, sg, sum);
    chain(sum, shaper(c, tanhCurve(p.drive || 2.2)), bq(c, "lowpass", p.lp || 3200, 0.6), out);
  };
  /* membrane: congas, bongos, lapo kabwit, djembe */
  V.conga = function (c, out, p, vi) {
    var f = (p.f || 220) * (vi ? rnd(0.01) : 1), dec = p.dec || 0.25;
    var o = osc(c, "sine", f * (p.drop || 1.35), 0, dec + 0.2);
    o.frequency.exponentialRampToValueAtTime(f, 0.02);
    var g = gain(c, 0); env(g.gain, 0, 0.9, 0.001, dec); chain(o, g, out);
    var o2 = osc(c, "sine", f * 1.58, 0, 0.2), g2 = gain(c, 0); env(g2.gain, 0, 0.3, 0.001, dec * 0.35); chain(o2, g2, out);
    var ng = gain(c, 0); env(ng.gain, 0, p.slap == null ? 0.3 : p.slap, 0.0005, p.slapDec || 0.02);
    chain(noise(c, 0.08), bq(c, "bandpass", Math.min(12000, f * (p.slapF || 6)), 1.5), ng, out);
  };
  V.talking = function (c, out, p) {
    var f = p.f || 120, dec = p.dec || 0.34;
    var o = osc(c, "sine", f, 0, dec + 0.2);
    o.frequency.setValueAtTime(f * 0.92, 0);
    o.frequency.linearRampToValueAtTime(f * (p.bend || 1.35), 0.08);
    o.frequency.exponentialRampToValueAtTime(f * 0.86, dec);
    var g = gain(c, 0); env(g.gain, 0, 1, 0.003, dec, 0.04);
    var t2 = osc(c, "triangle", f * 2, 0, dec), g2 = gain(c, 0); env(g2.gain, 0, 0.2, 0.003, dec * 0.4);
    chain(o, g, out); chain(t2, g2, out);
    var ng = gain(c, 0); env(ng.gain, 0, 0.25, 0.0005, 0.015); chain(noise(c, 0.05), bq(c, "bandpass", 1800, 1.2), ng, out);
  };
  V.tom = function (c, out, p, vi) {
    var f = (p.f || 120) * (vi ? rnd(0.01) : 1), dec = p.dec || 0.4;
    var o = osc(c, "sine", f * 1.5, 0, dec + 0.2);
    o.frequency.exponentialRampToValueAtTime(f, 0.06);
    o.frequency.exponentialRampToValueAtTime(f * 0.82, dec);
    var g = gain(c, 0); env(g.gain, 0, 1, 0.001, dec, 0.02);
    var t2 = osc(c, "triangle", f * 2.2, 0, 0.2), g2 = gain(c, 0); env(g2.gain, 0, 0.18, 0.001, 0.05);
    var ng = gain(c, 0); env(ng.gain, 0, 0.3, 0.0005, 0.02);
    var sum = gain(c, 1);
    chain(o, g, sum); chain(t2, g2, sum); chain(noise(c, 0.05), bq(c, "bandpass", 900, 1), ng, sum);
    chain(sum, shaper(c, tanhCurve(p.drive || 1.6)), out);
  };
  V.cowbell = function (c, out, p) {
    var f = p.f || 540, dec = p.dec || 0.4;
    var mix = gain(c, 0.4);
    [f, f * (p.ratio || 1.48)].forEach(function (x) { osc(c, "square", x, 0, dec + 0.1).connect(mix); });
    var g = gain(c, 0);
    g.gain.setValueAtTime(0.0001, 0); g.gain.linearRampToValueAtTime(1, 0.001);
    g.gain.exponentialRampToValueAtTime(0.3, 0.025); g.gain.exponentialRampToValueAtTime(0.0001, dec);
    chain(mix, bq(c, "bandpass", f * 1.45, 0.9), bq(c, "highpass", 350, 0.7), g, shaper(c, tanhCurve(p.drive || 1.5)), out);
  };
  /* tuned partials: claves, woodblock, agogo, perc ticks, bells, jing ping iron / triangle */
  V.tone = function (c, out, p, vi) {
    var f = (p.f || 1000) * (vi ? rnd(0.008) : 1);
    (p.parts || [[1, 1, 0.05]]).forEach(function (x) {
      var o = osc(c, x[3] || "sine", f * x[0], 0, x[2] + 0.2);
      if (p.drop) { o.frequency.setValueAtTime(f * x[0] * p.drop, 0); o.frequency.exponentialRampToValueAtTime(f * x[0], 0.012); }
      var g = gain(c, 0); env(g.gain, 0, x[1], 0.0006, x[2]); chain(o, g, out);
    });
    if (p.click) { var ng = gain(c, 0); env(ng.gain, 0, p.click, 0.0003, 0.006); chain(noise(c, 0.02), bq(c, "bandpass", Math.min(12000, f * 2), 1), ng, out); }
  };
  V.crash = function (c, out, p, vi) {
    var dec = p.dec || 1.8, br = (p.bright || 0.9) * (vi ? rnd(0.01) : 1);
    var mix = gain(c, 0.2);
    HAT_F.forEach(function (f) { osc(c, "square", f * br * 1.02, 0, dec + 0.2).connect(mix); osc(c, "square", f * br * 1.47, 0, dec + 0.2).connect(mix); });
    chain(noise(c, dec + 0.2), gain(c, p.noiseAmt || 0.9), mix);
    var g = gain(c, 0);
    g.gain.setValueAtTime(0.0001, 0); g.gain.linearRampToValueAtTime(1, p.a || 0.003); g.gain.setTargetAtTime(0, p.a || 0.003, dec / 4);
    var last = chain(mix, bq(c, "highpass", p.hp || 4200, 0.7), bq(c, "peaking", 7500, 0.8, 4), g);
    if (p.trashy) last = chain(last, shaper(c, tanhCurve(3)), bq(c, "lowpass", 9000, 0.6));
    last.connect(out);
    if (p.bell) {
      var bo = osc(c, "sine", p.bell, 0, dec), bo2 = osc(c, "sine", p.bell * 2.41, 0, dec);
      var bg = gain(c, 0); bg.gain.setValueAtTime(0.0001, 0); bg.gain.linearRampToValueAtTime(p.bellAmt || 0.4, 0.002); bg.gain.setTargetAtTime(0, 0.002, dec / 5);
      chain(bo, bg, out); bo2.connect(bg);
    }
  };
  V.riser = function (c, out, p) {
    var d = p.d || 1.5;
    var f = bq(c, "bandpass", 300, 5);
    f.frequency.setValueAtTime(300, 0); f.frequency.exponentialRampToValueAtTime(9000, d);
    var g = gain(c, 0); g.gain.setValueAtTime(0.0001, 0); g.gain.exponentialRampToValueAtTime(0.8, d); g.gain.exponentialRampToValueAtTime(0.0001, d + 0.08);
    chain(noise(c, d + 0.2), f, g, out);
    var o = osc(c, "sawtooth", 110, 0, d + 0.1); o.frequency.exponentialRampToValueAtTime(880, d);
    var og = gain(c, 0); og.gain.setValueAtTime(0.0001, 0); og.gain.exponentialRampToValueAtTime(0.12, d); og.gain.exponentialRampToValueAtTime(0.0001, d + 0.06);
    chain(o, bq(c, "lowpass", 2500, 0.7), og, out);
  };
  /* vinyl crackle / hiss bed (long, self-choking loop pad) */
  V.vinyl = function (c, out, p) {
    var L = p.len || 8, n = Math.ceil(L * c.sampleRate), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
    var dens = (p.dens || 14) / c.sampleRate, pops = (p.pops || 0.8) / c.sampleRate;
    for (var i = 0; i < n; i++) {
      var r = R();
      if (r < dens) { var a = Math.pow(R(), 3) * 0.9; d[i] += (R() < 0.5 ? -a : a); if (i + 1 < n) d[i + 1] -= a * 0.5; }
      else if (r < dens + pops) { var A = 0.6 + R() * 0.4; for (var k = 0; k < 40 && i + k < n; k++) d[i + k] += A * Math.exp(-k / 6) * (k % 2 ? -1 : 1); }
    }
    var s = c.createBufferSource(); s.buffer = b; s.start(0);
    chain(s, bq(c, "highpass", 250, 0.7), bq(c, "lowpass", 9000, 0.6), out);
    var hg = gain(c, p.hiss == null ? 0.035 : p.hiss);
    chain(noise(c, L), bq(c, "bandpass", 5000, 0.4), hg, out);
    var fade = 0.03;
    [hg.gain].forEach(function (pr) { pr.setValueAtTime(pr.value, L - fade); pr.linearRampToValueAtTime(0, L); });
  };
  V.rain = function (c, out, p) {
    var L = p.len || 6;
    var ng = gain(c, 0.22);
    chain(noise(c, L), bq(c, "lowpass", 1400, 0.5), bq(c, "highpass", 200, 0.5), ng, out);
    for (var t = 0.05; t < L - 0.1; t += 0.02 + R() * 0.12) {
      var o = osc(c, "sine", 2000 + R() * 3500, t, t + 0.03), g = gain(c, 0);
      env(g.gain, t, 0.05 + R() * 0.12, 0.0005, 0.012); chain(o, g, out);
    }
  };
  /* baby-scratch chirp */
  V.scratch = function (c, out, p) {
    var s = osc(c, "sawtooth", 60, 0, 0.3);
    var pts = [[0, 60], [0.05, 430], [0.1, 90], [0.105, 90], [0.15, 390], [0.22, 45]];
    pts.forEach(function (x, i) { if (i === 0) s.frequency.setValueAtTime(x[1], 0); else s.frequency.linearRampToValueAtTime(x[1], x[0]); });
    var nz = noise(c, 0.3), ng = gain(c, 0.35); nz.connect(ng);
    var mix = gain(c, 1); s.connect(mix); ng.connect(mix);
    var f1 = bq(c, "bandpass", 900, 2.5), f2 = bq(c, "bandpass", 1500, 3);
    pts.forEach(function (x, i) { var v = Math.max(300, x[1] * 4); if (i === 0) { f1.frequency.setValueAtTime(v, 0); f2.frequency.setValueAtTime(v * 1.7, 0); } else { f1.frequency.linearRampToValueAtTime(v, x[0]); f2.frequency.linearRampToValueAtTime(v * 1.7, x[0]); } });
    var g = gain(c, 0);
    g.gain.setValueAtTime(0.0001, 0); g.gain.linearRampToValueAtTime(1, 0.01); g.gain.setValueAtTime(1, 0.095);
    g.gain.linearRampToValueAtTime(0.05, 0.1); g.gain.linearRampToValueAtTime(1, 0.11); g.gain.setValueAtTime(1, 0.19); g.gain.exponentialRampToValueAtTime(0.0001, 0.23);
    var sum = gain(c, 1); mix.connect(f1); mix.connect(f2); f1.connect(sum); f2.connect(sum);
    chain(sum, g, shaper(c, tanhCurve(2)), bq(c, "highpass", 250, 0.7), out);
  };
  /* melodic stabs (routed to Keys) */
  V.stab = function (c, out, p) {
    var k = p.kind || "keys", dec = p.dec || 0.9, notes = p.notes || [60, 63, 67];
    var mix = gain(c, 0.9 / Math.sqrt(notes.length)), a = gain(c, 0);
    var att = { choir: 0.05, strings: 0.035, brass: 0.025, horn: 0.02 }[k] || 0.004;
    env(a.gain, 0, 1, att, dec, k === "horn" || k === "brass" ? 0.12 : 0);
    notes.forEach(function (m) {
      var f = mf(m);
      function O(type, ratio, amp, det, dest) { var o = osc(c, type, f * ratio, 0, dec + att + 0.4); if (det) o.detune.value = det; var g = gain(c, amp); chain(o, g, dest || mix); return o; }
      if (k === "keys") { O("sine", 1, 0.8, -6); O("triangle", 1, 0.3, 7); O("sine", 2, 0.12); }
      else if (k === "ep") { O("sine", 1, 0.8); O("sine", 2, 0.22); var tg = gain(c, 0); env(tg.gain, 0, 0.12, 0.0005, 0.06); chain(osc(c, "sine", f * 7.1, 0, 0.2), tg, mix); }
      else if (k === "piano") { for (var h = 1; h <= 7; h++) O("sine", h * (1 + 0.0004 * h * h), 0.8 / h); }
      else if (k === "bell") { O("sine", 1, 0.7); O("sine", 2.76, 0.25); O("sine", 5.4, 0.08); }
      else if (k === "organ") { O("sine", 1, 0.6); O("sine", 2, 0.35); O("sine", 3, 0.2); O("sine", 4, 0.12); }
      else if (k === "choir" || k === "strings") { O("sawtooth", 1, 0.4, -9); O("sawtooth", 1, 0.4, 9); O("sawtooth", 0.5, 0.2, 0); }
      else if (k === "supersaw") { [-24, -14, -6, 0, 6, 14, 24].forEach(function (d) { O("sawtooth", 1, 0.2, d); }); }
      else if (k === "brass" || k === "horn") {
        var o1 = O("sawtooth", 1, 0.5, -5), o2 = O(k === "horn" ? "square" : "sawtooth", 1, 0.35, 5);
        [o1, o2].forEach(function (o) { o.detune.setValueAtTime(-180, 0); o.detune.linearRampToValueAtTime(0, 0.07); });
      }
      else { O("sawtooth", 1, 0.5, -7); O("square", 1, 0.2, 7); } /* pluck */
    });
    var last = mix;
    if (k === "choir") {
      var fs = gain(c, 1);
      [[700, 1], [1150, 0.6], [2600, 0.25]].forEach(function (x) { chain(mix, bq(c, "bandpass", x[0], 4), gain(c, x[1] * 2.2), fs); });
      last = fs;
    } else if (k === "pluck" || k === "brass" || k === "horn" || k === "keys" || k === "strings" || k === "supersaw") {
      var lp = bq(c, "lowpass", p.lp || 2000, k === "pluck" ? 3 : 0.9);
      if (k === "pluck") { lp.frequency.setValueAtTime(p.lp ? p.lp * 2 : 4200, 0); lp.frequency.exponentialRampToValueAtTime(p.lp ? p.lp / 3 : 400, 0.35); }
      if (k === "brass" || k === "horn") { lp.frequency.setValueAtTime(700, 0); lp.frequency.exponentialRampToValueAtTime(p.lp || 3200, 0.06); lp.frequency.exponentialRampToValueAtTime((p.lp || 3200) * 0.45, dec); }
      mix.connect(lp); last = lp;
    } else if (p.lp) { var l2 = bq(c, "lowpass", p.lp, 0.7); mix.connect(l2); last = l2; }
    var dr = p.drive || (k === "supersaw" ? 3 : k === "horn" ? 2.2 : 0);
    if (dr) last = chain(last, shaper(c, tanhCurve(dr)));
    chain(last, a, out);
  };
  /* formant "vox" chops (original, synthesized — no sampled vocals) */
  var VOWELS = { oo: [300, 870, 2240], ah: [730, 1090, 2440], eh: [530, 1840, 2480], ee: [270, 2290, 3010], oh: [570, 840, 2410] };
  V.vox = function (c, out, p) {
    var f = mf(p.note || 64), dur = p.dur || 0.26, v0 = VOWELS[p.vowel || "ah"], v1 = VOWELS[p.to || p.vowel || "ah"];
    var s = osc(c, "sawtooth", f, 0, dur + 0.3);
    var lfo = osc(c, "sine", 5.5, 0, dur + 0.3), lg = gain(c, 14); chain(lfo, lg, s.detune);
    if (p.bend) { s.detune.setValueAtTime(p.bend, 0); s.detune.linearRampToValueAtTime(0, 0.06); }
    var src = gain(c, 1); s.connect(src); chain(noise(c, dur + 0.3), gain(c, 0.08), src);
    var sum = gain(c, 1);
    [1, 0.5, 0.22].forEach(function (amp, i) {
      var b = bq(c, "bandpass", v0[i], 9 - i * 2);
      b.frequency.setValueAtTime(v0[i], 0); b.frequency.linearRampToValueAtTime(v1[i], dur * 0.8);
      chain(src, b, gain(c, amp * 3), sum);
    });
    var g = gain(c, 0);
    g.gain.setValueAtTime(0.0001, 0); g.gain.linearRampToValueAtTime(1, 0.015); g.gain.setValueAtTime(1, dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, dur);
    chain(sum, g, bq(c, "highpass", 180, 0.7), out);
    room(c, g, out, 0.15, 0.3, 6000);
  };
  V.glitch = function (c, out, p) {
    var sum = gain(c, 1);
    for (var i = 0; i < (p.n || 6); i++) {
      var t = i * (p.gap || 0.03), g = gain(c, 0); env(g.gain, t, 1 - i * 0.1, 0.0005, 0.02);
      var o = osc(c, "square", (p.f || 420) * (1 + i * 0.12), t, t + 0.04);
      chain(o, g, sum);
      var ng = gain(c, 0); env(ng.gain, t, 0.5, 0.0005, 0.015); chain(noise(c, 0.04, t), bq(c, "bandpass", 3000, 1), ng, sum);
    }
    chain(sum, shaper(c, tanhCurve(3)), out);
  };
  V.squeak = function (c, out, p) {
    var f = p.f || 1000;
    var o = osc(c, "sine", f, 0, 0.3), o2 = osc(c, "square", f, 0, 0.3), g2 = gain(c, 0.08);
    [o, o2].forEach(function (x) { x.frequency.setValueAtTime(f, 0); x.frequency.exponentialRampToValueAtTime(f * 2.5, 0.05); x.frequency.exponentialRampToValueAtTime(f * 1.7, 0.13); });
    var g = gain(c, 0); env(g.gain, 0, 1, 0.004, 0.13, 0.02);
    chain(o, g); chain(o2, g2, g); chain(g, bq(c, "highpass", 500, 0.7), out);
  };
  V.zap = function (c, out, p) {
    var o = osc(c, "triangle", p.f || 3000, 0, 0.25);
    o.frequency.exponentialRampToValueAtTime(60, p.d || 0.13);
    var g = gain(c, 0); env(g.gain, 0, 1, 0.001, (p.d || 0.13) + 0.03);
    chain(o, g, shaper(c, tanhCurve(2)), out);
  };
  V.tapestop = function (c, out, p) {
    var d = p.d || 0.7, lp = bq(c, "lowpass", 4000, 0.8);
    lp.frequency.setValueAtTime(4000, 0); lp.frequency.exponentialRampToValueAtTime(200, d);
    var g = gain(c, 0); g.gain.setValueAtTime(0.0001, 0); g.gain.linearRampToValueAtTime(0.5, 0.01); g.gain.setValueAtTime(0.5, d * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, d);
    [48, 51, 55].forEach(function (m) { var o = osc(c, "sawtooth", mf(m), 0, d + 0.1); o.frequency.exponentialRampToValueAtTime(mf(m) * 0.12, d); o.connect(lp); });
    chain(lp, g, out);
  };
  V.chain = function (c, out, p) {
    for (var i = 0; i < (p.n || 7); i++) {
      var t = i * 0.045 + R() * 0.02, a = 0.4 + R() * 0.6;
      [2300, 3700, 5100].forEach(function (f, k) {
        var o = osc(c, "sine", f * (0.85 + R() * 0.3), t, t + 0.08), g = gain(c, 0);
        env(g.gain, t, a * [0.6, 0.4, 0.25][k], 0.0004, 0.035); chain(o, g, out);
      });
      var ng = gain(c, 0); env(ng.gain, t, a * 0.3, 0.0003, 0.008); chain(noise(c, 0.02, t), bq(c, "highpass", 4000, 0.7), ng, out);
    }
  };
  V.swish = function (c, out, p) {
    var d = p.d || 0.3, g = gain(c, 0);
    g.gain.setValueAtTime(0.0001, 0); g.gain.linearRampToValueAtTime(1, d * 0.3); g.gain.exponentialRampToValueAtTime(0.0001, d);
    var f = bq(c, "bandpass", 2000, 0.8); f.frequency.setValueAtTime(1500, 0); f.frequency.linearRampToValueAtTime(3500, d);
    chain(noise(c, d + 0.1), f, g, out);
  };
  V.rumble = function (c, out, p) {
    var dec = p.dec || 0.4;
    var src = gain(c, 1);
    var o = osc(c, "sine", 70, 0, 0.3); o.frequency.exponentialRampToValueAtTime(42, 0.12);
    var og = gain(c, 0); env(og.gain, 0, 1, 0.002, 0.18); chain(o, og, src);
    var ng = gain(c, 0); env(ng.gain, 0, 0.5, 0.001, 0.05); chain(noise(c, 0.1), ng, src);
    var cv = c.createConvolver(); cv.buffer = roomIR(c, 1.4, 2);
    var g = gain(c, 0); g.gain.setValueAtTime(0.0001, 0); g.gain.linearRampToValueAtTime(1, 0.02); g.gain.setTargetAtTime(0, 0.03, dec / 3);
    chain(src, cv, bq(c, "lowpass", p.lp || 160, 0.8), bq(c, "highpass", 30, 0.7), shaper(c, tanhCurve(p.drive || 2.5)), g, out);
  };
  V.noiseHit = function (c, out, p) {
    var g = gain(c, 0); env(g.gain, 0, 1, 0.001, p.dec || 0.15);
    var post = gain(c, 1);
    chain(noise(c, 0.4), bq(c, "highpass", p.hp || 800, 0.7), g, shaper(c, tanhCurve(2.5)), post);
    post.connect(out); room(c, post, out, 0.3, 0.35, 8000);
  };
  V.synthBass = function (c, out, p) {
    var f = mf(p.note || 36), dec = p.dec || 0.3;
    var mix = gain(c, 0.5);
    [[1, "sawtooth", 0.6, -5], [1, "square", 0.35, 6], [0.5, "sine", 0.7, 0]].forEach(function (x) { var o = osc(c, x[1], f * x[0], 0, dec + 0.2); o.detune.value = x[3]; chain(o, gain(c, x[2]), mix); });
    var lp = bq(c, "lowpass", p.lp0 || 2600, p.Q || 4);
    lp.frequency.setValueAtTime(p.lp0 || 2600, 0); lp.frequency.exponentialRampToValueAtTime(p.lp1 || 280, p.fT || 0.14);
    var a = gain(c, 0); env(a.gain, 0, 1, 0.003, dec, 0.03);
    chain(mix, lp, a, shaper(c, tanhCurve(p.drive || 1.6)), out);
  };

  window.IPBDrumVoices = { V: V, SR: SR, mf: mf, db: db, clipCurve: clipCurve, tanhCurve: tanhCurve, seed: seed, R: R };
})();
(function () {
  "use strict";
  var DV = window.IPBDrumVoices, V = DV.V, SR = DV.SR, db = DV.db;
  var CRUSH12 = { bits: 12, rate: 26040 };   /* SP-1200 spec: 12-bit, 26.04 kHz, no reconstruction filter */
  var DEF_LEN = { kick: 0.65, snare: 0.65, clap: 0.6, rim: 0.2, snap: 0.35, shaker: 0.3, tamb: 0.4, logDrum: 0.8, conga: 0.6,
    talking: 0.6, tom: 0.75, cowbell: 0.5, riser: 1.8, scratch: 0.3, glitch: 0.3, squeak: 0.3, zap: 0.25, chain: 0.5, noiseHit: 0.7 };

  /* P(name, group, voice, params, options) — groups: drums / bass / hats / perc / keys (= mixer channels) */
  function P(n, g, v, p, o) {
    o = o || {}; p = p || {};
    var len = o.len;
    if (!len) {
      if (v === "hat") len = (p.dec || 0.05) > 0.15 ? p.dec * 2.2 + 0.1 : 0.25;
      else if (v === "bass808") len = (p.dec || 1.4) + 0.5;
      else if (v === "bassHit" || v === "synthBass" || v === "rumble") len = (p.dec || 0.6) + 0.35;
      else if (v === "crash") len = (p.dec || 1.8) * 1.2;
      else if (v === "tone") len = Math.max.apply(null, (p.parts || [[1, 1, 0.05]]).map(function (x) { return x[2]; })) + 0.12;
      else if (v === "stab") len = (p.dec || 0.9) + 0.6;
      else if (v === "vox") len = (p.dur || 0.26) + 0.4;
      else if (v === "vinyl" || v === "rain") len = p.len || 8;
      else if (v === "tapestop" || v === "swish") len = (p.d || 0.5) + 0.12;
      else len = DEF_LEN[v] || 0.5;
    }
    return {
      n: n, g: g, v: v, p: p, len: len, rr: o.rr || 1, db: o.db || 0, L: o.L || null,
      crush: o.crush, lp: o.lp || 0, rev: !!o.rev, ck: o.ck || null, pan: o.pan || 0, nudge: o.nudge || 0,
      hum: o.hum || 0, glide: o.glide || 0.07, tuned: !!o.tuned, synth: o.synth == null ? 1 : o.synth
    };
  }
  function lay(s, dB, o) { o = o || {}; return { s: s, db: dB, hp: o.hp || 0, lp: o.lp || 0, rate: o.rate || 1, off: o.off || 0 }; }

  /* ---- shared building blocks ---- */
  var HH = "hh";
  function closedHat(n, dB, o) { o = o || {}; return P(n, "hats", "hat", { dec: o.dec || 0.045, bright: o.bright || 1, dusty: o.dusty, lp: o.lp, hp: o.hp, noiseAmt: o.noiseAmt, chick: o.chick }, { rr: 3, db: dB, ck: HH, pan: o.pan == null ? 0.12 : o.pan, L: o.L, hum: o.hum, crush: o.crush }); }
  function openHat(n, dB, o) { o = o || {}; return P(n, "hats", "hat", { dec: o.dec || 0.4, bright: o.bright || 1, lp: o.lp, dusty: o.dusty }, { rr: 1, db: dB, ck: HH, pan: o.pan == null ? 0.18 : o.pan, L: o.L, crush: o.crush }); }
  function b808(n, dB, p, o) { o = o || {}; return P(n, "bass", "bass808", p, { db: dB, ck: "b8", tuned: true, crush: false, glide: o.glide || 0.08 }); }
  function crash(n, dB, o) { o = o || {}; return P(n, "hats", "crash", { dec: o.dec || 1.8, trashy: o.trashy, bright: o.bright, bell: o.bell, bellAmt: o.bellAmt, hp: o.hp, noiseAmt: o.noiseAmt }, { db: dB, rev: o.rev, pan: o.pan == null ? -0.15 : o.pan, crush: o.crush, len: o.len }); }
  function revCym(dB) { return crash("Reverse Cymbal", dB, { rev: true, dec: 1.6, len: 1.9 }); }
  function vinyl(dB, o) { o = o || {}; return P(o.n || "Vinyl Crackle", "perc", "vinyl", { len: 8, dens: o.dens || 14, pops: o.pops || 0.8, hiss: o.hiss }, { db: dB, ck: "vinyl", crush: false, len: 8 }); }
  function stab(n, dB, p, o) { o = o || {}; return P(n, "keys", "stab", p, { db: dB, crush: o.crush, pan: o.pan || 0, tuned: true, rev: o.rev }); }
  function vox(n, dB, p, o) { o = o || {}; return P(n, "keys", "vox", p, { db: dB, rev: o.rev, tuned: true, pan: o.pan || 0 }); }
  function clapL(n, dB, p, L, o) { o = o || {}; return P(n, "drums", "clap", p, { rr: 3, db: dB, L: L, crush: o.crush, synth: o.synth }); }
  function snap(n, dB, o) { o = o || {}; return P(n || "Snap", "drums", "snap", { dec: 0.08, room: o.room }, { rr: 2, db: dB, L: [lay("snap_sp", o.layerDb == null ? -2 : o.layerDb, { hp: 400 })], pan: o.pan || 0, crush: o.crush }); }
  function rim(n, dB, o) { o = o || {}; return P(n || "Rim", "drums", "rim", { f: o.f || 1700 }, { rr: 2, db: dB, L: o.L, crush: o.crush, pan: o.pan || 0 }); }
  function shakerL(n, dB, o) { o = o || {}; return P(n || "Shaker", "hats", "shaker", { f: o.f || 7500, dec: o.dec || 0.07, a: o.a, dbl: o.dbl }, { rr: 3, db: dB, L: o.L === undefined ? [lay(["shaker_slap", "shaker_fast"], -3, { hp: 2000 })] : o.L, pan: o.pan == null ? -0.2 : o.pan, crush: o.crush, synth: o.synth, hum: o.hum }); }
  function tambL(dB, o) { o = o || {}; return P("Tambourine", "hats", "tamb", { dec: 0.16 }, { rr: 2, db: dB, L: [lay("tambourine", -2, { hp: 3000 })], pan: o.pan == null ? 0.3 : o.pan, crush: o.crush }); }
  function tomP(n, f, dB, o) { o = o || {}; return P(n, "perc", "tom", { f: f, dec: o.dec || 0.4, drive: o.drive }, { db: dB, pan: o.pan == null ? -0.1 : o.pan, crush: o.crush }); }
  function perc(n, f, dB, o) { o = o || {}; return P(n, "perc", "tone", { f: f, parts: o.parts || [[1, 1, 0.045], [2.3, 0.35, 0.02]], click: o.click == null ? 0.3 : o.click, drop: o.drop }, { rr: 2, db: dB, L: o.L, pan: o.pan == null ? -0.25 : o.pan, crush: o.crush }); }
  function riser(dB) { return P("Riser", "perc", "riser", { d: 1.5 }, { db: dB }); }

  /* ---------------- 18 kits (consistent 4x4 layout: row1 kick/808, row2 snare/clap, row3 hats, row4 perc/FX) ---------------- */
  var KITS = [
    {
      id: "qb", name: "QB Bap", cat: "boombap", genre: "Queensbridge boom-bap", bpm: 90, swing: 62, lead: true,
      desc: "Hard NY boom-bap: knocking kick, cracking snare, 12-bit SP/MPC grit.",
      color: { crush: CRUSH12 }, bus: { thr: -16, ratio: 3, atk: 0.012, rel: 0.12, smash: 0.3, drive: 1.35 },
      pads: [
        P("QB Kick", "drums", "kick", { f0: 165, f1: 52, fEnd: 46, pitchT: 0.045, dec: 0.38, drive: 3, click: 0.35, knock: 0.45, hold: 0.03 }, { rr: 2, db: 0, L: [lay("kick_gogodze", -8, { hp: 40 })] }),
        P("Kick Ghost", "drums", "kick", { f0: 140, f1: 56, fEnd: 50, pitchT: 0.03, dec: 0.17, drive: 2, click: 0.2, knock: 0.3, hold: 0.01 }, { rr: 2, db: -7, L: [lay("kick_gogodze_retro", -9, { hp: 45 })] }),
        b808("808 Sub", -1, { note: 36, dec: 1.2, drive: 3, dirty: 0.25, punch: 7 }),
        P("Filtered Bass Hit", "bass", "bassHit", { note: 36, dec: 0.95, lp: 520 }, { db: -2, ck: "bh", tuned: true, glide: 0.06 }),
        P("Crack Snare", "drums", "snare", { tone1: 185, tone2: 330, bodyDec: 0.09, noiseDec: 0.2, crack: 0.6, room: 0.18, drive: 2.5 }, { rr: 3, db: -0.5, L: [lay(["snare_retro_1", "snare_retro_2", "snare_retro_3"], -5, { hp: 120 })], nudge: 4, hum: 3 }),
        P("Snare Ghost", "drums", "snare", { tone1: 170, tone2: 300, bodyDec: 0.06, noiseDec: 0.12, crack: 0.2, room: 0.12, drive: 1.5, lp: 6000 }, { rr: 3, db: -11, hum: 4 }),
        P("Rimshot", "drums", "snare", { tone1: 330, tone2: 620, bodyDec: 0.05, noiseDec: 0.1, noiseHP: 2000, crack: 0.9, crackF: 3000, room: 0.12, drive: 3 }, { rr: 2, db: -3, L: [lay("snare_rimshot_alu", -2, { hp: 200 })] }),
        P("Dusty Break Snare", "drums", "snare", { tone1: 160, tone2: 290, noiseDec: 0.28, crack: 0.45, room: 0.35, roomLen: 0.45, lp: 7000, drive: 3 }, { rr: 2, db: -2, L: [lay("snare_retro_3", -3, { rate: 0.9, hp: 100 })], len: 0.8 }),
        closedHat("Crisp Closed Hat", -10, { dec: 0.045, L: [lay(["hat_retro_1", "hat_retro_2"], -6, { hp: 3000 })], hum: 5 }),
        closedHat("Dusty Closed Hat", -11, { dec: 0.05, dusty: true, lp: 8000, L: [lay("hat_retro_3", -5, { hp: 2500 })], hum: 5 }),
        openHat("Open Hat", -12, { dec: 0.42, L: [lay("openhat_retro", -6, { hp: 2500 })] }),
        tambL(-13),
        vinyl(-17),
        P("Scratch Chirp", "perc", "scratch", {}, { db: -9, pan: -0.1 }),
        stab("Eerie Keys Stab", -9, { kind: "keys", notes: [64, 65, 71], dec: 1.3, lp: 1800 }),
        crash("Trash Crash", -13, { trashy: true, dec: 1.8 })
      ],
      starter: {
        rows: { 0: "X------x-X------X-x------X----x-", 1: "---------------------------o----", 3: "X--------X------X--------X------",
          4: "----X-------X-------X-------X---", 5: "-------o-------o-------o---o---o", 8: "X-x-X-x-X-x-X-x-X-x-X-x-X-x-X---",
          10: "------------------------------x-", 11: "----o-------o-------o-------o---", 12: "X-------------------------------" },
        notes: { 3: { 0: -8, 9: -8, 16: -3, 25: -5 } }
      }
    },
    {
      id: "buffalo", name: "Buffalo Grime", cat: "boombap", genre: "Griselda-style grimy boom-bap", bpm: 84, swing: 58,
      desc: "Dusty, eerie and sparse: dirty kick, crunchy snare, rim ghosts, vinyl hiss.",
      color: { crush: CRUSH12, lp: 6500 }, bus: { thr: -17, ratio: 3.5, atk: 0.015, rel: 0.14, smash: 0.22, drive: 1.5 },
      pads: [
        P("Dirty Kick", "drums", "kick", { f0: 150, f1: 50, fEnd: 44, dec: 0.42, drive: 5, click: 0.25, knock: 0.4, lp: 6000, hold: 0.03 }, { rr: 2, db: 0, L: [lay("kick_rusty", -6, { lp: 5000, hp: 35 })] }),
        P("Kick Soft", "drums", "kick", { f0: 120, f1: 50, fEnd: 46, dec: 0.25, drive: 2, click: 0.1, knock: 0.3 }, { rr: 2, db: -7 }),
        b808("Low Sub Hit", -2, { note: 36, dec: 0.45, drive: 1.5, dirty: 0.1, punch: 3 }),
        perc("Wood Knock", 380, -6, { parts: [[1, 1, 0.07], [2.6, 0.3, 0.03]], L: [lay("woodblock", -3, { rate: 0.7 })], pan: 0.1 }),
        P("Grime Snare", "drums", "snare", { tone1: 175, tone2: 310, noiseDec: 0.22, crack: 0.45, room: 0.3, drive: 4, lp: 6500 }, { rr: 3, db: -0.5, L: [lay(["snare_retro_2", "snare_retro_1"], -4, { hp: 120 })], hum: 4 }),
        P("Rim Ghost", "drums", "rim", { f: 1500 }, { rr: 2, db: -10, L: [lay("sidestick_retro", -2)] }),
        snap("Finger Snap", -7),
        P("Reverse Snare Swell", "drums", "snare", { tone1: 180, noiseDec: 0.3, room: 0.6, roomLen: 0.6, crack: 0.3 }, { db: -9, rev: true, len: 0.8 }),
        closedHat("Hat Tick", -13, { dec: 0.025, lp: 7000 }),
        shakerL("Shaker Dust", -13, { f: 6500 }),
        openHat("Open Hat Dark", -14, { dec: 0.35, lp: 6000 }),
        P("Ride Bell Dark", "hats", "crash", { dec: 1.1, bell: 620, bellAmt: 0.7, noiseAmt: 0.25, hp: 5000 }, { db: -14, pan: -0.2 }),
        vinyl(-15, { n: "Vinyl Hiss + Crackle", hiss: 0.07, dens: 18 }),
        P("Tape Stop FX", "perc", "tapestop", { d: 0.7 }, { db: -9 }),
        P("Chain / Metal Foley", "perc", "chain", {}, { db: -11, pan: 0.2 }),
        revCym(-13)
      ],
      starter: {
        rows: { 0: "X------x--x-----X-------x-----o-", 4: "----X-------X-------X-------X---", 5: "-----------o----------o---------",
          9: "o-o-o-o-o-o-o-o-o-o-o-o-o-o-o-o-", 12: "X-------------------------------" }
      }
    },
    {
      id: "trap", name: "Trap", cat: "trap", genre: "Atlanta trap", bpm: 140, swing: 50,
      desc: "Punchy short kick, long driven 808 with glides, layered clap, tight hats and rolls.",
      color: {}, bus: { thr: -13, ratio: 3, atk: 0.01, rel: 0.1, smash: 0, drive: 1.2 },
      pads: [
        P("Kick", "drums", "kick", { f0: 200, f1: 58, fEnd: 50, pitchT: 0.03, dec: 0.3, drive: 2.5, click: 0.5, knock: 0.35, lp: 12000 }, { rr: 2, db: 0, L: [lay("kick_heavy_sp", -10, { hp: 40 })] }),
        P("Kick 2", "drums", "kick", { f0: 260, f1: 62, fEnd: 54, pitchT: 0.025, dec: 0.2, drive: 3, click: 0.8, knock: 0.2, lp: 14000 }, { rr: 2, db: -3 }),
        b808("808 Long", -1, { note: 36, dec: 1.6, drive: 5, dirty: 0.45, punch: 12 }),
        b808("808 Punch", -1, { note: 36, dec: 0.45, drive: 7, dirty: 0.55, punch: 14 }),
        clapL("Clap", -2, { f: 1300, dec: 0.22, room: 0.15, bursts: 4 }, [lay(["clap_1", "clap_2"], -4, { hp: 300 })]),
        P("Snare", "drums", "snare", { tone1: 220, tone2: 400, noiseDec: 0.16, noiseHP: 1800, crack: 0.5, room: 0.08, drive: 2 }, { rr: 3, db: -2, L: [lay("snare_close", -8, { hp: 150 })] }),
        rim("Rim", -7),
        snap("Snap", -7),
        closedHat("Closed Hat", -9, { dec: 0.04, bright: 1.05 }),
        closedHat("Hat Soft", -13, { dec: 0.03, bright: 1.1 }),
        openHat("Open Hat", -11, { dec: 0.38 }),
        perc("Perc Tick", 900, -9, {}),
        riser(-11),
        tomP("Tom", 110, -4, { dec: 0.45 }),
        stab("Stab Cm", -9, { kind: "pluck", notes: [60, 63, 67], dec: 0.6 }),
        crash("Crash", -12)
      ],
      starter: {
        rows: { 0: "X------x--X-----X-----x-------x-", 2: "X------x--X-----X-----x-------x-", 4: "--------X---------------X-------",
          8: "x-x-x-x-x-x-xxrrx-x-x-t-x-x-x---", 10: "------------------------------x-" },
        notes: { 2: { 0: -7, 7: -7, 10: -4, 16: -11, 22: -9, 30: -7 } }, slides: { 2: [10, 30] }
      }
    },
    {
      id: "bkdrill", name: "Brooklyn Drill", cat: "trap", genre: "NY / Brooklyn drill", bpm: 142, swing: 52,
      desc: "Hard short kick, heavily distorted sliding 808s, crisp tight snare, 3-3-2 hats.",
      color: {}, bus: { thr: -13, ratio: 3.5, atk: 0.008, rel: 0.1, smash: 0.12, drive: 1.4 },
      pads: [
        P("Kick", "drums", "kick", { f0: 220, f1: 60, fEnd: 52, pitchT: 0.025, dec: 0.22, drive: 3.5, click: 0.6, knock: 0.4, lp: 12000 }, { rr: 2, db: 0 }),
        P("Kick 2", "drums", "kick", { f0: 180, f1: 55, fEnd: 50, dec: 0.3, drive: 2, click: 0.3 }, { rr: 2, db: -4 }),
        b808("808 Slide", -1, { note: 36, dec: 1.5, drive: 9, dirty: 0.6, punch: 12 }, { glide: 0.1 }),
        b808("808 Glide-Up", -1, { note: 36, dec: 1.2, drive: 9, dirty: 0.6, from: -5, glideT: 0.12 }, { glide: 0.1 }),
        P("Drill Snare", "drums", "snare", { tone1: 240, tone2: 450, noiseDec: 0.14, noiseHP: 2200, crack: 0.7, room: 0.06, drive: 3 }, { rr: 3, db: -1.5, L: [lay("snare_rimshot_rusty", -6, { hp: 150 })] }),
        rim("Counter Rim", -6, { f: 1900, L: [lay("sidestick_retro", -4)] }),
        clapL("Clap", -4, { f: 1500, dec: 0.18, room: 0.1 }, [lay("clap_2", -5, { hp: 300 })]),
        snap("Snap", -7),
        closedHat("Closed Hat", -9, { dec: 0.035, bright: 1.1 }),
        closedHat("Hat Soft", -12, { dec: 0.03, bright: 1.15 }),
        openHat("Open Hat", -11, { dec: 0.3, bright: 1.1 }),
        perc("Perc Tick", 1100, -9, { parts: [[1, 1, 0.035], [2.1, 0.3, 0.015]] }),
        stab("Dark Choir Stab", -9, { kind: "choir", notes: [50, 53, 57], dec: 1.0 }),
        crash("Crash", -12),
        stab("Minor Piano Stab", -8, { kind: "piano", notes: [58, 61, 65], dec: 1.1 }),
        revCym(-12)
      ],
      starter: {
        rows: { 0: "X------x--------X---------x--x--", 2: "X------x--x-----X---------x--x--", 4: "--------X-------------------X---",
          5: "------o-------o----o-------o----", 8: "x--x--x-x--x--x-x--x--x-x--x--t-" },
        notes: { 2: { 0: -10, 7: -10, 10: -7, 16: 0, 26: -3, 29: -10 } }, slides: { 2: [10, 26] }
      }
    },
    {
      id: "ukdrill", name: "UK Drill", cat: "trap", genre: "London drill", bpm: 141, swing: 56,
      desc: "Short thud kick, long controlled 808 slides, tight late snare, swung skippy hats.",
      color: {}, bus: { thr: -13, ratio: 3, atk: 0.01, rel: 0.1, smash: 0.1, drive: 1.3 },
      pads: [
        P("UK Kick", "drums", "kick", { f0: 170, f1: 55, fEnd: 50, dec: 0.18, drive: 2, click: 0.3, knock: 0.35 }, { rr: 2, db: 0 }),
        P("Kick 2", "drums", "kick", { f0: 200, f1: 58, fEnd: 52, dec: 0.25, drive: 2.5, click: 0.45 }, { rr: 2, db: -4 }),
        b808("808 Slide", -1, { note: 36, dec: 1.8, drive: 4, dirty: 0.35, punch: 10 }, { glide: 0.11 }),
        b808("Sub Glide", -1, { note: 36, dec: 1.4, drive: 1, dirty: 0.05, punch: 5 }, { glide: 0.12 }),
        P("UK Snare", "drums", "snare", { tone1: 230, tone2: 420, noiseDec: 0.12, crack: 0.6, drive: 2, room: 0.08 }, { rr: 3, db: -1.5, L: [lay("snare_piccolo", -6, { hp: 150 })], nudge: 15 }),
        rim("Rim Click", -7, { f: 2000 }),
        clapL("Clap", -4, { f: 1400, dec: 0.2 }, [lay("clap_1", -5, { hp: 300 })]),
        P("Snare Flam", "drums", "snare", { tone1: 230, tone2: 420, noiseDec: 0.12, crack: 0.5, flam: 0.018, room: 0.08 }, { rr: 2, db: -4 }),
        closedHat("Closed Hat", -9, { dec: 0.04 }),
        closedHat("Hat Skip", -12, { dec: 0.03, bright: 1.08 }),
        openHat("Open Hat", -11, { dec: 0.32 }),
        shakerL("Shaker", -13),
        stab("Dark Piano Stab", -8, { kind: "piano", notes: [54, 57, 61], dec: 1.2 }),
        stab("String Stab", -10, { kind: "strings", notes: [54, 61, 66], dec: 0.8, lp: 3000 }),
        stab("Bell Pluck", -10, { kind: "bell", notes: [78], dec: 1.2 }),
        crash("Reverse Crash", -12, { rev: true, dec: 1.6, len: 1.9 })
      ],
      starter: {
        rows: { 0: "X-----x---x-----X-x-------x---x-", 2: "X-----x---x-----X-x-------x---x-", 4: "--------X---------------X-------",
          5: "---o-------o----------o------o--", 8: "x--x--x-x--x--x-x--x--x-x-x--x-t" },
        notes: { 2: { 0: -6, 6: -6, 10: -3, 16: -8, 18: -8, 26: -6, 30: -3 } }, slides: { 2: [10, 26] }
      }
    },
    {
      id: "sexydrill", name: "Sexy Drill", cat: "trap", genre: "Club / R&B-sampled drill", bpm: 144, swing: 54,
      desc: "Lighter, bouncier drill: soft kick, cleaner 808 glides, rim snare, airy chops.",
      color: {}, bus: { thr: -15, ratio: 2.8, atk: 0.012, rel: 0.12, smash: 0, drive: 1.15 },
      pads: [
        P("Soft Kick", "drums", "kick", { f0: 150, f1: 55, fEnd: 50, dec: 0.25, drive: 1.5, click: 0.2, knock: 0.3 }, { rr: 2, db: 0 }),
        P("Kick 2", "drums", "kick", { f0: 190, f1: 58, fEnd: 52, dec: 0.2, drive: 2, click: 0.4 }, { rr: 2, db: -4 }),
        b808("808 Glide", -1, { note: 36, dec: 1.4, drive: 2.5, dirty: 0.2, punch: 9 }, { glide: 0.09 }),
        b808("Sub", -1, { note: 36, dec: 1.0, drive: 1, dirty: 0, punch: 4 }),
        P("Rim Snare", "drums", "snare", { tone1: 330, tone2: 600, bodyDec: 0.05, noiseDec: 0.08, crack: 0.8, crackF: 2800, room: 0.05, drive: 2 }, { rr: 3, db: -2, L: [lay("snare_rimshot_alu", -4, { hp: 200 })] }),
        snap("Snap", -6),
        clapL("Soft Clap", -5, { f: 1200, dec: 0.28, room: 0.3 }, [lay("clap_room", -4, { hp: 300 })]),
        P("Snare", "drums", "snare", { tone1: 210, tone2: 390, noiseDec: 0.15, crack: 0.5, room: 0.12 }, { rr: 3, db: -3 }),
        closedHat("Closed Hat", -10, { dec: 0.04 }),
        closedHat("Hat Swing", -13, { dec: 0.03, bright: 1.06 }),
        openHat("Open Hat", -12, { dec: 0.34 }),
        shakerL("Shaker", -13),
        vox("Vox Chop 'ooh'", -10, { vowel: "oo", note: 64, dur: 0.32 }),
        stab("EP m9 Stab", -9, { kind: "ep", notes: [57, 60, 64, 67, 71], dec: 1.4 }),
        vinyl(-17),
        vox("Reverse Vox", -11, { vowel: "ah", to: "oo", note: 67, dur: 0.4 }, { rev: true })
      ],
      starter: {
        rows: { 0: "X---------------X-------x-----x-", 2: "X---------------X-------x-----x-", 4: "--------X---------------------X-",
          5: "----o-------o-------o-------o---", 8: "x-x-x-x-x-x-xxx-x-x-x-x-x-x-x-t-" },
        notes: { 2: { 0: -3, 16: -3, 24: 0, 30: -5 } }, slides: { 2: [30] }
      }
    },
    {
      id: "jersey", name: "Jersey Club", cat: "club", genre: "Jersey club / club-rap", bpm: 140, swing: 50,
      desc: "Saturated club kick with the 4-4-3-3-2 run, big clap, synth squeaks, chops.",
      color: {}, bus: { thr: -13, ratio: 4, atk: 0.008, rel: 0.1, smash: 0.1, drive: 1.5 },
      pads: [
        P("Club Kick", "drums", "kick", { f0: 230, f1: 60, fEnd: 52, dec: 0.3, drive: 4, click: 0.5, knock: 0.35 }, { rr: 2, db: 0, L: [lay("kick_heavy_sp", -8, { hp: 40 })] }),
        P("Kick + Sub", "drums", "kick", { f0: 200, f1: 55, fEnd: 48, dec: 0.3, drive: 3, click: 0.4, sub: 0.6, subDec: 0.6 }, { rr: 1, db: -1, len: 0.9 }),
        b808("808 Short", -1, { note: 36, dec: 0.5, drive: 5, dirty: 0.4, punch: 12 }),
        tomP("Low Tom", 95, -4),
        clapL("Clap", -2, { f: 1250, dec: 0.25, room: 0.18 }, [lay(["clap_1", "clap_2"], -4, { hp: 300 })]),
        P("Snare", "drums", "snare", { tone1: 220, tone2: 400, noiseDec: 0.15, crack: 0.55, room: 0.1 }, { rr: 3, db: -3 }),
        P("Squeak", "perc", "squeak", { f: 1000 }, { db: -9, pan: 0.15 }),
        rim("Rim", -7),
        closedHat("Closed Hat", -10, { dec: 0.04 }),
        openHat("Open Hat", -12, { dec: 0.3 }),
        shakerL("Shaker", -13),
        crash("Crash", -12),
        vox("Vox Chop 'ay'", -9, { vowel: "eh", to: "ee", note: 67, dur: 0.2 }),
        vox("Vox Chop 2", -10, { vowel: "ah", note: 62, dur: 0.18 }),
        P("Zap FX", "perc", "zap", {}, { db: -11 }),
        stab("Horn Synth Stab", -9, { kind: "brass", notes: [55, 62, 67], dec: 0.35 })
      ],
      starter: {
        rows: { 0: "X---x---x--x--x-X---x---x--x--x-", 4: "----X-------X-------X-------X---", 6: "--x---x---x-------x---x---x-----",
          8: "----x-------x-------x-------x---", 12: "x-x-----x-x-x---x-x-----xxx-----" }
      }
    },
    {
      id: "rage", name: "Rage", cat: "trap", genre: "Rage / Opium-style", bpm: 160, swing: 50,
      desc: "Distortion as the instrument: blown-out kick and 808, crushed clap-snare, supersaws.",
      color: {}, bus: { thr: -12, ratio: 4, atk: 0.006, rel: 0.08, smash: 0.15, drive: 2 },
      pads: [
        P("Rage Kick", "drums", "kick", { f0: 200, f1: 55, fEnd: 48, dec: 0.35, drive: 8, click: 0.4, knock: 0.3 }, { rr: 2, db: 0 }),
        P("Kick 2", "drums", "kick", { f0: 240, f1: 60, fEnd: 52, dec: 0.22, drive: 5, click: 0.6 }, { rr: 2, db: -4 }),
        b808("808 Distorted", -1, { note: 36, dec: 1.6, drive: 12, dirty: 0.8, punch: 12 }, { glide: 0.09 }),
        b808("808 Clean Sub", -1, { note: 36, dec: 1.4, drive: 1, dirty: 0, punch: 5 }),
        clapL("Clap-Snare (crushed)", -2, { f: 1400, dec: 0.2, room: 0.1, drive: 3 }, [lay("snare_close", -3, { hp: 200 }), lay("clap_2", -4)], { crush: { bits: 8, rate: 22050 } }),
        P("Snare 2", "drums", "snare", { tone1: 230, tone2: 430, noiseDec: 0.15, crack: 0.7, drive: 5, room: 0.08 }, { rr: 3, db: -3 }),
        rim("Rim", -7),
        P("Glitch Stutter", "perc", "glitch", { n: 6, gap: 0.028 }, { db: -10 }),
        closedHat("Closed Hat", -10, { dec: 0.035 }),
        closedHat("Hat Roll", -13, { dec: 0.028, bright: 1.1 }),
        openHat("Open Hat", -12, { dec: 0.3 }),
        perc("Perc", 800, -9, {}),
        stab("Supersaw Stab", -10, { kind: "supersaw", notes: [60, 63, 67, 70], dec: 0.5, lp: 5000 }),
        vox("Pitched Vox Chop", -10, { vowel: "ah", to: "eh", note: 69, dur: 0.22, bend: -300 }),
        riser(-11),
        crash("Crash", -12)
      ],
      starter: {
        rows: { 0: "X-----x---x-----X-----x---x---x-", 2: "X-----x---x-----X-----x---x---x-", 4: "--------X---------------X-------",
          8: "x-x-x-x-x-x-x-x-x-x-x-x-xxxxtttt" },
        notes: { 2: { 0: 0, 6: 0, 10: 3, 16: -4, 22: -4, 26: -2, 30: 0 } }, slides: { 2: [10, 26] }
      }
    },
    {
      id: "pluggnb", name: "PluggnB", cat: "trap", genre: "Pluggnb / plugg", bpm: 150, swing: 50,
      desc: "Soft boomy kick, clean tuned 808 glides, airy clap, plugg bell melodies.",
      color: {}, bus: { thr: -16, ratio: 2.5, atk: 0.015, rel: 0.12, smash: 0, drive: 1.1 },
      pads: [
        P("Plugg Kick", "drums", "kick", { f0: 130, f1: 50, fEnd: 45, dec: 0.5, drive: 1.5, click: 0.1, knock: 0.25, sub: 0.35, subDec: 0.5 }, { rr: 2, db: 0, len: 0.8 }),
        P("Kick 2", "drums", "kick", { f0: 170, f1: 55, fEnd: 50, dec: 0.25, drive: 2, click: 0.3 }, { rr: 2, db: -4 }),
        b808("808 Glide", -1, { note: 36, dec: 1.6, drive: 2, dirty: 0.15, punch: 7 }, { glide: 0.1 }),
        b808("Sub", -1, { note: 36, dec: 1.2, drive: 1, dirty: 0, punch: 3 }),
        clapL("Plugg Clap", -3, { f: 1150, dec: 0.35, room: 0.35, roomLen: 0.45 }, [lay("clap_room", -3, { hp: 300 })]),
        P("Soft Snare", "drums", "snare", { tone1: 200, tone2: 360, noiseDec: 0.16, crack: 0.3, room: 0.2, lp: 9000 }, { rr: 3, db: -4 }),
        rim("Rim", -8),
        snap("Snap", -7),
        closedHat("Closed Hat", -11, { dec: 0.04 }),
        closedHat("Hat Triplet", -13, { dec: 0.03, bright: 1.05 }),
        openHat("Open Hat", -13, { dec: 0.34 }),
        tambL(-14),
        stab("Plugg Bell", -9, { kind: "bell", notes: [72], dec: 1.0 }),
        stab("Maj7 Pad Stab", -11, { kind: "strings", notes: [53, 57, 60, 64], dec: 1.0, lp: 2500 }),
        vox("Vox Chop", -11, { vowel: "oo", to: "ah", note: 69, dur: 0.3 }),
        revCym(-13)
      ],
      starter: {
        rows: { 0: "X-------x-----x-X-------x-x-----", 2: "X-------x-----x-X-------x-x-----", 4: "--------X---------------X-------",
          8: "x-x-x-x-x-x-x-x-x-x-x-x-x-x-t-t-", 12: "X--x--x---X--x--X--x--x---x-x---" },
        notes: { 2: { 0: -7, 8: -7, 14: -5, 16: -3, 24: -3, 26: -7 }, 12: { 0: 0, 3: 4, 6: 7, 10: 11, 13: 7, 16: 2, 19: 5, 22: 9, 26: 7, 28: 4 } },
        slides: { 2: [14, 26] }
      }
    },
    {
      id: "phonk", name: "Drift Phonk", cat: "trap", genre: "Drift phonk", bpm: 160, swing: 50,
      desc: "Clipped kick and snare, heavily distorted 808, tuned 808-style cowbell riffs.",
      color: {}, bus: { thr: -12, ratio: 4, atk: 0.006, rel: 0.08, smash: 0.2, drive: 2.2 },
      pads: [
        P("Phonk Kick", "drums", "kick", { f0: 180, f1: 52, fEnd: 46, dec: 0.42, drive: 6, clip: 0.55, click: 0.35 }, { rr: 2, db: 0 }),
        P("Kick 2", "drums", "kick", { f0: 220, f1: 58, fEnd: 50, dec: 0.25, drive: 4, click: 0.5 }, { rr: 2, db: -4 }),
        b808("808 Distorted", -1, { note: 36, dec: 1.3, drive: 10, dirty: 0.7, punch: 12 }),
        b808("Sub", -1, { note: 36, dec: 1.2, drive: 1, dirty: 0, punch: 4 }),
        P("Clipped Snare", "drums", "snare", { tone1: 200, tone2: 380, noiseDec: 0.18, crack: 0.6, drive: 6, room: 0.1 }, { rr: 3, db: -1.5, L: [lay("snare_dolf_sp", -5, { hp: 150 })] }),
        clapL("Clap", -3, { f: 1100, dec: 0.32, room: 0.2, drive: 2.5 }, [lay("clap_1", -4)]),
        rim("Rim", -7),
        P("Snare Roll", "drums", "snare", { tone1: 210, tone2: 390, noiseDec: 0.1, crack: 0.4, drive: 4, room: 0.05 }, { rr: 3, db: -6 }),
        closedHat("Closed Hat", -10, { dec: 0.04, bright: 0.95 }),
        openHat("Open Hat", -12, { dec: 0.35, bright: 0.95 }),
        shakerL("Shaker", -13),
        crash("Crash", -12),
        P("Cowbell", "perc", "cowbell", { f: 587, ratio: 1.48, dec: 0.45, drive: 2 }, { db: -6, tuned: true, ck: "cb", pan: 0.1 }),
        P("Cowbell Low", "perc", "cowbell", { f: 440, ratio: 1.48, dec: 0.45, drive: 2 }, { db: -6, tuned: true, pan: -0.1 }),
        stab("Stab Am", -9, { kind: "pluck", notes: [57, 60, 64], dec: 0.5 }),
        revCym(-12)
      ],
      starter: {
        rows: { 0: "X-----x---x-----X-----x---x---x-", 2: "X-----x---x-----X-----x---x---x-", 4: "--------X---------------X-------",
          8: "x-x-x-x-x-x-x-x-x-x-x-x-x-x-xxxx", 12: "X--x--x---x--x--X--x--x---x-x-x-" },
        notes: { 2: { 0: 0, 6: 0, 10: -2, 16: -4, 22: -4, 26: -5, 30: 0 }, 12: { 0: 0, 3: 0, 6: 3, 10: 1, 13: -2, 16: 0, 19: 0, 22: 3, 26: 5, 28: 3, 30: 1 } }
      }
    },
    {
      id: "afrobeats", name: "Afrobeats", cat: "afro", genre: "Afrobeats / Afro-fusion", bpm: 104, swing: 56,
      desc: "Round kick, crisp rim backbeat, real congas, shaker, clave and talking drum.",
      color: {}, bus: { thr: -16, ratio: 2.5, atk: 0.015, rel: 0.12, smash: 0, drive: 1.15 },
      pads: [
        P("Afro Kick", "drums", "kick", { f0: 140, f1: 55, fEnd: 50, dec: 0.32, drive: 1.5, click: 0.15, knock: 0.3 }, { rr: 2, db: 0 }),
        P("Kick 2", "drums", "kick", { f0: 170, f1: 58, fEnd: 52, dec: 0.22, drive: 2, click: 0.3 }, { rr: 2, db: -4 }),
        b808("Sub Bass", -1, { note: 36, dec: 0.45, drive: 1.5, dirty: 0.15, punch: 4 }),
        P("Talking Drum Low", "perc", "talking", { f: 110 }, { db: -5, tuned: true, pan: -0.15 }),
        rim("Rim", -3, { f: 1800, L: [lay("sidestick_retro", -4)] }),
        clapL("Clap", -4, { f: 1250, dec: 0.2 }, [lay(["clap_1", "clap_2"], -3, { hp: 300 })]),
        P("Snare Soft", "drums", "snare", { tone1: 210, tone2: 380, noiseDec: 0.14, crack: 0.3, room: 0.14 }, { rr: 3, db: -5 }),
        snap("Snap", -7),
        shakerL("Shaker", -11, { hum: 3 }),
        closedHat("Closed Hat", -12, { dec: 0.04 }),
        openHat("Open Hat", -13, { dec: 0.3 }),
        P("Conga High", "perc", "conga", { f: 330, dec: 0.2, slap: 0.2 }, { rr: 2, db: -6, L: [lay("conga_quinto", -1)], pan: 0.3, tuned: true }),
        P("Conga Low", "perc", "conga", { f: 200, dec: 0.28, slap: 0.15 }, { rr: 2, db: -6, L: [lay("conga_tumba", -1)], pan: -0.3, tuned: true }),
        P("Agogo", "perc", "tone", { f: 1500, parts: [[1, 1, 0.25], [2.73, 0.3, 0.12]], click: 0.2 }, { db: -10, L: [lay("agogo_hi", -2)], pan: 0.25, tuned: true }),
        P("Clave", "perc", "tone", { f: 2500, parts: [[1, 1, 0.05], [1.8, 0.2, 0.02]], click: 0.2 }, { rr: 2, db: -9, L: [lay("claves", -2)], pan: -0.2 }),
        tomP("Tom Perc", 160, -6, { dec: 0.3, pan: 0.2 })
      ],
      starter: {
        rows: { 0: "X-----x-X-------X-----x-X-----x-", 4: "---X--X---X--X-----X--X---X--X--", 5: "----x-------x-------x-------x---",
          8: "o-x-o-x-o-x-o-x-o-x-o-x-o-x-o-x-", 11: "--x----x--x-------x----x--x--x--", 14: "X--X---X--X-X---X--X---X--X-X---" }
      }
    },
    {
      id: "amapiano", name: "Amapiano", cat: "afro", genre: "Amapiano (log drum)", bpm: 112, swing: 58,
      desc: "Soft 4/4 kick, tuned FM log drum with glides, tight rim, swung shakers.",
      color: {}, bus: { thr: -16, ratio: 2.5, atk: 0.015, rel: 0.12, smash: 0, drive: 1.15 },
      pads: [
        P("Soft Kick", "drums", "kick", { f0: 150, f1: 60, fEnd: 55, dec: 0.22, drive: 1.5, click: 0.2, knock: 0.25, hp: 45 }, { rr: 2, db: 0 }),
        P("Kick 2", "drums", "kick", { f0: 180, f1: 62, fEnd: 56, dec: 0.18, drive: 2, click: 0.3, hp: 45 }, { rr: 2, db: -4 }),
        P("Log Drum", "bass", "logDrum", { note: 36, dec: 0.45 }, { db: -1, ck: "log", tuned: true, glide: 0.05, crush: false }),
        P("Log Drum High", "bass", "logDrum", { note: 48, dec: 0.35, idx: 2 }, { db: -2, ck: "log", tuned: true, glide: 0.05, crush: false }),
        rim("Rim", -4, { f: 1900, L: [lay("sidestick_retro", -5)] }),
        clapL("Clap", -4, { f: 1200, dec: 0.28, room: 0.25 }, [lay("clap_room", -3, { hp: 300 })]),
        P("Soft Snare", "drums", "snare", { tone1: 200, tone2: 360, noiseDec: 0.14, crack: 0.25, room: 0.2 }, { rr: 3, db: -5 }),
        snap("Snap", -7),
        shakerL("Shaker", -11, { hum: 3 }),
        closedHat("Closed Hat", -12, { dec: 0.04 }),
        openHat("Open Hat", -13, { dec: 0.28 }),
        tambL(-14),
        P("Conga", "perc", "conga", { f: 240, dec: 0.25, slap: 0.2 }, { rr: 2, db: -7, L: [lay("conga_open", -1)], pan: 0.25, tuned: true }),
        P("Woodblock", "perc", "tone", { f: 1300, parts: [[1, 1, 0.05], [2.4, 0.25, 0.02]], click: 0.2 }, { rr: 2, db: -10, L: [lay("woodblock", -2)], pan: -0.25 }),
        stab("Piano m9 Stab", -8, { kind: "piano", notes: [53, 56, 60, 63, 67], dec: 1.2 }),
        vox("Vox Chop", -11, { vowel: "ah", to: "oh", note: 65, dur: 0.3 })
      ],
      starter: {
        rows: { 0: "X---X---X---X---X---X---X---X---", 2: "---X--X---X-X---X--X--X-----X-x-", 4: "-------x-------x---x---x-------x",
          5: "----x-------x-------x-------x---", 8: "XoxoXoxoXoxoXoxoXoxoXoxoXoxoXoxo", 10: "--x---x---x---x---x---x---x---x-" },
        notes: { 2: { 3: 5, 6: 3, 10: 0, 12: 3, 16: 5, 19: 8, 22: 7, 28: 3, 30: 0 } }, slides: { 2: [22, 30] }
      }
    },
    {
      id: "afrohouse", name: "Afro House", cat: "afro", genre: "Afro house", bpm: 122, swing: 54,
      desc: "Deep 4/4 kick, hypnotic congas and djembe, shaker 16ths, chant chop.",
      color: {}, bus: { thr: -15, ratio: 2.8, atk: 0.012, rel: 0.12, smash: 0, drive: 1.2 },
      pads: [
        P("Deep Kick", "drums", "kick", { f0: 160, f1: 52, fEnd: 48, dec: 0.4, drive: 2, click: 0.25, knock: 0.3, sub: 0.3, subDec: 0.45 }, { rr: 2, db: 0 }),
        P("Kick 2", "drums", "kick", { f0: 190, f1: 56, fEnd: 50, dec: 0.28, drive: 2.5, click: 0.35 }, { rr: 2, db: -4 }),
        b808("Sub Bass", -1, { note: 36, dec: 0.5, drive: 1.5, dirty: 0.1, punch: 3 }),
        tomP("Low Tom", 100, -5),
        clapL("Clap", -3, { f: 1200, dec: 0.25, room: 0.22 }, [lay(["clap_1", "clap_2"], -3, { hp: 300 })]),
        rim("Rim", -6, { L: [lay("sidestick_retro", -5)] }),
        P("Snare", "drums", "snare", { tone1: 210, tone2: 380, noiseDec: 0.15, crack: 0.4, room: 0.15 }, { rr: 3, db: -4 }),
        snap("Snap", -7),
        shakerL("Shaker", -11, { hum: 2 }),
        closedHat("Closed Hat", -11, { dec: 0.045 }),
        openHat("Open Hat", -12, { dec: 0.3 }),
        P("Conga High", "perc", "conga", { f: 330, dec: 0.2, slap: 0.2 }, { rr: 2, db: -6, L: [lay("bongo_hi", -1)], pan: 0.3, tuned: true }),
        P("Conga Low", "perc", "conga", { f: 190, dec: 0.3, slap: 0.15 }, { rr: 2, db: -6, L: [lay("conga_tumba", -1)], pan: -0.3, tuned: true }),
        P("Djembe Slap", "perc", "conga", { f: 280, dec: 0.15, slap: 0.6, slapF: 9 }, { rr: 2, db: -6, L: [lay("conga_slap", -1)], pan: 0.15 }),
        P("Bell", "perc", "tone", { f: 1050, parts: [[1, 1, 0.35], [2.73, 0.3, 0.15]], click: 0.15 }, { db: -11, L: [lay("agogo_lo", -3)], pan: -0.2, tuned: true }),
        vox("Vocal Chant Chop", -10, { vowel: "oh", to: "ah", note: 57, dur: 0.38 })
      ],
      starter: {
        rows: { 0: "X---X---X---X---X---X---X---X---", 4: "----X-------X-------X-------X---", 8: "xoxoxoxoxoxoxoxoxoxoxoxoxoxoxoxo",
          10: "--x---x---x---x---x---x---x---x-", 11: "--x--x----x-x-----x--x----x-x--x", 12: "-------x-------x-------x----x---" }
      }
    },
    {
      id: "house", name: "House / Garage", cat: "club", genre: "House (speed-garage ready)", bpm: 124, swing: 54,
      desc: "Synth 909-style punchy kick, big clap, offbeat hats, pluck bass and chord stab.",
      color: {}, bus: { thr: -14, ratio: 3, atk: 0.01, rel: 0.12, smash: 0.08, drive: 1.3 },
      pads: [
        P("909-style Kick", "drums", "kick", { f0: 280, f1: 52, fEnd: 48, pitchT: 0.04, dec: 0.45, drive: 2.5, click: 0.45, clickHP: true, clickF: 5000, knock: 0.25 }, { rr: 2, db: 0 }),
        P("Kick 2", "drums", "kick", { f0: 220, f1: 55, fEnd: 50, dec: 0.3, drive: 2, click: 0.3 }, { rr: 2, db: -4 }),
        P("Bass Pluck", "bass", "synthBass", { note: 36, dec: 0.25, lp0: 2400, lp1: 300 }, { db: -2, ck: "b8", tuned: true, glide: 0.05, crush: false }),
        tomP("Tom", 120, -5),
        clapL("Clap", -2, { f: 1100, dec: 0.3, room: 0.2 }, [lay(["clap_1", "clap_2"], -3, { hp: 300 })]),
        P("Snare", "drums", "snare", { tone1: 220, tone2: 400, noiseDec: 0.16, crack: 0.45, room: 0.12 }, { rr: 3, db: -4 }),
        rim("Rim", -7),
        snap("Snap", -7),
        closedHat("Closed Hat", -10, { dec: 0.05 }),
        openHat("Open Hat", -11, { dec: 0.3 }),
        P("Ride", "hats", "crash", { dec: 1.3, bell: 700, bellAmt: 0.2, noiseAmt: 0.5, hp: 5500, bright: 1.1 }, { db: -14, pan: -0.2 }),
        shakerL("Shaker", -13),
        tambL(-13),
        stab("Chord Stab", -9, { kind: "organ", notes: [57, 60, 64, 67], dec: 0.35 }),
        vox("Vox Chop", -10, { vowel: "ah", to: "ee", note: 69, dur: 0.22 }),
        crash("Crash", -12)
      ],
      starter: {
        rows: { 0: "X---X---X---X---X---X---X---X---", 4: "----X-------X-------X-------X---", 8: "xoxoxoxoxoxoxoxoxoxoxoxoxoxoxoxo",
          9: "--x---x---x---x---x---x---x---x-", 2: "--x---x---x--x-x--x---x---x---x-" },
        notes: { 2: { 2: -3, 6: -3, 10: -3, 13: 0, 15: 2, 18: -5, 22: -5, 26: -5, 30: -3 } }
      }
    },
    {
      id: "techno", name: "Techno", cat: "club", genre: "Techno / hard techno", bpm: 135, swing: 50,
      desc: "Rumble kick and reverb-rumble bass, driving 16th hats, industrial metal perc.",
      color: {}, bus: { thr: -12, ratio: 4, atk: 0.006, rel: 0.1, smash: 0.12, drive: 2 },
      pads: [
        P("Rumble Kick", "drums", "kick", { f0: 200, f1: 50, fEnd: 45, dec: 0.4, drive: 5, click: 0.4, knock: 0.3 }, { rr: 2, db: 0 }),
        P("Distorted Kick", "drums", "kick", { f0: 230, f1: 52, fEnd: 46, dec: 0.35, drive: 12, click: 0.5 }, { rr: 2, db: -2 }),
        P("Rumble Bass", "bass", "rumble", { dec: 0.35, lp: 160 }, { db: -3, tuned: true }),
        tomP("Tom", 110, -5, { drive: 3 }),
        clapL("Clap", -3, { f: 1300, dec: 0.25, room: 0.3, roomLen: 0.5 }, [lay("clap_room", -4, { hp: 300 })]),
        P("Snare", "drums", "snare", { tone1: 200, tone2: 380, noiseDec: 0.2, crack: 0.5, drive: 4, room: 0.25 }, { rr: 3, db: -4 }),
        rim("Rim", -7),
        P("Noise Hit", "perc", "noiseHit", { dec: 0.15 }, { db: -9 }),
        closedHat("Closed Hat", -11, { dec: 0.035 }),
        openHat("Open Hat", -11, { dec: 0.28 }),
        P("Ride", "hats", "crash", { dec: 1.2, bell: 760, bellAmt: 0.2, noiseAmt: 0.5, hp: 5500, bright: 1.1 }, { db: -14, pan: -0.2 }),
        shakerL("Shaker", -13),
        P("Metal Perc", "perc", "tone", { f: 620, parts: [[1, 1, 0.12, "square"], [1.41, 0.6, 0.1], [2.76, 0.4, 0.08], [4.07, 0.2, 0.05]], click: 0.2 }, { db: -10, pan: 0.2, tuned: true }),
        stab("Industrial Stab", -10, { kind: "supersaw", notes: [48, 55, 60], dec: 0.3, lp: 3000, drive: 4 }),
        riser(-11),
        crash("Crash", -12)
      ],
      starter: {
        rows: { 0: "X---X---X---X---X---X---X---X---", 2: "-xx--xx--xx--xx--xx--xx--xx--xx-", 4: "----X-------X-------X-------X---",
          8: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", 9: "--x---x---x---x---x---x---x---x-" }
      }
    },
    {
      id: "rnb", name: "R&B Slow Jam", cat: "rnb", genre: "R&B / trip-hop R&B", bpm: 88, swing: 57,
      desc: "Soft kick, tight snare + clap layer, clean tuned 808, EP chords, vinyl.",
      color: {}, bus: { thr: -16, ratio: 2.5, atk: 0.015, rel: 0.14, smash: 0, drive: 1.1 },
      pads: [
        P("Soft Kick", "drums", "kick", { f0: 140, f1: 52, fEnd: 48, dec: 0.35, drive: 1.5, click: 0.15, knock: 0.3 }, { rr: 2, db: 0 }),
        P("Kick 2", "drums", "kick", { f0: 170, f1: 55, fEnd: 50, dec: 0.25, drive: 2, click: 0.25 }, { rr: 2, db: -4 }),
        b808("808 Clean", -1, { note: 36, dec: 1.4, drive: 2, dirty: 0.12, punch: 7 }, { glide: 0.1 }),
        b808("Sub", -1, { note: 36, dec: 1.0, drive: 1, dirty: 0, punch: 3 }),
        P("Tight Snare", "drums", "snare", { tone1: 230, tone2: 420, noiseDec: 0.13, crack: 0.45, room: 0.12 }, { rr: 3, db: -2, L: [lay("snare_close", -6, { hp: 150 })] }),
        rim("Rim", -7, { L: [lay("sidestick_retro", -4)] }),
        clapL("Clap Layer", -5, { f: 1200, dec: 0.25, room: 0.25 }, [lay("clap_room", -3, { hp: 300 })]),
        snap("Snap", -7),
        closedHat("Closed Hat", -11, { dec: 0.04 }),
        closedHat("Hat Triplet", -13, { dec: 0.03, bright: 1.05 }),
        openHat("Open Hat", -13, { dec: 0.32 }),
        shakerL("Shaker", -13),
        stab("EP Chord", -8, { kind: "ep", notes: [53, 57, 60, 64], dec: 1.6 }),
        vox("Vox Chop", -11, { vowel: "oo", to: "ah", note: 65, dur: 0.34 }),
        revCym(-13),
        vinyl(-17)
      ],
      starter: {
        rows: { 0: "X-----x---x-----X--x------x---x-", 4: "----X-------X-------X-------X---", 6: "----x-------x-------x-------x---",
          8: "x-x-x-x-x-x-x-x-x-x-xtx-x-x-x-t-", 7: "------o-------o-------o-------o-" }
      }
    },
    {
      id: "bouyon", name: "Bouyon", cat: "afro", genre: "Bouyon / carnival (Dominica)", bpm: 152, swing: 50,
      desc: "Dominica's own: steady 4/4 kick, 505-style offbeat snare, lapo kabwit drums, iron.",
      color: {}, bus: { thr: -13, ratio: 3, atk: 0.01, rel: 0.1, smash: 0.05, drive: 1.4 },
      pads: [
        P("Bouyon Kick", "drums", "kick", { f0: 190, f1: 58, fEnd: 52, dec: 0.26, drive: 3, click: 0.5, knock: 0.35 }, { rr: 2, db: 0 }),
        P("Kick 2", "drums", "kick", { f0: 220, f1: 60, fEnd: 54, dec: 0.2, drive: 3, click: 0.6 }, { rr: 2, db: -4 }),
        P("Synth Bass", "bass", "synthBass", { note: 36, dec: 0.3, lp0: 2600, lp1: 320 }, { db: -2, ck: "b8", tuned: true, glide: 0.05, crush: false }),
        tomP("Low Tom", 100, -5),
        P("505-style Snare", "drums", "snare", { tone1: 250, tone2: 480, bodyDec: 0.07, noiseDec: 0.12, noiseHP: 2000, crack: 0.5, room: 0.04, drive: 1.5 }, { rr: 3, db: -2, crush: { bits: 8, rate: 30000 } }),
        clapL("Clap", -4, { f: 1300, dec: 0.2 }, [lay(["clap_1", "clap_2"], -3, { hp: 300 })]),
        rim("Rim", -7),
        P("Snare Roll", "drums", "snare", { tone1: 250, tone2: 480, noiseDec: 0.08, crack: 0.35, room: 0.03 }, { rr: 3, db: -7, crush: { bits: 8, rate: 30000 } }),
        closedHat("Closed Hat", -11, { dec: 0.04 }),
        openHat("Open Hat", -12, { dec: 0.28 }),
        shakerL("Shaker", -11),
        P("Cowbell", "perc", "cowbell", { f: 560, dec: 0.35, drive: 1.5 }, { db: -9, L: [lay("cowbell_muted", -3)], pan: 0.2, tuned: true }),
        P("Lapo Kabwit Low", "perc", "conga", { f: 95, dec: 0.35, slap: 0.35, slapF: 8, drop: 1.5 }, { rr: 2, db: -4, L: [lay("frame_drum", -2)], pan: -0.2, tuned: true }),
        P("Lapo Kabwit High", "perc", "conga", { f: 190, dec: 0.2, slap: 0.45, slapF: 8 }, { rr: 2, db: -5, L: [lay("frame_drum_muted", -2)], pan: 0.25, tuned: true }),
        P("Jing Ping Iron", "perc", "tone", { f: 1760, parts: [[1, 1, 0.5], [2.76, 0.5, 0.35], [5.4, 0.3, 0.2], [8.9, 0.15, 0.12]], click: 0.3 }, { rr: 2, db: -12, pan: 0.3, tuned: true }),
        stab("Air Horn Synth Stab", -9, { kind: "horn", notes: [62, 69, 74], dec: 0.5 })
      ],
      starter: {
        rows: { 0: "X---X---X---X---X---X---X---X---", 4: "--x---x---x---x---x---x---x-x-x-", 12: "x--x--x---x--x--x--x--x---x-x---",
          13: "--x---x-x---x-x---x---x-x---xx--", 10: "xoxoxoxoxoxoxoxoxoxoxoxoxoxoxoxo" }
      }
    }
  ];

  var CATS = [
    { id: "all", name: "All" }, { id: "boombap", name: "Boom-Bap" }, { id: "trap", name: "Trap & Drill" },
    { id: "afro", name: "Afro & Caribbean" }, { id: "club", name: "Club" }, { id: "rnb", name: "R&B & Lo-Fi" }
  ];
  /* Lo-Fi Tape lives with R&B */
  KITS.splice(2, 0, {
    id: "lofi", name: "Lo-Fi Tape", cat: "rnb", genre: "Lo-fi hip-hop / chillhop", bpm: 78, swing: 60,
    desc: "Round soft kick, tape snare, brushes, dark hats, warm sub, Rhodes stab, crackle.",
    color: { crush: CRUSH12, lp: 8500 }, bus: { thr: -18, ratio: 2.5, atk: 0.02, rel: 0.15, smash: 0, drive: 1.1 },
    pads: [
      P("Soft Kick", "drums", "kick", { f0: 120, f1: 55, fEnd: 48, dec: 0.32, drive: 1.5, click: 0.08, knock: 0.3, lp: 4000 }, { rr: 2, db: 0, L: [lay("kick_gogodze_retro", -7, { lp: 3500, hp: 40 })] }),
      P("Kick Ghost", "drums", "kick", { f0: 110, f1: 55, fEnd: 50, dec: 0.18, drive: 1.2, click: 0.05, lp: 3500 }, { rr: 2, db: -8 }),
      b808("Warm Sub Bass", -3, { note: 36, dec: 0.8, drive: 1, dirty: 0.1, punch: 3 }),
      rim("Rim Knock", -6, { f: 1400, L: [lay("sidestick_retro", -2)] }),
      P("Tape Snare", "drums", "snare", { tone1: 190, tone2: 340, noiseDec: 0.18, crack: 0.25, room: 0.25, lp: 7000 }, { rr: 3, db: -3, L: [lay(["snare_retro_1", "snare_retro_2"], -5, { lp: 7000 })], hum: 6 }),
      P("Snare Ghost", "drums", "snare", { tone1: 180, tone2: 320, noiseDec: 0.1, crack: 0.1, room: 0.2, lp: 5000 }, { rr: 3, db: -13, hum: 6 }),
      snap("Snap", -8),
      P("Brush Swish", "drums", "swish", { d: 0.3 }, { rr: 2, db: -9, L: [lay("brush_snare", 0)], synth: 0.4 }),
      closedHat("Closed Hat", -12, { dec: 0.045, lp: 7000, L: [lay(["hat_retro_1", "hat_retro_3"], -5, { hp: 2500 })], hum: 8 }),
      closedHat("Pedal Hat", -13, { dec: 0.07, bright: 0.9, lp: 6000, chick: 0.3 }),
      openHat("Open Hat Soft", -15, { dec: 0.35, lp: 7000 }),
      shakerL("Shaker", -13, { hum: 8 }),
      vinyl(-15),
      P("Rain / Room Tone", "perc", "rain", { len: 6 }, { db: -20, ck: "rain", len: 6, crush: false }),
      stab("Rhodes m9 Stab", -8, { kind: "ep", notes: [50, 53, 57, 60, 64], dec: 1.6 }),
      P("Soft Ride", "hats", "crash", { dec: 1.2, bell: 650, bellAmt: 0.15, noiseAmt: 0.4, hp: 5000 }, { db: -16, pan: -0.2 })
    ],
    starter: {
      rows: { 0: "X-------X-x-----X-----x---x-----", 4: "----X-------X-------X-------X---", 5: "-------o------o--------o------o-",
        8: "X-o-x-o-X-o-x-o-X-o-x-o-X-o-x-o-", 11: "-o-o-o-o-o-o-o-o-o-o-o-o-o-o-o-o", 12: "X-------------------------------" }
    }
  });
  var BY_ID = {};
  KITS.forEach(function (k) {
    BY_ID[k.id] = k;
    k.crashPad = -1;
    k.pads.forEach(function (d, i) { if (k.crashPad < 0 && d.v === "crash" && !d.rev && /crash/i.test(d.n)) k.crashPad = i; });
  });

  /* drum-bus output trim (dB), calibrated so each starter lands around −11.5 LUFS with ≤ ~2.5 dB of peak limiting */
  var OUT_TRIM = {"afrobeats": 9.2, "afrohouse": 9.0, "amapiano": 6.7, "bkdrill": 7.5, "bouyon": 8.2, "buffalo": 10.6, "house": 9.0, "jersey": 8.5, "lofi": 10.2, "phonk": 6.1, "pluggnb": 7.2, "qb": 9.4, "rage": 6.5, "rnb": 7.9, "sexydrill": 8.0, "techno": 7.4, "trap": 8.3, "ukdrill": 8.0};
  KITS.forEach(function (k) { k.bus.out = OUT_TRIM[k.id] != null ? OUT_TRIM[k.id] : 8; });

  /* starter strings → steps (roll count), velocity, notes, slides. Legend: X accent · x hit · o ghost · r 32nd roll · t triplet roll */
  var VEL = { X: 1, x: 0.8, o: 0.45, r: 0.8, t: 0.8 };
  function starter(kit) {
    var st = kit.starter, L = 32, out = { len: L, pattern: [], vel: [], note: [], slide: [] };
    for (var i = 0; i < 16; i++) {
      var str = (st.rows[i] || "").replace(/\s+/g, ""), pr = [], vr = [], nr = [], sr = [];
      for (var s = 0; s < L; s++) {
        var ch = str[s] || "-";
        pr.push(ch === "r" ? 2 : ch === "t" ? 3 : VEL[ch] ? 1 : 0);
        vr.push(VEL[ch] || 0.8);
        nr.push((st.notes && st.notes[i] && st.notes[i][s]) || 0);
        sr.push(st.slides && st.slides[i] && st.slides[i].indexOf(s) !== -1 ? 1 : 0);
      }
      out.pattern.push(pr); out.vel.push(vr); out.note.push(nr); out.slide.push(sr);
    }
    return out;
  }

  /* ---------------- rendering ---------------- */
  function spCrush(d, bits, rate) {
    var q = Math.pow(2, bits - 1), step = rate / SR, ph = 1, hold = 0;
    for (var i = 0; i < d.length; i++) { ph += step; if (ph >= 1) { ph -= 1; hold = Math.round(d[i] * q) / q; } d[i] = hold; }
  }
  function renderPad(kit, def, vi, samples) {
    var n = Math.ceil(SR * def.len), c = new OfflineAudioContext(1, n, SR);
    var bus = c.createGain(), node = bus;
    var lp = def.lp || (kit.color && kit.color.lp) || 0;
    if (lp && def.v !== "vinyl" && def.v !== "rain") { var f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = lp; f.Q.value = 0.6; bus.connect(f); node = f; }
    node.connect(c.destination);
    DV.seed(kit.id + ":" + def.n + ":" + vi);
    if (def.synth > 0) {
      var sg = c.createGain(); sg.gain.value = def.synth; sg.connect(bus);
      V[def.v](c, sg, def.p, vi);
    }
    (def.L || []).forEach(function (L) {
      var name = Array.isArray(L.s) ? L.s[vi % L.s.length] : L.s, b = samples && samples[name];
      if (!b) return;
      var src = c.createBufferSource(); src.buffer = b; src.playbackRate.value = L.rate || 1;
      var last = src;
      if (L.hp) { var h = c.createBiquadFilter(); h.type = "highpass"; h.frequency.value = L.hp; last.connect(h); last = h; }
      if (L.lp) { var l = c.createBiquadFilter(); l.type = "lowpass"; l.frequency.value = L.lp; last.connect(l); last = l; }
      var g = c.createGain(); g.gain.value = db(L.db || 0); last.connect(g); g.connect(bus);
      src.start(L.off || 0);
    });
    return c.startRendering().then(function (buf) {
      var d = buf.getChannelData(0);
      if (def.rev) Array.prototype.reverse.call(d);
      var cr = def.crush === false ? null : (def.crush || (kit.color && kit.color.crush) || null);
      if (cr) spCrush(d, cr.bits, cr.rate);
      var fl = Math.min(d.length, Math.round(SR * (def.rev ? 0.004 : 0.012)));
      for (var i = 0; i < fl; i++) d[d.length - 1 - i] *= i / fl;
      if (def.rev) { var fi = Math.min(d.length, Math.round(SR * 0.01)); for (var j = 0; j < fi; j++) d[j] *= j / fi; }
      var pk = 0; for (var k = 0; k < d.length; k++) { var a = Math.abs(d[k]); if (a > pk) pk = a; }
      var target = db(def.db) * 0.891; /* designed pad level, peak re −1 dBFS */
      if (pk > 0) { var sc = target / pk; for (var m = 0; m < d.length; m++) d[m] *= sc; }
      if (cr) { /* re-quantise after the gain so the 12-bit grid survives */
        var q = Math.pow(2, cr.bits - 1); for (var z = 0; z < d.length; z++) d[z] = Math.round(d[z] * q) / q;
      }
      return buf;
    });
  }
  /* → Promise<Array(16) of Array(rr) AudioBuffer> */
  function renderKit(kit, samples) {
    return Promise.all(kit.pads.map(function (def) {
      var vs = [];
      for (var v = 0; v < def.rr; v++) vs.push(renderPad(kit, def, v, samples));
      return Promise.all(vs);
    }));
  }
  function samplesFor(kit) {
    var s = {};
    kit.pads.forEach(function (d) { (d.L || []).forEach(function (L) { (Array.isArray(L.s) ? L.s : [L.s]).forEach(function (n) { s[n] = 1; }); }); });
    return Object.keys(s);
  }

  /* ---------------- legacy (pre-2026) kits: trap / drill / phonk sessions, songs and swapped pads ----------------
   * old pad index → [new pad index, semitone offset for the step, velocity] */
  var LEGACY = {
    trap: { kit: "trap", map: [[0], [2, -7], [2, -2], [2, 0], [5], [4], [6], [8], [10], [9, 0, 0.8], [11], [13], [15], [7], [12], [14]] },
    drill: { kit: "bkdrill", map: [[0], [2, -5], [2, -7], [3, 2], [4], [6], [5], [8], [10], [9], [11], [11, -7], [13], [7], [15], [14]] },
    phonk: { kit: "phonk", map: [[0], [2, -8], [2, -5], [2, -3], [4], [5], [6], [8], [9], [10], [12, 0], [12, -5], [11], [12, -9], [15], [14]] }
  };

  window.IPBDrums = {
    SR: SR, KITS: KITS, BY_ID: BY_ID, CATS: CATS, LEGACY: LEGACY, ALIAS: { drill: "bkdrill" },
    starter: starter, renderKit: renderKit, renderPad: renderPad, samplesFor: samplesFor, spCrush: spCrush,
    tanhCurve: DV.tanhCurve, clipCurve: DV.clipCurve
  };
})();
