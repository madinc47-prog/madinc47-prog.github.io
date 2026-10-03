/* DJ Psycho Fingers — PSYCHO EQ (master graphic EQ + analyzer + FX). Own code, Web Audio only.
 * Master insert between the master bus and the master volume:
 *   bus → [A: isolator (LR4 3-band, optional) → 10-band graphic EQ → sub-bass enhancer → loudness shelves → auto headroom]
 *       ⇄ [B: bypass]  (A/B crossfade, 30 ms) → Sweep FX (XY pad: LP/HP filter + resonance, or filter + beat echo) → master vol → limiter
 * Per-deck 4-band (optional): low shelf 100 Hz / peak 400 Hz / peak 2.5 kHz / high shelf 8 kHz, inserted after each strip's 3-band EQ.
 * Live spectrum analyzer (post, with pre ghost + peak hold) with the EQ response curve drawn on top; drag the handles.
 * Everything is saved in localStorage 'pfdj_peq_v1'. Exposed as window.PFEQ. */
(function () {
  "use strict";
  var P = window.PFDJ; if (!P) return;
  var $ = function (id) { return document.getElementById(id); };
  var FREQS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
  var FLBL = ["31", "62", "125", "250", "500", "1k", "2k", "4k", "8k", "16k"];
  var D4F = [100, 400, 2500, 8000], D4L = ["LOW", "LO-MID", "HI-MID", "HIGH"];
  var PRESETS = {
    "Flat": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    "Hip-Hop Boom": [5, 4, 2, 0, -1, -1, 0, 1, 2, 2],
    "Trap 808": [7, 6, 2, -1, -2, -1, 0, 1, 3, 3],
    "Boom Bap": [3, 4, 2, 1, 0, 0, 1, 1, 1, 0],
    "Dancehall": [5, 5, 1, -1, -1, 0, 1, 2, 2, 1],
    "Soca / Carnival": [3, 3, 1, 0, 0, 1, 2, 3, 3, 2],
    "Vocal Clarity": [-2, -2, -1, 0, 1, 2, 3, 3, 1, 0],
    "Club PA": [4, 3, 0, -1, -2, -1, 0, 1, 2, 3],
    "Small Speaker": [-6, -3, 2, 3, 1, 0, 0, 1, 1, 0],
    "Lo-Fi Tape": [1, 2, 2, 1, 0, -1, -3, -6, -10, -12],
    "AM Radio": [-12, -12, -6, 0, 3, 4, 4, 0, -8, -12],
    "Night (low volume)": [4, 3, 1, 0, -1, -1, 0, 1, 2, 3]
  };
  var PRESET_SUB = { "Small Speaker": 0.6, "Trap 808": 0.25, "Flat": 0 };
  var KEY = "pfdj_peq_v1";
  var S = load();
  function load() {
    var d = { bypass: false, bands: PRESETS.Flat.slice(), preset: "Flat", sub: 0, iso: false, isoG: [0, 0, 0], isoK: [false, false, false], loud: false, head: true,
      sweep: "filter", latch: false, deck4: false, d4: { A: [0, 0, 0, 0], B: [0, 0, 0, 0] }, d4k: { A: [false, false, false, false], B: [false, false, false, false] }, user: {}, open: false };
    try { var o = JSON.parse(localStorage.getItem(KEY) || "null"); if (o) Object.keys(d).forEach(function (k) { if (o[k] !== undefined) d[k] = o[k]; }); } catch (e) {}
    if (!Array.isArray(d.bands) || d.bands.length !== 10) d.bands = PRESETS.Flat.slice();
    return d;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
  var N = null, XY = { x: 0, y: 0, down: false };
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var db2g = function (db) { return Math.pow(10, db / 20); };
  var BW = -3.0103; // Web Audio LP/HP Q is in dB: Butterworth (Q 0.7071) = −3.01 dB

  /* ---------------- audio graph ---------------- */
  function build(ctx, M) {
    if (N || !ctx || !M) return;
    var bq = function (type, f, q, g) { var b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q != null) b.Q.value = q; if (g != null) b.gain.value = g; return b; };
    var gn = function (v) { var g = ctx.createGain(); g.gain.value = v; return g; };
    var chain = function (arr) { for (var i = 0; i < arr.length - 1; i++) arr[i].connect(arr[i + 1]); return arr; };
    N = {};
    N.pin = gn(1); N.preAn = ctx.createAnalyser(); N.preAn.fftSize = 4096; N.preAn.smoothingTimeConstant = 0.75; N.pin.connect(N.preAn);
    N.dry = gn(0); N.wet = gn(1); N.mrg = gn(1);
    N.pin.connect(N.dry); N.dry.connect(N.mrg);
    // isolator (LR4 crossovers 300 Hz / 3 kHz; low band gets the 3 kHz allpass so the bands sum flat)
    N.isoDirect = gn(1); N.isoWet = gn(0); N.eqIn = gn(1);
    N.pin.connect(N.isoDirect); N.isoDirect.connect(N.eqIn);
    N.lo = chain([bq("lowpass", 300, BW), bq("lowpass", 300, BW), bq("allpass", 3000, 0.7071), gn(1)]);
    N.hp1 = chain([bq("highpass", 300, BW), bq("highpass", 300, BW)]);
    N.mid = chain([bq("lowpass", 3000, BW), bq("lowpass", 3000, BW), gn(1)]);
    N.hi = chain([bq("highpass", 3000, BW), bq("highpass", 3000, BW), gn(1)]);
    N.pin.connect(N.lo[0]); N.pin.connect(N.hp1[0]); N.hp1[1].connect(N.mid[0]); N.hp1[1].connect(N.hi[0]);
    [N.lo, N.mid, N.hi].forEach(function (c) { c[c.length - 1].connect(N.isoWet); });
    N.isoWet.connect(N.eqIn);
    // 10-band graphic (peaking, Q 1.4 ≈ one octave)
    N.bands = FREQS.map(function (f) { return bq("peaking", f, 1.4, 0); });
    N.eqIn.connect(N.bands[0]); chain(N.bands);
    // sub-bass enhancer: 50 Hz lift + psychoacoustic harmonics (2nd/3rd of the sub, so small speakers "hear" it)
    N.subPk = bq("peaking", 50, 0.9, 0); N.bands[9].connect(N.subPk);
    N.subSum = gn(1); N.subPk.connect(N.subSum);
    N.shp = ctx.createWaveShaper(); N.shp.curve = (function () { var n = 2048, c = new Float32Array(n); for (var i = 0; i < n; i++) { var x = i / (n - 1) * 2 - 1; c[i] = 0.6 * Math.tanh(3 * x) + 0.4 * Math.abs(x); } return c; })();
    N.harm = chain([bq("lowpass", 110, BW), bq("lowpass", 110, BW), gn(3), N.shp, bq("bandpass", 160, 0.8), bq("highpass", 70, BW), gn(0)]);
    N.bands[9].connect(N.harm[0]); N.harm[N.harm.length - 1].connect(N.subSum);
    // loudness (equal-loudness compensation that follows the master volume)
    N.loLo = bq("lowshelf", 100, null, 0); N.loHi = bq("highshelf", 10000, null, 0);
    N.head = gn(1);
    chain([N.subSum, N.loLo, N.loHi, N.head, N.wet, N.mrg]);
    // sweep FX
    N.swHp = bq("highpass", 10, 0); N.swLp = bq("lowpass", ctx.sampleRate / 2, 0); N.out = gn(1);
    chain([N.mrg, N.swHp, N.swLp, N.out]);
    N.send = gn(0); N.dly = ctx.createDelay(2); N.dly.delayTime.value = 0.375; N.fb = gn(0.45); N.dlyLp = bq("lowpass", 5000, 0); N.ewet = gn(0.8);
    N.swLp.connect(N.send); N.send.connect(N.dly); N.dly.connect(N.dlyLp); N.dlyLp.connect(N.fb); N.fb.connect(N.dly); N.dlyLp.connect(N.ewet); N.ewet.connect(N.out);
    N.postAn = ctx.createAnalyser(); N.postAn.fftSize = 4096; N.postAn.smoothingTimeConstant = 0.75; N.out.connect(N.postAn);
    // splice into the master
    try { M.bus.disconnect(M.vol); } catch (e) {}
    M.bus.connect(N.pin); N.out.connect(M.vol);
    // per-deck 4-band inserts
    N.d4 = {};
    P.DECKS.forEach(function (d) {
      if (!d.n || !d.n.high || !d.n.filt) return;
      var f = [bq("lowshelf", D4F[0], null, 0), bq("peaking", D4F[1], 1, 0), bq("peaking", D4F[2], 1, 0), bq("highshelf", D4F[3], null, 0)];
      try { d.n.high.disconnect(d.n.filt); } catch (e) {}
      d.n.high.connect(f[0]); chain(f); f[3].connect(d.n.filt);
      N.d4[d.id] = f;
    });
    applyAll(true);
    clearInterval(N.timer); N.timer = setInterval(tickSlow, 200);
  }
  function at(param, v, tc) { if (!N) return; var t = P.ctx.currentTime; param.cancelScheduledValues(t); param.setTargetAtTime(v, t, tc == null ? 0.02 : tc); }
  function applyAll(now) {
    if (!N) return;
    var tc = now ? 0.001 : 0.02;
    at(N.wet.gain, S.bypass ? 0 : 1, 0.01); at(N.dry.gain, S.bypass ? 1 : 0, 0.01);
    N.bands.forEach(function (b, i) { at(b.gain, S.bands[i], tc); });
    at(N.isoDirect.gain, S.iso ? 0 : 1, 0.01); at(N.isoWet.gain, S.iso ? 1 : 0, 0.01);
    [N.lo, N.mid, N.hi].forEach(function (c, i) { at(c[c.length - 1].gain, S.isoK[i] ? 0 : db2g(S.isoG[i]), 0.008); });
    at(N.subPk.gain, S.sub * 6, tc); at(N.harm[N.harm.length - 1].gain, S.sub * 0.6, tc);
    loudness();
    at(N.head.gain, S.head ? db2g(-0.6 * Math.max(0, maxBoost())) : 1, 0.05);
    Object.keys(N.d4).forEach(function (id) {
      N.d4[id].forEach(function (b, i) { at(b.gain, !S.deck4 ? 0 : S.d4k[id][i] ? -40 : S.d4[id][i], 0.01); });
    });
    sweepApply();
    paintState();
  }
  function loudness() {
    if (!N) return;
    var v = clamp(P.X.master, 0, 1), k = S.loud ? Math.pow(1 - v, 0.8) : 0;
    at(N.loLo.gain, k * 12, 0.1); at(N.loHi.gain, k * 6, 0.1);
    N.loudDb = [k * 12, k * 6];
  }
  function tickSlow() {
    loudness();
    if (S.sweep === "echo") { var b = echoBpm(); at(N.dly.delayTime, clamp(0.75 * 60 / b, 0.05, 1.9), 0.05); }
  }
  function echoBpm() {
    var best = null, bg = -1;
    P.DECKS.forEach(function (d) { if (d.playing && P.effBpm(d)) { var g = d.n ? d.n.xf.gain.value * d.n.fader.gain.value : 1; if (g > bg) { bg = g; best = P.effBpm(d); } } });
    return best || 120;
  }
  /* XY: x −1…1 (left = low-pass sweep down, right = high-pass sweep up), y 0…1 (resonance / echo amount) */
  function sweepApply() {
    if (!N) return;
    var x = XY.x, y = XY.y, nyq = P.ctx.sampleRate / 2, dz = 0.06;
    var lpF = x < -dz ? 20000 * Math.pow(70 / 20000, (-x - dz) / (1 - dz)) : nyq;
    var hpF = x > dz ? 20 * Math.pow(9000 / 20, (x - dz) / (1 - dz)) : 10;
    var q = S.sweep === "filter" ? y * 18 : 2;
    at(N.swLp.frequency, Math.min(lpF, nyq), 0.015); at(N.swHp.frequency, hpF, 0.015);
    at(N.swLp.Q, x < -dz ? q : 0, 0.015); at(N.swHp.Q, x > dz ? q : 0, 0.015);
    at(N.send.gain, S.sweep === "echo" ? y * 0.9 : 0, 0.03);
    at(N.fb.gain, S.sweep === "echo" ? 0.3 + 0.35 * y : 0.45, 0.05);
  }
  /* ---------------- response math (complex products of biquad responses) ---------------- */
  var RF = (function () { var n = 240, f = new Float32Array(n); for (var i = 0; i < n; i++) f[i] = 20 * Math.pow(1000, i / (n - 1)); return f; })();
  function cresp(b, f) { var m = new Float32Array(f.length), p = new Float32Array(f.length); b.getFrequencyResponse(f, m, p); return { m: m, p: p }; }
  function mul(acc, r) { for (var i = 0; i < acc.re.length; i++) { var a = acc.re[i], c = acc.im[i], mr = r.m[i] * Math.cos(r.p[i]), mi = r.m[i] * Math.sin(r.p[i]); acc.re[i] = a * mr - c * mi; acc.im[i] = a * mi + c * mr; } return acc; }
  function one(n) { var re = new Float32Array(n), im = new Float32Array(n); re.fill(1); return { re: re, im: im }; }
  function response(f, opts) {
    f = f || RF; opts = opts || {};
    if (!N) return null;
    var n = f.length, acc = one(n);
    if (S.iso && !opts.noIso) {
      var parts = [[N.lo, 3], [N.mid, 2], [N.hi, 2]], sum = { re: new Float32Array(n), im: new Float32Array(n) };
      parts.forEach(function (pp, k) {
        var c = one(n), g = S.isoK[k] ? 0 : db2g(S.isoG[k]);
        if (k > 0) { mul(c, cresp(N.hp1[0], f)); mul(c, cresp(N.hp1[1], f)); }
        for (var j = 0; j < pp[1]; j++) mul(c, cresp(pp[0][j], f));
        for (var i = 0; i < n; i++) { sum.re[i] += c.re[i] * g; sum.im[i] += c.im[i] * g; }
      });
      acc = sum;
    }
    if (opts.isoOnly) return toDb(acc);
    N.bands.forEach(function (b) { mul(acc, cresp(b, f)); });
    mul(acc, cresp(N.subPk, f));
    if (!opts.noLoud) { mul(acc, cresp(N.loLo, f)); mul(acc, cresp(N.loHi, f)); }
    return toDb(acc);
  }
  function toDb(acc) { var o = new Float32Array(acc.re.length); for (var i = 0; i < o.length; i++) o[i] = 20 * Math.log10(Math.max(1e-6, Math.hypot(acc.re[i], acc.im[i]))); return o; }
  function maxBoost() { // the gain targets are set but may not have arrived yet, so estimate from settings
    var m = 0; S.bands.forEach(function (g) { m = Math.max(m, g); }); return Math.max(m + S.sub * 3, S.iso ? Math.max.apply(null, S.isoG) : 0);
  }

  /* ---------------- UI ---------------- */
  function injectButton() {
    var t = document.querySelector("#mixer .mix-title");
    if (!t || $("peq-btn")) return;
    var b = document.createElement("button"); b.type = "button"; b.id = "peq-btn"; b.className = "mini peq-btn"; b.textContent = "PSYCHO EQ";
    b.title = "PSYCHO EQ — 10-band master EQ over a live spectrum analyzer, presets, sub-bass, isolator, Sweep FX, loudness, A/B";
    t.insertBefore(b, t.querySelector(".lim"));
    b.addEventListener("click", function () { setOpen(!S.open, true); });
  }
  function panelHTML() {
    var presetOpts = function () {
      var h = '<optgroup label="Presets">' + Object.keys(PRESETS).map(function (k) { return '<option>' + k + '</option>'; }).join("") + '</optgroup>';
      var u = Object.keys(S.user || {}); if (u.length) h += '<optgroup label="My presets">' + u.map(function (k) { return '<option value="u:' + esc(k) + '">' + esc(k) + '</option>'; }).join("") + '</optgroup>';
      return h + '<option value="__custom" hidden>Custom</option>';
    };
    return '<div class="peq-head"><span class="label">PSYCHO EQ</span><span class="peq-sub muted">master · after the decks, sampler & mic · before the limiter</span>' +
      '<div class="peq-hbtns"><button type="button" class="peq-ab" id="peq-ab" title="A = PSYCHO EQ on, B = bypass (instant compare, the Sweep FX stays on)"><b class="a">A</b><b class="b">B</b></button>' +
      '<button type="button" class="mini" id="peq-x" aria-label="Close PSYCHO EQ">✕</button></div></div>' +
      '<div class="peq-main"><div class="peq-spec"><canvas id="peq-cv" tabindex="0" aria-label="10-band EQ over the spectrum analyzer. Drag the handles; arrow keys pick a band and change its gain; double-click resets a band."></canvas><div class="peq-read mono" id="peq-read"></div></div>' +
      '<div class="peq-side">' +
      '<div class="peq-row"><label for="peq-preset">Preset</label><select id="peq-preset">' + presetOpts() + '</select></div>' +
      '<div class="peq-row"><button type="button" class="mini" id="peq-save">Save preset</button><button type="button" class="mini" id="peq-del" hidden>Delete</button><button type="button" class="mini" id="peq-flat">Flat</button></div>' +
      '<div class="peq-row sl"><label for="peq-subv">Sub-bass</label><input type="range" id="peq-subv" min="0" max="100" step="1"><span class="mono" id="peq-subo"></span></div>' +
      '<div class="peq-row"><button type="button" class="mini tg" id="peq-loud" title="Equal-loudness compensation: the quieter the master volume, the more low and high end it adds back">LOUDNESS</button><button type="button" class="mini tg" id="peq-head" title="Turns the EQ output down by part of its biggest boost, so boosting doesn\'t just slam the limiter">AUTO HEADROOM</button></div>' +
      '<div class="peq-row"><button type="button" class="mini tg" id="peq-iso" title="Isolator: splits the master into LOW / MID / HIGH with 24 dB/oct crossovers (300 Hz, 3 kHz) — each band can be killed completely">ISOLATOR</button><button type="button" class="mini tg" id="peq-d4" title="Adds a 4-band EQ to each deck strip (after its 3-band knobs)">DECK 4-BAND</button></div>' +
      '</div></div>' +
      '<div class="peq-iso" id="peq-isobox"></div>' +
      '<div class="peq-low"><div class="peq-fx"><div class="peq-fxhead"><span class="label">SWEEP FX</span><select id="peq-swm" aria-label="Sweep FX mode"><option value="filter">Filter + resonance</option><option value="echo">Filter + beat echo</option></select>' +
      '<button type="button" class="mini tg" id="peq-latch" title="Latch: the pad stays where you leave it (otherwise it springs back to the centre when you let go)">LATCH</button></div>' +
      '<div class="peq-xy" id="peq-xy" role="slider" tabindex="0" aria-label="Sweep FX pad: left = low-pass, right = high-pass, up = more resonance / echo"><span class="xy-l">◀ LOW-PASS</span><span class="xy-r">HIGH-PASS ▶</span><span class="xy-t" id="peq-xyt">RESONANCE ▲</span><span class="xy-dot" id="peq-dot"></span></div></div>' +
      '<div class="peq-d4" id="peq-d4box"></div></div>';
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function buildPanel() {
    if ($("peq")) return;
    var sec = document.createElement("section"); sec.className = "peq"; sec.id = "peq"; sec.hidden = true; sec.setAttribute("aria-label", "PSYCHO EQ");
    sec.innerHTML = panelHTML();
    var anchor = $("xfbar") || document.querySelector("main.console");
    anchor.parentNode.insertBefore(sec, anchor.nextSibling);
    // isolator
    $("peq-isobox").innerHTML = ["LOW", "MID", "HIGH"].map(function (l, i) {
      return '<div class="peq-isob"><span class="label">' + l + '</span><input type="range" min="-26" max="6" step="0.5" data-i="' + i + '" aria-label="Isolator ' + l + ' (dB)"><span class="mono" data-o="' + i + '"></span><button type="button" class="kill" data-k="' + i + '">KILL</button></div>';
    }).join("");
    $("peq-isobox").addEventListener("input", function (e) { var i = e.target.dataset.i; if (i == null) return; S.isoG[+i] = +e.target.value; S.isoK[+i] = false; applyAll(); save(); });
    $("peq-isobox").addEventListener("click", function (e) { var k = e.target.dataset.k; if (k == null) return; S.isoK[+k] = !S.isoK[+k]; if (!S.iso) { S.iso = true; } applyAll(); save(); });
    $("peq-isobox").addEventListener("dblclick", function (e) { var i = e.target.dataset.i; if (i == null) return; S.isoG[+i] = 0; applyAll(); save(); });
    // deck 4-band
    $("peq-d4box").innerHTML = '<div class="peq-fxhead"><span class="label">DECK 4-BAND</span><span class="muted">stacked after each strip\'s HI/MID/LOW</span></div>' + ["A", "B"].map(function (id) {
      return '<div class="peq-d4deck" data-deck="' + id + '"><b class="d4id">' + id + '</b>' + D4L.map(function (l, i) {
        return '<div class="d4b"><input type="range" min="-26" max="6" step="0.5" data-d="' + id + '" data-i="' + i + '" aria-label="Deck ' + id + ' ' + l + ' (dB)" orient="vertical"><span class="mono" data-o="' + id + i + '"></span><button type="button" class="kill" data-d="' + id + '" data-k="' + i + '">' + l + '</button></div>';
      }).join("") + '</div>';
    }).join("");
    $("peq-d4box").addEventListener("input", function (e) { var t = e.target; if (t.dataset.i == null) return; S.d4[t.dataset.d][+t.dataset.i] = +t.value; S.d4k[t.dataset.d][+t.dataset.i] = false; applyAll(); save(); });
    $("peq-d4box").addEventListener("click", function (e) { var t = e.target; if (t.dataset.k == null) return; S.d4k[t.dataset.d][+t.dataset.k] = !S.d4k[t.dataset.d][+t.dataset.k]; applyAll(); save(); });
    $("peq-d4box").addEventListener("dblclick", function (e) { var t = e.target; if (t.dataset.i == null) return; S.d4[t.dataset.d][+t.dataset.i] = 0; applyAll(); save(); });
    $("peq-x").addEventListener("click", function () { setOpen(false); });
    $("peq-ab").addEventListener("click", function () { setBypass(!S.bypass); });
    $("peq-preset").addEventListener("change", function (e) { setPreset(e.target.value); });
    $("peq-flat").addEventListener("click", function () { setPreset("Flat"); });
    $("peq-save").addEventListener("click", function () {
      var nm = (prompt("Name this preset:", S.preset && S.preset !== "Custom" && !PRESETS[S.preset] ? S.preset : "My EQ") || "").trim().slice(0, 40); if (!nm) return;
      S.user[nm] = { bands: S.bands.slice(), sub: S.sub }; S.preset = nm; save(); refreshPresets(); paintState(); P.toast("Saved EQ preset “" + nm + "”");
    });
    $("peq-del").addEventListener("click", function () { if (S.user[S.preset]) { delete S.user[S.preset]; S.preset = "Custom"; save(); refreshPresets(); paintState(); } });
    $("peq-subv").addEventListener("input", function (e) { S.sub = +e.target.value / 100; applyAll(); save(); });
    $("peq-loud").addEventListener("click", function () { S.loud = !S.loud; applyAll(); save(); });
    $("peq-head").addEventListener("click", function () { S.head = !S.head; applyAll(); save(); });
    $("peq-iso").addEventListener("click", function () { setIso(!S.iso); });
    $("peq-d4").addEventListener("click", function () { S.deck4 = !S.deck4; applyAll(); save(); });
    $("peq-swm").addEventListener("change", function (e) { S.sweep = e.target.value; sweepApply(); paintState(); save(); });
    $("peq-latch").addEventListener("click", function () { S.latch = !S.latch; if (!S.latch && !XY.down) { XY.x = 0; XY.y = 0; sweepApply(); } paintState(); save(); });
    xyInit(); cvInit();
  }
  function refreshPresets() {
    var sel = $("peq-preset"); if (!sel) return;
    var cur = sel.value; sel.innerHTML = panelHTML().match(/<select id="peq-preset">([\s\S]*?)<\/select>/)[1]; sel.value = cur;
  }
  function paintState() {
    var b = $("peq-btn");
    if (b) { b.classList.toggle("on", !!S.open); b.classList.toggle("live", !S.bypass && (S.bands.some(function (g) { return g; }) || S.sub > 0 || S.iso || S.loud || S.deck4)); }
    if (!$("peq")) return;
    $("peq-ab").classList.toggle("bypass", S.bypass);
    var sel = $("peq-preset"), v = PRESETS[S.preset] ? S.preset : S.user[S.preset] ? "u:" + S.preset : "__custom";
    if (sel.value !== v) sel.value = v;
    $("peq-del").hidden = !S.user[S.preset];
    $("peq-subv").value = Math.round(S.sub * 100); $("peq-subo").textContent = Math.round(S.sub * 100) + "%";
    $("peq-loud").classList.toggle("on", S.loud); $("peq-head").classList.toggle("on", S.head);
    $("peq-iso").classList.toggle("on", S.iso); $("peq-d4").classList.toggle("on", S.deck4);
    $("peq-isobox").classList.toggle("off", !S.iso);
    $("peq-isobox").querySelectorAll("input").forEach(function (r) { var i = +r.dataset.i; if (document.activeElement !== r) r.value = S.isoG[i]; $("peq-isobox").querySelector('[data-o="' + i + '"]').textContent = S.isoK[i] ? "KILL" : (S.isoG[i] > 0 ? "+" : "") + S.isoG[i] + " dB"; });
    $("peq-isobox").querySelectorAll(".kill").forEach(function (k) { k.classList.toggle("on", S.isoK[+k.dataset.k]); });
    $("peq-d4box").classList.toggle("off", !S.deck4);
    $("peq-d4box").querySelectorAll("input").forEach(function (r) { var id = r.dataset.d, i = +r.dataset.i; if (document.activeElement !== r) r.value = S.d4[id][i]; $("peq-d4box").querySelector('[data-o="' + id + i + '"]').textContent = S.d4k[id][i] ? "KILL" : (S.d4[id][i] > 0 ? "+" : "") + S.d4[id][i]; });
    $("peq-d4box").querySelectorAll(".kill").forEach(function (k) { k.classList.toggle("on", S.d4k[k.dataset.d][+k.dataset.k]); });
    $("peq-swm").value = S.sweep; $("peq-latch").classList.toggle("on", S.latch);
    $("peq-xyt").textContent = S.sweep === "echo" ? "ECHO ▲" : "RESONANCE ▲";
    var dot = $("peq-dot"); dot.style.left = ((XY.x + 1) / 2 * 100) + "%"; dot.style.top = ((1 - XY.y) * 100) + "%"; dot.classList.toggle("act", Math.abs(XY.x) > 0.06 || XY.y > 0.02);
    document.querySelectorAll(".strip").forEach(function (s) { s.classList.toggle("d4on", !!S.deck4); });
  }
  function setOpen(v, scroll) {
    S.open = !!v; save(); buildPanel();
    $("peq").hidden = !S.open; paintState();
    if (S.open) { P.ensureCtx(); if (P.ctx && P.M) build(P.ctx, P.M); requestAnimationFrame(draw); if (scroll) $("peq").scrollIntoView({ behavior: "smooth", block: "nearest" }); }
  }
  function setBypass(v) { S.bypass = !!v; applyAll(); save(); P.toast(S.bypass ? "PSYCHO EQ: B — bypassed (flat)" : "PSYCHO EQ: A — on"); }
  function setIso(v) { S.iso = !!v; applyAll(); save(); }
  function setPreset(name) {
    if (name === "__custom") return;
    if (name.indexOf("u:") === 0) { var u = S.user[name.slice(2)]; if (!u) return; S.bands = u.bands.slice(); S.sub = u.sub || 0; S.preset = name.slice(2); }
    else if (PRESETS[name]) { S.bands = PRESETS[name].slice(); if (PRESET_SUB[name] != null) S.sub = PRESET_SUB[name]; S.preset = name; }
    else return;
    applyAll(); save();
  }
  function setBand(i, db) { S.bands[i] = Math.round(clamp(db, -12, 12) * 2) / 2; S.preset = "Custom"; applyAll(); save(); }

  /* analyzer canvas + EQ curve with drag handles */
  var CV = { sel: -1, drag: -1, peaks: null };
  function fx(f, w) { return Math.log(f / 20) / Math.log(1000) * w; }
  function dbY(db, h) { return h * 0.5 - db / 15 * (h * 0.42); }
  function cvInit() {
    var cv = $("peq-cv");
    var hit = function (e) { var r = cv.getBoundingClientRect(), x = e.clientX - r.left, best = -1, bd = 1e9; FREQS.forEach(function (f, i) { var d = Math.abs(fx(f, r.width) - x); if (d < bd) { bd = d; best = i; } }); return { i: best, y: e.clientY - r.top, h: r.height }; };
    var setFromY = function (i, y, h) { setBand(i, (h * 0.5 - y) / (h * 0.42) * 15); };
    cv.addEventListener("pointerdown", function (e) { var h = hit(e); CV.drag = CV.sel = h.i; cv.setPointerCapture(e.pointerId); setFromY(h.i, h.y, h.h); e.preventDefault(); });
    cv.addEventListener("pointermove", function (e) { if (CV.drag < 0) return; var r = cv.getBoundingClientRect(); setFromY(CV.drag, e.clientY - r.top, r.height); });
    var up = function () { CV.drag = -1; }; cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
    cv.addEventListener("dblclick", function (e) { setBand(hit(e).i, 0); });
    cv.addEventListener("wheel", function (e) { var h = hit(e); e.preventDefault(); CV.sel = h.i; setBand(h.i, S.bands[h.i] + (e.deltaY < 0 ? 0.5 : -0.5)); }, { passive: false });
    cv.addEventListener("keydown", function (e) {
      if (CV.sel < 0) CV.sel = 0;
      if (e.key === "ArrowLeft") CV.sel = Math.max(0, CV.sel - 1); else if (e.key === "ArrowRight") CV.sel = Math.min(9, CV.sel + 1);
      else if (e.key === "ArrowUp") setBand(CV.sel, S.bands[CV.sel] + 0.5); else if (e.key === "ArrowDown") setBand(CV.sel, S.bands[CV.sel] - 0.5);
      else if (e.key === "0" || e.key === "Delete") setBand(CV.sel, 0); else return;
      e.preventDefault();
    });
  }
  function draw() {
    if (!S.open || !$("peq") || $("peq").hidden) return;
    requestAnimationFrame(draw);
    var cv = $("peq-cv"), dpr = Math.min(2, window.devicePixelRatio || 1), w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) return;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    var g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    // grid
    g.strokeStyle = "#232a3a"; g.lineWidth = 1; g.font = "10px ui-monospace, monospace"; g.fillStyle = "#5d6680";
    [50, 100, 200, 500, 1000, 2000, 5000, 10000].forEach(function (f) { var x = Math.round(fx(f, w)) + 0.5; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); });
    [-12, -6, 0, 6, 12].forEach(function (db) { var y = Math.round(dbY(db, h)) + 0.5; g.strokeStyle = db ? "#232a3a" : "#3a4256"; g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); g.fillText((db > 0 ? "+" : "") + db, 3, y - 2); });
    // spectrum
    if (N) {
      var sr = P.ctx.sampleRate, nb = Math.max(48, Math.min(160, Math.round(w / 6)));
      var spec = function (an) { var a = new Float32Array(an.frequencyBinCount); an.getFloatFrequencyData(a); return a; };
      var post = spec(N.postAn), pre = spec(N.preAn), bins = post.length, hz = sr / 2 / bins;
      var band = function (arr, i) { var f0 = 20 * Math.pow(1000, i / nb), f1 = 20 * Math.pow(1000, (i + 1) / nb), b0 = Math.max(1, Math.floor(f0 / hz)), b1 = Math.max(b0 + 1, Math.ceil(f1 / hz)), m = -140; for (var b = b0; b < b1 && b < bins; b++) m = Math.max(m, arr[b]); return m; };
      var lvlY = function (db) { return h - clamp((db + 100) / 90, 0, 1) * h; }; // −100…−10 dBFS
      if (!CV.peaks || CV.peaks.length !== nb) CV.peaks = new Float32Array(nb).fill(-140);
      var grad = g.createLinearGradient(0, h, 0, 0); grad.addColorStop(0, "#22d3ee55"); grad.addColorStop(0.6, "#a78bfa88"); grad.addColorStop(1, "#f43f5ecc");
      g.fillStyle = grad; var bw = w / nb;
      for (var i = 0; i < nb; i++) {
        var v = band(post, i), y = lvlY(v); g.fillRect(i * bw + 0.5, y, Math.max(1, bw - 1.5), h - y);
        CV.peaks[i] = Math.max(v, CV.peaks[i] - 0.6); g.fillStyle = "#e6e9f0aa"; g.fillRect(i * bw + 0.5, lvlY(CV.peaks[i]) - 1, Math.max(1, bw - 1.5), 1.5); g.fillStyle = grad;
      }
      g.strokeStyle = "#8a93a866"; g.lineWidth = 1; g.beginPath();
      for (i = 0; i < nb; i++) { var yy = lvlY(band(pre, i)); if (i) g.lineTo((i + 0.5) * bw, yy); else g.moveTo((i + 0.5) * bw, yy); }
      g.stroke();
      // response curve
      var r = response(RF);
      if (r) {
        g.lineWidth = 2.2; g.strokeStyle = S.bypass ? "#5d6680" : "#fbbf24"; g.beginPath();
        for (i = 0; i < RF.length; i++) { var cx = fx(RF[i], w), cy = dbY(clamp(r[i], -15, 15), h); if (i) g.lineTo(cx, cy); else g.moveTo(cx, cy); }
        g.stroke();
        g.lineTo(w, dbY(0, h)); g.lineTo(0, dbY(0, h)); g.closePath(); g.fillStyle = S.bypass ? "#5d668011" : "#fbbf2418"; g.fill();
      }
      if (Math.abs(XY.x) > 0.06) { // Sweep FX filter on top (dashed)
        var sm = cresp(N.swLp, RF), sh = cresp(N.swHp, RF);
        g.setLineDash([5, 4]); g.lineWidth = 1.6; g.strokeStyle = "#f472b6"; g.beginPath();
        for (i = 0; i < RF.length; i++) { var sx = fx(RF[i], w), sy = dbY(clamp(20 * Math.log10(Math.max(1e-6, sm.m[i] * sh.m[i])), -15, 15), h); if (i) g.lineTo(sx, sy); else g.moveTo(sx, sy); }
        g.stroke(); g.setLineDash([]);
      }
    }
    // handles + labels
    FREQS.forEach(function (f, i) {
      var x = fx(f, w), y = dbY(S.bands[i], h);
      g.fillStyle = i === CV.sel ? "#fbbf24" : "#0b0d12"; g.strokeStyle = "#fbbf24"; g.lineWidth = 2;
      g.beginPath(); g.arc(x, y, i === CV.sel ? 7 : 5.5, 0, Math.PI * 2); g.fill(); g.stroke();
      g.fillStyle = "#8a93a8"; g.textAlign = "center"; g.fillText(FLBL[i], clamp(x, 12, w - 12), h - 4); g.textAlign = "left";
    });
    var rd = $("peq-read");
    if (rd) rd.textContent = (S.bypass ? "B · BYPASS" : "A · " + (S.preset || "Custom")) + (CV.sel >= 0 ? " · " + FLBL[CV.sel] + " Hz " + (S.bands[CV.sel] > 0 ? "+" : "") + S.bands[CV.sel] + " dB" : "") +
      (S.loud && N && N.loudDb ? " · loudness +" + N.loudDb[0].toFixed(1) + "/+" + N.loudDb[1].toFixed(1) + " dB" : "") + (S.head && N ? " · headroom " + (20 * Math.log10(N.head.gain.value)).toFixed(1) + " dB" : "");
  }
  /* XY pad */
  function xyInit() {
    var pad = $("peq-xy");
    var setXY = function (e) { var r = pad.getBoundingClientRect(); XY.x = clamp((e.clientX - r.left) / r.width * 2 - 1, -1, 1); XY.y = clamp(1 - (e.clientY - r.top) / r.height, 0, 1); P.ensureCtx(); if (P.ctx && P.M) build(P.ctx, P.M); sweepApply(); paintState(); };
    pad.addEventListener("pointerdown", function (e) { XY.down = true; pad.setPointerCapture(e.pointerId); setXY(e); e.preventDefault(); });
    pad.addEventListener("pointermove", function (e) { if (XY.down) setXY(e); });
    var up = function () { if (!XY.down) return; XY.down = false; if (!S.latch) { XY.x = 0; XY.y = 0; sweepApply(); paintState(); } };
    pad.addEventListener("pointerup", up); pad.addEventListener("pointercancel", up); pad.addEventListener("lostpointercapture", up);
    pad.addEventListener("keydown", function (e) {
      var k = { ArrowLeft: [-0.05, 0], ArrowRight: [0.05, 0], ArrowUp: [0, 0.05], ArrowDown: [0, -0.05] }[e.key];
      if (e.key === "Escape" || e.key === "0") { XY.x = 0; XY.y = 0; } else if (k) { XY.x = clamp(XY.x + k[0], -1, 1); XY.y = clamp(XY.y + k[1], 0, 1); } else return;
      e.preventDefault(); P.ensureCtx(); if (P.ctx && P.M) build(P.ctx, P.M); sweepApply(); paintState();
    });
  }

  injectButton();
  P.on("ctx", function (ctx, M) { build(ctx, M); });
  if (P.ctx && P.M) build(P.ctx, P.M);
  if (S.open) setOpen(true); else paintState();
  // the master knob changes loudness compensation immediately
  P.on("master", loudness);

  window.PFEQ = {
    S: S, PRESETS: PRESETS, FREQS: FREQS, open: setOpen, setBand: setBand, setPreset: setPreset, setBypass: setBypass, setIso: setIso,
    setIsoBand: function (i, db, kill) { S.isoG[i] = db; S.isoK[i] = !!kill; applyAll(); save(); },
    setSub: function (v) { S.sub = clamp(v, 0, 1); applyAll(); save(); }, setLoud: function (v) { S.loud = !!v; applyAll(); save(); },
    setDeck4: function (on, id, i, db, kill) { S.deck4 = !!on; if (id) { S.d4[id][i] = db; S.d4k[id][i] = !!kill; } applyAll(); save(); },
    sweep: function (x, y, mode) { if (mode) S.sweep = mode; XY.x = clamp(x, -1, 1); XY.y = clamp(y, 0, 1); sweepApply(); paintState(); },
    response: function (f, o) { return response(f ? new Float32Array(f) : RF, o); }, get N() { return N; },
    info: function () { return { built: !!N, open: S.open, bypass: S.bypass, preset: S.preset, bands: S.bands.slice(), sub: S.sub, iso: S.iso, loud: S.loud, deck4: S.deck4,
      wet: N ? N.wet.gain.value : null, dry: N ? N.dry.gain.value : null, lp: N ? N.swLp.frequency.value : null, hp: N ? N.swHp.frequency.value : null, send: N ? N.send.gain.value : null, head: N ? N.head.gain.value : null, xy: [XY.x, XY.y] }; }
  };
})();
