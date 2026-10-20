/* Island Beats Hub: device preferences (⚙ Settings → settings.html). Key ipb_ui_v1 = { padSize, accent, askAi }.
   Applied on every page before paint; no recording/RAW code is touched. */
(function () {
  var p = {}; try { p = JSON.parse(localStorage.getItem("ipb_ui_v1") || "{}") || {}; } catch (e) { p = {}; }
  var r = document.documentElement, css = "";
  if (/^#[0-9a-f]{6}$/i.test(p.accent || "")) css += ":root{--accent:" + p.accent + "}";
  var pad = { s: "64px", m: "", l: "104px", xl: "128px" }[p.padSize || "m"];
  if (pad) css += ".pad{min-height:" + pad + "!important}";
  if (p.askAi === false) css += ".ai-fab{display:none!important}";
  if (css) { var s = document.createElement("style"); s.id = "ipb-prefs"; s.textContent = css; (document.head || r).appendChild(s); }
  window.IPBPrefs = p;
})();
