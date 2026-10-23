/* DJ Psycho Fingers — MP3 encoder worker (v20261022w). lamejs vendored locally (lame.min.js, LGPL), no CDN. */
importScripts("lame.min.js?v=20261022w");
var enc = null;
function i16(f) { var o = new Int16Array(f.length); for (var i = 0; i < f.length; i++) { var s = f[i] > 1 ? 1 : f[i] < -1 ? -1 : f[i]; o[i] = s < 0 ? s * 0x8000 : s * 0x7fff; } return o; }
onmessage = function (e) {
  var d = e.data;
  if (d.t === "init") { enc = new lamejs.Mp3Encoder(2, d.sr, d.kbps); return; }
  if (!enc) return;
  if (d.t === "pcm") { var b = enc.encodeBuffer(i16(d.L), i16(d.R)); if (b.length) { var u = new Uint8Array(b); postMessage({ t: "mp3", b: u }, [u.buffer]); } return; }
  if (d.t === "end") { var f = enc.flush(), u2 = new Uint8Array(f); enc = null; postMessage({ t: "end", b: u2 }, [u2.buffer]); }
};
