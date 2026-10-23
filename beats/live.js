/* Go Live (BETA) — Island Beats Hub. Camera / screen / screen+camera PiP composite, quality picker, clip recorder,
   per-platform RTMP URL + stream key saved ON THIS DEVICE ONLY (localStorage "ipb_live_dest_v1", never sent anywhere
   by this page), one-tap Larix Broadcaster handoff (Larix Grove deep link), and a generic WHIP (RFC 9725) client.
   DOM + textContent only. Browsers cannot speak RTMP — RTMP platforms are reached through the free Larix app. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var KEY = "ipb_live_dest_v1";
  // how: "larix" (RTMP via Larix), "whip" (browser), "both", "guide" (no ingest). Only verified entries are listed.
  var P = [
    { id: "youtube", n: "YouTube", how: "larix", url: "rtmp://a.rtmp.youtube.com/live2", where: "YouTube Studio → Create → Go live → Stream tab (Stream URL + Stream key).", note: "First time you enable live on a channel YouTube can take up to 24 h. YouTube takes RTMP/RTMPS, HLS or DASH — not WHIP." },
    { id: "facebook", n: "Facebook", how: "larix", url: "rtmps://live-api-s.facebook.com:443/rtmp/", where: "facebook.com/live/producer → Streaming software → copy the stream key (turn on Persistent stream key to reuse it).", note: "Facebook can require a minimum account age / followers before Live is offered." },
    { id: "twitch", n: "Twitch", how: "both", url: "rtmp://live.twitch.tv/app", whip: "https://g.webrtc.live-video.net:4443/v2/offer", where: "Twitch Creator Dashboard → Settings → Stream → Primary stream key.", note: "WHIP: Twitch's WebRTC ingest (listed by OBS) uses your stream key as the Bearer token, H.264 + Opus. Browser access to it is not guaranteed — if the browser is refused, use Larix." },
    { id: "kick", n: "Kick", how: "larix", url: "", where: "Kick Creator Dashboard → Channel → Stream URL and Key (an rtmps:// address — paste it here).", note: "Kick: H.264, CBR, up to 1080p60 and 8,000 kbps. Set title + category on Kick first." },
    { id: "tiktok", n: "TikTok", how: "larix", url: "", where: "tiktok.com on a computer → Go LIVE (LIVE Producer) → copy Server URL + Stream Key.", note: "Only eligible accounts get a stream key: 18+, LIVE access for computer streaming (TikTok says about 1,000 followers, varies by region, can change). LIVE Studio approval alone does not give a key. Keys usually change every LIVE." },
    { id: "instagram", n: "Instagram Live", how: "larix", url: "", where: "instagram.com on a computer → Create → Live video → copy the URL + key Live Producer shows.", note: "Needs a public professional account; reported minimum 1,000 followers. The key changes every time." },
    { id: "x", n: "X (Twitter)", how: "larix", url: "", where: "studio.x.com/live (Media Studio Producer) → Sources → create a source with a region → copy RTMP URL + key.", note: "Producer access is set by X. One live stream per source at a time." },
    { id: "linkedin", n: "LinkedIn Live", how: "larix", url: "", where: "LinkedIn Live Studio → Manage streams → Prepare to go live → region → Get URL.", note: "Eligibility: 150+ followers/connections, account 30+ days old, good standing. URL + key appear 1 h before the scheduled start (2 h for verified Pages)." },
    { id: "rumble", n: "Rumble", how: "larix", url: "", where: "rumble.com/live → Go Live → fill in → Submit → Get the streamer configuration (RTMP URL + key).", note: "" },
    { id: "trovo", n: "Trovo", how: "larix", url: "", where: "Trovo Creator Studio → Stream URL + Stream Key.", note: "" },
    { id: "telegram", n: "Telegram (channel / group)", how: "larix", url: "", where: "Open your channel/group as owner/admin → Live Stream (or Video Chat) → Stream With… → copy Server URL + Stream Key, start Larix, then tap Start Streaming in Telegram.", note: "Each channel/group has its own URL + key." },
    { id: "custom", n: "Custom RTMP", how: "larix", url: "", where: "Any RTMP/RTMPS server (your own or a free restream service).", note: "" },
    { id: "whip", n: "Custom WHIP", how: "whip", url: "", where: "Any WHIP endpoint + bearer token (Broadcast Box, MediaMTX, Cloudflare Stream (paid), Dolby, Red5…).", note: "Streams straight from this browser — no app needed. The server must allow browser (CORS) requests." },
    { id: "whatsapp", n: "WhatsApp", how: "guide", note: "WhatsApp has no live broadcast / stream key. This is NOT a broadcast: share your watch link, post a recorded clip to Status or a Channel, or show the session live on a WhatsApp video call." }
  ];
  function load() { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; } }
  function save(d) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) { /* private */ } }
  var D = load(), cur = P[0];
  function el(t, a, kids) { var e = document.createElement(t); a = a || {}; Object.keys(a).forEach(function (k) { if (k === "text") e.textContent = a[k]; else if (k === "on") Object.keys(a.on).forEach(function (ev) { e.addEventListener(ev, a.on[ev]); }); else e.setAttribute(k, a[k]); }); (kids || []).forEach(function (c) { if (c) e.appendChild(c); }); return e; }
  function say(m, bad) { var s = $("lv-status"); s.textContent = m; s.className = "lv-status" + (bad ? " bad" : ""); }
  function copy(t, what) { if (!t) { say("Nothing to copy — paste the " + what + " first.", true); return; } (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { say(what + " copied."); }, function () { say("Copy blocked — long-press the box and copy.", true); }); }

  /* ---------- sources + composite ---------- */
  var cam = null, scr = null, mic = null, out = null, raf = 0, cv = $("lv-canvas"), cx = cv.getContext("2d"), vc = el("video", { muted: "", playsinline: "" }), vs = el("video", { muted: "", playsinline: "" });
  vc.muted = vs.muted = true;
  var Q = { "480": [854, 480, 1000], "720": [1280, 720, 2500], "1080": [1920, 1080, 4500] };
  function q() { return Q[$("lv-q").value] || Q["720"]; }
  function stopAll() { [cam, scr, mic].forEach(function (s) { if (s) s.getTracks().forEach(function (t) { t.stop(); }); }); cam = scr = mic = null; cancelAnimationFrame(raf); }
  function draw() {
    var w = cv.width, h = cv.height, mode = $("lv-src").value;
    cx.fillStyle = "#0b0d12"; cx.fillRect(0, 0, w, h);
    function fit(v, x, y, W, H) { if (!v.videoWidth) return; var r = Math.min(W / v.videoWidth, H / v.videoHeight), dw = v.videoWidth * r, dh = v.videoHeight * r; cx.drawImage(v, x + (W - dw) / 2, y + (H - dh) / 2, dw, dh); }
    if (mode === "cam") fit(vc, 0, 0, w, h);
    else if (mode === "screen") fit(vs, 0, 0, w, h);
    else { fit(vs, 0, 0, w, h); var pw = Math.round(w * 0.28), ph = Math.round(pw * 9 / 16), m = Math.round(w * 0.02), pos = $("lv-pip").value, x = pos.indexOf("l") >= 0 ? m : w - pw - m, y = pos.indexOf("t") >= 0 ? m : h - ph - m; cx.fillStyle = "#000"; cx.fillRect(x - 3, y - 3, pw + 6, ph + 6); fit(vc, x, y, pw, ph); }
    if ($("lv-title").value) { cx.font = "bold " + Math.round(h / 22) + "px system-ui"; cx.fillStyle = "rgba(0,0,0,.55)"; var tw = cx.measureText($("lv-title").value).width; cx.fillRect(0, h - h / 12, tw + 40, h / 12); cx.fillStyle = "#fbbf24"; cx.fillText($("lv-title").value, 20, h - h / 40); }
    raf = requestAnimationFrame(draw);
  }
  async function startSrc() {
    stopAll(); var mode = $("lv-src").value, Z = q();
    cv.width = Z[0]; cv.height = Z[1];
    try {
      if (mode !== "screen") { cam = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: Z[0] }, height: { ideal: Z[1] }, facingMode: $("lv-face").value } }); vc.srcObject = cam; await vc.play(); }
      if (mode !== "cam") {
        if (!navigator.mediaDevices.getDisplayMedia) { say("This browser can't capture the screen (Chrome on Android tablets usually can't). Use Camera, or screen-share inside Larix / a WhatsApp video call.", true); if (!cam) return false; $("lv-src").value = "cam"; }
        else { scr = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: true }); vs.srcObject = scr; await vs.play(); }
      }
      if ($("lv-mic").checked) mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    } catch (e) { say("Camera/screen not allowed: " + (e.message || e) + ". Allow it in the site settings and try again.", true); return false; }
    var vt = cv.captureStream(30).getVideoTracks()[0], tracks = [vt];
    [mic, scr].forEach(function (s) { if (s) s.getAudioTracks().forEach(function (t) { tracks.push(t); }); });
    out = new MediaStream(tracks); $("lv-preview").srcObject = out; draw();
    say("Preview on — " + Z[0] + "×" + Z[1] + ", " + Z[2] + " kbps target."); return true;
  }

  /* ---------- clip recorder (WhatsApp Status / Channel, any upload) ---------- */
  var rec = null, chunks = [];
  function recToggle() {
    if (rec) { rec.stop(); return; }
    if (!out) { say("Start the preview first.", true); return; }
    var mt = ["video/mp4;codecs=avc1,mp4a", "video/webm;codecs=vp8,opus", "video/webm"].filter(function (m) { return window.MediaRecorder && MediaRecorder.isTypeSupported(m); })[0];
    chunks = []; rec = new MediaRecorder(out, { mimeType: mt, videoBitsPerSecond: q()[2] * 1000 });
    rec.ondataavailable = function (e) { if (e.data.size) chunks.push(e.data); };
    rec.onstop = function () { var b = new Blob(chunks, { type: rec.mimeType }), ext = /mp4/.test(rec.mimeType) ? "mp4" : "webm", a = $("lv-clip"); a.href = URL.createObjectURL(b); a.download = "island-beats-clip." + ext; a.hidden = false; a.textContent = "⬇ Save clip (" + Math.round(b.size / 1024) + " KB, " + ext + ")"; rec = null; $("lv-rec").textContent = "● Record clip"; say("Clip ready — save it, then post it to WhatsApp Status or a Channel." + (ext === "webm" ? " WhatsApp prefers MP4; if it refuses the file, convert it first." : "")); };
    rec.start(1000); $("lv-rec").textContent = "■ Stop clip"; say("Recording clip…");
  }

  /* ---------- WHIP (RFC 9725) ---------- */
  var pc = null, whipRes = null;
  async function whipStart() {
    var d = D[cur.id] || {}, url = (d.whip || cur.whip || "").trim(), tok = (d.key || "").trim();
    if (!/^(https:\/\/|http:\/\/(localhost|127\.0\.0\.1)[:/])/.test(url)) { say("Enter the WHIP URL (https://…) first.", true); return; }
    if (!out && !(await startSrc())) return;
    pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    out.getTracks().forEach(function (t) { var tr = pc.addTransceiver(t, { direction: "sendonly" }); if (t.kind === "video" && tr.setCodecPreferences && RTCRtpSender.getCapabilities) { var c = RTCRtpSender.getCapabilities("video").codecs, h = c.filter(function (x) { return /h264/i.test(x.mimeType); }); if (h.length) tr.setCodecPreferences(h.concat(c.filter(function (x) { return !/h264/i.test(x.mimeType); }))); } });
    pc.onconnectionstatechange = function () { say("WHIP: " + pc.connectionState + (pc.connectionState === "connected" ? " — you are live on " + cur.n + "." : ""), /failed|disconnected/.test(pc.connectionState)); };
    try {
      await pc.setLocalDescription(await pc.createOffer());
      await new Promise(function (r) { if (pc.iceGatheringState === "complete") return r(); var t = setTimeout(r, 2500); pc.addEventListener("icegatheringstatechange", function () { if (pc.iceGatheringState === "complete") { clearTimeout(t); r(); } }); });
      var h = { "Content-Type": "application/sdp" }; if (tok) h.Authorization = "Bearer " + tok;
      var r = await fetch(url, { method: "POST", headers: h, body: pc.localDescription.sdp });
      if (r.status !== 201 && !r.ok) throw new Error("server said " + r.status);
      var loc = r.headers.get("Location"); whipRes = loc ? new URL(loc, url).href : null;
      await pc.setRemoteDescription({ type: "answer", sdp: await r.text() });
      pc.getSenders().forEach(function (s) { if (s.track && s.track.kind === "video") { var p = s.getParameters(); p.encodings = p.encodings && p.encodings.length ? p.encodings : [{}]; p.encodings[0].maxBitrate = q()[2] * 1000; s.setParameters(p).catch(function () {}); } });
      $("lv-whip").textContent = "■ Stop WHIP"; say("WHIP: connecting…");
    } catch (e) { var m = String(e.message || e); say("WHIP failed: " + m + (/fetch|NetworkError|Failed/.test(m) ? " — the server probably blocks browser requests (CORS). Use Larix instead." : ""), true); whipStop(); }
  }
  function whipStop() { if (whipRes) fetch(whipRes, { method: "DELETE", headers: (D[cur.id] || {}).key ? { Authorization: "Bearer " + D[cur.id].key } : {} }).catch(function () {}); whipRes = null; if (pc) pc.close(); pc = null; var wb = $("lv-whip"); if (wb) wb.textContent = "▶ Go live (WHIP)"; }

  /* ---------- Larix handoff ---------- */
  function rtmpFull(d) { var u = (d.url || cur.url || "").trim(), k = (d.key || "").trim(); if (!u) return ""; return k ? u.replace(/\/+$/, "") + "/" + k : u; }
  function larix() {
    var d = D[cur.id] || {}, full = rtmpFull(d), Z = q();
    if (!/^rtmps?:\/\//.test(full)) { say("Paste the RTMP server URL (and key) first.", true); return; }
    var l = "larix://set/v1?conn[][url]=" + encodeURIComponent(full) + "&conn[][name]=" + encodeURIComponent("Island Beats → " + cur.n) + "&conn[][mode]=av&conn[][overwrite]=on" + "&enc[vid][res]=" + Z[0] + "x" + Z[1] + "&enc[vid][fps]=30&enc[vid][bitrate]=" + Z[2] + "&enc[vid][keyframe]=2&enc[aud][bitrate]=128&enc[aud][samples]=48000";
    copy(full, "Full RTMP address");
    location.href = l;
    setTimeout(function () { say("If Larix didn't open, install the free Larix Broadcaster from Google Play, then tap this again. The address is also copied."); }, 1500);
  }

  /* ---------- UI ---------- */
  function renderDest() {
    var box = $("lv-dest"); box.textContent = ""; var d = D[cur.id] || (D[cur.id] = {});
    var how = { larix: "RTMP → via the free Larix Broadcaster app", whip: "WHIP → straight from this browser", both: "RTMP via Larix, or WHIP from this browser", guide: "No live ingest — share + clip + video call" }[cur.how];
    box.appendChild(el("p", { class: "lv-how", text: cur.n + " · " + how }));
    if (cur.where) box.appendChild(el("p", { class: "sub", text: "Where to find it: " + cur.where }));
    if (cur.note) box.appendChild(el("p", { class: "lv-note", text: cur.note }));
    if (cur.how === "guide") return renderWA(box);
    function inp(lbl, k, ph, secret) {
      var i = el("input", { type: secret ? "password" : "url", value: d[k] || "", placeholder: ph, autocomplete: "off", spellcheck: "false", on: { change: function () { d[k] = this.value.trim(); save(D); say("Saved on this device only."); } } });
      var row = el("label", { class: "lv-f" }, [el("span", { text: lbl }), i]);
      if (secret) row.appendChild(el("button", { type: "button", class: "btn small", text: "👁 Show", on: { click: function () { i.type = i.type === "password" ? "text" : "password"; this.textContent = i.type === "password" ? "👁 Show" : "🙈 Hide"; } } }));
      return row;
    }
    if (cur.how !== "whip") box.appendChild(inp("RTMP server URL", "url", cur.url || "rtmps://…", false));
    if (cur.how !== "larix") box.appendChild(inp("WHIP URL", "whip", cur.whip || "https://…/whip", false));
    box.appendChild(inp(cur.how === "whip" ? "Bearer token" : "Stream key", "key", "kept on this device, hidden", true));
    var acts = el("div", { class: "lv-acts" });
    if (cur.how !== "whip") { acts.appendChild(el("button", { type: "button", class: "btn primary", text: "📲 Open in Larix (RTMP)", on: { click: larix } })); acts.appendChild(el("button", { type: "button", class: "btn", text: "Copy URL", on: { click: function () { copy(d.url || cur.url, "Server URL"); } } })); acts.appendChild(el("button", { type: "button", class: "btn", text: "Copy key", on: { click: function () { copy(d.key, "Stream key"); } } })); }
    if (cur.how !== "larix") acts.appendChild(el("button", { type: "button", id: "lv-whip", class: "btn rec", text: pc ? "■ Stop WHIP" : "▶ Go live (WHIP)", on: { click: function () { pc ? whipStop() : whipStart(); } } }));
    acts.appendChild(el("button", { type: "button", class: "btn ghost", text: "🗑 Clear " + cur.n, on: { click: function () { delete D[cur.id]; save(D); renderDest(); say(cur.n + " details cleared from this device."); } } }));
    box.appendChild(acts);
  }
  function renderWA(box) {
    var link = el("input", { type: "url", value: (D.whatsapp && D.whatsapp.watch) || "", placeholder: "Your watch link (YouTube / Twitch / Telegram channel…)", on: { change: function () { D.whatsapp = { watch: this.value.trim() }; save(D); } } });
    box.appendChild(el("label", { class: "lv-f" }, [el("span", { text: "Watch link to share" }), link]));
    box.appendChild(el("div", { class: "lv-acts" }, [
      el("button", { type: "button", class: "btn primary", text: "Share link on WhatsApp", on: { click: function () { var t = "🔴 I'm live now on Island Beats — come watch: " + (link.value || "https://madinc47-prog.github.io/beats/"); window.open("https://wa.me/?text=" + encodeURIComponent(t), "_blank", "noopener"); } } }),
      el("button", { type: "button", class: "btn", text: "● Record a clip for Status / Channel", on: { click: function () { $("lv-rec").scrollIntoView({ block: "center" }); } } })]));
    var ol = el("ol", { class: "lv-guide" });
    ["Start a WhatsApp video call (or group call) with the people you want to show.", "Tap the camera switch to face your setup, or use Share screen in the call to show this page.", "Keep the Tab plugged in; music from the speakers is picked up by the mic (no studio-quality audio).", "Up to 32 people in a group call — it is a call, not a public broadcast."].forEach(function (s) { ol.appendChild(el("li", { text: s })); });
    box.appendChild(el("p", { class: "lv-how", text: "Going live through a WhatsApp video call" })); box.appendChild(ol);
  }
  var sel = $("lv-plat"); P.forEach(function (p) { sel.appendChild(el("option", { value: p.id, text: p.n + ({ larix: " · Larix", whip: " · browser WHIP", both: " · Larix / WHIP", guide: " · share only" }[p.how]) })); });
  sel.addEventListener("change", function () { cur = P.filter(function (p) { return p.id === sel.value; })[0]; renderDest(); });
  $("lv-start").addEventListener("click", startSrc);
  $("lv-stop").addEventListener("click", function () { whipStop(); if (rec && rec.state !== "inactive") { try { rec.stop(); } catch (e) {} } stopAll(); out = null; $("lv-preview").srcObject = null; say("Stopped."); });
  $("lv-rec").addEventListener("click", recToggle);
  $("lv-clearall").addEventListener("click", function () { if (!confirm("Clear every saved stream URL and key from this device?")) return; D = {}; save(D); renderDest(); say("All stream details cleared."); });
  renderDest();
  window.IPBLive = { platforms: P.map(function (p) { return { id: p.id, name: p.n, how: p.how }; }) };
})();
