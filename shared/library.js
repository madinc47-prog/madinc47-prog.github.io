/* PF shared library (v20261023lib) — every app in the suite saves its music/creations into ONE place:
 * DJ Decks › 📁 My Recordings (IndexedDB "pfdj_mixes", same schema as dj/dj-recordings.js).
 * window.PFLIB.add(blob, { name, source, dur, video }) -> Promise<id>. Stays on this device only. */
(function () {
  "use strict";
  if (window.PFLIB) return;
  var DBN = "pfdj_mixes", CH = 8 * 1048576;
  function db() {
    return new Promise(function (res, rej) {
      var r = indexedDB.open(DBN, 1);
      r.onupgradeneeded = function () { var d = r.result; d.createObjectStore("mixes", { keyPath: "id" }); d.createObjectStore("chunks", { autoIncrement: true }).createIndex("mid", "mid"); };
      r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); };
    });
  }
  function stamp(t) { return new Date(t).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); }
  function probe(blob, video) {   /* duration if caller didn't give one */
    return new Promise(function (res) {
      try {
        var el = document.createElement(video ? "video" : "audio"), u = URL.createObjectURL(blob), done = false;
        var fin = function (d) { if (done) return; done = true; URL.revokeObjectURL(u); res(isFinite(d) ? d : 0); };
        el.preload = "metadata"; el.onloadedmetadata = function () { fin(el.duration); }; el.onerror = function () { fin(0); };
        setTimeout(function () { fin(0); }, 4000); el.src = u;
      } catch (e) { res(0); }
    });
  }
  function toast(msg) {
    try {
      var t = document.createElement("div"); t.textContent = msg; t.setAttribute("role", "status");
      t.style.cssText = "position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:99999;background:#1e1b4b;color:#fff;border:1px solid #7c3aed;padding:10px 14px;border-radius:10px;font:14px system-ui;max-width:92vw;box-shadow:0 4px 18px rgba(0,0,0,.5)";
      document.body.appendChild(t); setTimeout(function () { t.remove(); }, 3500);
    } catch (e) { /* ignore */ }
  }
  function add(blob, o) {
    o = o || {};
    if (!blob || !blob.size) return Promise.resolve(null);
    var mime = (blob.type || o.mime || "audio/wav").split(";")[0], video = o.video != null ? !!o.video : /^video\//.test(mime);
    var now = Date.now(), id = "lib_" + now.toString(36) + Math.random().toString(36).slice(2, 6);
    var src = o.source || "App";
    return (o.dur ? Promise.resolve(o.dur) : probe(blob, video)).then(function (dur) {
      var n = Math.max(1, Math.ceil(blob.size / CH));
      var m = { id: id, type: "mix", name: (o.name || src) + " · " + stamp(now), created: now, kind: "file", mime: mime, sr: o.sr || 48000,
        done: true, bytes: blob.size, dur: dur || 0, n: n, src: src };
      if (video) m.video = true;
      return db().then(function (d) {
        return new Promise(function (res, rej) {
          var t = d.transaction(["mixes", "chunks"], "readwrite"), cs = t.objectStore("chunks");
          for (var i = 0; i < n; i++) cs.add({ mid: id, i: i, data: blob.slice(i * CH, (i + 1) * CH, mime) });
          t.objectStore("mixes").put(m);
          t.oncomplete = function () { d.close(); res(id); }; t.onerror = t.onabort = function () { d.close(); rej(t.error); };
        });
      });
    }).then(function (id) {
      if (!o.quiet) toast("Saved to DJ Decks › My Recordings");
      try { if (window.PFREC && window.PFREC.load) window.PFREC.load(); localStorage.setItem("pflib_ping", String(Date.now())); } catch (e) { /* ignore */ }
      return id;
    }).catch(function (e) { toast("Couldn't save to My Recordings (" + (e && e.name || "storage") + ") — download still works"); return null; });
  }
  function safe(fn) { try { return fn(); } catch (e) { return null; } }
  window.PFLIB = { add: add, addLater: function (blob, o) { safe(function () { add(blob, o); }); } };
})();
