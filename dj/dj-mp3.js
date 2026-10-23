/* DJ Psycho Fingers — MP3 RECORDER (v20261022w). Drop-in for MediaRecorder on every DJ record path (REC, Voice only,
 * Go Live show). PCM is tapped straight off the stream (no processing — the mic stays fully RAW) and encoded live to MP3
 * 320 kbps stereo in a Web Worker, so stopping is instant and every ~3 s chunk saved to IndexedDB is already valid MP3
 * (MP3 frames concatenate — crash-recovered recordings are MP3 too). */
(function () {
  "use strict";
  var KBPS = 320;
  function MP3Rec(stream, ctx) {
    this.stream = stream; this.ctx = ctx; this.state = "inactive"; this.mimeType = "audio/mpeg";
    this.ondataavailable = null; this.onstop = null; this._buf = []; this._size = 0;
  }
  MP3Rec.isSupported = function () { return !!(window.Worker && (window.AudioContext || window.webkitAudioContext)); };
  MP3Rec.prototype.start = function (slice) {
    var self = this, ctx = this.ctx; slice = slice || 3000;
    this.w = new Worker("mp3-worker.js?v=20261022w");
    this.w.postMessage({ t: "init", sr: ctx.sampleRate, kbps: KBPS });
    this.w.onmessage = function (e) {
      var d = e.data; if (d.b && d.b.length) { self._buf.push(d.b); self._size += d.b.length; }
      if (d.t === "end") { self._emit(); self.w.terminate(); self.w = null; self.state = "inactive"; if (self.onstop) self.onstop({}); }
    };
    this.src = ctx.createMediaStreamSource(this.stream);
    this.sp = ctx.createScriptProcessor(4096, 2, 2);
    this.mute = ctx.createGain(); this.mute.gain.value = 0;
    this.sp.onaudioprocess = function (ev) {
      if (self.state !== "recording") return;
      var ib = ev.inputBuffer, L = new Float32Array(ib.getChannelData(0)), R = new Float32Array(ib.numberOfChannels > 1 ? ib.getChannelData(1) : ib.getChannelData(0));
      self.w.postMessage({ t: "pcm", L: L, R: R }, [L.buffer, R.buffer]);
    };
    this.src.connect(this.sp); this.sp.connect(this.mute); this.mute.connect(ctx.destination);
    this.state = "recording";
    this.tick = setInterval(function () { self._emit(); }, slice);
  };
  MP3Rec.prototype._emit = function () {
    if (!this._size) return; var b = new Blob(this._buf, { type: "audio/mpeg" }); this._buf = []; this._size = 0;
    if (this.ondataavailable) this.ondataavailable({ data: b });
  };
  MP3Rec.prototype.requestData = function () { this._emit(); };
  MP3Rec.prototype.stop = function () {
    if (this.state !== "recording") throw new Error("not recording");
    this.state = "stopping"; clearInterval(this.tick);
    try { this.src.disconnect(); this.sp.disconnect(); this.mute.disconnect(); } catch (e) { /* ignore */ }
    this.w.postMessage({ t: "end" });
  };
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  /* DJ-Psycho-Fingers-mix-YYYYMMDD-HHMM.mp3 */
  function mp3Name(kind, t) {
    var d = new Date(t || Date.now());
    return "DJ-Psycho-Fingers-" + (kind || "mix") + "-" + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + "-" + pad(d.getHours()) + pad(d.getMinutes()) + ".mp3";
  }
  /* v20261022y: the auto-download runs after the recorder finishes (no user gesture), which Android Chrome may block.
     So it is tried, and a visible "⬇ Download MP3" button stays up for 30 s — tapping it is a real gesture and always works. */
  function save(blob, name) {
    var u = URL.createObjectURL(blob), a = document.createElement("a"); a.href = u; a.download = name; a.style.display = "none";
    document.body.appendChild(a); a.click(); setTimeout(function () { a.remove(); }, 1000);
    setTimeout(function () { URL.revokeObjectURL(u); }, 60000);
  }
  function autoSave(blob, name) {
    var X = window.PFEXPORT, c = X && X.autoCopy(blob, name);
    if (X) name = X.name(name);
    try { if (!c) save(blob, name); } catch (e) { /* ignore */ }
    var old = document.getElementById("mp3-dl-bar"); if (old) old.remove();
    var bar = document.createElement("div"); bar.id = "mp3-dl-bar"; bar.setAttribute("role", "status");
    bar.style.cssText = "position:fixed;left:50%;bottom:calc(16px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:2147481000;display:flex;gap:8px;align-items:center;background:#1e1b2e;color:#fff;border:1px solid #7c3aed;border-radius:14px;padding:8px 10px;font:600 14px system-ui;box-shadow:0 6px 24px #0008;max-width:94vw";
    var t = document.createElement("span"); t.textContent = "Saved MP3 · " + name; t.style.cssText = "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:46vw";
    var b = document.createElement("button"); b.type = "button"; b.id = "mp3-dl-btn"; b.textContent = "⬇ Export MP3"; b.style.cssText = "min-height:44px;padding:0 14px;border-radius:10px;border:0;background:#7c3aed;color:#fff;font:700 15px system-ui";
    var x = document.createElement("button"); x.type = "button"; x.textContent = "✕"; x.setAttribute("aria-label", "Close"); x.style.cssText = "min-height:44px;min-width:44px;border:0;background:transparent;color:#fff;font-size:18px";
    b.onclick = function () { if (window.PFEXPORT) window.PFEXPORT.export(blob, name); else save(blob, name); }; x.onclick = function () { bar.remove(); };
    bar.appendChild(t); bar.appendChild(b); bar.appendChild(x); document.body.appendChild(bar);
    setTimeout(function () { if (bar.parentNode) bar.remove(); }, 30000);
  }
  window.PFMP3 = { Recorder: MP3Rec, kbps: KBPS, name: mp3Name, autoSave: autoSave,
    make: function (stream, ctx) { return MP3Rec.isSupported() && ctx ? new MP3Rec(stream, ctx) : null; } };
})();
