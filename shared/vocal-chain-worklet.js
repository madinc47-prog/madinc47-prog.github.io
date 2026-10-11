/* IslePin "Pro vocal" chain: AudioWorklet processors (dependency-free, MIT-style, part of this repo).
 *   vc-dyn : slow leveler (rides the level like an engineer) → 3.5:1 compressor with auto make-up →
 *            split-band de-esser (5–9 kHz side-chain) → gentle noise gate → look-ahead soft limiter (≈ −1 dBTP).
 *   The gate (downward expander: −18 dB, hysteresis, 180 ms hold, 220 ms release) DECIDES on the incoming signal but
 *   ACTS after the compressor, so the compressor's make-up gain can't lift the room noise back up between lines.
 *   Its threshold calibrates itself from the room noise (first ~0.4 s, then the quietest moment of the last 2 s) and always
 *   opens at least 12 dB under the voice, so word tails and breaths survive.
 * Used by shared/vocal-chain.js for both live input and offline renders (same code path). */
"use strict";
const DB = x => 20 * Math.log10(x + 1e-12), LIN = d => Math.pow(10, d / 20);
const tc = (s, sr) => Math.exp(-1 / Math.max(1, s * sr));

// RBJ biquad (direct form I, per-sample)
class BQ {
  constructor(type, f, q, sr) {
    const w = 2 * Math.PI * f / sr, c = Math.cos(w), s = Math.sin(w), al = s / (2 * q);
    let b0, b1, b2, a0, a1, a2;
    if (type === "hp") { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; }
    else { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; }
    a0 = 1 + al; a1 = -2 * c; a2 = 1 - al;
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
    this.x1 = this.x2 = this.y1 = this.y2 = 0;
  }
  run(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y; return y;
  }
}

class VCDyn extends AudioWorkletProcessor {
  constructor(o) {
    super();
    const p = (o && o.processorOptions) || {}, sr = sampleRate, light = p.profile === "interface";
    this.light = light;
    // leveler (built-in mic only): rides the voice to ~−20 dBFS RMS, slowly, never in the pauses
    this.lvTarget = -20; this.lvEst = p.levelDb != null ? p.levelDb : -26; this.lvGain = this.lvTarget - this.lvEst;
    this.lvE = 0; this.lvA = tc(0.3, sr);
    // compressor
    this.thr = light ? -16 : -24; this.ratio = light ? 2 : 3.5; this.knee = 6;
    this.cA = tc(light ? 0.015 : 0.010, sr); this.cR = tc(light ? 0.15 : 0.12, sr);
    this.cEnv = -90;
    const over = (light ? -14 : -18) - this.thr;                  // typical level over threshold → auto make-up
    this.makeup = Math.max(0, over * (1 - 1 / this.ratio)) + (light ? 0 : 2);
    // de-esser: side-chain 5–9 kHz vs full band; reduces only the band above 5 kHz
    this.dsOn = !light;
    this.sHP = new BQ("hp", 5000, 0.707, sr); this.sLP = new BQ("lp", Math.min(9000, sr * 0.45), 0.707, sr);
    // Linkwitz-Riley 4th-order split at 4.5 kHz: low + high sum flat, so turning the high band down is a clean cut
    this.xL1 = new BQ("lp", 4500, 0.7071, sr); this.xL2 = new BQ("lp", 4500, 0.7071, sr); this.xH1 = new BQ("hp", 4500, 0.7071, sr); this.xH2 = new BQ("hp", 4500, 0.7071, sr);
    this.sEnv = 0; this.fEnv = 0; this.sA = tc(0.0008, sr); this.sR = tc(0.06, sr); this.dsG = 1; this.dsRel = tc(0.04, sr); this.dsAtt = tc(0.001, sr);
    this.dsMax = p.deessMaxDb != null ? p.deessMaxDb : 10;
    // limiter: 1.5 ms look-ahead, ceiling −1.5 dBFS sample / ≈ −1 dBTP (mid-point inter-sample check)
    this.ceil = LIN(p.ceilingDb != null ? p.ceilingDb : -1.5);
    this.LA = Math.max(8, Math.round(0.0015 * sr)); this.dl = new Float32Array(this.LA); this.req = new Float32Array(this.LA); this.w = 0;
    this.lG = 1; this.lRel = tc(0.08, sr); this.lAtt = 1 - Math.exp(-4 / this.LA); this.p1 = 0; this.p2 = 0; this.p3 = 0;
    // gate (built-in mic only)
    this.gOn = !light && p.gate !== false;
    this.range = LIN(p.rangeDb != null ? p.rangeDb : -18);
    this.openAbove = p.openAboveDb != null ? p.openAboveDb : 10; this.closeAbove = p.closeAboveDb != null ? p.closeAboveDb : 5;
    this.holdN = Math.round((p.holdMs != null ? p.holdMs : 180) / 1000 * sr);
    this.gA = tc((p.attackMs != null ? p.attackMs : 3) / 1000, sr); this.gR = tc((p.releaseMs != null ? p.releaseMs : 220) / 1000, sr);
    this.gEA = tc(0.010, sr); this.gEnv = 0; this.gG = this.gOn ? this.range : 1; this.open = false; this.hold = 0;
    this.floor = p.floorDb != null ? p.floorDb : null;
    this.calibN = Math.round((p.calibMs != null ? p.calibMs : 400) / 1000 * sr); this.seen = 0;
    this.hist = new Float32Array(Math.ceil(2 * sr / 128)).fill(0); this.hw = 0; this.bS = null;
    this.voice = p.levelDb != null ? p.levelDb : -30;
    this.bypass = false; this.grMax = 0; this.dsMaxSeen = 0;
    this.port.onmessage = e => { if (e.data && "bypass" in e.data) this.bypass = !!e.data.bypass; if (e.data && e.data.stats) { this.port.postMessage({ floorDb: this.floor, voiceDb: this.voice, levelDb: this.lvEst, grMax: this.grMax, deessMax: this.dsMaxSeen }); } };
  }
  process(inputs, outputs) {
    const out = outputs[0][0]; if (!out) return true;
    const x = inputs[0] && inputs[0][0], n = out.length, sr = sampleRate;
    if (!x) { out.fill(0); return true; }
    if (this.bypass) { out.set(x); for (let c = 1; c < outputs[0].length; c++) outputs[0][c].set(out); return true; }
    const thr = this.thr, ratio = this.ratio, knee = this.knee, slope = 1 - 1 / ratio, ceil = this.ceil;
    const LA = this.LA, dl = this.dl, req = this.req;
    let e2 = 0; for (let i = 0; i < n; i++) e2 += x[i] * x[i];
    const bdb = 10 * Math.log10(e2 / n + 1e-14);
    let thO2 = 0, thC2 = 0;
    if (this.gOn) { // room-noise floor = quietest moment of the last 2 s (+3 dB), so it follows the room even mid-verse
      this.bS = this.bS == null ? bdb : this.bS + (bdb - this.bS) * 0.5;
      this.hist[this.hw] = this.bS; this.hw = (this.hw + 1) % this.hist.length; this.seen += n;
      if (this.seen >= this.calibN) {
        let m = 0; for (let k = 0; k < this.hist.length; k++) if (this.hist[k] < m) m = this.hist[k];
        const est = m + 3;
        this.floor = this.floor == null ? est : est < this.floor ? est : Math.min(est, this.floor + 0.5 * n / sr * 4);
      }
      if (bdb > this.voice - 12) this.voice += (bdb - this.voice) * (bdb > this.voice ? 0.02 : 0.005);
      let fl = this.floor == null ? -70 : Math.max(-90, this.floor);
      fl = Math.min(fl, this.voice - 12 - this.openAbove);
      thO2 = LIN(fl + this.openAbove) ** 2; thC2 = LIN(fl + this.closeAbove) ** 2;
    }
    // leveler: block RMS (0.3 s smoothing), adapts only while the voice is present
    if (!this.light) {
      const a = Math.pow(this.lvA, n); this.lvE = a * this.lvE + (1 - a) * (e2 / n);
      const d = 10 * Math.log10(this.lvE + 1e-14);
      if (this.gOn ? this.open && d > -70 : d > this.lvEst - 12 && d > -65) {
        const k = n / sr / 0.8; this.lvEst += (d - this.lvEst) * Math.min(1, k * (d > this.lvEst ? 1 : 0.7));
      }
      const want = Math.max(-6, Math.min(24, this.lvTarget - this.lvEst));
      this.lvGain += (want - this.lvGain) * Math.min(1, n / sr / 0.5);
    }
    const lv = this.light ? 1 : LIN(this.lvGain), mk = LIN(this.makeup);
    for (let i = 0; i < n; i++) {
      let s = x[i];
      if (this.gOn) {
        this.gEnv = this.gEA * this.gEnv + (1 - this.gEA) * s * s;
        if (this.gEnv > thO2) { this.open = true; this.hold = this.holdN; }
        else if (this.gEnv < thC2) { if (this.hold > 0) this.hold--; else this.open = false; }
        else if (this.open) this.hold = this.holdN;
        const gt = this.open ? 1 : this.range;
        this.gG = gt > this.gG ? this.gA * this.gG + (1 - this.gA) * gt : this.gR * this.gG + (1 - this.gR) * gt;
      }
      s *= lv;
      // compressor (peak-ish detector in dB, soft knee)
      const lvl = DB(Math.abs(s));
      this.cEnv = lvl > this.cEnv ? this.cA * this.cEnv + (1 - this.cA) * lvl : this.cR * this.cEnv + (1 - this.cR) * lvl;
      const ov = this.cEnv - thr;
      let gr = ov <= -knee / 2 ? 0 : ov >= knee / 2 ? ov * slope : slope * (ov + knee / 2) * (ov + knee / 2) / (2 * knee);
      if (gr > this.grMax) this.grMax = gr;
      s *= LIN(-gr) * mk;
      // de-esser
      if (this.dsOn) {
        const sc = this.sLP.run(this.sHP.run(s)), lo = this.xL2.run(this.xL1.run(s)), hi = this.xH2.run(this.xH1.run(s));
        const s2 = sc * sc, f2 = s * s;
        this.sEnv = s2 > this.sEnv ? this.sA * this.sEnv + (1 - this.sA) * s2 : this.sR * this.sEnv + (1 - this.sR) * s2;
        this.fEnv = f2 > this.fEnv ? this.sA * this.fEnv + (1 - this.sA) * f2 : this.sR * this.fEnv + (1 - this.sR) * f2;
        const rel = 10 * Math.log10((this.sEnv + 1e-12) / (this.fEnv + 1e-12)), abs = 10 * Math.log10(this.sEnv + 1e-14);
        // speech keeps 5–9 kHz ~15–25 dB under the full band; an "s"/"sh" pushes it to within ~12 dB → up to 10 dB off the top band
        let red = abs > -45 ? Math.min(this.dsMax, Math.max(0, rel + 12) * 1.5) : 0;
        if (red > this.dsMaxSeen) this.dsMaxSeen = red;
        const tg = LIN(-red);
        this.dsG = tg < this.dsG ? this.dsAtt * this.dsG + (1 - this.dsAtt) * tg : this.dsRel * this.dsG + (1 - this.dsRel) * tg;
        s = lo + hi * this.dsG;
      }
      if (this.gOn) s *= this.gG;
      // limiter: required gain for this sample (incl. a mid-point inter-sample estimate), look-ahead window min
      const mid = Math.abs(0.5625 * (this.p1 + this.p2) - 0.0625 * (s + this.p3)); // 4-point half-sample (inter-sample) estimate
      this.p3 = this.p2; this.p2 = this.p1; this.p1 = s;
      const pk = Math.max(Math.abs(s), mid);
      const r = pk > ceil ? ceil / pk : 1;
      dl[this.w] = s; req[this.w] = r; this.w = (this.w + 1) % LA;
      let m = 1; for (let k = 0; k < LA; k++) if (req[k] < m) m = req[k];
      this.lG = m < this.lG ? this.lG + (m - this.lG) * this.lAtt : this.lRel * this.lG + (1 - this.lRel) * m;
      let y = dl[this.w] * this.lG;                               // oldest sample = LA samples late
      // soft safety: anything still over the ceiling is rounded off, not clipped
      const ay = Math.abs(y);
      if (ay > ceil * 0.97) { const t = ceil * 0.97, e = ay - t, c = ceil * 0.03; y = Math.sign(y) * (t + c * Math.tanh(e / c)); }
      out[i] = y;
    }
    for (let c = 1; c < outputs[0].length; c++) outputs[0][c].set(out);
    return true;
  }
}
registerProcessor("vc-dyn", VCDyn);
