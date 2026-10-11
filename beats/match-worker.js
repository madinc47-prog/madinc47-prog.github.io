/* Island Pin Beats: "Match to beat" DSP worker (off the main thread so the beat never stutters).
 * stretch: WSOLA time-stretch (pitch kept). tighten: vocal onset detection + segment nudge toward the grid
 * (no resampling, so pitch / formants are untouched). Pure functions, also usable from Node tests. */
(function (G) {
  "use strict";
  function hann(n) { var w = new Float32Array(n); for (var i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / n); return w; }
  /* chs: [Float32Array…] (same length), factor = output length / input length */
  function stretch(chs, sr, factor) {
    var n = chs[0].length, N = sr > 60000 ? 2048 : 1024, Hs = N / 2, tol = Math.round(N / 4), w = hann(N);
    var outLen = Math.max(1, Math.round(n * factor)), Ha = Hs / factor;
    var mono = new Float32Array(n);
    for (var c = 0; c < chs.length; c++) { var d = chs[c]; for (var i = 0; i < n; i++) mono[i] += d[i] / chs.length; }
    var D = 4, mN = N / D, md = new Float32Array(Math.ceil(n / D)); // decimated copy for the coarse search
    for (var j = 0; j < md.length; j++) md[j] = mono[j * D] || 0;
    var outs = chs.map(function () { return new Float32Array(outLen + N); }), norm = new Float32Array(outLen + N);
    var prev = 0; // analysis position of the previous frame
    for (var k = 0, so = 0; so < outLen; k++, so += Hs) {
      var target = Math.round(k * Ha), best = target;
      if (k > 0) {
        var nat = prev + Hs, bc = -1e30, lo = Math.max(0, target - tol), hi = Math.min(n - N, target + tol);
        if (hi >= lo) {
          for (var p = lo; p <= hi; p += D) { // coarse (decimated) normalized cross-correlation with the natural continuation
            var s = 0, e = 0, a = (nat / D) | 0, b = (p / D) | 0;
            for (var q = 0; q < mN; q += 2) { var x = md[a + q] || 0, y = md[b + q] || 0; s += x * y; e += y * y; }
            var sc = s / Math.sqrt(e + 1e-9); if (sc > bc) { bc = sc; best = p; }
          }
          var b0 = best; bc = -1e30;
          for (var f = Math.max(lo, b0 - D); f <= Math.min(hi, b0 + D); f++) { // fine
            var s2 = 0, e2 = 0;
            for (var r = 0; r < N; r += 4) { var x2 = mono[nat + r] || 0, y2 = mono[f + r] || 0; s2 += x2 * y2; e2 += y2 * y2; }
            var sc2 = s2 / Math.sqrt(e2 + 1e-9); if (sc2 > bc) { bc = sc2; best = f; }
          }
        } else best = Math.max(0, Math.min(n - 1, target));
      }
      for (var ch = 0; ch < chs.length; ch++) { var src = chs[ch], o = outs[ch]; for (var t = 0; t < N; t++) { var v = src[best + t]; if (v !== undefined) o[so + t] += v * w[t]; } }
      for (var u = 0; u < N; u++) norm[so + u] += w[u];
      prev = best;
    }
    return outs.map(function (o) { var r = new Float32Array(outLen); for (var i = 0; i < outLen; i++) r[i] = norm[i] > 1e-3 ? o[i] / norm[i] : 0; return r; });
  }
  /* onsets (seconds) of a mono vocal: energy rises after quieter moments, refined to ~1 ms */
  function onsets(V, sr) {
    var hop = Math.round(sr * 0.005), win = hop * 2, n = V.length, env = [], mx = 0;
    for (var s = 0; s + win <= n; s += hop) { var a = 0; for (var i = s; i < s + win; i++) a += V[i] * V[i]; a = Math.sqrt(a / win); env.push(a); if (a > mx) mx = a; }
    if (!mx) return [];
    var gate = mx * 0.06, out = [], last = -1e9, back = 6; // look back 30 ms
    for (var k = back; k < env.length; k++) {
      var lo = 1e9; for (var j = k - back; j < k; j++) lo = Math.min(lo, env[j]);
      if (env[k] > gate && env[k] > lo * 2.5 + mx * 0.01 && (k - last) * hop / sr > 0.09) {
        // refine: first sample in [k-back, k+2] hops where a 1 ms envelope passes 30 % of the local peak
        var s0 = Math.max(0, (k - back) * hop), s1 = Math.min(n, (k + 4) * hop), pk = 0, h = Math.max(1, Math.round(sr * 0.001)), e;
        for (var q = s0; q < s1; q += h) { e = 0; for (var r = q; r < q + h && r < n; r++) e = Math.max(e, Math.abs(V[r])); if (e > pk) pk = e; }
        var at = k * hop;
        for (var q2 = s0; q2 < s1; q2 += h) { e = 0; for (var r2 = q2; r2 < q2 + h && r2 < n; r2++) e = Math.max(e, Math.abs(V[r2])); if (e >= pk * 0.3) { at = q2; break; } }
        out.push(at / sr); last = k;
        while (k + 1 < env.length && env[k + 1] >= env[k] * 0.9) k++; // skip the rest of this rise
      }
    }
    return out;
  }
  /* grid: { step (s), swing (0..0.5 of a step pair → delay of odd steps, s), offset (s: timeline time of sample 0) } */
  function tighten(V, sr, grid, strength) {
    strength = Math.max(0, Math.min(1, +strength || 0));
    var on = onsets(V, sr), n = V.length, out = new Float32Array(n), step = grid.step, off = grid.offset || 0, sw = grid.swing || 0;
    var maxD = Math.min(step * 0.5, 0.08), moves = [];
    on.forEach(function (t) {
      var ta = t + off, k = Math.round(ta / step), best = 1e9, bd = 0;
      for (var m = k - 1; m <= k + 1; m++) { var g = m * step + (((m % 2) + 2) % 2 === 1 ? sw : 0), dd = g - ta; if (Math.abs(dd) < Math.abs(best)) best = dd; }
      bd = Math.max(-maxD, Math.min(maxD, best)) * strength;
      moves.push({ t: t, d: bd });
    });
    var pre = Math.round(sr * 0.012), X = Math.round(sr * 0.005);
    var cuts = [0].concat(moves.map(function (m) { return Math.max(0, Math.round(m.t * sr) - pre); })).concat([n]);
    var ds = [0].concat(moves.map(function (m) { return Math.round(m.d * sr); }));
    for (var i = 0; i + 1 < cuts.length; i++) {
      var a = cuts[i], b = cuts[i + 1], d = ds[i];
      for (var x = a - X; x < b + X; x++) {
        if (x < 0 || x >= n) continue;
        var y = x + d; if (y < 0 || y >= n) continue;
        var g2 = 1;
        if (i > 0 && x < a + X) g2 = 0.5 - 0.5 * Math.cos(Math.PI * (x - (a - X)) / (2 * X));
        if (i + 2 < cuts.length && x >= b - X) g2 *= 0.5 + 0.5 * Math.cos(Math.PI * (x - (b - X)) / (2 * X));
        out[y] += V[x] * g2;
      }
    }
    return { out: out, info: { onsets: on.length, moves: moves.map(function (m) { return Math.round(m.d * 1000); }) } };
  }
  var API = { stretch: stretch, onsets: onsets, tighten: tighten };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  if (typeof document === "undefined" && typeof self !== "undefined" && typeof self.postMessage === "function" && typeof module === "undefined") {
    self.onmessage = function (e) {
      var m = e.data, r, tr = [];
      try {
        if (m.op === "stretch") { r = stretch(m.chs, m.sr, m.factor); tr = r.map(function (a) { return a.buffer; }); }
        else if (m.op === "tighten") { r = tighten(m.V, m.sr, m.grid, m.strength); tr = [r.out.buffer]; }
        self.postMessage({ id: m.id, ok: true, r: r }, tr);
      } catch (err) { self.postMessage({ id: m.id, ok: false, err: String(err && err.message || err) }); }
    };
  }
  G.IPBMatchDSP = API;
})(typeof self !== "undefined" ? self : this);
