/* DJ layout v20261022d: essentials on first load (DJ Decks + Video DJ).
 * - Quick bar under the top bar: AUTO DJ · TALK · FREESTYLE · FX/EQ · Pads · Library · My Freestyles · ⋯ More (all mirror the real controls)
 * - Compact playlist in the centre column (under the mixer; portrait: between the deck stack and the mixer)
 * - Rare stuff (booth banner, YouTube link, recording format, keyboard help) lives in one "⋯ More" panel. */
(function () {
  "use strict";
  var P = window.PFDJ; if (!P) return;
  var $ = function (id) { return document.getElementById(id); };
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function go(target) { var t = typeof target === "string" ? document.querySelector(target) : target; if (t) t.scrollIntoView({ behavior: "smooth", block: "start" }); }

  /* ---------- quick bar ---------- */
  var top = document.querySelector(".topbar"), qb = el("nav", "quickbar");
  qb.setAttribute("aria-label", "Essentials");
  var B = {};
  function q(id, label, fn, cls) { var b = el("button", "qb " + (cls || ""), label); b.type = "button"; b.id = id; b.onclick = fn; qb.appendChild(b); B[id] = b; return b; }
  q("qb-auto", "AUTO DJ: OFF", function () { var b = $("autodj-btn"); if (b) b.click(); }, "qb-auto");
  q("qb-shuf", "🔀 SHUFFLE: OFF", function () { var ad = AD(); if (ad && ad.setShuffle) { ad.setShuffle(!ad.A.shuffle); mirror(); } }, "qb-shuf");
  q("qb-talk", "🎤 TALK", function () { var b = $("talk-btn"); if (b) b.click(); }, "qb-talk");
  if ($("fs-go")) q("qb-fs", "🔥 FREESTYLE", function () { $("fs-go").click(); go("#freestyle"); }, "qb-fs");
  q("qb-fx", "🎛 FX / EQ", function () { go("#mixer"); });
  if ($("sampler")) q("qb-pads", "🥁 Pads", function () { var F = window.PFDJ_PADSFLOAT; if (F && F.isOpen()) { var pf = $("pads-float"); if (pf) { pf.classList.remove("collapsed"); pf.scrollIntoView && pf.querySelector(".pf-body").scrollTo(0, 0); } return; } go("#sampler"); });
  q("qb-lib", "📚 Library", function () { go(".lib-tabs"); });
  q("qb-recs", "📁 My Recordings", function () { go("#my-recs"); });
  q("qb-more", "⋯ More", function () { var m = $("more"); m.hidden = !m.hidden; B["qb-more"].classList.toggle("on", !m.hidden); if (!m.hidden) go(m); });
  if (top && top.parentNode) top.parentNode.insertBefore(qb, top.nextSibling);

  /* ---------- More panel (rarely used) ---------- */
  var more = el("section", "more-panel"); more.id = "more"; more.hidden = true; more.setAttribute("aria-label", "More settings");
  more.innerHTML = '<div class="more-head"><h2>⋯ More</h2><span class="muted">Less-used settings. Everything you need to mix is on the main screen.</span><button type="button" class="btn small" id="more-x">✕ Close</button></div><div class="more-body" id="more-body"></div>';
  qb.parentNode.insertBefore(more, qb.nextSibling);
  $("more-x").onclick = function () { more.hidden = true; B["qb-more"].classList.remove("on"); };
  var mb = $("more-body");
  var booth = document.querySelector(".booth"); if (booth) mb.appendChild(booth);
  var fmt = $("rec-fmt"); if (fmt) { var w = el("label", "more-item", "Recording format "); w.appendChild(fmt); mb.appendChild(w); }
  document.querySelectorAll(".sampler > .lib-note").forEach(function (n) { mb.appendChild(n); });
  var st = $("audio-state"); if (st) { st.classList.add("more-item"); mb.appendChild(st); }

  /* ---------- compact playlist (centre column) ---------- */
  var con = document.querySelector(".console"), pl = el("section", "pl-mini"); pl.id = "pl-mini"; pl.setAttribute("aria-label", "Playlist");
  pl.innerHTML = '<div class="pl-head"><b>Playlist</b><span class="pl-next mono" id="pl-next"></span></div><ol class="pl-list" id="pl-list"></ol>';
  if (con) con.appendChild(pl); else document.body.appendChild(pl);
  var AD = function () { return window.PFAUTODJ; };
  var sig = "", dragI = -1;
  function nowName(d) { return d && d.buf ? d.name : ""; }
  function render() {
    var ad = AD(), Q = ad ? ad.A.queue : [], A = ad ? ad.A : {};
    var cur = A.cur ? nowName(A.cur) : P.DECKS.filter(function (d) { return d.playing; }).map(nowName)[0] || "";
    var next = A.nextItem ? A.nextItem.name : (Q[0] ? Q[0].name : "");
    var s = JSON.stringify([Q.map(function (x) { return x.key || x.name; }), cur, next, A.on]);
    if (s === sig) return; sig = s;
    $("pl-next").textContent = A.on ? (next ? "Auto DJ next: " + next : "Auto DJ: picking from the crate") : "";
    var list = $("pl-list"); list.innerHTML = "";
    var rows = [];
    if (cur) rows.push({ name: cur, cur: true });
    if (A.nextItem && A.nextItem.name !== cur) rows.push({ name: A.nextItem.name, next: true, item: A.nextItem });
    Q.forEach(function (it, i) { rows.push({ name: it.name, item: it, qi: i, next: !A.nextItem && i === 0 }); });
    if (!rows.length) { list.innerHTML = '<li class="pl-empty">Empty — tap “+ Auto DJ” in the Library, or turn AUTO DJ on and it picks from the crate.</li>'; return; }
    rows.forEach(function (r) {
      var li = el("li", "pl-row" + (r.cur ? " cur" : "") + (r.next ? " next" : ""));
      li.innerHTML = '<span class="pl-tag">' + (r.cur ? "▶ NOW" : r.next ? "NEXT" : "") + '</span><span class="pl-name"></span><span class="pl-acts"></span>';
      li.querySelector(".pl-name").textContent = r.name;
      var acts = li.querySelector(".pl-acts");
      function btn(t, lab, fn) { var b = el("button", "pl-b", t); b.type = "button"; b.setAttribute("aria-label", lab); b.onclick = fn; acts.appendChild(b); }
      if (r.item) { btn("A", "Load to deck A", function () { P.loadInto(P.DECKS[0], r.item); }); btn("B", "Load to deck B", function () { P.loadInto(P.DECKS[1], r.item); }); }
      if (r.qi != null) {
        btn("↑", "Move up", function () { if (r.qi > 0) { Q.splice(r.qi - 1, 0, Q.splice(r.qi, 1)[0]); sig = ""; render(); } });
        btn("↓", "Move down", function () { if (r.qi < Q.length - 1) { Q.splice(r.qi + 1, 0, Q.splice(r.qi, 1)[0]); sig = ""; render(); } });
        li.draggable = true;
        li.addEventListener("dragstart", function () { dragI = r.qi; });
        li.addEventListener("dragover", function (e) { e.preventDefault(); });
        li.addEventListener("drop", function (e) { e.preventDefault(); if (dragI < 0 || dragI === r.qi) return; Q.splice(r.qi, 0, Q.splice(dragI, 1)[0]); dragI = -1; sig = ""; render(); });
      }
      list.appendChild(li);
    });
  }
  setInterval(render, 700); render();

  /* ---------- mirror states ---------- */
  function mirror() {
    var ad = AD(), on = ad && ad.A.on; B["qb-auto"].textContent = on ? "AUTO DJ: ON ●" : "AUTO DJ: OFF"; B["qb-auto"].classList.toggle("on", !!on);
    var t = $("talk-btn"), s = t ? t.dataset.state : "off"; B["qb-talk"].textContent = { off: "🎤 TALK", live: "● LIVE MIC", muted: "MIC MUTED", blocked: "MIC BLOCKED" }[s] || "🎤 TALK"; B["qb-talk"].classList.toggle("on", s === "live");
    if (B["qb-fs"]) { var f = window.PFFREESTYLE && window.PFFREESTYLE.on; B["qb-fs"].textContent = f ? "● FREESTYLE LIVE" : "🔥 FREESTYLE"; B["qb-fs"].classList.toggle("on", !!f); }
    var sa = ad && ad.A.shuffle; B["qb-shuf"].textContent = sa ? "🔀 SHUFFLE: ON" : "🔀 SHUFFLE: OFF"; B["qb-shuf"].classList.toggle("on", !!sa);
    /* v20261022f: the one-tap TALK button gets its own spot in the quick bar instead of floating over the decks */
    var dock = document.querySelector(".talk-dock"); if (dock && dock.parentNode !== qb) { qb.insertBefore(dock, B["qb-talk"]); dock.classList.add("in-qb"); B["qb-talk"].hidden = true; }
  }
  /* v20261022g: page padding follows the real crossfader-bar height (used by the phone-landscape CSS) */
  function xfh() { var x = document.querySelector(".xfbar"); if (x) document.documentElement.style.setProperty("--xfh", x.offsetHeight + "px"); }
  window.addEventListener("resize", xfh); setInterval(xfh, 1000); xfh();
  setInterval(mirror, 400); mirror();
  window.PFLAYOUT = { render: render };
})();
