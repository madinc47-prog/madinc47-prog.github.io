(function(){
  "use strict";
  var DATA = window.AFTERGLOW_NEW || {items: []};
  var items = DATA.items.slice();
  var THIS_YEAR = 2026;
  var state = {q: "", genre: "all", rights: "all"};
  var $ = function(id){ return document.getElementById(id); };
  window.__agPlayer = {id: null, state: "idle", error: null};

  function esc(s){ return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
  function rightsOf(it){ return it.kind === "open-movie" ? "cc" : it.kind === "public-domain-gov" ? "pd" : "official"; }
  function rightsBadge(it){ var r = rightsOf(it); return r === "cc" ? it.license : r === "pd" ? "Public domain" : "Official free"; }
  function studioShort(it){
    var s = it.studio || "";
    var map = [["Blender","Blender"],["NASA","NASA"],["DW ","DW"],["Al Jazeera","Al Jazeera"],["Pixar","Pixar"],["Sony","Sony"],["Walt Disney","Disney"],["National Film Board","NFB"]];
    for (var i = 0; i < map.length; i++) if (s.indexOf(map[i][0]) === 0) return map[i][1];
    return s.split(" ")[0];
  }
  function licenseLine(it){
    var r = rightsOf(it);
    if (r === "cc") return it.license + " · open movie";
    if (r === "pd") return "Public domain · U.S. Government work";
    return "Free, official upload · " + studioShort(it);
  }

  var GENRES = [["all","all"],["animation","animation"],["documentary","documentary"],["space","space"],["caribbean","Caribbean"],["nature","nature & climate"],["comedy","comedy"],["short","shorts"]];
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
    return [it.title, it.studio, it.license, it.source, String(it.year), it.genres.join(" ")].join(" ").toLowerCase().indexOf(q) >= 0;
  }

  function card(it){
    return '<button class="card" type="button" data-id="' + esc(it.id) + '" aria-label="Play ' + esc(it.title) + ', ' + it.year + ', ' + esc(it.runtime) + '">' +
      '<div class="thumb"><img loading="lazy" src="' + esc(it.poster) + '" alt="" onerror="this.onerror=null;this.src=this.src.replace(\'maxresdefault\',\'hqdefault\')">' +
      '<span class="badge l">' + esc(rightsBadge(it)) + '</span><span class="badge r">' + esc(studioShort(it)) + '</span>' +
      (it.year >= THIS_YEAR ? '<span class="badge new">New</span>' : '') + '</div>' +
      '<h3>' + esc(it.title) + '</h3><p class="sub">' + it.year + ' · ' + esc(it.runtime) + '</p><p class="lic">' + esc(licenseLine(it)) + '</p></button>';
  }

  function render(){
    var list = items.filter(match);
    $("grid").innerHTML = list.map(card).join("");
    $("empty").hidden = list.length > 0;
    $("count").textContent = list.length + " of " + items.length + " films · newest first";
  }

  function hero(){
    var it = items.filter(function(x){ return x.mediaType === "movie"; })[0] || items[0];
    if (!it) return;
    $("hero").innerHTML =
      '<div><p class="eyebrow">New &amp; Recent · Free &amp; legal</p><h1>' + esc(it.title) + '</h1>' +
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
    var it = items.filter(function(x){ return x.id === id; })[0]; if (!it) return;
    lastFocus = document.activeElement;
    window.__agPlayer = {id: it.id, state: "loading", error: null};
    $("p-eyebrow").textContent = it.mediaType === "documentary" ? "Documentary · New & Recent" : "Film · New & Recent";
    $("p-title").textContent = it.title;
    $("p-meta").textContent = it.year + " · " + it.runtime + " · " + it.license + " · " + it.studio;
    $("p-syn").textContent = it.synopsis;
    $("p-note").textContent = (it.note ? it.note + " " : "") + "Playing from: " + it.source + ".";
    var links = ['<a href="' + esc(it.licenseUrl) + '" target="_blank" rel="noopener">License: ' + esc(it.license) + '</a>'];
    it.licenseProof.forEach(function(u, i){ if (u !== it.licenseUrl) links.push('<a href="' + esc(u) + '" target="_blank" rel="noopener">Source ' + (i + 1) + '</a>'); });
    if (it.play.watchUrl) links.push('<a href="' + esc(it.play.watchUrl) + '" target="_blank" rel="noopener">Open on YouTube</a>');
    $("p-links").innerHTML = links.join("");
    $("player").hidden = false; document.body.style.overflow = "hidden";
    if (it.play.type === "mp4") playMp4(it, it.play.src); else playYT(it, it.play.id);
    if (!fromHash) history.replaceState(null, "", "#watch/" + it.id);
    document.querySelector("#player .close").focus();
  }
  function close(){
    if ($("player").hidden) return;
    try { if (ytPlayer && ytPlayer.destroy) ytPlayer.destroy(); } catch(e){}
    ytPlayer = null; $("screen-inner").innerHTML = "";
    $("player").hidden = true; document.body.style.overflow = "";
    window.__agPlayer = {id: null, state: "idle", error: null};
    history.replaceState(null, "", location.pathname + location.search);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  document.addEventListener("click", function(e){
    var c = e.target.closest("[data-close]"); if (c) { close(); return; }
    var p = e.target.closest("[data-play]"); if (p) { open(p.getAttribute("data-play")); return; }
    var k = e.target.closest(".card"); if (k) open(k.getAttribute("data-id"));
  });
  document.addEventListener("keydown", function(e){
    if (e.key === "Escape") close();
    if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches(".hero-art")) { e.preventDefault(); open(e.target.getAttribute("data-play")); }
  });
  function fromHash(){ var m = location.hash.match(/^#watch\/([\w-]+)/); if (m) open(m[1], true); }

  $("q").addEventListener("input", function(e){ state.q = e.target.value; render(); });
  chips($("genres"), GENRES, "genre");
  chips($("rights"), RIGHTS, "rights");
  hero(); render(); fromHash();
  window.addEventListener("hashchange", fromHash);
})();
