/* DJ Psycho Fingers — AUTO MATCH between decks.
 * 1) Auto gain: integrated loudness per track (approx. LUFS: ITU-R BS.1770 K-weighting + 400 ms gated blocks, cached),
 *    deck trim set so every track lands at −14 LUFS; during blends a slow short-term loudness rider (≤ ±6 dB, ≤ 0.6 dB/s)
 *    keeps both decks equally loud.
 * 2) Key: chromagram + Krumhansl–Kessler profiles (offline, cached), shown in Camelot; KEY MATCH shifts a deck by the nearest
 *    semitone offset to a compatible key (same / relative / ±1 Camelot) through the delay-line shifter (tempo unchanged).
 * 3) Line In per deck: getUserMedia (processing off) → deck strip; live loudness rider + live chroma key; live semitone shift.
 * 4) AUTO MATCH toggle (crossfader bar) enables auto gain + key suggestions; Auto DJ key-matches incoming tracks when it's on. */
(function () {
  "use strict";
  var P = window.PFDJ; if (!P) return;
  var $ = function (id) { return document.getElementById(id); };
  var TARGET = -14, MK = "pfdj_match_v1", CK = "pfdj_match_cache_v1";
  var AM = { on: true };
  try { var sv = JSON.parse(localStorage.getItem(MK) || "null"); if (sv && sv.on === false) AM.on = false; } catch (e) { /* ignore */ }
  var cache = {}; try { cache = JSON.parse(localStorage.getItem(CK) || "{}") || {}; } catch (e) { cache = {}; }
  function savePref() { try { localStorage.setItem(MK, JSON.stringify({ on: AM.on })); } catch (e) { /* ignore */ } }
  function saveCache() {
    var ks = Object.keys(cache); if (ks.length > 600) ks.slice(0, ks.length - 600).forEach(function (k) { delete cache[k]; });
    try { localStorage.setItem(CK, JSON.stringify(cache)); } catch (e) { /* ignore */ }
  }

  /* ---------------- loudness (BS.1770-style) ---------------- */
  function kCoefs(fs) {
    var f0 = 1681.974450955533, G = 3.999843853973347, Q = 0.7071752369554196, K = Math.tan(Math.PI * f0 / fs), Vh = Math.pow(10, G / 20), Vb = Math.pow(Vh, 0.4996667741545416);
    var a0 = 1 + K / Q + K * K, s1 = { b0: (Vh + Vb * K / Q + K * K) / a0, b1: 2 * (K * K - Vh) / a0, b2: (Vh - Vb * K / Q + K * K) / a0, a1: 2 * (K * K - 1) / a0, a2: (1 - K / Q + K * K) / a0 };
    f0 = 38.13547087602444; Q = 0.5003270373238773; K = Math.tan(Math.PI * f0 / fs); a0 = 1 + K / Q + K * K;
    var s2 = { b0: 1, b1: -2, b2: 1, a1: 2 * (K * K - 1) / a0, a2: (1 - K / Q + K * K) / a0 };
    return [s1, s2];
  }
  function integratedLufs(buf) {
    var fs = buf.sampleRate, seg = Math.round(fs * 0.1), nSeg = Math.floor(buf.length / seg), cs = kCoefs(fs), ms = new Float64Array(nSeg);
    if (nSeg < 4) return null;
    for (var ch = 0; ch < Math.min(2, buf.numberOfChannels); ch++) {
      var x = buf.getChannelData(ch), st = cs.map(function () { return { x1: 0, x2: 0, y1: 0, y2: 0 }; });
      for (var s = 0, i = 0; s < nSeg; s++) {
        var acc = 0;
        for (var e = i + seg; i < e; i++) {
          var v = x[i];
          for (var k = 0; k < 2; k++) { var c = cs[k], z = st[k], y = c.b0 * v + c.b1 * z.x1 + c.b2 * z.x2 - c.a1 * z.y1 - c.a2 * z.y2; z.x2 = z.x1; z.x1 = v; z.y2 = z.y1; z.y1 = y; v = y; }
          acc += v * v;
        }
        ms[s] += acc / seg;
      }
    }
    if (buf.numberOfChannels === 1) for (var m = 0; m < nSeg; m++) ms[m] *= 2;   // mono counts as both channels
    var blocks = [];
    for (var b = 0; b + 4 <= nSeg; b++) blocks.push((ms[b] + ms[b + 1] + ms[b + 2] + ms[b + 3]) / 4);
    var L = function (z) { return -0.691 + 10 * Math.log10(z + 1e-12); };
    var abs = blocks.filter(function (z) { return L(z) > -70; }); if (!abs.length) return null;
    var mean = abs.reduce(function (a, z) { return a + z; }, 0) / abs.length, rel = L(mean) - 10;
    var gated = abs.filter(function (z) { return L(z) > rel; });
    return Math.round(L(gated.reduce(function (a, z) { return a + z; }, 0) / gated.length) * 10) / 10;
  }

  /* ---------------- key (chromagram + Krumhansl–Kessler) ---------------- */
  var MAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88], MIN = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
  var NOTES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
  var CAM_MAJ = [8, 3, 10, 5, 12, 7, 2, 9, 4, 11, 6, 1], CAM_MIN = [5, 12, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10]; // by tonic pitch class
  function camelot(k) { return k ? (k.minor ? CAM_MIN[k.pc] + "A" : CAM_MAJ[k.pc] + "B") : "—"; }
  function keyName(k) { return k ? NOTES[k.pc] + (k.minor ? "m" : "") : ""; }
  function fft(re, im) {
    var n = re.length, i, j, k, l;
    for (i = 1, j = 0; i < n; i++) { var bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { var t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (l = 2; l <= n; l <<= 1) {
      var ang = -2 * Math.PI / l, wr = Math.cos(ang), wi = Math.sin(ang);
      for (i = 0; i < n; i += l) { var cr = 1, ci = 0; for (k = 0; k < l / 2; k++) { var a = i + k, b = a + l / 2, xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr; re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi; var nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr; } }
    }
  }
  function corr(a, b) {
    var ma = 0, mb = 0, i; for (i = 0; i < 12; i++) { ma += a[i]; mb += b[i]; } ma /= 12; mb /= 12;
    var n = 0, da = 0, db = 0; for (i = 0; i < 12; i++) { var x = a[i] - ma, y = b[i] - mb; n += x * y; da += x * x; db += y * y; }
    return n / Math.sqrt(da * db + 1e-12);
  }
  function keyFromChroma(ch) {
    var best = null, second = -2;
    for (var pc = 0; pc < 12; pc++) [false, true].forEach(function (minor) {
      var prof = minor ? MIN : MAJ, rot = []; for (var i = 0; i < 12; i++) rot.push(prof[(i - pc + 12) % 12]);
      var r = corr(ch, rot);
      if (!best || r > best.r) { if (best) second = Math.max(second, best.r); best = { pc: pc, minor: minor, r: r }; } else second = Math.max(second, r);
    });
    if (!best || !isFinite(best.r)) return null;
    best.conf = Math.max(0, Math.min(1, (best.r - second) * 8 + best.r * 0.5)); best.r = Math.round(best.r * 1000) / 1000; best.conf = Math.round(best.conf * 100) / 100;
    return best;
  }
  /* bins → pitch classes, only near semitone centres (cuts smear from drums) */
  function binChroma(mag, binHz, out, lo, hi) {
    for (var k = Math.max(1, Math.ceil(lo / binHz)); k * binHz < hi && k < mag.length; k++) {
      var midi = 69 + 12 * Math.log2(k * binHz / 440), near = Math.round(midi), dev = Math.abs(midi - near);
      if (dev > 0.4) continue;
      out[((near % 12) + 12) % 12] += mag[k] * (1 - dev * 1.5);
    }
  }
  function detectKey(buf) {
    var sr = buf.sampleRate, D = Math.max(1, Math.round(sr / 11025)), srd = sr / D, N = 4096;
    var c0 = buf.getChannelData(0), c1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : c0;
    var start = Math.floor(buf.length * (buf.duration > 40 ? 0.08 : 0)), maxLen = Math.min(buf.length - start, Math.floor(150 * sr));
    var nd = Math.floor(maxLen / D), x = new Float32Array(nd);
    for (var i = 0; i < nd; i++) { var s = 0, o = start + i * D; for (var j = 0; j < D; j++) s += c0[o + j] + c1[o + j]; x[i] = s / (2 * D); }
    if (nd < N * 4) return null;
    var win = new Float32Array(N); for (i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
    var re = new Float32Array(N), im = new Float32Array(N), mag = new Float32Array(N / 2), chroma = new Float64Array(12), binHz = srd / N;
    for (var f = 0; f + N <= nd; f += N / 2) {
      for (i = 0; i < N; i++) { re[i] = x[f + i] * win[i]; im[i] = 0; }
      fft(re, im);
      var tot = 0; for (i = 0; i < N / 2; i++) { mag[i] = Math.sqrt(re[i] * re[i] + im[i] * im[i]); tot += mag[i]; }
      if (tot < 1e-3) continue;
      var fc = new Float64Array(12); binChroma(mag, binHz, fc, 65, 2100);
      var fs = 0; for (i = 0; i < 12; i++) fs += fc[i]; if (fs <= 0) continue;
      for (i = 0; i < 12; i++) chroma[i] += fc[i] / fs;                       // per-frame normalised: loud bars don't dominate
    }
    var k = keyFromChroma(Array.prototype.slice.call(chroma)); if (k) k.chroma = Array.prototype.map.call(chroma, function (v) { return Math.round(v * 100) / 100; });
    return k;
  }

  /* ---------------- per-deck analysis on load ---------------- */
  function trackKey(d) { var it = d.item || {}; return (it.libId ? "lib:" + it.libId : it.id ? "b:" + it.id : it.key ? it.key : "n:" + d.name) + "|" + (d.buf ? d.buf.duration.toFixed(1) : "0"); }
  function analyze(d) {
    if (!d.buf || d.buf.ext || !d.buf.getChannelData) { d.lufs = null; d.key = null; applyGain(d); render(d); return; }
    var ck = trackKey(d), c = cache[ck], buf = d.buf;
    if (c) { d.lufs = c.lufs; d.key = c.key; applyGain(d); render(d); return; }
    d.lufs = null; d.key = null; d.analyzing = true; render(d);
    setTimeout(function () {
      if (d.buf !== buf) return;
      var t0 = performance.now(), lufs = null, key = null;
      try { lufs = integratedLufs(buf); } catch (e) { console.warn(e); }
      d.lufs = lufs; applyGain(d); render(d);
      setTimeout(function () {
        if (d.buf !== buf) return;
        try { key = detectKey(buf); } catch (e) { console.warn(e); }
        if (key) delete key.chroma;
        d.key = key; d.analyzing = false; d.anaMs = Math.round(performance.now() - t0);
        cache[ck] = { lufs: lufs, key: key }; saveCache();
        render(d); suggest();
        P.DECKS.forEach(function (x) { if (x.pendingMatch) { x.pendingMatch = false; if (x.playing && AM.on) keyMatch(x, true); } });
      }, 20);
    }, 30);
  }
  function applyGain(d) {
    if (d.line) return;
    if (AM.on && d.lufs != null) d.autoDb = P.clamp(TARGET - d.lufs, -15, 9);
    else if (!AM.on) d.autoDb = 0;
    if (!AM.on) d.rideDb = 0;
    P.applyDeckMix(d);
  }
  P.on("loaded", function (d, item) { d.pendingMatch = false; if (d.line && !(item && item.lineKeep)) stopLine(d, true); d.rideDb = 0; analyze(d); });

  /* ---------------- key match ---------------- */
  function effKey(d) {                       // key you hear: detected (or live) key + pitch from tempo (unless keylock) + key shift
    var k = d.line ? d.liveKey : d.key; if (!k) return null;
    var st = (d.keylock || d.line ? 0 : 12 * Math.log2(P.rate(d))) + (d.keyShift || 0);
    return { pc: (((k.pc + Math.round(st)) % 12) + 12) % 12, minor: k.minor, off: st - Math.round(st) };
  }
  function camNum(k) { return k.minor ? CAM_MIN[k.pc] : CAM_MAJ[k.pc]; }
  function compatible(a, b) {
    if (!a || !b) return null;
    var na = camNum(a), nb = camNum(b);
    if (na === nb) return true;                                          // same key or relative major / minor
    var dn = Math.abs(na - nb); dn = Math.min(dn, 12 - dn);
    return a.minor === b.minor && dn === 1;                              // ±1 on the Camelot wheel
  }
  /* smallest semitone shift (−6…+6) that puts deck d in a compatible key with the other deck */
  function bestShift(d) {
    var o = P.other(d), ko = effKey(o), kd = d.line ? d.liveKey : d.key; if (!ko || !kd) return null;
    var base = (d.keylock || d.line ? 0 : Math.round(12 * Math.log2(P.rate(d)))), best = null;
    for (var s = -6; s <= 6; s++) {
      var k = { pc: (((kd.pc + base + s) % 12) + 12) % 12, minor: kd.minor };
      if (!compatible(k, ko)) continue;
      var exact = camNum(k) === camNum(ko) ? 0 : 0.5;                    // prefer same / relative over ±1
      var score = Math.abs(s) + exact;
      if (!best || score < best.score) best = { shift: s, score: score, key: k };
    }
    return best;
  }
  function keyMatch(d, auto) {
    if (d.ext) { if (!auto) P.toast("YouTube decks can't be key-matched — no access to their audio."); return false; }
    var o = P.other(d);
    if (auto && (d.analyzing || o.analyzing)) { d.pendingMatch = true; return false; }   // retried when the analysis lands
    if (!(d.key || d.liveKey) || !effKey(o)) { if (!auto) P.toast("Key match needs a detected key on both decks" + (d.analyzing || o.analyzing ? " (still analysing…)" : "") + "."); return false; }
    var b = bestShift(d);
    if (!b) { if (!auto) P.toast("No compatible key within ±6 semitones."); return false; }
    if (auto && Math.abs(b.shift) > 3) return false;                      // Auto DJ: don't push a track more than 3 semitones
    P.setKeyShift(d, b.shift);
    if (!auto || b.shift) P.toast("Deck " + d.id + " key " + (b.shift ? (b.shift > 0 ? "+" : "") + b.shift + " st → " : "already compatible: ") + camelot(b.key) + " (" + keyName(b.key) + ") · matches deck " + o.id + " " + camelot(effKey(o)) + " · tempo unchanged");
    render(d); return true;
  }

  /* ---------------- live loudness taps + rider ---------------- */
  var taps = {};
  function tap(d) {
    var ctx = P.ctx; if (!ctx || !d.n || taps[d.id]) return taps[d.id];
    var hs = ctx.createBiquadFilter(); hs.type = "highshelf"; hs.frequency.value = 1500; hs.gain.value = 4;
    var hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 38; hp.Q.value = 0.5;
    var an = ctx.createAnalyser(); an.fftSize = 2048;
    d.n.sum.connect(hs); hs.connect(hp); hp.connect(an);                  // pre-trim, pre-EQ (a bass swap doesn't fool the rider)
    taps[d.id] = { an: an, buf: new Float32Array(2048), hist: [] };
    return taps[d.id];
  }
  function shortTerm(d) {                     // ≈ short-term loudness (3 s) of the deck before trim / EQ / faders
    var t = tap(d); if (!t) return null;
    t.an.getFloatTimeDomainData(t.buf);
    var s = 0; for (var i = 0; i < t.buf.length; i++) s += t.buf[i] * t.buf[i];
    t.hist.push(s / t.buf.length); if (t.hist.length > 30) t.hist.shift();
    var m = t.hist.reduce(function (a, v) { return a + v; }, 0) / t.hist.length;
    return -0.691 + 10 * Math.log10(2 * m + 1e-12);
  }
  function live(d) { return d.line ? true : d.playing; }
  var lastTick = performance.now();
  function rider() {
    var now = performance.now(), dt = Math.min(0.5, (now - lastTick) / 1000); lastTick = now;
    if (!P.ctx) return;
    var D = P.DECKS, st = D.map(function (d) { return live(d) ? shortTerm(d) : (taps[d.id] && (taps[d.id].hist = []), null); });
    D.forEach(function (d, j) { d.stLufs = st[j]; });
    if (!AM.on) return;
    var g = P.xfGains();
    D.forEach(function (d, j) {
      if (d.line) {                                                       // live input: slow auto gain toward the target
        if (st[j] != null && st[j] > -50) { var want = P.clamp(TARGET - st[j], -12, 12), step = P.clamp(want - d.autoDb, -1 * dt, 1 * dt); if (Math.abs(step) > 0.005) { d.autoDb += step; P.applyDeckMix(d); } }
        return;
      }
    });
    var heard = D.map(function (d, j) { return live(d) && st[j] != null && st[j] > -45 && g[j] > 0.15 && d.vol > 0.1 && !d.ext; });
    var blend = heard[0] && heard[1];
    D.forEach(function (d, j) {
      if (d.line || d.ext) return;
      var r = d.rideDb || 0, nr = r;
      if (blend) {
        var L = D.map(function (x, k) { return st[k] + (x.autoDb || 0) + (x.rideDb || 0) + (x.trimDb || 0); }), avg = (L[0] + L[1]) / 2;
        nr = r + P.clamp(avg - L[j], -0.6 * dt, 0.6 * dt);                // gentle: ≤ 0.6 dB per second
      } else nr = r + P.clamp(-r, -0.3 * dt, 0.3 * dt);                    // drift back to 0 when not blending
      nr = P.clamp(nr, -6, 6);
      if (Math.abs(nr - r) > 0.002) { d.rideDb = nr; P.applyDeckMix(d); }
    });
  }

  /* ---------------- Line In ---------------- */
  function startLine(d, deviceId) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { P.toast("This browser has no audio input access."); return; }
    var ctx = P.ensureCtx(); if (!ctx) return;
    var c = { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: { ideal: 2 } };
    if (deviceId) c.deviceId = { exact: deviceId };
    navigator.mediaDevices.getUserMedia({ audio: c }).then(function (stream) {
      if (d.line) stopLine(d, true);
      if (d.playing) P.pause(d, true);
      var src = ctx.createMediaStreamSource(stream), tr = stream.getAudioTracks()[0];
      var an = ctx.createAnalyser(); an.fftSize = 8192; an.smoothingTimeConstant = 0; src.connect(an);
      src.connect(d.n.dry); src.connect(d.n.klIn);
      d.line = { stream: stream, src: src, an: an, label: (tr && tr.label || "Audio input").replace(/\s*\(.*?\)\s*$/, "").slice(0, 40), id: tr && tr.getSettings ? tr.getSettings().deviceId : "", chroma: new Float64Array(12), fbuf: new Float32Array(an.frequencyBinCount) };
      d.liveKey = null; d.autoDb = 0; d.rideDb = 0; d.keyShift = 0; P.applyKeylock(d); P.applyDeckMix(d);
      if (tr) tr.onended = function () { stopLine(d); };
      P.ui(d); P.nowPlaying(); render(d); listInputs(d);
      P.toast("Deck " + d.id + ": Line In live (" + d.line.label + ") — echo cancel / noise suppression / auto gain OFF. 🎧 Use headphones if it's a mic.");
    }).catch(function (e) { P.toast("Couldn't open the audio input (" + (e && e.name === "NotAllowedError" ? "permission denied" : e && e.message || "error") + ")."); });
  }
  function stopLine(d, quiet) {
    var L = d.line; if (!L) return;
    try { L.src.disconnect(); } catch (e) { /* ignore */ }
    L.stream.getTracks().forEach(function (t) { t.stop(); });
    d.line = null; d.liveKey = null; d.autoDb = 0; d.keyShift = 0;
    if (P.ctx) P.applyKeylock(d);
    if (d.buf) analyze(d); else P.applyDeckMix(d);
    P.ui(d); P.nowPlaying(); render(d);
    if (!quiet) P.toast("Deck " + d.id + ": Line In off");
  }
  function listInputs(d) {
    var sel = d.el.root.querySelector(".m-linesel"); if (!sel || !navigator.mediaDevices.enumerateDevices) return;
    navigator.mediaDevices.enumerateDevices().then(function (devs) {
      var ins = devs.filter(function (x) { return x.kind === "audioinput"; });
      sel.innerHTML = ins.map(function (x, i) { return '<option value="' + x.deviceId.replace(/"/g, "") + '">' + (x.label || "Input " + (i + 1)).replace(/[<>&]/g, "") + "</option>"; }).join("");
      if (d.line && d.line.id) sel.value = d.line.id;
      sel.hidden = !d.line || ins.length < 2;
    });
  }
  function liveChroma() {                        // real-time chroma → key estimate for Line In decks (decays over ~8 s)
    P.DECKS.forEach(function (d) {
      var L = d.line; if (!L || !P.ctx) return;
      L.an.getFloatFrequencyData(L.fbuf);
      var binHz = P.ctx.sampleRate / L.an.fftSize, mag = new Float32Array(L.fbuf.length), tot = 0;
      for (var i = 0; i < mag.length; i++) { mag[i] = Math.pow(10, L.fbuf[i] / 20); tot += mag[i]; }
      if (tot < 0.05) return;                                               // silence: keep the last estimate
      var fc = new Float64Array(12); binChroma(mag, binHz, fc, 65, 2100);
      var fs = 0; for (i = 0; i < 12; i++) fs += fc[i]; if (fs <= 0) return;
      for (i = 0; i < 12; i++) L.chroma[i] = L.chroma[i] * 0.97 + fc[i] / fs;
      d.liveKey = keyFromChroma(Array.prototype.slice.call(L.chroma));
    });
  }

  /* ---------------- UI ---------------- */
  function render(d) {
    var r = d.el && d.el.root.querySelector(".d-match"); if (!r) return;
    var k = d.line ? d.liveKey : d.key, ek = effKey(d), ext = !!d.ext;
    var kv = r.querySelector(".m-key");
    kv.textContent = ext ? "KEY n/a" : d.analyzing && !k ? "KEY …" : ek ? camelot(ek) + " · " + keyName(ek) + (d.line ? " (live)" : "") : d.line ? "KEY listening…" : d.buf ? "KEY ?" : "KEY —";
    kv.title = ext ? "YouTube decks can't be analysed (no audio access)" : k ? "Detected " + camelot(k) + " " + keyName(k) + (k.conf != null ? " · confidence " + Math.round(k.conf * 100) + "%" : "") + ((d.keyShift || 0) || (!d.keylock && Math.abs(P.rate(d) - 1) > 0.003) ? " · heard as " + camelot(ek) + " (pitch / key shift)" : "") : "Musical key (Camelot)";
    var sh = r.querySelector(".m-shift"); sh.textContent = (d.keyShift > 0 ? "+" : "") + (d.keyShift || 0) + " st"; sh.classList.toggle("on", !!d.keyShift);
    var ag = r.querySelector(".m-ag"), agDb = (d.autoDb || 0) + (d.rideDb || 0);
    ag.textContent = ext ? "AG n/a" : "AG " + (agDb >= 0 ? "+" : "") + agDb.toFixed(1) + " dB";
    ag.classList.toggle("off", ext || !AM.on); ag.classList.toggle("ride", Math.abs(d.rideDb || 0) > 0.1);
    ag.title = ext ? "Auto gain isn't possible on YouTube decks (no audio access)" : !AM.on ? "Auto gain is off (turn on AUTO MATCH in the crossfader bar)" :
      (d.line ? "Live input auto gain → " + TARGET + " LUFS (slow rider)" : "Track loudness " + (d.lufs != null ? d.lufs.toFixed(1) + " LUFS" : "…") + " → trim " + (d.autoDb >= 0 ? "+" : "") + (d.autoDb || 0).toFixed(1) + " dB to reach " + TARGET + " LUFS") +
      (Math.abs(d.rideDb || 0) > 0.05 ? " · blend rider " + (d.rideDb > 0 ? "+" : "") + d.rideDb.toFixed(1) + " dB" : "");
    var km = r.querySelector(".m-km"), b = AM.on && !ext ? bestShift(d) : null, comp = compatible(ek, effKey(P.other(d)));
    km.disabled = ext; km.classList.toggle("ok", comp === true); km.classList.toggle("sug", comp === false && !!b);
    km.textContent = comp === true && AM.on ? "KEY ✓" : b && AM.on && comp === false ? "KEY MATCH " + (b.shift > 0 ? "+" : "") + b.shift : "KEY MATCH";
    km.title = ext ? "YouTube decks can't be key-matched" : comp === true ? "Keys are compatible with deck " + P.other(d).id : "Shift this deck by the nearest semitones to a key compatible with deck " + P.other(d).id + " (same, relative or ±1 Camelot) — tempo unchanged";
    r.querySelectorAll(".m-st").forEach(function (x) { x.disabled = ext; });
    var lb = d.el.root.querySelector(".m-line"); if (lb) { lb.classList.toggle("on", !!d.line); lb.textContent = d.line ? "■ LINE" : "LINE IN"; }
    var sel = r.querySelector(".m-linesel"); if (sel && !d.line) sel.hidden = true;
  }
  function suggest() { P.DECKS.forEach(render); }
  function build() {
    P.DECKS.forEach(function (d) {
      var root = d.el.root, info = root.querySelector(".d-info"); if (!info || root.querySelector(".d-match")) return;
      var row = document.createElement("div"); row.className = "d-match";
      row.innerHTML = '<span class="m-key mono"></span><button type="button" class="pill small m-km">KEY MATCH</button>' +
        '<button type="button" class="pill small m-st" data-s="-1" title="Key down one semitone (tempo unchanged)">−1</button><span class="m-shift mono">0 st</span><button type="button" class="pill small m-st" data-s="1" title="Key up one semitone (tempo unchanged)">+1</button>' +
        '<span class="m-ag mono"></span><select class="m-linesel btn small" hidden aria-label="Line In device"></select>';
      info.parentNode.insertBefore(row, info.nextSibling);
      row.querySelector(".m-km").addEventListener("click", function () { P.ensureCtx(); keyMatch(d, false); });
      row.querySelectorAll(".m-st").forEach(function (b) { b.addEventListener("click", function () { P.ensureCtx(); P.setKeyShift(d, (d.keyShift || 0) + +b.dataset.s); render(d); }); });
      row.querySelector(".m-shift").addEventListener("dblclick", function () { P.setKeyShift(d, 0); render(d); });
      row.querySelector(".m-linesel").addEventListener("change", function (e) { startLine(d, e.target.value); });
      var head = root.querySelector(".deck-head"), lb = document.createElement("button");
      lb.type = "button"; lb.className = "btn small m-line"; lb.textContent = "LINE IN";
      lb.title = "Line In: play an external source (USB interface, phone / mixer line-in or a mic) through this deck's EQ, filter and fader — processing off, auto gain + live key";
      lb.addEventListener("click", function () { if (d.line) stopLine(d); else startLine(d); });
      head.insertBefore(lb, head.querySelector(".d-loadbtn"));
      render(d);
    });
    var xb = document.querySelector(".xf-btns");
    if (xb && !$("am-btn")) {
      var b = document.createElement("button"); b.type = "button"; b.id = "am-btn"; b.className = "mini automatch";
      b.title = "AUTO MATCH: auto gain (every track to " + TARGET + " LUFS + a gentle loudness rider in blends) and key-match suggestions; Auto DJ key-matches incoming tracks";
      b.addEventListener("click", function () { setOn(!AM.on); });
      xb.insertBefore(b, $("autodj-btn"));
    }
    setOn(AM.on, true);
  }
  function setOn(v, quiet) {
    AM.on = v; savePref();
    var b = $("am-btn"); if (b) { b.classList.toggle("on", v); b.textContent = v ? "AUTO MATCH ●" : "AUTO MATCH"; }
    P.DECKS.forEach(function (d) { applyGain(d); render(d); });
    if (!quiet) P.toast(v ? "AUTO MATCH on — tracks levelled to " + TARGET + " LUFS, loudness rider in blends, key suggestions on each deck" : "AUTO MATCH off — raw track levels, no rider or key suggestions");
  }
  P.on("keyshift", function () { suggest(); });
  P.on("ctx", function () { P.DECKS.forEach(tap); });
  build();
  setInterval(function () { rider(); }, 100);
  setInterval(function () { liveChroma(); suggest(); }, 250);

  window.PFMATCH = {
    get on() { return AM.on; }, setOn: setOn, keyMatch: keyMatch, bestShift: bestShift, effKey: effKey, compatible: compatible, camelot: camelot, keyName: keyName,
    integratedLufs: integratedLufs, detectKey: detectKey, startLine: function (id, dev) { startLine(P.BY[id], dev); }, stopLine: function (id) { stopLine(P.BY[id]); }, TARGET: TARGET,
    info: function () { return P.DECKS.map(function (d) { var ek = effKey(d); return { id: d.id, lufs: d.lufs, autoDb: d.autoDb, rideDb: d.rideDb || 0, st: d.stLufs, key: d.key ? camelot(d.key) + " " + keyName(d.key) : null, conf: d.key && d.key.conf, eff: ek ? camelot(ek) : null, shift: d.keyShift || 0, line: !!d.line, liveKey: d.liveKey ? camelot(d.liveKey) : null, anaMs: d.anaMs }; }); }
  };
})();
