/* Island Pin Beats Studio: Waveform Edit view (Cool Edit-style destructive edits on a clip's audio) */
(function () {
  "use strict";
  var S = window.IPBS;
  /* ---- pure buffer operations: each returns a NEW AudioBuffer (sources stay immutable for undo) ---- */
  function slice(buf, a, b) {
    var out = S.makeBuffer(buf.numberOfChannels, b - a, buf.sampleRate);
    for (var c = 0; c < buf.numberOfChannels; c++) out.getChannelData(c).set(buf.getChannelData(c).subarray(a, b));
    return out;
  }
  function remove(buf, a, b) {
    var out = S.makeBuffer(buf.numberOfChannels, buf.length - (b - a), buf.sampleRate);
    for (var c = 0; c < buf.numberOfChannels; c++) { var d = buf.getChannelData(c), o = out.getChannelData(c); o.set(d.subarray(0, a)); o.set(d.subarray(b), a); }
    return out;
  }
  function insert(buf, at, clip, replaceTo) {
    var b = replaceTo == null ? at : replaceTo, n = buf.length - (b - at) + clip.length;
    var out = S.makeBuffer(buf.numberOfChannels, n, buf.sampleRate);
    for (var c = 0; c < buf.numberOfChannels; c++) {
      var d = buf.getChannelData(c), k = clip.getChannelData(Math.min(c, clip.numberOfChannels - 1)), o = out.getChannelData(c);
      o.set(d.subarray(0, at)); o.set(k, at); o.set(d.subarray(b), at + clip.length);
    }
    return out;
  }
  function mapRange(buf, a, b, fn) {
    var out = slice(buf, 0, buf.length);
    for (var c = 0; c < out.numberOfChannels; c++) fn(out.getChannelData(c), a, b);
    return out;
  }
  function peakOf(buf, a, b) { var pk = 0; for (var c = 0; c < buf.numberOfChannels; c++) { var d = buf.getChannelData(c); for (var i = a; i < b; i++) { var v = Math.abs(d[i]); if (v > pk) pk = v; } } return pk; }
  var OPS = {
    silence: function (buf, a, b) { return mapRange(buf, a, b, function (d) { d.fill(0, a, b); }); },
    amplify: function (buf, a, b, dB) { var g = S.db(dB); return mapRange(buf, a, b, function (d) { for (var i = a; i < b; i++) d[i] *= g; }); },
    normalize: function (buf, a, b, target) { var pk = peakOf(buf, a, b); if (pk < 1e-6) return null; var g = S.db(target == null ? -1 : target) / pk; return mapRange(buf, a, b, function (d) { for (var i = a; i < b; i++) d[i] *= g; }); },
    fadeIn: function (buf, a, b) { var n = Math.max(1, b - a); return mapRange(buf, a, b, function (d) { for (var i = a; i < b; i++) d[i] *= (i - a) / n; }); },
    fadeOut: function (buf, a, b) { var n = Math.max(1, b - a); return mapRange(buf, a, b, function (d) { for (var i = a; i < b; i++) d[i] *= (b - i) / n; }); },
    reverse: function (buf, a, b) { return mapRange(buf, a, b, function (d) { Array.prototype.reverse.call(d.subarray(a, b)); }); },
    trim: function (buf, a, b) { return slice(buf, a, b); },
    remove: remove, slice: slice, insert: insert, peakOf: peakOf
  };

  /* ---- editor widget ---- */
  function WaveEditor(canvas, opt) {
    this.cv = canvas; this.opt = opt || {}; this.buf = null; this.sel = { a: 0, b: 0 }; this.view = { start: 0, spp: 256 }; this.play = null;
    var me = this, drag = null;
    function sampleAt(x) { var r = me.cv.getBoundingClientRect(); return Math.round(S.clamp(me.view.start + (x - r.left) * me.view.spp, 0, me.buf ? me.buf.length : 0)); }
    canvas.addEventListener("pointerdown", function (e) {
      if (!me.buf) return;
      canvas.setPointerCapture(e.pointerId);
      var s = sampleAt(e.clientX);
      if (e.shiftKey) { var keep = Math.abs(s - me.sel.a) > Math.abs(s - me.sel.b) ? me.sel.a : me.sel.b; drag = { anchor: keep }; me.setSel(keep, s); }
      else { drag = { anchor: s }; me.setSel(s, s); }
    });
    canvas.addEventListener("pointermove", function (e) { if (drag) me.setSel(drag.anchor, sampleAt(e.clientX)); });
    canvas.addEventListener("pointerup", function () { drag = null; });
    canvas.addEventListener("wheel", function (e) {
      if (!me.buf) return;
      e.preventDefault();
      if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) > Math.abs(e.deltaX)) me.zoom(e.deltaY < 0 ? 0.8 : 1.25, sampleAt(e.clientX));
      else me.scroll(e.deltaX * me.view.spp);
    }, { passive: false });
    window.addEventListener("resize", function () { me.draw(); });
  }
  WaveEditor.prototype.load = function (buf, keepView) {
    this.buf = buf;
    if (!keepView) { this.sel = { a: 0, b: 0 }; this.fit(); }
    else { this.sel.a = Math.min(this.sel.a, buf.length); this.sel.b = Math.min(this.sel.b, buf.length); this.clampView(); }
    this.draw();
  };
  WaveEditor.prototype.width = function () { return Math.max(100, this.cv.clientWidth); };
  WaveEditor.prototype.fit = function () { if (!this.buf) return; this.view.start = 0; this.view.spp = Math.max(1, this.buf.length / this.width()); this.draw(); };
  WaveEditor.prototype.clampView = function () {
    if (!this.buf) return;
    this.view.spp = S.clamp(this.view.spp, 0.05, Math.max(1, this.buf.length / this.width()));
    this.view.start = S.clamp(this.view.start, 0, Math.max(0, this.buf.length - this.width() * this.view.spp));
  };
  WaveEditor.prototype.zoom = function (f, about) {
    if (!this.buf) return;
    if (about == null) about = this.sel.b > this.sel.a ? (this.sel.a + this.sel.b) / 2 : this.sel.a;
    var px = (about - this.view.start) / this.view.spp;
    this.view.spp *= f; this.clampView();
    this.view.start = about - px * this.view.spp; this.clampView(); this.draw();
  };
  WaveEditor.prototype.zoomSel = function () {
    if (!this.buf || this.sel.b - this.sel.a < 16) return;
    this.view.spp = (this.sel.b - this.sel.a) / this.width() * 1.1; this.clampView();
    this.view.start = this.sel.a - (this.sel.b - this.sel.a) * 0.05; this.clampView(); this.draw();
  };
  WaveEditor.prototype.scroll = function (ds) { this.view.start += ds; this.clampView(); this.draw(); };
  WaveEditor.prototype.setSel = function (a, b) {
    this.sel.a = Math.min(a, b); this.sel.b = Math.max(a, b); this.draw();
    if (this.opt.onSel) this.opt.onSel(this.sel);
  };
  WaveEditor.prototype.hasSel = function () { return this.sel.b - this.sel.a > 0; };
  WaveEditor.prototype.draw = function () {
    var cv = this.cv, dpr = window.devicePixelRatio || 1, w = this.width(), h = Math.max(80, cv.clientHeight);
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    var g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = "#0e1118"; g.fillRect(0, 0, w, h);
    if (!this.buf) { g.fillStyle = "#8a93a8"; g.font = "14px Inter, system-ui, sans-serif"; g.fillText("Double-click a clip in Multitrack to edit its waveform here.", 16, h / 2); return; }
    var buf = this.buf, v = this.view, sr = buf.sampleRate, rulerH = 20, chs = buf.numberOfChannels, laneH = (h - rulerH) / chs;
    // selection
    var sx = (this.sel.a - v.start) / v.spp, ex = (this.sel.b - v.start) / v.spp;
    if (this.hasSel()) { g.fillStyle = "rgba(34,211,238,.18)"; g.fillRect(sx, rulerH, ex - sx, h - rulerH); }
    // waveform
    for (var c = 0; c < chs; c++) {
      var d = buf.getChannelData(c), mid = rulerH + laneH * c + laneH / 2, amp = laneH / 2 - 4;
      g.strokeStyle = "#262d3d"; g.beginPath(); g.moveTo(0, mid); g.lineTo(w, mid); g.stroke();
      g.fillStyle = "#34d399"; g.strokeStyle = "#34d399";
      if (v.spp >= 1) {
        for (var x = 0; x < w; x++) {
          var a0 = Math.floor(v.start + x * v.spp), a1 = Math.min(d.length, Math.floor(v.start + (x + 1) * v.spp));
          if (a0 >= d.length) break;
          var mn = 1, mx = -1, step = Math.max(1, Math.floor((a1 - a0) / 64));
          for (var i = a0; i < Math.max(a1, a0 + 1); i += step) { var s = d[i]; if (s < mn) mn = s; if (s > mx) mx = s; }
          g.fillRect(x, mid - mx * amp, 1, Math.max(1, (mx - mn) * amp));
        }
      } else {
        g.beginPath();
        for (var j = Math.floor(v.start); j < Math.min(d.length, v.start + w * v.spp + 2); j++) { var px = (j - v.start) / v.spp, py = mid - d[j] * amp; if (j === Math.floor(v.start)) g.moveTo(px, py); else g.lineTo(px, py); }
        g.stroke();
      }
      if (c) { g.strokeStyle = "#1a1f2b"; g.beginPath(); g.moveTo(0, rulerH + laneH * c); g.lineTo(w, rulerH + laneH * c); g.stroke(); }
    }
    // ruler
    g.fillStyle = "#12151d"; g.fillRect(0, 0, w, rulerH);
    var secs = w * v.spp / sr, steps = [0.001, 0.005, 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60], st = steps[steps.length - 1];
    for (var k = 0; k < steps.length; k++) if (secs / steps[k] < w / 70) { st = steps[k]; break; }
    g.fillStyle = "#8a93a8"; g.font = "10px ui-monospace, Menlo, monospace"; g.strokeStyle = "#3a4256";
    for (var t = Math.ceil(v.start / sr / st) * st; t < (v.start + w * v.spp) / sr; t += st) {
      var tx = (t * sr - v.start) / v.spp; g.beginPath(); g.moveTo(tx, rulerH - 6); g.lineTo(tx, rulerH); g.stroke();
      g.fillText(fmt(t, st), tx + 3, 12);
    }
    // cursor + selection edges
    g.strokeStyle = "#f5b301"; g.lineWidth = 1;
    g.beginPath(); g.moveTo(sx + 0.5, rulerH); g.lineTo(sx + 0.5, h); g.stroke();
    if (this.hasSel()) { g.beginPath(); g.moveTo(ex + 0.5, rulerH); g.lineTo(ex + 0.5, h); g.stroke(); }
    if (this.play != null) { var px2 = (this.play * sr - v.start) / v.spp; g.strokeStyle = "#f43f5e"; g.beginPath(); g.moveTo(px2, 0); g.lineTo(px2, h); g.stroke(); }
  };
  function fmt(t, st) {
    var m = Math.floor(t / 60), s = t - m * 60, dp = st < 0.01 ? 3 : st < 1 ? 2 : 0;
    return (m ? m + ":" + (s < 10 ? "0" : "") : "") + s.toFixed(dp);
  }
  S.WaveEditor = WaveEditor; S.OPS = OPS;
})();
