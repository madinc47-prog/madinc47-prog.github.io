/* Island Pin Beats — client for the speaker-mode take cleaner (vocal-clean-worker.js), shared by Beats → Record Vocals
 * and the Studio's "Clean take". Classic script: window.IPBVocalCleanClient.
 *   run(mic, L, R, sr, opts?, onProgress?(stage, 0..1), comps?) → Promise<{ out: Float32Array (sr), info, comps? }>
 *     mic = the take as recorded; L/R = the beat that was playing, sample-synced to the take (R may be null).
 *     comps (synthetic tests only): { voice, bleed, noise } are carried through the same processing for dB measurements.
 *   isHeadphones(label) · detect() → Promise<{ found, label, labels }> (enumerateDevices labels; listen for "devicechange")
 * Everything runs on the device (worker + WebAssembly); nothing is uploaded. */
(function () {
  "use strict";
  var base = (document.currentScript && document.currentScript.src) || location.href;
  var qs = /\?[^#]*/.exec(base); // carry this script's cache-buster (?v=…) over to the worker
  var WORKER_URL = new URL("vocal-clean-worker.js" + (qs ? qs[0] : ""), base).href, SR = 48000; // RNNoise works at 48 kHz
  var worker = null, seq = 0;
  function getWorker() { if (!worker) worker = new Worker(WORKER_URL, { type: "module" }); return worker; }
  function resample(arr, from, to) { // native resampling through an OfflineAudioContext
    if (!arr) return Promise.resolve(null);
    if (from === to) return Promise.resolve(arr);
    var len = Math.max(1, Math.round(arr.length * to / from));
    var oc = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, len, to);
    var b = oc.createBuffer(1, arr.length, from); b.getChannelData(0).set(arr);
    var s = oc.createBufferSource(); s.buffer = b; s.connect(oc.destination); s.start();
    return oc.startRendering().then(function (r) { return r.getChannelData(0); });
  }
  function run(mic, L, R, sr, opts, onProg, comps) {
    var id = ++seq;
    var jobs = [resample(mic, sr, SR), resample(L, sr, SR), resample(R, sr, SR)];
    if (comps) jobs.push(resample(comps.voice, sr, SR), resample(comps.bleed, sr, SR), resample(comps.noise, sr, SR));
    return Promise.all(jobs).then(function (a) {
      return new Promise(function (resolve, reject) {
        var w;
        try { w = getWorker(); } catch (e) { reject(e); return; }
        function done() { w.removeEventListener("message", onMsg); w.removeEventListener("error", onErr); }
        function onMsg(ev) {
          var m = ev.data; if (m.id !== id) return;
          if (m.type === "progress") { if (onProg) onProg(m.stage, m.p); return; }
          done();
          if (m.type === "error") reject(new Error(m.message)); else resolve(m);
        }
        function onErr(e) { done(); try { w.terminate(); } catch (er) { /* ignore */ } worker = null; reject(new Error(e.message || "worker failed to start")); }
        w.addEventListener("message", onMsg); w.addEventListener("error", onErr);
        var msg = { cmd: "clean", id: id, mic: Float32Array.from(a[0]), L: Float32Array.from(a[1]), R: a[2] ? Float32Array.from(a[2]) : null, sr: SR, opts: opts || {} };
        var tr = [msg.mic.buffer, msg.L.buffer]; if (msg.R) tr.push(msg.R.buffer);
        if (comps) { msg.comps = { voice: Float32Array.from(a[3]), bleed: Float32Array.from(a[4]), noise: Float32Array.from(a[5]) }; tr.push(msg.comps.voice.buffer, msg.comps.bleed.buffer, msg.comps.noise.buffer); }
        w.postMessage(msg, tr);
      });
    }).then(function (m) {
      if (sr === SR) return m;
      var n = mic.length, fit = function (x) { var o = new Float32Array(n); o.set(x.subarray(0, Math.min(n, x.length))); return o; };
      var keys = m.comps ? ["voice", "noise", "bleed"] : [];
      return Promise.all([resample(m.out, SR, sr)].concat(keys.map(function (k) { return resample(m.comps[k], SR, sr); }))).then(function (r) {
        m.out = fit(r[0]);
        keys.forEach(function (k, i) { m.comps[k] = fit(r[i + 1]); });
        return m;
      });
    });
  }
  // headphone guess from device labels (labels are only readable after mic permission). Phones often can't tell.
  var HP_RE = /head ?phones?|headset|ear ?buds?|earphones?|air ?pods|\bbuds\b|bluetooth|hands-?free|wired|jabra|bose|sennheiser|skullcandy|soundcore|galaxy buds|sony w[hf]-|beats (studio|solo|fit|flex)|usb[- ]?c? ?(audio|headset)/i;
  var HP_NOT = /earpiece|speakerphone|speakers?\b|built-?in|internal|hdmi|display|monitor/i;
  function isHeadphones(label) { return !!label && HP_RE.test(label) && !HP_NOT.test(label); }
  function detect() {
    var md = navigator.mediaDevices;
    if (!md || !md.enumerateDevices) return Promise.resolve({ found: false, label: "", labels: false });
    return md.enumerateDevices().then(function (list) {
      var outs = list.filter(function (d) { return d.kind === "audiooutput" && d.label; });
      var ins = list.filter(function (d) { return d.kind === "audioinput" && d.label; });
      var found = "", defOut = outs.filter(function (d) { return d.deviceId === "default"; })[0] || (outs.length === 1 ? outs[0] : null);
      if (defOut) { if (isHeadphones(defOut.label)) found = defOut.label; }                   // desktop: the default output names it
      else ins.forEach(function (d) { if (!found && isHeadphones(d.label)) found = d.label; }); // Android: a headset mic is listed only while connected
      return { found: !!found, label: found, labels: outs.length + ins.length > 0 };
    }).catch(function () { return { found: false, label: "", labels: false }; });
  }
  window.IPBVocalCleanClient = { run: run, resample: resample, isHeadphones: isHeadphones, detect: detect, workerUrl: WORKER_URL };
})();
