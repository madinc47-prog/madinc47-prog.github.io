/* DJ Psycho Fingers — turntable scratch engine (AudioWorklet).
 * Plays a deck's track at a variable SIGNED rate (forward, stopped, reverse) with cubic interpolation.
 * Modes:  "pos"  — hand on the platter: chase a target position (the platter angle) → rate = velocity
 *         "rate" — motor: glide the rate toward a target with time constant tau (spin-up, brake, rewind, release)
 * Reports its position every ~11 ms and a "settled" message when the rate reaches the target. */
class PFScratch extends AudioWorkletProcessor {
  constructor() {
    super();
    this.L = null; this.R = null; this.len = 0; this.ratio = 1;
    this.active = false; this.pos = 0; this.rate = 0; this.mode = "rate"; this.target = 0; this.tau = 0.05; this.tpos = 0;
    this.lin = -1; this.lout = -1; this.gain = 0; this.fade = 0; this.stopAt = -1; this.settled = true; this.cnt = 0;
    this.port.onmessage = (e) => this.msg(e.data);
  }
  msg(m) {
    const k = this.ratio;
    switch (m.t) {
      case "buf": this.L = m.L; this.R = m.R || m.L; this.len = this.L.length; this.ratio = m.sr / sampleRate; this.active = false; this.gain = 0; break;
      case "start":
        this.pos = m.pos * m.sr; this.ratio = m.sr / sampleRate; this.rate = m.rate || 0; this.mode = m.mode || "rate";
        this.target = m.target != null ? m.target : this.rate; this.tau = m.tau || 0.05; this.tpos = this.pos; this.active = true;
        this.fade = 1; this.stopAt = -1; this.settled = false; if (!m.keepGain) this.gain = 0; break;
      case "pos": this.mode = "pos"; this.tpos = m.pos * this.ratio * sampleRate; this.tau = m.tau || 0.012; this.settled = false; break;
      case "rate": this.mode = "rate"; this.target = m.rate; this.tau = m.tau || 0.05; this.settled = false; break;
      case "seek": this.pos = m.pos * this.ratio * sampleRate; this.tpos = this.pos; break;
      case "loop": this.lin = m.on ? m.lin * this.ratio * sampleRate : -1; this.lout = m.on ? m.lout * this.ratio * sampleRate : -1; break;
      case "stop": this.stopAt = m.at != null ? m.at : currentTime; break;
    }
    void k;
  }
  sample(ch, p) {
    const i = Math.floor(p), f = p - i, n = this.len;
    const a = ch[i - 1 < 0 ? 0 : i - 1] || 0, b = ch[i] || 0, c = ch[i + 1 < n ? i + 1 : n - 1] || 0, d = ch[i + 2 < n ? i + 2 : n - 1] || 0;
    // Catmull-Rom (Int16 → float)
    const v = b + 0.5 * f * (c - a + f * (2 * a - 5 * b + 4 * c - d + f * (3 * (b - c) + d - a)));
    return v * (1 / 32768);
  }
  process(inputs, outputs) {
    const out = outputs[0], oL = out[0], oR = out[1] || out[0], N = oL.length;
    if (!this.active || !this.L) { oL.fill(0); if (oR !== oL) oR.fill(0); return true; }
    const sr = sampleRate, aR = 1 - Math.exp(-1 / (sr * 0.004)), k = this.ratio;
    let fadeOut = this.stopAt >= 0 && currentTime >= this.stopAt;
    let desired = this.target;
    if (this.mode === "pos") desired = Math.max(-14, Math.min(14, (this.tpos - this.pos) / (this.tau * sr * k)));
    const aT = this.mode === "rate" ? 1 - Math.exp(-1 / (sr * Math.max(0.002, this.tau))) : aR;
    for (let j = 0; j < N; j++) {
      this.rate += (desired - this.rate) * aT;
      this.pos += this.rate * k;
      if (this.lout > this.lin && this.lin >= 0 && this.pos >= this.lout) this.pos = this.lin + (this.pos - this.lin) % (this.lout - this.lin);
      if (this.pos < 0) { this.pos = 0; if (this.rate < 0) this.rate = 0; }
      if (this.pos > this.len - 2) { this.pos = this.len - 2; if (this.rate > 0) this.rate = 0; }
      // gain: quick fade-in, fade-out on stop, and soften near-zero speeds (a real stylus gets quiet when the record stops)
      const tg = fadeOut ? 0 : 1;
      this.gain += (tg - this.gain) * 0.006;
      const sp = Math.abs(this.rate), sg = sp < 0.04 ? sp / 0.04 : 1;
      const g = this.gain * sg;
      oL[j] = this.sample(this.L, this.pos) * g;
      oR[j] = this.R === this.L ? oL[j] : this.sample(this.R, this.pos) * g;
    }
    if (fadeOut && this.gain < 0.002) { this.active = false; this.stopAt = -1; this.port.postMessage({ t: "stopped", pos: this.pos / (k * sr), time: currentTime }); return true; }
    if (this.mode === "rate" && !this.settled && Math.abs(this.rate - this.target) < (this.target === 0 ? 0.003 : 0.0006)) {
      this.rate = this.target; this.settled = true;
      this.port.postMessage({ t: "settled", pos: this.pos / (k * sr), rate: this.rate, time: currentTime + N / sr });
    }
    if (++this.cnt % 4 === 0) this.port.postMessage({ t: "pos", pos: this.pos / (k * sr), rate: this.rate, time: currentTime + N / sr });
    return true;
  }
}
registerProcessor("pf-scratch", PFScratch);
