/* Island Pin Beats · Master tab — realtime true-peak limiter (the same IPBMDSP.Limiter the export uses, so what you
 * hear is what you export). Load master-dsp.js first (audioWorklet.addModule), then this file. */
(function () {
  "use strict";
  var D = globalThis.IPBMDSP;
  class TPLimiter extends AudioWorkletProcessor {
    static get parameterDescriptors() {
      return [{ name: "ceil", defaultValue: -1, minValue: -12, maxValue: 0, automationRate: "k-rate" },
        { name: "on", defaultValue: 1, minValue: 0, maxValue: 1, automationRate: "k-rate" }];
    }
    constructor() { super(); this.lim = new D.Limiter(sampleRate, { lookMs: 5, relMs: 80 }); this.n = 0; this.minG = 1; }
    process(inputs, outputs, params) {
      var inp = inputs[0], out = outputs[0]; if (!out || !out.length) return true;
      var oL = out[0], oR = out[1] || out[0], n = oL.length;
      var iL = inp && inp[0] ? inp[0] : null, iR = inp && inp[1] ? inp[1] : iL;
      var on = params.on[0] > 0.5, c = D.dbToLin(params.ceil[0] - D.LIM_MARGIN_DB), lim = this.lim;
      for (var i = 0; i < n; i++) {
        var l = iL ? iL[i] : 0, r = iR ? iR[i] : 0;
        lim.frame(l, r, on ? c : 1e9); // off: same latency, no gain change (A/B stays time-aligned)
        oL[i] = lim.oL; if (out[1]) oR[i] = lim.oR;
      }
      this.n += n;
      if (this.n >= sampleRate / 10) { this.n = 0; this.port.postMessage({ gr: D.linToDb(lim.minG) }); lim.minG = 1; }
      return true;
    }
  }
  registerProcessor("ipb-tplimiter", TPLimiter);
})();
