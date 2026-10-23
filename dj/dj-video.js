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
  var WM = new Image(); WM.src = "icons/watermark.jpg?v=20261023c"; WM.onload = function () { wmPlace(); };

  function vEl(id) { return $("vdj-v" + id); }
  function loadVideo(d, blob, name) {
    var v = vEl(d.id), url = URL.createObjectURL(blob);
    if (!v._sk) { v._sk = 1; v.addEventListener("seeked", function () { var dd = P.BY[d.id]; if (v._want != null && dd && dd.video === v) { var w = v._want; v._want = null; if (Math.abs(v.currentTime - P.pos(dd)) > 0.03) v.currentTime = P.pos(dd); } schedule(); }); }
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
      if ($("vdj-n" + d.id)) $("vdj-n" + d.id).textContent = name;
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
  P.on("loaded", function (d, item) { if (!item || !item.isVideo) { if (d.video) { d.video = null; var v = vEl(d.id); v.pause(); v.removeAttribute("src"); v.load(); if ($("vdj-n" + d.id)) $("vdj-n" + d.id).textContent = "No video — shows a visualizer"; } } });

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
      /* v20261023c: scratch / drag / jog = seek-based scrubbing. One seek in flight at a time (a queued target is taken
         as soon as the last one lands), fastSeek (nearest keyframe) while the hand is on the platter, exact frame on release. */
      if (Math.abs(drift) > 0.03) {
        if (v.seeking) { v._want = t; return; }
        if (scr && v.fastSeek && Math.abs(drift) > 0.5) v.fastSeek(t); else v.currentTime = t;
      }
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
  /* v20261023c: YouTube decks play in YouTube's own iframe — browsers never let a page copy those pixels (or that audio)
     into a canvas, so the program / REC VIDEO shows a title card with the video's thumbnail (i.ytimg.com sends CORS *, so no taint). */
  var thumbs = {};
  function ytCard(d, x, y, w, h) {
    var id = d.ext && d.ext.id, im = id && thumbs[id];
    if (id && !im) { im = thumbs[id] = new Image(); im.crossOrigin = "anonymous"; im.onerror = function () { im.bad = true; }; im.src = "https://i.ytimg.com/vi/" + id + "/hqdefault.jpg"; }
    g.fillStyle = "#0b0d12"; g.fillRect(x, y, w, h);
    if (im && im.complete && im.naturalWidth && !im.bad) {
      var s = Math.max(w / im.naturalWidth, h / im.naturalHeight), dw = im.naturalWidth * s, dh = im.naturalHeight * s;
      g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.drawImage(im, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh); g.restore();
      g.fillStyle = "rgba(0,0,0,.55)"; g.fillRect(x, y, w, h);
    }
    g.textAlign = "center"; g.fillStyle = "#ef4444"; g.font = "900 " + Math.round(h * 0.05) + "px system-ui, sans-serif"; g.fillText("▶ YouTube · Deck " + d.id, x + w / 2, y + h * 0.36);
    g.fillStyle = "#fff"; g.font = "800 " + Math.round(h * 0.055) + "px system-ui, sans-serif"; g.fillText(String(d.name || "").slice(0, 48), x + w / 2, y + h * 0.48);
    g.fillStyle = "rgba(255,255,255,.75)"; g.font = "600 " + Math.round(h * 0.03) + "px system-ui, sans-serif"; g.fillText("YouTube video can't be recorded — load a video file for picture in REC VIDEO", x + w / 2, y + h * 0.58);
    g.textAlign = "left";
  }
  function drawDeck(d, x, y, w, h) {
    if (d.ext) { ytCard(d, x, y, w, h); return; }
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
    raf = 0; if (open && (draw.n = (draw.n || 0) + 1) % 30 === 0) wmPlace();
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
    if (rec) { composite(); g.fillStyle = "#f43f5e"; g.beginPath(); g.arc(30, 30, 9, 0, 7); g.fill(); $("vdj-rect").textContent = P.fmtTime((performance.now() - rec.t0) / 1000) + " · " + P.fmtSize(rec.bytes); }
    schedule();
  }
  /* v20261023c: watermark. On screen it's a fixed <img> in the top-right of the program (not in the canvas);
     REC VIDEO records an offscreen composite = program + the watermark bouncing around (DVD-logo style, ~120 px/s at 1280 wide). */
  var rc = null, rg = null, bx = { x: 0, y: 0, vx: 1, vy: 1, t: 0 };
  function composite() {
    if (!rc) return;
    rg.drawImage(cv, 0, 0);
    if (!(WM.complete && WM.naturalWidth)) return;
    var ww = Math.round(W * 0.2), wh = Math.round(ww * WM.naturalHeight / WM.naturalWidth), now = performance.now(), sp = 120 * W / 1280;
    var dt = bx.t ? Math.min(0.25, (now - bx.t) / 1000) : 0; bx.t = now;
    bx.x += bx.vx * sp * dt; bx.y += bx.vy * sp * dt;
    if (bx.x < 0) { bx.x = 0; bx.vx = 1; } if (bx.x > W - ww) { bx.x = W - ww; bx.vx = -1; }
    if (bx.y < 0) { bx.y = 0; bx.vy = 1; } if (bx.y > H - wh) { bx.y = H - wh; bx.vy = -1; }
    rg.save(); rg.globalAlpha = 0.7; rg.imageSmoothingQuality = "high"; rg.drawImage(WM, Math.round(bx.x), Math.round(bx.y), ww, wh); rg.restore();
  }
  function recCanvas() {
    if (!rc) { rc = document.createElement("canvas"); rg = rc.getContext("2d"); }
    rc.width = W; rc.height = H;
    var mg = Math.round(24 * W / 1280), ww = Math.round(W * 0.2), wh = WM.naturalWidth ? Math.round(ww * WM.naturalHeight / WM.naturalWidth) : Math.round(ww * 0.56); bx = { x: W - ww - mg, y: H - wh - mg, vx: -1, vy: -1, t: 0 };
    composite(); return rc;
  }
  function wmOverlay() {
    var wrap = $("vdj-progwrap"); if (!wrap || $("vdj-wm")) return;
    if (getComputedStyle(wrap).position === "static") wrap.style.position = "relative";
    var im = document.createElement("img"); im.id = "vdj-wm"; im.src = WM.src; im.alt = ""; im.setAttribute("aria-hidden", "true");
    im.style.cssText = "position:absolute;bottom:3.33%;right:1.875%;width:20%;height:auto;opacity:.7;pointer-events:none;z-index:2";
    wrap.appendChild(im);
    window.addEventListener("resize", wmPlace); setTimeout(wmPlace, 300);
  }
  function wmPlace() {   /* pin the on-screen watermark to the PICTURE's bottom-right (the canvas may be letterboxed in its box) */
    var im = $("vdj-wm"), wrap = $("vdj-progwrap"); if (!im || !cv || !wrap) return;
    var rw = wrap.getBoundingClientRect(), r = cv.getBoundingClientRect(); if (!r.width) return;
    var s = Math.min(r.width / W, r.height / H), pw = W * s, ph = H * s, px = r.left + (r.width - pw) / 2 - rw.left, py = r.top + (r.height - ph) / 2 - rw.top;
    var ww = pw * 0.2, mg = 24 * s, wh = ww * (WM.naturalWidth ? WM.naturalHeight / WM.naturalWidth : 0.56);
    im.style.width = ww + "px"; im.style.left = (px + pw - ww - mg) + "px"; im.style.top = (py + ph - wh - mg) + "px"; im.style.right = im.style.bottom = "auto";
  }
  function schedule() { if (!raf) raf = requestAnimationFrame(draw); }
  setInterval(function () { if (!open && !rec) P.DECKS.forEach(follow); }, 120);    // keep videos in step even with the panel closed
  function setOpen(v) {
    if (!$("vdj")) { if (v) location.href = "video.html"; return; }
    open = v; $("vdj").hidden = !v; if ($("vdj-toggle")) $("vdj-toggle").classList.toggle("on", v);
    if (v) { schedule(); if (!document.body.classList.contains("vdj-page")) setTimeout(function () { $("vdj").scrollIntoView({ behavior: "smooth", block: "start" }); }, 50); }
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
  /* v20261023b: REC VIDEO saves itself to 📁 My Recordings (IndexedDB, chunked every second, crash-safe) as MP4.
     MP4 (H.264/AAC) is recorded directly where MediaRecorder supports it (recent Chrome / Android Chrome).
     Otherwise the WEBM is converted to MP4 in the browser with ffmpeg.wasm (lazy-loaded from a CDN only then);
     if that fails the WEBM is kept with a note. Mic stays raw (audioStream is the same show bus as ● REC). */
  var MP4 = ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4;codecs=avc1,mp4a.40.2", "video/mp4;codecs=avc1.42E01E,opus", "video/mp4;codecs=avc1,opus", "video/mp4"];
  var WEBM = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
  function toggleRec() {
    if (rec) { if (rec.mr.state !== "inactive") rec.mr.stop(); return; }
    if (!cv.captureStream || !window.MediaRecorder) { P.toast("This browser can't record the video output."); return; }
    var mime = P.pickMime(window.PFVDJ_FORCE_WEBM ? WEBM : MP4.concat(WEBM));
    if (!mime) { P.toast("No supported video recording format in this browser."); return; }
    var as = P.audioStream(); if (!as) return;
    var st = new MediaStream(recCanvas().captureStream(30).getVideoTracks().concat(as.getAudioTracks()));
    /* v20261023c: some Android builds say a type is supported but the constructor / start() then throws — try each in turn */
    var cands = (window.PFVDJ_FORCE_WEBM ? WEBM : MP4.concat(WEBM)).filter(function (m) { return MediaRecorder.isTypeSupported(m); }), mr = null;
    for (var ci = 0; ci < cands.length && !mr; ci++) { try { mr = new MediaRecorder(st, { mimeType: cands[ci], videoBitsPerSecond: 4000000, audioBitsPerSecond: 192000 }); mr.start(1000); mime = cands[ci]; } catch (er) { mr = null; } }
    if (!mr) { P.toast("This device couldn't start a video recording."); return; }
    var R = window.PFREC, id = R ? R.begin("video", mime, 0, "DJ Psycho Fingers video show", true) : null, chunks = [];
    rec = { mr: mr, t0: performance.now(), bytes: 0, id: id };
    mr.ondataavailable = function (e) { if (e.data && e.data.size) { if (id) R.chunk(id, e.data); else chunks.push(e.data); rec && (rec.bytes += e.data.size); } };
    mr.onstop = function () {
      var dur = (performance.now() - rec.t0) / 1000, bytes = rec.bytes;
      rec = null; $("vdj-rec").classList.remove("on"); $("vdj-rec").textContent = "● REC VIDEO"; $("vdj-rect").textContent = "";
      if (!id) { var it = P.addMix(new Blob(chunks, { type: mime.split(";")[0] }), dur, /mp4/.test(mime) ? "mp4" : "webm", "DJ Psycho Fingers video show"); it.video = true; P.showLib("mixes"); return; }
      R.end(id, dur).then(function (m) {
        if (!m) { P.toast("Video recording was empty — nothing saved."); return; }
        if (P.showLib) { var el = document.getElementById("my-recs"); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); }
        if (/mp4/.test(mime)) { P.toast("Video show saved to My Recordings as MP4 · " + P.fmtTime(dur) + " · " + P.fmtSize(bytes)); return; }
        P.toast("Video show saved (WEBM) — converting to MP4 on this device…");
        R.blobOf(m).then(function (b) { return toMp4(b); }).then(function (mp4) { return R.replace(id, mp4, "video/mp4"); })
          .then(function () { P.toast("Video show converted — saved in My Recordings as MP4"); })
          .catch(function (e) { R.note(id, "kept as WEBM (MP4 conversion failed)"); P.toast("Couldn't convert to MP4 (" + (e && e.message || e) + ") — kept as WEBM in My Recordings."); });
      });
    };
    mr.onerror = function (ev) { P.toast("Video recorder error (" + (ev.error && ev.error.name || "unknown") + ") — saving what was recorded."); try { if (mr.state !== "inactive") mr.stop(); } catch (er) { /* ignore */ } };
    $("vdj-rec").classList.add("on"); $("vdj-rec").textContent = "■ STOP VIDEO"; schedule();
    P.toast("Recording video + show audio as " + (/mp4/.test(mime) ? "MP4" : "WEBM (→ MP4 after)") + " — saves itself to My Recordings. Keep this tab in front.");
  }
  P.stopVideoRec = function () { if (rec && rec.mr.state !== "inactive") rec.mr.stop(); };
  /* v20261023c: tab hidden / app switched → flush what's recorded right away; keep drawing on a timer (rAF stops when hidden) */
  var hidT = 0;
  document.addEventListener("visibilitychange", function () {
    clearInterval(hidT); hidT = 0;
    if (!rec) return;
    if (document.hidden) { try { rec.mr.requestData(); } catch (e) { /* ignore */ } hidT = setInterval(function () { if (rec) { raf = 0; draw(); cancelAnimationFrame(raf); raf = 0; } }, 100); }
    else schedule();
  });
  window.addEventListener("pagehide", function () { if (rec) { try { rec.mr.requestData(); } catch (e) { /* ignore */ } } });
  var FF = null, CDN = "https://cdn.jsdelivr.net/npm/";
  function blobUrl(u, type) { return fetch(u).then(function (r) { if (!r.ok) throw new Error("download " + r.status); return r.blob(); }).then(function (b) { return URL.createObjectURL(new Blob([b], { type: type })); }); }
  function loadFF() {
    if (FF) return FF;
    FF = new Promise(function (res, rej) {
      if (window.FFmpegWASM) return res();
      var s = document.createElement("script"); s.src = CDN + "@ffmpeg/ffmpeg@0.12.10/dist/umd/ffmpeg.js"; s.onload = res; s.onerror = function () { rej(new Error("converter download failed")); }; document.head.appendChild(s);
    }).then(function () {
      var core = CDN + "@ffmpeg/core@0.12.6/dist/esm/";
      return Promise.all([blobUrl(CDN + "@ffmpeg/ffmpeg@0.12.10/dist/umd/814.ffmpeg.js", "text/javascript"), blobUrl(core + "ffmpeg-core.js", "text/javascript"), blobUrl(core + "ffmpeg-core.wasm", "application/wasm")]);
    }).then(function (u) {
      var ff = new window.FFmpegWASM.FFmpeg();
      ff.on("progress", function (p) { var x = Math.round((p.progress || 0) * 100); if (x > 0 && x <= 100 && x % 10 === 0) P.toast("Converting to MP4… " + x + "%"); });
      return ff.load({ classWorkerURL: u[0], coreURL: u[1], wasmURL: u[2] }).then(function () { return ff; });
    });
    FF.catch(function () { FF = null; });
    return FF;
  }
  function toMp4(webm) {
    if (webm.size > 400 * 1048576) return Promise.reject(new Error("too big to convert on-device"));
    P.toast("Loading the MP4 converter (~30 MB, first time only)…");
    return loadFF().then(function (ff) {
      return webm.arrayBuffer().then(function (ab) { return ff.writeFile("in.webm", new Uint8Array(ab)); })
        .then(function () { return ff.exec(["-i", "in.webm", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "out.mp4"]).catch(function () { return 1; }); })   /* remux (VP9 fits in MP4) */
        .then(function (rc) { if (rc === 0) return ff.readFile("out.mp4").then(function (d) { return d && d.length > 1000 ? d : null; }).catch(function () { return null; }); return null; })
        .then(function (d) { if (d) return d; return ff.exec(["-i", "in.webm", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "out.mp4"]).then(function (rc) { if (rc !== 0) throw new Error("ffmpeg " + rc); return ff.readFile("out.mp4"); }); })
        .then(function (d) { ff.deleteFile("in.webm").catch(function () {}); ff.deleteFile("out.mp4").catch(function () {}); return new Blob([d], { type: "video/mp4" }); });
    });
  }
  function build() {
    cv = $("vdj-prog"); if (!cv) return;
    if (window.innerWidth < 600) { W = 960; H = 540; }
    cv.width = W; cv.height = H; g = cv.getContext("2d"); wmOverlay();
    if ($("vdj-toggle")) $("vdj-toggle").addEventListener("click", function () { setOpen(!open); });
    if (document.body.classList.contains("vdj-page")) setOpen(true);
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
  window.PFVDJ = { open: setOpen, loadVideo: function (deck, blob, name) { return loadVideo(P.BY[deck], blob, name); }, toggleRec: toggleRec, _toMp4: function (b) { return toMp4(b); },
    info: function () { return { open: open, trans: V.trans, mix: mixAmount(), rec: !!rec, decks: P.DECKS.map(function (d) { var v = d.video; return v ? { id: d.id, t: v.currentTime, pos: P.pos(d), paused: v.paused, rate: v.playbackRate, ready: v.readyState, w: v.videoWidth } : { id: d.id, none: true }; }) }; } };
})();
