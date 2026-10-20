/* Studio tablet layer (Oct 20 2026, Emmanuel's Tab screenshots). Layout only + resume-playback; never touches recording/RAW.
   1) Audio input box → one-line summary "🎙 input · mode · Setup ▾" that expands on tap (every control + help stays inside).
   2) Step 1/Step 2 card → thin dismissible strip above the tracks, gone once a clip exists.
   3) Resume: remembers playing + playhead when you leave; on return restores the playhead and resumes play,
      or shows a one-tap "Resume playback from 0:12" if Chrome blocks audio without a tap. Never starts recording. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var KEY = "ipb_studio_resume_v1", HIDE = "ipb_studio_steps_hidden_v1";
  function api() { return window.IPBStudio && window.IPBStudio.ready ? window.IPBStudio : null; }
  function fmt(t) { t = Math.max(0, t || 0); var m = Math.floor(t / 60), s = Math.floor(t % 60); return m + ":" + (s < 10 ? "0" : "") + s; }

  /* 1) audio input summary */
  function wireBai(root) {
    if (root.__tab) return; root.__tab = true;
    var sum = document.createElement("button"); sum.type = "button"; sum.className = "bai-sum"; sum.setAttribute("aria-expanded", "false");
    root.insertBefore(sum, root.firstChild); root.classList.add("bai-collapsed");
    function txt(sel) { var o = sel && sel.options[sel.selectedIndex]; return o ? o.textContent.replace(/\s*\(.*\)$/, "") : ""; }
    function upd() { var open = !root.classList.contains("bai-collapsed"); sum.textContent = "🎙 " + (txt(root.querySelector(".bai-select")) || "Built-in mic") + " · " + (txt(root.querySelector(".bai-mode")) || "Mic") + " · Setup " + (open ? "▴" : "▾"); sum.setAttribute("aria-expanded", open ? "true" : "false"); }
    sum.addEventListener("click", function () { root.classList.toggle("bai-collapsed"); upd(); });
    root.addEventListener("change", upd); setInterval(upd, 2000); upd();
  }
  /* 2) step strip */
  var strip = null;
  function steps() {
    var L = $("lanes"), mt = $("mt"); if (!L || !mt) return;
    var em = L.querySelector(".mt-empty"), hasClip = !!L.querySelector(".clip");
    if (hasClip || localStorage.getItem(HIDE) === "1") { if (em) em.remove(); if (strip) { strip.remove(); strip = null; } return; }
    if (!em) return;
    if (!strip) { strip = document.createElement("div"); strip.className = "st-steps"; strip.setAttribute("role", "note"); mt.parentNode.insertBefore(strip, mt); }
    strip.innerHTML = ""; strip.appendChild(em); em.classList.add("in-strip");
    var x = document.createElement("button"); x.type = "button"; x.className = "st-steps-x"; x.setAttribute("aria-label", "Hide these steps"); x.textContent = "✕";
    x.addEventListener("click", function () { try { localStorage.setItem(HIDE, "1"); } catch (e) { /* private */ } steps(); });
    strip.appendChild(x);
  }
  /* 3) resume playback */
  function save() {
    var a = api(); if (!a) return;
    try { var s = a.state(); localStorage.setItem(KEY, JSON.stringify({ id: s.id, playing: !!(s.playing && !s.recording), pos: s.playhead || 0, at: Date.now() })); } catch (e) { /* storage */ }
  }
  function resume() {
    var a = api(), r = null; if (!a) return;
    try { r = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { r = null; }
    window.__ipbResume = r;
    if (!r || (r.id && r.id !== a.state().id) || Date.now() - r.at > 6 * 3600e3) return;
    if (r.pos > 0) a.setPlayhead(r.pos);
    if (!r.playing) return;
    var ok = false; try { var C = window.AudioContext || window.webkitAudioContext, c = new C(); ok = c.state === "running"; c.close(); } catch (e) { ok = false; }
    function go() { var b = $("t-play"), s = a.state(); if (b && !s.playing && !s.recording) b.click(); }
    function prompt() {
      var p = document.createElement("button"); p.type = "button"; p.className = "st-resume btn primary";
    p.textContent = "▶ Resume playback from " + fmt(r.pos);
    p.addEventListener("click", function () { p.remove(); a.setPlayhead(r.pos); go(); });
    document.body.appendChild(p);
    setTimeout(function () { if (p.parentNode) p.remove(); }, 60000);
    }
    if (!ok) { prompt(); return; }
    go(); // allowed: start, then confirm it really plays (Chrome may still hold audio until a tap)
    setTimeout(function () { var s = a.state(); if (!s.playing && !s.recording) prompt(); }, 900);
  }
  function boot(n) {
    var a = api();
    document.querySelectorAll(".bai-panel").forEach(wireBai);
    if (!a) { if (n < 400) setTimeout(function () { boot(n + 1); }, 50); return; }
    var L = $("lanes"); if (L) new MutationObserver(steps).observe(L, { childList: true }); steps();
    try { resume(); } catch (e) { window.__ipbResumeErr = String(e); }
    setInterval(save, 1000); addEventListener("pagehide", save); document.addEventListener("visibilitychange", save);
    setTimeout(function () { document.querySelectorAll(".bai-panel").forEach(wireBai); }, 1500);
  }
  boot(0);
})();
