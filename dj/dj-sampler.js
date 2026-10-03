/* DJ Psycho Fingers — 16-pad sampler, 4 banks (A–D). Pads fire over the music into the master bus (limiter + recorder).
 * Per-pad volume and mode (one-shot / hold / loop), quantize to the beat of the playing deck, keyboard shortcuts,
 * load your own file onto any pad (kept in IndexedDB on this device). */
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
  function makePad(b, i, e) {
    var k = key(b, i), pp = PADPREF[k] || {}, def = e && (e.cat === "fx" && /siren|riser/i.test(e.name)) ? "one" : "one";
    S.pads[k] = { k: k, bank: b, i: i, name: e ? e.name : "", file: e ? "samples/" + e.file : null, cat: e ? e.cat : "", dur: e ? e.dur : 0, buf: null, user: false,
      vol: isFinite(+pp.vol) ? +pp.vol : 0.85, defMode: def, mode: ["one", "hold", "loop"].indexOf(pp.mode) >= 0 ? pp.mode : def, voice: null, loading: null, orig: e || null };
  }
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
    if (!p.file && !p.user) { if (down) { select(k); P.toast("Empty pad — load your own sample onto it (EDIT → Load file)."); } return; }
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
    el.querySelector(".pad-name").textContent = empty ? "empty — load" : p.name;
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
    });
    var up = function () { if (b._down) { var k = b._down; b._down = null; fire(k, false); } };
    b.addEventListener("pointerup", up); b.addEventListener("pointercancel", up); b.addEventListener("lostpointercapture", up);
    b.addEventListener("contextmenu", function (e) { e.preventDefault(); select(cur()); });
    b.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); if (!e.repeat) fire(cur(), true); } });
    b.addEventListener("keyup", function (e) { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); fire(cur(), false); } });
    b.addEventListener("dragover", function (e) { e.preventDefault(); b.classList.add("drop"); });
    b.addEventListener("dragleave", function () { b.classList.remove("drop"); });
    b.addEventListener("drop", function (e) { e.preventDefault(); b.classList.remove("drop"); var f = e.dataTransfer.files[0]; if (f) assignFile(cur(), f); });
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
    $("smp-ed-reset").hidden = !p.user;
  }
  function assignFile(k, f) {
    if (!/^audio\//.test(f.type) && !/\.(mp3|wav|ogg|m4a|aac|flac|opus|webm)$/i.test(f.name)) { P.toast("That isn't an audio file."); return; }
    if (f.size > 25 * 1048576) { P.toast("Pad samples are limited to 25 MB."); return; }
    var p = S.pads[k], name = f.name.replace(/\.[a-z0-9]+$/i, "").slice(0, 40);
    stopVoice(p, true);
    p.user = true; p.blob = f; p.name = name; p.buf = null; p.err = false;
    idbDo("readwrite", function (st) { return st.put({ key: k, name: name, blob: f, added: Date.now() }); }).catch(function () { P.toast("Couldn't save the sample in this browser (private mode?) — it works until you leave."); });
    load(p).then(function () { P.toast("Pad " + p.bank + (p.i + 1) + ": " + name + " — saved on this device"); if (S.sel === k) select(k); }).catch(function () { P.toast("Couldn't decode that file."); });
    if (p.bank !== S.bank) setBank(p.bank); else render(p);
  }
  function resetPad(k) {
    var p = S.pads[k], e = p.orig;
    stopVoice(p, true);
    idbDo("readwrite", function (st) { return st.delete(k); }).catch(function () { /* ignore */ });
    p.user = false; p.blob = null; p.buf = null; p.err = false; p.name = e ? e.name : ""; p.file = e ? "samples/" + e.file : null; p.cat = e ? e.cat : "";
    render(p); select(k);
    if (P.ctx && p.file) load(p).catch(function () { /* ignore */ });
  }
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
    fetch("samples/manifest.json").then(function (r) { return r.json(); }).then(function (m) {
      BANKS.forEach(function (b) { (m.banks[b] || []).forEach(function (e) { var p = S.pads[key(b, e.pad)]; if (!p.user) { makePad(b, e.pad, e); } else p.orig = e; }); });
      renderBank();
      if (P.ctx) loadAll();
    }).catch(function () { P.toast("Couldn't load the sample pack list."); });
    idbDo("readonly", function (st) { return st.getAll(); }).then(function (rows) {
      (rows || []).forEach(function (r) { var p = S.pads[r.key]; if (!p || !r.blob) return; p.user = true; p.blob = r.blob; p.name = r.name; p.buf = null; render(p); });
    }).catch(function () { /* no IDB */ });
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
  build();
  window.PFSAMPLER = { S: S, fire: fire, stopAll: stopAll, setBank: setBank, load: load, info: function () {
    var o = { bank: S.bank, q: S.q, qDiv: S.qDiv, vol: S.vol, loaded: 0, total: 0, playing: [], pads: {} };
    Object.keys(S.pads).forEach(function (k) { var p = S.pads[k]; if (p.file || p.user) { o.total++; if (p.buf) o.loaded++; o.pads[k] = p.name; } if (p.voice) o.playing.push(k); });
    o.busPeak = (function () { if (!S.an) return 0; var a = new Float32Array(S.an.fftSize); S.an.getFloatTimeDomainData(a); var m = 0; for (var i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i])); return m; })();
    return o;
  } };
})();
