/* DJ Psycho Fingers — v20261022v "📡 Go Live" section. Reuses the suite's Go Live (beats/live.js, loaded read-only, unchanged:
 * same platforms, same saved keys "ipb_live_dest_v1", same Larix / WHIP paths). The DJ page only feeds it:
 *  - audio: the DJ master mix straight from the internal bus (digital, plus your TALK mic, raw) instead of a room mic
 *  - "screen": DJ visuals (now playing, BPM, levels, title) drawn here, optionally with the camera in the corner
 * Adds a big GO LIVE / END button, live timer, level meters and optional show recording to My Recordings. */
(function () {
  "use strict";
  var P = window.PFDJ; if (!P) return;
  var $ = function (id) { return document.getElementById(id); };
  var panel, loaded = false, live = null, timerI = 0, rec = null;
  var css = document.createElement("style");
  css.textContent = "#gl-btn{margin-left:6px}#golive{position:fixed;inset:0;z-index:2147483000;overflow:auto;background:#0b0d12;color:#e8eaf0;padding:10px 14px 60px}#golive[hidden]{display:none}" +
    "#golive .gl-top{display:flex;align-items:center;gap:10px;flex-wrap:wrap;position:sticky;top:-10px;background:#0b0d12;padding:8px 0;z-index:2}#golive .gl-top h1{font-size:1.15rem;margin:0;flex:1}" +
    "#gl-go{min-height:64px;min-width:200px;font:900 1.3rem system-ui;border-radius:12px;border:0;background:#e11d48;color:#fff}#gl-go.on{background:#334155}" +
    "#gl-time{font:800 1.4rem ui-monospace,monospace;min-width:92px}#gl-time.on{color:#ff4d6d}.gl-m{display:flex;gap:8px;align-items:center;font-size:.8rem}.gl-m i{display:block;width:120px;height:10px;background:#222;border-radius:5px;overflow:hidden}.gl-m b{display:block;height:100%;width:0;background:linear-gradient(90deg,#22c55e,#facc15,#ef4444)}" +
    "#golive .grp{border:1px solid #000;border-radius:10px;background:linear-gradient(#22242b,#17181d);padding:12px 14px;margin:0 0 12px}#golive .grp h2{font-size:.8rem;letter-spacing:.12em;text-transform:uppercase;color:#fbbf24;margin:0 0 8px}" +
    "#golive .lv-grid{display:grid;grid-template-columns:1.3fr 1fr;gap:14px}@media (max-width:760px){#golive .lv-grid{grid-template-columns:1fr}}#golive .lv-prev{width:100%;aspect-ratio:16/9;background:#000;border-radius:8px}" +
    "#golive .lv-f{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;margin:6px 0;font-weight:700;font-size:.85rem}#golive .lv-f>span{flex:0 0 140px}#golive .lv-f select,#golive .lv-f input[type=text],#golive .lv-f input[type=url],#golive .lv-f input[type=password]{flex:1 1 200px;min-height:48px;font-size:1rem;padding:0 10px}" +
    "#golive .lv-f.chk input{width:26px;height:26px}#golive .lv-acts{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0}#golive .lv-acts .btn,#golive .btn{min-height:48px}#golive .lv-status{min-height:1.5em;color:#3dff88;font-weight:700}#golive .lv-status.bad{color:#ff8a8a}" +
    "#golive .lv-how{font-weight:800;color:#fbbf24;margin:.4rem 0}#golive .lv-note,#golive .sub{font-size:.8rem;color:#b7bcc8;line-height:1.45}";
  document.head.appendChild(css);

  function build() {
    panel = document.createElement("section"); panel.id = "golive"; panel.hidden = true;
    panel.innerHTML =
      '<div class="gl-top"><h1>📡 Go Live — DJ</h1><span id="gl-time">00:00:00</span>' +
      '<span class="gl-m">MIX<i><b id="gl-mm"></b></i></span><span class="gl-m">MIC<i><b id="gl-mic"></b></i></span>' +
      '<button type="button" id="gl-go">● GO LIVE</button><button type="button" class="btn" id="gl-close">✕ Back to decks</button></div>' +
      '<p class="sub">Same Go Live as the rest of the suite (same platforms and saved keys), fed by your DJ mix. Audio = the DJ master bus (digital, no speaker bleed) + your 🎤 TALK mic, raw. ' +
      '<b>Honest limits:</b> a browser can\'t send RTMP. Platforms marked “browser WHIP” (Twitch, Custom WHIP) get this exact picture + DJ mix straight from here. ' +
      'Platforms marked “Larix” (YouTube, Facebook, Kick, TikTok…) go out through the free Larix Broadcaster app, which uses its <i>own</i> camera and mic — so the DJ mix from this page does not travel through Larix. Keep this page playing to the speakers, or use a WHIP destination for the clean mix.</p>' +
      '<label class="lv-f chk"><input id="gl-rec" type="checkbox"> <span>Also record the show (DJ mix) to 📁 My Recordings</span></label>' +
      '<p id="lv-status" class="lv-status" role="status">Ready.</p>' +
      '<section class="grp"><h2>Picture</h2><div class="lv-grid"><video id="lv-preview" class="lv-prev" autoplay muted playsinline></video><canvas id="lv-canvas" width="1280" height="720" hidden></canvas><div class="lv-ctl">' +
      '<label class="lv-f"><span>Source</span><select id="lv-src"><option value="screen">DJ visuals</option><option value="cam">Camera</option><option value="pip">DJ visuals + camera (corner)</option></select></label>' +
      '<label class="lv-f"><span>Camera</span><select id="lv-face"><option value="user">Front</option><option value="environment">Back</option></select></label>' +
      '<label class="lv-f"><span>Camera corner</span><select id="lv-pip"><option value="br">Bottom right</option><option value="bl">Bottom left</option><option value="tr">Top right</option><option value="tl">Top left</option></select></label>' +
      '<label class="lv-f"><span>Quality</span><select id="lv-q"><option value="480">480p · 1,000 kbps (weak data)</option><option value="720" selected>720p · 2,500 kbps</option><option value="1080">1080p · 4,500 kbps (strong Wi-Fi)</option></select></label>' +
      '<label class="lv-f"><span>Title on screen</span><input id="lv-title" type="text" maxlength="60" placeholder="e.g. DJ Psycho Fingers LIVE"></label>' +
      '<label class="lv-f chk"><input id="lv-mic" type="checkbox" checked> <span>DJ mix audio (+ TALK mic, raw)</span></label>' +
      '<div class="lv-acts"><button type="button" id="lv-start" class="btn primary">▶ Start preview</button><button type="button" id="lv-stop" class="btn">■ Stop</button><button type="button" id="lv-rec" class="btn rec">● Record clip</button><a id="lv-clip" class="btn" hidden>⬇ Save clip</a></div>' +
      '</div></div></section>' +
      '<section class="grp"><h2>Stream to platform</h2><label class="lv-f"><span>Platform</span><select id="lv-plat"></select></label><div id="lv-dest"></div>' +
      '<p class="lv-note">Get the free <a href="https://play.google.com/store/apps/details?id=com.wmspanel.larix_broadcaster" target="_blank" rel="noopener">Larix Broadcaster on Google Play</a>.</p>' +
      '<button type="button" id="lv-clearall" class="btn ghost">🗑 Clear all saved keys on this device</button></section>';
    document.body.appendChild(panel);
    /* Go Live's Stop also resets its WHIP button, which only exists for WHIP platforms: give it a temporary stand-in (live.js untouched) */
    panel.addEventListener("click", function (e) { if (e.target && e.target.id === "lv-stop" && !$("lv-whip")) { var t = document.createElement("span"); t.id = "lv-whip"; t.hidden = true; panel.appendChild(t); setTimeout(function () { t.remove(); }, 0); } }, true);
    $("gl-close").onclick = function () { panel.hidden = true; };
    $("gl-go").onclick = function () { live ? end() : go(); };
  }

  /* feed Go Live: DJ visuals as the "screen", DJ master mix as the "mic" (only for requests made from this panel) */
  var vis = document.createElement("canvas"); vis.width = 1280; vis.height = 720; var vx = vis.getContext("2d"), visOn = false;
  function lvl(an) { if (!an) return 0; var b = new Float32Array(an.fftSize); an.getFloatTimeDomainData(b); var m = 0; for (var i = 0; i < b.length; i++) m = Math.max(m, Math.abs(b[i])); return m; }
  function drawVis() {
    if (!visOn) return; var w = 1280, h = 720; vx.fillStyle = "#0b0d12"; vx.fillRect(0, 0, w, h);
    vx.fillStyle = "#fbbf24"; vx.font = "900 54px system-ui"; vx.fillText("DJ PSYCHO FINGERS", 60, 110);
    P.DECKS.forEach(function (d, i) { var y = 260 + i * 170; vx.fillStyle = d.playing ? "#3dff88" : "#64748b"; vx.font = "800 40px system-ui"; vx.fillText("Deck " + d.id + (d.playing ? " ▶ " : " ■ ") + (d.name || "—").slice(0, 40), 60, y); vx.fillStyle = "#94a3b8"; vx.font = "600 30px system-ui"; vx.fillText(d.bpm ? (Math.round(P.effBpm ? P.effBpm(d) : d.bpm) + " BPM") : "", 60, y + 46); });
    var L = Math.min(1, lvl(P.M && P.M.an) * 1.1); vx.fillStyle = "#1f2937"; vx.fillRect(60, 620, 1160, 30); vx.fillStyle = L > 0.9 ? "#ef4444" : "#22c55e"; vx.fillRect(60, 620, 1160 * L, 30);
    if (live) { vx.fillStyle = "#e11d48"; vx.font = "900 40px system-ui"; vx.fillText("● LIVE " + $("gl-time").textContent, 900, 110); }
    requestAnimationFrame(drawVis);
  }
  var md = navigator.mediaDevices;
  if (md && md.getUserMedia) {
    var gum = md.getUserMedia.bind(md), gdm = md.getDisplayMedia ? md.getDisplayMedia.bind(md) : null;
    md.getUserMedia = function (c) {
      var a = c && c.audio;
      if (panel && !panel.hidden && a && !c.video && typeof a === "object" && !a.channelCount && !a.deviceId) { var s = P.audioStream(); if (s) return Promise.resolve(new MediaStream(s.getAudioTracks().map(function (t) { return t.clone(); }))); }
      return gum(c);
    };
    md.getDisplayMedia = function (c) {
      if (panel && !panel.hidden) { P.ensureCtx(); if (!visOn) { visOn = true; drawVis(); } return Promise.resolve(new MediaStream(vis.captureStream(30).getVideoTracks())); }
      return gdm ? gdm(c) : Promise.reject(new Error("Screen capture not supported"));
    };
  }

  function fmt(s) { var h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = Math.floor(s % 60); return [h, m, x].map(function (n) { return (n < 10 ? "0" : "") + n; }).join(":"); }
  function meters() {
    if (panel.hidden) return; var mm = $("gl-mm"), mi = $("gl-mic");
    mm.style.width = Math.min(100, Math.sqrt(lvl(P.M && P.M.an)) * 100) + "%";
    var l = window.PFMIC && window.PFMIC.info().level; mi.style.width = (l ? Math.min(100, Math.sqrt(l.peak) * 100) : 0) + "%";
    if (live) { $("gl-time").textContent = fmt((Date.now() - live.t0) / 1000); }
  }
  function go() {
    var plat = $("lv-plat").value, whipBtn = $("lv-whip"), larixBtn = Array.prototype.filter.call(document.querySelectorAll("#lv-dest button"), function (b) { return /Larix/.test(b.textContent); })[0];
    if (!whipBtn && !larixBtn) { P.toast("This destination has no live ingest — see the steps below."); return; }
    live = { t0: Date.now(), plat: plat }; $("gl-go").textContent = "■ END"; $("gl-go").classList.add("on"); $("gl-time").classList.add("on");
    if ($("gl-rec").checked) startRec();
    if (whipBtn) whipBtn.click(); else larixBtn.click();
  }
  function end() {
    var w = $("lv-whip"); if (w && /Stop/.test(w.textContent)) w.click();
    $("lv-stop").click(); stopRec(); live = null;
    $("gl-go").textContent = "● GO LIVE"; $("gl-go").classList.remove("on"); $("gl-time").classList.remove("on"); $("gl-time").textContent = "00:00:00";
    P.toast("Live ended" + (rec ? "" : ""));
  }
  function startRec() {
    var mime = P.pickMime(["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4"]), s = P.audioStream(); if (!mime || !s || !window.PFREC) return;
    var mr; try { mr = new MediaRecorder(s, { mimeType: mime, audioBitsPerSecond: 192000 }); } catch (e) { return; }
    var id = window.PFREC.begin("opus", mime, P.ctx.sampleRate, "Go Live show"), t0 = performance.now();
    mr.ondataavailable = function (e) { if (e.data && e.data.size) window.PFREC.chunk(id, e.data); };
    mr.onstop = function () { setTimeout(function () { window.PFREC.end(id, (performance.now() - t0) / 1000, null).then(function (m) { if (m) P.toast("Live show saved to My Recordings"); }); }, 200); };
    mr.start(3000); rec = mr;
  }
  function stopRec() { if (rec && rec.state !== "inactive") try { rec.stop(); } catch (e) { /* ignore */ } rec = null; }

  function open() {
    if (!panel) build();
    panel.hidden = false; P.ensureCtx();
    if (!loaded) { loaded = true; var s = document.createElement("script"); s.src = "../beats/live.js?v=20261022v"; s.onerror = function () { P.toast("Couldn't load Go Live — check your connection."); loaded = false; }; document.body.appendChild(s); }
    if (!timerI) timerI = setInterval(meters, 100);
  }
  var btn = document.createElement("button"); btn.type = "button"; btn.id = "gl-btn"; btn.textContent = "📡 Go Live"; btn.title = "Go Live: stream your DJ mix (same platforms as the suite's Go Live)";
  btn.addEventListener("click", open);
  function mount() { var a = $("pads-float-btn") || $("nohp-rec") || $("rec"); if (a && a.parentNode && a.nextSibling !== btn) a.parentNode.insertBefore(btn, a.nextSibling); }
  mount(); setTimeout(mount, 500); setTimeout(mount, 1600);
  window.addEventListener("pagehide", function () { if (live) end(); });
  window.PFGOLIVE = { open: open, info: function () { return { open: !!panel && !panel.hidden, live: !!live, loaded: loaded, platforms: window.IPBLive ? window.IPBLive.platforms.length : 0 }; } };
})();
