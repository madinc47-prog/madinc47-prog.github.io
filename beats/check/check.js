/* Island Pin Beats · Sound check (/beats/check/). Runs only on this device; nothing is sent anywhere. */
(function () {
  "use strict";
  var R = { time: new Date().toISOString() }, ctx = null, $ = function (id) { return document.getElementById(id); };
  function step(id, status, out, msg, cls) {
    var s = $(id), b = s.querySelector(".badge");
    if (status) { b.textContent = status; b.className = "badge " + status; }
    if (out != null) s.querySelector(".out").textContent = out;
    if (msg != null) { var m = s.querySelector(".msg"); m.textContent = msg; m.className = "msg " + (cls || (status === "PASS" ? "ok" : status === "FAIL" ? "bad" : "warn")); }
    R[id.slice(2)] = R[id.slice(2)] || {}; if (status) R[id.slice(2)].result = status;
    report();
  }
  function report() {
    var lines = ["Island Pin Beats · Sound check", "time: " + R.time];
    Object.keys(R).forEach(function (k) { if (k === "time") return; var v = R[k]; lines.push(k + ": " + (typeof v === "object" ? JSON.stringify(v) : v)); });
    $("report").textContent = lines.join("\n");
  }
  var ua = navigator.userAgent;

  /* 1 · device / browser */
  (function () {
    var d = {}, warn = [];
    d.ua = ua; d.platform = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || "";
    var a = ua.match(/Android\s([\d.]+)/), i = ua.match(/OS (\d+)_(\d+)(?:_(\d+))? like Mac OS X/);
    d.os = a ? "Android " + a[1] : i ? "iOS " + i[1] + "." + i[2] : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "unknown";
    var model = ua.match(/Android [\d.]+; ([^;)]+)/); if (model) d.model = model[1].trim();
    var sb = ua.match(/SamsungBrowser\/([\d.]+)/), cr = ua.match(/(?:Chrome|CriOS)\/([\d.]+)/), fx = ua.match(/(?:Firefox|FxiOS)\/([\d.]+)/), ed = ua.match(/EdgA?\/([\d.]+)/);
    d.browser = sb ? "Samsung Internet " + sb[1] : ed ? "Edge " + ed[1] : fx ? "Firefox " + fx[1] : cr ? "Chrome " + cr[1] : /Safari/.test(ua) ? "Safari" : "unknown";
    var inapp = /FBAN|FBAV|FB_IAB/.test(ua) ? "Facebook" : /Instagram/.test(ua) ? "Instagram" : /WhatsApp/i.test(ua) ? "WhatsApp" : /Line\//.test(ua) ? "LINE" : /TikTok|musical_ly|BytedanceWebview/i.test(ua) ? "TikTok" : /Snapchat/i.test(ua) ? "Snapchat" : /; wv\)/.test(ua) ? "an app's built-in browser" : "";
    d.inAppBrowser = inapp || "no";
    d.homeScreen = (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true ? "yes (opened from a home-screen shortcut)" : "no";
    d.screen = screen.width + "x" + screen.height + " @" + (window.devicePixelRatio || 1) + "x, window " + innerWidth + "x" + innerHeight;
    d.darkMode = window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    d.touch = navigator.maxTouchPoints || 0;
    d.secure = window.isSecureContext;
    d.webAudio = !!(window.AudioContext || window.webkitAudioContext);
    d.mic = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    d.audioSession = navigator.audioSession ? navigator.audioSession.type : "n/a";
    R.device = d;
    if (inapp) warn.push("You're inside " + inapp + "'s built-in browser — it often blocks sound and the mic. Tap ⋮ / the share icon and choose \"Open in Chrome\" (or Samsung Internet / Safari).");
    if (sb) warn.push("Samsung Internet: if sound is missing, check ⋮ Settings → Sites and downloads → Allow sites to play sound / media autoplay, and turn off \"Video assistant\". Chrome also works.");
    if (!d.webAudio) warn.push("This browser has no Web Audio — Beat can't make sound here. Use Chrome.");
    var st = inapp || !d.webAudio || !d.secure ? "FAIL" : sb ? "WARN" : "PASS";
    step("s-device", st, Object.keys(d).map(function (k) { return k + ": " + d[k]; }).join("\n"), warn.join(" ") || "Browser looks fine for Beat.");
  })();

  /* 2 · version / old copies */
  function vOf(html) { return (html.match(/app\.js\?v=([\w.-]+)/) || [])[1] || null; }
  (function () {
    var v = {};
    var last = null; try { last = localStorage.getItem("ipb_build_seen"); } catch (e) { /* ignore */ }
    v.lastLoadedOnThisDevice = last || "never (open Beat once)";
    Promise.all([
      fetch("../?check=" + Date.now(), { cache: "no-store" }).then(function (r) { return r.text(); }).then(vOf).catch(function () { return null; }),
      fetch("../", { cache: "force-cache" }).then(function (r) { return r.text(); }).then(vOf).catch(function () { return null; }),
      navigator.serviceWorker && navigator.serviceWorker.getRegistrations ? navigator.serviceWorker.getRegistrations().then(function (rs) { return rs.map(function (r) { return r.scope; }); }).catch(function () { return []; }) : Promise.resolve([]),
      window.caches && caches.keys ? caches.keys().catch(function () { return []; }) : Promise.resolve([])
    ]).then(function (x) {
      v.live = x[0]; v.browserCached = x[1]; v.serviceWorkers = x[2]; v.caches = x[3];
      var swBeats = x[2].filter(function (s) { var p = new URL(s).pathname; return "/beats/".indexOf(p) === 0 || p.indexOf("/beats/") === 0; }); // scopes that control Beat
      R.version = v;
      var stale = (v.browserCached && v.live && v.browserCached !== v.live) || (last && v.live && last !== v.live);
      var st = swBeats.length ? "FAIL" : stale ? "WARN" : v.live ? "PASS" : "WARN";
      var msg = swBeats.length ? "An old offline copy (service worker) is controlling Beat. Tap \"Clear old copy and reload\"." :
        stale ? "This device last ran an older Beat (" + (last || v.browserCached) + "; newest is " + v.live + "). Open Beat again — it updates itself — or tap \"Clear old copy and reload\"." :
        v.live ? "You have the newest Beat (" + v.live + ")." : "Couldn't reach the site to check the version (offline?).";
      step("s-version", st, Object.keys(v).map(function (k) { return k + ": " + (Array.isArray(v[k]) ? (v[k].join(", ") || "none") : v[k]); }).join("\n"), msg);
    });
  })();
  $("b-clear").addEventListener("click", function () {
    var jobs = [];
    if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) jobs.push(navigator.serviceWorker.getRegistrations().then(function (rs) { return Promise.all(rs.map(function (r) { return r.unregister(); })); }));
    if (window.caches && caches.keys) jobs.push(caches.keys().then(function (ks) { return Promise.all(ks.map(function (k) { return caches.delete(k); })); }));
    try { localStorage.removeItem("ipb_reloaded_for"); } catch (e) { /* ignore */ }
    Promise.all(jobs).catch(function () {}).then(function () { location.href = "../?fresh=" + Date.now(); });
  });

  /* 3 · AudioContext */
  function getCtx() {
    if (ctx) return ctx;
    var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch (e) { /* ignore */ }
    try { ctx = new AC({ latencyHint: "interactive" }); } catch (e) { ctx = new AC(); }
    ctx.onstatechange = function () { R.audio = R.audio || {}; (R.audio.stateChanges = R.audio.stateChanges || []).push(ctx.state); report(); };
    return ctx;
  }
  $("b-audio").addEventListener("click", function () {
    var c = getCtx();
    if (!c) { step("s-audio", "FAIL", "no Web Audio", "This browser can't play Beat's sounds. Use Chrome."); return; }
    var p = c.resume ? c.resume() : null;
    setTimeout(function () {
      var a = R.audio = R.audio || {};
      a.state = c.state; a.sampleRate = c.sampleRate; a.baseLatencyMs = c.baseLatency != null ? Math.round(c.baseLatency * 1000) : "n/a"; a.outputLatencyMs = c.outputLatency != null ? Math.round(c.outputLatency * 1000) : "n/a";
      var ok = c.state === "running";
      step("s-audio", ok ? "PASS" : "FAIL", "state: " + a.state + "\nsample rate: " + a.sampleRate + " Hz\nlatency: " + a.baseLatencyMs + " + " + a.outputLatencyMs + " ms",
        ok ? "Sound engine is running." : "Sound is paused by your device (state: " + c.state + "). End any call, close apps playing audio, then tap the button again.");
    }, 400);
    if (p && p.catch) p.catch(function () {});
  });

  function ask(id, key, after) {
    var s = $(id), row = s.querySelector(".ask"); row.hidden = false;
    row.querySelectorAll("button").forEach(function (b) {
      b.onclick = function () { R[key] = R[key] || {}; R[key].heard = b.dataset.a; after(b.dataset.a === "yes"); };
    });
  }
  /* 4 · Web Audio beep */
  $("b-beep").addEventListener("click", function () {
    var c = getCtx(); if (!c) return;
    c.resume && c.resume();
    var t = c.currentTime + 0.05, o = c.createOscillator(), g = c.createGain();
    o.frequency.value = 660; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.35, t + 0.02); g.gain.setValueAtTime(0.35, t + 0.5); g.gain.linearRampToValueAtTime(0, t + 0.6);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + 0.65);
    R.beep = { ctxState: c.state };
    step("s-beep", null, "context: " + c.state, "Beep played — did you hear it?", "warn");
    ask("s-beep", "beep", function (yes) {
      step("s-beep", yes ? "PASS" : "FAIL", null, yes ? "Web Audio works — the pads should make sound." :
        "No beep: check the volume (media volume, not ringer), that no call is active, and that Bluetooth isn't connected to something else. On iPhone, flip the silent switch off. Then try again.");
    });
  });
  /* 5 · HTML <audio> (normal media player) */
  function beepWav() {
    var sr = 22050, n = Math.round(sr * 0.6), b = new ArrayBuffer(44 + n * 2), v = new DataView(b);
    function s(o, t) { for (var i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); }
    s(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); s(8, "WAVEfmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); s(36, "data"); v.setUint32(40, n * 2, true);
    for (var i = 0; i < n; i++) { var e = Math.min(1, i / 400, (n - i) / 400); v.setInt16(44 + i * 2, Math.sin(2 * Math.PI * 520 * i / sr) * 12000 * e, true); }
    return URL.createObjectURL(new Blob([b], { type: "audio/wav" }));
  }
  $("b-html").addEventListener("click", function () {
    var el = new Audio(beepWav());
    var p = el.play();
    var done = function (err) {
      R.htmlAudio = { played: !err, error: err ? String(err.name || err) : null };
      step("s-html", err ? "FAIL" : null, err ? "error: " + (err.name || err) : "playing", err ? "The browser refused to play sound (" + (err.name || err) + "). Check media autoplay / sound settings for this site." : "Did you hear it?", err ? null : "warn");
      if (!err) ask("s-html", "htmlAudio", function (yes) {
        var webYes = R.beep && R.beep.heard === "yes";
        step("s-html", yes ? "PASS" : "FAIL", null, yes ? (R.beep && R.beep.heard === "no" ? "Normal audio works but Web Audio didn't — on iPhone that's the silent switch; on Android, close any call and reopen Beat." : "Normal audio works.") :
          "No sound from the normal player either — the phone's media volume is down, a call is holding the audio, or sound is going to a Bluetooth device.");
      });
    };
    if (p && p.then) p.then(function () { done(null); }, done); else done(null);
  });

  /* 6 · real kit sample, FLAC and MP3 */
  function decode(c, ab) {
    return new Promise(function (res, rej) { var done = false; try { var pr = c.decodeAudioData(ab, function (b) { if (!done) { done = true; res(b); } }, function (e) { if (!done) { done = true; rej(e || new Error("decode failed")); } }); if (pr && pr.then) pr.then(function (b) { if (!done) { done = true; res(b); } }, function (e) { if (!done) { done = true; rej(e); } }); } catch (e) { rej(e); } });
  }
  $("b-sample").addEventListener("click", function () {
    var c = getCtx(); if (!c) return; c.resume && c.resume();
    var S = R.sample = { canPlayFlac: (new Audio()).canPlayType("audio/flac") || "no", canPlayMp3: (new Audio()).canPlayType("audio/mpeg") || "no" };
    step("s-sample", null, "loading…", "", "warn");
    function one(url, key) {
      var t0 = performance.now();
      return fetch(url, { cache: "no-store" }).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.arrayBuffer(); })
        .then(function (ab) { S[key + "Bytes"] = ab.byteLength; return decode(c, ab); })
        .then(function (b) { var d = b.getChannelData(0), pk = 0; for (var i = 0; i < d.length; i++) pk = Math.max(pk, Math.abs(d[i])); S[key] = "ok " + b.duration.toFixed(2) + "s " + b.sampleRate + "Hz peak " + pk.toFixed(2) + " (" + Math.round(performance.now() - t0) + " ms)"; return b; })
        .catch(function (e) { S[key] = "FAIL " + (e && (e.name || e.message) || e); return null; });
    }
    Promise.all([one("../samples/kick_rusty.flac", "flac"), one("../samples/mp3/kick_rusty.mp3", "mp3")]).then(function (bs) {
      var buf = bs[0] || bs[1];
      if (buf) { var s = c.createBufferSource(), g = c.createGain(); g.gain.value = 0.9; s.buffer = buf; s.connect(g); g.connect(c.destination); s.start(c.currentTime + 0.05); }
      var out = "FLAC: " + S.flac + "\nMP3: " + S.mp3 + "\nbrowser says FLAC: " + S.canPlayFlac + ", MP3: " + S.canPlayMp3 + "\ncontext: " + c.state;
      if (!buf) { step("s-sample", "FAIL", out, "The drum sounds couldn't be downloaded or decoded. Check the internet connection and reload."); return; }
      step("s-sample", bs[0] && bs[1] ? null : "WARN", out, (bs[0] ? "" : "FLAC didn't decode — Beat uses the MP3 copies instead (that's fine). ") + "Kick played — did you hear it?", "warn");
      ask("s-sample", "sample", function (yes) { step("s-sample", yes ? "PASS" : "FAIL", null, yes ? "Kit sounds load and play." : "The kick loaded but you didn't hear it — same cause as the beep (volume, call, Bluetooth)."); });
    });
  });

  /* 7 · mic */
  var mic = null;
  $("b-mic").addEventListener("click", function () {
    if (mic) return;
    var c = getCtx(); if (!c) return; c.resume && c.resume();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { step("s-mic", "FAIL", "", "This browser can't use the microphone" + (window.isSecureContext ? "." : " on an insecure page.")); return; }
    step("s-mic", null, "asking for the mic…", "If a pop-up asks to use the microphone, tap Allow.", "warn");
    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }).then(function (stream) {
      var tr = stream.getAudioTracks()[0], st = tr.getSettings ? tr.getSettings() : {}, src = c.createMediaStreamSource(stream), an = c.createAnalyser(); an.fftSize = 1024; src.connect(an);
      var M = R.mic = { label: tr.label, readyState: tr.readyState, muted: tr.muted, sampleRate: st.sampleRate, channels: st.channelCount, echoCancellation: st.echoCancellation, noiseSuppression: st.noiseSuppression, autoGainControl: st.autoGainControl, events: [] };
      tr.addEventListener("mute", function () { M.events.push("muted"); }); tr.addEventListener("unmute", function () { M.events.push("unmuted"); }); tr.addEventListener("ended", function () { M.events.push("ended"); });
      mic = stream;
      var buf = new Float32Array(an.fftSize), t0 = performance.now(), max = 0, sumDb = 0, n = 0, warned = false;
      (function tick() {
        an.getFloatTimeDomainData(buf); var pk = 0; for (var i = 0; i < buf.length; i++) pk = Math.max(pk, Math.abs(buf[i]));
        max = Math.max(max, pk); var db = pk > 0 ? 20 * Math.log10(pk) : -100; sumDb += db; n++;
        $("mic-bar").style.width = Math.max(0, Math.min(100, (db + 60) / 60 * 100)) + "%";
        var el = performance.now() - t0;
        if (!warned && el > 1500 && max < 0.00005) { warned = true; step("s-mic", null, null, "Your mic is sending silence. Close any call or app using the mic (voice calls, WhatsApp, recorders), check Microphone access is ON in quick settings, then try again.", "bad"); }
        if (el < 5000 && tr.readyState === "live") { requestAnimationFrame(tick); return; }
        stream.getTracks().forEach(function (t) { t.stop(); }); mic = null; $("mic-bar").style.width = "0";
        M.peak = +max.toFixed(4); M.peakDb = max > 0 ? Math.round(20 * Math.log10(max)) : -100; M.endedEarly = el < 4900;
        var silent = max < 0.00005, quiet = max < 0.02;
        step("s-mic", silent || M.endedEarly ? "FAIL" : quiet ? "WARN" : "PASS",
          "mic: " + (M.label || "?") + "\nloudest: " + M.peakDb + " dB\nmuted by system: " + M.muted + (M.events.length ? " (" + M.events.join(", ") + ")" : "") + "\nraw (no echo-cancel/noise/auto-gain): " + (M.echoCancellation === false && M.noiseSuppression === false && M.autoGainControl === false ? "yes" : "no") + "\nrate: " + (M.sampleRate || "?") + " Hz",
          M.endedEarly ? "The mic was taken away mid-test (a call or another app). Close it and try again." : silent ? "Your mic is sending silence. Close any call or app using the mic (voice calls, WhatsApp, recorders), check Microphone access is ON in quick settings, then try again." :
          quiet ? "The mic works but it's very quiet — talk closer to the phone." : "The mic works.");
        outputStep();
      })();
    }).catch(function (e) {
      var n = e && e.name; R.mic = { error: n || String(e) };
      step("s-mic", "FAIL", "error: " + (n || e), n === "NotAllowedError" || n === "SecurityError" ? "Microphone is blocked. Allow the microphone: tap the lock icon by the address bar > Permissions > Microphone > Allow, then try again." :
        n === "NotFoundError" ? "No microphone found (or it's switched off in Android settings)." : n === "NotReadableError" ? "The mic is busy — another app or a call is using it." : "Couldn't open the mic (" + (n || e) + ").");
      outputStep();
    });
  });

  /* 8 · output route + visibility */
  function outputStep() {
    var o = R.output = { visible: document.visibilityState, audioSession: navigator.audioSession ? navigator.audioSession.type + " / " + (navigator.audioSession.state || "") : "n/a", setSinkId: "setSinkId" in HTMLMediaElement.prototype, ctxState: ctx ? ctx.state : "not started" };
    var md = navigator.mediaDevices;
    (md && md.enumerateDevices ? md.enumerateDevices() : Promise.resolve([])).then(function (ds) {
      o.outputs = ds.filter(function (d) { return d.kind === "audiooutput"; }).map(function (d) { return d.label || "(hidden until mic allowed)"; });
      o.inputs = ds.filter(function (d) { return d.kind === "audioinput"; }).map(function (d) { return d.label || "(hidden)"; });
      var bt = o.outputs.concat(o.inputs).some(function (l) { return /bluetooth|buds|airpods|bt /i.test(l); });
      step("s-output", o.ctxState === "running" || o.ctxState === "not started" ? (bt ? "WARN" : "PASS") : "FAIL",
        "page visible: " + o.visible + "\nsound engine: " + o.ctxState + "\naudio session: " + o.audioSession + "\noutputs: " + (o.outputs.join(", ") || "default") + "\ninputs: " + (o.inputs.join(", ") || "default"),
        bt ? "A Bluetooth device is connected — sound may be going there." : o.ctxState === "running" || o.ctxState === "not started" ? "Output looks normal." : "Sound is paused by your device (a call or another app may be using audio).");
    });
  }
  outputStep();
  document.addEventListener("visibilitychange", function () { R.output = R.output || {}; R.output.visible = document.visibilityState; report(); });

  /* report */
  $("b-copy").addEventListener("click", function () {
    var t = $("report").textContent, m = $("copy-msg");
    function fallback() { var ta = document.createElement("textarea"); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); m.textContent = "Copied. Paste it in the chat."; m.className = "msg ok"; } catch (e) { m.textContent = "Copy failed — press and hold the report to copy it."; m.className = "msg bad"; } ta.remove(); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(function () { m.textContent = "Copied. Paste it in the chat."; m.className = "msg ok"; }, fallback); else fallback();
  });
  $("b-share").addEventListener("click", function () {
    var t = $("report").textContent;
    if (navigator.share) navigator.share({ title: "Beat sound check", text: t }).catch(function () {});
    else $("b-copy").click();
  });
  report();
})();
