/* Island Pin Beats — keys / melodic instruments (window.IPBKeys).
 * 100% Web Audio synthesis — no sample files. The "2026 Rap" instruments (tuned 808 with glide + drive, Reese/drill
 * bass, trap pluck, digital bell, dark/felt/lo-fi trap pianos, hyper supersaw lead, sidechain-pumping pad, vocal
 * chops, hip-hop horn stab, trap flute, guitar pluck, 16th arp) were designed for this app: layered oscillators,
 * filter envelopes, saturation and stereo spread, so they sound polished on phones and big speakers alike.
 * Shared by the Piano Roll and the keys-loop bank: every voice is play(ctx, destination, midi, when, dur, vel, instId,
 * gain, tone) and works the same in a live AudioContext and an OfflineAudioContext, so live playback, Record, Bounce
 * and exports sound identical. tone = { drive 0–1, glide 0–1 } (per pattern; missing = the instrument's defaults).
 * Tempo-synced voices (sidechain pad, arp) follow IPBKeys.setTempo(bpm).
 * Levels: one voice peaks around −12 dBFS at full velocity so chords stay clean into the master limiter.
 * Older songs that used the removed Orchestra / Island instruments are re-mapped by migrate() (see LEGACY).
 */
(function () {
  "use strict";
  function mf(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  /* dr = drive handled inside the voice; gl = mono voice with glide/slide; drive/glide = defaults */
  var INSTRUMENTS = [
    { id: "808", name: "Tuned 808 (glide + drive)", cat: "2026 Rap · Bass", poly: false, dr: true, gl: true, drive: 0.4, glide: 0.5 },
    { id: "reese", name: "Reese / Drill Bass", cat: "2026 Rap · Bass", poly: false, dr: true, gl: true, drive: 0.45, glide: 0.6 },
    { id: "trappluck", name: "Trap Pluck", cat: "2026 Rap · Melody", poly: true, drive: 0.1 },
    { id: "dbell", name: "Digital Bell", cat: "2026 Rap · Melody", poly: true, drive: 0 },
    { id: "trappiano", name: "Dark Trap Piano", cat: "2026 Rap · Melody", poly: true, drive: 0.12 },
    { id: "feltpiano", name: "Felt Piano (melodic rap)", cat: "2026 Rap · Melody", poly: true, drive: 0 },
    { id: "lofipiano", name: "Lo-Fi Trap Piano", cat: "2026 Rap · Melody", poly: true, drive: 0.25 },
    { id: "hyperlead", name: "Hyper Supersaw Lead", cat: "2026 Rap · Melody", poly: true, drive: 0.2 },
    { id: "trapflute", name: "Trap Flute Lead", cat: "2026 Rap · Melody", poly: false, gl: true, drive: 0.08, glide: 0.3 },
    { id: "gtrpluck", name: "Guitar Pluck", cat: "2026 Rap · Melody", poly: true, drive: 0.05 },
    { id: "arp", name: "16th Octave Arp", cat: "2026 Rap · Melody", poly: true, drive: 0.12 },
    { id: "horn", name: "Hip-Hop Horn Stab", cat: "2026 Rap · Stabs & Vox", poly: true, drive: 0.3 },
    { id: "voxah", name: "Vocal Chop · Ahh", cat: "2026 Rap · Stabs & Vox", poly: true, drive: 0.05 },
    { id: "voxoo", name: "Vocal Chop · Ooh", cat: "2026 Rap · Stabs & Vox", poly: true, drive: 0.05 },
    { id: "sidepad", name: "Sidechain Pumping Pad", cat: "2026 Rap · Pads", poly: true, drive: 0.08 },
    { id: "grand", name: "Grand Piano", cat: "Classic keys", poly: true },
    { id: "rhodes", name: "Rhodes EP", cat: "Classic keys", poly: true },
    { id: "lofi", name: "Dusty Keys (lo-fi EP)", cat: "Classic keys", poly: true },
    { id: "organ", name: "Soul Organ", cat: "Classic keys", poly: true },
    { id: "pad", name: "Dark Pad", cat: "Classic pads & synths", poly: true },
    { id: "strings", name: "Cinematic Strings (synth)", cat: "Classic pads & synths", poly: true },
    { id: "pluck", name: "Pluck", cat: "Classic pads & synths", poly: true },
    { id: "bell", name: "Bell / Glock", cat: "Classic pads & synths", poly: true },
    { id: "lead", name: "Soft Lead", cat: "Classic pads & synths", poly: false },
    { id: "whine", name: "G-Funk Whine Lead", cat: "Classic pads & synths", poly: false },
    { id: "bass", name: "Sub Bass", cat: "Classic bass", poly: false },
    { id: "synthbass", name: "Analog Bass", cat: "Classic bass", poly: false }
  ];
  var BY_ID = {};
  INSTRUMENTS.forEach(function (i) { BY_ID[i.id] = i; });
  var DEFAULT = "trappluck";
  /* removed Orchestra / Island instruments → the closest modern sound (old songs, patterns and imports still load) */
  var LEGACY = { ostrings: "strings", pizz: "gtrpluck", brass: "horn", flute: "trapflute", clarinet: "trapflute", orchhit: "horn",
    steelpan: "dbell", marimba: "trappluck", kalimba: "trappluck", brasssynth: "horn", marimbasynth: "trappluck" };
  function migrate(id) {
    if (typeof id !== "string") return null;
    if (BY_ID[id]) return id;
    return LEGACY[id] || null;
  }
  /* one-tap Piano Roll presets: instrument + tone */
  var PRESETS = [
    { id: "bounce26", name: "2026 Bounce Pluck", inst: "trappluck", tone: { drive: 0.1 } },
    { id: "808slide", name: "808 Slide · hard", inst: "808", tone: { drive: 0.65, glide: 0.6 } },
    { id: "808clean", name: "808 Clean Sub", inst: "808", tone: { drive: 0.1, glide: 0.35 } },
    { id: "drill", name: "Drill Reese Slide", inst: "reese", tone: { drive: 0.5, glide: 0.75 } },
    { id: "rage", name: "Rage Supersaw", inst: "hyperlead", tone: { drive: 0.4 } },
    { id: "bellmel", name: "Digital Bell Melody", inst: "dbell", tone: { drive: 0 } },
    { id: "darkkeys", name: "Dark Trap Keys", inst: "trappiano", tone: { drive: 0.12 } },
    { id: "felt", name: "Felt Piano · melodic rap", inst: "feltpiano", tone: { drive: 0 } },
    { id: "lofikeys", name: "Lo-Fi Trap Piano", inst: "lofipiano", tone: { drive: 0.25 } },
    { id: "flute", name: "Trap Flute Lead", inst: "trapflute", tone: { drive: 0.08, glide: 0.3 } },
    { id: "horns", name: "Hip-Hop Horn Stab", inst: "horn", tone: { drive: 0.3 } },
    { id: "voxah", name: "Vocal Chop · Ahh", inst: "voxah", tone: { drive: 0.05 } },
    { id: "voxoo", name: "Vocal Chop · Ooh", inst: "voxoo", tone: { drive: 0.05 } },
    { id: "pump", name: "Pumping Pad", inst: "sidepad", tone: { drive: 0.08 } },
    { id: "gtr", name: "Melodic Guitar Pluck", inst: "gtrpluck", tone: { drive: 0.05 } },
    { id: "arp", name: "16th Octave Arp", inst: "arp", tone: { drive: 0.12 } }
  ];
  var DEFAULT_PRESET = "bounce26";
  var TEMPO = 120;
  function setTempo(b) { b = +b; if (isFinite(b) && b > 0) TEMPO = clamp(b, 40, 260); return TEMPO; }

  /* per-context caches (PeriodicWaves, curves, noise and plucked-string tables can't be shared between contexts) */
  var caches = typeof WeakMap === "function" ? new WeakMap() : null;
  function cache(c) {
    if (!caches) return (c.__ipbk || (c.__ipbk = {}));
    var o = caches.get(c);
    if (!o) { o = {}; caches.set(c, o); }
    return o;
  }
  function wave(c, key, amps) {
    var k = cache(c);
    if (k[key]) return k[key];
    var re = new Float32Array(amps.length + 1), im = new Float32Array(amps.length + 1);
    for (var i = 0; i < amps.length; i++) im[i + 1] = amps[i];
    return (k[key] = c.createPeriodicWave(re, im, { disableNormalization: false }));
  }
  function noise(c) {
    var k = cache(c);
    if (k.noise) return k.noise;
    var n = Math.floor(c.sampleRate * 0.25), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0), x = 22222;
    for (var i = 0; i < n; i++) { x = (x * 1103515245 + 12345) & 0x7fffffff; d[i] = (x / 0x3fffffff) - 1; } // deterministic
    return (k.noise = b);
  }
  function tanhCurve(c) {
    var k = cache(c);
    if (k.tanh) return k.tanh;
    var cur = new Float32Array(2048);
    for (var i = 0; i < 2048; i++) { var x = (i / 1023.5 - 1) * 4; cur[i] = Math.tanh(x); }
    return (k.tanh = cur); // input range ±4 → output ±1 (WaveShaper maps −1…1 of the input to the curve)
  }
  /* saturation stage: in → pre gain → tanh → makeup → out. `lvl` = typical peak going in (keeps loudness steady) */
  function driveStage(c, out, amt, lvl) {
    var G = 1 + amt * 9, pre = c.createGain(), sh = c.createWaveShaper(), post = c.createGain();
    lvl = lvl || 0.25;
    pre.gain.value = G / 4; // curve spans ±4
    sh.curve = tanhCurve(c); sh.oversample = "2x";
    post.gain.value = lvl / Math.tanh(lvl * G);
    pre.connect(sh); sh.connect(post); post.connect(out);
    return pre;
  }
  function pan(c, x, target) {
    if (!c.createStereoPanner || !x) return target;
    var p = c.createStereoPanner(); p.pan.value = clamp(x, -1, 1); p.connect(target);
    return p;
  }
  function gainTo(c, val, target) { var g = c.createGain(); g.gain.value = val; g.connect(target); return g; }
  /* piano-ish spectrum: odd/even partials, soft top */
  var PIANO_AMPS = [1, 0.62, 0.38, 0.26, 0.2, 0.13, 0.1, 0.07, 0.05, 0.035, 0.025, 0.018];
  var DARK_AMPS = [1, 0.5, 0.26, 0.17, 0.1, 0.06, 0.04, 0.025, 0.015];
  var FELT_AMPS = [1, 0.34, 0.14, 0.07, 0.035, 0.015];
  var EP_AMPS = [1, 0.08, 0.03];
  var ORGAN_AMPS = [1, 0.7, 0.45, 0.5, 0.12, 0.3, 0, 0.25]; // 16' 8' 5⅓' 4' … drawbar-ish

  /* voice helper: out gain → dest; returns a voice with stop(t) */
  function voiceBase(c, dest, t) {
    var out = c.createGain();
    out.gain.setValueAtTime(0, t);
    out.connect(dest);
    return { out: out, nodes: [], t: t, end: t };
  }
  function osc(v, c, type, freq, t, det, target, per) {
    var o = c.createOscillator();
    if (per) o.setPeriodicWave(per); else o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (det) o.detune.setValueAtTime(det, t);
    o.connect(target || v.out);
    o.start(t);
    v.nodes.push(o);
    return o;
  }
  function noiseSrc(v, c, t, target) {
    var nb = c.createBufferSource(); nb.buffer = noise(c); nb.loop = true;
    nb.connect(target); nb.start(t); v.nodes.push(nb);
    return nb;
  }
  function finish(v, stopAt) {
    v.end = stopAt;
    v.nodes.forEach(function (n) { try { n.stop(stopAt); } catch (e) { /* ignore */ } });
    v.stop = function (t) { // cut early (transport stop / pattern change / mono retrigger) with a short fade
      try {
        var g = v.out.gain;
        if (g.cancelAndHoldAtTime) g.cancelAndHoldAtTime(t); else { g.cancelScheduledValues(t); }
        g.setTargetAtTime(0, t, 0.012);
        v.nodes.forEach(function (n) { try { n.stop(t + 0.12); } catch (e) { /* ignore */ } });
      } catch (e) { /* already stopped */ }
      v.end = Math.min(v.end, t + 0.12);
    };
    return v;
  }
  /* ADSR on v.out: peak at `a`, decays toward `sus` with time-constant `dk`, release `rel` after note end */
  function env(v, t, dur, peak, a, sus, dk, rel) {
    var g = v.out.gain;
    g.setValueAtTime(0, t);
    g.linearRampToValueAtTime(peak, t + a);
    g.setTargetAtTime(peak * sus, t + a, dk);
    var off = t + Math.max(a + 0.005, dur);
    g.setTargetAtTime(0, off, rel / 4);
    return off + rel * 1.6 + 0.05;
  }
  /* mono voices (808, Reese, trap flute): a note that starts while the previous one still holds cuts it and — with
     glide > 0 — slides from its pitch (overlap two notes in the Piano Roll = 808 slide). Notes starting together
     (chords) stay polyphonic. State lives per context, so live and offline renders behave the same. */
  function monoPrev(c, id, t) { // previous note of this mono voice if it is still sounding (incl. release) at t
    var k = cache(c), st = k["mono_" + id];
    if (!st || t < st.t + 0.002 || !st.v || t >= st.v.end) return null;
    st.overlap = t < st.off - 0.004; // started before the previous note was let go → slide
    return st;
  }
  function monoSet(c, id, m, t, dur, v) { cache(c)["mono_" + id] = { m: m, t: t, off: t + dur, v: v }; }
  function glideFreq(o, prev, f, t, g) {
    if (!prev) return;
    var from = mf(prev.m);
    o.frequency.cancelScheduledValues(t);
    o.frequency.setValueAtTime(from * (o.__mul || 1), t);
    o.frequency.exponentialRampToValueAtTime(f * (o.__mul || 1), t + g);
  }

  /* Karplus–Strong plucked string table for one MIDI note (deterministic, generated once per context) */
  function ksBuffer(c, m) {
    var k = cache(c), key = "ks" + m;
    if (k[key]) return k[key];
    var sr = c.sampleRate, f = mf(m), N = Math.max(2, Math.round(sr / f - 0.5)), len = Math.floor(sr * 2.4);
    var b = c.createBuffer(1, len, sr), d = b.getChannelData(0), x = 1234 + m * 977, lp = 0, peak = 0;
    var damp = clamp(0.9965 + (m - 40) * 0.00003, 0.9955, 0.9992);
    for (var i = 0; i < N; i++) { x = (x * 1103515245 + 12345) & 0x7fffffff; var r = (x / 0x3fffffff) - 1; lp += 0.55 * (r - lp); d[i] = lp; }
    for (var j = N; j < len; j++) d[j] = damp * 0.5 * (d[j - N] + (j - N - 1 >= 0 ? d[j - N - 1] : 0));
    var dc = 0; for (var q = 0; q < N; q++) dc += d[q]; dc /= N;
    for (var z = 0; z < len; z++) { d[z] -= dc * Math.pow(damp, z / N); var a = Math.abs(d[z]); if (a > peak) peak = a; }
    if (peak > 0) for (var w = 0; w < len; w++) d[w] /= peak;
    return (k[key] = { buf: b, rate: f / (sr / (N + 0.5)) });
  }

  var VOICES = {
    /* ================= 2026 rap / hip-hop instruments ================= */
    /* Tuned 808: sine body with a quick pitch "knock", tanh drive (harmonics so it cuts through on phones) blended with
       a clean sub; overlapping notes slide (glide time 35–255 ms) */
    "808": function (c, dest, m, t, dur, vel, o) {
      var v = voiceBase(c, dest, t), f = mf(m), prev = monoPrev(c, "808", t), gt = 0.035 + o.glide * 0.22;
      if (prev && prev.v && prev.v.stop) prev.v.stop(t + 0.004);
      var slide = prev && prev.overlap && o.glide > 0.01 && prev.m !== m;
      var lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = Math.min(9000, 1400 + o.drive * 4200 + f * 3); lp.Q.value = 0.5; lp.connect(v.out);
      var dIn = driveStage(c, lp, 0.15 + o.drive * 0.85, 0.9);
      var body = osc(v, c, "sine", f, t, 0, dIn);
      var h2 = gainTo(c, 0.22, dIn); var tri = osc(v, c, "triangle", f, t, 0, h2);
      var sub = gainTo(c, 0.55 + 0.25 * o.drive, v.out); var so = osc(v, c, "sine", f, t, 0, sub);
      if (slide) [body, tri, so].forEach(function (x) { glideFreq(x, prev, f, t, gt); });
      else [body, tri, so].forEach(function (x) { x.frequency.setValueAtTime(f * 1.9, t); x.frequency.exponentialRampToValueAtTime(f, t + 0.045); });
      if (!slide) { // click transient
        var hp = c.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 2500;
        var ng = c.createGain(); ng.gain.setValueAtTime(0.35 * vel, t); ng.gain.exponentialRampToValueAtTime(0.0005, t + 0.008);
        hp.connect(ng); ng.connect(v.out); noiseSrc(v, c, t, hp);
      }
      var end = env(v, t, dur, 0.2 * (0.5 + 0.5 * vel), slide ? 0.008 : 0.003, 0.62, 1.1, 0.09);
      monoSet(c, "808", m, t, dur, v);
      return finish(v, end);
    },
    /* Reese / drill bass: detuned saw pair (slow beating, panned wide) through a moving low-pass + drive, clean sub */
    reese: function (c, dest, m, t, dur, vel, o) {
      var v = voiceBase(c, dest, t), f = mf(m), prev = monoPrev(c, "reese", t), gt = 0.04 + o.glide * 0.24;
      if (prev && prev.v && prev.v.stop) prev.v.stop(t + 0.004);
      var slide = prev && prev.overlap && o.glide > 0.01 && prev.m !== m;
      var post = c.createBiquadFilter(); post.type = "lowpass"; post.frequency.value = 3800; post.connect(v.out);
      var dIn = driveStage(c, post, 0.2 + o.drive * 0.8, 0.5);
      var lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 2.2; lp.connect(dIn);
      var base = 260 + vel * 520 + f * 1.5;
      lp.frequency.setValueAtTime(base * 2.4, t); lp.frequency.setTargetAtTime(base, t + 0.01, 0.12);
      var lfo = c.createOscillator(); lfo.frequency.value = 0.45; var lg = c.createGain(); lg.gain.value = base * 0.45;
      lfo.connect(lg); lg.connect(lp.frequency); lfo.start(t); v.nodes.push(lfo);
      var a = osc(v, c, "sawtooth", f, t, -15, gainTo(c, 0.42, pan(c, -0.55, lp)));
      var b = osc(v, c, "sawtooth", f, t, 15, gainTo(c, 0.42, pan(c, 0.55, lp)));
      var sq = osc(v, c, "square", f / 2, t, 0, gainTo(c, 0.12, lp));
      sq.__mul = 0.5;
      var sub = osc(v, c, "sine", f, t, 0, gainTo(c, 0.5, v.out));
      if (slide) [a, b, sq, sub].forEach(function (x) { glideFreq(x, prev, f, t, gt); });
      var end = env(v, t, dur, 0.3 * (0.55 + 0.45 * vel), slide ? 0.01 : 0.006, 0.85, 0.8, 0.1);
      monoSet(c, "reese", m, t, dur, v);
      return finish(v, end);
    },
    /* trap pluck: wide detuned saws + an octave square, snappy resonant filter envelope, sine body, pick tick */
    trappluck: function (c, dest, m, t, dur, vel) {
      var v = voiceBase(c, dest, t), f = mf(m);
      var lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 4.5; lp.connect(v.out);
      lp.frequency.setValueAtTime(Math.min(16000, 2200 + vel * 7500 + f * 2), t); lp.frequency.exponentialRampToValueAtTime(Math.max(320, f * 1.6), t + 0.24);
      osc(v, c, "sawtooth", f, t, -9, gainTo(c, 0.5, pan(c, -0.5, lp)));
      osc(v, c, "sawtooth", f, t, 9, gainTo(c, 0.5, pan(c, 0.5, lp)));
      osc(v, c, "square", f * 2, t, 3, gainTo(c, 0.14, lp));
      osc(v, c, "sine", f, t, 0, gainTo(c, 0.45, v.out));
      var hp = c.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 3500;
      var ng = c.createGain(); ng.gain.setValueAtTime(0.16 * vel, t); ng.gain.exponentialRampToValueAtTime(0.0005, t + 0.006);
      hp.connect(ng); ng.connect(v.out); noiseSrc(v, c, t, hp);
      var end = env(v, t, Math.min(dur, 1.4), 0.36 * (0.4 + 0.6 * vel), 0.002, 0.0001, 0.26 + 0.12 * clamp((72 - m) / 24, 0, 1), 0.18);
      return finish(v, end);
    },
    /* digital bell: two FM pairs (inharmonic 3.5:1 strike + a softer 2:1 tone) spread left/right, glassy top partial */
    dbell: function (c, dest, m, t, dur, vel) {
      var v = voiceBase(c, dest, t), f = mf(m);
      function fm(cr, mr, idx, tau, amp, p) {
        var car = osc(v, c, "sine", f * cr, t, 0, gainTo(c, amp, pan(c, p, v.out)));
        var mod = c.createOscillator(); mod.frequency.value = f * mr;
        var mi = c.createGain(); mi.gain.setValueAtTime(f * idx, t); mi.gain.setTargetAtTime(f * idx * 0.08, t, tau);
        mod.connect(mi); mi.connect(car.frequency); mod.start(t); v.nodes.push(mod);
      }
      fm(1, 3.5, 1.2 + vel * 2.2, 0.22, 1, -0.3);
      fm(2, 1, 0.7, 0.4, 0.32, 0.35);
      var g3 = c.createGain(); g3.gain.setValueAtTime(0.12 * vel, t); g3.gain.setTargetAtTime(0, t, 0.09); g3.connect(pan(c, 0.15, v.out));
      osc(v, c, "sine", f * 4.02, t, 0, g3);
      var ring = 0.45 + 0.6 * clamp((90 - m) / 36, 0, 1);
      var end = env(v, t, Math.max(dur, 0.7), 0.22 * (0.4 + 0.6 * vel), 0.002, 0.0001, ring, 0.6);
      return finish(v, end);
    },
    /* dark trap piano: warm partials, closing low-pass, wide detuned pair, soft hammer, a touch of grit */
    trappiano: function (c, dest, m, t, dur, vel, o) {
      var v = voiceBase(c, dest, t), f = mf(m), per = wave(c, "darkpiano", DARK_AMPS);
      var lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 0.5; lp.connect(v.out);
      lp.frequency.setValueAtTime(Math.min(12000, 700 + vel * vel * 3000 + f * 1.8), t);
      lp.frequency.setTargetAtTime(Math.min(9000, 380 + f * 1.7), t + 0.01, 0.4);
      osc(v, c, null, f, t, -4, pan(c, -0.3, lp), per); osc(v, c, null, f, t, 4, pan(c, 0.3, lp), per);
      osc(v, c, "sine", f, t, 0, gainTo(c, m < 60 ? 0.32 : 0.14, lp));
      var bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = Math.min(6000, f * 4 + 600); bp.Q.value = 0.8;
      var ng = c.createGain(); ng.gain.setValueAtTime(0.06 * vel, t); ng.gain.exponentialRampToValueAtTime(0.0005, t + 0.03);
      bp.connect(ng); ng.connect(v.out); noiseSrc(v, c, t, bp);
      var decay = 1.8 + 3.5 * (1 - (m - 21) / 88);
      var end = env(v, t, dur, 0.27 * (0.35 + 0.65 * vel), 0.004, 0.0001, decay / 3, 0.4);
      return finish(v, end);
    },
    /* felt piano: muted, intimate — soft attack, very dark partials, felt thump, a slow chorus between two strings */
    feltpiano: function (c, dest, m, t, dur, vel) {
      var v = voiceBase(c, dest, t), f = mf(m), per = wave(c, "felt", FELT_AMPS);
      var lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 0.3; lp.connect(v.out);
      lp.frequency.setValueAtTime(Math.min(8000, 520 + vel * 1500 + f * 1.3), t);
      lp.frequency.setTargetAtTime(Math.min(6000, 300 + f * 1.2), t + 0.02, 0.6);
      var a = osc(v, c, null, f, t, -3, pan(c, -0.22, lp), per), b = osc(v, c, null, f, t, 3.5, pan(c, 0.22, lp), per);
      var ch = c.createOscillator(); ch.frequency.value = 0.35 + (m % 7) * 0.03; var cg = c.createGain(); cg.gain.value = 3;
      ch.connect(cg); cg.connect(a.detune); ch.start(t); v.nodes.push(ch);
      var tl = c.createBiquadFilter(); tl.type = "lowpass"; tl.frequency.value = 260;
      var ng = c.createGain(); ng.gain.setValueAtTime(0.5 * vel, t); ng.gain.exponentialRampToValueAtTime(0.0005, t + 0.035);
      tl.connect(ng); ng.connect(v.out); noiseSrc(v, c, t, tl);
      void b;
      var decay = 1.4 + 2.6 * (1 - (m - 21) / 88);
      var end = env(v, t, dur, 0.25 * (0.35 + 0.65 * vel), 0.008, 0.0001, decay / 3, 0.5);
      return finish(v, end);
    },
    /* lo-fi trap piano: tape wow, telephone-ish band, saturation and a breath of hiss */
    lofipiano: function (c, dest, m, t, dur, vel) {
      var v = voiceBase(c, dest, t), f = mf(m), per = wave(c, "piano", PIANO_AMPS);
      var lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2600 + vel * 900; lp.Q.value = 0.7; lp.connect(v.out);
      var hp = c.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 170; hp.connect(lp);
      var a = osc(v, c, null, f, t, -5, pan(c, -0.25, hp), per), b = osc(v, c, null, f, t, 5, pan(c, 0.25, hp), per);
      var wob = c.createOscillator(); wob.frequency.value = 0.55 + (m % 5) * 0.05; var wg = c.createGain(); wg.gain.value = 11;
      wob.connect(wg); wg.connect(a.detune); wg.connect(b.detune); wob.start(t); v.nodes.push(wob);
      var hs = c.createBiquadFilter(); hs.type = "highpass"; hs.frequency.value = 5000;
      var hg = c.createGain(); hg.gain.value = 0.012; hs.connect(hg); hg.connect(v.out); noiseSrc(v, c, t, hs);
      var decay = 1.3 + 3 * (1 - (m - 21) / 88);
      var end = env(v, t, dur, 0.25 * (0.35 + 0.65 * vel), 0.004, 0.0001, decay / 3, 0.35);
      return finish(v, end);
    },
    /* hyper supersaw: 7 detuned saws fanned across the stereo field + square body, bright filter snap, glides on slides */
    hyperlead: function (c, dest, m, t, dur, vel) {
      var v = voiceBase(c, dest, t), f = mf(m);
      var lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 0.8; lp.connect(v.out);
      var top = Math.min(15000, 3800 + vel * 8000);
      lp.frequency.setValueAtTime(f * 3, t); lp.frequency.linearRampToValueAtTime(top, t + 0.025); lp.frequency.setTargetAtTime(top * 0.6, t + 0.03, 0.35);
      var hp = c.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 140; hp.connect(lp);
      [[-31, -0.95], [-19, -0.62], [-8, -0.3], [0, 0], [8, 0.3], [19, 0.62], [31, 0.95]].forEach(function (d) {
        osc(v, c, "sawtooth", f, t, d[0], gainTo(c, 0.17, pan(c, d[1], hp)));
      });
      osc(v, c, "square", f / 2, t, 0, gainTo(c, 0.1, hp));
      var end = env(v, t, dur, 0.32 * (0.5 + 0.5 * vel), 0.005, 0.78, 0.35, 0.22);
      return finish(v, end);
    },
    /* trap flute: breathy sine/triangle tone with a chiff, delayed vibrato, a scoop into each note; mono with glide */
    trapflute: function (c, dest, m, t, dur, vel, o) {
      var v = voiceBase(c, dest, t), f = mf(m), prev = monoPrev(c, "trapflute", t), gt = 0.03 + o.glide * 0.18;
      if (prev && prev.v && prev.v.stop) prev.v.stop(t + 0.004);
      var slide = prev && prev.overlap && o.glide > 0.01 && prev.m !== m;
      var lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 5200; lp.Q.value = 0.4; lp.connect(v.out);
      var oscs = [osc(v, c, "sine", f, t, -4, pan(c, -0.22, lp)), osc(v, c, "sine", f, t, 4, gainTo(c, 0.8, pan(c, 0.22, lp))),
        osc(v, c, "triangle", f, t, 0, gainTo(c, 0.28, lp))];
      var h2 = osc(v, c, "sine", f * 2, t, 0, gainTo(c, 0.1, lp)); h2.__mul = 2; oscs.push(h2);
      if (slide) oscs.forEach(function (x) { glideFreq(x, prev, f, t, gt); });
      else oscs.forEach(function (x) { var mm = x.__mul || 1; x.frequency.setValueAtTime(f * mm * 0.966, t); x.frequency.exponentialRampToValueAtTime(f * mm, t + 0.06); });
      var vib = c.createOscillator(); vib.frequency.value = 5.3; var vg = c.createGain();
      vg.gain.setValueAtTime(0, t); vg.gain.setValueAtTime(0, t + 0.16); vg.gain.linearRampToValueAtTime(18, t + 0.5);
      vib.connect(vg); oscs.forEach(function (x) { vg.connect(x.detune); }); vib.start(t); v.nodes.push(vib);
      var bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = Math.min(9000, f * 2.2); bp.Q.value = 1.6;
      var bg = c.createGain(); bg.gain.setValueAtTime(slide ? 0.05 : 0.5 * vel, t); bg.gain.setTargetAtTime(0.06 + 0.04 * vel, t + 0.02, 0.04);
      bp.connect(bg); bg.connect(v.out); noiseSrc(v, c, t, bp);
      var end = env(v, t, dur, 0.16 * (0.5 + 0.5 * vel), slide ? 0.012 : 0.028, 0.85, 0.4, 0.14);
      monoSet(c, "trapflute", m, t, dur, v);
      return finish(v, end);
    },
    /* guitar pluck: Karplus–Strong string (real plucked decay), doubled and detuned left/right, body + brightness by velocity */
    gtrpluck: function (c, dest, m, t, dur, vel) {
      var v = voiceBase(c, dest, t), ks = ksBuffer(c, m);
      var lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = Math.min(16000, 1800 + vel * 6500); lp.Q.value = 0.6;
      var body = c.createBiquadFilter(); body.type = "peaking"; body.frequency.value = 220; body.Q.value = 1; body.gain.value = 4;
      var hp = c.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 75;
      lp.connect(body); body.connect(hp); hp.connect(v.out);
      var maxLen = 2.4 / ks.rate - 0.02;
      [[1, -0.3, 1], [Math.pow(2, 5 / 1200), 0.3, 0.75]].forEach(function (d, i) {
        var s = c.createBufferSource(); s.buffer = ks.buf; s.playbackRate.setValueAtTime(ks.rate * d[0], t);
        s.connect(gainTo(c, d[2], pan(c, d[1], lp))); s.start(t + i * 0.006); v.nodes.push(s);
      });
      var end = Math.min(t + maxLen, env(v, t, Math.min(dur + 0.25, maxLen), 0.38 * (0.4 + 0.6 * vel), 0.001, 1, 5, 0.12));
      return finish(v, end);
    },
    /* 16th octave arp: each held note re-triggers on the 16th grid (root / octave), ping-ponging left-right */
    arp: function (c, dest, m, t, dur, vel) {
      var v = voiceBase(c, dest, t), f = mf(m), step = 60 / TEMPO / 4, n = clamp(Math.ceil((dur - 0.005) / step), 1, 64);
      var seq = [0, 12, 0, 12, 0, 12, 7, 12];
      for (var k = 0; k < n; k++) {
        var st = t + k * step, fk = f * Math.pow(2, seq[k % seq.length] / 12), sg = c.createGain();
        sg.gain.setValueAtTime(0, st); sg.gain.linearRampToValueAtTime(k % 4 === 0 ? 1 : 0.72, st + 0.003); sg.gain.setTargetAtTime(0, st + 0.004, step * 0.32);
        var lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 3;
        lp.frequency.setValueAtTime(Math.min(14000, 1600 + vel * 5200 + fk), st); lp.frequency.exponentialRampToValueAtTime(Math.max(300, fk * 1.3), st + step * 0.9);
        lp.connect(sg); sg.connect(pan(c, k % 2 ? 0.38 : -0.38, v.out));
        [["sawtooth", -7], ["square", 7]].forEach(function (w) {
          var ox = c.createOscillator(); ox.type = w[0]; ox.frequency.value = fk; ox.detune.value = w[1];
          ox.connect(lp); ox.start(st); ox.stop(st + step + 0.05);
        });
      }
      var g = v.out.gain; g.setValueAtTime(0.155 * (0.45 + 0.55 * vel), t);
      var endT = t + n * step + 0.1;
      g.setValueAtTime(0.155 * (0.45 + 0.55 * vel), endT - 0.02); g.linearRampToValueAtTime(0, endT);
      return finish(v, endT);
    },
    /* hip-hop horn stab: saw section + octave trumpet layer, brassy filter "blat", scoop, saturation (modern, not orchestral) */
    horn: function (c, dest, m, t, dur, vel) {
      var v = voiceBase(c, dest, t), f = mf(m);
      var lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 1.3; lp.connect(v.out);
      lp.frequency.setValueAtTime(f * 1.2, t); lp.frequency.linearRampToValueAtTime(Math.min(13000, f * (5 + vel * 6)), t + 0.035);
      lp.frequency.setTargetAtTime(Math.min(8000, f * 2.6 + 500), t + 0.05, 0.2);
      var oscs = [osc(v, c, "sawtooth", f, t, -11, gainTo(c, 0.34, pan(c, -0.45, lp))), osc(v, c, "sawtooth", f, t, 0, gainTo(c, 0.34, lp)),
        osc(v, c, "sawtooth", f, t, 11, gainTo(c, 0.34, pan(c, 0.45, lp)))];
      var tr = osc(v, c, "sawtooth", f * 2, t, 4, gainTo(c, 0.12, pan(c, 0.2, lp))); tr.__mul = 2; oscs.push(tr);
      oscs.forEach(function (x) { var mm = x.__mul || 1; x.frequency.setValueAtTime(f * mm * 0.972, t); x.frequency.exponentialRampToValueAtTime(f * mm, t + 0.05); });
      var end = env(v, t, dur, 0.34 * (0.5 + 0.5 * vel), 0.012, 0.55, 0.22, 0.13);
      return finish(v, end);
    },
    voxah: function (c, dest, m, t, dur, vel) { return vox(c, dest, m, t, dur, vel, FORMANTS.ah); },
    voxoo: function (c, dest, m, t, dur, vel) { return vox(c, dest, m, t, dur, vel, FORMANTS.oo); },
    /* sidechain pumping pad: wide saw stack, slow filter swell, ducks on every beat (tempo-synced) like a kick sidechain */
    sidepad: function (c, dest, m, t, dur, vel) {
      var v = voiceBase(c, dest, t), f = mf(m), beat = 60 / TEMPO;
      var pump = c.createGain(); pump.connect(v.out);
      var lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 0.6; lp.connect(pump);
      lp.frequency.setValueAtTime(700, t); lp.frequency.linearRampToValueAtTime(1900 + vel * 1800, t + 0.5);
      [[-15, -0.75], [-5, -0.28], [5, 0.28], [15, 0.75]].forEach(function (d) { osc(v, c, "sawtooth", f, t, d[0], gainTo(c, 0.25, pan(c, d[1], lp))); });
      osc(v, c, "triangle", f * 2, t, 0, gainTo(c, 0.12, lp));
      var end = env(v, t, dur, 0.55 * (0.5 + 0.5 * vel), 0.06, 0.9, 0.8, 0.45);
      pump.gain.setValueAtTime(1, t);
      for (var tb = t, i = 0; tb < end && i < 160; tb += beat, i++) {
        pump.gain.setTargetAtTime(0.12, tb, 0.004);
        pump.gain.setTargetAtTime(1, tb + 0.03, beat * 0.2);
      }
      return finish(v, end);
    },
    /* ================= classic voices ================= */
    grand: function (c, dest, m, t, dur, vel) {
      var v = voiceBase(c, dest, t), f = mf(m), per = wave(c, "piano", PIANO_AMPS);
      var lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 0.4; lp.connect(v.out);
      var bright = 900 + vel * vel * 5200 + f * 2.2;
      lp.frequency.setValueAtTime(Math.min(16000, bright), t);
      lp.frequency.setTargetAtTime(Math.min(16000, 500 + f * 2.5), t + 0.01, 0.35 + 0.4 * (1 - m / 108));
      osc(v, c, null, f, t, -1.6, lp, per); osc(v, c, null, f, t, 1.8, lp, per);
      var sub = c.createGain(); sub.gain.value = m < 60 ? 0.25 : 0.1; sub.connect(lp);
      osc(v, c, "sine", f, t, 0, sub);
      // hammer: short band-passed noise
      var nb = c.createBufferSource(); nb.buffer = noise(c);
      var bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = Math.min(9000, f * 5 + 1200); bp.Q.value = 0.9;
      var ng = c.createGain(); ng.gain.setValueAtTime(0.12 * vel, t); ng.gain.exponentialRampToValueAtTime(0.0005, t + 0.035);
      nb.connect(bp); bp.connect(ng); ng.connect(v.out); nb.start(t); v.nodes.push(nb);
      var decay = 1.4 + 3.5 * (1 - (m - 21) / 88); // low notes ring longer
      var end = env(v, t, dur, 0.2 * (0.35 + 0.65 * vel), 0.003, 0.0001, decay / 3.2, 0.28);
      return finish(v, end);
    },
    rhodes: function (c, dest, m, t, dur, vel) {
      var v = voiceBase(c, dest, t), f = mf(m);
      var car = osc(v, c, null, f, t, 0, null, wave(c, "ep", EP_AMPS));
      var mod = c.createOscillator(); mod.type = "sine"; mod.frequency.setValueAtTime(f, t);
      var mi = c.createGain(); var idx = f * (0.6 + vel * 2.6);
      mi.gain.setValueAtTime(idx, t); mi.gain.setTargetAtTime(f * 0.25, t, 0.18 + (1 - vel) * 0.2);
      mod.connect(mi); mi.connect(car.frequency); mod.start(t); v.nodes.push(mod);
      // tine "bark"
      var tg = c.createGain(); tg.gain.setValueAtTime(0.18 * vel * vel, t); tg.gain.setTargetAtTime(0, t, 0.05); tg.connect(v.out);
      osc(v, c, "sine", f * 7.1, t, 0, tg);
      var end = env(v, t, dur, 0.21 * (0.4 + 0.6 * vel), 0.004, 0.25, 0.9, 0.35);
      return finish(v, end);
    },
    lofi: function (c, dest, m, t, dur, vel) {
      var v = voiceBase(c, dest, t), f = mf(m);
      var lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2400; lp.Q.value = 0.7; lp.connect(v.out);
      var car = osc(v, c, null, f, t, 0, lp, wave(c, "ep", EP_AMPS));
      var mod = c.createOscillator(); mod.type = "sine"; mod.frequency.setValueAtTime(f * 2, t);
      var mi = c.createGain(); mi.gain.setValueAtTime(f * (0.4 + vel * 1.2), t); mi.gain.setTargetAtTime(f * 0.1, t, 0.3);
      mod.connect(mi); mi.connect(car.frequency); mod.start(t); v.nodes.push(mod);
      // tape wow: slow detune wobble
      var wob = c.createOscillator(); wob.frequency.value = 0.6 + (m % 5) * 0.07;
      var wg = c.createGain(); wg.gain.value = 9; wob.connect(wg); wg.connect(car.detune); wob.start(t); v.nodes.push(wob);
      osc(v, c, "triangle", f, t, 7, lp);
      var end = env(v, t, dur, 0.17 * (0.45 + 0.55 * vel), 0.012, 0.35, 1.1, 0.45);
      return finish(v, end);
    },
    organ: function (c, dest, m, t, dur, vel) {
      var v = voiceBase(c, dest, t), f = mf(m) / 2, per = wave(c, "organ", ORGAN_AMPS);
      var lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 5200; lp.connect(v.out);
      osc(v, c, null, f, t, -3, lp, per); osc(v, c, null, f, t, 3, lp, per);
      // key click
      var kc = c.createGain(); kc.gain.setValueAtTime(0.05, t); kc.gain.setTargetAtTime(0, t, 0.004); kc.connect(v.out);
      osc(v, c, "square", mf(m) * 4, t, 0, kc);
      var end = env(v, t, dur, 0.11 * (0.6 + 0.4 * vel), 0.008, 0.92, 0.2, 0.09);
      return finish(v, end);
    },
    pad: function (c, dest, m, t, dur, vel) {
      var v = voiceBase(c, dest, t), f = mf(m);
      var lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 0.8; lp.connect(v.out);
      lp.frequency.setValueAtTime(500, t); lp.frequency.linearRampToValueAtTime(1100 + vel * 900, t + 0.6);
      osc(v, c, "sawtooth", f, t, -9, lp); osc(v, c, "sawtooth", f, t, 9, lp); osc(v, c, "sine", f / 2, t, 0, lp);
      var end = env(v, t, dur, 0.11 * (0.5 + 0.5 * vel), 0.35, 0.85, 0.8, 1.1);
      return finish(v, end);
    },
    strings: function (c, dest, m, t, dur, vel) {
      var v = voiceBase(c, dest, t), f = mf(m);
      var lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2600 + vel * 1600; lp.Q.value = 0.5; lp.connect(v.out);
      var hp = c.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 180; hp.connect(lp);
      [-12, -4, 4, 12].forEach(function (d) { osc(v, c, "sawtooth", f, t, d, hp); });
      var vib = c.createOscillator(); vib.frequency.value = 5.2; var vg = c.createGain(); vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(6, t + 0.8);
      vib.connect(vg); v.nodes.forEach(function (o) { if (o.detune) vg.connect(o.detune); }); vib.start(t); v.nodes.push(vib);
      var end = env(v, t, dur, 0.075 * (0.5 + 0.5 * vel), 0.22, 0.9, 0.6, 0.7);
      return finish(v, end);
    },
    bass: function (c, dest, m, t, dur, vel) {
      var v = voiceBase(c, dest, t), f = mf(m);
      var sh = c.createWaveShaper(), cur = new Float32Array(1024);
      for (var i = 0; i < 1024; i++) { var x = i / 511.5 - 1; cur[i] = Math.tanh(1.8 * x) / Math.tanh(1.8); }
      sh.curve = cur; sh.connect(v.out);
      var o = osc(v, c, "sine", f, t, 0, sh);
      o.frequency.setValueAtTime(f * 1.5, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.03); // soft click-in
      var h = c.createGain(); h.gain.value = 0.18; h.connect(sh); osc(v, c, "triangle", f * 2, t, 0, h);
      var end = env(v, t, dur, 0.26 * (0.5 + 0.5 * vel), 0.005, 0.8, 0.6, 0.08);
      return finish(v, end);
    },
    synthbass: function (c, dest, m, t, dur, vel) {
      var v = voiceBase(c, dest, t), f = mf(m);
      var lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 5; lp.connect(v.out);
      lp.frequency.setValueAtTime(180 + vel * 2200, t); lp.frequency.setTargetAtTime(160 + f, t, 0.12);
      osc(v, c, "sawtooth", f, t, -6, lp); osc(v, c, "square", f, t, 6, lp); osc(v, c, "sine", f / 2, t, 0, lp);
      var end = env(v, t, dur, 0.13 * (0.5 + 0.5 * vel), 0.004, 0.7, 0.3, 0.07);
      return finish(v, end);
    },
    pluck: function (c, dest, m, t, dur, vel) {
      var v = voiceBase(c, dest, t), f = mf(m);
      var lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 3; lp.connect(v.out);
      lp.frequency.setValueAtTime(1500 + vel * 4000, t); lp.frequency.exponentialRampToValueAtTime(Math.max(200, f * 1.2), t + 0.35);
      osc(v, c, "sawtooth", f, t, 0, lp); osc(v, c, "square", f, t, 5, lp);
      var end = env(v, t, Math.min(dur, 1.2), 0.15 * (0.4 + 0.6 * vel), 0.003, 0.0001, 0.28, 0.2);
      return finish(v, end);
    },
    bell: function (c, dest, m, t, dur, vel) {
      var v = voiceBase(c, dest, t), f = mf(m);
      osc(v, c, "sine", f, t); var g2 = c.createGain(); g2.gain.value = 0.35; g2.connect(v.out); osc(v, c, "sine", f * 2.76, t, 0, g2);
      var g3 = c.createGain(); g3.gain.setValueAtTime(0.18, t); g3.gain.setTargetAtTime(0, t, 0.25); g3.connect(v.out); osc(v, c, "sine", f * 5.4, t, 0, g3);
      var end = env(v, t, Math.max(dur, 0.6), 0.15 * (0.4 + 0.6 * vel), 0.002, 0.0001, 0.8, 0.5);
      return finish(v, end);
    },
    lead: function (c, dest, m, t, dur, vel) {
      var v = voiceBase(c, dest, t), f = mf(m);
      var lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 1800 + vel * 2500; lp.Q.value = 1.2; lp.connect(v.out);
      var o1 = osc(v, c, "square", f, t, -5, lp), o2 = osc(v, c, "sawtooth", f, t, 5, lp);
      var vib = c.createOscillator(); vib.frequency.value = 5.5; var vg = c.createGain(); vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(12, t + 0.4);
      vib.connect(vg); vg.connect(o1.detune); vg.connect(o2.detune); vib.start(t); v.nodes.push(vib);
      var end = env(v, t, dur, 0.09 * (0.5 + 0.5 * vel), 0.02, 0.8, 0.3, 0.18);
      return finish(v, end);
    },
    /* West Coast "whine": sine + soft triangle, scoops up into the note, slow wide vibrato fades in */
    whine: function (c, dest, m, t, dur, vel) {
      var v = voiceBase(c, dest, t), f = mf(m);
      var lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2400 + vel * 1800; lp.Q.value = 0.9; lp.connect(v.out);
      var o1 = osc(v, c, "sine", f, t, 0, lp);
      var tg = c.createGain(); tg.gain.value = 0.42; tg.connect(lp);
      var o2 = osc(v, c, "triangle", f, t, 4, tg);
      [o1, o2].forEach(function (o) { o.frequency.setValueAtTime(f * 0.945, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.075); });
      var vib = c.createOscillator(); vib.frequency.value = 5.4;
      var vg = c.createGain(); vg.gain.setValueAtTime(0, t); vg.gain.setValueAtTime(0, t + 0.14); vg.gain.linearRampToValueAtTime(24, t + 0.55);
      vib.connect(vg); vg.connect(o1.detune); vg.connect(o2.detune); vib.start(t); v.nodes.push(vib);
      var end = env(v, t, dur, 0.13 * (0.5 + 0.5 * vel), 0.025, 0.85, 0.5, 0.22);
      return finish(v, end);
    },
  };
  /* vocal chop: doubled saw "vocal folds" (scoop + vibrato) through parallel formant band-passes, plus breath */
  var FORMANTS = {
    ah: { mk: 5.5, f: [[800, 1, 7], [1150, 0.55, 9], [2900, 0.22, 11], [3900, 0.1, 12]] },
    oo: { mk: 1.9, f: [[320, 1, 6], [800, 0.42, 9], [2500, 0.07, 12], [3400, 0.04, 12]] }
  };
  function vox(c, dest, m, t, dur, vel, fm) {
    var v = voiceBase(c, dest, t), f = mf(m), src = c.createGain(), shift = clamp((m - 60) / 48, -0.25, 0.4);
    var mk = c.createGain(); mk.gain.value = fm.mk; mk.connect(v.out);
    fm.f.forEach(function (F) {
      var bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = F[0] * (1 + shift * 0.35); bp.Q.value = F[2];
      src.connect(bp); bp.connect(gainTo(c, F[1], mk));
    });
    var hp = c.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 120; hp.connect(src);
    var a = osc(v, c, "sawtooth", f, t, -8, pan(c, -0.3, hp)), b = osc(v, c, "sawtooth", f, t, 8, pan(c, 0.3, hp));
    [a, b].forEach(function (x) { x.frequency.setValueAtTime(f * 0.955, t); x.frequency.exponentialRampToValueAtTime(f, t + 0.05); });
    var vib = c.createOscillator(); vib.frequency.value = 5.6; var vg = c.createGain();
    vg.gain.setValueAtTime(0, t); vg.gain.setValueAtTime(0, t + 0.2); vg.gain.linearRampToValueAtTime(14, t + 0.5);
    vib.connect(vg); vg.connect(a.detune); vg.connect(b.detune); vib.start(t); v.nodes.push(vib);
    var ng = c.createGain(); ng.gain.value = 0.25; ng.connect(src); noiseSrc(v, c, t, ng);
    var end = env(v, t, dur, 0.2 * (0.5 + 0.5 * vel), 0.012, 0.85, 0.5, 0.12);
    return finish(v, end);
  }
  function toneOf(id, tone) {
    var d = BY_ID[id] || {}, o = { drive: d.drive || 0, glide: d.glide || 0 };
    if (tone && typeof tone === "object") {
      if (isFinite(+tone.drive)) o.drive = clamp(+tone.drive, 0, 1);
      if (isFinite(+tone.glide)) o.glide = clamp(+tone.glide, 0, 1);
    }
    return o;
  }
  /* play one note. dur = held length in seconds (release follows). gain = optional linear level trim.
     tone = optional { drive, glide } (pattern sound settings). Returns { stop(t), end } */
  function play(c, dest, midi, when, dur, vel, instId, gain, tone) {
    var id = migrate(instId) || DEFAULT, fn = VOICES[id], def = BY_ID[id] || {}, o = toneOf(id, tone);
    if (gain != null && gain !== 1 && isFinite(gain)) { var g = c.createGain(); g.gain.value = clamp(gain, 0, 8); g.connect(dest); dest = g; }
    if (!def.dr && o.drive > 0.02) dest = driveStage(c, dest, o.drive, 0.22);
    return fn(c, dest, clamp(Math.round(midi), 0, 127), Math.max(0, when), Math.max(0.02, dur || 0.25), clamp(vel == null ? 0.8 : +vel, 0.05, 1), o);
  }
  function presetOf(inst, tone) {
    var o = toneOf(inst, tone);
    for (var i = 0; i < PRESETS.length; i++) {
      var P = PRESETS[i], po = toneOf(P.inst, P.tone);
      if (P.inst === inst && Math.abs(po.drive - o.drive) < 0.011 && (!(BY_ID[inst] || {}).gl || Math.abs(po.glide - o.glide) < 0.011)) return P.id;
    }
    return "";
  }
  window.IPBKeys = { INSTRUMENTS: INSTRUMENTS, BY_ID: BY_ID, PRESETS: PRESETS, DEFAULT: DEFAULT, DEFAULT_PRESET: DEFAULT_PRESET, LEGACY: LEGACY,
    play: play, migrate: migrate, toneOf: toneOf, presetOf: presetOf, setTempo: setTempo, tempo: function () { return TEMPO; },
    has: function (id) { return !!VOICES[migrate(id)]; },
    /* kept for API compatibility: every instrument is synthesized now, nothing to fetch */
    load: function () { return Promise.resolve(true); }, ready: function () { return true; }, isSampled: function () { return false; } };
})();
