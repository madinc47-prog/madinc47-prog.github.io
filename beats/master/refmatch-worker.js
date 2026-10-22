/* Island Pin Beats · Match to Reference (like a master assistant): analyses YOUR song and a REFERENCE record, then renders a
 * matched COPY of your song: 1/3-octave EQ match (±6 dB, IPBMDSP EqSolver bank), crest-factor compressor, mid/side width,
 * integrated-loudness match and a 4x true-peak limiter at -1 dBTP. Runs off the main thread; the original is never changed. */
self.window = self;
var V = (/[?&]v=([^&]+)/.exec(self.location.search) || [])[1] || "1";
importScripts("master-dsp.js?v=" + V, "../fx-chain.js?v=" + V);
var D = self.IPBMDSP, FX = self.IPBFx, CEIL = -1;
function prog(id, p, msg) { self.postMessage({ id: id, prog: p, msg: msg }); }
function db(x) { return x > 1e-20 ? 10 * Math.log10(x) : -200; }
/* average power spectrum on the 1/6-octave grid, smoothed to 1/3 octave, level-normalised (dB, mean 0 over 60 Hz–12 kHz) */
function spectrum(L, R, sr, id, p0, p1) {
  var N = 4096, fft = new D.FFT(N), map = D.gridMapper(N, sr), G = D.GRID, ng = G.length;
  var win = new Float64Array(N); for (var i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
  var nFr = Math.max(1, Math.floor((L.length - N) / N)), take = Math.min(nFr, 700), acc = new Float64Array(N / 2 + 1), pw = new Float64Array(N / 2 + 1);
  var re = new Float64Array(N), im = new Float64Array(N), used = 0;
  for (var f = 0; f < take; f++) {
    var st = Math.floor(f * nFr / take) * N, e = 0;
    for (var ch = 0; ch < 2; ch++) {
      var X = ch ? R : L;
      for (i = 0; i < N; i++) { re[i] = (X[st + i] || 0) * win[i]; im[i] = 0; e += re[i] * re[i]; }
      fft.run(re, im);
      for (i = 0; i <= N / 2; i++) pw[i] = re[i] * re[i] + im[i] * im[i];
      if (e > 1e-7) for (i = 0; i <= N / 2; i++) acc[i] += pw[i];
    }
    if (e > 1e-7) used++;
    if (!(f % 60)) prog(id, p0 + (p1 - p0) * f / take);
  }
  var g = new Float64Array(ng); map(acc, g);
  var out = new Float64Array(ng);
  for (i = 0; i < ng; i++) { var s = 0, c = 0; for (var k = -1; k <= 1; k++) if (i + k >= 0 && i + k < ng) { s += g[i + k]; c++; } out[i] = db(s / c + 1e-30); }
  var m = 0, n = 0; for (i = 0; i < ng; i++) if (G[i] >= 60 && G[i] <= 12000) { m += out[i]; n++; }
  for (i = 0; i < ng; i++) out[i] -= m / n;
  return Array.prototype.slice.call(out);
}
/* crest factor: loud-part peak (99th pct of 50 ms block peaks) over integrated RMS of the gated blocks */
function crest(L, R, sr) {
  var B = Math.round(sr * 0.05), pk = [], ms = [];
  for (var s = 0; s + B <= L.length; s += B) { var p = 0, e = 0; for (var i = s; i < s + B; i++) { var a = Math.abs(L[i]), b = Math.abs(R[i]); if (a > p) p = a; if (b > p) p = b; e += L[i] * L[i] + R[i] * R[i]; } pk.push(p); ms.push(e / (2 * B)); }
  if (!pk.length) return 0;
  var mx = Math.max.apply(null, ms), gm = ms.filter(function (x) { return x > mx * 1e-4; });
  var rms = gm.reduce(function (a, b) { return a + b; }, 0) / gm.length;
  pk.sort(function (a, b) { return a - b; });
  return 20 * Math.log10(pk[Math.floor(pk.length * 0.99)] + 1e-12) - 10 * Math.log10(rms + 1e-20);
}
function sideRatio(L, R) { var m = 0, s = 0; for (var i = 0; i < L.length; i += 2) { var a = L[i] + R[i], b = L[i] - R[i]; m += a * a; s += b * b; } return s / (m + 1e-20); }
var PH = null;
function truePeak(L, R) {
  PH = PH || D.tpPhases(16, 4); var T = 16, pk = 0;
  for (var ch = 0; ch < 2; ch++) { var X = ch ? R : L, n = X.length;
    for (var i = 0; i < n; i++) { var a = Math.abs(X[i]); if (a > pk) pk = a;
      if (a > pk * 0.7 && i >= T) for (var k = 0; k < PH.length; k++) { var h = PH[k], s = 0; for (var j = 0; j < T; j++) s += h[j] * X[i - T + 1 + j]; s = Math.abs(s); if (s > pk) pk = s; } } }
  return 20 * Math.log10(pk + 1e-12);
}
function analyse(L, R, sr, id, p0, p1) {
  return { spec: spectrum(L, R, sr, id, p0, p1), lufs: FX.lufs([L, R], sr), crest: crest(L, R, sr), side: sideRatio(L, R), tp: truePeak(L, R), dur: L.length / sr };
}
function specDiff(a, b) { var G = D.GRID, s = 0, n = 0; for (var i = 0; i < G.length; i++) if (G[i] >= 40 && G[i] <= 16000) { var d = a[i] - b[i]; s += d * d; n++; } return Math.sqrt(s / n); }
/* plan: EQ gains, compressor, width, loudness at amount a (0..1) */
function plan(mine, ref, sr, a) {
  var G = D.GRID, tgt = new Float64Array(G.length);
  for (var i = 0; i < G.length; i++) { var lim = G[i] < 35 || G[i] > 16000 ? 3 : 6; tgt[i] = G[i] < sr * 0.45 ? D.clamp(ref.spec[i] - mine.spec[i], -lim, lim) : 0; }
  var solver = new D.EqSolver(sr), g = solver.solve(tgt, 4);
  for (i = 0; i < g.length; i++) g[i] = D.clamp(g[i], -6, 6) * a;
  var cd = Math.max(0, mine.crest - ref.crest); // dB of crest to remove (limiter does the rest)
  var width = Math.sqrt(D.clamp((ref.side + 1e-4) / (mine.side + 1e-4), 0.35, 2.6));
  return { eq: Array.prototype.slice.call(g), crestCut: cd * 0.7 * a, width: 1 + (width - 1) * a, targetLufs: mine.lufs + (ref.lufs - mine.lufs) * a, solver: solver };
}
function render(L0, R0, sr, mine, ref, a, id) {
  var P = plan(mine, ref, sr, a), n = L0.length, L = new Float32Array(L0), R = new Float32Array(R0), i, k;
  prog(id, 0.05, "EQ match");
  var bl = [], br = [];
  P.eq.forEach(function (g, j) { if (Math.abs(g) < 0.05) return; var c = D.coeffs("peaking", P.solver.fs[j], D.EQ_Q, g, sr); bl.push(new D.Biquad(c)); br.push(new D.Biquad(c)); });
  for (i = 0; i < n; i++) { var l = L[i], r = R[i]; for (k = 0; k < bl.length; k++) { l = bl[k].run(l); r = br[k].run(r); } L[i] = l; R[i] = r; if (!(i % 400000)) prog(id, 0.05 + 0.3 * i / n, "EQ match"); }
  // stereo width (mid/side)
  if (Math.abs(P.width - 1) > 0.01) for (i = 0; i < n; i++) { var m = (L[i] + R[i]) * 0.5, s = (L[i] - R[i]) * 0.5 * P.width; L[i] = m + s; R[i] = m - s; }
  // compressor toward the reference crest factor: threshold a few dB over the RMS, ratio from the crest to remove
  var comp = null;
  if (P.crestCut > 0.3) {
    var e = 0; for (i = 0; i < n; i += 4) e += L[i] * L[i] + R[i] * R[i]; var rmsDb = 10 * Math.log10(e / (n / 2) + 1e-20);
    var thr = rmsDb + 4, peakOver = Math.max(1, mine.crest - 4), ratio = D.clamp(peakOver / Math.max(0.5, peakOver - P.crestCut), 1, 6);
    var at = Math.exp(-1 / (0.01 * sr)), rl = Math.exp(-1 / (0.15 * sr)), env = 0, gr = 0;
    for (i = 0; i < n; i++) {
      var x = Math.max(Math.abs(L[i]), Math.abs(R[i])); env = x > env ? x + (env - x) * at : x + (env - x) * rl;
      if (!(i & 7)) { var ed = 20 * Math.log10(env + 1e-9); gr = ed > thr ? Math.pow(10, -(ed - thr) * (1 - 1 / ratio) / 20) : 1; }
      L[i] *= gr; R[i] *= gr; if (!(i % 400000)) prog(id, 0.35 + 0.15 * i / n, "Dynamics");
    }
    comp = { thr: thr, ratio: ratio };
  }
  // loudness: gain to the target, true-peak limiter at -1 dBTP, then one correction pass
  var pre = FX.lufs([L, R], sr), drive = P.targetLufs - pre, out = null, clip = false, cL = null, cR = null, cc = D.dbToLin(CEIL) * 0.98;
  for (var pass = 0; pass < 6; pass++) {
    prog(id, 0.5 + pass * 0.07, "Loudness + limiter");
    if (clip) { // soft clipper ahead of the limiter (maximizer style) when the limiter alone can't reach the reference loudness
      var gg = D.dbToLin(drive); cL = cL || new Float32Array(n); cR = cR || new Float32Array(n);
      for (i = 0; i < n; i++) { cL[i] = cc * D.softclip(L[i] * gg / cc); cR[i] = cc * D.softclip(R[i] * gg / cc); }
      out = D.limitArrays(cL, cR, 0, CEIL, { sr: sr, lookMs: 5, relMs: 80 });
    } else out = D.limitArrays(L, R, drive, CEIL, { sr: sr, lookMs: 5, relMs: 80 });
    var got = FX.lufs([out.L, out.R], sr), miss = P.targetLufs - got;
    if (Math.abs(miss) < 0.3) break;
    if (!clip && pass >= 1 && miss > 0.7) clip = true;
    drive += D.clamp(miss, -3, 6);
  }
  prog(id, 0.95, "Checking");
  var after = analyse(out.L, out.R, sr, id, 0.95, 0.99);
  return { L: out.L, R: out.R, report: { eq: P.eq, eqF: P.solver.fs, comp: comp, clip: clip, width: P.width, drive: drive, targetLufs: P.targetLufs, lufs: after.lufs, tp: after.tp, crest: after.crest,
    diffBefore: specDiff(mine.spec, ref.spec), diffAfter: specDiff(after.spec, ref.spec), spec: after.spec } };
}
self.onmessage = function (e) {
  var m = e.data;
  try {
    if (m.op === "analyse") { self.postMessage({ id: m.id, ok: true, r: analyse(m.L, m.R, m.sr, m.id, 0, 1) }); return; }
    if (m.op === "render") { var o = render(m.L, m.R, m.sr, m.mine, m.ref, m.amount, m.id); self.postMessage({ id: m.id, ok: true, r: o }, [o.L.buffer, o.R.buffer]); return; }
  } catch (err) { self.postMessage({ id: m.id, ok: false, err: String(err && err.message || err) }); }
};
