/* Island Pin Beats — "Start fresh": deletes everything Beats + Studio saved on this device, like a brand-new install.
 * Opened with /beats/?fresh=1 (the in-app "Start fresh" button goes there). In that mode app.js does not start at all
 * (nothing opens the databases), a confirm dialog is shown, and only on "Delete" is the data removed.
 * Removed:  localStorage / sessionStorage keys "ipb_*", "ipbs_*", "ipb.*" (Beats + Studio; NOT the DJ's "ipb_dj*"),
 *           IndexedDB "islandpinbeats" (Vault: takes, bounces, recordings, uploaded pads / instrumental),
 *           "islandpinbeats-ref" (reference track), "ipbstudio" (Studio projects + their audio).
 * Kept:     the instrument-library download cache (Cache API "ipb-library-v1"), and everything other apps own on this
 *           origin: Player / DJ ("islepin-media", "islepin-samples", "ipb_dj*"), IslePin, Isle Voice, Afterglow. */
(function () {
  "use strict";
  var DBS = ["islandpinbeats", "islandpinbeats-ref", "ipbstudio"];
  var KEEP_CACHE = /^ipb-library/;
  function ownKey(k) { return /^(ipb_|ipbs_|ipb\.)/.test(k) && !/^ipb_dj/.test(k); }
  function delDb(name) {
    return new Promise(function (res) {
      var done = false, fin = function (r) { if (!done) { done = true; res(r); } };
      try {
        var q = indexedDB.deleteDatabase(name);
        q.onsuccess = function () { fin("deleted"); }; q.onerror = function () { fin("error"); };
        q.onblocked = function () { setTimeout(function () { fin("blocked"); }, 4000); };
      } catch (e) { fin("error"); }
    });
  }
  function wipe() {
    var gone = { keys: [] };
    [localStorage, sessionStorage].forEach(function (st) {
      try { var ks = []; for (var i = 0; i < st.length; i++) ks.push(st.key(i)); ks.filter(ownKey).forEach(function (k) { st.removeItem(k); gone.keys.push(k); }); } catch (e) { /* storage blocked */ }
    });
    var cp = window.caches ? caches.keys().then(function (names) {
      return Promise.all(names.filter(function (n) { return /^ipb/.test(n) && !KEEP_CACHE.test(n); }).map(function (n) { return caches.delete(n); }));
    }).catch(function () {}) : Promise.resolve();
    return Promise.all(DBS.map(delDb).concat([cp])).then(function (r) { gone.dbs = r.slice(0, DBS.length); return gone; });
  }
  var MSG = "Delete all vocal takes, recordings, songs, patterns, mixer/FX settings and saved Beat data on this device? This can't be undone.";
  function dialog() {
    var d = document.createElement("div"); d.id = "fresh-dlg"; d.className = "fresh-dlg"; d.setAttribute("role", "alertdialog"); d.setAttribute("aria-modal", "true"); d.setAttribute("aria-labelledby", "fresh-t");
    d.innerHTML = '<div class="fresh-box"><h2 id="fresh-t">Start fresh</h2><p>' + MSG + '</p>' +
      '<p class="fresh-keep">Kept: the instrument sounds you already downloaded, and the Player, DJ booth and other apps.</p>' +
      '<div class="fresh-btns"><button type="button" class="btn" id="fresh-cancel">Cancel</button><button type="button" class="btn danger" id="fresh-go">Delete</button></div>' +
      '<p class="fresh-status" id="fresh-status" role="status"></p></div>';
    document.body.appendChild(d);
    var go = d.querySelector("#fresh-go"), st = d.querySelector("#fresh-status");
    d.querySelector("#fresh-cancel").addEventListener("click", function () { location.replace(location.pathname); });
    go.addEventListener("click", function () {
      go.disabled = true; d.querySelector("#fresh-cancel").disabled = true; st.textContent = "Deleting…";
      wipe().then(function (g) {
        window.__ipbFreshResult = g;
        st.textContent = "Done. Starting Beats like new…";
        setTimeout(function () { location.replace(location.pathname + "?fresh=done"); }, 600);
      });
    });
    setTimeout(function () { d.querySelector("#fresh-cancel").focus(); }, 0);
  }
  var q = location.search;
  if (/[?&]fresh=1\b/.test(q)) {
    window.IPB_FRESH_MODE = true; // app.js checks this and stays off
    if (document.body) dialog(); else document.addEventListener("DOMContentLoaded", dialog);
  } else if (/[?&]fresh=done\b/.test(q)) {
    window.IPB_FRESH_DONE = true;
    try { history.replaceState(null, "", location.pathname); } catch (e) { /* ignore */ }
    var note = function () { var n = document.createElement("div"); n.className = "fresh-done"; n.setAttribute("role", "status"); n.textContent = "Started fresh: all Beats data on this device was deleted."; document.body.appendChild(n); setTimeout(function () { n.remove(); }, 5000); };
    if (document.body) note(); else document.addEventListener("DOMContentLoaded", note);
  }
  window.IPBFresh = { wipe: wipe, ownKey: ownKey, DBS: DBS, url: "?fresh=1" };
})();
