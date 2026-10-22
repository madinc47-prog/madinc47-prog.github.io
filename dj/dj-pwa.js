/* DJ PWA: register the /dj/ service worker + an "📲 Install app" quick-bar button when Chrome offers it. */
(function () {
  "use strict";
  if ("serviceWorker" in navigator) window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js", { scope: "./" }).catch(function () { /* ignore */ }); });
  var ev = null;
  function btn() {
    var b = document.getElementById("qb-install"); if (b) return b;
    var qb = document.querySelector(".quickbar"); if (!qb) return null;
    b = document.createElement("button"); b.type = "button"; b.id = "qb-install"; b.className = "qb"; b.textContent = "📲 Install app"; b.hidden = true;
    b.onclick = function () { if (!ev) return; ev.prompt(); ev.userChoice.finally(function () { ev = null; b.hidden = true; }); };
    qb.appendChild(b); return b;
  }
  window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); ev = e; var t = setInterval(function () { var b = btn(); if (b) { b.hidden = false; clearInterval(t); } }, 300); });
  window.addEventListener("appinstalled", function () { var b = document.getElementById("qb-install"); if (b) b.hidden = true; });
})();
