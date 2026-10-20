(function(){
  "use strict";
  var DATA = window.AFTERGLOW_NEW || {items: []};
  var all = DATA.items.slice();
  // "recent" = the New & Recent shelf; the action shelves only show in the Action view (or in search results).
  var items = all.filter(function(x){ return !x.shelf || x.shelf === "recent"; });
  // Front door order: modern first, classics last.
  var SHELVES = [
    {key: "recent", host: "shelves", title: "New &amp; Recent", sub: "Films from 2019 to 2026: open movies, official free releases and NASA documentaries."},
    {key: "action-2026", host: "shelves", title: "2026 Action", sub: "Recent action (2025–2026) posted free in full by the studio or the filmmakers themselves."},
    {key: "action-80s", host: "shelves", title: "80s Action", sub: "1980s classics the licensed distributor (Shout! Studios) posts free in full on its own channel."},
    {key: "vault", host: "shelves-late", title: "Vintage Vault", sub: "Older films from the Internet Archive, marked public domain by the uploader and played in the Archive's own player."}
  ];
  function shelfOf(x){ return x.shelf || "recent"; }

  // ---------- rotation + DVR (all on this device; programming, not copy protection) ----------
  var ROT = null;                 // now-showing.json, or null = no schedule (everything on air)
  var ROTATING = {"recent": 1, "action-2026": 1, "action-80s": 1};
  var WINDOW_MS = 48 * 3600 * 1000, DAY = 86400000;
  var DVR_KEY = "ag.dvr.v1";
  function dvr(){ try { var d = JSON.parse(localStorage.getItem(DVR_KEY)); if (d && d.watch && d.rec) return d; } catch(e){} return {watch: {}, rec: []}; }
  function saveDvr(d){ try { localStorage.setItem(DVR_KEY, JSON.stringify(d)); } catch(e){} }
  function ymd(t){ var d = new Date(t); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
  function dayStart(s){ var p = s.split("-"); return new Date(+p[0], p[1] - 1, +p[2]).getTime(); }
  function rotates(it){ return !!ROT && (ROTATING[shelfOf(it)] || it.rotation === true); }
  function rotKey(it){ return it.local ? "local:" + it.id : it.id; }
  function slot(it){
    // current window {from, until} or null; next window for off-air titles
    var today = ymd(Date.now()), cur = null, next = null;
    ROT.windows.forEach(function(w){
      if (w.id !== rotKey(it)) return;
      if (w.from <= today && today <= w.until) cur = w;
      else if (w.from > today && (!next || w.from < next.from)) next = w;
    });
    return {cur: cur, next: next};
  }
  // status: always | on | off | expired ; with ends (ms) and badge text
  function status(it){
    if (!rotates(it)) return {s: "always"};
    var sl = slot(it);
    if (!sl.cur) return {s: "off", next: sl.next};
    var leaves = dayStart(sl.cur.until) + DAY, now = Date.now();
    var daysLeft = Math.ceil((leaves - now) / DAY);
    var w = dvr().watch[rotKey(it)], ends = leaves, started = false;
    if (w && w.from === sl.cur.from) {
      started = true;
      ends = Math.min(leaves, w.first + WINDOW_MS);
      if (now >= ends) return {s: "expired", next: sl.next, cur: sl.cur};
    }
    var badge = null;
    if (daysLeft <= 1) badge = "Last chance";
    else if (daysLeft <= 3) badge = "Leaving in " + daysLeft + " days";
    else if (now - dayStart(sl.cur.from) < 7 * DAY) badge = "New this week";
    return {s: "on", cur: sl.cur, leaves: leaves, ends: ends, started: started, daysLeft: daysLeft, badge: badge, next: sl.next};
  }
  function left(ms){ var h = Math.floor(ms / 3600000), m = Math.floor(ms % 3600000 / 60000); return h >= 24 ? Math.floor(h / 24) + "d " + (h % 24) + "h" : h + "h " + m + "m"; }
  function niceDate(s){ return new Date(dayStart(s)).toLocaleDateString(undefined, {weekday: "short", month: "short", day: "numeric"}); }
  function playable(it){ var s = status(it).s; return s === "always" || s === "on"; }
  var THIS_YEAR = 2026;
  var state = {q: "", genre: "all", rights: "all"};
  var $ = function(id){ return document.getElementById(id); };
  window.__agPlayer = {id: null, state: "idle", error: null};

  function esc(s){ return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
  function rightsOf(it){ return it.kind === "open-movie" ? "cc" : (it.kind === "public-domain-gov" || it.kind === "public-domain") ? "pd" : "official"; }
  function rightsBadge(it){ var r = rightsOf(it); return r === "cc" ? it.license : r === "pd" ? "Public domain" : "Official free"; }
  function studioShort(it){
    if (it.badge) return it.badge;
    var s = it.studio || "";
    var map = [["Blender","Blender"],["NASA","NASA"],["DW ","DW"],["Al Jazeera","Al Jazeera"],["Pixar","Pixar"],["Sony","Sony"],["Walt Disney","Disney"],["National Film Board","NFB"]];
    for (var i = 0; i < map.length; i++) if (s.indexOf(map[i][0]) === 0) return map[i][1];
    return s.split(" ")[0];
  }
  function licenseLine(it){
    var r = rightsOf(it);
    if (r === "cc") return it.license + " · open movie";
    if (r === "pd") return it.kind === "public-domain" ? "Public domain · Internet Archive" : "Public domain · U.S. Government work";
    if (it.badge === "Filmmaker") return "Free, posted by the filmmaker";
    return "Free, official upload · " + studioShort(it);
  }

  var GENRES = [["all","all"],["action","action"],["animation","animation"],["documentary","documentary"],["space","space"],["caribbean","Caribbean"],["nature","nature & climate"],["comedy","comedy"],["short","shorts"],["horror","horror"]];
  var RIGHTS = [["all","all"],["cc","Creative Commons"],["official","official free"],["pd","public domain"]];

  function chips(el, list, key){
    el.innerHTML = list.map(function(g){ return '<button class="chip" type="button" data-v="' + g[0] + '" aria-pressed="' + (state[key] === g[0]) + '">' + esc(g[1]) + '</button>'; }).join("");
    el.addEventListener("click", function(e){
      var b = e.target.closest(".chip"); if (!b) return;
      state[key] = b.getAttribute("data-v");
      Array.prototype.forEach.call(el.children, function(c){ c.setAttribute("aria-pressed", String(c === b)); });
      render();
    });
  }

  function match(it){
    if (state.genre !== "all" && it.genres.indexOf(state.genre) < 0) return false;
    if (state.rights !== "all" && rightsOf(it) !== state.rights) return false;
    var q = state.q.trim().toLowerCase();
    if (!q) return true;
    return [it.title, it.studio, it.license, it.source, String(it.year), it.genres.join(" "), it.synopsis, it.shelf === "action-80s" ? "80s eighties classic" : it.shelf === "vault" ? "vintage vault classic archive" : ""].join(" ").toLowerCase().indexOf(q) >= 0;
  }

  function card(it){
    var st = status(it), cls = st.s === "expired" ? " is-expired" : "", ribbon = "";
    if (st.s === "expired") ribbon = '<span class="badge new rot gone">Expired</span>';
    else if (st.s === "on" && st.started) ribbon = '<span class="badge new rot timer" data-ends="' + st.ends + '">⏱ ' + left(st.ends - Date.now()) + ' left</span>';
    else if (st.s === "on" && st.badge) ribbon = '<span class="badge new rot' + (st.daysLeft <= 3 ? " soon" : "") + '">' + st.badge + '</span>';
    else if (it.year >= THIS_YEAR) ribbon = '<span class="badge new">New</span>';
    return '<button class="card' + cls + '" type="button" data-id="' + esc(it.id) + '" aria-label="Play ' + esc(it.title) + ', ' + it.year + ', ' + esc(it.runtime) + '">' +
      '<div class="thumb"><img loading="lazy" src="' + esc(it.poster) + '" alt="" onerror="this.onerror=null;this.src=this.src.replace(\'maxresdefault\',\'hqdefault\')">' +
      '<span class="badge l">' + esc(rightsBadge(it)) + '</span><span class="badge r">' + esc(studioShort(it)) + '</span>' +
      ribbon + '</div>' +
      '<h3>' + esc(it.title) + '</h3><p class="sub">' + it.year + ' · ' + esc(it.runtime) + '</p><p class="lic">' + esc(licenseLine(it)) + '</p></button>';
  }

  function buildShelves(){
    SHELVES.forEach(function(sh){
      var sec = document.createElement("section");
      sec.className = "wrap shelf"; sec.id = "shelf-" + sh.key;
      sec.innerHTML = '<div class="shelf-head"><h2>' + sh.title + ' <span class="soft">(free &amp; legal)</span></h2><p class="muted x-count"></p></div>' +
        '<p class="muted small shelf-sub">' + sh.sub + '</p><div class="grid"></div>';
      $(sh.host).appendChild(sec);
    });
  }
  function render(){
    var filtered = state.q.trim() !== "" || state.genre !== "all" || state.rights !== "all", total = 0;
    SHELVES.forEach(function(sh){
      var pool = all.filter(function(x){ return shelfOf(x) === sh.key; });
      var hidden = pool.filter(function(x){ return status(x).s === "off"; }).length;
      pool = pool.filter(function(x){ return status(x).s !== "off"; });
      var hits = pool.filter(match); total += hits.length;
      var sec = $("shelf-" + sh.key);
      sec.hidden = hits.length === 0;
      sec.querySelector(".grid").innerHTML = hits.map(card).join("");
      sec.querySelector(".x-count").textContent = (filtered ? hits.length + " of " : "") + pool.length + (ROT && ROTATING[sh.key] ? " on air" : (pool.length === 1 ? " film" : " films")) + (hidden ? " · " + hidden + " more rotating back in" : "");
    });
    renderSpecial(filtered);
    $("empty").hidden = total > 0;
  }

  function renderSpecial(filtered){
    // Now Showing: what's new this week and what's leaving, soonest first
    var ns = all.filter(function(x){ var s = status(x); return s.s === "on" && s.badge; })
      .sort(function(a, b){ return status(a).leaves - status(b).leaves; });
    var sec = $("shelf-now");
    sec.hidden = filtered || !ns.length;
    sec.querySelector(".grid").innerHTML = ns.map(card).join("");
    sec.querySelector(".x-count").textContent = ns.length + " titles";
    // My DVR
    var d = dvr(), keep = [], gone = 0;
    d.rec.forEach(function(id){ var it = byId(id); if (!it) return; var s = status(it).s; if (s === "on" || s === "always") keep.push(id); else gone++; });
    if (gone) { d.rec = keep; saveDvr(d); }
    var recs = keep.map(byId);
    var ds = $("shelf-dvr");
    ds.hidden = filtered || (!recs.length && !gone);
    ds.querySelector(".grid").innerHTML = recs.map(card).join("");
    ds.querySelector(".x-count").textContent = recs.length + " saved";
    $("dvr-gone").hidden = !gone;
    $("dvr-gone").textContent = gone + (gone === 1 ? " title" : " titles") + " left your DVR because the watch window or rotation ended.";
  }
  function byId(id){ return all.filter(function(x){ return x.id === id; })[0]; }
  function hero(){
    var pool = items.filter(function(x){ return x.mediaType === "movie" && status(x).s === "on"; });
    var fresh = pool.filter(function(x){ return status(x).badge === "New this week"; });
    var it = fresh[0] || pool[0] || items.filter(function(x){ return status(x).s !== "off"; })[0] || items[0];
    if (!it) return;
    $("hero").innerHTML =
      '<div><p class="eyebrow">' + (status(it).s === "on" ? "Now showing · leaves " + esc(niceDate(status(it).cur.until)) : "New &amp; Recent · Free &amp; legal") + '</p><h1>' + esc(it.title) + '</h1>' +
      '<p class="syn">' + esc(it.synopsis) + '</p>' +
      '<p class="meta">' + it.year + ' · ' + esc(it.runtime) + ' · ' + esc(it.license) + ' · ' + esc(it.studio) + '</p>' +
      '<div class="btns"><button class="btn btn-primary" type="button" data-play="' + esc(it.id) + '">▶ Play now</button>' +
      '<a class="btn btn-ghost" href="' + esc(it.licenseProof[0]) + '" target="_blank" rel="noopener">Source &amp; license</a></div></div>' +
      '<div class="hero-art" data-play="' + esc(it.id) + '" role="button" tabindex="0" aria-label="Play ' + esc(it.title) + '"><img src="' + esc(it.poster) + '" alt=""><span class="playdot">▶ ' + esc(it.runtime) + '</span></div>';
  }

  // ---------- player ----------
  var ytReady = null, ytPlayer = null, lastFocus = null;
  function loadYT(){
    if (ytReady) return ytReady;
    ytReady = new Promise(function(res, rej){
      if (window.YT && window.YT.Player) return res(window.YT);
      var prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = function(){ if (prev) try{prev();}catch(e){} res(window.YT); };
      var s = document.createElement("script"); s.src = "https://www.youtube.com/iframe_api"; s.async = true;
      s.onerror = function(){ ytReady = null; rej(new Error("YouTube player failed to load")); };
      document.head.appendChild(s);
    });
    return ytReady;
  }
  function setState(st, err){ window.__agPlayer.state = st; if (err != null) window.__agPlayer.error = err; }

  function fallbackMsg(it, why){
    $("screen-inner").innerHTML = '<div style="position:absolute;inset:0;display:grid;place-items:center;text-align:center;padding:1.5rem;color:#b9a78a">' +
      '<div><p>' + esc(why) + '</p>' + (it.play.watchUrl ? '<p><a style="color:#7ec8a3" href="' + esc(it.play.watchUrl) + '" target="_blank" rel="noopener">Watch on YouTube →</a></p>' : '') + '</div></div>';
  }

  function playMp4(it, src){
    var v = document.createElement("video");
    v.controls = true; v.autoplay = true; v.playsInline = true; v.preload = "metadata";
    if (it.poster) v.poster = it.poster;
    v.src = src;
    v.addEventListener("playing", function(){ setState("playing"); });
    v.addEventListener("error", function(){ setState("error", "media-error"); if (it.alt && it.alt.type === "youtube") playYT(it, it.alt.id); else fallbackMsg(it, "This print would not load right now."); });
    $("screen-inner").innerHTML = ""; $("screen-inner").appendChild(v);
    var p = v.play(); if (p && p.catch) p.catch(function(){ /* autoplay blocked: user presses play */ setState("ready"); });
  }

  function playArchive(it){
    // The Internet Archive's own embedded player; nothing is copied or re-hosted.
    $("screen-inner").innerHTML = '<iframe src="https://archive.org/embed/' + encodeURIComponent(it.play.id) + '" title="' + esc(it.title) + '" allow="autoplay; fullscreen" allowfullscreen></iframe>';
    setState("ready");
  }
  function playYT(it, vid){
    $("screen-inner").innerHTML = '<div id="yt-slot"></div>';
    loadYT().then(function(YT){
      if (window.__agPlayer.id !== it.id) return;
      ytPlayer = new YT.Player("yt-slot", {
        host: "https://www.youtube-nocookie.com", videoId: vid, width: "100%", height: "100%",
        playerVars: {autoplay: 1, rel: 0, playsinline: 1, modestbranding: 1, origin: location.origin},
        events: {
          onReady: function(e){ setState("ready"); try { e.target.playVideo(); } catch(x){} },
          onStateChange: function(e){ if (e.data === 1) setState("playing"); else if (e.data === 2) setState("paused"); else if (e.data === 0) setState("ended"); },
          onError: function(e){
            setState("error", "yt-" + e.data);
            if (it.alt && it.alt.type === "mp4") playMp4(it, it.alt.src);
            else fallbackMsg(it, "YouTube won't play this one inside Afterglow right now (code " + e.data + ").");
          }
        }
      });
    }).catch(function(){ setState("error", "yt-api"); if (it.alt && it.alt.type === "mp4") playMp4(it, it.alt.src); else fallbackMsg(it, "The YouTube player couldn't load."); });
  }

  function open(id, fromHash){
    var it = all.filter(function(x){ return x.id === id; })[0]; if (!it) return;
    lastFocus = document.activeElement;
    window.__agPlayer = {id: it.id, state: "loading", error: null};
    $("p-eyebrow").textContent = it.shelf === "vault" ? "Vintage Vault · Public domain" : it.shelf === "action-80s" ? "80s Action · Classic, free & legal" : it.shelf === "action-2026" ? "2026 Action · Free & legal" : it.mediaType === "documentary" ? "Documentary · New & Recent" : "Film · New & Recent";
    $("p-title").textContent = it.title;
    $("p-meta").textContent = it.year + " · " + it.runtime + " · " + it.license + " · " + it.studio;
    $("p-syn").textContent = it.synopsis;
    $("p-note").textContent = (it.note ? it.note + " " : "") + "Playing from: " + it.source + ".";
    var links = ['<a href="' + esc(it.licenseUrl) + '" target="_blank" rel="noopener">License: ' + esc(it.license) + '</a>'];
    it.licenseProof.forEach(function(u, i){ if (u !== it.licenseUrl) links.push('<a href="' + esc(u) + '" target="_blank" rel="noopener">Source ' + (i + 1) + '</a>'); });
    if (it.play.watchUrl) links.push('<a href="' + esc(it.play.watchUrl) + '" target="_blank" rel="noopener">Open on ' + (it.play.type === "archive" ? "Internet Archive" : "YouTube") + '</a>');
    $("p-links").innerHTML = links.join("");
    $("player").hidden = false; document.body.style.overflow = "hidden";
    var st = status(it);
    $("p-dvr").innerHTML = "";
    if (st.s === "off" || st.s === "expired") {
      setState("blocked", st.s);
      var back = st.next ? "It's scheduled back on " + niceDate(st.next.from) + "." : "It may come back in a future rotation.";
      $("screen-inner").innerHTML = '<div class="gate"><div><p class="gate-h">' + (st.s === "expired" ? "Your 48-hour window has ended" : "Off air right now") + '</p><p>' +
        (st.s === "expired" ? "You started this one more than 48 hours ago. " : "This title is resting between rotations. ") + esc(back) + '</p>' +
        '<p class="small">Afterglow is a rotation, like a TV channel: titles come and go on a schedule. Timers live only on this device. The film itself stays free on its owner\'s channel.</p></div></div>';
    } else {
      if (st.s === "on" && !st.started) { var d = dvr(); d.watch[rotKey(it)] = {first: Date.now(), from: st.cur.from}; saveDvr(d); st = status(it); }
      if (st.s === "on") $("p-dvr").innerHTML = '<span class="timer" data-ends="' + st.ends + '">⏱ ' + left(st.ends - Date.now()) + ' left</span> to watch, from your first play' + (st.ends === st.leaves ? " (leaves the rotation " + esc(niceDate(st.cur.until)) + ")" : "") + '.';
      var inRec = dvr().rec.indexOf(it.id) >= 0;
      $("p-dvr").innerHTML += ' <button type="button" class="dvr-btn" data-rec="' + esc(it.id) + '" aria-pressed="' + inRec + '">' + (inRec ? "✓ In My DVR" : "＋ Add to My DVR") + '</button>';
      startPlayback(it);
    }
    if (!fromHash) history.replaceState(null, "", "#watch/" + it.id);
    document.querySelector("#player .close").focus();
  }
  function startPlayback(it){
    if (it.play.type === "mp4") playMp4(it, it.play.src);
    else if (it.play.type === "archive") playArchive(it);
    else playYT(it, it.play.id);
  }
  function close(){
    if ($("player").hidden) return;
    try { if (ytPlayer && ytPlayer.destroy) ytPlayer.destroy(); } catch(e){}
    ytPlayer = null; $("screen-inner").innerHTML = "";
    $("player").hidden = true; document.body.style.overflow = "";
    window.__agPlayer = {id: null, state: "idle", error: null};
    render();
    history.replaceState(null, "", location.pathname + location.search);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  document.addEventListener("click", function(e){
    var c = e.target.closest("[data-close]"); if (c) { close(); return; }
    var r = e.target.closest("[data-rec]");
    if (r) { var d = dvr(), id = r.getAttribute("data-rec"), i = d.rec.indexOf(id);
      if (i >= 0) d.rec.splice(i, 1); else d.rec.unshift(id); saveDvr(d);
      r.setAttribute("aria-pressed", String(i < 0)); r.textContent = i < 0 ? "✓ In My DVR" : "＋ Add to My DVR"; return; }
    var p = e.target.closest("[data-play]"); if (p) { open(p.getAttribute("data-play")); return; }
    var k = e.target.closest(".card"); if (k) open(k.getAttribute("data-id"));
  });
  document.addEventListener("keydown", function(e){
    if (e.key === "Escape") close();
    if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches(".hero-art")) { e.preventDefault(); open(e.target.getAttribute("data-play")); }
  });
  function setGenre(g){
    state.genre = g;
    Array.prototype.forEach.call($("genres").children, function(c){ c.setAttribute("aria-pressed", String(c.getAttribute("data-v") === g)); });
    render();
  }
  function fromHash(){
    if (/^#action$/.test(location.hash)) { setGenre("action"); return; }
    if (/^#shelf-/.test(location.hash)) return;
    var m = location.hash.match(/^#watch\/([\w-]+)/); if (m) open(m[1], true);
  }

  $("q").addEventListener("input", function(e){ state.q = e.target.value; render(); });
  chips($("genres"), GENRES, "genre");
  chips($("rights"), RIGHTS, "rights");
  buildShelves();
  setInterval(function(){
    Array.prototype.forEach.call(document.querySelectorAll(".timer[data-ends]"), function(t){
      var ms = +t.getAttribute("data-ends") - Date.now();
      if (ms <= 0) { if ($("player").hidden) render(); return; }
      t.textContent = (t.classList.contains("badge") ? "⏱ " + left(ms) + " left" : "⏱ " + left(ms) + " left");
    });
  }, 30000);
  function boot(){ hero(); render(); fromHash(); }
  fetch("now-showing.json?v=" + ymd(Date.now()), {cache: "no-cache"})
    .then(function(r){ if (!r.ok) throw 0; return r.json(); })
    .then(function(j){ if (j && j.windows) ROT = j; }, function(){ ROT = null; })
    .then(boot);
  window.addEventListener("hashchange", fromHash);
})();
