(function () {
  "use strict";
  var CATS = { music: "Music", live: "Live", behind: "Behind the beat", tutorials: "Tutorials", culture: "Comedy / Culture" };
  var HOST = "madinc47-prog.github.io";
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function store(k, d) { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  var q = new URLSearchParams(location.search);

  // Turn an approved link into an https embed URL (YouTube / Vimeo / Internet Archive / Twitch only)
  function embed(url) {
    var u; try { u = new URL(url); } catch (e) { return null; }
    if (u.protocol !== "https:") return null;
    var h = u.hostname.replace(/^www\.|^m\./, ""), m;
    if (h === "youtube.com" || h === "youtu.be") {
      var id = h === "youtu.be" ? u.pathname.slice(1) : (u.searchParams.get("v") || ((m = u.pathname.match(/^\/(?:live|shorts|embed)\/([\w-]{6,})/)) && m[1]));
      return id && /^[\w-]{6,20}$/.test(id) ? "https://www.youtube-nocookie.com/embed/" + id : null;
    }
    if (h === "vimeo.com" && (m = u.pathname.match(/^\/(\d+)/))) return "https://player.vimeo.com/video/" + m[1];
    if (h === "archive.org" && (m = u.pathname.match(/^\/(?:details|embed)\/([\w.-]+)/))) return "https://archive.org/embed/" + m[1];
    if (h === "twitch.tv" && (m = u.pathname.match(/^\/(\w{3,25})\/?$/))) return "https://player.twitch.tv/?channel=" + m[1] + "&parent=" + HOST;
    return null;
  }
  function frame(src, title) {
    var w = el("div", "player"), f = document.createElement("iframe");
    f.src = src; f.title = title || "Video player"; f.loading = "lazy";
    f.setAttribute("allow", "encrypted-media; picture-in-picture; fullscreen");
    f.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
    f.setAttribute("sandbox", "allow-scripts allow-same-origin allow-presentation allow-popups");
    w.appendChild(f); return w;
  }
  function card(v) {
    var a = el("a", "card"); a.href = "watch.html?v=" + encodeURIComponent(v.id);
    var th = el("div", "th");
    if (v.thumb && /^https:\/\//.test(v.thumb)) { var i = document.createElement("img"); i.src = v.thumb; i.alt = ""; i.loading = "lazy"; th.appendChild(i); } else th.textContent = "▶";
    a.appendChild(th); a.appendChild(el("b", null, v.title)); a.appendChild(el("small", null, (v.creator || "") + " · " + (CATS[v.category] || "")));
    return a;
  }
  function fill(box, list, msg) {
    box.textContent = "";
    if (!list.length) { box.appendChild(el("div", "empty", msg)); return; }
    list.forEach(function (v) { box.appendChild(card(v)); });
  }
  function link(href, text, cls) { var a = el("a", cls || "chip", text); a.href = href; return a; }

  function render(data) {
    var vids = (data.videos || []).filter(function (v) { return v && v.id && v.title && embed(v.url); });
    vids.sort(function (a, b) { return (b.date || "").localeCompare(a.date || ""); });
    var byId = {}; vids.forEach(function (v) { byId[v.id] = v; });
    var follows = store("ibtv-follows", []), hist = store("ibtv-history", []);
    var page = document.body.dataset.page;

    if (page === "home") {
      var L = data.live || {}, lb = $("live-box"), src = L.active && embed(L.url);
      if (src) { $("live-title").textContent = (L.title || "Live now") + (L.creator ? " · " + L.creator : ""); lb.appendChild(frame(src, L.title)); }
      else { lb.appendChild(el("p", "note", "Nobody is live on Island Beats TV right now. Creators: go live from the suite, then share your watch link.")); lb.appendChild(link("../beats/live.html", "🔴 Open Go Live", "btn")); }
      var cr = $("cats"); Object.keys(CATS).forEach(function (k) { cr.appendChild(link("category.html?c=" + k, CATS[k])); });
      var cont = hist.map(function (id) { return byId[id]; }).filter(Boolean);
      $("cont-shelf").hidden = !cont.length; fill($("cont"), cont, "");
      var fol = vids.filter(function (v) { return follows.indexOf(v.creatorId) >= 0; });
      fill($("follow"), fol, follows.length ? "No new videos from creators you follow yet." : "Follow a creator from their channel page and their videos show here.");
      fill($("new"), vids.filter(function (v) { return v.kind !== "past-live"; }).slice(0, 20), "No videos yet. Island Beats TV is brand new — the first approved videos will show here.");
      fill($("lives"), vids.filter(function (v) { return v.kind === "past-live"; }).slice(0, 20), "No past lives yet. Recorded live streams appear here once approved.");
      var cs = {}; vids.forEach(function (v) { cs[v.creatorId] = v.creator; });
      var cb = $("creators"); cb.textContent = "";
      if (!Object.keys(cs).length) cb.appendChild(el("div", "empty", "No creators yet. Be one of the first — submit a video."));
      Object.keys(cs).forEach(function (id) { cb.appendChild(link("channel.html?c=" + encodeURIComponent(id), cs[id])); });
    }
    if (page === "category") {
      var c = CATS[q.get("c")] ? q.get("c") : "music"; $("ctitle").textContent = CATS[c];
      var cr2 = $("cats"); Object.keys(CATS).forEach(function (k) { cr2.appendChild(link("category.html?c=" + k, CATS[k], "chip" + (k === c ? " on" : ""))); });
      fill($("list"), vids.filter(function (v) { return v.category === c; }), "No " + CATS[c] + " videos yet.");
    }
    if (page === "channel") {
      var id = q.get("c") || "", mine = vids.filter(function (v) { return v.creatorId === id; });
      $("cname").textContent = mine.length ? mine[0].creator : "Creator not found";
      var fb = $("followbtn"); fb.hidden = !mine.length;
      function upd() { fb.textContent = follows.indexOf(id) >= 0 ? "✓ Following (on this device)" : "+ Follow"; }
      upd(); fb.addEventListener("click", function () { var i = follows.indexOf(id); if (i >= 0) follows.splice(i, 1); else follows.push(id); save("ibtv-follows", follows); upd(); });
      fill($("list"), mine, "This creator has no approved videos yet.");
    }
    if (page === "watch") {
      var v = byId[q.get("v")];
      if (!v) { $("vtitle").textContent = "Video not found"; $("vdesc").textContent = "It may not be approved yet, or the link is wrong."; return; }
      document.title = v.title + " · Island Beats TV BETA";
      $("vbox").appendChild(frame(embed(v.url), v.title)); $("vtitle").textContent = v.title;
      var cl = $("vcreator"); cl.textContent = v.creator; cl.href = "channel.html?c=" + encodeURIComponent(v.creatorId);
      $("vmeta").textContent = (CATS[v.category] || "") + (v.date ? " · " + v.date : "") + (v.kind === "past-live" ? " · Past live" : "");
      $("vdesc").textContent = v.description || "";
      $("report").href = "report.html?v=" + encodeURIComponent(v.id);
      hist = [v.id].concat(hist.filter(function (x) { return x !== v.id; })).slice(0, 30); save("ibtv-history", hist);
      fill($("more"), vids.filter(function (x) { return x.id !== v.id && (x.creatorId === v.creatorId || x.category === v.category); }).slice(0, 8), "More videos coming soon.");
    }
    if (page === "report") { $("rvid").value = q.get("v") || ""; }
  }

  // Upload button gate (Supabase email sign-in; config lives in ../beats/auth-config.js)
  var cfg = window.IPB_AUTH_CONFIG || {}, ready = !!(cfg.supabaseUrl && cfg.supabaseAnonKey);
  document.querySelectorAll("[data-gate]").forEach(function (b) {
    if (!ready) { b.setAttribute("aria-disabled", "true"); b.classList.add("off"); var n = $("gate-note"); if (n) n.hidden = false; }
  });
  document.querySelectorAll("form[data-gated] button[type=submit]").forEach(function (b) { if (!ready) b.disabled = true; });
  document.querySelectorAll("a[data-gate]").forEach(function (a) { a.addEventListener("click", function (e) { if (!ready) { e.preventDefault(); var n = $("gate-note"); if (n) { n.hidden = false; n.focus && n.focus(); } } }); });

  var sh = $("share"); if (sh) sh.addEventListener("click", function () {
    var d = { title: document.title, url: location.href };
    if (navigator.share) navigator.share(d).catch(function () {}); else if (navigator.clipboard) navigator.clipboard.writeText(location.href).then(function () { sh.textContent = "Link copied"; }, function () {});
  });
  var ib = $("install"), dp; window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); dp = e; if (ib) ib.hidden = false; });
  if (ib) ib.addEventListener("click", function () { if (dp) { dp.prompt(); dp = null; ib.hidden = true; } });
  var f = document.querySelector("form[data-subj]");
  if (f) f.addEventListener("submit", function () { var t = f.querySelector("[data-subjsrc]"), s = f.querySelector("[name=_subject]"); s.value = f.dataset.subj + ": " + ((t && t.value) || "").slice(0, 80); });

  if (document.body.dataset.page && document.body.dataset.page !== "static") {
    fetch(document.body.dataset.root + "videos.json", { cache: "no-cache" }).then(function (r) { return r.json(); }).then(render)
      .catch(function () { render({ videos: [] }); });
  }
  if ("serviceWorker" in navigator) navigator.serviceWorker.register(document.body.dataset.root + "sw.js").catch(function () {});
})();
