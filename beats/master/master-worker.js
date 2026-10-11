/* Island Pin Beats · Master tab — off-main-thread post-processing for offline renders (limiter + output gain + loudness),
 * so measuring / fitting / exporting never freezes the page or the beat on a tablet. Same IPBMDSP code as the live limiter. */
self.window = self; // fx-chain.js publishes window.IPBFx
var V = (/[?&]v=([^&]+)/.exec(self.location.search) || [])[1] || "1";
importScripts("master-dsp.js?v=" + V, "../fx-chain.js?v=" + V);
self.onmessage = function (e) {
  var m = e.data, D = self.IPBMDSP, FX = self.IPBFx;
  try {
    var L = m.L, R = m.R, n = L.length;
    if (m.op === "post") {
      if (m.lim && m.lim.on) { var r = D.limitArrays(L, R, 0, m.lim.ceil, { sr: m.sr }); L = r.L; R = r.R; }
      var og = m.og; if (og !== 1) for (var i = 0; i < n; i++) { L[i] *= og; R[i] *= og; }
    }
    var lufs = FX.lufs([L, R], m.sr);
    self.postMessage({ id: m.id, ok: true, L: L, R: R, lufs: lufs }, [L.buffer, R.buffer]);
  } catch (err) { self.postMessage({ id: m.id, ok: false, err: String(err && err.message || err) }); }
};
