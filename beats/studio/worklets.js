/* Island Pin Beats Studio worklets: noise gate + mic capture */
class IPBGate extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: "on", defaultValue: 0, minValue: 0, maxValue: 1 }, { name: "thr", defaultValue: -50, minValue: -100, maxValue: 0 },
      { name: "rel", defaultValue: 0.12, minValue: 0.01, maxValue: 2 }];
  }
  constructor() { super(); this.env = 0; this.g = 1; this.hold = 0; }
  process(inputs, outputs, P) {
    const inp = inputs[0], out = outputs[0];
    if (!inp || !inp.length) return true;
    const on = P.on[0] > 0.5, thr = Math.pow(10, P.thr[0] / 20), rel = P.rel[0];
    const aE = Math.exp(-1 / (0.002 * sampleRate)), rE = Math.exp(-1 / (0.03 * sampleRate));
    const aG = Math.exp(-1 / (0.002 * sampleRate)), rG = Math.exp(-1 / (rel * sampleRate)), holdN = Math.round(0.05 * sampleRate);
    const n = inp[0].length;
    for (let i = 0; i < n; i++) {
      let pk = 0; for (let c = 0; c < inp.length; c++) { const a = Math.abs(inp[c][i]); if (a > pk) pk = a; }
      this.env = pk > this.env ? aE * this.env + (1 - aE) * pk : rE * this.env + (1 - rE) * pk;
      let target = 1;
      if (on) { if (this.env >= thr) { this.hold = holdN; target = 1; } else if (this.hold > 0) { this.hold--; target = 1; } else target = 0; }
      this.g = target > this.g ? aG * this.g + (1 - aG) * target : rG * this.g + (1 - rG) * target;
      for (let c = 0; c < out.length; c++) out[c][i] = (inp[c] || inp[0])[i] * this.g;
    }
    return true;
  }
}
registerProcessor("ipb-gate", IPBGate);

class IPBRec extends AudioWorkletProcessor {
  constructor() { super(); this.on = false; this.port.onmessage = e => { this.on = !!e.data.on; if (!this.on) this.port.postMessage({ done: true }); }; }
  process(inputs) {
    const inp = inputs[0];
    if (this.on && inp && inp.length) this.port.postMessage({ ch: inp.map(a => a.slice(0)), t: currentTime });
    return true;
  }
}
registerProcessor("ipb-rec", IPBRec);
