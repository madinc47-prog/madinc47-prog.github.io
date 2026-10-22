/* Island Pin Beats · Multitrack Mixer view (Studio step 2). Faders/pan/mute/solo drive the same Web Audio nodes as the timeline. Nothing is added to the signal: takes stay raw. */
(function () {
  "use strict";
  var M = window.IPBMultitrack; if (!M) return;
  var $ = function (id) { return document.getElementById(id); };
  var S = M.S, box = $("mx-strips"), pane = $("mixer"), on = false, dragging = 0, mAn = null;
  var COL = ["#a46bff", "#3d8bff", "#2fc6a3", "#ffb03a", "#ff6b6b", "#e86bd8", "#6bd3ff", "#b8e04a", "#ff8f4a"];
  var MIN = -60, MAX = 6;
  function toDb(v) { return v <= 0.001 ? -Infinity : 20 * Math.log10(v); }
  function toLin(db) { return db <= MIN ? 0 : Math.pow(10, db / 20); }
  function pos(v) { var d = toDb(v); return d === -Infinity ? 0 : Math.max(0, Math.min(1, (d - MIN) / (MAX - MIN))); }
  function dbTxt(v) { var d = toDb(v); return d === -Infinity ? "−∞" : (d > 0 ? "+" : "") + d.toFixed(1); }
  function panTxt(p) { return Math.abs(p) < 0.01 ? "C" : (p < 0 ? "L" : "R") + Math.round(Math.abs(p) * 100); }
  function ensureAn(t) { var ctx = M.ctx(); if (!ctx || !t.gain) return null; var src = t.pan || t.gain; if (t._mxSrc !== src) { t._mxAn = ctx.createAnalyser(); t._mxAn.fftSize = 512; src.connect(t._mxAn); t._mxSrc = src; t._mxBuf = new Float32Array(512); } return t._mxAn; }
  function ensureMaster() { var ctx = M.ctx(), m = M.master(); if (!ctx || !m) return null; if (!mAn || mAn.m !== m) { var sp = ctx.createChannelSplitter(2), a = ctx.createAnalyser(), b = ctx.createAnalyser(); a.fftSize = b.fftSize = 512; m.connect(sp); sp.connect(a, 0); sp.connect(b, 1); mAn = { m: m, a: [a, b], buf: new Float32Array(512), pk: [0, 0] }; } return mAn; }
  function peakOf(an, buf) { an.getFloatTimeDomainData(buf); var m = 0; for (var i = 0; i < buf.length; i++) { var v = Math.abs(buf[i]); if (v > m) m = v; } return m; }
  function mH(p) { var d = 20 * Math.log10(p + 1e-6); return Math.max(0, Math.min(100, (d - MIN) / (MAX - MIN) * 100)); }

  function fader(get, set, label) {
    var f = document.createElement("div"); f.className = "mx-fader"; f.innerHTML = '<div class="mx-scale"><i style="bottom:' + pos(1) * 100 + '%">0</i><i style="bottom:' + pos(toLin(-12)) * 100 + '%">−12</i><i style="bottom:' + pos(toLin(-30)) * 100 + '%">−30</i></div><div class="mx-slot"></div><div class="mx-cap" role="slider" tabindex="0" aria-label="' + label + ' fader"></div>';
    var cap = f.querySelector(".mx-cap"), lastTap = 0, d = null;
    function upd() { cap.style.bottom = "calc(" + pos(get()) * 100 + "% - 22px)"; cap.setAttribute("aria-valuetext", dbTxt(get()) + " dB"); }
    function frac(e) { var r = f.getBoundingClientRect(); return Math.max(0, Math.min(1, (r.bottom - 22 - e.clientY) / (r.height - 44))); }
    f.addEventListener("pointerdown", function (e) {
      var now = Date.now(); if (now - lastTap < 320) { set(1); upd(); lastTap = 0; d = null; return; } lastTap = now;
      d = { id: e.pointerId, y: e.clientY, p0: pos(get()), onCap: e.target === cap }; dragging++; try { f.setPointerCapture(e.pointerId); } catch (er) {}
      if (!d.onCap) { var p = frac(e); set(p <= 0.002 ? 0 : toLin(MIN + p * (MAX - MIN))); upd(); d.p0 = pos(get()); d.y = e.clientY; }
      e.preventDefault();
    });
    f.addEventListener("pointermove", function (e) { if (!d || e.pointerId !== d.id) return; var r = f.getBoundingClientRect(), p = Math.max(0, Math.min(1, d.p0 + (d.y - e.clientY) / (r.height - 44))); set(p <= 0.002 ? 0 : toLin(MIN + p * (MAX - MIN))); upd(); });
    function end(e) { if (d && e.pointerId === d.id) { d = null; dragging = Math.max(0, dragging - 1); M.save(); } }
    f.addEventListener("pointerup", end); f.addEventListener("pointercancel", end);
    cap.addEventListener("keydown", function (e) { var db = toDb(get()); if (db === -Infinity) db = MIN; if (e.key === "ArrowUp") set(toLin(Math.min(MAX, db + 1))); else if (e.key === "ArrowDown") set(toLin(db - 1)); else return; e.preventDefault(); upd(); });
    f.upd = upd; upd(); return f;
  }
  function strip(t, i) {
    var el = document.createElement("div"), col = t.kind === "beat" ? COL[0] : COL[1 + (i - 1) % 8];
    el.className = "mx-strip" + (t.kind === "beat" ? " beat" : ""); el.dataset.t = t.id; el.style.setProperty("--c", col);
    el.innerHTML = '<button class="mx-name"></button><div class="mx-ins"></div><div class="mx-pan"><input type="range" min="-1" max="1" step="0.01" aria-label="Pan"><output></output></div>' +
      '<div class="mx-ms"><button class="btn mute">M</button><button class="btn solo">S</button></div><div class="mx-body"><div class="mx-meter"><b></b><s></s></div></div><output class="mx-db"></output>';
    el.querySelector(".mx-name").textContent = t.name; el.querySelector(".mx-name").onclick = function () { M.openTrk(t); };
    var ins = el.querySelector(".mx-ins");
    for (var k = 0; k < 4; k++) { var s = (t.ins || [])[k], b = document.createElement("button"); b.className = "mx-slotbtn" + (s ? (s.on ? " on" : " byp") : ""); b.textContent = s ? (k + 1) : "·"; b.title = s ? "Insert " + (k + 1) + (s.on ? "" : " (bypassed)") : "Empty insert " + (k + 1); b.onclick = function () { M.openTrk(t); var c = $("tk-ins"); if (c && c.scrollIntoView) c.scrollIntoView({ block: "start" }); }; ins.appendChild(b); }
    var pr = el.querySelector(".mx-pan input"), po = el.querySelector(".mx-pan output"), pt = 0;
    pr.value = t.pn || 0; po.textContent = panTxt(t.pn || 0);
    pr.oninput = function () { t.pn = +pr.value; po.textContent = panTxt(t.pn); M.applyMS(); };
    pr.addEventListener("pointerdown", function () { var n = Date.now(); if (n - pt < 320) { t.pn = 0; pr.value = 0; po.textContent = "C"; M.applyMS(); } pt = n; });
    var mb = el.querySelector(".mute"), sb = el.querySelector(".solo"); mb.classList.toggle("on", !!t.mute); sb.classList.toggle("on", !!t.solo);
    mb.onclick = function () { t.mute = !t.mute; M.applyMS(); M.render(); }; sb.onclick = function () { t.solo = !t.solo; M.applyMS(); M.render(); };
    var dbo = el.querySelector(".mx-db"), fd = fader(function () { return t.vol == null ? 1 : t.vol; }, function (v) { t.vol = v; dbo.textContent = dbTxt(v) + " dB"; M.applyMS(); }, t.name);
    el.querySelector(".mx-body").insertBefore(fd, el.querySelector(".mx-meter")); dbo.textContent = dbTxt(t.vol == null ? 1 : t.vol) + " dB";
    el._sync = function () { fd.upd(); dbo.textContent = dbTxt(t.vol == null ? 1 : t.vol) + " dB"; if (document.activeElement !== pr) { pr.value = t.pn || 0; po.textContent = panTxt(t.pn || 0); } mb.classList.toggle("on", !!t.mute); sb.classList.toggle("on", !!t.solo); el.querySelector(".mx-name").textContent = t.name; };
    el._t = t; return el;
  }
  function masterStrip() {
    var el = document.createElement("div"); el.className = "mx-strip master"; el.style.setProperty("--c", "#e0b020");
    el.innerHTML = '<div class="mx-name">MASTER</div><div class="mx-ins"></div><div class="mx-pan"></div><div class="mx-ms"></div><div class="mx-body"><div class="mx-meter st"><b></b><s></s></div><div class="mx-meter st"><b></b><s></s></div></div><output class="mx-db"></output>';
    var dbo = el.querySelector(".mx-db"), fd = fader(function () { return S.mvol == null ? 1 : S.mvol; }, function (v) { S.mvol = v; dbo.textContent = dbTxt(v) + " dB"; M.applyMS(); }, "Master");
    el.querySelector(".mx-body").insertBefore(fd, el.firstChild.nextSibling && el.querySelector(".mx-meter")); dbo.textContent = dbTxt(S.mvol == null ? 1 : S.mvol) + " dB";
    el._sync = function () { fd.upd(); dbo.textContent = dbTxt(S.mvol == null ? 1 : S.mvol) + " dB"; }; return el;
  }
  function build() {
    box.innerHTML = ""; var n = 0;
    S.tracks.forEach(function (t) { box.appendChild(strip(t, t.kind === "beat" ? 0 : ++n)); });
    var sp = document.createElement("div"); sp.className = "mx-gap"; box.appendChild(sp); box.appendChild(masterStrip());
  }
  var sig = "";
  window.IPBMixerSync = function (full) {
    if (!on) return;
    var s2 = S.tracks.map(function (t) { return t.id + t.name + (t.ins || []).map(function (x) { return x.pid + x.on; }).join(); }).join("|");
    if ((full || s2 !== sig) && !dragging) { sig = s2; build(); return; }
    Array.prototype.forEach.call(box.children, function (el) { if (el._sync) el._sync(); });
  };
  function meters() {
    if (on) {
      Array.prototype.forEach.call(box.querySelectorAll(".mx-strip"), function (el) {
        var t = el._t, bars = el.querySelectorAll(".mx-meter");
        if (t) { var an = ensureAn(t), p = an ? peakOf(an, t._mxBuf) : 0; t._mxPk = Math.max(p, (t._mxPk || 0) * 0.9); t._mxHold = Math.max(t._mxPk, (t._mxHold || 0) * 0.995); bars[0].firstChild.style.height = mH(t._mxPk) + "%"; bars[0].lastChild.style.bottom = mH(t._mxHold) + "%"; bars[0].classList.toggle("clip", t._mxHold >= 0.99); }
        else { var m = ensureMaster(); [0, 1].forEach(function (c) { var p = m ? peakOf(m.a[c], m.buf) : 0; if (m) { m.pk[c] = Math.max(p, m.pk[c] * 0.9); m.h = m.h || [0, 0]; m.h[c] = Math.max(m.pk[c], m.h[c] * 0.995); } bars[c].firstChild.style.height = (m ? mH(m.pk[c]) : 0) + "%"; bars[c].lastChild.style.bottom = (m ? mH(m.h[c]) : 0) + "%"; bars[c].classList.toggle("clip", !!m && m.h[c] >= 0.99); }); }
      });
    }
    requestAnimationFrame(meters);
  }
  function show(v) { on = v; pane.hidden = !v; $("tl").hidden = v; $("hint").hidden = v; $("mixbtn").classList.toggle("on", v); if (v) { M.ac(); sig = ""; window.IPBMixerSync(true); } try { localStorage.setItem("ipb_mt_mixer", v ? "1" : ""); } catch (e) {} if (!v) M.render(); }
  $("mixbtn").onclick = function () { show(!on); };
  $("sh-trk").addEventListener("click", function () { setTimeout(function () { window.IPBMixerSync(); }, 0); });
  $("tk-vol").addEventListener("input", function () { window.IPBMixerSync(); });
  M.ready().then(function () { if (localStorage.getItem("ipb_mt_mixer") === "1") show(true); });
  requestAnimationFrame(meters);
  M.mixer = { show: show, isOn: function () { return on; } };
})();
