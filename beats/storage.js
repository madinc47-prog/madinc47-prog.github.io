/* Island Pin Beats: storage report (Sound check card + the "Storage" line next to Start fresh).
 * navigator.storage.estimate() for the whole site + a per-store breakdown measured on demand (IndexedDB stores,
 * Cache API caches, localStorage). Player / DJ / IslePin share this origin: what is left is "Other apps on this site".
 * Read-only, except "Keep Beat data safe" = navigator.storage.persist(). Never creates a database. */
(function () {
  "use strict";
  var MB = 1048576;
  var LABEL = { islandpinbeats: "Beat · Vault (takes, bounces, songs) + custom pads", "islandpinbeats-ref": "Beat · reference track", ipbstudio: "Studio · projects + takes",
    "ipb-library-v1": "Beat · instrument sounds (library cache)" };
  var OURS_DB = /^(islandpinbeats|ipbstudio)/, OURS_CACHE = /^ipb-/;
  function sizeOf(v, seen) {
    if (v == null) return 0;
    if (typeof v === "string") return v.length * 2;
    if (typeof v === "number" || typeof v === "boolean") return 8;
    if (typeof Blob !== "undefined" && v instanceof Blob) return v.size;
    if (v instanceof ArrayBuffer) return v.byteLength;
    if (ArrayBuffer.isView(v)) return v.byteLength;
    seen = seen || []; if (seen.indexOf(v) !== -1) return 0; seen.push(v);
    var n = 0;
    if (Array.isArray(v)) { for (var i = 0; i < v.length; i++) n += sizeOf(v[i], seen); return n + 8; }
    for (var k in v) if (Object.prototype.hasOwnProperty.call(v, k)) n += k.length * 2 + sizeOf(v[k], seen);
    return n;
  }
  function dbSize(name) {
    return new Promise(function (res) {
      var r; try { r = indexedDB.open(name); } catch (e) { res(null); return; }
      r.onerror = function () { res(null); };
      r.onupgradeneeded = function () { try { r.transaction.abort(); } catch (e) { /* new db: abort so nothing is created */ } };
      r.onsuccess = function () {
        var d = r.result, stores = [].slice.call(d.objectStoreNames), out = { total: 0, stores: {} }, left = stores.length;
        if (!left) { d.close(); res(out); return; }
        var tx; try { tx = d.transaction(stores, "readonly"); } catch (e) { d.close(); res(out); return; }
        stores.forEach(function (s) {
          var n = 0, cnt = 0, cur = tx.objectStore(s).openCursor();
          cur.onsuccess = function () { var c = cur.result; if (c) { n += sizeOf(c.value); cnt++; c.continue(); } else { out.stores[s] = { bytes: n, count: cnt }; out.total += n; if (--left === 0) { d.close(); res(out); } } };
          cur.onerror = function () { if (--left === 0) { d.close(); res(out); } };
        });
      };
    });
  }
  function cacheSize(name) {
    return caches.open(name).then(function (c) { return c.keys().then(function (reqs) {
      return Promise.all(reqs.map(function (q) { return c.match(q).then(function (r) { if (!r) return 0; var l = +r.headers.get("content-length"); return l > 0 ? l : r.clone().blob().then(function (b) { return b.size; }); }); }))
        .then(function (a) { return { bytes: a.reduce(function (x, y) { return x + y; }, 0), count: reqs.length }; });
    }); }).catch(function () { return { bytes: 0, count: 0 }; });
  }
  function lsSize() { var n = 0, ours = 0; try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i), v = localStorage.getItem(k) || "", b = (k.length + v.length) * 2; n += b; if (/^ipb/.test(k)) ours += b; } } catch (e) { /* blocked */ } return { all: n, ours: ours }; }
  function estimate() { return navigator.storage && navigator.storage.estimate ? navigator.storage.estimate().catch(function () { return {}; }) : Promise.resolve({}); }
  function persisted() { return navigator.storage && navigator.storage.persisted ? navigator.storage.persisted().catch(function () { return false; }) : Promise.resolve(false); }
  function report() {
    var dbList = indexedDB.databases ? indexedDB.databases().then(function (l) { return l.map(function (d) { return d.name; }); }).catch(function () { return Object.keys(LABEL).filter(function (n) { return n.indexOf("-v1") === -1; }); })
      : Promise.resolve(["islandpinbeats", "islandpinbeats-ref", "ipbstudio"]);
    return Promise.all([estimate(), persisted(), dbList, window.caches ? caches.keys() : Promise.resolve([])]).then(function (a) {
      var est = a[0] || {}, names = a[2].filter(Boolean), cnames = a[3];
      return Promise.all([Promise.all(names.map(function (n) { return dbSize(n).then(function (s) { return { kind: "db", name: n, s: s }; }); })),
        Promise.all(cnames.map(function (n) { return cacheSize(n).then(function (s) { return { kind: "cache", name: n, s: s }; }); }))]).then(function (b) {
        var rows = [], ours = 0;
        b[0].forEach(function (x) { if (!x.s || !OURS_DB.test(x.name)) return; ours += x.s.total; rows.push({ name: LABEL[x.name] || x.name, bytes: x.s.total, detail: Object.keys(x.s.stores).map(function (k) { return k + " " + x.s.stores[k].count; }).join(", ") }); });
        b[1].forEach(function (x) { if (!OURS_CACHE.test(x.name)) return; ours += x.s.bytes; rows.push({ name: LABEL[x.name] || (/app|shell|offline/.test(x.name) ? "Beat · offline app (" + x.name + ")" : "Beat · cache " + x.name), bytes: x.s.bytes, detail: x.s.count + " files" }); });
        var ls = lsSize(); ours += ls.ours; rows.push({ name: "Beat · settings (localStorage)", bytes: ls.ours, detail: "" });
        var used = Math.max(est.usage || 0, ours), quota = est.quota || 0; // the estimate lags behind and leaves out localStorage
        return { used: used, quota: quota, persisted: !!a[1], rows: rows, ours: ours, other: Math.max(0, used - ours) };
      });
    });
  }
  function mb(b) { return (b / MB).toFixed(b < 10 * MB ? 2 : 1) + " MB"; }
  function pct(b, of) { return of ? (b / of * 100).toFixed(b / of < 0.01 ? 2 : 1) + "%" : "—"; }
  function text(r) {
    var L = ["Storage (this site, this device)", "Used " + mb(r.used) + " of " + mb(r.quota) + " available (" + pct(r.used, r.quota) + ")" + (r.persisted ? " · kept safe (persistent)" : " · not persistent (Chrome may clear it when the device is low on space)")];
    r.rows.forEach(function (x) { L.push("  " + x.name + ": " + mb(x.bytes) + " (" + pct(x.bytes, r.used) + " of used)" + (x.detail ? " · " + x.detail : "")); });
    L.push("  Other apps on this site (Player / DJ / IslePin): " + mb(r.other) + " (" + pct(r.other, r.used) + " of used)");
    return L.join("\n");
  }
  function line() { return estimate().then(function (e) { return e && e.usage != null ? "Storage " + mb(e.usage) + (e.quota ? " · " + pct(e.usage, e.quota) : "") : ""; }); }
  function persist() { return navigator.storage && navigator.storage.persist ? navigator.storage.persist().catch(function () { return false; }) : Promise.resolve(false); }
  window.IPBStorage = { report: report, text: text, line: line, persist: persist, mb: mb, pct: pct };
})();
