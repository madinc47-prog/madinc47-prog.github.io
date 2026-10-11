/* IsleSing — typed lyrics → a draft vocal that raps (or sings) on the beat, 100% free and on-device.
 * Reusable on any page (no DOM, no app state): <script src="/isle-voice/sing.js"></script> → window.IsleSing
 *
 *   IsleSing.load(onProgress)                         lazy-loads Kokoro-82M (kokoro-js, Apache-2.0) in a Web Worker
 *   IsleSing.draftVocal({ lines, bpm, bars, firstBar, mode: 'rap'|'sing', voice, keyNum, minor, prog, onProgress })
 *       → Promise<{ audio: Float32Array (mono), sr, placed: [{ line, bar, syllables }] }>
 *       One line per bar. Each line is spoken by the TTS, its syllable nuclei are found (energy peaks) and the line is
 *       time-warped (WSOLA) so every syllable lands on the 8th/16th-note grid of its bar — a rap cadence.
 *       'sing' also bends the pitch of each syllable onto a melody (pentatonic, chord tones on first/last syllable).
 *   IsleSing.align(ref, x, sr)    → lag in samples (x is late by lag) via envelope cross-correlation
 *   IsleSing.shift(x, lag, len)   → x moved earlier by lag, cut/padded to len
 *   IsleSing.mix(instL, instR, vocal, sr, opts) → Promise<[L, R]>  vocal leveled over the beat, short plate, glue comp
 *   IsleSing.warp / nuclei / f0Track / syllables — building blocks
 * Honest note: this is a DRAFT voice (a stock TTS voice). Voice conversion (RVC) then re-voices it as the user.
 */
(function (root) {
  "use strict";
  var here = (function () { try { return document.currentScript.src; } catch (e) { return location.href; } })();
  var WORKER_URL = new URL("kokoro-worker.js?v=1", here).href;
  var MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";
  var VOICES = [
    { id: "am_fenrir", label: "Deep male" }, { id: "am_michael", label: "Warm male" },
    { id: "am_puck", label: "Bright male" }, { id: "af_heart", label: "Female" }
  ];
  var TSR = 24000; // working rate (Kokoro's native rate)

  /* ---------- Kokoro in a Web Worker ---------- */
  var W = { worker: null, seq: 0, calls: new Map(), files: {}, ready: null, onProgress: null };
  function worker() {
    if (W.worker) return W.worker;
    W.worker = new Worker(WORKER_URL, { type: "module" });
    W.worker.onmessage = function (e) {
      var m = e.data || {};
      if (m.type === "progress") {
        W.files[m.file] = [m.loaded, m.total];
        var a = [0, 0]; Object.keys(W.files).forEach(function (k) { a[0] += W.files[k][0]; a[1] += W.files[k][1]; });
        if (W.onProgress && a[1]) W.onProgress(a[0] / a[1], a[1]);
        return;
      }
      var c = W.calls.get(m.id); if (!c) return;
      W.calls.delete(m.id); clearTimeout(c.to);
      if (m.ok) c.res(m); else c.rej(new Error(m.error || "voice engine failed"));
    };
    W.worker.onerror = function (e) {
      W.calls.forEach(function (c) { clearTimeout(c.to); c.rej(new Error("voice engine crashed: " + (e.message || "worker error"))); });
      W.calls.clear(); try { W.worker.terminate(); } catch (_) {} W.worker = null; W.ready = null;
    };
    return W.worker;
  }
  function call(msg, ms) {
    return new Promise(function (res, rej) {
      var w; try { w = worker(); } catch (e) { rej(e); return; }
      var id = ++W.seq, to = setTimeout(function () { W.calls.delete(id); rej(new Error("voice engine timed out")); }, ms);
      W.calls.set(id, { res: res, rej: rej, to: to });
      msg.id = id; msg.model = MODEL; w.postMessage(msg);
    });
  }
  function load(onProgress) {
    if (onProgress) W.onProgress = onProgress;
    if (typeof Worker === "undefined") return Promise.reject(new Error("This browser cannot run the on-device voice."));
    if (!W.ready) { W.ready = call({ type: "load" }, 15 * 60e3); W.ready.catch(function () { W.ready = null; }); }
    return W.ready;
  }
  function speak(text, o) {
    o = o || {};
    return load().then(function () { return call({ type: "gen", text: text, voice: o.voice || "am_fenrir", speed: o.speed || 1 }, 180e3); })
      .then(function (m) { return { audio: m.audio, sr: m.sr }; });
  }

  /* ---------- small DSP helpers ---------- */
  function syllables(word) {
    var w = String(word).toLowerCase().replace(/[^a-z']/g, "");
    if (!w) return 0;
    var g = w.match(/[aeiouy]+/g), n = g ? g.length : 1;
    if (n > 1 && /[^aeiou]e$/.test(w) && !/le$/.test(w)) n--;
    return Math.max(1, n);
  }
  function lineSyllables(line) { return String(line).split(/\s+/).reduce(function (s, w) { return s + syllables(w); }, 0); }
  function resampleLinear(x, from, to) {
    if (from === to) return x;
    var n = Math.floor(x.length * to / from), y = new Float32Array(n), r = from / to;
    for (var i = 0; i < n; i++) { var p = i * r, k = p | 0, f = p - k; y[i] = (x[k] || 0) * (1 - f) + (x[k + 1] || 0) * f; }
    return y;
  }
  function resampleHQ(x, from, to) {
    var OAC = root.OfflineAudioContext || root.webkitOfflineAudioContext;
    if (!OAC || from === to) return Promise.resolve(resampleLinear(x, from, to));
    var n = Math.max(1, Math.ceil(x.length * to / from)), c = new OAC(1, n, to), b = c.createBuffer(1, x.length, from);
    b.getChannelData(0).set(x);
    var s = c.createBufferSource(); s.buffer = b; s.connect(c.destination); s.start(0);
    return c.startRendering().then(function (r) { return new Float32Array(r.getChannelData(0)); });
  }
  function frameRms(x, sr, hopSec) {
    var hop = Math.max(1, Math.round(sr * hopSec)), n = Math.floor(x.length / hop), env = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      var e = 0, a = i * hop, b = Math.min(x.length, a + 2 * hop);
      for (var j = a; j < b; j++) e += x[j] * x[j];
      env[i] = Math.sqrt(e / Math.max(1, b - a));
    }
    return { env: env, hop: hop };
  }
  function trimSilence(x, sr) {
    var f = frameRms(x, sr, 0.01), env = f.env, mx = 0, i;
    for (i = 0; i < env.length; i++) if (env[i] > mx) mx = env[i];
    var thr = mx * 0.04, a = 0, b = env.length - 1;
    while (a < env.length && env[a] < thr) a++;
    while (b > a && env[b] < thr) b--;
    var s = Math.max(0, (a - 2) * f.hop), e = Math.min(x.length, (b + 4) * f.hop);
    return x.subarray(s, Math.max(s + 1, e));
  }
  /** syllable nuclei: smoothed 10 ms energy peaks, ≥ 85 ms apart, with a real dip between neighbours */
  function nuclei(x, sr) {
    var f = frameRms(x, sr, 0.01), env = f.env, n = env.length, sm = new Float32Array(n), i, mx = 0;
    for (var pass = 0; pass < 2; pass++) {
      var src = pass ? sm.slice() : env;
      for (i = 0; i < n; i++) sm[i] = ((src[i - 1] || src[i]) + 2 * src[i] + (src[i + 1] || src[i])) / 4;
    }
    for (i = 0; i < n; i++) if (sm[i] > mx) mx = sm[i];
    var thr = mx * 0.16, peaks = [];
    for (i = 1; i < n - 1; i++) {
      if (sm[i] < thr || sm[i] < sm[i - 1] || sm[i] < sm[i + 1]) continue;
      if (peaks.length) {
        var p = peaks[peaks.length - 1], lo = Infinity;
        for (var j = p; j <= i; j++) if (sm[j] < lo) lo = sm[j];
        var close = (i - p) * 0.01 < 0.085, shallow = lo > 0.8 * Math.min(sm[p], sm[i]);
        if (close || shallow) { if (sm[i] > sm[p]) peaks[peaks.length - 1] = i; continue; }
      }
      peaks.push(i);
    }
    return peaks.map(function (k) { return (k * f.hop + f.hop) / sr; });
  }
  /** YIN-lite pitch track at 10 ms hops (Hz, 0 = unvoiced) */
  function f0Track(x, sr) {
    var d = resampleLinear(x, sr, 12000), fs = 12000, N = 360, hop = 120, minL = 30, maxL = 171;
    var frames = Math.max(0, Math.floor((d.length - N - maxL) / hop)), out = new Float32Array(frames), df = new Float32Array(maxL + 1);
    var rmsAll = 0; for (var q = 0; q < d.length; q++) rmsAll += d[q] * d[q]; rmsAll = Math.sqrt(rmsAll / Math.max(1, d.length));
    for (var fi = 0; fi < frames; fi++) {
      var o = fi * hop, e = 0, i, t;
      for (i = 0; i < N; i++) e += d[o + i] * d[o + i];
      if (Math.sqrt(e / N) < rmsAll * 0.35) { out[fi] = 0; continue; }
      var run = 0, best = -1, bestV = 1;
      for (t = 1; t <= maxL; t++) {
        var s = 0;
        for (i = 0; i < N; i += 2) { var v = d[o + i] - d[o + i + t]; s += v * v; }
        run += s; df[t] = run ? s * t / run : 1;
        if (t >= minL && df[t] < 0.18) { while (t < maxL && df[t + 1] < df[t]) { t++; var s2 = 0; for (i = 0; i < N; i += 2) { var v2 = d[o + i] - d[o + i + t]; s2 += v2 * v2; } run += s2; df[t] = s2 * t / run; } best = t; bestV = df[t]; break; }
      }
      out[fi] = best > 0 && bestV < 0.3 ? fs / best : 0;
    }
    return { hz: out, hopSec: hop / fs };
  }

  /** WSOLA-style granular warp: output time t (s) reads source time map(t), pitch-scaled by ratio(t). */
  function warp(x, sr, outLen, map, ratio) {
    var N = Math.round(sr * 0.04) & ~1, hop = N >> 2, tol = Math.round(sr * 0.006);
    var win = new Float32Array(N); for (var i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
    var out = new Float32Array(outLen + N), ws = new Float32Array(outLen + N), g = new Float32Array(N);
    var prevP = null, prevR = 1, cmpN = hop * 2;
    function rd(p) { var k = Math.floor(p), f = p - k; return (x[k] || 0) * (1 - f) + (x[k + 1] || 0) * f; }
    for (var d = 0; d < outLen; d += hop) {
      var tc = (d + N / 2) / sr, r = ratio ? ratio(tc) : 1;
      var target = map(tc) * sr - (N / 2) * r, best = target;
      if (prevP !== null) {
        var nat = prevP + hop * prevR, bestC = -Infinity;
        for (var c = -tol; c <= tol; c += 2) {
          var p0 = target + c, acc = 0;
          for (var k = 0; k < cmpN; k += 3) acc += rd(p0 + k * r) * rd(nat + k * prevR);
          if (acc > bestC) { bestC = acc; best = p0; }
        }
      }
      for (var j = 0; j < N; j++) { g[j] = rd(best + j * r) * win[j]; out[d + j] += g[j]; ws[d + j] += win[j]; }
      prevP = best; prevR = r;
    }
    var y = new Float32Array(outLen);
    for (var z = 0; z < outLen; z++) y[z] = ws[z] > 1e-3 ? out[z] / ws[z] : 0;
    return y;
  }
  function pwl(xs, ys) { // piecewise-linear map
    return function (t) {
      if (t <= xs[0]) return ys[0] + (t - xs[0]) * (ys[1] - ys[0]) / Math.max(1e-6, xs[1] - xs[0]);
      for (var i = 1; i < xs.length; i++) if (t <= xs[i]) return ys[i - 1] + (t - xs[i - 1]) * (ys[i] - ys[i - 1]) / Math.max(1e-6, xs[i] - xs[i - 1]);
      var n = xs.length - 1; return ys[n] + (t - xs[n]);
    };
  }
  function hashStr(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rngFrom(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  /** n melody notes (MIDI) for one bar: pentatonic walk in a male range, chord tones on first & last syllable */
  function melodyFor(n, bar, o, seed) {
    var key = o.keyNum || 0, minor = o.minor !== false, prog = o.prog || [[0, minor ? "m" : "M"]];
    var ch = prog[bar % prog.length], pcs = (ch[1] === "m" ? [0, 3, 7] : [0, 4, 7]).map(function (iv) { return (key + ch[0] + iv) % 12; });
    var pen = minor ? [0, 3, 5, 7, 10] : [0, 2, 4, 7, 9], pool = [];
    for (var m = 45; m <= 62; m++) if (pen.indexOf(((m - key) % 12 + 12) % 12) !== -1) pool.push(m);
    var rng = rngFrom(seed), idx = Math.floor(pool.length / 2), out = [];
    for (var s = 0; s < n; s++) {
      var mv = [-2, -1, -1, 0, 0, 1, 1, 2];
      idx = Math.max(0, Math.min(pool.length - 1, idx + mv[Math.floor(rng() * mv.length)]));
      var midi = pool[idx];
      if (s === 0 || s === n - 1) {
        var bd = 99; pool.forEach(function (pm, pi) { if (pcs.indexOf(pm % 12) !== -1 && Math.abs(pm - midi) < bd) { bd = Math.abs(pm - midi); midi = pm; idx = pi; } });
      }
      out.push(midi);
    }
    return out;
  }

  /** One spoken line → warped onto its bar. Returns Float32Array of one bar (+ small spill) at TSR. */
  function placeLine(x, sr, bar, o) {
    var sd = 60 / o.bpm / 4, barSec = 16 * sd, sing = o.mode === "sing";
    x = trimSilence(x, sr);
    var srcEnd = x.length / sr, nu = nuclei(x, sr);
    if (!nu.length) nu = [Math.min(0.08, srcEnd / 2)];
    var n = nu.length, stepLen = n <= 7 ? 2 : n <= 14 ? 1 : 14 / n, LEAD = 0.035;
    var dn = nu.map(function (_, k) { return k * stepLen * sd + LEAD; });
    var head = Math.min(nu[0], 0.12), xs = [], ys = [];
    xs.push(Math.max(0, dn[0] - head)); ys.push(nu[0] - head);
    for (var k = 0; k < n; k++) { xs.push(dn[k]); ys.push(nu[k]); }
    var tailSrc = srcEnd - nu[n - 1], room = barSec - 0.06 - dn[n - 1];
    var tailDst = sing ? Math.max(0.08, Math.min(room, Math.max(tailSrc, stepLen * sd * 2.5))) : Math.max(0.05, Math.min(room, tailSrc * 1.05));
    xs.push(dn[n - 1] + tailDst); ys.push(srcEnd);
    for (var q = 1; q < xs.length; q++) if (xs[q] <= xs[q - 1]) xs[q] = xs[q - 1] + 0.005;
    var map = pwl(xs, ys), outLen = Math.ceil((xs[xs.length - 1] + 0.02) * sr), ratio = null;
    if (sing) {
      var mel = melodyFor(n, bar, o, hashStr(o.line + "|" + bar)), f0 = f0Track(x, sr), last = 1, smooth = 1;
      ratio = function (t) {
        var k = 0; while (k + 1 < n && t >= dn[k + 1] - 0.03) k++;
        var target = 440 * Math.pow(2, (mel[k] - 69) / 12), fi = Math.round(map(t) / f0.hopSec), hz = f0.hz[fi] || 0;
        if (hz > 0) last = Math.max(0.5, Math.min(2, target / hz));
        smooth += (last - smooth) * 0.35; return smooth;
      };
      o.melody = mel;
    }
    var y = warp(x, sr, outLen, map, ratio), fade = Math.round(0.01 * sr);
    for (var i = 0; i < fade && i < y.length; i++) { y[i] *= i / fade; y[y.length - 1 - i] *= i / fade; }
    return { audio: y, syllables: n, start: xs[0] };
  }

  /** whole draft vocal: one lyric line per bar, starting at bar `firstBar` (default 1 → one bar of beat first) */
  function draftVocal(o) {
    var lines = (o.lines || []).map(function (l) { return String(l).trim(); }).filter(Boolean);
    var sd = 60 / o.bpm / 4, barSec = 16 * sd, first = o.firstBar == null ? 1 : o.firstBar, outSr = o.sr || 44100;
    var total = new Float32Array(Math.ceil(o.bars * barSec * TSR) + TSR), placed = [];
    var prog = o.onProgress || function () {};
    return load(function (f, bytes) { prog("load", f, bytes); }).then(function () {
      return lines.reduce(function (p, line, i) {
        return p.then(function () {
          var bar = first + i;
          if (bar >= o.bars) return;
          prog("line", i / lines.length, i + 1, lines.length);
          return speak(line, { voice: o.voice, speed: o.mode === "sing" ? 0.95 : 1.1 }).then(function (s) {
            var x = resampleLinear(s.audio instanceof Float32Array ? s.audio : new Float32Array(s.audio), s.sr, TSR);
            var lo = { bpm: o.bpm, mode: o.mode, keyNum: o.keyNum, minor: o.minor, prog: o.prog, line: line };
            var r = placeLine(x, TSR, bar, lo), at = Math.round(bar * barSec * TSR);
            for (var j = 0; j < r.audio.length && at + j < total.length; j++) total[at + j] += r.audio[j];
            placed.push({ line: line, bar: bar, syllables: r.syllables, melody: lo.melody || null });
          });
        });
      }, Promise.resolve());
    }).then(function () {
      prog("line", 1, lines.length, lines.length);
      return resampleHQ(total.subarray(0, Math.ceil(o.bars * barSec * TSR)), TSR, outSr);
    }).then(function (y) {
      var pk = 0; for (var i = 0; i < y.length; i++) { var a = Math.abs(y[i]); if (a > pk) pk = a; }
      if (pk > 1e-6) for (i = 0; i < y.length; i++) y[i] *= 0.8 / pk;
      return { audio: y, sr: outSr, placed: placed };
    });
  }

  /* ---------- alignment + mix ---------- */
  function envAt(x, sr, rate) {
    var hop = Math.max(1, Math.round(sr / rate)), n = Math.floor(x.length / hop), e = new Float32Array(n), m = 0, i;
    for (i = 0; i < n; i++) { var s = 0; for (var j = i * hop, b = j + hop; j < b; j++) s += Math.abs(x[j]); e[i] = s / hop; m += e[i]; }
    m /= Math.max(1, n); for (i = 0; i < n; i++) e[i] -= m;
    return e;
  }
  function xcorr(a, b, lo, hi) {
    var best = 0, bv = -Infinity;
    for (var L = lo; L <= hi; L++) {
      var s = 0; for (var i = 0; i < a.length; i++) { var j = i + L; if (j >= 0 && j < b.length) s += a[i] * b[j]; }
      if (s > bv) { bv = s; best = L; }
    }
    return best;
  }
  /** lag (samples) by which x is late relative to ref; searches ±maxSec */
  function align(ref, x, sr, maxSec) {
    maxSec = maxSec || 3;
    var c = xcorr(envAt(ref, sr, 100), envAt(x, sr, 100), -Math.round(maxSec * 100), Math.round(maxSec * 100));
    var f = xcorr(envAt(ref, sr, 1000), envAt(x, sr, 1000), c * 10 - 15, c * 10 + 15);
    return Math.round(f * sr / 1000);
  }
  function shift(x, lag, len) {
    var y = new Float32Array(len);
    for (var i = 0; i < len; i++) { var j = i + lag; y[i] = j >= 0 && j < x.length ? x[j] : 0; }
    return y;
  }
  function activeRms(x) {
    var hop = 2048, v = [];
    for (var i = 0; i + hop <= x.length; i += hop) { var s = 0; for (var j = i; j < i + hop; j++) s += x[j] * x[j]; v.push(Math.sqrt(s / hop)); }
    v.sort(function (a, b) { return a - b; });
    var top = v.slice(Math.floor(v.length * 0.5)); return top.length ? top.reduce(function (a, b) { return a + b; }, 0) / top.length : 0;
  }
  function mix(L, R, vocal, sr, opts) {
    opts = opts || {};
    var OAC = root.OfflineAudioContext || root.webkitOfflineAudioContext, n = L.length;
    var c = new OAC(2, n, sr), ib = c.createBuffer(2, n, sr), vb = c.createBuffer(1, n, sr);
    ib.getChannelData(0).set(L); ib.getChannelData(1).set(R);
    var v = vocal.length > n ? vocal.subarray(0, n) : vocal; vb.getChannelData(0).set(v);
    var ri = 0.5 * (activeRms(L) + activeRms(R)), rv = activeRms(v) || 1e-4;
    var vg = Math.min(8, Math.pow(10, (opts.vocalDb == null ? 1.5 : opts.vocalDb) / 20) * ri / rv);
    var comp = c.createDynamicsCompressor(); comp.threshold.value = -10; comp.ratio.value = 2.5; comp.attack.value = 0.01; comp.release.value = 0.15;
    comp.connect(c.destination);
    var is = c.createBufferSource(); is.buffer = ib; var ig = c.createGain(); ig.gain.value = 0.8; is.connect(ig); ig.connect(comp);
    var vs = c.createBufferSource(); vs.buffer = vb; var g = c.createGain(); g.gain.value = vg;
    var hp = c.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 90; vs.connect(hp); hp.connect(g); g.connect(comp);
    var len = Math.floor(sr * 1.3), ir = c.createBuffer(2, len, sr);
    for (var ch = 0; ch < 2; ch++) { var d = ir.getChannelData(ch); for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
    var cv = c.createConvolver(); cv.buffer = ir; var send = c.createGain(); send.gain.value = opts.verb == null ? 0.12 : opts.verb;
    var pre = c.createDelay(0.1); pre.delayTime.value = 0.025; g.connect(pre); pre.connect(send); send.connect(cv); cv.connect(comp);
    is.start(0); vs.start(0);
    return c.startRendering().then(function (b) {
      var o0 = new Float32Array(b.getChannelData(0)), o1 = new Float32Array(b.getChannelData(1)), pk = 0, k;
      for (k = 0; k < n; k++) pk = Math.max(pk, Math.abs(o0[k]), Math.abs(o1[k]));
      var gg = pk > 1e-6 ? 0.89 / pk : 1;
      for (k = 0; k < n; k++) { o0[k] *= gg; o1[k] *= gg; }
      return [o0, o1];
    });
  }

  root.IsleSing = {
    load: load, speak: speak, draftVocal: draftVocal, placeLine: placeLine, align: align, shift: shift, mix: mix,
    warp: warp, nuclei: nuclei, f0Track: f0Track, trimSilence: trimSilence, syllables: syllables, lineSyllables: lineSyllables,
    melodyFor: melodyFor, resample: resampleHQ, VOICES: VOICES, MODEL: MODEL, version: "1.0"
  };
})(typeof window !== "undefined" ? window : self);
