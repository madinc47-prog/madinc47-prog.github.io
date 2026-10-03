/* Island Pin Beats Studio: UI (multitrack timeline, transport, recording, waveform edit, mixer, FX, import/export, autosave) */
(function () {
  "use strict";
  var S = window.IPBS, E = S.E, OPS = S.OPS;
  var $ = function (id) { return document.getElementById(id); };
  var P = null, selTrack = null, selClip = null, pps = 40, playhead = 0, playFrom = 0, clipBoard = null, view = "multi";
  var waveClip = null, waveBuf = null, waveBoard = null, waveEd = null, saveTimer = null, takeN = 1, lastExport = null, recClips = [], lastSent = null;
  var hpWarned = false, lastTake = null, EMBED = /[?&]embed=1/.test(location.search);
  var TH = function () { return parseFloat(getComputedStyle($("mt")).getPropertyValue("--th")) || 84; };

  function toast(msg, ms) {
    var t = $("toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("show"); }, ms || 2600);
  }
  function beat() { return 60 / P.bpm; }
  function grid() { var g = beat(); while (g * pps > 140 && g > beat() / 4) g /= 2; while (g * pps < 16) g *= 2; return g; }
  function snapT(t, ev) { return P.snap && !(ev && ev.altKey) ? Math.round(t / grid()) * grid() : t; }
  function trackById(id) { return P.tracks.filter(function (t) { return t.id === id; })[0]; }
  function clipById(id) { return P.clips.filter(function (c) { return c.id === id; })[0]; }
  function srcLen(c) { var s = S.sources[c.src]; return s ? s.buf.duration : c.dur; }
  function fmtTime(t) {
    t = Math.max(0, t); var b = t / beat(), bar = Math.floor(b / 4) + 1, bt = Math.floor(b % 4) + 1;
    var m = Math.floor(t / 60), s = t - m * 60;
    return bar + "." + bt + " · " + m + ":" + (s < 10 ? "0" : "") + s.toFixed(2);
  }
  function fmtDur(t) { var m = Math.floor(t / 60), s = Math.floor(t % 60); return m + ":" + (s < 10 ? "0" : "") + s; }
  function changed(label, noRender) {
    if (!noRender) render();
    scheduleSave();
    if (E.ctx) E.syncGraph(P);
  }
  var editing = false;
  function begin(label) { if (!editing) { S.pushUndo(P, label); editing = true; } }
  function end() { editing = false; }

  /* ---------------- rendering ---------------- */
  function timelineWidth() {
    var vis = $("lanes-wrap").clientWidth || 800;
    return Math.max(vis, (Math.max(E.projectEnd(P), P.loop.end, playhead) + 30) * pps);
  }
  function render() { if (!P) return;
    $("proj-name").value = P.name;
    $("t-bpm").value = P.bpm;
    $("t-loop").classList.toggle("on", P.loop.on);
    $("t-metro").classList.toggle("on", P.metro);
    $("t-snap").classList.toggle("on", P.snap);
    renderHeads(); renderLanes(); renderRuler(); updatePlayhead();
    if (view === "mixer") renderMixer();
    $("btn-undo").disabled = !S.H.undo.length; $("btn-redo").disabled = !S.H.redo.length;
  }
  function anyFx(tr) { var f = tr.fx; return f.eq.on || f.comp.on || f.gate.on || f.delay.on || f.reverb.on; }
  function renderHeads() {
    var H = $("heads"); H.innerHTML = "";
    P.tracks.forEach(function (tr, i) {
      var d = document.createElement("div");
      d.className = "trk" + (tr.id === selTrack ? " sel" : ""); d.style.setProperty("--tc", tr.color); d.dataset.id = tr.id;
      d.innerHTML = '<span class="num" title="Track number"></span>' +
        '<div class="row"><input class="tname" aria-label="Track name" title="Rename the track"><button class="mini arm" title="Record arm: ● records onto this track">R</button><button class="mini mute" title="Mute">M</button><button class="mini solo" title="Solo: hear only soloed tracks">S</button><button class="mini fx" title="Effects: EQ, compressor, gate, delay, reverb">FX</button><button class="mini del" title="Delete this track and its clips">×</button></div>' +
        '<div class="row"><span class="sl" title="Track volume (dB)">Vol<input type="range" class="vol" min="-60" max="6" step="0.5"><output></output></span><span class="sl pan" title="Pan left / right">Pan<input type="range" class="pan" min="-1" max="1" step="0.05"><output></output></span></div><span class="tm"><i></i></span>';
      d.querySelector(".num").textContent = i + 1;
      var nm = d.querySelector(".tname"); nm.value = tr.name;
      nm.addEventListener("change", function () { S.pushUndo(P, "rename"); tr.name = nm.value.trim() || ("Track " + (i + 1)); changed(); });
      function tog(cls, key) {
        var b = d.querySelector("." + cls); b.classList.toggle("on", !!tr[key]);
        b.addEventListener("click", function (e) { e.stopPropagation(); S.pushUndo(P, key); tr[key] = !tr[key]; selTrack = tr.id; changed(); });
      }
      tog("arm", "arm"); tog("mute", "mute"); tog("solo", "solo");
      var fx = d.querySelector(".fx"); fx.classList.toggle("on", anyFx(tr));
      fx.addEventListener("click", function (e) { e.stopPropagation(); openFx(tr.id); });
      d.querySelector(".del").addEventListener("click", function (e) {
        e.stopPropagation();
        if (P.tracks.length <= 1) { toast("A project needs at least one track."); return; }
        var n = P.clips.filter(function (c) { return c.track === tr.id; }).length;
        if (n && !confirm("Delete \"" + tr.name + "\" and its " + n + " clip" + (n > 1 ? "s" : "") + "?")) return;
        S.pushUndo(P, "delete track");
        P.tracks = P.tracks.filter(function (t) { return t !== tr; }); P.clips = P.clips.filter(function (c) { return c.track !== tr.id; });
        if (selTrack === tr.id) selTrack = P.tracks[0].id;
        changed();
      });
      var vol = d.querySelector("input.vol"), vo = vol.nextElementSibling, pan = d.querySelector("input.pan"), po = pan.nextElementSibling;
      vol.value = tr.vol; vo.textContent = (tr.vol > 0 ? "+" : "") + tr.vol.toFixed(1);
      pan.value = tr.pan; po.textContent = panTxt(tr.pan);
      vol.addEventListener("input", function () { begin("volume"); tr.vol = +vol.value; vo.textContent = (tr.vol > 0 ? "+" : "") + tr.vol.toFixed(1); E.ctx && E.syncGraph(P); });
      vol.addEventListener("change", function () { end(); changed(null, true); });
      vol.addEventListener("dblclick", function () { S.pushUndo(P, "volume"); tr.vol = 0; changed(); });
      pan.addEventListener("input", function () { begin("pan"); tr.pan = +pan.value; po.textContent = panTxt(tr.pan); E.ctx && E.syncGraph(P); });
      pan.addEventListener("change", function () { end(); changed(null, true); });
      pan.addEventListener("dblclick", function () { S.pushUndo(P, "pan"); tr.pan = 0; changed(); });
      d.addEventListener("pointerdown", function (e) { if (e.target === d || e.target.classList.contains("num")) { selTrack = tr.id; renderHeads(); markLanes(); } });
      H.appendChild(d);
    });
  }
  function panTxt(p) { return Math.abs(p) < 0.01 ? "C" : (p < 0 ? "L" : "R") + Math.round(Math.abs(p) * 100); }
  function markLanes() { document.querySelectorAll(".lane").forEach(function (l) { l.classList.toggle("sel", l.dataset.id === selTrack); }); }
  function renderLanes() {
    var L = $("lanes"), th = TH(), w = timelineWidth();
    L.querySelectorAll(".lane, .clip, .mt-empty").forEach(function (n) { n.remove(); });
    L.style.width = w + "px"; L.style.height = (P.tracks.length * th) + "px";
    var b = beat() * pps, bar = b * 4, g = grid() * pps, bars = bar * Math.max(1, Math.pow(2, Math.ceil(Math.log2(Math.max(1, 14 / bar)))));
    var imgs = ["linear-gradient(90deg, rgba(138,147,168,.28) 1px, transparent 1px)"], sizes = [bars + "px 100%"];
    if (b >= 9) { imgs.push("linear-gradient(90deg, rgba(138,147,168,.12) 1px, transparent 1px)"); sizes.push(b + "px 100%"); }
    if (g < b - 0.5 && g >= 9) { imgs.push("linear-gradient(90deg, rgba(138,147,168,.06) 1px, transparent 1px)"); sizes.push(g + "px 100%"); }
    L.style.backgroundImage = imgs.join(", "); L.style.backgroundSize = sizes.join(", ");
    P.tracks.forEach(function (tr, i) {
      var ln = document.createElement("div");
      ln.className = "lane" + (tr.id === selTrack ? " sel" : ""); ln.dataset.id = tr.id; ln.style.top = (i * th) + "px";
      L.appendChild(ln);
    });
    P.clips.forEach(function (c) { L.appendChild(clipEl(c)); });
    if (!P.clips.length) {
      var em = document.createElement("div"); em.className = "mt-empty";
      em.innerHTML = '<b>Step 1 · put a beat on Track 1:</b> <button type="button" class="btn small primary" data-e="bounce">Bounce current beat to track</button> <button type="button" class="btn small" data-e="gunwalk">Gunwalk instrumental</button> <button type="button" class="btn small" data-e="file">Import / drop a file</button><br><b>Step 2:</b> press <b class="r">R</b> on Vocals and hit <b>●</b> (1-bar count-in, headphones on).';
      em.addEventListener("pointerdown", function (e) { e.stopPropagation(); });
      em.querySelectorAll("[data-e]").forEach(function (b) { b.addEventListener("click", function () { var k = b.dataset.e; if (k === "bounce") bounceFromBeats(); else if (k === "gunwalk") importGunwalk().then(zoomFit); else { selTrack = beatTrackId(); $("file-in").click(); } }); });
      L.appendChild(em);
    }
    var ls = $("loop-shade"); ls.style.left = (P.loop.start * pps) + "px"; ls.style.width = Math.max(0, (P.loop.end - P.loop.start) * pps) + "px"; ls.classList.toggle("off", !P.loop.on);
    recClips.forEach(function (r) { L.appendChild(r.el); });
  }
  /* waveform peaks per source (max abs over channels, 128-sample blocks) */
  var peaks = {};
  function peaksOf(id) {
    if (peaks[id]) return peaks[id];
    var s = S.sources[id]; if (!s) return null;
    var ch = S.chans(s.buf), n = s.buf.length, B = 128, m = Math.ceil(n / B), mx = new Float32Array(m), mn = new Float32Array(m);
    for (var k = 0; k < m; k++) {
      var a = k * B, e = Math.min(n, a + B), hi = -1, lo = 1;
      for (var c = 0; c < ch.length; c++) { var d = ch[c]; for (var i = a; i < e; i += 2) { var v = d[i]; if (v > hi) hi = v; if (v < lo) lo = v; } }
      mx[k] = hi; mn[k] = lo;
    }
    return (peaks[id] = { mx: mx, mn: mn, B: B, sr: s.buf.sampleRate });
  }
  function drawClipWave(cv, c, w, h) {
    var pk = peaksOf(c.src); if (!pk) return;
    var dpr = window.devicePixelRatio || 1, W = Math.min(4096, Math.max(1, Math.round(w * dpr))), Hh = Math.max(1, Math.round(h * dpr));
    cv.width = W; cv.height = Hh;
    var g = cv.getContext("2d"), tr = trackById(c.track), mid = Hh / 2, gain = S.db(c.gain || 0);
    g.fillStyle = tr ? tr.color : "#22d3ee"; g.globalAlpha = 0.85;
    var spx = c.dur * pk.sr / W, off = c.offset * pk.sr;
    for (var x = 0; x < W; x++) {
      var a = Math.floor((off + x * spx) / pk.B), e = Math.max(a + 1, Math.floor((off + (x + 1) * spx) / pk.B)), hi = 0, lo = 0;
      for (var k = a; k < e && k < pk.mx.length; k++) { if (pk.mx[k] > hi) hi = pk.mx[k]; if (pk.mn[k] < lo) lo = pk.mn[k]; }
      hi = Math.min(1, hi * gain); lo = Math.max(-1, lo * gain);
      g.fillRect(x, mid - hi * mid, 1, Math.max(1, (hi - lo) * mid));
    }
  }
  function clipEl(c) {
    var tr = trackById(c.track), idx = P.tracks.indexOf(tr), th = TH();
    var el = document.createElement("div");
    el.className = "clip" + (c.id === selClip ? " sel" : ""); el.dataset.id = c.id;
    el.style.setProperty("--tc", tr ? tr.color : "#22d3ee");
    el.style.left = (c.start * pps) + "px"; el.style.width = Math.max(4, c.dur * pps) + "px"; el.style.top = (idx * th + 4) + "px";
    el.title = c.name + " · " + c.dur.toFixed(2) + "s · drag to move, edges to trim, corner squares to fade, double-click to edit";
    el.innerHTML = '<span class="cname"></span><canvas></canvas><svg class="fades" preserveAspectRatio="none"></svg><span class="edge l"></span><span class="edge r"></span><span class="fh l" title="Fade in: drag right"></span><span class="fh r" title="Fade out: drag left"></span>';
    el.querySelector(".cname").textContent = c.name + ((c.gain || 0) ? " (" + (c.gain > 0 ? "+" : "") + c.gain.toFixed(1) + " dB)" : "");
    var w = Math.max(4, c.dur * pps), h = th - 9 - 16;
    drawClipWave(el.querySelector("canvas"), c, w, h);
    layoutFades(el, c);
    el.addEventListener("pointerdown", function (e) { clipDown(e, c, el); });
    el.addEventListener("dblclick", function (e) { e.preventDefault(); openWave(c.id); });
    return el;
  }
  function layoutFades(el, c) {
    var w = Math.max(4, c.dur * pps), h = TH() - 9, fi = (c.fadeIn || 0) * pps, fo = (c.fadeOut || 0) * pps;
    var svg = el.querySelector("svg"); svg.setAttribute("viewBox", "0 0 " + w + " " + h);
    var p = "";
    if (fi > 0.5) p += '<path d="M0 0 L' + fi + ' 0 L0 ' + h + ' Z" fill="rgba(0,0,0,.5)"/><path d="M0 ' + h + ' L' + fi + ' 0" stroke="#fff" stroke-width="1.2" fill="none"/>';
    if (fo > 0.5) p += '<path d="M' + w + ' 0 L' + (w - fo) + ' 0 L' + w + ' ' + h + ' Z" fill="rgba(0,0,0,.5)"/><path d="M' + (w - fo) + ' 0 L' + w + ' ' + h + '" stroke="#fff" stroke-width="1.2" fill="none"/>';
    svg.innerHTML = p;
    el.querySelector(".fh.l").style.left = Math.max(0, Math.min(w - 11, fi - 5)) + "px";
    el.querySelector(".fh.r").style.left = Math.max(0, Math.min(w - 11, w - fo - 6)) + "px";
  }
  function selectClip(id) {
    selClip = id;
    var c = clipById(id); if (c) selTrack = c.track;
    document.querySelectorAll(".clip").forEach(function (n) { n.classList.toggle("sel", n.dataset.id === id); });
    clipGainUI();
    renderHeads(); markLanes();
  }
  function clipDown(e, c, el) {
    if (e.button === 2) return;
    e.stopPropagation(); e.preventDefault();
    selectClip(c.id);
    var t = e.target, mode = t.classList.contains("fh") ? (t.classList.contains("l") ? "fi" : "fo") : t.classList.contains("edge") ? (t.classList.contains("l") ? "tl" : "tr") : "move";
    var o = JSON.parse(JSON.stringify(c)), x0 = e.clientX, y0 = e.clientY, moved = false, th = TH(), max = srcLen(c);
    el.setPointerCapture(e.pointerId);
    function mv(ev) {
      var dx = (ev.clientX - x0) / pps;
      if (!moved && Math.abs(ev.clientX - x0) < 3 && Math.abs(ev.clientY - y0) < 3) return;
      if (!moved) { S.pushUndo(P, mode === "move" ? "move clip" : mode[0] === "t" ? "trim clip" : "fade"); moved = true; el.classList.add("drag"); }
      if (mode === "move") {
        c.start = Math.max(0, snapT(o.start + dx, ev));
        var li = S.clamp(Math.floor((ev.clientY - $("lanes").getBoundingClientRect().top) / th), 0, P.tracks.length - 1);
        c.track = P.tracks[li].id;
      } else if (mode === "tl") {
        var ns = snapT(o.start + dx, ev), d = ns - o.start;
        d = S.clamp(d, -o.offset, o.dur - 0.02); c.start = o.start + d; c.offset = o.offset + d; c.dur = o.dur - d;
        c.fadeIn = Math.min(c.fadeIn || 0, c.dur); c.fadeOut = Math.min(c.fadeOut || 0, c.dur - c.fadeIn);
      } else if (mode === "tr") {
        var ne = snapT(o.start + o.dur + dx, ev);
        c.dur = S.clamp(ne - o.start, 0.02, max - o.offset);
        c.fadeOut = Math.min(c.fadeOut || 0, c.dur); c.fadeIn = Math.min(c.fadeIn || 0, c.dur - c.fadeOut);
      } else if (mode === "fi") c.fadeIn = S.clamp((o.fadeIn || 0) + dx, 0, c.dur - (c.fadeOut || 0));
      else if (mode === "fo") c.fadeOut = S.clamp((o.fadeOut || 0) - dx, 0, c.dur - (c.fadeIn || 0));
      var tr = trackById(c.track);
      el.style.left = (c.start * pps) + "px"; el.style.width = Math.max(4, c.dur * pps) + "px"; el.style.top = (P.tracks.indexOf(tr) * th + 4) + "px";
      el.style.setProperty("--tc", tr.color);
      if (mode === "tl" || mode === "tr") drawClipWave(el.querySelector("canvas"), c, Math.max(4, c.dur * pps), th - 25);
      layoutFades(el, c);
      hint(mode === "move" ? "Start " + fmtTime(c.start) + " · " + tr.name : mode[0] === "t" ? "Length " + c.dur.toFixed(2) + "s" : "Fade " + (mode === "fi" ? c.fadeIn : c.fadeOut).toFixed(2) + "s");
    }
    function up() {
      el.removeEventListener("pointermove", mv); el.removeEventListener("pointerup", up); el.removeEventListener("pointercancel", up);
      el.classList.remove("drag");
      if (moved) { selTrack = c.track; changed(); }
      else if (mode === "move" && !E.playing) setPlayhead(snapT(c.start + (x0 - el.getBoundingClientRect().left) / pps, e));
    }
    el.addEventListener("pointermove", mv); el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
  }
  /* ruler */
  function renderRuler() { if (!P) return;
    var cv = $("ruler"), wrap = $("ruler-wrap"), dpr = window.devicePixelRatio || 1, w = wrap.clientWidth, h = 26;
    cv.width = Math.round(w * dpr); cv.height = h * dpr; cv.style.width = w + "px";
    var g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    var sl = $("lanes-wrap").scrollLeft, b = beat(), barPx = b * 4 * pps, every = Math.max(1, Math.ceil(46 / barPx));
    if (P.loop.end > P.loop.start) {
      g.fillStyle = P.loop.on ? "rgba(34,211,238,.35)" : "rgba(138,147,168,.25)";
      g.fillRect(P.loop.start * pps - sl, 0, (P.loop.end - P.loop.start) * pps, 6);
    }
    g.font = "10px ui-monospace, Menlo, monospace";
    var first = Math.floor(sl / barPx);
    for (var i = first; i * barPx - sl < w; i++) {
      var x = i * barPx - sl;
      g.strokeStyle = "#3a4256"; g.beginPath(); g.moveTo(x + 0.5, i % every ? 18 : 8); g.lineTo(x + 0.5, h); g.stroke();
      if (i % every === 0) { g.fillStyle = "#8a93a8"; g.fillText(String(i + 1), x + 3, 17); }
      for (var k = 1; k < 4 && barPx > 40; k++) { var bx = x + k * b * pps; g.strokeStyle = "#262d3d"; g.beginPath(); g.moveTo(bx + 0.5, 21); g.lineTo(bx + 0.5, h); g.stroke(); }
    }
    var px = playhead * pps - sl; g.fillStyle = "#f43f5e"; g.beginPath(); g.moveTo(px - 5, 18); g.lineTo(px + 5, 18); g.lineTo(px, h); g.fill();
  }
  function rulerDown(e) {
    var cv = $("ruler"), r = cv.getBoundingClientRect(), sl = $("lanes-wrap").scrollLeft;
    var t0 = Math.max(0, (e.clientX - r.left + sl) / pps), drag = false, before = JSON.stringify(P.loop);
    cv.setPointerCapture(e.pointerId);
    function mv(ev) {
      var t = Math.max(0, (ev.clientX - r.left + sl) / pps);
      if (!drag && Math.abs(ev.clientX - e.clientX) < 5) return;
      if (!drag) { S.pushUndo(P, "loop"); drag = true; }
      var a = snapT(Math.min(t0, t), ev), b = snapT(Math.max(t0, t), ev);
      if (b - a < 0.05) b = a + grid();
      P.loop.start = a; P.loop.end = b; P.loop.on = true;
      renderRuler(); var ls = $("loop-shade"); ls.style.left = (a * pps) + "px"; ls.style.width = ((b - a) * pps) + "px"; ls.classList.remove("off"); $("t-loop").classList.add("on");
      hint("Loop " + fmtTime(a) + " → " + fmtTime(b));
    }
    function up() {
      cv.removeEventListener("pointermove", mv); cv.removeEventListener("pointerup", up);
      if (drag) { if (JSON.stringify(P.loop) !== before) changed(); if (E.playing) restartAt(P.loop.start); }
      else setPlayhead(snapT(t0, e));
    }
    cv.addEventListener("pointermove", mv); cv.addEventListener("pointerup", up);
  }
  function setPlayhead(t) { if (!P) return;
    playhead = Math.max(0, t);
    if (E.playing && !E.recording) restartAt(playhead);
    updatePlayhead();
  }
  function updatePlayhead() { if (!P) return;
    $("playhead").style.left = (playhead * pps) + "px";
    $("t-time").textContent = fmtTime(playhead);
    renderRuler();
  }
  function hint(s) { $("hint").textContent = s; }

  /* ---------------- transport ---------------- */
  function restartAt(t) { playFrom = t; E.play(P, t); }
  function play() {
    if (E.playing) { pause(); return; }
    if (P.loop.on && (playhead < P.loop.start || playhead >= P.loop.end)) playhead = P.loop.start;
    playFrom = playhead;
    E.play(P, playhead).then(function () { $("t-play").classList.add("on"); $("t-play").textContent = "❚❚"; });
  }
  function pause() { var p = E.pos(); E.stop(false); if (p != null) playhead = p; uiStopped(); updatePlayhead(); }
  function stopAll() {
    if (E.recording) { finishRecord(); return; }
    var was = E.playing; E.stop(false); uiStopped();
    playhead = was ? playFrom : 0; updatePlayhead();
  }
  function uiStopped() { $("t-play").classList.remove("on"); $("t-play").textContent = "▶"; }
  E.onStop = function (natural) { uiStopped(); if (natural) { playhead = 0; updatePlayhead(); } };
  E.onTick = function (pos) {
    var cl = E.countLeft(), ci = $("countin");
    if (cl > 0) { ci.hidden = false; ci.textContent = String(Math.ceil(cl / beat() - 1e-3)); }
    else if (!ci.hidden) { ci.hidden = true; if (E.recording) toast("● Recording on " + P.tracks.filter(function (t) { return t.arm; }).map(function (t) { return t.name; }).join(", ") + ". Press ■ or ● to stop."); }
    playhead = pos;
    $("playhead").style.left = (pos * pps) + "px";
    $("t-time").textContent = fmtTime(pos);
    var wrap = $("lanes-wrap"), x = pos * pps;
    if (view === "multi" && (x > wrap.scrollLeft + wrap.clientWidth - 40 || x < wrap.scrollLeft)) wrap.scrollLeft = Math.max(0, x - 80);
    renderRuler();
    recClips.forEach(function (r) { r.el.style.width = Math.max(2, (pos - r.start) * pps) + "px"; });
  };
  function record() {
    if (E.recording) { finishRecord(); return; }
    if (E.playing) pause();
    var armed = P.tracks.filter(function (t) { return t.arm; });
    if (!armed.length) {
      var t = trackById(selTrack) || P.tracks[1] || P.tracks[0];
      t.arm = true; render();
      toast("Armed " + t.name + " for recording. Press ● again to start.");
      return;
    }
    var from = playhead, bars = P.countIn == null ? 1 : P.countIn, pre = bars * 4 * beat();
    var spk = speakerMode();
    E.stopBuffer(); if (!CL.busy) $("clean-sheet").hidden = true;
    if (!hpWarned) {
      hpWarned = true;
      toast((spk ? "🔈 Speaker mode: echo-cancel is on and the take gets cleaned after you stop. Headphones still sound best. " : "🎧 Headphones mode. ") + (bars ? "Count-in: " + bars + " bar" + (bars > 1 ? "s" : "") + "." : ""), 3600);
    }
    E.startRecord(P, from, pre, { speaker: spk }).then(function () {
      $("t-rec").classList.add("on"); $("t-play").classList.add("on"); $("t-in").hidden = false;
      playFrom = from;
      recClips = armed.map(function (tr) {
        var el = document.createElement("div"); el.className = "clip rec"; el.style.setProperty("--tc", "#f43f5e");
        el.style.left = (from * pps) + "px"; el.style.top = (P.tracks.indexOf(tr) * TH() + 4) + "px"; el.style.width = "2px";
        el.innerHTML = '<span class="cname">● Recording…</span>'; $("lanes").appendChild(el);
        return { el: el, start: from };
      });
      if (!pre) toast("Recording on " + armed.map(function (t) { return t.name; }).join(", ") + ". Press ■ or ● to stop.");
    }).catch(function (e) { toast(e && e.name === "NotAllowedError" ? "Microphone blocked. Allow the mic in your browser's site settings." : (e.message || String(e)), 4200); });
  }
  function finishRecord() {
    E.stopRecord().then(function (res) {
      $("countin").hidden = true;
      $("t-rec").classList.remove("on"); $("t-in").hidden = true; uiStopped();
      recClips.forEach(function (r) { r.el.remove(); }); recClips = [];
      if (!res || res.data.length < res.sr * 0.1) { toast("Nothing recorded."); return; }
      S.pushUndo(P, "record");
      var buf = S.bufFrom([res.data], res.sr), name = "Take " + (takeN++), id = S.addSource(buf, name), made = [];
      lastTake = { start: res.start, latencyMs: Math.round(res.latency * 1000), dur: buf.duration };
      res.armed.forEach(function (tid) {
        var c = { id: S.uid("c"), track: tid, src: id, start: res.start, offset: 0, dur: buf.duration, gain: 0, fadeIn: 0.005, fadeOut: 0.01, name: name };
        P.clips.push(c); made.push(c);
      });
      selClip = made[0].id; selTrack = made[0].track;
      playhead = playFrom;
      changed();
      if (res.speaker && P.autoClean !== false && window.IPBVocalCleanClient) { cleanClip(made[0].id, { auto: true, mic: res.mic }); return; }
      toast(name + " recorded (" + buf.duration.toFixed(1) + "s). " + (res.speaker ? "Press 🧹 Clean take to remove the speaker bleed. " : "") + "Double-click it to edit.");
    });
  }

  /* ---------------- headphones / speaker mode + "Clean take" (shared cleaner: ../vocal-clean-client.js) ---------------- */
  var hp = { found: false, label: "", manual: null };
  try { var hm = localStorage.getItem("ipbs_hp"); hp.manual = hm === "1" ? true : hm === "0" ? false : null; } catch (e) { /* ignore */ }
  function onHeadphones() { return hp.manual != null ? hp.manual : hp.found; }
  function speakerMode() { return !onHeadphones(); }
  function hpUI() {
    var chip = $("rs-hpchip"); if (!chip) return;
    var on = onHeadphones();
    chip.className = "hp-chip " + (on ? "hp" : "spk");
    chip.textContent = on ? "🎧 Headphones" + (hp.manual ? " (you said so)" : hp.label ? ": " + hp.label : "") : "🔈 Speaker mode" + (hp.manual === false ? " (you said so)" : "") + " · echo-cancel + Clean take";
    $("rs-hpon").checked = on;
    $("rs-autoclean").checked = P ? P.autoClean !== false : true;
    $("rs-autoclean").disabled = on;
  }
  function hpDetect() {
    var C = window.IPBVocalCleanClient; if (!C) return Promise.resolve();
    return C.detect().then(function (d) { hp.found = d.found; hp.label = d.label || ""; hpUI(); });
  }
  var CL = { raw: null, clean: null, ab: "clean", clip: null, busy: false };
  var CL_STEPS = { align: "Finding the beat in the take…", aec: "Removing the beat (echo canceller)…", res: "Removing what's left of the beat…", denoise: "Removing room noise (RNNoise)…", gate: "Gating the gaps…" };
  function clClipBuf(c) { // the visible part of the clip's current audio, as its own buffer
    var s = S.sources[c.src]; if (!s) return null;
    var sr = s.buf.sampleRate, a = Math.round(c.offset * sr), b = Math.min(s.buf.length, a + Math.round(c.dur * sr));
    return (a === 0 && b === s.buf.length) ? s.buf : OPS.slice(s.buf, a, b);
  }
  // the beat the singer heard while this clip was recorded = the project rendered without this clip's track (and
  // without any other clip made from the same recording), from 0.3 s before the clip to its end
  function clReference(c, pre) {
    var Q = JSON.parse(JSON.stringify({ tracks: P.tracks, clips: P.clips, bpm: P.bpm, loop: P.loop, master: P.master, name: P.name }));
    Q.master.limiter = false;
    Q.tracks.forEach(function (t) { t.solo = false; if (t.id === c.track) t.mute = true; }); // solo is a listening aid, not what was heard
    Q.clips = Q.clips.filter(function (x) { return x.track !== c.track && x.src !== c.src && !(c.orig && (x.src === c.orig.src || (x.orig && x.orig.src === c.orig.src))); });
    if (!Q.clips.length) return Promise.resolve(null);
    var from = c.start - pre;
    if (from < 0) { Q.clips.forEach(function (x) { x.start -= from; }); from = 0; } // render can't start before 0: shift everything
    return E.render(Q, from, from + pre + c.dur);
  }
  function clSheet(state) {
    $("clean-sheet").hidden = false;
    $("cl-prog").hidden = state !== "prog"; $("cl-ab").hidden = state !== "done";
    if (state === "prog") { $("cl-title").textContent = "Cleaning take…"; $("cl-bar").style.width = "2%"; $("cl-step").textContent = "Preparing…"; }
  }
  function clSetAB(w) {
    CL.ab = w;
    document.querySelectorAll("#cl-ab [data-ab]").forEach(function (b) { var on = b.dataset.ab === w; b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on)); });
  }
  function clPlay() {
    var b = CL.ab === "raw" ? CL.raw : CL.clean; if (!b) return;
    E.playBuffer(b, 0, b.duration, function () { $("cl-play").textContent = "▶ Play"; }).then(function () { $("cl-play").textContent = "▶ Playing " + (CL.ab === "raw" ? "A" : "B"); });
  }
  function cleanClip(id, o) {
    o = o || {};
    var C = window.IPBVocalCleanClient, c = clipById(id || selClip);
    if (!C) { toast("The take cleaner didn't load. Reload the page."); return Promise.resolve(null); }
    if (!c) { toast("Select a recorded clip first, then press 🧹 Clean take."); return Promise.resolve(null); }
    if (CL.busy) { toast("Already cleaning a take…"); return Promise.resolve(null); }
    if (c.clean) { toast(c.name + " is already cleaned. ⟲ Original (Waveform Edit) or Undo brings back the raw take."); return Promise.resolve(null); }
    var raw = clClipBuf(c); if (!raw) return Promise.resolve(null);
    if (raw.duration > 600) { toast("Clean take works on clips up to 10 minutes. Split it first."); return Promise.resolve(null); }
    if (E.playing) pause();
    E.stopBuffer();
    CL.busy = true; CL.clip = c.id; CL.raw = raw; CL.clean = null; clSheet("prog");
    var sr = raw.sampleRate, PRE = 0.3, SHIFT = 0.25, T0 = performance.now();
    var mono = new Float32Array(raw.length);
    for (var ch = 0; ch < raw.numberOfChannels; ch++) { var d = raw.getChannelData(ch); for (var i = 0; i < raw.length; i++) mono[i] += d[i] / raw.numberOfChannels; }
    return E.ensure().then(function () { return clReference(c, PRE); }).then(function (ref) {
      // mic padded by PRE + SHIFT s of silence: the beat gets PRE s of history, and SHIFT s lets the canceller find a
      // take whose latency compensation overshot (bleed slightly *earlier* than the beat)
      var pad = Math.round((PRE + SHIFT) * sr), n = pad + mono.length, mic = new Float32Array(n), L = new Float32Array(n), R = new Float32Array(n);
      mic.set(mono, pad);
      if (ref) { var rl = ref[0], rr = ref[1], m = Math.min(n, rl.length); L.set(rl.subarray(0, m)); R.set(rr.subarray(0, m)); }
      return C.run(mic, L, ref ? R : null, sr, o.opts || {}, function (stage, p) {
        $("cl-bar").style.width = Math.max(2, Math.round(p * 100)) + "%";
        $("cl-step").textContent = (CL_STEPS[stage] || "Working…") + " " + Math.round(p * 100) + "%";
      }).then(function (r) { return { r: r, pad: pad, hadRef: !!ref }; });
    }).then(function (x) {
      var out = x.r.out.subarray(x.pad, x.pad + mono.length), info = x.r.info;
      info.wallMs = Math.round(performance.now() - T0);
      if (info.delayMs != null) info.latencyErrMs = Math.round(info.delayMs - SHIFT * 1000);
      var nb = S.bufFrom([new Float32Array(out)], sr);
      var c2 = clipById(CL.clip); if (!c2) throw new Error("the clip was deleted");
      S.pushUndo(P, "clean take");
      var nid = S.addSource(nb, c2.name + " (cleaned)");
      var stat = { bleed: info.bleedFound, lat: info.latencyErrMs, fin: info.floorInDb, fout: info.floorOutDb, rnn: info.rnnoise || null, ms: info.wallMs };
      // every clip made from the same recording region (several armed tracks) gets the same cleaned version
      P.clips.forEach(function (k) {
        if (k !== c2 && !(k.src === c2.src && Math.abs(k.offset - c2.offset) < 1e-6 && Math.abs(k.dur - c2.dur) < 1e-6)) return;
        if (!k.orig) k.orig = { src: k.src, offset: k.offset, dur: k.dur }; // non-destructive: the raw take stays in the project
        k.src = nid; k.offset = 0; k.dur = nb.duration; k.clean = stat;
      });
      CL.clean = nb; CL.busy = false; CL.last = { info: info, clip: c2.id, hadRef: x.hadRef };
      if (view === "wave" && waveClip === c2.id) loadWave(c2, true);
      changed("clean take");
      $("cl-title").textContent = "Take cleaned ✓";
      var parts = [];
      if (!x.hadRef) parts.push("No other tracks playing: noise cleanup only");
      else if (info.bleedFound) parts.push("Beat found in the mic" + (info.latencyErrMs != null ? " (timing off by " + info.latencyErrMs + " ms)" : "") + " and removed");
      else parts.push("No beat bleed found (headphones, echo-cancel or a quiet speaker): noise cleanup only");
      if (info.floorInDb != null) parts.push("between lines: " + Math.round(info.floorInDb) + " → " + Math.round(info.floorOutDb) + " dBFS (−" + Math.round(info.floorInDb - info.floorOutDb) + " dB)");
      parts.push("noise removal " + (info.rnnoise ? "RNNoise " + info.rnnoise : "off") + (info.voicedPct != null ? " · voice in " + info.voicedPct + "% of take" : ""));
      parts.push("done in " + (info.wallMs / 1000).toFixed(1) + " s");
      if (o.mic) parts.push("browser echo-cancel " + (o.mic.echoCancellation ? "on" : "off"));
      $("cl-stats").textContent = parts.join(" · ");
      clSetAB("clean"); clSheet("done");
      toast((o.auto ? "Speaker-mode take cleaned" : c2.name + " cleaned") + ". Compare A/B, or Undo for the raw take.", 3600);
      return CL.last;
    }).catch(function (e) {
      CL.busy = false; $("clean-sheet").hidden = true;
      toast("Clean take failed: " + (e && e.message || e) + ". The raw take is unchanged.", 4200);
      return null;
    });
  }
  function clUseRaw() {
    var c = clipById(CL.clip);
    E.stopBuffer();
    if (!c || !c.clean || !c.orig) { $("clean-sheet").hidden = true; return; }
    S.pushUndo(P, "use raw take");
    P.clips.forEach(function (k) { if (k.clean && k.src === c.src) { k.src = k.orig.src; k.offset = k.orig.offset; k.dur = k.orig.dur; delete k.orig; delete k.clean; } });
    if (view === "wave" && waveClip === c.id) loadWave(c, false);
    changed(); $("clean-sheet").hidden = true; toast("Back to the raw take (Undo brings the cleaned one back).");
  }

  /* ---------------- clip edit commands ---------------- */
  function selected() { return clipById(selClip); }
  function split() {
    var list = selected() ? [selected()] : P.clips.filter(function (c) { return c.track === selTrack; });
    list = list.filter(function (c) { return playhead > c.start + 0.01 && playhead < c.start + c.dur - 0.01; });
    if (!list.length) { toast("Put the playhead inside a clip, then press Split."); return; }
    S.pushUndo(P, "split");
    list.forEach(function (c) {
      var cut = playhead - c.start, b = JSON.parse(JSON.stringify(c));
      b.id = S.uid("c"); b.start = playhead; b.offset = c.offset + cut; b.dur = c.dur - cut; b.fadeIn = 0; b.fadeOut = Math.min(c.fadeOut || 0, b.dur);
      c.dur = cut; c.fadeOut = 0; c.fadeIn = Math.min(c.fadeIn || 0, c.dur);
      P.clips.push(b); selClip = b.id;
    });
    changed(); toast("Split at " + fmtTime(playhead));
  }
  function copyClip() { var c = selected(); if (!c) { toast("Select a clip first."); return; } clipBoard = JSON.parse(JSON.stringify(c)); toast("Copied " + c.name); }
  function pasteClip() {
    if (!clipBoard) { toast("Copy a clip first."); return; }
    S.pushUndo(P, "paste");
    var c = JSON.parse(JSON.stringify(clipBoard)); c.id = S.uid("c"); c.start = playhead; c.track = selTrack || P.tracks[0].id;
    P.clips.push(c); selClip = c.id; changed(); toast("Pasted at " + fmtTime(playhead));
  }
  function dupClip() {
    var c = selected(); if (!c) { toast("Select a clip first."); return; }
    S.pushUndo(P, "duplicate");
    var d = JSON.parse(JSON.stringify(c)); d.id = S.uid("c"); d.start = c.start + c.dur; P.clips.push(d); selClip = d.id; changed();
  }
  function delClip() {
    var c = selected(); if (!c) { toast("Select a clip first."); return; }
    S.pushUndo(P, "delete clip");
    P.clips = P.clips.filter(function (x) { return x !== c; }); selClip = null; changed();
  }
  function doUndo() { E.stop(false); uiStopped(); var l = S.undo(P); if (l == null) { toast("Nothing to undo."); return; } afterHistory(); toast("Undo " + l); }
  function doRedo() { E.stop(false); uiStopped(); var l = S.redo(P); if (l == null) { toast("Nothing to redo."); return; } afterHistory(); toast("Redo " + l); }
  function afterHistory() {
    if (selClip && !clipById(selClip)) selClip = null;
    if (!trackById(selTrack)) selTrack = P.tracks[0].id;
    changed();
    if (view === "wave" && waveClip) { var c = clipById(waveClip); if (c) loadWave(c, true); else { waveClip = null; waveBuf = null; waveEd.load(null); } }
  }

  /* ---------------- import ---------------- */
  function overlaps(tid, a, b) { return P.clips.some(function (c) { return c.track === tid && c.start < b && c.start + c.dur > a; }); }
  function freeTrack(a, b, prefer) {
    if (prefer && !overlaps(prefer, a, b)) return prefer;
    var t = P.tracks.filter(function (t) { return !overlaps(t.id, a, b); })[0];
    if (t) return t.id;
    var nt = S.newTrack(P.tracks.length); P.tracks.push(nt); return nt.id;
  }
  function placeBuffer(buf, name, at, preferTrack, bpm) {
    S.pushUndo(P, "import");
    if (bpm && !P.clips.length) P.bpm = bpm;
    var id = S.addSource(buf, name), tid = freeTrack(at, at + buf.duration, preferTrack);
    var c = { id: S.uid("c"), track: tid, src: id, start: at, offset: 0, dur: buf.duration, gain: 0, fadeIn: 0, fadeOut: 0, name: name };
    P.clips.push(c); selClip = c.id; selTrack = tid;
    changed();
    return c;
  }
  function decode(ab) { return E.ensure().then(function () { return new Promise(function (res, rej) { E.ctx.decodeAudioData(ab, res, function (e) { rej(e || new Error("Could not decode audio")); }); }); }); }
  function importFiles(files, tid) {
    var list = Array.prototype.slice.call(files || []), at = playhead;
    tid = tid || selTrack;
    if (!list.length) return Promise.resolve();
    toast("Importing " + list.length + " file" + (list.length > 1 ? "s" : "") + "…");
    return list.reduce(function (p, f) {
      return p.then(function () {
        if (f.size > 200 * 1024 * 1024) { toast(f.name + " is too big (max 200 MB)."); return; }
        return f.arrayBuffer().then(decode).then(function (buf) { var c = placeBuffer(buf, f.name.replace(/\.[^.]+$/, ""), at, tid); if (c.track !== tid) toast(f.name + " overlapped a clip there, so it went on " + trackById(c.track).name + "."); else toast(f.name + " added to " + trackById(c.track).name + "."); })
          .catch(function () { toast("Could not read " + f.name + ". Try WAV or MP3.", 3500); });
      });
    }, Promise.resolve());
  }
  function beatTrackId() { var t = P.tracks.filter(function (t) { return /beat/i.test(t.name); })[0] || P.tracks[0]; return t.id; }
  function beatsHost() { try { return window.parent !== window && window.parent.IPBBeats ? window.parent.IPBBeats : null; } catch (e) { return null; } }
  function bounceFromBeats(bars) {
    var host = beatsHost();
    bars = bars || ($("bounce-len") && $("bounce-len").value) || "16";
    if (!host) { saveNow(); location.href = "../?studio=1"; return Promise.resolve(null); }
    toast("Bouncing the current beat from the beat maker…", 6000);
    return host.bounceForStudio(bars).then(function (id) {
      return S.vaultList().then(function (items) {
        var it = items.filter(function (x) { return x.id === id; })[0];
        if (!it) throw new Error("bounce not found in the Vault");
        return importVaultItem(it, 0, beatTrackId());
      });
    }).then(function (c) {
      if (c) { zoomFit(); toast("Beat bounced onto " + trackById(c.track).name + " (" + fmtDur(c.dur) + "). Arm Vocals (R) and press ● to record.", 4200); }
      return c;
    }).catch(function (e) { toast("Bounce failed: " + (e && e.message || e), 4200); return null; });
  }
  function importGunwalk() {
    toast("Loading the Gunwalk instrumental…");
    return fetch("../tracks/gunwalk-instrumental.mp3").then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.arrayBuffer(); })
      .then(decode).then(function (buf) {
        var beatTrack = P.tracks.filter(function (t) { return /beat/i.test(t.name); })[0];
        var c = placeBuffer(buf, "Gunwalk (instrumental)", 0, beatTrack ? beatTrack.id : P.tracks[0].id, 96);
        toast("Gunwalk added (" + fmtDur(c.dur) + ", 96 BPM). Arm a vocal track and press ● to record.", 3800);
        return c;
      }).catch(function (e) { toast("Could not load Gunwalk (" + e.message + ")."); });
  }
  function openVault() {
    $("vault-sheet").hidden = false;
    var L = $("vault-list"); L.innerHTML = '<p class="kb-note">Loading…</p>';
    S.vaultList().then(function (items) {
      L.innerHTML = "";
      if (!items.length) { L.innerHTML = '<p class="kb-note">Your Vault is empty. In the beat maker, press <b>Send to Studio</b> or <b>Bounce loop</b>, or record a vocal take.</p>'; return; }
      items.forEach(function (it) {
        var row = document.createElement("div"); row.className = "st-item";
        row.innerHTML = '<span class="grow"><strong></strong><small></small></span><button class="btn small" type="button">Import</button>';
        row.querySelector("strong").textContent = it.name || "Untitled";
        row.querySelector("small").textContent = fmtDur(it.duration || 0) + " · " + new Date(it.created).toLocaleString();
        row.querySelector("button").addEventListener("click", function () { $("vault-sheet").hidden = true; importVaultItem(it, playhead); });
        L.appendChild(row);
      });
    });
  }
  function importVaultItem(it, at, prefer) {
    var m = /(\d{2,3})\s*bpm/i.exec(it.name || ""), bpm = m ? +m[1] : null;
    return it.blob.arrayBuffer().then(decode).then(function (buf) { return placeBuffer(buf, (it.name || "Vault audio").split(" · ")[0], at, prefer || selTrack, bpm); })
      .catch(function () { toast("Could not import that Vault item."); });
  }

  /* ---------------- waveform edit ---------------- */
  function openWave(id) {
    var c = clipById(id); if (!c) return;
    if (E.playing) pause();
    waveClip = id; selectClip(id); setView("wave"); loadWave(c, false);
  }
  function loadWave(c, keep) {
    var s = S.sources[c.src]; if (!s) return;
    var sr = s.buf.sampleRate, a = Math.round(c.offset * sr), b = Math.min(s.buf.length, a + Math.round(c.dur * sr));
    waveBuf = (a === 0 && b === s.buf.length) ? s.buf : OPS.slice(s.buf, a, b);
    $("wv-name").textContent = c.name;
    waveEd.load(waveBuf, keep);
    waveInfo();
  }
  function waveInfo() {
    if (!waveBuf) { $("wv-sel").textContent = "Selection: none"; $("wv-len").textContent = ""; return; }
    var sr = waveBuf.sampleRate, s = waveEd.sel;
    $("wv-sel").textContent = waveEd.hasSel() ? "Selection: " + (s.a / sr).toFixed(3) + "s → " + (s.b / sr).toFixed(3) + "s (" + ((s.b - s.a) / sr).toFixed(3) + "s)" : "Cursor: " + (s.a / sr).toFixed(3) + "s";
    $("wv-len").textContent = "Clip length " + waveBuf.duration.toFixed(3) + "s · " + waveBuf.numberOfChannels + " ch · " + sr + " Hz";
  }
  function commitWave(nb, label, sel) {
    var c = clipById(waveClip); if (!c || !nb) return;
    S.pushUndo(P, label);
    var id = S.addSource(nb, c.name);
    if (!c.orig) c.orig = { src: c.src, offset: c.offset, dur: c.dur }; // non-destructive: the untouched original stays in the project
    c.src = id; c.offset = 0; c.dur = nb.duration;
    c.fadeIn = Math.min(c.fadeIn || 0, c.dur / 2); c.fadeOut = Math.min(c.fadeOut || 0, c.dur / 2);
    waveBuf = nb; waveEd.load(nb, true);
    if (sel) waveEd.setSel(sel[0], sel[1]);
    waveInfo(); changed(label);
  }
  function revertClip() {
    var c = clipById(waveClip) || selected();
    if (!c || !c.orig || !S.sources[c.orig.src]) { toast("This clip has no waveform edits to revert."); return; }
    S.pushUndo(P, "revert to original");
    c.src = c.orig.src; c.offset = c.orig.offset; c.dur = c.orig.dur; delete c.orig; delete c.clean;
    c.fadeIn = Math.min(c.fadeIn || 0, c.dur / 2); c.fadeOut = Math.min(c.fadeOut || 0, c.dur / 2);
    if (view === "wave" && waveClip === c.id) loadWave(c, false);
    changed(); toast("Restored the original recording of " + c.name + " (Undo brings your edits back).");
  }
  function clipGainUI() {
    var c = selected(), g = $("clip-gain");
    g.disabled = !c; g.value = c ? (c.gain || 0) : 0;
  }
  function recSetUI() {
    var auto = E.ctx ? Math.round(E.autoLatency() * 1000) : null;
    $("rs-count").value = String(P.countIn == null ? 1 : P.countIn);
    $("rs-latmode").value = P.latencyMs == null ? "auto" : "manual";
    $("rs-lat").disabled = P.latencyMs == null;
    $("rs-lat").value = P.latencyMs == null ? (auto == null ? "" : auto) : P.latencyMs;
    $("rs-auto").textContent = auto == null ? "measured when audio starts" : auto + " ms detected on this device";
    hpUI();
    $("rs-last").textContent = lastTake ? "Last take was shifted earlier by " + lastTake.latencyMs + " ms." : "";
  }
  function openRecSet() { E.ensure().then(recSetUI); recSetUI(); hpDetect(); $("recset-sheet").hidden = false; }
  function nudgeTake(dt) { // slide the selected clip by 5 ms (fix sync by ear) and remember it as manual latency
    var c = selected(); if (!c) { toast("Select a recorded clip first."); return; }
    S.pushUndo(P, "nudge"); c.start = Math.max(0, c.start + dt);
    if (P.latencyMs == null) P.latencyMs = Math.round(E.autoLatency() * 1000);
    P.latencyMs = Math.round(P.latencyMs - dt * 1000); recSetUI(); changed();
    toast((dt < 0 ? "Earlier" : "Later") + " 5 ms. Next takes use " + P.latencyMs + " ms compensation.");
  }
  function waveOp(op) {
    if (op === "undo") { doUndo(); return; }
    if (op === "revert") { revertClip(); return; }
    if (op === "redo") { doRedo(); return; }
    if (!waveBuf) { toast("Double-click a clip in Multitrack first."); return; }
    E.stopBuffer();
    var s = waveEd.sel, has = waveEd.hasSel(), n = waveBuf.length, a = has ? s.a : 0, b = has ? s.b : n;
    var needSel = ["cut", "copy", "delete", "silence", "trim", "fadeIn", "fadeOut"];
    if (needSel.indexOf(op) !== -1 && !has) { toast("Drag across the waveform to select some audio first."); return; }
    if (op === "copy") { waveBoard = OPS.slice(waveBuf, a, b); toast("Copied " + ((b - a) / waveBuf.sampleRate).toFixed(2) + "s"); return; }
    if ((op === "cut" || op === "delete") && b - a > n - 64) { toast("That would delete the whole clip. Delete the clip in Multitrack instead."); return; }
    if (op === "cut") { waveBoard = OPS.slice(waveBuf, a, b); commitWave(OPS.remove(waveBuf, a, b), "cut", [a, a]); return; }
    if (op === "delete") { commitWave(OPS.remove(waveBuf, a, b), "delete", [a, a]); return; }
    if (op === "paste") {
      if (!waveBoard) { toast("Copy or cut some audio first."); return; }
      commitWave(OPS.insert(waveBuf, s.a, waveBoard, has ? s.b : null), "paste", [s.a, s.a + waveBoard.length]); return;
    }
    if (op === "trim") { commitWave(OPS.trim(waveBuf, a, b), "trim", [0, b - a]); return; }
    if (op === "amplify") { var dB = parseFloat($("wv-db").value) || 0; commitWave(OPS.amplify(waveBuf, a, b, dB), "amplify " + dB + " dB", has ? [a, b] : null); return; }
    if (op === "normalize") { var r = OPS.normalize(waveBuf, a, b, -1); if (!r) { toast("That part is silent."); return; } commitWave(r, "normalize", has ? [a, b] : null); return; }
    commitWave(OPS[op](waveBuf, a, b), op, has ? [a, b] : null);
  }
  var waveRaf = 0;
  function wavePlay() {
    if (!waveBuf) return;
    var sr = waveBuf.sampleRate, s = waveEd.sel, from = s.a / sr, to = waveEd.hasSel() ? s.b / sr : waveBuf.duration;
    E.playBuffer(waveBuf, from, to, function () { waveEd.play = null; waveEd.draw(); }).then(function () {
      cancelAnimationFrame(waveRaf);
      (function loop() { var p = E.bufferPos(); waveEd.play = p; waveEd.draw(); if (p != null) waveRaf = requestAnimationFrame(loop); })();
    });
  }

  /* ---------------- mixer ---------------- */
  function renderMixer() {
    var M = $("mixer"); M.innerHTML = "";
    P.tracks.forEach(function (tr, i) {
      var d = document.createElement("div"); d.className = "strip"; d.style.setProperty("--tc", tr.color); d.dataset.id = tr.id;
      d.innerHTML = '<span class="snum">' + (i + 1) + '</span><span class="sname"></span><button class="mini fx" title="Effects">FX</button>' +
        '<input type="range" class="pan" min="-1" max="1" step="0.05" title="Pan"><span class="dbv pv"></span>' +
        '<div class="fadwrap"><input type="range" class="fader" min="-60" max="6" step="0.5" title="Level (dB) · double-click for 0 dB"><span class="meter"><i></i></span></div>' +
        '<span class="dbv vv"></span><div class="btns"><button class="mini arm" title="Record arm">R</button><button class="mini mute" title="Mute">M</button><button class="mini solo" title="Solo">S</button></div>';
      d.querySelector(".sname").textContent = tr.name; d.querySelector(".sname").title = tr.name;
      var f = d.querySelector(".fader"), vv = d.querySelector(".vv"), pn = d.querySelector(".pan"), pv = d.querySelector(".pv");
      f.value = tr.vol; vv.textContent = (tr.vol > 0 ? "+" : "") + tr.vol.toFixed(1) + " dB"; pn.value = tr.pan; pv.textContent = panTxt(tr.pan);
      f.addEventListener("input", function () { begin("volume"); tr.vol = +f.value; vv.textContent = (tr.vol > 0 ? "+" : "") + tr.vol.toFixed(1) + " dB"; E.ctx && E.syncGraph(P); });
      f.addEventListener("change", function () { end(); changed(null, true); });
      f.addEventListener("dblclick", function () { S.pushUndo(P, "volume"); tr.vol = 0; changed(); });
      pn.addEventListener("input", function () { begin("pan"); tr.pan = +pn.value; pv.textContent = panTxt(tr.pan); E.ctx && E.syncGraph(P); });
      pn.addEventListener("change", function () { end(); changed(null, true); });
      ["arm", "mute", "solo"].forEach(function (k) {
        var b = d.querySelector("." + k); b.classList.toggle("on", !!tr[k]);
        b.addEventListener("click", function () { S.pushUndo(P, k); tr[k] = !tr[k]; changed(); });
      });
      var fx = d.querySelector(".fx"); fx.classList.toggle("on", anyFx(tr)); fx.addEventListener("click", function () { openFx(tr.id); });
      M.appendChild(d);
    });
    var m = document.createElement("div"); m.className = "strip master";
    m.innerHTML = '<span class="snum">OUT</span><span class="sname">Master</span><label class="chk" title="Brickwall limiter on the master: stops clipping and makes the mix louder"><input type="checkbox" class="lim"> Limiter</label>' +
      '<label class="chk" title="Limiter ceiling (dBFS)">Ceiling <select class="ceil"><option value="-0.3">−0.3</option><option value="-1">−1.0</option><option value="-2">−2.0</option></select></label>' +
      '<div class="fadwrap"><input type="range" class="fader" min="-24" max="6" step="0.5" title="Master level (dB)"><span class="meter"><i></i></span></div><span class="dbv vv"></span>';
    var lim = m.querySelector(".lim"), ceil = m.querySelector(".ceil"), mf = m.querySelector(".fader"), mv = m.querySelector(".vv");
    lim.checked = P.master.limiter; ceil.value = String(P.master.ceiling); mf.value = P.master.vol; mv.textContent = (P.master.vol > 0 ? "+" : "") + P.master.vol.toFixed(1) + " dB";
    lim.addEventListener("change", function () { S.pushUndo(P, "limiter"); P.master.limiter = lim.checked; changed(null, true); });
    ceil.addEventListener("change", function () { S.pushUndo(P, "ceiling"); P.master.ceiling = +ceil.value; changed(null, true); });
    mf.addEventListener("input", function () { begin("master"); P.master.vol = +mf.value; mv.textContent = (P.master.vol > 0 ? "+" : "") + P.master.vol.toFixed(1) + " dB"; E.ctx && E.syncGraph(P); });
    mf.addEventListener("change", function () { end(); changed(null, true); });
    M.appendChild(m);
  }
  function meterLoop() {
    requestAnimationFrame(meterLoop);
    if (!E.ctx) return;
    var m = E.meters(), pct = function (v) { var d = 20 * Math.log10(Math.max(v, 1e-5)); return Math.max(0, Math.min(100, (d + 60) / 60 * 100)); };
    $("t-meter").style.width = pct(m.master) + "%";
    if (E.recording) $("t-in").querySelector("i").style.width = pct(E.inputLevel()) + "%";
    if (view === "multi") document.querySelectorAll(".trk").forEach(function (t) { t.querySelector(".tm i").style.height = pct(m.tracks[t.dataset.id] || 0) + "%"; });
    if (view === "mixer") document.querySelectorAll(".strip").forEach(function (s) { var v = s.classList.contains("master") ? m.master : (m.tracks[s.dataset.id] || 0); s.querySelector(".meter i").style.height = pct(v) + "%"; });
  }

  /* ---------------- FX sheet ---------------- */
  var FXS = [
    { k: "gate", name: "Noise Gate", desc: "mutes hiss between phrases", p: [["thr", "Threshold", -80, -10, 1, "dB"], ["rel", "Release", 0.02, 1, 0.01, "s"]] },
    { k: "eq", name: "EQ · 3-band", desc: "shape the tone", p: [["low", "Low 120Hz", -15, 15, 0.5, "dB"], ["mid", "Mid", -15, 15, 0.5, "dB"], ["midF", "Mid freq", 200, 6000, 10, "Hz"], ["high", "High 8kHz", -15, 15, 0.5, "dB"]] },
    { k: "comp", name: "Compressor", desc: "evens out loud & quiet", p: [["thr", "Threshold", -50, 0, 1, "dB"], ["ratio", "Ratio", 1, 20, 0.5, ":1"], ["atk", "Attack", 0.001, 0.1, 0.001, "s"], ["rel", "Release", 0.02, 1, 0.01, "s"], ["makeup", "Makeup", 0, 24, 0.5, "dB"]] },
    { k: "delay", name: "Delay · echo", desc: "synced to BPM", p: [["div", "Time", ["1/16", "1/8", "1/8d", "1/4", "1/4d", "1/2"]], ["fb", "Feedback", 0, 0.9, 0.01, "%"], ["mix", "Mix", 0, 1, 0.01, "%"]] },
    { k: "reverb", name: "Reverb", desc: "room / hall space", p: [["size", "Size", 0.3, 5, 0.1, "s"], ["mix", "Mix", 0, 1, 0.01, "%"]] }
  ];
  var PRESETS = {
    vocal: { gate: { on: true, thr: -55, rel: 0.15 }, eq: { on: true, low: -2, mid: 1.5, midF: 2500, high: 3 }, comp: { on: true, thr: -20, ratio: 3, atk: 0.008, rel: 0.12, makeup: 4 }, delay: { on: false }, reverb: { on: true, size: 1.6, mix: 0.12 } },
    rap: { gate: { on: true, thr: -50, rel: 0.1 }, eq: { on: true, low: -3, mid: 2, midF: 3000, high: 2.5 }, comp: { on: true, thr: -24, ratio: 4.5, atk: 0.004, rel: 0.1, makeup: 6 }, delay: { on: false }, reverb: { on: true, size: 1.0, mix: 0.08 } },
    adlib: { gate: { on: true, thr: -50, rel: 0.1 }, eq: { on: true, low: -6, mid: 0, midF: 1500, high: 4 }, comp: { on: true, thr: -22, ratio: 4, atk: 0.005, rel: 0.12, makeup: 5 }, delay: { on: true, div: "1/8d", fb: 0.35, mix: 0.25 }, reverb: { on: true, size: 2.5, mix: 0.22 } },
    beat: { gate: { on: false }, eq: { on: true, low: 1.5, mid: -1, midF: 400, high: 1 }, comp: { on: true, thr: -14, ratio: 2, atk: 0.02, rel: 0.2, makeup: 2 }, delay: { on: false }, reverb: { on: false } },
    off: { gate: { on: false }, eq: { on: false }, comp: { on: false }, delay: { on: false }, reverb: { on: false } }
  };
  var fxTrack = null;
  function fmtP(v, u) { return u === "%" ? Math.round(v * 100) + "%" : u === "s" ? (v < 0.1 ? (v * 1000).toFixed(0) + "ms" : v.toFixed(2) + "s") : u === "Hz" ? (v >= 1000 ? (v / 1000).toFixed(1) + "k" : Math.round(v)) : u === ":1" ? v.toFixed(1) + ":1" : (v > 0 ? "+" : "") + (+v).toFixed(1); }
  function openFx(id) {
    fxTrack = id; var tr = trackById(id); if (!tr) return;
    $("fx-track").textContent = (P.tracks.indexOf(tr) + 1) + " · " + tr.name; $("fx-preset").value = "";
    var B = $("fx-body"); B.innerHTML = "";
    FXS.forEach(function (sec) {
      var st = tr.fx[sec.k], box = document.createElement("div"); box.className = "fxs" + (st.on ? " on" : ""); box.dataset.k = sec.k;
      box.innerHTML = '<h4><span>' + sec.name + ' <small>' + sec.desc + '</small></span><button type="button" class="sw' + (st.on ? " on" : "") + '" title="Turn ' + sec.name + ' on / off" aria-pressed="' + st.on + '"></button></h4>';
      box.querySelector(".sw").addEventListener("click", function () { S.pushUndo(P, sec.name); st.on = !st.on; openFx(id); changed(null, true); renderHeads(); });
      sec.p.forEach(function (p) {
        var lab = document.createElement("label");
        if (Array.isArray(p[2])) {
          lab.innerHTML = "<span>" + p[1] + "</span><select></select><output></output>";
          var sel = lab.querySelector("select"); p[2].forEach(function (o) { var op = document.createElement("option"); op.value = o; op.textContent = o.replace("d", " dotted"); sel.appendChild(op); });
          sel.value = st[p[0]];
          sel.addEventListener("change", function () { S.pushUndo(P, sec.name); st[p[0]] = sel.value; changed(null, true); });
        } else {
          lab.innerHTML = "<span>" + p[1] + '</span><input type="range"><output></output>';
          var r = lab.querySelector("input"), o = lab.querySelector("output");
          r.min = p[2]; r.max = p[3]; r.step = p[4]; r.value = st[p[0]]; o.textContent = fmtP(st[p[0]], p[5]);
          r.addEventListener("input", function () { begin(sec.name); st[p[0]] = +r.value; o.textContent = fmtP(st[p[0]], p[5]); if (!st.on) { st.on = true; box.classList.add("on"); box.querySelector(".sw").classList.add("on"); } E.ctx && E.syncGraph(P); });
          r.addEventListener("change", function () { end(); changed(null, true); renderHeads(); });
        }
        box.appendChild(lab);
      });
      B.appendChild(box);
    });
    $("fx-sheet").hidden = false;
  }
  function applyPreset(name) {
    var tr = trackById(fxTrack), pr = PRESETS[name]; if (!tr || !pr) return;
    S.pushUndo(P, "FX preset");
    Object.keys(pr).forEach(function (k) { Object.assign(tr.fx[k], pr[k]); });
    openFx(fxTrack); changed(null, true); renderHeads();
    toast("Preset applied to " + tr.name);
  }

  /* ---------------- views ---------------- */
  function setView(v) {
    view = v;
    document.querySelectorAll(".st-tabs .tab").forEach(function (t) { t.classList.toggle("active", t.dataset.view === v); });
    document.querySelectorAll(".st-view").forEach(function (s) { s.classList.toggle("active", s.id === "view-" + v); });
    if (v === "mixer") renderMixer();
    if (v === "wave") { if (!waveClip && selClip) { openWave(selClip); return; } setTimeout(function () { waveEd.draw(); }, 0); }
    if (v === "multi") setTimeout(function () { render(); }, 0);
  }

  /* ---------------- save / open / export ---------------- */
  function scheduleSave() {
    clearTimeout(saveTimer);
    $("save-state").textContent = "Saving…"; $("save-state").classList.remove("ok");
    saveTimer = setTimeout(saveNow, 900);
  }
  function saveNow() {
    clearTimeout(saveTimer); saveTimer = null;
    return S.saveProject(P).then(function () {
      try { localStorage.setItem("ipbs_last", P.id); } catch (e) { /* ignore */ }
      var d = new Date(); $("save-state").textContent = "Saved ✓ " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); $("save-state").classList.add("ok");
    }).catch(function (e) { $("save-state").textContent = "Not saved (storage blocked or full)"; console.warn(e); });
  }
  function setProject(p) {
    E.stop(false); uiStopped();
    P = p; P.tracks.forEach(function (t) { t.fx = Object.assign(S.defaultFx(), t.fx || {}); });
    if (P.countIn == null) P.countIn = 1;
    selTrack = P.tracks[0] && P.tracks[0].id; selClip = null; playhead = 0; waveClip = null; waveBuf = null;
    if (waveEd) waveEd.load(null);
    S.clearHistory(); peaks = {};
    if (E.ctx) E.syncGraph(P);
    render(); zoomFit();
  }
  function openList() {
    $("open-sheet").hidden = false;
    var L = $("open-list"); L.innerHTML = '<p class="kb-note">Loading…</p>';
    S.listProjects().then(function (list) {
      L.innerHTML = "";
      if (!list.length) L.innerHTML = '<p class="kb-note">No saved projects yet.</p>';
      list.forEach(function (it) {
        var row = document.createElement("div"); row.className = "st-item";
        row.innerHTML = '<span class="grow"><strong></strong><small></small></span><button class="btn small" type="button">Open</button><button class="btn small ghost" type="button" title="Delete this saved project">Delete</button>';
        row.querySelector("strong").textContent = it.name + (it.id === P.id ? " (open now)" : "");
        row.querySelector("small").textContent = "Saved " + new Date(it.updated).toLocaleString();
        var bs = row.querySelectorAll("button");
        bs[0].addEventListener("click", function () { saveNow().then(function () { return S.loadProject(it.id); }).then(function (p) { setProject(p); $("open-sheet").hidden = true; toast("Opened " + p.name); }).catch(function (e) { toast("Could not open: " + e.message); }); });
        bs[1].addEventListener("click", function () {
          if (it.id === P.id) { toast("That project is open. Open or start another one first."); return; }
          if (!confirm("Delete the saved project \"" + it.name + "\"?")) return;
          S.deleteProject(it.id).then(openList);
        });
        L.appendChild(row);
      });
    });
  }
  function renderMix() { // mix → { blob, ext, dur, peak, name } in the format picked in the Export sheet
    var range = $("ex-range").value, fmt = $("ex-fmt").value, end = E.projectEnd(P);
    if (!P.clips.length) return Promise.reject(new Error("Nothing to export yet. Import or record something first."));
    var from = range === "loop" ? P.loop.start : 0, to = range === "loop" ? P.loop.end : end;
    if (to - from < 0.1) return Promise.reject(new Error("The loop region is empty."));
    var st = $("ex-status"), t0 = performance.now(); st.textContent = "Rendering…";
    return E.render(P, from, to).then(function (ch) {
      st.textContent = "Encoding…";
      if (fmt.indexOf("mp3") === 0) return (window.lamejs ? Promise.resolve() : S.loadScript("vendor/lame.min.js")).then(function () { return { blob: S.encodeMp3(ch, S.SR, +fmt.split("-")[1]), ext: "mp3", ch: ch }; });
      return { blob: S.encodeWav(ch, S.SR, fmt === "wav24" ? 24 : 16), ext: "wav", ch: ch };
    }).then(function (r) {
      var dur = r.ch[0].length / S.SR, name = (P.name || "mix").replace(/[^\w\- ]+/g, "").trim() || "mix";
      var pk = 0; r.ch.forEach(function (a) { for (var i = 0; i < a.length; i++) { var v = Math.abs(a[i]); if (v > pk) pk = v; } });
      lastExport = { blob: r.blob, ext: r.ext, dur: dur, peak: pk, size: r.blob.size, ms: Math.round(performance.now() - t0), from: from, to: to };
      return { blob: r.blob, ext: r.ext, dur: dur, peak: pk, name: name };
    });
  }
  function busy(on) { ["ex-go", "ex-player", "ex-dj"].forEach(function (id) { $(id).disabled = on; }); }
  function exportMix() {
    var st = $("ex-status"); busy(true);
    return renderMix().then(function (r) {
      S.download(r.blob, r.name + "." + r.ext);
      st.textContent = "Done: " + r.name + "." + r.ext + " · " + fmtDur(r.dur) + " · " + (r.blob.size / 1048576).toFixed(1) + " MB · peak " + (20 * Math.log10(r.peak || 1e-9)).toFixed(1) + " dBFS";
      if ($("ex-vault").checked) return saveToVault(r.blob, r.dur, P.name + " (Studio mix)").then(function (ok) { if (ok) st.textContent += " · saved to Vault"; });
    }).catch(function (e) { st.textContent = "Export failed: " + e.message; if (!/Nothing|empty/.test(e.message)) console.error(e); })
      .then(function () { busy(false); });
  }
  /* IslePin ecosystem: mixdown → shared library (../../shared/media-store.js, source "beats") → Player / DJ booth */
  var mediaStoreP = null;
  function mediaStore() { if (!mediaStoreP) mediaStoreP = import("../../shared/media-store.js").catch(function (e) { mediaStoreP = null; throw e; }); return mediaStoreP; }
  function sendMix(dest) {
    var st = $("ex-status"); busy(true);
    return Promise.all([renderMix(), mediaStore()]).then(function (a) {
      var r = a[0], m = a[1];
      return m.saveTrack({ title: P.name || "Studio mix", artist: (function () { try { var a = window.parent !== window && window.parent.document.getElementById("studio-artist"); return (a && a.value.trim()) || "Island Pin Beats"; } catch (e) { return "Island Pin Beats"; } })(), source: "beats", blob: r.blob, mime: r.ext === "mp3" ? "audio/mpeg" : "audio/wav", duration: r.dur }).then(function (id) {
        lastSent = { id: id, dest: dest, title: P.name, ext: r.ext };
        st.innerHTML = "";
        st.appendChild(document.createTextNode("✓ “" + (P.name || "Studio mix") + "” (" + r.ext.toUpperCase() + ", " + fmtDur(r.dur) + ") is in your IslePin library. "));
        var pl = document.createElement("a"); pl.className = "btn small" + (dest === "player" ? " primary" : ""); pl.textContent = "Open Player ↗"; pl.href = m.playerUrl(id); pl.target = "psycho-fingers-player";
        var dj = document.createElement("a"); dj.className = "btn small" + (dest === "dj" ? " primary" : ""); dj.textContent = "Open DJ"; dj.href = "../../dj/?from=beats&back=studio&track=" + encodeURIComponent(id); dj.target = "_top";
        dj.addEventListener("click", function () { if (saveTimer) saveNow(); });
        st.appendChild(pl); st.appendChild(document.createTextNode(" ")); st.appendChild(dj);
        toast("Sent to the " + (dest === "dj" ? "DJ booth" : "Player") + " library.");
        return id;
      });
    }).catch(function (e) { st.textContent = "Send failed: " + e.message; })
      .then(function (id) { busy(false); return id; });
  }
  function saveToVault(blob, dur, label) {
    return S.beatsDb().then(function (d) {
      return new Promise(function (res) {
        if (!d.objectStoreNames.contains("vault")) { d.close(); res(false); return; }
        var t = d.transaction("vault", "readwrite");
        t.objectStore("vault").put({ id: "r_" + Date.now().toString(36), name: label + " · " + P.bpm + "bpm", created: Date.now(), duration: dur, size: blob.size, blob: blob });
        t.oncomplete = function () { d.close(); res(true); }; t.onerror = function () { res(false); };
      });
    }).catch(function () { return false; });
  }

  /* ---------------- zoom ---------------- */
  function zoomTo(n, about) { if (!P) return;
    var wrap = $("lanes-wrap"), t = about != null ? about : (wrap.scrollLeft + wrap.clientWidth / 2) / pps;
    var px = t * pps - wrap.scrollLeft;
    pps = S.clamp(n, 2, 600); render();
    wrap.scrollLeft = Math.max(0, t * pps - px);
    renderRuler();
  }
  function zoomFit() { if (!P) return; var w = ($("lanes-wrap").clientWidth || 800) - 30, end = Math.max(16 * beat(), E.projectEnd(P)); pps = S.clamp(w / end, 2, 600); render(); $("lanes-wrap").scrollLeft = 0; renderRuler(); }

  /* ---------------- init ---------------- */
  function bind() {
    $("t-play").addEventListener("click", play);
    $("t-stop").addEventListener("click", stopAll);
    $("t-home").addEventListener("click", function () { setPlayhead(P.loop.on ? P.loop.start : 0); $("lanes-wrap").scrollLeft = 0; });
    $("t-rec").addEventListener("click", record);
    $("t-loop").addEventListener("click", function () {
      S.pushUndo(P, "loop");
      if (!P.loop.on && P.loop.end - P.loop.start < 0.05) { P.loop.start = 0; P.loop.end = 16 * beat(); }
      P.loop.on = !P.loop.on; changed(); if (E.playing) restartAt(P.loop.on ? P.loop.start : playhead);
    });
    $("t-metro").addEventListener("click", function () { P.metro = !P.metro; changed(null, true); $("t-metro").classList.toggle("on", P.metro); });
    $("t-snap").addEventListener("click", function () { P.snap = !P.snap; changed(null, true); $("t-snap").classList.toggle("on", P.snap); });
    $("t-bpm").addEventListener("change", function () { var v = S.clamp(Math.round(+$("t-bpm").value || 96), 40, 220); S.pushUndo(P, "BPM"); P.bpm = v; changed(); });
    $("t-zin").addEventListener("click", function () { zoomTo(pps * 1.5); });
    $("t-zout").addEventListener("click", function () { zoomTo(pps / 1.5); });
    $("t-zfit").addEventListener("click", zoomFit);
    $("proj-name").addEventListener("change", function () { S.pushUndo(P, "rename"); P.name = $("proj-name").value.trim() || "My Song"; changed(null, true); });
    document.querySelectorAll(".st-tabs .tab").forEach(function (t) { t.addEventListener("click", function () { setView(t.dataset.view); }); });
    $("btn-import").addEventListener("click", function (e) { e.stopPropagation(); var m = $("import-menu"); m.hidden = !m.hidden; $("btn-import").setAttribute("aria-expanded", String(!m.hidden)); });
    document.addEventListener("click", function (e) { if (!e.target.closest || !e.target.closest("#import-menu")) $("import-menu").hidden = true; });
    document.querySelectorAll("#import-menu [data-imp]").forEach(function (b) {
      b.addEventListener("click", function () {
        $("import-menu").hidden = true;
        var k = b.dataset.imp;
        if (k === "file") $("file-in").click(); else if (k === "gunwalk") importGunwalk(); else if (k === "vault") openVault(); else if (k === "bounce") bounceFromBeats();
      });
    });
    $("file-in").addEventListener("change", function (e) { importFiles(e.target.files); e.target.value = ""; });
    $("btn-addtrack").addEventListener("click", function () { S.pushUndo(P, "add track"); var t = S.newTrack(P.tracks.length); P.tracks.push(t); selTrack = t.id; changed(); });
    $("btn-split").addEventListener("click", split);
    $("btn-copy").addEventListener("click", copyClip);
    $("btn-paste").addEventListener("click", pasteClip);
    $("btn-dup").addEventListener("click", dupClip);
    $("btn-del").addEventListener("click", delClip);
    $("btn-undo").addEventListener("click", doUndo);
    $("btn-redo").addEventListener("click", doRedo);
    $("ruler").addEventListener("pointerdown", rulerDown);
    $("lanes-wrap").addEventListener("scroll", renderRuler);
    $("lanes").addEventListener("pointerdown", function (e) {
      if (e.target.closest(".clip")) return;
      var r = $("lanes").getBoundingClientRect(), li = Math.floor((e.clientY - r.top) / TH());
      selectClip(null);
      if (P.tracks[li]) { selTrack = P.tracks[li].id; renderHeads(); markLanes(); }
      setPlayhead(snapT((e.clientX - r.left) / pps, e));
    });
    var lw = $("lanes-wrap");
    function dropLane(e) { var r = $("lanes").getBoundingClientRect(), li = Math.floor((e.clientY - r.top) / TH()); return P.tracks[Math.max(0, Math.min(P.tracks.length - 1, li))]; }
    function dropMark(tr) { document.querySelectorAll(".lane").forEach(function (l) { l.classList.toggle("drop", !!tr && l.dataset.id === tr.id); }); document.querySelectorAll(".trk").forEach(function (t) { t.classList.toggle("drop", !!tr && t.dataset.id === tr.id); }); }
    [lw, $("heads")].forEach(function (zone) {
      zone.addEventListener("dragover", function (e) { e.preventDefault(); dropMark(dropLane(e)); });
      zone.addEventListener("dragleave", function (e) { if (!zone.contains(e.relatedTarget)) dropMark(null); });
      zone.addEventListener("drop", function (e) {
        e.preventDefault(); dropMark(null);
        var tr = dropLane(e), r = $("lanes").getBoundingClientRect();
        if (tr) selTrack = tr.id;
        if (zone === lw) playhead = Math.max(0, snapT((e.clientX - r.left) / pps)); // dropped on a lane: at that time; on a track header: at the playhead
        importFiles(e.dataTransfer.files, tr && tr.id);
      });
    });
    $("clip-gain").addEventListener("change", function () {
      var c = selected(); if (!c) return;
      S.pushUndo(P, "clip gain"); c.gain = S.clamp(+$("clip-gain").value || 0, -40, 24); changed();
    });
    $("btn-recset").addEventListener("click", openRecSet);
    $("recset-close").addEventListener("click", function () { $("recset-sheet").hidden = true; });
    $("rs-count").addEventListener("change", function () { P.countIn = +$("rs-count").value; changed(null, true); });
    $("rs-latmode").addEventListener("change", function () { P.latencyMs = $("rs-latmode").value === "auto" ? null : Math.round(+$("rs-lat").value || 0); recSetUI(); changed(null, true); });
    $("rs-lat").addEventListener("change", function () { if (P.latencyMs != null) { P.latencyMs = S.clamp(Math.round(+$("rs-lat").value || 0), -200, 1000); changed(null, true); } recSetUI(); });
    $("rs-hpon").addEventListener("change", function () {
      hp.manual = $("rs-hpon").checked ? true : (hp.found ? false : null);
      try { if (hp.manual == null) localStorage.removeItem("ipbs_hp"); else localStorage.setItem("ipbs_hp", hp.manual ? "1" : "0"); } catch (e) { /* ignore */ }
      hpUI();
    });
    $("rs-autoclean").addEventListener("change", function () { P.autoClean = $("rs-autoclean").checked; changed(null, true); });
    if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) navigator.mediaDevices.addEventListener("devicechange", function () { hpDetect(); });
    hpDetect();
    $("btn-clean").addEventListener("click", function () { cleanClip(selClip); });
    $("wv-clean").addEventListener("click", function () { cleanClip(waveClip || selClip); });
    $("clean-close").addEventListener("click", function () { E.stopBuffer(); $("clean-sheet").hidden = true; });
    $("cl-play").addEventListener("click", clPlay);
    $("cl-stop").addEventListener("click", function () { E.stopBuffer(); $("cl-play").textContent = "▶ Play"; });
    $("cl-raw").addEventListener("click", clUseRaw);
    document.querySelectorAll("#cl-ab [data-ab]").forEach(function (b) { b.addEventListener("click", function () { clSetAB(b.dataset.ab); if (E.bufferPos() != null) clPlay(); }); });
    $("rs-nudge-m").addEventListener("click", function () { nudgeTake(-0.005); });
    $("rs-nudge-p").addEventListener("click", function () { nudgeTake(0.005); });
    lw.addEventListener("wheel", function (e) { if (e.ctrlKey || e.metaKey) { e.preventDefault(); var r = $("lanes").getBoundingClientRect(); zoomTo(pps * (e.deltaY < 0 ? 1.25 : 0.8), (e.clientX - r.left) / pps); } }, { passive: false });
    waveEd = new S.WaveEditor($("wave"), { onSel: waveInfo });
    document.querySelectorAll("#view-wave [data-op]").forEach(function (b) { b.addEventListener("click", function () { waveOp(b.dataset.op); }); });
    $("wv-play").addEventListener("click", wavePlay);
    $("wv-stop").addEventListener("click", function () { E.stopBuffer(); waveEd.play = null; waveEd.draw(); });
    $("wv-zin").addEventListener("click", function () { waveEd.zoom(0.5); });
    $("wv-zout").addEventListener("click", function () { waveEd.zoom(2); });
    $("wv-zsel").addEventListener("click", function () { waveEd.zoomSel(); });
    $("wv-zfit").addEventListener("click", function () { waveEd.fit(); });
    $("wv-all").addEventListener("click", function () { if (waveBuf) waveEd.setSel(0, waveBuf.length); });
    $("wv-back").addEventListener("click", function () { setView("multi"); });
    $("fx-close").addEventListener("click", function () { $("fx-sheet").hidden = true; });
    $("fx-preset").addEventListener("change", function (e) { if (e.target.value) applyPreset(e.target.value); });
    $("vault-close").addEventListener("click", function () { $("vault-sheet").hidden = true; });
    $("open-close").addEventListener("click", function () { $("open-sheet").hidden = true; });
    $("export-close").addEventListener("click", function () { $("export-sheet").hidden = true; });
    document.querySelectorAll(".st-sheet").forEach(function (s) { s.addEventListener("click", function (e) { if (e.target === s) s.hidden = true; }); });
    $("btn-export").addEventListener("click", function () { $("export-sheet").hidden = false; $("ex-status").textContent = ""; $("ex-range").value = P.loop.on ? "loop" : "all"; });
    $("ex-go").addEventListener("click", exportMix);
    $("ex-player").addEventListener("click", function () { sendMix("player"); });
    $("ex-dj").addEventListener("click", function () { sendMix("dj"); });
    $("btn-open").addEventListener("click", openList);
    $("btn-new").addEventListener("click", function () { saveNow().then(function () { setProject(S.newProject()); saveNow(); toast("New project. Your previous one is saved under Open…"); }); });
    $("btn-save-file").addEventListener("click", function () {
      if (!P.clips.length) { toast("Add some audio first."); return; }
      S.download(S.exportProjectFile(P), (P.name || "project").replace(/[^\w\- ]+/g, "") + ".ipbstudio"); toast("Project file downloaded (audio included).");
    });
    $("proj-file").addEventListener("change", function (e) {
      var f = e.target.files[0]; e.target.value = ""; if (!f) return;
      f.arrayBuffer().then(function (ab) { var p = S.importProjectFile(ab); p.id = S.uid("p"); setProject(p); $("open-sheet").hidden = true; return saveNow(); })
        .then(function () { toast("Opened " + P.name); }).catch(function (err) { toast(err.message || "Could not open that file."); });
    });
    $("btn-howto").addEventListener("click", function () { var h = $("howto"); h.hidden = !h.hidden; $("btn-howto").setAttribute("aria-expanded", String(!h.hidden)); try { localStorage.setItem("ipbs_howto", h.hidden ? "0" : "1"); } catch (e) { /* ignore */ } setTimeout(function () { renderRuler(); waveEd.draw(); }, 0); });
    $("howto-close").addEventListener("click", function () { $("howto").hidden = true; try { localStorage.setItem("ipbs_howto", "0"); } catch (e) { /* ignore */ } setTimeout(renderRuler, 0); });
    document.addEventListener("mouseover", function (e) { var t = e.target.closest && e.target.closest("[title]"); if (t && view === "multi" && t.closest(".st-transport, .st-tools, .trk, .st-proj")) hint(t.title); });
    window.addEventListener("resize", function () { renderRuler(); });
    document.addEventListener("keydown", function (e) {
      if (!P) return;
      var tag = (e.target.tagName || "").toLowerCase();
      if ((tag === "input" && e.target.type !== "range") || tag === "select" || tag === "textarea") return;
      if (document.querySelector(".st-sheet:not([hidden])")) { if (e.key === "Escape") document.querySelectorAll(".st-sheet").forEach(function (s) { s.hidden = true; }); return; }
      var k = e.key, mod = e.ctrlKey || e.metaKey;
      if (k === " ") { e.preventDefault(); if (view === "wave") { if (E.bufferPos() != null) E.stopBuffer(); else wavePlay(); } else play(); }
      else if (mod && (k === "z" || k === "Z")) { e.preventDefault(); if (e.shiftKey) doRedo(); else doUndo(); }
      else if (mod && (k === "y" || k === "Y")) { e.preventDefault(); doRedo(); }
      else if (view === "wave") {
        if (mod && k === "c") waveOp("copy"); else if (mod && k === "x") waveOp("cut"); else if (mod && k === "v") waveOp("paste");
        else if (mod && k === "a") { e.preventDefault(); if (waveBuf) waveEd.setSel(0, waveBuf.length); }
        else if (k === "Delete" || k === "Backspace") { e.preventDefault(); waveOp("delete"); }
      } else {
        if (mod && k === "c") copyClip(); else if (mod && k === "v") pasteClip(); else if (mod && k === "d") { e.preventDefault(); dupClip(); }
        else if (mod && k === "x") { copyClip(); delClip(); }
        else if (k === "Delete" || k === "Backspace") { e.preventDefault(); delClip(); }
        else if (!mod && (k === "s" || k === "S")) split();
        else if (!mod && (k === "r" || k === "R")) record();
        else if (!mod && (k === "l" || k === "L")) $("t-loop").click();
        else if (!mod && (k === "m" || k === "M")) $("t-metro").click();
        else if (k === "Home") setPlayhead(0);
        else if (k === "Escape") selectClip(null);
      }
    });
    window.addEventListener("beforeunload", function () { if (saveTimer) saveNow(); });
  }
  function init() {
    if (EMBED) document.body.classList.add("embed");
    bind();
    try { if (localStorage.getItem("ipbs_howto") !== "0" && window.innerWidth > 1100) $("howto").hidden = false; } catch (e) { /* ignore */ }
    var last = null; try { last = localStorage.getItem("ipbs_last"); } catch (e) { /* ignore */ }
    var q = new URLSearchParams(location.search);
    (last ? S.loadProject(last).catch(function () { return S.newProject(); }) : Promise.resolve(S.newProject())).then(function (p) {
      setProject(p);
      $("save-state").textContent = last ? "Saved ✓" : "Not saved yet"; if (last) $("save-state").classList.add("ok");
      meterLoop();
      var vid = q.get("vault");
      if (vid) {
        history.replaceState(null, "", location.pathname);
        return S.vaultList().then(function (items) {
          var it = items.filter(function (x) { return x.id === vid; })[0];
          if (!it) { toast("That bounce wasn't found in the Vault."); return; }
          var at = P.clips.length ? E.projectEnd(P) : 0;
          return importVaultItem(it, snapT(at), P.clips.length ? selTrack : beatTrackId()).then(function (c) { if (c) { zoomFit(); toast("Beat from the beat maker added to " + trackById(c.track).name + ". Arm a track and press ● to record.", 4000); } });
        });
      }
      if (q.get("demo") === "gunwalk" && !P.clips.length) { history.replaceState(null, "", location.pathname); return importGunwalk().then(zoomFit); }
    }).then(function () { window.IPBStudio.ready = true; });
  }

  /* test / automation hook */
  window.IPBStudio = {
    ready: false,
    project: function () { return P; },
    state: function () {
      return { tracks: P.tracks.length, clips: P.clips.map(function (c) { return { id: c.id, track: P.tracks.indexOf(trackById(c.track)), name: c.name, start: +c.start.toFixed(4), dur: +c.dur.toFixed(4), offset: +c.offset.toFixed(4), fadeIn: c.fadeIn, fadeOut: c.fadeOut, src: c.src, clean: c.clean || null, orig: !!c.orig }; }),
        selClip: selClip, selTrack: P.tracks.indexOf(trackById(selTrack)), playhead: playhead, playing: E.playing, recording: E.recording, view: view, pps: pps, bpm: P.bpm, loop: P.loop, undo: S.H.undo.length, redo: S.H.redo.length,
        wave: waveBuf ? { len: waveBuf.length, sr: waveBuf.sampleRate, sel: [waveEd.sel.a, waveEd.sel.b] } : null, sources: Object.keys(S.sources).length, name: P.name, id: P.id };
    },
    lastExport: function () { return lastExport; }, lastSent: function () { return lastSent; }, sendMix: sendMix,
    selectClip: function (id) { selectClip(id); }, setPlayhead: setPlayhead, openWave: openWave, waveSel: function (a, b) { waveEd.setSel(a, b); },
    peak: function (id) { var c = clipById(id), s = c && S.sources[c.src]; if (!s) return 0; var sr = s.buf.sampleRate; return OPS.peakOf(s.buf, Math.round(c.offset * sr), Math.round((c.offset + c.dur) * sr)); },
    rms: function (id, a, b) { var c = clipById(id), s = c && S.sources[c.src]; if (!s) return 0; var sr = s.buf.sampleRate, d = s.buf.getChannelData(0), i0 = Math.round((c.offset + (a || 0)) * sr), i1 = Math.round((c.offset + (b == null ? c.dur : b)) * sr), ss = 0; for (var i = i0; i < i1; i++) ss += d[i] * d[i]; return Math.sqrt(ss / Math.max(1, i1 - i0)); },
    pause: function () { if (E.playing && !E.recording) pause(); }, isRecording: function () { return E.recording; },
    bounceFromBeats: bounceFromBeats,
    importVaultId: function (id) { // Beats' "Send to Studio": put that bounce on Track 1 at 0:00 (or the end of the song if Track 1 already has audio)
      return S.vaultList().then(function (items) {
        var it = items.filter(function (x) { return x.id === id; })[0]; if (!it) { toast("That bounce wasn't found in the Vault."); return null; }
        var at = overlaps(beatTrackId(), 0, 0.01) ? snapT(E.projectEnd(P)) : 0;
        return importVaultItem(it, at, beatTrackId()).then(function (c) { if (c) { setView("multi"); zoomFit(); toast("Beat added to " + trackById(c.track).name + ". Arm Vocals (R) and press ● to record.", 4000); } return c; });
      });
    }, importGunwalk: importGunwalk, importFiles: importFiles, revertClip: revertClip, lastTake: function () { return lastTake; },
    arm: function (i, on) { var t = P.tracks[i]; if (t) { t.arm = on !== false; render(); } }, record: record, stop: stopAll, play: play, latency: function () { return E.ctx ? E.latency() : null; },
    addTake: function (data, sr, start, ti, name) { // tests: put a mono "recording" on track ti as if it had just been recorded
      S.pushUndo(P, "record"); var buf = S.bufFrom([data], sr), id = S.addSource(buf, name || "Take " + (takeN++)), tr = P.tracks[ti] || P.tracks[0];
      var c = { id: S.uid("c"), track: tr.id, src: id, start: start || 0, offset: 0, dur: buf.duration, gain: 0, fadeIn: 0.005, fadeOut: 0.01, name: name || "Take" };
      P.clips.push(c); selClip = c.id; selTrack = tr.id; changed(); return c.id;
    },
    cleanClip: cleanClip, cleanState: function () { return { busy: CL.busy, last: CL.last || null, speaker: speakerMode(), hp: { found: hp.found, label: hp.label, manual: hp.manual } }; },
    setHeadphones: function (v) { hp.manual = v == null ? null : !!v; hpUI(); return speakerMode(); }, hpDetect: hpDetect,
    saveNow: saveNow, render: render, meters: function () { return E.ctx ? E.meters() : null; }, zoomFit: zoomFit
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
