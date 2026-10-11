/* Island Pin Beats · Mix & Master — shared DSP core.
 * Loaded three ways (same code everywhere, so live playback, offline export and analysis agree):
 *   1. AudioWorkletGlobalScope (audioWorklet.addModule) — the realtime master chain
 *   2. Web Worker (importScripts)                       — track analysis
 *   3. <script> on the page                             — loudness fitting / meters
 * Written from scratch for this app (RBJ biquads, Linkwitz-Riley crossovers, feed-forward compressors,
 * min-hold + box-filter lookahead limiter with 4x true-peak detection). Exposes globalThis.IPBMDSP.
 */
(function (G) {
  "use strict";
  var TAU = 2 * Math.PI;
  function dbToLin(d) { return Math.pow(10, d / 20); }
  function linToDb(x) { return x > 1e-12 ? 20 * Math.log10(x) : -240; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  /* ---------- biquads (Audio EQ Cookbook; "peaking" uses the exact Web Audio BiquadFilterNode formula) ---------- */
  function coeffs(type, f, Q, gainDb, sr) {
    var w0 = TAU * clamp(f, 1, sr * 0.499) / sr, cw = Math.cos(w0), sw = Math.sin(w0), A = Math.pow(10, (gainDb || 0) / 40);
    var al = sw / (2 * Q), b0, b1, b2, a0, a1, a2;
    if (type === "lowpass") { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; }
    else if (type === "highpass") { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; }
    else if (type === "allpass") { b0 = 1 - al; b1 = -2 * cw; b2 = 1 + al; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; }
    else { b0 = 1 + al * A; b1 = -2 * cw; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cw; a2 = 1 - al / A; } // peaking
    return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
  }
  /* |H| in dB of a biquad at frequency f */
  function magDb(c, f, sr) {
    var w = TAU * f / sr, c1 = Math.cos(w), s1 = Math.sin(w), c2 = Math.cos(2 * w), s2 = Math.sin(2 * w);
    var nr = c[0] + c[1] * c1 + c[2] * c2, ni = -(c[1] * s1 + c[2] * s2);
    var dr = 1 + c[3] * c1 + c[4] * c2, di = -(c[3] * s1 + c[4] * s2);
    return 10 * Math.log10((nr * nr + ni * ni) / (dr * dr + di * di) + 1e-30);
  }
  function Biquad(c) { this.c = c; this.z1 = 0; this.z2 = 0; }
  Biquad.prototype.run = function (x) { // transposed direct form II
    var c = this.c, y = c[0] * x + this.z1;
    this.z1 = c[1] * x - c[3] * y + this.z2;
    this.z2 = c[2] * x - c[4] * y;
    return y;
  };

  /* ---------- 4-band Linkwitz-Riley (LR4) crossover, allpass-compensated so the bands sum flat ---------- */
  var XO = [120, 800, 5000];
  function Crossover(sr, f) {
    f = f || XO; var Q = Math.SQRT1_2, self = this;
    function lp(fr) { return [new Biquad(coeffs("lowpass", fr, Q, 0, sr)), new Biquad(coeffs("lowpass", fr, Q, 0, sr))]; }
    function hp(fr) { return [new Biquad(coeffs("highpass", fr, Q, 0, sr)), new Biquad(coeffs("highpass", fr, Q, 0, sr))]; }
    self.l2 = lp(f[1]); self.h2 = hp(f[1]); self.l1 = lp(f[0]); self.h1 = hp(f[0]); self.l3 = lp(f[2]); self.h3 = hp(f[2]);
    self.ap3 = new Biquad(coeffs("allpass", f[2], Q, 0, sr)); self.ap1 = new Biquad(coeffs("allpass", f[0], Q, 0, sr));
    self.out = new Float64Array(4);
  }
  Crossover.prototype.run = function (x) {
    var lo = this.l2[1].run(this.l2[0].run(x)), hi = this.h2[1].run(this.h2[0].run(x)), o = this.out;
    lo = this.ap3.run(lo); hi = this.ap1.run(hi);
    o[0] = this.l1[1].run(this.l1[0].run(lo)); o[1] = this.h1[1].run(this.h1[0].run(lo));
    o[2] = this.l3[1].run(this.l3[0].run(hi)); o[3] = this.h3[1].run(this.h3[0].run(hi));
    return o;
  };

  /* fast tanh (Padé), exact enough for a soft-saturation colour */
  function softclip(x) { if (x > 3) return 1; if (x < -3) return -1; var x2 = x * x; return x * (27 + x2) / (27 + 9 * x2); }

  /* ---------- 4x polyphase interpolator for true-peak detection (windowed sinc, 16 taps per phase) ---------- */
  function tpPhases(taps, over) {
    var ph = [], half = taps / 2;
    for (var k = 1; k < over; k++) {
      var h = new Float64Array(taps), s = 0;
      for (var j = 0; j < taps; j++) {
        var t = (j - half + 1) - k / over;             // tap j ↔ sample offset (j - half + 1), target at +k/over
        var sinc = Math.abs(t) < 1e-9 ? 1 : Math.sin(Math.PI * t) / (Math.PI * t);
        var u = (t + half) / (2 * half);                  // 0..1 Blackman window position
        var w = 0.42 - 0.5 * Math.cos(TAU * u) + 0.08 * Math.cos(2 * TAU * u);
        h[j] = sinc * w; s += h[j];
      }
      for (j = 0; j < taps; j++) h[j] /= s;
      ph.push(h);
    }
    return ph;
  }

  /* ---------- lookahead true-peak limiter (stereo linked) ----------
   * gain = box-average over A samples of a min-hold (A+1) of the required gain, with exponential release in between.
   * Because every held value inside the box already "sees" the peak, the smoothed gain is at or under the required
   * gain at the peak sample: no overshoot, no clipping, smooth (A-sample linear-ish) attack. Latency = A + D samples. */
  var TP_TAPS = 16, TP_OVER = 4;
  function Limiter(sr, opts) {
    opts = opts || {};
    this.sr = sr;
    this.A = Math.max(8, Math.round((opts.lookMs || 5) * sr / 1000));
    this.D = TP_TAPS / 2;
    this.ph = tpPhases(TP_TAPS, TP_OVER);
    this.hl = new Float64Array(TP_TAPS); this.hr = new Float64Array(TP_TAPS); this.hp = 0; // input history rings
    var N = this.A + this.D + 2;
    this.dl = new Float64Array(N); this.dr = new Float64Array(N); this.dp = 0; this.dn = N;
    this.dqv = new Float64Array(this.A + 4); this.dqi = new Float64Array(this.A + 4); this.dqh = 0; this.dqt = 0; this.dqn = this.A + 4; this.cnt = 0;
    this.box = new Float64Array(this.A); this.bp = 0; this.bsum = this.A; for (var i = 0; i < this.A; i++) this.box[i] = 1;
    this.e = 1; this.setRelease(opts.relMs || 80);
    this.minG = 1;
    this.latency = this.A + this.D;
  }
  Limiter.prototype.setRelease = function (ms) { this.relK = Math.exp(-1 / (Math.max(1, ms) * 0.001 * this.sr)); };
  /* process one stereo frame in place style: returns via this.oL/this.oR; ceil = linear ceiling */
  Limiter.prototype.frame = function (l, r, ceil) {
    var T = TP_TAPS, hl = this.hl, hr = this.hr, p = this.hp;
    hl[p] = l; hr[p] = r; p = (p + 1) % T; this.hp = p;  // p now points at the oldest sample
    // peak around the centre sample (index D-1 from oldest… use samples centre and interpolated points after it)
    var cIdx = (p + this.D - 1) % T, pk = Math.max(Math.abs(hl[cIdx]), Math.abs(hr[cIdx]));
    for (var k = 0; k < this.ph.length; k++) {
      var h = this.ph[k], sl = 0, sr2 = 0, q = p;
      for (var j = 0; j < T; j++) { sl += h[j] * hl[q]; sr2 += h[j] * hr[q]; q++; if (q === T) q = 0; }
      sl = sl < 0 ? -sl : sl; sr2 = sr2 < 0 ? -sr2 : sr2;
      if (sl > pk) pk = sl; if (sr2 > pk) pk = sr2;
    }
    var req = pk > ceil ? ceil / pk : 1;
    // sliding min over the last A+1 values (monotonic deque)
    var n = this.cnt++, qn = this.dqn;
    while (this.dqt !== this.dqh) { var last = (this.dqt - 1 + qn) % qn; if (this.dqv[last] >= req) this.dqt = last; else break; }
    this.dqv[this.dqt] = req; this.dqi[this.dqt] = n; this.dqt = (this.dqt + 1) % qn;
    while (this.dqi[this.dqh] < n - this.A) this.dqh = (this.dqh + 1) % qn;
    var hmin = this.dqv[this.dqh];
    var e = hmin < this.e ? hmin : hmin + (this.e - hmin) * this.relK; this.e = e;
    this.bsum += e - this.box[this.bp]; this.box[this.bp] = e; this.bp = (this.bp + 1) % this.A;
    if ((n & 65535) === 0) { var s = 0; for (var b = 0; b < this.A; b++) s += this.box[b]; this.bsum = s; }
    var g = this.bsum / this.A; if (g > 1) g = 1;
    if (g < this.minG) this.minG = g;
    // delay the centre sample by A more (the centre sample is already D-1 behind the newest)
    var dp = this.dp, dn = this.dn;
    this.dl[dp] = hl[cIdx]; this.dr[dp] = hr[cIdx];
    var rd = (dp - this.A + dn) % dn; // A samples back
    this.dp = (dp + 1) % dn;
    this.oL = this.dl[rd] * g; this.oR = this.dr[rd] * g;
  };
  /* convenience: limit whole arrays (main thread fit / export check). drive in dB, ceiling in dBTP. Output is latency-compensated. */
  function limitArrays(L, R, driveDb, ceilDb, opts) {
    var sr = (opts && opts.sr) || 44100, lim = new Limiter(sr, opts), n = L.length, lat = lim.latency;
    var oL = new Float32Array(n), oR = new Float32Array(n), g = dbToLin(driveDb), c = dbToLin(ceilDb - LIM_MARGIN_DB);
    for (var i = 0; i < n + lat; i++) {
      var l = i < n ? L[i] * g : 0, r = i < n ? R[i] * g : 0;
      lim.frame(l, r, c);
      var o = i - lat; if (o >= 0) { oL[o] = lim.oL; oR[o] = lim.oR; }
    }
    return { L: oL, R: oR, minGainDb: linToDb(lim.minG) };
  }
  var LIM_MARGIN_DB = 0.15; // internal safety under the ceiling (gain modulation can add a hair of inter-sample overshoot)

  /* ---------- band compressor (down + upward), stereo-linked peak detector, gain computed every 8 samples ---------- */
  var BAND_TIMES = [[20, 220], [12, 160], [6, 110], [3, 80]]; // attack / release ms per band
  function BandComp(sr, i) {
    var t = BAND_TIMES[i];
    this.aA = 1 - Math.exp(-1 / (t[0] * 0.001 * sr)); this.aR = 1 - Math.exp(-1 / (t[1] * 0.001 * sr));
    this.env = 0; this.g = 1; this.gStep = 0; this.grAcc = 0; this.grN = 0; this.upAcc = 0;
  }
  function gainComputer(L, thr, ratio, up, upThr) {
    var W = 6, d = L - thr, gr = 0;
    if (ratio > 1.001) {
      if (2 * d >= W) gr = (1 / ratio - 1) * d;
      else if (2 * d > -W) { var z = d + W / 2; gr = (1 / ratio - 1) * z * z / (2 * W); }
    }
    var boost = 0;
    if (up > 0.01 && L < upThr) {
      boost = Math.min(up, (upThr - L) * 0.5);
      var floor = upThr - 36; if (L < floor) boost *= Math.max(0, 1 - (floor - L) / 12); // never pump up noise / silence
    }
    return { gr: gr, up: boost };
  }

  /* ---------- the full master core (everything after the EQ bank) ----------
   * params (per render quantum): b{k}thr, b{k}ratio, b{k}up, b{k}upthr, b{k}mk, b{k}w (k=0..3), gthr, gratio, sat, drive, ceil, limon */
  function MasterCore(sr) {
    this.sr = sr;
    this.xl = new Crossover(sr); this.xr = new Crossover(sr);
    this.bc = [0, 1, 2, 3].map(function (i) { return new BandComp(sr, i); });
    this.gA = 1 - Math.exp(-1 / (0.030 * sr)); this.gR = 1 - Math.exp(-1 / (0.250 * sr)); this.gms = 0; this.gg = 1; this.gStep = 0; this.gAcc = 0; this.gN = 0;
    this.dcx = 0; this.dcy = 0; this.dcK = 1 - TAU * 5 / sr;
    this.lim = new Limiter(sr, { lookMs: 5, relMs: 80 });
    this.latency = this.lim.latency;
    this.sub = 0;
  }
  /* process n frames. P: object of plain numbers (k-rate). inL/inR may be the same array (mono). */
  MasterCore.prototype.process = function (inL, inR, outL, outR, n, P) {
    var bc = this.bc, xl = this.xl, xr = this.xr, lim = this.lim;
    var w = [P.b0w, P.b1w, P.b2w, P.b3w], mk = [dbToLin(P.b0mk), dbToLin(P.b1mk), dbToLin(P.b2mk), dbToLin(P.b3mk)];
    var thr = [P.b0thr, P.b1thr, P.b2thr, P.b3thr], rat = [P.b0ratio, P.b1ratio, P.b2ratio, P.b3ratio];
    var up = [P.b0up, P.b1up, P.b2up, P.b3up], upt = [P.b0upthr, P.b1upthr, P.b2upthr, P.b3upthr];
    var sat = clamp(P.sat, 0, 1), drv = 1 + 3 * sat, drive = dbToLin(P.drive), ceil = dbToLin(P.ceil - LIM_MARGIN_DB), limOn = P.limon > 0.5;
    var gthr = P.gthr, grat = P.gratio;
    for (var i = 0; i < n; i++) {
      var bl = xl.run(inL[i]), br = xr.run(inR[i]), sl = 0, sr2 = 0, recompute = (this.sub === 0);
      for (var b = 0; b < 4; b++) {
        var c = bc[b], l = bl[b], r = br[b], det = Math.max(l < 0 ? -l : l, r < 0 ? -r : r);
        c.env += (det > c.env ? c.aA : c.aR) * (det - c.env);
        if (recompute) {
          var gc = gainComputer(linToDb(c.env), thr[b], rat[b], up[b], upt[b]);
          var target = dbToLin(gc.gr + gc.up) * mk[b];
          c.gStep = (target - c.g) / 8; c.grAcc += gc.gr; c.upAcc += gc.up; c.grN++;
        }
        c.g += c.gStep;
        l *= c.g; r *= c.g;
        var m = (l + r) * 0.5, s = (l - r) * 0.5 * w[b];
        sl += m + s; sr2 += m - s;
      }
      // glue: RMS-ish detector on the sum
      var x2 = (sl * sl + sr2 * sr2) * 0.5;
      this.gms += (x2 > this.gms ? this.gA : this.gR) * (x2 - this.gms);
      if (recompute) {
        var gl = gainComputer(10 * Math.log10(this.gms + 1e-24), gthr, grat, 0, 0);
        this.gStep = (dbToLin(gl.gr) - this.gg) / 8; this.gAcc += gl.gr; this.gN++;
      }
      this.gg += this.gStep; sl *= this.gg; sr2 *= this.gg;
      // character: parallel soft saturation (odd harmonics) + a touch of even harmonics, DC-blocked
      if (sat > 0.001) {
        var wl = softclip(drv * sl) / drv, wr = softclip(drv * sr2) / drv;
        var ev = 0.25 * sat * (wl * wl + wr * wr) * 0.5;
        var dc = ev - this.dcx + this.dcK * this.dcy; this.dcx = ev; this.dcy = dc;
        sl = sl + sat * (wl - sl) + dc; sr2 = sr2 + sat * (wr - sr2) + dc;
      }
      sl *= drive; sr2 *= drive;
      if (limOn) { lim.frame(sl, sr2, ceil); outL[i] = lim.oL; outR[i] = lim.oR; }
      else { outL[i] = sl; outR[i] = sr2; }
      this.sub = (this.sub + 1) & 7;
    }
  };
  MasterCore.prototype.takeStats = function () {
    var o = { gr: [], up: [], glue: this.gN ? this.gAcc / this.gN : 0, lim: linToDb(this.lim.minG) };
    this.bc.forEach(function (c) { o.gr.push(c.grN ? c.grAcc / c.grN : 0); o.up.push(c.grN ? c.upAcc / c.grN : 0); c.grAcc = c.upAcc = 0; c.grN = 0; });
    this.gAcc = 0; this.gN = 0; this.lim.minG = 1;
    return o;
  };
  var PARAM_DEFS = (function () {
    var d = [];
    for (var b = 0; b < 4; b++) {
      d.push({ name: "b" + b + "thr", defaultValue: 0, minValue: -90, maxValue: 12 });
      d.push({ name: "b" + b + "ratio", defaultValue: 1, minValue: 1, maxValue: 20 });
      d.push({ name: "b" + b + "up", defaultValue: 0, minValue: 0, maxValue: 12 });
      d.push({ name: "b" + b + "upthr", defaultValue: -40, minValue: -90, maxValue: 0 });
      d.push({ name: "b" + b + "mk", defaultValue: 0, minValue: -24, maxValue: 24 });
      d.push({ name: "b" + b + "w", defaultValue: 1, minValue: 0, maxValue: 3 });
    }
    d.push({ name: "gthr", defaultValue: 0, minValue: -90, maxValue: 12 });
    d.push({ name: "gratio", defaultValue: 1, minValue: 1, maxValue: 20 });
    d.push({ name: "sat", defaultValue: 0, minValue: 0, maxValue: 1 });
    d.push({ name: "drive", defaultValue: 0, minValue: -40, maxValue: 40 });
    d.push({ name: "ceil", defaultValue: -1, minValue: -12, maxValue: 0 });
    d.push({ name: "limon", defaultValue: 1, minValue: 0, maxValue: 1 });
    d.forEach(function (p) { p.automationRate = "k-rate"; });
    return d;
  })();

  /* ---------- EQ bank: 1/3-octave peaking filters, least-squares fitted to any target curve ---------- */
  var EQ_F = [], EQ_Q = 2.2;
  for (var k = 0; k < 30; k++) EQ_F.push(25 * Math.pow(2, k / 3));      // 25 Hz … 20.2 kHz
  var GRID = [];
  for (k = 0; k <= 60; k++) GRID.push(20 * Math.pow(2, k / 6));        // 1/6-octave analysis grid 20 Hz … 20.5 kHz
  function EqSolver(sr) {
    var nb = EQ_F.length, ng = GRID.length, unit = 6, B = [], j, i;
    this.sr = sr; this.nb = nb; this.ng = ng;
    this.fs = EQ_F.map(function (f) { return Math.min(f, sr * 0.45); });
    for (i = 0; i < nb; i++) { var c = coeffs("peaking", this.fs[i], EQ_Q, unit, sr), row = []; for (j = 0; j < ng; j++) row.push(GRID[j] < sr * 0.49 ? magDb(c, GRID[j], sr) / unit : 0); B.push(row); }
    // M = (BᵀB + λI)⁻¹ Bᵀ  (B is nb×ng here, i.e. columns are bands)
    var lam = 0.02, A = [], R = [];
    for (i = 0; i < nb; i++) { A.push(new Float64Array(nb)); R.push(new Float64Array(ng)); }
    for (i = 0; i < nb; i++) for (var m = 0; m < nb; m++) { var s = 0; for (j = 0; j < ng; j++) s += B[i][j] * B[m][j]; A[i][m] = s + (i === m ? lam : 0); }
    for (i = 0; i < nb; i++) for (j = 0; j < ng; j++) R[i][j] = B[i][j];
    for (var col = 0; col < nb; col++) { // Gauss-Jordan
      var piv = col; for (i = col + 1; i < nb; i++) if (Math.abs(A[i][col]) > Math.abs(A[piv][col])) piv = i;
      var t = A[col]; A[col] = A[piv]; A[piv] = t; t = R[col]; R[col] = R[piv]; R[piv] = t;
      var d = A[col][col];
      for (m = 0; m < nb; m++) A[col][m] /= d; for (j = 0; j < ng; j++) R[col][j] /= d;
      for (i = 0; i < nb; i++) if (i !== col) { var fct = A[i][col]; if (!fct) continue; for (m = 0; m < nb; m++) A[i][m] -= fct * A[col][m]; for (j = 0; j < ng; j++) R[i][j] -= fct * R[col][j]; }
    }
    this.M = R;
  }
  /* response (dB) of the bank with gains g at the grid (or at freqs) */
  EqSolver.prototype.response = function (g, freqs) {
    freqs = freqs || GRID; var out = new Float64Array(freqs.length), sr = this.sr;
    for (var i = 0; i < this.nb; i++) { if (Math.abs(g[i]) < 1e-4) continue; var c = coeffs("peaking", this.fs[i], EQ_Q, g[i], sr); for (var j = 0; j < freqs.length; j++) out[j] += freqs[j] < sr * 0.49 ? magDb(c, freqs[j], sr) : 0; }
    return out;
  };
  EqSolver.prototype.solve = function (target, iters) {
    var g = new Float64Array(this.nb), nb = this.nb, ng = this.ng, M = this.M, err = new Float64Array(ng), i, j;
    for (j = 0; j < ng; j++) err[j] = target[j];
    for (var it = 0; it < (iters || 3); it++) {
      for (i = 0; i < nb; i++) { var s = 0; for (j = 0; j < ng; j++) s += M[i][j] * err[j]; g[i] = clamp(g[i] + s, -18, 18); }
      var r = this.response(g); for (j = 0; j < ng; j++) err[j] = target[j] - r[j];
    }
    return g;
  };

  /* ---------- radix-2 complex FFT (in place) ---------- */
  function FFT(N) {
    this.N = N; this.rev = new Uint32Array(N); this.cs = new Float64Array(N / 2); this.sn = new Float64Array(N / 2);
    for (var i = 0; i < N; i++) { var r = 0; for (var b = 1, k = i; b < N; b <<= 1, k >>= 1) r = (r << 1) | (k & 1); this.rev[i] = r; }
    for (i = 0; i < N / 2; i++) { this.cs[i] = Math.cos(TAU * i / N); this.sn[i] = -Math.sin(TAU * i / N); }
  }
  FFT.prototype.run = function (re, im) {
    var N = this.N, rev = this.rev, i, t;
    for (i = 0; i < N; i++) { var j = rev[i]; if (j > i) { t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (var size = 2; size <= N; size <<= 1) {
      var half = size >> 1, step = N / size;
      for (var st = 0; st < N; st += size) for (var k = 0; k < half; k++) {
        var tr = this.cs[k * step], ti = this.sn[k * step], a = st + k, b = a + half;
        var xr = re[b] * tr - im[b] * ti, xi = re[b] * ti + im[b] * tr;
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
      }
    }
  };

  /* map an FFT power spectrum (bins 0..N/2) onto the 1/6-octave grid (band power, with bin interpolation at the low end) */
  function gridMapper(N, sr) {
    var binHz = sr / N, lo = [], hi = [];
    GRID.forEach(function (f) { var a = f * Math.pow(2, -1 / 12) / binHz, b = f * Math.pow(2, 1 / 12) / binHz; lo.push(a); hi.push(b); });
    return function (pw, out) {
      for (var g = 0; g < GRID.length; g++) {
        var a = lo[g], b = hi[g], s = 0, ia = Math.ceil(a), ib = Math.floor(b), cnt = 0;
        if (b >= N / 2) { out[g] = g ? out[g - 1] * 0.5 : 0; continue; }
        for (var k = ia; k <= ib; k++) { s += pw[k]; cnt++; }
        if (!cnt) { var c = (a + b) / 2, k0 = Math.floor(c), fr = c - k0; s = pw[k0] * (1 - fr) + pw[k0 + 1] * fr; cnt = 1; }
        out[g] = s / cnt;
      }
    };
  }

  /* K-weighting magnitude² at f (for loudness bookkeeping of EQ changes); kc = {shelf:{b,a}, hp:{b,a}} as in app.js */
  function kWeightPow(kc, f, sr) {
    function m(bq) { var c = [bq.b[0], bq.b[1], bq.b[2], bq.a[1], bq.a[2]]; return magDb(c, f, sr); }
    return Math.pow(10, (m(kc.shelf) + m(kc.hp)) / 10);
  }

  G.IPBMDSP = {
    dbToLin: dbToLin, linToDb: linToDb, clamp: clamp, coeffs: coeffs, magDb: magDb, Biquad: Biquad, Crossover: Crossover, XO: XO,
    softclip: softclip, tpPhases: tpPhases, Limiter: Limiter, limitArrays: limitArrays, LIM_MARGIN_DB: LIM_MARGIN_DB,
    gainComputer: gainComputer, MasterCore: MasterCore, PARAM_DEFS: PARAM_DEFS,
    EQ_F: EQ_F, EQ_Q: EQ_Q, GRID: GRID, EqSolver: EqSolver, FFT: FFT, gridMapper: gridMapper, kWeightPow: kWeightPow
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
