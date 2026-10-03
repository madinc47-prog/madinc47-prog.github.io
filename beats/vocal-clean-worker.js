/* Island Pin Beats — speaker-mode take cleaner (module Web Worker, so the page never freezes).
 * Pipeline: beat removal (vocal-clean-dsp.js: latency/drift alignment → adaptive echo canceller → residual echo
 * suppression) → 70 Hz high-pass → RNNoise (Xiph RNNoise, BSD-3-Clause; WASM build by Jitsi, Apache-2.0,
 * vendor/rnnoise) → voice-activity gate driven by RNNoise's own VAD.
 * Input must be 48 kHz (the page resamples if the AudioContext runs at another rate). */
import "./vocal-clean-dsp.js?v=20261003u"; // bump together with the ?v= in index.html
const D = self.IPBVocalCleanDSP;
// two RNNoise builds from @jitsi/rnnoise-wasm 0.2.1: "v2" = RNNoise 0.2 model (rnnoise-sync.js, WASM inlined, ~1.9 MB, ~1.3 MB gzip; default — measured better),
// "v1" = RNNoise 0.1 model (rnnoise.js + rnnoise.wasm, 124 KB). Loaded on first use only.
const rnnP = {};
function loadRnn(build) {
  build = build === "v1" ? "v1" : "v2";
  if (!rnnP[build]) {
    const url = build === "v1" ? "./vendor/rnnoise/rnnoise.js" : "./vendor/rnnoise/rnnoise-sync.js";
    rnnP[build] = import(url).then((m) => m.default({ locateFile: (p) => new URL("./vendor/rnnoise/" + p, import.meta.url).href }));
  }
  return rnnP[build];
}
const FRAME = 480;
// RNNoise output lags its input: 1 frame (480 samples) for the 0.1 model, 2 frames for 0.2 (it adds a look-ahead).
// Measured by cross-correlating input and output (tests/vc/lag.js); without this the cleaned vocal sits 10 ms late.
const RNN_LAG = { v1: 1, v2: 2 };
function rnnoise(mod, x, lag, onProg) {
  const n = x.length, frames = Math.ceil(n / FRAME) + lag, out = new Float32Array(n), vad = new Float32Array(frames);
  const st = mod._rnnoise_create(0), ptr = mod._malloc(FRAME * 4);
  for (let f = 0; f < frames; f++) {
    let heap = mod.HEAPF32, b = ptr >> 2;
    for (let i = 0; i < FRAME; i++) { const j = f * FRAME + i; heap[b + i] = j < n ? x[j] * 32768 : 0; }
    vad[f] = mod._rnnoise_process_frame(st, ptr, ptr);
    heap = mod.HEAPF32;
    // write the output back `lag` frames earlier so it lines up with the input (and the beat)
    for (let i = 0; i < FRAME; i++) { const j = (f - lag) * FRAME + i; if (j >= 0 && j < n) out[j] = heap[b + i] / 32768; }
    if (onProg && (f & 511) === 0) onProg(f / frames);
  }
  mod._free(ptr); mod._rnnoise_destroy(st);
  // the VAD value returned with output frame f describes input frames f-lag..f: take the max over that span
  const nf = frames - lag, v2 = new Float32Array(nf);
  for (let f = 0; f < nf; f++) { let m = 0; for (let k = 0; k <= lag; k++) m = Math.max(m, vad[f + k]); v2[f] = m; }
  return { out, vad: v2 };
}
self.onmessage = async (ev) => {
  const m = ev.data;
  if (m.cmd === "warm") { try { await loadRnn(m.rnn); self.postMessage({ type: "warm", ok: true }); } catch (e) { self.postMessage({ type: "warm", ok: false, message: String(e && e.message || e) }); } return; }
  if (m.cmd !== "clean") return;
  const id = m.id, o = m.opts || {}, sr = m.sr, T0 = performance.now();
  const W = { align: [0, 0.06], aec: [0.06, 0.62], res: [0.62, 0.78], denoise: [0.78, 0.97], gate: [0.97, 1] };
  let lastPost = 0;
  const prog = (stage, p) => {
    const w = W[stage] || [0, 1], v = w[0] + (w[1] - w[0]) * Math.max(0, Math.min(1, p || 0)), now = performance.now();
    if (now - lastPost > 120 || p === 0) { lastPost = now; self.postMessage({ type: "progress", id, stage, p: v }); }
  };
  try {
    // default RNNoise 0.2; if that build can't load (old browser, low memory) fall back to the small 0.1 build
    let rnnUsed = o.rnn === "v1" ? "v1" : "v2";
    const rnnReady = loadRnn(rnnUsed).catch((err) => { if (rnnUsed === "v1") throw err; rnnUsed = "v1"; return loadRnn("v1"); });
    rnnReady.catch(() => {});
    const comps = m.comps || null;
    const core = D.cleanCore(m.mic, m.L, m.R, sr, o, prog, comps);
    const info = core.info; let x = core.out, cv = core.comps;
    D.highpass(x, sr, 70);
    if (cv) { D.highpass(cv.voice, sr, 70); D.highpass(cv.noise, sr, 70); if (cv.bleed) D.highpass(cv.bleed, sr, 70); }
    prog("denoise", 0);
    let t0 = performance.now(), vad = null;
    if (o.denoise !== false && sr === 48000) {
      const mod = await rnnReady;
      const r = rnnoise(mod, x, RNN_LAG[rnnUsed], (p) => prog("denoise", p));
      if (cv) { const c = D.transferGains(x, r.out, [cv.voice, cv.noise, cv.bleed || new Float32Array(x.length)]); cv.voice = c[0]; cv.noise = c[1]; cv.bleed = c[2]; }
      // blend a little of the pre-RNNoise signal back in where speech is detected: keeps consonants and breaths natural
      const mix = o.rnnMix != null ? o.rnnMix : 1;
      if (mix < 1) for (let i = 0; i < x.length; i++) x[i] = mix * r.out[i] + (1 - mix) * x[i]; else x = r.out;
      vad = r.vad; info.rnnoise = rnnUsed === "v1" ? "0.1" : "0.2";
    } else info.rnnoise = false;
    info.denoiseMs = Math.round(performance.now() - t0);
    prog("gate", 0);
    if (vad && o.gate !== false) {
      const g = D.vadGate(x.length, vad, FRAME, sr, o.gateOpts);
      for (let i = 0; i < x.length; i++) x[i] *= g.gain[i];
      if (cv) for (const k of ["voice", "noise", "bleed"]) { const a = cv[k]; if (a) for (let i = 0; i < a.length; i++) a[i] *= g.gain[i]; }
      info.voicedPct = Math.round(g.open * 100);
    }
    // floor in the parts without voice (RNNoise VAD < 0.15): raw take vs cleaned → what the app shows as "beat + noise removed"
    if (vad) {
      let pi = 0, po = 0, cnt = 0;
      for (let f = 0; f < vad.length; f++) {
        if (vad[f] >= 0.15) continue;
        const a = f * FRAME, b = Math.min(x.length, a + FRAME);
        for (let i = a; i < b; i++) { pi += m.mic[i] * m.mic[i]; po += x[i] * x[i]; } cnt += b - a;
      }
      if (cnt > sr * 0.3) {
        const dbv = (v) => 10 * Math.log10(Math.max(1e-16, v / cnt));
        info.floorInDb = +dbv(pi).toFixed(1); info.floorOutDb = +Math.max(-120, dbv(po)).toFixed(1); info.gapSec = +(cnt / sr).toFixed(1);
      }
    }
    let pk = 0; for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > pk) pk = a; }
    info.peak = pk; info.totalMs = Math.round(performance.now() - T0);
    const transfer = [x.buffer]; if (cv) for (const k in cv) if (cv[k]) transfer.push(cv[k].buffer);
    self.postMessage({ type: "done", id, out: x, info, comps: cv }, transfer);
  } catch (e) {
    self.postMessage({ type: "error", id, message: String(e && e.message || e) });
  }
};
