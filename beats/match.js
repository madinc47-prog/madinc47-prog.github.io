/* Island Pin Beats: "Match to beat" client (Beats + Studio). Heavy DSP runs in match-worker.js; results are cached. */
(function () {
  "use strict";
  var V = (document.currentScript && /[?&]v=([^&]+)/.exec(document.currentScript.src) || [])[1] || "1";
  var base = document.currentScript ? document.currentScript.src.replace(/[^/]*$/, "") : "";
  var W = null, seq = 0, waits = {};
  function worker() {
    if (W) return W;
    try { W = new Worker(base + "match-worker.js?v=" + V); W.onmessage = function (e) { var w = waits[e.data.id]; if (!w) return; delete waits[e.data.id]; if (e.data.ok) w.res(e.data.r); else w.rej(new Error(e.data.err)); }; }
    catch (e) { W = null; }
    return W;
  }
  function call(msg, transfer) {
    var w = worker();
    if (!w) return Promise.reject(new Error("no worker"));
    msg.id = ++seq;
    return new Promise(function (res, rej) { waits[msg.id] = { res: res, rej: rej }; w.postMessage(msg, transfer || []); });
  }
  /* stretched copy of an AudioBuffer (cached per buffer + factor). Resolves to an AudioBuffer on context c */
  var sCache = typeof WeakMap === "function" ? new WeakMap() : null;
  function stretchBuffer(c, buf, factor) {
    factor = Math.round(factor * 10000) / 10000;
    if (Math.abs(factor - 1) < 0.002) return Promise.resolve(buf);
    var bag = sCache && sCache.get(buf); if (!bag && sCache) { bag = {}; sCache.set(buf, bag); }
    if (bag && bag[factor]) return bag[factor];
    var chs = []; for (var i = 0; i < buf.numberOfChannels; i++) chs.push(new Float32Array(buf.getChannelData(i)));
    var p = call({ op: "stretch", chs: chs, sr: buf.sampleRate, factor: factor }, chs.map(function (a) { return a.buffer; })).then(function (out) {
      var b = c.createBuffer(out.length, out[0].length, buf.sampleRate);
      out.forEach(function (a, k) { b.getChannelData(k).set(a); });
      p.done = b; return b;
    });
    if (bag) bag[factor] = p;
    p.catch(function () { if (bag) delete bag[factor]; });
    return p;
  }
  function readyStretch(buf, factor) { // synchronous: the stretched buffer if it is ready, else null
    factor = Math.round(factor * 10000) / 10000;
    if (Math.abs(factor - 1) < 0.002) return buf;
    var bag = sCache && sCache.get(buf), p = bag && bag[factor];
    return p && p.done ? p.done : null;
  }
  /* vocal timing tighten (Float32Array mono → { out, info }) */
  function tighten(Vx, sr, grid, strength) {
    var copy = new Float32Array(Vx);
    return call({ op: "tighten", V: copy, sr: sr, grid: grid, strength: strength }, [copy.buffer]);
  }
  window.IPBMatch = { stretchBuffer: stretchBuffer, readyStretch: readyStretch, tighten: tighten };
})();
