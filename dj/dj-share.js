/* DJ Psycho Fingers — SHARE (v20261022w). The top Share button shares the latest MP3 mix as a FILE (WhatsApp etc.) with
 * navigator.share({files}) called right inside the tap (file prepared beforehand so the gesture isn't lost).
 * Fallbacks: no file sharing → share the link (shared/share.js panel/sheet) and download the MP3. */
(function () {
  "use strict";
  var P = window.PFDJ; if (!P) return;
  var TITLE = "DJ Psycho Fingers mix";
  function canFiles(f) { try { return !!(navigator.share && navigator.canShare && navigator.canShare({ files: [f] })); } catch (e) { return false; } }
  function dl(f) { var u = URL.createObjectURL(f), a = document.createElement("a"); a.href = u; a.download = f.name; a.style.display = "none"; document.body.appendChild(a); a.click(); setTimeout(function () { a.remove(); }, 1000); setTimeout(function () { URL.revokeObjectURL(u); }, 60000); }
  function linkShare() { if (window.IslePinShare) return window.IslePinShare.share(); if (navigator.share) return navigator.share({ title: document.title, url: location.href }); }
  function shareFile(f, name) {
    if (canFiles(f)) {
      return navigator.share({ files: [f], title: name || TITLE, text: "Check out my mix — " + (name || TITLE) }).then(function () { P.toast("Shared " + f.name); }, function (e) {
        if (e && e.name === "AbortError") return; P.toast("Couldn't share the file — saving it instead"); dl(f);
      });
    }
    P.toast("This browser can't share files — sharing the link and saving the MP3 (" + f.name + ")");
    dl(f); try { linkShare(); } catch (e) { /* ignore */ }
    return Promise.resolve();
  }
  function latest() {
    var L = window.PFREC ? window.PFREC.list() : [], it = L.filter(function (x) { return x.ext === "mp3" && !/Voice only/.test(x.name); })[0] || L[0];
    return it ? { it: it, f: window.PFREC.files[it.id] } : null;
  }
  function hook(btn) {
    if (!btn || btn._pfShare) return; btn._pfShare = true;
    btn.addEventListener("click", function (e) {
      var l = latest();
      if (!l) return;                                   // nothing recorded yet → normal link share
      e.stopImmediatePropagation(); e.preventDefault();
      if (!l.f) { P.toast("Getting your latest mix ready — tap Share again"); window.PFREC.prep(l.it); return; }
      shareFile(l.f, l.it.name);
    }, true);
    btn.title = "Share your latest mix (MP3) or the link";
  }
  var tries = 0, t = setInterval(function () { var b = window.IslePinShare && window.IslePinShare.button; if (b || ++tries > 40) { clearInterval(t); hook(b); } }, 250);
  window.PFSHARE = { shareFile: shareFile, latest: latest };
})();
