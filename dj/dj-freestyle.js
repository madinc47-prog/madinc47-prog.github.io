/* DJ Psycho Fingers — LIVE FREESTYLE (DJ + rapper session). One tap: Auto DJ rolls instrumentals non-stop, the one-tap
 * mic goes live (clean chain, NO ducking — beat at full level; mic only to recording unless headphones), the show (mic + beat) records with 2 s chunks
 * autosaved to IndexedDB (nothing is lost if the page is hidden or closed). Stop session → saved as "Freestyle <date time>"
 * in My Freestyles (play, rename, download/share, delete, load to a deck, send to Lyrics Lab). Data stays on this device. */
(function () {
  "use strict";
  var P = window.PFDJ; if (!P) return;
  var $ = function (id) { return document.getElementById(id); };
  var DBN = "pfdj_freestyle", S = null, LIST = [], urls = {};
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () { /* ignore */ });
  function db() {
    return new Promise(function (res, rej) {
      var r = indexedDB.open(DBN, 1);
      r.onupgradeneeded = function () { var d = r.result; d.createObjectStore("takes", { keyPath: "id" }); d.createObjectStore("chunks", { autoIncrement: true }).createIndex("sid", "sid"); };
      r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); };
    });
  }
  function tx(stores, mode, fn) { return db().then(function (d) { return new Promise(function (res, rej) { var t = d.transaction(stores, mode), out = fn(t); t.oncomplete = function () { d.close(); res(out && out.result !== undefined ? out.result : out); }; t.onerror = function () { d.close(); rej(t.error); }; }); }); }
  function getAll(store) { return db().then(function (d) { return new Promise(function (res) { var q = d.transaction(store).objectStore(store).getAll(); q.onsuccess = function () { d.close(); res(q.result || []); }; q.onerror = function () { d.close(); res([]); }; }); }); }
  function stamp(t) { return new Date(t).toLocaleString([], { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); }
  function ext(m) { return /ogg/.test(m) ? "ogg" : /mp4/.test(m) ? "m4a" : "webm"; }

  // chunks → takes (also recovers a session cut off by a closed tab / crash)
  function finalize(sid, meta) {
    return getAll("chunks").then(function (cs) {
      cs = cs.filter(function (c) { return c.sid === sid; }).sort(function (a, b) { return a.i - b.i; });
      if (!cs.length) return null;
      var mime = cs[0].mime, t0 = cs[0].t0, dur = (meta && meta.dur) || cs.length * 2;
      var take = { id: sid, name: "Freestyle " + stamp(t0) + (meta ? "" : " (recovered)"), created: t0, dur: dur, mime: mime, bpm: meta && meta.bpm || null, blob: new Blob(cs.map(function (c) { return c.data; }), { type: mime.split(";")[0] }) };
      return tx(["takes", "chunks"], "readwrite", function (t) {
        t.objectStore("takes").put(take);
        var ix = t.objectStore("chunks").index("sid").openCursor(IDBKeyRange.only(sid));
        ix.onsuccess = function () { var c = ix.result; if (c) { c.delete(); c.continue(); } };
      }).then(function () { return take; });
    });
  }
  function recover() {
    return getAll("chunks").then(function (cs) {
      var ids = {}; cs.forEach(function (c) { ids[c.sid] = 1; });
      return Promise.all(Object.keys(ids).filter(function (s) { return !S || S.sid !== s; }).map(function (s) { return finalize(s, null); }));
    }).then(function (r) { if (r.filter(Boolean).length) P.toast("Recovered " + r.filter(Boolean).length + " unfinished freestyle(s) into My Recordings"); });
  }
  function load() { return getAll("takes").then(function (l) { LIST = l.sort(function (a, b) { return b.created - a.created; }); render(); if (window.PFREC) window.PFREC.load(); }); }

  /* ---------- session ---------- */
  function cur() { var A = window.PFAUTODJ && window.PFAUTODJ.A; return (A && A.cur) || P.DECKS.filter(function (d) { return d.playing; })[0] || null; }
  function start() {
    if (S) return;
    if (!P.ensureCtx()) return;
    var mime = "audio/mpeg";   /* v20261022w: live MP3 320 */
    if (!window.PFMP3 || !window.PFMP3.Recorder.isSupported()) { P.toast("This browser can't record here."); return; }
    var mic = window.PFMIC, C = mic && mic.info().C;
    S = { sid: "fs_" + Date.now().toString(36), t0: Date.now(), i: 0, mime: mime, startedAD: false, oldDepth: C ? C.depth : 10, oldGain: C ? C.gain : 0, bars0: null };
    var AD = window.PFAUTODJ;
    if (AD && !AD.A.on) { AD.start(); S.startedAD = true; }
    if (mic && mic.info().state === "live") mic.stop();   /* v20261022w: Freestyle uses its own voice mic (no talkover ducking) */
    fsMic(S);
    var mr = window.PFMP3.make(P.audioStream(), P.ctx);
    mr.ondataavailable = function (e) {
      if (!e.data || !e.data.size || !S) return;
      var rec = { sid: S.sid, i: S.i++, t0: S.t0, mime: mime, data: e.data };
      tx(["chunks"], "readwrite", function (t) { t.objectStore("chunks").add(rec); }).catch(function () { /* ignore */ });
    };
    S.mr = mr; mr.start(2000);
    S.timer = setInterval(hud, 120);
    $("fs-hud").hidden = false; $("fs-go").classList.add("on"); $("fs-go").textContent = "● FREESTYLE LIVE";
    P.toast("Live Freestyle: beat rolling, mic live, recording — ride it!");
  }
  /* v20261022w — FREESTYLE VOICE MIC (Freestyle only). Own getUserMedia with noiseSuppression + voiceIsolation (Chrome) but
     echoCancellation OFF: echo cancel is what flips Android Chrome into the voice-call audio path ("beat in the distance").
     Chain: mic → high-pass 90 Hz → gentle noise gate → (a) the show mix bus that is RECORDED, never the speakers (no feedback),
     (b) its own MP3 recorder → "Voice only (Freestyle)" in My Recordings. The beat path is never touched: no ducking, no filters. */
  function fsMic(s) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { P.toast("Mic not available here"); return; }
    var c = { echoCancellation: false, noiseSuppression: true, autoGainControl: false, voiceIsolation: true, channelCount: { ideal: 1 } };
    if (window.PFDJ_MICDEV) c.deviceId = { exact: window.PFDJ_MICDEV };
    navigator.mediaDevices.getUserMedia({ audio: c, video: false }).then(function (st) {
      if (S !== s) { st.getTracks().forEach(function (t) { t.stop(); }); return; }
      var x = P.ctx, n = s.mic = { st: st };
      n.src = x.createMediaStreamSource(st);
      n.hp = x.createBiquadFilter(); n.hp.type = "highpass"; n.hp.frequency.value = 90; n.hp.Q.value = 0.7;
      n.gate = x.createGain(); n.gate.gain.value = 0;
      n.an = x.createAnalyser(); n.an.fftSize = 1024; n.buf = new Float32Array(1024);
      n.dest = x.createMediaStreamDestination();
      n.src.connect(n.hp); n.hp.connect(n.an); n.hp.connect(n.gate);
      n.gate.connect(P.M.recMix); n.gate.connect(n.dest);
      n.open = false; n.hold = 0;
      n.iv = setInterval(function () {      /* gentle gate: −20 dB floor, 6 ms attack, 250 ms hold, 150 ms release */
        n.an.getFloatTimeDomainData(n.buf); var q = 0; for (var i = 0; i < n.buf.length; i++) q += n.buf[i] * n.buf[i]; q = Math.sqrt(q / n.buf.length);
        var now = performance.now(); if (q > 0.01) n.hold = now + 250;
        var o = now < n.hold; if (o !== n.open) { n.open = o; n.gate.gain.setTargetAtTime(o ? 1 : 0.1, x.currentTime, o ? 0.006 : 0.15); }
      }, 20);
      if (window.PFREC && window.PFMP3) {
        var vr = window.PFMP3.make(n.dest.stream, x), vid = window.PFREC.begin("mp3", "audio/mpeg", x.sampleRate, "Voice only (Freestyle)");
        vr.ondataavailable = function (e) { if (e.data && e.data.size) window.PFREC.chunk(vid, e.data); };
        vr.onstop = function () { window.PFREC.end(vid, (performance.now() - n.t0) / 1000, null).then(function (m) { if (m) P.toast("Saved MP3 · Freestyle voice-only track"); }); };
        n.t0 = performance.now(); n.vr = vr; vr.start(2000);
      }
    }).catch(function (e) { if (S === s) P.toast("Mic blocked (" + (e && e.name || "error") + ") — allow the mic in Chrome and try again"); });
  }
  function fsMicStop(s) {
    var n = s.mic; s.mic = null; if (!n) return;
    clearInterval(n.iv);
    try { if (n.vr && n.vr.state === "recording") n.vr.stop(); } catch (e) { /* ignore */ }
    n.st.getTracks().forEach(function (t) { t.stop(); });
    setTimeout(function () { ["src", "hp", "an", "gate"].forEach(function (k) { try { n[k].disconnect(); } catch (e) { /* ignore */ } }); }, 400);
    /* Android: after the mic is released bounce the output so playback reopens as normal media at full quality */
    var c = P.ctx; setTimeout(function () { if (!c || c.state !== "running" || S) return; c.suspend().then(function () { return new Promise(function (r) { setTimeout(r, 120); }); }).then(function () { return c.resume(); }).catch(function () { try { c.resume(); } catch (e) { /* ignore */ } }); }, 600);
  }
  function stop() {
    if (!S) return;
    var s = S, C = window.PFMIC && window.PFMIC.info().C;
    clearInterval(s.timer);
    P.toast("Saving MP3…");
    s.mr.onstop = function () {
      setTimeout(function () {
        finalize(s.sid, { dur: (Date.now() - s.t0) / 1000, bpm: s.bpm }).then(function (t) { load(); if (t) { if (/mpeg/.test(t.mime)) window.PFMP3.autoSave(t.blob, window.PFMP3.name("freestyle", t.created)); P.toast("Saved MP3 · " + t.name); } });
      }, 300);
    };
    try { s.mr.stop(); } catch (e) { /* ignore */ }
    fsMicStop(s);
    if (P.M && P.M.music) { var mg = P.M.music.gain; mg.cancelScheduledValues(P.ctx.currentTime); mg.setValueAtTime(1, P.ctx.currentTime); }   /* v20261022w: music back to full */

    if (s.startedAD && window.PFAUTODJ && window.PFAUTODJ.A.on) window.PFAUTODJ.stop("Freestyle session ended");
    S = null;
    $("fs-hud").hidden = true; $("fs-go").classList.remove("on"); $("fs-go").textContent = "🎤 LIVE FREESTYLE";
  }
  document.addEventListener("visibilitychange", function () { if (S && document.hidden && S.mr.state === "recording") try { S.mr.requestData(); } catch (e) { /* ignore */ } });
  window.addEventListener("pagehide", function () { if (S && S.mr.state === "recording") try { S.mr.requestData(); } catch (e) { /* ignore */ } });
  function hud() {
    var d = cur(), el = (Date.now() - S.t0) / 1000;
    $("fs-time").textContent = "REC " + P.fmtTime(el);
    if (d && d.bpm) {
      var bpm = P.effBpm(d), bl = 60 / d.bpm, p = P.pos(d) - (d.grid || 0), beat = Math.max(0, Math.floor(p / bl));
      S.bpm = Math.round(bpm);
      $("fs-bpm").textContent = Math.round(bpm) + " BPM";
      $("fs-bar").textContent = "BAR " + (Math.floor(beat / 4) + 1) + " · " + (beat % 4 + 1);
      $("fs-beatname").textContent = d.name || "";
    } else { $("fs-bpm").textContent = "— BPM"; $("fs-bar").textContent = d ? "BAR —" : "Loading beat…"; $("fs-beatname").textContent = d ? d.name : ""; }
  }
  function nextBeat() {
    var AD = window.PFAUTODJ, d = cur(); if (!AD || !d) return;
    var idle = P.other(d);
    if (!(idle.buf && AD.A.prepped === idle.buf)) { P.toast("Next beat is still loading — one sec"); return; }
    var mp = AD.mixPoint(d); if (P.pos(d) < mp.start) P.seek(d, mp.start);
    P.toast("Rolling into the next beat…");
  }
  function runBack() { var d = cur(); if (!d) return; P.seek(d, d.grid || 0); P.toast("RUN IT BACK! 🔁"); }
  function pullUp() { var d = cur(); if (d) P.rewind(d); }
  function horn() {
    var c = P.ensureCtx(); if (!c) return; var t = c.currentTime, g = c.createGain(), f = c.createBiquadFilter();
    f.type = "lowpass"; f.frequency.value = 2600; g.connect(P.M.bus); f.connect(g);
    g.gain.setValueAtTime(0, t);
    [0, 0.28, 0.56].forEach(function (o, k) { var L = k === 2 ? 0.9 : 0.22; g.gain.setValueAtTime(0, t + o); g.gain.linearRampToValueAtTime(0.32, t + o + 0.02); g.gain.setValueAtTime(0.32, t + o + L); g.gain.linearRampToValueAtTime(0, t + o + L + 0.05); });
    [466, 470, 233].forEach(function (fr) { var o = c.createOscillator(); o.type = "sawtooth"; o.frequency.value = fr; o.connect(f); o.start(t); o.stop(t + 1.6); });
  }

  /* ---------- My Freestyles ---------- */
  function urlOf(t) { return urls[t.id] || (urls[t.id] = URL.createObjectURL(t.blob)); }
  function fname(t) { return t.name.replace(/[^\w\- ]+/g, "").replace(/\s+/g, "_") + "." + ext(t.mime); }
  function share(t) {
    var f = new File([t.blob], fname(t), { type: t.blob.type });
    if (navigator.canShare && navigator.canShare({ files: [f] })) { navigator.share({ files: [f], title: t.name }).catch(function () { /* cancelled */ }); return; }
    var a = document.createElement("a"); a.href = urlOf(t); a.download = fname(t); document.body.appendChild(a); a.click(); a.remove();
  }
  function toDeck(t, d) { P.loadInto(d, { name: t.name, sub: "My Freestyles", key: "fs:" + t.id, get: function () { return t.blob.arrayBuffer(); } }); }
  function put(t) { return tx(["takes"], "readwrite", function (x) { x.objectStore("takes").put(t); }); }
  function render() {
    var box = $("fs-list"); if (!box) return;
    box.innerHTML = LIST.length ? "" : '<p class="empty">No freestyles yet — tap LIVE FREESTYLE and go. Every session saves here by itself.</p>';
    LIST.forEach(function (t) {
      var r = document.createElement("div"); r.className = "fs-row";
      r.innerHTML = '<div class="fs-main"><strong></strong><span class="mono"></span></div><audio controls preload="none"></audio>' +
        '<div class="fs-acts"><button type="button" class="btn">✎ Rename</button><button type="button" class="btn">⇩ Save / share</button><button type="button" class="btn">→ A</button><button type="button" class="btn">→ B</button><a class="btn" href="../lyrics-lab/?freestyle=">✍ Lyrics Lab</a><button type="button" class="btn danger">🗑</button></div>';
      r.querySelector("strong").textContent = t.name;
      r.querySelector(".mono").textContent = P.fmtTime(t.dur || 0) + " · " + P.fmtSize(t.blob.size) + (t.bpm ? " · " + t.bpm + " BPM" : "");
      r.querySelector("audio").src = urlOf(t);
      var b = r.querySelectorAll(".fs-acts > *");
      b[0].onclick = function () { var n = prompt("Name this freestyle", t.name); if (n && n.trim()) { t.name = n.trim().slice(0, 80); put(t).then(render); } };
      b[1].onclick = function () { share(t); };
      b[2].onclick = function () { toDeck(t, P.DECKS[0]); };
      b[3].onclick = function () { toDeck(t, P.DECKS[1]); };
      b[4].href = "../lyrics-lab/?freestyle=" + encodeURIComponent(t.id);
      b[5].onclick = function () { if (!confirm("Delete “" + t.name + "”? This can't be undone.")) return; tx(["takes"], "readwrite", function (x) { x.objectStore("takes").delete(t.id); }).then(load); };
      box.appendChild(r);
    });
  }
  function build() {
    var s = document.createElement("section"); s.className = "freestyle"; s.id = "freestyle"; s.setAttribute("aria-label", "Live Freestyle");
    s.innerHTML = '<div class="fs-head"><h2>Live Freestyle</h2><span class="muted">DJ + rapper: one tap rolls beats non-stop, mic live, show recording. Saved on this Tab only.</span></div>' +
      '<button type="button" id="fs-go" class="fs-go">🎤 LIVE FREESTYLE</button>' +
      '<div id="fs-hud" class="fs-hud" hidden><div class="fs-big"><span id="fs-bpm">— BPM</span><span id="fs-bar">BAR —</span><span id="fs-time" class="fs-rec">REC 0:00</span></div><div class="fs-beat mono" id="fs-beatname"></div>' +
      '<div class="fs-drops"><button type="button" class="btn" id="fs-next">⏭ NEXT BEAT</button><button type="button" class="btn" id="fs-pull">⏪ PULL UP</button><button type="button" class="btn" id="fs-horn">📯 AIR HORN</button><button type="button" class="btn" id="fs-back">🔁 RUN IT BACK</button><button type="button" class="btn danger" id="fs-stop">■ STOP SESSION</button></div></div>' +
      '<h3>My Freestyles</h3><div id="fs-list" class="fs-list"></div>';
    var after = $("mic") ? $("mic").closest(".pads-mic") || $("mic") : null;
    if (after && after.parentNode) after.parentNode.insertBefore(s, after); else document.querySelector("main, body").appendChild(s);
    $("fs-go").onclick = function () { if (S) stop(); else start(); };
    $("fs-stop").onclick = stop; $("fs-next").onclick = nextBeat; $("fs-pull").onclick = pullUp; $("fs-horn").onclick = horn; $("fs-back").onclick = runBack;
  }
  build();
  recover().then(load).catch(function () { render(); });
  window.PFFREESTYLE = { put: put, del: function (t) { return tx(["takes"], "readwrite", function (x) { x.objectStore("takes").delete(t.id); }).then(load); }, start: start, stop: stop, list: function () { return LIST; }, get on() { return !!S; }, horn: horn, nextBeat: nextBeat };
})();
