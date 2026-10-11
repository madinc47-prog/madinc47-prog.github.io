/* Island Pin Beats — tweakable layers (window.IPBLayers).
 * Every sound layer (a drum row, the 808 row, each instrument inside a Piano Roll / keys-loop pattern, the chord loop)
 * owns one shared processing chain — not one per hit — so it stays light on a mid-range phone:
 *   hits → inp (level · drive push) → [drive shaper → make-up] → [high-pass] → [low-pass] → panner → group fader
 * Bypassed stages are disconnected, so an untouched layer costs two gain nodes and a panner.
 * The same chain is built in the live AudioContext and in every OfflineAudioContext (Bounce / WAV / MP3 / Send to
 * Studio), so an export sounds exactly like what you hear.
 * A layer config is plain JSON: { tune st, fine ct, decay (drum 0.05–1 · melodic length 0.1–2), lp Hz, hp Hz,
 *   res 0–1, level dB, pan −1…1, drive 0–1, nudge ms, m (mute), s (solo), src (sound source slot — reserved for the
 *   instrument library: null = the kit / pattern's own sound) }. Missing keys = defaults, so old saves load unchanged.
 */
(function () {
  "use strict";
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  var LP_MIN = 120, LP_MAX = 20000, HP_MIN = 20, HP_MAX = 2500;
  var DEF = { tune: 0, fine: 0, decay: 1, lp: LP_MAX, hp: HP_MIN, res: 0, level: 0, pan: 0, drive: 0, nudge: 0 };
  function lpOn(c) { return c.lp < LP_MAX * 0.97; }
  function hpOn(c) { return c.hp > HP_MIN * 1.05; }
  function q(c) { return 0.707 * Math.pow(17, clamp(c.res || 0, 0, 1)); } // 0.7 … 12
  function logPos(v, lo, hi) { return Math.round(100 * Math.log(v / lo) / Math.log(hi / lo)); }
  function logVal(p, lo, hi) { return Math.round(lo * Math.pow(hi / lo, p / 100)); }
  function fmtHz(v) { return v >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 0 : 1) + " kHz" : Math.round(v) + " Hz"; }
  function sgn(v, d) { return (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(d || 0); }
  /* knob table. pos/val map slider position ↔ stored value (log sweeps for the filters) */
  var KNOBS = [
    { key: "tune", label: "Pitch", min: -12, max: 12, step: 1, mel: { min: -24, max: 24 }, fmt: function (v) { return sgn(v) + " st"; } },
    { key: "fine", label: "Fine", min: -50, max: 50, step: 1, fmt: function (v) { return sgn(v) + " ct"; } },
    { key: "decay", label: "Decay", min: 0.05, max: 1, step: 0.01, mel: { min: 0.1, max: 2, label: "Length" }, fmt: function (v) { return Math.round(v * 100) + "%"; } },
    { key: "lp", label: "Low-pass", min: 0, max: 100, step: 1, pos: function (v) { return logPos(v, LP_MIN, LP_MAX); }, val: function (p) { return logVal(p, LP_MIN, LP_MAX); }, fmt: function (v) { return v >= LP_MAX * 0.97 ? "Off" : fmtHz(v); } },
    { key: "hp", label: "High-pass", min: 0, max: 100, step: 1, pos: function (v) { return logPos(v, HP_MIN, HP_MAX); }, val: function (p) { return logVal(p, HP_MIN, HP_MAX); }, fmt: function (v) { return v <= HP_MIN * 1.05 ? "Off" : fmtHz(v); } },
    { key: "res", label: "Resonance", min: 0, max: 1, step: 0.02, fmt: function (v) { return "Q " + q({ res: v }).toFixed(1); } },
    { key: "level", label: "Volume", min: -24, max: 6, step: 0.5, fmt: function (v) { return sgn(v, 1) + " dB"; } },
    { key: "pan", label: "Pan", min: -1, max: 1, step: 0.05, fmt: function (v) { v = Math.round(v * 100); return v === 0 ? "C" : v < 0 ? "L " + -v : "R " + v; } },
    { key: "drive", label: "Drive / grit", min: 0, max: 1, step: 0.02, fmt: function (v) { return Math.round(v * 100) + "%"; } },
    { key: "nudge", label: "Swing push", min: -30, max: 30, step: 1, fmt: function (v) { return sgn(v) + " ms"; } }
  ];
  function range(k, kind) { var m = kind === "mel" && k.mel ? k.mel : {}; return { min: m.min != null ? m.min : k.min, max: m.max != null ? m.max : k.max, label: m.label || k.label }; }
  function num(v, d) { v = +v; return isFinite(v) ? v : d; }
  /* validate a stored layer config (never throws). base = defaults to fill in (e.g. a kit pad's own pan / nudge) */
  function clean(src, kind, base) {
    var o = src && typeof src === "object" ? src : {}, b = base || {}, out = {};
    KNOBS.forEach(function (k) {
      var r = range(k, kind), d = b[k.key] != null ? b[k.key] : DEF[k.key];
      var lo = k.pos ? (k.key === "lp" ? LP_MIN : HP_MIN) : r.min, hi = k.pos ? (k.key === "lp" ? LP_MAX : HP_MAX) : r.max;
      out[k.key] = clamp(num(o[k.key], d), lo, hi);
    });
    if (kind === "mel") { out.m = !!o.m; out.s = !!o.s; }
    out.src = typeof o.src === "string" && o.src ? o.src.slice(0, 80) : null; // instrument-library hook
    out.sg = out.src ? clamp(num(o.sg, 0), -30, 12) : 0; // library sound level match (dB), set when the sound is picked
    return out;
  }
  function defaults(kind, base) { return clean(null, kind, base); }
  function tweaked(cfg, kind, base) {
    if (!cfg) return false;
    var d = defaults(kind, base);
    return KNOBS.some(function (k) { return Math.abs((cfg[k.key] || 0) - (d[k.key] || 0)) > 1e-6; }) || !!cfg.m || !!cfg.s || !!cfg.src;
  }
  /* compact form for saving: only what differs from the defaults (null when untouched) */
  function pack(cfg, kind, base) {
    if (!tweaked(cfg, kind, base)) return null;
    var d = defaults(kind, base), o = {};
    KNOBS.forEach(function (k) { if (Math.abs(cfg[k.key] - d[k.key]) > 1e-6) o[k.key] = cfg[k.key]; });
    if (cfg.m) o.m = true; if (cfg.s) o.s = true; if (cfg.src) o.src = cfg.src; if (cfg.src && cfg.sg) o.sg = Math.round(cfg.sg * 10) / 10;
    return o;
  }

  var curves = {};
  function driveCurve(dr) {
    dr = Math.round(clamp(dr, 0, 1) * 50) / 50;
    var key = dr.toFixed(2);
    if (curves[key]) return curves[key];
    var n = 4096, c = new Float32Array(n), k = 1 + dr * 3, nk = Math.tanh(k);
    for (var i = 0; i < n; i++) { var x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(k * x) / nk; } // input beyond ±1 holds the end value
    return (curves[key] = c);
  }
  /* one chain per layer. strip.inp is where hits connect. apply(cfg, t) — t = ramp start for live tweaks (0 = set now) */
  function Strip(c, dest) {
    var st = { c: c, dest: dest, inp: c.createGain(), drv: c.createWaveShaper(), dg: c.createGain(), hp: c.createBiquadFilter(), lp: c.createBiquadFilter(),
      pan: c.createStereoPanner ? c.createStereoPanner() : null, out: null, key: null };
    st.drv.oversample = "none"; st.hp.type = "highpass"; st.lp.type = "lowpass";
    st.out = st.pan || c.createGain();
    st.out.connect(dest);
    st.apply = function (cfg, t) { applyStrip(st, cfg, t); };
    return st;
  }
  function applyStrip(st, cfg, t) {
    var on = { d: cfg.drive > 0.005, h: hpOn(cfg), l: lpOn(cfg) }, key = (on.d ? "d" : "") + (on.h ? "h" : "") + (on.l ? "l" : "");
    if (st.key !== key) {
      [st.inp, st.drv, st.dg, st.hp, st.lp].forEach(function (n) { try { n.disconnect(); } catch (e) { /* not connected */ } });
      var chain = [st.inp];
      if (on.d) chain.push(st.drv, st.dg);
      if (on.h) chain.push(st.hp);
      if (on.l) chain.push(st.lp);
      chain.push(st.out);
      for (var i = 0; i < chain.length - 1; i++) chain[i].connect(chain[i + 1]);
      st.key = key;
    }
    if (on.d) st.drv.curve = driveCurve(cfg.drive);
    // drive pushes the layer into the shaper (so quiet keys get grit too), then makes up the level after it
    var push = 1 + cfg.drive * 9, lvl = Math.pow(10, cfg.level / 20) * (on.d ? push : 1), Q = q(cfg);
    function set(p, v) { if (t) p.setTargetAtTime(v, t, 0.015); else p.value = v; }
    set(st.inp.gain, lvl);
    if (on.d) set(st.dg.gain, 1 / Math.pow(push, 0.9));
    set(st.hp.frequency, cfg.hp); set(st.hp.Q, Math.min(Q, 8));
    set(st.lp.frequency, cfg.lp); set(st.lp.Q, Q);
    if (st.pan) set(st.pan.pan, clamp(cfg.pan, -1, 1));
  }

  /* knob undo / redo: entries are { label, undo(), redo() } */
  function History(max) {
    var u = [], r = [];
    return {
      push: function (e) { u.push(e); if (u.length > (max || 100)) u.shift(); r.length = 0; },
      undo: function () { var e = u.pop(); if (!e) return null; e.undo(); r.push(e); return e; },
      redo: function () { var e = r.pop(); if (!e) return null; e.redo(); u.push(e); return e; },
      can: function () { return { undo: u.length > 0, redo: r.length > 0 }; },
      clear: function () { u.length = 0; r.length = 0; }
    };
  }

  window.IPBLayers = { DEF: DEF, KNOBS: KNOBS, range: range, clean: clean, defaults: defaults, tweaked: tweaked, pack: pack,
    Strip: Strip, applyStrip: applyStrip, driveCurve: driveCurve, History: History, LP_MAX: LP_MAX, HP_MIN: HP_MIN };
})();
