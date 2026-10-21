/* Island Pin Beats · Multitrack: raw PCM capture (no MediaRecorder, no processing). One node per armed track (mono).
   Records the frames [from, to) of the AudioContext clock exactly, so takes line up sample-accurately with the transport. */
class MTRec extends AudioWorkletProcessor {
  constructor() {
    super();
    this.on = false; this.from = 0; this.to = Infinity; this.buf = new Float32Array(16384); this.n = 0; this.first = -1;
    this.port.onmessage = (e) => {
      const m = e.data;
      if (m.cmd === "arm") { this.on = true; this.from = m.from; this.to = m.to == null ? Infinity : m.to; this.n = 0; this.first = -1; }
      else if (m.cmd === "stop") { this.flush(); this.on = false; this.port.postMessage({ type: "done", first: this.first }); }
    };
  }
  flush() { if (this.n) { const c = this.buf.slice(0, this.n); this.port.postMessage({ type: "chunk", data: c }, [c.buffer]); this.n = 0; } }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!this.on || !ch) return true;
    const f0 = currentFrame, len = ch.length;
    let a = Math.max(0, this.from - f0), b = Math.min(len, this.to - f0);
    if (b > a) {
      if (this.first < 0) this.first = f0 + a;
      for (let i = a; i < b; i++) { this.buf[this.n++] = ch[i]; if (this.n === this.buf.length) this.flush(); }
    }
    if (f0 + len >= this.to) { this.flush(); this.on = false; this.port.postMessage({ type: "done", first: this.first }); }
    return true;
  }
}
registerProcessor("mt-rec", MTRec);
