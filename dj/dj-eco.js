/* DJ Psycho Fingers — ecosystem glue (Beats ⇄ DJ booth ⇄ Psycho Fingers Player) via ../shared/media-store.js.
 * - After REC / REC VIDEO stops: "Send to Player" (saveTrack source 'dj'; video saved as video/webm).
 * - "From Beats" crate: listTracks({source:'beats'}), live via BroadcastChannel, loadable to decks and Auto DJ. */
(function () {
  "use strict";
  var P = window.PFDJ; if (!P) return;
  var $ = function (id) { return document.getElementById(id); };
  var MS = null, beats = [], err = null;
  function store() { if (!MS) MS = import("../shared/media-store.js").catch(function (e) { MS = null; throw e; }); return MS; }
  function sendMix(m, btn) {
    if (m.playerId) { window.open("../player/?track=" + encodeURIComponent(m.playerId), "psycho-fingers-player"); return Promise.resolve(m.playerId); }
    if (btn) { btn.disabled = true; btn.textContent = "Saving…"; }
    var mime = m.blob.type || (m.video ? "video/webm" : m.ext === "wav" ? "audio/wav" : "audio/webm");
    return store().then(function (s) { return s.saveTrack({ title: m.name, artist: "DJ Psycho Fingers", source: "dj", blob: m.blob, mime: mime, duration: m.dur || 0 }); })
      .then(function (id) {
        m.playerId = id;
        if (btn) { btn.disabled = false; btn.textContent = "In Player ✓"; }
        offer(m, true);
        P.toast("Sent to the Psycho Fingers Player — open it from the bar at the top or the link below");
        return id;
      }).catch(function (e) { if (btn) { btn.disabled = false; btn.textContent = "Send to Player"; } P.toast("Couldn't save to the Player library (" + (e && e.message || e) + ")."); return null; });
  }
  /* bar offered right after a recording stops */
  function offer(m, done) {
    var el = $("eco-offer"); if (!el) return;
    el.hidden = false;
    $("eco-msg").textContent = (m.video ? "🎬 Video show" : "🎙 Show") + " recorded · " + P.fmtTime(m.dur) + " · " + P.fmtSize(m.blob.size) + (done ? " · saved to the Player ✓" : "");
    var b = $("eco-send"); b.hidden = !!done; b.onclick = function () { sendMix(m, b); };
    var a = $("eco-open"); a.hidden = !done; if (done) a.href = "../player/?track=" + encodeURIComponent(m.playerId);
    clearTimeout(offer.t); offer.t = setTimeout(function () { el.hidden = true; }, done ? 15000 : 45000);
  }
  P.on("mix", function (m) { offer(m, false); });

  /* ---------- From Beats crate ---------- */
  function refresh() {
    return store().then(function (s) { return s.listTracks({ source: "beats" }); }).then(function (rows) { beats = rows || []; err = null; }).catch(function (e) { err = e; beats = []; })
      .then(function () { if (P.libTab === "frombeats") tab($("lib-list")); });
  }
  function itemOf(t) {
    return { name: t.title || "Beat", sub: "From Beats" + (t.artist ? " · " + t.artist : "") + (t.duration ? " · " + P.fmtTime(t.duration) : "") + " · " + new Date(t.createdAt || Date.now()).toLocaleDateString([], { month: "short", day: "numeric" }),
      key: "media:" + t.id, mediaId: t.id, bpmHint: P.bpmFromName(t.title), get: function () { return t.blob.arrayBuffer(); } };
  }
  function tab(list) {
    list.innerHTML = "";
    var bar = document.createElement("div"); bar.className = "mylib-bar";
    bar.innerHTML = '<button type="button" class="btn small" id="fb-all">+ Add all to Auto DJ</button><a class="btn small ghost" href="../beats/" target="_blank" rel="noopener">Open Beats ↗</a><span class="muted" id="fb-n"></span>';
    list.appendChild(bar);
    $("fb-n").textContent = beats.length + " track" + (beats.length === 1 ? "" : "s") + " · updates live";
    $("fb-all").onclick = function () { if (!window.PFAUTODJ || !beats.length) return; beats.forEach(function (t) { window.PFAUTODJ.add(itemOf(t), true); }); P.toast("Auto DJ queue: + " + beats.length + " track(s) from Beats"); };
    if (err) { list.insertAdjacentHTML("beforeend", '<p class="empty">The shared library isn\'t available here (' + String(err.message || err).replace(/</g, "") + ").</p>"); return; }
    if (!beats.length) { list.insertAdjacentHTML("beforeend", '<p class="empty">No beats sent from Island Pin Beats yet. In <a href="../beats/">Beats</a>, bounce a beat and send it to the shared library (source “beats”) — it appears here instantly.</p>'); return; }
    beats.forEach(function (t) {
      var it = itemOf(t), r = document.createElement("div"); r.className = "lib-row";
      r.innerHTML = '<div class="lib-main"><strong></strong><span class="mono"></span></div><div class="lib-acts"><button type="button" class="btn small">→ A</button><button type="button" class="btn small">→ B</button><button type="button" class="btn small ghost">+ Auto DJ</button></div>';
      r.querySelector("strong").textContent = it.name; r.querySelector(".mono").textContent = it.sub;
      var bs = r.querySelectorAll("button");
      bs[0].onclick = function () { P.loadInto(P.DECKS[0], it); }; bs[1].onclick = function () { P.loadInto(P.DECKS[1], it); };
      bs[2].onclick = function () { if (window.PFAUTODJ) window.PFAUTODJ.add(it); };
      list.appendChild(r);
    });
  }
  P.LIBTABS.frombeats = function (list) { tab(list); refresh(); };
  store().then(function (s) { s.onMediaChange(function (m) { if (!m.source || m.source === "beats" || m.type === "track-deleted") refresh(); }); refresh(); }).catch(function () { /* shared store not deployed */ });
  // Auto DJ: the From Beats crate is one of the default sources when the queue is empty and nothing else is selected
  if (window.PFAUTODJ && window.PFAUTODJ.sources) window.PFAUTODJ.sources.push(function () { return P.libTab === "frombeats" ? beats.map(itemOf) : []; });
  window.PFECO = { sendMix: sendMix, refresh: refresh, beats: function () { return beats; }, store: store };
})();
