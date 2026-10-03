/* DJ Psycho Fingers — YouTube decks (official YouTube IFrame Player API, always visible).
 * - Paste a YouTube link / ID (no key, title via oEmbed) or search with your own free YouTube Data API v3 key
 *   (optional best-effort keyless community search via Piped / Invidious — unofficial, may be down).
 * - Load to Deck A / B: the deck drives the player (play, pause, cue, hot cues, seek, tempo in YouTube's 5% steps,
 *   channel fader × crossfader × master → the player's volume). The audio stays inside YouTube's player, so scratching,
 *   loops, EQ / filter, key shift, PSYCHO EQ, the limiter and REC can't touch it — those controls are greyed out.
 * - Video DJ: each YouTube player sits in its deck slot and moves onto the program screen when its deck owns the
 *   crossfader (a cut — YouTube pictures can't be faded or drawn into the canvas). Fullscreen + a pop-out program page.
 * - Auto DJ: YouTube items queue like any track and mix with a ~12 s volume crossfade. */
(function () {
  "use strict";
  var P = window.PFDJ; if (!P) return;
  var $ = function (id) { return document.getElementById(id); };
  var KEYK = "pfdj_yt_key", LISTK = "pfdj_yt_list_v1", OPTK = "pfdj_yt_opts_v1";
  var apiP = null, PL = {}, EXT = {}, RES = [], resMsg = "", busy = false;
  var OPT = { keyless: false }; try { Object.assign(OPT, JSON.parse(localStorage.getItem(OPTK) || "{}")); } catch (e) {}
  var LIST = []; try { LIST = JSON.parse(localStorage.getItem(LISTK) || "[]") || []; } catch (e) { LIST = []; }
  function saveList() { try { localStorage.setItem(LISTK, JSON.stringify(LIST.slice(0, 100))); } catch (e) {} }
  function saveOpt() { try { localStorage.setItem(OPTK, JSON.stringify(OPT)); } catch (e) {} }
  function apiKey() { try { return localStorage.getItem(KEYK) || ""; } catch (e) { return ""; } }
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };

  /* ---------- ids, metadata ---------- */
  function parseId(s) {
    s = String(s || "").trim();
    if (/^[\w-]{11}$/.test(s)) return s;
    var m = /(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/|music\.youtube\.com\/watch\?(?:.*&)?v=)([\w-]{11})/i.exec(s);
    return m ? m[1] : null;
  }
  function parseStart(s) { var m = /[?&#](?:t|start)=(\d+h)?(\d+m)?(\d+)s?/.exec(String(s || "")); if (!m) return 0; return (parseInt(m[1] || 0) * 3600) + (parseInt(m[2] || 0) * 60) + parseInt(m[3] || 0); }
  function oembed(id) {
    return fetch("https://www.youtube.com/oembed?format=json&url=" + encodeURIComponent("https://www.youtube.com/watch?v=" + id))
      .then(function (r) { if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? "embedding is disabled for this video" : "HTTP " + r.status); return r.json(); })
      .then(function (j) { return { id: id, title: j.title, channel: j.author_name, thumb: "https://i.ytimg.com/vi/" + id + "/mqdefault.jpg" }; });
  }
  function isoDur(s) { var m = /P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(s || ""); return m ? ((+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0)) : 0; }
  function apiSearch(q) {
    var k = apiKey();
    var u = "https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoEmbeddable=true&maxResults=20&safeSearch=none&q=" + encodeURIComponent(q) + "&key=" + encodeURIComponent(k);
    return fetch(u).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error((j.error && j.error.message) || "HTTP " + r.status); return j; }); })
      .then(function (j) {
        var rows = (j.items || []).filter(function (it) { return it.id && it.id.videoId; }).map(function (it) {
          return { id: it.id.videoId, title: decodeEnt(it.snippet.title), channel: decodeEnt(it.snippet.channelTitle), thumb: (it.snippet.thumbnails && (it.snippet.thumbnails.medium || it.snippet.thumbnails.default) || {}).url, live: it.snippet.liveBroadcastContent === "live" };
        });
        if (!rows.length) return rows;
        return fetch("https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=" + rows.map(function (r) { return r.id; }).join(",") + "&key=" + encodeURIComponent(k))
          .then(function (r) { return r.json(); }).then(function (v) { var d = {}; (v.items || []).forEach(function (x) { d[x.id] = isoDur(x.contentDetails && x.contentDetails.duration); }); rows.forEach(function (r) { r.dur = d[r.id] || 0; }); return rows; })
          .catch(function () { return rows; });
      });
  }
  function decodeEnt(s) { var t = document.createElement("textarea"); t.innerHTML = s || ""; return t.value; }
  function keylessSearch(q) { // unofficial community front-ends; metadata only — playback is always the official YouTube player
    var piped = function () { return fetch("https://api.piped.private.coffee/search?filter=videos&q=" + encodeURIComponent(q)).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); }).then(function (j) {
      return (j.items || []).filter(function (it) { return it.type === "stream" && /v=([\w-]{11})/.test(it.url); }).map(function (it) { var id = /v=([\w-]{11})/.exec(it.url)[1]; return { id: id, title: it.title, channel: it.uploaderName, thumb: "https://i.ytimg.com/vi/" + id + "/mqdefault.jpg", dur: it.duration > 0 ? it.duration : 0 }; });
    }); };
    var inv = function () { return fetch("https://invidious.f5.si/api/v1/search?type=video&q=" + encodeURIComponent(q)).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); }).then(function (j) {
      return (j || []).filter(function (it) { return it.type === "video" && it.videoId; }).map(function (it) { return { id: it.videoId, title: it.title, channel: it.author, thumb: "https://i.ytimg.com/vi/" + it.videoId + "/mqdefault.jpg", dur: it.lengthSeconds || 0 }; });
    }); };
    var to = function (p) { return Promise.race([p, new Promise(function (_, rej) { setTimeout(function () { rej(new Error("timeout")); }, 9000); })]); };
    return to(piped()).then(function (r) { if (!r.length) throw new Error("no results"); return r; }).catch(function () { return to(inv()); });
  }

  /* ---------- IFrame API + players ---------- */
  function api() {
    if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
    if (apiP) return apiP;
    apiP = new Promise(function (res, rej) {
      var prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = function () { if (prev) try { prev(); } catch (e) {} res(window.YT); };
      var s = document.createElement("script"); s.src = "https://www.youtube.com/iframe_api"; s.async = true;
      s.onerror = function () { apiP = null; rej(new Error("couldn't load the YouTube player (offline or blocked)")); };
      document.head.appendChild(s);
      setTimeout(function () { if (!(window.YT && window.YT.Player)) { apiP = null; rej(new Error("YouTube player timed out")); } }, 20000);
    });
    return apiP;
  }
  function holder(d) {
    var id = "vdj-yt" + d.id, h = $(id);
    if (!h) {
      var grid = document.querySelector(".vdj-grid"); if (!grid) return null;
      h = document.createElement("div"); h.className = "vdj-yt"; h.id = id; h.dataset.deck = d.id; h.hidden = true;
      h.innerHTML = '<div id="vdj-ytp' + d.id + '"></div><span class="vdj-ytbadge">' + d.id + ' · YouTube</span>';
      grid.appendChild(h);
    }
    return h;
  }
  function getPlayer(d) {
    if (PL[d.id] && PL[d.id].ready) return Promise.resolve(PL[d.id]);
    if (PL[d.id] && PL[d.id].p) return PL[d.id].p;
    var h = holder(d); h.hidden = false; place();
    var rec = PL[d.id] = { ready: false, state: -1, suppress: 0, pendingSeek: null };
    rec.p = api().then(function (YT) {
      return new Promise(function (res) {
        rec.player = new YT.Player("vdj-ytp" + d.id, {
          host: "https://www.youtube-nocookie.com", width: "100%", height: "100%",
          playerVars: { playsinline: 1, rel: 0, controls: 1, fs: 0, iv_load_policy: 3, origin: location.origin, enablejsapi: 1 },
          events: {
            onReady: function () { rec.ready = true; res(rec); },
            onStateChange: function (e) { onState(d, rec, e.data); },
            onError: function (e) { var why = { 2: "invalid video id", 5: "can't play in HTML5", 100: "video not found / private", 101: "the owner doesn't allow embedding", 150: "the owner doesn't allow embedding" }[e.data] || "error " + e.data; P.toast("YouTube deck " + d.id + ": " + why + "."); rec.err = why; }
          }
        });
      });
    });
    return rec.p;
  }
  function onState(d, rec, s) {
    rec.state = s;
    if (P.DECKS.indexOf(d) < 0 || d.ext !== EXT[d.id]) return;
    if (s === 1) { // playing
      if (!d.playing && Date.now() < rec.suppress) { rec.player.pauseVideo(); return; }
      if (rec.pendingSeek != null) { var t = rec.pendingSeek; rec.pendingSeek = null; rec.player.seekTo(t, true); }
      if (!d.playing) { P.extState(d, true); }
      rec.blocked = false;
    } else if (s === 2) { if (d.playing && Date.now() > rec.suppress) P.extState(d, false); }
    else if (s === 0) { P.extEnded(d); }
  }
  function makeExt(d, rec) {
    var vol = -1, rr = 1;
    var ext = {
      kind: "youtube", id: null,
      duration: function () { try { return rec.player.getDuration() || 0; } catch (e) { return 0; } },
      time: function () { try { return rec.player.getCurrentTime() || 0; } catch (e) { return 0; } },
      play: function () {
        try {
          rec.player.playVideo();
          clearTimeout(rec.chk); rec.chk = setTimeout(function () { if (d.playing && d.ext === ext && rec.state !== 1 && rec.state !== 3) { rec.blocked = true; P.toast("Deck " + d.id + ": your browser wants one tap on the YouTube player itself to start sound — tap ▶ inside the video once."); } }, 2500);
        } catch (e) {}
      },
      pause: function () { try { rec.suppress = 0; rec.player.pauseVideo(); } catch (e) {} },
      seek: function (t) {
        try {
          if (!d.playing && (rec.state === 5 || rec.state === -1)) { rec.pendingSeek = t; return; } // seeking a cued video would start it
          if (!d.playing) rec.suppress = Date.now() + 1500;
          rec.player.seekTo(t, true);
        } catch (e) {}
      },
      rate: function (r) { r = quantR(r); if (Math.abs(r - rr) < 1e-3) return; rr = r; try { rec.player.setPlaybackRate(r); } catch (e) {} },
      quant: function (pct) { return Math.round((quantR(1 + pct / 100) - 1) * 1000) / 10; },
      vol: function (v) { var n = Math.round(Math.max(0, Math.min(1, v)) * 100); if (n === vol) return; vol = n; try { rec.player.setVolume(n); if (n > 0 && rec.player.isMuted && rec.player.isMuted()) rec.player.unMute(); } catch (e) {} },
      destroy: function () {
        try { rec.player.stopVideo(); } catch (e) {}
        EXT[d.id] = null; ext.id = null;
        var h = $("vdj-yt" + d.id); if (h) h.hidden = true;
        place(); markDeck(d);
      }
    };
    return ext;
  }
  function quantR(r) { return Math.max(0.25, Math.min(2, Math.round(r * 20) / 20)); } // YouTube plays in 0.05 steps

  /* load a video onto a deck (called through P.loadInto → item.load, so the "deck is playing" confirm still applies) */
  function loadYT(d, v) {
    openVDJ();
    P.ensureCtx();
    d.loading = true; P.ui(d);
    return getPlayer(d).then(function (rec) {
      var ext = EXT[d.id] || (EXT[d.id] = makeExt(d, rec));
      rec.err = null; rec.pendingSeek = null; rec.suppress = 0;
      rec.player.cueVideoById({ videoId: v.id, startSeconds: v.start || 0 });
      ext.id = v.id;
      return new Promise(function (res) {
        var t0 = Date.now();
        (function poll() {
          var dur = ext.duration();
          if (rec.err) { d.loading = false; P.ui(d); res(false); return; }
          if (dur > 0 || Date.now() - t0 > 8000) {
            if (!dur && v.dur) dur = v.dur;
            if (!dur) { d.loading = false; P.ui(d); P.toast("YouTube didn't answer for that video — try again."); res(false); return; }
            $("vdj-yt" + d.id).hidden = false;
            P.setExt(d, ext, { name: v.title || "YouTube video", sub: "YouTube" + (v.channel ? " · " + v.channel : ""), start: v.start || 0, bpm: v.bpm || null, yt: v.id, key: "yt:" + v.id });
            d.buf.duration = dur;
            remember(v); markDeck(d); place();
            res(true);
          } else setTimeout(poll, 150);
        })();
      });
    }).catch(function (e) { d.loading = false; P.ui(d); P.toast("YouTube: " + (e.message || e)); return false; });
  }
  function itemOf(v) {
    return { name: v.title || "YouTube video", sub: "YouTube" + (v.channel ? " · " + v.channel : "") + (v.dur ? " · " + P.fmtTime(v.dur) : ""), key: "yt:" + v.id, ext: true, yt: v.id, bpmHint: P.bpmFromName(v.title),
      load: function (d) { return loadYT(d, v); } };
  }
  function remember(v) { LIST = LIST.filter(function (x) { return x.id !== v.id; }); LIST.unshift({ id: v.id, title: v.title, channel: v.channel, dur: v.dur || 0, thumb: v.thumb }); saveList(); if (P.libTab === "youtube") renderTab(); }
  function toDeck(deck, v) { return P.loadInto(P.BY[deck], itemOf(v)); }
  function toAuto(v, quiet) { if (!window.PFAUTODJ) return; window.PFAUTODJ.add(itemOf(v), quiet); remember(v); }

  /* ---------- greyed-out controls on YouTube decks ---------- */
  var TIPS = {
    ".platter": "Scratching isn't possible on a YouTube deck — the audio stays inside YouTube's player",
    ".d-rw": "No spin-back on YouTube decks — REWIND jumps back to the cue",
    ".d-key": "YouTube always keeps the key when the speed changes",
    ".d-nudge": "Nudge isn't possible — YouTube only plays in 5% speed steps",
    ".d-loop button": "Loops aren't possible on YouTube decks — the player can only jump, not loop seamlessly",
    ".d-vinyl": "Vinyl / CDJ platter modes don't apply to YouTube decks",
    ".d-pitch": "YouTube tempo moves in 5% steps (0.95 / 1.00 / 1.05 …)",
    ".d-sync": "SYNC sets YouTube to its nearest 5% step — sync a file deck to it instead for a tight match"
  };
  var STRIP_TIPS = { ".s-eq": "EQ can't reach YouTube's audio — use the channel fader / crossfader", ".s-filter": "The filter can't reach YouTube's audio", ".kill": "Kills can't reach YouTube's audio" };
  function markDeck(d) {
    var on = !!(d.ext && EXT[d.id] && d.ext === EXT[d.id]);
    var root = $("deck-" + d.id), strip = document.querySelector('.strip[data-deck="' + d.id + '"]');
    var mark = function (scope, map) {
      if (!scope) return;
      Object.keys(map).forEach(function (sel) {
        scope.querySelectorAll(sel).forEach(function (el) {
          if (on) { if (el.dataset.ytTitle == null) el.dataset.ytTitle = el.getAttribute("title") || ""; el.setAttribute("title", map[sel]); el.classList.add("yt-off"); }
          else if (el.dataset.ytTitle != null) { if (el.dataset.ytTitle) el.setAttribute("title", el.dataset.ytTitle); else el.removeAttribute("title"); delete el.dataset.ytTitle; el.classList.remove("yt-off"); }
        });
      });
    };
    mark(root, TIPS); mark(strip, STRIP_TIPS);
    if (root) root.classList.toggle("yt", on);
    var grid = document.querySelector(".vdj-grid"); if (grid) grid.classList.toggle("has-yt", P.DECKS.some(function (x) { return x.ext && EXT[x.id] === x.ext; }));
  }
  // EQ / filter / kill controls on a YouTube strip: explain instead of silently doing nothing
  document.addEventListener("pointerdown", function (e) {
    var t = e.target.closest && e.target.closest(".strip .s-eq, .strip .s-filter, .strip .kill"); if (!t) return;
    var strip = t.closest(".strip"), d = strip && P.BY[strip.dataset.deck]; if (!d || !d.ext) return;
    e.stopPropagation(); e.preventDefault(); P.toast(t.getAttribute("title") || "Not available on a YouTube deck");
  }, true);
  P.on("loaded", function (d) { setTimeout(function () { markDeck(d); place(); }, 0); });

  /* ---------- Video DJ placement: deck slot ⇄ program screen ---------- */
  var progDeck = null, fsOn = false;
  function vdjOpen() { var v = $("vdj"); return v && !v.hidden; }
  function openVDJ() { if (!vdjOpen() && window.PFVDJ) window.PFVDJ.open(true); }
  function mixAmount() { var xg = P.xfGains(), A = P.DECKS[0], B = P.DECKS[1]; var a = xg[0] * Math.pow(A.vol, 0.7) * (A.buf ? 1 : 1e-4), b = xg[1] * Math.pow(B.vol, 0.7) * (B.buf ? 1 : 1e-4); return a + b < 1e-6 ? 0.5 : b / (a + b); }
  function place() {
    var grid = document.querySelector(".vdj-grid"); if (!grid) return;
    var m = mixAmount(), dom = m < 0.5 ? P.DECKS[0] : P.DECKS[1];
    progDeck = dom.ext && EXT[dom.id] === dom.ext ? dom.id : null;
    var g = grid.getBoundingClientRect();
    P.DECKS.forEach(function (d) {
      var h = $("vdj-yt" + d.id); if (!h || h.hidden) return;
      var tgt = progDeck === d.id ? $("vdj-progwrap") : document.querySelector('.vdj-deck[data-deck="' + d.id + '"] video');
      if (!tgt) return;
      var r = tgt.getBoundingClientRect();
      var w = Math.max(200, r.width), hh = Math.max(200, r.height);
      h.style.left = (r.left - g.left + (r.width - w) / 2) + "px"; h.style.top = (r.top - g.top) + "px"; h.style.width = w + "px"; h.style.height = hh + "px";
      h.classList.toggle("prog", progDeck === d.id);
      var slot = document.querySelector('.vdj-deck[data-deck="' + d.id + '"]'); if (slot) { slot.classList.toggle("yt-slot", true); slot.classList.toggle("yt-onprog", progDeck === d.id); }
    });
    P.DECKS.forEach(function (d) { var h = $("vdj-yt" + d.id), slot = document.querySelector('.vdj-deck[data-deck="' + d.id + '"]'); if (slot && (!h || h.hidden)) { slot.classList.remove("yt-slot"); slot.classList.remove("yt-onprog"); } });
    var pw = $("vdj-progwrap"); if (pw) pw.classList.toggle("yt-live", !!progDeck);
    broadcast();
  }
  var lastPlace = 0;
  (function loop() {
    requestAnimationFrame(loop);
    var any = P.DECKS.some(function (d) { return d.ext && EXT[d.id] === d.ext; });
    if (!any) return;
    var now = performance.now(); if (now - lastPlace < 100) return; lastPlace = now;
    if (!vdjOpen()) openVDJ();
    place();
    if (P.recording && !loop.warned) { loop.warned = true; P.toast("Heads-up: YouTube audio isn't in the recording — browsers don't let a page record another site's player. Only file decks, sampler and mic are captured."); }
    if (!P.recording) loop.warned = false;
  })();
  window.addEventListener("resize", function () { setTimeout(place, 50); });
  // keep the Video DJ panel open while a YouTube player is loaded (YouTube players must stay visible)
  document.addEventListener("click", function (e) {
    var t = e.target.closest && e.target.closest("#vdj-toggle"); if (!t) return;
    if (vdjOpen() && P.DECKS.some(function (d) { return d.ext && EXT[d.id] === d.ext; })) { e.stopImmediatePropagation(); e.preventDefault(); P.toast("YouTube players have to stay visible while they're loaded — load a file onto the YouTube deck(s) to close Video DJ."); }
  }, true);
  // fullscreen: with YouTube on a deck, fullscreen the whole Video DJ grid (program big + deck tiles), since the player can't go into the canvas
  document.addEventListener("click", function (e) {
    var t = e.target.closest && e.target.closest("#vdj-fs, #vdj-pop"); if (!t) return;
    if (!P.DECKS.some(function (d) { return d.ext && EXT[d.id] === d.ext; })) return;
    e.stopImmediatePropagation(); e.preventDefault();
    if (t.id === "vdj-fs") { var g = document.querySelector(".vdj-grid"), f = g.requestFullscreen || g.webkitRequestFullscreen; if (f) f.call(g); else P.toast("Fullscreen isn't available here — use Pop-out."); }
    else popOut();
  }, true);
  document.addEventListener("fullscreenchange", function () { fsOn = document.fullscreenElement === document.querySelector(".vdj-grid"); setTimeout(place, 60); });

  /* pop-out program page: canvas stream + its own muted YouTube player kept in step over a BroadcastChannel */
  var bc = null, pop = null;
  try { bc = new BroadcastChannel("pfdj-program"); bc.onmessage = function (e) { if (e.data && e.data.type === "hello") broadcast(true); }; } catch (e) {}
  function broadcast(force) {
    if (!bc || (!force && (!pop || pop.closed))) return;
    var d = progDeck ? P.BY[progDeck] : null;
    bc.postMessage({ type: "state", show: d ? "yt" : "canvas", id: d && d.ext ? d.ext.id : null, t: d ? P.pos(d) : 0, playing: d ? d.playing : false, rate: d ? P.rate(d) : 1, title: d ? d.name : "" });
  }
  function popOut() {
    if (pop && !pop.closed) { pop.focus(); return; }
    pop = window.open("program.html", "pfdj_program", "width=960,height=540");
    if (!pop) { P.toast("Pop-up blocked — allow pop-ups for this site, or use Fullscreen."); return; }
    var tries = 0;
    (function attach() {
      try {
        var v = pop.document && pop.document.getElementById("prog-canvas");
        if (v && !v.srcObject) { v.srcObject = $("vdj-prog").captureStream(30); }
        if (!v && tries++ < 50) return setTimeout(attach, 100);
      } catch (e) {}
      broadcast(true);
    })();
    P.toast("Program output popped out — drag it to the projector / TV and double-click for fullscreen. YouTube shows there as a muted twin player; the sound stays on this page.");
  }

  /* ---------- library tab ---------- */
  function renderTab() {
    var list = $("lib-list"); if (!list || P.libTab !== "youtube") return;
    var k = apiKey();
    list.innerHTML =
      '<div class="yt-box">' +
        '<div class="yt-row"><input type="text" id="yt-url" class="search" placeholder="Paste a YouTube link or video ID (no key needed)" aria-label="YouTube link or ID"><button type="button" class="btn small" id="yt-ua">→ A</button><button type="button" class="btn small" id="yt-ub">→ B</button><button type="button" class="btn small ghost" id="yt-uq">+ Auto DJ</button></div>' +
        '<div class="yt-row"><input type="search" id="yt-q" class="search" placeholder="' + (k ? "Search YouTube" : OPT.keyless ? "Search (keyless community search — may be down)" : "Search YouTube (needs your free API key — or paste links above)") + '" aria-label="Search YouTube"><button type="button" class="btn small" id="yt-go">Search</button>' +
          '<button type="button" class="btn small ghost" id="yt-key">' + (k ? "API key ✓" : "Set API key") + '</button></div>' +
        '<label class="yt-opt"><input type="checkbox" id="yt-kl"' + (OPT.keyless ? " checked" : "") + '> Without a key, try keyless community search (Piped / Invidious — unofficial, may be slow or down; playback is still the official YouTube player)</label>' +
        (k ? "" : '<details class="yt-help"' + (OPT.keyless ? "" : " open") + '><summary>How to get a free YouTube API key (5 minutes, no card)</summary><ol>' +
          '<li>Open <a href="https://console.cloud.google.com/apis/library/youtube.googleapis.com" target="_blank" rel="noopener">Google Cloud Console → YouTube Data API v3</a> and sign in with any Google account.</li>' +
          '<li>Create a project (any name), then press <b>Enable</b>.</li>' +
          '<li>Go to <b>APIs &amp; Services → Credentials → Create credentials → API key</b>.</li>' +
          '<li>Recommended: <b>Edit API key → Website restrictions</b> → add <code>' + esc(location.origin) + '/*</code>, and restrict it to YouTube Data API v3.</li>' +
          '<li>Press <b>Set API key</b> here and paste it. It stays only in this browser. Free quota ≈ 100 searches a day.</li></ol></details>') +
        '<p class="yt-note muted">The deck controls the YouTube player (play / pause / cue / hot cues / seek, tempo in 5% steps, fader + crossfader volume). The sound stays inside YouTube\'s player, so scratch, loops, EQ, filter, key shift, PSYCHO EQ and REC can\'t reach it. Only play what you have the right to play in public.</p>' +
      '</div>' +
      '<div id="yt-res"></div>' +
      '<div class="yt-sub"><span class="label">MY YOUTUBE LIST</span><span class="muted">' + LIST.length + ' video' + (LIST.length === 1 ? "" : "s") + ' · saved in this browser</span>' + (LIST.length ? '<button type="button" class="btn small" id="yt-all">+ Add all to Auto DJ</button><button type="button" class="btn small ghost" id="yt-clr">Clear</button>' : "") + '</div><div id="yt-list"></div>';
    var url = function () { var s = $("yt-url").value, id = parseId(s); if (!id) { P.toast("That doesn't look like a YouTube link or 11-character video ID."); return null; } return { id: id, start: parseStart(s) }; };
    var resolve = function (u) { return oembed(u.id).then(function (m) { m.start = u.start; return m; }).catch(function (e) { if (/embedding/.test(e.message)) throw e; return { id: u.id, title: "YouTube " + u.id, channel: "", start: u.start }; }); };
    $("yt-ua").onclick = function () { var u = url(); if (u) resolve(u).then(function (m) { toDeck("A", m); }).catch(function (e) { P.toast("YouTube: " + e.message); }); };
    $("yt-ub").onclick = function () { var u = url(); if (u) resolve(u).then(function (m) { toDeck("B", m); }).catch(function (e) { P.toast("YouTube: " + e.message); }); };
    $("yt-uq").onclick = function () { var u = url(); if (u) resolve(u).then(function (m) { toAuto(m); }).catch(function (e) { P.toast("YouTube: " + e.message); }); };
    $("yt-url").addEventListener("keydown", function (e) { if (e.key === "Enter") $("yt-ua").click(); });
    $("yt-go").onclick = function () { doSearch($("yt-q").value); };
    $("yt-q").addEventListener("keydown", function (e) { if (e.key === "Enter") doSearch($("yt-q").value); });
    $("yt-key").onclick = function () {
      var v = prompt("Paste your YouTube Data API v3 key (stays in this browser only). Leave empty to remove it:", apiKey());
      if (v == null) return; v = v.trim(); try { if (v) localStorage.setItem(KEYK, v); else localStorage.removeItem(KEYK); } catch (e) {}
      renderTab(); P.toast(v ? "API key saved — search away" : "API key removed");
    };
    $("yt-kl").onchange = function () { OPT.keyless = this.checked; saveOpt(); renderTab(); };
    if ($("yt-all")) $("yt-all").onclick = function () { LIST.forEach(function (v) { toAuto(v, true); }); P.toast("Auto DJ queue: + " + LIST.length + " YouTube video(s)"); };
    if ($("yt-clr")) $("yt-clr").onclick = function () { if (confirm("Clear your YouTube list?")) { LIST = []; saveList(); renderTab(); } };
    renderRows($("yt-res"), RES, resMsg);
    renderRows($("yt-list"), LIST, LIST.length ? "" : "Videos you load or queue land here.");
  }
  function renderRows(box, rows, msg) {
    box.innerHTML = msg ? '<p class="empty">' + esc(msg) + "</p>" : "";
    rows.forEach(function (v) {
      var r = document.createElement("div"); r.className = "lib-row yt-rowi";
      r.innerHTML = '<img class="yt-th" alt="" loading="lazy"><div class="lib-main"><strong></strong><span class="mono"></span></div><div class="lib-acts"><button type="button" class="btn small">→ A</button><button type="button" class="btn small">→ B</button><button type="button" class="btn small ghost">+ Auto DJ</button></div>';
      r.querySelector("img").src = v.thumb || ("https://i.ytimg.com/vi/" + v.id + "/mqdefault.jpg");
      r.querySelector("strong").textContent = v.title || v.id;
      r.querySelector(".mono").textContent = (v.channel || "YouTube") + (v.dur ? " · " + P.fmtTime(v.dur) : "") + (v.live ? " · LIVE" : "");
      var b = r.querySelectorAll("button");
      b[0].onclick = function () { toDeck("A", v); }; b[1].onclick = function () { toDeck("B", v); }; b[2].onclick = function () { toAuto(v); };
      box.appendChild(r);
    });
  }
  function doSearch(q) {
    q = String(q || "").trim(); if (!q || busy) return;
    var id = parseId(q); if (id) { $("yt-url").value = q; return $("yt-ua").focus(); }
    var k = apiKey();
    if (!k && !OPT.keyless) { resMsg = "Search needs your free YouTube API key (steps above) — or tick keyless community search, or paste a link."; RES = []; renderTab(); return; }
    busy = true; resMsg = "Searching…"; RES = []; renderTab();
    (k ? apiSearch(q) : keylessSearch(q)).then(function (rows) { RES = rows; resMsg = rows.length ? "" : "No embeddable results."; })
      .catch(function (e) { RES = []; resMsg = (k ? "YouTube search failed: " : "Keyless search is down right now: ") + (e.message || e) + (k ? "" : " — paste a link instead, or add an API key."); })
      .then(function () { busy = false; renderTab(); });
  }
  P.LIBTABS.youtube = function () { renderTab(); };

  window.PFYT = { parseId: parseId, oembed: oembed, load: function (deck, v) { return toDeck(deck, typeof v === "string" ? { id: parseId(v) || v, title: "YouTube " + v } : v); }, loadYT: loadYT, item: itemOf, queue: toAuto,
    search: function (q) { return apiKey() ? apiSearch(q) : keylessSearch(q); }, keylessSearch: keylessSearch, place: place, popOut: popOut, list: function () { return LIST; },
    info: function () { return { prog: progDeck, fs: fsOn, decks: P.DECKS.map(function (d) { var r = PL[d.id], e = EXT[d.id]; return { id: d.id, ext: !!(d.ext && d.ext === e), vid: e && e.id, state: r ? r.state : null, ready: !!(r && r.ready), time: e && r && r.ready ? e.time() : null, vol: r && r.ready ? r.player.getVolume() : null, rate: r && r.ready ? r.player.getPlaybackRate() : null, holder: (function () { var h = $("vdj-yt" + d.id); if (!h || h.hidden) return null; var b = h.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height), prog: h.classList.contains("prog") }; })() }; }) }; } };
})();
