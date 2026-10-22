/* DJ Pads floating panel v20261022s: a "🎹 Pads" button next to REC opens the sampler in a fixed panel docked
 * under the waveforms, so pads stay under your fingers while the decks play. The real #sampler is MOVED into the
 * panel (never copied) and put back where it was on close. Only the panel takes touches; decks stay usable around it. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var smp = $("sampler"); if (!smp) return;
  var KEY = "pfdj_padsfloat";
  var mark = document.createComment("pads-float-home"); smp.parentNode.insertBefore(mark, smp);

  var css = document.createElement("style");
  css.textContent =
    "#pads-float-btn{min-height:56px;min-width:56px;padding:0 14px;margin-left:6px;border-radius:12px;border:1px solid #3a4459;background:#1b2130;color:#fff;font:600 15px system-ui,sans-serif;cursor:pointer;touch-action:manipulation}" +
    "#pads-float-btn.on{background:#7a2bd8;border-color:#a76bff}" +
    "#pads-float{position:fixed;left:8px;right:8px;z-index:900;max-height:50vh;display:flex;flex-direction:column;background:rgba(14,17,26,.97);border:1px solid #3a4459;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.6);overflow:hidden;touch-action:none}" +
    "#pads-float[hidden]{display:none}" +
    "#pads-float .pf-bar{display:flex;align-items:center;gap:8px;padding:6px 10px;background:#1b2130;cursor:grab;user-select:none;touch-action:none;flex:0 0 auto}" +
    "#pads-float .pf-bar strong{flex:1;font:600 14px system-ui,sans-serif;color:#fff}" +
    "#pads-float .pf-grip{width:44px;height:6px;border-radius:3px;background:#55607a}" +
    "#pads-float .pf-bar button{min-width:48px;min-height:44px;border-radius:10px;border:1px solid #3a4459;background:#262e41;color:#fff;font-size:16px;cursor:pointer}" +
    "#pads-float .pf-body{overflow:auto;padding:6px 8px 10px;touch-action:pan-y;flex:1 1 auto}" +
    "#pads-float.collapsed .pf-body{display:none}" +
    "#pads-float .sampler{margin:0;width:auto;max-width:none;border:0;box-shadow:none;background:transparent;padding:0}" +
    "#pads-float .smp-grid .pad{touch-action:none;min-width:0;aspect-ratio:auto;min-height:56px}" +
    "@media (min-width:700px){#pads-float .smp-grid{grid-template-columns:repeat(8,minmax(0,1fr))}}" +
    "@media (max-width:699px){#pads-float .smp-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}";
  document.head.appendChild(css);

  var panel = document.createElement("section"); panel.id = "pads-float"; panel.hidden = true;
  panel.setAttribute("aria-label", "Pads (floating)");
  panel.innerHTML = '<div class="pf-bar" id="pf-bar"><span class="pf-grip" aria-hidden="true"></span><strong>🎹 Pads</strong>' +
    '<button type="button" id="pf-col" title="Collapse / expand" aria-label="Collapse pads">▾</button>' +
    '<button type="button" id="pf-x" title="Close (pads go back to the page)" aria-label="Close pads">✕</button></div><div class="pf-body" id="pf-body"></div>';
  document.body.appendChild(panel);
  var body = $("pf-body"), dragY = null;

  function dockTop() { var w = document.querySelector(".waves"); var r = w ? w.getBoundingClientRect() : null; return Math.max(8, r ? Math.min(r.bottom + 4, window.innerHeight * 0.5) : 70); }
  function place(y) { var max = Math.max(8, window.innerHeight - 60); panel.style.top = Math.min(Math.max(8, y), max) + "px"; }

  var btn = document.createElement("button"); btn.type = "button"; btn.id = "pads-float-btn"; btn.textContent = "🎹 Pads";
  btn.title = "Floating pads: play the sampler on top of the decks";
  function anchor() { return $("nohp-rec") || $("rec"); }
  function mountBtn() { var a = anchor(); if (a && a.parentNode && a.nextSibling !== btn) a.parentNode.insertBefore(btn, a.nextSibling); }
  mountBtn(); setTimeout(mountBtn, 400); setTimeout(mountBtn, 1500);

  function isOpen() { return !panel.hidden; }
  function open() {
    if (isOpen()) return;
    body.appendChild(smp); panel.hidden = false; panel.classList.remove("collapsed");
    if (!panel.style.top) place(dockTop());
    btn.classList.add("on"); try { sessionStorage.setItem(KEY, "1"); } catch (e) {}
  }
  function close() {
    if (!isOpen()) return;
    mark.parentNode.insertBefore(smp, mark.nextSibling); panel.hidden = true;
    btn.classList.remove("on"); try { sessionStorage.removeItem(KEY); } catch (e) {}
  }
  btn.onclick = function () { isOpen() ? close() : open(); };
  $("pf-x").onclick = close;
  $("pf-col").onclick = function () { var c = panel.classList.toggle("collapsed"); this.textContent = c ? "▴" : "▾"; this.setAttribute("aria-label", c ? "Expand pads" : "Collapse pads"); };

  var bar = $("pf-bar");
  bar.addEventListener("pointerdown", function (e) {
    if (e.target.closest("button")) return;
    e.preventDefault(); dragY = e.clientY - panel.getBoundingClientRect().top;
    try { bar.setPointerCapture(e.pointerId); } catch (er) {}
  });
  bar.addEventListener("pointermove", function (e) { if (dragY != null) place(e.clientY - dragY); });
  function end() { dragY = null; }
  bar.addEventListener("pointerup", end); bar.addEventListener("pointercancel", end);
  window.addEventListener("resize", function () { if (isOpen()) place(parseFloat(panel.style.top) || dockTop()); });

  window.PFDJ_PADSFLOAT = { open: open, close: close, isOpen: isOpen };
  try { if (sessionStorage.getItem(KEY) === "1") open(); } catch (e) {}
})();
