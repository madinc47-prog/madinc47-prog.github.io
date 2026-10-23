/* DJ Psycho Fingers — EXPORT FOLDER (v20261023g). One known place for every DJ download.
 * Desktop Chrome/Edge: pick a folder once (handle kept in IndexedDB "pfdj_export"); every export writes straight into it.
 * Android (Galaxy Tab): browsers can't choose a folder — export opens the Share sheet (send to Files / a folder) or downloads
 * to Downloads. Every file name starts with an editable prefix (default "PsychoFingers - "). Nothing leaves the device. */
(function () {
  "use strict";
  var P = window.PFDJ || {}, toast = function (m) { if (P.toast) P.toast(m); };
  var CAN_DIR = typeof window.showDirectoryPicker === "function";
  var LS = "pfdj_export_cfg", cfg = { mode: CAN_DIR ? "folder" : "download", prefix: "PsychoFingers - " };
  try { var s = JSON.parse(localStorage.getItem(LS) || "null"); if (s) { cfg.mode = s.mode || cfg.mode; if (typeof s.prefix === "string") cfg.prefix = s.prefix; } } catch (e) { /* ignore */ }
  if (!CAN_DIR && cfg.mode === "folder") cfg.mode = "download";
  function saveCfg() { try { localStorage.setItem(LS, JSON.stringify(cfg)); } catch (e) { /* ignore */ } }
  var DIR = null, perm = "prompt";
  function db() { return new Promise(function (res, rej) { var r = indexedDB.open("pfdj_export", 1); r.onupgradeneeded = function () { r.result.createObjectStore("kv"); }; r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; }); }
  function kv(op, v) { return db().then(function (d) { return new Promise(function (res, rej) { var t = d.transaction("kv", op === "get" ? "readonly" : "readwrite"), st = t.objectStore("kv"), q = op === "get" ? st.get("dir") : op === "del" ? st.delete("dir") : st.put(v, "dir"); q.onsuccess = function () { res(q.result); }; q.onerror = function () { rej(q.error); }; }); }); }
  function checkPerm() { if (!DIR || !DIR.queryPermission) return Promise.resolve(perm = "prompt"); return DIR.queryPermission({ mode: "readwrite" }).then(function (p) { perm = p; ui(); return p; }, function () { return perm; }); }
  if (CAN_DIR) kv("get").then(function (h) { if (h) { DIR = h; return checkPerm(); } }).catch(function () { /* ignore */ }).then(ui);

  function clean(n) { return String(n || "").replace(/^(PsychoFingers[_ ]-?\s*|DJ-Psycho-Fingers-)/i, "").replace(/[\\/:*?"<>|]+/g, "").trim(); }
  function name(n) { var b = clean(n) || "DJ mix"; return (cfg.prefix || "") + b; }
  function dl(f, n) { var u = URL.createObjectURL(f), a = document.createElement("a"); a.href = u; a.download = n; a.rel = "noopener"; a.style.display = "none"; document.body.appendChild(a); a.click(); setTimeout(function () { a.remove(); }, 1000); setTimeout(function () { URL.revokeObjectURL(u); }, 60000); }
  function writeDir(blob, n) {
    return DIR.getFileHandle(n, { create: true }).then(function (h) { return h.createWritable(); }).then(function (w) { return w.write(blob).then(function () { return w.close(); }); })
      .then(function () { toast("Saved to “" + DIR.name + "” · " + n); return true; });
  }
  /* export(blob, rawName, opts) — call straight from a tap so permission prompts / share sheets keep the gesture. */
  function exp(blob, raw, o) {
    o = o || {}; var n = name(raw);
    if (cfg.mode === "folder" && DIR) {
      var go = function () { return writeDir(blob, n).catch(function () { toast("Couldn't write to the folder — downloading instead"); dl(blob, n); }); };
      if (perm === "granted") return go();
      if (o.auto) { dl(blob, n); return Promise.resolve(); }   // no tap → can't ask; normal download
      return DIR.requestPermission({ mode: "readwrite" }).then(function (p) { perm = p; ui(); if (p === "granted") return go(); toast("Folder access not allowed — downloading instead"); dl(blob, n); }, function () { dl(blob, n); });
    }
    if (cfg.mode === "share" && !o.auto) {
      var f = new File([blob], n, { type: blob.type || "application/octet-stream" }), ok = false;
      try { ok = !!(navigator.share && navigator.canShare && navigator.canShare({ files: [f] })); } catch (e) { /* ignore */ }
      if (ok) return navigator.share({ files: [f], title: n }).then(function () { toast("Sent " + n); }, function (e) { if (e && e.name === "AbortError") return; toast("Share didn't work — downloading instead"); dl(blob, n); });
      toast("This browser can't share files — downloading instead");
    }
    dl(blob, n); if (!o.auto) toast("Downloading " + n + " (look in Downloads)");
    return Promise.resolve();
  }
  /* auto copy after a recording finishes (no tap): only when a folder is set and already allowed */
  function autoCopy(blob, raw) { if (cfg.mode === "folder" && DIR && perm === "granted") return writeDir(blob, name(raw)).catch(function () { /* ignore */ }); return null; }

  function pick() {
    return window.showDirectoryPicker({ id: "pfdj-export", mode: "readwrite", startIn: "music" }).then(function (d) {
      DIR = d; perm = "granted"; cfg.mode = "folder"; saveCfg(); kv("put", d).catch(function () { /* ignore */ }); ui(); toast("Exports will save to “" + d.name + "”");
    }, function () { /* cancelled */ });
  }
  function clear() { DIR = null; perm = "prompt"; kv("del").catch(function () { /* ignore */ }); ui(); toast("Export folder cleared — exports download normally"); }

  /* ---------- settings panel ---------- */
  var panels = [];
  function panel() {
    var w = document.createElement("div"); w.className = "pfx-panel";
    w.innerHTML = '<div class="pfx-row"><strong>📁 Export folder</strong> <span class="pfx-where mono"></span></div>' +
      (CAN_DIR ? '<div class="pfx-row"><button type="button" class="btn small pfx-pick">Choose folder</button><button type="button" class="btn small pfx-allow" hidden>Allow access again</button><button type="button" class="btn small pfx-clear">Clear</button></div>'
        : '<p class="pfx-note">Android browsers can\'t choose a save folder. Pick what Export does:</p>') +
      '<div class="pfx-row pfx-modes">' + (CAN_DIR ? '<label><input type="radio" name="pfxm" value="folder"> Save into my folder</label>' : '') +
      '<label><input type="radio" name="pfxm" value="share"> Share sheet (send to Files / a folder)</label><label><input type="radio" name="pfxm" value="download"> Normal download (Downloads)</label></div>' +
      '<div class="pfx-row"><label>File names start with <input type="text" class="pfx-prefix" maxlength="40" aria-label="File name prefix"></label></div>';
    w.querySelectorAll("input[name=pfxm]").forEach(function (r) { r.name = "pfxm" + panels.length; r.onchange = function () { if (r.checked) { cfg.mode = r.value; saveCfg(); if (r.value === "folder" && !DIR) pick(); ui(); } }; });
    var pf = w.querySelector(".pfx-prefix"); pf.onchange = function () { cfg.prefix = pf.value.replace(/[\\/:*?"<>|]+/g, ""); saveCfg(); ui(); toast("Files will be named “" + name("mix.mp3") + "”"); };
    if (CAN_DIR) {
      w.querySelector(".pfx-pick").onclick = pick; w.querySelector(".pfx-clear").onclick = clear;
      w.querySelector(".pfx-allow").onclick = function () { DIR.requestPermission({ mode: "readwrite" }).then(function (p) { perm = p; ui(); }); };
    }
    panels.push(w); ui(); return w;
  }
  function where() {
    if (cfg.mode === "folder" && DIR) return "→ “" + DIR.name + "”" + (perm === "granted" ? "" : " (tap Export once to allow access)");
    if (cfg.mode === "share") return "→ Share sheet · fallback Downloads";
    return "→ Downloads";
  }
  function ui() {
    panels.forEach(function (w) {
      w.querySelector(".pfx-where").textContent = where() + " · e.g. " + name("mix.mp3");
      w.querySelectorAll("input[type=radio]").forEach(function (r) { r.checked = r.value === cfg.mode; });
      var pf = w.querySelector(".pfx-prefix"); if (document.activeElement !== pf) pf.value = cfg.prefix;
      var pk = w.querySelector(".pfx-pick"); if (pk) pk.textContent = DIR ? "Change folder" : "Choose folder";
      var cl = w.querySelector(".pfx-clear"); if (cl) cl.hidden = !DIR;
      var al = w.querySelector(".pfx-allow"); if (al) al.hidden = !(DIR && perm !== "granted");
    });
    var b = document.getElementById("recs-exp-btn"); if (b) b.textContent = "📁 Export folder " + (cfg.mode === "folder" && DIR ? "· " + DIR.name : cfg.mode === "share" ? "· Share" : "· Downloads");
  }
  function mount() {
    var rec = document.getElementById("my-recs");
    if (rec && !document.getElementById("recs-exp-btn")) {
      var bar = rec.querySelector(".recs-filter"), b = document.createElement("button"); b.type = "button"; b.id = "recs-exp-btn"; b.className = "btn small";
      var all = document.createElement("button"); all.type = "button"; all.className = "btn small"; all.id = "recs-exp-all"; all.textContent = "⇩ Export all";
      var p = panel(); p.hidden = true; p.id = "recs-exp-panel";
      b.onclick = function () { p.hidden = !p.hidden; };
      all.onclick = exportAll;
      bar.appendChild(b); bar.appendChild(all); bar.parentNode.insertBefore(p, bar.nextSibling); ui();
    }
    var mb = document.getElementById("more-body");
    if (mb && !mb.querySelector(".pfx-panel")) mb.insertBefore(panel(), mb.firstChild);
  }
  /* Export all: folder mode writes every file; share mode shares them in one sheet; download mode downloads one by one */
  function exportAll() {
    var R = window.PFREC; if (!R) return; var L = R.list(); if (!L.length) { toast("Nothing to export yet"); return; }
    if (cfg.mode === "folder" && DIR) {
      var run = function () { toast("Exporting " + L.length + " files to “" + DIR.name + "”…"); return L.reduce(function (pr, it) { return pr.then(function () { return R.prep(it); }).then(function (f) { return writeDir(f, name(f.name)); }).catch(function () { /* skip */ }); }, Promise.resolve()).then(function () { toast("Export all done → “" + DIR.name + "”"); }); };
      if (perm === "granted") return run();
      return DIR.requestPermission({ mode: "readwrite" }).then(function (p) { perm = p; ui(); if (p === "granted") run(); });
    }
    var ready = L.map(function (it) { return R.files[it.id]; });
    if (ready.some(function (f) { return !f; })) { toast("Getting " + L.length + " files ready — tap Export all again"); L.forEach(function (it) { R.prep(it); }); return; }
    if (cfg.mode === "share") {
      var fs = ready.map(function (f) { return new File([f], name(f.name), { type: f.type }); }), ok = false;
      try { ok = !!(navigator.share && navigator.canShare && navigator.canShare({ files: fs })); } catch (e) { /* ignore */ }
      if (ok) { navigator.share({ files: fs, title: "PsychoFingers exports" }).catch(function () { /* ignore */ }); return; }
    }
    ready.forEach(function (f, i) { setTimeout(function () { dl(f, name(f.name)); }, i * 400); });
    toast("Downloading " + ready.length + " files to Downloads");
  }
  /* library rows' "Download WAV/MP3" links: rename with the prefix; in folder mode write into the folder instead */
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest(".lib-acts a[download]"); if (!a) return;
    a.download = name(a.download);
    if (cfg.mode === "folder" && DIR) { e.preventDefault(); fetch(a.href).then(function (r) { return r.blob(); }).then(function (b) { exp(b, a.download); }); }
  }, true);
  var st = document.createElement("style");
  st.textContent = ".pfx-panel{border:1px solid #7c3aed;border-radius:12px;padding:8px 10px;margin:6px 0;display:flex;flex-direction:column;gap:6px}.pfx-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.pfx-modes label{display:inline-flex;gap:4px;align-items:center;min-height:36px}.pfx-note{margin:0;color:#fbbf24;font-size:13px}.pfx-prefix{min-height:32px;width:min(220px,60vw)}.pfx-where{font-size:12px;word-break:break-all}";
  document.head.appendChild(st);
  mount(); setTimeout(mount, 1500);
  window.PFEXPORT = { export: exp, autoCopy: autoCopy, name: name, cfg: function () { return { mode: cfg.mode, prefix: cfg.prefix, folder: DIR ? DIR.name : null, perm: perm, canFolder: CAN_DIR }; } };
})();
