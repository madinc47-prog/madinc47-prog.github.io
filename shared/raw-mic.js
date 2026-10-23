/* RawMic — the Voice Over studio mic chain, shared by the whole suite (v20261023).
 * Every audio getUserMedia call on a page that loads this file is forced to the exact VO constraints:
 *   echoCancellation/noiseSuppression/autoGainControl false, goog* (EC/AGC/NS/high-pass) false,
 *   sampleRate ideal 48000, sampleSize 16, latency 0, channelCount ideal 1 unless the app asks for more (USB mixer L/R).
 * If the app didn't pick a device, it prefers a headset/wired/USB/Bluetooth mic by name (built-in fallback),
 * as a soft preference so it never fails. Nothing is processed on the input: no gain, filters or denoise.
 * Load it first, as a classic <script>. API: RawMic.constraints(deviceId, channels), RawMic.pickDevice(), RawMic.open(deviceId).
 */
(function (root) {
  "use strict";
  if (root.RawMic) return;
  var SR = 48000, HEAD = /head|wired|usb|bluetooth|earbud|ear/i;
  function constraints(id, ch) {
    var a = { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: { ideal: ch || 1 }, sampleRate: { ideal: SR }, sampleSize: 16, latency: 0 };
    if (id) a.deviceId = { exact: id };
    a.googEchoCancellation = false; a.googAutoGainControl = false; a.googNoiseSuppression = false; a.googHighpassFilter = false;
    return a;
  }
  var md = root.navigator && navigator.mediaDevices;
  var headId = "";
  function pickDevice() {
    if (!md || !md.enumerateDevices) return Promise.resolve("");
    return md.enumerateDevices().then(function (ds) {
      var ins = ds.filter(function (d) { return d.kind === "audioinput"; });
      var h = ins.filter(function (d) { return HEAD.test(d.label) && d.deviceId !== "default" && d.deviceId !== "communications"; })[0];
      headId = h ? h.deviceId : ""; return headId || (ins[0] ? ins[0].deviceId : "");
    }).catch(function () { return ""; });
  }
  function rawify(a) {
    var src = (a && typeof a === "object") ? a : {};
    var ch = src.channelCount; ch = typeof ch === "number" ? ch : ch && (ch.exact || ch.ideal || ch.min);
    var out = constraints("", ch && ch > 1 ? ch : 1);
    if (src.deviceId) out.deviceId = src.deviceId;
    else if (src.groupId) out.groupId = src.groupId;
    else if (headId) out.deviceId = { ideal: headId };
    return out;
  }
  if (md && md.getUserMedia && !md.__rawMic) {
    var gum = md.getUserMedia.bind(md);
    md.getUserMedia = function (c) {
      if (!c || !c.audio) return gum(c);
      var n = {}; for (var k in c) n[k] = c[k];
      n.audio = rawify(c.audio);
      return gum(n).catch(function (e) {
        if (e && (e.name === "OverconstrainedError" || e.name === "NotFoundError" || e.name === "NotReadableError")) { var m = {}; for (var j in n) m[j] = n[j]; m.audio = constraints("", 1); return gum(m); }
        throw e;
      }).then(function (st) { pickDevice(); return st; });
    };
    md.__rawMic = true;
    pickDevice();
    if (md.addEventListener) md.addEventListener("devicechange", pickDevice);
  }
  root.RawMic = { constraints: constraints, pickDevice: pickDevice, open: function (id) { return md.getUserMedia({ audio: constraints(id), video: false }); }, SR: SR, version: "20261023" };
})(window);
