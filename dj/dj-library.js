/* DJ Psycho Fingers — personal music library, stored ONLY in this browser (IndexedDB), never uploaded.
 * Import files / folders / drag-and-drop, ID3v2.2–2.4 + ID3v1 tag reader (title, artist, album, BPM, key, genre, artwork),
 * search + sort, crates / playlists, load to deck A/B, add to the Auto DJ queue, storage used / quota. */
(function () {
  "use strict";
  var P = window.PFDJ; if (!P) return;
  var AUDIO_RE = /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac|webm|aif|aiff)$/i;
  var L = { tracks: [], crates: [], q: "", sort: "added", crate: "all", shown: 150, busy: false, est: null, persisted: null };
  var LK = "pfdj_lib_ui"; try { var u = JSON.parse(localStorage.getItem(LK) || "{}"); if (u.sort) L.sort = u.sort; } catch (e) { /* ignore */ }

  /* ---------- IndexedDB ---------- */
  var dbP = null;
  function db() {
    if (dbP) return dbP;
    dbP = new Promise(function (res, rej) {
      if (!window.indexedDB) { rej(new Error("IndexedDB unavailable")); return; }
      var r = indexedDB.open("pfdj_library", 1);
      r.onupgradeneeded = function () { var d = r.result; d.createObjectStore("tracks", { keyPath: "id" }); d.createObjectStore("files", { keyPath: "id" }); d.createObjectStore("crates", { keyPath: "id" }); };
      r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); };
    });
    return dbP;
  }
  function tx(stores, mode, fn) {
    return db().then(function (d) { return new Promise(function (res, rej) { var t = d.transaction(stores, mode), out = fn(t); t.oncomplete = function () { res(out && out.result !== undefined ? out.result : out); }; t.onerror = function () { rej(t.error); }; t.onabort = function () { rej(t.error || new Error("aborted")); }; }); });
  }
  function getAll(store) { return tx([store], "readonly", function (t) { return t.objectStore(store).getAll(); }); }
  function getFile(id) { return tx(["files"], "readonly", function (t) { return t.objectStore("files").get(id); }).then(function (r) { if (!r || !r.blob) throw new Error("file missing"); return r.blob; }); }

  /* ---------- tag reader ---------- */
  function syncsafe(b, o) { return (b[o] & 127) << 21 | (b[o + 1] & 127) << 14 | (b[o + 2] & 127) << 7 | (b[o + 3] & 127); }
  function u32(b, o) { return (b[o] << 24 >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3]; }
  function decText(b, enc) {
    try {
      if (enc === 0) { var s = ""; for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return s; }
      if (enc === 3) return new TextDecoder("utf-8").decode(b);
      if (enc === 1) { if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder("utf-16le").decode(b.subarray(2)); if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder("utf-16be").decode(b.subarray(2)); return new TextDecoder("utf-16le").decode(b); }
      if (enc === 2) return new TextDecoder("utf-16be").decode(b);
    } catch (e) { /* ignore */ }
    return "";
  }
  function clean(s) { return (s || "").replace(/\u0000+$/g, "").split("\u0000")[0].trim(); }
  function termLen(b, o, enc) { // index of the string terminator for the encoding
    if (enc === 1 || enc === 2) { for (var i = o; i + 1 < b.length; i += 2) if (b[i] === 0 && b[i + 1] === 0) return i; return b.length; }
    for (var j = o; j < b.length; j++) if (b[j] === 0) return j; return b.length;
  }
  function parseID3v2(b) {
    var ver = b[3], flags = b[5], size = syncsafe(b, 6) + 10, o = 10, tags = {};
    if (flags & 0x80 && ver < 4) { var out = [b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7], b[8], b[9]]; for (var i = 10; i < Math.min(size, b.length); i++) { out.push(b[i]); if (b[i] === 0xff && b[i + 1] === 0) i++; } b = new Uint8Array(out); size = b.length; }
    if (flags & 0x40) o += ver === 4 ? syncsafe(b, 10) : u32(b, 10) + 4;
    var map = { TIT2: "title", TT2: "title", TPE1: "artist", TP1: "artist", TALB: "album", TAL: "album", TBPM: "bpm", TBP: "bpm", TKEY: "key", TKE: "key", TCON: "genre", TCO: "genre", TPE2: "albumArtist", TP2: "albumArtist" };
    var end = Math.min(size, b.length);
    while (o + (ver === 2 ? 6 : 10) <= end) {
      var id, fs, hl;
      if (ver === 2) { id = String.fromCharCode(b[o], b[o + 1], b[o + 2]); fs = (b[o + 3] << 16) + (b[o + 4] << 8) + b[o + 5]; hl = 6; }
      else { id = String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]); fs = ver === 4 ? syncsafe(b, o + 4) : u32(b, o + 4); hl = 10; }
      if (!/^[A-Z0-9]{3,4}$/.test(id) || fs <= 0 || o + hl + fs > end) break;
      var f = b.subarray(o + hl, o + hl + fs);
      if (map[id] && !tags[map[id]]) tags[map[id]] = clean(decText(f.subarray(1), f[0]));
      else if ((id === "APIC" || id === "PIC") && !tags.art) {
        var enc = f[0], p = 1, mime;
        if (id === "APIC") { var me = termLen(f, 1, 0); mime = decText(f.subarray(1, me), 0); p = me + 1; } else { mime = "image/" + decText(f.subarray(1, 4), 0).toLowerCase().replace("jpg", "jpeg"); p = 4; }
        p += 1; var de = termLen(f, p, enc); p = de + (enc === 1 || enc === 2 ? 2 : 1);
        if (p < f.length) tags.art = new Blob([f.slice(p)], { type: /image\//.test(mime) ? mime : "image/jpeg" });
      }
      o += hl + fs;
    }
    return tags;
  }
  function parseID3v1(b) {
    if (b.length < 128 || b[0] !== 84 || b[1] !== 65 || b[2] !== 71) return {};
    var s = function (a, n) { return clean(decText(b.subarray(a, a + n), 0)); };
    return { title: s(3, 30), artist: s(33, 30), album: s(63, 30) };
  }
  function readTags(file) {
    return file.slice(0, 10).arrayBuffer().then(function (h) {
      var b = new Uint8Array(h);
      if (b[0] === 73 && b[1] === 68 && b[2] === 51 && b[3] >= 2 && b[3] <= 4) {
        var size = syncsafe(b, 6) + 10;
        return file.slice(0, Math.min(size, 12 * 1048576)).arrayBuffer().then(function (ab) { return parseID3v2(new Uint8Array(ab)); });
      }
      return file.slice(Math.max(0, file.size - 128)).arrayBuffer().then(function (ab) { return parseID3v1(new Uint8Array(ab)); });
    }).catch(function () { return {}; });
  }
  function thumb(blob) { // shrink artwork to a 96 px JPEG so the library stays light
    if (!blob || !window.createImageBitmap) return Promise.resolve(null);
    return createImageBitmap(blob).then(function (bm) {
      var c = document.createElement("canvas"), s = 96; c.width = s; c.height = s;
      var k = Math.max(s / bm.width, s / bm.height), w = bm.width * k, h = bm.height * k;
      c.getContext("2d").drawImage(bm, (s - w) / 2, (s - h) / 2, w, h);
      return new Promise(function (res) { c.toBlob(function (b) { res(b); }, "image/jpeg", 0.8); });
    }).catch(function () { return null; });
  }
  function duration(file) {
    return new Promise(function (res) {
      var a = document.createElement("audio"), url = URL.createObjectURL(file), done = function (v) { URL.revokeObjectURL(url); a.removeAttribute("src"); res(v); };
      a.preload = "metadata"; a.onloadedmetadata = function () { done(isFinite(a.duration) ? a.duration : 0); }; a.onerror = function () { done(0); };
      setTimeout(function () { done(0); }, 5000); a.src = url;
    });
  }
  function nameParts(fn) {
    var base = fn.replace(/\.[a-z0-9]+$/i, "").replace(/_/g, " ").trim(), m = /^(.+?)\s+[-–]\s+(.+)$/.exec(base);
    return m ? { artist: m[1].replace(/^\d+[\s.-]+/, ""), title: m[2] } : { title: base.replace(/^\d+[\s.-]+/, "") };
  }

  /* ---------- import ---------- */
  function persist() {
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().then(function (ok) { L.persisted = ok; estimate(); }).catch(function () { /* ignore */ });
  }
  function estimate() {
    if (!navigator.storage || !navigator.storage.estimate) return;
    navigator.storage.estimate().then(function (e) { L.est = e; status(); }).catch(function () { /* ignore */ });
    if (navigator.storage.persisted) navigator.storage.persisted().then(function (p) { L.persisted = p; status(); });
  }
  function importFiles(files) {
    files = Array.prototype.filter.call(files, function (f) { return f && (AUDIO_RE.test(f.name) || /^audio\//.test(f.type)); });
    if (!files.length) { P.toast("No audio files found there (mp3, m4a, wav, ogg, flac…)."); return Promise.resolve(0); }
    if (L.busy) { P.toast("Still importing — one batch at a time."); return Promise.resolve(0); }
    L.busy = true; persist();
    var have = {}; L.tracks.forEach(function (t) { have[t.id] = 1; });
    var added = 0, skipped = 0, i = 0, total = files.length;
    function one() {
      if (i >= files.length) return Promise.resolve();
      var f = files[i++], id = "t_" + (f.name + "|" + f.size + "|" + (f.lastModified || 0)).split("").reduce(function (h, c) { return (h * 31 + c.charCodeAt(0)) | 0; }, 7).toString(36) + "_" + f.size.toString(36);
      progress("Importing " + i + " / " + total + " · " + f.name);
      if (have[id]) { skipped++; return one(); }
      return readTags(f).then(function (tg) {
        return Promise.all([thumb(tg.art), duration(f)]).then(function (r) {
          var np = nameParts(f.name), bpm = parseFloat((tg.bpm || "").replace(",", "."));
          var t = { id: id, file: f.name, title: tg.title || np.title, artist: tg.artist || tg.albumArtist || np.artist || "", album: tg.album || "", genre: tg.genre || "", key: tg.key || "",
            bpm: bpm >= 50 && bpm <= 220 ? bpm : P.bpmFromName(f.name), dur: r[1], size: f.size, type: f.type, added: Date.now() + i, art: r[0] || null };
          return tx(["tracks", "files"], "readwrite", function (x) { x.objectStore("files").put({ id: id, blob: f }); x.objectStore("tracks").put(t); }).then(function () { L.tracks.push(t); have[id] = 1; added++; if (added % 25 === 0) render(); });
        });
      }).catch(function (e) {
        if (e && /quota/i.test(e.name + e.message)) { i = files.length; P.toast("Browser storage is full — free some space or import fewer files."); return; }
        skipped++;
      }).then(one);
    }
    return one().then(function () {
      L.busy = false; progress(""); render(); estimate();
      P.toast("Library: added " + added + " track" + (added === 1 ? "" : "s") + (skipped ? " · " + skipped + " skipped (already there or unreadable)" : "") + " — stored on this device only");
      return added;
    });
  }
  function walkEntry(entry, out) {
    return new Promise(function (res) {
      if (entry.isFile) entry.file(function (f) { out.push(f); res(); }, function () { res(); });
      else if (entry.isDirectory) {
        var rd = entry.createReader(), all = [];
        (function more() { rd.readEntries(function (es) { if (!es.length) { Promise.all(all.map(function (e) { return walkEntry(e, out); })).then(res); return; } all = all.concat(Array.prototype.slice.call(es)); more(); }, function () { res(); }); })();
      } else res();
    });
  }
  function walkHandle(dir, out) {
    var it = dir.values(), list = [];
    function step() { return it.next().then(function (r) { if (r.done) return; list.push(r.value); return step(); }); }
    return step().then(function () { return Promise.all(list.map(function (h) { return h.kind === "file" ? (AUDIO_RE.test(h.name) ? h.getFile().then(function (f) { out.push(f); }) : null) : walkHandle(h, out); })); });
  }
  function importFolder() {
    if (window.showDirectoryPicker) {
      window.showDirectoryPicker({ id: "pfdj-music", mode: "read" }).then(function (dir) { var out = []; progress("Scanning folder " + dir.name + "…"); return walkHandle(dir, out).then(function () { return importFiles(out); }); })
        .catch(function (e) { progress(""); if (e && e.name !== "AbortError") document.getElementById("lib-dir").click(); });
    } else document.getElementById("lib-dir").click();
  }

  /* ---------- crates ---------- */
  function saveCrate(c) { return tx(["crates"], "readwrite", function (x) { x.objectStore("crates").put(c); }); }
  function newCrate() {
    var n = prompt("Name the new crate / playlist:", "Crate " + (L.crates.length + 1)); if (!n) return;
    var c = { id: "c_" + Date.now().toString(36), name: n.slice(0, 40), ids: [] }; L.crates.push(c); saveCrate(c).then(function () { L.crate = c.id; render(); });
  }
  function addToCrate(cid, tid) { var c = L.crates.filter(function (x) { return x.id === cid; })[0]; if (!c) return; if (c.ids.indexOf(tid) < 0) c.ids.push(tid); saveCrate(c); P.toast("Added to “" + c.name + "”"); }
  function removeFromCrate(cid, tid) { var c = L.crates.filter(function (x) { return x.id === cid; })[0]; if (!c) return; c.ids = c.ids.filter(function (x) { return x !== tid; }); saveCrate(c).then(render); }
  function delTrack(t) {
    if (!confirm("Remove “" + t.title + "” from this browser's library? (Your original file isn't touched.)")) return;
    tx(["tracks", "files", "crates"], "readwrite", function (x) { x.objectStore("tracks").delete(t.id); x.objectStore("files").delete(t.id); L.crates.forEach(function (c) { var k = c.ids.indexOf(t.id); if (k >= 0) { c.ids.splice(k, 1); x.objectStore("crates").put(c); } }); })
      .then(function () { L.tracks = L.tracks.filter(function (x) { return x !== t; }); render(); estimate(); });
  }
  function deleteCrate(cid) { var c = L.crates.filter(function (x) { return x.id === cid; })[0]; if (!c || !confirm("Delete the crate “" + c.name + "”? (Tracks stay in the library.)")) return; tx(["crates"], "readwrite", function (x) { x.objectStore("crates").delete(cid); }).then(function () { L.crates = L.crates.filter(function (x) { return x !== c; }); L.crate = "all"; render(); }); }

  /* ---------- deck / auto DJ items ---------- */
  function item(t) {
    var a = t.ana || null;
    return { name: t.title || t.file, sub: [t.artist, t.bpm || (a && a.bpm) ? Math.round((a && a.bpm) || t.bpm) + " BPM" : "", t.key, "My library"].filter(Boolean).join(" · "),
      bpm: a && a.bpm ? a.bpm : null, grid: a && a.bpm ? a.grid : null, bpmHint: !a && t.bpm ? t.bpm : null, libId: t.id, key: "lib:" + t.id, dur: t.dur, ana: a,
      get: function () { return getFile(t.id).then(function (b) { return b.arrayBuffer(); }); } };
  }
  function saveAnalysis(id, a) {
    var t = L.tracks.filter(function (x) { return x.id === id; })[0]; if (!t) return;
    t.ana = a; tx(["tracks"], "readwrite", function (x) { x.objectStore("tracks").put(t); }).catch(function () { /* ignore */ });
  }
  P.on("loaded", function (d, it) { // cache the detected BPM / beat grid with the track
    if (!it || !it.libId || it.ana) return;
    setTimeout(function () { if (d.item === it && d.bpm && d.bpmSrc !== "tap") saveAnalysis(it.libId, Object.assign({}, (it.ana || {}), { bpm: d.bpm, grid: d.grid, dur: d.buf.duration })); }, 1500);
  });

  /* ---------- UI ---------- */
  var listEl = null;
  function progress(msg) { var el = document.getElementById("mylib-prog"); if (el) { el.textContent = msg; el.hidden = !msg; } }
  function status() {
    var el = document.getElementById("mylib-store"); if (!el) return;
    var e = L.est, tot = L.tracks.reduce(function (s, t) { return s + (t.size || 0); }, 0);
    el.textContent = L.tracks.length + " track" + (L.tracks.length === 1 ? "" : "s") + " · " + P.fmtSize(tot) + " of music" +
      (e ? " · browser storage " + P.fmtSize(e.usage || 0) + " used of " + P.fmtSize(e.quota || 0) : "") + (L.persisted === true ? " · persistent ✓" : L.persisted === false ? " · not yet persistent (the browser may clear it if space runs low)" : "");
  }
  function sorted() {
    var q = L.q.toLowerCase().trim(), list = L.tracks;
    if (L.crate !== "all") { var c = L.crates.filter(function (x) { return x.id === L.crate; })[0]; var ix = {}; list = []; if (c) c.ids.forEach(function (id, k) { ix[id] = k; }); list = L.tracks.filter(function (t) { return ix[t.id] != null; }); if (L.sort === "added") list.sort(function (a, b) { return ix[a.id] - ix[b.id]; }); }
    if (q) list = list.filter(function (t) { return (t.title + " " + t.artist + " " + t.album + " " + t.genre + " " + t.key + " " + t.file).toLowerCase().indexOf(q) >= 0 || (t.bpm && String(Math.round(t.bpm)) === q); });
    var bp = function (t) { return (t.ana && t.ana.bpm) || t.bpm || 999; };
    var f = { added: function (a, b) { return b.added - a.added; }, title: function (a, b) { return (a.title || "").localeCompare(b.title || ""); }, artist: function (a, b) { return (a.artist || "").localeCompare(b.artist || "") || (a.title || "").localeCompare(b.title || ""); },
      bpm: function (a, b) { return bp(a) - bp(b); }, key: function (a, b) { return (a.key || "~").localeCompare(b.key || "~"); }, dur: function (a, b) { return (a.dur || 0) - (b.dur || 0); } }[L.sort];
    if (f && !(L.crate !== "all" && L.sort === "added")) list = list.slice().sort(f);
    return list;
  }
  function render() {
    if (P.libTab !== "mylib" || !listEl) { status(); return; }
    var box = document.getElementById("mylib-rows"); if (!box) return;
    var list = sorted(), crateSel = document.getElementById("mylib-crate");
    crateSel.innerHTML = '<option value="all">All tracks</option>' + L.crates.map(function (c) { return '<option value="' + c.id + '">' + esc(c.name) + " (" + c.ids.length + ")</option>"; }).join("");
    crateSel.value = L.crate; document.getElementById("mylib-delcrate").hidden = L.crate === "all";
    box.innerHTML = "";
    if (!L.tracks.length) box.innerHTML = '<p class="empty">Your library is empty. Import your own rap / hip-hop files above (or drag them here). They are copied into this browser only — nothing goes to GitHub or any server.</p>';
    else if (!list.length) box.innerHTML = '<p class="empty">No tracks match.</p>';
    var frag = document.createDocumentFragment();
    list.slice(0, L.shown).forEach(function (t) { frag.appendChild(row(t)); });
    box.appendChild(frag);
    if (list.length > L.shown) { var mb = document.createElement("button"); mb.type = "button"; mb.className = "btn small"; mb.textContent = "Show more (" + (list.length - L.shown) + " more)"; mb.onclick = function () { L.shown += 300; render(); }; box.appendChild(mb); }
    status();
  }
  function esc(s) { return String(s || "").replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function row(t) {
    var r = document.createElement("div"); r.className = "lib-row mylib-row";
    var bpm = (t.ana && t.ana.bpm) || t.bpm;
    r.innerHTML = '<span class="art"></span><div class="lib-main"><strong></strong><span class="mono"></span></div><div class="lib-acts"><button type="button" class="btn small to-a">→ A</button><button type="button" class="btn small to-b">→ B</button><button type="button" class="btn small to-q" title="Add to the Auto DJ queue">+ Auto DJ</button><select class="btn small more" aria-label="More"><option value="">⋯</option></select></div>';
    r.querySelector("strong").textContent = t.title || t.file;
    r.querySelector(".mono").textContent = [t.artist, bpm ? (Math.round(bpm * 10) / 10) + " BPM" : "", t.key, t.dur ? P.fmtTime(t.dur) : "", t.album].filter(Boolean).join(" · ");
    if (t.art) { var u = URL.createObjectURL(t.art); r.querySelector(".art").style.backgroundImage = "url(" + u + ")"; r._u = u; }
    else r.querySelector(".art").textContent = "♪";
    var it = function () { return item(t); };
    r.querySelector(".to-a").onclick = function () { P.loadInto(P.DECKS[0], it()); };
    r.querySelector(".to-b").onclick = function () { P.loadInto(P.DECKS[1], it()); };
    r.querySelector(".to-q").onclick = function () { if (window.PFAUTODJ) window.PFAUTODJ.add(it()); };
    var sel = r.querySelector(".more");
    L.crates.forEach(function (c) { var o = document.createElement("option"); o.value = "add:" + c.id; o.textContent = "Add to “" + c.name + "”"; sel.appendChild(o); });
    if (L.crate !== "all") { var o2 = document.createElement("option"); o2.value = "rm"; o2.textContent = "Remove from this crate"; sel.appendChild(o2); }
    [["new", "New crate with this track…"], ["del", "Delete from library"]].forEach(function (x) { var o = document.createElement("option"); o.value = x[0]; o.textContent = x[1]; sel.appendChild(o); });
    sel.onchange = function () {
      var v = sel.value; sel.value = "";
      if (v.indexOf("add:") === 0) addToCrate(v.slice(4), t.id);
      else if (v === "rm") removeFromCrate(L.crate, t.id);
      else if (v === "new") { var n = prompt("New crate name:"); if (n) { var c = { id: "c_" + Date.now().toString(36), name: n.slice(0, 40), ids: [t.id] }; L.crates.push(c); saveCrate(c).then(render); } }
      else if (v === "del") delTrack(t);
    };
    return r;
  }
  function tab(list) {
    listEl = list;
    list.innerHTML = '<div class="mylib-bar">' +
      '<label class="btn small file-btn">+ Files…<input type="file" id="lib-files" multiple accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg,.opus,.flac" hidden></label>' +
      '<button type="button" class="btn small" id="lib-folder">+ Folder…</button><input type="file" id="lib-dir" webkitdirectory directory multiple hidden>' +
      '<input type="search" id="mylib-q" class="search" placeholder="Search title, artist, album, key, BPM…" autocomplete="off">' +
      '<select id="mylib-sort" class="btn small" aria-label="Sort"><option value="added">Newest</option><option value="title">Title</option><option value="artist">Artist</option><option value="bpm">BPM</option><option value="key">Key</option><option value="dur">Length</option></select>' +
      '<select id="mylib-crate" class="btn small" aria-label="Crate"></select><button type="button" class="btn small" id="mylib-newcrate">+ Crate</button><button type="button" class="btn small ghost" id="mylib-delcrate" hidden>Delete crate</button>' +
      '<button type="button" class="btn small" id="mylib-queue" title="Add every track shown to the Auto DJ queue">Queue shown → Auto DJ</button></div>' +
      '<p class="mylib-local">🔒 <b>Stays on this device.</b> Imported tracks are copied into this browser\'s private storage (IndexedDB) — they are <b>not</b> uploaded to GitHub or anywhere else, so commercial tracks you own can be mixed without being published. Clearing site data removes them.</p>' +
      '<p class="mylib-store mono" id="mylib-store"></p><p class="mylib-prog" id="mylib-prog" hidden></p><div id="mylib-rows" class="lib-list"></div>';
    document.getElementById("lib-files").onchange = function (e) { var f = Array.prototype.slice.call(e.target.files); e.target.value = ""; importFiles(f); };
    document.getElementById("lib-dir").onchange = function (e) { var f = Array.prototype.slice.call(e.target.files); e.target.value = ""; importFiles(f); };
    document.getElementById("lib-folder").onclick = importFolder;
    var q = document.getElementById("mylib-q"); q.value = L.q; var qt = null;
    q.oninput = function () { clearTimeout(qt); qt = setTimeout(function () { L.q = q.value; L.shown = 150; render(); }, 120); };
    var so = document.getElementById("mylib-sort"); so.value = L.sort; so.onchange = function () { L.sort = so.value; try { localStorage.setItem(LK, JSON.stringify({ sort: L.sort })); } catch (e) { /* ignore */ } render(); };
    document.getElementById("mylib-crate").onchange = function (e) { L.crate = e.target.value; L.shown = 150; render(); };
    document.getElementById("mylib-newcrate").onclick = newCrate;
    document.getElementById("mylib-delcrate").onclick = function () { deleteCrate(L.crate); };
    document.getElementById("mylib-queue").onclick = function () { var l = sorted(); if (!l.length) { P.toast("Nothing to queue."); return; } if (window.PFAUTODJ) { l.forEach(function (t) { window.PFAUTODJ.add(item(t), true); }); P.toast("Queued " + l.length + " track" + (l.length === 1 ? "" : "s") + " for Auto DJ"); } };
    render(); estimate();
  }
  P.LIBTABS.mylib = tab;
  // drag & drop files or folders anywhere on the crate panel → library import
  function wireDrop() {
    var lib = document.querySelector(".library"); if (!lib) return;
    lib.addEventListener("dragover", function (e) { if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], "Files") >= 0) { e.preventDefault(); lib.classList.add("drop"); } });
    lib.addEventListener("dragleave", function (e) { if (e.target === lib) lib.classList.remove("drop"); });
    lib.addEventListener("drop", function (e) {
      e.preventDefault(); lib.classList.remove("drop");
      var items = e.dataTransfer.items, entries = [], out = [];
      if (items && items.length && items[0].webkitGetAsEntry) { for (var i = 0; i < items.length; i++) { var en = items[i].webkitGetAsEntry(); if (en) entries.push(en); } }
      P.showLib("mylib");
      if (entries.length) { progress("Scanning dropped items…"); Promise.all(entries.map(function (en) { return walkEntry(en, out); })).then(function () { importFiles(out); }); }
      else importFiles(Array.prototype.slice.call(e.dataTransfer.files));
    });
  }
  Promise.all([getAll("tracks"), getAll("crates")]).then(function (r) { L.tracks = r[0] || []; L.crates = r[1] || []; render(); }).catch(function () { /* no IDB (private mode) */ });
  wireDrop(); estimate();
  window.PFLIB = { L: L, importFiles: importFiles, item: item, saveAnalysis: saveAnalysis, getFile: getFile, parseID3v2: parseID3v2, readTags: readTags,
    info: function () { return { tracks: L.tracks.length, crates: L.crates.map(function (c) { return { name: c.name, n: c.ids.length }; }), est: L.est, persisted: L.persisted, sample: L.tracks.slice(0, 3).map(function (t) { return { title: t.title, artist: t.artist, bpm: t.bpm, key: t.key, dur: t.dur, art: !!t.art, album: t.album }; }) }; } };
})();
