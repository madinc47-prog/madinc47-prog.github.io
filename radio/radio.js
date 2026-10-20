/* Island Beats Radio (Beta) — no dependencies, no innerHTML. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var ST = window.IBR_STATIONS || [], EQP = window.IBR_EQ || [];
  var BANDS = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
  var LS = { vol: "ibr_volume", eq: "ibr_eq", last: "ibr_last", ident: "ibr_autoident" };
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  // ---- audio: fx element (CORS, through Web Audio EQ) + plain element (no CORS) ----
  var fxA = $("a"), plainA = document.createElement("audio"), voice = $("v");
  fxA.crossOrigin = "anonymous"; plainA.preload = "none"; document.body.appendChild(plainA);
  var ctx = null, eqNodes = [], comp, analyser, master;
  function graph() {
    if (ctx) return ctx;
    var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    ctx = new AC();
    var src = ctx.createMediaElementSource(fxA), prev = src;
    eqNodes = BANDS.map(function (f) { var b = ctx.createBiquadFilter(); b.type = "peaking"; b.frequency.value = f; b.Q.value = 1.41; prev.connect(b); prev = b; return b; });
    master = ctx.createGain(); master.gain.value = 0.85; // headroom for boosts
    comp = ctx.createDynamicsCompressor(); comp.threshold.value = -6; comp.ratio.value = 5; comp.knee.value = 5;
    analyser = ctx.createAnalyser(); analyser.fftSize = 128;
    prev.connect(master); master.connect(comp); comp.connect(analyser); analyser.connect(ctx.destination);
    applyEq(); return ctx;
  }
  function gains(name) { for (var i = 0; i < EQP.length; i++) if (EQP[i][0] === name) return EQP[i][1]; return EQP[0][1]; }
  function applyEq() { var g = gains($("eq").value); eqNodes.forEach(function (n, i) { n.gain.value = g[i]; }); }

  var cur = null, mode = "idle", active = fxA, own = [], ownIdx = -1, ownUrl = null, retry = 0;
  function setVol(v) { fxA.volume = plainA.volume = v; voice.volume = Math.min(1, v + 0.1); }
  function lcd(tag, name, sub) { $("lcd-tag").textContent = tag; $("now-name").textContent = name; $("now-sub").textContent = sub || ""; }
  function playBtn(on) { $("play").textContent = on ? "⏸" : "▶"; $("play").setAttribute("aria-label", on ? "Pause" : "Play"); }
  function stopAll() { [fxA, plainA].forEach(function (a) { a.pause(); a.removeAttribute("src"); a.load(); }); playBtn(false); }

  function playStation(s) {
    stopAll(); mode = "live"; cur = s; ls(LS.last, s.id); markStations();
    var useFx = s.fx !== false; active = useFx ? fxA : plainA;
    if (useFx) { graph(); if (ctx && ctx.state === "suspended") ctx.resume(); }
    $("eqnote").textContent = useFx ? "" : "EQ is off for this station (its stream doesn't allow browser processing) — original sound.";
    lcd("CONNECTING", s.name, s.place + " · " + s.genre);
    active.src = s.stream; var mine = active;
    clearTimeout(window.__ibrT); window.__ibrT = setTimeout(function () { if (cur === s && mine.paused && mode === "live") { mine.pause(); fail(s); } }, 20000);
    active.play().then(function () { lcd("● LIVE", s.name, s.place + " · " + s.genre); playBtn(true); }, function (e) {
      if (e && e.name === "NotAllowedError") { lcd("TAP ▶", s.name, "Tap play to start"); return; }
      fail(s);
    });
  }
  function fail(s) { lcd("OFFLINE", s.name, "Station isn't answering right now" + (s.unverified ? " (unverified stream)" : "") + ". Try another."); playBtn(false); }
  [fxA, plainA].forEach(function (a) { a.addEventListener("error", function () { if (mode === "live" && cur && a === active && a.getAttribute("src")) fail(cur); else if (mode === "own" && a === active) ownNext(); }); a.addEventListener("ended", function () { if (mode === "own") ownNext(true); }); });

  function step(d) {
    if (mode === "own") { ownIdx = (ownIdx + d + own.length) % own.length; ownPlay(); return; }
    var i = cur ? ST.indexOf(cur) : -1; playStation(ST[(i + d + ST.length) % ST.length]);
  }
  $("prev").onclick = function () { step(-1); }; $("next").onclick = function () { step(1); };
  $("play").onclick = function () {
    if (active.getAttribute("src") && !active.paused) { active.pause(); playBtn(false); lcd("PAUSED", $("now-name").textContent, $("now-sub").textContent); return; }
    if (active.getAttribute("src")) { if (ctx) ctx.resume(); active.play().then(function () { playBtn(true); lcd(mode === "own" ? "MY CHANNEL" : "● LIVE", $("now-name").textContent, $("now-sub").textContent); }, function () {}); return; }
    var last = ls(LS.last), s = ST.filter(function (x) { return x.id === last; })[0] || ST[0]; playStation(s);
  };

  // ---- stations list ----
  var group = "Dominica";
  function renderStations() {
    var ul = $("stlist"); ul.replaceChildren();
    ST.filter(function (s) { return s.group === group; }).forEach(function (s) {
      var li = el("li", "st"), b = el("button"); b.dataset.id = s.id;
      b.appendChild(el("b", null, s.name)); b.appendChild(el("small", null, s.place + " · " + s.genre + (s.unverified ? " · may be offline" : "")));
      b.onclick = function () { playStation(s); };
      var a = el("a", null, "↗"); a.href = s.site; a.target = "_blank"; a.rel = "noopener noreferrer"; a.setAttribute("aria-label", s.name + " website");
      li.appendChild(b); li.appendChild(a); ul.appendChild(li);
    }); markStations();
  }
  function markStations() { Array.prototype.forEach.call(document.querySelectorAll(".st button"), function (b) { b.classList.toggle("on", mode === "live" && cur && b.dataset.id === cur.id); }); }
  Array.prototype.forEach.call(document.querySelectorAll(".tab"), function (t) { t.onclick = function () { group = t.dataset.g; document.querySelectorAll(".tab").forEach(function (x) { x.classList.toggle("on", x === t); }); renderStations(); }; });

  // ---- EQ / volume / sleep ----
  EQP.forEach(function (p) { $("eq").appendChild(new Option(p[0], p[0])); });
  $("eq").value = ls(LS.eq) || "Hip-Hop"; $("eq").onchange = function () { ls(LS.eq, this.value); applyEq(); };
  var v0 = parseFloat(ls(LS.vol)); if (!isNaN(v0)) $("vol").value = v0; setVol(+$("vol").value);
  $("vol").oninput = function () { setVol(+this.value); ls(LS.vol, this.value); };
  var sleepT = null, sleepEnd = 0;
  $("sleep").onchange = function () {
    clearTimeout(sleepT); sleepEnd = 0; var m = +this.value; if (!m) return;
    sleepEnd = Date.now() + m * 60000;
    sleepT = setTimeout(function () { var v = +$("vol").value, n = 0; var f = setInterval(function () { n++; setVol(v * (1 - n / 20)); if (n >= 20) { clearInterval(f); stopAll(); setVol(v); lcd("SLEEP", "Goodnight from Dominica 🌙", "Sleep timer stopped the radio"); $("sleep").value = "0"; sleepEnd = 0; } }, 500); }, m * 60000 - 10000 > 0 ? m * 60000 - 10000 : 0);
  };
  setInterval(function () {
    var t = new Date().toLocaleTimeString("en-GB", { timeZone: "America/Dominica", hour: "2-digit", minute: "2-digit" });
    if (sleepEnd) t = "💤" + Math.ceil((sleepEnd - Date.now()) / 60000) + "m · " + t;
    $("lcd-clock").textContent = t + " DA";
  }, 1000);

  // ---- DJ Psycho Fingers idents (pre-rendered clips in ../player/voice) ----
  var VO = "../player/voice/", hype = [], shouts = [];
  fetch(VO + "voice.json").then(function (r) { return r.json(); }).then(function (j) {
    hype = j.hype || []; shouts = (j.shout && j.shout.places) || (Array.isArray(j.shout) ? j.shout : []);
    if (!shouts.length) for (var k in j) if (j[k] && j[k].places && j[k].places[0] && /^shout\//.test(j[k].places[0].file || "")) shouts = j[k].places;
    var sel = $("place"); sel.appendChild(new Option("Random parish/town", ""));
    shouts.forEach(function (s, i) { sel.appendChild(new Option(s.place, i)); });
  }).catch(function () { $("ident").disabled = $("shoutbtn").disabled = true; });
  function playClip(c, then) {
    if (!c) { if (then) then(); return; }
    var duck = active.volume; active.volume = duck * 0.35;
    voice.src = VO + c.file; voice.onended = voice.onerror = function () { active.volume = duck; voice.onended = voice.onerror = null; if (then) then(); };
    voice.play().catch(function () { voice.onended && voice.onended(); });
    $("now-sub").textContent = "🎙 DJ Psycho Fingers: " + c.text;
  }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  $("ident").onclick = function () { playClip(pick(hype)); };
  $("shoutbtn").onclick = function () { var v = $("place").value; playClip(v === "" ? pick(shouts) : shouts[+v]); };
  $("autoident").checked = ls(LS.ident) !== "0"; $("autoident").onchange = function () { ls(LS.ident, this.checked ? "1" : "0"); };

  // ---- own channel: read-only from this device's saved music (same-origin IndexedDB) ----
  function readDb(name, store) {
    return new Promise(function (res) {
      // Never create a DB that doesn't exist yet (that would break the Beat/Player apps' setup).
      if (!indexedDB.databases) return res([]);
      indexedDB.databases().then(function (list) {
        if (!list.some(function (d) { return d.name === name; })) return res([]);
        var r = indexedDB.open(name);
        r.onsuccess = function () { var db = r.result; try { if (!db.objectStoreNames.contains(store)) { db.close(); return res([]); } var q = db.transaction(store, "readonly").objectStore(store).getAll(); q.onsuccess = function () { db.close(); res(q.result || []); }; q.onerror = function () { db.close(); res([]); }; } catch (e) { db.close(); res([]); } };
        r.onerror = function () { res([]); };
      }, function () { res([]); });
    });
  }
  function loadOwn() {
    return Promise.all([readDb("islepin-media", "tracks"), readDb("islandpinbeats", "vault")]).then(function (r) {
      own = [];
      r[0].forEach(function (t) { if (t.blob instanceof Blob) own.push({ title: t.title || "Untitled", by: t.artist || ({ beats: "Beat bounce", player: "Player upload", dj: "DJ", import: "Imported" }[t.source] || ""), blob: t.blob }); });
      r[1].forEach(function (t) { if (t.blob instanceof Blob) own.push({ title: t.name || "Vault bounce", by: "Beat Vault", blob: t.blob }); });
      renderOwn();
    });
  }
  function renderOwn() {
    var ol = $("ownlist"); ol.replaceChildren();
    if (!own.length) { ol.appendChild(el("li", null, "No saved music on this device yet. Bounce a beat in Island Beats Hub or add songs in the DJ Psycho Fingers Beta audio player, then come back.")); $("ownplay").disabled = $("ownshuffle").disabled = true; return; }
    $("ownplay").disabled = $("ownshuffle").disabled = false;
    own.forEach(function (t, i) { var li = el("li", i === ownIdx && mode === "own" ? "on" : ""); li.appendChild(el("span", null, (i + 1) + ". " + t.title)); li.appendChild(el("small", null, t.by)); li.onclick = function () { ownIdx = i; startOwn(); }; ol.appendChild(li); });
  }
  function startOwn() { mode = "own"; markStations(); graph(); if (ctx) ctx.resume(); active = fxA; $("eqnote").textContent = ""; if (ownIdx < 0) ownIdx = 0; playClip($("autoident").checked ? pick(hype) : null, ownPlay); }
  function ownPlay() {
    var t = own[ownIdx]; if (!t) return; stopAll(); mode = "own"; active = fxA;
    if (ownUrl) URL.revokeObjectURL(ownUrl); ownUrl = URL.createObjectURL(t.blob); fxA.src = ownUrl;
    fxA.play().then(function () { playBtn(true); }, function () {});
    lcd("MY CHANNEL", t.title, "Island Beats Radio · " + t.by + " · on this device only"); renderOwn();
  }
  function ownNext(withIdent) { if (!own.length) return; ownIdx = (ownIdx + 1) % own.length; if (withIdent && $("autoident").checked && Math.random() < 0.6) playClip(pick(Math.random() < 0.5 ? hype : shouts), ownPlay); else ownPlay(); }
  $("ownplay").onclick = function () { loadOwn().then(function () { if (own.length) startOwn(); }); };
  $("ownshuffle").onclick = function () { for (var i = own.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), x = own[i]; own[i] = own[j]; own[j] = x; } ownIdx = 0; renderOwn(); };

  // ---- upload gate: real sign-in only (shared Supabase config from ../beats/auth-config.js) ----
  (function () {
    var c = window.IPB_AUTH_CONFIG || {}, b = $("upload");
    b.disabled = true;
    if (!c.supabaseUrl || !c.supabaseAnonKey) { b.textContent = "Sign in to upload — sign-in not set up yet"; return; }
    var s = null; try { s = JSON.parse(localStorage.getItem("ipb_auth_session_v1") || "null"); } catch (e) {}
    if (!s || !s.access_token) { b.textContent = "Sign in to upload"; b.disabled = false; b.onclick = function () { location.href = "../beats/"; }; return; }
    b.textContent = "Upload — coming soon (signed in)";
  })();

  // ---- pinned ads (ads.json, approved by Emmanuel) ----
  fetch("ads.json", { cache: "no-cache" }).then(function (r) { return r.json(); }).catch(function () { return { ads: [] }; }).then(function (j) {
    var ul = $("adlist"); ul.replaceChildren();
    var ads = (j && j.ads || []).filter(function (a) { return a && a.name && /^https:\/\//.test(a.link || ""); });
    if (!ads.length) { var e = el("li", "ad empty"); e.appendChild(el("b", null, "Your business here, pin an ad")); e.appendChild(el("span", null, "Free during beta, pending approval.")); ul.appendChild(e); return; }
    ads.forEach(function (a) {
      var li = el("li", "ad"), link = el("a"); link.href = a.link; link.target = "_blank"; link.rel = "noopener noreferrer";
      if (a.image && /^https:\/\//.test(a.image)) { var im = el("img"); im.src = a.image; im.alt = a.name; im.loading = "lazy"; link.appendChild(im); }
      link.appendChild(el("b", null, String(a.name).slice(0, 60))); li.appendChild(link); li.appendChild(el("span", null, String(a.message || "").slice(0, 120))); ul.appendChild(li);
    });
  });

  // ---- visualiser ----
  var cv = $("viz"), g2 = cv.getContext("2d"), buf = new Uint8Array(64);
  (function draw() {
    requestAnimationFrame(draw);
    var w = cv.width = cv.clientWidth, h = cv.height; g2.clearRect(0, 0, w, h);
    var playing = !active.paused; if (analyser && active === fxA) analyser.getByteFrequencyData(buf);
    var n = 32, bw = w / n;
    for (var i = 0; i < n; i++) { var v = (analyser && active === fxA) ? buf[i] / 255 : (playing ? 0.3 + 0.25 * Math.sin(Date.now() / 200 + i) : 0.05); g2.fillStyle = i % 5 === 0 ? "#ce1126" : i % 3 ? "#ffb627" : "#fcd116"; g2.fillRect(i * bw + 1, h - v * h, bw - 2, v * h); }
  })();

  // ---- share / install / PWA ----
  $("share").onclick = function () {
    var d = { title: "Island Beats Radio BETA", text: "Dominica radio + Island Beats — beta", url: location.origin + location.pathname };
    if (navigator.share) navigator.share(d).catch(function () {}); else if (navigator.clipboard) navigator.clipboard.writeText(d.url).then(function () { $("share").textContent = "Link copied"; });
  };
  var deferred = null; window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); deferred = e; $("install").hidden = false; });
  $("install").onclick = function () { if (deferred) { deferred.prompt(); deferred = null; $("install").hidden = true; } };
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(function () {});
  if ("mediaSession" in navigator) { try { navigator.mediaSession.setActionHandler("nexttrack", function () { step(1); }); navigator.mediaSession.setActionHandler("previoustrack", function () { step(-1); }); } catch (e) {} }

  renderStations(); loadOwn();
  if (/[?&]ch=own/.test(location.search)) lcd("MY CHANNEL", "Island Beats Radio", "Tap ▶ Play my channel");
})();
