/* DJ Psycho Fingers — Sample Studio. Record from the mic (or import a file / open a pad or browser sound), trim with
 * start / end handles, fades, normalize, reverse, loop points, Voice Style (dj-voicefx.js), then Save to pad,
 * Save to library (shared store → Island Pin Beats "My Samples") or Send to Beats. Opens with /dj/?studio=1. */
(function () {
  "use strict";
  var P = window.PFDJ, V = window.PFVFX; if (!P || !V) return;
  var $ = function (id) { return document.getElementById(id); };
  var ST = { open: false, pad: null, src: null, undo: [], selS: 0, selE: 1, loopOn: false, loopS: 0.25, loopE: 0.75, fadeIn: 5, fadeOut: 30, name: "My sample",
    fx: Object.assign({}, V.NEUTRAL), eqCurve: null, matched: null, amount: 1, preset: null, ref: null, refAna: null, out: null, outKey: "", rendering: null, play: null, rec: null, savedId: null, savedKey: "", drag: null };
  var SL = [["pitch", "Pitch", -12, 12, 0.5, " st"], ["formant", "Formant", -8, 8, 0.5, " st"], ["eq", "EQ match", 0, 1, 0.01, "%"], ["comp", "Compressor", 0, 1, 0.01, "%"], ["sat", "Saturation", 0, 1, 0.01, "%"],
    ["radio", "Radio / megaphone", 0, 1, 0.01, "%"], ["delay", "Delay throws", 0, 1, 0.01, "%"], ["reverb", "Reverb", 0, 1, 0.01, "%"]];
  function fmtV(d, v) { return d[5] === "%" ? Math.round(v * 100) + "%" : (v > 0 ? "+" : "") + (+v).toFixed(1) + d[5]; }
  function toast(m) { P.toast(m); }

  /* ---------- open / close ---------- */
  function open(o) {
    o = o || {};
    ST.open = true; $("studio").hidden = false;
    if (o.pad) ST.pad = o.pad;
    fillPads();
    var S = window.PFSAMPLER;
    if (o.blob) loadBlob(o.blob, o.name || "Sample");
    else if (o.fromPad && S && ST.pad) S.padBlob(ST.pad).then(function (bl) { if (bl) loadBlob(bl, S.S.pads[ST.pad].name || "Pad sample"); });
    setTimeout(function () { $("studio").scrollIntoView({ behavior: "smooth", block: "start" }); }, 30);
    draw(); status();
  }
  function close() { stopPlay(); stopRec(true); ST.open = false; $("studio").hidden = true; }
  function fillPads() {
    var sel = $("st-pad"), S = window.PFSAMPLER; if (!S) return;
    if (!sel.options.length) ["A", "B", "C", "D"].forEach(function (b) { var g = document.createElement("optgroup"); g.label = "Bank " + b; for (var i = 0; i < 16; i++) { var op = document.createElement("option"); op.value = b + i; g.appendChild(op); } sel.appendChild(g); });
    Array.prototype.forEach.call(sel.options, function (op) { var p = S.S.pads[op.value]; op.textContent = op.value[0] + (+op.value.slice(1) + 1) + " · " + (p && (p.file || p.user) ? p.name : "empty"); });
    if (!ST.pad) ST.pad = S.firstEmpty() || "A0";
    sel.value = ST.pad;
  }

  /* ---------- sources ---------- */
  function setSource(buf, name) {
    if (ST.src) ST.undo.push({ src: ST.src, selS: ST.selS, selE: ST.selE }); if (ST.undo.length > 12) ST.undo.shift();
    ST.src = buf; ST.selS = 0; ST.selE = 1; ST.loopS = 0.25; ST.loopE = 0.75; ST.out = null; ST.savedId = null;
    if (name) { ST.name = name.slice(0, 40); $("st-name").value = ST.name; }
    draw(); status(); schedule();
  }
  function loadBlob(blob, name) {
    P.ensureCtx();
    return blob.arrayBuffer().then(P.decode).then(function (b) {
      if (b.duration > 60) { b = slice(b, 0, 60); toast("Long file — the Studio keeps the first 60 s (samples are short)."); }
      setSource(b, name);
    }).catch(function () { toast("Couldn't decode that audio."); });
  }
  function slice(b, s, e) {
    var sr = b.sampleRate, a = Math.max(0, Math.floor(s * sr)), z = Math.min(b.length, Math.ceil(e * sr)), n = Math.max(1, z - a);
    var o = new AudioBuffer({ numberOfChannels: b.numberOfChannels, length: n, sampleRate: sr });
    for (var c = 0; c < b.numberOfChannels; c++) o.getChannelData(c).set(b.getChannelData(c).subarray(a, a + n));
    return o;
  }
  /* mic recording: raw PCM from a ScriptProcessor (processing toggles off for a clean take) */
  function startRec() {
    var ctx = P.ensureCtx(); if (!ctx) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { toast("No microphone access in this browser."); return; }
    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: $("st-ns").checked, autoGainControl: false } }).then(function (stream) {
      var src = ctx.createMediaStreamSource(stream), sp = ctx.createScriptProcessor(4096, 1, 1), mute = ctx.createGain(); mute.gain.value = 0;
      var r = { stream: stream, src: src, sp: sp, mute: mute, chunks: [], n: 0, peak: 0, t0: performance.now() };
      sp.onaudioprocess = function (e) { var d = e.inputBuffer.getChannelData(0), c = new Float32Array(d); r.chunks.push(c); r.n += c.length; for (var i = 0; i < c.length; i += 8) { var a = Math.abs(c[i]); if (a > r.peak) r.peak = a; } r.lvl = Math.max(r.lvl * 0.85 || 0, r.peak); r.peak = 0; if (r.n > ctx.sampleRate * 60) stopRec(); };
      src.connect(sp); sp.connect(mute); mute.connect(ctx.destination);
      ST.rec = r; $("st-rec").classList.add("on"); $("st-rec").textContent = "■ Stop"; recTick();
      toast("Recording from the mic — 🎧 headphones avoid recording the music (max 60 s)");
    }).catch(function (e) { toast("Couldn't open the mic (" + (e && e.name === "NotAllowedError" ? "permission denied" : e && e.message || "error") + ")."); });
  }
  function recTick() { var r = ST.rec; if (!r) return; $("st-time").textContent = "● " + ((performance.now() - r.t0) / 1000).toFixed(1) + " s"; $("st-lvl").style.width = Math.min(100, Math.sqrt(r.lvl || 0) * 100) + "%"; requestAnimationFrame(recTick); }
  function stopRec(discard) {
    var r = ST.rec; if (!r) return; ST.rec = null;
    try { r.src.disconnect(); r.sp.disconnect(); r.mute.disconnect(); } catch (e) { /* ignore */ }
    r.stream.getTracks().forEach(function (t) { t.stop(); });
    $("st-rec").classList.remove("on"); $("st-rec").textContent = "● Record mic"; $("st-lvl").style.width = "0";
    if (discard || !r.n) { $("st-time").textContent = ""; return; }
    var ctx = P.ctx, b = ctx.createBuffer(1, r.n, ctx.sampleRate), d = b.getChannelData(0), o = 0;
    r.chunks.forEach(function (c) { d.set(c, o); o += c.length; });
    // auto-trim leading / trailing silence a little
    var thr = 0.01, s = 0, e = r.n - 1; while (s < e && Math.abs(d[s]) < thr) s++; while (e > s && Math.abs(d[e]) < thr) e--;
    var pad = Math.round(ctx.sampleRate * 0.03), bb = slice(b, Math.max(0, s - pad) / ctx.sampleRate, Math.min(r.n, e + pad) / ctx.sampleRate);
    $("st-time").textContent = bb.duration.toFixed(2) + " s recorded";
    setSource(bb, "Mic take " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
  }

  /* ---------- edits (destructive, with undo) ---------- */
  function edit(fn, label) {
    if (!ST.src) { toast("Record or import a sound first."); return; }
    stopPlay();
    ST.undo.push({ src: ST.src, selS: ST.selS, selE: ST.selE }); if (ST.undo.length > 12) ST.undo.shift();
    fn(); ST.out = null; draw(); status(); schedule(); if (label) toast(label);
  }
  function crop() { edit(function () { var d = ST.src.duration; ST.src = slice(ST.src, ST.selS * d, ST.selE * d); ST.selS = 0; ST.selE = 1; }, "Cropped to the selection"); }
  function reverse() { edit(function () { var d = ST.src.duration, a = Math.floor(ST.selS * ST.src.length), z = Math.floor(ST.selE * ST.src.length); var o = slice(ST.src, 0, d); for (var c = 0; c < o.numberOfChannels; c++) o.getChannelData(c).subarray(a, z).reverse(); ST.src = o; }, "Reversed the selection"); }
  function normalize() { edit(function () { var o = slice(ST.src, 0, ST.src.duration), pk = 0, c, i; for (c = 0; c < o.numberOfChannels; c++) { var d = o.getChannelData(c); for (i = 0; i < d.length; i++) pk = Math.max(pk, Math.abs(d[i])); } var g = pk > 0 ? 0.944 / pk : 1; for (c = 0; c < o.numberOfChannels; c++) { var dd = o.getChannelData(c); for (i = 0; i < dd.length; i++) dd[i] *= g; } ST.src = o; }, "Normalized to −0.5 dBFS"); }
  function undo() { var u = ST.undo.pop(); if (!u) { toast("Nothing to undo."); return; } stopPlay(); ST.src = u.src; ST.selS = u.selS; ST.selE = u.selE; ST.out = null; draw(); status(); schedule(); }

  /* ---------- render (selection → voice style → fades) ---------- */
  function key() { return [ST.src && ST.src.length, ST.selS, ST.selE, ST.fadeIn, ST.fadeOut, JSON.stringify(ST.fx), JSON.stringify(ST.eqCurve), ST.preset, $("st-bypass").checked, ST.matched ? ST.matched.loud : ""].join("|"); }
  function settings() { var s = Object.assign({}, ST.fx); s.eqCurve = ST.eqCurve; var pr = ST.preset && V.PRESETS[ST.preset]; if (pr && pr.tilt) s.tilt = pr.tilt; if (ST.matched) { s.loud = ST.matched.loud; s.matchLoud = true; } var d = P.DECKS.filter(function (x) { return x.playing && x.bpm; })[0]; s.bpm = d ? P.effBpm(d) : 92; return s; }
  function render() {
    if (!ST.src) return Promise.resolve(null);
    var k = key(); if (ST.out && ST.outKey === k) return Promise.resolve(ST.out);
    if (ST.rendering && ST.rendering.k === k) return ST.rendering.p;
    var d = ST.src.duration, sel = slice(ST.src, ST.selS * d, ST.selE * d), s = settings();
    var p = (($("st-bypass").checked || V.isNeutral(s)) ? Promise.resolve(sel) : V.render(sel, s)).then(function (b) {
      b = fades(b);
      if (key() === k) { ST.out = b; ST.outKey = k; }
      status(); return b;
    });
    ST.rendering = { k: k, p: p }; $("st-busy").hidden = false;
    p.then(function () { if (ST.rendering && ST.rendering.p === p) { ST.rendering = null; $("st-busy").hidden = true; } }, function () { ST.rendering = null; $("st-busy").hidden = true; });
    return p;
  }
  function fades(b) {
    var sr = b.sampleRate, fi = Math.min(b.length / 2, Math.round(ST.fadeIn / 1000 * sr)), fo = Math.min(b.length / 2, Math.round(ST.fadeOut / 1000 * sr));
    for (var c = 0; c < b.numberOfChannels; c++) { var x = b.getChannelData(c), n = x.length, i; for (i = 0; i < fi; i++) x[i] *= i / fi; for (i = 0; i < fo; i++) x[n - 1 - i] *= i / fo; }
    return b;
  }
  var schT = null;
  function schedule() { clearTimeout(schT); schT = setTimeout(function () { if (ST.src && ST.src.duration < 20) render(); }, 350); }

  /* ---------- preview ---------- */
  function play() {
    if (ST.play) { stopPlay(); return; }
    if (!ST.src) { toast("Record or import a sound first."); return; }
    var ctx = P.ensureCtx(); if (!ctx) return;
    render().then(function (b) {
      if (!b) return;
      var s = ctx.createBufferSource(), g = ctx.createGain(); s.buffer = b; g.gain.value = 0.9;
      var lp = loopTimes(b); if (ST.loopOn && lp) { s.loop = true; s.loopStart = lp[0]; s.loopEnd = lp[1]; }
      s.connect(g); g.connect(P.M.bus);
      s.onended = function () { if (ST.play && ST.play.s === s) { ST.play = null; $("st-play").textContent = "▶ Preview"; } };
      ST.play = { s: s, t0: ctx.currentTime, dur: b.duration, loop: s.loop, lp: lp }; s.start(); $("st-play").textContent = "■ Stop";
    });
  }
  function stopPlay() { if (ST.play) { try { ST.play.s.stop(); } catch (e) { /* ended */ } ST.play = null; } var b = $("st-play"); if (b) b.textContent = "▶ Preview"; }
  function loopTimes(b) {                                    // loop handles (on the source) → seconds in the rendered buffer
    if (!ST.loopOn || !ST.src) return null;
    var d = ST.src.duration, s0 = ST.selS * d, a = Math.max(ST.loopS, ST.selS) * d - s0, z = Math.min(ST.loopE, ST.selE) * d - s0;
    return z - a > 0.02 ? [Math.max(0, a), Math.min(b.duration, z)] : null;
  }

  /* ---------- reference + match ---------- */
  function refOptions() {
    var sel = $("st-ref"); if (sel.options.length > 1) return;
    var add = function (label, items) { if (!items.length) return; var g = document.createElement("optgroup"); g.label = label; items.forEach(function (it) { var o = document.createElement("option"); o.value = it.url; o.textContent = it.name; g.appendChild(o); }); sel.appendChild(g); };
    fetch("samples/manifest.json").then(function (r) { return r.json(); }).then(function (m) {
      var it = []; ["A", "B", "C", "D"].forEach(function (b) { (m.banks[b] || []).forEach(function (e) { if (e.cat === "voice") it.push({ name: e.name, url: "samples/" + e.file }); }); });
      add("DJ Psycho Fingers pack — voices", it);
      var go = function (L) { add("Beats hip-hop library — vocals & chops", L.ITEMS.filter(function (x) { return x.c === "vox"; }).map(function (x) { return { name: x.n + " (" + x.by + ")", url: "../beats/samples/lib/" + x.f }; })); add("Beats hip-hop library — other", L.ITEMS.filter(function (x) { return x.c === "scratch" || x.c === "fx"; }).slice(0, 30).map(function (x) { return { name: x.n, url: "../beats/samples/lib/" + x.f }; })); };
      if (window.IPBLib) go(window.IPBLib); else { var sc = document.createElement("script"); sc.src = "../beats/samples/lib/index.js?v=1"; sc.onload = function () { if (window.IPBLib) go(window.IPBLib); }; document.head.appendChild(sc); }
    }).catch(function () { /* offline */ });
  }
  function loadRef() {
    var url = $("st-ref").value; if (!url) return Promise.resolve(null);
    if (ST.ref && ST.ref.url === url) return Promise.resolve(ST.ref);
    P.ensureCtx();
    return fetch(url).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.arrayBuffer(); }).then(P.decode).then(function (b) { ST.ref = { url: url, buf: b }; ST.refAna = V.analyze(b); return ST.ref; });
  }
  function matchStyle() {
    if (!ST.src) { toast("Record or import your sound first, then match it to a reference."); return; }
    if (!$("st-ref").value) { toast("Pick a reference sample first."); return; }
    $("st-match").disabled = true; $("st-match").textContent = "Analysing…";
    loadRef().then(function () {
      var d = ST.src.duration, mine = V.analyze(slice(ST.src, ST.selS * d, ST.selE * d)), ref = ST.refAna;
      if (!mine || !ref) throw new Error("couldn't analyse");
      ST.matched = V.match(ref, mine); ST.matched.refName = $("st-ref").selectedOptions[0].textContent; ST.matched.ana = { ref: ref, mine: mine };
      ST.preset = null; applyAmount();
      $("st-matchinfo").textContent = "Reference " + (ref.f0 ? Math.round(ref.f0) + " Hz" : "unpitched") + " vs yours " + (mine.f0 ? Math.round(mine.f0) + " Hz" : "unpitched") +
        " · tilt / EQ " + ST.matched.eqCurve.map(function (v) { return (v > 0 ? "+" : "") + Math.round(v); }).join(" ") + " dB · crest " + ref.crest.toFixed(1) + " vs " + mine.crest.toFixed(1) + " dB · decay " + Math.round(ref.decay) + " vs " + Math.round(mine.decay) + " dB/s";
      toast("Matched the style of “" + ST.matched.refName + "” — adjust Match amount or any slider");
    }).catch(function (e) { toast("Match failed (" + (e.message || e) + ")."); }).then(function () { $("st-match").disabled = false; $("st-match").textContent = "Match style"; });
  }
  function applyAmount() {
    var m = ST.matched; if (!m) return; var a = ST.amount;
    SL.forEach(function (d) { var k = d[0]; ST.fx[k] = k === "eq" ? a : Math.round((m[k] || 0) * a / d[4]) * d[4]; });
    ST.eqCurve = m.eqCurve; syncSliders(); ST.out = null; schedule();
  }
  function preset(name) {
    var pr = V.PRESETS[name]; if (!pr) return;
    ST.preset = name; ST.matched = null; ST.eqCurve = null; $("st-matchinfo").textContent = "Preset: " + name;
    SL.forEach(function (d) { ST.fx[d[0]] = pr[d[0]] || 0; });
    syncSliders(); ST.out = null; schedule();
    document.querySelectorAll(".st-preset").forEach(function (b) { b.classList.toggle("on", b.dataset.p === name); });
  }
  function syncSliders() { SL.forEach(function (d) { var el = $("st-" + d[0]); el.value = ST.fx[d[0]]; $("st-" + d[0] + "-v").textContent = fmtV(d, ST.fx[d[0]]); }); }

  /* ---------- save ---------- */
  function wav(b) {
    var ch = Math.min(2, b.numberOfChannels), n = b.length, sr = b.sampleRate, buf = new ArrayBuffer(44 + n * ch * 2), v = new DataView(buf), o = 0;
    function str(s) { for (var i = 0; i < s.length; i++) v.setUint8(o++, s.charCodeAt(i)); }
    str("RIFF"); v.setUint32(o, 36 + n * ch * 2, true); o += 4; str("WAVEfmt "); v.setUint32(o, 16, true); o += 4; v.setUint16(o, 1, true); o += 2; v.setUint16(o, ch, true); o += 2;
    v.setUint32(o, sr, true); o += 4; v.setUint32(o, sr * ch * 2, true); o += 4; v.setUint16(o, ch * 2, true); o += 2; v.setUint16(o, 16, true); o += 2; str("data"); v.setUint32(o, n * ch * 2, true); o += 4;
    var cs = []; for (var c = 0; c < ch; c++) cs.push(b.getChannelData(c));
    for (var i = 0; i < n; i++) for (c = 0; c < ch; c++) { var x = Math.max(-1, Math.min(1, cs[c][i])); v.setInt16(o, x < 0 ? x * 0x8000 : x * 0x7fff, true); o += 2; }
    return new Blob([buf], { type: "audio/wav" });
  }
  function nm() { return ($("st-name").value || "My sample").trim().slice(0, 40); }
  function saveToPad() {
    var S = window.PFSAMPLER; if (!S) return;
    var k = $("st-pad").value; if (!ST.src) { toast("Nothing to save yet."); return; }
    render().then(function (b) {
      var lp = loopTimes(b), blob = wav(b);
      return S.assign(k, { name: nm(), blob: blob, loopS: lp ? lp[0] : 0, loopE: lp ? lp[1] : 0, mode: ST.loopOn ? "loop" : undefined }).then(function () { fillPads(); toast("Saved to pad " + k[0] + (+k.slice(1) + 1) + ": " + nm() + (lp ? " (loops " + lp[0].toFixed(2) + "–" + lp[1].toFixed(2) + " s)" : "")); });
    }).catch(function (e) { toast("Couldn't save to the pad (" + (e && e.message || e) + ")."); });
  }
  function saveToLib() {
    if (!ST.src) { toast("Nothing to save yet."); return Promise.resolve(null); }
    var k = key() + "|" + nm();
    if (ST.savedId && ST.savedKey === k) return Promise.resolve(ST.savedId);
    return render().then(function (b) {
      var lp = loopTimes(b);
      return import("../shared/user-samples.js").then(function (m) { return m.saveSample({ id: ST.savedId && ST.savedKey.split("|").slice(0, -1).join("|") === key() ? ST.savedId : undefined, name: nm(), blob: wav(b), duration: b.duration, sampleRate: b.sampleRate, source: "dj-studio", tags: ST.preset ? [ST.preset] : ST.matched ? ["matched"] : [], loop: lp ? { start: lp[0], end: lp[1] } : null }); });
    }).then(function (id) { ST.savedId = id; ST.savedKey = k; toast("Saved “" + nm() + "” to My recordings — also in Island Pin Beats → Sample library → My Samples"); if (window.PFSAMPLER && window.PFSAMPLER.B.pack === "mine" && window.PFSAMPLER.B.open) window.PFSAMPLER.browser(true); return id; })
      .catch(function (e) { toast("Couldn't save to the library (" + (e && e.message || e) + ")."); return null; });
  }
  function sendToBeats() {
    var w = window.open("", "islepin-beats");                  // open now (inside the click) so it isn't blocked as a pop-up
    saveToLib().then(function (id) {
      if (!id) { if (w) w.close(); return; }
      var url = "../beats/?sample=" + encodeURIComponent(id);
      if (w) w.location.href = url; else location.href = url;
    });
  }

  /* ---------- waveform + handles ---------- */
  function draw() {
    var cv = $("st-wave"); if (!cv || !ST.open) return;
    var dpr = Math.min(2, window.devicePixelRatio || 1), W = Math.max(200, cv.clientWidth) * dpr, H = (cv.clientHeight || 150) * dpr;
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    var g = cv.getContext("2d"); g.fillStyle = "#0b0e15"; g.fillRect(0, 0, W, H);
    if (!ST.src) { g.fillStyle = "rgba(255,255,255,.35)"; g.font = (13 * dpr) + "px system-ui"; g.fillText("Record from the mic, import a file, or open a sound from the Sample Browser / a pad (long-press)", 12 * dpr, H / 2); return; }
    var d0 = ST.src.getChannelData(0), n = d0.length, mid = H / 2;
    g.fillStyle = "rgba(52,211,153,.10)"; g.fillRect(ST.selS * W, 0, (ST.selE - ST.selS) * W, H);
    if (ST.loopOn) { g.fillStyle = "rgba(245,158,11,.16)"; g.fillRect(ST.loopS * W, H * 0.15, (ST.loopE - ST.loopS) * W, H * 0.7); }
    for (var x = 0; x < W; x++) {
      var a = Math.floor(x / W * n), z = Math.max(a + 1, Math.floor((x + 1) / W * n)), mx = 0;
      for (var i = a; i < z; i += Math.max(1, (z - a) >> 6)) { var v = Math.abs(d0[i]); if (v > mx) mx = v; }
      var inSel = x >= ST.selS * W && x <= ST.selE * W; g.fillStyle = inSel ? "#34d399" : "#334155"; var h = Math.max(1, mx * (H / 2 - 4)); g.fillRect(x, mid - h, 1, 2 * h);
    }
    var hd = function (f, col, lbl, top) { var X = f * W; g.fillStyle = col; g.fillRect(X - dpr, 0, 2 * dpr, H); g.fillRect(X - 7 * dpr, top ? 0 : H - 16 * dpr, 14 * dpr, 16 * dpr); g.fillStyle = "#0b0d12"; g.font = "bold " + (10 * dpr) + "px system-ui"; g.fillText(lbl, X - 3.5 * dpr, top ? 12 * dpr : H - 4 * dpr); };
    hd(ST.selS, "#34d399", "S", false); hd(ST.selE, "#34d399", "E", false);
    if (ST.loopOn) { hd(ST.loopS, "#f59e0b", "L", true); hd(ST.loopE, "#f59e0b", "L", true); }
    if (ST.play && P.ctx) {
      var t = P.ctx.currentTime - ST.play.t0, dd = ST.src.duration, selLen = (ST.selE - ST.selS) * dd;
      if (ST.play.loop && ST.play.lp) { var L0 = ST.play.lp[0], L1 = ST.play.lp[1]; if (t > L1) t = L0 + ((t - L0) % (L1 - L0)); }
      var px = (ST.selS + Math.min(t, selLen) / dd) * W; g.fillStyle = "#f43f5e"; g.fillRect(px - dpr, 0, 2 * dpr, H);
    }
  }
  function frame() { if (ST.open && (ST.play || ST.drag || ST.rec)) draw(); requestAnimationFrame(frame); }
  function handleAt(f, y, H) {
    var cv = $("st-wave"), tol = 16 / Math.max(1, cv.clientWidth), c = [];
    c.push(["selS", ST.selS], ["selE", ST.selE]); if (ST.loopOn) c.push(["loopS", ST.loopS], ["loopE", ST.loopE]);
    var best = null; c.forEach(function (h) { var dist = Math.abs(h[1] - f) - (h[0].indexOf("loop") === 0 && y < H * 0.4 ? tol * 0.5 : 0); if (dist < tol && (!best || dist < best.d)) best = { k: h[0], d: dist }; });
    return best && best.k;
  }
  function wireWave() {
    var cv = $("st-wave");
    cv.addEventListener("pointerdown", function (e) {
      if (!ST.src) return; var r = cv.getBoundingClientRect(), f = (e.clientX - r.left) / r.width, h = handleAt(f, e.clientY - r.top, r.height);
      if (!h) { h = Math.abs(f - ST.selS) < Math.abs(f - ST.selE) ? "selS" : "selE"; }
      ST.drag = h; try { cv.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ } move(e); e.preventDefault();
    });
    function move(e) {
      if (!ST.drag) return; var r = cv.getBoundingClientRect(), f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), m = 0.004;
      if (ST.drag === "selS") ST.selS = Math.min(f, ST.selE - m); else if (ST.drag === "selE") ST.selE = Math.max(f, ST.selS + m);
      else if (ST.drag === "loopS") ST.loopS = Math.min(f, ST.loopE - m); else ST.loopE = Math.max(f, ST.loopS + m);
      draw(); status();
    }
    cv.addEventListener("pointermove", move);
    var up = function () { if (ST.drag) { ST.drag = null; ST.out = null; schedule(); } };
    cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
    cv.addEventListener("dblclick", function () { ST.selS = 0; ST.selE = 1; ST.out = null; draw(); status(); schedule(); });
  }
  function status() {
    var el = $("st-info"); if (!el) return;
    if (!ST.src) { el.textContent = "No sound loaded"; return; }
    var d = ST.src.duration, lp = ST.loopOn ? " · loop " + (ST.loopS * d).toFixed(2) + "–" + (ST.loopE * d).toFixed(2) + " s" : "";
    el.textContent = "Source " + d.toFixed(2) + " s · selection " + (ST.selS * d).toFixed(2) + "–" + (ST.selE * d).toFixed(2) + " s (" + ((ST.selE - ST.selS) * d).toFixed(2) + " s)" + lp + (ST.out ? " · rendered " + ST.out.duration.toFixed(2) + " s" : "");
  }

  /* ---------- build ---------- */
  function build() {
    if (!$("studio")) return;
    var box = $("st-sliders");
    box.innerHTML = SL.map(function (d) { return '<label class="st-sl"><span>' + d[1] + '</span><input type="range" id="st-' + d[0] + '" min="' + d[2] + '" max="' + d[3] + '" step="' + d[4] + '" value="0"><b class="mono" id="st-' + d[0] + '-v"></b></label>'; }).join("");
    SL.forEach(function (d) { $("st-" + d[0]).addEventListener("input", function (e) { ST.fx[d[0]] = +e.target.value; $("st-" + d[0] + "-v").textContent = fmtV(d, ST.fx[d[0]]); ST.out = null; schedule(); }); });
    $("st-presets").innerHTML = Object.keys(V.PRESETS).map(function (n) { return '<button type="button" class="pill small st-preset" data-p="' + n + '">' + n + "</button>"; }).join("") + '<button type="button" class="pill small" id="st-fxreset">Reset FX</button>';
    document.querySelectorAll(".st-preset").forEach(function (b) { b.addEventListener("click", function () { preset(b.dataset.p); }); });
    $("st-fxreset").addEventListener("click", function () { ST.fx = Object.assign({}, V.NEUTRAL); ST.matched = null; ST.preset = null; ST.eqCurve = null; $("st-matchinfo").textContent = ""; document.querySelectorAll(".st-preset").forEach(function (b) { b.classList.remove("on"); }); syncSliders(); ST.out = null; schedule(); });
    syncSliders();
    $("st-close").addEventListener("click", close);
    $("st-rec").addEventListener("click", function () { if (ST.rec) stopRec(); else startRec(); });
    $("st-file").addEventListener("change", function (e) { var f = e.target.files[0]; e.target.value = ""; if (f) loadBlob(f, f.name.replace(/\.[a-z0-9]+$/i, "")); });
    $("st-frompad").addEventListener("click", function () { var S = window.PFSAMPLER, k = $("st-pad").value; ST.pad = k; if (S) S.padBlob(k).then(function (bl) { if (bl) loadBlob(bl, S.S.pads[k].name); else toast("That pad is empty."); }); });
    $("st-pad").addEventListener("change", function (e) { ST.pad = e.target.value; });
    $("st-play").addEventListener("click", play);
    $("st-crop").addEventListener("click", crop); $("st-rev").addEventListener("click", reverse); $("st-norm").addEventListener("click", normalize); $("st-undo").addEventListener("click", undo);
    $("st-fi").addEventListener("input", function (e) { ST.fadeIn = +e.target.value; $("st-fi-v").textContent = ST.fadeIn + " ms"; ST.out = null; schedule(); });
    $("st-fo").addEventListener("input", function (e) { ST.fadeOut = +e.target.value; $("st-fo-v").textContent = ST.fadeOut + " ms"; ST.out = null; schedule(); });
    $("st-loop").addEventListener("change", function (e) { ST.loopOn = e.target.checked; draw(); status(); });
    $("st-bypass").addEventListener("change", function () { ST.out = null; schedule(); });
    $("st-ref").addEventListener("focus", refOptions); refOptions();
    $("st-refplay").addEventListener("click", function () { loadRef().then(function (r) { if (!r) { toast("Pick a reference first."); return; } var ctx = P.ensureCtx(), s = ctx.createBufferSource(); s.buffer = r.buf; s.connect(P.M.bus); s.start(); }).catch(function () { toast("Couldn't load that reference."); }); });
    $("st-match").addEventListener("click", matchStyle);
    $("st-amt").addEventListener("input", function (e) { ST.amount = +e.target.value; $("st-amt-v").textContent = Math.round(ST.amount * 100) + "%"; applyAmount(); });
    $("st-savepad").addEventListener("click", saveToPad); $("st-savelib").addEventListener("click", function () { saveToLib(); }); $("st-beats").addEventListener("click", sendToBeats);
    $("st-name").addEventListener("input", function () { ST.name = nm(); });
    wireWave(); window.addEventListener("resize", draw); requestAnimationFrame(frame);
    if (/[?&]studio=1/.test(location.search)) setTimeout(function () { open({}); }, 300);
  }
  build();
  window.PFSTUDIO = { open: open, close: close, ST: ST, render: render, setSource: setSource, loadBlob: loadBlob, preset: preset, matchStyle: matchStyle, saveToPad: saveToPad, saveToLib: saveToLib, wav: wav, slice: slice, crop: crop, reverse: reverse, normalize: normalize };
})();
