/* DJ Psycho Fingers — Video DJ (VDJ). Each deck can load a video (local file or a CORS-enabled URL).
 * The video's AUDIO is decoded into the deck's normal engine (EQ, pitch, keylock, scratch, loops all work on it);
 * the picture is a muted <video> slaved to the deck position (plays along at the deck's rate, seeks while scratching / reversing).
 * A program canvas mixes deck A and B following the crossfader (fade / cut / wipe) with an optional text overlay.
 * Output: fullscreen, pop-out window (for a projector / TV) and REC VIDEO (program canvas + full show audio → WebM). */
(function () {
  "use strict";
  var P = window.PFDJ; if (!P) return;
  var $ = function (id) { return document.getElementById(id); };
  var VK = "pfdj_vdj_v1", V = { trans: "fade", overlay: true, text: "DJ Psycho Fingers" };
  try { var sv = JSON.parse(localStorage.getItem(VK) || "null"); if (sv) { V.trans = ["fade", "cut", "wipe"].indexOf(sv.trans) >= 0 ? sv.trans : "fade"; V.overlay = sv.overlay !== false; V.text = typeof sv.text === "string" ? sv.text.slice(0, 60) : V.text; } } catch (e) { /* ignore */ }
  function save() { try { localStorage.setItem(VK, JSON.stringify(V)); } catch (e) { /* ignore */ } }
  var open = false, cv, g, pop = null, rec = null, vids = {}, raf = 0;
  var W = 1280, H = 720;

  function vEl(id) { return $("vdj-v" + id); }
  function loadVideo(d, blob, name) {
    var v = vEl(d.id), url = URL.createObjectURL(blob);
    if (vids[d.id] && vids[d.id].url) URL.revokeObjectURL(vids[d.id].url);
    vids[d.id] = { url: url, name: name, ready: false, pending: true };
    v.src = url; v.muted = true; v.playsInline = true; v.preload = "auto";
    var meta = new Promise(function (res) { v.onloadedmetadata = function () { res(v.duration); }; v.onerror = function () { res(0); }; setTimeout(function () { res(v.duration || 0); }, 8000); });
    if (blob.size > 400 * 1048576) P.toast("Big video (" + P.fmtSize(blob.size) + ") — decoding its audio needs a lot of memory; short clips work best on phones.");
    var item = { name: name, sub: "Video · audio on the deck, picture in VDJ", isVideo: true,
      get: function () {
        return blob.arrayBuffer().then(function (ab) { return P.decode(ab); }).catch(function () {
          return meta.then(function (dur) { // no decodable audio track → silent buffer so the transport still drives the picture
            if (!dur || !isFinite(dur)) throw new Error("couldn't read this video");
            P.toast("No audio track found — the deck runs silent and drives the picture.");
            var c = P.ensureCtx(); return c.createBuffer(2, Math.max(1, Math.round(dur * c.sampleRate)), c.sampleRate);
          });
        });
      } };
    return P.loadInto(d, item).then(function (ok) {
      if (!ok) { vids[d.id] = null; v.removeAttribute("src"); v.load(); return; }
      vids[d.id].ready = true; vids[d.id].pending = false; d.video = v;
      $("vdj-n" + d.id).textContent = name;
      if (!open) setOpen(true);
    });
  }
  function loadUrl(d, url) {
    if (!/^https?:\/\//i.test(url)) { P.toast("Paste a full https:// link to a video file (mp4 / webm)."); return; }
    P.toast("Fetching video…");
    fetch(url, { mode: "cors" }).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.blob(); })
      .then(function (b) { if (!/^video\/|^audio\/|octet-stream/.test(b.type || "video/mp4")) throw new Error("not a video file"); return loadVideo(d, b, decodeURIComponent(url.split("/").pop().split("?")[0] || "Video").slice(0, 60)); })
      .catch(function (e) { P.toast("Couldn't load that link (" + (e.message || "blocked") + "). The site must allow CORS — otherwise download the file and load it from your device."); });
  }
  P.on("loaded", function (d, item) { if (!item || !item.isVideo) { if (d.video) { d.video = null; var v = vEl(d.id); v.pause(); v.removeAttribute("src"); v.load(); $("vdj-n" + d.id).textContent = "No video — shows a visualizer"; } } });

  /* keep each video glued to its deck */
  function follow(d) {
    var v = d.video; if (!v || v.readyState < 1) return;
    var t = P.pos(d), drift = v.currentTime - t, scr = d.scr;
    var fwd = d.playing && !scr;
    if (fwd) {
      var r = P.clamp(P.rate(d), 0.25, 4);
      if (Math.abs(v.playbackRate - r) > 0.002) v.playbackRate = r;
      if (v.paused) { var pr = v.play(); if (pr && pr.catch) pr.catch(function () { /* autoplay */ }); }
      if (Math.abs(drift) > 0.18 && !v.seeking) v.currentTime = t + 0.03;
    } else {
      if (!v.paused) v.pause();
      if (Math.abs(drift) > 0.035 && !v.seeking) v.currentTime = t;   // scratch / reverse = seek-based scrubbing
    }
  }
  var fbuf = null;
  function slate(d, x, y, w, h) {
    var col = d.id === "A" ? "#22d3ee" : "#c084fc";
    var gr = g.createLinearGradient(x, y, x + w, y + h); gr.addColorStop(0, "#0b0d12"); gr.addColorStop(1, d.id === "A" ? "#062a33" : "#2a0f3d");
    g.fillStyle = gr; g.fillRect(x, y, w, h);
    if (d.n && P.ctx) {
      var an = d.n.an; fbuf = fbuf && fbuf.length === an.frequencyBinCount ? fbuf : new Uint8Array(an.frequencyBinCount); an.getByteFrequencyData(fbuf);
      var bars = 48, bw = w / bars;
      g.fillStyle = col;
      for (var i = 0; i < bars; i++) { var k = Math.floor(Math.pow(i / bars, 1.7) * fbuf.length * 0.6), v = fbuf[k] / 255, bh = v * h * 0.55; g.globalAlpha = 0.25 + v * 0.6; g.fillRect(x + i * bw + 2, y + h - bh, bw - 4, bh); }
      g.globalAlpha = 1;
    }
    g.fillStyle = "#fff"; g.font = "800 " + Math.round(h * 0.06) + "px system-ui, sans-serif"; g.textAlign = "center";
    g.fillText(d.buf ? d.name : "Deck " + d.id, x + w / 2, y + h * 0.42);
    g.fillStyle = col; g.font = "700 " + Math.round(h * 0.035) + "px system-ui, sans-serif"; g.fillText("DECK " + d.id + (d.bpm ? " · " + P.effBpm(d).toFixed(1) + " BPM" : ""), x + w / 2, y + h * 0.5);
    g.textAlign = "left";
  }
  function drawDeck(d, x, y, w, h) {
    var v = d.video;
    if (v && v.readyState >= 2 && v.videoWidth) {
      g.fillStyle = "#000"; g.fillRect(x, y, w, h);
      var s = Math.min(w / v.videoWidth, h / v.videoHeight), dw = v.videoWidth * s, dh = v.videoHeight * s;
      g.drawImage(v, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
    } else slate(d, x, y, w, h);
  }
  function mixAmount() { // 0 = all A, 1 = all B (crossfader + channel faders)
    var xg = P.xfGains(), A = P.DECKS[0], B = P.DECKS[1];
    var a = xg[0] * Math.pow(A.vol, 0.7) * (A.buf ? 1 : 0.0001), b = xg[1] * Math.pow(B.vol, 0.7) * (B.buf ? 1 : 0.0001);
    return a + b < 1e-6 ? 0.5 : b / (a + b);
  }
  function draw() {
    raf = 0;
    var need = open || rec || (pop && !pop.closed);
    P.DECKS.forEach(follow);
    if (!need) return;
    var A = P.DECKS[0], B = P.DECKS[1], m = mixAmount();
    if (V.trans === "cut") { drawDeck(m < 0.5 ? A : B, 0, 0, W, H); }
    else if (V.trans === "wipe") {
      drawDeck(A, 0, 0, W, H);
      if (m > 0.001) { g.save(); g.beginPath(); g.rect(W * (1 - m), 0, W * m, H); g.clip(); drawDeck(B, 0, 0, W, H); g.restore(); g.fillStyle = "rgba(255,255,255,.8)"; if (m < 0.999) g.fillRect(W * (1 - m) - 2, 0, 4, H); }
    } else {
      drawDeck(A, 0, 0, W, H);
      if (m > 0.001) { g.globalAlpha = m; drawDeck(B, 0, 0, W, H); g.globalAlpha = 1; }
    }
    if (V.overlay && V.text) {
      g.save(); g.font = "900 " + Math.round(H * 0.06) + "px system-ui, sans-serif"; g.shadowColor = "#c084fc"; g.shadowBlur = 18;
      var gr = g.createLinearGradient(40, 0, 40 + g.measureText(V.text).width, 0); gr.addColorStop(0, "#22d3ee"); gr.addColorStop(1, "#c084fc");
      g.fillStyle = gr; g.fillText(V.text, 40, H - 48); g.restore();
      var live = P.DECKS.filter(function (d) { return d.playing; }).map(function (d) { return d.name; }).join("  ×  ");
      if (live) { g.fillStyle = "rgba(255,255,255,.85)"; g.font = "600 " + Math.round(H * 0.026) + "px system-ui, sans-serif"; g.fillText(live.slice(0, 90), 42, H - 22); }
    }
    if (rec) { g.fillStyle = "#f43f5e"; g.beginPath(); g.arc(W - 30, 30, 9, 0, 7); g.fill(); $("vdj-rect").textContent = P.fmtTime((performance.now() - rec.t0) / 1000) + " · " + P.fmtSize(rec.bytes); }
    schedule();
  }
  function schedule() { if (!raf) raf = requestAnimationFrame(draw); }
  setInterval(function () { if (!open && !rec) P.DECKS.forEach(follow); }, 120);    // keep videos in step even with the panel closed
  function setOpen(v) {
    open = v; $("vdj").hidden = !v; $("vdj-toggle").classList.toggle("on", v);
    if (v) { schedule(); setTimeout(function () { $("vdj").scrollIntoView({ behavior: "smooth", block: "start" }); }, 50); }
  }
  function popOut() {
    if (pop && !pop.closed) { pop.focus(); return; }
    pop = window.open("", "pfdj_program", "width=960,height=540");
    if (!pop) { P.toast("Pop-up blocked — allow pop-ups for this site, or use Fullscreen."); return; }
    pop.document.write('<!doctype html><title>DJ Psycho Fingers — Program out</title><style>html,body{margin:0;height:100%;background:#000}video{width:100%;height:100%;object-fit:contain;cursor:pointer}</style><video autoplay muted playsinline title="Double-click for fullscreen"></video>');
    pop.document.close();
    var pv = pop.document.querySelector("video");
    pv.srcObject = cv.captureStream(30);
    pv.addEventListener("dblclick", function () { (pv.requestFullscreen || pv.webkitRequestFullscreen || function () {}).call(pv); });
    schedule();
    P.toast("Program output popped out — drag that window to the projector / TV and double-click it for fullscreen. (Audio stays on this page's output.)");
  }
  function fullscreen() { var el = $("vdj-progwrap"); var f = el.requestFullscreen || el.webkitRequestFullscreen; if (f) f.call(el); else P.toast("Fullscreen isn't available here — use Pop-out."); }
  function toggleRec() {
    if (rec) { rec.mr.stop(); return; }
    if (!cv.captureStream || !window.MediaRecorder) { P.toast("This browser can't record the video output."); return; }
    var mime = P.pickMime(["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"]);
    if (!mime) { P.toast("No supported video recording format in this browser."); return; }
    var as = P.audioStream(); if (!as) return;
    var st = new MediaStream(cv.captureStream(30).getVideoTracks().concat(as.getAudioTracks()));
    var mr = new MediaRecorder(st, { mimeType: mime, videoBitsPerSecond: 4000000, audioBitsPerSecond: 160000 }), chunks = [];
    rec = { mr: mr, t0: performance.now(), bytes: 0 };
    mr.ondataavailable = function (e) { if (e.data && e.data.size) { chunks.push(e.data); rec && (rec.bytes += e.data.size); } };
    mr.onstop = function () {
      var dur = (performance.now() - rec.t0) / 1000, blob = new Blob(chunks, { type: mime.split(";")[0] });
      rec = null; $("vdj-rec").classList.remove("on"); $("vdj-rec").textContent = "● REC VIDEO"; $("vdj-rect").textContent = "";
      var it = P.addMix(blob, dur, /mp4/.test(mime) ? "mp4" : "webm", "DJ Psycho Fingers video show"); it.video = true; P.showLib("mixes");
      P.toast("Video show recorded · " + P.fmtTime(dur) + " · " + P.fmtSize(blob.size));
    };
    mr.start(1000); $("vdj-rec").classList.add("on"); $("vdj-rec").textContent = "■ STOP VIDEO"; schedule();
    P.toast("Recording the program video + the whole show audio (decks, sampler, mic). Keep this tab in front.");
  }
  function build() {
    cv = $("vdj-prog"); if (!cv) return;
    if (window.innerWidth < 600) { W = 960; H = 540; }
    cv.width = W; cv.height = H; g = cv.getContext("2d");
    $("vdj-toggle").addEventListener("click", function () { setOpen(!open); });
    P.DECKS.forEach(function (d) {
      $("vdj-f" + d.id).addEventListener("change", function (e) { var f = e.target.files[0]; e.target.value = ""; if (f) loadVideo(d, f, f.name.replace(/\.[a-z0-9]+$/i, "")); });
      $("vdj-u" + d.id).addEventListener("click", function () { var u = prompt("Video URL for deck " + d.id + " (mp4/webm file link from a site that allows CORS, and that you have the rights to play):"); if (u) loadUrl(d, u.trim()); });
    });
    $("vdj-trans").value = V.trans; $("vdj-trans").addEventListener("change", function () { V.trans = $("vdj-trans").value; save(); });
    $("vdj-ovl").checked = V.overlay; $("vdj-ovl").addEventListener("change", function () { V.overlay = $("vdj-ovl").checked; save(); });
    $("vdj-text").value = V.text; $("vdj-text").addEventListener("input", function () { V.text = $("vdj-text").value.slice(0, 60); save(); });
    $("vdj-fs").addEventListener("click", fullscreen);
    $("vdj-pop").addEventListener("click", popOut);
    $("vdj-rec").addEventListener("click", toggleRec);
    $("vdj-prog").addEventListener("dblclick", fullscreen);
  }
  build();
  window.PFVDJ = { open: setOpen, loadVideo: function (deck, blob, name) { return loadVideo(P.BY[deck], blob, name); }, toggleRec: toggleRec,
    info: function () { return { open: open, trans: V.trans, mix: mixAmount(), rec: !!rec, decks: P.DECKS.map(function (d) { var v = d.video; return v ? { id: d.id, t: v.currentTime, pos: P.pos(d), paused: v.paused, rate: v.playbackRate, ready: v.readyState, w: v.videoWidth } : { id: d.id, none: true }; }) }; } };
})();
