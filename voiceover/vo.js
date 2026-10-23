/* Voice Over Studio — step 1. All local: video + takes stay in this browser (IndexedDB). Mic is RAW. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var COLAB_URL = "https://colab.research.google.com/github/madinc47-prog/madinc47-prog.github.io/blob/main/isle-voice/colab/IsleVoice_RVC.ipynb";
  var SR = 48000;
  var ctx = null, master, origGain, duckGain, exportDest, origSrcNode = null;
  var vid = $("vid"), videoBlob = null, videoName = "", videoURL = "", origBuf = null, origPeaks = null;
  var S = { origVol: 1, origMute: false, duck: true, depth: 0.85, rights: false, mic: "", countin: 3, preroll: 2, lat: 0 };
  var takes = [], bufs = {}, peaks = {}, sel = null, undoS = [], redoS = [];
  var playing = false, srcs = [], recState = null, exporting = null;
  var micStream = null, micAn = null, micSrc = null;

  function toast(t, ms) { var e = $("toast"); e.textContent = t; e.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { e.hidden = true; }, ms || 3200); }
  function fmt(t, d) { t = Math.max(0, t || 0); var m = Math.floor(t / 60), s = t - m * 60; return m + ":" + (s < 10 ? "0" : "") + (d ? s.toFixed(1) : Math.floor(s)); }
  function dur() { return isFinite(vid.duration) ? vid.duration : 0; }
  function uid() { return "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  /* ---------- audio graph ---------- */
  function ac() {
    if (ctx) { if (ctx.state === "suspended") ctx.resume(); return ctx; }
    ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: SR, latencyHint: "interactive" });
    master = ctx.createGain(); master.connect(ctx.destination);
    exportDest = ctx.createMediaStreamDestination(); master.connect(exportDest);
    origGain = ctx.createGain(); duckGain = ctx.createGain(); origGain.connect(duckGain); duckGain.connect(master);
    origSrcNode = ctx.createMediaElementSource(vid); origSrcNode.connect(origGain);
    applyOrig(); return ctx;
  }
  function applyOrig() { if (origGain) origGain.gain.value = S.origMute ? 0 : S.origVol; }
  function duckRegions() {
    var r = [];
    takes.forEach(function (t) { if (!t.mute) r.push([t.at, t.at + t.len]); });
    r.sort(function (a, b) { return a[0] - b[0]; });
    var m = []; r.forEach(function (x) { var l = m[m.length - 1]; if (l && x[0] <= l[1] + 0.4) l[1] = Math.max(l[1], x[1]); else m.push(x.slice()); });
    return m;
  }
  /* schedule the dip on an AudioParam; t0 = ctx time corresponding to timeline time p0 */
  function scheduleDuck(param, t0, p0, now) {
    var low = 1 - S.depth, A = 0.15, R = 0.3;
    param.cancelScheduledValues(0);
    if (!S.duck) { param.setValueAtTime(1, now); return; }
    var regs = duckRegions(), v0 = 1;
    regs.forEach(function (g) { if (p0 >= g[0] - A && p0 <= g[1] + R) v0 = low; });
    param.setValueAtTime(v0, now);
    regs.forEach(function (g) {
      var a = t0 + (g[0] - A - p0), b = t0 + (g[1] - p0);
      if (b + R <= now) return;
      if (a > now) { param.setValueAtTime(1, a); param.linearRampToValueAtTime(low, a + A); }
      if (b > now) { param.setValueAtTime(low, b); param.linearRampToValueAtTime(1, b + R); }
    });
  }
  function scheduleTake(c, dest, t, t0, p0, now) {
    var b = bufs[t.id]; if (!b || t.mute) return null;
    var end = t.at + t.len; if (end <= p0) return null;
    var startTL = Math.max(p0, t.at), when = Math.max(now, t0 + (startTL - p0)), off = t.in + (startTL - t.at), len = end - startTL;
    var s = c.createBufferSource(); s.buffer = b; var g = c.createGain(); s.connect(g); g.connect(dest);
    var v = t.vol, fi = Math.min(t.fi, t.len / 2), fo = Math.min(t.fo, t.len / 2), ws = t0 + (t.at - p0);
    var gp = g.gain;
    gp.setValueAtTime(fi > 0 && startTL < t.at + fi ? v * (startTL - t.at) / fi : v, when);
    if (fi > 0 && startTL < t.at + fi) gp.linearRampToValueAtTime(v, ws + fi);
    if (fo > 0) { var fs = Math.max(when, ws + t.len - fo); gp.setValueAtTime(fs === when && startTL > t.at + t.len - fo ? v * (end - startTL) / fo : v, fs); gp.linearRampToValueAtTime(0, ws + t.len); }
    s.start(when, off, len); return s;
  }
  function stopSrcs() { srcs.forEach(function (s) { try { s.stop(); } catch (e) {} }); srcs = []; }
  function startPlayback(skipTakeId) {
    var c = ac(), now = c.currentTime + 0.05, p0 = vid.currentTime;
    stopSrcs();
    takes.forEach(function (t) { if (t.id !== skipTakeId) { var s = scheduleTake(c, master, t, now, p0, now); if (s) srcs.push(s); } });
    scheduleDuck(duckGain.gain, now, p0, c.currentTime);
  }
  function play() {
    if (!videoBlob || exporting) return; ac();
    var p = vid.play(); playing = true; $("b-play").textContent = "⏸ Pause";
    (p && p.then ? p : Promise.resolve()).then(function () { startPlayback(); }).catch(function (e) { toast("Can't play: " + e.message); pause(); });
  }
  function pause() {
    vid.pause(); playing = false; stopSrcs(); $("b-play").textContent = "▶ Play";
    if (duckGain) { duckGain.gain.cancelScheduledValues(0); duckGain.gain.value = 1; }
  }
  function seek(t) { t = Math.max(0, Math.min(dur(), t)); vid.currentTime = t; if (playing) startPlayback(); draw(); }
  vid.addEventListener("ended", function () { if (recState) stopRec(); else pause(); });
  vid.addEventListener("seeked", function () { if (playing && !recState && !exporting) startPlayback(); });

  /* ---------- mic (RAW) ---------- */
  function micConstraints(id) {
    var a = { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: { ideal: 1 }, sampleRate: { ideal: SR }, sampleSize: 16, latency: 0 };
    if (id) a.deviceId = { exact: id };
    a.googEchoCancellation = false; a.googAutoGainControl = false; a.googNoiseSuppression = false; a.googHighpassFilter = false;
    return { audio: a, video: false };
  }
  function listMics() {
    return navigator.mediaDevices.enumerateDevices().then(function (ds) {
      var ins = ds.filter(function (d) { return d.kind === "audioinput"; }), sl = $("mic");
      sl.innerHTML = "";
      ins.forEach(function (d, i) { var o = document.createElement("option"); o.value = d.deviceId; o.textContent = d.label || ("Mic " + (i + 1)); sl.appendChild(o); });
      var pick = ins.filter(function (d) { return d.deviceId === S.mic; })[0] ||
        ins.filter(function (d) { return /head|wired|usb|bluetooth|earbud|ear/i.test(d.label) && d.deviceId !== "default" && d.deviceId !== "communications"; })[0] || ins[0];
      if (pick) { sl.value = pick.deviceId; }
      return pick ? pick.deviceId : "";
    });
  }
  function openMic() {
    if (micStream && micStream.active) return Promise.resolve(micStream);
    var c = ac();
    var go = function (id) { return navigator.mediaDevices.getUserMedia(micConstraints(id)); };
    return go(S.mic || "").catch(function () { return go(""); }).then(function (st) {
      micStream = st;
      return listMics().then(function (best) {
        var cur = st.getAudioTracks()[0].getSettings().deviceId;
        if (!S.mic && best && cur !== best) { st.getTracks().forEach(function (t) { t.stop(); }); return go(best).then(function (s2) { micStream = s2; return s2; }, function () { return go("").then(function (s3) { micStream = s3; return s3; }); }); }
        return st;
      });
    }).then(function (st) {
      if (micSrc) try { micSrc.disconnect(); } catch (e) {}
      micSrc = c.createMediaStreamSource(st); micAn = c.createAnalyser(); micAn.fftSize = 1024; micSrc.connect(micAn);
      var tr = st.getAudioTracks()[0]; S.mic = tr.getSettings().deviceId || S.mic; $("mic").value = S.mic; save();
      return st;
    });
  }
  var mbuf = new Float32Array(1024);
  function meterLoop() {
    if (micAn) { micAn.getFloatTimeDomainData(mbuf); var pk = 0; for (var i = 0; i < mbuf.length; i++) pk = Math.max(pk, Math.abs(mbuf[i])); $("meter").style.width = Math.min(100, pk * 100) + "%"; }
    if (videoBlob) { $("t-now").textContent = fmt(vid.currentTime, 1); }
    draw(); requestAnimationFrame(meterLoop);
  }

  /* ---------- recording ---------- */
  function beep(c, when, hi) { var o = c.createOscillator(), g = c.createGain(); o.frequency.value = hi ? 1320 : 880; g.gain.setValueAtTime(0.0001, when); g.gain.exponentialRampToValueAtTime(0.4, when + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, when + 0.12); o.connect(g); g.connect(c.destination); o.start(when); o.stop(when + 0.15); }
  function startRec() {
    if (!videoBlob) return toast("Load a video first.");
    if (recState) return stopRec();
    pause();
    openMic().then(function (st) {
      var c = ac(), punch = vid.currentTime, pre = Math.min(S.preroll, punch), from = punch - pre, n = +S.countin;
      vid.currentTime = from;
      var mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].filter(function (m) { return window.MediaRecorder && MediaRecorder.isTypeSupported(m); })[0] || "";
      var mr = new MediaRecorder(st, mime ? { mimeType: mime, audioBitsPerSecond: 256000 } : {});
      var chunks = []; mr.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
      recState = { mr: mr, chunks: chunks, from: from, punch: punch, startV: null };
      $("b-rec").classList.add("on"); $("b-rec").textContent = "■ Stop";
      var beat = 0.6, t0 = c.currentTime + 0.1, ce = $("count");
      for (var i = 0; i < n; i++) beep(c, t0 + i * beat, i === 0);
      var k = n; ce.hidden = !n; ce.textContent = k;
      var iv = n ? setInterval(function () { k--; if (k > 0) ce.textContent = k; else clearInterval(iv); }, beat * 1000) : 0;
      setTimeout(function () {
        if (!recState) return; ce.hidden = true;
        mr.onstart = function () { recState.startV = vid.currentTime; recState.startC = c.currentTime; };
        mr.start(500);
        vid.play().then(function () { playing = true; $("b-play").textContent = "⏸ Pause"; startPlayback(); $("recdot").hidden = false; });
      }, n ? n * beat * 1000 + 100 : 0);
    }).catch(function (e) { toast("Mic blocked: " + e.message); });
  }
  function stopRec() {
    var r = recState; if (!r) return; recState = null;
    $("b-rec").classList.remove("on"); $("b-rec").textContent = "● Record"; $("recdot").hidden = true; $("count").hidden = true;
    var endV = vid.currentTime; pause();
    if (r.mr.state === "inactive") return;
    r.mr.onstop = function () {
      var blob = new Blob(r.chunks, { type: r.mr.mimeType || "audio/webm" });
      var lat = ((ctx.outputLatency || 0) + (ctx.baseLatency || 0)) + S.lat / 1000;
      var sv = r.startV == null ? r.from : r.startV;
      addTakeFromBlob(blob, "Take " + (takes.length + 1), sv - lat, Math.max(0, r.punch - sv + lat), endV);
    };
    r.mr.stop();
  }
  function decode(blob) { return blob.arrayBuffer().then(function (ab) { return ac().decodeAudioData(ab); }); }
  function mkPeaks(b, per) { var d = b.getChannelData(0), n = Math.ceil(d.length / per), p = new Float32Array(n); for (var i = 0; i < n; i++) { var m = 0, e = Math.min(d.length, (i + 1) * per); for (var j = i * per; j < e; j += 4) { var v = Math.abs(d[j]); if (v > m) m = v; } p[i] = m; } return p; }
  function addTakeFromBlob(blob, name, bufStart, trimIn, endV) {
    return decode(blob).then(function (b) {
      snap();
      var id = uid(), at = bufStart + trimIn, inn = trimIn;
      if (at < 0) { inn -= at; at = 0; }
      var len = b.duration - inn; if (endV != null) len = Math.min(len, endV - at);
      if (len <= 0.05) { undoS.pop(); return toast("Take too short."); }
      var t = { id: id, name: name, at: at, in: inn, len: len, vol: 1, fi: 0.02, fo: 0.05, mute: false, blob: blob };
      bufs[id] = b; peaks[id] = mkPeaks(b, 480); takes.push(t); select(id); save(); toast(name + " added at " + fmt(at, 1));
    }).catch(function (e) { toast("Couldn't read that audio: " + e.message); });
  }

  /* ---------- undo ---------- */
  function meta() { return takes.map(function (t) { var o = {}; for (var k in t) o[k] = t[k]; return o; }); }
  function snap() { undoS.push(meta()); if (undoS.length > 80) undoS.shift(); redoS = []; }
  function restore(st) { takes = st; if (sel && !takes.some(function (t) { return t.id === sel; })) sel = null; ensureBufs().then(function () { select(sel); save(); }); }
  function undo() { if (!undoS.length) return; redoS.push(meta()); restore(undoS.pop()); }
  function redo() { if (!redoS.length) return; undoS.push(meta()); restore(redoS.pop()); }
  function ensureBufs() { return Promise.all(takes.map(function (t) { if (bufs[t.id]) return 0; return decode(t.blob).then(function (b) { bufs[t.id] = b; peaks[t.id] = mkPeaks(b, 480); }).catch(function () {}); })); }

  /* ---------- selected take editor ---------- */
  function cur() { return takes.filter(function (t) { return t.id === sel; })[0]; }
  function select(id) {
    sel = id; var t = cur(); $("take-ed").hidden = !t; $("take-none").hidden = !!t;
    if (t) { $("tk-name").value = t.name; $("tk-vol").value = t.vol; $("tk-fi").value = t.fi; $("tk-fo").value = t.fo; $("tk-mute").textContent = t.mute ? "Unmute" : "Mute"; $("tk-mute").classList.toggle("on", t.mute); labels(); }
    if (playing) startPlayback(); draw();
  }
  function labels() { var t = cur(); if (!t) return; $("tk-vol-v").textContent = Math.round(t.vol * 100) + "%"; $("tk-fi-v").textContent = (+t.fi).toFixed(2) + "s"; $("tk-fo-v").textContent = (+t.fo).toFixed(2) + "s"; }
  function bindTk(id, key) {
    $(id).addEventListener("pointerdown", function () { if (cur()) snap(); });
    $(id).addEventListener("input", function () { var t = cur(); if (!t) return; t[key] = +this.value; labels(); if (playing) startPlayback(); });
    $(id).addEventListener("change", save);
  }
  bindTk("tk-vol", "vol"); bindTk("tk-fi", "fi"); bindTk("tk-fo", "fo");
  $("tk-name").addEventListener("change", function () { var t = cur(); if (t) { snap(); t.name = this.value || t.name; save(); } });
  $("tk-mute").onclick = function () { var t = cur(); if (!t) return; snap(); t.mute = !t.mute; select(t.id); save(); };
  $("tk-del").onclick = function () { var t = cur(); if (!t) return; snap(); takes = takes.filter(function (x) { return x !== t; }); select(null); save(); toast("Deleted — Undo brings it back."); };
  function nudge(d) { var t = cur(); if (!t) return; snap(); t.at = Math.max(0, t.at + d); save(); if (playing) startPlayback(); }
  $("tk-nudge-l").onclick = function () { nudge(-0.05); }; $("tk-nudge-r").onclick = function () { nudge(0.05); };
  $("tk-split").onclick = function () {
    var t = cur(), p = vid.currentTime; if (!t || p <= t.at + 0.05 || p >= t.at + t.len - 0.05) return toast("Put the playhead inside the selected take.");
    snap(); var n = {}; for (var k in t) n[k] = t[k]; var cut = p - t.at;
    n.id = uid(); n.at = p; n.in = t.in + cut; n.len = t.len - cut; n.name = t.name + " b"; t.len = cut;
    bufs[n.id] = bufs[t.id]; peaks[n.id] = peaks[t.id]; takes.push(n); select(n.id); save();
  };
  $("tk-colab").href = COLAB_URL;
  $("tk-dl").onclick = function () {
    var t = cur(), b = t && bufs[t.id]; if (!b) return;
    var s0 = Math.floor(t.in * b.sampleRate), s1 = Math.min(b.length, Math.floor((t.in + t.len) * b.sampleRate));
    var ch = []; for (var c = 0; c < b.numberOfChannels; c++) ch.push(b.getChannelData(c).subarray(s0, s1));
    dl(wav(ch, b.sampleRate), (t.name || "take").replace(/[^\w-]+/g, "_") + ".wav");
  };
  $("tk-imp").onchange = function (e) {
    var f = e.target.files[0], t = cur(); e.target.value = ""; if (!f || !t) return;
    decode(f).then(function (b) { snap(); var id = uid(), n = {}; for (var k in t) n[k] = t[k]; n.id = id; n.in = 0; n.len = Math.min(b.duration, t.len + 0.5); n.blob = f; n.name = t.name + " (matched)"; bufs[id] = b; peaks[id] = mkPeaks(b, 480); takes[takes.indexOf(t)] = n; select(id); save(); toast("Matched voice swapped in — Undo to go back."); }).catch(function (er) { toast("Couldn't read: " + er.message); });
  };

  /* ---------- timeline ---------- */
  var cv = $("tl"), g = cv.getContext("2d"), pps = 40, scroll = 0, RUL = 22, OY = 26, OH = 50, VY = 84, VH = 76, dpr = 1, drag = null, pts = {};
  function fit() { dpr = window.devicePixelRatio || 1; var w = cv.clientWidth, h = cv.clientHeight; cv.width = w * dpr; cv.height = h * dpr; }
  window.addEventListener("resize", function () { fit(); draw(); });
  function x2t(x) { return scroll + x / pps; } function t2x(t) { return (t - scroll) * pps; }
  function draw() {
    if (!cv.width) fit();
    var W = cv.width / dpr, H = cv.height / dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = "#0d1020"; g.fillRect(0, 0, W, H);
    if (playing) { var px = t2x(vid.currentTime); if (px > W * 0.85 || px < 0) scroll = Math.max(0, vid.currentTime - (W * 0.15) / pps); }
    var D = dur(); g.fillStyle = "#161b2e"; g.fillRect(0, 0, W, RUL);
    var step = pps > 80 ? 1 : pps > 25 ? 5 : pps > 8 ? 10 : 30; g.fillStyle = "#8a93b3"; g.font = "11px system-ui"; g.strokeStyle = "#2a3150";
    for (var s = Math.floor(scroll / step) * step; t2x(s) < W; s += step) { var x = t2x(s); g.beginPath(); g.moveTo(x + .5, 12); g.lineTo(x + .5, H); g.stroke(); g.fillText(fmt(s), x + 3, 11); }
    g.fillStyle = "#1b2a3a"; g.fillRect(t2x(0), OY, Math.max(0, D * pps), OH);
    g.fillStyle = "#8a93b3"; g.fillText("ORIGINAL" + (S.origMute ? " (muted)" : ""), 6, OY + 12);
    if (origPeaks) { g.fillStyle = "#3d6e94"; var per = origPeaks.rate; for (var x2 = 0; x2 < W; x2++) { var i = Math.floor(x2t(x2) * per); if (i < 0 || i >= origPeaks.p.length) continue; var a = origPeaks.p[i] * OH / 2 * duckAt(x2t(x2)); g.fillRect(x2, OY + OH / 2 - a, 1, a * 2 || 1); } }
    if (S.duck) { g.fillStyle = "rgba(255,181,71,.12)"; duckRegions().forEach(function (r) { g.fillRect(t2x(r[0]), OY, (r[1] - r[0]) * pps, OH); }); }
    g.fillStyle = "#8a93b3"; g.fillText("VO TRACK", 6, VY - 3);
    takes.forEach(function (t) {
      var x = t2x(t.at), w = t.len * pps, on = t.id === sel; if (x > W || x + w < 0) return;
      g.fillStyle = t.mute ? "#3a3a44" : on ? "#6b4a12" : "#4a3712"; g.fillRect(x, VY, w, VH);
      var p = peaks[t.id], b = bufs[t.id];
      if (p && b) { g.fillStyle = t.mute ? "#777" : "#ffb547"; var r = b.sampleRate / 480; for (var xx = Math.max(0, x); xx < Math.min(W, x + w); xx++) { var ti = t.in + (xx - x) / pps, k = Math.floor(ti * r); if (k >= p.length) break; var aa = Math.min(1, p[k] * t.vol) * (VH / 2 - 4); g.fillRect(xx, VY + VH / 2 - aa, 1, aa * 2 || 1); } }
      g.strokeStyle = "rgba(255,255,255,.6)"; g.beginPath(); g.moveTo(x, VY + VH); g.lineTo(x + Math.min(t.fi, t.len) * pps, VY); g.lineTo(x + w - Math.min(t.fo, t.len) * pps, VY); g.lineTo(x + w, VY + VH); g.stroke();
      g.strokeStyle = on ? "#4fd1ff" : "#ffb547"; g.lineWidth = on ? 2 : 1; g.strokeRect(x + .5, VY + .5, w - 1, VH - 1); g.lineWidth = 1;
      if (on) { g.fillStyle = "#4fd1ff"; g.fillRect(x, VY, 8, VH); g.fillRect(x + w - 8, VY, 8, VH); }
      g.fillStyle = "#fff"; g.fillText(t.name, x + 10, VY + 13);
    });
    var ph = t2x(vid.currentTime || 0); g.fillStyle = recState ? "#ff3b5c" : "#4fd1ff"; g.fillRect(ph - 1, 0, 2, H);
  }
  function duckAt(t) { if (!S.duck) return 1; var r = duckRegions(); for (var i = 0; i < r.length; i++) if (t >= r[i][0] && t <= r[i][1]) return 1 - S.depth; return 1; }
  function hit(x, y) {
    if (y < VY || y > VY + VH) return null;
    for (var i = takes.length - 1; i >= 0; i--) { var t = takes[i], a = t2x(t.at), b = a + t.len * pps; if (x >= a - 6 && x <= b + 6) { var E = Math.min(22, (b - a) / 3); return { t: t, mode: x < a + E ? "l" : x > b - E ? "r" : "m" }; } }
    return null;
  }
  cv.addEventListener("pointerdown", function (e) {
    cv.setPointerCapture(e.pointerId); var r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    pts[e.pointerId] = x; var ids = Object.keys(pts);
    if (ids.length === 2) { drag = { mode: "pinch", d0: Math.abs(pts[ids[0]] - pts[ids[1]]) || 1, pps0: pps, c: x2t((pts[ids[0]] + pts[ids[1]]) / 2) }; return; }
    if (y < RUL) { drag = { mode: "scrub" }; seek(x2t(x)); return; }
    var h = hit(x, y);
    if (h) { snap(); select(h.t.id); drag = { mode: h.mode, t: h.t, x0: x, at: h.t.at, inn: h.t.in, len: h.t.len, moved: false }; return; }
    drag = { mode: "pan", x0: x, s0: scroll, moved: false };
  });
  cv.addEventListener("pointermove", function (e) {
    if (!drag) return; var r = cv.getBoundingClientRect(), x = e.clientX - r.left; pts[e.pointerId] = x;
    if (drag.mode === "pinch") { var ids = Object.keys(pts); if (ids.length < 2) return; var d = Math.abs(pts[ids[0]] - pts[ids[1]]) || 1; setZoom(drag.pps0 * d / drag.d0, drag.c); return; }
    if (drag.mode === "scrub") return seek(x2t(x));
    var dt = (x - drag.x0) / pps; if (Math.abs(x - drag.x0) > 4) drag.moved = true;
    if (drag.mode === "pan") { scroll = Math.max(0, drag.s0 - dt); return draw(); }
    var t = drag.t, b = bufs[t.id], bl = b ? b.duration : 1e9;
    if (drag.mode === "m") t.at = Math.max(0, drag.at + dt);
    else if (drag.mode === "l") { var d2 = Math.max(-drag.inn, Math.min(drag.len - 0.1, dt)); if (drag.at + d2 < 0) d2 = -drag.at; t.at = drag.at + d2; t.in = drag.inn + d2; t.len = drag.len - d2; }
    else if (drag.mode === "r") t.len = Math.max(0.1, Math.min(bl - t.in, drag.len + dt));
    draw();
  });
  function up(e) {
    delete pts[e.pointerId]; if (!drag) return;
    if (drag.mode === "pan" && !drag.moved) { var r = cv.getBoundingClientRect(); seek(x2t(e.clientX - r.left)); }
    if (drag.t) { if (!drag.moved) undoS.pop(); else { save(); if (playing) startPlayback(); } }
    if (!Object.keys(pts).length) drag = null;
  }
  cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
  function setZoom(p, center) { var W = cv.width / dpr; if (center == null) center = x2t(W / 2); var cx = t2x(center); pps = Math.max(2, Math.min(400, p)); scroll = Math.max(0, center - cx / pps); draw(); }
  $("z-in").onclick = function () { setZoom(pps * 1.5); }; $("z-out").onclick = function () { setZoom(pps / 1.5); };

  /* ---------- video load ---------- */
  function setVideo(blob, name, fromSave) {
    videoBlob = blob; videoName = name || "video"; if (videoURL) URL.revokeObjectURL(videoURL);
    videoURL = URL.createObjectURL(blob); vid.src = videoURL; $("empty").hidden = true; origBuf = null; origPeaks = null;
    vid.onloadedmetadata = function () { $("t-dur").textContent = fmt(dur()); var W = cv.width / dpr || 800; if (!fromSave) pps = Math.max(4, Math.min(80, (W - 20) / Math.max(1, dur()))); draw(); };
    if (blob.size < 700 * 1048576) decode(blob).then(function (b) { origBuf = b; origPeaks = { p: mkPeaks(b, 480), rate: b.sampleRate / 480 }; draw(); }).catch(function () { origBuf = null; });
    if (!fromSave) idb("put", "video", { blob: blob, name: videoName });
  }
  $("f-video").onchange = function (e) {
    var f = e.target.files[0]; e.target.value = ""; if (!f) return; ac();
    if (takes.length && !confirm("Keep your current takes on the new video? (Cancel = clear them)")) { snap(); takes = []; select(null); }
    setVideo(f, f.name); save(); toast("Loaded " + f.name);
  };
  $("f-take").onchange = function (e) { var f = e.target.files[0]; e.target.value = ""; if (f) addTakeFromBlob(f, f.name.replace(/\.[^.]+$/, "").slice(0, 40), vid.currentTime || 0, 0, null); };

  /* ---------- export ---------- */
  function wav(ch, sr) {
    var n = ch[0].length, nc = ch.length, buf = new ArrayBuffer(44 + n * nc * 2), v = new DataView(buf), o = 0;
    function s(t) { for (var i = 0; i < t.length; i++) v.setUint8(o++, t.charCodeAt(i)); }
    s("RIFF"); v.setUint32(o, 36 + n * nc * 2, true); o += 4; s("WAVEfmt "); v.setUint32(o, 16, true); o += 4; v.setUint16(o, 1, true); o += 2; v.setUint16(o, nc, true); o += 2;
    v.setUint32(o, sr, true); o += 4; v.setUint32(o, sr * nc * 2, true); o += 4; v.setUint16(o, nc * 2, true); o += 2; v.setUint16(o, 16, true); o += 2; s("data"); v.setUint32(o, n * nc * 2, true); o += 4;
    for (var i = 0; i < n; i++) for (var c = 0; c < nc; c++) { var x = Math.max(-1, Math.min(1, ch[c][i])); v.setInt16(o, x < 0 ? x * 0x8000 : x * 0x7fff, true); o += 2; }
    return new Blob([buf], { type: "audio/wav" });
  }
  function dl(blob, name) { var a = document.createElement("a"), u = URL.createObjectURL(blob); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 60000); }
  function base() { return (videoName || "video").replace(/\.[^.]+$/, "").replace(/[^\w-]+/g, "_").slice(0, 40) + "_VO"; }
  function needRights() { if (!videoBlob) { toast("Load a video first."); return false; } if (!S.rights) { toast("Tick “I have the rights to use this video” first."); return false; } return true; }
  $("ex-wav").onclick = function () {
    if (!needRights()) return;
    var D = dur() || 1, oc = new OfflineAudioContext(2, Math.ceil(D * SR), SR), dg = oc.createGain(), og = oc.createGain();
    og.gain.value = S.origMute ? 0 : S.origVol; og.connect(dg); dg.connect(oc.destination);
    if (origBuf) { var s = oc.createBufferSource(); s.buffer = origBuf; s.connect(og); s.start(0); } else toast("Original audio couldn't be decoded — WAV has your takes only.");
    scheduleDuck(dg.gain, 0, 0, 0);
    takes.forEach(function (t) { scheduleTake(oc, oc.destination, t, 0, 0, 0); });
    busy("Mixing WAV…", 0.3);
    oc.startRendering().then(function (b) { dl(wav([b.getChannelData(0), b.getChannelData(1)], SR), base() + ".wav"); busy(); toast("WAV exported."); }).catch(function (e) { busy(); toast("WAV failed: " + e.message); });
  };
  function busy(t, p) { $("busy").hidden = !t; if (t) { $("busy-t").textContent = t; $("busy-p").style.width = Math.round((p || 0) * 100) + "%"; } }
  $("busy-x").onclick = function () { if (exporting) { exporting.cancel = true; exporting.stop(); } busy(); };
  window.__voExport = null;
  $("ex-mp4").onclick = function () {
    if (!needRights() || exporting) return;
    if (recState) stopRec(); pause(); ac();
    var vw = vid.videoWidth || 1280, vh = vid.videoHeight || 720, sc = Math.min(1, 1280 / vw);
    var c2 = document.createElement("canvas"); c2.width = Math.round(vw * sc / 2) * 2; c2.height = Math.round(vh * sc / 2) * 2; var g2 = c2.getContext("2d");
    var st = c2.captureStream(30); exportDest.stream.getAudioTracks().forEach(function (t) { st.addTrack(t); });
    var types = ["video/mp4;codecs=avc1.42E01F,mp4a.40.2", "video/mp4;codecs=avc1,mp4a", "video/mp4;codecs=avc1.42E01F,opus", "video/mp4;codecs=avc1.64001F,opus", "video/mp4;codecs=avc1,opus", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
    var mime = types.filter(function (m) { return MediaRecorder.isTypeSupported(m); })[0] || "";
    var mr = new MediaRecorder(st, { mimeType: mime, videoBitsPerSecond: 6000000, audioBitsPerSecond: 192000 }), ch = [];
    mr.ondataavailable = function (e) { if (e.data.size) ch.push(e.data); };
    var raf = 0, D = dur();
    function frame() { g2.drawImage(vid, 0, 0, c2.width, c2.height); busy("Exporting MP4 (real time)… " + fmt(vid.currentTime) + " / " + fmt(D), vid.currentTime / D); raf = requestAnimationFrame(frame); }
    exporting = { cancel: false, stop: function () { vid.pause(); stopSrcs(); cancelAnimationFrame(raf); if (mr.state !== "inactive") mr.stop(); } };
    var onEnd = function () { vid.removeEventListener("ended", onEnd); exporting && exporting.stop(); };
    vid.addEventListener("ended", onEnd);
    mr.onstop = function () {
      var x = exporting; exporting = null; playing = false; $("b-play").textContent = "▶ Play"; busy(); duckGain.gain.cancelScheduledValues(0); duckGain.gain.value = 1;
      if (x && x.cancel) return toast("Export cancelled.");
      var blob = new Blob(ch, { type: (mime || "video/webm").split(";")[0] });
      window.__voExport = blob;
      if (/mp4/.test(blob.type)) { dl(blob, base() + ".mp4"); toast("MP4 exported."); }
      else toMp4(blob).then(function (m) { window.__voExport = m; dl(m, base() + ".mp4"); toast("MP4 exported."); }).catch(function (e) { dl(blob, base() + ".webm"); toast("MP4 converter failed (" + e.message + ") — saved WEBM instead."); });
    };
    vid.currentTime = 0;
    vid.addEventListener("seeked", function go() {
      vid.removeEventListener("seeked", go);
      vid.play().then(function () { playing = true; mr.start(1000); startPlayback(); frame(); }).catch(function (e) { exporting = null; busy(); toast("Export failed: " + e.message); });
    });
  };
  var FF = null, CDN = "https://cdn.jsdelivr.net/npm/";
  function blobUrl(u, type) { return fetch(u).then(function (r) { if (!r.ok) throw new Error("download " + r.status); return r.blob(); }).then(function (b) { return URL.createObjectURL(new Blob([b], { type: type })); }); }
  function loadFF() {
    if (FF) return FF;
    FF = new Promise(function (res, rej) { if (window.FFmpegWASM) return res(); var s = document.createElement("script"); s.src = CDN + "@ffmpeg/ffmpeg@0.12.10/dist/umd/ffmpeg.js"; s.onload = res; s.onerror = function () { rej(new Error("converter download failed")); }; document.head.appendChild(s); })
      .then(function () { var core = CDN + "@ffmpeg/core@0.12.6/dist/esm/"; return Promise.all([blobUrl(CDN + "@ffmpeg/ffmpeg@0.12.10/dist/umd/814.ffmpeg.js", "text/javascript"), blobUrl(core + "ffmpeg-core.js", "text/javascript"), blobUrl(core + "ffmpeg-core.wasm", "application/wasm")]); })
      .then(function (u) { var ff = new window.FFmpegWASM.FFmpeg(); return ff.load({ classWorkerURL: u[0], coreURL: u[1], wasmURL: u[2] }).then(function () { return ff; }); });
    FF.catch(function () { FF = null; }); return FF;
  }
  function toMp4(webm) {
    toast("Converting to MP4 (first time downloads ~30 MB)…", 8000);
    return loadFF().then(function (ff) {
      return webm.arrayBuffer().then(function (ab) { return ff.writeFile("in.webm", new Uint8Array(ab)); })
        .then(function () { return ff.exec(["-i", "in.webm", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "out.mp4"]); })
        .then(function (rc) { if (rc !== 0) throw new Error("ffmpeg " + rc); return ff.readFile("out.mp4"); }).then(function (d) { return new Blob([d], { type: "video/mp4" }); });
    });
  }

  /* ---------- storage (IndexedDB, this device only) ---------- */
  var dbP = null;
  function db() { if (!dbP) dbP = new Promise(function (res, rej) { var r = indexedDB.open("psycho_voiceover", 1); r.onupgradeneeded = function () { r.result.createObjectStore("kv"); }; r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; }); return dbP; }
  function idb(op, k, v) { return db().then(function (d) { return new Promise(function (res, rej) { var tx = d.transaction("kv", op === "get" ? "readonly" : "readwrite"), s = tx.objectStore("kv"), q = op === "get" ? s.get(k) : op === "del" ? s.delete(k) : s.put(v, k); q.onsuccess = function () { res(q.result); }; q.onerror = function () { rej(q.error); }; }); }); }
  var svT = 0;
  function save() { clearTimeout(svT); svT = setTimeout(function () { idb("put", "proj", { S: S, takes: meta(), t: vid.currentTime || 0, pps: pps, name: videoName }).catch(function (e) { toast("Autosave failed: " + e.message); }); }, 400); }
  function load() {
    return Promise.all([idb("get", "proj"), idb("get", "video")]).then(function (r) {
      var p = r[0], v = r[1]; if (p && p.S) for (var k in p.S) S[k] = p.S[k];
      uiFromS();
      if (p && p.takes) takes = p.takes; if (p && p.pps) pps = p.pps;
      if (v && v.blob) { setVideo(v.blob, v.name, true); vid.addEventListener("loadedmetadata", function f() { vid.removeEventListener("loadedmetadata", f); if (p) vid.currentTime = Math.min(p.t || 0, dur()); }); }
      return ensureBufs().then(function () { draw(); if (takes.length || v) toast("Project restored."); });
    }).catch(function () { uiFromS(); });
  }
  $("b-new").onclick = function () {
    if (!confirm("Start a new project? This clears the video and all takes on this device.")) return;
    pause(); takes = []; bufs = {}; peaks = {}; undoS = []; redoS = []; videoBlob = null; vid.removeAttribute("src"); vid.load(); $("empty").hidden = false; origBuf = origPeaks = null; select(null);
    idb("del", "video"); save();
  };

  /* ---------- controls ---------- */
  function uiFromS() {
    $("ov").value = S.origVol; $("ov-v").textContent = Math.round(S.origVol * 100) + "%"; $("om").checked = S.origMute; $("od").checked = S.duck;
    $("odd").value = S.depth; $("odd-v").textContent = "-" + Math.round(S.depth * 100) + "%"; $("rights").checked = S.rights;
    $("countin").value = S.countin; $("preroll").value = S.preroll; $("lat").value = S.lat; applyOrig();
  }
  $("ov").oninput = function () { S.origVol = +this.value; uiFromS(); save(); };
  $("om").onchange = function () { S.origMute = this.checked; uiFromS(); save(); };
  $("od").onchange = function () { S.duck = this.checked; if (playing) startPlayback(); save(); };
  $("odd").oninput = function () { S.depth = +this.value; uiFromS(); if (playing) startPlayback(); save(); };
  $("rights").onchange = function () { S.rights = this.checked; save(); };
  $("countin").onchange = function () { S.countin = +this.value; save(); };
  $("preroll").onchange = function () { S.preroll = +this.value; save(); };
  $("lat").onchange = function () { S.lat = +this.value || 0; save(); };
  $("mic").onchange = function () { S.mic = this.value; if (micStream) micStream.getTracks().forEach(function (t) { t.stop(); }); micStream = null; openMic().catch(function (e) { toast("Mic: " + e.message); }); save(); };
  $("b-play").onclick = function () { if (recState) return stopRec(); playing ? pause() : play(); };
  $("b-rec").onclick = startRec;
  $("b-start").onclick = function () { seek(0); };
  $("b-undo").onclick = undo; $("b-redo").onclick = redo;
  document.addEventListener("keydown", function (e) {
    if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.code === "Space") { e.preventDefault(); $("b-play").click(); } else if (e.key === "r") startRec();
    else if ((e.ctrlKey || e.metaKey) && e.key === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    else if (e.key === "Delete" || e.key === "Backspace") $("tk-del").click();
  });
  if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) navigator.mediaDevices.addEventListener("devicechange", function () { listMics(); });
  if (navigator.mediaDevices) listMics().catch(function () {});
  window.__vo = { get takes() { return takes; }, get S() { return S; }, duckValue: function () { return duckGain ? duckGain.gain.value : 1; }, get exporting() { return !!exporting; } };
  fit(); load(); requestAnimationFrame(meterLoop);
})();
