/* Afterglow · Local Films (community submissions, moderated).
   Static-only: submissions and reports are sent by a free form relay (FormSubmit.co)
   to the owner's inbox; nothing is public until it is added to community.json. */
(function(){
  "use strict";

  // ---------------------------------------------------------------------------
  // CONFIG. After FormSubmit activation, replace the email in RELAY with the
  // random alias FormSubmit gives you (see README.md), e.g.
  //   var RELAY = "https://formsubmit.co/ajax/3f9c0e1d2b7a6c5d4e8f";
  var RELAY = "https://formsubmit.co/ajax/madinc47@gmail.com";
  var SITE_NAME = "Afterglow Local Films";
  var LIMITS = {
    submitGapMs: 2 * 60 * 1000,   // at most one submission every 2 minutes per browser
    submitPerDay: 5,              // and 5 per 24 h
    reportPerDay: 10,             // at most 10 reports per 24 h per browser
    reportSameFilmMs: 24 * 60 * 60 * 1000, // one report per film per day
    minFillMs: 4000               // forms sent faster than this are treated as bots
  };
  // ---------------------------------------------------------------------------

  var $ = function(id){ return document.getElementById(id); };
  function esc(s){ return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
  function thisYear(){ return new Date().getFullYear(); }

  // ---------- film link parsing (mirrors approve-film.py) ----------
  var HOST_LABEL = {youtube: "YouTube", vimeo: "Vimeo", drive: "Google Drive", archive: "Internet Archive"};
  function parseFilmLink(raw){
    var s = String(raw || "").trim();
    if (!s) return null;
    if (!/^https?:\/\//i.test(s)) s = "https://" + s;
    var u; try { u = new URL(s); } catch(e){ return null; }
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    var h = u.hostname.toLowerCase().replace(/^(www\.|m\.)/, "");
    var p = u.pathname.replace(/\/+$/, ""), m, id;
    // YouTube
    if (h === "youtube.com" || h === "youtube-nocookie.com" || h === "music.youtube.com") {
      if (p === "/watch") id = u.searchParams.get("v");
      else if ((m = p.match(/^\/(?:embed|shorts|live|v)\/([\w-]{11})$/))) id = m[1];
      if (id && /^[\w-]{11}$/.test(id)) return {host: "youtube", id: id,
        embed: "https://www.youtube-nocookie.com/embed/" + id,
        watch: "https://www.youtube.com/watch?v=" + id,
        poster: "https://i.ytimg.com/vi/" + id + "/hqdefault.jpg"};
      return null;
    }
    if (h === "youtu.be") {
      id = p.slice(1);
      if (/^[\w-]{11}$/.test(id)) return {host: "youtube", id: id,
        embed: "https://www.youtube-nocookie.com/embed/" + id,
        watch: "https://www.youtube.com/watch?v=" + id,
        poster: "https://i.ytimg.com/vi/" + id + "/hqdefault.jpg"};
      return null;
    }
    // Vimeo (public: vimeo.com/123; unlisted: vimeo.com/123/abcdef or player.vimeo.com/video/123?h=abcdef)
    if (h === "vimeo.com" || h === "player.vimeo.com") {
      m = p.match(/^\/(?:video\/|channels\/[\w-]+\/|groups\/[\w-]+\/videos\/)?(\d{5,12})(?:\/([0-9a-f]{6,20}))?$/i);
      if (!m) return null;
      var hash = m[2] || u.searchParams.get("h") || "";
      if (hash && !/^[0-9a-f]{6,20}$/i.test(hash)) hash = "";
      return {host: "vimeo", id: m[1] + (hash ? ":" + hash : ""),
        embed: "https://player.vimeo.com/video/" + m[1] + (hash ? "?h=" + hash : ""),
        watch: "https://vimeo.com/" + m[1] + (hash ? "/" + hash : ""), poster: ""};
    }
    // Google Drive (file must be shared "Anyone with the link")
    if (h === "drive.google.com" || h === "docs.google.com") {
      m = p.match(/^\/file\/d\/([\w-]{10,})(?:\/(?:view|preview|edit))?$/);
      id = m ? m[1] : ((p === "/open" || p === "/uc") ? u.searchParams.get("id") : null);
      if (id && /^[\w-]{10,}$/.test(id)) return {host: "drive", id: id,
        embed: "https://drive.google.com/file/d/" + id + "/preview",
        watch: "https://drive.google.com/file/d/" + id + "/view", poster: ""};
      return null;
    }
    // Internet Archive
    if (h === "archive.org") {
      m = p.match(/^\/(?:details|embed)\/([\w.-]+)(?:\/.*)?$/);
      if (m) return {host: "archive", id: m[1],
        embed: "https://archive.org/embed/" + m[1],
        watch: "https://archive.org/details/" + m[1],
        poster: "https://archive.org/services/img/" + m[1]};
      return null;
    }
    return null;
  }
  function safeHttpsUrl(raw){
    var s = String(raw || "").trim(); if (!s) return "";
    try { var u = new URL(s); return u.protocol === "https:" ? u.href : ""; } catch(e){ return ""; }
  }
  window.AfterglowCommunity = {parseFilmLink: parseFilmLink};

  // ---------- rate limit (client side, per browser) ----------
  function store(){ try { return window.localStorage; } catch(e){ return null; } }
  function readLog(key){ var s = store(); if (!s) return []; try { return JSON.parse(s.getItem(key) || "[]"); } catch(e){ return []; } }
  function writeLog(key, arr){ var s = store(); if (!s) return; try { s.setItem(key, JSON.stringify(arr.slice(-50))); } catch(e){} }
  function recent(key, ms){ var now = Date.now(); return readLog(key).filter(function(x){ return now - (x.t || x) < ms; }); }
  var DAY = 24 * 60 * 60 * 1000;
  function submitBlockedReason(){
    var log = recent("agcf-submits", DAY);
    if (log.length >= LIMITS.submitPerDay) return "You've sent " + log.length + " films today. Please try again tomorrow.";
    var last = log.length ? (log[log.length - 1].t || log[log.length - 1]) : 0;
    var wait = LIMITS.submitGapMs - (Date.now() - last);
    if (last && wait > 0) return "Thanks! Please wait " + Math.ceil(wait / 1000) + " seconds before sending another film.";
    return "";
  }
  function reportBlockedReason(filmId){
    var log = recent("agcf-reports", DAY);
    if (log.length >= LIMITS.reportPerDay) return "You've sent a lot of reports today. Please try again tomorrow.";
    var same = log.filter(function(x){ return x.id === filmId && Date.now() - x.t < LIMITS.reportSameFilmMs; });
    if (same.length) return "You already reported this film today. Thank you, we're looking at it.";
    return "";
  }

  // ---------- relay ----------
  function sendToRelay(payload){
    return fetch(RELAY, {
      method: "POST",
      headers: {"Content-Type": "application/json", "Accept": "application/json"},
      body: JSON.stringify(payload)
    }).then(function(r){
      return r.json().catch(function(){ return {}; }).then(function(j){
        var ok = r.ok && (j.success === true || j.success === "true");
        if (!ok) { var e = new Error(j.message || ("HTTP " + r.status)); e.relay = j; throw e; }
        return j;
      });
    });
  }
  function friendlyRelayError(err){
    var msg = (err && err.message) || "";
    if (/activat/i.test(msg)) return "Submissions are being switched on right now. Please try again in a day or two. Your details are still in the form.";
    if (/failed to fetch|network|load failed/i.test(msg)) return "Couldn't reach the submission service. Check your connection and try again. Your details are still in the form.";
    return "Something went wrong sending this (" + msg.slice(0, 120) + "). Please try again later. Your details are still in the form.";
  }

  function slug(s){ return String(s || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "film"; }

  // =========================================================================
  // SUBMIT PAGE
  // =========================================================================
  function initSubmit(){
    var form = $("submit-form"); if (!form) return;
    var loadedAt = Date.now();
    var yearEl = form.elements.year; yearEl.max = thisYear() + 1;
    window.__agcf = {sent: [], blocked: []};

    function setErr(name, msg){
      var el = form.elements[name]; var box = $("err-" + name);
      if (box) box.textContent = msg || "";
      var target = el && el.length && !el.tagName ? el[0] : el;
      if (target && target.setAttribute) {
        if (msg) target.setAttribute("aria-invalid", "true"); else target.removeAttribute("aria-invalid");
      }
    }
    function val(n){ var el = form.elements[n]; return el ? String(el.value || "").trim() : ""; }

    function validate(){
      var errors = {};
      var t = val("title"); if (t.length < 2) errors.title = "Enter your film's title."; else if (t.length > 120) errors.title = "Keep the title under 120 characters.";
      var d = val("description"); if (d.length < 20) errors.description = "Tell viewers what the film is about (at least 20 characters)."; else if (d.length > 1500) errors.description = "Keep the description under 1500 characters.";
      var fm = val("filmmaker"); if (fm.length < 2) errors.filmmaker = "Enter the filmmaker's name.";
      var c = val("contact");
      var isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c);
      var isPhone = /^\+?[\d\s().-]{7,20}$/.test(c) && c.replace(/\D/g, "").length >= 7;
      if (!c) errors.contact = "Add an email or phone number so we can reach you.";
      else if (!isEmail && !isPhone) errors.contact = "That doesn't look like an email or phone number.";
      var y = parseInt(val("year"), 10);
      if (!y || y < 1950 || y > thisYear() + 1) errors.year = "Enter a year between 1950 and " + (thisYear() + 1) + ".";
      var rt = parseInt(val("runtime"), 10);
      if (!rt || rt < 1 || rt > 600) errors.runtime = "Runtime in minutes (1–600).";
      if (!val("genre")) errors.genre = "Pick a genre.";
      if (val("country").length < 2) errors.country = "Enter the country.";
      var link = val("film_link");
      if (!link) errors.film_link = "Paste the link to your film.";
      else if (!parseFilmLink(link)) errors.film_link = "Use a YouTube, Vimeo, Google Drive or Internet Archive video link.";
      var poster = val("poster");
      if (poster && !safeHttpsUrl(poster)) errors.poster = "Poster link must start with https://";
      if (!form.querySelector("input[name=rating]:checked")) errors.rating = "Choose a content rating.";
      if (!form.elements.rights.checked) errors.rights = "Please confirm you made the film or own the rights.";
      ["title","description","filmmaker","contact","year","runtime","genre","country","film_link","poster","rating","rights"].forEach(function(n){ setErr(n, errors[n]); });
      return errors;
    }

    // live link detection
    var detect = $("detect");
    function showDetect(){
      var link = val("film_link");
      if (!link) { detect.textContent = ""; detect.className = "detect"; return; }
      var p = parseFilmLink(link);
      if (p) { detect.textContent = "✓ " + HOST_LABEL[p.host] + " link recognised"; detect.className = "detect ok"; setErr("film_link", ""); }
      else { detect.textContent = "Not a supported link yet. Use YouTube, Vimeo, Google Drive or Internet Archive."; detect.className = "detect bad"; }
    }
    form.elements.film_link.addEventListener("input", showDetect);
    var pv = $("poster-preview");
    form.elements.poster.addEventListener("change", function(){
      var u = safeHttpsUrl(val("poster"));
      if (u) { pv.src = u; pv.hidden = false; pv.onerror = function(){ pv.hidden = true; }; } else pv.hidden = true;
    });
    form.addEventListener("input", function(e){ if (e.target.name && e.target.getAttribute("aria-invalid")) setErr(e.target.name, ""); });
    form.addEventListener("change", function(e){ if (e.target.name === "rights" || e.target.name === "rating") setErr(e.target.name, ""); });

    var status = $("form-status"), btn = $("submit-btn");
    function setStatus(msg, kind){ status.textContent = msg; status.className = "status" + (kind ? " " + kind : ""); }

    function showThanks(title, contact){
      form.hidden = true;
      var t = $("thanks"); t.hidden = false;
      $("thanks-title").textContent = title;
      $("thanks-contact").textContent = contact;
      t.focus();
      window.scrollTo({top: t.getBoundingClientRect().top + window.scrollY - 90});
    }

    form.addEventListener("submit", function(e){
      e.preventDefault();
      setStatus("");
      var errors = validate(); var names = Object.keys(errors);
      if (names.length) {
        setStatus("Please fix the " + (names.length === 1 ? "highlighted field" : names.length + " highlighted fields") + ".", "bad");
        var first = form.elements[names[0]]; if (first && !first.tagName && first.length) first = first[0];
        if (first && first.focus) first.focus();
        return;
      }
      // honeypot / too-fast (checked after validation so real people always see field errors): bots fill every field. Pretend success, send nothing.
      if (val("_honey") || Date.now() - loadedAt < LIMITS.minFillMs) {
        window.__agcf.blocked.push(val("_honey") ? "honeypot" : "too-fast");
        showThanks(val("title") || "your film", val("contact") || "the contact you gave");
        return;
      }
      var blocked = submitBlockedReason();
      if (blocked) { setStatus(blocked, "bad"); window.__agcf.blocked.push("rate-limit"); return; }

      var p = parseFilmLink(val("film_link"));
      var rating = form.querySelector("input[name=rating]:checked").value;
      var contact = val("contact");
      var entry = {
        id: slug(val("title")) + "-" + val("year"),
        title: val("title"), filmmaker: val("filmmaker"), year: parseInt(val("year"), 10),
        runtime: parseInt(val("runtime"), 10), genre: val("genre"), rating: rating,
        country: val("country"), parish: val("parish"), description: val("description"),
        embed: {host: p.host, id: p.id, url: p.embed}, link: p.watch,
        poster: safeHttpsUrl(val("poster")) || p.poster, approvedDate: "YYYY-MM-DD"
      };
      var payload = {
        _subject: SITE_NAME + " submission: " + entry.title + " (" + entry.year + ")",
        _template: "table",
        _captcha: "false",
        _honey: "",
        type: "FILM SUBMISSION (review before approving)",
        title: entry.title,
        filmmaker: entry.filmmaker,
        contact: contact,
        year: String(entry.year),
        runtime_minutes: String(entry.runtime),
        genre: entry.genre,
        rating: rating,
        country: entry.country,
        parish: entry.parish || "(not given)",
        description: entry.description,
        film_link: val("film_link"),
        video_host: HOST_LABEL[p.host],
        embed_url: p.embed,
        poster_link: val("poster") || "(none: host thumbnail will be used)",
        rights_confirmed: "YES: I made this film or own the rights, and I allow Afterglow to show it free",
        submitted_at: new Date().toISOString(),
        page: location.href.split("#")[0],
        entry_json: JSON.stringify(entry)
      };
      if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(contact)) payload._replyto = contact;

      btn.disabled = true; btn.textContent = "Sending…"; setStatus("Sending your film to the moderation queue…");
      sendToRelay(payload).then(function(){
        var log = readLog("agcf-submits"); log.push({t: Date.now()}); writeLog("agcf-submits", log);
        window.__agcf.sent.push(payload);
        showThanks(entry.title, contact);
      }).catch(function(err){
        setStatus(friendlyRelayError(err), "bad");
      }).then(function(){ btn.disabled = false; btn.textContent = "Send for review"; });
    });

    $("another").addEventListener("click", function(){
      form.reset(); form.elements.country.value = "Dominica"; showDetect(); pv.hidden = true;
      form.hidden = false; $("thanks").hidden = true; setStatus(""); loadedAt = Date.now();
      form.elements.title.focus();
    });
  }

  // =========================================================================
  // SHELF PAGE
  // =========================================================================
  function initShelf(){
    var grid = $("cf-grid"); if (!grid) return;
    var items = [], state = {genre: "all", mature: false}, lastFocus = null, current = null;
    window.__agcfShelf = {loaded: false, count: 0, player: {id: null, host: null, src: null}, reports: [], blocked: []};
    var RATING = {all: "All ages", teen: "Teen 13+", mature: "Mature 18+"};

    function valid(it){
      if (!it || typeof it !== "object" || !it.title || !it.id) return false;
      var p = parseFilmLink((it.embed && it.embed.url) || it.link);
      if (!p) return false;
      it._play = p;
      it._poster = safeHttpsUrl(it.poster) || p.poster || "";
      it.rating = RATING[it.rating] ? it.rating : "mature"; // unknown rating: treat as mature (safer)
      return true;
    }
    function visible(){ return items.filter(function(it){ return (state.mature || it.rating !== "mature") && (state.genre === "all" || String(it.genre).toLowerCase() === state.genre); }); }

    function card(it){
      var img = it._poster ? '<img loading="lazy" src="' + esc(it._poster) + '" alt="" onerror="this.remove()">' : "";
      return '<button class="card" type="button" data-id="' + esc(it.id) + '" aria-label="Play ' + esc(it.title) + ' by ' + esc(it.filmmaker) + ', ' + esc(it.year) + '">' +
        '<div class="thumb"><div class="ph" aria-hidden="true">' + esc(it.title) + '</div>' + img +
        '<span class="badge l">' + esc(it.genre || "Film") + '</span><span class="badge r rate-' + it.rating + '">' + esc(RATING[it.rating]) + '</span></div>' +
        '<h3>' + esc(it.title) + '</h3><p class="sub">' + esc(it.filmmaker) + ' · ' + esc(it.year) + ' · ' + esc(it.runtime) + ' min</p>' +
        '<p class="lic">' + esc([it.parish, it.country].filter(Boolean).join(", ")) + '</p></button>';
    }

    function renderChips(){
      var gs = []; items.forEach(function(it){ var g = String(it.genre || "").toLowerCase(); if (g && gs.indexOf(g) < 0) gs.push(g); });
      var wrap = $("cf-genre-wrap"); wrap.hidden = gs.length < 2;
      $("cf-genres").innerHTML = ["all"].concat(gs.sort()).map(function(g){ return '<button class="chip" type="button" data-v="' + esc(g) + '" aria-pressed="' + (state.genre === g) + '">' + esc(g) + '</button>'; }).join("");
    }

    function render(){
      var list = visible();
      grid.innerHTML = list.map(card).join("");
      var hiddenMature = items.filter(function(it){ return it.rating === "mature"; }).length;
      $("cf-empty").hidden = items.length > 0;
      $("cf-tools").hidden = items.length === 0;
      var note = $("cf-hidden-note");
      if (items.length && !state.mature && hiddenMature) { note.hidden = false; note.innerHTML = esc(hiddenMature) + (hiddenMature === 1 ? " mature film is" : " mature films are") + ' hidden. <button type="button" class="linkbtn" data-mature-on>Show mature films</button>'; }
      else note.hidden = true;
      $("cf-count").textContent = items.length ? (list.length + " of " + items.length + " local films") : "";
      $("cf-none").hidden = !(items.length && !list.length);
      window.__agcfShelf.count = list.length;
    }

    function setMature(on){
      state.mature = !!on;
      $("mature-toggle").setAttribute("aria-pressed", String(state.mature));
      try { sessionStorage.setItem("agcf-mature", state.mature ? "1" : ""); } catch(e){}
      render();
    }

    // ----- player -----
    function playInto(it){
      var p = it._play, src = p.embed;
      if (p.host === "youtube") src += "?autoplay=1&rel=0&playsinline=1&modestbranding=1";
      else if (p.host === "vimeo") src += (src.indexOf("?") < 0 ? "?" : "&") + "autoplay=1&dnt=1";
      else if (p.host === "archive") src += "?autoplay=1";
      $("screen-inner").innerHTML = '<iframe src="' + esc(src) + '" title="' + esc(it.title) + '" allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>';
      window.__agcfShelf.player = {id: it.id, host: p.host, src: src};
    }
    function open(id, fromHash){
      var it = items.filter(function(x){ return x.id === id; })[0]; if (!it) return;
      current = it; lastFocus = document.activeElement;
      $("p-eyebrow").textContent = "Local Films · " + (it.genre || "Film") + " · " + RATING[it.rating];
      $("p-title").textContent = it.title;
      $("p-meta").textContent = [it.filmmaker, it.year, it.runtime + " min", [it.parish, it.country].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
      $("p-syn").textContent = it.description || "";
      $("p-note").textContent = "Shared by the filmmaker" + (it.approvedDate ? " · on Afterglow since " + it.approvedDate : "") + ". Hosted on " + HOST_LABEL[it._play.host] + ".";
      $("p-links").innerHTML = '<a href="' + esc(it._play.watch) + '" target="_blank" rel="noopener">Open on ' + esc(HOST_LABEL[it._play.host]) + ' ↗</a><button type="button" class="report-btn" id="report-open">⚑ Report this film</button>';
      $("report-box").hidden = true; $("report-status").textContent = "";
      if (it.rating === "mature" && !state.mature) {
        $("screen-inner").innerHTML = '<div class="gate"><div><p class="eyebrow">Mature 18+</p><p>This film is rated for adults. Turn on mature films to watch it.</p><button type="button" class="btn btn-primary" data-gate-ok>I\'m 18 or older, play</button></div></div>';
        window.__agcfShelf.player = {id: it.id, host: null, src: null, gated: true};
      } else playInto(it);
      $("player").hidden = false; document.body.style.overflow = "hidden";
      if (!fromHash) history.replaceState(null, "", "#watch/" + it.id);
      document.querySelector("#player .close").focus();
    }
    function close(){
      if ($("player").hidden) return;
      $("screen-inner").innerHTML = ""; $("player").hidden = true; document.body.style.overflow = "";
      current = null; window.__agcfShelf.player = {id: null, host: null, src: null};
      history.replaceState(null, "", location.pathname + location.search);
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }

    // ----- report -----
    var reportOpenedAt = 0;
    function openReport(){
      var box = $("report-box"); box.hidden = false; reportOpenedAt = Date.now();
      $("report-form").reset(); $("report-status").textContent = ""; $("report-status").className = "status";
      $("report-form").hidden = false;
      $("report-reason").focus();
    }
    $("report-form").addEventListener("submit", function(e){
      e.preventDefault(); if (!current) return;
      var f = e.target, st = $("report-status");
      function say(m, k){ st.textContent = m; st.className = "status" + (k ? " " + k : ""); }
      var reason = f.elements.reason.value;
      if (!reason) { say("Pick a reason.", "bad"); f.elements.reason.focus(); return; }
      if (f.elements._honey.value || Date.now() - reportOpenedAt < 1500) { window.__agcfShelf.blocked.push(f.elements._honey.value ? "honeypot" : "too-fast"); say("Thanks. Your report was sent to the moderator.", "ok"); f.hidden = true; return; }
      var why = f.elements.details.value.trim().slice(0, 1000);
      var blocked = reportBlockedReason(current.id);
      if (blocked) { say(blocked, "bad"); window.__agcfShelf.blocked.push("rate-limit"); return; }
      var payload = {
        _subject: SITE_NAME + " REPORT: " + current.title + " [" + current.id + "]",
        _template: "table", _captcha: "false", _honey: "",
        type: "FILM REPORT",
        film_id: current.id, film_title: current.title, filmmaker: current.filmmaker,
        film_link: current._play.watch, reason: reason, details: why || "(none)",
        reporter_contact: f.elements.contact.value.trim().slice(0, 200) || "(anonymous)",
        reported_at: new Date().toISOString(), page: location.href.split("#")[0] + "#watch/" + current.id,
        how_to_remove: "Delete the entry with id \"" + current.id + "\" from afterglow-new/community/community.json"
      };
      var btn = f.querySelector("button[type=submit]"); btn.disabled = true; say("Sending report…");
      var id = current.id;
      sendToRelay(payload).then(function(){
        var log = readLog("agcf-reports"); log.push({t: Date.now(), id: id}); writeLog("agcf-reports", log);
        window.__agcfShelf.reports.push(payload);
        say("Thanks. Your report was sent to the moderator, who will review this film.", "ok"); f.hidden = true;
      }).catch(function(err){ say(friendlyRelayError(err).replace(" Your details are still in the form.", ""), "bad"); })
        .then(function(){ btn.disabled = false; });
    });

    document.addEventListener("click", function(e){
      if (e.target.closest("[data-close]")) { close(); return; }
      if (e.target.closest("[data-mature-on]")) { setMature(true); return; }
      if (e.target.closest("[data-gate-ok]")) { setMature(true); if (current) playInto(current); return; }
      if (e.target.closest("#report-open")) { openReport(); return; }
      if (e.target.closest("#report-cancel")) { $("report-box").hidden = true; return; }
      var chip = e.target.closest("#cf-genres .chip");
      if (chip) { state.genre = chip.getAttribute("data-v"); Array.prototype.forEach.call(chip.parentNode.children, function(c){ c.setAttribute("aria-pressed", String(c === chip)); }); render(); return; }
      var k = e.target.closest(".card"); if (k) open(k.getAttribute("data-id"));
    });
    $("mature-toggle").addEventListener("click", function(){ setMature(!state.mature); });
    document.addEventListener("keydown", function(e){ if (e.key === "Escape") close(); });
    function fromHash(){ var m = location.hash.match(/^#watch\/([\w-]+)/); if (m) open(m[1], true); }

    try { state.mature = sessionStorage.getItem("agcf-mature") === "1"; } catch(e){}
    $("mature-toggle").setAttribute("aria-pressed", String(state.mature));

    fetch("community.json", {cache: "no-cache"}).then(function(r){ if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function(data){
        items = (Array.isArray(data) ? data : (data.items || [])).filter(valid);
        items.sort(function(a, b){ return String(b.approvedDate || "").localeCompare(String(a.approvedDate || "")) || (b.year - a.year); });
      })
      .catch(function(){ items = []; })
      .then(function(){ renderChips(); render(); window.__agcfShelf.loaded = true; fromHash(); });
    window.addEventListener("hashchange", fromHash);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function(){ initSubmit(); initShelf(); });
  else { initSubmit(); initShelf(); }
})();
