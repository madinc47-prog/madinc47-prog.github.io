/* IslePin "Pro vocal" chain — makes a phone / tablet built-in mic sound like a condenser vocal, automatically.
 * Dependency-free classic script (also works as a plain <script>): sets window.VocalChain.
 *
 *   built-in mic : high-pass 90 Hz (18 dB/oct) → condenser EQ (warmth 150 Hz +2, mud 320 Hz −3, phone honk
 *                  2.5 kHz −2, presence 4.2 kHz +3, air 11 kHz +3.5) → leveler + 3.5:1 compressor (auto make-up)
 *                  → de-esser (5–9 kHz) → gentle noise gate (self-calibrating; decides on the input, acts after the
 *                  compressor so make-up gain can't lift the room back up) → soft limiter (≈ −1 dBTP)
 *   interface    : high-pass 70 Hz → light 2:1 compressor → limiter (a real mic + preamp already sounds right)
 *
 *   VocalChain.processInput(sourceNode, { profile: 'builtin' | 'interface' }) → Promise<chain>
 *       chain.output (connect it anywhere), chain.setEnabled(bool), chain.latency (s), chain.disconnect()
 *   VocalChain.render(float32, sampleRate, opts) → Promise<Float32Array>   (same nodes, in an OfflineAudioContext;
 *       latency-compensated, same length as the input — used to process a recorded RAW take)
 *   VocalChain.enabled() / setEnabled(bool) — the user's "Pro vocal" switch (localStorage, default ON)
 *   VocalChain.micConstraints(extra) — getUserMedia audio constraints: echoCancellation / autoGainControl /
 *       noiseSuppression off (phone noise-suppression pumps and eats breaths and word tails; the gate does it gently).
 */
(function (root) {
  "use strict";
  var KEY = "islepin_pro_vocal";
  var here = (function () {
    try { var s = document.currentScript && document.currentScript.src; if (s) return s; } catch (e) { /* ignore */ }
    return (root.location && root.location.href) || "";
  })();
  var WORKLET = new URL("vocal-chain-worklet.js", here).href;
  var loaded = typeof WeakMap !== "undefined" ? new WeakMap() : null;

  var EQ = [ // condenser-style curve for built-in mics
    { type: "peaking", f: 150, q: 0.9, g: 2 },     // warmth / chest
    { type: "peaking", f: 320, q: 1.2, g: -3 },    // mud / boxiness of a small plastic body
    { type: "peaking", f: 2500, q: 2.5, g: -2 },   // phone-mic honk/harsh resonance
    { type: "peaking", f: 4200, q: 1.0, g: 3 },    // presence: words cut through the beat
    { type: "highshelf", f: 11000, q: 0.7, g: 3.5 } // air
  ];
  var PROFILES = {
    builtin: { hpf: 90, gate: true, eq: true, dyn: "builtin" },
    interface: { hpf: 70, gate: false, eq: false, dyn: "interface" }
  };

  function ensureWorklet(ctx) {
    if (!ctx.audioWorklet) return Promise.reject(new Error("AudioWorklet not supported"));
    if (loaded && loaded.has(ctx)) return loaded.get(ctx);
    var p = ctx.audioWorklet.addModule(WORKLET);
    if (loaded) loaded.set(ctx, p);
    return p;
  }
  function mono(node) { node.channelCount = 1; node.channelCountMode = "explicit"; node.channelInterpretation = "speakers"; return node; }

  function build(ctx, sourceNode, opts) {
    opts = opts || {};
    var prof = PROFILES[opts.profile] || PROFILES.builtin, sr = ctx.sampleRate, nodes = [];
    var input = mono(ctx.createGain()), last = input;
    function add(n) { last.connect(n); nodes.push(n); last = n; return n; }
    // 18 dB/oct high-pass: 2nd-order Butterworth biquad + 1st-order IIR
    var hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = prof.hpf; hp.Q.value = 0.7071; add(hp);
    var k = Math.tan(Math.PI * prof.hpf / sr), a0 = 1 + k;
    try { add(ctx.createIIRFilter([1 / a0, -1 / a0], [1, (k - 1) / a0])); } catch (e) { /* biquad alone: 12 dB/oct */ }
    var dyn;
    if (prof.eq) EQ.forEach(function (b) {
      var f = ctx.createBiquadFilter(); f.type = b.type; f.frequency.value = Math.min(b.f, sr * 0.45); f.Q.value = b.q; f.gain.value = b.g; add(f);
    });
    dyn = new AudioWorkletNode(ctx, "vc-dyn", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1],
      processorOptions: { profile: prof.dyn, levelDb: opts.levelDb, ceilingDb: -1.5, gate: prof.gate,
        floorDb: opts.floorDb, calibMs: 400, rangeDb: -18, openAboveDb: 10, closeAboveDb: 5, holdMs: 180, attackMs: 3, releaseMs: 220 } });
    add(dyn);
    // bypass = equal-time crossfade between the processed and the untouched signal
    var wet = ctx.createGain(), dry = ctx.createGain(), output = ctx.createGain();
    last.connect(wet); wet.connect(output);
    var dly = ctx.createDelay(0.05); // keep dry time-aligned with wet (limiter 1.5 ms look-ahead)
    var lat = Math.max(8, Math.round(0.0015 * sr)) - 1;
    dly.delayTime.value = lat / sr;
    input.connect(dly); dly.connect(dry); dry.connect(output);
    var on = opts.enabled !== false;
    wet.gain.value = on ? 1 : 0; dry.gain.value = on ? 0 : 1;
    if (sourceNode) sourceNode.connect(input);
    return {
      input: input, output: output, dyn: dyn, latency: lat / sr, latencySamples: lat, profile: opts.profile || "builtin",
      setEnabled: function (v) {
        var t = ctx.currentTime; on = !!v;
        wet.gain.setTargetAtTime(on ? 1 : 0, t, 0.02); dry.gain.setTargetAtTime(on ? 0 : 1, t, 0.02);
      },
      enabled: function () { return on; },
      stats: function () {
        function ask(n) { return n ? new Promise(function (res) { n.port.onmessage = function (e) { res(e.data); }; n.port.postMessage({ stats: true }); setTimeout(function () { res(null); }, 500); }) : Promise.resolve(null); }
        return ask(dyn);
      },
      disconnect: function () {
        try { if (sourceNode) sourceNode.disconnect(input); } catch (e) { /* ignore */ }
        [input, wet, dry, dly, output].concat(nodes).forEach(function (n) { try { n.disconnect(); } catch (e) { /* ignore */ } });
      }
    };
  }

  function processInput(sourceNode, opts) {
    var ctx = sourceNode.context;
    return ensureWorklet(ctx).then(function () { return build(ctx, sourceNode, opts); });
  }

  // room-noise floor of a recorded take (dBFS RMS, 20 ms frames, 10th percentile, after a 2-pole 90 Hz high-pass)
  // and its voice level (85th percentile) → gate threshold + leveler start point for offline renders
  function analyse(x, sr) {
    var N = Math.max(64, Math.round(0.02 * sr)), fr = [], y1 = 0, x1 = 0, z1 = 0, w1 = 0, a = Math.exp(-2 * Math.PI * 90 / sr);
    var e = 0, c = 0;
    for (var i = 0; i < x.length; i++) {
      var y = a * (y1 + x[i] - x1); x1 = x[i]; y1 = y; var z = a * (z1 + y - w1); w1 = y; z1 = z; e += z * z; c++;
      if (c === N) { fr.push(10 * Math.log10(e / N + 1e-14)); e = 0; c = 0; }
    }
    if (!fr.length) return { floorDb: -70, voiceDb: -30 };
    var s = fr.slice().sort(function (p, q) { return p - q; });
    return { floorDb: s[Math.floor(s.length * 0.1)], voiceDb: s[Math.floor(s.length * 0.85)] };
  }

  function render(x, sr, opts) {
    opts = opts || {};
    var OAC = root.OfflineAudioContext || root.webkitOfflineAudioContext;
    if (!OAC) return Promise.reject(new Error("OfflineAudioContext not supported"));
    var tail = Math.round(0.05 * sr), n = x.length + tail, ctx = new OAC(1, n, sr);
    var an = analyse(x, sr), o = {};
    for (var k in opts) o[k] = opts[k];
    if (o.floorDb == null) o.floorDb = an.floorDb;
    if (o.levelDb == null) o.levelDb = an.voiceDb - 3; // leveler starts at the take's own voice level: no fade-in
    return ensureWorklet(ctx).then(function () {
      var b = ctx.createBuffer(1, x.length, sr); b.getChannelData(0).set(x);
      var s = ctx.createBufferSource(); s.buffer = b;
      var ch = build(ctx, s, o); ch.output.connect(ctx.destination);
      s.start(0);
      return ctx.startRendering().then(function (buf) {
        var d = buf.getChannelData(0), L = ch.latencySamples;
        return new Float32Array(d.subarray(L, L + x.length));
      });
    });
  }

  function enabled() { try { return localStorage.getItem(KEY) !== "0"; } catch (e) { return true; } }
  function setEnabled(v) { try { localStorage.setItem(KEY, v ? "1" : "0"); } catch (e) { /* ignore */ } }
  function micConstraints(extra) {
    var c = { echoCancellation: false, autoGainControl: false, noiseSuppression: false, channelCount: 1 };
    if (extra) for (var k in extra) c[k] = extra[k];
    return c;
  }

  root.VocalChain = { processInput: processInput, render: render, analyse: analyse, enabled: enabled, setEnabled: setEnabled,
    micConstraints: micConstraints, EQ: EQ, PROFILES: PROFILES, WORKLET: WORKLET, version: "1.0" };
})(typeof window !== "undefined" ? window : self);
