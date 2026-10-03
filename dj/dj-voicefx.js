/* DJ Psycho Fingers — Voice Style DSP for the Sample Studio. Honest summary: this is DSP-based style MATCHING
 * (pitch, formant, EQ, dynamics, saturation, band-limiting, delay, reverb), not a voice clone.
 * - Pitch shift that keeps the duration + independent formant shift: STFT phase vocoder (2048 / hop 512) with
 *   spectral-envelope separation (excitation is moved by the pitch ratio, the envelope by the formant ratio).
 * - Reference analysis: median F0 (normalised autocorrelation), octave-band long-term spectrum (EQ curve + tilt),
 *   active RMS loudness, crest factor (compression), decay rate after peaks (reverb / space), HF flatness (distortion),
 *   band-limiting (radio / megaphone).
 * - Render: pitch/formant → 9-band match EQ → radio band-pass → saturation → compressor → delay throws + reverb → loudness.
 * All hand-written here (no third-party code). */
(function () {
  "use strict";
  function fft(re, im, inv) {
    var n = re.length, i, j, k, l;
    for (i = 1, j = 0; i < n; i++) { var bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { var t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (l = 2; l <= n; l <<= 1) {
      var ang = (inv ? 2 : -2) * Math.PI / l, wr = Math.cos(ang), wi = Math.sin(ang), h = l >> 1;
      for (i = 0; i < n; i += l) { var cr = 1, ci = 0; for (k = 0; k < h; k++) { var a = i + k, b = a + h, xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr; re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi; var nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr; } }
    }
    if (inv) for (i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
  }
  function hann(N) { var w = new Float32Array(N); for (var i = 0; i < N; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N); return w; }
  /* spectral envelope: running max (±r bins) then running mean (±r) — rides over the harmonics */
  function envelope(mag, half, r) {
    var mx = new Float32Array(half + 1), env = new Float32Array(half + 1), k, j;
    for (k = 0; k <= half; k++) { var m = 0; for (j = Math.max(0, k - r); j <= Math.min(half, k + r); j++) if (mag[j] > m) m = mag[j]; mx[k] = m; }
    var acc = 0, cnt = 0, lo = 0, hi = -1;
    for (k = 0; k <= half; k++) {
      while (hi < Math.min(half, k + r)) { hi++; acc += mx[hi]; cnt++; }
      while (lo < k - r) { acc -= mx[lo]; lo++; cnt--; }
      env[k] = acc / cnt + 1e-9;
    }
    return env;
  }
  /* pitch shift (semitones, duration kept) + formant shift (semitones) — one channel */
  function shiftChannel(x, sr, semis, formant) {
    var N = 2048, H = 512, half = N / 2, len = x.length, out = new Float32Array(len), win = hann(N);
    var pr = Math.pow(2, semis / 12), fr = Math.pow(2, formant / 12), r = Math.max(3, Math.round(N * 220 / sr / 2));
    var lastPh = new Float32Array(half + 1), sumPh = new Float32Array(half + 1), re = new Float32Array(N), im = new Float32Array(N);
    var mag = new Float32Array(half + 1), tb = new Float32Array(half + 1), nMag = new Float32Array(half + 1), nFr = new Float32Array(half + 1);
    var expct = 2 * Math.PI * H / N, norm = 1 / 1.5;                       // Hann² at 75 % overlap sums to 1.5
    for (var pos = -N + H; pos < len; pos += H) {
      var k, i;
      for (i = 0; i < N; i++) { var s = pos + i; re[i] = (s >= 0 && s < len ? x[s] : 0) * win[i]; im[i] = 0; }
      fft(re, im, false);
      for (k = 0; k <= half; k++) {
        var mr = re[k], mi = im[k], ph = Math.atan2(mi, mr), d = ph - lastPh[k] - k * expct;
        lastPh[k] = ph; d -= 2 * Math.PI * Math.round(d / (2 * Math.PI));
        mag[k] = Math.sqrt(mr * mr + mi * mi); tb[k] = k + d / expct;
      }
      var env = envelope(mag, half, r);
      nMag.fill(0); nFr.fill(0);
      for (k = 0; k <= half; k++) {
        var j = Math.round(k * pr); if (j > half) break;
        var e = mag[k] / env[k];
        if (e > nMag[j]) { nMag[j] = e; nFr[j] = tb[k] * pr; }
      }
      for (k = 0; k <= half; k++) {
        var src = k / fr, a = Math.floor(src), f = src - a;
        var ev = a + 1 <= half ? env[a] * (1 - f) + env[a + 1] * f : a <= half ? env[a] : 0;
        var m2 = nMag[k] * ev;
        sumPh[k] += expct * nFr[k];
        re[k] = m2 * Math.cos(sumPh[k]); im[k] = m2 * Math.sin(sumPh[k]);
        if (k > 0 && k < half) { re[N - k] = re[k]; im[N - k] = -im[k]; }
      }
      im[0] = 0; im[half] = 0;
      fft(re, im, true);
      for (i = 0; i < N; i++) { var o = pos + i; if (o >= 0 && o < len) out[o] += re[i] * win[i] * norm; }
    }
    return out;
  }

  /* ---------------- analysis ---------------- */
  function mono(buf) { var c0 = buf.getChannelData(0), n = c0.length, m = new Float32Array(n); if (buf.numberOfChannels < 2) { m.set(c0); return m; } var c1 = buf.getChannelData(1); for (var i = 0; i < n; i++) m[i] = (c0[i] + c1[i]) * 0.5; return m; }
  var BANDS = [63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
  function analyze(buf) {
    var x = mono(buf), sr = buf.sampleRate, N = 2048, H = 512, half = N / 2, win = hann(N), re = new Float32Array(N), im = new Float32Array(N);
    var frames = [], peak = 0, i, k;
    for (i = 0; i < x.length; i++) { var a = x[i] < 0 ? -x[i] : x[i]; if (a > peak) peak = a; }
    for (var pos = 0; pos + N <= x.length; pos += H) { var s = 0; for (i = 0; i < N; i++) s += x[pos + i] * x[pos + i]; frames.push({ pos: pos, rms: Math.sqrt(s / N) }); }
    if (!frames.length) return null;
    var maxR = frames.reduce(function (m, f) { return Math.max(m, f.rms); }, 0), gate = maxR * 0.1;
    var act = frames.filter(function (f) { return f.rms > gate; });
    var spec = new Float64Array(half + 1), f0s = [], actE = 0;
    act.forEach(function (f, n) {
      for (i = 0; i < N; i++) { re[i] = x[f.pos + i] * win[i]; im[i] = 0; }
      fft(re, im, false);
      for (k = 0; k <= half; k++) spec[k] += re[k] * re[k] + im[k] * im[k];
      actE += f.rms * f.rms;
      if (n % 2 === 0) { var f0 = pitchOf(x, f.pos, N, sr); if (f0) f0s.push(f0); }
    });
    var binHz = sr / N, bandDb = BANDS.map(function (c) {
      var lo = c / Math.SQRT2, hi = c * Math.SQRT2, e = 0, cnt = 0;
      for (k = Math.max(1, Math.floor(lo / binHz)); k <= Math.min(half, Math.ceil(hi / binHz)); k++) { e += spec[k]; cnt++; }
      return 10 * Math.log10(e / Math.max(1, cnt) + 1e-12);
    });
    var meanDb = bandDb.slice(1, 8).reduce(function (s, v) { return s + v; }, 0) / 7;
    bandDb = bandDb.map(function (v) { return v - meanDb; });
    var rmsDb = 10 * Math.log10(actE / Math.max(1, act.length) + 1e-12), peakDb = 20 * Math.log10(peak + 1e-9);
    f0s.sort(function (a, b) { return a - b; });
    // decay after peaks (dB/s): slower decay = more room / reverb
    var env = frames.map(function (f) { return 20 * Math.log10(f.rms + 1e-9); }), rates = [];
    for (i = 2; i < env.length - 8; i++) if (env[i] > env[i - 1] && env[i] >= env[i + 1] && env[i] > 20 * Math.log10(maxR) - 18) { var drop = env[i] - env[i + 6]; if (drop > 3) rates.push(drop / (6 * H / sr)); }
    rates.sort(function (a, b) { return a - b; });
    var decay = rates.length ? rates[Math.floor(rates.length / 2)] : 120;
    // HF flatness 2–8 kHz (noisy / distorted = flatter)
    var lo2 = Math.floor(2000 / binHz), hi2 = Math.min(half, Math.floor(8000 / binHz)), lg = 0, ar = 0, nn = 0;
    for (k = lo2; k <= hi2; k++) { lg += Math.log(spec[k] + 1e-12); ar += spec[k]; nn++; }
    var flat = nn ? Math.exp(lg / nn) / (ar / nn + 1e-12) : 0;
    var cent = 0, cw = 0; for (k = Math.floor(300 / binHz); k <= Math.floor(4000 / binHz); k++) { cent += k * binHz * spec[k]; cw += spec[k]; }
    return { f0: f0s.length >= 3 ? f0s[Math.floor(f0s.length / 2)] : null, bands: bandDb, rmsDb: rmsDb, crest: peakDb - rmsDb, decay: decay, flat: flat, centroid: cw ? cent / cw : 1000,
      radio: Math.max(0, Math.min(1, (((bandDb[4] + bandDb[5]) / 2 - (bandDb[0] + bandDb[1] + bandDb[7] + bandDb[8]) / 4) - 14) / 16)), dur: buf.duration };
  }
  function pitchOf(x, pos, N, sr) {                // normalised autocorrelation, 70–500 Hz
    var minL = Math.floor(sr / 500), maxL = Math.min(N - 1, Math.ceil(sr / 70)), e0 = 0, i;
    for (i = 0; i < N; i++) e0 += x[pos + i] * x[pos + i];
    if (e0 < 1e-4) return null;
    var best = 0, bl = 0;
    for (var L = minL; L <= maxL; L++) {
      var s = 0, e1 = 0, e2 = 0;
      for (i = 0; i + L < N; i += 2) { var a = x[pos + i], b = x[pos + i + L]; s += a * b; e1 += a * a; e2 += b * b; }
      var r = s / Math.sqrt(e1 * e2 + 1e-12); if (r > best) { best = r; bl = L; }
    }
    return best > 0.6 && bl ? sr / bl : null;
  }
  var NEUTRAL = { pitch: 0, formant: 0, eq: 0, comp: 0, sat: 0, radio: 0, delay: 0, reverb: 0 };
  /* reference vs recording → full-strength settings (the Match amount slider scales them) */
  function match(ref, rec) {
    var o = { pitch: 0, formant: 0, eq: 1, comp: 0, sat: 0, radio: 0, delay: 0, reverb: 0, eqCurve: [], loud: ref.rmsDb };
    if (ref.f0 && rec.f0) {                                            // fold octave jumps, keep it musical (±7 st)
      var st = 12 * Math.log2(ref.f0 / rec.f0); while (st > 9) st -= 12; while (st < -9) st += 12;
      o.pitch = Math.max(-7, Math.min(7, Math.round(st * 2) / 2));
    }
    o.formant = Math.max(-6, Math.min(6, Math.round((12 * Math.log2(ref.centroid / rec.centroid) - 0.35 * o.pitch) * 2) / 2));
    o.eqCurve = ref.bands.map(function (v, i) { return Math.max(-9, Math.min(9, v - rec.bands[i])); });
    o.comp = Math.max(0, Math.min(1, (rec.crest - ref.crest) / 8 + (ref.crest < 9 ? 0.25 : 0)));
    o.sat = Math.max(0, Math.min(1, (ref.flat - rec.flat) * 3 + (ref.crest < 7 ? 0.3 : 0)));
    o.radio = Math.max(0, Math.min(1, ref.radio - rec.radio * 0.5));
    o.reverb = Math.max(0, Math.min(0.8, (rec.decay - ref.decay) / 120));
    return o;
  }
  var PRESETS = {
    "Deep MC": { pitch: -3, formant: -3, eq: 0, comp: 0.55, sat: 0.12, radio: 0, delay: 0, reverb: 0.12, tilt: [3, 2, 1, 0, 0, -1, -1, -2, -2] },
    "Chipmunk": { pitch: 7, formant: 6, eq: 0, comp: 0.3, sat: 0, radio: 0, delay: 0, reverb: 0.05 },
    "Radio DJ": { pitch: 0, formant: 0, eq: 0, comp: 0.75, sat: 0.25, radio: 0.85, delay: 0, reverb: 0.04 },
    "Hype Shout": { pitch: 1, formant: 0.5, eq: 0, comp: 0.9, sat: 0.5, radio: 0.15, delay: 0.3, reverb: 0.22, tilt: [0, 0, -1, 0, 2, 3, 2, 0, -2] },
    "Dancehall Toast": { pitch: 1, formant: 1, eq: 0, comp: 0.6, sat: 0.3, radio: 0.35, delay: 0.5, reverb: 0.2 },
    "Demon": { pitch: -8, formant: -5, eq: 0, comp: 0.6, sat: 0.45, radio: 0, delay: 0.1, reverb: 0.4, tilt: [4, 3, 1, 0, -1, -1, -2, -3, -4] }
  };
  function satCurve(drive) { var n = 2048, c = new Float32Array(n), k = 1 + drive * 24, t = Math.tanh(k); for (var i = 0; i < n; i++) { var x = i / (n - 1) * 2 - 1; c[i] = Math.tanh(k * x) / t; } return c; }
  function impulse(c, sec, sr) { var n = Math.round(sec * sr), b = c.createBuffer(2, n, sr); for (var ch = 0; ch < 2; ch++) { var d = b.getChannelData(ch), seed = ch ? 99 : 7; for (var i = 0; i < n; i++) { seed = (seed * 16807) % 2147483647; d[i] = (seed / 1073741823.5 - 1) * Math.pow(1 - i / n, 3.2) * (i < sr * 0.012 ? i / (sr * 0.012) : 1); } } return b; }
  /* render(AudioBuffer, settings) → Promise<AudioBuffer>; settings = NEUTRAL keys + eqCurve[9]? + tilt[9]? + loud (dB)? + bpm? */
  function render(buf, s) {
    s = Object.assign({}, NEUTRAL, s || {});
    var sr = buf.sampleRate, ch = buf.numberOfChannels, len = buf.length, i;
    var chans = [];
    for (var c = 0; c < ch; c++) chans.push(s.pitch || s.formant ? shiftChannel(buf.getChannelData(c), sr, s.pitch, s.formant) : buf.getChannelData(c));
    var tail = (s.reverb > 0.01 ? 2.2 : 0) + (s.delay > 0.01 ? 1.6 : 0), outLen = len + Math.round(Math.min(3, tail) * sr);
    var oc = new OfflineAudioContext(Math.max(1, ch), outLen, sr), src = oc.createBufferSource(), ib = oc.createBuffer(ch, len, sr);
    chans.forEach(function (d, j) { ib.getChannelData(j).set(d); });
    src.buffer = ib;
    var node = src;
    BANDS.forEach(function (f, j) {
      var g = (s.eqCurve && s.eqCurve[j] ? s.eqCurve[j] * s.eq : 0) + (s.tilt ? s.tilt[j] : 0);
      if (Math.abs(g) < 0.05) return;
      var bq = oc.createBiquadFilter(); bq.type = j === 0 ? "lowshelf" : j === BANDS.length - 1 ? "highshelf" : "peaking"; bq.frequency.value = f; bq.Q.value = 1.1; bq.gain.value = Math.max(-15, Math.min(15, g));
      node.connect(bq); node = bq;
    });
    if (s.radio > 0.01) {
      var hp = oc.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 40 + s.radio * 420; hp.Q.value = 0.9;
      var lp = oc.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 18000 * Math.pow(3000 / 18000, s.radio); lp.Q.value = 0.9;
      var pk = oc.createBiquadFilter(); pk.type = "peaking"; pk.frequency.value = 1700; pk.Q.value = 1.2; pk.gain.value = s.radio * 7;
      node.connect(hp); hp.connect(lp); lp.connect(pk); node = pk;
    }
    if (s.sat > 0.01) { var ws = oc.createWaveShaper(); ws.curve = satCurve(s.sat); ws.oversample = "2x"; var sg = oc.createGain(); sg.gain.value = 1 / (1 + s.sat * 1.5); node.connect(ws); ws.connect(sg); node = sg; }
    if (s.comp > 0.01) {
      var cp = oc.createDynamicsCompressor(); cp.threshold.value = -8 - s.comp * 30; cp.ratio.value = 1.5 + s.comp * 10; cp.knee.value = 6; cp.attack.value = 0.004; cp.release.value = 0.14;
      var mk = oc.createGain(); mk.gain.value = Math.pow(10, (s.comp * 14) / 20); node.connect(cp); cp.connect(mk); node = mk;
    }
    var out = oc.createGain(); node.connect(out);
    if (s.delay > 0.01) {
      var beat = 60 / (s.bpm || 92), dl = oc.createDelay(2); dl.delayTime.value = beat * 0.75;
      var fb = oc.createGain(); fb.gain.value = 0.3 + s.delay * 0.25; var dlp = oc.createBiquadFilter(); dlp.type = "lowpass"; dlp.frequency.value = 3200;
      var send = oc.createGain(); send.gain.value = s.delay * 0.7;
      node.connect(send); send.connect(dl); dl.connect(dlp); dlp.connect(fb); fb.connect(dl); dlp.connect(out);
    }
    if (s.reverb > 0.01) { var cv = oc.createConvolver(); cv.buffer = impulse(oc, 2.0, sr); var rs = oc.createGain(); rs.gain.value = s.reverb * 0.55; node.connect(rs); rs.connect(cv); cv.connect(out); }
    out.connect(oc.destination);
    src.start();
    return oc.startRendering().then(function (b) {
      // trim silent tail, match loudness (if a reference level is set), keep peaks under −0.5 dBFS
      var n = b.length, cc = b.numberOfChannels, end = n, thr = 0.0008;
      outer: for (end = n; end > len; end--) { for (var q = 0; q < cc; q++) if (Math.abs(b.getChannelData(q)[end - 1]) > thr) break outer; }
      var e = 0, cnt = 0, peak = 0;
      for (var q2 = 0; q2 < cc; q2++) { var d = b.getChannelData(q2); for (i = 0; i < end; i += 2) { e += d[i] * d[i]; cnt++; var a = d[i] < 0 ? -d[i] : d[i]; if (a > peak) peak = a; } }
      var g = 1;
      if (s.loud != null && isFinite(s.loud) && s.matchLoud) { var curDb = 10 * Math.log10(e / Math.max(1, cnt) + 1e-12); g = Math.pow(10, Math.max(-12, Math.min(18, s.loud - curDb)) / 20); }
      if (peak * g > 0.944) g = 0.944 / peak;
      var ob = new AudioBuffer({ numberOfChannels: cc, length: Math.max(1, end), sampleRate: sr });
      for (var q3 = 0; q3 < cc; q3++) { var src2 = b.getChannelData(q3), dst = ob.getChannelData(q3); for (i = 0; i < end; i++) dst[i] = src2[i] * g; }
      return ob;
    });
  }
  function isNeutral(s) { return !s || Object.keys(NEUTRAL).every(function (k) { return !s[k]; }) && !s.tilt; }
  window.PFVFX = { analyze: analyze, match: match, render: render, PRESETS: PRESETS, NEUTRAL: NEUTRAL, BANDS: BANDS, shiftChannel: shiftChannel, pitchOf: pitchOf, isNeutral: isNeutral };
})();
