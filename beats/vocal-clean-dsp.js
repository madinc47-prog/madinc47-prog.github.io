/* Island Pin Beats — speaker-mode vocal cleanup DSP (runs in a Web Worker; plain JS, no dependencies).
 *
 * The recorder captures the exact digital beat that was sent to the speaker (master L/R) sample-locked with the raw
 * mic. That makes the beat a *known* signal, so it can be removed the way a phone call removes echo:
 *   1. estimateDelay  — GCC-PHAT cross-correlation on a decimated copy, many windows → bulk latency + clock drift
 *   2. alignRefs      — shift (and, if there is drift, resample) the beat so it lines up with its bleed in the mic
 *   3. aec            — partitioned-block frequency-domain NLMS (overlap-save, MDF-style, 1–2 reference channels,
 *                       ~210 ms of speaker + room response) with a double-talk-robust per-bin step size
 *                       (Valin 2007 leakage estimate). Two passes: the first one only converges, so the start of the
 *                       take is clean too.
 *   4. residualSuppress — STFT spectral suppression of what the linear filter can't remove (late reverb, speaker
 *                       distortion), driven by the filter's own echo estimate and a per-band leakage measured
 *                       over the whole take.
 * Noise removal (RNNoise) and the gate run in the worker after this.
 */
(function (root) {
  "use strict";

  /* ---------------- complex radix-2 FFT, in place, separate re / im ---------------- */
  function FFT(n) {
    this.n = n;
    var lg = Math.round(Math.log(n) / Math.LN2), i;
    this.rev = new Uint32Array(n);
    for (i = 0; i < n; i++) { var r = 0, x = i; for (var b = 0; b < lg; b++) { r = (r << 1) | (x & 1); x >>= 1; } this.rev[i] = r; }
    this.c = new Float64Array(n >> 1); this.s = new Float64Array(n >> 1);
    for (i = 0; i < n >> 1; i++) { this.c[i] = Math.cos(2 * Math.PI * i / n); this.s[i] = -Math.sin(2 * Math.PI * i / n); }
  }
  FFT.prototype.run = function (re, im, inv) {
    var n = this.n, rev = this.rev, C = this.c, Sn = this.s, i, j, k, t;
    for (i = 0; i < n; i++) { j = rev[i]; if (j > i) { t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    var sg = inv ? -1 : 1;
    for (var size = 2; size <= n; size <<= 1) {
      var half = size >> 1, step = n / size;
      for (i = 0; i < n; i += size) {
        for (j = 0, k = 0; j < half; j++, k += step) {
          var wr = C[k], wi = sg * Sn[k], a = i + j, b2 = a + half;
          var xr = re[b2] * wr - im[b2] * wi, xi = re[b2] * wi + im[b2] * wr;
          re[b2] = re[a] - xr; im[b2] = im[a] - xi; re[a] += xr; im[a] += xi;
        }
      }
    }
    if (inv) { var s = 1 / n; for (i = 0; i < n; i++) { re[i] *= s; im[i] *= s; } }
  };
  /* real FFT of length n via a complex FFT of n/2: forward(x → re/im bins 0..n/2), inverse(bins → x) */
  function RFFT(n) {
    this.n = n; this.h = n >> 1; this.f = new FFT(this.h);
    this.zr = new Float64Array(this.h); this.zi = new Float64Array(this.h);
    this.c = new Float64Array(this.h + 1); this.s = new Float64Array(this.h + 1);
    for (var k = 0; k <= this.h; k++) { this.c[k] = Math.cos(2 * Math.PI * k / n); this.s[k] = Math.sin(2 * Math.PI * k / n); }
  }
  RFFT.prototype.forward = function (x, Xr, Xi) {
    var h = this.h, zr = this.zr, zi = this.zi, k;
    for (k = 0; k < h; k++) { zr[k] = x[2 * k]; zi[k] = x[2 * k + 1]; }
    this.f.run(zr, zi, false);
    Xr[0] = zr[0] + zi[0]; Xi[0] = 0; Xr[h] = zr[0] - zi[0]; Xi[h] = 0;
    for (k = 1; k < h; k++) {
      var ar = zr[k], ai = zi[k], br = zr[h - k], bi = -zi[h - k];           // Z[k], conj(Z[h-k])
      var er = 0.5 * (ar + br), ei = 0.5 * (ai + bi), or = 0.5 * (ai - bi), oi = -0.5 * (ar - br); // even, odd parts
      var c = this.c[k], sn = -this.s[k];                                    // e^{-2πik/n}
      Xr[k] = er + (or * c - oi * sn); Xi[k] = ei + (or * sn + oi * c);
    }
  };
  RFFT.prototype.inverse = function (Xr, Xi, x) {
    var h = this.h, zr = this.zr, zi = this.zi, k;
    for (k = 0; k < h; k++) {
      var ar = Xr[k], ai = Xi[k], br = Xr[h - k], bi = -Xi[h - k];           // X[k], conj(X[h-k])
      var er = 0.5 * (ar + br), ei = 0.5 * (ai + bi), dr = 0.5 * (ar - br), di = 0.5 * (ai - bi);
      var c = this.c[k], sn = this.s[k];                                     // e^{+2πik/n}
      var or = dr * c - di * sn, oi = dr * sn + di * c;
      zr[k] = er - oi; zi[k] = ei + or;                                      // z = even + i·odd
    }
    this.f.run(zr, zi, true);
    for (k = 0; k < h; k++) { x[2 * k] = zr[k]; x[2 * k + 1] = zi[k]; }
  };
  var fftCache = {}, rfftCache = {};
  function getRFFT(n) { return rfftCache[n] || (rfftCache[n] = new RFFT(n)); }
  function getFFT(n) { return fftCache[n] || (fftCache[n] = new FFT(n)); }

  function rms(a, s, e) { s = s || 0; e = e || a.length; var q = 0; for (var i = s; i < e; i++) q += a[i] * a[i]; return Math.sqrt(q / Math.max(1, e - s)); }
  function db(x) { return 20 * Math.log(Math.max(1e-12, x)) / Math.LN10; }

  /* ---------------- 1. latency + drift (GCC-PHAT) ---------------- */
  function decimate4(x) { // 4-pole-ish low-pass (two cascaded one-pole pairs) then keep every 4th sample
    var n = x.length >> 2, out = new Float32Array(n), a = 0, b = 0, c = 0, d = 0, k = 0.45;
    for (var i = 0, j = 0; i < x.length; i++) {
      a += k * (x[i] - a); b += k * (a - b); c += k * (b - c); d += k * (c - d);
      if ((i & 3) === 3 && j < n) out[j++] = d;
    }
    return out;
  }
  // returns { ok, delay (samples @ sr at t=0), drift (samples per sample), conf, points, bleedDb }
  function estimateDelay(mic, ref, sr, o) {
    o = o || {};
    var minLag = Math.round((o.minLagSec != null ? o.minLagSec : -0.03) * sr / 4), maxLag = Math.round((o.maxLagSec || 0.9) * sr / 4);
    var m4 = decimate4(mic), r4 = decimate4(ref), sr4 = sr / 4;
    var W = 16384; while (W < (maxLag - minLag) * 3) W <<= 1;       // window at sr/4 (≈1.4 s at 48 kHz)
    var F = W * 2, fft = getFFT(F), n = m4.length;
    var hop = Math.max(Math.round(sr4 * 2.5), Math.floor((n - W) / 40));
    var pts = [], rr = new Float64Array(F), ri = new Float64Array(F), mr = new Float64Array(F), mi = new Float64Array(F);
    var rAll = rms(r4); if (rAll < 1e-5) return { ok: false, reason: "silent beat", points: [] };
    for (var s = 0; s + W <= n; s += hop) {
      var rw = rms(r4, s, s + W); if (rw < rAll * 0.25) continue;      // skip quiet parts of the beat
      rr.fill(0); ri.fill(0); mr.fill(0); mi.fill(0);
      for (var i = 0; i < W; i++) { var h = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / W); rr[i] = r4[s + i] * h; mr[i] = m4[s + i] * h; }
      fft.run(rr, ri, false); fft.run(mr, mi, false);
      for (i = 0; i < F; i++) { // PHAT-weighted cross spectrum  M · conj(R) / |M · conj(R)|^0.85
        var cr = mr[i] * rr[i] + mi[i] * ri[i], ci = mi[i] * rr[i] - mr[i] * ri[i], mag = Math.pow(cr * cr + ci * ci, 0.425) + 1e-20;
        rr[i] = cr / mag; ri[i] = ci / mag;
      }
      fft.run(rr, ri, true);
      var best = -1e9, bl = 0, sum = 0, cnt = 0;
      for (var l = minLag; l <= maxLag; l++) { var v = rr[(l + F) % F]; if (v > best) { best = v; bl = l; } sum += Math.abs(v); cnt++; }
      var second = -1e9;
      for (l = minLag; l <= maxLag; l++) if (Math.abs(l - bl) > sr4 * 0.004) { v = rr[(l + F) % F]; if (v > second) second = v; }
      var y0 = rr[(bl - 1 + F) % F], y2 = rr[(bl + 1) % F], den = y0 - 2 * best + y2, frac = den < 0 ? 0.5 * (y0 - y2) / den : 0;
      var conf = best / (sum / cnt + 1e-12), sharp = best / Math.max(1e-12, second);
      pts.push({ t: (s + W / 2) * 4, d: (bl + frac) * 4, conf: conf, sharp: sharp });
    }
    var good = pts.filter(function (p) { return p.conf > 7 && p.sharp > 1.25; });
    if (good.length < 2) return { ok: false, reason: "no clear beat bleed", points: pts };
    // robust line fit d(t) = a + b t
    var ds = good.map(function (p) { return p.d; }).sort(function (x, y) { return x - y; }), med = ds[ds.length >> 1];
    var use = good.filter(function (p) { return Math.abs(p.d - med) < sr * 0.012; }), a = med, bsl = 0;
    for (var it = 0; it < 3 && use.length >= 2; it++) {
      var st = 0, sd = 0, stt = 0, std = 0, sw = 0;
      use.forEach(function (p) { var w = Math.min(4, p.sharp); sw += w; st += w * p.t; sd += w * p.d; stt += w * p.t * p.t; std += w * p.t * p.d; });
      var den2 = sw * stt - st * st;
      bsl = den2 > 1e-9 && (use[use.length - 1].t - use[0].t) > sr * 20 ? (sw * std - st * sd) / den2 : 0;
      bsl = Math.max(-3e-4, Math.min(3e-4, bsl));
      a = (sd - bsl * st) / sw;
      var aa = a, bb = bsl;
      use = good.filter(function (p) { return Math.abs(p.d - (aa + bb * p.t)) < sr * 0.002; });
    }
    if (Math.abs(bsl) < 2e-6) { bsl = 0; var s2 = use.map(function (p) { return p.d; }).sort(function (x, y) { return x - y; }); a = s2.length ? s2[s2.length >> 1] : med; }
    return { ok: use.length >= 2, delay: a, drift: bsl, conf: use.length / Math.max(1, pts.length), points: pts, used: use.length };
  }

  /* ---------------- 2. align the beat to the mic ---------------- */
  function alignRefs(refs, n, delay, drift, pre) {
    return refs.map(function (r) {
      var out = new Float32Array(n), i;
      if (!drift) {
        var sh = Math.round(delay - pre);
        for (i = 0; i < n; i++) { var j = i - sh; out[i] = j >= 0 && j < r.length ? r[j] : 0; }
        return out;
      }
      for (i = 0; i < n; i++) { // cubic Hermite (Catmull-Rom) fractional read
        var p = i - (delay + drift * i - pre), k = Math.floor(p), f = p - k;
        if (k < 1 || k + 2 >= r.length) { out[i] = k >= 0 && k < r.length ? r[k] : 0; continue; }
        var y0 = r[k - 1], y1 = r[k], y2 = r[k + 1], y3 = r[k + 2];
        out[i] = y1 + 0.5 * f * (y2 - y0 + f * (2 * y0 - 5 * y1 + 4 * y2 - y3 + f * (3 * (y1 - y2) + y3 - y0)));
      }
      return out;
    });
  }

  /* ---------------- 3. partitioned-block frequency-domain adaptive echo canceller ---------------- */
  function AEC(K, sr, o) {
    o = o || {};
    var N = this.N = 512, L = 2 * N, H = N + 1, M = this.M = o.partitions || Math.max(8, Math.round((o.tailSec || 0.21) * sr / N));
    this.K = K; this.L = L; this.H = H; this.rf = getRFFT(L); this.tb = new Float64Array(L);
    this.Wr = []; this.Wi = []; this.Xr = []; this.Xi = [];
    for (var c = 0; c < K; c++) {
      for (var m = 0; m < M; m++) { this.Wr.push(new Float64Array(H)); this.Wi.push(new Float64Array(H)); this.Xr.push(new Float64Array(H)); this.Xi.push(new Float64Array(H)); }
    }
    this.xprev = []; for (c = 0; c < K; c++) this.xprev.push(new Float64Array(N));
    this.re = new Float64Array(L); this.im = new Float64Array(L);
    this.Yr = new Float64Array(H); this.Yi = new Float64Array(H); this.Er = new Float64Array(H); this.Ei = new Float64Array(H);
    this.power = new Float64Array(H); this.p1 = new Float64Array(H); this.Eh = new Float64Array(H); this.Yh = new Float64Array(H);
    this.Rf = new Float64Array(H); this.Yf = new Float64Array(H); this.Xf = new Float64Array(H);
    this.pos = 0; this.block = 0; this.adapted = false; this.sumAdapt = 0;
    this.PeyS = 1; this.PyyS = 1; this.leak = 0.5; this.cst = 0;
    this.specAvg = N / sr; this.beta0 = 2 * N / sr; this.betaMax = 0.5 * N / sr;
    this.mu = o.mu || 1;
    // proportionate step per partition (sums to 0.99): partitions holding more of the echo path adapt faster
    this.prop = new Float64Array(M); var dec = Math.exp(-2.4 / M), ps = 0;
    for (m = 0; m < M; m++) { this.prop[m] = Math.pow(dec, m); ps += this.prop[m]; }
    for (m = 0; m < M; m++) this.prop[m] *= 0.8 / ps;
    // pre-emphasis state (improves conditioning for bass-heavy beats), DC notch on the mic
    this.pe = 0.9; this.memX = new Float64Array(K); this.memD = 0; this.memE = 0; this.memY = 0;
  }
  // process one block of N samples. d: mic (int16 scale), x: array of K ref blocks; outE, outY: N samples
  AEC.prototype.blockRun = function (d, x, outE, outY, adapt) {
    var N = this.N, L = this.L, H = this.H, M = this.M, K = this.K, re = this.re, im = this.im, rf = this.rf, tb = this.tb;
    var slot = this.block % M, c, m, k, i;
    var Sxx = 0;
    // new reference spectra
    for (c = 0; c < K; c++) {
      var xp = this.xprev[c], xb = x[c], mem = this.memX[c];
      for (i = 0; i < N; i++) { tb[i] = xp[i]; var v = xb[i] - this.pe * mem; mem = xb[i]; tb[N + i] = v; xp[i] = v; Sxx += v * v; }
      this.memX[c] = mem;
      rf.forward(tb, this.Xr[c * M + slot], this.Xi[c * M + slot]);
    }
    // echo estimate Y = Σ W·X
    var Yr = this.Yr, Yi = this.Yi; Yr.fill(0); Yi.fill(0);
    for (c = 0; c < K; c++) for (m = 0; m < M; m++) {
      var s = (slot - m + M) % M, wr = this.Wr[c * M + m], wi = this.Wi[c * M + m], xr = this.Xr[c * M + s], xi = this.Xi[c * M + s];
      for (k = 0; k < H; k++) { Yr[k] += wr[k] * xr[k] - wi[k] * xi[k]; Yi[k] += wr[k] * xi[k] + wi[k] * xr[k]; }
    }
    rf.inverse(Yr, Yi, tb);
    // error (mic pre-emphasised + DC notch)
    var See = 0, Syy = 0, Sey = 0, eb = this.eb || (this.eb = new Float64Array(N));
    for (i = 0; i < N; i++) {
      var din = d[i];
      var dv = din - this.pe * this.memD; this.memD = din;
      var yv = tb[N + i], ev = dv - yv;
      eb[i] = ev; See += ev * ev; Syy += yv * yv; Sey += ev * yv;
      // de-emphasis for outputs
      this.memE = ev + this.pe * this.memE; outE[i] = this.memE;
      this.memY = yv + this.pe * this.memY; outY[i] = this.memY;
    }
    this.block++;
    if (!adapt) return;
    // error spectrum (zero-padded first half)
    for (i = 0; i < N; i++) { tb[i] = 0; tb[N + i] = eb[i]; }
    var Er = this.Er, Ei = this.Ei;
    rf.forward(tb, Er, Ei);
    var Rf = this.Rf, Yf = this.Yf, Xf = this.Xf, pw = this.power, ss = 0.35 / M, ss1 = 1 - ss;
    var XR0 = this.Xr[slot], XI0 = this.Xi[slot];
    for (k = 0; k < H; k++) {
      Rf[k] = Er[k] * Er[k] + Ei[k] * Ei[k];
      Yf[k] = Yr[k] * Yr[k] + Yi[k] * Yi[k];
      var xf = 0; for (c = 0; c < K; c++) { var a1 = this.Xr[c * M + slot][k], b1 = this.Xi[c * M + slot][k]; xf += a1 * a1 + b1 * b1; }
      Xf[k] = xf;
      pw[k] = ss1 * pw[k] + 1 + ss * xf;
    }
    // leakage estimate (how much of the echo estimate is still left in the error) — Valin 2007
    var Pey = 0, Pyy = 0, sa = this.specAvg, Eh = this.Eh, Yh = this.Yh;
    for (k = 0; k < H; k++) {
      var eh = Rf[k] - Eh[k], yh = Yf[k] - Yh[k];
      Pey += eh * yh; Pyy += yh * yh;
      Eh[k] = (1 - sa) * Eh[k] + sa * Rf[k]; Yh[k] = (1 - sa) * Yh[k] + sa * Yf[k];
    }
    Pyy = Math.sqrt(Pyy); Pey = Pey / (Pyy + 1e-9);
    var tmp = this.beta0 * Syy; if (tmp > this.betaMax * See) tmp = this.betaMax * See;
    var alpha = tmp / (See + 1e-9), a1m = 1 - alpha;
    this.PeyS = a1m * this.PeyS + alpha * Pey; this.PyyS = a1m * this.PyyS + alpha * Pyy;
    if (this.PyyS < 1) this.PyyS = 1;
    if (this.PeyS < 0.005 * this.PyyS) this.PeyS = 0.005 * this.PyyS;
    if (this.PeyS > this.PyyS) this.PeyS = this.PyyS;
    var leak = this.leak = this.PeyS / this.PyyS;
    var RER = (0.0001 * Sxx + 3 * leak * Syy) / (See + 1e-9);
    var lo = Sey * Sey / (1 + See * Syy); if (RER < lo) RER = lo; if (RER > 0.5) RER = 0.5;
    if (!this.adapted && this.sumAdapt > M && leak * Syy > 0.03 * Syy) this.adapted = true;
    var p1 = this.p1, mu = this.mu;
    if (this.adapted) {
      for (k = 0; k < H; k++) {
        var r = leak * Yf[k], e = Rf[k] + 1;
        if (r > 0.5 * e) r = 0.5 * e;
        r = 0.7 * r + 0.3 * RER * e;
        p1[k] = mu * r / (e * (pw[k] + 10));
      }
    } else {
      var rate = 0.25 * Math.min(1, Sxx / (See + 1e-9));             // before the leak estimate is usable
      this.sumAdapt += rate;
      for (k = 0; k < H; k++) p1[k] = mu * rate / (pw[k] + 10);
    }
    // gradient step W += p1 · conj(X) · E  (unconstrained), then constrain two partitions per block
    var prop = this.prop;
    for (c = 0; c < K; c++) for (m = 0; m < M; m++) {
      s = (slot - m + M) % M; wr = this.Wr[c * M + m]; wi = this.Wi[c * M + m]; xr = this.Xr[c * M + s]; xi = this.Xi[c * M + s];
      var pm = prop[m];
      for (k = 0; k < H; k++) {
        var g = p1[k] * pm, gr = xr[k] * Er[k] + xi[k] * Ei[k], gi = xr[k] * Ei[k] - xi[k] * Er[k];
        wr[k] += g * gr; wi[k] += g * gi;
      }
    }
    for (var q = 0; q < 2; q++) {
      var idx = this.cst++ % (M * K), WR = this.Wr[idx], WI = this.Wi[idx];
      rf.inverse(WR, WI, tb);
      for (i = N; i < L; i++) tb[i] = 0;
      rf.forward(tb, WR, WI);
    }
    // re-estimate the proportionate weights from the filter energy per partition
    var mx = 1, sum = 1;
    for (m = 0; m < M; m++) {
      var en = 1;
      for (c = 0; c < K; c++) { wr = this.Wr[c * M + m]; wi = this.Wi[c * M + m]; for (k = 0; k < H; k += 2) en += wr[k] * wr[k] + wi[k] * wi[k]; }
      prop[m] = Math.sqrt(en); if (prop[m] > mx) mx = prop[m];
    }
    for (m = 0; m < M; m++) { prop[m] += 0.1 * mx; sum += prop[m]; }
    for (m = 0; m < M; m++) prop[m] = 0.99 * prop[m] / sum;
  };

  // Full-take canceller. mic: Float32 (−1..1); refs: array of aligned Float32 refs. Returns { e, y } Float32.
  function aec(mic, refs, sr, o, progress) {
    o = o || {};
    var K = refs.length, n = mic.length, ec = new AEC(K, sr, o), N = ec.N, S = 32768;
    var d = new Float64Array(N), xs = [], oe = new Float64Array(N), oy = new Float64Array(N), c, i;
    for (c = 0; c < K; c++) xs.push(new Float64Array(N));
    var blocks = Math.ceil(n / N), warm = Math.min(blocks, Math.round((o.warmSec != null ? o.warmSec : 20) * sr / N));
    var total = warm + blocks, done = 0;
    function feed(b) {
      var off = b * N;
      for (i = 0; i < N; i++) { var j = off + i; d[i] = j < n ? mic[j] * S : 0; for (c = 0; c < K; c++) xs[c][i] = j < n ? refs[c][j] * S : 0; }
    }
    // pass 1: converge only (outputs discarded), then reset the time-domain state and run the whole take
    for (var b = 0; b < warm; b++) { feed(b); ec.blockRun(d, xs, oe, oy, true); if (progress && (++done & 63) === 0) progress(done / total); }
    for (c = 0; c < K; c++) { ec.xprev[c].fill(0); ec.memX[c] = 0; }
    ec.memD = 0; ec.memE = 0; ec.memY = 0;
    for (c = 0; c < K * ec.M; c++) { ec.Xr[c].fill(0); ec.Xi[c].fill(0); }
    ec.block = 0;
    if (o.mu2) ec.mu = o.mu2;                                          // smaller step for the output pass → less misadjustment
    var E = new Float32Array(n), Y = new Float32Array(n);
    for (b = 0; b < blocks; b++) {
      feed(b); ec.blockRun(d, xs, oe, oy, true);
      var off = b * N;
      for (i = 0; i < N && off + i < n; i++) { E[off + i] = oe[i] / S; Y[off + i] = oy[i] / S; }
      if (progress && (++done & 63) === 0) progress(done / total);
    }
    return { e: E, y: Y, leak: ec.leak, M: ec.M };
  }

  /* ---------------- 4. residual echo suppression (STFT) ---------------- */
  function residualSuppress(e, y, sr, o, progress, extras) {
    o = o || {};
    var F = 1024, hop = 256, H = F / 2 + 1, n = e.length, frames = Math.ceil((n + F) / hop), fft = getFFT(F);
    var win = new Float64Array(F), i, k, f;
    for (i = 0; i < F; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / F);
    var norm = 1 / 1.5; // Hann² at 75 % overlap sums to 1.5
    // bands (≈ 1/3-octave above 200 Hz)
    var bandOf = new Uint8Array(H), edges = [0], fz = 200;
    while (fz < sr / 2) { edges.push(Math.round(fz / sr * F)); fz *= 1.26; }
    var NB = edges.length; for (k = 0; k < H; k++) { var bb = 0; while (bb + 1 < NB && k >= edges[bb + 1]) bb++; bandOf[k] = bb; }
    var decay = Math.exp(-hop / (sr * (o.tailDecaySec || 0.12)));
    var re = new Float64Array(F), im = new Float64Array(F), re2 = new Float64Array(F), im2 = new Float64Array(F);
    function stft(sig, t, R, I) { var s0 = t * hop - F; for (var j = 0; j < F; j++) { var q = s0 + j; R[j] = q >= 0 && q < n ? sig[q] * win[j] : 0; I[j] = 0; } fft.run(R, I, false); }
    // pass A: per-band powers. Leakage γ_b (residual echo ÷ echo estimate) = a low percentile of |E|²/S over frames
    // where the beat is present: the frames without voice sit at the bottom ("minimum statistics"). A covariance
    // estimate fails here because a rapper's loudness follows the beat's rhythm.
    var bandE = [], bandS = [], cnt = 0, sS = new Float64Array(NB), sE = new Float64Array(NB), sES = new Float64Array(NB), sSS = new Float64Array(NB);
    var Sm = new Float64Array(H), bE = new Float64Array(NB), bS = new Float64Array(NB);
    for (f = 0; f < frames; f++) {
      stft(e, f, re, im); stft(y, f, re2, im2);
      bE.fill(0); bS.fill(0);
      for (k = 0; k < H; k++) {
        var ye = re2[k] * re2[k] + im2[k] * im2[k]; Sm[k] = Math.max(ye, decay * Sm[k]);
        bE[bandOf[k]] += re[k] * re[k] + im[k] * im[k]; bS[bandOf[k]] += Sm[k];
      }
      bandE.push(Float32Array.from(bE)); bandS.push(Float32Array.from(bS));
      for (var q = 0; q < NB; q++) { sS[q] += bS[q]; sE[q] += bE[q]; sES[q] += bE[q] * bS[q]; sSS[q] += bS[q] * bS[q]; }
      cnt++;
      if (progress && (f & 255) === 0) progress(0.5 * f / frames);
    }
    var gam = new Float64Array(NB), pct = o.pct || 0.15;
    for (q = 0; q < NB; q++) {
      var mS = sS[q] / cnt, rat = [];
      for (f = 0; f < cnt; f++) if (bandS[f][q] > 0.3 * mS && mS > 1e-14) rat.push(bandE[f][q] / bandS[f][q]);
      if (rat.length < 20) { gam[q] = 0.01; continue; }
      rat.sort(function (x, y2) { return x - y2; });
      var gp = rat[Math.floor(rat.length * pct)];
      // covariance estimate (catches loud, distorted bleed that isn't proportional frame by frame), capped so a
      // voice that happens to follow the beat can't inflate it
      var mE = sE[q] / cnt, cv = sES[q] / cnt - mE * mS, vr = sSS[q] / cnt - mS * mS, gc = vr > 1e-24 ? cv / vr : 0;
      gam[q] = Math.max(0.005, Math.min(1, Math.max(gp, Math.min(gc, 4 * gp, 0.3))));
    }
    bandE = bandS = null;
    // pass B: gains + overlap-add
    var out = new Float32Array(n), G = new Float64Array(H), over = o.over || 2.0, gmin = o.gmin != null ? o.gmin : 0.06;
    // extras (test harness only): other signals that get exactly the same time-frequency gains
    extras = extras || [];
    var xo = extras.map(function () { return new Float32Array(n); }), xr = new Float64Array(F), xi = new Float64Array(F);
    Sm.fill(0); G.fill(1);
    for (f = 0; f < frames; f++) {
      stft(e, f, re, im); stft(y, f, re2, im2);
      for (k = 0; k < H; k++) {
        ye = re2[k] * re2[k] + im2[k] * im2[k]; Sm[k] = Math.max(ye, decay * Sm[k]);
        var P = re[k] * re[k] + im[k] * im[k] + 1e-14, R = gam[bandOf[k]] * Sm[k];
        var g = 1 - over * R / P; if (g < gmin) g = gmin;
        G[k] = g < G[k] ? g : 0.6 * G[k] + 0.4 * g;                     // fast attack, slightly slower release
      }
      for (k = 0; k < H; k++) { var gg = G[k]; re[k] *= gg; im[k] *= gg; }
      for (k = 1; k < F / 2; k++) { re[F - k] = re[k]; im[F - k] = -im[k]; }
      fft.run(re, im, true);
      var s0 = f * hop - F;
      for (i = 0; i < F; i++) { var p = s0 + i; if (p >= 0 && p < n) out[p] += re[i] * win[i] * norm; }
      for (var xq = 0; xq < extras.length; xq++) {
        stft(extras[xq], f, xr, xi);
        for (k = 0; k < H; k++) { xr[k] *= G[k]; xi[k] *= G[k]; }
        for (k = 1; k < F / 2; k++) { xr[F - k] = xr[k]; xi[F - k] = -xi[k]; }
        fft.run(xr, xi, true);
        for (i = 0; i < F; i++) { p = s0 + i; if (p >= 0 && p < n) xo[xq][p] += xr[i] * win[i] * norm; }
      }
      if (progress && (f & 255) === 0) progress(0.5 + 0.5 * f / frames);
    }
    return { out: out, gamma: Array.prototype.slice.call(gam), extras: xo };
  }

  /* ---------------- stages 1–4 together ---------------- */
  // mic: Float32; L, R: the digital beat as sent to the speaker (R may be null); comps (tests only): {voice, bleed, noise}
  function cleanCore(mic, L, R, sr, o, progress, comps) {
    o = o || {}; progress = progress || function () {};
    var n = mic.length, i, t0 = Date.now(), info = { sr: sr, dur: n / sr };
    var mono = new Float32Array(n);
    for (i = 0; i < n; i++) { var a = i < L.length ? L[i] : 0, b = R && i < R.length ? R[i] : a; mono[i] = 0.5 * (a + b); }
    progress("align", 0);
    var est = estimateDelay(mic, mono, sr, o);
    info.delayMs = est.ok ? est.delay / sr * 1000 : null; info.driftPpm = est.ok ? est.drift * 1e6 : null; info.bleedFound = !!est.ok;
    info.alignMs = Date.now() - t0;
    var e = mic, y = null, cv = comps ? { voice: comps.voice, noise: comps.noise, bleed: comps.bleed } : null;
    if (est.ok) {
      // stereo reference only if the beat really differs left / right (e.g. panned drum-machine pads on a tablet)
      var side = 0, mid = 0;
      if (R) for (i = 0; i < n; i += 7) { var l = L[i] || 0, r = R[i] || 0; side += (l - r) * (l - r); mid += (l + r) * (l + r); }
      var K = R && side > 0.04 * mid ? 2 : 1; info.channels = K;
      var refs = alignRefs(K === 2 ? [L, R] : [mono], n, est.delay, est.drift, Math.round(0.004 * sr));
      mono = null;
      t0 = Date.now();
      var warm = Math.min(n / sr, o.warmSec != null ? o.warmSec : 45);
      var r1 = aec(mic, refs, sr, { warmSec: warm, mu2: o.mu2 || 0.25, tailSec: o.tailSec }, function (p) { progress("aec", p); });
      info.aecMs = Date.now() - t0; refs = null;
      e = r1.e; y = r1.y;
      if (cv) { var bl = new Float32Array(n); for (i = 0; i < n; i++) bl[i] = comps.bleed[i] - y[i]; cv.bleed = bl; }
      t0 = Date.now();
      var r2 = residualSuppress(e, y, sr, o.res, function (p) { progress("res", p); }, cv ? [cv.voice, cv.noise, cv.bleed] : null);
      info.resMs = Date.now() - t0; info.gamma = r2.gamma;
      // how loud was the bleed, and how much did the canceller take out (measured on the whole take)
      var pm = 0, py = 0, pe = 0; for (i = 0; i < n; i += 3) { pm += mic[i] * mic[i]; py += y[i] * y[i]; pe += e[i] * e[i]; }
      info.bleedDb = db(Math.sqrt(py / (n / 3))); info.micDb = db(Math.sqrt(pm / (n / 3))); info.afterAecDb = db(Math.sqrt(pe / (n / 3)));
      e = r2.out;
      if (cv) { cv.voice = r2.extras[0]; cv.noise = r2.extras[1]; cv.bleed = r2.extras[2]; }
    }
    return { out: e === mic ? Float32Array.from(mic) : e, info: info, comps: cv };
  }

  /* ---------------- small helpers used by the worker ---------------- */
  function highpass(x, sr, fc) { // 2nd-order Butterworth HPF, in place
    var w = Math.tan(Math.PI * fc / sr), q = Math.SQRT1_2, n = 1 / (1 + w / q + w * w);
    var b0 = n, b1 = -2 * n, b2 = n, a1 = 2 * (w * w - 1) * n, a2 = (1 - w / q + w * w) * n, x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (var i = 0; i < x.length; i++) { var v = x[i], o = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = v; y2 = y1; y1 = o; x[i] = o; }
    return x;
  }
  // voice-activity gate: vad = per-frame probabilities (frame = fs samples). Look-ahead + hold, smooth ramps.
  // Returns the gain curve (so the same gain can be applied to other signals) and the open fraction.
  function vadGate(n, vad, fs, sr, o) {
    o = o || {};
    var thr = o.thr || 0.4, floor = Math.pow(10, (o.floorDb != null ? o.floorDb : -30) / 20), holdF = Math.round((o.holdSec || 0.3) * sr / fs), ahead = 3;
    var nF = vad.length, open = new Uint8Array(nF), last = -1e9, f;
    for (f = 0; f < nF; f++) {
      var hit = false; for (var a = 0; a <= ahead && f + a < nF; a++) if (vad[f + a] > thr) { hit = true; break; }
      if (hit) last = f;
      open[f] = f - last <= holdF ? 1 : 0;
    }
    var gain = new Float32Array(n), g = floor, att = 1 - Math.exp(-1 / (0.004 * sr)), rel = 1 - Math.exp(-1 / (0.08 * sr)), openN = 0;
    for (var i = 0; i < n; i++) {
      var t = open[Math.min(nF - 1, (i / fs) | 0)] ? 1 : floor; if (t === 1) openN++;
      g += (t - g) * (t > g ? att : rel); gain[i] = g;
    }
    return { gain: gain, open: openN / Math.max(1, n) };
  }
  // test harness: carry a non-linear processor's effect over to component signals as an STFT gain (|after| / |before|)
  function transferGains(before, after, comps) {
    var F = 1024, hop = 256, H = F / 2 + 1, n = before.length, fft = getFFT(F), frames = Math.ceil((n + F) / hop), i, k, f;
    var win = new Float64Array(F); for (i = 0; i < F; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / F);
    var br = new Float64Array(F), bi = new Float64Array(F), ar = new Float64Array(F), ai = new Float64Array(F), cr = new Float64Array(F), ci = new Float64Array(F), G = new Float64Array(H);
    var outs = comps.map(function () { return new Float32Array(n); });
    function stft(sig, t, R, I) { var s0 = t * hop - F; for (var j = 0; j < F; j++) { var q = s0 + j; R[j] = q >= 0 && q < n ? sig[q] * win[j] : 0; I[j] = 0; } fft.run(R, I, false); }
    for (f = 0; f < frames; f++) {
      stft(before, f, br, bi); stft(after, f, ar, ai);
      for (k = 0; k < H; k++) G[k] = Math.min(1, Math.sqrt((ar[k] * ar[k] + ai[k] * ai[k]) / (br[k] * br[k] + bi[k] * bi[k] + 1e-18)));
      for (var c = 0; c < comps.length; c++) {
        stft(comps[c], f, cr, ci);
        for (k = 0; k < H; k++) { cr[k] *= G[k]; ci[k] *= G[k]; }
        for (k = 1; k < F / 2; k++) { cr[F - k] = cr[k]; ci[F - k] = -ci[k]; }
        fft.run(cr, ci, true);
        var s0 = f * hop - F;
        for (i = 0; i < F; i++) { var p = s0 + i; if (p >= 0 && p < n) outs[c][p] += cr[i] * win[i] / 1.5; }
      }
    }
    return outs;
  }

  root.IPBVocalCleanDSP = { FFT: FFT, getFFT: getFFT, RFFT: RFFT, getRFFT: getRFFT, rms: rms, db: db, decimate4: decimate4, estimateDelay: estimateDelay, alignRefs: alignRefs, AEC: AEC, aec: aec, residualSuppress: residualSuppress, cleanCore: cleanCore, highpass: highpass, vadGate: vadGate, transferGains: transferGains };
  if (typeof module === "object" && module.exports) module.exports = root.IPBVocalCleanDSP;
})(typeof self !== "undefined" ? self : typeof globalThis !== "undefined" ? globalThis : this);
