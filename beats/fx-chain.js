/* Island Pin Beats: shared track effects (Beats vocal channel + Studio tracks).
 * Manual and non-destructive: the raw take is never changed, effects are applied on playback / export only.
 * Insert chain: in → Low cut → EQ (3-band) → Compressor → De-esser → Saturation → Chorus/doubler → Wide → out
 * Reverb and Delay are SEND buses: every track with the same reverb (or delay) settings shares one bus, so a whole
 * project usually runs one convolver and one delay line (light on tablets). */
(function () {
  "use strict";
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function db(x) { return Math.pow(10, x / 20); }
  var DIV = { "1/16": 0.25, "1/8": 0.5, "1/8d": 0.75, "1/4": 1, "1/4d": 1.5, "1/2": 2 };
  var REVERBS = {
    room: { name: "Room", decay: 0.8, pre: 0.008, damp: 0.55, er: 1, dens: 1 },
    plate: { name: "Plate", decay: 1.8, pre: 0.015, damp: 0.25, er: 0, dens: 1.4 },
    hall: { name: "Hall", decay: 3.2, pre: 0.03, damp: 0.7, er: 0.6, dens: 1 }
  };
  function defaults() {
    return {
      // take cleanup (Beats vocal channel): processed after the take on the device, the raw take is kept
      bleed: { on: false }, nr: { on: false }, gate: { on: false },
      lowcut: { on: false, f: 90 },
      eq: { on: false, low: 0, mid: 0, midF: 2500, high: 0 },
      comp: { on: false, amt: 0.4 },
      deess: { on: false, amt: 0.5 },
      sat: { on: false, amt: 0.3 },
      chorus: { on: false, mix: 0.35 },
      delay: { on: false, div: "1/8d", pp: false, fb: 0.3, mix: 0.2 },
      reverb: { on: false, type: "plate", decay: 1.8, pre: 0.02, mix: 0.18 }
    };
  }
  /* fills missing blocks / fields (old saves load with every effect off) */
  function norm(fx) {
    var d = defaults(), o = {};
    fx = fx && typeof fx === "object" ? fx : {};
    Object.keys(d).forEach(function (k) { o[k] = Object.assign({}, d[k], fx[k] && typeof fx[k] === "object" ? fx[k] : {}); o[k].on = !!o[k].on; });
    Object.keys(fx).forEach(function (k) { if (!o[k]) o[k] = fx[k]; }); // keep fields other apps own (Studio: gate, detailed comp)
    return o;
  }
  function anyOn(fx) { if (!fx) return false; for (var k in fx) if (fx[k] && fx[k].on) return true; return false; }
  /* simple compressor "amount" 0..1 → threshold / ratio / makeup */
  function compParams(c) {
    if (c.thr != null && c.ratio != null) return { thr: c.thr, ratio: c.ratio, atk: c.atk || 0.01, rel: c.rel || 0.15, makeup: c.makeup || 0 };
    var a = clamp(+c.amt || 0, 0, 1);
    return { thr: -8 - a * 26, ratio: 1.5 + a * 4.5, atk: 0.006, rel: 0.14, makeup: a * 9 };
  }

  /* ---------- impulse responses (deterministic, generated once per context + settings) ---------- */
  var irCache = typeof WeakMap === "function" ? new WeakMap() : null;
  function impulse(c, type, decay) {
    var T = REVERBS[type] || REVERBS.plate, key = type + ":" + (+decay).toFixed(2), bag = irCache ? irCache.get(c) : null;
    if (!bag && irCache) { bag = {}; irCache.set(c, bag); }
    if (bag && bag[key]) return bag[key];
    var sr = c.sampleRate, len = Math.round(sr * Math.min(6, decay * 1.15 + 0.1)), b = c.createBuffer(2, len, sr);
    for (var ch = 0; ch < 2; ch++) {
      var d = b.getChannelData(ch), seed = 9001 + ch * 7919, lp = 0;
      for (var i = 0; i < len; i++) {
        seed = (seed * 16807) % 2147483647;
        var t = i / sr, n = (seed / 2147483647) * 2 - 1;
        var damp = 0.08 + 0.9 * Math.exp(-t * (2 + T.damp * 8)); // highs die faster: darker tail
        lp += damp * (n - lp);
        var env = Math.exp(-6.9 * t / decay) * (t < 0.004 ? t / 0.004 : 1);
        d[i] = lp * env * T.dens;
      }
      if (T.er) { // early reflections (rooms / halls)
        var ers = type === "room" ? [0.007, 0.011, 0.017, 0.023, 0.031] : [0.013, 0.021, 0.034, 0.047, 0.061];
        ers.forEach(function (s, k) { var j = Math.round((s + ch * 0.0017 * (k + 1)) * sr); if (j < len) d[j] += (0.55 - k * 0.08) * T.er * (k % 2 ? -1 : 1); });
      }
    }
    // equal energy for every preset / decay (so changing the room doesn't change the level)
    var e = 0; for (var c2 = 0; c2 < 2; c2++) { var x = b.getChannelData(c2); for (var q = 0; q < len; q++) e += x[q] * x[q]; }
    var g = 1.3 / Math.sqrt(e / 2 + 1e-9); for (var c3 = 0; c3 < 2; c3++) { var y = b.getChannelData(c3); for (var z = 0; z < len; z++) y[z] *= g; }
    if (bag) bag[key] = b;
    return b;
  }

  /* ---------- send buses ---------- */
  function revKey(r) { return "r:" + (r.type || "plate") + ":" + (+r.decay).toFixed(1) + ":" + Math.round((+r.pre || 0) * 1000); }
  function dlyKey(d, bpm) { return "d:" + (d.div || "1/8d") + ":" + (d.pp ? 1 : 0) + ":" + (+d.fb).toFixed(2) + ":" + Math.round(bpm); }
  function makeRevBus(c, dest, r) {
    var B = { input: c.createGain(), pre: c.createDelay(0.5), conv: c.createConvolver(), out: c.createGain(), hp: c.createBiquadFilter() };
    B.hp.type = "highpass"; B.hp.frequency.value = 180; // no mud in the tail
    B.pre.delayTime.value = clamp(+r.pre || 0, 0, 0.25);
    B.conv.normalize = false; B.conv.buffer = impulse(c, r.type, clamp(+r.decay || 1.8, 0.2, 6));
    B.input.connect(B.hp); B.hp.connect(B.pre); B.pre.connect(B.conv); B.conv.connect(B.out); B.out.connect(dest);
    return B;
  }
  function makeDlyBus(c, dest, d, bpm) {
    var t = clamp(60 / (bpm || 96) * (DIV[d.div] || 0.75), 0.02, 3.9), fb = clamp(+d.fb || 0, 0, 0.9);
    var B = { input: c.createGain(), out: c.createGain() };
    var lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 4500;
    var hp = c.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 150;
    B.input.connect(hp); hp.connect(lp);
    if (d.pp) { // ping-pong: first repeat left, then right, then left…
      var dl = c.createDelay(4), dr = c.createDelay(4), g = c.createGain(), pl = c.createStereoPanner(), pr = c.createStereoPanner();
      dl.delayTime.value = t; dr.delayTime.value = t; g.gain.value = fb; pl.pan.value = -1; pr.pan.value = 1;
      lp.connect(dl); dl.connect(pl); dl.connect(dr); dr.connect(pr); dr.connect(g); g.connect(dl);
      pl.connect(B.out); pr.connect(B.out);
    } else {
      var dd = c.createDelay(4), f = c.createGain(), dlp = c.createBiquadFilter();
      dd.delayTime.value = t; f.gain.value = fb; dlp.type = "lowpass"; dlp.frequency.value = 3800;
      lp.connect(dd); dd.connect(B.out); dd.connect(dlp); dlp.connect(f); f.connect(dd);
    }
    B.out.connect(dest);
    return B;
  }
  /* pool of shared buses for one context / destination */
  function Buses(c, dest) {
    var pool = {};
    return {
      get: function (kind, s, bpm) {
        var k = kind === "rev" ? revKey(s) : dlyKey(s, bpm);
        if (!pool[k]) pool[k] = { b: kind === "rev" ? makeRevBus(c, dest, s) : makeDlyBus(c, dest, s, bpm), used: 0 };
        return { key: k, input: pool[k].b.input };
      },
      gc: function (keep) { Object.keys(pool).forEach(function (k) { if (!keep[k]) { try { pool[k].b.out.disconnect(); } catch (e) { /* gone */ } delete pool[k]; } }); },
      count: function () { return Object.keys(pool).length; }
    };
  }

  /* ---------- insert chain ---------- */
  var satCurves = typeof WeakMap === "function" ? new WeakMap() : null;
  function satCurve(c) {
    var k = satCurves && satCurves.get(c); if (k) return k;
    var n = 2048, cur = new Float32Array(n);
    for (var i = 0; i < n; i++) { var x = (i / (n - 1)) * 2 - 1; cur[i] = Math.tanh(x * 3 + 0.15) - Math.tanh(0.15); } // tape-ish, a touch asymmetric (warm even harmonics)
    var m = Math.max(Math.abs(cur[0]), Math.abs(cur[n - 1])); for (var j = 0; j < n; j++) cur[j] /= m;
    if (satCurves) satCurves.set(c, cur);
    return cur;
  }
  var absCurve = null;
  function build(c) {
    var X = {};
    X.input = c.createGain();
    X.lowcut = c.createBiquadFilter(); X.lowcut.type = "highpass"; X.lowcut.Q.value = 0.707;
    X.low = c.createBiquadFilter(); X.low.type = "lowshelf"; X.low.frequency.value = 120;
    X.mid = c.createBiquadFilter(); X.mid.type = "peaking"; X.mid.Q.value = 0.9;
    X.high = c.createBiquadFilter(); X.high.type = "highshelf"; X.high.frequency.value = 8000;
    X.comp = c.createDynamicsCompressor(); X.comp.knee.value = 6;
    X.makeup = c.createGain();
    // de-esser: zero-latency dynamic high shelf. A band-pass of the sibilance band is rectified and smoothed into a
    // control signal that pulls the shelf gain down (in dB) only while an "s" is sounding.
    X.ds = c.createBiquadFilter(); X.ds.type = "highshelf"; X.ds.frequency.value = 5200; X.ds.gain.value = 0;
    X.dsBand = c.createBiquadFilter(); X.dsBand.type = "bandpass"; X.dsBand.frequency.value = 7000; X.dsBand.Q.value = 0.8;
    X.dsAbs = c.createWaveShaper();
    if (!absCurve) { absCurve = new Float32Array(1025); for (var i = 0; i < 1025; i++) absCurve[i] = Math.abs(i / 512 - 1); }
    X.dsAbs.curve = absCurve;
    X.dsLp = c.createBiquadFilter(); X.dsLp.type = "lowpass"; X.dsLp.frequency.value = 40;
    X.dsAmt = c.createGain(); X.dsAmt.gain.value = 0;
    X.dsLim = c.createWaveShaper(); var lc = new Float32Array(257); for (var q = 0; q < 257; q++) { var v = q / 128 - 1; lc[q] = v > 0 ? 0 : Math.max(v, -1); } X.dsLim.curve = lc; // clamp: 0 … −1
    X.dsScale = c.createGain(); X.dsScale.gain.value = 14; // max 14 dB of reduction
    // saturation: parallel dry / driven
    X.satIn = c.createGain(); X.satDry = c.createGain(); X.satPre = c.createGain(); X.sh = c.createWaveShaper(); X.sh.curve = satCurve(c); X.sh.oversample = "2x"; X.satWet = c.createGain();
    // chorus / doubler: two modulated short delays, spread left / right
    X.chIn = c.createGain(); X.chDry = c.createGain(); X.chWet = c.createGain();
    X.d1 = c.createDelay(0.1); X.d2 = c.createDelay(0.1); X.d1.delayTime.value = 0.019; X.d2.delayTime.value = 0.027;
    X.l1 = c.createOscillator(); X.l2 = c.createOscillator(); X.l1.frequency.value = 0.55; X.l2.frequency.value = 0.73;
    X.lg1 = c.createGain(); X.lg2 = c.createGain(); X.lg1.gain.value = 0.0022; X.lg2.gain.value = 0.0027;
    X.p1 = c.createStereoPanner(); X.p2 = c.createStereoPanner(); X.p1.pan.value = -0.7; X.p2.pan.value = 0.7;
    X.out = c.createGain();
    // wiring
    X.input.connect(X.lowcut); X.lowcut.connect(X.low); X.low.connect(X.mid); X.mid.connect(X.high); X.high.connect(X.comp); X.comp.connect(X.makeup);
    X.makeup.connect(X.ds); X.makeup.connect(X.dsBand); X.dsBand.connect(X.dsAbs); X.dsAbs.connect(X.dsLp); X.dsLp.connect(X.dsAmt); X.dsAmt.connect(X.dsLim); X.dsLim.connect(X.dsScale); X.dsScale.connect(X.ds.gain);
    X.ds.connect(X.satIn); X.satIn.connect(X.satDry); X.satIn.connect(X.satPre); X.satPre.connect(X.sh); X.sh.connect(X.satWet);
    X.satDry.connect(X.chIn); X.satWet.connect(X.chIn);
    X.chIn.connect(X.chDry); X.chDry.connect(X.out);
    X.chIn.connect(X.d1); X.chIn.connect(X.d2); X.d1.connect(X.p1); X.d2.connect(X.p2); X.p1.connect(X.chWet); X.p2.connect(X.chWet); X.chWet.connect(X.out);
    X.l1.connect(X.lg1); X.lg1.connect(X.d1.delayTime); X.l2.connect(X.lg2); X.lg2.connect(X.d2.delayTime); X.l1.start(); X.l2.start();
    X.revSend = c.createGain(); X.dlySend = c.createGain(); X.revSend.gain.value = 0; X.dlySend.gain.value = 0;
    X.out.connect(X.revSend); X.out.connect(X.dlySend);
    X.revKey = null; X.dlyKey = null;
    return X;
  }
  /* apply settings; buses = Buses() pool (optional). Returns the bus keys this chain uses (for gc). */
  function apply(c, X, fx, bpm, buses, live) {
    fx = norm(fx);
    var t = c.currentTime;
    function set(p, v) { if (!live) p.value = v; else p.setTargetAtTime(v, t, 0.015); }
    set(X.lowcut.frequency, fx.lowcut.on ? clamp(+fx.lowcut.f || 90, 20, 400) : 10);
    var e = fx.eq; set(X.low.gain, e.on ? +e.low || 0 : 0); set(X.mid.gain, e.on ? +e.mid || 0 : 0); X.mid.frequency.value = clamp(+e.midF || 2500, 100, 10000); set(X.high.gain, e.on ? +e.high || 0 : 0);
    if (fx.comp.on) { var cp = compParams(fx.comp); X.comp.threshold.value = cp.thr; X.comp.ratio.value = cp.ratio; X.comp.attack.value = cp.atk; X.comp.release.value = cp.rel; set(X.makeup.gain, db(cp.makeup)); }
    else { X.comp.threshold.value = 0; X.comp.ratio.value = 1; set(X.makeup.gain, 1); }
    set(X.dsAmt.gain, fx.deess.on ? -(2 + clamp(+fx.deess.amt || 0, 0, 1) * 18) : 0); // envelope gain: higher = pulls the shelf down harder
    var sa = clamp(+fx.sat.amt || 0, 0, 1);
    set(X.satPre.gain, fx.sat.on ? 0.3 + sa * 1.6 : 0); set(X.satWet.gain, fx.sat.on ? 0.25 + sa * 0.45 : 0); set(X.satDry.gain, fx.sat.on ? 1 - sa * 0.55 : 1);
    var cm = clamp(+fx.chorus.mix || 0, 0, 1);
    set(X.chWet.gain, fx.chorus.on ? cm * 0.9 : 0); set(X.chDry.gain, fx.chorus.on ? 1 - cm * 0.3 : 1);
    var keys = [];
    if (buses) {
      if (fx.reverb.on && fx.reverb.mix > 0) { var rb = buses.get("rev", fx.reverb); if (X.revKey !== rb.key) { try { X.revSend.disconnect(); } catch (x) { /* none */ } X.revSend.connect(rb.input); X.revKey = rb.key; } keys.push(rb.key); }
      else if (X.revKey) { try { X.revSend.disconnect(); } catch (x) { /* none */ } X.revKey = null; }
      if (fx.delay.on && fx.delay.mix > 0) { var dbs = buses.get("dly", fx.delay, bpm); if (X.dlyKey !== dbs.key) { try { X.dlySend.disconnect(); } catch (x) { /* none */ } X.dlySend.connect(dbs.input); X.dlyKey = dbs.key; } keys.push(dbs.key); }
      else if (X.dlyKey) { try { X.dlySend.disconnect(); } catch (x) { /* none */ } X.dlyKey = null; }
    }
    set(X.revSend.gain, fx.reverb.on ? clamp(+fx.reverb.mix || 0, 0, 1) : 0);
    set(X.dlySend.gain, fx.delay.on ? clamp(+fx.delay.mix || 0, 0, 1) : 0);
    return keys;
  }
  /* "Wide": subtle, mono-safe stereo double. A 12 ms copy is added to the left and subtracted from the right, so it
     widens in stereo and cancels back to the original voice when summed to mono. */
  function wideNode(c, on, amt) {
    var W = { input: c.createGain(), out: c.createGain() };
    W.input.connect(W.out);
    if (on) {
      var d = c.createDelay(0.05), gl = c.createGain(), gr = c.createGain(), pl = c.createStereoPanner(), pr = c.createStereoPanner(), a = amt == null ? 0.32 : amt;
      d.delayTime.value = 0.012; gl.gain.value = a; gr.gain.value = -a; pl.pan.value = -1; pr.pan.value = 1;
      W.input.connect(d); d.connect(gl); d.connect(gr); gl.connect(pl); gr.connect(pr); pl.connect(W.out); pr.connect(W.out);
    }
    return W;
  }

  /* ---------- the channel-fix: one mono take from whatever the mic delivered ----------
     Some tablets / phones open the built-in mic as 2 channels with the voice in only one of them. Pick the live
     channel when the other is (near) silent; if both carry signal, sum them to mono. No other processing. */
  function rms(a) { var s = 0, n = a.length, st = n > 400000 ? 3 : 1, k = 0; for (var i = 0; i < n; i += st) { s += a[i] * a[i]; k++; } return Math.sqrt(s / Math.max(1, k)); }
  function smartMono(chs) {
    chs = (chs || []).filter(Boolean);
    if (!chs.length) return new Float32Array(0);
    if (chs.length === 1) return chs[0];
    var r = chs.map(rms), best = r[0] >= r[1] ? 0 : 1, other = 1 - best;
    if (r[other] < 1e-5 || r[other] < r[best] * 0.06) return chs[best]; // dead / near-silent channel (≤ −24 dB): use the live one
    var n = Math.min(chs[0].length, chs[1].length), o = new Float32Array(n), a = chs[0], b = chs[1];
    for (var i = 0; i < n; i++) o[i] = 0.5 * (a[i] + b[i]);
    return o;
  }
  /* an imported / older stereo buffer with one dead channel → [live channel] (null if it's real stereo) */
  function deadChannelFix(chs) {
    if (!chs || chs.length !== 2) return null;
    var r0 = rms(chs[0]), r1 = rms(chs[1]), hi = Math.max(r0, r1), lo = Math.min(r0, r1);
    if (hi < 1e-5) return null;
    if (lo < 1e-5 || lo < hi * 0.02) return [r0 >= r1 ? chs[0] : chs[1]]; // ≤ −34 dB on one side: a one-sided mic, not a stereo mix
    return null;
  }

  /* ---------- offline render of one mono part through pan + wide + effects (Beats vocal take) ---------- */
  function renderMono(mono, sr, opts) {
    opts = opts || {};
    var fx = norm(opts.fx), pan = clamp(+opts.pan || 0, -1, 1), wide = !!opts.wide, n = mono.length;
    if (!anyOn(fx) && !pan && !wide) return Promise.resolve([mono, mono]);
    var c = new OfflineAudioContext(2, n, sr);
    var b = c.createBuffer(1, n, sr); b.getChannelData(0).set(mono);
    var s = c.createBufferSource(); s.buffer = b;
    var X = build(c), P = c.createStereoPanner(), W = wideNode(c, wide), sum = c.createGain(), buses = Buses(c, sum);
    P.pan.value = pan;
    s.connect(X.input); X.out.connect(W.input); W.out.connect(P); P.connect(sum); sum.connect(c.destination);
    apply(c, X, fx, opts.bpm || 96, buses, false);
    s.start(0);
    return c.startRendering().then(function (buf) { return [buf.getChannelData(0).subarray(0, n), buf.getChannelData(1).subarray(0, n)]; });
  }

  /* ---------- loudness (ITU-R BS.1770 K-weighting + gating, any sample rate) ---------- */
  function kFilter(x, sr) {
    var y = new Float32Array(x.length);
    // stage 1: high shelf (head), stage 2: RLB high-pass — coefficients derived for this sample rate
    var K = Math.tan(Math.PI * 1681.974450955533 / sr), Q = 0.7071752369554196, Vh = Math.pow(10, 3.999843853973347 / 20), Vb = Math.pow(Vh, 0.4996667741545416);
    var a0 = 1 + K / Q + K * K, b0 = (Vh + Vb * K / Q + K * K) / a0, b1 = 2 * (K * K - Vh) / a0, b2 = (Vh - Vb * K / Q + K * K) / a0, a1 = 2 * (K * K - 1) / a0, a2 = (1 - K / Q + K * K) / a0;
    var K2 = Math.tan(Math.PI * 38.13547087602444 / sr), Q2 = 0.5003270373238773, d = 1 + K2 / Q2 + K2 * K2, c1 = 2 * (K2 * K2 - 1) / d, c2 = (1 - K2 / Q2 + K2 * K2) / d;
    var x1 = 0, x2 = 0, y1 = 0, y2 = 0, u1 = 0, u2 = 0, w1 = 0, w2 = 0;
    for (var i = 0; i < x.length; i++) {
      var xi = x[i], s1 = b0 * xi + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = xi; y2 = y1; y1 = s1;
      var s2 = s1 - 2 * u1 + u2 - c1 * w1 - c2 * w2; u2 = u1; u1 = s1; w2 = w1; w1 = s2;
      y[i] = s2;
    }
    return y;
  }
  /* block loudness of K-weighted channels: 400 ms blocks (75 % overlap) → array of LUFS */
  function blocks(kchs, sr, win, hop) {
    win = Math.round((win || 0.4) * sr); hop = Math.round((hop || 0.1) * sr);
    var n = kchs[0].length, out = [];
    if (n < win) win = n;
    for (var s = 0; s + win <= n; s += hop) {
      var z = 0;
      for (var c = 0; c < kchs.length; c++) { var d = kchs[c], a = 0; for (var i = s; i < s + win; i++) a += d[i] * d[i]; z += a / win; }
      out.push(z);
    }
    return out;
  }
  function gated(zs) {
    var L = function (z) { return -0.691 + 10 * Math.log10(z + 1e-20); };
    var g1 = zs.filter(function (z) { return L(z) > -70; });
    if (!g1.length) return -Infinity;
    var m1 = g1.reduce(function (a, b) { return a + b; }, 0) / g1.length, rel = L(m1) - 10;
    var g2 = g1.filter(function (z) { return L(z) > rel; });
    if (!g2.length) return -Infinity;
    return L(g2.reduce(function (a, b) { return a + b; }, 0) / g2.length);
  }
  /* integrated loudness (LUFS) of 1 or 2 channels; mono counts as one channel like the spec (a centred mono part in
     a stereo mix reads ~3 LU higher — pass [m, m] to measure it "as heard in stereo") */
  function lufs(chs, sr) {
    chs = chs.filter(Boolean); if (!chs.length || !chs[0].length) return -Infinity;
    return gated(blocks(chs.map(function (c) { return kFilter(c, sr); }), sr));
  }

  /* ---------- auto level match: vocal sits at beat loudness + offset (track gain only; the take is never changed) ---------- */
  var AUTO = { max: 18, min: -24, presets: { upfront: 3, balanced: 0, tucked: -3 }, def: 1 };
  function autoGainDb(beatLufs, vocalLufs, offset) {
    if (!isFinite(beatLufs) || !isFinite(vocalLufs)) return 0;
    return clamp(beatLufs + (+offset || 0) - vocalLufs, AUTO.min, AUTO.max);
  }

  window.IPBFx = { defaults: defaults, norm: norm, anyOn: anyOn, build: build, apply: apply, Buses: Buses, wideNode: wideNode, impulse: impulse,
    smartMono: smartMono, deadChannelFix: deadChannelFix, renderMono: renderMono, REVERBS: REVERBS, DIV: DIV, compParams: compParams, rms: rms,
    lufs: lufs, kFilter: kFilter, blocks: blocks, gated: gated, AUTO: AUTO, autoGainDb: autoGainDb };
})();
