/* DJ Psycho Fingers — Free Hip-Hop Crate (dj/crate/crate.json) + "DJ Psycho Fingers" crate.
 * 47 tracks, each verified CC0 / CC BY / CC BY-SA on its ccMixter page, hosted here as 128 kbps MP3s (ccMixter has no CORS).
 * Every row shows artist + licence (linked) + source. Offline BPM / grid / key / loudness / outro come from the manifest, so
 * decks load beat-gridded instantly and Auto DJ needn't analyze. Auto DJ uses this crate when its queue is empty. */
(function () {
  "use strict";
  var P = window.PFDJ; if (!P) return;
  var $ = function (id) { return document.getElementById(id); };
  var M = null, err = null, F = { g: "All", q: "" }, loading = null;
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  function load() {
    if (M) return Promise.resolve(M);
    if (loading) return loading;
    loading = fetch("crate/crate.json", { cache: "no-cache" }).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (j) { M = j; err = null; return M; }).catch(function (e) { err = e; loading = null; throw e; });
    return loading;
  }
  function itemOf(t) {
    var pf = t.genre === "DJ Psycho Fingers";
    return {
      name: t.title + " — " + t.artist, sub: (pf ? "His own beat" : t.genre + " · " + t.license + " · ccMixter") + " · " + Math.round(t.bpm) + " BPM" + (t.key ? " · " + t.key : "") + (t.dur ? " · " + P.fmtTime(t.dur) : ""),
      key: t.id === "pf-gunwalk" ? "builtin:gunwalk" : "crate:" + t.id, bpm: t.bpm, grid: t.grid || 0, bpmHint: t.bpm,
      ana: t.end ? { bpm: t.bpm, grid: t.grid || 0, end: t.end, outro: t.outro || t.end, dur: t.dur } : null,
      credit: pf ? null : { artist: t.artist, license: t.license, licenseUrl: t.licenseUrl, sourceUrl: t.sourceUrl },
      get: function () { return fetch(pf ? t.url : "crate/" + encodeURIComponent(t.file)).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.arrayBuffer(); }); }
    };
  }
  function pfTracks() { return (M && M.psychoFingers) || []; }
  function all() { return M ? pfTracks().concat(M.tracks) : []; }
  function filtered() {
    var q = F.q.toLowerCase();
    return all().filter(function (t) {
      if (F.g !== "All" && t.genre !== F.g) return false;
      if (q && (t.title + " " + t.artist + " " + t.genre + " " + (t.key || "") + " " + Math.round(t.bpm)).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }
  function tab(list) {
    list.innerHTML = '<p class="empty">Opening the crate…</p>';
    load().then(function () { if (P.libTab === "crate") render(list); }).catch(function (e) { list.innerHTML = '<p class="empty">Couldn\'t open the crate (' + esc(e.message || e) + ").</p>"; });
  }
  function render(list) {
    var genres = ["All", "DJ Psycho Fingers"].concat(M.genres);
    var count = function (g) { return g === "All" ? all().length : all().filter(function (t) { return t.genre === g; }).length; };
    list.innerHTML =
      '<div class="crate-head"><div class="crate-chips" role="tablist">' + genres.map(function (g) { return '<button type="button" class="chip' + (g === F.g ? " on" : "") + (g === "DJ Psycho Fingers" ? " pf" : "") + '" data-g="' + esc(g) + '">' + esc(g) + ' <small>' + count(g) + '</small></button>'; }).join("") + '</div>' +
      '<div class="crate-bar"><input type="search" class="search" id="crate-q" placeholder="Search title, artist, BPM, key…" value="' + esc(F.q) + '" aria-label="Search the crate"><button type="button" class="btn small" id="crate-all">+ Add ' + (F.g === "All" ? "all" : esc(F.g)) + ' to Auto DJ</button>' +
      '<a class="btn small ghost" href="crate/CREDITS.md" target="_blank" rel="noopener">Credits</a></div>' +
      '<p class="crate-note muted">47 free tracks, every one checked on its source page: CC0, CC BY or CC BY-SA (no “non-commercial” / “no derivatives”). Credit the artists when you post a mix — the Credits page has ready-made lines. BPM, beat grid and key are pre-analyzed, so tracks drop in beat-matched.</p></div><div id="crate-rows"></div>';
    list.querySelectorAll(".chip").forEach(function (b) { b.onclick = function () { F.g = b.dataset.g; render(list); }; });
    $("crate-q").addEventListener("input", function (e) { F.q = e.target.value; rows(); });
    $("crate-all").onclick = function () { var ts = filtered(); if (!window.PFAUTODJ || !ts.length) return; ts.forEach(function (t) { window.PFAUTODJ.add(itemOf(t), true); }); P.toast("Auto DJ queue: + " + ts.length + " track" + (ts.length === 1 ? "" : "s") + " from the crate"); };
    rows();
  }
  function rows() {
    var box = $("crate-rows"); if (!box) return;
    var ts = filtered(); box.innerHTML = ts.length ? "" : '<p class="empty">Nothing matches.</p>';
    ts.forEach(function (t) {
      var it = itemOf(t), pf = t.genre === "DJ Psycho Fingers", r = document.createElement("div"); r.className = "lib-row crate-row" + (pf ? " pf" : "");
      r.innerHTML = '<div class="lib-main"><strong></strong><span class="crate-meta"><span class="cr-artist"></span><span class="cr-g"></span><span class="mono cr-bpm"></span>' +
        (pf ? '<span class="cr-lic pf">© his own beat</span>' : '<a class="cr-lic" target="_blank" rel="noopener license"></a><a class="cr-src" target="_blank" rel="noopener">ccMixter ↗</a>') + '</span></div>' +
        '<div class="lib-acts"><button type="button" class="btn small">→ A</button><button type="button" class="btn small">→ B</button><button type="button" class="btn small ghost">+ Auto DJ</button></div>';
      r.querySelector("strong").textContent = t.title;
      r.querySelector(".cr-artist").textContent = t.artist + (t.featuring ? " (feat. / samples: " + t.featuring + ")" : "");
      r.querySelector(".cr-g").textContent = t.genre;
      r.querySelector(".cr-bpm").textContent = (t.bpmApprox ? "~" : "") + (Math.round(t.bpm * 10) / 10) + " BPM" + (t.key ? " · " + t.key : "") + (t.dur ? " · " + P.fmtTime(t.dur) : "");
      if (!pf) { var a = r.querySelector(".cr-lic"); a.textContent = t.license; a.href = t.licenseUrl; a.title = "Licence: " + t.license; var s = r.querySelector(".cr-src"); s.href = t.sourceUrl; s.title = "Source page (licence verified there)"; }
      var b = r.querySelectorAll("button");
      b[0].onclick = function () { P.loadInto(P.DECKS[0], it); }; b[1].onclick = function () { P.loadInto(P.DECKS[1], it); };
      b[2].onclick = function () { if (window.PFAUTODJ) window.PFAUTODJ.add(it); };
      box.appendChild(r);
    });
  }
  P.LIBTABS.crate = tab;
  // Auto DJ: when the queue is empty, fill it from the DJ Psycho Fingers crate + the Free Hip-Hop Crate
  // (unless you're looking at another crate that provides its own tracks — My Library / From Beats)
  if (window.PFAUTODJ && window.PFAUTODJ.sources) {
    window.PFAUTODJ.sources.push(function () {
      if (P.libTab === "frombeats" && window.PFECO && window.PFECO.beats().length) return [];
      return M ? all().map(itemOf) : [];
    });
  }
  load().catch(function () { /* offline: Auto DJ falls back to his beats & demos */ });
  window.PFCRATE = { load: load, get M() { return M; }, item: itemOf, all: all, filtered: filtered };
})();
