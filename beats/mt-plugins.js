/* Island Pin Beats · Multitrack plugins. A plugin is DATA (.ipbplug.json), never code:
   a graph of whitelisted built-in Web Audio nodes + knobs. Strictly validated on import. */
(function () {
  "use strict";
  var MAXB = 65536, MAXN = 48, MAXW = 160, MAXK = 24;
  var R = { // type -> param ranges (all numeric, clamped)
    gain: { gain: [0, 8] },
    compressor: { threshold: [-100, 0], knee: [0, 40], ratio: [1, 20], attack: [0, 1], release: [0, 1] },
    biquad: { frequency: [10, 22000], Q: [0.0001, 100], gain: [-40, 40], detune: [-2400, 2400] },
    panner: { pan: [-1, 1] },
    delay: { delayTime: [0, 4], sync: [0, 8] },
    shaper: { amount: [0, 100], threshold: [0, 1] },
    convolver: { seconds: [0.1, 6], decay: [0.5, 12], predelay: [0, 0.2], damp: [500, 20000] },
    lfo: { frequency: [0.01, 20], depth: [0, 20000], sync: [0, 16] },
    split: {}, merge: {}
  };
  var E = { // enum params
    biquad: { type: ["lowpass", "highpass", "bandpass", "lowshelf", "highshelf", "peaking", "notch", "allpass"] },
    shaper: { curve: ["tape", "tube", "hard", "fold", "crush", "abs", "gate", "duck"], oversample: ["none", "2x", "4x"] },
    convolver: { kind: ["room", "plate", "hall"] },
    lfo: { wave: ["sine", "triangle", "square", "sawtooth"] }
  };
  var LIVE = { gain: ["gain"], compressor: ["threshold", "knee", "ratio", "attack", "release"], biquad: ["frequency", "Q", "gain", "detune"], panner: ["pan"], delay: ["delayTime"], lfo: ["frequency", "depth"] };
  var KNOBP = { delay: ["sync"], shaper: ["amount", "threshold"], lfo: ["sync"] }; // non-AudioParam knob targets
  var ID = /^[A-Za-z][A-Za-z0-9_]{0,23}$/;
  function num(v, r, what) { if (typeof v !== "number" || !isFinite(v)) throw new Error(what + " must be a number"); return Math.max(r[0], Math.min(r[1], v)); }
  function str(v, n) { return String(v == null ? "" : v).replace(/[<>&"'`\u0000-\u001f]/g, "").slice(0, n); }

  function validate(input) {
    var o = input;
    if (typeof o === "string") { if (o.length > MAXB) throw new Error("File too big (max 64 KB)"); o = JSON.parse(o); }
    else if (JSON.stringify(o).length > MAXB) throw new Error("Plugin too big");
    if (!o || typeof o !== "object" || o.format !== "ipbplug") throw new Error("Not an Island Pin plugin (format must be \"ipbplug\")");
    var out = { format: "ipbplug", v: 1, name: str(o.name, 40) || "My plugin", category: str(o.category, 20) || "Custom", about: str(o.about, 200), nodes: [], wires: [], knobs: [] };
    if (!Array.isArray(o.nodes) || !o.nodes.length || o.nodes.length > MAXN) throw new Error("nodes: 1–" + MAXN + " needed");
    var types = { "in": "io", "out": "io" };
    o.nodes.forEach(function (n, i) {
      if (!n || typeof n !== "object") throw new Error("node " + i + " invalid");
      if (!ID.test(n.id || "") || n.id === "in" || n.id === "out" || types[n.id]) throw new Error("node " + i + ": bad or duplicate id");
      if (!R[n.type]) throw new Error("node " + n.id + ": type \"" + n.type + "\" not allowed");
      var c = {}, p = n.params || {}; if (typeof p !== "object" || Array.isArray(p)) throw new Error(n.id + ": params must be an object");
      Object.keys(p).forEach(function (k) {
        if (R[n.type][k]) c[k] = num(p[k], R[n.type][k], n.id + "." + k);
        else if (E[n.type] && E[n.type][k]) { if (E[n.type][k].indexOf(p[k]) < 0) throw new Error(n.id + "." + k + " must be one of " + E[n.type][k].join(", ")); c[k] = p[k]; }
        else throw new Error(n.id + ": unknown param \"" + k + "\"");
      });
      types[n.id] = n.type; out.nodes.push({ id: n.id, type: n.type, params: c });
    });
    if (!Array.isArray(o.wires) || o.wires.length > MAXW) throw new Error("wires: list of up to " + MAXW);
    var WR = /^([A-Za-z][A-Za-z0-9_]*)(?::([01]))?>([A-Za-z][A-Za-z0-9_]*)(?:(?::([01]))|(?:\.([A-Za-z]+)))?$/;
    o.wires.forEach(function (w) {
      var m = WR.exec(String(w).replace(/\s+/g, "")); if (!m) throw new Error("bad wire \"" + str(w, 40) + "\" (use a>b, a:1>b:0 or a>b.param)");
      if (!types[m[1]] || m[1] === "out") throw new Error("wire from unknown/invalid node " + m[1]);
      if (!types[m[3]] || m[3] === "in") throw new Error("wire to unknown/invalid node " + m[3]);
      if (m[5] && (LIVE[types[m[3]]] || []).indexOf(m[5]) < 0) throw new Error("cannot modulate " + m[3] + "." + m[5]);
      if (m[2] && types[m[1]] !== "split") throw new Error("output index only on split nodes");
      if (m[4] && types[m[3]] !== "merge") throw new Error("input index only on merge nodes");
      out.wires.push(m[0]);
    });
    if (o.knobs != null && (!Array.isArray(o.knobs) || o.knobs.length > MAXK)) throw new Error("knobs: up to " + MAXK);
    (o.knobs || []).forEach(function (k, i) {
      if (!k || !ID.test(k.id || "")) throw new Error("knob " + i + ": bad id");
      var lo = num(k.min, [-1e5, 1e5], "knob min"), hi = num(k.max, [-1e5, 1e5], "knob max"); if (!(hi > lo)) throw new Error("knob " + k.id + ": max must be > min");
      var q = { id: k.id, label: str(k.label, 24) || k.id, min: lo, max: hi, value: num(k.value == null ? lo : k.value, [lo, hi], "knob value"), unit: str(k.unit, 6), log: !!k.log && lo > 0, db: !!k.db, to: [] };
      if (!Array.isArray(k.to) || !k.to.length || k.to.length > 8) throw new Error("knob " + k.id + ": 1–8 targets");
      k.to.forEach(function (t) {
        if (typeof t === "string") { var s = t.split("."); t = { n: s[0], p: s[1] }; }
        var ty = types[t.n]; if (!ty || ty === "io") throw new Error("knob " + k.id + ": unknown node " + str(t.n, 24));
        if ((LIVE[ty] || []).concat(KNOBP[ty] || []).indexOf(t.p) < 0) throw new Error("knob " + k.id + ": " + t.n + "." + str(t.p, 20) + " not a knob param");
        q.to.push({ n: t.n, p: t.p, mul: t.mul == null ? 1 : num(t.mul, [-1e5, 1e5], "mul"), add: t.add == null ? 0 : num(t.add, [-1e5, 1e5], "add") });
      });
      out.knobs.push(q);
    });
    return out;
  }

  /* ---- generated content (no files, no code) ---- */
  function curve(name, amt, thr) {
    var n = 2048, c = new Float32Array(n), a = (amt == null ? 50 : amt) / 100, th = thr == null ? 0.1 : thr;
    for (var i = 0; i < n; i++) {
      var x = i * 2 / (n - 1) - 1, y, k;
      if (name === "tape") { k = 1 + a * 20; y = Math.tanh(k * x) / Math.tanh(k); }
      else if (name === "tube") { k = 1 + a * 15; y = x >= 0 ? Math.tanh(k * x) / Math.tanh(k) : 0.85 * Math.tanh(0.7 * k * x) / Math.tanh(0.7 * k); }
      else if (name === "hard") y = Math.max(-1, Math.min(1, x * (1 + a * 30)));
      else if (name === "fold") y = Math.sin(x * (1 + a * 8) * Math.PI / 2);
      else if (name === "crush") { var st = Math.pow(2, 1 + Math.round((1 - a) * 14)) / 2; y = Math.round(x * st) / st; }
      else if (name === "abs") y = Math.abs(x);
      else if (name === "gate") y = Math.max(0, Math.min(1, (Math.abs(x) - th) / (th * 0.5 + 0.002)));
      else if (name === "duck") y = x > th ? -Math.min(1, (x - th) / Math.max(0.01, 1 - th)) * a : 0;
      else y = x;
      c[i] = y;
    }
    return c;
  }
  function ir(ctx, p) {
    var kind = p.kind || "room", sec = p.seconds || (kind === "hall" ? 3.2 : kind === "plate" ? 2 : 0.9), dec = p.decay || (kind === "hall" ? 3 : kind === "plate" ? 4 : 5), damp = p.damp || (kind === "plate" ? 12000 : kind === "hall" ? 6000 : 8000);
    var sr = ctx.sampleRate, n = Math.max(1, Math.round(sec * sr)), b = ctx.createBuffer(2, n, sr), seed = kind.length * 977 + Math.round(sec * 1000);
    function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x3fffffff - 1; }
    for (var ch = 0; ch < 2; ch++) {
      var d = b.getChannelData(ch), lp = 0;
      for (var i = 0; i < n; i++) {
        var t = i / n, env = Math.pow(1 - t, dec), cut = damp * (1 - 0.85 * t), al = Math.min(1, 2 * Math.PI * cut / sr);
        var s = rnd(); if (kind === "room" && i < sr * 0.03 && (i % 331 === 0)) s *= 6; // early reflections
        lp += al * (s - lp); d[i] = lp * env * (kind === "plate" ? 0.6 : 0.5);
      }
    }
    return b;
  }

  /* ---- builder ---- */
  function build(ctx, def, vals, bpm) {
    bpm = bpm || 90; var N = {}, srcs = [], P = {};
    N["in"] = ctx.createGain(); N["in"].channelCount = 2; N["in"].channelCountMode = "explicit"; N["in"].channelInterpretation = "speakers";
    N.out = ctx.createGain();
    def.nodes.forEach(function (n) {
      var p = n.params, x;
      if (n.type === "gain") { x = ctx.createGain(); if (p.gain != null) x.gain.value = p.gain; }
      else if (n.type === "compressor") { x = ctx.createDynamicsCompressor(); ["threshold", "knee", "ratio", "attack", "release"].forEach(function (k) { if (p[k] != null) x[k].value = p[k]; }); }
      else if (n.type === "biquad") { x = ctx.createBiquadFilter(); x.type = p.type || "peaking"; ["frequency", "Q", "gain", "detune"].forEach(function (k) { if (p[k] != null) x[k].value = Math.min(p[k], k === "frequency" ? ctx.sampleRate / 2 : 1e9); }); }
      else if (n.type === "panner") { x = ctx.createStereoPanner(); if (p.pan != null) x.pan.value = p.pan; }
      else if (n.type === "delay") { x = ctx.createDelay(4.5); x.delayTime.value = p.sync ? Math.min(4, p.sync * 60 / bpm) : (p.delayTime || 0); }
      else if (n.type === "shaper") { x = ctx.createWaveShaper(); x.curve = curve(p.curve || "tape", p.amount, p.threshold); x.oversample = p.oversample || (/tape|tube|hard|fold/.test(p.curve || "tape") ? "4x" : "none"); }
      else if (n.type === "convolver") { x = ctx.createConvolver(); x.buffer = ir(ctx, p); }
      else if (n.type === "lfo") { var o = ctx.createOscillator(); o.type = p.wave || "sine"; o.frequency.value = p.sync ? bpm / 60 / p.sync : (p.frequency || 1); x = ctx.createGain(); x.gain.value = p.depth == null ? 1 : p.depth; o.connect(x); o.start(); srcs.push(o); x._osc = o; }
      else if (n.type === "split") x = ctx.createChannelSplitter(2);
      else if (n.type === "merge") x = ctx.createChannelMerger(2);
      x._p = JSON.parse(JSON.stringify(p)); x._t = n.type; N[n.id] = x;
    });
    def.wires.forEach(function (w) {
      var m = /^(\w+)(?::(\d))?>(\w+)(?::(\d)|\.(\w+))?$/.exec(w), a = N[m[1]], b = N[m[3]];
      if (m[5]) { var prm = b._t === "lfo" ? (m[5] === "frequency" ? b._osc.frequency : b.gain) : b[m[5]]; a.connect(prm); }
      else a.connect(b, +(m[2] || 0), +(m[4] || 0));
    });
    function setT(t, v) {
      var x = N[t.n], y = v * t.mul + t.add, r = R[x._t][t.p]; if (r) y = Math.max(r[0], Math.min(r[1], y));
      if (x._t === "lfo") { if (t.p === "sync") x._osc.frequency.value = y ? bpm / 60 / y : x._osc.frequency.value; else if (t.p === "frequency") x._osc.frequency.value = y; else x.gain.value = y; return; }
      if (x._t === "delay" && t.p === "sync") { x.delayTime.setTargetAtTime(Math.min(4, y * 60 / bpm), ctx.currentTime, 0.02); return; }
      if (x._t === "shaper") { x._p[t.p] = y; x.curve = curve(x._p.curve || "tape", x._p.amount, x._p.threshold); return; }
      if (x._t === "biquad" && t.p === "frequency") y = Math.min(y, ctx.sampleRate / 2);
      x[t.p].setTargetAtTime(y, ctx.currentTime, 0.015);
    }
    function set(id, v) { def.knobs.forEach(function (k) { if (k.id !== id) return; v = Math.max(k.min, Math.min(k.max, v)); var u = k.db ? Math.pow(10, v / 20) : v; k.to.forEach(function (t) { setT(t, u); }); }); }
    def.knobs.forEach(function (k) { set(k.id, vals && vals[k.id] != null ? vals[k.id] : k.value); });
    return { inp: N["in"], out: N.out, set: set, dispose: function () { srcs.forEach(function (o) { try { o.stop(); } catch (e) {} }); Object.keys(N).forEach(function (k) { try { N[k].disconnect(); } catch (e) {} }); } };
  }

  /* ---- built-ins (same JSON format users can write) ---- */
  function P(name, cat, about, nodes, wires, knobs) { return { format: "ipbplug", v: 1, name: name, category: cat, about: about, nodes: nodes.map(function (n) { return { id: n[0], type: n[1], params: n[2] || {} }; }), wires: wires, knobs: knobs || [] }; }
  function K(id, label, min, max, value, to, o) { var k = { id: id, label: label, min: min, max: max, value: value, to: to }; for (var x in o || {}) k[x] = o[x]; return k; }
  var hz = { unit: "Hz", log: true }, db = { unit: "dB" }, dbl = { unit: "dB", db: true }, ms = { unit: "ms" };
  function mix(dry, wet, v) { return K("mix", "Mix", 0, 100, v, [{ n: dry, p: "gain", mul: -0.01, add: 1 }, { n: wet, p: "gain", mul: 0.01 }], { unit: "%" }); }
  function chain(ids) { var w = []; for (var i = 0; i < ids.length - 1; i++) w.push(ids[i] + ">" + ids[i + 1]); return w; }
  function verb(kind, sec, pre) {
    return P("Reverb " + kind[0].toUpperCase() + kind.slice(1), "Reverb", "Convolution reverb with a generated " + kind + " impulse.",
      [["dry", "gain", { gain: 0.8 }], ["pre", "delay", { delayTime: pre }], ["ir", "convolver", { kind: kind, seconds: sec }], ["tone", "biquad", { type: "lowpass", frequency: 9000, Q: 0.7 }], ["lc", "biquad", { type: "highpass", frequency: 200, Q: 0.7 }], ["wet", "gain", { gain: 0.25 }]],
      ["in>dry", "dry>out"].concat(chain(["in", "pre", "ir", "lc", "tone", "wet", "out"])),
      [mix("dry", "wet", 25), K("pre", "Pre-delay", 0, 200, pre * 1000, [{ n: "pre", p: "delayTime", mul: 0.001 }], ms), K("tone", "Tone", 1500, 18000, 9000, ["tone.frequency"], hz)]);
  }
  function filt(t, nm) {
    return P("Filter " + nm, "Filter", nm + " filter with resonance and an optional tempo sweep.", [["f", "biquad", { type: t, frequency: t === "highpass" ? 200 : 1200, Q: 1 }], ["l", "lfo", { sync: 4, depth: 0 }]],
      ["in>f", "f>out", "l>f.frequency"], [K("cut", "Cutoff", 20, 18000, t === "highpass" ? 200 : 1200, ["f.frequency"], hz), K("res", "Resonance", 0.3, 20, 1, ["f.Q"]), K("sw", "Sweep", 0, 5000, 0, ["l.depth"], hz), K("rate", "Sweep beats", 0.25, 16, 4, ["l.sync"])]);
  }
  function sat(nm, cv, amt) {
    return P(nm, "Saturation", "WaveShaper " + cv + " curve with drive, tone and mix.", [["drv", "gain", { gain: 1 }], ["sh", "shaper", { curve: cv, amount: amt }], ["tone", "biquad", { type: "lowpass", frequency: 12000, Q: 0.7 }], ["trim", "gain", { gain: 0.8 }], ["dry", "gain", { gain: 0 }], ["wet", "gain", { gain: 1 }]],
      chain(["in", "drv", "sh", "tone", "trim", "wet", "out"]).concat(["in>dry", "dry>out"]),
      [K("drive", "Drive", 0, 100, amt, ["sh.amount"], { unit: "%" }), K("in", "Input", -12, 18, 0, ["drv.gain"], dbl), K("tone", "Tone", 1000, 20000, 12000, ["tone.frequency"], hz), K("out", "Output", -24, 6, -2, ["trim.gain"], dbl), mix("dry", "wet", 100)]);
  }
  var B = [
    P("Parametric EQ", "EQ", "7 bands like an EQ7 / Parametric EQ 2: low cut, low shelf, 3 bells, high shelf, high cut.",
      [["hp", "biquad", { type: "highpass", frequency: 20, Q: 0.7 }], ["ls", "biquad", { type: "lowshelf", frequency: 100, gain: 0 }], ["b1", "biquad", { type: "peaking", frequency: 300, Q: 1, gain: 0 }], ["b2", "biquad", { type: "peaking", frequency: 1200, Q: 1, gain: 0 }], ["b3", "biquad", { type: "peaking", frequency: 4000, Q: 1, gain: 0 }], ["hs", "biquad", { type: "highshelf", frequency: 10000, gain: 0 }], ["lp", "biquad", { type: "lowpass", frequency: 20000, Q: 0.7 }]],
      chain(["in", "hp", "ls", "b1", "b2", "b3", "hs", "lp", "out"]),
      [K("hp", "Low cut", 20, 1000, 20, ["hp.frequency"], hz), K("lsg", "Low", -18, 18, 0, ["ls.gain"], db), K("lsf", "Low freq", 30, 500, 100, ["ls.frequency"], hz),
       K("b1g", "Low-mid", -18, 18, 0, ["b1.gain"], db), K("b1f", "Low-mid freq", 80, 2000, 300, ["b1.frequency"], hz), K("b1q", "Low-mid Q", 0.2, 10, 1, ["b1.Q"]),
       K("b2g", "Mid", -18, 18, 0, ["b2.gain"], db), K("b2f", "Mid freq", 200, 6000, 1200, ["b2.frequency"], hz), K("b2q", "Mid Q", 0.2, 10, 1, ["b2.Q"]),
       K("b3g", "Presence", -18, 18, 0, ["b3.gain"], db), K("b3f", "Presence freq", 1000, 12000, 4000, ["b3.frequency"], hz), K("b3q", "Presence Q", 0.2, 10, 1, ["b3.Q"]),
       K("hsg", "Air / highs", -18, 18, 0, ["hs.gain"], db), K("hsf", "Air freq", 3000, 16000, 10000, ["hs.frequency"], hz), K("lp", "High cut", 2000, 20000, 20000, ["lp.frequency"], hz)]),
    P("Compressor", "Dynamics", "Standard compressor with makeup gain.", [["c", "compressor", { threshold: -18, ratio: 4, knee: 6, attack: 0.01, release: 0.15 }], ["mk", "gain", { gain: 1.4 }]], chain(["in", "c", "mk", "out"]),
      [K("thr", "Threshold", -60, 0, -18, ["c.threshold"], db), K("ratio", "Ratio", 1, 20, 4, ["c.ratio"], { unit: ":1" }), K("att", "Attack", 0, 200, 10, [{ n: "c", p: "attack", mul: 0.001 }], ms), K("rel", "Release", 10, 1000, 150, [{ n: "c", p: "release", mul: 0.001 }], ms), K("knee", "Knee", 0, 40, 6, ["c.knee"], db), K("mk", "Makeup", 0, 24, 3, ["mk.gain"], dbl)]),
    P("Vocal Compressor", "Dynamics", "Smooth vocal leveling (fast attack, 3:1).", [["hp", "biquad", { type: "highpass", frequency: 80, Q: 0.7 }], ["c", "compressor", { threshold: -24, ratio: 3, knee: 10, attack: 0.005, release: 0.12 }], ["mk", "gain", { gain: 1.8 }]], chain(["in", "hp", "c", "mk", "out"]),
      [K("thr", "Amount", -50, 0, -24, ["c.threshold"], db), K("ratio", "Ratio", 1, 12, 3, ["c.ratio"], { unit: ":1" }), K("mk", "Makeup", 0, 24, 5, ["mk.gain"], dbl)]),
    P("Limiter", "Dynamics", "Brickwall-style peak limiter (Web Audio compressor at 20:1, hard knee, fastest attack).", [["pre", "gain", { gain: 1 }], ["c", "compressor", { threshold: -1, ratio: 20, knee: 0, attack: 0.001, release: 0.08 }], ["ceil", "gain", { gain: 0.95 }]], chain(["in", "pre", "c", "ceil", "out"]),
      [K("gain", "Input gain", 0, 18, 0, ["pre.gain"], dbl), K("thr", "Threshold", -24, 0, -1, ["c.threshold"], db), K("rel", "Release", 10, 500, 80, [{ n: "c", p: "release", mul: 0.001 }], ms), K("ceil", "Ceiling", -6, 0, -0.5, ["ceil.gain"], dbl)]),
    P("Noise Gate", "Dynamics", "Envelope gate: closes when the level drops below the threshold (approximate).", [["vca", "gain", { gain: 0 }], ["rect", "shaper", { curve: "abs" }], ["env", "biquad", { type: "lowpass", frequency: 25, Q: 0.5 }], ["amp", "gain", { gain: 3 }], ["g", "shaper", { curve: "gate", threshold: 0.05 }]],
      ["in>vca", "vca>out", "in>rect", "rect>env", "env>amp", "amp>g", "g>vca.gain"], [K("thr", "Threshold", 0.005, 0.5, 0.05, ["g.threshold"], { log: true }), K("spd", "Speed", 5, 120, 25, ["env.frequency"], hz)]),
    P("De-esser", "Dynamics", "Turns down the highs only when 'S' sounds get loud (sidechain-free approximation).", [["hs", "biquad", { type: "highshelf", frequency: 5500, gain: 0 }], ["bp", "biquad", { type: "bandpass", frequency: 7000, Q: 1.5 }], ["rect", "shaper", { curve: "abs" }], ["env", "biquad", { type: "lowpass", frequency: 40, Q: 0.5 }], ["amp", "gain", { gain: 4 }], ["dk", "shaper", { curve: "duck", threshold: 0.15, amount: 100 }], ["dep", "gain", { gain: 10 }]],
      ["in>hs", "hs>out", "in>bp", "bp>rect", "rect>env", "env>amp", "amp>dk", "dk>dep", "dep>hs.gain"], [K("f", "Frequency", 3000, 10000, 6500, ["bp.frequency", { n: "hs", p: "frequency", mul: 0.85 }], hz), K("thr", "Threshold", 0.01, 0.8, 0.15, ["dk.threshold"], { log: true }), K("dep", "Max cut", 0, 24, 10, ["dep.gain"], db)]),
    P("Multiband Compressor", "Dynamics", "3 bands (crossover filters) each with its own compressor.", [["l1", "biquad", { type: "lowpass", frequency: 200, Q: 0.707 }], ["l2", "biquad", { type: "lowpass", frequency: 200, Q: 0.707 }], ["m1", "biquad", { type: "highpass", frequency: 200, Q: 0.707 }], ["m2", "biquad", { type: "lowpass", frequency: 3000, Q: 0.707 }], ["h1", "biquad", { type: "highpass", frequency: 3000, Q: 0.707 }], ["h2", "biquad", { type: "highpass", frequency: 3000, Q: 0.707 }], ["cl", "compressor", { threshold: -20, ratio: 4, attack: 0.02, release: 0.2 }], ["cm", "compressor", { threshold: -20, ratio: 3, attack: 0.01, release: 0.15 }], ["ch", "compressor", { threshold: -20, ratio: 3, attack: 0.005, release: 0.1 }], ["sum", "gain", { gain: 1.3 }]],
      ["in>l1", "l1>l2", "l2>cl", "cl>sum", "in>m1", "m1>m2", "m2>cm", "cm>sum", "in>h1", "h1>h2", "h2>ch", "ch>sum", "sum>out"],
      [K("xl", "Low/mid split", 60, 600, 200, ["l1.frequency", "l2.frequency", "m1.frequency"], hz), K("xh", "Mid/high split", 1000, 10000, 3000, ["m2.frequency", "h1.frequency", "h2.frequency"], hz), K("tl", "Low threshold", -60, 0, -20, ["cl.threshold"], db), K("tm", "Mid threshold", -60, 0, -20, ["cm.threshold"], db), K("th", "High threshold", -60, 0, -20, ["ch.threshold"], db), K("mk", "Makeup", 0, 18, 2, ["sum.gain"], dbl)]),
    verb("room", 0.9, 0.01), verb("plate", 2, 0.02), verb("hall", 3.5, 0.04),
    P("Delay", "Delay", "Tempo-synced echo with feedback and tone.", [["dry", "gain", { gain: 1 }], ["d", "delay", { sync: 0.75 }], ["fb", "gain", { gain: 0.35 }], ["hp", "biquad", { type: "highpass", frequency: 250 }], ["lp", "biquad", { type: "lowpass", frequency: 6000 }], ["wet", "gain", { gain: 0.3 }]],
      ["in>dry", "dry>out", "in>d", "d>hp", "hp>lp", "lp>fb", "fb>d", "lp>wet", "wet>out"],
      [K("time", "Time (beats)", 0.125, 4, 0.75, ["d.sync"]), K("fb", "Feedback", 0, 90, 35, [{ n: "fb", p: "gain", mul: 0.01 }], { unit: "%" }), K("wet", "Echo level", 0, 100, 30, [{ n: "wet", p: "gain", mul: 0.01 }], { unit: "%" }), K("lp", "Tone", 1000, 16000, 6000, ["lp.frequency"], hz)]),
    P("Ping-Pong Delay", "Delay", "Echoes bounce left and right, tempo-synced.", [["dry", "gain", { gain: 1 }], ["dl", "delay", { sync: 0.5 }], ["dr", "delay", { sync: 0.5 }], ["fb", "gain", { gain: 0.4 }], ["lp", "biquad", { type: "lowpass", frequency: 7000 }], ["mg", "merge"], ["wet", "gain", { gain: 0.3 }]],
      ["in>dry", "dry>out", "in>lp", "lp>dl", "dl>dr", "dr>fb", "fb>dl", "dl>mg:0", "dr>mg:1", "mg>wet", "wet>out"],
      [K("time", "Time (beats)", 0.125, 2, 0.5, ["dl.sync", "dr.sync"]), K("fb", "Feedback", 0, 85, 40, [{ n: "fb", p: "gain", mul: 0.01 }], { unit: "%" }), K("wet", "Echo level", 0, 100, 30, [{ n: "wet", p: "gain", mul: 0.01 }], { unit: "%" })]),
    P("Chorus", "Modulation", "Two modulated short delays spread left/right.", [["dry", "gain", { gain: 0.7 }], ["d1", "delay", { delayTime: 0.018 }], ["d2", "delay", { delayTime: 0.024 }], ["l1", "lfo", { frequency: 0.8, depth: 0.003 }], ["l2", "lfo", { frequency: 1.1, depth: 0.003, wave: "triangle" }], ["mg", "merge"], ["wet", "gain", { gain: 0.6 }]],
      ["in>dry", "dry>out", "in>d1", "in>d2", "l1>d1.delayTime", "l2>d2.delayTime", "d1>mg:0", "d2>mg:1", "mg>wet", "wet>out"],
      [K("rate", "Rate", 0.05, 5, 0.8, ["l1.frequency", { n: "l2", p: "frequency", mul: 1.37 }], hz), K("depth", "Depth", 0, 8, 3, [{ n: "l1", p: "depth", mul: 0.001 }, { n: "l2", p: "depth", mul: 0.001 }], ms), mix("dry", "wet", 45)]),
    P("Flanger", "Modulation", "Very short swept delay with feedback.", [["dry", "gain", { gain: 0.6 }], ["d", "delay", { delayTime: 0.004 }], ["l", "lfo", { frequency: 0.25, depth: 0.0025, wave: "triangle" }], ["fb", "gain", { gain: 0.6 }], ["wet", "gain", { gain: 0.6 }]],
      ["in>dry", "dry>out", "in>d", "l>d.delayTime", "d>fb", "fb>d", "d>wet", "wet>out"],
      [K("rate", "Rate", 0.02, 4, 0.25, ["l.frequency"], hz), K("depth", "Depth", 0, 4, 2.5, [{ n: "l", p: "depth", mul: 0.001 }], ms), K("fb", "Feedback", 0, 90, 60, [{ n: "fb", p: "gain", mul: 0.01 }], { unit: "%" }), mix("dry", "wet", 50)]),
    P("Phaser", "Modulation", "4 swept all-pass stages.", [["dry", "gain", { gain: 0.5 }], ["a1", "biquad", { type: "allpass", frequency: 900, Q: 0.6 }], ["a2", "biquad", { type: "allpass", frequency: 900, Q: 0.6 }], ["a3", "biquad", { type: "allpass", frequency: 900, Q: 0.6 }], ["a4", "biquad", { type: "allpass", frequency: 900, Q: 0.6 }], ["l", "lfo", { frequency: 0.4, depth: 700 }], ["fb", "gain", { gain: 0.3 }], ["wet", "gain", { gain: 0.5 }]],
      ["in>dry", "dry>out"].concat(chain(["in", "a1", "a2", "a3", "a4", "wet", "out"]), ["a4>fb", "fb>a1", "l>a1.frequency", "l>a2.frequency", "l>a3.frequency", "l>a4.frequency"]),
      [K("rate", "Rate", 0.05, 6, 0.4, ["l.frequency"], hz), K("depth", "Depth", 0, 850, 700, ["l.depth"], hz), K("fb", "Feedback", 0, 80, 30, [{ n: "fb", p: "gain", mul: 0.01 }], { unit: "%" }), mix("dry", "wet", 50)]),
    P("Tremolo", "Modulation", "Tempo-synced volume pulse.", [["vca", "gain", { gain: 0.6 }], ["l", "lfo", { sync: 0.5, depth: 0.4 }]], ["in>vca", "vca>out", "l>vca.gain"],
      [K("rate", "Rate (beats)", 0.125, 4, 0.5, ["l.sync"]), K("depth", "Depth", 0, 100, 40, [{ n: "l", p: "depth", mul: 0.01 }, { n: "vca", p: "gain", mul: -0.01, add: 1 }], { unit: "%" })]),
    P("Auto-Pan", "Modulation", "Tempo-synced left/right movement.", [["p", "panner", { pan: 0 }], ["l", "lfo", { sync: 2, depth: 0.8 }]], ["in>p", "p>out", "l>p.pan"],
      [K("rate", "Rate (beats)", 0.25, 16, 2, ["l.sync"]), K("depth", "Width", 0, 100, 80, [{ n: "l", p: "depth", mul: 0.01 }], { unit: "%" })]),
    sat("Tape Saturation", "tape", 30), sat("Tube Drive", "tube", 40), sat("Distortion", "hard", 60),
    P("Bitcrusher Lite", "Saturation", "Bit-depth reduction (no sample-rate reduction).", [["sh", "shaper", { curve: "crush", amount: 60, oversample: "none" }], ["lp", "biquad", { type: "lowpass", frequency: 9000 }], ["dry", "gain", { gain: 0 }], ["wet", "gain", { gain: 1 }]],
      ["in>sh", "sh>lp", "lp>wet", "wet>out", "in>dry", "dry>out"], [K("crush", "Crush", 0, 100, 60, ["sh.amount"], { unit: "%" }), K("tone", "Tone", 1000, 20000, 9000, ["lp.frequency"], hz), mix("dry", "wet", 100)]),
    filt("lowpass", "Low-pass"), filt("highpass", "High-pass"), filt("bandpass", "Band-pass"),
    P("Stereo Widener", "Stereo", "Haas-style widener: delays the right side a few ms.", [["sp", "split"], ["d", "delay", { delayTime: 0.012 }], ["mg", "merge"]], ["in>sp", "sp:0>mg:0", "sp:1>d", "d>mg:1", "mg>out"],
      [K("w", "Width", 0, 30, 12, [{ n: "d", p: "delayTime", mul: 0.001 }], ms)]),
    P("Gain / Trim", "Utility", "Volume trim and pan.", [["g", "gain", { gain: 1 }], ["p", "panner", { pan: 0 }]], ["in>g", "g>p", "p>out"], [K("g", "Gain", -24, 24, 0, ["g.gain"], dbl), K("p", "Pan", -1, 1, 0, ["p.pan"])]),
    P("Low Cut", "EQ", "Removes rumble below the cutoff.", [["a", "biquad", { type: "highpass", frequency: 100, Q: 0.707 }], ["b", "biquad", { type: "highpass", frequency: 100, Q: 0.707 }]], ["in>a", "a>b", "b>out"], [K("f", "Cutoff", 20, 600, 100, ["a.frequency", "b.frequency"], hz)]),
    P("Bright EQ (highs)", "EQ", "Adds presence and air.", [["p", "biquad", { type: "peaking", frequency: 4500, Q: 0.8, gain: 2 }], ["hs", "biquad", { type: "highshelf", frequency: 10000, gain: 4 }]], ["in>p", "p>hs", "hs>out"], [K("air", "Air", 0, 12, 4, ["hs.gain"], db), K("pres", "Presence", -6, 9, 2, ["p.gain"], db), K("f", "Air freq", 5000, 16000, 10000, ["hs.frequency"], hz)]),
    P("Warm EQ", "EQ", "Fuller lows, softer top.", [["ls", "biquad", { type: "lowshelf", frequency: 180, gain: 3 }], ["mud", "biquad", { type: "peaking", frequency: 2800, Q: 1, gain: -2 }], ["hs", "biquad", { type: "highshelf", frequency: 9000, gain: -2 }]], chain(["in", "ls", "mud", "hs", "out"]), [K("warm", "Warmth", 0, 9, 3, ["ls.gain"], db), K("soft", "Soften highs", -9, 0, -2, ["hs.gain"], db)]),
    P("Rap Vocal", "Chains", "Low cut, mud cut, de-ess, compressor, presence, air.", [["hp", "biquad", { type: "highpass", frequency: 90, Q: 0.7 }], ["mud", "biquad", { type: "peaking", frequency: 300, Q: 1, gain: -3 }], ["c", "compressor", { threshold: -24, ratio: 4, knee: 6, attack: 0.004, release: 0.1 }], ["ess", "biquad", { type: "peaking", frequency: 6800, Q: 3, gain: -3 }], ["pr", "biquad", { type: "peaking", frequency: 3500, Q: 0.9, gain: 3 }], ["air", "biquad", { type: "highshelf", frequency: 10000, gain: 3 }], ["mk", "gain", { gain: 1.8 }]],
      chain(["in", "hp", "mud", "c", "ess", "pr", "air", "mk", "out"]), [K("comp", "Compression", -45, 0, -24, ["c.threshold"], db), K("pres", "Presence", 0, 9, 3, ["pr.gain"], db), K("air", "Air", 0, 9, 3, ["air.gain"], db), K("ess", "De-ess", -12, 0, -3, ["ess.gain"], db), K("mk", "Level", 0, 18, 5, ["mk.gain"], dbl)]),
    P("Ad-lib", "Chains", "Thin, gritty ad-lib with a tempo echo.", [["hp", "biquad", { type: "highpass", frequency: 350, Q: 0.7 }], ["lp", "biquad", { type: "lowpass", frequency: 6000, Q: 0.7 }], ["sh", "shaper", { curve: "tube", amount: 25 }], ["c", "compressor", { threshold: -24, ratio: 6, attack: 0.003, release: 0.08 }], ["d", "delay", { sync: 0.5 }], ["fb", "gain", { gain: 0.3 }], ["wet", "gain", { gain: 0.25 }], ["mk", "gain", { gain: 1 }]],
      chain(["in", "hp", "lp", "sh", "c", "mk", "out"]).concat(["mk>d", "d>fb", "fb>d", "d>wet", "wet>out"]), [K("grit", "Grit", 0, 100, 25, ["sh.amount"], { unit: "%" }), K("echo", "Echo", 0, 80, 25, [{ n: "wet", p: "gain", mul: 0.01 }], { unit: "%" }), K("time", "Echo beats", 0.25, 2, 0.5, ["d.sync"])]),
    P("808 Punch", "Chains", "Sub boost, tape grit, punchy comp and a limiter.", [["ls", "biquad", { type: "lowshelf", frequency: 70, gain: 4 }], ["sh", "shaper", { curve: "tape", amount: 30 }], ["c", "compressor", { threshold: -18, ratio: 4, attack: 0.02, release: 0.15 }], ["lim", "compressor", { threshold: -2, ratio: 20, knee: 0, attack: 0.001, release: 0.05 }], ["mk", "gain", { gain: 1.2 }]],
      chain(["in", "ls", "sh", "c", "mk", "lim", "out"]), [K("sub", "Sub", 0, 12, 4, ["ls.gain"], db), K("grit", "Grit", 0, 100, 30, ["sh.amount"], { unit: "%" }), K("punch", "Punch", -40, 0, -18, ["c.threshold"], db)]),
    P("Master Glue", "Chains", "Gentle bus compression, a touch of air and a limiter.", [["c", "compressor", { threshold: -14, ratio: 2, knee: 6, attack: 0.03, release: 0.2 }], ["air", "biquad", { type: "highshelf", frequency: 12000, gain: 1.5 }], ["mk", "gain", { gain: 1.2 }], ["lim", "compressor", { threshold: -1, ratio: 20, knee: 0, attack: 0.001, release: 0.06 }]],
      chain(["in", "c", "air", "mk", "lim", "out"]), [K("glue", "Glue", -30, 0, -14, ["c.threshold"], db), K("air", "Air", 0, 6, 1.5, ["air.gain"], db), K("mk", "Loudness", 0, 12, 1.6, ["mk.gain"], dbl)])
  ];
  var BUILTIN = B.map(function (d) { var v = validate(d); v.id = "b:" + v.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"); return v; });
  window.IPBPlugins = { validate: validate, build: build, BUILTIN: BUILTIN, RANGES: R, ENUMS: E, LIVE: LIVE, KNOBP: KNOBP };
})();
