/* Tap debug: only with ?tapdebug=1 in the URL (otherwise this returns immediately and does nothing).
 * Draws a dot at every touch (blue = pointerdown/touchstart, orange = pointerup/touchend, green = click) and keeps a small
 * log of what was under the finger, the event target, defaultPrevented and pointerdown→click time. "Copy log" copies it. */
(function tapDebug() {
  if (!/[?&]tapdebug=1(&|$)/.test(location.search)) return;
  var LOG = [], ALL = [], t0 = 0, panel, list, start = Date.now();
  function desc(el) {
    if (!el || !el.tagName) return "none";
    var s = el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + (typeof el.className === "string" && el.className.trim() ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : "");
    var b = el.closest && el.closest("button, a, select, label, input, [role=button]");
    var txt = ((b || el).textContent || (b || el).value || "").replace(/\s+/g, " ").trim().slice(0, 18);
    return (s.length > 34 ? s.slice(0, 34) + "…" : s) + (txt ? " “" + txt + "”" : "");
  }
  function css() {
    var st = document.createElement("style");
    st.textContent = ".td-dot{position:fixed;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;pointer-events:none;z-index:2147483646;opacity:.9;transition:opacity 1.2s ease,transform 1.2s ease}" +
      ".td-dot.down{background:#38bdf8}.td-dot.up{background:#fb923c;width:12px;height:12px;margin:-6px 0 0 -6px}.td-dot.click{background:transparent;border:3px solid #22c55e;width:26px;height:26px;margin:-13px 0 0 -13px}.td-dot.fade{opacity:0;transform:scale(1.8)}" +
      ".td-panel{position:fixed;top:4px;right:4px;z-index:2147483647;width:min(380px,92vw);background:rgba(0,0,0,.72);color:#e5e7eb;font:11px/1.35 ui-monospace,Menlo,monospace;border:1px solid #f59e0b;border-radius:8px;padding:4px 6px;pointer-events:none}" +
      ".td-panel .td-badge{display:inline-block;background:#f59e0b;color:#000;font-weight:700;padding:1px 6px;border-radius:4px;margin-right:6px}" +
      ".td-panel .td-copy{pointer-events:auto;font:600 12px system-ui;padding:6px 10px;margin-left:4px;border-radius:6px;border:1px solid #f59e0b;background:#1f1600;color:#fde68a}" +
      ".td-panel ol{margin:4px 0 0;padding:0;list-style:none}.td-panel li{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.td-panel li.bad{color:#f87171}";
    document.head.appendChild(st);
  }
  function build() {
    css();
    panel = document.createElement("div"); panel.className = "td-panel"; panel.setAttribute("aria-hidden", "true");
    panel.innerHTML = '<span class="td-badge">TAP DEBUG</span><span class="td-sum"></span><button type="button" class="td-copy">Copy log</button><ol></ol>';
    list = panel.querySelector("ol");
    panel.querySelector(".td-copy").addEventListener("click", function (e) {
      e.stopPropagation();
      var txt = "Beat tap debug · " + navigator.userAgent + " · " + innerWidth + "x" + innerHeight + " @" + devicePixelRatio + "x · " + location.href + "\n" + ALL.join("\n");
      var done = function () { e.target.textContent = "Copied ✓"; setTimeout(function () { e.target.textContent = "Copy log"; }, 1500); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, fallback); else fallback();
      function fallback() { var ta = document.createElement("textarea"); ta.value = txt; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); done(); } catch (x) { /* ignore */ } ta.remove(); }
    });
    document.body.appendChild(panel);
  }
  function dot(x, y, cls) {
    if (!document.body) return;
    var d = document.createElement("div"); d.className = "td-dot " + cls; d.style.left = x + "px"; d.style.top = y + "px";
    document.body.appendChild(d);
    requestAnimationFrame(function () { requestAnimationFrame(function () { d.classList.add("fade"); }); });
    setTimeout(function () { d.remove(); }, 1400);
  }
  var lastDown = 0, clicked = true;
  function onEv(e) {
    if (panel && panel.contains(e.target)) return;
    var p = e.changedTouches && e.changedTouches[0] ? e.changedTouches[0] : e, x = Math.round(p.clientX || 0), y = Math.round(p.clientY || 0);
    var now = performance.now(), extra = "";
    if (e.type === "pointerdown") { if (!clicked && lastDown) note("⚠ previous tap got NO click"); lastDown = now; clicked = false; }
    if (e.type === "click") {
      clicked = true; extra = lastDown ? " +" + Math.round(now - lastDown) + "ms" : "";
      var t1 = window.IPBBeats && IPBBeats.audioDebug ? IPBBeats.audioDebug().t : null;
      setTimeout(function () { // where does the sound die? context state, clock moving, gains, peak level 300 ms later
        try {
          var A = window.IPBBeats && IPBBeats.audioDebug ? IPBBeats.audioDebug() : null;
          if (!A) return;
          if (!A.state) { note("  audio: " + A.ctx, false); return; }
          var gs = Object.keys(A.groups).map(function (k) { var x = A.groups[k]; return k + " " + x.v + (x.pk ? "/" + x.pk : ""); }).join(", ");
          var bad = A.state !== "running" || A.t === t1 || A.fader === 0 || A.masterMix === 0 || A.spk === 0;
          note("  audio: " + A.state + " " + A.sr + "Hz clock " + (A.t === t1 ? "STUCK " : "") + A.t + "s master " + A.masterMix + " fader " + A.fader + " spk " + A.spk +
            " PEAK " + A.peak + (A.playing ? " playing" : "") + (A.preview ? " preview" : "") + " | mix: " + gs, bad);
        } catch (x) { note("  audio: debug error " + x.message, true); }
      }, 300);
    }
    dot(x, y, /down|start/.test(e.type) ? "down" : e.type === "click" ? "click" : "up");
    var under = document.elementFromPoint(x, y), tgt = e.target;
    // read defaultPrevented after the page's own handlers ran
    setTimeout(function () {
      var line = ((Date.now() - start) / 1000).toFixed(1) + "s " + e.type + (e.pointerType ? "(" + e.pointerType + ")" : "") + " " + x + "," + y +
        " under=" + desc(under) + (tgt !== under ? " target=" + desc(tgt) : "") + (e.defaultPrevented ? " PREVENTED" : "") + extra;
      note(line, e.defaultPrevented);
    }, 0);
  }
  function note(line, bad) {
    ALL.push(line); if (ALL.length > 4000) ALL.shift();
    if (!list) return;
    LOG.push([line, bad || /^⚠/.test(line)]); if (LOG.length > 8) LOG.shift();
    list.innerHTML = ""; LOG.forEach(function (l) { var li = document.createElement("li"); li.textContent = l[0]; if (l[1]) li.className = "bad"; list.appendChild(li); });
  }
  ["pointerdown", "pointerup", "touchstart", "touchend", "click"].forEach(function (t) { window.addEventListener(t, onEv, { capture: true, passive: true }); });
  window.addEventListener("error", function (e) { note("⚠ JS error: " + (e.message || e) + " @" + (e.lineno || "")); });
  window.addEventListener("unhandledrejection", function (e) { note("⚠ promise error: " + (e.reason && e.reason.message || e.reason)); });
  if (document.body) build(); else document.addEventListener("DOMContentLoaded", build);
  /* sample trigger log: every sample start (source, tab, lead vs its scheduled time, ready / fallback, voices) + a 2 s
     audio summary (render capacity / underruns where Chrome reports them). Problem triggers are shown in red. */
  var AC = null, win = { n: 0, late: 0, worst: null, vmax: 0, flags: 0 }, lastBy = {}, rcv = null, pb0 = null;
  function tabName() { var t = document.querySelector(".tab.active"); return t ? t.dataset.tab : "?"; }
  window.__ipbTD = {
    all: function () { return ALL.slice(); }, log: function (l, bad) { note(l, bad); },
    setCtx: function (c) {
      AC = c;
      try { if (c.renderCapacity) { c.renderCapacity.addEventListener("update", function (e) { rcv = { avg: e.averageLoad, peak: e.peakLoad, under: e.underrunRatio }; }); c.renderCapacity.start({ updateInterval: 1 }); } } catch (x) { /* not in this Chrome */ }
      note("audio context " + c.sampleRate + " Hz, base latency " + Math.round((c.baseLatency || 0) * 1000) + " ms" + (c.renderCapacity ? ", render capacity on" : "") + (c.playbackStats ? ", playback stats on" : ""));
    },
    trig: function (o) {
      if (!AC) return;
      var now = AC.currentTime, lead = Math.round((o.when - now) * 1000), k = o.src + "#" + (o.pad == null ? "" : o.pad) + (o.note == null ? "" : "n" + o.note);
      var dbl = lastBy[k] != null && Math.abs(o.when - lastBy[k]) < 0.025 && o.kind !== "glide"; lastBy[k] = o.when;
      var bad = lead < 0 || o.fallback || o.ready === false || dbl || (o.voices || 0) > 24;
      win.n++; if (lead < 0) win.late++; if (win.worst == null || lead < win.worst) win.worst = lead; win.vmax = Math.max(win.vmax, o.voices || 0); if (bad) win.flags++;
      var line = "♪ " + (o.kind || "hit") + " " + o.src + (o.pad != null ? " pad" + (o.pad + 1) : "") + (o.note != null ? " note " + o.note : "") + " tab=" + tabName() + " lead " + lead + "ms" + (lead < 0 ? " LATE" : "") +
        (o.ready === false ? " NOT-READY(" + (o.why || "decoding") + ")" : "") + (o.fallback ? " FALLBACK(" + o.fallback + ")" : "") + (dbl ? " DOUBLE-TRIGGER" : "") +
        " voices " + (o.voices || 0) + (o.rate && Math.abs(o.rate - 1) > 0.001 ? " rate " + o.rate.toFixed(3) : "") + (o.dur ? " len " + o.dur.toFixed(2) + "s" : "") + (o.off ? " trim " + Math.round(o.off * 1000) + "ms" : "");
      if (bad) note(line, true); else { ALL.push(line); if (ALL.length > 4000) ALL.shift(); }
    }
  };
  setInterval(function () {
    if (!AC || !win.n) return;
    var pb = "";
    try { var ps = AC.playbackStats; if (ps) { var u = ps.underrunEvents, d = ps.underrunDuration; if (pb0) pb = " underruns +" + (u - pb0.u) + " (" + Math.round((d - pb0.d) * 1000) + "ms)"; pb0 = { u: u, d: d }; } } catch (x) { /* n/a */ }
    var rc = rcv ? " load avg " + Math.round(rcv.avg * 100) + "% peak " + Math.round(rcv.peak * 100) + "% underrun " + (rcv.under * 100).toFixed(1) + "%" : "";
    note("audio 2s: " + win.n + " triggers, late " + win.late + ", min lead " + win.worst + "ms, max voices " + win.vmax + (win.flags ? ", " + win.flags + " flagged" : "") + rc + pb, win.late > 0 || (rcv && rcv.under > 0));
    win = { n: 0, late: 0, worst: null, vmax: 0, flags: 0 };
  }, 2000);
})();
/* Island Pin Beats — Web Audio beat maker. Drums: synthesis + a few small CC0 one-shots (samples/CREDITS.md). No paid APIs. */
(function () {
  "use strict";
  if (window.IPB_FRESH_MODE) return; // /beats/?fresh=1: the Start-fresh dialog runs instead (fresh.js); nothing opens the saved data

  var SR = 44100;
  var STEPS = 16;          // steps per bar (16ths)
  var MAXLEN = 32;         // a pattern holds up to 2 bars
  var SESSION_KEY = "ipb_session_v1";
  var GROUPS = [
    { id: "drums", name: "Drums" },
    { id: "bass", name: "808" },
    { id: "hats", name: "Hats" },
    { id: "perc", name: "Perc / FX" },
    { id: "keys", name: "Keys" },
    { id: "piano", name: "Piano Roll" },   // piano-roll instruments (skip the drum bus, like Keys)
    { id: "inst", name: "Instrumental" }   // loaded backing track (skips the drum bus, like Keys)
  ];
  var PAD_KEYS = ["z", "x", "c", "v", "b", "n", "m", ","];
  var D = window.IPBDrums;            // kit library + offline pad renderer (drums.js)
  var PD = window.IPBPianoData;       // piano-roll pattern format + library (pianoroll-data.js)
  var PK = window.IPBKeys;            // melodic instruments (keys-instruments.js)
  var FXC = window.IPBFx;             // shared track effects, channel fix, loudness (fx-chain.js)
  var FEEL = window.IPBFeel;          // Feel engine: velocity tone, micro-timing, variation (humanize.js)
  var LIB = window.IPBLibrary;        // instrument library + Swap (library.js, library/manifest.json)
  var MATCH = window.IPBMatch;        // Match to beat: loop stretch + vocal tighten (match.js / match-worker.js)
  /* ---- sample previews: their own "Samples" bus (normalized, user volume, soft limiter) → master fader (pre-limiter).
     Remembered per device. Previews never touch the transport or the AudioContext. */
  var SV_KEY = "ipb_samplevol", MT_KEY = "ipb_match", SV_DEF = 70, PREV_LUFS = -20, PV = null;
  function sampleVol() { var r = null; try { r = localStorage.getItem(SV_KEY); } catch (e) { /* private mode */ } var v = r == null ? SV_DEF : +r; return isFinite(v) ? clamp(v, 0, 100) : SV_DEF; }
  function svGain(v) { v = v == null ? sampleVol() : v; return v <= 0 ? 0 : Math.pow(v / SV_DEF, 2); } // 70 % = 0 dB on the (already normalized) preview
  function svDb(v) { var g = svGain(v); return g <= 0 ? "off" : (g >= 1 ? "+" : "") + (20 * Math.log10(g)).toFixed(1) + " dB"; }
  function setSampleVol(v) {
    v = clamp(Math.round(+v), 0, 100);
    try { localStorage.setItem(SV_KEY, String(v)); } catch (e) { /* private mode */ }
    if (PV && ctx) PV.fader.gain.setTargetAtTime(svGain(v), ctx.currentTime, 0.02);
    svUI();
  }
  function svUI() {
    var v = sampleVol();
    document.querySelectorAll(".js-samplevol").forEach(function (r) { if (+r.value !== v) r.value = v; });
    document.querySelectorAll(".js-samplevol-val").forEach(function (o) { o.textContent = v + "%"; o.title = svDb(v); });
  }
  function matchCfg() { var o = {}; try { o = JSON.parse(localStorage.getItem(MT_KEY) || "{}") || {}; } catch (e) { o = {}; } return { sync: o.sync !== false, key: !!o.key }; }
  function setMatch(k, v) {
    var m = matchCfg(); m[k] = !!v;
    try { localStorage.setItem(MT_KEY, JSON.stringify(m)); } catch (e) { /* private mode */ }
    matchUI();
    toast(k === "sync" ? (v ? "Match to beat ON: loops follow the song BPM (pitch kept), previews start on the grid" : "Match to beat OFF: loops play at their own speed (old behaviour), previews start right away")
      : (v ? "Match key ON: loops are transposed to the song key" : "Match key OFF: loops keep their own key"));
  }
  function matchUI() {
    var m = matchCfg();
    document.querySelectorAll(".js-match").forEach(function (b) { var on = !!m[b.dataset.k]; b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on)); });
  }
  function pvEnsure() {
    if (PV) return PV;
    if (!ctx || !LG) return null;
    PV = { inp: ctx.createGain(), fader: ctx.createGain(), lim: ctx.createDynamicsCompressor(), trim: ctx.createGain(), an: ctx.createAnalyser() };
    PV.fader.gain.value = svGain();
    PV.lim.threshold.value = -10; PV.lim.knee.value = 4; PV.lim.ratio.value = 20; PV.lim.attack.value = 0.001; PV.lim.release.value = 0.12;
    PV.trim.gain.value = dbGain(-makeupDb(-10, 20)); // compressors add make-up gain: take it back out
    PV.an.fftSize = 512;
    PV.inp.connect(PV.fader); PV.fader.connect(PV.lim); PV.lim.connect(PV.trim); PV.trim.connect(PV.an); PV.an.connect(LG.fader);
    return PV;
  }
  /* short-term max loudness (LUFS, as heard: a mono file plays on both sides) of a decoded library sound, cached */
  function bufLoud(b) {
    if (!b) return -70;
    if (b._ipbL != null) return b._ipbL;
    var sr = b.sampleRate, chs = [], n = Math.min(b.length, sr * 12); // the first 12 s are plenty
    for (var c = 0; c < b.numberOfChannels; c++) chs.push(FXC.kFilter(b.getChannelData(c).subarray(0, n), sr));
    var bl = FXC.blocks(chs, sr, 0.4, 0.1), mx = 0;
    for (var i = 0; i < bl.length; i++) if (bl[i] > mx) mx = bl[i];
    var L = mx > 0 ? -0.691 + 10 * Math.log10(mx) + (b.numberOfChannels === 1 ? 3.01 : 0) : -70;
    try { b._ipbL = L; } catch (e) { /* frozen */ }
    return L;
  }
  function sndLoud(snd) {
    if (!snd || !snd.zones || !snd.zones.length) return null;
    var z = snd.it.k === "multi" ? LIB.zone(snd, 60, 0.8) : snd.zones[0];
    return bufLoud(z && z.buf);
  }
  /* gain that brings a library sound to the preview loudness (synth presets: fixed) */
  function sndNorm(snd) { var L = sndLoud(snd); return L == null ? 0.45 : dbGain(clamp(PREV_LUFS - L, -30, 12)); }
  function pvDest(norm) { unpark(); var P = pvEnsure(); if (!P) return null; var g = ctx.createGain(); g.gain.value = norm; g.connect(P.inp); return g; }
  /* key shift (semitones, −6…+5) from a loop's key ("Ebm", "G") to the song key */
  var KEYIX = { C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5, "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11 };
  function keyShift(k) {
    if (!k || S.songKey == null) return 0;
    var r = KEYIX[String(k).replace(/m$/, "")]; if (r == null) return 0;
    var d = ((S.songKey - r) % 12 + 12) % 12; return d > 6 ? d - 12 : d;
  }
  /* how a library loop plays: { buf, rate } — Match to beat: time-stretched to the song BPM (pitch kept, quality WSOLA
     in a worker, cached); until the stretch is ready (first ~0.1 s) it falls back to the old speed change */
  function loopPlay(it, buf) {
    var m = matchCfg(), r0 = S.bpm / (it.bpm || S.bpm);
    if (!m.sync || !MATCH) return { buf: buf, rate: r0, ready: true };
    var semi = m.key ? keyShift(it.key) : 0, pr = Math.pow(2, semi / 12), F = pr / r0, sb = MATCH.readyStretch(buf, F);
    if (sb) return { buf: sb, rate: pr, ready: true };
    if (ctx) MATCH.stretchBuffer(ctx, buf, F).catch(function () { /* worker unavailable: speed change stays */ });
    return { buf: buf, rate: r0, ready: false };
  }
  var LY = window.IPBLayers;          // tweakable layers: per-layer knobs + one shared chain per layer (layers.js)
  var PIANO_LIB_KEY = "ipb_piano_lib_v1";
  function instOk(id) { return !!PK.BY_ID[id]; }
  var DEFAULT_KIT = "qb";
  var SLOT_IDS = ["A", "B", "C", "D"];
  var TOOL_VEL = { acc: 1, hit: 0.8, ghost: 0.45 };

  function mf(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function $(id) { return document.getElementById(id); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  /* ---------------- Kits (library lives in drums.js) ---------------- */
  function kitId(id) { id = D.ALIAS[id] || id; return D.BY_ID[id] ? id : DEFAULT_KIT; }
  function kitDef(id) { return D.BY_ID[kitId(id || S.kit)]; }
  function padDef(i) { return kitDef(S.kit).pads[i]; }
  function kitName(id) { var k = D.BY_ID[D.ALIAS[id] || id]; return k ? k.name : (id ? String(id) : ""); }
  function groupOf(i) { return padDef(i).g; }
  /* swing: stored as % of a 16th (0–60, as before); shown MPC-style (50 % = straight, 62 % = QB bounce) */
  function mpcSwing(sw) { return Math.round(50 + sw / 2); }
  function swingFromMpc(p) { return clamp(Math.round((p - 50) * 2), 0, 60); }
  function padBase(def) { return { pan: def.pan || 0, nudge: def.nudge || 0 }; }
  function defaultPadCfg(def) { return LY.defaults("drum", padBase(def)); } // tune / fine / decay / filter / level / pan / drive / nudge
  function padCfg(i, kit) {
    kit = kitId(kit || S.kit);
    var all = S.padCfg[kit] || (S.padCfg[kit] = []);
    return all[i] || (all[i] = defaultPadCfg(D.BY_ID[kit].pads[i]));
  }
  function cleanPadCfg(src) {
    var out = {};
    Object.keys(src || {}).forEach(function (k) {
      if (!D.BY_ID[k] || !Array.isArray(src[k])) return;
      out[k] = src[k].slice(0, 16).map(function (c, i) {
        return LY.clean(c, "drum", padBase(D.BY_ID[k].pads[i])); // older saves: missing knobs → defaults
      });
    });
    return out;
  }
  /* ---------------- State ---------------- */
  /* ---------------- State ---------------- */
  function emptyGrid(v) {
    var p = [];
    for (var i = 0; i < 16; i++) p.push(new Array(MAXLEN).fill(v || 0));
    return p;
  }
  function emptyPattern() { return emptyGrid(0); }
  /* a pattern slot: roll count per step (0 = off, 1 = hit, 2 = 32nd roll, 3 = triplet roll), velocity, note offset, slide */
  function newSlot(len) { return { len: len === 32 ? 32 : 16, pattern: emptyGrid(0), vel: emptyGrid(0.8), note: emptyGrid(0), slide: emptyGrid(0) }; }
  function defaultMixer() {
    var m = { master: { v: 0.85, m: false } };
    GROUPS.forEach(function (g) { m[g.id] = { v: g.id === "keys" ? 0.7 : g.id === "piano" ? 0.8 : 0.85, m: false }; });
    m.vocal = { v: 0.9, m: false };
    return m;
  }
  function defaultChordTrack() {
    // Cm – Ab – Fm – G7 (indices into CHORDS), off until the user or a preset turns it on
    return { on: false, prog: [6, 10, 8, 15], bars: 2, sound: "pad", bassFollow: false, lx: LY.defaults("mel") };
  }
  var S = {
    kit: DEFAULT_KIT,
    bpm: 90,
    swing: 24,
    feel: "natural",   // Feel engine (humanize.js): off | tight | natural | live
    slots: { A: newSlot(16), B: newSlot(16), C: newSlot(16), D: newSlot(16) },
    slot: "A",
    pattern: null, vel: null, note: null, slide: null, // views of the current slot
    padCfg: {},           // kit id → per-pad tune / decay / level / pan / drive / nudge
    kitSwing: {},         // kit id → swing (each kit remembers its own)
    mute: new Array(16).fill(false),
    solo: new Array(16).fill(false),
    mixer: defaultMixer(),
    sel: 0,
    chordTrack: defaultChordTrack(),
    structure: null,      // id in STRUCTURES, or null = plain loop
    cueBar: 0,            // bar the transport starts from
    lyricSong: "streets", // song shown in Lyrics / Teleprompter
    bpl: "auto",          // teleprompter bars per line ("auto" = fit song sections)
    prSize: 1,
    vox: { fxOff: false, tight: { on: false, str: 0.5 }, nudge: 0, monitor: false, dry: false, clean: true, aec: true, raw: true, spk: 80, guide: false,
      pan: 0, wide: false, fx: null, auto: false, autoOff: 1 }, // vocal channel: pan, Wide, effects (manual, non-destructive), auto level match
    tool: "hit", lane: "vel", page: 0,
    piano: { slot: "A", slots: { A: PD.empty(), B: PD.empty(), C: PD.empty(), D: PD.empty() } }, // piano-roll pattern slots
    songKey: null,        // song key 0–11 for the keys loop bank (null = the first loaded loop sets it)
    klTempo: false        // keys loops: "Use loop tempo" on load
  };
  function pianoPat() { return S.piano.slots[S.piano.slot]; }
  function curSlot() { return S.slots[S.slot]; }
  function plen() { return curSlot().len; }
  function bindSlot() { var s = curSlot(); S.pattern = s.pattern; S.vel = s.vel; S.note = s.note; S.slide = s.slide; }
  bindSlot();
  var stockBufs = new Array(16).fill(null); // pad → round-robin AudioBuffers of the current kit
  var customBuf = new Array(16).fill(null);
  var customName = new Array(16).fill(null);

  function fitGrid(src, def, lo, hi, round) {
    var g = emptyGrid(def);
    if (!Array.isArray(src)) return g;
    for (var i = 0; i < 16; i++) {
      var r = src[i];
      if (!Array.isArray(r)) continue;
      for (var s = 0; s < MAXLEN && s < r.length; s++) {
        var v = +r[s];
        if (isFinite(v)) g[i][s] = clamp(round ? Math.round(v) : v, lo, hi);
      }
    }
    return g;
  }
  function slotFrom(o) {
    var s = newSlot(o && +o.len === 32 ? 32 : 16);
    if (!o) return s;
    s.pattern = fitGrid(o.pattern, 0, 0, 3, true);
    s.vel = fitGrid(o.vel, 0.8, 0.05, 1);
    s.note = fitGrid(o.note, 0, -24, 24, true);
    s.slide = fitGrid(o.slide, 0, 0, 1, true);
    return s;
  }
  function slotCopy(s) { return JSON.parse(JSON.stringify(s)); }
  function slotHasNotes(s) { return s.pattern.some(function (r) { return r.some(function (v) { return !!v; }); }); }
  /* pre-2026 Trap / Drill / Phonk patterns (16 steps, old pad order) → new kit layout.
     Re-pitched / merged rows (the old three 808 pads → one mono 808) keep their pitch as per-step notes. */
  function legacyConvert(kit, pattern, pitches) {
    var L = D.LEGACY[kit];
    if (!L) return null;
    var s = newSlot(16), tunes = [], p16 = fitGrid(pattern, 0, 0, 3, true);
    for (var o = 0; o < 16; o++) {
      var m = L.map[o], ni = m[0], perStep = m[1] !== undefined;
      var pt = Array.isArray(pitches) ? clamp(+pitches[o] || 0, -12, 12) : 0;
      for (var st = 0; st < 16; st++) {
        var v = p16[o][st];
        if (!v || s.pattern[ni][st]) continue;
        s.pattern[ni][st] = v;
        s.vel[ni][st] = m[2] || 0.8;
        s.note[ni][st] = perStep ? (m[1] || 0) + pt : 0;
      }
      if (!perStep && pt) tunes[ni] = pt;
    }
    return { kit: L.kit, slot: s, tunes: tunes };
  }

  function saveSession() {
    var pc = curCtx;
    useCtx(-1); // the song's own fields (a section being edited is kept in S.secOv)
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({
        secOv: secOvSave(),
        fmt: 2, kit: S.kit, bpm: S.bpm, swing: S.swing, slot: S.slot, slots: S.slots,
        padCfg: S.padCfg, kitSwing: S.kitSwing, mute: S.mute, solo: S.solo, mixer: S.mixer, sel: S.sel,
        chordTrack: S.chordTrack, structure: S.structure, cueBar: S.cueBar, feel: S.feel,
        lyricSong: S.lyricSong, bpl: S.bpl, prSize: S.prSize, vox: S.vox, tool: S.tool, master: S.master || null,
        backing: bt.id ? { id: bt.id, layer: bt.layer, prevBpm: bt.prevBpm } : null,
        piano: S.piano, songKey: S.songKey, klTempo: S.klTempo,
        padAssign: window.IPBPadAssign ? IPBPadAssign.pack() : null
      }));
    } catch (e) { /* storage full or blocked */ }
    useCtx(pc);
    libSync();
    secMarks();
  }
  function loadSession() {
    try {
      var raw = localStorage.getItem(SESSION_KEY);
      try { var pd0 = JSON.parse(raw || "null"); if (pd0 && pd0.padAssign) window.__ipbPadAssignSaved = pd0.padAssign; } catch (e) { /* ignore */ }
      if (!raw) return false;
      var d = JSON.parse(raw);
      if (d.fmt >= 2) {
        S.kit = kitId(d.kit);
        if (d.slots) SLOT_IDS.forEach(function (id) { if (d.slots[id]) S.slots[id] = slotFrom(d.slots[id]); });
        if (SLOT_IDS.indexOf(d.slot) !== -1) S.slot = d.slot;
        S.padCfg = cleanPadCfg(d.padCfg);
        if (d.kitSwing) Object.keys(d.kitSwing).forEach(function (k) { if (D.BY_ID[k]) S.kitSwing[k] = clamp(+d.kitSwing[k] || 0, 0, 60); });
        if (Array.isArray(d.mute)) S.mute = S.mute.map(function (x, i) { return !!d.mute[i]; });
        if (Array.isArray(d.solo)) S.solo = S.solo.map(function (x, i) { return !!d.solo[i]; });
        if (TOOL_VEL[d.tool]) S.tool = d.tool;
      } else {
        // session saved before the 2026 kits (Trap / Drill / Phonk, 16 steps, old pad order)
        var lc = legacyConvert(d.kit && D.LEGACY[d.kit] ? d.kit : "trap", d.pattern, d.pitches);
        S.kit = lc.kit;
        S.slots.A = lc.slot; S.slot = "A";
        lc.tunes.forEach(function (t, i) { if (t) padCfg(i, lc.kit).tune = t; });
      }
      bindSlot();
      if (d.bpm) S.bpm = clamp(+d.bpm, 60, 200);
      if (d.swing != null) S.swing = clamp(+d.swing, 0, 60);
      S.feel = FEEL.norm(d.feel); // sessions saved before the Feel engine → Natural
      S.kitSwing[S.kit] = S.swing;
      if (d.mixer) {
        var dm = defaultMixer();
        Object.keys(dm).forEach(function (k) { // a channel missing from an older save, or with a broken level, keeps its default
          var s = d.mixer[k];
          if (s && isFinite(+s.v) && s.v !== null) dm[k] = { v: clamp(+s.v, 0, 1), m: !!s.m };
        });
        try { // one-time fix (Oct 2026): a Piano Roll channel saved at exactly 0 silenced keys loops with no clue why; back to the default (an explicit MUTE stays)
          if (!localStorage.getItem("ipb_mix_piano_fix_v1")) {
            localStorage.setItem("ipb_mix_piano_fix_v1", "1");
            if (dm.piano && dm.piano.v === 0) dm.piano.v = defaultMixer().piano.v;
          }
        } catch (e) { /* ignore */ }
        S.mixer = dm;
      }
      if (d.sel != null) S.sel = clamp(+d.sel, 0, 15);
      if (d.chordTrack && Array.isArray(d.chordTrack.prog)) {
        var ct = defaultChordTrack();
        Object.keys(ct).forEach(function (k) { if (d.chordTrack[k] != null) ct[k] = d.chordTrack[k]; });
        ct.lx = LY.clean(ct.lx, "mel"); // sessions before tweakable layers → defaults
    S.chordTrack = ct;
      }
      if (d.structure && STRUCTURES[d.structure]) S.structure = d.structure;
      S.secOv = cleanSecOv(d.secOv); // sessions before section editing: none
      if (d.cueBar != null) S.cueBar = Math.max(0, Math.floor(+d.cueBar) || 0);
      if (typeof d.lyricSong === "string") S.lyricSong = d.lyricSong;
      if (d.bpl) S.bpl = String(d.bpl);
      if (d.prSize) S.prSize = clamp(+d.prSize, 0.6, 1.8);
      if (d.songKey != null && d.songKey !== "" && isFinite(+d.songKey)) S.songKey = clamp(Math.round(+d.songKey), 0, 11);
      S.klTempo = !!d.klTempo;
      if (d.piano && d.piano.slots && typeof d.piano.slots === "object") {
        SLOT_IDS.forEach(function (id) { if (d.piano.slots[id]) S.piano.slots[id] = PD.normalize(d.piano.slots[id], instOk); });
        if (SLOT_IDS.indexOf(d.piano.slot) !== -1) S.piano.slot = d.piano.slot;
      }
      if (d.backing && typeof d.backing.id === "string") {
        btRestore = { id: d.backing.id, layer: !!d.backing.layer, prevBpm: d.backing.prevBpm != null ? clamp(+d.backing.prevBpm || 90, 60, 200) : null };
      }
      if (d.vox) {
        S.vox.nudge = clamp(+d.vox.nudge || 0, -300, 300);
        S.vox.monitor = !!d.vox.monitor;
        S.vox.dry = !!d.vox.dry;
        if (typeof d.vox.clean === "boolean") S.vox.clean = d.vox.clean;   // speaker-mode fields: absent in older sessions
        if (typeof d.vox.aec === "boolean") S.vox.aec = d.vox.aec;
        if (typeof d.vox.raw === "boolean") S.vox.raw = d.vox.raw;
        if (typeof d.vox.guide === "boolean") S.vox.guide = d.vox.guide;
        if (isFinite(+d.vox.spk) && d.vox.spk != null) S.vox.spk = clamp(Math.round(+d.vox.spk), 10, 100);
        S.vox.pan = clamp(+d.vox.pan || 0, -1, 1);
        S.vox.wide = !!d.vox.wide;
        S.vox.fxOff = !!d.vox.fxOff;
        S.vox.tight = { on: !!(d.vox.tight && d.vox.tight.on), str: d.vox.tight && isFinite(+d.vox.tight.str) ? clamp(+d.vox.tight.str, 0, 1) : 0.5 };
        S.vox.fx = d.vox.fx ? FXC.norm(d.vox.fx) : null;                      // older sessions: every effect off
        S.vox.auto = typeof d.vox.auto === "boolean" ? d.vox.auto : false;     // older sessions: auto match off
        S.master = d.master && typeof d.master === "object" ? d.master : null;  // Master tab settings (master/master.js normalizes)
        S.vox.autoOff = isFinite(+d.vox.autoOff) && d.vox.autoOff != null ? clamp(+d.vox.autoOff, -12, 12) : 1;
      }
      return true;
    } catch (e) { return false; }
  }
  /* the kit's 2-bar starter pattern, tempo and swing into the current slot */
  function loadStarter(id, pre) {
    var k = kitDef(id), st = D.starter(k, pre), s = curSlot();
    s.len = st.len; s.pattern = st.pattern; s.vel = st.vel; s.note = st.note; s.slide = st.slide;
    bindSlot();
    S.bpm = (pre && pre.bpm) || k.bpm;
    S.swing = swingFromMpc(k.swing);
    S.kitSwing[k.id] = S.swing;
    S.page = 0;
  }

  /* ---------------- Song structures, beat presets, built-in songs ---------------- */
  var STRUCTURES = {
    rap80: {
      name: "Song form · 80 bars",
      // feel: "sparse" = chords + hats/perc only, "half" = whole beat stretched to half-time
      sections: [
        { name: "Intro", bars: 4, feel: "sparse" },
        { name: "Hook", bars: 8 },
        { name: "Verse 1", bars: 16 },
        { name: "Hook", bars: 8 },
        { name: "Verse 2", bars: 16 },
        { name: "Hook", bars: 8 },
        { name: "Bridge", bars: 8, feel: "half" },
        { name: "Hook", bars: 8 },
        { name: "Outro", bars: 4, feel: "sparse" }
      ]
    }
  };
  /*
   * "The Streets Is Calling" — dark, gritty trap in C minor, 140 BPM, Trap kit.
   * Chord loop from the built-in chord pads, 2 bars each (8-bar cycle = one hook):
   *   Cm  →  Ab  →  Fm  →  G7      (i – VI – iv – V7 in C minor)
   * The G7 (with its raised B natural) adds tension that pulls hard back to Cm.
   * The 808 follows each chord root; kick + 808 hit together, snare/clap on beat 3,
   * hats in 8ths with 32nd ("2") and triplet ("3") rolls.
   * Pad map (2026 Trap kit): 0 Kick, 2 808 Long (C, one A# step), 4 Clap, 5 Snare, 8 Closed Hat, 9 Hat Soft.
   */
  var BEAT_PRESETS = {
    streets: {
      name: "The Streets Is Calling",
      fmt: 2,
      kit: "trap",
      bpm: 140,
      swing: 0,
      len: 16,
      pattern: {
        0: "x......x..x..x..",
        2: "x......x..x..x..",
        4: "........x.......",
        5: "........x.......",
        8: "x.x.x.3.x.x.x2x3",
        9: "...x.......x...."
      },
      note: { 2: { 13: -2 } },
      chords: { on: true, prog: [6, 10, 8, 15], bars: 2, sound: "pad", bassFollow: true },
      structure: "rap80",
      mixer: { drums: 0.9, bass: 0.95, hats: 0.6, perc: 0.7, keys: 0.5 },
      studio: { title: "The Streets Is Calling", artist: "Emmanuel Griffith" }
    }
  };
  var BUILTIN_SONGS = [{
    id: "streets",
    title: "The Streets Is Calling",
    artist: "Emmanuel Griffith",
    preset: "streets",
    text: [
      "[Intro]",
      "(Yeah... yeah)",
      "Listen, lil bro, come here, let me talk to you (talk to you)",
      "Ain't nobody coming to save you out here (nobody)",
      "You want it? You gotta go get it (go get it)",
      "The streets is calling... (you hear that?)",
      "",
      "[Hook]",
      "The streets is calling, I can't ignore it (can't ignore it)",
      "The street means money, and money is important (important)",
      "Money keep 'em high, money keep 'em fly (fly)",
      "Let's think about the things that money can buy (let's think)",
      "",
      "[Verse 1]",
      "G5 jets, you can fly to Dubai (Dubai)",
      "Seven-star hotels, you can sip Mai Tais (sip)",
      "Strip club pleasures, money flying in the sky (make it rain)",
      "This is just a fraction of the things money could buy...",
      "Now look, I came up where the lights don't shine (no)",
      "Where the rent come due and the fridge stay dry",
      "Mama working doubles, I could see it in her eyes",
      "So I made a promise I ain't never gon' cry (never)",
      "Hustle is the hustle, don't matter what it is",
      "Flip it, move it, work it, do it for the kids (for the kids)",
      "Nine-to-five, side hustle, weekend grind (grind)",
      "Every dollar count when you counting on time",
      "They ain't handing out nothing, gotta take what's mine (mine)",
      "Pressure make diamonds, so I'm built to shine (shine)",
      "Early bird, late night, never sleep, never rest",
      "Ain't no plan B when you betting on yourself (yeah)",
      "",
      "[Hook]",
      "The streets is calling, I can't ignore it (can't ignore it)",
      "The street means money, and money is important (important)",
      "Money keep 'em high, money keep 'em fly (fly)",
      "Let's think about the things that money can buy (let's think)",
      "",
      "[Verse 2]",
      "Could never buy the keys to the mansion in the sky (no)",
      "But it put a yacht full of keys cutting through the tides (splash)",
      "Make it through clear ports, same time meet my connect (connect)",
      "Pass customs with fake passports, no sweat (none)",
      "Money make 'em love you, money make 'em hate (hate)",
      "Money make your partner turn snake on your plate",
      "So I watch my circle, keep it tight, keep it small (small)",
      "Only trust the ones that was there when I ain't have it all",
      "Every risk got a price, every price got a cost (cost)",
      "Every win got a lesson, every L got a loss",
      "But I'm still here standing, never folding, never fall (never)",
      "When the streets start calling, you gon' answer the call (answer)",
      "",
      "[Hook]",
      "The streets is calling, I can't ignore it (can't ignore it)",
      "The street means money, and money is important (important)",
      "Money keep 'em high, money keep 'em fly (fly)",
      "Let's think about the things that money can buy (let's think)",
      "",
      "[Bridge] (slow it down, half-time)",
      "Hustle... (hustle)",
      "Whatever it is, you gotta hustle (whatever it is)",
      "Rain or shine, grind every season",
      "Hunger on my mind, that's my reason (that's my reason)",
      "They gon' doubt you... let 'em doubt (let 'em)",
      "They gon' talk... let 'em talk",
      "I'ma let the money do the talking when I walk (walk)",
      "",
      "[Hook]",
      "The streets is calling, I can't ignore it (can't ignore it)",
      "The street means money, and money is important (important)",
      "Money keep 'em high, money keep 'em fly (fly)",
      "Let's think about the things that money can buy (let's think)",
      "",
      "[Outro]",
      "Yeah... (yeah)",
      "The streets is calling, lil bro",
      "Money can't buy you the sky, but it can buy you time (time)",
      "So what you gon' do?",
      "Hustle... whatever it is (whatever it is)",
      "The streets is calling... (calling)",
      "Pick up the phone."

    ].join("\n")
  }];
  function patternFrom(src) {
    var p = emptyPattern();
    if (Array.isArray(src)) return fitGrid(src, 0, 0, 3, true);
    Object.keys(src || {}).forEach(function (i) {
      var str = String(src[i]);
      for (var s = 0; s < MAXLEN && s < str.length; s++) {
        var ch = str[s];
        p[+i][s] = ch === "x" ? 1 : ch === "2" ? 2 : ch === "3" ? 3 : 0;
      }
    });
    return p;
  }
  function gridFrom(src, def, lo, hi, round) {
    if (Array.isArray(src)) return fitGrid(src, def, lo, hi, round);
    var g = emptyGrid(def);
    Object.keys(src || {}).forEach(function (r) {
      if (!(r >= 0 && r < 16)) return;
      Object.keys(src[r] || {}).forEach(function (s) { if (s >= 0 && s < MAXLEN) g[+r][+s] = clamp(+src[r][s] || 0, lo, hi); });
    });
    return g;
  }
  /* beat attached to a song / preset → { kit, slot, tunes, pads } (old Trap/Drill/Phonk beats are re-mapped) */
  function beatSlot(beat) {
    if (!beat.fmt && D.LEGACY[beat.kit]) return legacyConvert(beat.kit, patternFrom(beat.pattern), beat.pitches);
    var s = newSlot(+beat.len === 32 ? 32 : 16);
    s.pattern = patternFrom(beat.pattern);
    if (beat.vel) s.vel = gridFrom(beat.vel, 0.8, 0.05, 1);
    if (beat.note) s.note = gridFrom(beat.note, 0, -24, 24, true);
    if (beat.slide) s.slide = gridFrom(beat.slide, 0, 0, 1, true);
    return { kit: kitId(beat.kit), slot: s, tunes: [], pads: beat.pads };
  }
  function arrangement() { return S.structure && STRUCTURES[S.structure] ? STRUCTURES[S.structure].sections : null; }
  function totalBars(A) { return A.reduce(function (a, s) { return a + s.bars; }, 0); }
  function barSec() { return 240 / S.bpm; }

  /* ---------------- Per-section editing (song form) ----------------
   * Tap a section in the song timeline to edit ONLY that section (each Hook on its own). A section override keeps its
   * own copy of the song fields in CTXF plus keys on/off, volume and energy; a missing field = "same as song".
   * While a section is being edited, S shows that section's fields, so every editor (pads, steps, Piano Roll, Feel,
   * mute / solo, layer knobs, Swap) just works. The scheduler and the offline renders switch S to each section's
   * fields step by step (useCtx), so playback, Bounce, WAV / MP3 and Send to Studio play every section its own way.
   * Saved as S.secOv[structure][index] with only the fields that differ; old saves have none and play unchanged.
   */
  var CTXF = ["slots", "slot", "mute", "solo", "feel", "padCfg", "chordTrack", "piano"];
  var SEC_ENERGY = { full: "Full", sparse: "Sparse (no kick / snare / 808)", half: "Half-time" };
  var curCtx = -1, SONG = null, edSec = -1;
  S.secOv = {};
  function secMap(create) { if (!S.structure) return null; return S.secOv[S.structure] || (create ? (S.secOv[S.structure] = {}) : null); }
  function ovAt(i) { var m = secMap(false); return m && i >= 0 ? m[i] || null : null; }
  function songVal(f) { return curCtx === -1 ? S[f] : SONG[f]; }
  function deep(o) { return o === undefined ? undefined : JSON.parse(JSON.stringify(o)); }
  /* point S at section j's fields (-1 = the song). Values changed while a section was shown are written back to it. */
  function useCtx(j) {
    if (j == null || j < 0) j = -1;
    if (j === curCtx) return;
    if (curCtx !== -1) {
      var o = ovAt(curCtx);
      CTXF.forEach(function (f) { if (o && o[f] !== undefined) o[f] = S[f]; S[f] = SONG[f]; });
      SONG = null; curCtx = -1;
    }
    if (j !== -1) {
      var ov = ovAt(j);
      if (ov) {
        SONG = {};
        CTXF.forEach(function (f) { SONG[f] = S[f]; if (ov[f] !== undefined) S[f] = ov[f]; });
        curCtx = j;
      }
    }
    bindSlot();
  }
  function withSong(fn) { var pc = curCtx; useCtx(-1); try { return fn(); } finally { useCtx(pc); } }
  function secDefFeel(i) { var A = arrangement(); return (A && A[i] && A[i].feel) || "full"; }
  function secFeel(i) { var o = ovAt(i); return (o && o.energy) || secDefFeel(i); }
  function secSlotLen(i) {
    var o = ovAt(i), slots = (o && o.slots) || songVal("slots"), id = (o && o.slot) || songVal("slot");
    return (slots[id] || songVal("slots")[songVal("slot")]).len;
  }
  function secLabel(i) {
    var A = arrangement(); if (!A || !A[i]) return "";
    var n = A[i].name, same = A.filter(function (s) { return s.name === n; }).length;
    if (same < 2) return n;
    var k = 0; for (var j = 0; j <= i; j++) if (A[j].name === n) k++;
    return n + " " + k;
  }
  /* "same as song" tests ignore untouched layer configs that the editors create on first look */
  function normLx(lx) { var o = {}; Object.keys(lx || {}).sort().forEach(function (k) { var p = LY.pack(lx[k], "mel"); if (p) o[k] = p; }); return o; }
  function normPiano(pn) {
    return JSON.stringify([pn.slot, SLOT_IDS.map(function (id) {
      var p = pn.slots && pn.slots[id]; if (!p) return null;
      var c = {}; Object.keys(p).sort().forEach(function (k) { c[k] = k === "lx" ? normLx(p.lx) : p[k]; }); return c;
    })]);
  }
  function normCT(ct) { var c = {}; Object.keys(ct || {}).sort().forEach(function (k) { c[k] = k === "lx" ? LY.pack(ct.lx, "mel") : ct[k]; }); return JSON.stringify(c); }
  function normPad(pc) {
    var o = {};
    Object.keys(pc || {}).sort().forEach(function (k) {
      if (!D.BY_ID[k]) return;
      var m = {}, any = false;
      (pc[k] || []).forEach(function (c, i) { var p = c && D.BY_ID[k].pads[i] ? LY.pack(c, "drum", padBase(D.BY_ID[k].pads[i])) : null; if (p) { m[i] = p; any = true; } });
      if (any) o[k] = m;
    });
    return JSON.stringify(o);
  }
  function sameF(f, a, b) {
    if (a === b) return true;
    if (a == null || b == null) return false;
    if (f === "piano") return normPiano(a) === normPiano(b);
    if (f === "chordTrack") return normCT(a) === normCT(b);
    if (f === "padCfg") return normPad(a) === normPad(b);
    return JSON.stringify(a) === JSON.stringify(b);
  }
  function materialize(ov) {
    CTXF.forEach(function (f) { if (ov[f] === undefined) ov[f] = deep(songVal(f)); });
    if (ov.keys === undefined) ov.keys = true;
    if (ov.vol === undefined) ov.vol = 0;
    return ov;
  }
  /* drop every field that equals the song (call with S on the song, i.e. curCtx !== that section) */
  function pruneOv(ov, i) {
    CTXF.forEach(function (f) { if (ov[f] !== undefined && sameF(f, ov[f], songVal(f))) delete ov[f]; });
    if (ov.keys !== false) delete ov.keys;
    if (!ov.vol) delete ov.vol;
    if (!ov.energy || ov.energy === secDefFeel(i)) delete ov.energy;
    return ov;
  }
  function ovEmpty(ov) { return !ov || !Object.keys(ov).length; }
  function secChanged(i) {
    if (i !== edSec) return !ovEmpty(ovAt(i));
    var o = ovAt(i), c = {}; if (!o) return false;
    CTXF.forEach(function (f) { c[f] = S[f]; });
    c.keys = o.keys; c.vol = o.vol; c.energy = o.energy;
    return !ovEmpty(pruneOv(deep(c), i));
  }
  function cleanSecOv(src) {
    var out = {};
    Object.keys(src || {}).forEach(function (st) {
      if (!STRUCTURES[st] || !src[st] || typeof src[st] !== "object") return;
      var n = STRUCTURES[st].sections.length, m = {};
      Object.keys(src[st]).forEach(function (k) {
        var i = +k, o = src[st][k];
        if (!(i >= 0 && i < n) || !o || typeof o !== "object") return;
        var c = {};
        if (o.slots && typeof o.slots === "object") { c.slots = {}; SLOT_IDS.forEach(function (id) { c.slots[id] = slotFrom(o.slots[id]); }); }
        if (SLOT_IDS.indexOf(o.slot) !== -1) c.slot = o.slot;
        if (Array.isArray(o.mute)) c.mute = new Array(16).fill(false).map(function (x, q) { return !!o.mute[q]; });
        if (Array.isArray(o.solo)) c.solo = new Array(16).fill(false).map(function (x, q) { return !!o.solo[q]; });
        if (o.feel != null) c.feel = FEEL.norm(o.feel);
        if (o.padCfg && typeof o.padCfg === "object") c.padCfg = cleanPadCfg(o.padCfg);
        if (o.chordTrack && Array.isArray(o.chordTrack.prog)) {
          var ct = defaultChordTrack();
          Object.keys(ct).forEach(function (q) { if (o.chordTrack[q] != null) ct[q] = o.chordTrack[q]; });
          ct.lx = LY.clean(ct.lx, "mel"); c.chordTrack = ct;
        }
        if (o.piano && o.piano.slots && typeof o.piano.slots === "object") {
          var pn = { slot: SLOT_IDS.indexOf(o.piano.slot) !== -1 ? o.piano.slot : "A", slots: {} };
          SLOT_IDS.forEach(function (id) { pn.slots[id] = o.piano.slots[id] ? PD.normalize(o.piano.slots[id], instOk) : PD.empty(); });
          c.piano = pn;
        }
        if (o.keys === false) c.keys = false;
        if (o.vol != null && isFinite(+o.vol) && +o.vol) c.vol = clamp(+o.vol, -24, 6);
        if (SEC_ENERGY[o.energy]) c.energy = o.energy;
        if (Object.keys(c).length) m[i] = c;
      });
      if (Object.keys(m).length) out[st] = m;
    });
    return out;
  }
  /* compact copy for the session (song fields must be on S: curCtx === -1) */
  function secOvSave() {
    var out = {};
    Object.keys(S.secOv).forEach(function (st) {
      var m = S.secOv[st], o2 = {};
      Object.keys(m || {}).forEach(function (k) {
        var c = deep(m[k]);
        if (st === S.structure) pruneOv(c, +k);
        if (!ovEmpty(c)) o2[k] = c;
      });
      if (Object.keys(o2).length) out[st] = o2;
    });
    return out;
  }
  /* songs keep one resolved pattern per section (pat / pp) so they load into any slot layout */
  function secSnapshot() {
    var m = secMap(false), out = {}, n = 0;
    Object.keys(m || {}).forEach(function (k) {
      var o = pruneOv(deep(m[k]), +k), r = {};
      if (ovEmpty(o)) return;
      Object.keys(o).forEach(function (f) { if (f !== "slots" && f !== "slot" && f !== "piano") r[f] = o[f]; });
      if (o.slots || o.slot) r.pat = deep((o.slots || S.slots)[o.slot || S.slot]);
      if (o.piano) r.pp = PD.normalize(o.piano.slots[o.piano.slot], instOk);
      out[k] = r; n++;
    });
    return n ? out : undefined;
  }
  function secFromSnapshot(src) {
    var raw = {};
    Object.keys(src || {}).forEach(function (k) {
      var o = src[k]; if (!o || typeof o !== "object") return;
      var r = deep(o); delete r.pat; delete r.pp;
      if (o.pat) { r.slots = deep(S.slots); r.slots[S.slot] = o.pat; }
      if (o.pp) { r.piano = deep(S.piano); r.piano.slots[S.piano.slot] = o.pp; }
      raw[k] = r;
    });
    var w = {}; w[S.structure] = raw;
    return cleanSecOv(w)[S.structure] || {};
  }
  /* per-section drum row chains (only for sections with their own layer knobs) */
  function stripsFor(G) {
    if (curCtx === -1) return G.strips;
    var ov = ovAt(curCtx);
    if (!ov || !ov.padCfg) return G.strips;
    var a = G.sstrips[curCtx];
    if (!a) {
      a = G.sstrips[curCtx] = [];
      for (var i = 0; i < 16; i++) { var g = padDef(i).g, st = LY.Strip(G.c, G.groups[g]); st.g = g; st.apply(padCfg(i), 0); a.push(st); }
    }
    return a;
  }
  function ctxPre() { if (curCtx === -1) return ""; var o = ovAt(curCtx); return o && (o.piano || o.chordTrack) ? "s" + curCtx + ":" : ""; }
  function dropSecStrips(j) {
    [LG].forEach(function (G) {
      if (!G) return;
      (G.sstrips[j] || []).forEach(function (st) { try { st.out.disconnect(); } catch (e) { /* ignore */ } });
      delete G.sstrips[j];
      Object.keys(G.lstrips).forEach(function (k) { if (k.indexOf("s" + j + ":") === 0) { try { G.lstrips[k].out.disconnect(); } catch (e) { /* ignore */ } delete G.lstrips[k]; } });
    });
  }
  function secStep(c, G, info, t, reg, creg, first) {
    var j = info.secIdx >= 0 ? (ovAt(info.secIdx) ? info.secIdx : -1) : edSec;
    if (G.secG && (first || info.secStart)) { var o = ovAt(info.secIdx >= 0 ? info.secIdx : edSec); G.secG.gain.setValueAtTime(dbGain((o && o.vol) || 0), t); }
    useCtx(j);
    try { scheduleStep(c, G, info, t, reg, creg, first); } finally { useCtx(edSec); }
  }

  /* ---------------- IndexedDB ---------------- */
  var dbPromise = null;
  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (res, rej) {
      if (!window.indexedDB) { rej(new Error("IndexedDB unavailable")); return; }
      var r = indexedDB.open("islandpinbeats", 1);
      r.onupgradeneeded = function () {
        var d = r.result;
        if (!d.objectStoreNames.contains("vault")) d.createObjectStore("vault", { keyPath: "id" });
        if (!d.objectStoreNames.contains("pads")) d.createObjectStore("pads", { keyPath: "key" });
      };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
    return dbPromise;
  }
  function idb(store, mode, fn) {
    return openDB().then(function (d) {
      return new Promise(function (res, rej) {
        var tx = d.transaction(store, mode);
        var req = fn(tx.objectStore(store));
        tx.oncomplete = function () { res(req ? req.result : undefined); };
        tx.onerror = function () { rej(tx.error); };
        tx.onabort = function () { rej(tx.error); };
      });
    });
  }
  var memVault = []; // fallback if IndexedDB is blocked

  /* ---------------- Audio graph ----------------
   * pad voice → pad strip (level · drive · pan) → group fader → drum bus (glue comp ∥ parallel smash → saturation)
   * Keys skip the drum bus. → master fader → limiter → safety clipper (ceiling −0.3 dBFS) → `master`
   * The same graph is built for live playback, Bounce and Level match, so all three sound identical.
   * Web Audio compressors add automatic make-up gain; it is trimmed back out so faders mean what they say. */
  var ctx = null, master = null, masterAnalyser = null, beatMon = null, spkGain = null, LG = null;
  var groupNodes = {};
  var liveVoices = [];
  var livePeak = 0;
  var CEIL = 0.966;          // −0.3 dBFS hard ceiling
  var LIM_THR = -2;          // limiter threshold (dBFS) — leaves room for inter-sample peaks of crushed (12-bit) kits
  var GRAPH_LAT = 0.012;     // two compressor look-aheads (drum bus + limiter), trimmed from bounces
  function makeupDb(thr, ratio) { return -0.6 * thr * (1 - 1 / ratio); }
  function dbGain(db) { return Math.pow(10, db / 20); }
  var curves = {};
  function softCurve(key, fn) {
    if (curves[key]) return curves[key];
    var n = 8192, c = new Float32Array(n);
    for (var i = 0; i < n; i++) c[i] = fn(((i / (n - 1)) * 2 - 1) * 2); // shaper input is pre-scaled by 0.5 → covers ±2
    return (curves[key] = c);
  }
  var SAFETY = softCurve("safety", function (x) {
    var a = Math.abs(x), k = 0.8, y = a < k ? a : k + (1 - k) * Math.tanh((a - k) / (1 - k));
    return (x < 0 ? -1 : 1) * Math.min(1, y) * CEIL;
  });
  function busCurve(k) { k = Math.max(1.01, k); return softCurve("bus" + k.toFixed(2), function (x) { return Math.tanh(k * x) / k; }); }
  function makeGraph(c, live) {
    function gn(v) { var g = c.createGain(); g.gain.value = v == null ? 1 : v; return g; }
    var G = { c: c, groups: {}, an: {}, strips: [], rr: new Array(16).fill(0), preg: [] }; // preg = piano-roll voices
    G.bus = gn(1);
    G.comp = c.createDynamicsCompressor(); G.compTrim = gn(1);
    G.smash = c.createDynamicsCompressor(); G.smashG = gn(0);
    G.smash.threshold.value = -30; G.smash.ratio.value = 12; G.smash.knee.value = 0;
    G.smash.attack.value = 0.002; G.smash.release.value = 0.09;
    G.bsum = gn(1); G.bdPre = gn(0.5);
    G.bdrive = c.createWaveShaper(); G.bdrive.oversample = "none";
    G.bus.connect(G.comp); G.comp.connect(G.compTrim); G.compTrim.connect(G.bsum);
    G.bus.connect(G.smash); G.smash.connect(G.smashG); G.smashG.connect(G.bsum);
    G.bsum.connect(G.bdPre); G.bdPre.connect(G.bdrive);
    G.sum = gn(1);
    G.kitOut = gn(1);
    G.bdrive.connect(G.kitOut); G.kitOut.connect(G.sum);
    G.keysDelay = c.createDelay(0.05); G.keysDelay.delayTime.value = 0.006; // matches the drum-bus look-ahead
    G.keysDelay.connect(G.sum);
    G.fader = gn(mixGain("master"));
    G.lim = c.createDynamicsCompressor();
    G.lim.threshold.value = LIM_THR; G.lim.knee.value = 0; G.lim.ratio.value = 20; G.lim.attack.value = 0.001; G.lim.release.value = 0.1;
    G.limTrim = gn(dbGain(-makeupDb(LIM_THR, 20)));
    G.clipPre = gn(0.5);
    G.clip = c.createWaveShaper(); G.clip.curve = SAFETY; G.clip.oversample = "none";
    G.out = gn(1);
    G.secG = gn(1); // per-section volume (section editing)
    G.sum.connect(G.secG); G.secG.connect(G.fader); G.fader.connect(G.lim); G.lim.connect(G.limTrim);
    G.limTrim.connect(G.clipPre); G.clipPre.connect(G.clip); G.clip.connect(G.out);
    GROUPS.forEach(function (g) {
      var n = gn(mixGain(g.id)), tail = n;
      if (live) { var an = c.createAnalyser(); an.fftSize = 512; n.connect(an); tail = an; G.an[g.id] = an; }
      tail.connect(g.id === "keys" || g.id === "inst" || g.id === "piano" ? G.keysDelay : G.bus);
      G.groups[g.id] = n;
    });
    for (var i = 0; i < 16; i++) G.strips.push(LY.Strip(c, G.groups[padDef(i).g])); // one chain per drum row
    G.sstrips = {}; // per-section drum row chains (section editing)
    G.lstrips = {}; // melodic layers (piano-roll instruments, chord loop), created on first note
    graphKit(G);
    return G;
  }
  /* pad strip routing + settings; `t` = ramp time for live changes */
  function stripApply(G, i, t) {
    var st = stripsFor(G)[i], g = padDef(i).g;
    if (st.g !== g) { // kit change can move a row to another group fader
      try { st.out.disconnect(); } catch (e) { /* not connected */ }
      st.out.connect(G.groups[g]); st.g = g;
    }
    st.apply(padCfg(i), t);
  }
  function graphKit(G, t) {
    var pc = curCtx;
    Object.keys(G.sstrips || {}).forEach(function (j) { useCtx(+j); for (var q = 0; q < 16; q++) stripApply(G, q, t); });
    useCtx(-1);
    try { graphKitSong(G, t); } finally { useCtx(pc); }
  }
  function graphKitSong(G, t) {
    for (var i = 0; i < 16; i++) stripApply(G, i, t);
    var b = kitDef(S.kit).bus;
    G.comp.threshold.value = b.thr; G.comp.ratio.value = b.ratio; G.comp.knee.value = 3;
    G.comp.attack.value = b.atk; G.comp.release.value = b.rel;
    G.compTrim.gain.value = dbGain(-makeupDb(b.thr, b.ratio));
    G.smashG.gain.value = b.smash ? b.smash * dbGain(-makeupDb(-30, 12)) : 0;
    G.bdrive.curve = busCurve(b.drive || 1.1);
    G.kitOut.gain.value = dbGain(b.out || 0);
  }

  function resumeCtx() {
    // iPhone/iPad use "interrupted" (calls, Siri, another app) as well as "suspended": wake up from both
    if (!ctx || ctx.state === "running" || ctx.state === "closed") return;
    try { var pr = ctx.resume(); if (pr && pr.then) pr.then(flushHits, function () {}); } catch (e) { /* not allowed yet */ }
  }
  /* Master preview "park": while the Master tab plays its rendered song, the idle Beats graph (kit bus, layers, vocal FX,
     reference meters, recorder tap) is unhooked from the speakers so the audio thread only renders the master chain.
     Anything on the Beats side that makes sound calls ensureCtx() (or unpark()) first, which hooks it all back up. */
  var parked = false;
  function parkTargets() {
    var t = [];
    if (spkGain) t.push(spkGain); if (recSink) t.push(recSink); if (monitorGain && !vox.stream) t.push(monitorGain);
    if (refN) { t.push(refN.gate); if (refN.sink && refN.sinkOn) t.push(refN.sink); }
    if (VX && VX.toSpk) t.push(VX.toSpk);
    return t;
  }
  function park() {
    if (parked || !ctx || playing || vox.state !== "idle" || vox.stream || vc.src || (vpv && vpv.src)) return false;
    parked = parkTargets(); parked.forEach(function (n) { try { n.disconnect(ctx.destination); } catch (e) { /* not connected */ } });
    return true;
  }
  function unpark() {
    if (!parked) return;
    var t = parked; parked = false;
    t.forEach(function (n) { try { n.connect(ctx.destination); } catch (e) { /* gone */ } });
  }
  /* reference meters (two K-weighted 32k analyser chains) only run while a reference track is loaded */
  function refSinkSync() {
    if (!refN || !refN.sink) return;
    var want = !!(ref && ref.loaded);
    if (want === !!refN.sinkOn) return;
    refN.sinkOn = want;
    if (want && !refMixN) { refN.meter = refMeterChain(refN.fader, refN.sink); refMixN = refMeterChain(master, refN.sink); }
    if (parked) { if (want) parked.push(refN.sink); else parked = parked.filter(function (n) { return n !== refN.sink; }); if (!want) try { refN.sink.disconnect(ctx.destination); } catch (e) { /* not connected */ } return; }
    try { if (want) refN.sink.connect(ctx.destination); else refN.sink.disconnect(ctx.destination); } catch (e) { /* ignore */ }
  }
  function ensureCtx() {
    if (parked) unpark();
    if (ctx) { resumeCtx(); return ctx; }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { toast("Web Audio is not supported in this browser."); return null; }
    // iPhone: play through the ring/silent switch like a music app (otherwise the pads are silent in silent mode)
    try { if (navigator.audioSession && navigator.audioSession.type !== "playback") navigator.audioSession.type = "playback"; } catch (e) { /* older browsers */ }
    try { ctx = new AC({ latencyHint: "interactive" }); } catch (e) { ctx = new AC(); }
    ctx.addEventListener ? ctx.addEventListener("statechange", onCtxState) : (ctx.onstatechange = onCtxState);
    LG = makeGraph(ctx, true);
    if (window.__ipbTD) window.__ipbTD.setCtx(ctx);
    master = LG.out;
    masterAnalyser = ctx.createAnalyser();
    masterAnalyser.fftSize = 2048;
    master.connect(masterAnalyser);
    // speaker feed of the beat goes through the A/B gate; recordings tap `master` upstream of it
    beatMon = ctx.createGain();
    masterAnalyser.connect(beatMon);
    spkGain = ctx.createGain();             // speaker-mode beat level during a vocal take (speakers only, never recorded)
    beatMon.connect(spkGain);
    spkGain.connect(ctx.destination);
    GROUPS.forEach(function (g) { groupNodes[g.id] = { gain: LG.groups[g.id], an: LG.an[g.id] }; });
    applyMixer();
    setupRecorder();
    refOnCtx();
    btPrepare();
    var st = $("audio-state");
    st.textContent = "Audio on"; st.classList.add("on");
    return ctx;
  }
  function mixGain(id) {
    var m = S.mixer[id];
    return m.m ? 0 : m.v;
  }
  function applyMixer() {
    if (!ctx) return;
    var t = ctx.currentTime;
    GROUPS.forEach(function (g) { groupNodes[g.id].gain.gain.setTargetAtTime(mixGain(g.id), t, 0.01); });
    LG.fader.gain.setTargetAtTime(mixGain("master"), t, 0.01);
    if (vocalFader) vocalFader.gain.setTargetAtTime(mixGain("vocal"), t, 0.01);
    if (vocalPan && vocalPan.pan) vocalPan.pan.setTargetAtTime(S.vox.pan || 0, t, 0.01);
    // mic monitoring only on headphones: through a speaker it would feed back and end up in the take
    if (monitorGain) monitorGain.gain.setTargetAtTime(S.vox.monitor && hpMode() === "hp" ? 1 : 0, t, 0.01);
    if (spkGain) spkGain.gain.setTargetAtTime(vox.state !== "idle" && vox.takeMode === "spk" ? spkBeatGain() : 1, t, 0.02);
    if (typeof voxPrevApply === "function") voxPrevApply(); // live auto match follows the beat faders
  }
  function hasPad(i) { return !!(customBuf[i] || stockBufs[i]); }
  function anySolo() {
    if (S.solo.some(Boolean)) return true;
    var lx = pianoPat().lx;
    if (lx && Object.keys(lx).some(function (k) { return lx[k].s; })) return true;
    return !!(S.chordTrack.lx && S.chordTrack.lx.s);
  }
  function audible(p) { return !S.mute[p] && (!anySolo() || S.solo[p]); }
  function melAudible(cfg) { return !cfg || (!cfg.m && (!anySolo() || cfg.s)); }
  /* melodic layer config: one per instrument inside a piano-roll pattern (p.lx[inst]); chord loop = S.chordTrack.lx */
  function melCfg(p, inst, create) {
    var lx = p.lx || (create ? (p.lx = {}) : null);
    if (!lx) return null;
    return lx[inst] || (create ? (lx[inst] = LY.defaults("mel")) : null);
  }
  /* melodic Decay below 100 %: the note is held for less AND its ring is faded (plucks / pianos ring past the key-up) */
  function melDecay(c, dest, t, dur, d) {
    var g = c.createGain(), hold = dur * d * 0.5, tau = dur * d * 0.2 + 0.015;
    g.gain.setValueAtTime(1, t + hold);
    g.gain.setTargetAtTime(0, t + hold, tau);
    g.connect(dest);
    return g;
  }
  function chordCfg() { return S.chordTrack.lx || (S.chordTrack.lx = LY.defaults("mel")); }
  /* the shared chain of a melodic layer in graph G (lazily built; re-applied when its config object changes) */
  function melStrip(G, key, cfg, dest) {
    key = ctxPre() + key;
    var st = G.lstrips[key];
    if (!st) { st = G.lstrips[key] = LY.Strip(G.c, dest); st.cfgRef = null; }
    if (st.cfgRef !== cfg) { st.apply(cfg || LY.defaults("mel"), G === LG && ctx ? ctx.currentTime : 0); st.cfgRef = cfg; }
    return st;
  }

  /* shared by live playback + offline bounce. o = { vel, semi, slide } */
  function playPadInto(c, G, i, when, reg, o) {
    o = o || {};
    /* Pad assignments (sampler.js, window.IPBPadAssign): a pad can BE another sound (Replace) or carry one
       alongside its drum (Layer). Switch / Empty pads never sound here — the sequencer row stays silent. */
    var PA = window.IPBPadAssign, asg = PA ? PA.get(i) : null;
    if (asg) {
      if (asg.type === "switch" || asg.type === "empty") return;
      if (asg.type === "mel") {
        PK.play(c, stripsFor(G)[i].inp, clamp((asg.note || 60) + (o.semi || 0), 0, 127), when, asg.dur || 1.1, o.vel == null ? 0.8 : o.vel, asg.inst || PK.DEFAULT, 1, null);
        if (window.__ipbTD && c === ctx) window.__ipbTD.log("pad " + (i + 1) + " melodic " + (asg.inst || "") + " note " + ((asg.note || 60) + (o.semi || 0)));
        if (asg.mode !== "layer") return;
      } else if (asg.type === "sample" || asg.type === "loop") {
        var sp = PA.playBuf(c, stripsFor(G)[i].inp, i, when, o);
        if (asg.mode !== "layer" || !sp) return;
      }
    }
    var si = asg && asg.type === "drum" && asg.drum != null ? asg.drum : i;
    var def = padDef(si), cfg = padCfg(i), bufs = stockBufs[si];
    var buf = customBuf[si] || (bufs && bufs.length ? bufs[G.rr[si]++ % bufs.length] : null), lrate = 1;
    var ls = libSnd(cfg); // swapped in from the instrument library (not loaded / offline → the kit's own sound)
    if (ls && ls.it.k === "preset") { libPresetPad(c, G, i, when, o, ls, cfg, def); return; }
    if (ls && ls.zones.length) {
      var it = ls.it, base = def.tuned && def.p && def.p.note ? def.p.note : (it.r != null ? it.r : 60), z = LIB.zone(ls, base + (o.semi || 0), o.vel);
      buf = z.buf; lrate = Math.pow(2, (base - z.root) / 12);
      if (it.k === "loop") { var lp = loopPlay(it, buf); buf = lp.buf; lrate = lp.rate; }
    }
    if (!buf) return;
    var TD = c === ctx && window.__ipbTD, tdSrc = TD ? (ls ? "lib:" + ls.it.id : customBuf[i] ? "custom:pad" : "kit:" + kitId(S.kit) + "/" + (def.name || def.id || i)) : "";
    var rate = lrate * Math.pow(2, ((cfg.tune || 0) + (o.semi || 0) + ((o.cents || 0) + (cfg.fine || 0)) / 100) / 12);
    var k, v;
    if (def.ck) {
      if (o.slide) { // legato glide: bend the voice that is still ringing instead of retriggering
        for (k = reg.length - 1; k >= 0; k--) {
          v = reg[k];
          if (v.ck === def.ck && v.start < when && v.end > when) {
            var pr = v.src.playbackRate;
            pr.cancelScheduledValues(when);
            pr.setValueAtTime(v.rate, when);
            pr.exponentialRampToValueAtTime(rate, when + (def.glide || 0.07));
            v.rate = rate;
            if (TD) TD.trig({ kind: "glide", src: tdSrc, pad: i, when: when, voices: reg.length, rate: rate });
            return;
          }
        }
      }
      for (k = reg.length - 1; k >= 0; k--) {
        v = reg[k];
        if (v.ck === def.ck && v.start < when) {
          try {
            v.g.gain.cancelScheduledValues(when);
            v.g.gain.setTargetAtTime(0, when, S.feel === "off" ? 0.008 : 0.014); // Feel: the old 808 dies naturally under the new one
            v.src.stop(when + (S.feel === "off" ? 0.06 : 0.1));
          } catch (e) { /* already stopped */ }
          reg.splice(k, 1);
        }
      }
    }
    if (ls && (ls.it.k === "loop" || buf.duration / rate > 1.5)) { // a library loop / long sound on a row re-triggers itself (no pile-up of overlapping copies)
      for (k = reg.length - 1; k >= 0; k--) {
        v = reg[k];
        if (v.pad === i && v.start < when && v.end > when) { try { v.g.gain.cancelScheduledValues(when); v.g.gain.setTargetAtTime(0, when, 0.01); v.src.stop(when + 0.08); } catch (e) { /* stopped */ } reg.splice(k, 1); }
      }
    }
    var vel = o.vel == null ? 0.8 : o.vel, amp = Math.pow(vel / 0.8, 1.5);
    if (ls && cfg.sg) amp *= dbGain(cfg.sg); // library sound matched to the kit sound it replaced (set on Use)
    var src = c.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    var g = c.createGain();
    g.gain.value = amp;
    var head = src;
    if (o.lp > 0) { // Feel: softer hit = darker (stick / beater barely lifts), as on a real kit
      var tf = c.createBiquadFilter(); tf.type = "lowpass"; tf.frequency.value = o.lp; tf.Q.value = 0.5;
      src.connect(tf); head = tf;
    }
    var off = buf._lead || 0; // library files with silence before the hit start on the hit (see library.js)
    var dur = (buf.duration - off) / rate, end = when + dur;
    if (cfg.decay < 0.995) {
      var hold = dur * cfg.decay * 0.35, tau = dur * cfg.decay * 0.12 + 0.003;
      g.gain.setValueAtTime(amp, when + hold);
      g.gain.setTargetAtTime(0, when + hold, tau);
      end = Math.min(end, when + hold + tau * 8);
    } else if (ls && dur > 0.03) { // library loops / one-shots that end without a fade: 6 ms fade so the cut never clicks
      g.gain.setValueAtTime(amp, end - 0.006); g.gain.linearRampToValueAtTime(0, end);
    }
    if (head === src) src.connect(g); else head.connect(g);
    g.connect(stripsFor(G)[i].inp);
    src.start(when, off);
    if (TD) TD.trig({ src: tdSrc, pad: i, when: when, voices: reg.length + 1, rate: rate, dur: dur, off: off, ready: lp ? lp.ready : true, why: lp && !lp.ready ? "time-stretch not ready, speed change" : "", fallback: cfg.src && !ls ? "library sound not loaded, kit sound" : "" });
    if (end < when + dur) src.stop(end);
    var voice = { pad: i, src: src, g: g, start: when, end: end, rate: rate, ck: def.ck };
    reg.push(voice);
    src.onended = function () {
      var idx = reg.indexOf(voice);
      if (idx !== -1) reg.splice(idx, 1);
    };
  }
  function feelUI() { var fe = $("feel"); if (fe) fe.value = S.feel; if (PK.setFeel) PK.setFeel(S.feel); }
  /* Pads fire on pointerdown for low latency, but on phones a finger's pointerdown does not count as a user gesture,
   * so the very first tap could not start the audio engine (silent pads on iPhone, first hit lost on Android). Taps that
   * arrive while the engine is still waking up, or before the kit's sounds have loaded, are queued and played as soon
   * as possible (within 1.5 s); the engine is unlocked on the following pointerup / touchend / click / key. */
  var pendingHits = [], audioUnlocked = false, loadingToastAt = 0;
  function feelHit(i, v) { return FEEL.liveDrum(S.feel, kitDef(S.kit), padDef(i), i, v); } // tone + variation, never delayed
  function triggerPad(i, when, vel) {
    var PAq = window.IPBPadAssign;
    if (!when && PAq && PAq.tapSwitch && PAq.tapSwitch(i)) return; // switch pad tapped (Songs pad mode): no sound
    if (!ensureCtx()) return;
    var v = vel == null ? TOOL_VEL[S.tool] : vel;
    if (!when && (ctx.state !== "running" || !hasPad(i))) {
      pendingHits.push({ i: i, vel: v, t: performance.now() });
      if (pendingHits.length > 24) pendingHits.shift();
      if (!hasPad(i) && performance.now() - loadingToastAt > 4000) { loadingToastAt = performance.now(); toast("Loading the kit sounds…"); }
      resumeCtx();
      return;
    }
    var hv = feelHit(i, v);
    playPadInto(ctx, LG, i, when || ctx.currentTime, liveVoices, { vel: hv.vel, cents: hv.cents, lp: hv.lp });
  }
  function flushHits() {
    if (!ctx || ctx.state !== "running" || !pendingHits.length) return;
    var now = performance.now(), hits = pendingHits.filter(function (h) { return now - h.t < 1500 && hasPad(h.i); });
    pendingHits = pendingHits.filter(function (h) { return now - h.t < 1500 && !hasPad(h.i); });
    if (!hits.length) return;
    var t0 = hits[0].t, base = ctx.currentTime + 0.01;
    hits.forEach(function (h) { var hv = feelHit(h.i, h.vel); playPadInto(ctx, LG, h.i, base + (h.t - t0) / 1000, liveVoices, { vel: hv.vel, cents: hv.cents, lp: hv.lp }); });
  }
  function onCtxState() { if (ctx && ctx.state === "running") flushHits(); audioPausedUI(); }
  /* visible "sound is paused" bar: a call / another app can suspend or interrupt the AudioContext with no error */
  var audioTapped = false;
  function audioPausedUI() {
    var bad = !!(ctx && audioTapped && ctx.state !== "running" && ctx.state !== "closed");
    var el = $("audio-paused");
    if (!el) {
      if (!bad) return;
      el = document.createElement("button"); el.type = "button"; el.id = "audio-paused"; el.className = "audio-paused";
      el.textContent = "🔇 Sound is paused by your device (a call or another app may be using audio). Tap to resume.";
      el.title = "Still no sound? Open Sound check (link at the top) and send the report.";
      el.addEventListener("click", function () { resumeCtx(); setTimeout(audioPausedUI, 400); });
      document.body.appendChild(el);
    }
    el.hidden = !bad;
    var st = $("audio-state");
    if (st && ctx) { st.textContent = bad ? "Sound paused — tap to resume" : "Audio on"; st.classList.toggle("on", !bad); }
  }
  function unlockAudio() {
    var c = ensureCtx(); if (!c) return;
    resumeCtx();
    if (!audioTapped) { audioTapped = true; }
    setTimeout(audioPausedUI, 600); // still not running after the tap → say so
    if (!audioUnlocked) { // older iOS also wants a sound started inside the gesture
      try { var b = c.createBuffer(1, 1, c.sampleRate), s0 = c.createBufferSource(); s0.buffer = b; s0.connect(c.destination); s0.start(0); audioUnlocked = true; } catch (e) { /* ignore */ }
    }
  }
  ["pointerup", "touchend", "click", "keydown"].forEach(function (ev) { document.addEventListener(ev, unlockAudio, { capture: true, passive: true }); });
  document.addEventListener("visibilitychange", function () { if (!document.hidden) resumeCtx(); });

  /* ---------------- Sequencer ---------------- */
  /*
   * k = global 16th-note index counted from bar 0 of the song.
   * stepInfo(k) says which pattern step to play and how (normal / half-time / sparse).
   * Shared by live playback and the offline bounce so both sound the same.
   */
  var playing = false, timer = null, nextTime = 0, curK = 0, startK = 0, uiQueue = [], uiStep = -1;
  var posAnchor = null, chordLive = [], songEndTimer = null;
  var patAnchor = 0, pendingSlot = null;   // loop mode: global 16th where the current pattern (re)started
  var pianoAnchor = 0, pianoPending = null; // piano roll: global 16th of its loop start, queued slot
  function stepDur() { return 60 / S.bpm / 4; }
  function stepInfo(k) {
    var bar = Math.floor(k / STEPS), L = plen();
    var info = { k: k, patStep: (((k - patAnchor) % L) + L) % L, fire: true, feel: "full", end: false, secStart: false, sec: null, secIdx: -1, mb: k / STEPS, m16: k - pianoAnchor };
    var A = arrangement();
    if (!A) return info;
    var b0 = 0, mb0 = 0;
    for (var i = 0; i < A.length; i++) {
      var sec = A[i];
      if (bar < b0 + sec.bars) {
        var local = k - b0 * STEPS;
        info.sec = sec; info.secIdx = i; info.feel = secFeel(i); L = secSlotLen(i);
        info.secStart = local === 0;
        if (info.feel === "half") {
          info.fire = local % 2 === 0;
          info.patStep = Math.floor(local / 2) % L;
          info.mb = mb0 + local / (STEPS * 2);
        } else {
          info.patStep = local % L;
          info.mb = mb0 + local / STEPS;
        }
        info.m16 = Math.round(info.mb * STEPS); // piano roll follows musical time (half-time sections play it at half speed)
        return info;
      }
      b0 += sec.bars;
      mb0 += secFeel(i) === "half" ? sec.bars / 2 : sec.bars;
    }
    info.end = true;
    return info;
  }
  function chordAt(info, first) {
    var CT = S.chordTrack;
    if (!CT || !CT.on || !CT.prog.length) return null;
    var m16 = Math.round(info.mb * STEPS), span = Math.max(1, CT.bars) * STEPS;
    var slot = Math.floor(m16 / span) % CT.prog.length;
    return { slot: slot, idx: CT.prog[slot], change: !!first || m16 % span === 0 };
  }
  function rootSemi(ci) {
    var r = CHORDS[ci] ? CHORDS[ci].r : 0; // semitones above C; keep 808 within -6..+5
    return r > 5 ? r - 12 : r;
  }
  /* humanise: fixed pseudo-random offset per (16th, pad) → the groove feels played but every bounce is identical */
  function humJitter(k, p) {
    var h = Math.imul((k * 16 + p) ^ 0x9e3779b9, 0x85ebca6b);
    h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
    return ((h >>> 0) / 4294967296) * 2 - 1;
  }
  function scheduleStep(c, G, info, t, reg, creg, first) {
    if (!drumsOn()) return; // instrumental loaded: drum machine + chord loop stay silent unless "Layer drum machine" is on
    var half = info.feel === "half";
    var len = stepDur() * (half ? 2 : 1);
    var sw = info.patStep % 2 === 1 ? len * (S.swing / 100) : 0;
    schedulePiano(c, G, info, t, len);
    var ch = chordAt(info, first);
    if (ch && ch.change) { var cc = chordCfg(); startChord(c, ch.idx, t + cc.nudge / 1000, melStrip(G, "chord", cc, G.groups.keys).inp, creg); }
    var kit = kitDef(S.kit), s = info.patStep;
    for (var p = 0; p < 16; p++) {
      var v = S.pattern[p][s];
      if (!v || !audible(p)) continue;
      var def = kit.pads[p], grp = def.g;
      if (info.feel === "sparse" && (grp === "drums" || grp === "bass")) continue;
      var semi = S.note[p][s] || 0;
      if (ch && ch.idx >= 0 && S.chordTrack.bassFollow && grp === "bass") semi += rootSemi(ch.idx);
      var off = (padCfg(p).nudge || 0) / 1000 + (def.hum ? humJitter(info.k, p) * def.hum / 1000 : 0);
      var vel = S.vel[p][s], slide = !!S.slide[p][s];
      for (var r = 0; r < v; r++) {
        var hz = FEEL.drum({ mode: S.feel, kit: kit, def: def, k: info.k, step: s, pad: p, vel: vel, r: r, n: v });
        playPadInto(c, G, p, Math.max(0, t + sw + off + hz.dt + (r * len) / v), reg, { semi: semi, vel: hz.vel, cents: hz.cents, lp: hz.lp, slide: slide && r === 0 });
      }
    }
    // Live feel: a drummer's ghost note on the 16th before a backbeat (swung styles only, never on top of a written hit)
    if (S.feel === "live" && !half) for (var gp = 0; gp < 16; gp++) {
      var gd = kit.pads[gp], nx = (s + 1) % plen();
      if (!gd || !audible(gp) || customBuf[gp] || !S.pattern[gp][nx] || nx % 8 !== 4) continue;
      var gv = FEEL.ghost(S.feel, kit, gd, info.k, s, !!S.pattern[gp][s], true);
      if (gv) { var gz = FEEL.drum({ mode: S.feel, kit: kit, def: gd, k: info.k, step: s, pad: gp, vel: gv }); playPadInto(c, G, gp, Math.max(0, t + sw + gz.dt), reg, { vel: gz.vel, cents: gz.cents, lp: gz.lp }); }
    }
    // crash on each new section (not intro / sparse parts)
    if (info.secStart && info.secIdx > 0 && info.feel !== "sparse" && kit.crashPad >= 0) playPadInto(c, G, kit.crashPad, t, reg, {});
  }
  function applySlot(id, k) {
    S.slot = id; bindSlot();
    pendingSlot = null;
    patAnchor = k;
  }
  /* lookahead grows (0.12 → up to 0.3 s) if the main thread is ever late (busy tablet), so notes are never scheduled late */
  var LOOK = 0.12, schedLast = 0;
  function scheduler() {
    var now = performance.now();
    if (schedLast && playing) { var gap = (now - schedLast) / 1000; if (gap > LOOK * 0.6) LOOK = Math.min(0.3, Math.max(LOOK, gap * 1.6)); }
    schedLast = now;
    while (playing && nextTime < ctx.currentTime + LOOK) {
      var info = stepInfo(curK);
      if (pendingSlot && !info.end && info.fire && info.patStep === 0) {
        applySlot(pendingSlot, curK);
        info = stepInfo(curK);
        uiQueue.push({ step: -1, k: curK, time: nextTime, fire: false, slot: true });
      }
      if (pianoPending && !info.end && info.fire && pianoStepOf(info) === 0) {
        S.piano.slot = pianoPending; pianoPending = null;
        if (!arrangement()) { pianoAnchor = curK; info = stepInfo(curK); }
        uiQueue.push({ step: -1, k: curK, time: nextTime, fire: false, pslot: true });
      }
      if (info.end && !btActive()) { endSong(nextTime); return; } // with an instrumental, its own end stops the take
      if (info.fire && !info.end) secStep(ctx, LG, info, nextTime, liveVoices, chordLive, curK === startK);
      uiQueue.push({ step: info.patStep, k: curK, time: nextTime, fire: info.fire });
      nextTime += stepDur();
      curK++;
    }
  }
  function endSong(t) {
    clearInterval(timer); timer = null;
    clearTimeout(songEndTimer);
    songEndTimer = setTimeout(function () {
      if (!playing) return;
      stop();
      onSongEnded();
    }, Math.max(0, (t - ctx.currentTime) * 1000) + 30);
  }
  function play(startAt) {
    if (!ensureCtx() || playing) return;
    pianoSamplesLoad();
    var A = arrangement();
    if (A && S.cueBar >= totalBars(A)) S.cueBar = 0;
    playing = true;
    startK = curK = S.cueBar * STEPS;
    patAnchor = startK;
    pianoAnchor = startK;
    if (pendingSlot) applySlot(pendingSlot, startK);
    if (pianoPending) { S.piano.slot = pianoPending; pianoPending = null; pianoUI(true); }
    livePeak = 0;
    nextTime = startAt || ctx.currentTime + 0.06;
    uiQueue = [];
    posAnchor = { k: curK, time: nextTime };
    if (btActive()) btStart(nextTime, S.cueBar * barSec());
    schedLast = 0;
    timer = setInterval(scheduler, 25);
    scheduler();
    $("btn-play").classList.add("on");
    updatePlayButtons();
    refOnBeatPlay(posAnchor.time);
  }
  /* stop = stop and rewind to bar 1 (old behaviour); keepCue = pause at the current bar */
  function stop(keepCue) {
    if (!playing) return;
    if (vpv && vpv.src) voxPrevStop(true);
    var pos = currentPosK();
    playing = false;
    clearInterval(timer);
    timer = null;
    clearTimeout(songEndTimer);
    uiQueue = [];
    setNowColumn(-1);
    if (ctx) cutChords(chordLive, ctx.currentTime);
    if (ctx && LG) { LG.preg.forEach(function (v) { v.stop(ctx.currentTime); }); LG.preg = []; }
    klStopPreview(); // ■ stops a keys-loop preview too (it used to run on for its 4 bars)
    if (pianoPending) { S.piano.slot = pianoPending; pianoPending = null; pianoUI(true, true); saveSession(); } // queued piano pattern: switch now
    btStop();
    S.cueBar = keepCue ? Math.max(0, Math.floor(pos / STEPS)) : 0;
    $("btn-play").classList.remove("on");
    updatePlayButtons();
    saveSession();
    refOnBeatStop();
  }
  function pause() { stop(true); }
  function togglePlay() { playing ? pause() : play(); }
  function currentPosK() {
    if (!playing || !posAnchor || !ctx) return S.cueBar * STEPS;
    var d = (ctx.currentTime - posAnchor.time) / stepDur();
    return posAnchor.k + clamp(d, 0, 1);
  }
  function cueTo(bar) {
    var wasPlaying = playing && !(vox.state === "rec" || vox.state === "count");
    if (vox.state !== "idle") { toast("Stop the vocal take first."); return; }
    if (playing) stop();
    S.cueBar = Math.max(0, Math.floor(bar));
    saveSession();
    prForceScroll = true;
    if (wasPlaying) play();
  }
  function updatePlayButtons() {
    var pp = $("pn-play");
    if (pp) { pp.textContent = playing ? "❚❚ Pause" : "▶ Play"; pp.classList.toggle("on", playing); }
    var bp = $("bt-play");
    if (bp) { bp.textContent = playing ? "❚❚ Pause" : "▶ Play"; bp.classList.toggle("on", playing); }
    var b = $("pr-play");
    if (b) {
      b.textContent = playing ? "❚❚ Pause" : "▶ Play";
      b.classList.toggle("on", playing);
    }
  }

  /* ---------------- Chord loop voices (sample-accurate, used live + offline) ---------------- */
  var SYNTH = {
    pad: { a: 0.08, peak: 0.16, sus: 0.16, dec: 0.1, rel: 0.8 },
    keys: { a: 0.006, peak: 0.28, sus: 0.1, dec: 0.9, rel: 0.35 },
    pluck: { a: 0.003, peak: 0.24, sus: 0.0001, dec: 1.0, rel: 0.2 },
    bell: { a: 0.002, peak: 0.24, sus: 0.0001, dec: 2.4, rel: 0.6 }
  };
  function synthNote(c, dest, midi, t, dur, type, vs) { // vs = Feel level scale (null = Off, old sound)
    var f = mf(midi), env = SYNTH[type] || SYNTH.pad;
    var out = c.createGain(), oscs = [];
    out.gain.setValueAtTime(0.0001, t);
    out.connect(dest);
    function osc(kind, freq, gain, det, d) {
      var o = c.createOscillator(), g = c.createGain();
      o.type = kind; o.frequency.value = freq; if (det) o.detune.value = det;
      g.gain.value = gain;
      o.connect(g); g.connect(d || out); o.start(t); oscs.push(o);
    }
    if (type === "keys") {
      osc("sine", f, 0.8); osc("sine", f * 2, 0.15); osc("triangle", f, 0.2);
    } else if (type === "pluck") {
      var lp2 = c.createBiquadFilter();
      lp2.type = "lowpass"; lp2.Q.value = 3;
      lp2.frequency.setValueAtTime(4200, t);
      lp2.frequency.exponentialRampToValueAtTime(380, t + 0.35);
      lp2.connect(out);
      osc("sawtooth", f, 0.6, 0, lp2); osc("square", f, 0.2, 5, lp2);
    } else if (type === "bell") {
      osc("sine", f, 0.8); osc("sine", f * 2.76, 0.3); osc("sine", f * 5.4, 0.1);
    } else {
      var lp = c.createBiquadFilter();
      lp.type = "lowpass"; lp.frequency.value = 1300; lp.Q.value = 0.7; lp.connect(out);
      osc("sawtooth", f, 0.5, -9, lp); osc("sawtooth", f, 0.5, 9, lp); osc("sine", f / 2, 0.4, 0, lp);
    }
    var pk = vs ? env.peak * vs : env.peak, su = vs ? env.sus * vs : env.sus;
    var at = vs && type === "pad" ? env.a * 2.5 : env.a; // Feel: chord pad swells in like a section, not a switch
    out.gain.exponentialRampToValueAtTime(pk, t + at);
    out.gain.exponentialRampToValueAtTime(su, t + at + env.dec);
    out.gain.setTargetAtTime(0.0001, t + dur, env.rel / 4);
    oscs.forEach(function (o) { o.stop(t + dur + env.rel + 0.3); });
    return { out: out, oscs: oscs, t: t };
  }
  function cutChords(reg, t) {
    reg.forEach(function (v) {
      if (v.lib) { v.stop(t); return; }
      try {
        var g = v.out.gain;
        if (g.cancelAndHoldAtTime) g.cancelAndHoldAtTime(t); else g.cancelScheduledValues(t);
        g.setTargetAtTime(0.0001, t, 0.05);
        v.oscs.forEach(function (o) { o.stop(t + 0.4); });
      } catch (e) { /* already stopped */ }
    });
    reg.length = 0;
  }
  function startChord(c, ci, t, dest, reg) {
    cutChords(reg, t);
    var ch = CHORDS[ci];
    if (!ch) return; // "—" = rest
    var lc = chordCfg();
    if (!melAudible(lc)) return; // chord layer muted / another layer soloed
    var dur = barSec() * Math.max(1, S.chordTrack.bars) * 2 * lc.decay + 0.5; // cut earlier by the next chord / stop
    var cn = QUAL[ch.q].map(function (iv) { return { p: 48 + ch.r + iv + lc.tune + lc.fine / 100, t: Math.max(0, t), v: 0.8 }; });
    FEEL.chord(S.feel, cn, Math.round(t * 1000), FEEL.style(kitDef(S.kit)));
    var ls = libSnd(lc);
    cn.forEach(function (n) {
      if (ls) { reg.push(libVoice(c, dest, n.p, n.t, dur - (n.t - t), n.v, ls, 0.6 * (lc.sg ? dbGain(lc.sg) : 1))); return; }
      reg.push(synthNote(c, dest, n.p, n.t, dur - (n.t - t), S.chordTrack.sound, S.feel === "off" ? null : n.v / 0.8));
    });
  }

  /* ---------------- UI: pads + inspector + sequencer ---------------- */
  var padEls = [], seqRows = [], seqCells = [], laneBars = [];
  function padLabel(i) { var li = libItem(padCfg(i)); return customBuf[i] ? (customName[i] || "Custom") : li ? "⇄ " + li.n : padDef(i).n; }
  function buildPads() {
    var wrap = $("pads");
    wrap.innerHTML = "";
    padEls = [];
    for (var i = 0; i < 16; i++) {
      (function (i) {
        var el = document.createElement("button");
        el.type = "button";
        el.className = "pad";
        el.setAttribute("aria-label", "Pad " + (i + 1));
        el.addEventListener("pointerdown", function (e) {
          e.preventDefault();
          triggerPad(i);
          flashPad(i);
          selectPad(i);
        });
        onLongPress(el, function () { selectPad(i); if (window.IPBPadAssign) IPBPadAssign.openPanel(i); else { lyOpen({ kind: "drum", pad: i }); swOpen({ kind: "drum", pad: i }); } });
        wrap.appendChild(el);
        padEls.push(el);
      })(i);
    }
    refreshPads();
  }
  function refreshPads() {
    padEls.forEach(function (el, i) {
      var def = padDef(i);
      el.className = "pad g-" + def.g + (i === S.sel ? " sel" : "") + (customBuf[i] ? " custom" : "") +
        (S.mute[i] ? " muted" : "") + (S.solo[i] ? " soloed" : "");
      el.innerHTML =
        '<span class="ptag">' + (i + 1) + "</span>" +
        (PAD_KEYS[i] ? '<span class="pkey">' + PAD_KEYS[i].toUpperCase() + "</span>" : "") +
        '<span class="pname"></span>';
      var name = padLabel(i);
      el.querySelector(".pname").textContent = name.length > 14 ? name.slice(0, 13) + "…" : name;
    });
    refreshInspector();
    if (window.IPBPadAssign) IPBPadAssign.decorate(padEls);
  }
  var PE = [
    { id: "pitch", key: "tune", fmt: function (v) { return (v > 0 ? "+" : "") + v + " st"; } },
    { id: "decay", key: "decay", fmt: function (v) { return Math.round(v * 100) + "%"; } },
    { id: "level", key: "level", fmt: function (v) { return (v > 0 ? "+" : "") + (+v).toFixed(1) + " dB"; } },
    { id: "pan", key: "pan", fmt: function (v) { v = Math.round(v * 100); return v === 0 ? "C" : v < 0 ? "L" + -v : "R" + v; } },
    { id: "drive", key: "drive", fmt: function (v) { return Math.round(v * 100) + "%"; } },
    { id: "nudge", key: "nudge", fmt: function (v) { return (v > 0 ? "+" : "") + v + " ms"; } }
  ];
  function refreshInspector() {
    var i = S.sel, cfg = padCfg(i), def = padDef(i);
    $("sel-pad-name").textContent = (i + 1) + " · " + padLabel(i);
    var gt = $("sel-pad-group");
    if (gt) gt.textContent = (GROUPS.filter(function (g) { return g.id === def.g; })[0] || {}).name + (def.tuned ? " · tuned" : "");
    PE.forEach(function (p) {
      var el = $("pad-" + p.id);
      if (!el) return;
      el.value = cfg[p.key];
      $("pad-" + p.id + "-val").textContent = p.fmt(cfg[p.key]);
    });
    $("pe-mute").classList.toggle("on", !!S.mute[i]);
    $("pe-solo").classList.toggle("on", !!S.solo[i]);
    if (window.IPBPadAssign) IPBPadAssign.selChanged(i);
    if (lyT) { if (lyT.kind === "drum" && (lyT.pad !== i || lyT.kit !== S.kit)) { lyT = { kind: "drum", pad: i, kit: S.kit }; } lyRefresh(); }
    lyDots();
  }
  /* ---------------- Layer sheet: tweakable layers (one strip of big knobs per sound layer) ----------------
     Targets: { kind: "drum", pad, kit } · { kind: "mel", slot, inst } (piano-roll / keys-loop instrument) · { kind: "chord" } */
  var lyHist = LY.History(150), lyT = null, lySaveT = null, lyEls = null;
  function lyKind(T) { return T.kind === "drum" ? "drum" : "mel"; }
  function lyBase(T) { return T.kind === "drum" ? padBase(kitDef(T.kit).pads[T.pad]) : null; }
  function lyCfg(T) { return T.kind === "drum" ? padCfg(T.pad, T.kit) : T.kind === "chord" ? chordCfg() : melCfg(S.piano.slots[T.slot], T.inst, true); }
  function lyName(T) {
    if (T.kind === "drum") return (T.pad + 1) + " · " + kitDef(T.kit).pads[T.pad].n;
    if (T.kind === "chord") return "Chord loop";
    return klInstName(T.inst) + " · Piano " + T.slot;
  }
  function lySub(T) {
    if (T.kind === "drum") { var d = kitDef(T.kit).pads[T.pad]; return ((GROUPS.filter(function (g) { return g.id === d.g; })[0] || {}).name || "") + " row" + (d.ck ? " · glide on slides" : ""); }
    return T.kind === "chord" ? "Chord loop synth" : "Piano Roll layer";
  }
  function lySubFull(T) { var li = libItem(lyCfg(T)); return lySub(T) + (li ? " · sound: " + li.n : ""); }
  function lyMuted(T) { return T.kind === "drum" ? !!S.mute[T.pad] : !!lyCfg(T).m; }
  function lySoloed(T) { return T.kind === "drum" ? !!S.solo[T.pad] : !!lyCfg(T).s; }
  function lyTweaked(T) { return LY.tweaked(lyCfg(T), lyKind(T), lyBase(T)); }
  function lyApply(T) {
    if (!LG || !ctx) return;
    var t = ctx.currentTime;
    if (T.kind === "drum") { if (T.kit === S.kit) stripApply(LG, T.pad, t); return; }
    var cfg = lyCfg(T), st = LG.lstrips[ctxPre() + (T.kind === "chord" ? "chord" : T.slot + ":" + T.inst)];
    if (st) { st.apply(cfg, t); st.cfgRef = cfg; }
  }
  function lyChanged(T, quiet) {
    lyApply(T);
    lyDots();
    if (T.kind === "drum" && T.pad === S.sel && !quiet) refreshInspector();
    if (lyT) lyRefresh();
    if (swT) swNow();
    if (T.kind === "drum") libLabels();
    clearTimeout(lySaveT); lySaveT = setTimeout(saveSession, 250);
  }
  function lySet(T, key, v) { lyCfg(T)[key] = v; lyChanged(T); }
  function lyHistUI() { if (!lyEls) return; var c = lyHist.can(); lyEls.undo.disabled = !c.undo; lyEls.redo.disabled = !c.redo; }
  function lyPush(T, label, before, after) {
    lyHist.push({ label: label,
      undo: function () { var c = lyCfg(T); Object.keys(before).forEach(function (k) { c[k] = before[k]; }); lyChanged(T); },
      redo: function () { var c = lyCfg(T); Object.keys(after).forEach(function (k) { c[k] = after[k]; }); lyChanged(T); } });
    lyHistUI();
  }
  function lyAudition(T) {
    if (playing) return;
    if (T.kind === "drum") { if (T.kit === S.kit) triggerPad(T.pad); }
    else if (T.kind === "mel" && T.slot === S.piano.slot && T.inst === pianoPat().inst) pianoPreview(60 + (pianoPat().key || 0) - (pianoPat().key > 5 ? 12 : 0));
  }
  function lyKnobVal(k, el) { return k.val ? k.val(+el.value) : +el.value; }
  function lyBuild() {
    var sh = document.createElement("section");
    sh.className = "lyr-sheet"; sh.id = "lyr-sheet"; sh.hidden = true;
    sh.setAttribute("aria-label", "Layer knobs");
    sh.innerHTML =
      '<div class="lyr-head"><div class="lyr-title"><span class="label">Layer</span> <strong id="lyr-name"></strong> <span class="lyr-sub" id="lyr-sub"></span></div>' +
      '<div class="lyr-acts"><button type="button" class="btn small lyr-swap" id="lyr-swap" title="Swap this layer\'s sound from the instrument library (knobs stay)">⇄ Swap</button><button type="button" class="ms lyr-ms" id="lyr-m" title="Mute this layer">M</button><button type="button" class="ms lyr-ms" id="lyr-s" title="Solo this layer">S</button>' +
      '<button type="button" class="btn small ghost" id="lyr-undo" title="Undo knob change">↶</button><button type="button" class="btn small ghost" id="lyr-redo" title="Redo knob change">↷</button>' +
      '<button type="button" class="btn small ghost" id="lyr-reset">Reset layer</button><button type="button" class="btn small ghost lyr-x" id="lyr-close" aria-label="Close layer knobs">✕</button></div></div>' +
      '<div class="lyr-knobs" id="lyr-knobs"></div><p class="lyr-hint">Drag a slider · double-tap it to reset · changes play live</p>';
    document.body.appendChild(sh);
    var wrap = sh.querySelector("#lyr-knobs"), knobs = {};
    LY.KNOBS.forEach(function (k) {
      var lab = document.createElement("label"); lab.className = "lyr-k"; lab.dataset.key = k.key;
      lab.innerHTML = '<span class="lyr-l"></span><output class="lyr-v mono"></output><input type="range">';
      var el = lab.querySelector("input"), out = lab.querySelector("output"), before = null, lastTap = 0, holdUntil = 0;
      el.min = k.min; el.max = k.max; el.step = k.step;
      function grab() { if (lyT && before === null) before = lyCfg(lyT)[k.key]; }
      function commit() {
        if (!lyT || before === null) return;
        var after = lyCfg(lyT)[k.key], b = {}, a = {};
        if (after !== before) { b[k.key] = before; a[k.key] = after; lyPush(lyT, k.label, b, a); }
        before = null;
        if (k.key === "tune" || k.key === "fine" || k.key === "decay") lyAudition(lyT);
      }
      function reset() {
        if (!lyT) return;
        var d = LY.defaults(lyKind(lyT), lyBase(lyT))[k.key], cur = lyCfg(lyT)[k.key], b = {}, a = {};
        before = null;
        holdUntil = Date.now() + 450; // the second tap's own slider jump must not undo the reset
        if (cur === d) return;
        b[k.key] = cur; a[k.key] = d;
        lySet(lyT, k.key, d); lyPush(lyT, k.label + " reset", b, a);
        toast(k.label + " reset");
      }
      el.addEventListener("pointerdown", function (e) {
        var now = Date.now();
        if (now - lastTap < 320) { e.preventDefault(); lastTap = 0; reset(); return; }
        lastTap = now; grab();
      });
      el.addEventListener("dblclick", function (e) { e.preventDefault(); reset(); });
      el.addEventListener("focus", grab);
      el.addEventListener("input", function () {
        if (!lyT) return;
        if (Date.now() < holdUntil) { var cv = lyCfg(lyT)[k.key]; el.value = k.pos ? k.pos(cv) : cv; return; }
        grab(); var c = lyCfg(lyT); c[k.key] = lyKnobVal(k, el); out.textContent = k.fmt(c[k.key]); lyChanged(lyT); });
      el.addEventListener("change", commit);
      wrap.appendChild(lab);
      knobs[k.key] = { k: k, lab: lab, el: el, out: out, name: lab.querySelector(".lyr-l") };
    });
    lyEls = { sh: sh, knobs: knobs, undo: sh.querySelector("#lyr-undo"), redo: sh.querySelector("#lyr-redo") };
    sh.querySelector("#lyr-close").addEventListener("click", function () { lyClose(); });
    lyEls.undo.addEventListener("click", function () { var e = lyHist.undo(); if (e) toast("Undo " + e.label); lyHistUI(); });
    lyEls.redo.addEventListener("click", function () { var e = lyHist.redo(); if (e) toast("Redo " + e.label); lyHistUI(); });
    sh.querySelector("#lyr-reset").addEventListener("click", function () {
      if (!lyT) return;
      var T = lyT, c = lyCfg(T), d = LY.defaults(lyKind(T), lyBase(T)), b = {}, a = {};
      LY.KNOBS.forEach(function (k) { if (c[k.key] !== d[k.key]) { b[k.key] = c[k.key]; a[k.key] = d[k.key]; c[k.key] = d[k.key]; } });
      if (!Object.keys(b).length) { toast("Layer is already at its defaults"); return; }
      lyPush(T, "reset layer", b, a); lyChanged(T); toast("Layer reset");
    });
    sh.querySelector("#lyr-swap").addEventListener("click", function () { if (lyT) swOpen(lyT); });
    sh.querySelector("#lyr-m").addEventListener("click", function () { lyMS("m"); });
    sh.querySelector("#lyr-s").addEventListener("click", function () { lyMS("s"); });
  }
  function lyMS(kind) {
    if (!lyT) return;
    if (lyT.kind === "drum") { toggleMS(kind, lyT.pad); }
    else { var c = lyCfg(lyT); c[kind] = !c[kind]; refreshMS(); }
    lyChanged(lyT);
  }
  function lyRefresh() {
    if (!lyEls || !lyT) return;
    var T = lyT, c = lyCfg(T), kind = lyKind(T);
    $("lyr-name").textContent = lyName(T);
    $("lyr-sub").textContent = lySubFull(T);
    $("lyr-m").classList.toggle("on", lyMuted(T));
    $("lyr-s").classList.toggle("on", lySoloed(T));
    lyEls.sh.classList.toggle("tw", lyTweaked(T));
    var d = LY.defaults(kind, lyBase(T));
    LY.KNOBS.forEach(function (k) {
      var o = lyEls.knobs[k.key], r = LY.range(k, kind);
      o.name.textContent = r.label;
      if (!k.pos) { o.el.min = r.min; o.el.max = r.max; }
      var pos = k.pos ? k.pos(c[k.key]) : c[k.key];
      if (document.activeElement !== o.el || +o.el.value !== pos) o.el.value = pos;
      o.out.textContent = k.fmt(c[k.key]);
      o.lab.classList.toggle("changed", Math.abs(c[k.key] - d[k.key]) > 1e-6);
    });
    lyHistUI();
  }
  function lyOpen(T) {
    if (!lyEls) lyBuild();
    if (T.kind === "drum") T.kit = S.kit;
    lyT = T;
    lyEls.sh.hidden = false;
    document.body.classList.add("lyr-open");
    lyRefresh();
    requestAnimationFrame(function () { document.body.style.paddingBottom = lyEls.sh.offsetHeight + "px"; });
  }
  function lyClose() {
    lyT = null;
    if (lyEls) lyEls.sh.hidden = true;
    document.body.classList.remove("lyr-open");
    document.body.style.paddingBottom = "";
  }
  /* "tweaked" dots on drum rows, pads, piano layer chips and the chord loop button */
  function lyDots() {
    seqRows.forEach(function (row, p) { var n = row.querySelector(".rname"); if (n) n.classList.toggle("tw", LY.tweaked(padCfg(p), "drum", padBase(padDef(p)))); });
    padEls.forEach(function (el, p) { el.classList.toggle("tw", LY.tweaked(padCfg(p), "drum", padBase(padDef(p)))); });
    var cb = $("cl-layer"); if (cb) cb.classList.toggle("tw", LY.tweaked(chordCfg(), "mel"));
    lyBar();
  }
  /* Piano Roll "Layers" bar: one chip per instrument in the current pattern (+ the chord loop when it is on) */
  function lyBar() {
    var bar = $("pn-layers");
    if (!bar) return;
    var p = pianoPat(), slot = S.piano.slot, html = '<span class="label">Layers</span>';
    var items = PD.instsOf(p).map(function (id) { return { kind: "mel", slot: slot, inst: id }; });
    if (S.chordTrack.on) items.push({ kind: "chord" });
    bar.innerHTML = html;
    items.forEach(function (T) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "btn small lyr-chip" + (lyTweaked(T) ? " tw" : "") + (lyMuted(T) ? " muted" : "") + (lyT && lyT.kind === T.kind && lyT.inst === T.inst && lyT.slot === T.slot ? " on" : "");
      b.textContent = "🎛 " + (T.kind === "chord" ? "Chord loop" : klInstName(T.inst));
      b.title = "Knobs for this layer: pitch, length, filter, volume, pan, grit, swing push, mute / solo";
      b.addEventListener("click", function () { lyOpen(T); lyBar(); });
      bar.appendChild(b);
    });
  }
  /* ---------------- Instrument library + Swap (library.js) ----------------
     A layer's `src` slot (layers.js) holds a library sound id; null = the kit / pattern's own sound. Knobs are untouched by a swap.
     A sound that is not downloaded yet (or offline) plays the kit sound instead — never silence. */
  var libKey = null;
  function libItem(cfg) { return cfg && cfg.src && LIB ? LIB.item(cfg.src) : null; }
  function libSnd(cfg) { return cfg && cfg.src && LIB ? LIB.get(cfg.src) : null; }
  function libIds() {
    var out = [];
    function add(c) { if (c && c.src && out.indexOf(c.src) === -1) out.push(c.src); }
    function from(o) {
      Object.keys(o.padCfg || {}).forEach(function (k) { (o.padCfg[k] || []).forEach(add); });
      if (o.piano) SLOT_IDS.forEach(function (id) { var p = o.piano.slots[id]; if (p && p.lx) Object.keys(p.lx).forEach(function (k) { add(p.lx[k]); }); });
      if (o.chordTrack) add(o.chordTrack.lx);
    }
    from(S);
    if (SONG) from(SONG);
    var m = secMap(false); Object.keys(m || {}).forEach(function (k) { from(m[k]); }); // section editing: every section's swaps
    return out;
  }
  function libSync(force) {
    if (!LIB) return;
    var ids = libIds(), key = ids.join(",");
    LIB.pin(ids);
    if (key === libKey && !force) return;
    libKey = key;
    if (ids.length) LIB.want(ids, ctx);
  }
  var libLabelT = null;
  function libLabels() {
    clearTimeout(libLabelT);
    libLabelT = setTimeout(function () {
      seqRows.forEach(function (row, q) { var rn = row.querySelector(".rname"); if (rn && !rn.dataset.noLabel) { rn.textContent = padLabel(q); rn.title = padLabel(q) + " — tap for knobs, hold to swap the sound"; } });
      if (padEls.length) refreshPads();
      if (lyT) lyRefresh();
    }, 30);
  }
  function lpDest(c, dest, f) { if (!f) return dest; var b = c.createBiquadFilter(); b.type = "lowpass"; b.frequency.value = f; b.Q.value = 0.6; b.connect(dest); return b; }
  function libPresetPad(c, G, i, when, o, ls, cfg, def) {
    var p = ls.it.p, m = (def.tuned && def.p && def.p.note ? def.p.note : 60) + (o.semi || 0) + (p.oct || 0) + (cfg.tune || 0) + (cfg.fine || 0) / 100;
    if (PK.setTempo) PK.setTempo(S.bpm);
    PK.play(c, lpDest(c, stripsFor(G)[i].inp, p.lp), m, when, 0.12 + 0.6 * cfg.decay, o.vel == null ? 0.8 : o.vel, p.i, 1, p.tone || null);
  }
  /* one note of a library sound (multisample / one-shot with a root / synth preset). Returns { lib, stop(t), end } */
  function libVoice(c, dest, midi, when, dur, vel, snd, gain) {
    var it = snd.it, none = { lib: 1, end: 0, stop: function () {} };
    if (it.k === "preset") {
      var p = it.p, v = PK.play(c, lpDest(c, dest, p.lp), midi + (p.oct || 0), when, dur, vel, p.i, gain, p.tone || null);
      return { lib: 1, end: v && v.end ? v.end : when + dur + 1, stop: function (t) { if (v && v.stop) v.stop(t); } };
    }
    var z = LIB.zone(snd, Math.round(midi), vel);
    if (!z) return none;
    var src = c.createBufferSource(), g = c.createGain(), r = Math.pow(2, (midi - z.root) / 12);
    var amp = (gain == null ? 1 : gain) * 0.8 * Math.pow(clamp(vel == null ? 0.8 : vel, 0.05, 1) / 0.8, 1.2);
    src.buffer = z.buf; src.playbackRate.value = r;
    g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(amp, when + 0.003);
    var rel = it.sus ? 0.1 : 0.16, off = when + Math.max(0.04, dur);
    g.gain.setValueAtTime(amp, off); g.gain.setTargetAtTime(0, off, rel / 3);
    var lead = z.buf._lead || 0;
    src.connect(g); g.connect(dest); src.start(when, lead);
    var end = Math.min(when + (z.buf.duration - lead) / r, off + rel * 3);
    if (c === ctx && window.__ipbTD) window.__ipbTD.trig({ kind: "note", src: "lib:" + it.id, when: when, rate: r, dur: end - when, off: lead });
    src.stop(end + 0.05);
    return { lib: 1, end: end, stop: function (t) {
      try { t = Math.max(t, when); g.gain.cancelScheduledValues(t); g.gain.setTargetAtTime(0, t, 0.02); src.stop(t + 0.15); } catch (e) { /* already stopped */ } } };
  }
  function melPlay(c, dest, midi, when, dur, vel, inst, gain, tone, lc) {
    var ls = libSnd(lc);
    if (ls) return libVoice(c, dest, midi, when, dur, vel, ls, (gain == null ? 1 : gain) * (lc && lc.sg ? dbGain(lc.sg) : 1));
    return PK.play(c, dest, midi, when, dur, vel, inst, gain, tone);
  }
  function onLongPress(el, fn) {
    var t = null, sx = 0, sy = 0;
    el.addEventListener("pointerdown", function (e) {
      sx = e.clientX; sy = e.clientY; el._lp = false; clearTimeout(t);
      t = setTimeout(function () { el._lp = true; if (navigator.vibrate) try { navigator.vibrate(15); } catch (x) { /* ignore */ } fn(); }, 550);
    });
    ["pointerup", "pointercancel", "pointerleave"].forEach(function (ev) { el.addEventListener(ev, function () { clearTimeout(t); }); });
    el.addEventListener("pointermove", function (e) { if (Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy) > 14) clearTimeout(t); });
    el.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  }
  function longPressed(el) { if (el._lp) { el._lp = false; return true; } return false; }

  var swEls = null, swT = null, swF = null, swList = [], swSel = null, swCached = {}, swPrevVoice = null, swPrevInfo = null, swBusyId = null;
  var SW_TAGS = ["Boom-bap", "West Coast", "Trap", "Drill", "Island", "Dark", "Jazzy", "Dusty"];
  var SW_MEL = { multi: 1, preset: 1 };
  function swMelOk(it) { return (SW_MEL[it.k] || (it.k === "one" && it.r != null)) && it.c !== "perc" && it.c !== "drums" && it.c !== "fx" && it.c !== "loop"; }
  function swSuggest(T) {
    if (T.kind === "chord") return { cats: ["keys", "synth", "orch"], subs: null, label: "Keys, synths & strings" };
    if (T.kind !== "drum") return { cats: ["keys", "synth", "orch", "bass", "808"], subs: null, label: "Instruments" };
    var d = kitDef(T.kit || S.kit).pads[T.pad], v = d.v, n = (d.n || "").toLowerCase();
    if (v === "kick") return { cats: ["drums"], subs: ["kick"], label: "Kicks" };
    if (v === "snare") return { cats: ["drums"], subs: ["snare", "clap"], label: "Snares & claps" };
    if (v === "clap" || v === "snap") return { cats: ["drums"], subs: ["clap", "snare"], label: "Claps & snares" };
    if (v === "rim") return { cats: ["drums"], subs: ["rim"], label: "Rims" };
    if (v === "hat") return (d.p && d.p.dec > 0.15) || /open/.test(n) ? { cats: ["drums"], subs: ["ohat"], label: "Open hats" } : { cats: ["drums"], subs: ["hat"], label: "Hi-hats" };
    if (v === "crash") return { cats: ["drums"], subs: ["cym"], label: "Cymbals" };
    if (v === "tom") return { cats: ["drums"], subs: ["tom", "fill"], label: "Toms & fills" };
    if (d.g === "bass") return { cats: ["808", "bass"], subs: null, label: "808s & bass" };
    if (v === "stab" || v === "vox" || d.g === "keys") return { cats: ["orch", "keys", "fx"], subs: ["stab", "oneshot", "vox", "piano", "ep", "organ", "felt", "mallet", "brass", "strings"], label: "Stabs & keys" };
    if (/riser|zap|scratch|vinyl|tapestop|swish|noiseHit|glitch|chain|rain|rumble|squeak/.test(v)) return { cats: ["fx"], subs: null, label: "FX" };
    return { cats: ["perc"], subs: null, label: "Percussion" };
  }
  function swFilter() {
    var m = LIB.manifest(); if (!m || !swT) return [];
    var sug = swSuggest(swT), mel = swT.kind !== "drum", q = (swF.q || "").trim().toLowerCase();
    var out = m.items.filter(function (it) {
      if (mel && !swMelOk(it)) return false;
      if (swF.cat === "sug") { if (sug.cats.indexOf(it.c) === -1 || (sug.subs && sug.subs.indexOf(it.s) === -1)) return false; }
      else if (swF.cat !== "all" && it.c !== swF.cat) return false;
      for (var i = 0; i < swF.tags.length; i++) if ((it.t || []).indexOf(swF.tags[i]) === -1) return false;
      if (q && (it.n + " " + it.s + " " + (it.t || []).join(" ")).toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
    var by = swF.sort === "az" ? function (a, b) { return a.n.localeCompare(b.n); } :
      function (a, b) { return (swF.sort === "hl" ? b.h - a.h : a.h - b.h) || a.n.localeCompare(b.n); };
    return out.sort(by);
  }
  function swBuild() {
    var sh = document.createElement("section");
    sh.className = "sw-sheet"; sh.id = "sw-sheet"; sh.hidden = true;
    sh.setAttribute("aria-label", "Swap sound");
    sh.innerHTML =
      '<div class="sw-head"><div class="sw-title"><span class="label">Swap sound</span> <strong id="sw-layer"></strong></div><button type="button" class="btn small ghost sw-x" id="sw-close" aria-label="Close swap">✕</button></div>' +
      '<div class="sw-vol">' + svCtl() + matchCtl() + '</div>' +
      '<div class="sw-now"><span class="sw-cur-l">Now: <strong id="sw-cur"></strong></span>' +
      '<span class="sw-nav"><button type="button" class="btn small" id="sw-prev" aria-label="Previous sound">◀</button><button type="button" class="btn small" id="sw-next" aria-label="Next sound">▶</button>' +
      '<button type="button" class="btn small ghost" id="sw-undo" title="Undo">↶</button><button type="button" class="btn small ghost" id="sw-redo" title="Redo">↷</button>' +
      '<button type="button" class="btn small ghost" id="sw-kit">Back to kit sound</button></span></div>' +
      '<div class="sw-filters"><input type="search" id="sw-q" placeholder="Search sounds" autocomplete="off"><select id="sw-sort" aria-label="Sort"><option value="lh">Light → heavy</option><option value="hl">Heavy → light</option><option value="az">A–Z</option></select></div>' +
      '<div class="sw-chips" id="sw-cats"></div><div class="sw-chips" id="sw-tags"></div>' +
      '<div class="sw-list" id="sw-list" role="list"></div>' +
      '<div class="sw-foot"><span id="sw-store">…</span><button type="button" class="btn small ghost" id="sw-all" title="Save every library sound on this device so the whole library works offline (about 15 MB)">⬇ Download all sounds</button><button type="button" class="btn small ghost" id="sw-clear">Clear unused</button></div>';
    document.body.appendChild(sh);
    swEls = { sh: sh, list: sh.querySelector("#sw-list") };
    svUI(); matchUI();
    sh.querySelector("#sw-close").addEventListener("click", swClose);
    sh.querySelector("#sw-prev").addEventListener("click", function () { swStep(-1); });
    sh.querySelector("#sw-next").addEventListener("click", function () { swStep(1); });
    sh.querySelector("#sw-undo").addEventListener("click", function () { var e = lyHist.undo(); if (e) toast("Undo " + e.label); lyHistUI(); swNow(); });
    sh.querySelector("#sw-redo").addEventListener("click", function () { var e = lyHist.redo(); if (e) toast("Redo " + e.label); lyHistUI(); swNow(); });
    sh.querySelector("#sw-kit").addEventListener("click", function () { if (swT) swApply(swT, null); });
    sh.querySelector("#sw-q").addEventListener("input", function (e) { swF.q = e.target.value; swRender(); });
    sh.querySelector("#sw-sort").addEventListener("change", function (e) { swF.sort = e.target.value; swRender(); });
    sh.querySelector("#sw-all").addEventListener("click", function () { libDownloadAll(this); });
    sh.querySelector("#sw-clear").addEventListener("click", function () {
      LIB.clearUnused(libIds()).then(function (n) { toast(n ? "Cleared " + n + " unused files" : "Nothing to clear"); swStore(); });
    });
    swEls.list.addEventListener("click", function (e) {
      var row = e.target.closest(".sw-row"); if (!row) return;
      var id = row.dataset.id;
      if (e.target.closest(".sw-use")) swApply(swT, id); else swPreview(id);
    });
  }
  /* "Sample volume" slider + Match toggles (Swap sheet, Keys loops sheet; the Mixer has a "Samples" fader) */
  function svCtl() { return '<label class="sv-ctl" title="Volume of sound / loop previews (this device)"><span>Sample volume</span><input type="range" class="js-samplevol" min="0" max="100" step="1" aria-label="Sample preview volume"><output class="mono js-samplevol-val"></output></label>'; }
  function matchCtl() { return '<span class="mt-ctl"><button type="button" class="btn small js-match" data-k="sync" aria-pressed="true" title="Loops follow the song BPM (pitch kept) and previews start on the beat grid">Match to beat</button><button type="button" class="btn small js-match" data-k="key" aria-pressed="false" title="Transpose library loops to the song key">Match key</button></span>'; }
  function swChips() {
    var mel = swT.kind !== "drum", sug = swSuggest(swT), m = LIB.manifest();
    var cats = [["sug", "★ " + sug.label]].concat(m.cats.filter(function (c) { return !mel || ["keys", "synth", "orch", "bass", "808"].indexOf(c[0]) !== -1; })).concat([["all", "All"]]);
    var ce = $("sw-cats"); ce.innerHTML = "";
    cats.forEach(function (c) {
      var b = document.createElement("button"); b.type = "button"; b.className = "btn small sw-chip" + (swF.cat === c[0] ? " on" : ""); b.textContent = c[1]; b.dataset.cat = c[0];
      b.addEventListener("click", function () { swF.cat = c[0]; swChips(); swRender(); });
      ce.appendChild(b);
    });
    var te = $("sw-tags"); te.innerHTML = "";
    SW_TAGS.forEach(function (t) {
      var on = swF.tags.indexOf(t) !== -1, b = document.createElement("button"); b.type = "button"; b.className = "btn small sw-tag" + (on ? " on" : ""); b.textContent = t;
      b.addEventListener("click", function () { if (on) swF.tags.splice(swF.tags.indexOf(t), 1); else swF.tags.push(t); swChips(); swRender(); });
      te.appendChild(b);
    });
  }
  function fmtKB(b) { return b >= 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1024)) + " KB"; }
  function swRender() {
    if (!swEls || !swT) return;
    swList = swFilter();
    var cur = lyCfg(swT).src, html = "";
    swList.forEach(function (it) {
      var dots = ""; for (var i = 1; i <= 5; i++) dots += i <= it.h ? "●" : "○";
      var meta = (it.t || []).slice(0, 2).join(" · ") + (it.k === "multi" ? " · multisampled" : it.k === "preset" ? " · synth preset" : it.k === "loop" ? " · " + it.bpm + " BPM" + (it.key ? " " + it.key : "") : "");
      html += '<div class="sw-row' + (it.id === cur ? " using" : "") + (it.id === swSel ? " sel" : "") + (it.id === swBusyId ? " busy" : "") + '" role="listitem" data-id="' + it.id + '">' +
        '<button type="button" class="sw-play" aria-label="Preview ' + it.n.replace(/"/g, "") + '"><span class="sw-n">▶ ' + it.n.replace(/</g, "&lt;") + '</span><span class="sw-m">' + meta +
        ' <span class="sw-h" title="heaviness">' + dots + '</span> ' + (it.b ? fmtKB(it.b) + (swCached[it.id] ? " ✓" : "") : "built in") + '</span></button>' +
        '<button type="button" class="btn small sw-use">' + (it.id === cur ? "In use" : "Use") + '</button></div>';
    });
    swEls.list.innerHTML = html || '<p class="sw-empty">No sounds match — clear the search or pick "All".</p>';
    swNow();
  }
  function swNow() {
    if (!swEls || !swT) return;
    var li = libItem(lyCfg(swT)), c = lyHist.can();
    $("sw-layer").textContent = lyName(swT);
    $("sw-cur").textContent = li ? li.n : (swT.kind === "drum" ? "Kit sound" : swT.kind === "chord" ? "Chord loop synth" : "Pattern's own instrument");
    $("sw-undo").disabled = !c.undo; $("sw-redo").disabled = !c.redo; $("sw-kit").disabled = !li;
    var cur = lyCfg(swT).src;
    swEls.list.querySelectorAll(".sw-row").forEach(function (r) {
      var on = r.dataset.id === cur; r.classList.toggle("using", on); r.classList.toggle("sel", r.dataset.id === swSel); r.classList.toggle("busy", r.dataset.id === swBusyId);
      var u = r.querySelector(".sw-use"); if (u) u.textContent = on ? "In use" : "Use";
    });
  }
  function libDownloadAll(btn) {
    btn.disabled = true;
    LIB.downloadAll(function (d, t, b) { btn.textContent = "⬇ " + d + " / " + t + " · " + fmtKB(b); }).then(function (r) {
      btn.disabled = false; btn.textContent = r.failed ? "⬇ Finish download (" + r.failed + " left)" : "✓ All sounds offline";
      toast(r.failed ? r.failed + " sounds couldn't download (connection?). Tap again to finish." : "All " + r.total + " library sounds are saved on this device — they work offline.");
      swStore();
    }, function (e) { btn.disabled = false; btn.textContent = "⬇ Download all sounds"; toast("Download failed: " + (e && e.message || e)); });
  }
  function swStore() {
    LIB.storage().then(function (st) {
      swCached = st.ids;
      if ($("sw-store")) $("sw-store").textContent = "Saved on this device: " + st.count + " sound" + (st.count === 1 ? "" : "s") + " · " + fmtKB(st.bytes);
    }, function () { if ($("sw-store")) $("sw-store").textContent = "Offline — library list not available"; });
  }
  function swOpen(T) {
    if (!swEls) swBuild();
    if (T.kind === "drum") T.kit = T.kit || S.kit;
    swT = T; swSel = null; swF = { cat: "sug", tags: [], q: "", sort: "lh" };
    $("sw-q").value = ""; $("sw-sort").value = "lh";
    swEls.sh.hidden = false; document.body.classList.add("sw-open");
    swEls.list.innerHTML = '<p class="sw-empty">Loading the library…</p>';
    LIB.init().then(function () { if (swT !== T) return; swChips(); swRender(); swStore(); swEls.list.scrollTop = 0; },
      function () { swEls.list.innerHTML = '<p class="sw-empty">Can\'t load the library right now (offline?). Your layers keep their sounds.</p>'; });
  }
  function swClose() {
    swT = null; if (swEls) swEls.sh.hidden = true; document.body.classList.remove("sw-open");
    if (swPrevVoice && ctx) { swPrevVoice.stop(ctx.currentTime); swPrevVoice = null; }
  }
  function swApply(T, id) {
    var c = lyCfg(T), before = c.src || null;
    if (before === (id || null)) return Promise.resolve(true);
    var sgBefore = c.sg || 0;
    function go() {
      c = lyCfg(T); c.src = id || null; c.sg = id ? swMatchDb(T, LIB.get(id)) : 0;
      lyPush(T, id ? "swap" : "back to kit sound", { src: before, sg: sgBefore }, { src: c.src, sg: c.sg });
      lyChanged(T); libSync(); swRender();
      var li = LIB.item(id); toast(id ? "Swapped to " + (li ? li.n : id) + " — knobs kept" : "Back to the kit sound");
      return true;
    }
    if (!id) return Promise.resolve(go());
    swBusyId = id; swNow(); ensureCtx();
    return LIB.load(id, ctx).then(function () { swBusyId = null; return go(); }, function () {
      swBusyId = null; swNow(); toast("Couldn't download that sound (offline?) — kept the current one."); return false;
    });
  }
  /* level match on Use: the swapped-in sound plays as loud as the kit sound it replaces (drums), or at the usual
     instrument level (melodic). Stored as the layer's hidden source gain; the layer's Volume knob is untouched. */
  var MEL_REF_LUFS = -17;
  function swMatchDb(T, snd) {
    if (!snd || snd.it.k === "preset") return 0;
    var L = sndLoud(snd); if (L == null || L <= -69) return 0;
    var ref = MEL_REF_LUFS;
    if (T.kind === "drum") { var bs = T.kit === S.kit ? stockBufs[T.pad] : null; ref = bs && bs.length ? bufLoud(bs[0]) : -14; if (ref <= -69) ref = -14; }
    return Math.round(clamp(ref - L, -24, 6) * 10) / 10;
  }
  function swStep(dir) {
    if (!swT || !swList.length) return;
    var cur = lyCfg(swT).src, i = -1;
    for (var k = 0; k < swList.length; k++) if (swList[k].id === (cur || swSel)) { i = k; break; }
    var ni = i === -1 ? (dir > 0 ? 0 : swList.length - 1) : (i + dir + swList.length) % swList.length, id = swList[ni].id;
    swSel = id;
    swApply(swT, id).then(function (ok) {
      if (ok && !playing) swPreview(id);
      var row = swEls.list.querySelector('.sw-row[data-id="' + id + '"]'); if (row && row.scrollIntoView) row.scrollIntoView({ block: "nearest" });
    });
  }
  function swGrid(steps) { if (!playing || !matchCfg().sync) return ctx.currentTime + 0.03; var add = (steps - (curK % steps)) % steps; return Math.max(ctx.currentTime + 0.01, nextTime + add * stepDur()); }
  function swDest(T) {
    if (T.kind === "drum") return stripsFor(LG)[T.pad].inp;
    if (T.kind === "chord") return melStrip(LG, "chord", chordCfg(), LG.groups.keys).inp;
    return melStrip(LG, T.slot + ":" + T.inst, melCfg(S.piano.slots[T.slot], T.inst, true), LG.groups.piano).inp;
  }
  var swTok = 0;
  function swPreview(id) {
    if (!swT || !ensureCtx()) return Promise.resolve(null);
    var T = swT, tok = ++swTok; swSel = id; swBusyId = id; swNow();
    if (swPrevVoice) { swPrevVoice.stop(ctx.currentTime); swPrevVoice = null; } // one preview at a time: quick fade-out
    return LIB.load(id, ctx).then(function (snd) {
      if (tok !== swTok) return null; // a newer tap won
      swBusyId = null; swNow();
      if (swT !== T) return null;
      if (swPrevVoice) { swPrevVoice.stop(ctx.currentTime); swPrevVoice = null; }
      var it = snd.it, cfg = lyCfg(T), dest = pvDest(sndNorm(snd)), when, key = S.songKey != null ? S.songKey : 0, v = null;
      if (!dest) return null;
      if (it.k === "loop") {
        when = swGrid(16);
        var z = snd.zones[0], src = ctx.createBufferSource(), g = ctx.createGain(), len = (it.bars || 2) * 4 * 60 / S.bpm, lpp = loopPlay(it, z.buf);
        src.buffer = lpp.buf; src.playbackRate.value = lpp.rate; g.gain.value = 1; src.connect(g); g.connect(dest);
        src.start(when); src.stop(when + len + 0.05);
        if (window.__ipbTD) window.__ipbTD.trig({ kind: "preview-loop", src: "lib:" + it.id, when: when, rate: lpp.rate, dur: len, ready: lpp.ready, why: lpp.ready ? "" : "time-stretch not ready, speed change" });
        v = { stop: function (t) { try { g.gain.setTargetAtTime(0, Math.max(t, when), 0.02); src.stop(Math.max(t, when) + 0.1); } catch (e) { /* ignore */ } } };
      } else if (T.kind === "drum") {
        var d = kitDef(T.kit).pads[T.pad], base = d.tuned && d.p && d.p.note ? d.p.note : (it.r != null ? it.r : 60);
        when = swGrid(2);
        v = libVoice(ctx, dest, (it.k === "preset" ? 60 : base) + (cfg.tune || 0) + (cfg.fine || 0) / 100, when, it.k === "one" ? 4 : 0.5, 0.85, snd, 1);
        if (it.k === "one") { /* a one-shot plays at its own pitch on a drum row */ }
      } else {
        var lo = it.c === "bass" || it.c === "808" || (it.p && /808|reese|bass/.test(it.p.i)) ? 36 : 60, m = lo + key + (cfg.tune || 0) + (cfg.fine || 0) / 100;
        when = swGrid(4);
        var a = libVoice(ctx, dest, m, when, 0.7, 0.8, snd, 0.9), b = lo === 60 ? libVoice(ctx, dest, m + 7, when + 0.01, 0.7, 0.7, snd, 0.7) : null;
        v = { stop: function (t) { a.stop(t); if (b) b.stop(t); } };
      }
      swPrevVoice = v; swPrevInfo = { id: id, when: when, at: ctx.currentTime, playing: playing };
      return swPrevInfo;
    }, function () { swBusyId = null; swNow(); toast("Couldn't download that sound (offline?)."); return null; });
  }
  function flashPad(i) {
    var el = padEls[i];
    if (!el) return;
    el.classList.add("hit");
    setTimeout(function () { el.classList.remove("hit"); }, 90);
  }
  function selectPad(i) {
    S.sel = i;
    refreshPads();
    seqRows.forEach(function (r, k) { r.classList.toggle("sel", k === i); });
    buildLane();
    saveSession();
  }
  function toggleMS(kind, p) {
    var arr = kind === "m" ? S.mute : S.solo;
    arr[p] = !arr[p];
    refreshMS();
    saveSession();
  }
  function refreshMS() {
    var anySolo = S.solo.some(Boolean);
    seqRows.forEach(function (row, p) {
      row.classList.toggle("muted", !audible(p));
      row.querySelector(".ms-m").classList.toggle("on", !!S.mute[p]);
      row.querySelector(".ms-s").classList.toggle("on", !!S.solo[p]);
    });
    $("seq").classList.toggle("has-solo", anySolo);
    refreshPads();
  }
  function paged() { var w = $("seq-wrap"); return !!w && w.clientWidth < 520; }
  function seqLayout() {
    var L = plen(), pg = paged() && L === 32, el = $("seq");
    if (!pg) S.page = 0;
    el.classList.toggle("len32", L === 32);
    el.classList.toggle("paged", pg);
    el.classList.toggle("p1", pg && S.page === 1);
    el.style.setProperty("--cols", L === 32 && !pg ? 32 : 16);
    var lane = $("lane-bars");
    if (lane) {
      lane.className = "lane-bars" + (L === 32 ? " len32" : "") + (pg ? " paged" : "") + (pg && S.page === 1 ? " p1" : "") +
        (S.lane === "pitch" ? " pitch" : "") + (lane.classList.contains("can-slide") ? " can-slide" : "");
      lane.style.setProperty("--cols", L === 32 && !pg ? 32 : 16);
    }
    document.querySelectorAll("#len-seg button").forEach(function (b) { b.classList.toggle("on", +b.dataset.len === L); });
    var ps = $("page-seg");
    ps.hidden = !pg;
    ps.querySelectorAll("button").forEach(function (b) { b.classList.toggle("on", +b.dataset.page === S.page); });
    document.querySelectorAll("#slots button[data-slot]").forEach(function (b) {
      var id = b.dataset.slot;
      b.classList.toggle("on", id === S.slot);
      b.classList.toggle("queued", id === pendingSlot);
      b.classList.toggle("empty", !slotHasNotes(S.slots[id]));
    });
    document.querySelectorAll("#tool-seg button").forEach(function (b) { b.classList.toggle("on", b.dataset.tool === S.tool); });
  }
  function paintCell(p, s) {
    var b = seqCells[p] && seqCells[p][s];
    if (!b) return;
    var v = S.pattern[p][s], vel = S.vel[p][s];
    b.className = "step " + (s < 16 ? "b1" : "b2") + (s % 4 === 0 ? " beat" : "") + (v ? " on" : "") +
      (v && vel >= 0.95 ? " acc" : "") + (v && vel < 0.6 ? " ghost" : "") + (v > 1 ? " r" + v : "") +
      (v && S.slide[p][s] ? " sl" : "") + (v && S.note[p][s] ? " nt" : "") + (s === uiStep ? " now" : "");
    b.style.setProperty("--v", v ? vel.toFixed(2) : 0);
    b.title = v ? (vel >= 0.95 ? "Accent" : vel < 0.6 ? "Ghost" : "Hit") + (v > 1 ? (v === 2 ? " · roll ×2 (32nds)" : " · roll ×3 (triplet)") : "") +
      (S.note[p][s] ? " · " + (S.note[p][s] > 0 ? "+" : "") + S.note[p][s] + " st" : "") + (S.slide[p][s] ? " · slide" : "") : "";
  }
  function stepTap(p, s) {
    var tv = TOOL_VEL[S.tool];
    if (!S.pattern[p][s]) { S.pattern[p][s] = 1; S.vel[p][s] = tv; }
    else if (Math.abs(S.vel[p][s] - tv) > 0.04) S.vel[p][s] = tv;
    else { S.pattern[p][s] = 0; S.vel[p][s] = 0.8; S.note[p][s] = 0; S.slide[p][s] = 0; }
    paintCell(p, s);
    if (S.pattern[p][s] && !playing) triggerPad(p, 0, S.vel[p][s]);
    if (p === S.sel) buildLane();
    seqLayout();
    saveSession();
  }
  function buildSeq() {
    var wrap = $("seq");
    wrap.innerHTML = "";
    seqRows = []; seqCells = [];
    for (var p = 0; p < 16; p++) {
      (function (p) {
        var row = document.createElement("div");
        row.className = "seq-row g-" + padDef(p).g + (p === S.sel ? " sel" : "");
        var head = document.createElement("div");
        head.className = "rhead";
        var nm = document.createElement("button");
        nm.type = "button";
        nm.className = "rname";
        nm.textContent = padLabel(p);
        nm.title = padLabel(p);
        nm.title = padLabel(p) + " — tap for this layer's knobs";
        nm.addEventListener("click", function () { if (longPressed(nm)) return; selectPad(p); triggerPad(p); lyOpen({ kind: "drum", pad: p }); });
        onLongPress(nm, function () { selectPad(p); lyOpen({ kind: "drum", pad: p }); swOpen({ kind: "drum", pad: p }); });
        var m = document.createElement("button");
        m.type = "button"; m.className = "ms ms-m"; m.textContent = "M"; m.title = "Mute row";
        m.addEventListener("click", function () { toggleMS("m", p); });
        var so = document.createElement("button");
        so.type = "button"; so.className = "ms ms-s"; so.textContent = "S"; so.title = "Solo row";
        so.addEventListener("click", function () { toggleMS("s", p); });
        head.appendChild(nm); head.appendChild(m); head.appendChild(so);
        row.appendChild(head);
        var cells = [];
        for (var s = 0; s < MAXLEN; s++) {
          (function (s) {
            var b = document.createElement("button");
            b.type = "button";
            b.setAttribute("aria-label", "Pad " + (p + 1) + " step " + (s + 1));
            // tap = add (with the Accent / Hit / Ghost tool) → re-tap with another tool changes velocity → same tool removes
            // right-click or long-press = cycle roll (1 → 2 → 3 hits)
            var lpTimer = null, skipClick = false;
            function cycleRoll() {
              var v = S.pattern[p][s];
              if (!v) S.vel[p][s] = TOOL_VEL[S.tool];
              S.pattern[p][s] = v >= 3 ? 1 : v + 1;
              paintCell(p, s); saveSession();
              if (!playing) triggerPad(p, 0, S.vel[p][s]);
            }
            b.addEventListener("click", function () {
              if (skipClick) { skipClick = false; return; }
              stepTap(p, s);
            });
            b.addEventListener("contextmenu", function (e) { e.preventDefault(); if (!skipClick) cycleRoll(); });
            b.addEventListener("pointerdown", function (e) {
              if (e.pointerType !== "touch") return;
              lpTimer = setTimeout(function () { skipClick = true; cycleRoll(); }, 450);
            });
            ["pointerup", "pointerleave", "pointercancel"].forEach(function (ev) {
              b.addEventListener(ev, function () { clearTimeout(lpTimer); });
            });
            row.appendChild(b);
            cells.push(b);
          })(s);
        }
        wrap.appendChild(row);
        seqRows.push(row);
        seqCells.push(cells);
      })(p);
    }
    for (var q = 0; q < 16; q++) for (var s2 = 0; s2 < MAXLEN; s2++) paintCell(q, s2);
    refreshMS();
    seqLayout();
    buildLane();
  }
  function repaintSeq() {
    for (var q = 0; q < 16; q++) {
      for (var s = 0; s < MAXLEN; s++) paintCell(q, s);
      if (seqRows[q]) { var rn = seqRows[q].querySelector(".rname"); rn.textContent = rn.title = padLabel(q); }
    }
    refreshMS(); seqLayout(); buildLane();
  }
  function setNowColumn(s) {
    if (uiStep >= 0) seqCells.forEach(function (r) { if (r[uiStep]) r[uiStep].classList.remove("now"); });
    uiStep = s;
    if (s >= 0) seqCells.forEach(function (r) { if (r[s]) r[s].classList.add("now"); });
    if (s >= 0 && playing && paged() && plen() === 32 && (s >= 16 ? 1 : 0) !== S.page && S.follow !== false) {
      S.page = s >= 16 ? 1 : 0; seqLayout();
    }
  }
  /* velocity / pitch lane for the selected row */
  function buildLane() {
    var bars = $("lane-bars");
    if (!bars) return;
    var p = S.sel, def = padDef(p), pitchMode = S.lane === "pitch";
    $("lane-title").textContent = (p + 1) + " · " + padLabel(p);
    document.querySelectorAll("#lane-seg button").forEach(function (b) { b.classList.toggle("on", b.dataset.lane === S.lane); });
    $("lane-hint").textContent = pitchMode ? (def.tuned || def.ck === "b8" ? "Drag up/down = note (semitones) · tap ↗ = slide into the note" : "Drag = pitch per hit (semitones)") : "Drag up/down = velocity per hit";
    if (!laneBars.length) {
      for (var s = 0; s < MAXLEN; s++) {
        var b = document.createElement("div");
        b.className = "lb " + (s < 16 ? "b1" : "b2");
        b.innerHTML = '<span class="lf"></span><span class="lv"></span><button type="button" class="lsl" aria-label="Slide step ' + (s + 1) + '">↗</button>';
        bars.appendChild(b);
        laneBars.push(b);
        (function (s, b) {
          b.querySelector(".lsl").addEventListener("click", function (e) {
            e.stopPropagation();
            if (!S.pattern[S.sel][s]) return;
            S.slide[S.sel][s] = S.slide[S.sel][s] ? 0 : 1;
            paintCell(S.sel, s); buildLane(); saveSession();
          });
        })(s, b);
      }
      var drag = null;
      function at(e) {
        var cells = laneBars.filter(function (x) { return x.offsetParent !== null; });
        for (var k = 0; k < cells.length; k++) {
          var r = cells[k].getBoundingClientRect();
          if (e.clientX >= r.left - 1 && e.clientX <= r.right + 1) return { s: laneBars.indexOf(cells[k]), y: clamp((r.bottom - e.clientY) / r.height, 0, 1) };
        }
        return null;
      }
      function apply(e) {
        var h = at(e);
        if (!h || !S.pattern[S.sel][h.s]) return;
        if (S.lane === "pitch") S.note[S.sel][h.s] = clamp(Math.round((h.y - 0.5) * 24), -12, 12);
        else S.vel[S.sel][h.s] = clamp(Math.round((0.1 + h.y * 0.9) * 20) / 20, 0.1, 1);
        drag.s = h.s;
        paintCell(S.sel, h.s); paintLane(h.s);
      }
      bars.addEventListener("pointerdown", function (e) {
        if (e.target.classList.contains("lsl")) return;
        drag = { s: -1 };
        try { bars.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
        apply(e);
        e.preventDefault();
      });
      bars.addEventListener("pointermove", function (e) { if (drag) apply(e); });
      ["pointerup", "pointercancel"].forEach(function (ev) {
        bars.addEventListener(ev, function () {
          if (!drag) return;
          var s = drag.s; drag = null;
          if (s >= 0 && !playing) triggerPad(S.sel, 0, S.vel[S.sel][s]);
          saveSession();
        });
      });
    }
    bars.classList.toggle("pitch", pitchMode);
    bars.classList.toggle("can-slide", pitchMode && (def.tuned || !!def.glide));
    for (var s3 = 0; s3 < MAXLEN; s3++) paintLane(s3);
    seqLayout();
  }
  function paintLane(s) {
    var b = laneBars[s];
    if (!b) return;
    var p = S.sel, on = !!S.pattern[p][s], f = b.firstChild, lv = b.children[1];
    b.classList.toggle("on", on);
    b.classList.toggle("sl", on && !!S.slide[p][s]);
    b.classList.toggle("beat", s % 4 === 0);
    if (S.lane === "pitch") {
      var n = S.note[p][s] || 0;
      f.style.bottom = (n >= 0 ? 50 : 50 + (n / 24) * 100) + "%";
      f.style.height = on ? Math.max(2, (Math.abs(n) / 24) * 100) + "%" : "0";
      lv.textContent = on && n ? (n > 0 ? "+" : "") + n : "";
    } else {
      f.style.bottom = "0";
      f.style.height = on ? Math.round(S.vel[p][s] * 100) + "%" : "0";
      lv.textContent = "";
    }
  }
  var CAT_COLOR = { hhlib: "#fb923c", boombap: "#f5b301", trap: "#f43f5e", afro: "#34d399", club: "#22d3ee", rnb: "#a78bfa", rock: "#ef4444" };
  function refreshKitUI() {
    var k = kitDef(S.kit), cat = (D.CATS.filter(function (c) { return c.id === k.cat; })[0] || {}).name || "";
    $("kit-cat").textContent = cat;
    $("kit-name").textContent = k.name;
    $("kit-meta").textContent = k.genre + " · " + k.bpm + " BPM · swing " + k.swing + "%";
    document.documentElement.style.setProperty("--kit", CAT_COLOR[k.cat] || "#f5b301");
    document.querySelectorAll(".kit-card").forEach(function (b) { b.classList.toggle("active", b.dataset.kit === S.kit); });
    $("swing").value = S.swing;
    $("swing-val").textContent = mpcSwing(S.swing) + "%";
    grooveUI(k);
  }
  /* kits with groove presets (Rock, Hardcore Rock) get a "Groove…" picker next to Load starter */
  function grooveUI(k) {
    var sel = $("groove-pick"); if (!sel) return;
    var pr = k.presets || [];
    sel.hidden = !pr.length;
    if (sel.dataset.kit === k.id) return;
    sel.dataset.kit = k.id;
    sel.innerHTML = '<option value="">Groove…</option>' + pr.map(function (p, i) { return '<option value="' + i + '">' + escapeHtml(p.name) + (p.bpm ? " · " + p.bpm : "") + "</option>"; }).join("");
  }
  /* the beat maker leans hip-hop: hip-hop kits and genres are listed first (every kit is still there) */
  var HIPHOP_KITS = ["trap26", "drill26", "dusty", "westcoast", "lofilib", "jerseylib", "qb", "buffalo", "lofi", "trap", "bkdrill", "ukdrill", "sexydrill", "pluggnb", "rage", "phonk", "rnb", "jersey"];
  var CAT_ORDER = ["all", "hhlib", "boombap", "trap", "rnb", "afro", "club", "rock"];
  function hipHopKits() {
    function r(k) { var i = HIPHOP_KITS.indexOf(k.id); return i === -1 ? 100 + D.KITS.indexOf(k) : i; }
    return D.KITS.slice().sort(function (a, b) { return r(a) - r(b); });
  }
  function hipHopCats() {
    function r(c) { var i = CAT_ORDER.indexOf(c.id); return i === -1 ? 50 + D.CATS.indexOf(c) : i; }
    return D.CATS.slice().sort(function (a, b) { return r(a) - r(b); });
  }
  function buildKitBrowser() {
    var cats = $("kb-cats"), grid = $("kb-grid");
    cats.innerHTML = ""; grid.innerHTML = "";
    hipHopCats().forEach(function (c, ci) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "kb-cat" + (ci === 0 ? " on" : ""); b.dataset.cat = c.id; b.textContent = c.name;
      b.addEventListener("click", function () {
        cats.querySelectorAll("button").forEach(function (x) { x.classList.toggle("on", x === b); });
        grid.querySelectorAll(".kit-card").forEach(function (k) { k.hidden = c.id !== "all" && k.dataset.cat !== c.id; });
      });
      cats.appendChild(b);
    });
    hipHopKits().forEach(function (k) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "kit kit-card"; b.dataset.kit = k.id; b.dataset.cat = k.cat;
      b.innerHTML = '<span class="kc-name"></span><span class="kc-meta"></span><span class="kc-desc"></span>';
      b.style.setProperty("--kc", CAT_COLOR[k.cat] || "#f5b301");
      if (k.lead) b.classList.add("lead");
      if (k.lib) b.classList.add("libkit");
      b.querySelector(".kc-name").textContent = k.name;
      b.querySelector(".kc-meta").textContent = k.genre + " · " + k.bpm + " · " + k.swing + "%";
      b.querySelector(".kc-desc").textContent = k.desc;
      b.addEventListener("click", function () { pickKit(k.id); });
      grid.appendChild(b);
    });
  }
  function openKitBrowser(open) {
    var kb = $("kit-browser");
    kb.hidden = open == null ? !kb.hidden : !open;
    $("kit-open").setAttribute("aria-expanded", String(!kb.hidden));
  }
  function pickKit(id) {
    openKitBrowser(false);
    if (id === S.kit) return;
    var empty = !SLOT_IDS.some(function (x) { return slotHasNotes(S.slots[x]); });
    S.kitSwing[S.kit] = S.swing;
    if (empty) { loadStarter(id); $("bpm").value = S.bpm; }
    loadKit(id, empty).then(function () { toast(kitName(id) + (empty ? " — starter pattern loaded" : " loaded")); });
  }

  /* kit sounds: CC0 one-shots (fetched once) + synthesis, pre-rendered per kit with the kit's grit baked in */
  var sampleCache = {}, kitCache = {}, kitSeq = 0, failToastAt = 0;
  function fetchBytes(url) { // one retry that skips the browser cache (flaky mobile data, a stale cached error)
    function get(opt) { return fetch(url, opt).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.arrayBuffer(); }); }
    return get(undefined).catch(function () { return new Promise(function (r) { setTimeout(r, 400); }).then(function () { return get({ cache: "reload" }); }); });
  }
  function fetchSample(name) {
    if (!sampleCache[name]) {
      var isLib = /\.(mp3|ogg|wav|flac)$/i.test(name); // library files carry their extension ("lib/kick/x.mp3")
      var url = "samples/" + (isLib ? name : name + ".flac");
      sampleCache[name] = fetchBytes(url).then(decode).then(function (b) { return isLib ? trimLead(b) : b; }, function (e) {
        // the stock kit sounds are FLAC; browsers that can't decode FLAC get the MP3 copy (samples/mp3/<name>.mp3)
        var alt = !isLib ? "samples/mp3/" + name + ".mp3" : /\.(ogg|flac|wav)$/i.test(name) ? "samples/" + name.replace(/\.(ogg|flac|wav)$/i, ".mp3") : null;
        if (!alt) throw e;
        console.warn("Sample " + name + " failed (" + (e && e.message || e) + ") — trying " + alt);
        return fetchBytes(alt).then(decode).then(trimLead);
      }).catch(function (e) {
        console.warn("Sample " + name + " unavailable — pad falls back to synthesis", e);
        delete sampleCache[name];
        return null;
      });
    }
    return sampleCache[name];
  }
  function kitBuffers(id) {
    if (!kitCache[id]) {
      var k = kitDef(id), names = D.samplesFor(k);
      var p = Promise.all(names.map(fetchSample)).then(function (bufs) {
        var map = {}, missing = [];
        names.forEach(function (n, i) { if (bufs[i]) map[n] = bufs[i]; else missing.push(n); });
        if (missing.length) {
          // don't keep a kit with holes: it is rebuilt (and the sounds retried) the next time it is loaded
          if (kitCache[id] === p) delete kitCache[id];
          if (Date.now() - failToastAt > 8000) { failToastAt = Date.now(); toast(missing.length + " sound" + (missing.length > 1 ? "s" : "") + " couldn't load (connection?) — using backup sounds. Reload the kit to retry."); }
        }
        return D.renderKit(k, map);
      });
      kitCache[id] = p;
      p.catch(function () { if (kitCache[id] === p) delete kitCache[id]; });
    }
    return kitCache[id];
  }
  function loadKit(id, keepSwing) {
    id = kitId(id);
    if (S.kit !== id && !keepSwing) S.kitSwing[S.kit] = S.swing;
    S.kit = id;
    if (!keepSwing) S.swing = S.kitSwing[id] != null ? S.kitSwing[id] : swingFromMpc(kitDef(id).swing);
    S.kitSwing[id] = S.swing;
    var my = ++kitSeq;
    customBuf = new Array(16).fill(null);
    customName = new Array(16).fill(null);
    refreshKitUI();
    var bufs;
    return kitBuffers(id).then(function (b) {
      bufs = b;
      return loadCustomPads(id);
    }).then(function (mine) {
      if (my !== kitSeq) return;
      stockBufs = bufs;
      (mine || []).forEach(function (r) { customBuf[r.i] = r.buf; customName[r.i] = r.name; });
      if (LG) graphKit(LG, ctx.currentTime);
      refreshPads();
      buildSeq();
      saveSession();
      flushHits(); // taps made while the kit was loading
    }).catch(function (e) {
      console.error(e);
      toast("Could not render kit: " + e.message);
    });
  }

  /* ---------------- Sample swap ---------------- */
  var OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext, decodeCtx = null;
  function decodeContext() {
    if (decodeCtx) return decodeCtx;
    try { decodeCtx = new OAC(1, 1, SR); } catch (e) { decodeCtx = null; }
    return decodeCtx || ensureCtx();
  }
  function decode(ab) {
    return new Promise(function (res, rej) {
      var c = decodeContext(), done = false;
      if (!c) { rej(new Error("Web Audio unavailable")); return; }
      function ok(b) { if (!done) { done = true; res(b); } }
      function bad(err) { if (!done) { done = true; rej(err || new Error("Could not decode audio")); } }
      try { var pr = c.decodeAudioData(ab, ok, bad); if (pr && pr.then) pr.then(ok, bad); } catch (e) { bad(e); }
    });
  }
  function makeBuffer(ch, n, sr) { // new AudioBuffer() is missing on older Safari
    try { return new AudioBuffer({ length: n, numberOfChannels: ch, sampleRate: sr }); } catch (e) { return decodeContext().createBuffer(ch, n, sr); }
  }
  /* MP3 decoders may add up to ~50 ms of encoder-delay silence: cut it so library hits land on the grid (max 60 ms, keeps 0.3 ms) */
  function trimLead(b) {
    var d = b.getChannelData(0), pk = 0, i;
    for (i = 0; i < d.length; i++) if (Math.abs(d[i]) > pk) pk = Math.abs(d[i]);
    var lim = Math.min(d.length, Math.round(b.sampleRate * 0.06)), th = pk * 0.003, at = 0;
    for (i = 0; i < lim; i++) if (Math.abs(d[i]) > th) break;
    at = Math.max(0, i - Math.round(b.sampleRate * 0.0003));
    if (at < 8 || i >= lim) return b;
    var n = b.length - at, out = makeBuffer(b.numberOfChannels, n, b.sampleRate);
    for (var ch = 0; ch < b.numberOfChannels; ch++) out.getChannelData(ch).set(b.getChannelData(ch).subarray(at));
    return out;
  }
  function padKey(kit, i) { return "k2:" + kit + ":" + i; }
  function migratePads() { return Promise.resolve(); } // swapped pads no longer exist (see loadCustomPads)
  /* user / library samples on pads were removed (Oct 2026): every pad plays its kit's own sound. Old swapped-pad rows
     in IndexedDB are cleared once so nothing stale is ever loaded. */
  function loadCustomPads() {
    try {
      if (localStorage.getItem("ipb_pads_cleared_v1") !== "1") {
        idb("pads", "readwrite", function (st) { return st.clear(); }).then(function () { try { localStorage.setItem("ipb_pads_cleared_v1", "1"); } catch (e) { /* ignore */ } }).catch(function () {});
      }
    } catch (e) { /* ignore */ }
    return Promise.resolve([]);
  }
  function resetPad(i) {
    customBuf[i] = null; customName[i] = null;
    var all = S.padCfg[S.kit];
    if (all) all[i] = defaultPadCfg(padDef(i));
    if (LG) stripApply(LG, i, ctx.currentTime);
    idb("pads", "readwrite", function (st) { return st.delete(padKey(S.kit, i)); }).catch(function () {});
    refreshPads(); repaintSeq(); saveSession();
  }
  function freshBeat() {
    stop();
    S.chordTrack.on = false;
    renderChordLoopUI();
    SLOT_IDS.forEach(function (id) { S.slots[id] = newSlot(16); });
    S.slot = "A"; pendingSlot = null; bindSlot();
    S.page = 0;
    S.mute = new Array(16).fill(false);
    S.solo = new Array(16).fill(false);
    var kit = S.kit;
    S.padCfg[kit] = [];
    if (LG) graphKit(LG, ctx.currentTime);
    for (var i = 0; i < 16; i++) { customBuf[i] = null; customName[i] = null; }
    idb("pads", "readwrite", function (st) {
      for (var i = 0; i < 16; i++) st.delete(padKey(kit, i));
      return null;
    }).catch(function () {});
    refreshPads(); buildSeq(); saveSession();
    toast("Fresh beat — empty pattern, stock " + kitName(kit) + " pads.");
  }
  function switchSlot(id) {
    if (id === S.slot && !pendingSlot) return;
    if (playing && !arrangement()) { // loop mode: switch on the next pattern start, like an MPC
      pendingSlot = id === S.slot ? null : id;
      seqLayout();
      return;
    }
    applySlot(id, patAnchor);
    S.page = 0;
    repaintSeq(); saveSession();
  }
  function setLen(L) {
    var s = curSlot();
    if (s.len === L) return;
    if (L === 32) { // empty bar 2 → start it as a copy of bar 1
      var b2 = s.pattern.some(function (r) { return r.slice(16).some(Boolean); });
      if (!b2) ["pattern", "vel", "note", "slide"].forEach(function (k) {
        s[k].forEach(function (r) { for (var i = 0; i < 16; i++) r[i + 16] = r[i]; });
      });
    }
    s.len = L;
    S.page = 0;
    repaintSeq(); saveSession();
  }

  /* ---------------- Recording (WAV) ----------------
   * One ScriptProcessor captures 3 sample-aligned channels:
   *   0/1 = master bus L/R (the beat, exactly what ● Record always captured)
   *   2   = raw mic (only used by Record Vocals; silent otherwise)
   */
  var rec = { on: false, mode: "beat", L: [], R: [], V: [], V2: [], frames: 0, limit: 0, startedPattern: false, t0: 0, tick: null };
  var micSplit = null, vocalPan = null;
  var recSink = null, recNode = null, vocalBus = null, vocalFader = null, vocalAnalyser = null, vocalInAn = null, monitorGain = null;
  function setupRecorder() {
    var stereo = ctx.createGain(); // force stereo so a mono master lands in both L and R
    stereo.channelCount = 2; stereo.channelCountMode = "explicit"; stereo.channelInterpretation = "speakers";
    master.connect(stereo);
    var split = ctx.createChannelSplitter(2);
    stereo.connect(split);
    var mergeN = ctx.createChannelMerger(4);
    split.connect(mergeN, 0, 0);
    split.connect(mergeN, 1, 1);
    vocalBus = ctx.createGain(); // mic → mono
    vocalBus.channelCount = 1; vocalBus.channelCountMode = "explicit"; vocalBus.channelInterpretation = "speakers";
    // the take records BOTH mic channels (2 and 3): some tablets open the built-in mic as stereo with the voice in one
    // side only. finishVocal() keeps the live channel (or sums both), so every take is mono and centred.
    micSplit = ctx.createChannelSplitter(2);
    micSplit.connect(mergeN, 0, 2);
    micSplit.connect(mergeN, 1, 3);
    vocalFader = ctx.createGain();
    vocalAnalyser = ctx.createAnalyser();
    vocalAnalyser.fftSize = 512;
    vocalInAn = ctx.createAnalyser(); // pre-fader mic level for the live input meter next to Record Vocals
    vocalInAn.fftSize = 1024;
    vocalBus.connect(vocalInAn);
    monitorGain = ctx.createGain();
    monitorGain.gain.value = 0;
    vocalBus.connect(vocalFader);
    vocalPan = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain(); // vocal Pan also moves the monitor
    vocalFader.connect(vocalPan);
    vocalPan.connect(vocalAnalyser);
    vocalAnalyser.connect(monitorGain);
    monitorGain.connect(ctx.destination); // monitor bypasses master so it is never double-recorded
    recNode = ctx.createScriptProcessor(4096, 4, 1);
    mergeN.connect(recNode);
    var z = ctx.createGain();
    z.gain.value = 0;
    recNode.connect(z);
    z.connect(ctx.destination); recSink = z;
    applyMixer();
    recNode.onaudioprocess = function (e) {
      if (!rec.on) return;
      var ib = e.inputBuffer;
      if (!rec.frames) { rec.pt0 = e.playbackTime; rec.ct0 = ctx.currentTime; } // timing of the first captured block (take ↔ live beat alignment)
      var l = ib.getChannelData(0);
      var r = ib.numberOfChannels > 1 ? ib.getChannelData(1) : l;
      rec.L.push(new Float32Array(l));
      rec.R.push(new Float32Array(r));
      if (rec.mode === "vocal") {
        rec.V.push(ib.numberOfChannels > 2 ? new Float32Array(ib.getChannelData(2)) : new Float32Array(l.length));
        rec.V2.push(ib.numberOfChannels > 3 ? new Float32Array(ib.getChannelData(3)) : new Float32Array(l.length));
      }
      rec.frames += l.length;
      if (rec.limit && rec.frames >= rec.limit) {
        rec.on = false;
        setTimeout(rec.mode === "vocal" ? finishVocal : finishRec, 0);
      }
    };
  }
  function recLengthSecs() {
    var v = $("rec-length").value;
    if (v === "song") {
      if (btActive()) return Math.max(1, bt.buf.duration - Math.min(bt.buf.duration, S.cueBar * barSec())) + 1.5;
      var A = arrangement();
      if (!A) return 0; // no structure → free length
      return Math.max(1, totalBars(A) - S.cueBar) * barSec() + 2;
    }
    return +v;
  }
  function startRec() {
    unpark();
    if (!ensureCtx() || rec.on || vox.state !== "idle") return;
    var secs = recLengthSecs();
    rec.mode = "beat";
    rec.L = []; rec.R = []; rec.V = []; rec.V2 = []; rec.frames = 0;
    rec.limit = secs ? Math.round(secs * ctx.sampleRate) : Math.round(600 * ctx.sampleRate);
    rec.on = true;
    rec.t0 = Date.now();
    rec.startedPattern = false;
    if ($("rec-autoplay").checked && !playing) { play(); rec.startedPattern = true; }
    $("btn-rec").classList.add("on");
    $("btn-rec-stop").disabled = false;
    $("btn-rec").disabled = true;
    setVoxButtons();
    var st = $("rec-status");
    st.classList.add("on");
    rec.tick = setInterval(function () {
      var el = (Date.now() - rec.t0) / 1000;
      st.textContent = "REC " + fmtTime(el) + (secs ? " / " + fmtTime(secs) : " (free)");
    }, 200);
  }
  function stopRec() {
    if (vox.state !== "idle") { stopVocalTake(); return; }
    if (!rec.on) return;
    rec.on = false;
    finishRec();
  }
  function merge(chunks, frames) {
    var out = new Float32Array(frames), o = 0;
    for (var i = 0; i < chunks.length && o < frames; i++) {
      var c = chunks[i];
      var n = Math.min(c.length, frames - o);
      out.set(n === c.length ? c : c.subarray(0, n), o);
      o += n;
    }
    return out;
  }
  function finishRec() {
    clearInterval(rec.tick);
    if (rec.startedPattern) stop();
    $("btn-rec").classList.remove("on");
    $("btn-rec").disabled = false;
    $("btn-rec-stop").disabled = true;
    setVoxButtons();
    var st = $("rec-status");
    st.classList.remove("on");
    var frames = Math.min(rec.frames, rec.limit || rec.frames);
    if (frames < 100) { st.textContent = "Nothing recorded"; return; }
    var L = merge(rec.L, frames), R = merge(rec.R, frames);
    rec.L = []; rec.R = [];
    var blob = encodeWav(L, R, frames, ctx.sampleRate);
    var dur = frames / ctx.sampleRate;
    saveToVault(blob, dur, "Take");
    st.textContent = "Saved " + fmtTime(dur) + " to Vault";
  }
  function peakScale(L, R, frames) {
    var p = 0;
    for (var i = 0; i < frames; i++) {
      var a = Math.abs(L[i]), b = Math.abs(R[i]);
      if (a > p) p = a;
      if (b > p) p = b;
    }
    return p > 0.98 ? 0.95 / p : 1;
  }
  function encodeWav(L, R, frames, sr) {
    var sc = peakScale(L, R, frames);
    var buf = new ArrayBuffer(44 + frames * 4);
    var v = new DataView(buf);
    function ws(o, s) { for (var i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); }
    ws(0, "RIFF"); v.setUint32(4, 36 + frames * 4, true); ws(8, "WAVE");
    ws(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true);
    ws(36, "data"); v.setUint32(40, frames * 4, true);
    var o = 44;
    for (var i = 0; i < frames; i++) {
      var l = clamp(L[i] * sc, -1, 1), r = clamp(R[i] * sc, -1, 1);
      v.setInt16(o, l < 0 ? l * 0x8000 : l * 0x7fff, true); o += 2;
      v.setInt16(o, r < 0 ? r * 0x8000 : r * 0x7fff, true); o += 2;
    }
    return new Blob([buf], { type: "audio/wav" });
  }
  function fmtTime(s) {
    s = Math.max(0, s);
    var m = Math.floor(s / 60), r = Math.floor(s % 60);
    return m + ":" + (r < 10 ? "0" : "") + r;
  }

  /* Offline bounce of the pattern + chord loop (clean render, no live keys).
     With a song structure selected, "Full song" renders the whole arrangement. */
  function loopInfo(k) { var L = plen(); return { k: k, patStep: k % L, fire: true, feel: "full", mb: k / STEPS, m16: k }; }
  /* Offline bounce of the pattern + chord loop (clean render, no live keys) through the same graph as live playback.
     With a song structure selected, "Full song" renders the whole arrangement. */
  /* instruments used by any piano slot (all synthesized now; PK.load/ready are kept as no-op hooks) */
  function pianoInsts() {
    var out = [];
    SLOT_IDS.forEach(function (id) { var p = S.piano.slots[id]; if (p) PD.instsOf(p).forEach(function (i) { if (out.indexOf(i) === -1) out.push(i); }); });
    return out;
  }
  function pianoSamplesLoad() { return PK.load ? PK.load(pianoInsts()) : Promise.resolve(true); }
  function bounce(barsSel, then, fail, libTried) {
    var need = libIds().filter(function (id) { return !LIB.get(id); });
    if (need.length && !libTried) {
      $("rec-status").textContent = "Loading library sounds…";
      LIB.want(need, ctx).then(function () { bounce(barsSel, then, fail, true); });
      return;
    }
    if (PK.ready && !PK.ready(pianoInsts())) {
      $("rec-status").textContent = "Loading instrument samples…";
      pianoSamplesLoad().then(function () { bounceNow(barsSel, then, fail); });
      return;
    }
    bounceNow(barsSel, then, fail);
  }
  /* offline render of the beat (Bounce, WAV / MP3 export, Send to Studio, level checks): same graph + layer chains as live */
  /* Offline bounce, scheduled just-in-time: the step voices are created a few seconds ahead of the render position
     (OfflineAudioContext.suspend), never all at once. A whole song used to create every voice up front, so thousands
     of waiting nodes were processed every block (2:18 song: ~70 s on a fast PC, minutes on a tablet). */
  var OFF_WIN = 2; // seconds per scheduling window
  function renderOffline(barsSel, onProg) {
    var sd = stepDur();
    var A = arrangement();
    var songMode = barsSel === "song";
    if (songMode && !A) return { err: "Pick a song structure first (Song bar above)." };
    var bars = songMode ? totalBars(A) : +barsSel;
    var total = bars * STEPS;
    if (!btActive() && !S.chordTrack.on && !patternHasNotes() && !PD.hasNotes(pianoPat())) return { err: "Pattern is empty — add steps first." };
    var dur = total * sd + 2.5 + GRAPH_LAT;
    var c = new OfflineAudioContext(2, Math.ceil(SR * dur), SR);
    var G = makeGraph(c, false);
    G.out.connect(c.destination);
    var reg = [], creg = [];
    if (btActive()) { var bsrc = c.createBufferSource(); bsrc.buffer = bt.buf; bsrc.connect(G.groups.inst); bsrc.start(0); }
    var k = 0, done = false;
    function schedUntil(tEnd) {
      for (; k < total && k * sd < tEnd; k++) {
        // loop bounces ignore the structure so "4 bars" really means the 4-bar loop
        var info = songMode ? stepInfo(k) : loopInfo(k);
        if (info.end) { k = total; break; }
        if (info.fire) secStep(c, G, info, k * sd, reg, creg, k === 0);
      }
      if (k >= total && !done) { done = true; cutChords(creg, total * sd); }
    }
    schedUntil(OFF_WIN + 0.5);
    var canSuspend = typeof c.suspend === "function";
    if (!canSuspend) schedUntil(Infinity);
    else for (var ts = OFF_WIN; ts < dur - 0.05 && ts < total * sd; ts += OFF_WIN) (function (t) {
      c.suspend(t).then(function () { schedUntil(t + OFF_WIN + 0.5); if (onProg) try { onProg(t / dur); } catch (e) { /* ui */ } c.resume(); });
    })(ts);
    return { songMode: songMode, bars: bars, total: total, sd: sd, promise: c.startRendering().then(function (b) { if (onProg) try { onProg(1); } catch (e) { /* ui */ } return b; }) };
  }
  function bounceNow(barsSel, then, fail) {
    var say = function (m) { toast(m); if (fail) fail(new Error(m)); };
    var r = renderOffline(barsSel);
    if (r.err) { say(r.err); return; }
    var songMode = r.songMode, bars = r.bars, total = r.total, sd = r.sd;
    $("rec-status").textContent = songMode ? "Bouncing full song… (can take up to a minute)" : "Bouncing…";
    r.promise.then(function (buf) {
      var off = Math.round(GRAPH_LAT * SR); // compressor look-ahead → bar 1 starts at 0:00
      var frames = Math.min(Math.round((total * sd + 0.8) * SR), buf.length - off);
      var blob = encodeWav(buf.getChannelData(0).subarray(off), buf.getChannelData(1).subarray(off), frames, SR);
      var label = songMode ? "Bounce full song" : "Bounce " + bars + " bars";
      saveToVault(blob, frames / SR, label, then, fail);
      $("rec-status").textContent = (songMode ? "Bounced full song" : "Bounced " + bars + " bars") + " to Vault";
    }).catch(function (e) { say("Bounce failed: " + e.message); });
  }

  /* ---------------- Vault ---------------- */
  function saveToVault(blob, dur, label, then, fail) {
    var item = {
      id: "r_" + Date.now().toString(36),
      name: btActive() && label.indexOf(bt.title) !== -1
        ? label + (bt.layer ? " + " + kitName(S.kit) : "") + " · " + S.bpm + "bpm"
        : label + " · " + (btActive() ? bt.title + (bt.layer ? " + " + kitName(S.kit) : "") : kitName(S.kit)) + " " + S.bpm + "bpm",
      created: Date.now(),
      duration: dur,
      size: blob.size,
      blob: blob
    };
    idb("vault", "readwrite", function (st) { return st.put(item); })
      .then(function () { if (then) then(item.id); }, function () { memVault.push(item); toast(then ? "Storage is blocked, so the Studio can't receive the bounce. Download it from the Vault and import it in the Studio." : "Saved for this session only — download to keep."); if (fail) fail(new Error("storage blocked")); })
      .then(renderVault);
  }
  var vaultUrls = [], vaultTok = 0;
  function renderVault() {
    var list = $("vault-list");
    var tok = ++vaultTok; // two saves in a row: only the newest render builds the list
    idb("vault", "readonly", function (st) { return st.getAll(); })
      .catch(function () { return []; })
      .then(function (rows) {
        if (tok !== vaultTok) return;
        var items = (rows || []).concat(memVault).sort(function (a, b) { return b.created - a.created; });
        vaultUrls.forEach(function (u) { URL.revokeObjectURL(u); });
        vaultUrls = [];
        if (!items.length) {
          list.innerHTML = '<div class="empty">No recordings yet. Hit ● Record on the Beats tab, or Bounce a loop.</div>';
          return;
        }
        list.innerHTML = "";
        items.forEach(function (it) {
          if (!(it.blob instanceof Blob)) return; // damaged / half-saved entry: skip instead of breaking the list
          var url = URL.createObjectURL(it.blob);
          vaultUrls.push(url);
          var el = document.createElement("div");
          el.className = "vitem";
          el.innerHTML =
            '<div class="vitem-top"><strong></strong><span></span></div>' +
            '<audio controls preload="none"></audio>' +
            '<div class="vitem-actions">' +
              '<a class="btn small" download>Download WAV</a>' +
              '<button type="button" class="btn small ghost" data-act="player" title="Add to the Psycho Fingers Player library">→ Player</button>' +
              '<button type="button" class="btn small ghost" data-act="dj" title="Add to the DJ booth library">→ DJ Booth</button>' +
              '<button type="button" class="btn small ghost" data-act="rename">Rename</button>' +
              '<button type="button" class="btn small ghost" data-act="del">Delete</button>' +
            "</div>";
          el.querySelector("strong").textContent = it.name;
          el.querySelector(".vitem-top span").textContent =
            new Date(it.created).toLocaleString() + " · " + fmtTime(it.duration) + " · " + (it.size / 1048576).toFixed(1) + " MB";
          el.querySelector("audio").src = url;
          var a = el.querySelector("a");
          a.href = url;
          a.download = it.name.replace(/[^\w\- ]+/g, "").replace(/\s+/g, "_") + ".wav";
          ["player", "dj"].forEach(function (d) {
            el.querySelector('[data-act="' + d + '"]').addEventListener("click", function () { sendOut(d, it.blob, it.duration, it.name.replace(/\s*\d+bpm$/, "").trim()); });
          });
          el.querySelector('[data-act="rename"]').addEventListener("click", function () {
            var n = prompt("Rename recording", it.name);
            if (!n) return;
            it.name = n.slice(0, 80);
            idb("vault", "readwrite", function (st) { return st.put(it); }).catch(function () {}).then(renderVault);
          });
          el.querySelector('[data-act="del"]').addEventListener("click", function () {
            if (!confirm("Delete this recording?")) return;
            memVault = memVault.filter(function (m) { return m.id !== it.id; });
            idb("vault", "readwrite", function (st) { return st.delete(it.id); }).catch(function () {}).then(renderVault);
          });
          list.appendChild(el);
        });
      });
  }

  /* ---------------- Keys ---------------- */
  var CHORDS = [
    { n: "C", r: 0, q: "maj", h: "I · C maj" }, { n: "Dm", r: 2, q: "min", h: "ii" }, { n: "Em", r: 4, q: "min", h: "iii" },
    { n: "F", r: 5, q: "maj", h: "IV" }, { n: "G", r: 7, q: "maj", h: "V" }, { n: "Am", r: 9, q: "min", h: "vi" },
    { n: "Cm", r: 0, q: "min", h: "i · C min" }, { n: "Eb", r: 3, q: "maj", h: "III" }, { n: "Fm", r: 5, q: "min", h: "iv" },
    { n: "Gm", r: 7, q: "min", h: "v" }, { n: "Ab", r: 8, q: "maj", h: "VI" }, { n: "Bb", r: 10, q: "maj", h: "VII" },
    { n: "Cm9", r: 0, q: "min9", h: "lo-fi" }, { n: "Fm7", r: 5, q: "min7", h: "trap" },
    { n: "Abmaj7", r: 8, q: "maj7", h: "soul" }, { n: "G7", r: 7, q: "dom7", h: "tension" }
  ];
  var QUAL = { maj: [0, 4, 7], min: [0, 3, 7], min7: [0, 3, 7, 10], maj7: [0, 4, 7, 11], dom7: [0, 4, 7, 10], min9: [0, 3, 7, 10, 14] };
  var keyVoices = {};

  function noteOn(midi, id) {
    if (!ensureCtx()) return;
    if (keyVoices[id]) noteOff(id);
    var t = ctx.currentTime, f = mf(midi), type = $("key-sound").value;
    var out = ctx.createGain();
    out.gain.value = 0.0001;
    out.connect(groupNodes.keys.gain);
    var oscs = [], rel = 0.4;
    function osc(kind, freq, gain, det, dest) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = kind; o.frequency.value = freq; if (det) o.detune.value = det;
      g.gain.value = gain;
      o.connect(g); g.connect(dest || out); o.start(t); oscs.push(o);
      return o;
    }
    if (type === "pad") {
      var lp = ctx.createBiquadFilter();
      lp.type = "lowpass"; lp.frequency.value = 1300; lp.Q.value = 0.7; lp.connect(out);
      osc("sawtooth", f, 0.5, -9, lp); osc("sawtooth", f, 0.5, 9, lp); osc("sine", f / 2, 0.4, 0, lp);
      out.gain.exponentialRampToValueAtTime(0.16, t + 0.08);
      rel = 0.8;
    } else if (type === "keys") {
      osc("sine", f, 0.8); osc("sine", f * 2, 0.15); osc("triangle", f, 0.2);
      out.gain.exponentialRampToValueAtTime(0.28, t + 0.006);
      out.gain.exponentialRampToValueAtTime(0.1, t + 0.9);
      rel = 0.35;
    } else if (type === "pluck") {
      var lp2 = ctx.createBiquadFilter();
      lp2.type = "lowpass"; lp2.Q.value = 3;
      lp2.frequency.setValueAtTime(4200, t);
      lp2.frequency.exponentialRampToValueAtTime(380, t + 0.35);
      lp2.connect(out);
      osc("sawtooth", f, 0.6, 0, lp2); osc("square", f, 0.2, 5, lp2);
      out.gain.exponentialRampToValueAtTime(0.24, t + 0.003);
      out.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
      rel = 0.2;
    } else {
      osc("sine", f, 0.8); osc("sine", f * 2.76, 0.3); osc("sine", f * 5.4, 0.1);
      out.gain.exponentialRampToValueAtTime(0.24, t + 0.002);
      out.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
      rel = 0.6;
    }
    keyVoices[id] = { out: out, oscs: oscs, rel: rel };
  }
  function noteOff(id) {
    var v = keyVoices[id];
    if (!v || !ctx) return;
    delete keyVoices[id];
    var t = ctx.currentTime;
    try {
      v.out.gain.cancelScheduledValues(t);
      v.out.gain.setValueAtTime(Math.max(v.out.gain.value, 0.0001), t);
      v.out.gain.setTargetAtTime(0.0001, t, v.rel / 4);
      v.oscs.forEach(function (o) { o.stop(t + v.rel + 0.2); });
    } catch (e) { /* ignore */ }
  }
  function octBase() { return 12 * (+$("key-oct").value + 1); }

  function buildChords() {
    var wrap = $("chords");
    wrap.innerHTML = "";
    CHORDS.forEach(function (ch, ci) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "chord";
      b.innerHTML = ch.n + "<small>" + ch.h + "</small>";
      var ids = [];
      function down(e) {
        e.preventDefault();
        var base = octBase() - 12 + ch.r;
        ids = QUAL[ch.q].map(function (iv, k) {
          var id = "c" + ci + "_" + k;
          noteOn(base + iv, id);
          return id;
        });
        b.classList.add("hit");
      }
      function up() {
        ids.forEach(noteOff); ids = [];
        b.classList.remove("hit");
      }
      b.addEventListener("pointerdown", down);
      b.addEventListener("pointerup", up);
      b.addEventListener("pointerleave", up);
      b.addEventListener("pointercancel", up);
      wrap.appendChild(b);
    });
  }

  var pianoKeyEls = {};
  function modeIntervals() {
    var m = $("key-mode").value;
    return m === "note" ? [0] : m === "maj" ? [0, 4, 7] : m === "min" ? [0, 3, 7] : [0, 3, 7, 10];
  }
  function pianoDown(s) {
    var base = octBase() + s;
    modeIntervals().forEach(function (iv, k) { noteOn(base + iv, "p" + s + "_" + k); });
    if (pianoKeyEls[s]) pianoKeyEls[s].classList.add("hit");
  }
  function pianoUp(s) {
    for (var k = 0; k < 4; k++) noteOff("p" + s + "_" + k);
    if (pianoKeyEls[s]) pianoKeyEls[s].classList.remove("hit");
  }
  function buildPiano() {
    var wrap = $("piano");
    wrap.innerHTML = "";
    var names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    var black = [1, 3, 6, 8, 10];
    var whiteCount = 15, wIdx = 0, kw = 100 / whiteCount;
    var pointerNote = {};
    for (var s = 0; s <= 24; s++) {
      (function (s) {
        var isB = black.indexOf(s % 12) !== -1;
        var el = document.createElement("div");
        if (isB) {
          el.className = "bkey";
          el.style.left = (wIdx * kw - kw * 0.3) + "%";
          el.style.width = (kw * 0.6) + "%";
        } else {
          el.className = "wkey";
          el.textContent = s % 12 === 0 ? "C" + (Math.floor(s / 12) + +$("key-oct").value) : "";
          wIdx++;
        }
        el.dataset.s = s;
        el.title = names[s % 12];
        el.addEventListener("pointerdown", function (e) {
          e.preventDefault();
          pointerNote[e.pointerId] = s;
          pianoDown(s);
        });
        wrap.appendChild(el);
        pianoKeyEls[s] = el;
      })(s);
    }
    function release(e) {
      if (pointerNote[e.pointerId] != null) {
        pianoUp(pointerNote[e.pointerId]);
        delete pointerNote[e.pointerId];
      }
    }
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
  }

  /* ---------------- Mixer UI ---------------- */
  var meterEls = {};
  function buildMixer() {
    var wrap = $("mixer");
    wrap.innerHTML = "";
    GROUPS.concat([{ id: "vocal", name: "Vocal" }, { id: "master", name: "Master" }]).forEach(function (g) {
      var st = document.createElement("div");
      st.className = "strip" + (g.id === "master" ? " master" : "") + (g.id === "vocal" ? " vocal" : "");
      st.innerHTML =
        '<span class="sname"></span>' +
        '<span class="io">IN · ' + g.name + '</span>' +
        '<div class="inserts" role="group" aria-label="Insert slots">' + ["A","B","C","D","E"].map(function (L) { return '<button type="button" class="ins" data-ins="' + L + '" title="Insert ' + L + ' — open effects for this channel">INS ' + L + '</button>'; }).join("") + '</div>' +
        '<div class="faders"><div class="meter"><i></i></div>' +
        '<div class="vwrap"><input type="range" min="0" max="100" aria-label="Volume"></div></div>' +
        '<span class="val"></span>' +
        '<span class="io">OUT · ' + (g.id === "master" ? "Main" : "Master") + '</span>' +
        '<div class="msr"><button type="button" class="mute">MUTE</button></div>';
      st.querySelector(".sname").textContent = g.name;
      var r = st.querySelector("input"), val = st.querySelector(".val"), mute = st.querySelector(".mute");
      r.value = Math.round(S.mixer[g.id].v * 100);
      val.textContent = r.value + "%";
      mute.classList.toggle("on", S.mixer[g.id].m);
      r.addEventListener("input", function () {
        S.mixer[g.id].v = r.value / 100;
        val.textContent = r.value + "%";
        applyMixer(); saveSession();
        if (g.id === "inst") btUI();
      });
      mute.addEventListener("click", function () {
        S.mixer[g.id].m = !S.mixer[g.id].m;
        mute.classList.toggle("on", S.mixer[g.id].m);
        applyMixer(); saveSession();
        if (g.id === "inst") btUI();
      });
      st.querySelectorAll(".ins").forEach(function (b) {
        b.addEventListener("click", function () {
          st.querySelectorAll(".ins").forEach(function (x) { x.classList.remove("on"); }); b.classList.add("on");
          if (g.id === "vocal") { var fx = $("vx-fx"); if (fx) { fx.open = true; fx.scrollIntoView({ block: "start", behavior: "smooth" }); } }
          else if (g.id === "master") { showTab("master"); }
          else { showTab("beats"); var pe = document.querySelector(".pad-edit"); if (pe) setTimeout(function () { pe.scrollIntoView({ block: "center", behavior: "smooth" }); }, 60); }
        });
      });
      if (g.id === "vocal") { // vocal Pan (centre by default) + quick link to the vocal effects
        var pw = document.createElement("label"); pw.className = "pan-wrap";
        pw.innerHTML = '<input type="range" class="pan js-vx-pan" min="-100" max="100" step="5" aria-label="Vocal pan"><span class="val js-vx-panval"></span>';
        st.appendChild(pw);
        var fxb = document.createElement("button"); fxb.type = "button"; fxb.className = "mute fxb"; fxb.textContent = "FX";
        fxb.title = "Vocal effects, Pan, Wide and auto level match";
        fxb.addEventListener("click", function () { var b = $("vx-fx"); if (b) { b.open = true; b.scrollIntoView({ block: "start", behavior: "smooth" }); } });
        st.appendChild(fxb);
      }
      meterEls[g.id] = st.querySelector(".meter i");
      wrap.appendChild(st);
      if (g.id === "vocal") wrap.appendChild(samplesStrip());
    });
    vxPanUI(); svUI();
  }
  /* Mixer "Samples" fader: sound / loop previews (Swap sheet, Keys loops). Per device, not part of the song. */
  function samplesStrip() {
    var st = document.createElement("div"); st.className = "strip samples";
    st.innerHTML = '<span class="sname">Samples</span><div class="faders"><div class="meter"><i></i></div><div class="vwrap"><input type="range" class="js-samplevol" min="0" max="100" aria-label="Samples (previews) volume"></div></div>' +
      '<span class="val js-samplevol-val"></span><button type="button" class="mute js-sv-mute" title="Mute previews">MUTE</button>';
    var mb = st.querySelector(".js-sv-mute"), last = 0;
    mb.classList.toggle("on", sampleVol() === 0);
    mb.addEventListener("click", function () { var v = sampleVol(); if (v > 0) { last = v; setSampleVol(0); } else setSampleVol(last || SV_DEF); mb.classList.toggle("on", sampleVol() === 0); });
    meterEls.samples = st.querySelector(".meter i");
    return st;
  }
  /* ---------------- Vocal channel: Pan, Wide, auto level match, effects (manual, non-destructive) ---------------- */
  var VXFX = [
    { k: "bleed", name: "Remove beat bleed", p: [], tip: "Takes out the beat your mic picked up, using the exact beat that was playing. Runs after the take; the raw take is kept." },
    { k: "nr", name: "Noise reduction", p: [], tip: "Removes steady room noise / hiss (RNNoise, on this device)." },
    { k: "gate", name: "Gate", p: [], tip: "Mutes the gaps between your lines (voice detection)." },
    { k: "lowcut", name: "Low cut", p: [["f", "Freq", 40, 300, 5, "Hz"]] },
    { k: "eq", name: "EQ · 3-band", p: [["low", "Low", -12, 12, 0.5, "dB"], ["mid", "Mid", -12, 12, 0.5, "dB"], ["midF", "Mid freq", 300, 6000, 50, "Hz"], ["high", "High", -12, 12, 0.5, "dB"]] },
    { k: "comp", name: "Compressor", p: [["amt", "Amount", 0, 1, 0.01, "%"]] },
    { k: "deess", name: "De-esser", p: [["amt", "Amount", 0, 1, 0.01, "%"]] },
    { k: "sat", name: "Saturation · warmth", p: [["amt", "Amount", 0, 1, 0.01, "%"]] },
    { k: "chorus", name: "Chorus · doubler", p: [["mix", "Mix", 0, 1, 0.01, "%"]] },
    { k: "delay", name: "Delay (send)", p: [["div", "Time", [["1/4", "1/4"], ["1/8", "1/8"], ["1/8d", "1/8 dotted"]]], ["pp", "Ping-pong", "bool"], ["fb", "Feedback", 0, 0.85, 0.01, "%"], ["mix", "Mix", 0, 1, 0.01, "%"]] },
    { k: "reverb", name: "Reverb (send)", p: [["type", "Type", [["room", "Room"], ["plate", "Plate"], ["hall", "Hall"]]], ["decay", "Decay", 0.3, 5, 0.1, "s"], ["pre", "Pre-delay", 0, 0.12, 0.005, "s"], ["mix", "Mix", 0, 1, 0.01, "%"]] }
  ];
  function vxFmt(v, u) { return u === "%" ? Math.round(v * 100) + "%" : u === "s" ? (v < 0.2 ? Math.round(v * 1000) + " ms" : (+v).toFixed(1) + " s") : u === "Hz" ? (v >= 1000 ? (v / 1000).toFixed(1) + "k" : Math.round(v)) + " Hz" : (v > 0 ? "+" : "") + (+v).toFixed(1) + " dB"; }
  function vxPanUI() {
    var p = Math.round((S.vox.pan || 0) * 100), txt = p === 0 ? "C" : p < 0 ? "L" + (-p) : "R" + p;
    document.querySelectorAll(".js-vx-pan").forEach(function (e) { e.value = p; });
    document.querySelectorAll(".js-vx-panval").forEach(function (e) { e.textContent = txt; });
  }
  function vxChanged() { saveSession(); applyMixer(); vxLive(); var b = $("vx-reexp"); if (b) b.hidden = !vox.last; }
  /* ---------------- Vocal FX, live: ONE persistent chain for the vocal channel, built once and kept connected for the
   * life of the page. Every take playback (▶ Play take with beat, the Clean-take A/B player) feeds it; knobs and
   * switches ramp the existing nodes (no rebuilds, no clicks). Exports render the same settings through the same
   * fx-chain.js code offline. FX A/B = level-matched-ish bypass (dry path, same 6 ms as the compressor look-ahead). */
  var VX = null;
  function vxEnsure() {
    if (VX) return VX;
    if (!ctx || !LG) return null;
    var c = ctx;
    function gn(v) { var g = c.createGain(); g.gain.value = v == null ? 1 : v; return g; }
    VX = { inp: gn(1), X: FXC.build(c), dry: c.createDelay(0.05), dryG: gn(0), wetG: gn(1), wsum: gn(1), wd: c.createDelay(0.05), wl: gn(0), wr: gn(0),
      wpl: c.createStereoPanner(), wpr: c.createStereoPanner(), pan: c.createStereoPanner(), busG: gn(1), sum: gn(1), lvl: gn(0), toMaster: gn(0), toSpk: gn(0), an: c.createAnalyser() };
    VX.dry.delayTime.value = 0.006; VX.wd.delayTime.value = 0.012; VX.wpl.pan.value = -1; VX.wpr.pan.value = 1; VX.an.fftSize = 2048;
    VX.wetOn = false; // the insert chain is hooked up only while an effect (or Wide) is on — see vxLive
    VX.X.out.connect(VX.wsum); VX.X.out.connect(VX.wd); VX.wd.connect(VX.wl); VX.wd.connect(VX.wr); VX.wl.connect(VX.wpl); VX.wr.connect(VX.wpr); VX.wpl.connect(VX.wsum); VX.wpr.connect(VX.wsum);
    VX.wsum.connect(VX.wetG); VX.wetG.connect(VX.pan);
    VX.inp.connect(VX.dry); VX.dry.connect(VX.dryG); VX.dryG.connect(VX.pan);
    VX.pan.connect(VX.sum);
    VX.buses = FXC.Buses(c, VX.busG); VX.busG.connect(VX.sum);
    VX.sum.connect(VX.lvl); VX.lvl.connect(VX.an); VX.lvl.connect(VX.toMaster); VX.lvl.connect(VX.toSpk);
    VX.toMaster.connect(LG.fader); // with the beat: through the master fader + limiter (never into the mic recorder)
    VX.toSpk.connect(c.destination); // the Clean-take A/B player: straight to the speakers
    vxLive();
    return VX;
  }
  function vxLive() {
    if (!VX || !ctx) return;
    var t = ctx.currentTime, keep = {}, fxs = S.vox.fx || FXC.defaults();
    var off = !!S.vox.fxOff || !(FXC.anyOn(fxs) || S.vox.wide); // nothing on = the same as the dry path, so the chain can sleep
    if (!off && !VX.wetOn) { VX.inp.connect(VX.X.input); VX.wetOn = true; clearTimeout(VX.unhookT); VX.unhookT = null; }
    if (off && VX.wetOn && !VX.unhookT) VX.unhookT = setTimeout(function () { VX.unhookT = null; if (VX && VX.wetOn && (S.vox.fxOff || !(FXC.anyOn(S.vox.fx || FXC.defaults()) || S.vox.wide))) { try { VX.inp.disconnect(VX.X.input); } catch (e) { /* not hooked */ } VX.wetOn = false; } }, 8000); // after reverb / delay tails ring out
    FXC.apply(ctx, VX.X, S.vox.fx || FXC.defaults(), S.bpm, VX.buses, true).forEach(function (k) { keep[k] = 1; });
    clearTimeout(VX.gcT); VX.gcT = setTimeout(function () { if (VX) VX.buses.gc(keep); }, 6000); // old reverb / delay settings ring out first
    VX.wl.gain.setTargetAtTime(S.vox.wide ? 0.32 : 0, t, 0.015); VX.wr.gain.setTargetAtTime(S.vox.wide ? -0.32 : 0, t, 0.015);
    if (VX.pan.pan) VX.pan.pan.setTargetAtTime(S.vox.pan || 0, t, 0.015);
    VX.wetG.gain.setTargetAtTime(off ? 0 : 1, t, 0.012); VX.busG.gain.setTargetAtTime(off ? 0 : 1, t, 0.012); VX.dryG.gain.setTargetAtTime(off ? 1 : 0, t, 0.012);
    vxABUI();
  }
  function vxRoute(where, lvl) { // "master" | "spk" | null
    if (!VX) return; var t = ctx.currentTime;
    VX.toMaster.gain.setTargetAtTime(where === "master" ? 1 : 0, t, 0.01); VX.toSpk.gain.setTargetAtTime(where === "spk" ? 1 : 0, t, 0.01);
    if (lvl != null) VX.lvl.gain.setTargetAtTime(lvl, t, 0.03);
  }
  function vxABUI() {
    document.querySelectorAll(".js-vx-ab").forEach(function (b) {
      var off = !!S.vox.fxOff; b.classList.toggle("on", off); b.setAttribute("aria-pressed", String(off));
      b.textContent = off ? "FX: OFF (A/B)" : "FX: ON (A/B)"; b.title = off ? "Hearing the vocal without effects. Tap to hear the effects again." : "Hearing the effects. Tap to compare without them (instant).";
    });
  }
  function vxToggleAB() { S.vox.fxOff = !S.vox.fxOff; vxLive(); saveSession(); }
  /* a playing take source that can be swapped (cleanup / tighten changed mid-play) with a short crossfade */
  function vxSrcStart(P, buf, at, off) {
    var s = ctx.createBufferSource(), g = ctx.createGain(); s.buffer = buf;
    g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(1, at + 0.02);
    s.connect(g); g.connect(vxEnsure().inp); s.start(at, Math.max(0, off || 0));
    P.src = s; P.sg = g; P.buf = buf; P.at0 = at - (off || 0);
    return s;
  }
  function vxSrcStop(P, t) {
    if (!P.src) return;
    var s = P.src, g = P.sg; t = t || ctx.currentTime;
    try { s.onended = null; g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0, t + 0.025); s.stop(t + 0.04); } catch (e) { /* ended */ }
    setTimeout(function () { try { g.disconnect(); } catch (e) { /* gone */ } }, 300);
    P.src = null; P.sg = null;
  }
  /* the take as it sits on the beat: latency shift + manual cleanup (bleed / NR / gate) + Tighten to beat. Cached. */
  function vocalAligned(t, which) {
    var useClean = which === "clean" || (which == null && t.clean);
    var V0 = useClean && t.clean ? t.clean : t.V, sh = takeShift(t), n = t.frames;
    return vocalPre(t, V0).then(function (V) {
      var key = (useClean ? "c" : "r") + preKey() + ":" + sh;
      t.al = t.al || {};
      var vs = t.al[key];
      if (!vs) { vs = new Float32Array(n); for (var i = 0; i < n; i++) { var j = i + sh; vs[i] = j >= 0 && j < n ? V[j] : 0; } t.al = {}; t.al[key] = vs; }
      return vocalTight(t, vs, key);
    });
  }
  function preKey() { var f = FXC.norm(S.vox.fx); return (f.bleed.on ? "B" : "") + (f.nr.on ? "N" : "") + (f.gate.on ? "G" : ""); }
  /* Tighten to beat (off by default): syllable onsets nudged toward the 16th grid (with the song swing), Strength %.
     Segments are moved, never resampled: pitch and formants stay; the raw take is kept. */
  function vocalTight(t, vs, key) {
    var tg = S.vox.tight;
    if (!tg || !tg.on || !(tg.str > 0) || !MATCH) return Promise.resolve(vs);
    var k = key + ":" + tg.str + ":" + S.bpm + ":" + S.swing;
    t.tc = t.tc || {};
    if (t.tc[k]) return Promise.resolve(t.tc[k]);
    return MATCH.tighten(vs, t.sr, { step: stepDur(), swing: stepDur() * S.swing / 100, offset: 0 }, tg.str).then(function (r) {
      t.tc = {}; t.tc[k] = r.out; t.tightInfo = r.info; return r.out;
    }).catch(function () { return vs; });
  }
  /* settings that change the take itself (cleanup / tighten) changed while a take plays → swap in the new version */
  var vxSwapKey = null;
  function vxRefreshPlaying() {
    var P = vpv.src ? vpv : vc.src ? vc : null; if (!P) return;
    var t = vox.last, which = P === vc ? (vc.ab === "clean" ? "clean" : "raw") : null;
    var want = preKey() + (S.vox.tight && S.vox.tight.on ? "T" + S.vox.tight.str : "") + ":" + which;
    if (want === vxSwapKey) return; vxSwapKey = want;
    vocalAligned(t, which).then(function (vs) {
      if (!P.src || vxSwapKey !== want || (P.buf && P.buf._vs === vs)) return;
      var b = ctx.createBuffer(1, vs.length, t.sr); b.getChannelData(0).set(vs); b._vs = vs;
      var now = ctx.currentTime + 0.02, pos = now - P.at0, old = P.src, onend = old.onended;
      vxSrcStop(P, now); var s = vxSrcStart(P, b, now, pos); s.onended = onend;
    });
  }
  function buildVxFx() {
    var box = document.querySelector(".vox-box"); if (!box || $("vx-fx")) return;
    if (!S.vox.fx) S.vox.fx = FXC.defaults();
    var d = document.createElement("details"); d.id = "vx-fx"; d.className = "vx-fx";
    d.innerHTML = '<summary><strong>Vocal level, pan &amp; effects</strong> <small class="sub">manual · heard live on take playback · the raw take is never changed · same settings on exports, Send to Player / DJ / Studio</small></summary>' +
      '<div class="vx-row"><button type="button" class="btn small vx-ab js-vx-ab" aria-pressed="false">FX: ON (A/B)</button>' +
      '<button type="button" class="btn small" id="vx-play2">▶ Play take with beat</button>' +
      '<small class="sub">Effects change live while the take plays. FX A/B switches them off / on instantly so you can compare.</small></div>' +
      '<div class="vx-row vx-tight"><label class="chk vx-big" title="Off by default (raw). Nudges the start of each syllable / phrase toward the beat grid; pitch and voice untouched, raw take kept."><input type="checkbox" id="vx-tight"> Tighten to beat</label>' +
      '<label>Strength <input type="range" id="vx-tight-str" min="0" max="100" step="5" aria-label="Tighten strength"> <output id="vx-tight-val" class="mono"></output></label>' +
      '<small class="sub" id="vx-tight-info">Latency is always lined up automatically.</small></div>' +
      '<div class="vx-row"><label>Vocal presets <select id="vx-preset" aria-label="Vocal presets"></select></label>' +
      '<small class="sub">Nothing is applied until you pick one. Recording itself is always raw.</small></div>' +
      '<div class="vx-row">' +
      '<label class="vx-pan">Pan <input type="range" class="js-vx-pan" min="-100" max="100" step="5" aria-label="Vocal pan"> <span class="mono js-vx-panval">C</span>' +
      '<button type="button" class="btn small ghost" id="vx-center">Center</button></label>' +
      '<label class="chk vx-big" title="Subtle stereo double. Mono-safe: it cancels back to your voice in mono."><input type="checkbox" id="vx-wide"> Wide</label></div>' +
      '<div class="vx-row vx-auto">' +
      '<label class="chk vx-big"><input type="checkbox" id="vx-auto"> Auto match to beat</label>' +
      '<label>Vocal vs beat <input type="range" id="vx-off" min="-6" max="6" step="0.5" aria-label="Vocal level versus beat, dB"> <output id="vx-off-val" class="mono"></output></label>' +
      '<span class="vx-pre" role="group" aria-label="Vocal level presets"><button type="button" class="btn small" data-off="3">Upfront +3</button><button type="button" class="btn small" data-off="0">Balanced 0</button><button type="button" class="btn small" data-off="-3">Tucked −3</button></span>' +
      '<span class="vx-applied">Applied <b id="vx-auto-val" class="mono">—</b></span></div>' +
      '<div class="vx-grid" id="vx-grid"></div>' +
      '<div class="vx-row"><button type="button" class="btn small" id="vx-reexp" hidden>Export last take again with these settings</button>' +
      '<button type="button" class="btn small" id="vx-exp-fx">Export: With FX (beat + vocal)</button><button type="button" class="btn small" id="vx-exp-raw">Export: Raw take (no FX)</button>' +
      '<button type="button" class="btn small ghost" id="vx-alloff">All effects off</button></div>';
    var anchor = box.querySelector(".vox-opts");
    box.insertBefore(d, anchor);
    var grid = d.querySelector("#vx-grid");
    function render() {
      grid.innerHTML = "";
      VXFX.forEach(function (sec) {
        var st = S.vox.fx[sec.k], b = document.createElement("div"); b.className = "vx-blk" + (st.on ? " on" : ""); b.dataset.k = sec.k;
        b.innerHTML = '<div class="vx-h"><span>' + sec.name + '</span><button type="button" class="vx-sw' + (st.on ? " on" : "") + '" aria-pressed="' + st.on + '" aria-label="' + sec.name + ' on/off">' + (st.on ? "ON" : "OFF") + "</button></div>";
        if (sec.tip) { var tp = document.createElement("small"); tp.className = "vx-tip"; tp.textContent = sec.tip; b.appendChild(tp); }
        b.querySelector(".vx-sw").addEventListener("click", function () { st.on = !st.on; render(); vxChanged(); if (sec.k === "bleed" || sec.k === "nr" || sec.k === "gate") vxRefreshPlaying(); });
        sec.p.forEach(function (p) {
          var lab = document.createElement("label"); lab.className = "vx-p";
          if (p[2] === "bool") {
            lab.classList.add("chk"); lab.innerHTML = '<input type="checkbox"> ' + p[1];
            var cb = lab.querySelector("input"); cb.checked = !!st[p[0]];
            cb.addEventListener("change", function () { st[p[0]] = cb.checked; if (!st.on) { st.on = true; render(); } vxChanged(); });
          } else if (Array.isArray(p[2])) {
            lab.innerHTML = "<span>" + p[1] + "</span><select></select>";
            var sel = lab.querySelector("select"); p[2].forEach(function (o) { var op = document.createElement("option"); op.value = o[0]; op.textContent = o[1]; sel.appendChild(op); });
            sel.value = st[p[0]];
            sel.addEventListener("change", function () {
              st[p[0]] = sel.value;
              if (sec.k === "reverb" && FXC.REVERBS[sel.value]) { st.decay = FXC.REVERBS[sel.value].decay; st.pre = FXC.REVERBS[sel.value].pre; } // preset sets decay / pre-delay
              st.on = true; render(); vxChanged();
            });
          } else {
            lab.innerHTML = "<span>" + p[1] + '</span><input type="range"><output class="mono"></output>';
            var rg = lab.querySelector("input"), o = lab.querySelector("output");
            rg.min = p[2]; rg.max = p[3]; rg.step = p[4]; rg.value = st[p[0]]; o.textContent = vxFmt(st[p[0]], p[5]);
            rg.addEventListener("input", function () { st[p[0]] = +rg.value; o.textContent = vxFmt(st[p[0]], p[5]); if (!st.on) { st.on = true; b.classList.add("on"); var w = b.querySelector(".vx-sw"); w.classList.add("on"); w.textContent = "ON"; w.setAttribute("aria-pressed", "true"); } vxLive(); });
            rg.addEventListener("change", vxChanged);
          }
          b.appendChild(lab);
        });
        grid.appendChild(b);
      });
    }
    render();
    document.addEventListener("input", function (e) {
      if (!e.target.classList || !e.target.classList.contains("js-vx-pan")) return;
      S.vox.pan = clamp(+e.target.value / 100, -1, 1); vxPanUI(); applyMixer(); vxLive();
    });
    document.addEventListener("change", function (e) { if (e.target.classList && e.target.classList.contains("js-vx-pan")) vxChanged(); });
    $("vx-center").addEventListener("click", function () { S.vox.pan = 0; vxPanUI(); vxChanged(); });
    var wide = $("vx-wide"); wide.checked = !!S.vox.wide; wide.addEventListener("change", function () { S.vox.wide = wide.checked; vxChanged(); });
    var au = $("vx-auto"), off = $("vx-off"), ov = $("vx-off-val");
    function offUI() { off.value = S.vox.autoOff; ov.textContent = (S.vox.autoOff > 0 ? "+" : "") + (+S.vox.autoOff).toFixed(1) + " dB"; d.querySelectorAll(".vx-pre button").forEach(function (b) { b.classList.toggle("on", +b.dataset.off === +S.vox.autoOff); }); voxPrevApply(); }
    au.checked = !!S.vox.auto;
    au.addEventListener("change", function () { S.vox.auto = au.checked; if (vox.last) vox.last.autoDb = null; offUI(); vxChanged(); });
    off.addEventListener("input", function () { S.vox.autoOff = +off.value; offUI(); });
    off.addEventListener("change", vxChanged);
    d.querySelectorAll(".vx-pre button").forEach(function (b) { b.addEventListener("click", function () { S.vox.autoOff = +b.dataset.off; if (!S.vox.auto) { S.vox.auto = true; au.checked = true; } offUI(); vxChanged(); }); });
    $("vx-reexp").addEventListener("click", function () { exportVocalMix(false); });
    $("vx-exp-fx").addEventListener("click", function () { if (!vox.last) { toast("Record a vocal take first."); return; } exportVocalMix(false); });
    $("vx-exp-raw").addEventListener("click", exportRawTake);
    d.querySelector(".js-vx-ab").addEventListener("click", vxToggleAB);
    $("vx-play2").addEventListener("click", voxPlayTake);
    var tg = $("vx-tight"), ts = $("vx-tight-str"), tv = $("vx-tight-val");
    function tightUI() { tg.checked = !!S.vox.tight.on; ts.value = Math.round(S.vox.tight.str * 100); tv.textContent = Math.round(S.vox.tight.str * 100) + "%"; ts.disabled = !S.vox.tight.on; }
    tg.addEventListener("change", function () { S.vox.tight.on = tg.checked; if (tg.checked && !(S.vox.tight.str > 0)) S.vox.tight.str = 0.5; tightUI(); vxChanged(); vxRefreshPlaying(); });
    ts.addEventListener("input", function () { S.vox.tight.str = +ts.value / 100; tv.textContent = ts.value + "%"; });
    ts.addEventListener("change", function () { vxChanged(); vxRefreshPlaying(); });
    tightUI(); vxABUI();
    $("vx-alloff").addEventListener("click", function () { Object.keys(S.vox.fx).forEach(function (k) { if (S.vox.fx[k]) S.vox.fx[k].on = false; }); render(); vxChanged(); });
    offUI(); vxPanUI();
    var ps = $("vx-preset");
    function fillPresets() {
      var mine = vxMine();
      ps.innerHTML = '<option value="">Vocal presets…</option><optgroup label="Built in">' + Object.keys(VX_PRESETS).map(function (k) { return '<option value="b:' + k + '">' + escapeHtml(VX_PRESETS[k].name) + "</option>"; }).join("") + "</optgroup>" +
        (Object.keys(mine).length ? '<optgroup label="My presets">' + Object.keys(mine).map(function (k) { return '<option value="m:' + escapeHtml(k) + '">' + escapeHtml(k) + "</option>"; }).join("") + "</optgroup>" : "") +
        '<optgroup label="Manage"><option value="save">Save current settings as my preset…</option>' + (Object.keys(mine).length ? '<option value="del">Delete one of my presets…</option>' : "") + "</optgroup>";
    }
    fillPresets();
    ps.addEventListener("change", function () {
      var v = ps.value; ps.value = ""; if (!v) return;
      var mine = vxMine();
      if (v === "save") {
        var nm = (prompt("Name for this vocal preset:", "My vocal") || "").trim().slice(0, 40); if (!nm) return;
        mine[nm] = { fx: JSON.parse(JSON.stringify(S.vox.fx)), pan: S.vox.pan, wide: S.vox.wide }; vxMine(mine); fillPresets(); toast("Saved preset “" + nm + "”"); return;
      }
      if (v === "del") {
        var dn = (prompt("Delete which preset? (" + Object.keys(mine).join(", ") + ")", Object.keys(mine)[0]) || "").trim();
        if (mine[dn]) { delete mine[dn]; vxMine(mine); fillPresets(); toast("Deleted “" + dn + "”"); } return;
      }
      var pr = v.indexOf("b:") === 0 ? VX_PRESETS[v.slice(2)] : mine[v.slice(2)]; if (!pr) return;
      var base = FXC.defaults();
      Object.keys(pr.fx || {}).forEach(function (k) { if (base[k]) Object.assign(base[k], pr.fx[k]); });
      S.vox.fx = FXC.norm(base);
      if (pr.pan != null) S.vox.pan = pr.pan;
      if (pr.wide != null) S.vox.wide = !!pr.wide;
      $("vx-wide").checked = !!S.vox.wide; vxPanUI(); render(); vxChanged();
      toast("Vocal preset: " + (pr.name || v.slice(2)) + (vox.last ? " — tap “Export last take again” to hear it in the mix" : ""));
    });
  }
  /* built-in vocal presets: only applied when picked (everything starts OFF) */
  var VX_PRESETS = {
    rap: { name: "Clean Rap Vocal", pan: 0, wide: false, fx: { lowcut: { on: true, f: 100 }, eq: { on: true, low: -2, mid: 2, midF: 3000, high: 2.5 }, comp: { on: true, amt: 0.55 }, deess: { on: true, amt: 0.5 }, sat: { on: true, amt: 0.2 }, reverb: { on: true, type: "room", decay: 0.8, pre: 0.01, mix: 0.08 } } },
    radio: { name: "Radio / phone voice", pan: 0, wide: false, fx: { lowcut: { on: true, f: 300 }, eq: { on: true, low: -8, mid: 6, midF: 1800, high: -8 }, comp: { on: true, amt: 0.7 }, sat: { on: true, amt: 0.55 } } },
    adlib: { name: "Ad-lib Wide", pan: 0, wide: true, fx: { lowcut: { on: true, f: 150 }, eq: { on: true, low: -4, mid: 0, midF: 2000, high: 3 }, comp: { on: true, amt: 0.5 }, deess: { on: true, amt: 0.4 }, chorus: { on: true, mix: 0.45 }, delay: { on: true, div: "1/8d", pp: true, fb: 0.35, mix: 0.25 }, reverb: { on: true, type: "hall", decay: 2.4, pre: 0.03, mix: 0.2 } } },
    singing: { name: "Smooth Singing", pan: 0, wide: false, fx: { lowcut: { on: true, f: 90 }, eq: { on: true, low: -1, mid: 1, midF: 2500, high: 3 }, comp: { on: true, amt: 0.45 }, deess: { on: true, amt: 0.5 }, delay: { on: true, div: "1/4", pp: false, fb: 0.25, mix: 0.12 }, reverb: { on: true, type: "plate", decay: 1.8, pre: 0.02, mix: 0.18 } } },
    speaker: { name: "Speaker take cleanup (beat bleed + noise)", fx: { bleed: { on: true }, nr: { on: true }, gate: { on: false }, lowcut: { on: true, f: 90 } } }
  };
  function vxMine(set) {
    try {
      if (set) { localStorage.setItem("ipb_vx_presets", JSON.stringify(set)); return set; }
      var o = JSON.parse(localStorage.getItem("ipb_vx_presets") || "{}"); return o && typeof o === "object" ? o : {};
    } catch (e) { return {}; }
  }
  var meterBuf = new Float32Array(512);
  function peak(an) {
    if (meterBuf.length !== an.fftSize) meterBuf = new Float32Array(an.fftSize);
    an.getFloatTimeDomainData(meterBuf);
    var p = 0;
    for (var i = 0; i < meterBuf.length; i++) { var a = Math.abs(meterBuf[i]); if (a > p) p = a; }
    return p;
  }

  /* ---------------- Studio visualizer ---------------- */
  var freqData = null, timeData = null;
  function drawFrame(cv) {
    var g = cv.getContext("2d"), W = cv.width, H = cv.height, portrait = H > W;
    var grd = g.createLinearGradient(0, 0, W, H);
    grd.addColorStop(0, "#0b0d12"); grd.addColorStop(1, "#141a2a");
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    var style = $("studio-style").value;
    var cx = W / 2, cy = portrait ? H * 0.46 : H * 0.55;
    if (masterAnalyser) {
      if (!freqData) { freqData = new Uint8Array(masterAnalyser.frequencyBinCount); timeData = new Uint8Array(masterAnalyser.fftSize); }
      masterAnalyser.getByteFrequencyData(freqData);
      masterAnalyser.getByteTimeDomainData(timeData);
    }
    g.save();
    if (style === "bars") {
      var n = 64, bw = (W * 0.84) / n, x0 = W * 0.08, maxH = portrait ? H * 0.28 : H * 0.42;
      for (var i = 0; i < n; i++) {
        var v = freqData ? freqData[Math.floor(Math.pow(i / n, 1.6) * 400) + 2] / 255 : 0.04;
        var h = Math.max(3, v * maxH);
        var bg = g.createLinearGradient(0, cy - h, 0, cy);
        bg.addColorStop(0, "#a78bfa"); bg.addColorStop(1, "#22d3ee");
        g.fillStyle = bg;
        g.fillRect(x0 + i * bw + 1, cy - h, bw - 2, h);
        g.globalAlpha = 0.18;
        g.fillRect(x0 + i * bw + 1, cy + 4, bw - 2, h * 0.5);
        g.globalAlpha = 1;
      }
    } else if (style === "wave") {
      g.strokeStyle = "#22d3ee"; g.lineWidth = portrait ? 5 : 4; g.shadowColor = "#22d3ee"; g.shadowBlur = 18;
      g.beginPath();
      var len = timeData ? timeData.length : 2;
      for (var j = 0; j < len; j++) {
        var yv = timeData ? (timeData[j] - 128) / 128 : 0;
        var x = (j / (len - 1)) * W, y = cy + yv * (portrait ? H * 0.18 : H * 0.3);
        if (j === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
    } else {
      var R = Math.min(W, H) * 0.2, bars = 96;
      g.translate(cx, cy);
      for (var k = 0; k < bars; k++) {
        var vv = freqData ? freqData[Math.floor((k / bars) * 300) + 2] / 255 : 0.05;
        g.rotate((Math.PI * 2) / bars);
        g.fillStyle = k % 2 ? "#22d3ee" : "#a78bfa";
        g.fillRect(0, R, Math.max(3, W * 0.004), Math.max(4, vv * R * 1.1));
      }
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.beginPath(); g.arc(cx, cy, R * 0.92, 0, Math.PI * 2);
      g.fillStyle = "#0b0d12"; g.fill();
      g.strokeStyle = "#262d3d"; g.lineWidth = 3; g.stroke();
    }
    g.restore();
    var title = $("studio-title").value || "Untitled beat";
    var artist = $("studio-artist").value || "";
    g.textAlign = "center";
    g.fillStyle = "#e6e9f0";
    g.font = "800 " + Math.round(W * (portrait ? 0.07 : 0.045)) + "px Inter, Segoe UI, sans-serif";
    g.fillText(title, cx, portrait ? H * 0.74 : H * 0.18);
    g.fillStyle = "#8a93a8";
    g.font = "600 " + Math.round(W * (portrait ? 0.04 : 0.022)) + "px Inter, Segoe UI, sans-serif";
    g.fillText(artist, cx, portrait ? H * 0.74 + W * 0.07 : H * 0.18 + W * 0.035);
    g.fillStyle = "#22d3ee";
    g.font = "700 " + Math.round(W * (portrait ? 0.03 : 0.016)) + "px Inter, Segoe UI, sans-serif";
    g.fillText(kitName(S.kit).toUpperCase() + " · " + S.bpm + " BPM", cx, portrait ? H * 0.9 : H * 0.92);
  }

  /* ---------------- Animation loop ---------------- */
  var activeTab = "beats";
  function loop() {
    if (ctx && playing) {
      while (uiQueue.length && uiQueue[0].time <= ctx.currentTime) {
        var q = uiQueue.shift();
        posAnchor = { k: q.k, time: q.time };
        if (q.slot) repaintSeq();
        if (q.pslot) pianoUI(true);
        if (q.fire) setNowColumn(q.step);
      }
      if (masterAnalyser) livePeak = Math.max(livePeak, peak(masterAnalyser));
    }
    if (activeTab === "mixer" && ctx) {
      GROUPS.forEach(function (g) {
        meterEls[g.id].style.height = Math.min(100, peak(groupNodes[g.id].an) * 100) + "%";
      });
      meterEls.master.style.height = Math.min(100, peak(masterAnalyser) * 100) + "%";
      if (meterEls.samples) meterEls.samples.style.height = (PV ? Math.min(100, peak(PV.an) * 100) : 0) + "%";
      if (meterEls.vocal && vocalInAn) meterEls.vocal.style.height = (vox.stream ? Math.min(100, peak(vocalInAn) * 100) : 0) + "%"; // real mic input (pre-fader: a muted / pulled-down Vocal fader no longer hides a working mic)
    }
    var posK = currentPosK(), bar = posK / STEPS;
    if (activeTab === "beats" || ly.open) updatePositionUI(posK);
    if (ly.open) {
      ly.prompter.update(bar, playing || prForceScroll);
      prForceScroll = false;
    } else if (activeTab === "lyrics") {
      ly.preview.update(bar, playing);
    }
    if (activeTab === "video") {
      drawFrame($("cv-169"));
      drawFrame($("cv-916"));
    }
    refTick();
    if (activeTab === "beats" && bt.buf) btTick();
    if (activeTab === "piano" && pianoEd) pianoTick();
    if (vc.src || vc.off) vcTick();
    voxMeterTick();
    requestAnimationFrame(loop);
  }

  /* ---------------- Vocal takes (mic over the beat) ---------------- */
  var vox = { state: "idle", stream: null, src: null, inLat: 0, timers: [], last: null, check: false };
  function micErrorMsg(e) {
    if (!window.isSecureContext) return "Mic recording needs a secure page — open the app over HTTPS or on localhost / 127.0.0.1.";
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return "This browser can't record from a microphone.";
    var n = e && e.name;
    if (n === "NotAllowedError" || n === "PermissionDeniedError" || n === "SecurityError")
      return "Microphone is blocked. Allow the microphone: tap the lock icon by the address bar > Permissions > Microphone > Allow, then tap Record Vocals again.";
    if (n === "NotFoundError" || n === "DevicesNotFoundError" || n === "OverconstrainedError") return "No microphone found. Plug in a mic or headset (or check the tablet's mic isn't turned off in Android settings) and try again.";
    if (n === "NotReadableError" || n === "TrackStartError") return "The mic is busy or blocked by the system (another app may be using it).";
    if (n === "AbortError") return "Opening the mic was interrupted. Try again.";
    return "Could not open the mic" + (e && e.message ? ": " + e.message : ".");
  }
  /* live mic level next to every Record Vocals status line (count-in, take, mic check), plus a no-signal warning */
  function voxMeterTick() {
    var live = !!(vox.stream && vocalInAn && (vox.state !== "idle" || vox.check));
    var lvl = live ? peak(vocalInAn) : 0;
    document.querySelectorAll(".js-vox-status").forEach(function (el) {
      var m = el.nextElementSibling;
      if (!m || !m.classList.contains("vox-meter")) {
        if (!live) return;
        m = document.createElement("div"); m.className = "vox-meter"; m.setAttribute("aria-label", "Microphone level");
        m.innerHTML = '<b>MIC</b><span><i></i></span><em></em>'; el.parentNode.insertBefore(m, el.nextSibling);
      }
      m.hidden = !live;
      if (!live) return;
      var db = lvl > 0 ? 20 * Math.log10(lvl) : -99, w = Math.max(0, Math.min(100, (db + 60) / 60 * 100));
      m.querySelector("i").style.width = w + "%";
      m.classList.toggle("hot", lvl > 0.9);
      m.querySelector("em").textContent = lvl < 0.003 ? "no sound yet" : lvl > 0.9 ? "too loud" : "hearing you";
    });
    // Android hands the mic to an active call (or the "Microphone access" toggle is off) → a live stream of pure silence, no error
    if (live) {
      vox.inMax = Math.max(vox.inMax || 0, lvl);
      if (!vox.liveT0) vox.liveT0 = performance.now();
      if (!vox.silentWarned && performance.now() - vox.liveT0 > 1500 && vox.inMax < 0.00005) {
        vox.silentWarned = true; toast(MIC_SILENT, 9000); setVoxStatus(MIC_SILENT, true);
      }
    } else { vox.inMax = 0; vox.liveT0 = 0; vox.silentWarned = false; }
  }
  var MIC_SILENT = "Your mic is sending silence. Close any call or app using the mic (voice calls, WhatsApp, recorders), check Microphone access is ON in quick settings, then try again.";
  /* "No headphones — voice only" (manual, OFF by default, remembered on this device, shared with the Studio):
     ON = the browser's echo-cancel + noise suppression on the mic (auto-gain stays off) and "Remove beat bleed" on the
     take afterwards; the unprocessed take is kept too. OFF = fully raw (nothing applied). */
  var VO_KEY = "ipb_voiceonly";
  function voiceOnly() { try { return localStorage.getItem(VO_KEY) === "1"; } catch (e) { return false; } }
  function setVoiceOnly(v) { try { localStorage.setItem(VO_KEY, v ? "1" : "0"); } catch (e) { /* ignore */ } voUI(); if (typeof applyMixer === "function") applyMixer(); }
  function voUI() {
    var on = voiceOnly();
    document.querySelectorAll(".js-voiceonly").forEach(function (b) { b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on)); b.querySelector(".vo-state").textContent = on ? "ON" : "OFF"; });
  }
  function voButtons() {
    document.querySelectorAll(".js-vox").forEach(function (v) {
      if (v.parentNode.querySelector(".js-voiceonly")) return;
      var b = document.createElement("button"); b.type = "button"; b.className = "btn vo-btn js-voiceonly";
      b.title = "For recording without headphones: your tablet mic records just your voice (browser echo-cancel + noise suppression, then Remove beat bleed). The raw take is kept. Off = fully raw.";
      b.innerHTML = '<span class="vo-l">No headphones — voice only</span> <span class="vo-state">OFF</span><small class="vo-hint">For recording without headphones</small>';
      b.addEventListener("click", function () {
        if (vox.state !== "idle") { toast("Change this between takes."); return; }
        setVoiceOnly(!voiceOnly()); if (vox.stream) closeMic();
        toast(voiceOnly() ? "Voice only ON: tablet mic, beat rejected, raw take kept" : "Voice only OFF: fully raw takes");
      });
      v.insertAdjacentElement("afterend", b);
    });
    voUI();
    window.addEventListener("storage", function (e) { if (e.key === VO_KEY) voUI(); });
  }
  function micWantsProcessing() { return voiceOnly(); } // OFF (default): RAW — no echo-cancel, noise suppression or auto-gain
  function openMic() {
    if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return Promise.reject({ name: "Unsupported" });
    }
    var proc = micWantsProcessing();
    if (vox.stream && vox.streamProc === proc) return Promise.resolve(vox.stream);
    if (vox.stream) closeMic(); // mode changed since the mic was opened → reopen with the right processing
    var md = navigator.mediaDevices;
    // every mode (headphones and speaker): the RAW mic, exactly as captured. No browser / phone echo canceller, noise
    // suppression or auto gain, and nothing is applied after the take; 🧹 Clean last take is manual.
    var RAW = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
    var want = proc ? { echoCancellation: true, noiseSuppression: true, autoGainControl: false, channelCount: 1 } // voice only (manual)
      : (window.BeatAudioInput ? window.BeatAudioInput.constraints(undefined,false) : { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: {ideal:2} });
    if (proc) RAW = { echoCancellation: true, noiseSuppression: true, autoGainControl: false };
    return md.getUserMedia({ audio: want })
      .catch(function (e) {
        if (e && (e.name === "OverconstrainedError" || e.name === "TypeError")) return md.getUserMedia({ audio: RAW });
        throw e;
      })
      .then(function (stream) {
        vox.stream = stream; vox.streamProc = proc;
        vox.src = ctx.createMediaStreamSource(stream);
        vox.src.connect(vocalBus);
        if (micSplit) vox.src.connect(micSplit);
        var tr = stream.getAudioTracks()[0];
        var st = tr && tr.getSettings ? tr.getSettings() : {};
        vox.liveT0 = 0; vox.inMax = 0; vox.silentWarned = false;
        if (tr) { // the system can take the mic away (a call starts) or mute it: say so instead of recording silence
          var onLost = function (why) { if (vox.stream !== stream) return; vox.silentWarned = true; var m = why === "ended" ? "The microphone was disconnected or taken by another app (a call?). Close it and tap Record Vocals / Mic check again." : MIC_SILENT; toast(m, 9000); setVoxStatus(m, true); };
          tr.addEventListener("ended", function () { onLost("ended"); });
          tr.addEventListener("mute", function () { onLost("mute"); });
          if (tr.readyState === "ended") throw { name: "NotReadableError" };
          if (tr.muted) setTimeout(function () { if (tr.muted) onLost("mute"); }, 400);
        }
        vox.micSettings = { echoCancellation: st.echoCancellation, noiseSuppression: st.noiseSuppression, autoGainControl: st.autoGainControl, label: tr ? tr.label : "", requested: proc };
        hpDetect(); // labels are readable once the mic is allowed
        vox.inLat = typeof st.latency === "number" && st.latency < 0.5 ? st.latency : 0;
        updateLatencyLabel();
        return stream;
      });
  }
  function closeMic() {
    if (vox.src) { try { vox.src.disconnect(); } catch (e) { /* ignore */ } }
    if (vox.stream) vox.stream.getTracks().forEach(function (t) { t.stop(); });
    vox.src = null; vox.stream = null;
  }
  function autoLatency() {
    if (!ctx) return 0;
    return (ctx.baseLatency || 0) + (ctx.outputLatency || 0) + (vox.inLat || 0);
  }
  function updateLatencyLabel() {
    var el = $("vox-lat");
    if (el) el.textContent = ctx ? Math.round(autoLatency() * 1000) + " ms auto" : "auto (after audio starts)";
  }
  function setVoxStatus(msg, isErr) {
    document.querySelectorAll(".js-vox-status").forEach(function (el) {
      el.textContent = msg;
      el.classList.toggle("err", !!isErr);
      el.classList.toggle("on", vox.state === "rec");
    });
  }
  function setVoxButtons() {
    var label = { idle: "🎙 Record Vocals", arming: "Waiting for mic…", count: "Count-in… (tap to cancel)", rec: "■ Stop take" }[vox.state];
    document.querySelectorAll(".js-vox").forEach(function (b) {
      b.textContent = label;
      b.classList.toggle("on", vox.state === "rec" || vox.state === "count");
      b.disabled = rec.on && rec.mode === "beat";
    });
    var br = $("btn-rec");
    if (br && !rec.on) br.disabled = vox.state !== "idle";
    var bs = $("btn-rec-stop");
    if (bs) bs.disabled = !(rec.on || vox.state !== "idle");
    var mc = $("vox-check");
    if (mc) { mc.disabled = vox.state !== "idle"; mc.classList.toggle("on", vox.check); mc.textContent = vox.check ? "Stop mic check" : "Mic check"; }
    if (vc.busy) document.querySelectorAll(".js-vox").forEach(function (b) { b.disabled = true; b.textContent = "Cleaning take…"; });
    hpUI(); applyMixer();
    refVoxChanged();
  }
  function click(t, accent) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "square"; o.frequency.value = accent ? 1760 : 1175;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.3, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    o.connect(g); g.connect(ctx.destination); // straight to speakers: never in the recording
    o.start(t); o.stop(t + 0.09);
  }
  function showCount(n) {
    var el = $("pr-count");
    if (!el) return;
    el.textContent = n || "";
    el.classList.toggle("show", !!n);
  }
  function clearVoxTimers() { vox.timers.forEach(clearTimeout); vox.timers = []; }
  function startVocalTake() {
    unpark();
    if (vox.state !== "idle") { stopVocalTake(); return; }
    if (rec.on) { toast("Finish the current recording first."); return; }
    if (!ensureCtx()) return;
    if (vox.check) stopMicCheck();
    if (vc.busy) { toast("Still cleaning the last take — one moment."); return; }
    vox.takeMode = hpMode();
    vox.voTake = voiceOnly();
    vox.state = "arming"; setVoxButtons();
    setVoxStatus("Requesting microphone…");
    openMic().then(function () {
      if (vox.state !== "arming") { closeMic(); return; }
      if (playing) stop(true); // keep the cue: the take starts where the song is cued
      if (btActive()) S.cueBar = 0; // instrumental: every take starts at 0:00 of the track
      var beat = 60 / S.bpm, t0 = ctx.currentTime + 0.2, start = t0 + beat * 4;
      vox.state = "count"; setVoxButtons();
      for (var i = 0; i < 4; i++) {
        click(t0 + i * beat, i === 0);
        (function (n, at) {
          vox.timers.push(setTimeout(function () {
            showCount(n); if (!vox.silentWarned) setVoxStatus("Count-in " + n + " / 4 — bar " + (S.cueBar + 1) + " next");
          }, Math.max(0, (at - ctx.currentTime) * 1000)));
        })(i + 1, t0 + i * beat);
      }
      play(start); vox.beatStart = start; vox.cueBar = S.cueBar;
      vox.timers.push(setTimeout(function () { beginVocalCapture(); }, Math.max(0, (start - 0.12 - ctx.currentTime) * 1000)));
      vox.timers.push(setTimeout(function () { showCount(0); }, Math.max(0, (start - ctx.currentTime) * 1000)));
    }).catch(function (e) {
      vox.state = "idle"; closeMic(); setVoxButtons();
      var msg = micErrorMsg(e);
      setVoxStatus(msg, true);
      toast(msg);
    });
  }
  function beginVocalCapture() {
    if (vox.state !== "count") return;
    var secs = recLengthSecs();
    rec.mode = "vocal";
    rec.L = []; rec.R = []; rec.V = []; rec.V2 = []; rec.frames = 0;
    rec.limit = Math.round((secs || 600) * ctx.sampleRate);
    rec.startedPattern = true;
    rec.t0 = Date.now();
    rec.on = true;
    vox.state = "rec"; setVoxButtons();
    clearInterval(rec.tick);
    rec.grpE = {}; rec.grpG = {}; rec.mst = mixGain("master");
    GROUPS.forEach(function (g) { rec.grpE[g.id] = 0; rec.grpG[g.id] = mixGain(g.id); });
    rec.tick = setInterval(function () {
      grpSample(rec.grpE);
      var el = (Date.now() - rec.t0) / 1000;
      if (!vox.silentWarned) setVoxStatus("● REC VOCALS " + fmtTime(el) + (secs ? " / " + fmtTime(secs) : " (free)") + " · tap Stop take to finish");
    }, 200);
  }
  function stopVocalTake() {
    if (vox.state === "arming" || vox.state === "count") {
      clearVoxTimers(); showCount(0);
      vox.state = "idle";
      if (playing) stop(true);
      closeMic(); setVoxButtons();
      setVoxStatus("Take cancelled");
      return;
    }
    if (vox.state === "rec") { rec.on = false; finishVocal(); }
  }
  function onSongEnded() {
    if (vox.state === "rec") {
      setVoxStatus("Song ended — wrapping up take…");
      vox.timers.push(setTimeout(function () { if (vox.state === "rec") { rec.on = false; finishVocal(); } }, 1500));
    }
  }
  function finishVocal() {
    clearInterval(rec.tick);
    clearVoxTimers(); showCount(0);
    if (playing) stop(true);
    closeMic();
    vox.state = "idle";
    var sr = ctx.sampleRate;
    var frames = Math.min(rec.frames, rec.limit || rec.frames);
    rec.mode = "beat";
    setVoxButtons();
    if (frames < sr * 0.5) { rec.L = []; rec.R = []; rec.V = []; rec.V2 = []; setVoxStatus("Take too short — nothing saved"); return; }
    var L = merge(rec.L, frames), R = merge(rec.R, frames);
    var _vL=merge(rec.V, frames), _vR=rec.V2.length ? merge(rec.V2, frames) : null;
    var V = (window.BeatAudioInput && _vR) ? window.BeatAudioInput.applyMode(_vL,_vR,window.BeatAudioInput.getMode()).mono : FXC.smartMono([_vL, _vR]); // USB 2-mic mode (mix/mic1/mic2) else channel fix only
    rec.L = []; rec.R = []; rec.V = []; rec.V2 = [];
    // RAW: no silence-trim — the take is kept exactly as captured (channel mono-sum fix above only)
    var song = getSong(S.lyricSong);
    vox.last = { L: L, R: R, V: V, frames: frames, sr: sr, title: btActive() ? bt.title : song ? song.title : "", mode: vox.takeMode || "hp", clean: null, lat: null,
      mic: vox.micSettings || null, spk: vox.takeMode === "spk" ? spkBeatGain() : 1,
      beatStart: vox.beatStart, cueBar: vox.cueBar, grpE: rec.grpE, grpG: rec.grpG, mst: rec.mst, pt0: rec.pt0, ct0: rec.ct0, bs: recNode ? recNode.bufferSize : 4096 };
    applyMixer();
    if (window.__ipbTD && window.__ipbTD.log) window.__ipbTD.log("take saved RAW (no cleanup)");
    if (vox.voTake) { vox.last.voiceOnly = true; exportVocalMix(true, "raw"); setVoxStatus("Take saved RAW (no cleanup). For optional cleanup: Master page → Clean up (optional), or Clean last take."); }
    else exportVocalMix(true); // the take is kept exactly as recorded; the mix gets only the vocal channel settings he set (pan / FX, all off by default)
    renderLastTake();
  }
  function vocalPeak(V) {
    var p = 0;
    for (var i = 0; i < V.length; i += 4) { var a = Math.abs(V[i]); if (a > p) p = a; }
    return p;
  }
  function takeShift(t) { // mic arrives late → pull it earlier. Speaker takes measure the real round trip from the beat bleed.
    return Math.round(((t.lat != null ? t.lat : autoLatency()) + S.vox.nudge / 1000) * t.sr);
  }
  // which: "clean" (speaker take after cleanup), "raw" (as recorded) or undefined (clean if there is one)
  function vocalMixArrays(t, which, solo) {
    var useClean = which === "clean" || (which == null && t.clean);
    var V = useClean && t.clean ? t.clean : t.V, sh = takeShift(t), vg = mixGain("vocal");
    var n = t.frames, outL = new Float32Array(n), outR = solo ? outL : new Float32Array(n);
    for (var i = 0; i < n; i++) {
      var j = i + sh, v = j >= 0 && j < n ? V[j] : 0;
      if (solo) { outL[i] = v; continue; }
      outL[i] = t.L[i] + v * vg; outR[i] = t.R[i] + v * vg;
    }
    return { L: outL, R: outR, V: V, sh: sh };
  }
  /* the vocal as it sits in the mix: shifted for latency, then (non-destructively) Pan, Wide, the vocal effects and the
     auto level match. The take itself (t.V / t.clean) is never modified. Resolves to { L, R, V, sh, autoDb } */
  var VOC_FADER0 = 0.9; // the default Vocal fader = "as matched"; moving it changes the level on top of the match
  /* manual take cleanup (Remove beat bleed / Noise reduction / Gate): computed on the device from the raw take and the
     beat that was playing, cached per take + setting. Never replaces t.V. */
  function vocalPre(t, V) {
    var f = FXC.norm(S.vox.fx), b = f.bleed.on, nr = f.nr.on, g = f.gate.on;
    if (!b && !nr && !g) return Promise.resolve(V);
    var key = (V === t.clean ? "c" : "r") + (b ? "B" : "") + (nr ? "N" : "") + (g ? "G" : "");
    t.pre = t.pre || {};
    if (t.pre[key]) return Promise.resolve(t.pre[key]);
    setVoxStatus("Processing the take on this device (" + [b && "beat bleed", nr && "noise", g && "gate"].filter(Boolean).join(" + ") + ")…");
    return vcRun(V, t.L, t.R, t.sr, { aec: b, denoise: nr, gate: g, hpf: false }).then(function (m) {
      t.pre[key] = m.out; t.preInfo = m.info; return m.out;
    }).catch(function (e) { toast("Cleanup isn't available in this browser (" + (e && e.message || e) + ") — using the raw take."); return V; });
  }
  function vocalMixFx(t, which) {
    var useClean = which === "clean" || (which == null && t.clean);
    var V0 = useClean && t.clean ? t.clean : t.V, sh = takeShift(t), n = t.frames, V = V0;
    return vocalAligned(t, useClean ? "clean" : "raw").then(function (vs) {
    V = vs; sh = 0; // already shifted (and tightened when that is on)
    return FXC.renderMono(vs, t.sr, { fx: S.vox.fx, pan: S.vox.pan, wide: S.vox.wide, bpm: S.bpm });
    }).then(function (pr) {
      var ad = vocalAutoDb(t, pr), vg = S.vox.auto ? mixGain("vocal") / VOC_FADER0 * Math.pow(10, ad / 20) : mixGain("vocal");
      var outL = new Float32Array(n), outR = new Float32Array(n), a = pr[0], b = pr[1];
      for (var k = 0; k < n; k++) { outL[k] = t.L[k] + a[k] * vg; outR[k] = t.R[k] + b[k] * vg; }
      return { L: outL, R: outR, V: V, sh: sh, autoDb: S.vox.auto ? ad : null };
    });
  }
  /* auto level match: beat loudness (the beat bus exactly as it played during this take: beat / master volume and
     section energy included) vs the vocal's gated loudness (silence ignored) → vocal gain = beat + offset − vocal */
  function vocalAutoDb(t, pr) {
    if (!S.vox.auto) return 0;
    if (t.beatLufs == null) t.beatLufs = FXC.lufs([t.L, t.R], t.sr);
    var v = FXC.lufs([pr[0], pr[1]], t.sr);
    t.vocLufs = v;
    t.autoDb = FXC.autoGainDb(t.beatLufs, v, S.vox.autoOff);
    voxAutoUI();
    return t.autoDb;
  }
  function voxAutoUI() {
    var el = $("vx-auto-val"); if (!el) return;
    var t = vox.last, live = t && t.autoDb != null ? liveAutoDb(t) : null;
    var base = t && t.vocLufs != null && t.beatLufs != null ? FXC.autoGainDb(t.beatLufs, t.vocLufs, S.vox.autoOff) : t && t.autoDb;
    el.textContent = !S.vox.auto ? "off" : t && t.autoDb != null ? (base >= 0 ? "+" : "") + base.toFixed(1) + " dB" + (Math.abs(base) >= FXC.AUTO.max - 0.01 ? " (max)" : "") +
      (live != null && Math.abs(live - base) >= 0.1 ? " · live " + (live >= 0 ? "+" : "") + live.toFixed(1) + " dB (beat level changed)" : "") : "on · next take";
  }
  /* beat level now vs during the take, from each beat group's energy measured while recording (post fader) and the
     group / master faders now → the live re-match. Exports keep the beat exactly as recorded, so they use t.autoDb. */
  var grpBuf = null;
  function grpSample(E) {
    if (!LG || !LG.an) return;
    grpBuf = grpBuf || new Float32Array(512);
    GROUPS.forEach(function (g) { var an = LG.an[g.id]; if (!an) return; an.getFloatTimeDomainData(grpBuf); var s = 0; for (var i = 0; i < grpBuf.length; i++) s += grpBuf[i] * grpBuf[i]; E[g.id] += s; });
  }
  function beatDeltaDb(t) {
    if (!t || !t.grpE) return 0;
    var tot = 0, now = 0;
    GROUPS.forEach(function (g) { var e = t.grpE[g.id] || 0, g0 = t.grpG[g.id] || 0; if (!e || !g0) return; var r = mixGain(g.id) / g0; tot += e; now += e * r * r; });
    if (!tot) return 0;
    var m = t.mst > 0 ? mixGain("master") / t.mst : 1;
    return 10 * Math.log10(Math.max(1e-6, now / tot)) + 20 * Math.log10(Math.max(1e-3, m));
  }
  function liveAutoDb(t) {
    if (!S.vox.auto || t.beatLufs == null || t.vocLufs == null) return t.autoDb || 0;
    return FXC.autoGainDb(t.beatLufs + beatDeltaDb(t), t.vocLufs, S.vox.autoOff);
  }
  /* ▶ Play take with beat: the live beat (current settings) from where the take started + the vocal through Pan /
     Wide / Vocal FX, auto matched to the beat level as it is NOW (re-matches while you move faders). Never recorded. */
  var vpv = { src: null, g: null, t: null };
  function voxPrevGain() {
    var t = vpv && vpv.t; if (!t) return 0;
    return S.vox.auto ? mixGain("vocal") / VOC_FADER0 * Math.pow(10, liveAutoDb(t) / 20) : mixGain("vocal");
  }
  function voxPrevApply() { if (vpv && vpv.src && VX && ctx) VX.lvl.gain.setTargetAtTime(voxPrevGain(), ctx.currentTime, 0.03); voxAutoUI(); if (vpv && vpv.src && S.vox.auto) vxAutoSoon(); }
  /* auto level match follows FX changes: the take is rendered through the same settings offline (in the background,
     debounced) and its loudness re-measured; the live gain then ramps to the new match */
  var vxAutoT = null;
  /* auto level re-measure (offline FX render + loudness) never runs while the take plays: it waits for Stop / the take end */
  var vxAutoPending = false;
  function vxAutoKey() { return JSON.stringify([S.vox.fx, S.vox.wide, S.vox.pan, preKey(), S.vox.tight]); }
  function vxAutoMeasure(t) {
    var fxk = vxAutoKey();
    if (!t || t.autoKey === fxk) return Promise.resolve();
    return vocalAligned(t).then(function (vs) { return FXC.renderMono(vs, t.sr, { fx: S.vox.fx, pan: S.vox.pan, wide: S.vox.wide, bpm: S.bpm }); })
      .then(function (pr) { t.autoKey = fxk; vocalAutoDb(t, pr); if (vpv.src && VX) VX.lvl.gain.setTargetAtTime(voxPrevGain(), ctx.currentTime, 0.05); voxAutoUI(); });
  }
  function vxAutoSoon(ms) {
    clearTimeout(vxAutoT);
    if (vpv.src) { vxAutoPending = true; return; }
    vxAutoT = setTimeout(function () { vxAutoMeasure(vox.last).catch(function () {}); }, ms == null ? 700 : ms);
  }
  function voxPrevStop(fromStop) {
    if (vpv.src) vxSrcStop(vpv);
    vpv.src = null; vpv.g = null; vpv.t = null;
    if (vxAutoPending && S.vox.auto) { vxAutoPending = false; vxAutoSoon(400); }
    document.querySelectorAll("#vox-playtake, #vx-play2").forEach(function (b) { b.textContent = "▶ Play take with beat"; b.classList.remove("on"); });
    if (!fromStop && playing) stop(true);
  }
  function voxPlayTake() {
    unpark();
    if (vpv.src) { voxPrevStop(); return; }
    var t = vox.last;
    if (!t || !ensureCtx() || vox.state !== "idle" || rec.on) return;
    var b = $("vox-playtake") || $("vx-play2"); b.disabled = true; b.textContent = "Preparing…";
    if (vc.src) vcStop();
    (S.vox.auto ? vxAutoMeasure(t).catch(function () {}) : Promise.resolve()).then(function () { return vocalAligned(t); }).then(function (vs) { // level measured before the beat starts
      b.disabled = false;
      if (playing) stop(true);
      var buf = ctx.createBuffer(1, vs.length, t.sr); buf.getChannelData(0).set(vs); buf._vs = vs;
      vxEnsure(); vpv.t = t; vpv.g = VX.lvl;
      vxRoute("master", voxPrevGain()); // live FX chain → master fader + limiter, like the beat
      vxSwapKey = preKey() + (S.vox.tight && S.vox.tight.on ? "T" + S.vox.tight.str : "") + ":null";
      S.cueBar = t.cueBar || 0; if (btActive()) S.cueBar = 0;
      var at = ctx.currentTime + 0.12;
      play(at); var s = vxSrcStart(vpv, buf, at, 0);
      s.onended = function () { if (vpv.src === s) voxPrevStop(); };
      document.querySelectorAll("#vox-playtake, #vx-play2").forEach(function (x) { x.textContent = "■ Stop take"; x.classList.add("on"); });
      voxAutoUI();
    }).catch(function (e) { b.disabled = false; b.textContent = "▶ Play take with beat"; toast("Couldn't play the take (" + (e && e.message || e) + ")"); });
  }
  /* Raw take (no FX): the vocal exactly as recorded (latency-aligned only), vocal alone, for mixing / mastering elsewhere */
  function exportRawTake() {
    var t = vox.last;
    if (!t) { toast("Record a vocal take first."); return; }
    var n = t.frames, sh = takeShift(t), V = t.V, out = new Float32Array(n);
    for (var i = 0; i < n; i++) { var j = i + sh; out[i] = j >= 0 && j < n ? V[j] : 0; }
    saveToVault(encodeWav(out, out, n, t.sr), n / t.sr, "Raw take (no FX)" + (t.title ? " · " + t.title : ""));
    toast("Saved “Raw take (no FX)” to the Vault: your voice exactly as recorded, lined up with the beat");
  }
  function exportVocalMix(first, which) {
    var t = vox.last;
    if (!t) { toast("No vocal take yet."); return; }
    var clean = !!t.clean && which !== "raw";
    return vocalMixFx(t, clean ? "clean" : "raw").then(function (mx) { exportVocalMixDone(t, mx, first, which, clean); })
      .catch(function (e) { toast("Vocal export failed (" + (e && e.message || e) + ")"); });
  }
  function exportVocalMixDone(t, mx, first, which, clean) {
    var n = t.frames;
    var name = "Vocal take" + (t.voiceOnly ? (clean ? " (voice only)" : " (raw)") : t.clean ? (clean ? (t.pro ? (t.mode === "spk" ? " (cleaned, pro vocal)" : " (pro vocal)") : " (cleaned)") : " (raw" + (t.mode === "spk" ? ", speaker)" : ")")) : "") + (t.title ? " · " + t.title : "");
    saveToVault(encodeWav(mx.L, mx.R, n, t.sr), n / t.sr, first ? name : name + " (re-mix)");
    if (S.vox.dry && first) {
      var dry = new Float32Array(n);
      for (var i = 0; i < n; i++) { var j = i + mx.sh; dry[i] = j >= 0 && j < n ? mx.V[j] : 0; }
      saveToVault(encodeWav(dry, dry, n, t.sr), n / t.sr, "Dry vocal" + (clean ? (t.pro ? " (pro vocal)" : " (cleaned)") : "") + (t.title ? " · " + t.title : ""));
    }
    if (which === "raw") return;
    var quiet = vocalPeak(t.V) < 0.003;
    setVoxStatus("Saved " + fmtTime(n / t.sr) + " vocal + " + (btActive() ? "instrumental" : "beat") + " mix to Vault" + (clean ? (t.voiceOnly ? " (voice only: beat bleed removed)" : t.mode === "spk" ? " (cleaned: no speaker beat, no room noise" + (t.pro ? ", pro vocal)" : ")") : " (pro vocal)") : "") + (quiet ? " — warning: the mic signal was almost silent" : ""), quiet);
    if (first) sendOffer(clean ? "Cleaned copy of the vocal take saved to Vault." : "Vocal take saved to Vault (beat + vocal WAV).", function (dest) { sendVocal(dest); });
  }
  function sendVocal(dest) {
    var t = vox.last;
    if (!t) { toast("Record a vocal take first (🎙 Record Vocals)."); return; }
    vocalMixFx(t).then(function (mx) { // the cleaned vocal when the take was cleaned (speaker mode), else as recorded; + vocal FX / match
    sendOut(dest, encodeWav(mx.L, mx.R, t.frames, t.sr), t.frames / t.sr, (t.title || songTitle()) + (t.clean ? (t.mode === "spk" ? " (vocal take, cleaned)" : " (vocal take, pro vocal)") : " (vocal take)"));
    });
  }

  /* ---------------- IslePin ecosystem: send audio to the Player / DJ booth ----------------
   * Uses the shared library in ../shared/media-store.js (IndexedDB "islepin-media", store "tracks";
   * BroadcastChannel "islepin-media" tells an open Player / DJ tab right away). Source is always "beats". */
  var mediaStoreP = null, lastSent = null;
  function mediaStore() {
    if (!mediaStoreP) mediaStoreP = import("../shared/media-store.js").catch(function (e) { mediaStoreP = null; throw e; });
    return mediaStoreP;
  }
  function artistName() { var a = $("studio-artist"); return (a && a.value.trim()) || "Island Pin Beats"; }
  function songTitle() { var t = $("studio-title"); return (t && t.value.trim()) || "Untitled beat"; }
  function djHref(id) { return "../dj/?from=beats&back=" + encodeURIComponent(activeTab) + (id ? "&track=" + encodeURIComponent(id) : ""); }
  function sendOut(dest, blob, dur, title) {
    return mediaStore().then(function (m) {
      return m.saveTrack({ title: title, artist: artistName(), source: "beats", blob: blob, mime: blob.type || "audio/wav", duration: dur })
        .then(function (id) { lastSent = { id: id, dest: dest, title: title }; sendToast(dest, id, title, m.playerUrl(id)); return id; });
    }).catch(function (e) { toast("Could not send to the " + (dest === "dj" ? "DJ booth" : "Player") + " (" + (e && e.message || e) + ")"); return null; });
  }
  function sendBox() {
    var el = $("ipb-send");
    if (!el) {
      el = document.createElement("div"); el.id = "ipb-send"; el.className = "send-toast"; el.setAttribute("role", "status"); el.hidden = true;
      el.innerHTML = '<span class="send-msg"></span><span class="send-acts"></span><button type="button" class="send-x" aria-label="Close">×</button>';
      el.querySelector(".send-x").addEventListener("click", function () { el.hidden = true; });
      document.body.appendChild(el);
    }
    clearTimeout(el._t);
    return el;
  }
  function sendToast(dest, id, title, purl) {
    var el = sendBox(), acts = el.querySelector(".send-acts");
    el.querySelector(".send-msg").textContent = "✓ “" + title + "” is in your IslePin library" + (dest === "dj" ? " (DJ booth library)." : " (Player).");
    acts.innerHTML = '<a class="btn small" target="psycho-fingers-player" rel="opener">Open Player ↗</a><a class="btn small">Open DJ</a>';
    var a = acts.querySelectorAll("a");
    a[0].href = purl; a[1].href = djHref(id);
    a[dest === "dj" ? 1 : 0].classList.add("primary");
    a[1].addEventListener("click", function () { if (playing) stop(); saveSession(); });
    el.hidden = false; el._t = setTimeout(function () { el.hidden = true; }, 6000);
  }
  function sendOffer(msg, fn) { // "saved — send it on?" with → Player / → DJ Booth buttons
    var el = sendBox(), acts = el.querySelector(".send-acts");
    el.querySelector(".send-msg").textContent = msg;
    acts.innerHTML = '<button type="button" class="btn small" data-d="player">Send to Player</button><button type="button" class="btn small" data-d="dj">Send to DJ Booth</button>';
    acts.querySelectorAll("button").forEach(function (b) { b.addEventListener("click", function () { fn(b.dataset.d); }); });
    el.hidden = false; el._t = setTimeout(function () { el.hidden = true; }, 6000);
  }
  function vaultGet(id) {
    var mem = memVault.filter(function (x) { return x.id === id; })[0];
    if (mem) return Promise.resolve(mem);
    return idb("vault", "readonly", function (st) { return st.get(id); });
  }
  function bounceAndSend(dest) {
    stop();
    var bars = $("bounce-bars").value;
    bounce(bars, function (vid) {
      vaultGet(vid).then(function (it) {
        if (!it) { toast("Bounce not found."); return; }
        sendOut(dest, it.blob, it.duration, songTitle() + (bars === "song" ? "" : " (" + bars + "-bar loop)"));
      });
    });
  }
  function renderLastTake() {
    var el = $("vox-last");
    if (!el) return;
    if (!vox.last) { el.textContent = "No take yet this session."; $("vox-remix").disabled = true; $("vox-playtake").disabled = true; return; }
    $("vox-playtake").disabled = false;
    el.textContent = "Last take: " + fmtTime(vox.last.frames / vox.last.sr) + (vox.last.title ? " · " + vox.last.title : "");
    $("vox-remix").disabled = false;
  }
  function startMicCheck() {
    unpark();
    if (!ensureCtx() || vox.state !== "idle") return;
    openMic().then(function () {
      vox.check = true; setVoxButtons();
      setVoxStatus("Mic check on — talk and watch the MIC bar" + (S.vox.monitor ? " (monitoring)" : ""));
    }).catch(function (e) { var m = micErrorMsg(e); setVoxStatus(m, true); toast(m); });
  }
  function stopMicCheck() {
    vox.check = false;
    if (vox.state === "idle") closeMic();
    setVoxButtons();
    setVoxStatus("Mic off");
  }

  /* ---------------- Headphones vs speaker ----------------
   * Headphones: the take is recorded exactly as before (raw mic, optional monitoring).
   * Speaker (the default, since phones rarely say what's plugged in): the beat plays out loud, the mic hears it, and
   * the take is cleaned on this device afterwards (vocal-clean-worker.js): the known beat is subtracted, then room
   * noise is removed, then the clean vocal is mixed with the clean digital beat. */
  var HP_KEY = "ipb_hp_mode_v1";
  var hp = { pref: "auto", detected: false, label: "", labels: false };
  try { var hpv = localStorage.getItem(HP_KEY); if (hpv === "hp" || hpv === "spk") hp.pref = hpv; } catch (e) { /* ignore */ }
  // single manual control: "No headphones — voice only" ON = speaker behaviour (beat level, no monitoring); OFF = headphones. Nothing auto-detected.
  function hpMode() { return voiceOnly() ? "spk" : "hp"; }
  function hpIsHeadphones(label) { return window.IPBVocalCleanClient ? window.IPBVocalCleanClient.isHeadphones(label) : false; }
  function hpDetect() {
    var md = navigator.mediaDevices;
    if (!md || !md.enumerateDevices) { hpUI(); return Promise.resolve(); }
    return md.enumerateDevices().then(function (list) {
      var outs = list.filter(function (d) { return d.kind === "audiooutput" && d.label; });
      var ins = list.filter(function (d) { return d.kind === "audioinput" && d.label; });
      hp.labels = outs.length + ins.length > 0;
      var found = "";
      var defOut = outs.filter(function (d) { return d.deviceId === "default"; })[0] || (outs.length === 1 ? outs[0] : null);
      if (defOut) { if (hpIsHeadphones(defOut.label)) found = defOut.label; }       // desktop: the default output says it
      else ins.forEach(function (d) { if (!found && hpIsHeadphones(d.label)) found = d.label; }); // Android: a headset mic is listed only while connected
      hp.detected = !!found; hp.label = found; // informational only (shown in the debug hook); never changes the mode
      hpUI();
    }).catch(function () { hpUI(); });
  }
  function spkBeatGain() { return Math.max(0.1, Math.min(1, S.vox.spk / 100)) * (S.vox.guide ? 0.3 : 1); }
  function hpUI() {
    var m = hpMode(), txt, tip;
    if (m === "hp") {
      txt = (hp.pref === "hp" ? "🎧 Headphones (confirmed)" : "🎧 Headphones detected") + " · monitoring " + (S.vox.monitor ? "on" : "off");
      tip = hp.pref === "hp" ? "You said you're on headphones: takes are recorded as-is, no cleanup." : "Detected: " + hp.label + ". Takes are recorded as-is, no cleanup.";
    } else {
      txt = "🔈 Speaker mode · take saved as recorded";
      tip = hp.pref === "spk" ? "You chose speaker mode." : hp.labels ? "No headphones detected (phones often can't tell). Tick “I'm on headphones” if you are." : "Headphones can't be detected until the mic is allowed. Tick “I'm on headphones” if you are.";
    }
    document.querySelectorAll(".js-hp-chip").forEach(function (el) { el.textContent = txt; el.title = tip; el.classList.toggle("hp", m === "hp"); el.classList.toggle("spk", m !== "hp"); });
    document.querySelectorAll(".js-hp-toggle").forEach(function (el) { el.checked = m === "hp"; el.disabled = vox.state !== "idle"; });
    document.querySelectorAll(".js-hp-auto").forEach(function (el) { el.hidden = hp.pref === "auto"; });
  }
  function hpSetPref(p) {
    hp.pref = p; try { localStorage.setItem(HP_KEY, p); } catch (e) { /* ignore */ }
    if (vox.check && vox.stream && vox.streamProc !== micWantsProcessing()) { closeMic(); startMicCheck(); }
    applyMixer(); hpUI();
  }

  /* ---------------- Speaker-mode cleanup ---------------- */
  var vc = { busy: false, ab: "clean", solo: false, src: null, t0: 0, off: 0, bufs: {}, rawSaved: false, lastInfo: null };
  // the cleaner itself lives in vocal-clean-client.js (shared with the Studio's "Clean take"): resample to 48 kHz → worker
  function vcRun(mic, L, R, sr, opts, onProg, comps) {
    if (!window.IPBVocalCleanClient) return Promise.reject(new Error("cleanup script not loaded"));
    return window.IPBVocalCleanClient.run(mic, L, R, sr, opts, onProg, comps);
  }

  var VC_STEPS = { align: "Finding the beat in your mic (latency)…", aec: "Removing the speaker beat…", res: "Removing leftover echo…", denoise: "Removing room noise…", gate: "Finishing…" };
  function cleanTake(t) {
    vc.busy = true; vc.rawSaved = false; vc.bufs = {}; vcStop();
    var sheet = $("vc-sheet"); sheet.hidden = false; sheet.classList.remove("done");
    $("vc-title").textContent = "Cleaning take…"; $("vc-ab").hidden = true; $("vc-prog").hidden = false;
    $("vc-bar").style.width = "2%"; $("vc-step").textContent = "Preparing…";
    setVoxStatus("Cleaning take on this device… (the page stays usable)");
    setVoxButtons();
    var T0 = performance.now();
    vcRun(t.V, t.L, t.R, t.sr, {}, function (stage, p) {
      $("vc-bar").style.width = Math.max(2, Math.round(p * 100)) + "%";
      $("vc-step").textContent = (VC_STEPS[stage] || "Working…") + " " + Math.round(p * 100) + "%";
    }).then(function (m) {
      if (vox.last !== t) return;
      var info = m.info; info.wallMs = Math.round(performance.now() - T0);
      t.clean = m.out; t.info = info;
      if (info.bleedFound && info.delayMs > 3 && info.delayMs < 900) t.lat = info.delayMs / 1000;
      vc.lastInfo = info;
    }).then(function () {
      if (vox.last !== t || !t.clean) return;
      $("vc-prog").hidden = true;
      exportVocalMix(true, "clean");
      vc.rawSaved = true; // the raw take was already saved when it was recorded
      vcShowResult(t);
    }).catch(function (e) {
      if (vox.last !== t) return;
      vc.lastInfo = { error: String(e && e.message || e) };
      $("vc-title").textContent = "Couldn't clean this take";
      $("vc-step").textContent = "Your raw take is still saved in the Vault. (" + (e && e.message ? e.message : "cleanup unavailable in this browser") + ")";
      setVoxStatus("Cleanup isn't available in this browser — the raw take is still in the Vault.", true);
    }).then(function () { vc.busy = false; setVoxButtons(); });
  }
  function proStats(t) {
    var p = t.pro; if (!p) return "";
    return "Pro vocal: level " + Math.round(p.voiceIn) + " → " + Math.round(p.voiceOut) + " dBFS · voice over room noise " + Math.round(p.voiceIn - p.floorIn) + " → " + Math.round(p.voiceOut - p.floorOut) + " dB";
  }
  function fmtDbv(x) { return (x > 0 ? "+" : "") + x.toFixed(0) + " dB"; }
  function vcShowResult(t) {
    var i = t.info, sheet = $("vc-sheet");
    sheet.classList.add("done");
    $("vc-title").textContent = i.proOnly ? "Pro vocal ✓" : "Take cleaned ✓";
    $("vc-prog").hidden = true; $("vc-ab").hidden = false;
    var parts = [];
    if (t.pro) parts.push(proStats(t));
    if (i.proOnly) parts.push("done in " + (t.pro.ms / 1000).toFixed(1) + " s");
    else if (i.bleedFound) {
      parts.push("Beat in mic: " + fmtDbv(i.bleedDb - i.micDb) + " vs whole mic");
      parts.push("latency " + Math.round(i.delayMs) + " ms (used for timing)");
    } else parts.push("No beat bleed found (browser echo-cancel or low speaker) — noise cleanup only");
    if (i.floorInDb != null) parts.push("between lines: " + Math.round(i.floorInDb) + " → " + Math.round(i.floorOutDb) + " dBFS (beat + noise −" + Math.round(i.floorInDb - i.floorOutDb) + " dB)");
    if (!i.proOnly) {
      parts.push("noise removal " + (i.rnnoise ? "RNNoise " + i.rnnoise : "off") + (i.voicedPct != null ? " · voice in " + i.voicedPct + "% of take" : ""));
      parts.push("done in " + (i.wallMs / 1000).toFixed(1) + " s");
      if (t.mic) parts.push("phone echo-cancel " + (t.mic.echoCancellation ? "on" : "off"));
    }
    $("vc-stats").textContent = parts.join(" · ");
    $("vc-saveraw").disabled = vc.rawSaved; $("vc-saveraw").textContent = vc.rawSaved ? "Raw take saved ✓" : "Save raw take to Vault";
    $("vc-saved").textContent = "Saved to Vault: " + (i.proOnly ? "pro vocal mix" : "cleaned mix") + (vc.rawSaved ? " + raw mix" : "") + (S.vox.dry ? " + dry vocal" : "");
    var bb = document.querySelector('#vc-ab [data-ab="clean"]'); if (bb) bb.textContent = i.proOnly ? "B · Pro vocal" : t.pro ? "B · Cleaned + pro" : "B · Cleaned";
    vcSetAB("clean");
  }
  function vcBuf(which, solo) {
    var key = which + (solo ? "-solo" : "");
    if (vc.bufs[key]) return vc.bufs[key];
    var t = vox.last, mx = vocalMixArrays(t, which, solo), b = ctx.createBuffer(2, t.frames, t.sr);
    var sc = solo ? 1 : peakScale(mx.L, mx.R, t.frames);
    var l = b.getChannelData(0), r = b.getChannelData(1);
    for (var i = 0; i < t.frames; i++) { l[i] = mx.L[i] * sc; r[i] = mx.R[i] * sc; }
    return (vc.bufs[key] = b);
  }
  function vcPos() { return vc.src ? ctx.currentTime - vc.at0 : vc.off; }
  function vcStop(keepPos) {
    vc.tok = (vc.tok || 0) + 1;
    if (vc.bsrc) { try { vc.bsrc.stop(); } catch (e) { /* ended */ } vc.bsrc = null; }
    if (vc.src) { var p = vcPos(); vxSrcStop(vc); vc.off = keepPos ? p : 0; }
    else if (!keepPos) vc.off = 0;
    var b = $("vc-play"); if (b) b.textContent = "▶ Play";
  }
  function vcPlay() {
    unpark();
    if (!vox.last || !vox.last.clean || !ensureCtx()) return;
    if (vox.state !== "idle") return;
    if (playing) stop(true);
    if (vpv.src) voxPrevStop(true);
    var t = vox.last, which = vc.ab === "clean" ? "clean" : "raw", tok = vc.tok = (vc.tok || 0) + 1;
    vocalAligned(t, which).then(function (vs) {
      if (vc.tok !== tok || vc.src) return;
      var dur = t.frames / t.sr; if (vc.off >= dur) vc.off = 0;
      var at = ctx.currentTime + 0.03;
      if (!vc.solo) { // the beat exactly as it played during the take, straight to the speakers
        var bb = vc.beatBuf; if (!bb || bb._t !== t) { bb = ctx.createBuffer(2, t.frames, t.sr); bb.getChannelData(0).set(t.L); bb.getChannelData(1).set(t.R); bb._t = t; vc.beatBuf = bb; }
        var bs = ctx.createBufferSource(); bs.buffer = bb; bs.connect(ctx.destination); bs.start(at, vc.off); vc.bsrc = bs;
      }
      var vb = ctx.createBuffer(1, vs.length, t.sr); vb.getChannelData(0).set(vs); vb._vs = vs;
      vxEnsure(); vxRoute("spk", vc.solo ? 1 : mixGain("vocal")); // vocal through the live FX chain, never into master / recordings
      vxSwapKey = preKey() + (S.vox.tight && S.vox.tight.on ? "T" + S.vox.tight.str : "") + ":" + which;
      var s = vxSrcStart(vc, vb, at, vc.off); vc.t0 = at;
      s.onended = function () { if (vc.src === s) { vc.src = null; vc.off = 0; if (vc.bsrc) { try { vc.bsrc.stop(); } catch (e) { /* ended */ } vc.bsrc = null; } $("vc-play").textContent = "▶ Play"; } };
      $("vc-play").textContent = "■ Stop";
    });
  }
  function vcSetAB(ab) {
    var was = !!vc.src; vc.ab = ab;
    document.querySelectorAll("#vc-ab [data-ab]").forEach(function (b) { b.classList.toggle("on", b.dataset.ab === ab); b.setAttribute("aria-pressed", b.dataset.ab === ab ? "true" : "false"); });
    if (was) { vcStop(true); vcPlay(); }
  }
  function vcTick() {
    if (!vox.last || $("vc-sheet").hidden || !vox.last.clean) return;
    var d = vox.last.frames / vox.last.sr, p = Math.min(d, vcPos());
    $("vc-pos").style.width = (p / d * 100).toFixed(2) + "%";
    $("vc-time").textContent = fmtTime(p) + " / " + fmtTime(d);
  }
  function initVocalClean() {
    document.querySelectorAll(".js-hp-toggle").forEach(function (el) {
      el.addEventListener("change", function () { hpSetPref(el.checked ? "hp" : hp.detected ? "spk" : "auto"); toast(el.checked ? "Headphones: takes are recorded as-is" : "Speaker mode: takes are recorded as-is too (🧹 Clean last take is optional)"); });
    });
    document.querySelectorAll(".js-hp-auto").forEach(function (el) { el.addEventListener("click", function (e) { e.preventDefault(); hpSetPref("auto"); }); });
    if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) navigator.mediaDevices.addEventListener("devicechange", hpDetect);
    var sp = $("vox-spk"), so = $("vox-spk-val");
    sp.value = S.vox.spk; so.textContent = S.vox.spk + "%";
    sp.addEventListener("input", function () { S.vox.spk = clamp(Math.round(+sp.value), 10, 100); so.textContent = S.vox.spk + "%"; applyMixer(); saveSession(); });
    [["vox-guide", "guide"]].forEach(function (p) {
      var el = $(p[0]); if (!el) return; el.checked = !!S.vox[p[1]];
      el.addEventListener("change", function () { S.vox[p[1]] = el.checked; saveSession(); applyMixer(); hpUI(); });
    });
    var cb = $("vox-clean-btn"); // manual only: never runs by itself
    if (cb) cb.addEventListener("click", function () {
      if (!vox.last) { toast("Record a vocal take first (🎙 Record Vocals)."); return; }
      if (vc.busy) { toast("Still cleaning — one moment."); return; }
      if (vox.last.clean) { toast("This take is already cleaned. The raw take is in the Vault."); return; }
      cleanTake(vox.last);
    });
    $("vc-close").addEventListener("click", function () { vcStop(); $("vc-sheet").hidden = true; });
    $("vc-play").addEventListener("click", function () { vc.src ? vcStop(true) : vcPlay(); });
    document.querySelectorAll("#vc-ab [data-ab]").forEach(function (b) { b.addEventListener("click", function () { vcSetAB(b.dataset.ab); }); });
    $("vc-solo").addEventListener("change", function (e) { var was = !!vc.src; vc.solo = e.target.checked; if (was) { vcStop(true); vcPlay(); } });
    $("vc-seek").addEventListener("click", function (e) {
      if (!vox.last) return; var r = e.currentTarget.getBoundingClientRect(), was = !!vc.src;
      vcStop(); vc.off = clamp((e.clientX - r.left) / r.width, 0, 1) * vox.last.frames / vox.last.sr; if (was) vcPlay(); vcTick();
    });
    $("vc-saveraw").addEventListener("click", function () { if (!vox.last || vc.rawSaved) return; exportVocalMix(true, "raw"); vc.rawSaved = true; vcShowResult(vox.last); toast("Raw take saved to Vault"); });
    hpDetect();
  }

  /* ---------------- Songs (lyrics) storage ---------------- */
  var SONGS_KEY = "ipb_songs_v1";
  var songStore = { songs: [], overrides: {} };
  function loadSongStore() {
    try {
      var d = JSON.parse(localStorage.getItem(SONGS_KEY) || "null");
      if (d && Array.isArray(d.songs)) songStore.songs = d.songs.filter(function (x) { return x && x.id && typeof x.text === "string"; });
      if (d && d.overrides && typeof d.overrides === "object") songStore.overrides = d.overrides;
    } catch (e) { /* ignore */ }
  }
  function saveSongStore() {
    try { localStorage.setItem(SONGS_KEY, JSON.stringify(songStore)); return true; }
    catch (e) { toast("Could not save — browser storage is full or blocked."); return false; }
  }
  function getSong(id) {
    for (var i = 0; i < BUILTIN_SONGS.length; i++) {
      var b = BUILTIN_SONGS[i];
      if (b.id === id) {
        var o = songStore.overrides[id];
        return { id: b.id, title: b.title, artist: b.artist, preset: b.preset, builtin: true, text: typeof o === "string" ? o : b.text, edited: typeof o === "string" };
      }
    }
    for (var j = 0; j < songStore.songs.length; j++) if (songStore.songs[j].id === id) return songStore.songs[j];
    return null;
  }
  function beatSnapshot() { return withSong(beatSnapshotSong); }
  function beatSnapshotSong() {
    var s = curSlot();
    function cp(g) { return g.map(function (r) { return r.slice(); }); }
    return {
      fmt: 2, kit: S.kit, bpm: S.bpm, swing: S.swing, feel: S.feel, len: s.len,
      pattern: cp(s.pattern), vel: cp(s.vel), note: cp(s.note), slide: cp(s.slide),
      pads: JSON.parse(JSON.stringify(S.padCfg[S.kit] || [])),
      chords: JSON.parse(JSON.stringify(S.chordTrack)),
      structure: S.structure,
      piano: PD.normalize(pianoPat(), instOk),
      songKey: S.songKey,
      sections: S.structure ? secSnapshot() : undefined
    };
  }

  /* ---------------- Lyrics parsing / rendering ---------------- */
  function escapeHtml(t) {
    return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function adlibHtml(t) {
    return escapeHtml(t).replace(/\([^()]*\)/g, function (m) { return '<span class="adlib">' + m + "</span>"; });
  }
  function parseLyrics(text) {
    var items = [], sec = -1;
    String(text || "").replace(/\r/g, "").split("\n").forEach(function (raw) {
      var line = raw.replace(/\s+$/, "");
      var m = line.match(/^\s*\[([^\]]+)\]\s*(.*)$/);
      if (m) { sec++; items.push({ t: "h", label: m[1].trim(), note: m[2] || "", sec: sec }); }
      else if (!line.trim()) items.push({ t: "b", sec: sec });
      else items.push({ t: "l", text: line.trim(), sec: sec });
    });
    return items;
  }
  /* Give every lyric line a start bar + length in bars.
     "auto": lyric section N fills structure section N (lines spread evenly); else fixed bars/line. */
  function timeLyrics(items) {
    var A = arrangement();
    var auto = S.bpl === "auto" && A;
    var bpl = auto ? 1 : (+S.bpl || 1);
    var secStart = [], b = 0, total = 0;
    if (auto) { A.forEach(function (s) { secStart.push(b); b += s.bars; }); total = b; }
    var counts = {}, used = {};
    items.forEach(function (it) { if (it.t === "l") counts[it.sec] = (counts[it.sec] || 0) + 1; });
    var cursor = 0;
    items.forEach(function (it) {
      it.start = null; it.dur = 0;
      var mapped = auto && it.sec >= 0 && it.sec < A.length;
      if (it.t === "h" && mapped) { it.start = secStart[it.sec]; return; }
      if (it.t !== "l") return;
      if (mapped) {
        var d = A[it.sec].bars / counts[it.sec], j = used[it.sec] || 0;
        used[it.sec] = j + 1;
        it.start = secStart[it.sec] + j * d; it.dur = d;
        cursor = it.start + d;
      } else {
        if (auto && it.sec >= A.length) cursor = Math.max(cursor, total);
        it.start = cursor; it.dur = bpl; cursor += bpl;
      }
    });
    // headers with no own time sit at their first line
    for (var i = items.length - 1, next = cursor; i >= 0; i--) {
      if (items[i].t === "l") next = items[i].start;
      else if (items[i].t === "h" && items[i].start == null) items[i].start = next;
    }
    return items;
  }
  function LyricView(scrollEl, linesEl, big) {
    this.scrollEl = scrollEl; this.linesEl = linesEl; this.big = big;
    this.items = []; this.lineIdx = []; this.els = []; this.active = -1; this.tops = null;
  }
  LyricView.prototype.render = function (text) {
    var self = this;
    this.items = timeLyrics(parseLyrics(text));
    this.linesEl.innerHTML = "";
    this.els = []; this.lineIdx = []; this.active = -1; this.tops = null;
    if (!this.items.some(function (it) { return it.t !== "b"; })) {
      this.linesEl.innerHTML = '<div class="ly-empty">No lyrics yet — type in the editor. Use [Hook], [Verse 1]… for sections and (parentheses) for ad-libs.</div>';
      return;
    }
    this.items.forEach(function (it, i) {
      var el = document.createElement("div");
      if (it.t === "h") {
        el.className = "ly-h";
        el.innerHTML = '<span class="ly-hl"></span>' + (it.note ? ' <span class="ly-hn"></span>' : "");
        el.querySelector(".ly-hl").textContent = it.label;
        if (it.note) el.querySelector(".ly-hn").innerHTML = adlibHtml(it.note);
      } else if (it.t === "b") {
        el.className = "ly-b";
      } else {
        el.className = "ly-l" + (/^\(.*\)$/.test(it.text) ? " all-adlib" : "");
        el.innerHTML = adlibHtml(it.text);
        el.title = "Bar " + (Math.floor(it.start) + 1) + " · tap to cue here";
        el.addEventListener("click", function () { cueTo(Math.floor(it.start)); });
        self.lineIdx.push(i);
      }
      if (it.t === "h") el.addEventListener("click", function () { if (it.start != null) cueTo(Math.floor(it.start)); });
      self.linesEl.appendChild(el);
      self.els.push(el);
    });
  };
  LyricView.prototype.measure = function () {
    var self = this;
    this.tops = this.els.map(function (el) { return el.offsetTop + el.offsetHeight / 2; });
    return this.tops;
  };
  LyricView.prototype.update = function (bar, doScroll) {
    if (!this.lineIdx.length) return;
    var items = this.items, li = this.lineIdx, cur = -1;
    for (var n = 0; n < li.length; n++) { if (items[li[n]].start <= bar + 1e-6) cur = n; else break; }
    var idx = cur >= 0 ? li[cur] : -1;
    if (idx !== this.active) {
      if (this.active >= 0 && this.els[this.active]) this.els[this.active].classList.remove("now");
      this.els.forEach(function (el, i) { el.classList.toggle("past", i < idx); });
      if (idx >= 0) this.els[idx].classList.add("now");
      this.active = idx;
    }
    if (!doScroll) return;
    if (!this.tops) this.measure();
    var y;
    if (cur < 0) y = this.tops[li[0]];
    else {
      var it = items[li[cur]], a = this.tops[li[cur]];
      var nx = cur + 1 < li.length ? this.tops[li[cur + 1]] : a;
      var f = it.dur ? clamp((bar - it.start) / it.dur, 0, 1) : 0;
      y = a + (nx - a) * f;
    }
    var target = y - this.scrollEl.clientHeight * (this.big ? 0.38 : 0.4);
    this.scrollEl.scrollTop = target;
  };

  /* ---------------- Lyrics tab ---------------- */
  var ly = { dirty: false, preview: null, prompter: null, open: false, renderTimer: null };
  var prForceScroll = true;
  function refreshSongPickers() {
    var sel = $("ly-song");
    sel.innerHTML = "";
    var g1 = document.createElement("optgroup"); g1.label = "Built-in";
    BUILTIN_SONGS.forEach(function (b) {
      var o = document.createElement("option");
      o.value = b.id; o.textContent = b.title + (songStore.overrides[b.id] != null ? " (edited)" : "");
      g1.appendChild(o);
    });
    sel.appendChild(g1);
    if (songStore.songs.length) {
      var g2 = document.createElement("optgroup"); g2.label = "My songs";
      songStore.songs.forEach(function (x) {
        var o = document.createElement("option");
        o.value = x.id; o.textContent = x.title + (x.beat ? " ♪" : "");
        g2.appendChild(o);
      });
      sel.appendChild(g2);
    }
    if (!getSong(S.lyricSong)) S.lyricSong = BUILTIN_SONGS[0].id;
    sel.value = S.lyricSong;
    // Beats-tab preset dropdown: songs that come with a beat (one tap = beat + lyrics)
    var ps = $("song-preset"), keep = ps.value;
    ps.innerHTML = '<option value="">Song preset…</option>';
    BUILTIN_SONGS.forEach(function (b) {
      if (!b.preset) return;
      var bp = BEAT_PRESETS[b.preset];
      var o = document.createElement("option");
      o.value = "b:" + b.id;
      o.textContent = b.title + " — " + kitName(bp.kit) + " " + bp.bpm + " (beat + lyrics)";
      ps.appendChild(o);
    });
    Object.keys(BACKING_TRACKS).forEach(function (id) {
      var T = BACKING_TRACKS[id], o = document.createElement("option");
      o.value = "t:" + id; o.textContent = T.title + " — " + T.artist + " (instrumental · record vocals)";
      ps.appendChild(o);
    });
    songStore.songs.forEach(function (x) {
      if (!x.beat) return;
      var o = document.createElement("option");
      o.value = "u:" + x.id; o.textContent = x.title + " — " + kitName(D.LEGACY[x.beat.kit] && !x.beat.fmt ? D.LEGACY[x.beat.kit].kit : x.beat.kit) + " " + x.beat.bpm + " (beat + lyrics)";
      ps.appendChild(o);
    });
    ps.value = keep && ps.querySelector('option[value="' + keep + '"]') ? keep : "";
    var cur = getSong(S.lyricSong);
    $("ly-del").hidden = !!(cur && cur.builtin);
    $("ly-reset").hidden = !(cur && cur.builtin && cur.edited);
    $("ly-attach").disabled = !!(cur && cur.builtin);
    $("ly-attach-wrap").classList.toggle("dim", !!(cur && cur.builtin));
    $("ly-loadbeat").hidden = !(cur && (cur.preset || cur.beat));
  }
  function setDirty(d) {
    ly.dirty = d;
    $("ly-dirty").textContent = d ? "● unsaved changes" : "";
  }
  function selectLyricSong(id, force) {
    if (!force && ly.dirty && id !== S.lyricSong && !confirm("Discard unsaved lyric changes?")) {
      $("ly-song").value = S.lyricSong; return false;
    }
    var song = getSong(id);
    if (!song) return false;
    S.lyricSong = id;
    $("ly-text").value = song.text;
    setDirty(false);
    refreshSongPickers();
    renderLyrics();
    saveSession();
    return true;
  }
  function renderLyrics() {
    var text = $("ly-text").value;
    ly.preview.render(text);
    if (ly.open) { ly.prompter.render(text); prForceScroll = true; }
    var song = getSong(S.lyricSong);
    $("pr-title").textContent = song ? song.title + (song.artist ? " — " + song.artist : "") : "Teleprompter";
    var items = ly.preview.items, n = items.filter(function (i) { return i.t === "l"; }).length;
    var secs = items.filter(function (i) { return i.t === "h"; }).length;
    var A = arrangement();
    var info = n + " lines · " + secs + " sections";
    if (S.bpl === "auto" && A) {
      info += secs === A.length ? " · synced to song form" : " · " + secs + " lyric sections vs " + A.length + " in the song form (extra lines use 1 bar each)";
    } else info += " · " + (S.bpl === "auto" ? "1" : S.bpl) + " bar(s) per line";
    $("ly-info").textContent = info;
  }
  function saveLyrics() {
    var song = getSong(S.lyricSong), text = $("ly-text").value;
    if (!song) return;
    if (song.builtin) {
      songStore.overrides[song.id] = text;
    } else {
      song.text = text; song.updated = Date.now();
      if ($("ly-attach").checked) song.beat = beatSnapshot();
    }
    if (saveSongStore()) { setDirty(false); refreshSongPickers(); toast("Saved “" + song.title + "”" + (!song.builtin && $("ly-attach").checked ? " with the current beat" : "")); }
  }
  function newSong(copyText) {
    var title = prompt(copyText ? "Save as — song title" : "New song title", copyText ? (getSong(S.lyricSong) || {}).title + " (copy)" : "");
    if (!title) return;
    title = title.trim().slice(0, 80);
    if (!title) return;
    var song = {
      id: "u_" + Date.now().toString(36),
      title: title, artist: "", updated: Date.now(),
      text: copyText ? $("ly-text").value : "[Intro]\n\n[Hook]\n\n[Verse 1]\n\n[Hook]\n"
    };
    if ($("ly-attach").checked) song.beat = beatSnapshot();
    songStore.songs.push(song);
    if (saveSongStore()) { selectLyricSong(song.id, true); toast("Created “" + title + "”"); }
  }
  function deleteSong() {
    var song = getSong(S.lyricSong);
    if (!song || song.builtin) return;
    if (!confirm("Delete “" + song.title + "” from this browser?")) return;
    songStore.songs = songStore.songs.filter(function (x) { return x.id !== song.id; });
    saveSongStore();
    selectLyricSong(BUILTIN_SONGS[0].id, true);
  }
  function resetBuiltin() {
    var song = getSong(S.lyricSong);
    if (!song || !song.builtin) return;
    if (!confirm("Restore the original lyrics for “" + song.title + "”? Your edits will be lost.")) return;
    delete songStore.overrides[song.id];
    saveSongStore();
    selectLyricSong(song.id, true);
  }

  /* ---------------- Teleprompter overlay ---------------- */
  function openPrompter() {
    ly.open = true;
    var el = $("prompter");
    el.hidden = false;
    document.body.classList.add("pr-lock");
    syncPrompterControls();
    ly.prompter.render($("ly-text").value);
    renderTimelines();
    prForceScroll = true;
    updatePlayButtons();
  }
  function closePrompter() {
    ly.open = false;
    $("prompter").hidden = true;
    document.body.classList.remove("pr-lock");
    if (document.fullscreenElement) { try { document.exitFullscreen(); } catch (e) { /* ignore */ } }
  }
  function syncPrompterControls() {
    var sel = $("pr-bpl"), A = arrangement();
    sel.querySelector('option[value="auto"]').disabled = !A;
    sel.querySelector('option[value="auto"]').textContent = A ? "Auto (fit song form)" : "Auto (needs song form)";
    sel.value = S.bpl === "auto" && !A ? "1" : S.bpl;
    $("pr-size").value = S.prSize;
    $("prompter").style.setProperty("--pr-scale", S.prSize);
  }


  /* ---------------- Section editing: UI ---------------- */
  function dropAllSecStrips() { if (LG) Object.keys(LG.sstrips).forEach(function (j) { dropSecStrips(+j); }); Object.keys(LG ? LG.lstrips : {}).forEach(function (k) { if (/^s\d+:/.test(k)) { try { LG.lstrips[k].out.disconnect(); } catch (e) { /* ignore */ } delete LG.lstrips[k]; } }); }
  function secRefreshUI() {
    bindSlot(); S.page = 0;
    refreshPads(); buildSeq(); feelUI(); renderChordLoopUI();
    if (pianoEd) pianoUI(true, true);
    if (lyT) lyRefresh();
    if (LG && ctx) for (var i = 0; i < 16; i++) stripApply(LG, i, ctx.currentTime);
    document.body.classList.toggle("sec-editing", edSec >= 0);
    renderTimelines();
    libSync();
  }
  function selectSec(i) {
    var A = arrangement();
    if (!A || i < 0 || i >= A.length) { leaveEdit(); return; }
    if (i === edSec) return;
    leaveEdit(true);
    var m = secMap(true);
    useCtx(-1);
    materialize(m[i] || (m[i] = {}));
    edSec = i; useCtx(i);
    secRefreshUI();
    saveSession();
  }
  function leaveEdit(quiet) {
    if (edSec === -1) return;
    var i = edSec;
    edSec = -1; useCtx(-1);
    var m = secMap(false);
    if (m && m[i]) { pruneOv(m[i], i); if (ovEmpty(m[i])) delete m[i]; }
    dropSecStrips(i);
    if (!quiet) { secRefreshUI(); saveSession(); }
  }
  function secReset() {
    if (edSec < 0) return;
    var i = edSec;
    useCtx(-1);
    secMap(true)[i] = materialize({});
    dropSecStrips(i);
    useCtx(i);
    secRefreshUI(); saveSession();
    toast(secLabel(i) + " is the same as the whole song again.");
  }
  function secPlural(n) { return /s$/i.test(n) ? n : n + "s"; }
  function secCopyToSame() {
    var A = arrangement();
    if (!A || edSec < 0) return;
    var i = edSec, name = A[i].name, n = 0;
    useCtx(-1);
    var src = pruneOv(deep(ovAt(i)) || {}, i), m = secMap(true);
    A.forEach(function (s, j) {
      if (j === i || s.name !== name) return;
      if (ovEmpty(src)) delete m[j]; else m[j] = deep(src);
      dropSecStrips(j); n++;
    });
    useCtx(i);
    renderTimelines(); saveSession();
    toast(n ? "Copied " + secLabel(i) + " to the other " + n + " " + secPlural(name) + "." : "There is only one " + name + ".");
  }
  function secSetVol(db) {
    var o = ovAt(edSec); if (!o) return;
    o.vol = clamp(+db || 0, -24, 6);
    if (LG && ctx && playing && stepInfo(Math.floor(currentPosK())).secIdx === edSec) LG.secG.gain.setTargetAtTime(dbGain(o.vol), ctx.currentTime, 0.02);
    secPanelUI(); clearTimeout(lySaveT); lySaveT = setTimeout(saveSession, 250);
  }
  var secMarkT = null;
  function secMarks() { clearTimeout(secMarkT); secMarkT = setTimeout(function () { var el = $("timeline"); if (!el) return; el.querySelectorAll(".tl-seg").forEach(function (b) { b.classList.toggle("ov", secChanged(+b.dataset.i)); }); secPanelUI(); }, 120); }
  function secPanelUI() {
    var box = $("sec-edit"), A = arrangement();
    if (!box) return;
    box.hidden = !A;
    var pill = $("sec-pill");
    if (pill) pill.hidden = !(A && edSec >= 0);
    if (!A) return;
    var on = edSec >= 0, o = ovAt(edSec), name = on ? A[edSec].name : "";
    box.classList.toggle("on", on);
    $("sec-chip").textContent = on ? "Editing: " + secLabel(edSec) : "Editing: Whole song";
    $("sec-whole").hidden = !on;
    $("sec-ctls").hidden = !on;
    var changed = 0; A.forEach(function (s, j) { if (secChanged(j)) changed++; });
    $("sec-hint").textContent = on ? "Pads, steps, Piano Roll, keys loop, Feel, mute / solo and layer knobs now change only " + secLabel(edSec) + ". Tempo, swing, kit and the Mixer stay song-wide."
      : "Tap a section above to change only that part" + (changed ? " · " + changed + " section" + (changed > 1 ? "s have" : " has") + " its own changes (dot)" : "") + ".";
    if (pill) $("sec-pill-name").textContent = on ? secLabel(edSec) : "";
    if (!on || !o) return;
    var en = $("sec-energy"), def = secDefFeel(edSec);
    if (!en.options.length) Object.keys(SEC_ENERGY).forEach(function (k) { var op = document.createElement("option"); op.value = k; en.appendChild(op); });
    Array.prototype.forEach.call(en.options, function (op) { op.textContent = SEC_ENERGY[op.value] + (op.value === def ? " (song form)" : ""); });
    en.value = o.energy || def;
    $("sec-vol").value = o.vol || 0;
    $("sec-vol-val").textContent = (o.vol > 0 ? "+" : "") + (+(o.vol || 0)).toFixed(1) + " dB";
    $("sec-keys").checked = o.keys !== false;
    $("sec-chords").checked = !!S.chordTrack.on;
    var same = A.filter(function (s) { return s.name === name; }).length;
    var cp = $("sec-copy"); cp.hidden = same < 2; cp.textContent = "Copy to all " + secPlural(name);
  }
  function secWire() {
    $("sec-whole").addEventListener("click", function () { leaveEdit(); });
    $("sec-pill-x").addEventListener("click", function () { leaveEdit(); });
    $("sec-pill-name").addEventListener("click", function () { var t = $("timeline"); if (t) t.scrollIntoView({ block: "center", behavior: "smooth" }); });
    $("sec-reset").addEventListener("click", secReset);
    $("sec-copy").addEventListener("click", secCopyToSame);
    $("sec-energy").addEventListener("change", function (e) {
      var o = ovAt(edSec); if (!o) return;
      o.energy = e.target.value;
      renderTimelines(); saveSession();
    });
    $("sec-vol").addEventListener("input", function (e) { secSetVol(e.target.value); });
    $("sec-keys").addEventListener("change", function (e) { var o = ovAt(edSec); if (!o) return; o.keys = e.target.checked; saveSession(); });
    $("sec-chords").addEventListener("change", function (e) {
      if (edSec < 0) return;
      S.chordTrack.on = e.target.checked;
      if (!S.chordTrack.on && ctx) cutChords(chordLive, ctx.currentTime);
      renderChordLoopUI(); saveSession();
    });
  }

  /* ---------------- Song structure timeline ---------------- */
  function renderTimelines() {
    document.querySelectorAll(".timeline").forEach(function (el) {
      var A = arrangement();
      el.hidden = !A;
      el.innerHTML = "";
      if (!A) return;
      var b = 0;
      A.forEach(function (sec, i) {
        var seg = document.createElement("button");
        seg.type = "button";
        var main = el.id === "timeline", fe = secFeel(i);
        seg.className = "tl-seg f-" + fe + (/hook/i.test(sec.name) ? " hook" : "") + (main && i === edSec ? " sel" : "") + (main && secChanged(i) ? " ov" : "");
        if (main) seg.setAttribute("aria-pressed", String(i === edSec));
        seg.style.flexGrow = sec.bars;
        seg.dataset.i = i;
        seg.innerHTML = "<b></b><small></small>";
        seg.querySelector("b").textContent = main ? secLabel(i) : sec.name;
        seg.querySelector("small").textContent = sec.bars + (fe === "half" ? " · ½-time" : fe === "sparse" ? " · sparse" : "");
        seg.title = secLabel(i) + " · " + sec.bars + " bars" + (fe === "half" ? " (half-time feel)" : fe === "sparse" ? " (no kick/snare/808)" : "") + (main ? " — tap to edit only this section (and cue it)" : " — tap to cue");
        var at = b;
        seg.addEventListener("click", function () { if (main) { if (vox.state !== "idle") { toast("Stop the vocal take first."); return; } selectSec(i); } cueTo(at); });
        el.appendChild(seg);
        b += sec.bars;
      });
      var head = document.createElement("i");
      head.className = "tl-head";
      el.appendChild(head);
    });
    secPanelUI();
    var ss = $("struct-sel");
    if (ss) ss.value = S.structure || "";
    var rl = $("rec-length"), so = rl.querySelector('option[value="song"]');
    so.disabled = !arrangement() && !btActive();
    if (so.disabled && rl.value === "song") rl.value = "30";
    var bb = $("bounce-bars").querySelector('option[value="song"]');
    bb.disabled = !arrangement();
    if (bb.disabled && $("bounce-bars").value === "song") $("bounce-bars").value = "4";
  }
  var lastPosLabel = "";
  function updatePositionUI(posK) {
    var A = arrangement(), bar = posK / STEPS;
    var info = stepInfo(Math.floor(posK));
    document.querySelectorAll(".timeline").forEach(function (el) {
      if (!A) return;
      var head = el.querySelector(".tl-head");
      if (head) head.style.left = clamp((bar / totalBars(A)) * 100, 0, 100) + "%";
      var segs = el.querySelectorAll(".tl-seg");
      for (var i = 0; i < segs.length; i++) segs[i].classList.toggle("now", i === info.secIdx);
    });
    var label = "Bar " + (Math.floor(bar) + 1) + (A ? " / " + totalBars(A) : "") + (info.sec ? " · " + info.sec.name : "") + " · " + fmtTime(bar * barSec());
    if (label !== lastPosLabel) {
      lastPosLabel = label;
      $("song-pos").textContent = label;
      $("pr-pos").textContent = label;
    }
    // chord loop highlight
    var ch = chordAt(info, false);
    var slots = document.querySelectorAll(".cl-slot");
    for (var s = 0; s < slots.length; s++) slots[s].classList.toggle("now", !!(playing && ch && ch.slot === s));
  }

  /* ---------------- Chord loop UI ---------------- */
  function renderChordLoopUI() {
    var CT = S.chordTrack;
    lyDots();
    $("cl-on").checked = !!CT.on;
    $("cl-bars").value = String(CT.bars);
    $("cl-sound").value = CT.sound;
    $("cl-bass").checked = !!CT.bassFollow;
    var wrap = $("cl-slots");
    wrap.innerHTML = "";
    for (var i = 0; i < 4; i++) {
      (function (i) {
        var sel = document.createElement("select");
        sel.className = "cl-slot";
        sel.setAttribute("aria-label", "Chord " + (i + 1));
        var o0 = document.createElement("option"); o0.value = "-1"; o0.textContent = "—"; sel.appendChild(o0);
        CHORDS.forEach(function (ch, ci) {
          var o = document.createElement("option"); o.value = ci; o.textContent = ch.n; sel.appendChild(o);
        });
        sel.value = String(CT.prog[i] != null ? CT.prog[i] : -1);
        sel.addEventListener("change", function () {
          S.chordTrack.prog[i] = +sel.value;
          saveSession();
        });
        wrap.appendChild(sel);
      })(i);
    }
    $("cl-wrap").classList.toggle("off", !CT.on);
  }

  /* ---------------- Song preset: beat + lyrics in one tap ---------------- */
  function patternHasNotes() { return slotHasNotes(curSlot()); }
  function applySongPreset(val) {
    if (!val) return;
    var kind = val.charAt(0), id = val.slice(2), beat = null, song = getSong(id), extra = null;
    if (kind === "t") return loadBacking(id);
    if (kind === "b") {
      var b = BUILTIN_SONGS.filter(function (x) { return x.id === id; })[0];
      extra = b && BEAT_PRESETS[b.preset];
      beat = extra || null;
    } else if (song) beat = song.beat;
    if (!beat || !song) { toast("That song has no beat attached."); return; }
    var conv = beatSlot(beat);
    var same = conv.kit === S.kit && JSON.stringify(conv.slot.pattern) === JSON.stringify(S.pattern);
    if (patternHasNotes() && !same && !window.__ipbPadNoConfirm && !confirm("Load “" + song.title + "”? This replaces the current pattern, BPM, chord loop and song form" + (beat.piano ? ", and the current piano-roll pattern" : "") + " (your swapped pad samples stay).")) {
      $("song-preset").value = ""; return;
    }
    if (vox.state !== "idle") stopVocalTake();
    stop();
    leaveEdit(true);
    if (btActive()) btEject(); // a drum-machine beat replaces the loaded instrumental
    S.kitSwing[S.kit] = S.swing;
    S.bpm = clamp(+beat.bpm || 140, 60, 200);
    S.swing = clamp(+beat.swing || 0, 0, 60);
    S.feel = FEEL.norm(beat.feel); feelUI();
    S.slots[S.slot] = conv.slot; pendingSlot = null; bindSlot(); S.page = 0;
    if (beat.songKey != null && isFinite(+beat.songKey)) { S.songKey = clamp(Math.round(+beat.songKey), 0, 11); klKeyUI(); }
    if (beat.piano) { S.piano.slots[S.piano.slot] = PD.normalize(beat.piano, instOk); pianoPending = null; pianoUI(true, true); } // older songs have no piano part: keep the current one
    (conv.tunes || []).forEach(function (t, i) { if (t) padCfg(i, conv.kit).tune = t; });
    if (Array.isArray(conv.pads)) { var pc = {}; pc[conv.kit] = conv.pads; S.padCfg[conv.kit] = cleanPadCfg(pc)[conv.kit]; }
    var ct = defaultChordTrack();
    if (beat.chords) Object.keys(ct).forEach(function (k) { if (beat.chords[k] != null) ct[k] = JSON.parse(JSON.stringify(beat.chords[k])); });
    ct.lx = LY.clean(ct.lx, "mel");
    S.chordTrack = ct;
    S.structure = beat.structure && STRUCTURES[beat.structure] ? beat.structure : null;
    if (S.structure) { S.secOv[S.structure] = secFromSnapshot(beat.sections); dropAllSecStrips(); } // songs before section editing: none
    S.cueBar = 0;
    if (S.structure) S.bpl = "auto";
    if (extra && extra.mixer) Object.keys(extra.mixer).forEach(function (k) { if (S.mixer[k]) S.mixer[k].v = extra.mixer[k]; });
    if (extra && extra.studio) { $("studio-title").value = extra.studio.title; $("studio-artist").value = extra.studio.artist; }
    else { $("studio-title").value = song.title; }
    $("bpm").value = S.bpm;
    buildMixer(); applyMixer();
    renderChordLoopUI();
    renderTimelines();
    if (S.structure) $("rec-length").value = "song"; // Record / Record Vocals cover the whole song by default
    if (song.id === S.lyricSong && ly.dirty) renderLyrics(); // keep the edits in progress
    else if (!ly.dirty || confirm("Discard unsaved lyric changes?")) selectLyricSong(song.id, true);
    var kitP;
    if (conv.kit !== S.kit) kitP = loadKit(conv.kit, true);
    else {
      S.kitSwing[S.kit] = S.swing;
      if (LG) graphKit(LG, ctx.currentTime);
      refreshKitUI(); refreshPads(); repaintSeq();
      kitP = Promise.resolve();
    }
    return kitP.then(function () {
      saveSession();
      var names = S.chordTrack.on ? S.chordTrack.prog.map(function (i) { return CHORDS[i] ? CHORDS[i].n : "—"; }).join("–") : "";
      toast("Loaded “" + song.title + "” — beat + lyrics · " + kitName(S.kit) + " " + S.bpm + " BPM" + (names ? " · " + names : ""));
    });
  }

  /* ---------------- Reference track (A/B + level match) ----------------
   * Monitor-only. Live graph:
   *   refSrc → refN.fader → refN.gate → ctx.destination      (reference, speakers only)
   *   master → masterAnalyser → beatMon → ctx.destination    (beat speaker feed, A/B gate)
   * ● Record / Record Vocals tap `master` (upstream of beatMon, never connected to the reference),
   * and Bounce / level-match renders use their own OfflineAudioContext, so the reference can
   * never end up in a recording, bounce or Vault file.
   */
  var REF_PREF_KEY = "ipb.reference.v1";
  var REF_MAX_BYTES = 250 * 1048576;
  var ref = {
    ready: false, loaded: false, fileTok: 0, name: "", type: "", size: 0, bytes: null,
    buf: null, playBuf: null, prep: null, dur: 0, peaks: null, bpm: null, lufs: null, peak: null,
    ab: "A", playing: false, src: null, srcLoop: false, t0: 0, off: 0, pos: 0, tok: 0, syncing: false,
    mixLufs: null, mixPeak: null, measuring: false, dirty: true, dragSel: null, lastLive: 0, pkHold: { mix: 0, ref: 0 }
  };
  var refPrefs = { key: "", gainDb: 0, beatTrim: 0, muted: false, sync: false, loop: false, a: 0, b: 0, cue: 0, collapsed: false, matched: null };
  var refN = null, refMixN = null;

  function dbToGain(db) { return Math.pow(10, db / 20); }
  function gainToDb(g) { return g > 0 ? 20 * Math.log10(g) : -Infinity; }
  function fmtDb(v, plus) {
    if (v == null || !isFinite(v)) return v === -Infinity ? "−∞" : "—";
    var s = Math.abs(v).toFixed(1);
    return (v < 0 && s !== "0.0" ? "−" : plus && v > 0 ? "+" : "") + s;
  }
  function refLoadPrefs() {
    try { var d = JSON.parse(localStorage.getItem(REF_PREF_KEY) || "null"); if (d) Object.keys(refPrefs).forEach(function (k) { if (d[k] !== undefined) refPrefs[k] = d[k]; }); } catch (e) { /* ignore */ }
  }
  function refSavePrefs() { try { localStorage.setItem(REF_PREF_KEY, JSON.stringify(refPrefs)); } catch (e) { /* ignore */ } }

  /* own tiny IndexedDB (separate database so the existing vault/pads DB is untouched) */
  var refDbP = null;
  function refIdb(mode, fn) {
    if (!refDbP) {
      refDbP = new Promise(function (res, rej) {
        if (!window.indexedDB) { rej(new Error("IndexedDB unavailable")); return; }
        var r = indexedDB.open("islandpinbeats-ref", 1);
        r.onupgradeneeded = function () { if (!r.result.objectStoreNames.contains("ref")) r.result.createObjectStore("ref", { keyPath: "id" }); };
        r.onsuccess = function () { res(r.result); };
        r.onerror = function () { rej(r.error); };
      });
    }
    return refDbP.then(function (d) {
      return new Promise(function (res, rej) {
        var tx = d.transaction("ref", mode), req = fn(tx.objectStore("ref"));
        tx.oncomplete = function () { res(req ? req.result : undefined); };
        tx.onerror = function () { rej(tx.error); };
        tx.onabort = function () { rej(tx.error); };
      });
    });
  }

  /* ---- loudness: ITU-R BS.1770-style K-weighting (coefficients for any sample rate, as in libebur128) ---- */
  function kCoeffs(sr) {
    var f0 = 1681.974450955533, G = 3.999843853973347, Q = 0.7071752369554196;
    var K = Math.tan(Math.PI * f0 / sr), Vh = Math.pow(10, G / 20), Vb = Math.pow(Vh, 0.4996667741545416);
    var a0 = 1 + K / Q + K * K;
    var shelf = { b: [(Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0], a: [1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0] };
    f0 = 38.13547087602444; Q = 0.5003270373238773;
    K = Math.tan(Math.PI * f0 / sr);
    var d = 1 + K / Q + K * K;
    var hp = { b: [1, -2, 1], a: [1, 2 * (K * K - 1) / d, (1 - K / Q + K * K) / d] };
    return { shelf: shelf, hp: hp };
  }
  /* integrated loudness (400 ms blocks, 75 % overlap, −70 LUFS absolute + −10 LU relative gate) and sample peak */
  function measureLoudness(chs, sr) {
    var k = kCoeffs(sr), sub = Math.round(sr * 0.1), n = chs[0].length, nSub = Math.floor(n / sub);
    var ms = new Float64Array(Math.max(1, nSub)), peak = 0;
    var sb0 = k.shelf.b[0], sb1 = k.shelf.b[1], sb2 = k.shelf.b[2], sa1 = k.shelf.a[1], sa2 = k.shelf.a[2];
    var hb0 = k.hp.b[0], hb1 = k.hp.b[1], hb2 = k.hp.b[2], ha1 = k.hp.a[1], ha2 = k.hp.a[2];
    for (var c = 0; c < chs.length; c++) {
      var x = chs[c], x1 = 0, x2 = 0, y1 = 0, y2 = 0, z1 = 0, z2 = 0, acc = 0, cnt = 0, si = 0;
      for (var i = 0; i < n; i++) {
        var xi = x[i], ab = xi < 0 ? -xi : xi;
        if (ab > peak) peak = ab;
        var yi = sb0 * xi + sb1 * x1 + sb2 * x2 - sa1 * y1 - sa2 * y2;
        x2 = x1; x1 = xi;
        var zi = hb0 * yi + hb1 * y1 + hb2 * y2 - ha1 * z1 - ha2 * z2;
        y2 = y1; y1 = yi; z2 = z1; z1 = zi;
        acc += zi * zi;
        if (++cnt === sub) { if (si < nSub) ms[si] += acc / sub; si++; acc = 0; cnt = 0; }
      }
    }
    var L = function (z) { return -0.691 + 10 * Math.log10(z); };
    var blocks = [];
    for (var j = 0; j + 4 <= nSub; j++) blocks.push((ms[j] + ms[j + 1] + ms[j + 2] + ms[j + 3]) / 4);
    var abs = blocks.filter(function (z) { return z > 0 && L(z) > -70; });
    var lufs = -Infinity;
    if (abs.length) {
      var rel = L(abs.reduce(function (a, b) { return a + b; }, 0) / abs.length) - 10;
      var gated = abs.filter(function (z) { return L(z) > rel; });
      if (gated.length) lufs = L(gated.reduce(function (a, b) { return a + b; }, 0) / gated.length);
    }
    return { lufs: lufs, peak: peak };
  }
  function bufChannels(b) { // mono plays as dual-mono (L = R), so measure it that way
    var c0 = b.getChannelData(0);
    return [c0, b.numberOfChannels > 1 ? b.getChannelData(1) : c0];
  }

  /* ---- tempo estimate ----
   * Per-band (low / mid / high) spectral-flux onsets → summed autocorrelation → metrical comb
   * (½, 1, 2, 4, 8 × period), folded into 80–160 BPM. Only reported when the pulse is clear
   * (prominence, peaky onsets, no strong non-octave rival such as 2/3 or 3/4) and 15 s segments agree;
   * otherwise nothing is shown — never a guess.
   */
  function refTempoStats(c0, c1, sr) {
    var n = c0.length;
    if (n / sr < 10) return null;
    var ds = Math.max(1, Math.round(sr / 11025)), dsr = sr / ds, m = Math.floor(n / ds);
    var x = new Float32Array(m);
    for (var i = 0, o = 0; i < m; i++) { var s = 0; for (var j = 0; j < ds; j++, o++) s += c0[o] + c1[o]; x[i] = s / (2 * ds); }
    var N = 512, hop = 128, fps = dsr / hop, nf = Math.floor((m - N) / hop);
    if (nf < 400) return null;
    var win = new Float32Array(N); for (i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
    var re = new Float64Array(N), im = new Float64Array(N), prev = new Float32Array(N / 2), cur = new Float32Array(N / 2);
    var rev = new Uint16Array(N); for (i = 0; i < N; i++) { var r = 0; for (var b = 1, k = i; b < N; b <<= 1, k >>= 1) r = (r << 1) | (k & 1); rev[i] = r; }
    var cosT = new Float64Array(N / 2), sinT = new Float64Array(N / 2);
    for (i = 0; i < N / 2; i++) { cosT[i] = Math.cos(2 * Math.PI * i / N); sinT[i] = -Math.sin(2 * Math.PI * i / N); }
    var binHz = dsr / N, edges = [1, Math.round(200 / binHz), Math.round(2000 / binHz), N / 2], NB = 3, BW = [2, 1, 0.5];
    var env = [new Float32Array(nf), new Float32Array(nf), new Float32Array(nf)];
    for (var f = 0; f < nf; f++) {
      var base = f * hop;
      for (i = 0; i < N; i++) { re[rev[i]] = x[base + i] * win[i]; im[rev[i]] = 0; }
      for (var size = 2; size <= N; size <<= 1) {
        var half = size >> 1, step = N / size;
        for (var st = 0; st < N; st += size) for (k = 0; k < half; k++) {
          var tr = cosT[k * step], ti = sinT[k * step], a = st + k, bb = a + half;
          var xr = re[bb] * tr - im[bb] * ti, xi = re[bb] * ti + im[bb] * tr;
          re[bb] = re[a] - xr; im[bb] = im[a] - xi; re[a] += xr; im[a] += xi;
        }
      }
      for (k = 1; k < N / 2; k++) cur[k] = Math.log(1 + 100 * Math.sqrt(re[k] * re[k] + im[k] * im[k]));
      for (var bd = 0; bd < NB; bd++) {
        var fl = 0;
        if (f) for (k = edges[bd]; k < edges[bd + 1]; k++) { var d = cur[k] - prev[k]; if (d > 0) fl += d; }
        env[bd][f] = fl;
      }
      var t = prev; prev = cur; cur = t;
    }
    // per band: remove the local mean (~0.5 s), half-wave rectify, normalise to unit RMS
    var w = Math.max(1, Math.round(fps * 0.25)), on = [], peaky = [];
    for (bd = 0; bd < NB; bd++) {
      var e = env[bd], cs = new Float64Array(nf + 1), ob = new Float32Array(nf), ss = 0;
      for (i = 0; i < nf; i++) cs[i + 1] = cs[i] + e[i];
      for (i = 0; i < nf; i++) { var lo = Math.max(0, i - w), hi = Math.min(nf, i + w + 1); ob[i] = Math.max(0, e[i] - (cs[hi] - cs[lo]) / (hi - lo)); ss += ob[i] * ob[i]; }
      // light smoothing (≈±2 frames) so onsets that fall between frames still line up in the autocorrelation
      var sm = new Float32Array(nf), K = [0.06, 0.24, 0.4, 0.24, 0.06]; ss = 0;
      for (i = 0; i < nf; i++) { var acc = 0; for (var kk = -2; kk <= 2; kk++) { var ii = i + kk; if (ii >= 0 && ii < nf) acc += K[kk + 2] * ob[ii]; } sm[i] = acc; ss += acc * acc; }
      // peakiness of this band's onsets (drums: sharp spikes; noise / sustained tones: flat)
      var srt = Array.prototype.slice.call(sm).sort(function (p, q) { return p - q; });
      peaky.push((srt[Math.floor(nf * 0.98)] + 1e-9) / (srt[Math.floor(nf * 0.5)] + 1e-3 * srt[Math.floor(nf * 0.98)] + 1e-9));
      var rms = Math.sqrt(ss / nf) || 1;
      for (i = 0; i < nf; i++) sm[i] /= rms;
      on.push(sm);
    }
    var minL = fps * 60 / 160, maxL = fps * 60 / 80, H = 8;
    function tempoOf(s, e) {
      var maxLag = Math.min(Math.ceil(maxL * H) + 2, Math.floor((e - s) / 2));
      if (maxLag < maxL * 4 + 2) return null;
      var ac = new Float64Array(maxLag + 2);
      for (var bd2 = 0; bd2 < NB; bd2++) {
        var ob2 = on[bd2], wt = BW[bd2];
        for (var lag = 0; lag <= maxLag; lag++) { var sum = 0; for (var q = s; q + lag < e; q++) sum += ob2[q] * ob2[q + lag]; ac[lag] += wt * sum / (e - s - lag); }
      }
      var acAt = function (v) { var i0 = Math.floor(v), fr = v - i0; return i0 + 1 > maxLag ? 0 : ac[i0] * (1 - fr) + ac[i0 + 1] * fr; };
      var useH8 = 8 * maxL + 1 < maxLag;
      var score = function (L) { return 0.5 * acAt(L / 2) + acAt(L) + acAt(2 * L) + acAt(4 * L) + (useH8 ? acAt(8 * L) : 0); };
      var best = -1, bestL = 0, vals = [];
      for (var L = minL; L <= maxL; L += 0.1) { var v = score(L); vals.push(v); if (v > best) { best = v; bestL = L; } }
      var mean = vals.reduce(function (a, c) { return a + c; }, 0) / vals.length;
      var sd = Math.sqrt(vals.reduce(function (a, c) { return a + (c - mean) * (c - mean); }, 0) / vals.length) || 1e-12;
      var rival = mean;
      for (L = minL; L <= maxL; L += 0.1) {
        var ratio = L / bestL, oct = Math.abs(Math.log(ratio) / Math.LN2 - Math.round(Math.log(ratio) / Math.LN2));
        if (Math.abs(ratio - 1) < 0.04 || oct < 0.03) continue;
        var vv = score(L); if (vv > rival) rival = vv;
      }
      // precision: locate the autocorrelation peak near the longest usable multiple of the period
      var mult = Math.floor((maxLag - 2) / bestL); mult = mult >= 8 ? 8 : mult >= 4 ? 4 : mult >= 2 ? 2 : 1;
      var c = Math.round(bestL * mult), pk = c, rng = Math.max(2, Math.round(mult * 0.6));
      for (var z = c - rng; z <= c + rng; z++) if (z > 0 && z < maxLag && ac[z] > ac[pk]) pk = z;
      var y0 = ac[pk - 1], y1 = ac[pk], y2 = ac[pk + 1], den = y0 - 2 * y1 + y2, off = den < 0 ? 0.5 * (y0 - y2) / den : 0;
      var fine = (pk + clampF(off, -0.5, 0.5)) / mult;
      if (Math.abs(fine - bestL) / bestL > 0.02) fine = bestL;
      return { bpm: 60 * fps / fine, prom: (best - mean) / sd, margin: (best - mean) / Math.max(1e-12, rival - mean), nac: acAt(bestL) / ac[0] };
    }
    function clampF(v, a, b) { return Math.max(a, Math.min(b, v)); }
    var all = tempoOf(0, nf);
    if (!all) return null;
    var segLen = Math.round(fps * 15), segs = [];
    if (nf >= segLen * 2) {
      var count = Math.min(6, Math.floor(nf / segLen)), stepF = (nf - segLen) / Math.max(1, count - 1);
      for (var si = 0; si < count; si++) { var s0 = Math.round(si * stepF), rr = tempoOf(s0, s0 + segLen); if (rr) segs.push(rr); }
    }
    var agree = segs.length ? segs.filter(function (q) { return Math.abs(q.bpm - all.bpm) / all.bpm < 0.02; }).length / segs.length : 0;
    return { bpm: all.bpm, prom: all.prom, margin: all.margin, nac: all.nac, agree: agree, segs: segs.length, peaky: Math.max.apply(null, peaky) };
  }
  function refEstimateBpm(b) {
    var ch = bufChannels(b), r = refTempoStats(ch[0], ch[1], b.sampleRate);
    if (!r || !isFinite(r.bpm)) return null;
    var ok = r.prom >= 3.6 && r.margin >= 1.1 && r.peaky >= 10;
    if (r.segs >= 2) ok = ok && r.agree >= 0.6;
    else ok = ok && r.prom >= 4 && r.margin >= 1.15;
    if (!ok) return null;
    var bpm = Math.round(r.bpm);
    return { bpm: bpm, alt: bpm >= 120 ? Math.round(bpm / 2) : Math.round(bpm * 2) };
  }

  /* ---- decode / install ---- */
  function refDecodeOffline(ab) {
    return new Promise(function (res, rej) {
      var c = new OfflineAudioContext(2, 1, ctx ? ctx.sampleRate : SR);
      var done = false;
      var p = c.decodeAudioData(ab, function (b) { done = true; res(b); }, function (err) { if (!done) rej(err || new Error("decode")); });
      if (p && p.catch) p.catch(function (err) { if (!done) rej(err || new Error("decode")); });
    });
  }
  function refComputePeaks(b) {
    var cols = 1600, ch = bufChannels(b), n = b.length, per = Math.max(1, Math.floor(n / cols));
    var mins = new Float32Array(cols), maxs = new Float32Array(cols);
    var stride = Math.max(1, Math.floor(per / 256));
    for (var c = 0; c < cols; c++) {
      var lo = 0, hi = 0, s = c * per, e = Math.min(n, s + per);
      for (var i = s; i < e; i += stride) { var v = (ch[0][i] + ch[1][i]) * 0.5; if (v < lo) lo = v; if (v > hi) hi = v; }
      mins[c] = lo; maxs[c] = hi;
    }
    return { mins: mins, maxs: maxs, cols: cols };
  }
  function refInstall(meta, buf) {
    refStopSrc(); ref.playing = false; ref.syncing = false;
    ref.fileTok++;
    ref.loaded = true; refSinkSync(); ref.name = meta.name; ref.type = meta.type || ""; ref.size = meta.size || 0; ref.bytes = meta.bytes;
    ref.buf = buf; ref.playBuf = null; ref.prep = null; ref.dur = buf.duration;
    ref.peaks = refComputePeaks(buf); ref.bpm = null; ref.lufs = null; ref.peak = null; ref.pos = 0;
    var key = meta.name + "|" + meta.size;
    if (refPrefs.key !== key) {
      refPrefs.key = key; refPrefs.gainDb = 0; refPrefs.beatTrim = 0; refPrefs.muted = false; refPrefs.loop = false;
      refPrefs.a = 0; refPrefs.b = 0; refPrefs.cue = 0; refPrefs.matched = null; refSavePrefs();
    }
    if (refPrefs.b > ref.dur) { refPrefs.a = 0; refPrefs.b = 0; refPrefs.loop = false; }
    if (refPrefs.cue > ref.dur) refPrefs.cue = 0;
    ref.pos = refPrefs.cue;
    var tok = ref.fileTok;
    setTimeout(function () { // analysis after first paint
      if (tok !== ref.fileTok || !ref.buf) return;
      var m = measureLoudness(bufChannels(ref.buf), ref.buf.sampleRate);
      ref.lufs = m.lufs; ref.peak = m.peak;
      ref.analysed = true;
      refUI();
      setTimeout(function () { // tempo in a separate task so the UI can paint in between
        if (tok !== ref.fileTok || !ref.buf) return;
        try { ref.bpm = refEstimateBpm(ref.buf); } catch (e) { ref.bpm = null; }
        ref.bpmDone = true;
        refUI();
        refPreparePlayBuf();
      }, 16);
    }, 30);
    ref.bpmDone = false;
    ref.analysed = false;
    refApplyGates(); ref.dirty = true; refUI();
  }
  /* play at the device rate: re-decode with the live context (its resampler) instead of resampling on the fly */
  function refPreparePlayBuf() {
    if (!ctx || !ref.loaded || !ref.bpmDone) return;
    if (ref.playBuf || ref.prep) return;
    if (ref.buf.sampleRate === ctx.sampleRate || !ref.bytes) { ref.playBuf = ref.buf; return; }
    var tok = ref.fileTok;
    ref.prep = new Promise(function (res) {
      var done = false;
      var p = ctx.decodeAudioData(ref.bytes.slice(0), function (b) { done = true; res(b); }, function () { if (!done) res(null); });
      if (p && p.catch) p.catch(function () { if (!done) res(null); });
    }).then(function (b) {
      ref.prep = null;
      if (tok !== ref.fileTok) return;
      ref.playBuf = b || ref.buf;
      if (b) { ref.buf = b; ref.bytes = null; } // keep one decoded copy in memory (the file itself stays in IndexedDB)
    });
  }
  function refLoadFile(file) {
    if (!file) return;
    if (file.size > REF_MAX_BYTES) { toast("That file is too big (max 250 MB)."); return; }
    if (file.type && !/^audio\//.test(file.type) && !/\.(mp3|wav|m4a|aac|mp4|ogg|oga|opus|flac|webm|aiff?)$/i.test(file.name)) {
      toast("Please choose an audio file (MP3, WAV, M4A/AAC, OGG, FLAC).");
      return;
    }
    refSetNames("Decoding " + file.name + "…");
    file.arrayBuffer().then(function (ab) {
      return refDecodeOffline(ab.slice(0)).then(function (buf) {
        refInstall({ name: file.name, type: file.type, size: file.size, bytes: ab }, buf);
        toast("Reference loaded: " + file.name);
        return refIdb("readwrite", function (st) {
          return st.put({ id: "current", name: file.name, type: file.type, size: file.size, added: Date.now(), data: ab });
        }).catch(function () { toast("Reference loaded for this session only (browser storage full or blocked)."); });
      }, function () {
        refUI();
        toast("This browser can't decode “" + file.name + "”. Try MP3 or WAV.");
      });
    }).catch(function () { refUI(); toast("Could not read that file."); });
  }
  function refLoadStored() {
    return refIdb("readonly", function (st) { return st.get("current"); }).then(function (row) {
      if (!row || !row.data) return;
      return refDecodeOffline(row.data.slice(0)).then(function (buf) {
        refInstall({ name: row.name, type: row.type, size: row.size, bytes: row.data }, buf);
      });
    }).catch(function () { /* nothing stored / storage blocked / undecodable */ });
  }
  function refRemove() {
    if (!ref.loaded) return;
    if (!confirm("Remove the reference track from this browser?")) return;
    refStopSrc();
    ref.fileTok++;
    ref.loaded = false; refSinkSync(); ref.playing = false; ref.syncing = false; ref.buf = ref.playBuf = ref.bytes = null; ref.peaks = null;
    ref.bpm = null; ref.lufs = ref.peak = null; ref.ab = "A"; ref.pos = 0; ref.name = "";
    refPrefs.key = ""; refPrefs.gainDb = 0; refPrefs.beatTrim = 0; refPrefs.muted = false; refPrefs.loop = false; refPrefs.a = refPrefs.b = refPrefs.cue = 0; refPrefs.matched = null;
    refSavePrefs();
    refIdb("readwrite", function (st) { return st.delete("current"); }).catch(function () {});
    refApplyGates(); ref.dirty = true; refUI();
    toast("Reference removed");
  }

  /* ---- audio nodes ---- */
  function refMeterChain(input, sink) {
    var up = ctx.createGain(); // force stereo so mono sources measure as dual-mono (like the WAV exports)
    up.channelCount = 2; up.channelCountMode = "explicit"; up.channelInterpretation = "speakers";
    input.connect(up);
    var k = kCoeffs(ctx.sampleRate), f1, f2;
    try {
      f1 = ctx.createIIRFilter(k.shelf.b, k.shelf.a);
      f2 = ctx.createIIRFilter(k.hp.b, k.hp.a);
    } catch (e) {
      f1 = ctx.createBiquadFilter(); f1.type = "highshelf"; f1.frequency.value = 1682; f1.gain.value = 4;
      f2 = ctx.createBiquadFilter(); f2.type = "highpass"; f2.frequency.value = 38; f2.Q.value = -6;
    }
    up.connect(f1); f1.connect(f2);
    var mk = function (fft) { var a = ctx.createAnalyser(); a.fftSize = fft; a.smoothingTimeConstant = 0; a.connect(sink); return a; };
    var o = { kL: mk(32768), kR: mk(32768), pL: mk(2048), pR: mk(2048), spec: mk(4096) };
    o.spec.smoothingTimeConstant = 0.82;
    var ks = ctx.createChannelSplitter(2), ps = ctx.createChannelSplitter(2);
    f2.connect(ks); up.connect(ps);
    ks.connect(o.kL, 0); ks.connect(o.kR, 1);
    ps.connect(o.pL, 0); ps.connect(o.pR, 1);
    up.connect(o.spec);
    return o;
  }
  function refOnCtx() {
    if (refN || !ctx || !master) return;
    var sink = ctx.createGain(); sink.gain.value = 0; // keeps analysers pulled, inaudible — only while a reference is loaded (refSinkSync)
    refN = { fader: ctx.createGain(), gate: ctx.createGain(), outRef: ctx.createAnalyser(), outBeat: ctx.createAnalyser() };
    refN.gate.gain.value = 0;
    refN.fader.connect(refN.gate);
    refN.gate.connect(ctx.destination);
    refN.sink = sink; refSinkSync(); // the K-weighted meter chains are built the first time a reference is loaded (IIR filters are slow to create)
    // post-gate taps: what actually reaches the speakers from each side
    refN.outRef.fftSize = 2048; refN.outBeat.fftSize = 2048;
    refN.gate.connect(refN.outRef); refN.outRef.connect(sink);
    beatMon.connect(refN.outBeat); refN.outBeat.connect(sink);
    refApplyGates();
    refPreparePlayBuf();
  }
  function refLocked() { return vox.state !== "idle"; }
  function refApplyGates() {
    if (refLocked() && ref.ab === "B") ref.ab = "A";
    var bOn = ref.ab === "B" && ref.loaded;
    if (!ctx || !beatMon) return;
    var t = ctx.currentTime;
    // A side: optional monitor-only trim from Level match (speakers only; recordings tap `master` before this)
    beatMon.gain.setTargetAtTime(bOn ? 0 : ref.loaded ? dbToGain(refPrefs.beatTrim || 0) : 1, t, 0.008);
    if (refN) {
      refN.gate.gain.setTargetAtTime(bOn ? 1 : 0, t, 0.008);
      refN.fader.gain.setTargetAtTime(refPrefs.muted ? 0 : dbToGain(refPrefs.gainDb), t, 0.01);
    }
  }
  function refVoxChanged() {
    if (!ref.ready) return;
    if (refLocked()) {
      if (ref.playing) refPause();
      if (ref.ab === "B") { refApplyGates(); toast("Record Vocals: monitoring your beat (reference off)"); }
    }
    refApplyGates(); refUI();
  }

  /* ---- transport ---- */
  function refRegion() {
    return refPrefs.loop && refPrefs.b - refPrefs.a >= 0.05 ? { a: refPrefs.a, b: refPrefs.b } : null;
  }
  function refPos() {
    if (!ref.playing || !ctx) return ref.pos;
    var p = ref.off + Math.max(0, ctx.currentTime - ref.t0);
    var r = refRegion();
    if (ref.srcLoop && r && p >= r.b) p = r.a + ((p - r.a) % (r.b - r.a));
    return Math.min(p, ref.dur);
  }
  function refStopSrc() {
    if (!ref.src) return;
    ref.tok++;
    try { ref.src.stop(); } catch (e) { /* not started */ }
    try { ref.src.disconnect(); } catch (e) { /* ignore */ }
    ref.src = null;
  }
  function refStart(offset, when) {
    if (!ref.loaded || !ensureCtx() || !refN) return;
    if (refLocked()) { toast("The reference is off while recording vocals."); return; }
    refStopSrc();
    var b = ref.playBuf || ref.buf;
    if (!b) return;
    var r = refRegion();
    offset = clamp(offset || 0, 0, ref.dur);
    if (r && (offset < r.a || offset >= r.b)) offset = r.a;
    if (!r && offset >= ref.dur - 0.02) offset = 0;
    var s = ctx.createBufferSource();
    s.buffer = b;
    if (r) { s.loop = true; s.loopStart = r.a; s.loopEnd = r.b; }
    s.connect(refN.fader);
    when = Math.max(when || 0, ctx.currentTime);
    s.start(when, offset);
    var tok = ++ref.tok;
    s.onended = function () {
      if (tok !== ref.tok) return;
      ref.src = null; ref.playing = false; ref.syncing = false; ref.pos = 0; ref.dirty = true; refUI();
    };
    ref.src = s; ref.srcLoop = !!r; ref.playing = true; ref.t0 = when; ref.off = offset; ref.dirty = true;
    refUI();
  }
  function refPause() {
    if (!ref.playing) return;
    ref.pos = refPos(); refStopSrc(); ref.playing = false; ref.syncing = false; ref.dirty = true; refUI();
  }
  function refTogglePlay() {
    if (!ref.loaded) return;
    if (ref.playing) refPause(); else { ref.syncing = false; refStart(ref.pos); }
  }
  function refCuePoint() { var r = refRegion(); return r ? r.a : refPrefs.cue; }
  function refSeek(t) {
    t = clamp(t, 0, ref.dur);
    refPrefs.cue = t; refSavePrefs();
    if (ref.playing) refStart(t); else ref.pos = t;
    ref.dirty = true; refUI();
  }
  function refRestartIfPlaying() { if (ref.playing) refStart(refPos(), 0); ref.dirty = true; }
  function refOnBeatPlay(t) {
    if (!ref.loaded || !refPrefs.sync || refLocked() || !refN) return;
    refStart(refCuePoint(), t);
    ref.syncing = true;
  }
  function refOnBeatStop() {
    if (!ref.syncing) return;
    ref.syncing = false;
    refStopSrc(); ref.playing = false;
    ref.pos = refCuePoint(); ref.dirty = true; refUI();
  }
  function refSetAB(v) {
    if (!ref.loaded) { ref.ab = "A"; toast("Load a reference track first (Beats tab → Reference track)."); refUI(); return; }
    if (v === "B" && refLocked()) { toast("A/B stays on your beat while recording vocals."); return; }
    ref.ab = v;
    if (v === "B" && !ref.playing) { ref.syncing = false; refStart(ref.pos); } // B needs the reference running
    ensureCtx();
    refApplyGates(); refUI();
  }
  function refToggleAB() { refSetAB(ref.ab === "B" ? "A" : "B"); }

  /* ---- level match: offline render of the loop (same engine as Bounce, nothing saved) ---- */
  function refRenderMix(bars) { return pianoSamplesLoad().then(function () { return refRenderMixNow(bars); }); }
  function refRenderMixNow(bars) {
    var sd = stepDur(), total = bars * STEPS, dur = total * sd + 0.5;
    var c = new OfflineAudioContext(2, Math.ceil(SR * dur), SR);
    var G = makeGraph(c, false);
    G.out.connect(c.destination);
    var reg = [], creg = [];
    for (var k = 0; k < total; k++) scheduleStep(c, G, loopInfo(k), k * sd, reg, creg, k === 0);
    cutChords(creg, total * sd);
    return c.startRendering();
  }
  function refLevelMatch() {
    if (!ref.loaded || ref.measuring) return;
    if (!ref.analysed) { toast("Still analysing the reference — try again in a moment."); return; }
    if (!isFinite(ref.lufs)) { refStatus("The reference is silent — nothing to match."); return; }
    if (!patternHasNotes() && !S.chordTrack.on) { refStatus("Your beat is empty — add some steps first."); return; }
    ref.measuring = true; refUI();
    refStatus("Measuring your mix (8-bar render)…");
    refRenderMix(8).then(function (b) {
      var m = measureLoudness([b.getChannelData(0), b.getChannelData(1)], b.sampleRate);
      ref.measuring = false;
      ref.mixLufs = m.lufs; ref.mixPeak = m.peak;
      if (!isFinite(m.lufs)) { refStatus("Your mix measured silent (muted channels?) — nothing to match."); refUI(); return; }
      // turn the louder side down; only boost the reference as far as its peaks allow (≤ −0.5 dBFS)
      var want = m.lufs - ref.lufs;
      var headroom = ref.peak > 0 ? Math.max(0, -gainToDb(ref.peak) - 0.5) : 0;
      var g = want < 0 ? Math.max(want, -30) : Math.min(want, headroom, 12);
      var trim = want > g ? Math.max(-30, -(want - g)) : 0;
      refPrefs.gainDb = Math.round(g * 10) / 10;
      refPrefs.beatTrim = Math.round(trim * 10) / 10;
      refPrefs.muted = false;
      refPrefs.matched = { mix: m.lufs, ref: ref.lufs, gain: refPrefs.gainDb, trim: refPrefs.beatTrim, at: Date.now() };
      refSavePrefs(); refApplyGates(); refUI();
      var full = Math.abs(want - g + trim) < 0.06;
      refStatus("Matched — Ref fader " + fmtDb(refPrefs.gainDb, true) + " dB" +
        (refPrefs.beatTrim ? " and beat monitor " + fmtDb(refPrefs.beatTrim) + " dB (speakers only — the reference is quieter and can't be raised further without clipping)" : "") +
        ". Mix ≈ " + fmtDb(m.lufs) + " LUFS, reference ≈ " + fmtDb(ref.lufs) + " LUFS" + (full ? "." : ". Limited by the fader range, so not fully matched."));
    }).catch(function (e) { ref.measuring = false; refUI(); refStatus("Measurement failed: " + (e && e.message ? e.message : e)); });
  }
  function refStatus(msg) { var el = $("ref-match-status"); if (el) el.textContent = msg; }

  /* ---- drawing ---- */
  function refSizeCanvas(cv) {
    var dpr = Math.min(2, window.devicePixelRatio || 1), w = Math.round(cv.clientWidth * dpr), h = Math.round(cv.clientHeight * dpr);
    if (w && h && (cv.width !== w || cv.height !== h)) { cv.width = w; cv.height = h; cv._base = null; }
    return w > 0 && h > 0;
  }
  function refWaveLayer(cv, color) {
    var c = document.createElement("canvas"); c.width = cv.width; c.height = cv.height;
    var g = c.getContext("2d"), W = c.width, H = c.height, P = ref.peaks, mid = H / 2;
    var bw = Math.max(1, Math.round(W / 700));
    g.fillStyle = color;
    for (var x = 0; x < W; x += bw) {
      var i0 = Math.floor((x / W) * P.cols), i1 = Math.max(i0 + 1, Math.floor(((x + bw) / W) * P.cols));
      var lo = 0, hi = 0;
      for (var i = i0; i < i1 && i < P.cols; i++) { if (P.mins[i] < lo) lo = P.mins[i]; if (P.maxs[i] > hi) hi = P.maxs[i]; }
      var top = mid - hi * mid * 0.95, bot = mid - lo * mid * 0.95;
      g.fillRect(x, top, Math.max(1, bw - (bw > 2 ? 1 : 0)), Math.max(1, bot - top));
    }
    return c;
  }
  function refDrawWave(cv) {
    if (!cv.offsetParent || !refSizeCanvas(cv)) return;
    var g = cv.getContext("2d"), W = cv.width, H = cv.height;
    g.clearRect(0, 0, W, H);
    if (!ref.loaded || !ref.peaks) return;
    if (!cv._base) cv._base = { a: refWaveLayer(cv, "#3b4560"), b: refWaveLayer(cv, "#a78bfa") };
    var px = function (t) { return (t / ref.dur) * W; };
    var reg = ref.dragSel || (refPrefs.b - refPrefs.a >= 0.05 ? { a: refPrefs.a, b: refPrefs.b } : null);
    if (reg) {
      g.fillStyle = ref.dragSel || refPrefs.loop ? "rgba(34,211,238,.14)" : "rgba(138,147,168,.10)";
      g.fillRect(px(reg.a), 0, px(reg.b) - px(reg.a), H);
    }
    g.drawImage(cv._base.a, 0, 0);
    var pos = refPos(), x = px(pos);
    if (x > 0) g.drawImage(cv._base.b, 0, 0, x, H, 0, 0, x, H);
    if (reg) {
      g.fillStyle = refPrefs.loop || ref.dragSel ? "#22d3ee" : "#56607a";
      g.fillRect(px(reg.a), 0, 2, H); g.fillRect(px(reg.b) - 2, 0, 2, H);
    }
    if (!refRegion() && refPrefs.cue > 0) { g.fillStyle = "rgba(250,204,21,.8)"; g.fillRect(px(refPrefs.cue), 0, 2, Math.round(H * 0.18)); }
    g.fillStyle = "#fff"; g.fillRect(Math.min(W - 2, x), 0, 2, H);
  }
  function refDrawSpectrum() {
    var cv = $("ref-spec");
    if (!cv || !cv.offsetParent || !refSizeCanvas(cv)) return;
    var g = cv.getContext("2d"), W = cv.width, H = cv.height;
    g.fillStyle = "#0e1118"; g.fillRect(0, 0, W, H);
    var fMin = 30, fMax = 18000, dMin = -100, dMax = -20, lx = Math.log(fMax / fMin);
    var fx = function (f) { return (Math.log(f / fMin) / lx) * W; };
    var dy = function (d) { return H - ((clamp(d, dMin, dMax) - dMin) / (dMax - dMin)) * H; };
    g.strokeStyle = "#1c2230"; g.lineWidth = 1; g.fillStyle = "#56607a";
    g.font = Math.round(10 * Math.min(2, window.devicePixelRatio || 1)) + "px ui-monospace, monospace";
    [50, 100, 200, 500, 1000, 2000, 5000, 10000].forEach(function (f) {
      var x = Math.round(fx(f)) + 0.5; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke();
      g.fillText(f >= 1000 ? f / 1000 + "k" : String(f), x + 3, H - 4);
    });
    if (!refN || !refMixN) return;
    function curve(an, stroke, fill) {
      var data = an._fd || (an._fd = new Float32Array(an.frequencyBinCount));
      an.getFloatFrequencyData(data);
      var binHz = ctx.sampleRate / an.fftSize, any = false;
      g.beginPath(); g.moveTo(0, H);
      for (var x = 0; x <= W; x += 2) {
        var f = fMin * Math.exp((x / W) * lx), bi = f / binHz, i0 = Math.floor(bi), fr = bi - i0;
        var i1 = Math.min(data.length - 1, i0 + 1), v = data[i0] * (1 - fr) + data[i1] * fr;
        if (isFinite(v) && v > dMin) any = true;
        g.lineTo(x, dy(isFinite(v) ? v : dMin));
      }
      if (!any) return;
      g.lineTo(W, H); g.closePath();
      if (fill) { g.fillStyle = fill; g.fill(); }
      g.strokeStyle = stroke; g.lineWidth = Math.max(1.5, W / 600); g.stroke();
    }
    curve(refMixN.spec, "#22d3ee", "rgba(34,211,238,.14)");
    curve(refN.meter.spec, "#a78bfa", null);
  }
  function refTdOf(an) {
    var d = an._td || (an._td = new Float32Array(an.fftSize));
    an.getFloatTimeDomainData(d);
    return d;
  }
  function refMs(an, n) {
    var d = refTdOf(an), s = 0;
    for (var i = d.length - n; i < d.length; i++) s += d[i] * d[i];
    return s / n;
  }
  function refPk(o) {
    var p = 0;
    [o.pL, o.pR].forEach(function (an) {
      var d = refTdOf(an);
      for (var i = 0; i < d.length; i++) { var v = d[i] < 0 ? -d[i] : d[i]; if (v > p) p = v; }
    });
    return p;
  }
  function refMomentary(o) {
    var n = Math.min(o.kL.fftSize, Math.round(ctx.sampleRate * 0.4));
    var z = refMs(o.kL, n) + refMs(o.kR, n);
    return z > 0 ? -0.691 + 10 * Math.log10(z) : -Infinity;
  }
  function meterPct(p) { var d = gainToDb(p); return d <= -48 ? 0 : Math.min(100, ((d + 48) / 48) * 100); }
  function refTick() {
    if (!ref.ready) return;
    var onBeats = activeTab === "beats", onMix = activeTab === "mixer";
    if ((onBeats || onMix) && ref.loaded && (ref.playing || ref.dirty)) {
      document.querySelectorAll(".js-ref-wave").forEach(refDrawWave);
      var tt = fmtTime(refPos()) + " / " + fmtTime(ref.dur);
      document.querySelectorAll(".js-ref-time").forEach(function (el) { if (el.textContent !== tt) el.textContent = tt; });
      ref.dirty = false;
    }
    if (onMix && ctx && refN && refMixN && ref.loaded) {
      var pm = refPk(refMixN), pr = refPk(refN.meter);
      $("ref-meter-mix").style.height = meterPct(pm) + "%";
      $("ref-meter-ref").style.height = meterPct(pr) + "%";
      ref.pkHold.mix = Math.max(pm, ref.pkHold.mix * 0.97); ref.pkHold.ref = Math.max(pr, ref.pkHold.ref * 0.97);
      var now = performance.now();
      if (now - ref.lastLive > 150) {
        ref.lastLive = now;
        var mm = refMomentary(refMixN), mr = refMomentary(refN.meter);
        $("ref-mix-m").textContent = mm > -70 ? fmtDb(mm) : "—";
        $("ref-ref-m").textContent = mr > -70 ? fmtDb(mr) : "—";
        $("ref-mix-lp").textContent = ref.pkHold.mix > 0.0003 ? fmtDb(gainToDb(ref.pkHold.mix)) : "—";
        $("ref-ref-lp").textContent = ref.pkHold.ref > 0.0003 ? fmtDb(gainToDb(ref.pkHold.ref)) : "—";
        $("ref-live-mix-pk").textContent = ref.pkHold.mix > 0.0003 ? fmtDb(gainToDb(ref.pkHold.mix)) : "—";
      }
      refDrawSpectrum();
    }
  }

  /* ---- UI ---- */
  function refSetNames(txt) { document.querySelectorAll(".js-ref-name").forEach(function (el) { el.textContent = txt; }); }
  function refUI() {
    if (!ref.ready) return;
    var L = ref.loaded, B = ref.ab === "B" && L;
    refSetNames(L ? ref.name : "No reference loaded");
    var ext = (ref.name.match(/\.([a-z0-9]{2,5})$/i) || [])[1];
    var meta = L ? fmtTime(ref.dur) + (ext ? " · " + ext.toUpperCase() : "") + (ref.size ? " · " + (ref.size / 1048576).toFixed(1) + " MB" : "") : "";
    document.querySelectorAll(".js-ref-meta").forEach(function (el) { el.textContent = meta; });
    document.querySelectorAll(".js-ref-empty").forEach(function (el) { el.hidden = L; });
    document.querySelectorAll(".js-ref-loaded").forEach(function (el) { el.hidden = !L; });
    document.querySelectorAll(".js-ref-ab").forEach(function (grp) {
      grp.classList.toggle("locked", refLocked());
      grp.querySelectorAll(".ab-btn").forEach(function (b) {
        var on = b.dataset.ab === (B ? "B" : "A");
        b.classList.toggle("on", on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
        b.disabled = !L || (b.dataset.ab === "B" && refLocked());
      });
    });
    document.querySelectorAll(".js-ref-play").forEach(function (b) {
      b.disabled = !L || refLocked();
      b.textContent = ref.playing ? "❚❚ Pause ref" : "▶ Play ref";
      b.classList.toggle("on", ref.playing);
    });
    var bpmEls = document.querySelectorAll(".js-ref-bpm");
    bpmEls.forEach(function (el) {
      el.hidden = !(L && ref.bpm);
      if (L && ref.bpm) {
        el.querySelector("b").textContent = "≈" + ref.bpm.bpm + " BPM";
        el.querySelector("small").textContent = "or " + ref.bpm.alt;
        el.title = "Tempo estimate from the audio (half/double-time ≈" + ref.bpm.alt + " also fits)";
      }
    });
    document.querySelectorAll(".js-ref-trim").forEach(function (el) {
      el.hidden = !(L && refPrefs.beatTrim);
      el.querySelector("b").textContent = fmtDb(refPrefs.beatTrim) + " dB";
    });
    var badge = $("ref-badge"); if (badge) badge.hidden = !B;
    document.body.classList.toggle("ref-b", B);
    var rl = $("ref-loop"); if (rl) rl.checked = !!refPrefs.loop;
    var rs = $("ref-sync"); if (rs) rs.checked = !!refPrefs.sync;
    var hasReg = refPrefs.b - refPrefs.a >= 0.05;
    if (rl) rl.disabled = !hasReg;
    var rc = $("ref-clear"); if (rc) rc.disabled = !hasReg;
    var gi = $("ref-gain");
    if (gi && document.activeElement !== gi) gi.value = refPrefs.gainDb;
    var gv = $("ref-gain-val"); if (gv) gv.textContent = fmtDb(refPrefs.gainDb, true) + " dB";
    var mu = $("ref-mute"); if (mu) mu.classList.toggle("on", !!refPrefs.muted);
    var mb = $("ref-match"); if (mb) { mb.disabled = !L || ref.measuring; mb.textContent = ref.measuring ? "Measuring…" : "Level match"; }
    var setT = function (id, v) { var e = $(id); if (e) e.textContent = v; };
    setT("ref-ref-i", L && ref.analysed ? fmtDb(ref.lufs) : "—");
    setT("ref-ref-p", L && ref.analysed ? fmtDb(gainToDb(ref.peak)) : "—");
    setT("ref-mix-i", ref.mixLufs != null ? fmtDb(ref.mixLufs) : "—");
    setT("ref-mix-p", ref.mixPeak != null ? fmtDb(gainToDb(ref.mixPeak)) : "—");
    [["ref-ref-p", L && ref.analysed ? ref.peak : 0], ["ref-mix-p", ref.mixPeak || 0]].forEach(function (a) {
      var e = $(a[0]); if (!e) return;
      e.classList.toggle("over", a[1] > 1);
      e.title = a[1] > 1 ? "Above 0 dBFS: clips on live playback (WAV exports are peak-normalized)" : "";
    });
    var body = $("ref-body"), col = $("ref-collapse");
    if (body && col) {
      body.hidden = !!refPrefs.collapsed;
      col.textContent = refPrefs.collapsed ? "Show" : "Hide";
      col.setAttribute("aria-expanded", refPrefs.collapsed ? "false" : "true");
    }
    ref.dirty = true;
  }
  function refWireWave(cv) {
    var down = null;
    function tAt(e) { var r = cv.getBoundingClientRect(); return clamp((e.clientX - r.left) / Math.max(1, r.width), 0, 1) * ref.dur; }
    cv.addEventListener("pointerdown", function (e) {
      if (!ref.loaded || e.button > 0) return;
      down = { x: e.clientX, t: tAt(e), drag: false };
      try { cv.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ }
    });
    cv.addEventListener("pointermove", function (e) {
      if (!down) return;
      if (!down.drag && Math.abs(e.clientX - down.x) > 6) down.drag = true;
      if (down.drag) { var t = tAt(e); ref.dragSel = { a: Math.min(down.t, t), b: Math.max(down.t, t) }; ref.dirty = true; }
    });
    cv.addEventListener("pointerup", function () {
      if (!down) return;
      var d = down, sel = ref.dragSel; down = null; ref.dragSel = null;
      if (d.drag && sel && sel.b - sel.a >= 0.1) {
        refPrefs.a = sel.a; refPrefs.b = sel.b; refPrefs.loop = true; refPrefs.cue = sel.a; refSavePrefs();
        if (ref.playing) refStart(sel.a); else ref.pos = sel.a;
        refUI();
      } else refSeek(d.t);
      ref.dirty = true;
    });
    cv.addEventListener("pointercancel", function () { down = null; ref.dragSel = null; ref.dirty = true; });
  }
  function refWire() {
    document.querySelectorAll(".js-ref-file").forEach(function (inp) {
      inp.addEventListener("change", function (e) { refLoadFile(e.target.files[0]); e.target.value = ""; });
    });
    document.querySelectorAll(".js-ref-drop").forEach(function (zone) {
      var depth = 0;
      zone.addEventListener("dragenter", function (e) { if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], "Files") !== -1) { e.preventDefault(); depth++; zone.classList.add("drag"); } });
      zone.addEventListener("dragover", function (e) { if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], "Files") !== -1) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } });
      zone.addEventListener("dragleave", function () { depth = Math.max(0, depth - 1); if (!depth) zone.classList.remove("drag"); });
      zone.addEventListener("drop", function (e) {
        depth = 0; zone.classList.remove("drag");
        var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (!f) return;
        e.preventDefault();
        ensureCtx();
        refLoadFile(f);
      });
    });
    document.querySelectorAll(".js-ref-ab .ab-btn").forEach(function (b) {
      b.addEventListener("click", function () { refSetAB(b.dataset.ab); });
    });
    document.querySelectorAll(".js-ref-play").forEach(function (b) { b.addEventListener("click", refTogglePlay); });
    document.querySelectorAll(".js-ref-rew").forEach(function (b) { b.addEventListener("click", function () { var c = refCuePoint(); if (ref.playing) refStart(c); else ref.pos = c; ref.dirty = true; refUI(); }); });
    document.querySelectorAll(".js-ref-remove").forEach(function (b) { b.addEventListener("click", refRemove); });
    document.querySelectorAll(".js-ref-bpm-use").forEach(function (b) {
      b.addEventListener("click", function () {
        if (!ref.bpm) return;
        var bpm = $("bpm"), v = ref.bpm.bpm;
        if (v < 60 || v > 200) v = ref.bpm.alt;
        bpm.value = clamp(v, 60, 200);
        bpm.dispatchEvent(new Event("change"));
        toast("Beat tempo set to " + bpm.value + " BPM");
      });
    });
    document.querySelectorAll(".js-ref-wave").forEach(refWireWave);
    $("ref-in").addEventListener("click", function () {
      var t = refPos();
      refPrefs.a = t; if (refPrefs.b <= t + 0.05) refPrefs.b = Math.min(ref.dur, Math.max(refPrefs.b, t + Math.min(8, ref.dur - t)));
      refPrefs.cue = t; refSavePrefs(); refRestartIfPlaying(); refUI();
    });
    $("ref-out").addEventListener("click", function () {
      var t = refPos();
      if (t <= refPrefs.a + 0.05) { toast("Set out after the in point (play or click further along the waveform)."); return; }
      refPrefs.b = t; refPrefs.loop = true; refSavePrefs(); refRestartIfPlaying(); refUI();
    });
    $("ref-loop").addEventListener("change", function (e) { refPrefs.loop = e.target.checked; refSavePrefs(); refRestartIfPlaying(); refUI(); });
    $("ref-clear").addEventListener("click", function () { refPrefs.a = refPrefs.b = 0; refPrefs.loop = false; refSavePrefs(); refRestartIfPlaying(); refUI(); });
    $("ref-sync").addEventListener("change", function (e) { refPrefs.sync = e.target.checked; refSavePrefs(); if (!refPrefs.sync) ref.syncing = false; });
    $("ref-collapse").addEventListener("click", function () { refPrefs.collapsed = !refPrefs.collapsed; refSavePrefs(); refUI(); });
    var gi = $("ref-gain");
    gi.addEventListener("input", function () { refPrefs.gainDb = Math.round(+gi.value * 10) / 10; refApplyGates(); $("ref-gain-val").textContent = fmtDb(refPrefs.gainDb, true) + " dB"; });
    gi.addEventListener("change", function () { refSavePrefs(); refUI(); });
    gi.addEventListener("dblclick", function () { refPrefs.gainDb = 0; refSavePrefs(); refApplyGates(); refUI(); });
    $("ref-mute").addEventListener("click", function () { refPrefs.muted = !refPrefs.muted; refSavePrefs(); refApplyGates(); refUI(); });
    $("ref-match").addEventListener("click", refLevelMatch);
    document.querySelectorAll(".js-ref-trim-reset").forEach(function (b) {
      b.addEventListener("click", function () { refPrefs.beatTrim = 0; refSavePrefs(); refApplyGates(); refUI(); toast("Beat monitor level reset"); });
    });
    document.querySelectorAll(".tab").forEach(function (t) { t.addEventListener("click", function () { ref.dirty = true; }); });
    window.addEventListener("resize", function () { ref.dirty = true; });
  }
  function refInit() {
    refLoadPrefs();
    refWire();
    ref.ready = true;
    if (refPrefs.matched) refStatus("Last match: Ref fader " + fmtDb(refPrefs.matched.gain, true) + " dB" + (refPrefs.matched.trim ? ", beat monitor " + fmtDb(refPrefs.matched.trim) + " dB" : "") + " (mix ≈ " + fmtDb(refPrefs.matched.mix) + " LUFS, reference ≈ " + fmtDb(refPrefs.matched.ref) + " LUFS). Re-run after changing the mix.");
    refUI();
    refLoadStored();
    // read-only hook for automated checks (no controls)
    window.IPBReference = {
      info: function () {
        var rms = function (an) { if (!an) return 0; var d = new Float32Array(an.fftSize); an.getFloatTimeDomainData(d); var s = 0; for (var i = 0; i < d.length; i++) s += d[i] * d[i]; return Math.sqrt(s / d.length); };
        return {
          loaded: ref.loaded, analysed: !!ref.analysed && !!ref.bpmDone, name: ref.name, duration: ref.dur, ab: ref.ab, playing: ref.playing, pos: refPos(),
          gainDb: refPrefs.gainDb, beatTrim: refPrefs.beatTrim, muted: refPrefs.muted, lufs: ref.lufs, peak: ref.peak, mixLufs: ref.mixLufs, bpm: ref.bpm ? ref.bpm.bpm : null,
          sync: refPrefs.sync, syncing: ref.syncing, loop: refRegion(), playRate: ref.playBuf ? ref.playBuf.sampleRate : null,
          beatGate: beatMon ? beatMon.gain.value : null, refGate: refN ? refN.gate.gain.value : null,
          refFader: refN ? refN.fader.gain.value : null,
          outBeatRms: refN ? rms(refN.outBeat) : null, outRefRms: refN ? rms(refN.outRef) : null
        };
      }
    };
  }

  /* ---------------- Instrumental / backing track ----------------
   * A full instrumental (e.g. the artist's own beat) replaces the drum machine as "the beat":
   *   bufferSource → bt gain → Mixer "Instrumental" fader → (keys-path delay) → master fader → limiter → `master`
   * Because it lives on `master`, ● Record and Record Vocals capture it sample-aligned with the mic, exactly like
   * the drum beat; the take file is instrumental + vocal. The drum machine (and chord loop) stay silent while an
   * instrumental is loaded unless "Layer drum machine" is ticked. Takes always start at 0:00 of the instrumental
   * after the count-in and end with it (or with Stop take).
   */
  var BACKING_TRACKS = {}; // no built-in instrumentals ship right now (picker stays hidden while this is empty); load your own with "Load instrumental…"
  var BT_IDB_KEY = "backing:file"; // an uploaded instrumental is kept in the "pads" store so it survives a reload
  var bt = { id: null, title: "", artist: "", credit: "", buf: null, bytes: null, prep: null, bpm: 0, layer: false, prevBpm: null,
    src: null, g: null, startCtx: 0, offset: 0, loading: "", tok: 0 };
  var btRestore = null; // { id, layer, prevBpm } from the saved session
  function btActive() { return !!bt.buf; }
  function drumsOn() { return !bt.buf || bt.layer; }
  function btDur() { return bt.buf ? bt.buf.duration : 0; }
  function btPos() {
    if (!bt.buf) return 0;
    if (bt.src && ctx) return clamp(bt.offset + Math.max(0, ctx.currentTime - bt.startCtx), 0, btDur());
    return clamp(S.cueBar * barSec(), 0, btDur());
  }
  /* re-decode at the device rate once the live context exists (its resampler instead of on-the-fly resampling) */
  function btPrepare() {
    if (!ctx || !bt.buf || !bt.bytes || bt.prep || bt.buf.sampleRate === ctx.sampleRate) return;
    var tok = bt.tok;
    bt.prep = new Promise(function (res) {
      var done = false;
      var p = ctx.decodeAudioData(bt.bytes.slice(0), function (b) { done = true; res(b); }, function () { if (!done) res(null); });
      if (p && p.catch) p.catch(function () { if (!done) res(null); });
    }).then(function (b) {
      bt.prep = null;
      if (tok !== bt.tok || !b) return;
      bt.buf = b; bt.bytes = null;
    });
  }
  function btStart(when, offset) {
    btStop(when);
    if (!bt.buf || !ctx) return;
    offset = clamp(offset || 0, 0, btDur());
    if (offset >= btDur() - 0.05) return;
    var src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = bt.buf;
    src.connect(g); g.connect(groupNodes.inst.gain);
    src.start(Math.max(ctx.currentTime, when), offset);
    bt.src = src; bt.g = g; bt.startCtx = when; bt.offset = offset;
    src.onended = function () {
      if (bt.src !== src) return;
      bt.src = null;
      if (vox.state === "rec") onSongEnded();      // wraps the take up 1.5 s after the last note
      else if (playing) stop();
    };
  }
  function btStop(t) {
    if (!bt.src || !ctx) { bt.src = null; return; }
    var s = bt.src, g = bt.g;
    bt.src = null;
    t = Math.max(ctx.currentTime, t || 0);
    try { g.gain.setTargetAtTime(0, t, 0.012); s.stop(t + 0.08); } catch (e) { /* already stopped */ }
  }
  function btInstall(meta, buf, bytes, restoring) {
    if (vox.state !== "idle") stopVocalTake();
    if (playing) stop();
    if (!restoring && bt.prevBpm == null) bt.prevBpm = S.bpm;
    bt.tok++;
    bt.id = meta.id; bt.title = meta.title; bt.artist = meta.artist || ""; bt.credit = meta.credit || "";
    bt.buf = buf; bt.bytes = bytes || null; bt.prep = null; bt.bpm = meta.bpm || 0; bt.loading = "";
    if (!restoring) bt.layer = false;                   // drum machine muted by default
    if (bt.bpm) { S.bpm = clamp(Math.round(bt.bpm), 60, 200); $("bpm").value = S.bpm; lastPosLabel = ""; }
    S.cueBar = 0;
    if (ctx) cutChords(chordLive, ctx.currentTime);
    btPrepare();
    renderTimelines();
    $("rec-length").value = "song";                   // takes run the full length of the instrumental
    var ps = $("song-preset");
    if (ps.querySelector('option[value="t:' + meta.id + '"]')) ps.value = "t:" + meta.id;
    btUI(); saveSession();
  }
  function btLoadBuiltin(id, restoring) {
    var T = BACKING_TRACKS[id];
    if (!T) return Promise.resolve(false);
    var tok = ++bt.tok;
    bt.loading = T.title; btUI();
    return fetch(T.url).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.arrayBuffer();
    }).then(function (ab) {
      return refDecodeOffline(ab.slice(0)).then(function (buf) {
        if (tok !== bt.tok) return false;
        btInstall({ id: id, title: T.title, artist: T.artist, bpm: T.bpm, credit: T.credit }, buf, ab, restoring);
        return true;
      });
    }).catch(function (e) {
      if (tok === bt.tok) { bt.loading = ""; btUI(); toast("Could not load " + T.title + " (" + (e && e.message || "decode error") + ")."); }
      return false;
    });
  }
  function loadBacking(id) {
    return btLoadBuiltin(id, false).then(function (ok) {
      if (ok) toast(bt.title + " loaded — drum machine muted. Tap 🎙 Record Vocals (headphones on).");
      return ok;
    });
  }
  function btLoadFile(file) {
    if (!file) return;
    if (file.size > REF_MAX_BYTES) { toast("That file is too big (max 250 MB)."); return; }
    if (file.type && !/^audio\//.test(file.type) && !/\.(mp3|wav|m4a|aac|mp4|ogg|oga|opus|flac|webm|aiff?)$/i.test(file.name)) {
      toast("Please choose an audio file (MP3, WAV, M4A/AAC, OGG, FLAC)."); return;
    }
    var tok = ++bt.tok, title = file.name.replace(/\.[^.]+$/, "").slice(0, 80) || "Instrumental";
    bt.loading = title; btUI();
    file.arrayBuffer().then(function (ab) {
      return refDecodeOffline(ab.slice(0)).then(function (buf) {
        if (tok !== bt.tok) return;
        var est = null;
        try { est = refEstimateBpm(buf); } catch (e) { est = null; }
        var meta = { id: "file", title: title, artist: "", bpm: est ? est.bpm : 0, credit: "Your upload · stays in this browser" };
        btInstall(meta, buf, ab, false);
        toast(title + " loaded" + (est ? " · ≈" + est.bpm + " BPM" : "") + " — drum machine muted. Tap 🎙 Record Vocals.");
        idb("pads", "readwrite", function (st) {
          return st.put({ key: BT_IDB_KEY, name: file.name, title: title, type: file.type, size: file.size, bpm: meta.bpm, data: ab });
        }).catch(function () { toast("Instrumental loaded for this session only (browser storage full or blocked)."); });
      }, function () {
        if (tok === bt.tok) { bt.loading = ""; btUI(); }
        toast("This browser can't decode “" + file.name + "”. Try MP3 or WAV.");
      });
    }).catch(function () { if (tok === bt.tok) { bt.loading = ""; btUI(); } toast("Could not read that file."); });
  }
  function btLoadStoredFile() {
    var tok = ++bt.tok;
    bt.loading = "your instrumental"; btUI();
    return idb("pads", "readonly", function (st) { return st.get(BT_IDB_KEY); }).then(function (row) {
      if (!row || !row.data) throw new Error("none");
      return refDecodeOffline(row.data.slice(0)).then(function (buf) {
        if (tok !== bt.tok) return;
        btInstall({ id: "file", title: row.title || "Instrumental", bpm: row.bpm || 0, credit: "Your upload · stays in this browser" }, buf, row.data, true);
      });
    }).catch(function () { if (tok === bt.tok) { bt.loading = ""; bt.id = null; btUI(); saveSession(); } });
  }
  function btEject() {
    if (!bt.buf && !bt.loading) return;
    if (vox.state !== "idle") stopVocalTake();
    if (playing) stop();
    var wasFile = bt.id === "file";
    bt.tok++;
    bt.id = null; bt.buf = null; bt.bytes = null; bt.prep = null; bt.loading = ""; bt.layer = false;
    if (bt.prevBpm != null) { S.bpm = bt.prevBpm; $("bpm").value = S.bpm; lastPosLabel = ""; }
    bt.prevBpm = null; S.cueBar = 0;
    if (wasFile) idb("pads", "readwrite", function (st) { return st.delete(BT_IDB_KEY); }).catch(function () {});
    var ps = $("song-preset");
    if (/^t:/.test(ps.value)) ps.value = "";
    if ($("rec-length").value === "song" && !arrangement()) $("rec-length").value = "30";
    renderTimelines(); btUI(); saveSession();
    toast("Instrumental ejected — back to the drum machine.");
  }
  function btSetLayer(on) {
    bt.layer = !!on;
    if (!bt.layer && ctx) cutChords(chordLive, ctx.currentTime);
    btUI(); saveSession();
  }
  var btLastTime = "";
  function btTick() {
    var d = btDur(), p = btPos();
    var bar = $("bt-bar");
    if (bar) bar.style.width = (d ? (p / d) * 100 : 0).toFixed(2) + "%";
    var txt = fmtTime(p) + " / " + fmtTime(d);
    if (txt !== btLastTime) { btLastTime = txt; var tm = $("bt-time"); if (tm) tm.textContent = txt; }
  }
  function btUI() {
    var on = !!bt.buf;
    document.body.classList.toggle("bt-on", on);
    document.body.classList.toggle("bt-layer", on && bt.layer);
    var panel = $("bt-panel");
    if (!panel) return;
    panel.classList.toggle("on", on);
    $("bt-name").textContent = bt.loading ? "Loading " + bt.loading + "…" : on ? bt.title + (bt.artist ? " — " + bt.artist : "") : "None · Record Vocals uses the drum machine";
    $("bt-meta").textContent = on ? fmtTime(btDur()) + (bt.bpm ? " · " + Math.round(bt.bpm) + " BPM" : "") + (bt.credit ? " · " + bt.credit : "") : "";
    $("bt-body").hidden = !on;
    $("bt-eject").hidden = !on;
    $("bt-pick").value = bt.id && BACKING_TRACKS[bt.id] ? bt.id : "";
    $("bt-pick").hidden = !Object.keys(BACKING_TRACKS).length;
    $("bt-layer").checked = bt.layer;
    var lv = Math.round(S.mixer.inst.v * 100);
    $("bt-level").value = lv;
    $("bt-level-val").textContent = S.mixer.inst.m ? "muted" : lv + "%";
    $("bt-note").textContent = !on ? "" : bt.layer
      ? "Drum machine layered on top (starts with the instrumental at the current BPM). Every take starts at 0:00 after a 1-bar count-in and runs to the end of the track — or tap Stop take."
      : "Drum machine is muted while the instrumental plays. Every take starts at 0:00 after a 1-bar count-in and runs to the end of the track — or tap Stop take. The take in the Vault is instrumental + your vocal in one WAV.";
    btLastTime = ""; btTick();
  }
  function btInit() {
    $("bt-pick").addEventListener("change", function (e) { if (e.target.value) loadBacking(e.target.value); });
    $("bt-file").addEventListener("change", function (e) { btLoadFile(e.target.files[0]); e.target.value = ""; });
    $("bt-eject").addEventListener("click", btEject);
    $("bt-layer").addEventListener("change", function (e) { btSetLayer(e.target.checked); });
    $("bt-play").addEventListener("click", togglePlay);
    $("bt-level").addEventListener("input", function (e) {
      S.mixer.inst.v = +e.target.value / 100; S.mixer.inst.m = false;
      applyMixer(); saveSession(); btUI();
    });
    $("bt-level").addEventListener("change", function () { buildMixer(); });
    $("bt-prog").addEventListener("click", function (e) {
      if (!bt.buf || vox.state !== "idle") return;
      var r = e.currentTarget.getBoundingClientRect(), f = clamp((e.clientX - r.left) / r.width, 0, 1);
      cueTo(Math.floor((f * btDur()) / barSec()));
    });
    var q = "";
    try { q = (new URLSearchParams(location.search).get("beat") || "").toLowerCase(); } catch (e) { q = ""; }
    btUI();
    if (BACKING_TRACKS[q]) { // deep link: ?beat=<built-in id> → instrumental loaded, Record Vocals ready (unknown ids, e.g. the removed "gunwalk", just load normally)
      if (btRestore && btRestore.prevBpm != null) bt.prevBpm = btRestore.prevBpm;
      btRestore = null;
      btLoadBuiltin(q, false).then(function (ok) {
        if (!ok) return;
        var pn = $("bt-panel");
        if (pn) { var tb = document.querySelector(".topbar"), y = pn.getBoundingClientRect().top + window.pageYOffset - (tb ? tb.offsetHeight : 0) - 8; window.scrollTo(0, Math.max(0, y)); }
        setVoxStatus("“" + bt.title + "” is loaded. Put headphones on and tap 🎙 Record Vocals: 1-bar count-in, then the instrumental starts from 0:00 and your mic records until the end (or Stop take).");
      });
    } else if (btRestore) {
      var r0 = btRestore;
      btRestore = null;
      bt.layer = r0.layer; bt.prevBpm = r0.prevBpm;
      if (BACKING_TRACKS[r0.id]) btLoadBuiltin(r0.id, true);
      else if (r0.id === "file") btLoadStoredFile();
      else bt.prevBpm = null; // a removed built-in (old saves with "gunwalk"): nothing to load, keep the drum machine
    }
  }

  /* ---------------- Piano Roll (patterns saved like drum patterns) ----------------
   * S.piano.slots A–D hold piano patterns (pianoroll-data.js format) next to the drum slots and are saved in the
   * session; named patterns live in a localStorage library (PIANO_LIB_KEY); songs with an attached beat carry the
   * current piano pattern. Notes are scheduled from the same 16th-note scheduler as the drums (same BPM, swing,
   * song form), live and offline, through the Mixer's "Piano Roll" fader → master → limiter.
   */
  var pianoEd = null, pianoLib = null, pianoSeen = false;
  function pianoStepOf(info) { var P16 = pianoPat().bars * STEPS; return (((info.m16 || 0) % P16) + P16) % P16; }
  /* Feel for melodic notes: notes starting on the same tick are rolled like a player's chord (top voice louder),
     single notes get a few ms / a few % of life. Returns [{ n, t, v }] in the input order. */
  function feelNotes(list, seedBase, defInst) {
    var out = list.map(function (x) { return { n: x.n, t: x.t, v: x.n.v == null ? 0.8 : x.n.v, p: x.n.p, mono: !((PK.BY_ID[PK.migrate(x.n.i || defInst) || ""] || {}).poly) }; });
    if (S.feel === "off") return out;
    var by = {};
    out.forEach(function (o) { (by[o.n.s] = by[o.n.s] || []).push(o); });
    var st = FEEL.style(kitDef(S.kit));
    Object.keys(by).forEach(function (k) { FEEL.chord(S.feel, by[k], seedBase * 977 + (+k), st); });
    return out;
  }
  function schedulePiano(c, G, info, t, len) {
    var so = ovAt(curCtx); if (so && so.keys === false) return; // section editing: keys / Piano Roll off in this section
    var p = pianoPat();
    if (!p.notes.length) return;
    var s16 = pianoStepOf(info), t0 = s16 * PD.STEP, tickSec = len / PD.STEP;
    var sw = s16 % 2 === 1 ? len * (S.swing / 100) : 0;
    var ns = PD.notesStarting(p, t0, t0 + PD.STEP), gl = PD.gainLin(p);
    if (PK.setTempo) PK.setTempo(S.bpm); // tempo-synced voices (sidechain pad, arp)
    if (PK.setFeel) PK.setFeel(S.feel);
    var fn = feelNotes(ns.map(function (n) { return { n: n, t: t + (n.s - t0) * tickSec + (n.s === t0 ? sw : 0) }; }), info.k, p.inst);
    for (var i = 0; i < fn.length; i++) {
      var n = fn[i].n, inst = n.i || p.inst, lc = melCfg(p, inst);
      if (!melAudible(lc)) continue;
      var dest = melStrip(G, S.piano.slot + ":" + inst, lc, G.groups.piano).inp;
      var tn = lc ? lc.tune + lc.fine / 100 : 0, nt = Math.max(0, fn[i].t + (lc ? lc.nudge / 1000 : 0)), nd = n.l * tickSec;
      if (lc && lc.decay < 0.995) dest = melDecay(c, dest, nt, nd, lc.decay);
      G.preg.push(melPlay(c, dest, n.p + tn, nt, nd * (lc ? lc.decay : 1), fn[i].v, inst, gl, n.i ? null : p.tone, lc));
      if (c === ctx && window.__ipbTD) window.__ipbTD.trig({ kind: "piano", src: "piano:" + S.piano.slot, note: inst + " " + n.p, when: nt, voices: G.preg.filter(function (v) { return v && v.end > c.currentTime; }).length, ready: true });
    }
    if (G.preg.length > 32) G.preg = G.preg.filter(function (v) { return v && v.end > c.currentTime; });
  }
  function pianoPlayTick() {
    if (!playing || !ctx) return -1;
    var pos = currentPosK(), k = Math.floor(pos), frac = pos - k, info = stepInfo(k);
    if (info.end) return -1;
    var m = arrangement() ? info.mb * STEPS + frac * (info.feel === "half" ? 0.5 : 1) : info.m16 + frac;
    var P16 = pianoPat().bars * STEPS;
    return (((m % P16) + P16) % P16) * PD.STEP;
  }
  function pianoPreview(m, v) {
    if (!ensureCtx()) return;
    if (PK.setTempo) PK.setTempo(S.bpm);
    var p = pianoPat(), lc = melCfg(p, p.inst), dest = melStrip(LG, S.piano.slot + ":" + p.inst, lc, LG.groups.piano).inp; // audition through the layer's knobs
    melPlay(ctx, dest, m + (lc ? lc.tune + lc.fine / 100 : 0), ctx.currentTime + 0.005, 0.32, v == null ? 0.8 : v, p.inst, PD.gainLin(p), p.tone, lc);
  }
  /* Sound row: preset, drive and glide reflect the current pattern (tone missing = instrument defaults) */
  function pianoToneUI(p) {
    var def = PK.BY_ID[p.inst] || {}, o = PK.toneOf(p.inst, p.tone);
    $("pn-preset").value = PK.presetOf(p.inst, p.tone);
    $("pn-drive").value = Math.round(o.drive * 100); $("pn-drive-val").textContent = Math.round(o.drive * 100);
    $("pn-glide").value = Math.round(o.glide * 100); $("pn-glide-val").textContent = def.gl ? Math.round(o.glide * 100) : "–";
    $("pn-glide").disabled = !def.gl;
    $("pn-glide-wrap").classList.toggle("off", !def.gl);
    $("pn-glide-wrap").title = def.gl ? "Glide / slide time: overlap two notes and the second one slides from the first (808 slide)" : "Glide works on mono sounds: Tuned 808, Reese / Drill Bass, Trap Flute";
  }
  function pianoAudition() {
    var p = pianoPat(), def = PK.BY_ID[p.inst] || {};
    if (!ensureCtx()) return;
    if (def.gl) { // mono: play a slide so glide is audible
      var t = ctx.currentTime + 0.01, base = p.inst === "trapflute" ? 72 : 36;
      if (PK.setTempo) PK.setTempo(S.bpm);
      PK.play(ctx, LG.groups.piano, base, t, 0.32, 0.85, p.inst, PD.gainLin(p), p.tone);
      PK.play(ctx, LG.groups.piano, base + 7, t + 0.26, 0.4, 0.85, p.inst, PD.gainLin(p), p.tone);
      return;
    }
    pianoPreview(60, 0.8); setTimeout(function () { pianoPreview(64, 0.7); pianoPreview(67, 0.7); }, 90);
  }
  function pianoSummary() {
    var p = pianoPat(), inst = PK.BY_ID[p.inst];
    return "Pattern " + S.piano.slot + (p.name ? " · " + p.name : "") + " · " + p.bars + " bar" + (p.bars > 1 ? "s" : "") + " · " + p.notes.length + " note" + (p.notes.length === 1 ? "" : "s") +
      " · " + patInstLabel(p) + (p.scale !== "off" ? " · " + PD.NOTE_NAMES[p.key] + " " + PD.SCALE_NAMES[p.scale].toLowerCase() : "") +
      (p.gain ? " · level " + (p.gain > 0 ? "+" : "") + p.gain + " dB" : "");
  }
  function pianoUI(refreshEditor, scroll) {
    if (!pianoEd) return;
    var p = pianoPat();
    pianoSamplesLoad(); // no-op unless a slot uses a sampled instrument (cached after the first load)
    if (refreshEditor) pianoEd.refresh(scroll);
    document.querySelectorAll("#pn-slots button[data-slot]").forEach(function (b) {
      var id = b.dataset.slot;
      b.classList.toggle("on", id === S.piano.slot);
      b.classList.toggle("queued", id === pianoPending);
      b.classList.toggle("empty", !PD.hasNotes(S.piano.slots[id]));
    });
    document.querySelectorAll("#pn-bars button").forEach(function (b) { b.classList.toggle("on", +b.dataset.bars === p.bars); });
    document.querySelectorAll("#pn-grid button").forEach(function (b) { b.classList.toggle("on", b.dataset.grid === p.grid); });
    document.querySelectorAll("#pn-tool button").forEach(function (b) { b.classList.toggle("on", b.dataset.tool === pianoEd.tool()); });
    $("pn-inst").value = PK.BY_ID[p.inst] ? p.inst : PK.DEFAULT;
    pianoToneUI(p);
    $("pn-key").value = String(p.key);
    $("pn-scale").value = p.scale;
    $("pn-snapscale").checked = !!p.snapScale;
    $("pn-snapscale").disabled = p.scale === "off";
    $("pn-undo").disabled = !pianoEd.canUndo();
    $("pn-redo").disabled = !pianoEd.canRedo();
    $("pn-sum").textContent = pianoSummary();
    document.querySelectorAll('#pn-lib [data-act="load"]').forEach(function (b) { b.textContent = "Load → " + S.piano.slot; });
    if (klReady) { klBarUI(); klRefreshCards(); }
    if (lyT && lyT.kind === "mel" && lyT.slot !== S.piano.slot) lyClose(); // the open layer belongs to another slot
    else if (lyT) lyRefresh();
    lyBar();
  }
  function pianoChanged(kind) {
    if (kind !== "view") saveSession();
    pianoUI(false);
  }
  function pianoSwitchSlot(id) {
    if (id === S.piano.slot && !pianoPending) return;
    if (playing && !arrangement()) { pianoPending = id === S.piano.slot ? null : id; pianoUI(false); return; } // switch at the loop end, like the drums
    S.piano.slot = id; pianoPending = null;
    pianoUI(true, true); saveSession();
  }
  function pianoReplace(pattern, what) {
    var cur = pianoPat();
    if (PD.hasNotes(cur) && JSON.stringify(cur.notes) !== JSON.stringify(pattern.notes) &&
        !confirm("Replace piano pattern " + S.piano.slot + " (" + cur.notes.length + " notes) with " + what + "?")) return false;
    S.piano.slots[S.piano.slot] = PD.normalize(pattern, instOk);
    pianoUI(true, true); saveSession();
    return true;
  }
  function pianoTick() {
    pianoEd.tick();
    var el = $("pn-pos"), t = pianoPlayTick(), txt;
    if (t < 0) txt = "Bar 1 · stopped";
    else { var bar = Math.floor(t / PD.TPBAR), beat = Math.floor((t % PD.TPBAR) / PD.TPB); txt = "Bar " + (bar + 1) + "." + (beat + 1) + " / " + pianoPat().bars; }
    if (el.textContent !== txt) el.textContent = txt;
  }
  function pianoShown() {
    if (!pianoEd) return;
    pianoEd.refresh(false);
    pianoEd.scrollToNotes(!pianoSeen);
    pianoSeen = true;
  }
  function fmtDate(ms) { try { return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" }); } catch (e) { return ""; } }
  function renderPianoLib() {
    var list = $("pn-lib");
    $("pn-lib-count").textContent = pianoLib.items.length ? pianoLib.items.length + " saved" : "";
    if (!pianoLib.items.length) {
      list.innerHTML = '<div class="empty small">No saved piano patterns yet. Draw something, then “Save to library…”.</div>';
      return;
    }
    list.innerHTML = "";
    pianoLib.items.forEach(function (it) {
      var p = it.pattern, inst = PK.BY_ID[p.inst];
      var row = document.createElement("div");
      row.className = "pn-item";
      row.innerHTML = '<div class="pn-item-main"><strong></strong><span class="mono"></span></div>' +
        '<div class="pn-item-actions"><button type="button" class="btn small" data-act="load">Load → ' + S.piano.slot + '</button>' +
        '<button type="button" class="btn small ghost" data-act="rename">Rename</button>' +
        '<button type="button" class="btn small ghost" data-act="dup">Duplicate</button>' +
        '<button type="button" class="btn small ghost" data-act="del">Delete</button></div>';
      row.querySelector("strong").textContent = it.name;
      row.querySelector(".mono").textContent = p.bars + " bar" + (p.bars > 1 ? "s" : "") + " · " + p.notes.length + " notes · " + patInstLabel(p) +
        (p.scale !== "off" ? " · " + PD.NOTE_NAMES[p.key] + " " + PD.SCALE_NAMES[p.scale].toLowerCase() : "") + " · " + fmtDate(it.updated);
      row.dataset.id = it.id;
      list.appendChild(row);
    });
  }
  function pianoLibAction(act, id) {
    var it = pianoLib.get(id);
    if (!it) return;
    if (act === "load") {
      var cp = PD.clone(it.pattern); cp.name = it.name;
      if (pianoReplace(cp, "“" + it.name + "”")) toast("Loaded “" + it.name + "” into piano pattern " + S.piano.slot);
    } else if (act === "rename") {
      var n = prompt("Rename piano pattern", it.name);
      if (!n || !n.trim()) return;
      pianoLib.rename(id, n) ? toast("Renamed to “" + n.trim().slice(0, 80) + "”") : toast("Could not save — browser storage is full or blocked.");
    } else if (act === "dup") {
      var d = pianoLib.duplicate(id);
      toast(d ? "Duplicated as “" + d.name + "”" : "Could not save — browser storage is full or blocked.");
    } else if (act === "del") {
      if (!confirm("Delete “" + it.name + "” from the library?")) return;
      pianoLib.remove(id);
      toast("Deleted “" + it.name + "”");
    }
    renderPianoLib();
  }
  function pianoSaveToLib() {
    var p = pianoPat();
    if (!PD.hasNotes(p)) { toast("This piano pattern is empty — draw some notes first."); return; }
    var def = p.name || "Piano idea " + (pianoLib.items.length + 1);
    var name = prompt("Save piano pattern as", def);
    if (!name || !name.trim()) return;
    name = name.trim().slice(0, 80);
    var ex = pianoLib.byName(name);
    if (ex && !confirm("“" + ex.name + "” already exists. Overwrite it?")) return;
    var it = pianoLib.save(name, p, ex ? ex.id : null);
    if (!it) { toast("Could not save — browser storage is full or blocked."); return; }
    p.name = name; saveSession(); pianoUI(false); renderPianoLib();
    toast("Saved “" + name + "” to the piano library");
  }
  function pianoExport() {
    var p = pianoPat();
    if (!PD.hasNotes(p)) { toast("This piano pattern is empty."); return; }
    var blob = new Blob([JSON.stringify(PD.toJSON(p), null, 1)], { type: "application/json" });
    var a = document.createElement("a"), url = URL.createObjectURL(blob);
    a.href = url; a.download = ((p.name || "piano-pattern-" + S.piano.slot).replace(/[^\w\- ]+/g, "").replace(/\s+/g, "_") || "piano-pattern") + ".ipb-piano.json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }
  function pianoImport(file) {
    if (!file) return;
    if (file.size > 2 * 1048576) { toast("That file is too big for a piano pattern."); return; }
    file.text().then(function (txt) {
      var pat = PD.fromJSON(txt, instOk);
      if (!pat.name) pat.name = file.name.replace(/(\.ipb-piano)?\.json$/i, "").slice(0, 80);
      if (pianoReplace(pat, "“" + (pat.name || file.name) + "”")) toast("Imported “" + (pat.name || file.name) + "” (" + pat.notes.length + " notes) into pattern " + S.piano.slot);
    }).catch(function () { toast("That file is not an Island Pin Beats piano pattern (.json)."); });
  }
  function pianoSeedChords() {
    var CT = S.chordTrack, chords = CT.prog.map(function (ci) { var c = CHORDS[ci]; return c ? { root: c.r, ivs: QUAL[c.q] } : null; });
    if (!chords.some(Boolean)) { toast("The chord loop is empty — pick chords on the Beats tab."); return; }
    var p = pianoPat(), fresh = !PD.hasNotes(p);
    if (!fresh && !confirm("Replace the notes in piano pattern " + S.piano.slot + " with the chord loop?")) return;
    var first = CHORDS[CT.prog.filter(function (ci) { return CHORDS[ci]; })[0]];
    var seeded = PD.fromChords(chords, Math.max(1, CT.bars), { inst: p.inst });
    pianoEd.edit(function (pp) {
      pp.bars = seeded.bars; pp.notes = seeded.notes;
      if (fresh && first) { pp.key = first.r; pp.scale = /^min/.test(first.q) ? "minor" : "major"; }
    }, "seed");
    pianoUI(true, true);
    toast("Chord loop written into pattern " + S.piano.slot + " · " + CT.prog.map(function (i) { return CHORDS[i] ? CHORDS[i].n : "—"; }).join(" – "));
  }
  function pianoInit() {
    pianoLib = new PD.Library(PIANO_LIB_KEY, instOk);
    var isel = $("pn-inst"), cats = {};
    PK.INSTRUMENTS.forEach(function (ins) {
      if (!cats[ins.cat]) { cats[ins.cat] = document.createElement("optgroup"); cats[ins.cat].label = ins.cat; isel.appendChild(cats[ins.cat]); }
      var o = document.createElement("option"); o.value = ins.id; o.textContent = ins.name; cats[ins.cat].appendChild(o);
    });
    PD.NOTE_NAMES.forEach(function (n, i) { var o = document.createElement("option"); o.value = i; o.textContent = n; $("pn-key").appendChild(o); });
    Object.keys(PD.SCALE_NAMES).forEach(function (k) { var o = document.createElement("option"); o.value = k; o.textContent = PD.SCALE_NAMES[k]; $("pn-scale").appendChild(o); });
    pianoEd = window.IPBPianoRoll.create($("pn-roll"), {
      getPattern: pianoPat, onChange: pianoChanged, preview: pianoPreview, playTick: pianoPlayTick,
      isPlaying: function () { return playing; }, toast: toast
    });
    document.querySelectorAll("#pn-slots button[data-slot]").forEach(function (b) { b.addEventListener("click", function () { pianoSwitchSlot(b.dataset.slot); }); });
    $("pn-dup").addEventListener("click", function () {
      var from = S.piano.slot, nx = SLOT_IDS[(SLOT_IDS.indexOf(from) + 1) % SLOT_IDS.length];
      if (PD.hasNotes(S.piano.slots[nx]) && !confirm("Overwrite piano pattern " + nx + " with a copy of " + from + "?")) return;
      S.piano.slots[nx] = PD.clone(pianoPat());
      pianoPending = null; S.piano.slot = nx;
      pianoUI(true, true); saveSession();
      toast("Copied piano pattern " + from + " → " + nx);
    });
    document.querySelectorAll("#pn-bars button").forEach(function (b) {
      b.addEventListener("click", function () {
        var n = +b.dataset.bars; if (n === pianoPat().bars) return;
        if (n < pianoPat().bars && pianoPat().notes.some(function (x) { return x.s >= n * PD.TPBAR; }) && !confirm("Shorten to " + n + " bar" + (n > 1 ? "s" : "") + "? Notes after bar " + n + " are removed (Undo brings them back).")) return;
        pianoEd.edit(function (p) { PD.setBars(p, n, true); }, "bars");
        pianoUI(true);
      });
    });
    document.querySelectorAll("#pn-grid button").forEach(function (b) {
      b.addEventListener("click", function () { pianoPat().grid = b.dataset.grid; pianoEd.resetLength(); pianoEd.draw(); pianoUI(false); saveSession(); });
    });
    $("pn-snap").addEventListener("change", function (e) { pianoEd.setSnap(e.target.checked); });
    document.querySelectorAll("#pn-tool button").forEach(function (b) { b.addEventListener("click", function () { pianoEd.setTool(b.dataset.tool); pianoUI(false); }); });
    $("pn-zin").addEventListener("click", function () { pianoEd.zoom(1.25); });
    $("pn-zout").addEventListener("click", function () { pianoEd.zoom(0.8); });
    var psel = $("pn-preset");
    PK.PRESETS.forEach(function (P) { var o = document.createElement("option"); o.value = P.id; o.textContent = P.name + (P.id === PK.DEFAULT_PRESET ? " (default)" : ""); psel.appendChild(o); });
    var pc = document.createElement("option"); pc.value = ""; pc.textContent = "Custom"; psel.appendChild(pc);
    psel.addEventListener("change", function () {
      var P = PK.PRESETS.filter(function (x) { return x.id === psel.value; })[0];
      if (!P) return;
      var p = pianoPat(); p.inst = P.inst; p.tone = { drive: P.tone.drive || 0, glide: P.tone.glide || 0 };
      saveSession(); pianoUI(false); pianoAudition();
    });
    ["drive", "glide"].forEach(function (k) {
      $("pn-" + k).addEventListener("input", function (e) {
        var p = pianoPat(), cur = PK.toneOf(p.inst, p.tone);
        cur[k] = Math.round(+e.target.value) / 100; p.tone = cur;
        $("pn-" + k + "-val").textContent = e.target.value; $("pn-preset").value = PK.presetOf(p.inst, p.tone);
      });
      $("pn-" + k).addEventListener("change", function () { saveSession(); pianoUI(false); pianoAudition(); });
    });
    isel.addEventListener("change", function () {
      pianoPat().inst = isel.value; delete pianoPat().tone; saveSession(); pianoUI(false); // new sound starts from its own default drive / glide
      pianoAudition();
    });
    $("pn-key").addEventListener("change", function (e) { pianoPat().key = +e.target.value; pianoEd.paintKeys(); pianoUI(false); saveSession(); });
    $("pn-scale").addEventListener("change", function (e) { pianoPat().scale = e.target.value; pianoEd.paintKeys(); pianoUI(false); saveSession(); });
    $("pn-snapscale").addEventListener("change", function (e) { pianoPat().snapScale = e.target.checked; saveSession(); });
    $("pn-vel").addEventListener("input", function (e) {
      var v = +e.target.value / 100; $("pn-vel-val").textContent = e.target.value;
      pianoEd.setVelocity(v);
      var sel = pianoEd.selected();
      if (sel) pianoEd.edit(function () { sel.v = v; }, "velocity");
    });
    $("pn-undo").addEventListener("click", function () { pianoEd.undo(); pianoUI(false); });
    $("pn-redo").addEventListener("click", function () { pianoEd.redo(); pianoUI(false); });
    document.querySelectorAll("#pn-tr button").forEach(function (b) {
      b.addEventListener("click", function () {
        var d = +b.dataset.tr, p = pianoPat();
        if (!PD.hasNotes(p)) return;
        if (!PD.inRange(p, d)) { toast("Can't transpose " + (d > 0 ? "up" : "down") + " — notes would leave the C1–C7 range."); return; }
        pianoEd.edit(function (pp) { PD.transpose(pp, d); }, "transpose");
        pianoUI(false);
        var lo = p.notes.reduce(function (a, n) { return Math.min(a, n.p); }, 127);
        pianoPreview(lo, 0.8);
      });
    });
    $("pn-clear").addEventListener("click", function () {
      if (!PD.hasNotes(pianoPat())) return;
      if (!confirm("Clear all notes in piano pattern " + S.piano.slot + "? (Undo brings them back)")) return;
      pianoEd.edit(function (p) { p.notes = []; }, "clear"); pianoUI(false);
    });
    $("pn-seed").addEventListener("click", pianoSeedChords);
    $("pn-play").addEventListener("click", togglePlay);
    $("pn-save").addEventListener("click", pianoSaveToLib);
    $("pn-export").addEventListener("click", pianoExport);
    $("pn-import").addEventListener("change", function (e) { pianoImport(e.target.files[0]); e.target.value = ""; });
    $("pn-lib").addEventListener("click", function (e) {
      var b = e.target.closest("button[data-act]"), row = e.target.closest(".pn-item");
      if (b && row) pianoLibAction(b.dataset.act, row.dataset.id);
    });
    // editing keys while the Piano Roll tab is open (capture phase, before the global pad / keyboard shortcuts)
    window.addEventListener("keydown", function (e) {
      if (activeTab !== "piano" || isTyping(e) || ly.open) return;
      var k = e.key, mod = e.ctrlKey || e.metaKey, done = false;
      if (mod && (k === "z" || k === "Z")) { done = e.shiftKey ? pianoEd.redo() : pianoEd.undo(); done = true; }
      else if (mod && (k === "y" || k === "Y")) { pianoEd.redo(); done = true; }
      else if (!mod && (k === "Delete" || k === "Backspace")) done = pianoEd.deleteSelected();
      else if (!mod && !e.altKey && pianoEd.selected() && (k === "ArrowUp" || k === "ArrowDown" || k === "ArrowLeft" || k === "ArrowRight")) {
        done = pianoEd.nudgeSelected(k === "ArrowUp" ? (e.shiftKey ? 12 : 1) : k === "ArrowDown" ? (e.shiftKey ? -12 : -1) : 0, k === "ArrowRight" ? 1 : k === "ArrowLeft" ? -1 : 0);
      }
      if (done) { e.preventDefault(); e.stopImmediatePropagation(); pianoUI(false); }
    }, true);
    $("pn-vel-val").textContent = Math.round(pianoEd.velocity() * 100);
    renderPianoLib();
    pianoUI(true);
  }

  /* ---------------- Keys loop bank (hip-hop piano / Rhodes loops → Piano Roll) ----------------
   * keys-loops.js holds original loops as data; each builds into a Piano Roll pattern transposed to the song key
   * (S.songKey; "Auto" = the first loaded loop sets it). Patterns are tick-based, so loops always follow the song
   * BPM + swing. Preview plays through the Piano Roll mixer channel; while the beat is playing it joins on the next
   * bar, in time with the drums, and the current piano pattern steps aside for it.
   */
  var KL_NORM = 0.5; // keys-loop previews on the Samples bus (the synths peak near full scale)
  var KL = window.IPBKeysLoops, klPrev = null, klReady = false, klCat = "rap", klWhere = "beats";
  function klInstName(id) { var i = PK.BY_ID[id]; return i ? i.name : id; }
  function patInstLabel(p) { return PD.instsOf(p).map(klInstName).join(" + "); } // "Trap Pluck + Tuned 808 (glide + drive) + …"
  function loopInstLabel(L) { return (L.insts || [L.inst]).map(klInstName).join(" + "); }
  function klTarget() { var v = $("kl-slot").value; return SLOT_IDS.indexOf(v) !== -1 ? v : S.piano.slot; }
  function klBuild(id) { return KL.build(id, { key: S.songKey }); }
  function klKeyUI() {
    document.querySelectorAll(".js-songkey").forEach(function (s) { s.value = S.songKey == null ? "" : String(S.songKey); });
  }
  function klSlotLoop(id) { var p = S.piano.slots[id]; return p && p.src && p.src.indexOf("kl:") === 0 ? KL.BY_ID[p.src.slice(3)] : null; }
  function klBarUI() {
    var L = klSlotLoop(S.piano.slot), p = pianoPat(), cat = L ? KL.CATS.filter(function (c) { return c.id === L.cat; })[0] : null;
    $("kl-cat").textContent = cat ? cat.name : "Keys loops";
    $("kl-name").textContent = L ? L.name : "Pick a keys loop";
    $("kl-meta").textContent = L
      ? "Piano pattern " + S.piano.slot + " · " + PD.NOTE_NAMES[p.key] + " " + (KL.MODE_NAMES[p.scale] || p.scale) + " · " + patInstLabel(p) + " · at " + S.bpm + " BPM"
      : KL.LOOPS.length + " loops · 2026 rap & hip-hop first · follow song key + BPM";
    $("kl-open").style.setProperty("--kit", cat ? cat.color : "#a78bfa");
    var sel = $("kl-slot"); sel.options[0].textContent = "Current pattern (" + S.piano.slot + ")";
  }
  function klRefreshCards() {
    var tgt = klTarget(), cur = klSlotLoop(S.piano.slot);
    document.querySelectorAll(".kl-card").forEach(function (card) {
      var L = KL.BY_ID[card.dataset.loop];
      card.querySelector(".kc-meta").textContent = KL.keyLabel(L, S.songKey) + " · " + L.bpm + " BPM · " + loopInstLabel(L) + " · " + L.bars + " bar" + (L.bars > 1 ? "s" : "");
      card.querySelector(".kl-load").textContent = "Load → " + tgt;
      card.classList.toggle("active", !!cur && cur.id === L.id);
      var on = !!klPrev && klPrev.id === L.id;
      card.classList.toggle("previewing", on);
      card.querySelector(".kl-prev").textContent = on ? "■ Stop" : "▶ Preview";
    });
    $("kl-stop").hidden = !klPrev;
  }
  function klFilter(cat) {
    klCat = cat;
    $("kl-cats").querySelectorAll("button").forEach(function (b) { b.classList.toggle("on", b.dataset.cat === cat); });
    document.querySelectorAll(".kl-card").forEach(function (c) { c.hidden = cat !== "all" && c.dataset.cat !== cat; });
  }
  function klBuildBrowser() {
    var cats = $("kl-cats"), grid = $("kl-grid");
    cats.innerHTML = ""; grid.innerHTML = "";
    KL.CATS.concat([{ id: "all", name: "All" }]).forEach(function (c) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "kb-cat"; b.dataset.cat = c.id;
      b.textContent = c.name + (c.id === "all" ? "" : " · " + KL.LOOPS.filter(function (L) { return L.cat === c.id; }).length);
      b.addEventListener("click", function () { klFilter(c.id); });
      cats.appendChild(b);
    });
    KL.LOOPS.forEach(function (L) {
      var cat = KL.CATS.filter(function (c) { return c.id === L.cat; })[0];
      var card = document.createElement("div");
      card.className = "kit-card kl-card"; card.dataset.loop = L.id; card.dataset.cat = L.cat;
      card.style.setProperty("--kc", cat.color);
      card.innerHTML = '<button type="button" class="kl-main" title="Preview"><span class="kc-name"></span><span class="kc-meta"></span><span class="kc-desc"></span></button>' +
        '<div class="kl-actions"><button type="button" class="btn small ghost kl-prev">▶ Preview</button><button type="button" class="btn small primary kl-load">Load</button></div>';
      card.querySelector(".kc-name").textContent = L.name;
      card.querySelector(".kc-desc").textContent = L.desc;
      card.querySelector(".kl-main").addEventListener("click", function () { klPreview(L.id); });
      card.querySelector(".kl-prev").addEventListener("click", function () { klPreview(L.id); });
      card.querySelector(".kl-load").addEventListener("click", function () { klLoad(L.id); });
      grid.appendChild(card);
    });
    klFilter(klCat);
    klRefreshCards();
  }
  function klOpen(open, where) {
    var kb = $("kl-browser");
    if (where && where !== klWhere) { $(where === "piano" ? "kl-host-piano" : where === "loops" ? "kl-host-loops" : "kl-host-beats").appendChild(kb); klWhere = where; if (open == null) open = true; }
    kb.hidden = open == null ? !kb.hidden : !open;
    $("kl-open").setAttribute("aria-expanded", String(!kb.hidden && klWhere === "beats"));
    $("pn-loops").setAttribute("aria-expanded", String(!kb.hidden && klWhere === "piano"));
    if (!kb.hidden) klRefreshCards();
  }
  function klStopPreview() {
    if (!klPrev) return;
    var P = klPrev, t = ctx ? ctx.currentTime : 0;
    klPrev = null; P.dead = true; // the feed loop checks this first: nothing more is scheduled
    clearTimeout(P.timer); clearTimeout(P.feedT);
    P.voices.forEach(function (v) { if (v && v.stop) v.stop(t); }); // every scheduled voice, started or not: 12 ms fade, then stopped
    P.voices.length = 0;
    klRefreshCards();
  }
  /* one pass of the loop (repeated up to 4 bars), in the song key at the song BPM + swing */
  var klLoading = null, KL_VOICES = 16;
  function klPreview(id) {
    if (klPrev && klPrev.id === id) { klStopPreview(); return; }
    klStopPreview();
    if (!ensureCtx()) return;
    var Li = KL.BY_ID[id], need = Li && (Li.insts || [Li.inst]);
    if (need && PK.ready && !PK.ready(need)) { // sampled loops (none today): fetch their sample sets first (once), then preview
      if (klLoading === id) return;
      klLoading = id;
      toast("Loading samples for “" + Li.name + "”…");
      PK.load(need).then(function () { if (klLoading === id) { klLoading = null; klPreview(id); } });
      return;
    }
    klLoading = null;
    var p = klBuild(id), sd = stepDur(), tick = sd / PD.STEP, L = p.bars * PD.TPBAR, passes = Math.max(1, Math.round(4 / p.bars));
    var t0 = ctx.currentTime + 0.08, synced = false;
    if (playing && drumsOn() && matchCfg().sync) { var barK = Math.ceil(curK / STEPS) * STEPS; t0 = nextTime + (barK - curK) * sd; synced = true; }
    var voices = [], dest = pvDest(KL_NORM), evs = [];
    if (!dest) return;
    if (PK.setTempo) PK.setTempo(S.bpm);
    if (PK.setFeel) PK.setFeel(S.feel);
    for (var r = 0; r < passes; r++) {
      feelNotes(p.notes.map(function (n) {
        var s16 = Math.floor(n.s / PD.STEP), sw = (n.s % PD.STEP === 0 && s16 % 2 === 1) ? sd * (S.swing / 100) : 0;
        return { n: n, t: t0 + (r * L + n.s) * tick + sw };
      }), r + 1, p.inst).forEach(function (f) { evs.push(f); });
    }
    evs.sort(function (a, b) { return a.t - b.t; });
    var end = t0 + passes * L * tick;
    klPrev = { id: id, t0: t0, end: end, synced: synced, voices: voices, notes: evs.length };
    // notes are created just in time (0.35 s ahead), not all at once: no CPU spike on the tablet while the beat plays
    // one feed loop per preview with a cursor (ei): each note is scheduled exactly once; identical notes (same pitch and time) are skipped;
    // finished voices leave the list; above KL_VOICES the oldest sounding voice is released (steal) so a pad can't pile up
    var P0 = klPrev, ei = 0, seen = {}, feed = function () {
      if (P0.dead || klPrev !== P0) return;
      clearTimeout(P0.feedT);
      var now = ctx.currentTime, lim = now + 0.35;
      for (var vi = voices.length - 1; vi >= 0; vi--) if (!voices[vi] || voices[vi].end <= now) voices.splice(vi, 1);
      while (ei < evs.length && evs[ei].t < lim) {
        var f = evs[ei++], n = f.n, at = Math.max(ctx.currentTime + 0.005, f.t), key = (n.i || "") + ":" + n.p + "@" + Math.round(f.t * 200);
        if (seen[key]) continue; seen[key] = 1;
        while (voices.length >= KL_VOICES) { var old = voices.shift(); if (old && old.stop) old.stop(Math.max(now, at - 0.02)); }
        var v = PK.play(ctx, dest, n.p, at, n.l * tick, f.v, n.i || p.inst, PD.gainLin(p), n.i ? null : p.tone);
        if (v) voices.push(v);
        if (window.__ipbTD) window.__ipbTD.trig({ kind: "keys-loop", src: "keysloop:" + id, note: (n.i || p.inst) + " " + n.p, when: f.t, voices: voices.length, ready: true });
      }
      if (ei < evs.length || voices.length) P0.feedT = setTimeout(feed, 60);
    };
    feed();
    klPrev.timer = setTimeout(function () { if (klPrev && klPrev.id === id) { klPrev = null; klRefreshCards(); } }, (end - ctx.currentTime) * 1000 + 400);
    klRefreshCards();
    var Lp = KL.BY_ID[id];
    toast("Preview: " + Lp.name + " · " + KL.keyLabel(Lp, S.songKey) + " · " + S.bpm + " BPM" + (synced ? " · joins on the next bar" : ""));
  }
  /* keys loops + Piano Roll play through the "Piano Roll" mixer channel: if it is at 0 or muted, say so (with a one-tap fix) instead of silence */
  function pianoChannelCheck() {
    var el = $("piano-down");
    if (mixGain("piano") !== 0) { if (el) el.hidden = true; return; }
    if (!el) {
      el = document.createElement("button"); el.type = "button"; el.id = "piano-down"; el.className = "audio-paused piano-down";
      el.addEventListener("click", function () {
        var m = S.mixer.piano; if (m.v === 0) m.v = defaultMixer().piano.v; m.m = false;
        buildMixer(); applyMixer(); saveSession(); el.hidden = true; toast("Piano Roll channel back on (" + Math.round(m.v * 100) + "%)");
      });
      document.body.appendChild(el);
    }
    el.textContent = "🔇 The Piano Roll channel is " + (S.mixer.piano.m ? "muted" : "turned down to 0") + " in the Mixer, so keys loops are silent. Tap to fix.";
    el.hidden = false;
    clearTimeout(el._t); el._t = setTimeout(function () { el.hidden = true; }, 10000);
  }
  function klLoad(id) {
    var L = KL.BY_ID[id];
    if (!L) return;
    var target = klTarget(), cur = S.piano.slots[target];
    if (PD.hasNotes(cur) && !(cur.src === "kl:" + id) && !confirm("Replace piano pattern " + target + " (" + cur.notes.length + " notes) with “" + L.name + "”?")) return;
    klStopPreview();
    var autoKey = S.songKey == null;
    if (autoKey) S.songKey = L.keyPc;
    var pat = PD.normalize(klBuild(id), instOk);
    S.piano.slots[target] = pat;
    if ($("kl-tempo").checked && S.bpm !== L.bpm) { S.bpm = L.bpm; $("bpm").value = S.bpm; lastPosLabel = ""; }
    if (target !== S.piano.slot) pianoSwitchSlot(target);
    pianoUI(true, true); saveSession();
    klKeyUI(); klBarUI(); klRefreshCards();
    var msg = "Loaded “" + L.name + "” into Piano Roll pattern " + target + " · " + PD.NOTE_NAMES[pat.key] + " " + (KL.MODE_NAMES[pat.scale] || pat.scale) +
      (autoKey ? " (song key set)" : "") + " · " + S.bpm + " BPM";
    if (btActive() && !bt.layer) msg += " — tick “Layer drum machine” to hear it with the instrumental";
    else if (!playing) msg += " — press ▶ to hear it with the drums";
    toast(msg); pianoChannelCheck();
  }
  /* song key change: loops loaded from the bank follow it (hand-drawn patterns are left alone) */
  function klSetSongKey(v) {
    var k = v === "" || v == null ? null : clamp(Math.round(+v), 0, 11);
    S.songKey = k;
    var moved = 0;
    if (k != null) SLOT_IDS.forEach(function (id) {
      var p = S.piano.slots[id];
      if (!p.src || p.src.indexOf("kl:") !== 0 || p.key === k) return;
      var d = (((k - p.key) % 12) + 12) % 12; if (d > 6) d -= 12;
      if (PD.transpose(p, d) || PD.transpose(p, d > 0 ? d - 12 : d + 12)) { p.key = k; moved++; }
    });
    if (moved) pianoUI(true);
    klStopPreview();
    saveSession(); klKeyUI(); klBarUI(); klRefreshCards();
    toast(k == null ? "Song key: Auto — the next loop you load sets it" : "Song key: " + KL.KEY_NAMES[k] + (moved ? " · moved " + moved + " loaded loop pattern" + (moved > 1 ? "s" : "") : ""));
  }
  function klInit() {
    document.querySelectorAll(".js-songkey").forEach(function (sel) {
      var o = document.createElement("option"); o.value = ""; o.textContent = "Auto (first loop sets it)"; sel.appendChild(o);
      KL.KEY_NAMES.forEach(function (n, i) { var x = document.createElement("option"); x.value = String(i); x.textContent = n; sel.appendChild(x); });
      sel.addEventListener("change", function () { klSetSongKey(sel.value); });
    });
    klKeyUI();
    $("kl-tempo").checked = !!S.klTempo;
    $("kl-tempo").addEventListener("change", function (e) { S.klTempo = e.target.checked; saveSession(); });
    $("kl-slot").addEventListener("change", klRefreshCards);
    $("kl-open").addEventListener("click", function () { klOpen(klWhere === "beats" ? null : true, "beats"); });
    $("pn-loops").addEventListener("click", function () { klOpen(klWhere === "piano" ? null : true, "piano"); });
    $("kl-close").addEventListener("click", function () { klOpen(false); });
    $("kl-stop").addEventListener("click", klStopPreview);
    klBuildBrowser();
    klReady = true;
    klBarUI();
  }

  /* ---------------- Toast ---------------- */
  var toastTimer = null;
  function toast(msg) {
    var el = $("ipb-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "ipb-toast";
      el.className = "toast";
      el.setAttribute("role", "status");
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove("show"); }, 2600);
  }

  /* ---------------- Wiring ---------------- */
  function isTyping(e) {
    var t = e.target;
    return t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT") && t.type !== "range" && t.type !== "checkbox";
  }
  // tab names for ?tab= / #hash deep links. "video" is the visualizer/capture panel (it was labelled "Studio" before Oct 2026);
  // "studio" is the multitrack recorder (studio/ embedded). "visualizer" and "capture" are extra aliases for the video panel.
  var TAB_ALIAS = { beats: "beats", piano: "piano", "piano-roll": "piano", pianoroll: "piano", studio: "studio", multitrack: "studio", lyrics: "lyrics", mixer: "mixer", video: "video", visualizer: "video", capture: "video", vault: "vault", master: "master", mastering: "master", daw: "beats", arrange: "beats", loops: "loops", "keys-loops": "loops", keysloops: "loops" };
  function studioWin() { var f = $("studio-frame"); try { return f && f.contentWindow && f.contentWindow.IPBStudio ? f.contentWindow : null; } catch (e) { return null; } }
  function studioEnsure() {
    var f = $("studio-frame");
    if (!f) {
      f = document.createElement("iframe");
      f.id = "studio-frame"; f.className = "studio-frame"; f.title = "Island Pin Studio multitrack";
      f.setAttribute("allow", "microphone; autoplay; fullscreen");
      var vq = ""; try { vq = new URLSearchParams(location.search).get("vault") || ""; } catch (e) { vq = ""; }
      f.src = "studio/?embed=1" + (vq ? "&vault=" + encodeURIComponent(vq) : "");
      $("studio-host").appendChild(f);
    }
    return new Promise(function (res) {
      (function wait(n) { var w = studioWin(); if (w && w.IPBStudio.ready) res(w); else if (n > 300) res(null); else setTimeout(function () { wait(n + 1); }, 50); })(0);
    });
  }
  // Split pages (Oct 2026): each section is its own page (beats.html, studio.html, …). <html data-solo="x"> pins this page to
  // one panel; asking for another panel saves the session and goes to that page (same-origin storage keeps the beat).
  var SOLO = document.documentElement.getAttribute("data-solo") || "";
  var PAGE_OF = { beats: "beats.html", piano: "piano.html", loops: "loops.html", studio: "studio.html", lyrics: "lyrics.html", mixer: "mixer.html", master: "master.html", video: "video.html", vault: "vault.html" };
  function goPage(name, qs) { if (playing) stop(); try { saveSession(); } catch (e) { /* storage */ } location.href = PAGE_OF[name] + (qs || ""); }
  function showTab(name) {
    if (SOLO && name !== SOLO && PAGE_OF[name]) { goPage(name); return; }
    if (!document.querySelector('.tab[data-tab="' + name + '"]')) return;
    var prev = activeTab;
    activeTab = name;
    if (prev !== name && klPrev && name !== "loops") klStopPreview(); // a keys-loop preview never keeps playing on another tab (Loops page is its home)
    document.querySelectorAll(".tab[data-tab]").forEach(function (x) {
      var on = x.dataset.tab === name;
      x.classList.toggle("active", on);
      x.setAttribute("aria-selected", on ? "true" : "false"); if(on) try{var nv=x.parentNode;nv.scrollLeft=x.offsetLeft-(nv.clientWidth-x.offsetWidth)/2;}catch(e){} /* never scrollIntoView: it scrolled the whole page to the bottom on load */
    });
    document.querySelectorAll(".panel").forEach(function (p) {
      p.classList.toggle("active", p.id === "tab-" + activeTab);
    });
    if (prev === "studio" && name !== "studio") { var w = studioWin(); if (w) w.IPBStudio.pause(); }
    if (name === "studio") { if (playing) stop(); studioEnsure(); }
    if (activeTab === "vault") renderVault();
    try { document.dispatchEvent(new CustomEvent("ipb-tab", { detail: name })); } catch (e) { /* old browsers */ }
    if (activeTab === "lyrics" && ly.preview) { ly.preview.tops = null; }
    if (activeTab === "mixer") updateLatencyLabel();
    if (activeTab === "piano") pianoShown();
    if (name === "loops") klOpen(true, "loops");
    if (SOLO) return;
    try { localStorage.setItem("ipb_page_v1", name); var q = new URLSearchParams(location.search); q.set("tab", name); q.delete("page"); history.replaceState(null, "", location.pathname + "?" + q.toString() + location.hash); } catch (e) { /* private mode */ }
  }
  function bounceForStudio(bars) { // called by the embedded Studio: bounce the current beat → Vault id
    if (playing) stop();
    return new Promise(function (res, rej) { bounce(bars || $("bounce-bars").value, res, rej); });
  }
  var KEYMAP = { a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12 };
  function wire() {
    document.querySelectorAll(".tab[data-tab]").forEach(function (t) {
      t.addEventListener("click", function () { showTab(t.dataset.tab); });
    });
    // DJ tab: a real page switch (/dj/?from=beats has a "← Back to Beats" button). Beats state is saved first.
    var djTab = $("tab-dj-link");
    if (djTab) djTab.addEventListener("click", function () { if (playing) stop(); saveSession(); djTab.href = "../dj/?from=beats&back=" + encodeURIComponent(activeTab); });
    var stLink = document.querySelector(".studio-link");
    if (stLink) stLink.addEventListener("click", function (e) { if (e.ctrlKey || e.metaKey || e.shiftKey) return; e.preventDefault(); showTab("studio"); });
    var tabQ = null;
    try { var sp = new URLSearchParams(location.search); tabQ = (sp.get("tab") || sp.get("page") || location.hash.replace(/^#/, "") || localStorage.getItem("ipb_page_v1") || "").toLowerCase(); } catch (e) { tabQ = null; }
    if (SOLO) showTab(SOLO); else if (tabQ && TAB_ALIAS[tabQ]) showTab(TAB_ALIAS[tabQ]);
    $("btn-play").addEventListener("click", togglePlay);
    $("btn-stop").addEventListener("click", function () {
      if (vox.state !== "idle") { stopVocalTake(); return; }
      stop(); S.cueBar = 0; prForceScroll = true; saveSession();
    });
    var bpm = $("bpm");
    bpm.value = S.bpm;
    bpm.addEventListener("change", function () {
      S.bpm = clamp(+bpm.value || 140, 60, 200);
      bpm.value = S.bpm;
      lastPosLabel = "";
      saveSession();
    });
    var fe = $("feel");
    if (fe) fe.addEventListener("change", function () {
      S.feel = FEEL.norm(fe.value); feelUI(); saveSession();
      toast("Feel: " + FEEL.LABEL[S.feel] + (S.feel === "off" ? " (exact grid, fixed velocity tone)" : S.feel === "tight" ? " (trap-tight, subtle variation)" : S.feel === "live" ? " (drummer push/pull + ghost notes)" : " (played, genre-aware)"));
    });
    feelUI();
    var sw = $("swing");
    sw.value = S.swing;
    sw.addEventListener("input", function () {
      S.swing = +sw.value; S.kitSwing[S.kit] = S.swing;
      $("swing-val").textContent = mpcSwing(S.swing) + "%";
      saveSession();
    });
    $("kit-open").addEventListener("click", function () { openKitBrowser(); });
    $("kb-close").addEventListener("click", function () { openKitBrowser(false); });
    $("btn-fresh").addEventListener("click", freshBeat);
    $("btn-demo").addEventListener("click", function () {
      if (playing && !arrangement()) stop();
      loadStarter(S.kit);
      $("bpm").value = S.bpm;
      refreshKitUI(); repaintSeq(); saveSession();
      toast(kitName(S.kit) + " starter · " + S.bpm + " BPM · swing " + mpcSwing(S.swing) + "%");
    });
    $("groove-pick").addEventListener("change", function () {
      var k = kitDef(S.kit), pre = (k.presets || [])[+this.value];
      this.value = "";
      if (!pre) return;
      if (playing && !arrangement()) stop();
      loadStarter(S.kit, pre);
      $("bpm").value = S.bpm;
      refreshKitUI(); repaintSeq(); saveSession();
      toast(k.name + " · " + pre.name + " · " + S.bpm + " BPM");
    });
    $("btn-clear-row").addEventListener("click", function () {
      var p = S.sel;
      S.pattern[p].fill(0); S.vel[p].fill(0.8); S.note[p].fill(0); S.slide[p].fill(0);
      repaintSeq(); saveSession();
    });
    $("btn-pad-reset").addEventListener("click", function () { resetPad(S.sel); });
    $("btn-pad-layer").addEventListener("click", function () { lyOpen({ kind: "drum", pad: S.sel }); });
    $("cl-layer").addEventListener("click", function () { lyOpen({ kind: "chord" }); });
    PE.forEach(function (pe) {
      var el = $("pad-" + pe.id);
      el.addEventListener("input", function () {
        var cfg = padCfg(S.sel);
        cfg[pe.key] = +el.value;
        $("pad-" + pe.id + "-val").textContent = pe.fmt(cfg[pe.key]);
        if (LG) stripApply(LG, S.sel, ctx.currentTime);
        if (lyT) lyRefresh();
        lyDots();
        saveSession();
      });
      el.addEventListener("change", function () { if (!playing) triggerPad(S.sel); });
    });
    $("pe-mute").addEventListener("click", function () { toggleMS("m", S.sel); });
    $("pe-solo").addEventListener("click", function () { toggleMS("s", S.sel); });
    document.querySelectorAll("#slots button[data-slot]").forEach(function (b) {
      b.addEventListener("click", function () { switchSlot(b.dataset.slot); });
    });
    $("btn-dup").addEventListener("click", function () {
      var from = S.slot, nx = SLOT_IDS[(SLOT_IDS.indexOf(from) + 1) % SLOT_IDS.length];
      if (slotHasNotes(S.slots[nx]) && !confirm("Overwrite pattern " + nx + " with a copy of " + from + "?")) return;
      S.slots[nx] = slotCopy(curSlot());
      switchSlot(nx);
      toast("Copied pattern " + from + " → " + nx);
    });
    document.querySelectorAll("#len-seg button").forEach(function (b) {
      b.addEventListener("click", function () { setLen(+b.dataset.len); });
    });
    document.querySelectorAll("#page-seg button").forEach(function (b) {
      b.addEventListener("click", function () { S.page = +b.dataset.page; seqLayout(); });
    });
    document.querySelectorAll("#tool-seg button").forEach(function (b) {
      b.addEventListener("click", function () { S.tool = b.dataset.tool; seqLayout(); saveSession(); });
    });
    document.querySelectorAll("#lane-seg button").forEach(function (b) {
      b.addEventListener("click", function () { S.lane = b.dataset.lane; buildLane(); });
    });
    $("btn-rec").addEventListener("click", startRec);
    $("btn-rec-stop").addEventListener("click", stopRec);
    $("btn-bounce").addEventListener("click", function () { bounce($("bounce-bars").value); });
    $("btn-to-studio").addEventListener("click", function () {
      stop();
      bounce($("bounce-bars").value, function (id) {
        if (SOLO && SOLO !== "studio") { goPage("studio", "?vault=" + encodeURIComponent(id)); return; }
        showTab("studio");
        studioEnsure().then(function (w) {
          if (!w) { location.href = "studio/?vault=" + encodeURIComponent(id); return; }
          w.IPBStudio.importVaultId(id);
        });
      });
    });
    $("btn-send-player").addEventListener("click", function () { bounceAndSend("player"); });
    $("btn-send-dj").addEventListener("click", function () { bounceAndSend("dj"); });
    $("vox-send-player").addEventListener("click", function () { sendVocal("player"); });
    $("vox-send-dj").addEventListener("click", function () { sendVocal("dj"); });
    if (/[?&]studio=1/.test(location.search)) setTimeout(function () { // came from the Studio's Import menu
      var b = $("btn-to-studio"); b.classList.add("primary"); b.scrollIntoView({ block: "center" });
      toast("Make or load a beat, pick the length, then press Send to Studio →");
    }, 900);
    wireSongFeatures();
    $("key-oct").addEventListener("change", buildPiano);

    ["cv-169", "cv-916"].forEach(function (id) {
      $(id).addEventListener("click", function () {
        var cv = $(id);
        if (document.fullscreenElement || document.webkitFullscreenElement) {
          (document.exitFullscreen || document.webkitExitFullscreen).call(document);
        } else {
          var fn = cv.requestFullscreen || cv.webkitRequestFullscreen;
          if (fn) fn.call(cv);
        }
      });
    });

    var held = {};
    window.addEventListener("keydown", function (e) {
      if (isTyping(e) || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      var k = e.key.toLowerCase();
      if (k === " ") { e.preventDefault(); togglePlay(); return; }
      if (k === "escape" && ly.open) { closePrompter(); return; }
      if (ly.open) return; // no pad/key triggers behind the teleprompter
      if (k === "r" || k === "`" || e.code === "Backquote") { e.preventDefault(); refToggleAB(); return; }
      var pi = PAD_KEYS.indexOf(k);
      if (pi !== -1) { triggerPad(pi); flashPad(pi); return; }
      if (KEYMAP[k] != null && !held[k]) { held[k] = true; pianoDown(KEYMAP[k]); }
    });
    window.addEventListener("keyup", function (e) {
      var k = e.key.toLowerCase();
      if (held[k]) { held[k] = false; pianoUp(KEYMAP[k]); }
    });
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) Object.keys(keyVoices).forEach(noteOff);
    });
  }

  function wireSongFeatures() {
    // Lyrics tab
    ly.preview = new LyricView($("ly-preview"), $("ly-preview-lines"), false);
    ly.prompter = new LyricView($("pr-scroll"), $("pr-lines"), true);
    $("ly-song").addEventListener("change", function (e) { selectLyricSong(e.target.value); });
    $("ly-text").addEventListener("input", function () {
      setDirty(true);
      clearTimeout(ly.renderTimer);
      ly.renderTimer = setTimeout(renderLyrics, 180);
    });
    $("ly-save").addEventListener("click", saveLyrics);
    $("ly-new").addEventListener("click", function () { if (!ly.dirty || confirm("Discard unsaved lyric changes?")) newSong(false); });
    $("ly-saveas").addEventListener("click", function () { newSong(true); });
    $("ly-del").addEventListener("click", deleteSong);
    $("ly-reset").addEventListener("click", resetBuiltin);
    $("ly-loadbeat").addEventListener("click", function () {
      var cur = getSong(S.lyricSong);
      if (cur) applySongPreset((cur.builtin ? "b:" : "u:") + cur.id);
    });
    document.querySelectorAll(".js-open-prompter").forEach(function (b) { b.addEventListener("click", openPrompter); });
    document.querySelectorAll(".js-vox").forEach(function (b) { b.addEventListener("click", startVocalTake); });
    // Teleprompter
    $("pr-close").addEventListener("click", closePrompter);
    $("pr-play").addEventListener("click", togglePlay);
    $("pr-top").addEventListener("click", function () { cueTo(0); });
    $("pr-bpl").addEventListener("change", function (e) { S.bpl = e.target.value; saveSession(); renderLyrics(); });
    $("pr-size").addEventListener("input", function (e) {
      S.prSize = +e.target.value;
      $("prompter").style.setProperty("--pr-scale", S.prSize);
      ly.prompter.tops = null; prForceScroll = true; saveSession();
    });
    $("pr-fs").addEventListener("click", function () {
      var el = $("prompter");
      if (document.fullscreenElement) document.exitFullscreen();
      else if (el.requestFullscreen) el.requestFullscreen().catch(function () {});
    });
    window.addEventListener("resize", function () { ly.prompter.tops = null; ly.preview.tops = null; prForceScroll = true; });
    // Song bar
    secWire();
    $("song-preset").addEventListener("change", function (e) { applySongPreset(e.target.value); });
    $("struct-sel").addEventListener("change", function (e) {
      if (playing) stop();
      leaveEdit(true);
      S.structure = e.target.value || null; S.cueBar = 0; dropAllSecStrips();
      renderTimelines(); renderLyrics(); syncPrompterControls(); saveSession();
    });
    // Chord loop
    $("cl-on").addEventListener("change", function (e) {
      S.chordTrack.on = e.target.checked;
      if (!S.chordTrack.on && ctx) cutChords(chordLive, ctx.currentTime);
      $("cl-wrap").classList.toggle("off", !S.chordTrack.on);
      saveSession();
    });
    $("cl-bars").addEventListener("change", function (e) { S.chordTrack.bars = +e.target.value; saveSession(); });
    $("cl-sound").addEventListener("change", function (e) { S.chordTrack.sound = e.target.value; saveSession(); });
    $("cl-bass").addEventListener("change", function (e) { S.chordTrack.bassFollow = e.target.checked; saveSession(); });
    // Vocal settings (Mixer tab)
    $("vox-monitor").checked = S.vox.monitor;
    $("vox-dry").checked = S.vox.dry;
    $("vox-nudge").value = S.vox.nudge;
    $("vox-monitor").addEventListener("change", function (e) {
      S.vox.monitor = e.target.checked; applyMixer(); saveSession(); hpUI();
      if (S.vox.monitor) toast(hpMode() === "hp" ? "🎧 Monitoring on — headphones only. On a speaker the mic would howl (feedback)." : "Monitoring stays silent while No headphones — voice only is ON (the mic would howl).", 4200);
    });
    $("vox-dry").addEventListener("change", function (e) { S.vox.dry = e.target.checked; saveSession(); });
    $("vox-nudge").addEventListener("change", function (e) {
      S.vox.nudge = clamp(Math.round(+e.target.value || 0), -300, 300);
      e.target.value = S.vox.nudge; saveSession();
    });
    $("vox-remix").addEventListener("click", function () { exportVocalMix(false); });
    $("vox-playtake").addEventListener("click", voxPlayTake);
    $("vox-check").addEventListener("click", function () { vox.check ? stopMicCheck() : startMicCheck(); });
    initVocalClean();
    window.addEventListener("beforeunload", function (e) {
      if (ly.dirty || vox.state === "rec") { e.preventDefault(); e.returnValue = ""; }
    });
  }

  function init() {
    window.__ipbReady=true; var _boot=document.getElementById("boot"); if(_boot) _boot.remove();
    var had = loadSession();
    if (!had) loadStarter(DEFAULT_KIT);
    var migrated = migratePads();
    loadSongStore();
    buildPads();
    buildChords();
    buildPiano();
    buildMixer(); buildVxFx(); voButtons();
    document.addEventListener("input", function (e) { if (e.target.classList && e.target.classList.contains("js-samplevol")) setSampleVol(e.target.value); });
    document.addEventListener("click", function (e) { var b = e.target.closest && e.target.closest(".js-match"); if (b) setMatch(b.dataset.k, !matchCfg()[b.dataset.k]); });
    svUI(); matchUI();
    wire();
    renderChordLoopUI();
    renderTimelines();
    refreshSongPickers();
    selectLyricSong(S.lyricSong, true);
    syncPrompterControls();
    setVoxButtons();
    renderLastTake();
    updateLatencyLabel();
    if (!window.isSecureContext) setVoxStatus("Mic recording needs HTTPS or localhost — this page isn't a secure context.", true);
    buildKitBrowser();
    refreshKitUI();
    window.addEventListener("resize", function () { seqLayout(); });
    migrated.then(function () { return loadKit(S.kit, true); }).then(function () { selectPad(S.sel); });
    renderVault();
    refInit();
    LIB.init().then(function () { libSync(true); libLabels(); }, function () { /* offline with no cached manifest: layers keep the kit sounds */ });
    LIB.onLoad(function () { libLabels(); });
    btInit();
    pianoInit();
    klInit();
    requestAnimationFrame(loop);
  }

  /* read-only status for automated tests / debugging */
  window.IPBBeats = {
    sections: {
      select: function (i) { selectSec(i); return edSec; }, whole: function () { leaveEdit(); return edSec; },
      reset: function () { secReset(); }, copy: function () { secCopyToSame(); },
      state: function () { var A = arrangement(); return { edSec: edSec, curCtx: curCtx, label: edSec >= 0 ? secLabel(edSec) : "Whole song", changed: A ? A.map(function (s, j) { return secChanged(j); }) : [], ov: withSong(function () { return secOvSave(); }) }; },
      feelOf: function (i) { return secFeel(i); }
    },
    /* Master tab (master/master.js): sources, reference, Vault, settings storage */
    master: {
      ctx: function () { return ensureCtx(); },
      park: function () { return park(); }, unpark: function () { unpark(); }, parked: function () { return !!parked; },
      stopBeat: function () { if (playing) stop(); if (vpv && vpv.src) voxPrevStop(true); },
      isPlaying: function () { return playing; },
      renderBeat: function (sel, onProg) {
        return new Promise(function (res, rej) {
          var need = libIds().filter(function (id) { return !LIB.get(id); });
          (need.length ? LIB.want(need, ctx || ensureCtx()) : Promise.resolve()).then(function () { return PK.ready && !PK.ready(pianoInsts()) ? pianoSamplesLoad() : null; }).then(function () {
            var r = renderOffline(sel || "song", onProg);
            if (r.err) { rej(new Error(r.err)); return; }
            r.promise.then(function (buf) {
              var off = Math.round(GRAPH_LAT * SR), frames = Math.min(Math.round((r.total * r.sd + 0.8) * SR), buf.length - off);
              res({ L: buf.getChannelData(0).slice(off, off + frames), R: buf.getChannelData(1).slice(off, off + frames), sr: SR, name: r.songMode ? "Beat · full song" : "Beat · " + r.bars + " bars" });
            }, rej);
          }, rej);
        });
      },
      hasVocal: function () { return !!vox.last; }, hasSong: function () { return !!arrangement(); },
      /* signature of what the Beat mix would contain: changes after an edit → Master offers "Refresh from current song" */
      songSig: function () { var d = ""; try { d = localStorage.getItem(SESSION_KEY) || ""; var o = JSON.parse(d); delete o.master; delete o.tab; d = JSON.stringify(o); } catch (e) { /* private */ } var h = 0; for (var i = 0; i < d.length; i++) h = (h * 31 + d.charCodeAt(i)) | 0; return h + ":" + d.length + ":" + (vox.last ? vox.last.frames : 0); },
      vocalMix: function () {
        var t = vox.last; if (!t) return Promise.resolve(null);
        return vocalMixFx(t).then(function (mx) { return { L: mx.L, R: mx.R, sr: t.sr, name: "Last vocal take" + (t.title ? " · " + t.title : "") }; });
      },
      reference: function () { return ref.playBuf || ref.buf || null; },
      refName: function () { return ref.loaded ? (ref.name || "Reference") : ""; },
      vaultList: function () { return idb("vault", "readonly", function (st) { return st.getAll(); }).then(function (a) { return (a || []).concat(memVault); }, function () { return memVault.slice(); }); },
      vaultGet: vaultGet,
      saveToVault: function (blob, dur, label) { return new Promise(function (res, rej) { saveToVault(blob, dur, label, res, rej); }); },
      studio: function () { studioEnsure(); return studioWin(); },
      saved: function () { return S.master || null; },
      save: function (st) { S.master = st; saveSession(); },
      toast: toast, title: function () { return btActive() ? bt.title : songTitle(); }, bpm: function () { return S.bpm; }
    },
    /* Sampler / pad assignments (sampler.js): bridges into the sequencer, piano patterns, sections and songs. */
    padBridge: {
      playing: function () { return playing; }, bpm: function () { return S.bpm; },
      kitPads: function () { return kitDef(S.kit).pads.map(function (p) { return p.n; }); },
      switchSlot: function (id) { switchSlot(id); },
      pianoSwitch: function (id) { if (playing) pianoPending = id; else { S.piano.slot = id; pianoUI(true, true); saveSession(); } },
      sections: function () { var A = arrangement(); return A ? A.map(function (s, idx) { return { i: idx, label: secLabel(idx), bars: s.bars }; }) : []; },
      section: function (i) { var A = arrangement(); if (!A || !A[i]) return false; var b = 0; for (var j = 0; j < i; j++) b += A[j].bars; cueTo(b); return true; },
      songs: function () { var out = []; BUILTIN_SONGS.forEach(function (b) { if (b.preset) out.push({ val: "b:" + b.id, title: b.title + " · built-in beat" }); }); songStore.songs.forEach(function (s) { if (s.beat) out.push({ val: "u:" + s.id, title: s.title + " · my song beat" }); }); return out; },
      applySong: function (val) { window.__ipbPadNoConfirm = true; try { return applySongPreset(val); } finally { window.__ipbPadNoConfirm = false; } },
      play: function () { play(); },
      barMs: function () { return stepDur() * STEPS * 1000; },
      posSteps: function () { return currentPosK(); },
      loopName: function () { var L = klSlotLoop(S.piano.slot); return L ? L.name : null; },
      toast: toast
    },
    bounceForStudio: bounceForStudio, showTab: showTab, activeTab: function () { return activeTab; },
    /* built-in Helper (helper.js): quick checks of the beat / mix / vocal, each with a one-tap fix where there is a safe one */
    helperChecks: function () {
      var out = [], refreshMix = function () { applyMixer(); buildMixer(); saveSession(); };
      if (!ctx) out.push({ level: "tip", text: "Sound isn't started yet: tap any pad (or ▶) once and the audio engine wakes up." });
      if (livePeak >= 0.985) out.push({ level: "warn", text: "Your beat hit the ceiling during playback (the safety clipper had to work, which can sound crunchy).", fix: { label: "Master −2 dB", run: function () { S.mixer.master.v = +(S.mixer.master.v * 0.79).toFixed(3); livePeak = 0; refreshMix(); return "Master fader down 2 dB"; } } });
      var muted = GROUPS.filter(function (g) { var m = S.mixer[g.id]; return m && (m.m || m.v === 0); });
      if (muted.length) out.push({ level: "warn", text: "Muted / silent channels: " + muted.map(function (g) { return g.name; }).join(", ") + ".", fix: { label: "Bring them back", run: function () { var d = defaultMixer(); muted.forEach(function (g) { var m = S.mixer[g.id]; m.m = false; if (m.v === 0) m.v = d[g.id].v; }); refreshMix(); return "Channels back on"; } } });
      if (S.mixer.vocal && (S.mixer.vocal.m || S.mixer.vocal.v === 0) && vox.last) out.push({ level: "warn", text: "The Vocal channel is muted / at zero, so your take is silent.", fix: { label: "Unmute vocal", run: function () { S.mixer.vocal.m = false; if (!S.mixer.vocal.v) S.mixer.vocal.v = VOC_FADER0; refreshMix(); return "Vocal back on"; } } });
      var t = vox.last;
      if (t) {
        if (!S.vox.auto) {
          var rel = t.vocLufs != null && t.beatLufs != null ? t.vocLufs + 20 * Math.log10(Math.max(1e-4, mixGain("vocal"))) - t.beatLufs : null;
          var txt = rel != null && rel < -5 ? "Vocal is buried: about " + Math.round(-rel) + " dB under the beat." : rel != null && rel > 5 ? "Vocal is very loud: about " + Math.round(rel) + " dB over the beat." : "Your vocal isn't level-matched to the beat yet (Auto match is off).";
          out.push({ level: rel != null && Math.abs(rel) > 5 ? "warn" : "tip", text: txt, fix: { label: "Auto-match vocal", run: function () { S.vox.auto = true; t.autoDb = null; buildVxFx(); vxChanged(); return "Auto match on: the vocal follows the beat level"; } } });
        }
        if (S.vox.fxOff) out.push({ level: "warn", text: "Vocal FX are bypassed (FX A/B is on OFF), so effect changes won't be heard.", fix: { label: "FX back on", run: function () { vxToggleAB(); return "Vocal FX on"; } } });
        else if (!FXC.anyOn(S.vox.fx)) out.push({ level: "tip", text: "Your vocal has no effects. A little compression and room reverb usually sits it in the beat (the raw take stays untouched).", fix: { label: "Add comp + reverb", run: function () { S.vox.fx = S.vox.fx || FXC.defaults(); S.vox.fx.comp.on = true; S.vox.fx.reverb.on = true; buildVxFx(); vxChanged(); return "Compressor + reverb on (Mixer → Vocal FX to adjust)"; } } });
      } else out.push({ level: "tip", text: "No vocal take yet: tap ● Record Vocals on the Beats tab (headphones give the cleanest take; no headphones? turn on “No headphones — voice only”)." });
      if (sampleVol() > 90) out.push({ level: "tip", text: "Sample previews are turned up very high (" + sampleVol() + "%), they can mask the beat.", fix: { label: "Samples to 70%", run: function () { setSampleVol(70); return "Sample volume 70%"; } } });
      if (S.feel === "off" && !S.swing) out.push({ level: "tip", text: "Feel is off and swing is 0, so the beat is quantized stiff. Try Feel “Natural” or swing 55–58 % for bounce." });
      if (!out.some(function (x) { return x.level === "warn"; })) out.push({ level: "ok", text: "Nothing wrong found: levels are safe, nothing muted, vocal matched." });
      return out;
    },
    lastSent: function () { return lastSent; }, sendOut: sendOut, djHref: djHref,
    info: function () {
      return {
        kit: S.kit, kitName: kitName(S.kit), bpm: S.bpm, swing: S.swing, mpcSwing: mpcSwing(S.swing), len: plen(), slot: S.slot,
        pendingSlot: pendingSlot, pads: kitDef(S.kit).pads.map(function (p) { return p.n; }),
        custom: customBuf.map(Boolean), livePeak: livePeak, playing: playing, graphLat: GRAPH_LAT,
        steps: S.pattern.map(function (r) { return r.slice(0, plen()).join(""); }),
        notes: S.note.map(function (r) { return r.slice(0, plen()); }),
        vels: S.vel.map(function (r) { return r.slice(0, plen()); }),
        mute: S.mute.slice(), solo: S.solo.slice(),
        cfg: JSON.parse(JSON.stringify(S.padCfg[S.kit] || [])),
        bufs: stockBufs.map(function (arr) {
          if (!arr || !arr[0]) return null;
          var d = arr[0].getChannelData(0), eq = 0, pk = 0;
          var nz = 0; // held (repeated) values among non-silent samples → sample-rate reduction / bit-crush signature
          for (var i = 0; i < d.length; i++) { var a = Math.abs(d[i]); if (a > pk) pk = a; if (i && a > 0.002) { nz++; if (d[i] === d[i - 1]) eq++; } }
          var sum = 0; arr.forEach(function (b) { var x = b.getChannelData(0); for (var j = 0; j < x.length; j += 7) sum += x[j] * ((j % 13) + 1); });
          return { n: arr.length, dur: +arr[0].duration.toFixed(3), peak: +pk.toFixed(4), eqFrac: +(eq / Math.max(1, nz)).toFixed(3), sum: sum };
        })
      };
    },
    audioDebug: function () { // read by ?tapdebug=1
      if (!ctx) return { ctx: "none yet" };
      var g = {};
      GROUPS.forEach(function (x) { var n = groupNodes[x.id]; g[x.id] = { v: +mixGain(x.id).toFixed(2), pk: n && n.an ? +peak(n.an).toFixed(3) : null }; });
      return { state: ctx.state, sr: ctx.sampleRate, t: +ctx.currentTime.toFixed(2), base: ctx.baseLatency, out: ctx.outputLatency, fader: +LG.fader.gain.value.toFixed(2), masterMix: +mixGain("master").toFixed(2),
        beatMon: beatMon ? +beatMon.gain.value.toFixed(2) : null, spk: spkGain ? +spkGain.gain.value.toFixed(2) : null, peak: masterAnalyser ? +peak(masterAnalyser).toFixed(3) : null,
        playing: playing, preview: !!klPrev, groups: g, sink: ctx.sinkId === undefined ? "" : String(ctx.sinkId) };
    },
    kits: function () { return D.KITS.map(function (k) { return k.id; }); },
    backing: function () {
      return { id: bt.id, title: bt.title, loading: bt.loading, dur: bt.buf ? bt.buf.duration : 0, sr: bt.buf ? bt.buf.sampleRate : 0, bpm: bt.bpm,
        layer: bt.layer, drumsOn: drumsOn(), playing: !!bt.src, pos: btPos(), bpmNow: S.bpm, recLength: $("rec-length").value,
        vox: vox.state, recSecs: recLengthSecs() };
    },
    piano: function () {
      var slots = {};
      SLOT_IDS.forEach(function (id) { slots[id] = S.piano.slots[id].notes.length; });
      return { slot: S.piano.slot, pending: pianoPending, pattern: PD.clone(pianoPat()), slots: slots, tick: pianoPlayTick(), voices: LG ? LG.preg.length : 0,
        lib: pianoLib ? pianoLib.items.map(function (it) { return { id: it.id, name: it.name, notes: it.pattern.notes.length }; }) : [],
        geom: pianoEd ? pianoEd.geom() : null, canUndo: pianoEd ? pianoEd.canUndo() : false, canRedo: pianoEd ? pianoEd.canRedo() : false,
        tool: pianoEd ? pianoEd.tool() : "", zoom: pianoEd ? pianoEd.zoomLevel() : 1, sel: pianoEd && pianoEd.selected() ? PD.clone(pianoEd.selected()) : null,
        instruments: PK.INSTRUMENTS.map(function (i) { return i.id; }) };
    },
    keysLoops: function () {
      return { count: KL.LOOPS.length, cats: KL.CATS.map(function (c) { return c.id; }), songKey: S.songKey, target: klTarget(), where: klWhere,
        open: !$("kl-browser").hidden, cat: klCat, loading: klLoading, visible: document.querySelectorAll(".kl-card:not([hidden])").length,
        preview: klPrev ? { id: klPrev.id, t0: klPrev.t0, end: klPrev.end, synced: klPrev.synced, notes: klPrev.notes, now: ctx.currentTime, kAt: klPrev.synced ? curK + (klPrev.t0 - nextTime) / stepDur() : null } : null,
        peakNow: ctx && masterAnalyser ? peak(masterAnalyser) : 0 };
    },
    /* tweakable layers (tests + the coming instrument library): T = { kind: "drum", pad } | { kind: "mel", slot, inst } | { kind: "chord" } */
    layers: {
      open: function (T) { lyOpen(T); }, close: lyClose, target: function () { return lyT ? JSON.parse(JSON.stringify(lyT)) : null; },
      cfg: function (T) { if (T.kind === "drum") T.kit = T.kit || S.kit; return JSON.parse(JSON.stringify(lyCfg(T))); },
      set: function (T, key, v) { if (T.kind === "drum") T.kit = T.kit || S.kit; lySet(T, key, v); },
      list: function () {
        var out = kitDef(S.kit).pads.map(function (d, i) { return { kind: "drum", pad: i, name: d.n, g: d.g, tweaked: LY.tweaked(padCfg(i), "drum", padBase(d)) }; });
        PD.instsOf(pianoPat()).forEach(function (id) { var T = { kind: "mel", slot: S.piano.slot, inst: id }; out.push({ kind: "mel", slot: T.slot, inst: id, name: klInstName(id), tweaked: lyTweaked(T) }); });
        out.push({ kind: "chord", name: "Chord loop", on: !!S.chordTrack.on, tweaked: LY.tweaked(chordCfg(), "mel") });
        return out;
      },
      undo: function () { lyHist.undo(); lyHistUI(); }, redo: function () { lyHist.redo(); lyHistUI(); },
      render: function (bars) { return LIB.want(libIds(), ctx).then(function () { var r = renderOffline(bars || 2); return r.err ? Promise.reject(new Error(r.err)) : r.promise; }); },
      save: saveSession,
      peakNow: function () { return ctx && masterAnalyser ? peak(masterAnalyser) : 0; }, playing: function () { return playing; }
    },
    /* instrument library + Swap (tests): T as for layers */
    lib: {
      open: function (T) { if (T.kind === "drum") T.kit = T.kit || S.kit; lyOpen(T); swOpen(T); }, close: swClose,
      state: function () { return { open: !!swT, target: swT ? JSON.parse(JSON.stringify(swT)) : null, list: swList.map(function (it) { return it.id; }), sel: swSel, cur: swT ? lyCfg(swT).src || null : null,
        filt: swF ? JSON.parse(JSON.stringify(swF)) : null, mem: LIB.memory(), prev: swPrevInfo }; },
      apply: function (T, id) { if (T.kind === "drum") T.kit = T.kit || S.kit; return swApply(T, id); },
      ids: libIds, preview: function (id) { return swPreview(id); }, storage: function () { return LIB.storage(); }, clear: function () { return LIB.clearUnused(libIds()); },
      manifest: function () { return LIB.manifest(); }, load: function (id) { ensureCtx(); return LIB.load(id, ctx).then(function (s) { return { zones: s.zones.length, dur: s.zones.length ? s.zones[0].buf.duration : 0 }; }); }
    },
    samples: { vol: sampleVol, set: setSampleVol, match: matchCfg, setMatch: setMatch,
      bus: function () { return PV ? { peak: peak(PV.an), gain: PV.fader.gain.value } : null; },
      loud: function (id) { var x = LIB.get(id); return x ? sndLoud(x) : null; }, cfg: function (T) { var c = lyCfg(T); return { src: c.src, sg: c.sg }; },
      lag: function () { return playing && ctx ? nextTime - ctx.currentTime : null; }, masterPeak: function () { return masterAnalyser ? peak(masterAnalyser) : 0; }, kl: function (id) { return klPreview(id); },
      loopPlan: function (id) { var x = LIB.get(id); if (!x) return null; var lp = loopPlay(x.it, x.zones[0].buf); return { ready: lp.ready, rate: lp.rate, len: lp.buf.duration, bar: 240 / S.bpm, bars: x.it.bars }; } },
    vx: { get: function () { return VX; }, ensure: vxEnsure, ab: vxToggleAB, live: vxLive, an: function () { return VX && VX.an; },
      state: function () { return { vpv: !!vpv.src, vc: !!vc.src, fxOff: !!S.vox.fxOff, tight: S.vox.tight, info: vox.last && vox.last.tightInfo, playing: playing }; },
      fx: function () { return S.vox.fx; }, set: function (k, o) { S.vox.fx = S.vox.fx || FXC.defaults(); Object.assign(S.vox.fx[k], o); vxChanged(); },
      tight: function (on, str) { S.vox.tight = { on: !!on, str: str == null ? 0.5 : str }; vxChanged(); vxRefreshPlaying(); }, play: voxPlayTake, stop: function () { voxPrevStop(); },
      setTake: function (o) { vox.last = o; } },
    backingTempo: function () { try { return bt.buf ? refEstimateBpm(bt.buf) : null; } catch (e) { return null; } }
  };
  window.IPBVocalClean = {
    run: function (mic, L, R, sr, opts, comps) { return vcRun(mic, L, R, sr, opts, null, comps); },
    state: function () {
      return { pref: hp.pref, detected: hp.detected, label: hp.label, labels: hp.labels, mode: hpMode(), busy: vc.busy, monitorGain: monitorGain ? monitorGain.gain.value : null,
        spkGain: spkGain ? spkGain.gain.value : null, spkTarget: spkBeatGain(), opts: JSON.parse(JSON.stringify(S.vox)), mic: vox.micSettings || null, takeMode: vox.takeMode || null,
        last: vox.last ? { mode: vox.last.mode, frames: vox.last.frames, sr: vox.last.sr, cleaned: !!vox.last.clean, lat: vox.last.lat, info: vox.last.info || null } : null,
        lastInfo: vc.lastInfo, ab: vc.ab, playingAB: !!vc.src, chip: (document.querySelector(".js-hp-chip") || {}).textContent || "" };
    },
    vocalMix: function (which) { // test hook: the vocal as it lands in the exported mix (after pan / FX / auto match)
      var t = vox.last; if (!t) return Promise.resolve(null);
      return vocalMixFx(t, which).then(function (mx) {
        var n = t.frames, vl = new Float32Array(n), vr = new Float32Array(n);
        for (var i = 0; i < n; i++) { vl[i] = mx.L[i] - t.L[i]; vr[i] = mx.R[i] - t.R[i]; }
        var rl = FXC.rms(vl), rr = FXC.rms(vr);
        return { frames: n, sr: t.sr, rmsL: rl, rmsR: rr, balDb: 20 * Math.log10((rl + 1e-12) / (rr + 1e-12)), vRms: FXC.rms(t.V), autoDb: mx.autoDb,
          beatLufs: t.beatLufs, vocalOutLufs: FXC.lufs([vl, vr], t.sr), target: S.vox.auto ? t.beatLufs + S.vox.autoOff : null, fader: mixGain("vocal"),
          sig: Array.prototype.slice.call(vl.filter(function (x, i) { return i % 37 === 0; })) };
      });
    },
    vox: function () { return JSON.parse(JSON.stringify(S.vox)); },
    autoLive: function () { var t = vox.last; return t ? { autoDb: t.autoDb, beatLufs: t.beatLufs, vocLufs: t.vocLufs, delta: beatDeltaDb(t), live: liveAutoDb(t), prevGain: vpv.g ? vpv.g.gain.value : null, playing: !!vpv.src, ui: ($("vx-auto-val") || {}).textContent } : null; },
    setMix: function (id, v) { S.mixer[id].v = v; applyMixer(); },
    lastArrays: function () { var t = vox.last; return t ? { V: t.V, clean: t.clean, L: t.L, R: t.R, sr: t.sr, beatStart: t.beatStart, pt0: t.pt0, ct0: t.ct0, bs: t.bs } : null; },
    detect: hpDetect
  };

  /* stale-build guard: sw.js serves pages network-first, but the tablet can still keep an older index.html (HTTP cache / offline copy).
     Ask the network for the current page; if it loads a newer app.js than this one, reload once. */
  /* in-app browsers (WhatsApp / Facebook / Instagram / TikTok webviews) often block sound and the mic: say so up front */
  (function inAppHint() {
    var ua = navigator.userAgent, app = /FBAN|FBAV|FB_IAB/.test(ua) ? "Facebook" : /Instagram/.test(ua) ? "Instagram" : /WhatsApp/i.test(ua) ? "WhatsApp" : /TikTok|musical_ly|BytedanceWebview/i.test(ua) ? "TikTok" : /Snapchat/i.test(ua) ? "Snapchat" : /; wv\)/.test(ua) ? "this app" : "";
    if (!app) return;
    var show = function () {
      var el = document.createElement("div"); el.className = "inapp-hint"; el.setAttribute("role", "alert");
      el.textContent = "You opened Beat inside " + app + "'s built-in browser — sound and the mic often don't work here. Tap ⋮ (or the share icon) → \"Open in Chrome\".";
      document.body.insertBefore(el, document.body.firstChild);
    };
    if (document.body) show(); else document.addEventListener("DOMContentLoaded", show);
  })();
  (function checkBuild() {
    try {
      var me = document.querySelector('script[src*="app.js?v="]'), mine = me && (me.getAttribute("src").match(/v=([\w.-]+)/) || [])[1];
      try { if (mine) localStorage.setItem("ipb_build_seen", mine); } catch (e) { /* ignore */ } // read by /beats/check/
      if (!mine || !window.fetch || /[?&]noupdate/.test(location.search)) return;
      fetch(location.pathname + "?build=" + Date.now(), { cache: "no-store" }).then(function (r) { return r.ok ? r.text() : ""; }).then(function (html) {
        var live = (html.match(/app\.js\?v=([\w.-]+)/) || [])[1];
        if (!live || live === mine) return;
        var key = "ipb_reloaded_for";
        if (sessionStorage.getItem(key) === live) return; // one reload per new build
        sessionStorage.setItem(key, live);
        if (rec && rec.on) return; // never interrupt a recording
        toast("Updated, reloading…");
        setTimeout(function () { // a new URL (keeps ?tapdebug=1 etc.) so a stale HTTP-cached page can't be served again on reload
          var q = new URLSearchParams(location.search); q.set("_v", live);
          location.replace(location.pathname + "?" + q.toString() + location.hash);
        }, 900);
      }).catch(function () {});
    } catch (e) { /* ignore */ }
  })();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
