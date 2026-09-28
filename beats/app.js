/* Island Pin Beats — pure Web Audio, no external samples, no paid APIs. */
(function () {
  "use strict";

  var SR = 44100;
  var STEPS = 16;
  var SESSION_KEY = "ipb_session_v1";
  var GROUPS = [
    { id: "drums", name: "Drums" },
    { id: "bass", name: "808" },
    { id: "hats", name: "Hats" },
    { id: "perc", name: "Perc / FX" },
    { id: "keys", name: "Keys" }
  ];
  var PAD_KEYS = ["z", "x", "c", "v", "b", "n", "m", ","];
  var CHOKE = { 1: [1, 2, 3], 2: [1, 2, 3], 3: [1, 2, 3], 7: [8], 9: [8] };

  function mf(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function $(id) { return document.getElementById(id); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  /* ---------------- Synth voices (rendered offline into buffers) ---------------- */
  function noiseSrc(c, dur) {
    var len = Math.max(1, Math.floor(c.sampleRate * dur));
    var b = c.createBuffer(1, len, c.sampleRate);
    var d = b.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    var s = c.createBufferSource();
    s.buffer = b;
    return s;
  }
  function adEnv(param, t, a, peak, d) {
    param.setValueAtTime(0.0001, t);
    param.exponentialRampToValueAtTime(peak, t + a);
    param.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  function driveCurve(k) {
    var n = 2048, curve = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      var x = (i * 2) / n - 1;
      curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
    }
    return curve;
  }
  function withDrive(c, out, amount) {
    if (!amount) return out;
    var ws = c.createWaveShaper();
    ws.curve = driveCurve(amount);
    ws.oversample = "2x";
    var comp = c.createGain();
    comp.gain.value = 1 / (1 + amount * 0.08);
    ws.connect(comp);
    comp.connect(out);
    return ws;
  }

  var VOICES = {
    kick: function (c, out, p) {
      var dest = withDrive(c, out, p.drive);
      var o = c.createOscillator(), g = c.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(p.f0, 0);
      o.frequency.exponentialRampToValueAtTime(p.f1, p.pd);
      adEnv(g.gain, 0, 0.002, 1, p.d);
      o.connect(g); g.connect(dest);
      o.start(0); o.stop(p.d + 0.1);
      var n = noiseSrc(c, 0.02), hp = c.createBiquadFilter(), ng = c.createGain();
      hp.type = "highpass"; hp.frequency.value = 2500;
      adEnv(ng.gain, 0, 0.001, 0.35, 0.012);
      n.connect(hp); hp.connect(ng); ng.connect(dest); n.start(0);
    },
    bass808: function (c, out, p) {
      var dest = withDrive(c, out, p.drive);
      var lp = c.createBiquadFilter();
      lp.type = "lowpass"; lp.frequency.value = 1400;
      lp.connect(dest);
      var o = c.createOscillator(), g = c.createGain();
      o.type = "sine";
      if (p.glide) {
        o.frequency.setValueAtTime(p.f * p.glideFrom, 0);
        o.frequency.exponentialRampToValueAtTime(p.f, p.glide);
      } else {
        o.frequency.setValueAtTime(p.f * 1.9, 0);
        o.frequency.exponentialRampToValueAtTime(p.f, 0.035);
      }
      g.gain.setValueAtTime(0.0001, 0);
      g.gain.exponentialRampToValueAtTime(0.95, 0.004);
      g.gain.exponentialRampToValueAtTime(0.6, 0.25);
      g.gain.exponentialRampToValueAtTime(0.0001, p.d);
      o.connect(g); g.connect(lp);
      o.start(0); o.stop(p.d + 0.05);
    },
    snare: function (c, out, p) {
      var o = c.createOscillator(), og = c.createGain();
      o.type = "triangle";
      o.frequency.setValueAtTime(p.tone, 0);
      o.frequency.exponentialRampToValueAtTime(p.tone * 0.6, 0.1);
      adEnv(og.gain, 0, 0.001, 0.55, 0.12);
      o.connect(og); og.connect(out); o.start(0); o.stop(0.3);
      var n = noiseSrc(c, p.nd + 0.1), hp = c.createBiquadFilter(), ng = c.createGain();
      hp.type = "highpass"; hp.frequency.value = p.hp;
      adEnv(ng.gain, 0, 0.001, 0.8, p.nd);
      n.connect(hp); hp.connect(ng); ng.connect(out); n.start(0);
    },
    clap: function (c, out, p) {
      var n = noiseSrc(c, p.d + 0.1), bp = c.createBiquadFilter(), g = c.createGain();
      bp.type = "bandpass"; bp.frequency.value = p.f; bp.Q.value = 1.1;
      g.gain.setValueAtTime(0.0001, 0);
      [0, 0.011, 0.022].forEach(function (t) {
        g.gain.setValueAtTime(0.9, t);
        g.gain.exponentialRampToValueAtTime(0.12, t + 0.009);
      });
      g.gain.setValueAtTime(0.8, 0.033);
      g.gain.exponentialRampToValueAtTime(0.0001, 0.033 + p.d);
      n.connect(bp); bp.connect(g); g.connect(out); n.start(0);
    },
    rim: function (c, out) {
      var o = c.createOscillator(), o2 = c.createOscillator(), bp = c.createBiquadFilter(), g = c.createGain();
      o.type = "triangle"; o.frequency.value = 1700;
      o2.type = "square"; o2.frequency.value = 820;
      bp.type = "bandpass"; bp.frequency.value = 1800; bp.Q.value = 3.5;
      adEnv(g.gain, 0, 0.001, 0.8, 0.045);
      o.connect(bp); o2.connect(bp); bp.connect(g); g.connect(out);
      o.start(0); o2.start(0); o.stop(0.1); o2.stop(0.1);
    },
    metal: function (c, out, p) {
      var ratios = [205.3, 304.4, 369.6, 522.7, 540, 800];
      var bp = c.createBiquadFilter(), hp = c.createBiquadFilter(), g = c.createGain();
      bp.type = "bandpass"; bp.frequency.value = 10000; bp.Q.value = 0.8;
      hp.type = "highpass"; hp.frequency.value = 7000;
      adEnv(g.gain, 0, 0.001, 0.5, p.d);
      ratios.forEach(function (r) {
        var o = c.createOscillator();
        o.type = "square"; o.frequency.value = r * (p.tune || 1) * 1.6;
        o.connect(bp); o.start(0); o.stop(p.d + 0.1);
      });
      bp.connect(hp); hp.connect(g); g.connect(out);
      var n = noiseSrc(c, p.d + 0.05), nh = c.createBiquadFilter(), ng = c.createGain();
      nh.type = "highpass"; nh.frequency.value = 8000;
      adEnv(ng.gain, 0, 0.001, 0.18, p.d * 0.9);
      n.connect(nh); nh.connect(ng); ng.connect(out); n.start(0);
    },
    crash: function (c, out, p) {
      VOICES.metal(c, out, { d: p.d * 0.7, tune: 0.9 });
      var n = noiseSrc(c, p.d + 0.1), hp = c.createBiquadFilter(), g = c.createGain();
      hp.type = "highpass"; hp.frequency.value = 4500;
      adEnv(g.gain, 0, 0.003, 0.45, p.d);
      n.connect(hp); hp.connect(g); g.connect(out); n.start(0);
    },
    shaker: function (c, out, p) {
      var n = noiseSrc(c, p.d + 0.1), bp = c.createBiquadFilter(), g = c.createGain();
      bp.type = "bandpass"; bp.frequency.value = 6500; bp.Q.value = 0.9;
      adEnv(g.gain, 0, 0.014, 0.55, p.d);
      n.connect(bp); bp.connect(g); g.connect(out); n.start(0);
    },
    snap: function (c, out) {
      var n = noiseSrc(c, 0.15), bp = c.createBiquadFilter(), g = c.createGain();
      bp.type = "bandpass"; bp.frequency.value = 2800; bp.Q.value = 2.5;
      adEnv(g.gain, 0, 0.001, 0.9, 0.07);
      n.connect(bp); bp.connect(g); g.connect(out); n.start(0);
      var o = c.createOscillator(), og = c.createGain();
      o.frequency.value = 1900; adEnv(og.gain, 0, 0.001, 0.25, 0.02);
      o.connect(og); og.connect(out); o.start(0); o.stop(0.05);
    },
    tom: function (c, out, p) {
      var o = c.createOscillator(), g = c.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(p.f * 1.3, 0);
      o.frequency.exponentialRampToValueAtTime(p.f * 0.55, p.d);
      adEnv(g.gain, 0, 0.002, 0.9, p.d);
      o.connect(g); g.connect(out); o.start(0); o.stop(p.d + 0.05);
    },
    perc: function (c, out, p) {
      var o = c.createOscillator(), g = c.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(p.f * 1.25, 0);
      o.frequency.exponentialRampToValueAtTime(p.f, 0.02);
      adEnv(g.gain, 0, 0.001, 0.8, p.d);
      o.connect(g); g.connect(out); o.start(0); o.stop(p.d + 0.05);
      var n = noiseSrc(c, 0.03), bp = c.createBiquadFilter(), ng = c.createGain();
      bp.type = "bandpass"; bp.frequency.value = p.f * 3; bp.Q.value = 2;
      adEnv(ng.gain, 0, 0.001, 0.3, 0.015);
      n.connect(bp); bp.connect(ng); ng.connect(out); n.start(0);
    },
    cowbell: function (c, out, p) {
      var dest = withDrive(c, out, p.drive);
      var bp = c.createBiquadFilter(), g = c.createGain();
      bp.type = "bandpass"; bp.frequency.value = p.f * 1.5; bp.Q.value = 0.9;
      g.gain.setValueAtTime(0.0001, 0);
      g.gain.exponentialRampToValueAtTime(0.6, 0.002);
      g.gain.exponentialRampToValueAtTime(0.2, 0.06);
      g.gain.exponentialRampToValueAtTime(0.0001, p.d);
      [p.f, p.f * 1.48].forEach(function (f) {
        var o = c.createOscillator();
        o.type = "square"; o.frequency.value = f;
        o.connect(bp); o.start(0); o.stop(p.d + 0.05);
      });
      bp.connect(g); g.connect(dest);
    },
    riser: function (c, out, p) {
      var n = noiseSrc(c, p.d + 0.1), bp = c.createBiquadFilter(), g = c.createGain();
      bp.type = "bandpass"; bp.Q.value = 5;
      bp.frequency.setValueAtTime(300, 0);
      bp.frequency.exponentialRampToValueAtTime(9000, p.d);
      g.gain.setValueAtTime(0.0001, 0);
      g.gain.exponentialRampToValueAtTime(0.7, p.d);
      g.gain.exponentialRampToValueAtTime(0.0001, p.d + 0.06);
      n.connect(bp); bp.connect(g); g.connect(out); n.start(0);
    },
    stab: function (c, out, p) {
      var lp = c.createBiquadFilter(), g = c.createGain();
      lp.type = "lowpass"; lp.Q.value = 2;
      lp.frequency.setValueAtTime(3200, 0);
      lp.frequency.exponentialRampToValueAtTime(500, 0.35);
      adEnv(g.gain, 0, 0.004, 0.22, p.d);
      p.notes.forEach(function (m) {
        [-7, 7].forEach(function (det) {
          var o = c.createOscillator();
          o.type = "sawtooth"; o.frequency.value = mf(m); o.detune.value = det;
          o.connect(lp); o.start(0); o.stop(p.d + 0.1);
        });
      });
      lp.connect(g); g.connect(out);
    }
  };

  /* ---------------- Kits ---------------- */
  function pad(name, group, type, p, len, vol) {
    return { name: name, group: group, type: type, p: p || {}, len: len || 0.6, vol: vol == null ? 1 : vol };
  }
  var KITS = {
    trap: {
      bpm: 140,
      pads: [
        pad("Kick", "drums", "kick", { f0: 160, f1: 42, pd: 0.12, d: 0.5 }, 0.7),
        pad("808 Low", "bass", "bass808", { f: mf(29), d: 1.6, drive: 2 }, 1.8, 0.9),
        pad("808 Mid", "bass", "bass808", { f: mf(34), d: 1.5, drive: 2 }, 1.7, 0.9),
        pad("808 High", "bass", "bass808", { f: mf(36), d: 1.4, drive: 2 }, 1.6, 0.9),
        pad("Snare", "drums", "snare", { tone: 200, hp: 1800, nd: 0.2 }, 0.5),
        pad("Clap", "drums", "clap", { f: 1200, d: 0.28 }, 0.5),
        pad("Rim", "drums", "rim", {}, 0.2),
        pad("Hat", "hats", "metal", { d: 0.06, tune: 1 }, 0.2, 0.7),
        pad("Open Hat", "hats", "metal", { d: 0.4, tune: 1 }, 0.6, 0.6),
        pad("Hat Soft", "hats", "metal", { d: 0.035, tune: 1.05 }, 0.15, 0.4),
        pad("Perc", "perc", "perc", { f: 620, d: 0.12 }, 0.3),
        pad("Tom", "perc", "tom", { f: 140, d: 0.35 }, 0.5),
        pad("Crash", "hats", "crash", { d: 1.6 }, 2, 0.5),
        pad("Snap", "drums", "snap", {}, 0.2),
        pad("Riser", "perc", "riser", { d: 1.5 }, 1.7, 0.6),
        pad("Stab Cm", "perc", "stab", { notes: [60, 63, 67], d: 0.6 }, 0.8)
      ],
      demo: {
        0: "x......x..x.....",
        1: "x......x........",
        3: "..........x.....",
        4: "....x.......x...",
        5: "....x.......x...",
        7: "x.x.x.x.x.x.xx.x",
        8: "..............x.",
        12: "x...............",
        15: "x..............."
      }
    },
    drill: {
      bpm: 142,
      pads: [
        pad("Kick", "drums", "kick", { f0: 190, f1: 52, pd: 0.06, d: 0.32 }, 0.5),
        pad("808 Slide", "bass", "bass808", { f: mf(31), d: 1.5, glide: 0.14, glideFrom: 1.5, drive: 3 }, 1.7, 0.9),
        pad("808 Low", "bass", "bass808", { f: mf(29), d: 1.4, drive: 3 }, 1.6, 0.9),
        pad("808 Glide Up", "bass", "bass808", { f: mf(38), d: 1.2, glide: 0.12, glideFrom: 0.75, drive: 3 }, 1.4, 0.9),
        pad("Snare", "drums", "snare", { tone: 240, hp: 2500, nd: 0.14 }, 0.4),
        pad("Clap", "drums", "clap", { f: 1500, d: 0.2 }, 0.4),
        pad("Rim", "drums", "rim", {}, 0.2),
        pad("Hat", "hats", "metal", { d: 0.045, tune: 1.1 }, 0.15, 0.7),
        pad("Open Hat", "hats", "metal", { d: 0.3, tune: 1.1 }, 0.5, 0.55),
        pad("Shaker", "hats", "shaker", { d: 0.09 }, 0.2, 0.6),
        pad("Perc Wood", "perc", "perc", { f: 900, d: 0.06 }, 0.2),
        pad("Perc Low", "perc", "perc", { f: 400, d: 0.1 }, 0.25),
        pad("Crash", "hats", "crash", { d: 1.4 }, 1.8, 0.5),
        pad("Snap", "drums", "snap", {}, 0.2),
        pad("Riser", "perc", "riser", { d: 1.5 }, 1.7, 0.6),
        pad("Stab Bbm", "perc", "stab", { notes: [58, 61, 65], d: 0.5 }, 0.7)
      ],
      demo: {
        0: "x.........x.....",
        1: "x.....x.........",
        2: "..........x..x..",
        4: "....x.......x...",
        6: "..x.....x.....x.",
        7: "x..x..x.x..x..x.",
        10: ".......x.......x",
        15: "x.......x......."
      }
    },
    phonk: {
      bpm: 130,
      pads: [
        pad("Kick", "drums", "kick", { f0: 150, f1: 48, pd: 0.1, d: 0.45, drive: 6 }, 0.6),
        pad("808 Dist E", "bass", "bass808", { f: mf(28), d: 1.3, drive: 9 }, 1.5, 0.8),
        pad("808 Dist G", "bass", "bass808", { f: mf(31), d: 1.2, drive: 9 }, 1.4, 0.8),
        pad("808 Dist A", "bass", "bass808", { f: mf(33), d: 1.2, drive: 9 }, 1.4, 0.8),
        pad("Snare", "drums", "snare", { tone: 180, hp: 1200, nd: 0.25 }, 0.5),
        pad("Clap Big", "drums", "clap", { f: 1000, d: 0.35 }, 0.6),
        pad("Rim", "drums", "rim", {}, 0.2),
        pad("Hat", "hats", "metal", { d: 0.05, tune: 0.9 }, 0.15, 0.7),
        pad("Open Hat", "hats", "metal", { d: 0.35, tune: 0.9 }, 0.5, 0.55),
        pad("Shaker", "hats", "shaker", { d: 0.1 }, 0.2, 0.6),
        pad("Cowbell Hi", "perc", "cowbell", { f: mf(74), d: 0.4, drive: 2 }, 0.5, 0.7),
        pad("Cowbell Lo", "perc", "cowbell", { f: mf(69), d: 0.4, drive: 2 }, 0.5, 0.7),
        pad("Crash", "hats", "crash", { d: 1.4 }, 1.8, 0.5),
        pad("Cowbell Deep", "perc", "cowbell", { f: mf(65), d: 0.45, drive: 2 }, 0.55, 0.7),
        pad("Riser", "perc", "riser", { d: 1.5 }, 1.7, 0.6),
        pad("Stab Am", "perc", "stab", { notes: [57, 60, 64], d: 0.5 }, 0.7)
      ],
      demo: {
        0: "x...x...x...x...",
        1: "x.......x.x.....",
        5: "....x.......x...",
        7: "x.x.x.x.x.x.x.x.",
        10: "x..x..x.........",
        11: "..........x..x..",
        13: "........x.......",
        12: "x..............."
      }
    }
  };

  function renderPadBuffer(def) {
    var c = new OfflineAudioContext(1, Math.ceil(SR * def.len), SR);
    var out = c.createGain();
    out.gain.value = def.vol;
    out.connect(c.destination);
    VOICES[def.type](c, out, def.p);
    return c.startRendering();
  }

  /* ---------------- State ---------------- */
  function emptyPattern() {
    var p = [];
    for (var i = 0; i < 16; i++) { p.push(new Array(STEPS).fill(0)); }
    return p;
  }
  function defaultMixer() {
    var m = { master: { v: 0.85, m: false } };
    GROUPS.forEach(function (g) { m[g.id] = { v: g.id === "keys" ? 0.7 : 0.85, m: false }; });
    m.vocal = { v: 0.9, m: false };
    return m;
  }
  function defaultChordTrack() {
    // Cm – Ab – Fm – G7 (indices into CHORDS), off until the user or a preset turns it on
    return { on: false, prog: [6, 10, 8, 15], bars: 2, sound: "pad", bassFollow: false };
  }
  var S = {
    kit: "trap",
    bpm: 140,
    swing: 0,
    pattern: emptyPattern(),
    pitches: new Array(16).fill(0),
    mixer: defaultMixer(),
    sel: 0,
    chordTrack: defaultChordTrack(),
    structure: null,      // id in STRUCTURES, or null = plain loop
    cueBar: 0,            // bar the transport starts from
    lyricSong: "streets", // song shown in Lyrics / Teleprompter
    bpl: "auto",          // teleprompter bars per line ("auto" = fit song sections)
    prSize: 1,
    vox: { nudge: 0, monitor: false, dry: false }
  };
  var stockBuf = new Array(16).fill(null);
  var customBuf = new Array(16).fill(null);
  var customName = new Array(16).fill(null);

  function saveSession() {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({
        kit: S.kit, bpm: S.bpm, swing: S.swing, pattern: S.pattern,
        pitches: S.pitches, mixer: S.mixer, sel: S.sel,
        chordTrack: S.chordTrack, structure: S.structure, cueBar: S.cueBar,
        lyricSong: S.lyricSong, bpl: S.bpl, prSize: S.prSize, vox: S.vox
      }));
    } catch (e) { /* storage full or blocked */ }
  }
  function loadSession() {
    try {
      var raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return false;
      var d = JSON.parse(raw);
      if (d.kit && KITS[d.kit]) S.kit = d.kit;
      if (d.bpm) S.bpm = clamp(+d.bpm, 60, 200);
      if (d.swing != null) S.swing = clamp(+d.swing, 0, 60);
      if (Array.isArray(d.pattern) && d.pattern.length === 16) S.pattern = d.pattern;
      if (Array.isArray(d.pitches) && d.pitches.length === 16) S.pitches = d.pitches;
      if (d.mixer) {
        var dm = defaultMixer();
        Object.keys(dm).forEach(function (k) { if (d.mixer[k]) dm[k] = d.mixer[k]; });
        S.mixer = dm;
      }
      if (d.sel != null) S.sel = clamp(+d.sel, 0, 15);
      if (d.chordTrack && Array.isArray(d.chordTrack.prog)) {
        var ct = defaultChordTrack();
        Object.keys(ct).forEach(function (k) { if (d.chordTrack[k] != null) ct[k] = d.chordTrack[k]; });
        S.chordTrack = ct;
      }
      if (d.structure && STRUCTURES[d.structure]) S.structure = d.structure;
      if (d.cueBar != null) S.cueBar = Math.max(0, Math.floor(+d.cueBar) || 0);
      if (typeof d.lyricSong === "string") S.lyricSong = d.lyricSong;
      if (d.bpl) S.bpl = String(d.bpl);
      if (d.prSize) S.prSize = clamp(+d.prSize, 0.6, 1.8);
      if (d.vox) {
        S.vox.nudge = clamp(+d.vox.nudge || 0, -300, 300);
        S.vox.monitor = !!d.vox.monitor;
        S.vox.dry = !!d.vox.dry;
      }
      return true;
    } catch (e) { return false; }
  }
  function loadDemo(kit) {
    var k = KITS[kit];
    S.pattern = emptyPattern();
    Object.keys(k.demo).forEach(function (i) {
      var str = k.demo[i];
      for (var s = 0; s < STEPS; s++) S.pattern[+i][s] = str[s] === "x" ? 1 : 0;
    });
    S.bpm = k.bpm;
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
   * Pad map (Trap): 0 Kick, 2 808 Mid, 3 808 High(C), 4 Snare, 5 Clap, 7 Hat, 9 Hat Soft.
   */
  var BEAT_PRESETS = {
    streets: {
      name: "The Streets Is Calling",
      kit: "trap",
      bpm: 140,
      swing: 0,
      pattern: {
        0: "x......x..x..x..",
        2: ".............x..",
        3: "x......x..x.....",
        4: "........x.......",
        5: "........x.......",
        7: "x.x.x.3.x.x.x2x3",
        9: "...x.......x...."
      },
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
    if (Array.isArray(src)) {
      for (var i = 0; i < 16; i++) for (var s = 0; s < STEPS; s++) p[i][s] = clamp(+((src[i] || [])[s]) || 0, 0, 3);
      return p;
    }
    Object.keys(src || {}).forEach(function (i) {
      var str = src[i];
      for (var s = 0; s < STEPS; s++) {
        var ch = str[s];
        p[+i][s] = ch === "x" ? 1 : ch === "2" ? 2 : ch === "3" ? 3 : 0;
      }
    });
    return p;
  }
  function arrangement() { return S.structure && STRUCTURES[S.structure] ? STRUCTURES[S.structure].sections : null; }
  function totalBars(A) { return A.reduce(function (a, s) { return a + s.bars; }, 0); }
  function barSec() { return 240 / S.bpm; }

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

  /* ---------------- Audio graph ---------------- */
  var ctx = null, master = null, comp = null, masterAnalyser = null;
  var groupNodes = {};
  var liveVoices = [];

  function ensureCtx() {
    if (ctx) {
      if (ctx.state === "suspended") ctx.resume();
      return ctx;
    }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { toast("Web Audio is not supported in this browser."); return null; }
    ctx = new AC({ latencyHint: "interactive" });
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.15;
    master = ctx.createGain();
    masterAnalyser = ctx.createAnalyser();
    masterAnalyser.fftSize = 2048;
    comp.connect(master);
    master.connect(masterAnalyser);
    masterAnalyser.connect(ctx.destination);
    GROUPS.forEach(function (g) {
      var gain = ctx.createGain();
      var an = ctx.createAnalyser();
      an.fftSize = 512;
      gain.connect(an);
      an.connect(comp);
      groupNodes[g.id] = { gain: gain, an: an };
    });
    applyMixer();
    setupRecorder();
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
    master.gain.setTargetAtTime(mixGain("master"), t, 0.01);
    if (vocalFader) vocalFader.gain.setTargetAtTime(mixGain("vocal"), t, 0.01);
    if (monitorGain) monitorGain.gain.setTargetAtTime(S.vox.monitor ? 1 : 0, t, 0.01);
  }
  function bufFor(i) { return customBuf[i] || stockBuf[i]; }
  function groupOf(i) { return KITS[S.kit].pads[i].group; }

  /* shared by live playback + offline bounce */
  function playPadInto(c, i, when, dest, registry, semi) {
    var buf = bufFor(i);
    if (!buf) return;
    var targets = CHOKE[i];
    if (targets) {
      for (var k = registry.length - 1; k >= 0; k--) {
        var v = registry[k];
        if (targets.indexOf(v.pad) !== -1 && v.start < when) {
          try {
            v.g.gain.setTargetAtTime(0, when, 0.012);
            v.src.stop(when + 0.08);
          } catch (e) { /* already stopped */ }
          registry.splice(k, 1);
        }
      }
    }
    var src = c.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = Math.pow(2, ((S.pitches[i] || 0) + (semi || 0)) / 12);
    var g = c.createGain();
    src.connect(g); g.connect(dest);
    src.start(when);
    var voice = { pad: i, src: src, g: g, start: when };
    registry.push(voice);
    src.onended = function () {
      var idx = registry.indexOf(voice);
      if (idx !== -1) registry.splice(idx, 1);
    };
  }
  function triggerPad(i, when) {
    if (!ensureCtx()) return;
    playPadInto(ctx, i, when || ctx.currentTime, groupNodes[groupOf(i)].gain, liveVoices);
  }

  /* ---------------- Sequencer ---------------- */
  /*
   * k = global 16th-note index counted from bar 0 of the song.
   * stepInfo(k) says which pattern step to play and how (normal / half-time / sparse).
   * Shared by live playback and the offline bounce so both sound the same.
   */
  var playing = false, timer = null, nextTime = 0, curK = 0, startK = 0, uiQueue = [], uiStep = -1;
  var posAnchor = null, chordLive = [], songEndTimer = null;
  function stepDur() { return 60 / S.bpm / 4; }
  function stepInfo(k) {
    var bar = Math.floor(k / STEPS);
    var info = { k: k, patStep: k % STEPS, fire: true, feel: "full", end: false, secStart: false, sec: null, secIdx: -1, mb: k / STEPS };
    var A = arrangement();
    if (!A) return info;
    var b0 = 0, mb0 = 0;
    for (var i = 0; i < A.length; i++) {
      var sec = A[i];
      if (bar < b0 + sec.bars) {
        var local = k - b0 * STEPS;
        info.sec = sec; info.secIdx = i; info.feel = sec.feel || "full";
        info.secStart = local === 0;
        if (info.feel === "half") {
          info.fire = local % 2 === 0;
          info.patStep = Math.floor(local / 2) % STEPS;
          info.mb = mb0 + local / (STEPS * 2);
        } else {
          info.patStep = local % STEPS;
          info.mb = mb0 + local / STEPS;
        }
        return info;
      }
      b0 += sec.bars;
      mb0 += sec.feel === "half" ? sec.bars / 2 : sec.bars;
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
  function scheduleStep(c, info, t, dests, reg, creg, first) {
    var half = info.feel === "half";
    var len = stepDur() * (half ? 2 : 1);
    var sw = info.patStep % 2 === 1 ? len * (S.swing / 100) : 0;
    var ch = chordAt(info, first);
    if (ch && ch.change) startChord(c, ch.idx, t, dests.keys, creg);
    for (var p = 0; p < 16; p++) {
      var v = S.pattern[p][info.patStep];
      if (!v) continue;
      var grp = groupOf(p);
      if (info.feel === "sparse" && (grp === "drums" || grp === "bass")) continue;
      var semi = ch && ch.idx >= 0 && S.chordTrack.bassFollow && grp === "bass" ? rootSemi(ch.idx) : 0;
      for (var r = 0; r < v; r++) playPadInto(c, p, t + sw + (r * len) / v, dests[grp], reg, semi);
    }
    // crash on each new section (not intro / sparse parts)
    if (info.secStart && info.secIdx > 0 && info.feel !== "sparse") playPadInto(c, 12, t, dests[groupOf(12)], reg, 0);
  }
  function liveDests() {
    var d = {};
    GROUPS.forEach(function (g) { d[g.id] = groupNodes[g.id].gain; });
    return d;
  }
  function scheduler() {
    var dests = liveDests();
    while (playing && nextTime < ctx.currentTime + 0.12) {
      var info = stepInfo(curK);
      if (info.end) { endSong(nextTime); return; }
      if (info.fire) scheduleStep(ctx, info, nextTime, dests, liveVoices, chordLive, curK === startK);
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
    var A = arrangement();
    if (A && S.cueBar >= totalBars(A)) S.cueBar = 0;
    playing = true;
    startK = curK = S.cueBar * STEPS;
    nextTime = startAt || ctx.currentTime + 0.06;
    uiQueue = [];
    posAnchor = { k: curK, time: nextTime };
    timer = setInterval(scheduler, 25);
    scheduler();
    $("btn-play").classList.add("on");
    updatePlayButtons();
  }
  /* stop = stop and rewind to bar 1 (old behaviour); keepCue = pause at the current bar */
  function stop(keepCue) {
    if (!playing) return;
    var pos = currentPosK();
    playing = false;
    clearInterval(timer);
    timer = null;
    clearTimeout(songEndTimer);
    uiQueue = [];
    setNowColumn(-1);
    if (ctx) cutChords(chordLive, ctx.currentTime);
    S.cueBar = keepCue ? Math.max(0, Math.floor(pos / STEPS)) : 0;
    $("btn-play").classList.remove("on");
    updatePlayButtons();
    saveSession();
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
  function synthNote(c, dest, midi, t, dur, type) {
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
    out.gain.exponentialRampToValueAtTime(env.peak, t + env.a);
    out.gain.exponentialRampToValueAtTime(env.sus, t + env.a + env.dec);
    out.gain.setTargetAtTime(0.0001, t + dur, env.rel / 4);
    oscs.forEach(function (o) { o.stop(t + dur + env.rel + 0.3); });
    return { out: out, oscs: oscs, t: t };
  }
  function cutChords(reg, t) {
    reg.forEach(function (v) {
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
    var dur = barSec() * Math.max(1, S.chordTrack.bars) * 2 + 0.5; // cut earlier by the next chord / stop
    QUAL[ch.q].forEach(function (iv) {
      reg.push(synthNote(c, dest, 48 + ch.r + iv, t, dur, S.chordTrack.sound));
    });
  }

  /* ---------------- UI: pads + sequencer ---------------- */
  var padEls = [], seqRows = [], seqCells = [];
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
        wrap.appendChild(el);
        padEls.push(el);
      })(i);
    }
    refreshPads();
  }
  function refreshPads() {
    var kit = KITS[S.kit];
    padEls.forEach(function (el, i) {
      var def = kit.pads[i];
      el.className = "pad g-" + def.group + (i === S.sel ? " sel" : "") + (customBuf[i] ? " custom" : "");
      var name = customBuf[i] ? (customName[i] || "Custom") : def.name;
      el.innerHTML =
        '<span class="ptag">' + (i + 1) + "</span>" +
        (PAD_KEYS[i] ? '<span class="pkey">' + PAD_KEYS[i].toUpperCase() + "</span>" : "") +
        '<span class="pname"></span>';
      el.querySelector(".pname").textContent = name.length > 14 ? name.slice(0, 13) + "…" : name;
    });
    var selName = customBuf[S.sel] ? (customName[S.sel] || "Custom") : kit.pads[S.sel].name;
    $("sel-pad-name").textContent = (S.sel + 1) + " · " + selName;
    $("pad-pitch").value = S.pitches[S.sel] || 0;
    $("pad-pitch-val").textContent = (S.pitches[S.sel] > 0 ? "+" : "") + (S.pitches[S.sel] || 0);
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
    saveSession();
  }
  function buildSeq() {
    var wrap = $("seq");
    wrap.innerHTML = "";
    seqRows = []; seqCells = [];
    var kit = KITS[S.kit];
    for (var p = 0; p < 16; p++) {
      (function (p) {
        var row = document.createElement("div");
        row.className = "seq-row" + (p === S.sel ? " sel" : "");
        var nm = document.createElement("div");
        nm.className = "rname";
        nm.textContent = customBuf[p] ? (customName[p] || "Custom") : kit.pads[p].name;
        nm.addEventListener("click", function () { selectPad(p); triggerPad(p); });
        row.appendChild(nm);
        var cells = [];
        for (var s = 0; s < STEPS; s++) {
          (function (s) {
            var b = document.createElement("button");
            b.type = "button";
            b.setAttribute("aria-label", "Pad " + (p + 1) + " step " + (s + 1));
            function paint() {
              var v = S.pattern[p][s];
              b.className = "step" + (s % 4 === 0 ? " beat" : "") + (v ? " on" : "") + (v > 1 ? " r" + v : "") + (s === uiStep ? " now" : "");
              b.title = v > 1 ? (v === 2 ? "Roll: 2 hits (32nds)" : "Roll: 3 hits (triplet)") : "";
            }
            paint();
            // click = on/off · right-click or long-press = cycle roll (1 → 2 → 3 hits)
            var lpTimer = null, skipClick = false;
            function cycleRoll() {
              var v = S.pattern[p][s];
              S.pattern[p][s] = v >= 3 ? 1 : v + 1;
              paint(); saveSession();
              if (!playing) triggerPad(p);
            }
            b.addEventListener("click", function () {
              if (skipClick) { skipClick = false; return; }
              S.pattern[p][s] = S.pattern[p][s] ? 0 : 1;
              paint();
              if (S.pattern[p][s] && !playing) triggerPad(p);
              saveSession();
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
  }
  function setNowColumn(s) {
    if (uiStep >= 0) seqCells.forEach(function (r) { r[uiStep].classList.remove("now"); });
    uiStep = s;
    if (s >= 0) seqCells.forEach(function (r) { r[s].classList.add("now"); });
  }

  function loadKit(kit) {
    S.kit = kit;
    document.querySelectorAll(".kit").forEach(function (b) { b.classList.toggle("active", b.dataset.kit === kit); });
    customBuf = new Array(16).fill(null);
    customName = new Array(16).fill(null);
    var defs = KITS[kit].pads;
    return Promise.all(defs.map(renderPadBuffer)).then(function (bufs) {
      stockBuf = bufs;
      return loadCustomPads(kit);
    }).then(function () {
      refreshPads();
      buildSeq();
      saveSession();
    }).catch(function (e) {
      console.error(e);
      toast("Could not render kit: " + e.message);
    });
  }

  /* ---------------- Sample swap ---------------- */
  function decode(ab) {
    return new Promise(function (res, rej) {
      var c = new OfflineAudioContext(1, 1, SR);
      c.decodeAudioData(ab, res, function (err) { rej(err || new Error("Could not decode audio")); });
    });
  }
  function loadCustomPads(kit) {
    return idb("pads", "readonly", function (st) { return st.getAll(); }).then(function (rows) {
      var mine = (rows || []).filter(function (r) { return r.key.indexOf(kit + "_") === 0; });
      return Promise.all(mine.map(function (r) {
        var i = +r.key.split("_")[1];
        return decode(r.data.slice(0)).then(function (buf) {
          customBuf[i] = buf; customName[i] = r.name;
        }).catch(function () { /* skip broken */ });
      }));
    }).catch(function () { /* no IDB */ });
  }
  function onPadFile(file) {
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) { toast("File too large (max 15 MB)."); return; }
    var i = S.sel, kit = S.kit;
    file.arrayBuffer().then(function (ab) {
      var keep = ab.slice(0);
      return decode(ab).then(function (buf) {
        customBuf[i] = buf;
        customName[i] = file.name.replace(/\.[^.]+$/, "");
        refreshPads(); buildSeq();
        toast("Pad " + (i + 1) + " → " + customName[i]);
        triggerPad(i);
        return idb("pads", "readwrite", function (st) {
          return st.put({ key: kit + "_" + i, name: customName[i], data: keep });
        }).catch(function () { toast("Sample loaded (not saved — storage blocked)."); });
      });
    }).catch(function (e) {
      toast("Could not load that audio file. Try WAV or MP3.");
      console.error(e);
    });
  }
  function resetPad(i) {
    customBuf[i] = null; customName[i] = null;
    S.pitches[i] = 0;
    idb("pads", "readwrite", function (st) { return st.delete(S.kit + "_" + i); }).catch(function () {});
    refreshPads(); buildSeq(); saveSession();
  }
  function freshBeat() {
    stop();
    S.chordTrack.on = false;
    renderChordLoopUI();
    S.pattern = emptyPattern();
    S.pitches = new Array(16).fill(0);
    var kit = S.kit;
    for (var i = 0; i < 16; i++) { customBuf[i] = null; customName[i] = null; }
    idb("pads", "readwrite", function (st) {
      for (var i = 0; i < 16; i++) st.delete(kit + "_" + i);
      return null;
    }).catch(function () {});
    refreshPads(); buildSeq(); saveSession();
    toast("Fresh beat — empty pattern, stock " + kit + " pads.");
  }

  /* ---------------- Recording (WAV) ----------------
   * One ScriptProcessor captures 3 sample-aligned channels:
   *   0/1 = master bus L/R (the beat, exactly what ● Record always captured)
   *   2   = raw mic (only used by Record Vocals; silent otherwise)
   */
  var rec = { on: false, mode: "beat", L: [], R: [], V: [], frames: 0, limit: 0, startedPattern: false, t0: 0, tick: null };
  var recNode = null, vocalBus = null, vocalFader = null, vocalAnalyser = null, monitorGain = null;
  function setupRecorder() {
    var stereo = ctx.createGain(); // force stereo so a mono master lands in both L and R
    stereo.channelCount = 2; stereo.channelCountMode = "explicit"; stereo.channelInterpretation = "speakers";
    master.connect(stereo);
    var split = ctx.createChannelSplitter(2);
    stereo.connect(split);
    var mergeN = ctx.createChannelMerger(3);
    split.connect(mergeN, 0, 0);
    split.connect(mergeN, 1, 1);
    vocalBus = ctx.createGain(); // mic → mono
    vocalBus.channelCount = 1; vocalBus.channelCountMode = "explicit"; vocalBus.channelInterpretation = "speakers";
    vocalBus.connect(mergeN, 0, 2);
    vocalFader = ctx.createGain();
    vocalAnalyser = ctx.createAnalyser();
    vocalAnalyser.fftSize = 512;
    monitorGain = ctx.createGain();
    monitorGain.gain.value = 0;
    vocalBus.connect(vocalFader);
    vocalFader.connect(vocalAnalyser);
    vocalAnalyser.connect(monitorGain);
    monitorGain.connect(ctx.destination); // monitor bypasses master so it is never double-recorded
    recNode = ctx.createScriptProcessor(4096, 3, 1);
    mergeN.connect(recNode);
    var z = ctx.createGain();
    z.gain.value = 0;
    recNode.connect(z);
    z.connect(ctx.destination);
    applyMixer();
    recNode.onaudioprocess = function (e) {
      if (!rec.on) return;
      var ib = e.inputBuffer;
      var l = ib.getChannelData(0);
      var r = ib.numberOfChannels > 1 ? ib.getChannelData(1) : l;
      rec.L.push(new Float32Array(l));
      rec.R.push(new Float32Array(r));
      if (rec.mode === "vocal") rec.V.push(ib.numberOfChannels > 2 ? new Float32Array(ib.getChannelData(2)) : new Float32Array(l.length));
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
      var A = arrangement();
      if (!A) return 0; // no structure → free length
      return Math.max(1, totalBars(A) - S.cueBar) * barSec() + 2;
    }
    return +v;
  }
  function startRec() {
    if (!ensureCtx() || rec.on || vox.state !== "idle") return;
    var secs = recLengthSecs();
    rec.mode = "beat";
    rec.L = []; rec.R = []; rec.V = []; rec.frames = 0;
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
  function bounce(barsSel) {
    var sd = stepDur();
    var A = arrangement();
    var songMode = barsSel === "song";
    if (songMode && !A) { toast("Pick a song structure first (Song bar above)."); return; }
    var startBar = songMode ? 0 : 0;
    var bars = songMode ? totalBars(A) : +barsSel;
    var total = bars * STEPS;
    var dur = total * sd + 2.5;
    var c = new OfflineAudioContext(2, Math.ceil(SR * dur), SR);
    var cp = c.createDynamicsCompressor();
    cp.threshold.value = -10; cp.ratio.value = 4; cp.attack.value = 0.003; cp.release.value = 0.15;
    var m = c.createGain();
    m.gain.value = mixGain("master");
    cp.connect(m); m.connect(c.destination);
    var gn = {};
    GROUPS.forEach(function (g) {
      var n = c.createGain(); n.gain.value = mixGain(g.id); n.connect(cp); gn[g.id] = n;
    });
    var reg = [], creg = [];
    var any = S.chordTrack.on;
    for (var p = 0; p < 16 && !any; p++) for (var q = 0; q < STEPS; q++) if (S.pattern[p][q]) any = true;
    if (!any) { toast("Pattern is empty — add steps first."); return; }
    for (var k = 0; k < total; k++) {
      // loop bounces ignore the structure so "4 bars" really means the 4-bar loop
      var info = songMode ? stepInfo(startBar * STEPS + k) : { k: k, patStep: k % STEPS, fire: true, feel: "full", mb: k / STEPS };
      if (info.end) break;
      if (info.fire) scheduleStep(c, info, k * sd, gn, reg, creg, k === 0);
    }
    cutChords(creg, total * sd);
    $("rec-status").textContent = songMode ? "Bouncing full song… (can take up to a minute)" : "Bouncing…";
    c.startRendering().then(function (buf) {
      var frames = Math.round((total * sd + 0.8) * SR);
      frames = Math.min(frames, buf.length);
      var blob = encodeWav(buf.getChannelData(0), buf.getChannelData(1), frames, SR);
      var label = songMode ? "Bounce full song" : "Bounce " + bars + " bars";
      saveToVault(blob, frames / SR, label);
      $("rec-status").textContent = (songMode ? "Bounced full song" : "Bounced " + bars + " bars") + " to Vault";
    }).catch(function (e) { toast("Bounce failed: " + e.message); });
  }

  /* ---------------- Vault ---------------- */
  function saveToVault(blob, dur, label) {
    var item = {
      id: "r_" + Date.now().toString(36),
      name: label + " · " + S.kit.toUpperCase() + " " + S.bpm + "bpm",
      created: Date.now(),
      duration: dur,
      size: blob.size,
      blob: blob
    };
    idb("vault", "readwrite", function (st) { return st.put(item); })
      .catch(function () { memVault.push(item); toast("Saved for this session only — download to keep."); })
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
          var url = URL.createObjectURL(it.blob);
          vaultUrls.push(url);
          var el = document.createElement("div");
          el.className = "vitem";
          el.innerHTML =
            '<div class="vitem-top"><strong></strong><span></span></div>' +
            '<audio controls preload="none"></audio>' +
            '<div class="vitem-actions">' +
              '<a class="btn small" download>Download WAV</a>' +
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
        '<div class="faders"><div class="meter"><i></i></div>' +
        '<div class="vwrap"><input type="range" min="0" max="100" aria-label="Volume"></div></div>' +
        '<span class="val"></span>' +
        '<button type="button" class="mute">MUTE</button>';
      st.querySelector(".sname").textContent = g.name;
      var r = st.querySelector("input"), val = st.querySelector(".val"), mute = st.querySelector(".mute");
      r.value = Math.round(S.mixer[g.id].v * 100);
      val.textContent = r.value + "%";
      mute.classList.toggle("on", S.mixer[g.id].m);
      r.addEventListener("input", function () {
        S.mixer[g.id].v = r.value / 100;
        val.textContent = r.value + "%";
        applyMixer(); saveSession();
      });
      mute.addEventListener("click", function () {
        S.mixer[g.id].m = !S.mixer[g.id].m;
        mute.classList.toggle("on", S.mixer[g.id].m);
        applyMixer(); saveSession();
      });
      meterEls[g.id] = st.querySelector(".meter i");
      wrap.appendChild(st);
    });
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
    g.fillText(S.kit.toUpperCase() + " · " + S.bpm + " BPM", cx, portrait ? H * 0.9 : H * 0.92);
  }

  /* ---------------- Animation loop ---------------- */
  var activeTab = "beats";
  function loop() {
    if (ctx && playing) {
      while (uiQueue.length && uiQueue[0].time <= ctx.currentTime) {
        var q = uiQueue.shift();
        posAnchor = { k: q.k, time: q.time };
        if (q.fire) setNowColumn(q.step);
      }
    }
    if (activeTab === "mixer" && ctx) {
      GROUPS.forEach(function (g) {
        meterEls[g.id].style.height = Math.min(100, peak(groupNodes[g.id].an) * 100) + "%";
      });
      meterEls.master.style.height = Math.min(100, peak(masterAnalyser) * 100) + "%";
      if (meterEls.vocal && vocalAnalyser) meterEls.vocal.style.height = (vox.stream ? Math.min(100, peak(vocalAnalyser) * 100) : 0) + "%";
    }
    var posK = currentPosK(), bar = posK / STEPS;
    if (activeTab === "beats" || ly.open) updatePositionUI(posK);
    if (ly.open) {
      ly.prompter.update(bar, playing || prForceScroll);
      prForceScroll = false;
    } else if (activeTab === "lyrics") {
      ly.preview.update(bar, playing);
    }
    if (activeTab === "studio") {
      drawFrame($("cv-169"));
      drawFrame($("cv-916"));
    }
    requestAnimationFrame(loop);
  }

  /* ---------------- Vocal takes (mic over the beat) ---------------- */
  var vox = { state: "idle", stream: null, src: null, inLat: 0, timers: [], last: null, check: false };
  function micErrorMsg(e) {
    if (!window.isSecureContext) return "Mic recording needs a secure page — open the app over HTTPS or on localhost / 127.0.0.1.";
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return "This browser can't record from a microphone.";
    var n = e && e.name;
    if (n === "NotAllowedError" || n === "PermissionDeniedError" || n === "SecurityError")
      return "Microphone permission was denied. Allow the mic for this site (lock / tune icon in the address bar → Microphone → Allow), then tap Record Vocals again. Beat-only ● Record still works.";
    if (n === "NotFoundError" || n === "DevicesNotFoundError") return "No microphone found. Plug in a mic or headset and try again.";
    if (n === "NotReadableError" || n === "TrackStartError") return "The mic is busy or blocked by the system (another app may be using it).";
    if (n === "AbortError") return "Opening the mic was interrupted. Try again.";
    return "Could not open the mic" + (e && e.message ? ": " + e.message : ".");
  }
  function openMic() {
    if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return Promise.reject({ name: "Unsupported" });
    }
    if (vox.stream) return Promise.resolve(vox.stream);
    var md = navigator.mediaDevices;
    return md.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
      .catch(function (e) {
        if (e && (e.name === "OverconstrainedError" || e.name === "TypeError")) return md.getUserMedia({ audio: true });
        throw e;
      })
      .then(function (stream) {
        vox.stream = stream;
        vox.src = ctx.createMediaStreamSource(stream);
        vox.src.connect(vocalBus);
        var tr = stream.getAudioTracks()[0];
        var st = tr && tr.getSettings ? tr.getSettings() : {};
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
    if (vox.state !== "idle") { stopVocalTake(); return; }
    if (rec.on) { toast("Finish the current recording first."); return; }
    if (!ensureCtx()) return;
    if (vox.check) stopMicCheck();
    vox.state = "arming"; setVoxButtons();
    setVoxStatus("Requesting microphone…");
    openMic().then(function () {
      if (vox.state !== "arming") { closeMic(); return; }
      if (playing) stop(true); // keep the cue: the take starts where the song is cued
      var beat = 60 / S.bpm, t0 = ctx.currentTime + 0.2, start = t0 + beat * 4;
      vox.state = "count"; setVoxButtons();
      for (var i = 0; i < 4; i++) {
        click(t0 + i * beat, i === 0);
        (function (n, at) {
          vox.timers.push(setTimeout(function () {
            showCount(n); setVoxStatus("Count-in " + n + " / 4 — bar " + (S.cueBar + 1) + " next");
          }, Math.max(0, (at - ctx.currentTime) * 1000)));
        })(i + 1, t0 + i * beat);
      }
      play(start);
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
    rec.L = []; rec.R = []; rec.V = []; rec.frames = 0;
    rec.limit = Math.round((secs || 600) * ctx.sampleRate);
    rec.startedPattern = true;
    rec.t0 = Date.now();
    rec.on = true;
    vox.state = "rec"; setVoxButtons();
    clearInterval(rec.tick);
    rec.tick = setInterval(function () {
      var el = (Date.now() - rec.t0) / 1000;
      setVoxStatus("● REC VOCALS " + fmtTime(el) + (secs ? " / " + fmtTime(secs) : " (free)") + " · tap Stop take to finish");
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
    if (frames < sr * 0.5) { rec.L = []; rec.R = []; rec.V = []; setVoxStatus("Take too short — nothing saved"); return; }
    var L = merge(rec.L, frames), R = merge(rec.R, frames), V = merge(rec.V, frames);
    rec.L = []; rec.R = []; rec.V = [];
    // trim the short pre-roll before the first beat hit (both tracks equally, so sync is kept)
    var on = -1, lim = Math.min(frames, sr);
    for (var i = 0; i < lim; i++) { if (Math.abs(L[i]) > 0.002 || Math.abs(R[i]) > 0.002) { on = i; break; } }
    var cut = on > 0 ? Math.max(0, on - Math.round(sr * 0.01)) : 0;
    if (cut) { L = L.subarray(cut); R = R.subarray(cut); V = V.subarray(cut); frames -= cut; }
    var song = getSong(S.lyricSong);
    vox.last = { L: L, R: R, V: V, frames: frames, sr: sr, title: song ? song.title : "" };
    exportVocalMix(true);
    renderLastTake();
  }
  function vocalPeak(V) {
    var p = 0;
    for (var i = 0; i < V.length; i += 4) { var a = Math.abs(V[i]); if (a > p) p = a; }
    return p;
  }
  function exportVocalMix(first) {
    var t = vox.last;
    if (!t) { toast("No vocal take yet."); return; }
    var sh = Math.round((autoLatency() + S.vox.nudge / 1000) * t.sr); // mic arrives late → pull it earlier
    var vg = mixGain("vocal");
    var n = t.frames, outL = new Float32Array(n), outR = new Float32Array(n), dry = S.vox.dry && first ? new Float32Array(n) : null;
    for (var i = 0; i < n; i++) {
      var j = i + sh;
      var v = j >= 0 && j < n ? t.V[j] : 0;
      if (dry) dry[i] = v;
      outL[i] = t.L[i] + v * vg;
      outR[i] = t.R[i] + v * vg;
    }
    var name = "Vocal take" + (t.title ? " · " + t.title : "");
    saveToVault(encodeWav(outL, outR, n, t.sr), n / t.sr, first ? name : name + " (re-mix)");
    if (dry) saveToVault(encodeWav(dry, dry, n, t.sr), n / t.sr, "Dry vocal" + (t.title ? " · " + t.title : ""));
    var quiet = vocalPeak(t.V) < 0.003;
    setVoxStatus("Saved " + fmtTime(n / t.sr) + " vocal + beat mix to Vault" + (quiet ? " — warning: the mic signal was almost silent" : ""), quiet);
    if (first) toast("Vocal take saved to Vault (beat + vocal WAV)");
  }
  function renderLastTake() {
    var el = $("vox-last");
    if (!el) return;
    if (!vox.last) { el.textContent = "No take yet this session."; $("vox-remix").disabled = true; return; }
    el.textContent = "Last take: " + fmtTime(vox.last.frames / vox.last.sr) + (vox.last.title ? " · " + vox.last.title : "");
    $("vox-remix").disabled = false;
  }
  function startMicCheck() {
    if (!ensureCtx() || vox.state !== "idle") return;
    openMic().then(function () {
      vox.check = true; setVoxButtons();
      setVoxStatus("Mic check on — watch the Vocal meter" + (S.vox.monitor ? " (monitoring)" : ""));
    }).catch(function (e) { var m = micErrorMsg(e); setVoxStatus(m, true); toast(m); });
  }
  function stopMicCheck() {
    vox.check = false;
    if (vox.state === "idle") closeMic();
    setVoxButtons();
    setVoxStatus("Mic off");
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
  function beatSnapshot() {
    return {
      kit: S.kit, bpm: S.bpm, swing: S.swing,
      pattern: S.pattern.map(function (r) { return r.slice(); }),
      pitches: S.pitches.slice(),
      chords: JSON.parse(JSON.stringify(S.chordTrack)),
      structure: S.structure
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
      o.textContent = b.title + " — " + bp.kit.charAt(0).toUpperCase() + bp.kit.slice(1) + " " + bp.bpm + " (beat + lyrics)";
      ps.appendChild(o);
    });
    songStore.songs.forEach(function (x) {
      if (!x.beat) return;
      var o = document.createElement("option");
      o.value = "u:" + x.id; o.textContent = x.title + " — " + x.beat.kit + " " + x.beat.bpm + " (beat + lyrics)";
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
        seg.className = "tl-seg f-" + (sec.feel || "full") + (/hook/i.test(sec.name) ? " hook" : "");
        seg.style.flexGrow = sec.bars;
        seg.dataset.i = i;
        seg.innerHTML = "<b></b><small></small>";
        seg.querySelector("b").textContent = sec.name;
        seg.querySelector("small").textContent = sec.bars + (sec.feel === "half" ? " · ½-time" : "");
        seg.title = sec.name + " · " + sec.bars + " bars" + (sec.feel === "half" ? " (half-time feel)" : sec.feel === "sparse" ? " (no kick/snare/808)" : "") + " — tap to cue";
        var at = b;
        seg.addEventListener("click", function () { cueTo(at); });
        el.appendChild(seg);
        b += sec.bars;
      });
      var head = document.createElement("i");
      head.className = "tl-head";
      el.appendChild(head);
    });
    var ss = $("struct-sel");
    if (ss) ss.value = S.structure || "";
    var rl = $("rec-length"), so = rl.querySelector('option[value="song"]');
    so.disabled = !arrangement();
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
  function patternHasNotes() {
    return S.pattern.some(function (r) { return r.some(function (v) { return !!v; }); });
  }
  function applySongPreset(val) {
    if (!val) return;
    var kind = val.charAt(0), id = val.slice(2), beat = null, song = getSong(id), extra = null;
    if (kind === "b") {
      var b = BUILTIN_SONGS.filter(function (x) { return x.id === id; })[0];
      extra = b && BEAT_PRESETS[b.preset];
      beat = extra ? {
        kit: extra.kit, bpm: extra.bpm, swing: extra.swing, pattern: extra.pattern,
        chords: extra.chords, structure: extra.structure
      } : null;
    } else if (song) beat = song.beat;
    if (!beat || !song) { toast("That song has no beat attached."); return; }
    var newPat = patternFrom(beat.pattern);
    var same = JSON.stringify(newPat) === JSON.stringify(S.pattern);
    if (patternHasNotes() && !same && !confirm("Load “" + song.title + "”? This replaces the current pattern, BPM, chord loop and song form (your swapped pad samples stay).")) {
      $("song-preset").value = ""; return;
    }
    if (vox.state !== "idle") stopVocalTake();
    stop();
    S.bpm = clamp(+beat.bpm || 140, 60, 200);
    S.swing = clamp(+beat.swing || 0, 0, 60);
    S.pattern = newPat;
    S.pitches = Array.isArray(beat.pitches) && beat.pitches.length === 16 ? beat.pitches.slice() : new Array(16).fill(0);
    var ct = defaultChordTrack();
    if (beat.chords) Object.keys(ct).forEach(function (k) { if (beat.chords[k] != null) ct[k] = JSON.parse(JSON.stringify(beat.chords[k])); });
    S.chordTrack = ct;
    S.structure = beat.structure && STRUCTURES[beat.structure] ? beat.structure : null;
    S.cueBar = 0;
    if (S.structure) S.bpl = "auto";
    if (extra && extra.mixer) Object.keys(extra.mixer).forEach(function (k) { if (S.mixer[k]) S.mixer[k].v = extra.mixer[k]; });
    if (extra && extra.studio) { $("studio-title").value = extra.studio.title; $("studio-artist").value = extra.studio.artist; }
    else { $("studio-title").value = song.title; }
    $("bpm").value = S.bpm;
    $("swing").value = S.swing;
    buildMixer(); applyMixer();
    renderChordLoopUI();
    renderTimelines();
    if (S.structure) $("rec-length").value = "song"; // Record / Record Vocals cover the whole song by default
    if (song.id === S.lyricSong && ly.dirty) renderLyrics(); // keep the edits in progress
    else if (!ly.dirty || confirm("Discard unsaved lyric changes?")) selectLyricSong(song.id, true);
    var kitP = beat.kit && KITS[beat.kit] && beat.kit !== S.kit ? loadKit(beat.kit) : Promise.resolve(buildSeq());
    return kitP.then(function () {
      saveSession();
      var names = S.chordTrack.on ? S.chordTrack.prog.map(function (i) { return CHORDS[i] ? CHORDS[i].n : "—"; }).join("–") : "";
      toast("Loaded “" + song.title + "” — beat + lyrics · " + S.kit + " " + S.bpm + " BPM" + (names ? " · " + names : ""));
    });
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
  var KEYMAP = { a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12 };
  function wire() {
    document.querySelectorAll(".tab").forEach(function (t) {
      t.addEventListener("click", function () {
        activeTab = t.dataset.tab;
        document.querySelectorAll(".tab").forEach(function (x) {
          x.classList.toggle("active", x === t);
          x.setAttribute("aria-selected", x === t ? "true" : "false");
        });
        document.querySelectorAll(".panel").forEach(function (p) {
          p.classList.toggle("active", p.id === "tab-" + activeTab);
        });
        if (activeTab === "vault") renderVault();
        if (activeTab === "lyrics") { ly.preview.tops = null; }
        if (activeTab === "mixer") updateLatencyLabel();
      });
    });
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
    var sw = $("swing");
    sw.value = S.swing;
    sw.addEventListener("input", function () { S.swing = +sw.value; saveSession(); });

    document.querySelectorAll(".kit").forEach(function (b) {
      b.addEventListener("click", function () { if (b.dataset.kit !== S.kit) loadKit(b.dataset.kit); });
    });
    $("btn-fresh").addEventListener("click", freshBeat);
    $("btn-demo").addEventListener("click", function () {
      loadDemo(S.kit);
      $("bpm").value = S.bpm;
      buildSeq(); saveSession();
      toast(S.kit.charAt(0).toUpperCase() + S.kit.slice(1) + " demo loaded");
    });
    $("btn-clear-row").addEventListener("click", function () {
      S.pattern[S.sel] = new Array(STEPS).fill(0);
      buildSeq(); saveSession();
    });
    $("pad-file").addEventListener("change", function (e) {
      onPadFile(e.target.files[0]);
      e.target.value = "";
    });
    $("btn-pad-reset").addEventListener("click", function () { resetPad(S.sel); });
    $("pad-pitch").addEventListener("input", function (e) {
      S.pitches[S.sel] = +e.target.value;
      $("pad-pitch-val").textContent = (S.pitches[S.sel] > 0 ? "+" : "") + S.pitches[S.sel];
      saveSession();
    });
    $("btn-rec").addEventListener("click", startRec);
    $("btn-rec-stop").addEventListener("click", stopRec);
    $("btn-bounce").addEventListener("click", function () { bounce($("bounce-bars").value); });
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
    $("song-preset").addEventListener("change", function (e) { applySongPreset(e.target.value); });
    $("struct-sel").addEventListener("change", function (e) {
      if (playing) stop();
      S.structure = e.target.value || null; S.cueBar = 0;
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
    $("vox-monitor").addEventListener("change", function (e) { S.vox.monitor = e.target.checked; applyMixer(); saveSession(); });
    $("vox-dry").addEventListener("change", function (e) { S.vox.dry = e.target.checked; saveSession(); });
    $("vox-nudge").addEventListener("change", function (e) {
      S.vox.nudge = clamp(Math.round(+e.target.value || 0), -300, 300);
      e.target.value = S.vox.nudge; saveSession();
    });
    $("vox-remix").addEventListener("click", function () { exportVocalMix(false); });
    $("vox-check").addEventListener("click", function () { vox.check ? stopMicCheck() : startMicCheck(); });
    window.addEventListener("beforeunload", function (e) {
      if (ly.dirty || vox.state === "rec") { e.preventDefault(); e.returnValue = ""; }
    });
  }

  function init() {
    var had = loadSession();
    if (!had) loadDemo("trap");
    loadSongStore();
    buildPads();
    buildChords();
    buildPiano();
    buildMixer();
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
    loadKit(S.kit).then(function () { selectPad(S.sel); });
    renderVault();
    requestAnimationFrame(loop);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
