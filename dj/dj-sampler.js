/* DJ Psycho Fingers — 16-pad sampler, 4 banks (A–D). Pads fire over the music into the master bus (limiter + recorder).
 * All 64 pads START EMPTY: load sounds from the Sample Browser (DJ Psycho Fingers pack, the Beats hip-hop library,
 * your Sample Studio recordings), drop a file on a pad, or make one in the Sample Studio (tap an empty pad).
 * Per-pad volume, mode (one-shot / hold / loop) and loop points, quantize, keyboard shortcuts.
 * Pad assignments live in IndexedDB "pfdj_pads" ({key, name, blob} for your audio, {key, name, url, cat} for pack sounds). */
(function () {
  "use strict";
  var P = window.PFDJ; if (!P) return;
  var $ = function (id) { return document.getElementById(id); };
  var KEYS = ["e", "r", "t", "y", "d", "f", "g", "h", "c", "v", "b", "n", "u", "i", "j", "k"];
  var BANKS = ["A", "B", "C", "D"];
  var CAT = { voice: "#f59e0b", fx: "#22d3ee", scratch: "#f43f5e", hit: "#a78bfa", user: "#34d399" };
  var PK = "pfdj_sampler_v1";
  var pr = {}; try { pr = JSON.parse(localStorage.getItem(PK) || "{}") || {}; } catch (e) { pr = {}; }
  var S = { bank: BANKS.indexOf(pr.bank) >= 0 ? pr.bank : "A", vol: isFinite(+pr.vol) ? +pr.vol : 0.8, q: pr.q === true, qDiv: [0.25, 0.5, 1, 4].indexOf(+pr.qDiv) >= 0 ? +pr.qDiv : 1,
    edit: false, sel: null, pads: {}, bus: null, loadedAll: false };
  var PADPREF = pr.pads || {};
  function save() {
    var o = { bank: S.bank, vol: S.vol, q: S.q, qDiv: S.qDiv, pads: {} };
    Object.keys(S.pads).forEach(function (k) { var p = S.pads[k]; if (p.vol !== 0.85 || p.mode !== p.defMode) o.pads[k] = { vol: p.vol, mode: p.mode }; });
    try { localStorage.setItem(PK, JSON.stringify(o)); } catch (e) { /* ignore */ }
  }
  /* ---------- IndexedDB for user pads ---------- */
  function idb() {
    return new Promise(function (res, rej) {
      if (!window.indexedDB) { rej(new Error("no IndexedDB")); return; }
      var r = indexedDB.open("pfdj_pads", 1);
      r.onupgradeneeded = function () { r.result.createObjectStore("pads", { keyPath: "key" }); };
      r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); };
    });
  }
  function idbDo(mode, fn) { return idb().then(function (db) { return new Promise(function (res, rej) { var tx = db.transaction("pads", mode), st = tx.objectStore("pads"), q = fn(st); tx.oncomplete = function () { db.close(); res(q && q.result); }; tx.onerror = function () { db.close(); rej(tx.error); }; }); }); }

  /* ---------- pads ---------- */
  function key(b, i) { return b + i; }
  function makePad(b, i) {
    var k = key(b, i), pp = PADPREF[k] || {};
    S.pads[k] = { k: k, bank: b, i: i, name: "", file: null, cat: "", dur: 0, buf: null, user: false,
      vol: isFinite(+pp.vol) ? +pp.vol : 0.85, defMode: "one", mode: ["one", "hold", "loop"].indexOf(pp.mode) >= 0 ? pp.mode : "one", voice: null, loading: null, loopS: 0, loopE: 0 };
  }
  /* assign a sound to a pad: rec = { name, url?, blob?, cat?, loopS?, loopE?, mode? } — persisted unless opts.noSave */
  function assign(k, rec, noSave) {
    var p = S.pads[k]; if (!p) return Promise.reject(new Error("no pad"));
    stopVoice(p, true);
    p.name = (rec.name || "Sample").slice(0, 40); p.buf = null; p.err = false; p.loading = null;
    p.user = !!rec.blob; p.blob = rec.blob || null; p.file = rec.blob ? null : rec.url || null; p.cat = rec.cat || (rec.blob ? "user" : "");
    p.loopS = +rec.loopS || 0; p.loopE = +rec.loopE || 0;
    if (rec.mode && ["one", "hold", "loop"].indexOf(rec.mode) >= 0) { p.mode = rec.mode; save(); }
    if (!noSave) idbDo("readwrite", function (st) { var r = { key: k, name: p.name, added: Date.now(), loopS: p.loopS, loopE: p.loopE }; if (p.blob) r.blob = p.blob; else { r.url = p.file; r.cat = p.cat; } return st.put(r); })
      .catch(function () { P.toast("Couldn't save the pad in this browser (private mode?) — it works until you leave."); });
    if (p.bank !== S.bank) setBank(p.bank); else render(p);
    if (S.sel === k) select(k);
    return P.ctx ? load(p) : Promise.resolve(null);
  }
  function clearPad(k, noSave) {
    var p = S.pads[k]; if (!p) return; stopVoice(p, true);
    p.name = ""; p.file = null; p.user = false; p.blob = null; p.buf = null; p.err = false; p.cat = ""; p.loopS = p.loopE = 0;
    if (!noSave) idbDo("readwrite", function (st) { return st.delete(k); }).catch(function () { /* ignore */ });
    render(p); if (S.sel === k) select(k);
  }
  function clearAll() {
    if (!confirm("Clear all 64 pads (banks A–D)? Pack sounds stay in the Sample Browser; your Sample Studio recordings stay in My recordings.")) return;
    Object.keys(S.pads).forEach(function (k) { clearPad(k, true); });
    idbDo("readwrite", function (st) { return st.clear(); }).catch(function () { /* ignore */ });
    P.toast("All pads cleared — load sounds from the Sample Browser or make one in the Sample Studio");
  }
  function firstEmpty() { for (var bi = 0; bi < 4; bi++) { var b = BANKS[(BANKS.indexOf(S.bank) + bi) % 4]; for (var i = 0; i < 16; i++) { var p = S.pads[key(b, i)]; if (!p.file && !p.user) return p.k; } } return null; }
  function trimLead(buf) { // drop codec padding / leading silence so pads hit on time
    var c = buf.getChannelData(0), n = c.length, i = 0, lim = Math.min(n, Math.round(buf.sampleRate * 0.12));
    while (i < lim && Math.abs(c[i]) < 0.0015) i++;
    if (i < 32) return buf;
    var ctx = P.ctx, out = ctx.createBuffer(buf.numberOfChannels, n - i, buf.sampleRate);
    for (var ch = 0; ch < buf.numberOfChannels; ch++) out.getChannelData(ch).set(buf.getChannelData(ch).subarray(i));
    return out;
  }
  function load(p) {
    if (p.buf) return Promise.resolve(p.buf);
    if (p.loading) return p.loading;
    var get = p.user ? Promise.resolve(p.blob.arrayBuffer()) : p.file ? fetch(p.file).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.arrayBuffer(); }) : Promise.reject(new Error("empty"));
    p.loading = get.then(function (ab) { return P.decode(ab); }).then(function (b) { p.buf = trimLead(b); p.loading = null; render(p); return p.buf; })
      .catch(function (e) { p.loading = null; p.err = true; render(p); throw e; });
    render(p);
    return p.loading;
  }
  function loadAll() {
    if (S.loadedAll) return; S.loadedAll = true;
    var order = [S.bank].concat(BANKS.filter(function (b) { return b !== S.bank; })), list = [];
    order.forEach(function (b) { for (var i = 0; i < 16; i++) { var p = S.pads[key(b, i)]; if (p && (p.file || p.user)) list.push(p); } });
    (function next() { var p = list.shift(); if (!p) return; load(p).catch(function () { /* shown on pad */ }).then(next); })();
  }
  function bus() {
    var ctx = P.ensureCtx(); if (!ctx) return null;
    if (!S.bus) { S.bus = ctx.createGain(); S.bus.gain.value = S.vol; S.bus.connect(P.M.bus); S.an = ctx.createAnalyser(); S.an.fftSize = 512; S.bus.connect(S.an); }
    return S.bus;
  }
  /* quantize: next beat (or division) of the deck you're hearing */
  function qDeck() {
    var g = P.xfGains(), best = null;
    P.DECKS.forEach(function (d, j) { if (d.playing && d.bpm && (!best || g[j] * d.vol > best.w)) best = { d: d, w: g[j] * d.vol }; });
    return best && best.d;
  }
  function qTime() {
    var ctx = P.ctx, now = ctx.currentTime;
    if (!S.q) return now;
    var d = qDeck(); if (!d) return now;
    var L = 60 / d.bpm, r = P.rate(d), b = (P.pos(d) - d.grid) / L, div = S.qDiv, k = b / div, frac = k - Math.floor(k);
    if (frac * div * L / r < 0.035) return now;   // up to 35 ms late → fire now (feels on the beat)
    var wait = (Math.ceil(k) - k) * div * L / r;
    return now + Math.max(0, wait);
  }
  function startVoice(p, loop) {
    var ctx = P.ctx, b = bus(); if (!b || !p.buf) return;
    stopVoice(p, true);
    var t = qTime(), s = ctx.createBufferSource(), g = ctx.createGain();
    s.buffer = p.buf; s.loop = !!loop; g.gain.value = p.vol;
    if (loop && p.loopE > p.loopS + 0.02 && p.loopE <= p.buf.duration + 0.01) { s.loopStart = p.loopS; s.loopEnd = p.loopE; }
    s.connect(g); g.connect(b); s.start(t);
    var v = { s: s, g: g, t: t }; p.voice = v;
    s.onended = function () { if (p.voice === v) { p.voice = null; render(p); } };
    var el = padEl(p); if (el) { setTimeout(function () { if (p.voice === v) render(p); el.classList.remove("hit"); void el.offsetWidth; el.classList.add("hit"); }, Math.max(0, (t - ctx.currentTime) * 1000)); }
    render(p);
    P.emit("pad", p);
  }
  function stopVoice(p, quick) {
    var v = p.voice; if (!v) return;
    var ctx = P.ctx, t = ctx.currentTime;
    v.g.gain.cancelScheduledValues(t); v.g.gain.setValueAtTime(v.g.gain.value, t); v.g.gain.setTargetAtTime(0, t, quick ? 0.006 : 0.02);
    try { v.s.stop(t + (quick ? 0.04 : 0.12)); } catch (e) { /* ignore */ }
    p.voice = null; render(p);
  }
  function fire(k, down) {
    var p = S.pads[k];
    if (!p) return;
    if (!p.file && !p.user) { if (down) { if (window.PFSTUDIO) window.PFSTUDIO.open({ pad: k }); else select(k); } return; }
    if (!P.ensureCtx()) return;
    if (!p.buf) { if (down) load(p).then(function () { if (p.mode !== "hold" || p.held) fire(k, true); }).catch(function () { P.toast("Couldn't load " + p.name); }); p.held = down; return; }
    if (p.mode === "one") { if (down) startVoice(p, false); }
    else if (p.mode === "hold") { if (down) { p.held = true; startVoice(p, true); } else { p.held = false; stopVoice(p); } }
    else if (down) { if (p.voice) stopVoice(p); else startVoice(p, true); }
  }
  function stopAll() { Object.keys(S.pads).forEach(function (k) { stopVoice(S.pads[k]); }); }

  /* ---------- UI ---------- */
  function padEl(p) { return p.bank === S.bank ? $("smp-grid").children[p.i] : null; }
  function render(p) {
    var el = padEl(p); if (!el) return;
    var col = p.user ? CAT.user : CAT[p.cat] || "#3a4459", empty = !p.file && !p.user;
    el.style.setProperty("--pc", col);
    el.classList.toggle("empty", empty); el.classList.toggle("playing", !!p.voice); el.classList.toggle("sel", S.sel === p.k);
    el.classList.toggle("loading", !!p.loading); el.classList.toggle("err", !!p.err && !p.buf);
    el.querySelector(".pad-name").textContent = empty ? "empty · tap = Studio" : p.name;
    el.querySelector(".pad-mode").textContent = empty ? "" : p.mode === "one" ? "" : p.mode === "hold" ? "HOLD" : "LOOP";
    el.title = (empty ? "Empty pad" : p.name + (p.user ? " (your sample)" : "")) + " · key " + KEYS[p.i].toUpperCase();
  }
  function renderBank() {
    var g = $("smp-grid");
    if (!g.children.length) {
      for (var i = 0; i < 16; i++) {
        var b = document.createElement("button"); b.type = "button"; b.className = "pad"; b.dataset.i = i;
        b.innerHTML = '<span class="pad-key mono">' + KEYS[i].toUpperCase() + '</span><span class="pad-name"></span><span class="pad-mode"></span>';
        wirePad(b, i); g.appendChild(b);
      }
    }
    for (var j = 0; j < 16; j++) render(S.pads[key(S.bank, j)]);
    document.querySelectorAll(".smp-bank").forEach(function (b) { b.classList.toggle("on", b.dataset.b === S.bank); });
  }
  function wirePad(b, i) {
    var cur = function () { return key(S.bank, i); };
    b.addEventListener("pointerdown", function (e) {
      if (e.button > 0) return;
      e.preventDefault();
      if (S.edit) { select(cur()); return; }
      try { b.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ }
      b._down = cur(); fire(b._down, true);
      var kk = b._down, pp = S.pads[kk];
      clearTimeout(b._lp); if (pp.file || pp.user) b._lp = setTimeout(function () { if (b._down === kk && window.PFSTUDIO) { b._down = null; stopVoice(pp, true); window.PFSTUDIO.open({ pad: kk, fromPad: true }); } }, 650); // long-press → Sample Studio
    });
    var up = function () { clearTimeout(b._lp); if (b._down) { var k = b._down; b._down = null; fire(k, false); } };
    b.addEventListener("pointerup", up); b.addEventListener("pointercancel", up); b.addEventListener("lostpointercapture", up);
    b.addEventListener("contextmenu", function (e) { e.preventDefault(); select(cur()); });
    b.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); if (!e.repeat) fire(cur(), true); } });
    b.addEventListener("keyup", function (e) { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); fire(cur(), false); } });
    b.addEventListener("dragover", function (e) { e.preventDefault(); b.classList.add("drop"); });
    b.addEventListener("dragleave", function () { b.classList.remove("drop"); });
    b.addEventListener("drop", function (e) {
      e.preventDefault(); b.classList.remove("drop");
      var j = e.dataTransfer.getData("text/x-pf-sample"); if (j) { try { useItem(JSON.parse(j), cur()); } catch (er) { /* ignore */ } return; }
      var f = e.dataTransfer.files[0]; if (f) assignFile(cur(), f);
    });
  }
  function select(k) {
    var old = S.sel; S.sel = k;
    if (old && S.pads[old]) render(S.pads[old]);
    var p = S.pads[k]; render(p);
    var ed = $("smp-edit"); ed.hidden = false;
    $("smp-ed-title").textContent = "Pad " + p.bank + (p.i + 1) + " · key " + KEYS[p.i].toUpperCase();
    $("smp-ed-name").textContent = p.file || p.user ? p.name + (p.user ? " (your sample)" : "") : "Empty pad";
    $("smp-ed-vol").value = p.vol; $("smp-ed-volv").textContent = Math.round(p.vol * 100) + "%";
    $("smp-ed-mode").value = p.mode;
    $("smp-ed-reset").hidden = !(p.file || p.user);
  }
  function assignFile(k, f) {
    if (!/^audio\//.test(f.type) && !/\.(mp3|wav|ogg|m4a|aac|flac|opus|webm)$/i.test(f.name)) { P.toast("That isn't an audio file."); return; }
    if (f.size > 25 * 1048576) { P.toast("Pad samples are limited to 25 MB."); return; }
    var p = S.pads[k], name = f.name.replace(/\.[a-z0-9]+$/i, "").slice(0, 40);
    P.ensureCtx();
    assign(k, { name: name, blob: f }).then(function () { P.toast("Pad " + p.bank + (p.i + 1) + ": " + name + " — saved on this device"); }).catch(function () { P.toast("Couldn't decode that file."); });
  }
  function resetPad(k) { clearPad(k); }
  function setBank(b) { S.bank = b; renderBank(); save(); if (S.sel && S.sel[0] !== b) $("smp-edit").hidden = true; }
  function meter() {
    if (S.an) { var a = S.an._b || (S.an._b = new Float32Array(S.an.fftSize)); S.an.getFloatTimeDomainData(a); var m = 0; for (var i = 0; i < a.length; i++) { var v = Math.abs(a[i]); if (v > m) m = v; } $("smp-meter").style.width = Math.min(100, Math.sqrt(m) * 100) + "%"; }
    var d = S.q ? qDeck() : null, qb = $("smp-q");
    if (S.q && d) { var L = 60 / d.bpm, ph = (((P.pos(d) - d.grid) / L) % 1 + 1) % 1; qb.classList.toggle("beat", ph < 0.15); } else qb.classList.remove("beat");
    requestAnimationFrame(meter);
  }
  function build() {
    var root = $("sampler"); if (!root) return;
    for (var bi = 0; bi < 4; bi++) for (var i = 0; i < 16; i++) makePad(BANKS[bi], i, null);
    root.querySelectorAll(".smp-bank").forEach(function (b) { b.addEventListener("click", function () { setBank(b.dataset.b); }); });
    $("smp-q").classList.toggle("on", S.q);
    $("smp-q").addEventListener("click", function () { S.q = !S.q; $("smp-q").classList.toggle("on", S.q); save(); P.toast(S.q ? "Quantize on — pads land on the next " + divName() + " of the deck you're hearing" : "Quantize off — pads fire instantly"); });
    $("smp-qdiv").value = String(S.qDiv);
    $("smp-qdiv").addEventListener("change", function () { S.qDiv = +$("smp-qdiv").value; save(); });
    $("smp-vol").value = S.vol;
    $("smp-vol").addEventListener("input", function () { S.vol = +$("smp-vol").value; if (S.bus) S.bus.gain.setTargetAtTime(S.vol, P.ctx.currentTime, 0.01); save(); });
    $("smp-editbtn").addEventListener("click", function () { S.edit = !S.edit; $("smp-editbtn").classList.toggle("on", S.edit); if (!S.edit) { $("smp-edit").hidden = true; var o = S.sel; S.sel = null; if (o) render(S.pads[o]); } else P.toast("Edit mode: tap a pad to set its volume, mode or load your own sample"); });
    $("smp-stop").addEventListener("click", stopAll);
    $("smp-ed-vol").addEventListener("input", function () { var p = S.pads[S.sel]; if (!p) return; p.vol = +$("smp-ed-vol").value; $("smp-ed-volv").textContent = Math.round(p.vol * 100) + "%"; if (p.voice) p.voice.g.gain.setTargetAtTime(p.vol, P.ctx.currentTime, 0.01); save(); });
    $("smp-ed-mode").addEventListener("change", function () { var p = S.pads[S.sel]; if (!p) return; stopVoice(p); p.mode = $("smp-ed-mode").value; render(p); save(); });
    $("smp-ed-file").addEventListener("change", function (e) { var f = e.target.files[0]; e.target.value = ""; if (f && S.sel) assignFile(S.sel, f); });
    $("smp-ed-reset").addEventListener("click", function () { if (S.sel) resetPad(S.sel); });
    $("smp-ed-play").addEventListener("click", function () { if (S.sel) { var p = S.pads[S.sel]; if (p.voice) stopVoice(p); else fire(S.sel, true); } });
    $("smp-ed-close").addEventListener("click", function () { $("smp-edit").hidden = true; var o = S.sel; S.sel = null; if (o) render(S.pads[o]); });
    renderBank();
    idbDo("readonly", function (st) { return st.getAll(); }).then(function (rows) {
      (rows || []).forEach(function (r) {
        var p = S.pads[r.key]; if (!p || !(r.blob || r.url)) return;
        p.name = r.name || "Sample"; p.buf = null; p.loopS = +r.loopS || 0; p.loopE = +r.loopE || 0;
        if (r.blob) { p.user = true; p.blob = r.blob; p.cat = "user"; } else { p.user = false; p.file = r.url; p.cat = r.cat || ""; }
        render(p);
      });
      if (P.ctx) { S.loadedAll = false; loadAll(); }
    }).catch(function () { /* no IDB */ });
    $("smp-clear").addEventListener("click", clearAll);
    $("smp-browse").addEventListener("click", function () { toggleBrowser(); });
    $("smp-studio").addEventListener("click", function () { if (window.PFSTUDIO) window.PFSTUDIO.open({ pad: S.sel || firstEmpty() }); });
    $("smp-ed-studio").addEventListener("click", function () { if (S.sel && window.PFSTUDIO) window.PFSTUDIO.open({ pad: S.sel, fromPad: !!(S.pads[S.sel].file || S.pads[S.sel].user) }); });
    buildBrowser();
    P.on("ctx", function () { bus(); loadAll(); });
    document.addEventListener("keydown", function (e) {
      if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
      var k = e.key.toLowerCase(), i = KEYS.indexOf(k);
      if (i >= 0) { e.preventDefault(); if (!e.repeat) fire(key(S.bank, i), true); var el = $("smp-grid").children[i]; el && el.classList.add("kdown"); return; }
      if (k === "[" || k === "]") { var bi2 = (BANKS.indexOf(S.bank) + (k === "]" ? 1 : 3)) % 4; setBank(BANKS[bi2]); e.preventDefault(); return; }
      if (e.key === "Escape") stopAll();
    });
    document.addEventListener("keyup", function (e) {
      var i = KEYS.indexOf(e.key.toLowerCase()); if (i < 0) return;
      fire(key(S.bank, i), false); var el = $("smp-grid").children[i]; el && el.classList.remove("kdown");
    });
    requestAnimationFrame(meter);
  }
  function divName() { return S.qDiv === 4 ? "bar" : S.qDiv === 1 ? "beat" : S.qDiv === 0.5 ? "½ beat" : "¼ beat"; }
  /* ---------- Sample Browser: packs → preview → drag onto a pad or "Load to pad" ---------- */
  var B = { open: false, pack: "pf", q: "", cat: "all", man: null, lib: null, mine: [], prev: null, prevKey: null };
  function packItems() {
    var q = B.q.trim().toLowerCase(), out = [];
    if (B.pack === "pf" && B.man) BANKS.forEach(function (b) { (B.man.banks[b] || []).forEach(function (e) { out.push({ id: "pf:" + e.file, name: e.name, url: "samples/" + e.file, cat: e.cat, sub: "DJ Psycho Fingers pack · " + e.cat + " · " + (e.dur ? e.dur.toFixed(1) + "s" : ""), bank: b, pad: e.pad }); }); });
    if (B.pack === "beats" && B.lib) B.lib.ITEMS.forEach(function (it) { if (B.cat !== "all" && it.c !== B.cat) return; out.push({ id: "beats:" + it.f, name: it.n, url: "../beats/samples/lib/" + it.f, cat: it.c === "vox" ? "voice" : it.c === "scratch" ? "scratch" : it.c === "fx" || it.c === "vinyl" ? "fx" : "hit", sub: "Beats library · " + it.c + " · " + (it.by === "IPB Original" ? "IPB Original" : "by " + it.by) + " · CC0 · " + (+it.d || 0).toFixed(2) + "s" }); });
    if (B.pack === "mine") B.mine.forEach(function (r) { out.push({ id: "mine:" + r.id, sid: r.id, name: r.name, blob: r.blob, cat: "user", sub: "My recording · " + (r.duration ? r.duration.toFixed(2) + "s" : "") + (r.source ? " · " + r.source : "") + " · " + new Date(r.createdAt || Date.now()).toLocaleDateString([], { month: "short", day: "numeric" }) }); });
    return q ? out.filter(function (it) { return (it.name + " " + it.sub).toLowerCase().indexOf(q) >= 0; }) : out;
  }
  function loadLib() {
    if (B.lib || window.IPBLib) { B.lib = B.lib || window.IPBLib; return Promise.resolve(B.lib); }
    return new Promise(function (res, rej) { var sc = document.createElement("script"); sc.src = "../beats/samples/lib/index.js?v=1"; sc.onload = function () { B.lib = window.IPBLib; res(B.lib); }; sc.onerror = function () { rej(new Error("Beats library unavailable")); }; document.head.appendChild(sc); });
  }
  function loadMine() { return import("../shared/user-samples.js").then(function (m) { return m.listSamples(); }).then(function (rows) { B.mine = rows || []; }).catch(function () { B.mine = []; }); }
  function itemBlob(it) { return it.blob ? Promise.resolve(it.blob) : fetch(it.url).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.blob(); }); }
  function useItem(it, k) {
    k = k || (S.sel && S.pads[S.sel] ? S.sel : firstEmpty());
    if (!k) { P.toast("No empty pad left — select a pad first (EDIT or right-click), then Load to pad."); return; }
    P.ensureCtx();
    var rec = it.blob ? { name: it.name, blob: it.blob, cat: "user" } : { name: it.name, url: it.url, cat: it.cat };
    if (it.sid && !it.blob) { import("../shared/user-samples.js").then(function (m) { return m.getSample(it.sid); }).then(function (r) { if (r) assign(k, { name: r.name, blob: r.blob, loopS: r.loop && r.loop.start, loopE: r.loop && r.loop.end }); }); return; }
    assign(k, rec).then(function () { var p = S.pads[k]; P.toast("Pad " + p.bank + (p.i + 1) + ": " + p.name); }).catch(function () { P.toast("Couldn't load " + it.name); });
  }
  function preview(it) {
    var ctx = P.ensureCtx(); if (!ctx) return;
    if (B.prev) { try { B.prev.stop(); } catch (e) { /* ended */ } B.prev = null; }
    if (B.prevKey === it.id) { B.prevKey = null; renderBrowser(); return; }
    B.prevKey = it.id; renderBrowser();
    itemBlob(it).then(function (bl) { return bl.arrayBuffer(); }).then(P.decode).then(function (buf) {
      if (B.prevKey !== it.id) return;
      var s = ctx.createBufferSource(), g = ctx.createGain(); s.buffer = buf; g.gain.value = 0.85; s.connect(g); g.connect(bus());
      s.onended = function () { if (B.prev === s) { B.prev = null; B.prevKey = null; renderBrowser(); } };
      B.prev = s; s.start();
    }).catch(function () { B.prevKey = null; renderBrowser(); P.toast("Couldn't preview " + it.name); });
  }
  function loadPackLayout() {
    if (!B.man) return;
    var used = Object.keys(S.pads).some(function (k) { return S.pads[k].file || S.pads[k].user; });
    if (used && !confirm("Put the DJ Psycho Fingers pack on all 64 pads in its original layout? Pads you filled will be replaced.")) return;
    P.ensureCtx();
    BANKS.forEach(function (b) { for (var i = 0; i < 16; i++) clearPad(key(b, i), true); (B.man.banks[b] || []).forEach(function (e) { assign(key(b, e.pad), { name: e.name, url: "samples/" + e.file, cat: e.cat }); }); });
    renderBank(); P.toast("DJ Psycho Fingers pack loaded on banks A–D");
  }
  function renderBrowser() {
    var box = $("smpb-list"); if (!box || !B.open) return;
    document.querySelectorAll(".smpb-pack").forEach(function (b) { b.classList.toggle("on", b.dataset.p === B.pack); });
    var cs = $("smpb-cat"); cs.hidden = B.pack !== "beats";
    $("smpb-layout").hidden = B.pack !== "pf";
    var items = packItems(); box.innerHTML = "";
    if (B.pack === "beats" && !B.lib) { box.innerHTML = '<p class="empty">Loading the Beats hip-hop library…</p>'; return; }
    if (!items.length) { box.innerHTML = '<p class="empty">' + (B.pack === "mine" ? "No recordings yet — make one in the Sample Studio and press “Save to library”. They also show up in Island Pin Beats → Sample library → My Samples." : "Nothing matches.") + "</p>"; return; }
    items.slice(0, 400).forEach(function (it) {
      var r = document.createElement("div"); r.className = "smpb-row" + (B.prevKey === it.id ? " previewing" : ""); r.draggable = true; r.style.setProperty("--pc", CAT[it.cat] || "#3a4459");
      r.innerHTML = '<button type="button" class="smpb-play" aria-label="Preview">' + (B.prevKey === it.id ? "■" : "▶") + '</button><div class="smpb-main"><strong></strong><span class="mono"></span></div><button type="button" class="btn small smpb-use">Load to pad</button><button type="button" class="btn small ghost smpb-st" title="Open in the Sample Studio">✎</button>';
      r.querySelector("strong").textContent = it.name; r.querySelector(".mono").textContent = it.sub;
      r.querySelector(".smpb-play").onclick = function () { preview(it); };
      r.querySelector(".smpb-main").onclick = function () { preview(it); };
      r.querySelector(".smpb-use").onclick = function () { useItem(it); };
      r.querySelector(".smpb-st").onclick = function () { if (window.PFSTUDIO) itemBlob(it).then(function (bl) { window.PFSTUDIO.open({ pad: S.sel || firstEmpty(), blob: bl, name: it.name }); }); };
      r.addEventListener("dragstart", function (e) { e.dataTransfer.effectAllowed = "copy"; e.dataTransfer.setData("text/x-pf-sample", JSON.stringify({ id: it.id, sid: it.sid, name: it.name, url: it.url, cat: it.cat })); e.dataTransfer.setData("text/plain", it.name); });
      box.appendChild(r);
    });
  }
  function toggleBrowser(v) {
    B.open = v == null ? !B.open : v; $("smp-browser").hidden = !B.open; $("smp-browse").classList.toggle("on", B.open);
    if (B.open) { if (B.pack === "beats") loadLib().then(renderBrowser); if (B.pack === "mine") loadMine().then(renderBrowser); renderBrowser(); }
    else if (B.prev) { try { B.prev.stop(); } catch (e) { /* ended */ } B.prev = null; B.prevKey = null; }
  }
  function buildBrowser() {
    fetch("samples/manifest.json").then(function (r) { return r.json(); }).then(function (m) { B.man = m; renderBrowser(); }).catch(function () { /* offline */ });
    document.querySelectorAll(".smpb-pack").forEach(function (b) { b.addEventListener("click", function () {
      B.pack = b.dataset.p; B.q = ""; $("smpb-q").value = "";
      if (B.pack === "beats") loadLib().then(function (L) { var cs = $("smpb-cat"); if (cs.options.length < 2) L.CATS.forEach(function (c) { var o = document.createElement("option"); o.value = c.id; o.textContent = c.name; cs.appendChild(o); }); renderBrowser(); }).catch(function (e) { $("smpb-list").innerHTML = '<p class="empty">' + e.message + "</p>"; });
      if (B.pack === "mine") loadMine().then(renderBrowser);
      renderBrowser();
    }); });
    $("smpb-q").addEventListener("input", function () { B.q = $("smpb-q").value; renderBrowser(); });
    $("smpb-cat").addEventListener("change", function () { B.cat = $("smpb-cat").value; renderBrowser(); });
    $("smpb-layout").addEventListener("click", loadPackLayout);
    $("smpb-close").addEventListener("click", function () { toggleBrowser(false); });
    import("../shared/user-samples.js").then(function (m) { m.onSamplesChange(function () { loadMine().then(renderBrowser); }); }).catch(function () { /* no shared store */ });
  }
  build();
  window.PFSAMPLER = { S: S, fire: fire, stopAll: stopAll, setBank: setBank, load: load, assign: assign, clearPad: clearPad, firstEmpty: firstEmpty, browser: toggleBrowser, B: B, useItem: useItem, KEYS: KEYS,
    padBlob: function (k) { var p = S.pads[k]; if (!p) return Promise.resolve(null); return p.blob ? Promise.resolve(p.blob) : p.file ? fetch(p.file).then(function (r) { return r.ok ? r.blob() : null; }) : Promise.resolve(null); },
    info: function () {
    var o = { bank: S.bank, q: S.q, qDiv: S.qDiv, vol: S.vol, loaded: 0, total: 0, playing: [], pads: {} };
    Object.keys(S.pads).forEach(function (k) { var p = S.pads[k]; if (p.file || p.user) { o.total++; if (p.buf) o.loaded++; o.pads[k] = p.name; } if (p.voice) o.playing.push(k); });
    o.busPeak = (function () { if (!S.an) return 0; var a = new Float32Array(S.an.fftSize); S.an.getFloatTimeDomainData(a); var m = 0; for (var i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i])); return m; })();
    return o;
  } };
})();
