/* Island Pin Beats · Master tab — an engineer's master chain, separate from the per-track effects.
 * Source (beat bounce, last vocal take mix, Studio mix, a Vault item or a file) → input gain → EQ (low cut, low shelf,
 * bell, high shelf, tilt) → glue compressor → 3-band multiband compressor → saturation / tape warmth → stereo width
 * (mono below X Hz) → gain to target → true-peak brick-wall limiter → output trim.
 * Live preview uses native Web Audio nodes + one small AudioWorklet (the limiter), so it is light on a tablet; the
 * export renders the very same node graph offline and runs the same limiter code, then dithers (16-bit) and encodes.
 * Manual only: nothing here touches raw takes or runs by itself. Settings are saved with the Beats session. */
(function () {
  "use strict";
  var B = window.IPBBeats && window.IPBBeats.master;
  var D = window.IPBMDSP, FX = window.IPBFx;
  if (!B || !D || !FX || !document.getElementById("tab-master")) return;
  var $ = function (id) { return document.getElementById(id); };
  var clamp = D.clamp, db = D.dbToLin, toDb = D.linToDb;

  /* ---------------- settings ---------------- */
  var TARGETS = { stream: { name: "Streaming −14 LUFS", lufs: -14 }, apple: { name: "Apple Music −16 LUFS", lufs: -16 }, club: { name: "Club / loud −9 LUFS", lufs: -9 }, youtube: { name: "YouTube −14 LUFS", lufs: -14 } };
  function defaults() {
    return {
      v: 1, inGain: 0, outGain: 0, tgtGain: 0, target: "stream",
      eq: { on: false, lowcut: 30, lsF: 100, lsG: 0, bellF: 1000, bellG: 0, bellQ: 1, hsF: 8000, hsG: 0, tilt: 0 },
      glue: { on: false, thr: -12, ratio: 2, atk: 30, rel: 200, mk: 0 },
      mb: { on: false, f1: 150, f2: 2500, lo: { thr: -18, ratio: 2, mk: 0 }, mid: { thr: -18, ratio: 2, mk: 0 }, hi: { thr: -18, ratio: 2, mk: 0 } },
      sat: { on: false, drive: 0.3, mix: 0.5, tape: 0.3 },
      width: { on: false, w: 1, mono: 120 },
      lim: { on: true, ceil: -1 },
      fmt: "wav24"
    };
  }
  function merge(d, o) {
    Object.keys(d).forEach(function (k) {
      if (o && o[k] != null) { if (typeof d[k] === "object" && !Array.isArray(d[k])) merge(d[k], o[k]); else if (typeof d[k] === typeof o[k]) d[k] = o[k]; }
    });
    return d;
  }
  function norm(o) { return merge(defaults(), o || {}); }
  var PRESETS = {
    hiphop: { name: "Hip-Hop Punch", s: { target: "stream", eq: { on: true, lowcut: 25, lsF: 80, lsG: 1.5, bellF: 300, bellG: -1.5, bellQ: 1, hsF: 10000, hsG: 1.5, tilt: 0 },
      glue: { on: true, thr: -14, ratio: 2, atk: 30, rel: 150, mk: 1 }, mb: { on: true, f1: 150, f2: 2500, lo: { thr: -20, ratio: 2.5, mk: 0.5 }, mid: { thr: -18, ratio: 1.8, mk: 0 }, hi: { thr: -22, ratio: 2, mk: 0.5 } },
      sat: { on: true, drive: 0.25, mix: 0.3, tape: 0.2 }, width: { on: true, w: 1.1, mono: 120 }, lim: { on: true, ceil: -1 } } },
    trap: { name: "Trap Loud", s: { target: "club", eq: { on: true, lowcut: 22, lsF: 60, lsG: 2, bellF: 400, bellG: -2, bellQ: 0.9, hsF: 12000, hsG: 2, tilt: 0 },
      glue: { on: true, thr: -16, ratio: 3, atk: 10, rel: 100, mk: 2 }, mb: { on: true, f1: 120, f2: 3000, lo: { thr: -22, ratio: 3, mk: 1 }, mid: { thr: -20, ratio: 2.2, mk: 0.5 }, hi: { thr: -24, ratio: 2.5, mk: 1 } },
      sat: { on: true, drive: 0.4, mix: 0.4, tape: 0.15 }, width: { on: true, w: 1.2, mono: 150 }, lim: { on: true, ceil: -1 } } },
    boombap: { name: "Boom-Bap Warm", s: { target: "stream", eq: { on: true, lowcut: 30, lsF: 120, lsG: 1, bellF: 800, bellG: 0, bellQ: 1, hsF: 9000, hsG: -1, tilt: -0.5 },
      glue: { on: true, thr: -12, ratio: 2, atk: 30, rel: 250, mk: 1 }, mb: { on: false }, sat: { on: true, drive: 0.5, mix: 0.5, tape: 0.6 }, width: { on: true, w: 1, mono: 100 }, lim: { on: true, ceil: -1 } } },
    vocal: { name: "Clean Vocal Forward", s: { target: "stream", eq: { on: true, lowcut: 30, lsF: 200, lsG: -1, bellF: 2500, bellG: 1.5, bellQ: 0.8, hsF: 10000, hsG: 1, tilt: 0 },
      glue: { on: true, thr: -10, ratio: 1.5, atk: 20, rel: 200, mk: 0.5 }, mb: { on: true, f1: 200, f2: 4000, lo: { thr: -20, ratio: 1.8, mk: 0 }, mid: { thr: -16, ratio: 1.5, mk: 0.5 }, hi: { thr: -22, ratio: 1.6, mk: 0 } },
      sat: { on: false }, width: { on: true, w: 1.05, mono: 120 }, lim: { on: true, ceil: -1 } } },
    rock: { name: "Rock", s: { target: "stream", eq: { on: true, lowcut: 35, lsF: 100, lsG: 1, bellF: 500, bellG: -1.5, bellQ: 1, hsF: 6000, hsG: 1.5, tilt: 0 },
      glue: { on: true, thr: -14, ratio: 2.5, atk: 10, rel: 120, mk: 1.5 }, mb: { on: true, f1: 160, f2: 2800, lo: { thr: -20, ratio: 2.2, mk: 0.5 }, mid: { thr: -18, ratio: 2, mk: 0.5 }, hi: { thr: -20, ratio: 2, mk: 0 } },
      sat: { on: true, drive: 0.35, mix: 0.4, tape: 0.3 }, width: { on: true, w: 1.15, mono: 120 }, lim: { on: true, ceil: -1 } } }
  };
  var st = norm(B.saved()), touched = false;
  // the Beats session may be read after this file runs: pick the saved settings up once the page is ready
  function reloadSaved() { if (touched) return; st = norm(B.saved()); if (document.getElementById("mst-mods").children.length) renderAll(); }
  if (document.readyState === "complete") setTimeout(reloadSaved, 0); else window.addEventListener("load", reloadSaved);
  function save() { touched = true; B.save(JSON.parse(JSON.stringify(st))); }

  /* ---------------- the chain (same graph live and offline) ---------------- */
  function satCurve(drive, mix) {
    var n = 2048, c = new Float32Array(n), dr = 1 + 6 * drive, nrm = D.softclip(dr);
    for (var i = 0; i < n; i++) { var x = i / (n - 1) * 2 - 1; c[i] = (1 - mix) * x + mix * D.softclip(dr * x) / nrm; }
    return c;
  }
  var LIN = (function () { var c = new Float32Array(2); c[0] = -1; c[1] = 1; return c; })();
  function buildChain(c) {
    var N = {}, g = function (v) { var x = c.createGain(); x.gain.value = v == null ? 1 : v; return x; };
    function bq(type, f, q) { var b = c.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q != null) b.Q.value = (type === "lowpass" || type === "highpass") ? 20 * Math.log10(q) : q; return b; } // Web Audio LP/HP Q is in dB
    function comp() { var k = c.createDynamicsCompressor(); k.knee.value = 6; return k; }
    N.input = g(); N.inG = g();
    N.hp = bq("highpass", 20, 0.7071); N.ls = bq("lowshelf", 100); N.bell = bq("peaking", 1000, 1); N.hs = bq("highshelf", 8000);
    N.tl = bq("lowshelf", 1000); N.th = bq("highshelf", 1000);
    N.glue = comp(); N.glueMk = g();
    // 3-band LR4 split (allpass-compensated low band → bands sum flat when the compressors are idle)
    N.l1a = bq("lowpass", 150, 0.7071); N.l1b = bq("lowpass", 150, 0.7071); N.h1a = bq("highpass", 150, 0.7071); N.h1b = bq("highpass", 150, 0.7071);
    N.ap2 = bq("allpass", 2500, 0.7071); N.l2a = bq("lowpass", 2500, 0.7071); N.l2b = bq("lowpass", 2500, 0.7071); N.h2a = bq("highpass", 2500, 0.7071); N.h2b = bq("highpass", 2500, 0.7071);
    N.cLo = comp(); N.cMid = comp(); N.cHi = comp(); N.mLo = g(); N.mMid = g(); N.mHi = g(); N.mbSum = g();
    N.sat = c.createWaveShaper(); N.sat.curve = LIN; N.sat.oversample = "none";
    N.tapeH = bq("highshelf", 10000); N.tapeL = bq("lowshelf", 90);
    // M/S width, side high-passed at "mono below"
    N.split = c.createChannelSplitter(2); N.merge = c.createChannelMerger(2);
    N.mid = g(); N.side = g(); N.lM = g(0.5); N.rM = g(0.5); N.lS = g(0.5); N.rS = g(-0.5); N.sHa = bq("highpass", 10, 0.7071); N.sHb = bq("highpass", 10, 0.7071); N.sW = g(1); N.sInv = g(-1);
    N.tgt = g(); N.output = g(); N.mbIn = g();
    N.input.connect(N.inG); N.hp.connect(N.ls); N.ls.connect(N.bell); N.bell.connect(N.hs); N.hs.connect(N.tl); N.tl.connect(N.th);
    N.glue.connect(N.glueMk);
    N.mbIn.connect(N.l1a); N.l1a.connect(N.l1b); N.l1b.connect(N.ap2); N.ap2.connect(N.cLo); N.cLo.connect(N.mLo); N.mLo.connect(N.mbSum);
    N.mbIn.connect(N.h1a); N.h1a.connect(N.h1b); N.h1b.connect(N.l2a); N.l2a.connect(N.l2b); N.l2b.connect(N.cMid); N.cMid.connect(N.mMid); N.mMid.connect(N.mbSum);
    N.h1b.connect(N.h2a); N.h2a.connect(N.h2b); N.h2b.connect(N.cHi); N.cHi.connect(N.mHi); N.mHi.connect(N.mbSum);
    N.sat.connect(N.tapeH); N.tapeH.connect(N.tapeL);
    N.split.connect(N.lM, 0); N.split.connect(N.rM, 1); N.split.connect(N.lS, 0); N.split.connect(N.rS, 1);
    N.lM.connect(N.mid); N.rM.connect(N.mid); N.lS.connect(N.side); N.rS.connect(N.side);
    N.mid.channelCount = 1; N.mid.channelCountMode = "explicit"; N.side.channelCount = 1; N.side.channelCountMode = "explicit";
    N.side.connect(N.sHa); N.sHa.connect(N.sHb); N.sHb.connect(N.sW); N.sW.connect(N.sInv);
    N.mid.connect(N.merge, 0, 0); N.mid.connect(N.merge, 0, 1); N.sW.connect(N.merge, 0, 0); N.sInv.connect(N.merge, 0, 1);
    N.tgt.connect(N.output);
    N.stages = { eq: [N.hp, N.th], glue: [N.glue, N.glueMk], mb: [N.mbIn, N.mbSum], sat: [N.sat, N.tapeL], width: [N.split, N.merge] };
    N.route = null;
    return N;
  }
  /* a stage that is switched off is unhooked (not just set to unity), so a mostly-off chain costs almost nothing */
  var STAGES = ["eq", "glue", "mb", "sat", "width"];
  function routeKey(s) { return STAGES.filter(function (k) { return s[k] && s[k].on; }).join(","); }
  function route(N, s) {
    var key = routeKey(s); if (N.route === key) return false;
    N.inG.disconnect(); STAGES.forEach(function (k) { N.stages[k][1].disconnect(); });
    var at = N.inG;
    STAGES.forEach(function (k) { if (s[k] && s[k].on) { at.connect(N.stages[k][0]); at = N.stages[k][1]; } });
    at.connect(N.tgt); N.route = key;
    return true;
  }
  function latFor(s, sr) { var k = latCache[sr] || 0; return k * ((s.glue.on ? 1 : 0) + (s.mb.on ? 1 : 0)); } // only the compressors add look-ahead
  function applyChain(c, N, s, ramp) {
    if (!ramp || c instanceof OfflineAudioContext) route(N, s);
    var t = c.currentTime, live = ramp && !(c instanceof OfflineAudioContext);
    function set(p, v) { if (live) p.setTargetAtTime(v, t, 0.02); else p.value = v; }
    set(N.inG.gain, db(s.inGain));
    var e = s.eq, on = e.on;
    set(N.hp.frequency, on ? e.lowcut : 10); set(N.ls.frequency, e.lsF); set(N.ls.gain, on ? e.lsG : 0);
    set(N.bell.frequency, e.bellF); set(N.bell.gain, on ? e.bellG : 0); set(N.bell.Q, e.bellQ);
    set(N.hs.frequency, e.hsF); set(N.hs.gain, on ? e.hsG : 0); set(N.tl.gain, on ? -e.tilt : 0); set(N.th.gain, on ? e.tilt : 0);
    var G = s.glue;
    set(N.glue.threshold, G.on ? G.thr : 0); set(N.glue.ratio, G.on ? G.ratio : 1); set(N.glue.attack, G.atk / 1000); set(N.glue.release, G.rel / 1000); set(N.glueMk.gain, db(G.on ? G.mk : 0));
    var M = s.mb;
    [N.l1a, N.l1b, N.h1a, N.h1b].forEach(function (f) { set(f.frequency, M.f1); });
    [N.ap2, N.l2a, N.l2b, N.h2a, N.h2b].forEach(function (f) { set(f.frequency, M.f2); });
    [["lo", N.cLo, N.mLo, 25, 250], ["mid", N.cMid, N.mMid, 10, 150], ["hi", N.cHi, N.mHi, 4, 90]].forEach(function (b) {
      var p = M[b[0]]; set(b[1].threshold, M.on ? p.thr : 0); set(b[1].ratio, M.on ? p.ratio : 1); set(b[1].attack, b[3] / 1000); set(b[1].release, b[4] / 1000); set(b[2].gain, db(M.on ? p.mk : 0));
    });
    var S = s.sat;
    N.sat.curve = S.on ? satCurve(S.drive, S.mix) : LIN;
    set(N.tapeH.gain, S.on ? -3 * S.tape : 0); set(N.tapeL.gain, S.on ? 1.5 * S.tape : 0);
    var W = s.width;
    set(N.sW.gain, W.on ? W.w : 1); set(N.sHa.frequency, W.on && W.mono > 10 ? W.mono : 10); set(N.sHb.frequency, W.on && W.mono > 10 ? W.mono : 10);
    set(N.tgt.gain, db(s.tgtGain));
  }

  /* ---------------- offline render + measurements ---------------- */
  var latCache = {};
  function chainLatency(sr) { // native compressors add a fixed look-ahead: measured once per rate with a click (per compressor)
    if (latCache[sr] != null) return Promise.resolve(latCache[sr]);
    var n = Math.round(sr * 0.2), c = new OfflineAudioContext(2, n, sr), b = c.createBuffer(2, n, sr);
    b.getChannelData(0)[100] = 0.5; b.getChannelData(1)[100] = 0.5;
    var src = c.createBufferSource(); src.buffer = b; var k = c.createDynamicsCompressor(); k.threshold.value = 0; k.ratio.value = 1; src.connect(k); k.connect(c.destination); src.start(0); // one compressor's look-ahead
    return c.startRendering().then(function (o) { var d = o.getChannelData(0), pk = 0, at = 100; for (var i = 0; i < d.length; i++) if (Math.abs(d[i]) > pk) { pk = Math.abs(d[i]); at = i; } latCache[sr] = Math.max(0, at - 100); return latCache[sr]; });
  }
  /* limiter + loudness of offline renders run in master-worker.js (a 2-minute song would otherwise block the page for seconds) */
  var MW = null, mwSeq = 0, mwWait = {};
  function post(msg) {
    if (MW === false) return Promise.reject(new Error("no worker"));
    if (!MW) { try { MW = new Worker("master/master-worker.js?v=20261018g"); MW.onmessage = function (e) { var w = mwWait[e.data.id]; if (!w) return; delete mwWait[e.data.id]; if (e.data.ok) w.res(e.data); else w.rej(new Error(e.data.err)); };
      MW.onerror = function () { MW = false; Object.keys(mwWait).forEach(function (k) { mwWait[k].rej(new Error("worker failed")); delete mwWait[k]; }); }; } catch (e) { MW = false; return Promise.reject(e); } }
    msg.id = ++mwSeq;
    return new Promise(function (res, rej) { mwWait[msg.id] = { res: res, rej: rej }; MW.postMessage(msg, [msg.L.buffer, msg.R.buffer]); });
  }
  function renderChain(src, s) {
    var sr = src.sr, n = src.L.length;
    return chainLatency(sr).then(function () {
      var lat = latFor(s, sr);
      var c = new OfflineAudioContext(2, n + lat + Math.round(sr * 0.05), sr), b = c.createBuffer(2, n, sr);
      b.getChannelData(0).set(src.L); b.getChannelData(1).set(src.R);
      var s0 = c.createBufferSource(); s0.buffer = b; var N = buildChain(c); applyChain(c, N, s, false);
      s0.connect(N.input); N.output.connect(c.destination); s0.start(0);
      return c.startRendering().then(function (o) {
        var L = o.getChannelData(0).slice(lat, lat + n), R = o.getChannelData(1).slice(lat, lat + n);
        var og = db(Math.min(0, s.outGain));
        return post({ op: "post", L: L, R: R, sr: sr, lim: { on: s.lim.on, ceil: s.lim.ceil }, og: og }).then(function (r) { return { L: r.L, R: r.R, sr: sr, lufs: r.lufs }; }, function () {
          if (!L.length && n) { L = o.getChannelData(0).slice(lat, lat + n); R = o.getChannelData(1).slice(lat, lat + n); } // worker died after taking the arrays
          if (s.lim.on) { var r = D.limitArrays(L, R, 0, s.lim.ceil, { sr: sr }); L = r.L; R = r.R; } // no worker: same thing on the page
          if (og !== 1) for (var i = 0; i < n; i++) { L[i] *= og; R[i] *= og; }
          return { L: L, R: R, sr: sr };
        });
      });
    });
  }
  /* true peak for reports / the export guard: 8× oversampling, 48-tap Kaiser-windowed sinc per phase (stricter than the
     limiter's fast detector, close to what EBU / ffmpeg meters read) */
  var HQ = (function () {
    var taps = 48, over = 8, half = taps / 2, ph = [];
    function i0(x) { var s = 1, t = 1; for (var k = 1; k < 25; k++) { t *= (x / (2 * k)) * (x / (2 * k)); s += t; } return s; }
    var beta = 8, den = i0(beta);
    for (var k = 1; k < over; k++) {
      var h = new Float64Array(taps), sum = 0;
      for (var j = 0; j < taps; j++) { var t = (j - half + 1) - k / over, sinc = Math.abs(t) < 1e-9 ? 1 : Math.sin(Math.PI * t) / (Math.PI * t), u = t / half; h[j] = sinc * (Math.abs(u) <= 1 ? i0(beta * Math.sqrt(1 - u * u)) / den : 0); sum += h[j]; }
      for (j = 0; j < taps; j++) h[j] /= sum;
      ph.push(h);
    }
    return { ph: ph, taps: taps, half: half };
  })();
  function truePeak(L, R) {
    var pk = 0, T = HQ.taps, off = HQ.half - 1;
    [L, R].forEach(function (x) {
      var n = x.length, i;
      for (i = 0; i < n; i++) { var a = x[i] < 0 ? -x[i] : x[i]; if (a > pk) pk = a; }
      // only look around loud samples (anything within 3 dB of the running peak can hide an inter-sample over)
      for (i = off; i < n - T; i++) {
        var v = x[i] < 0 ? -x[i] : x[i], w = x[i + 1] < 0 ? -x[i + 1] : x[i + 1]; if (v < pk * 0.7 && w < pk * 0.7) continue;
        for (var k = 0; k < HQ.ph.length; k++) { var h = HQ.ph[k], s = 0, b = i - off; for (var j = 0; j < T; j++) s += h[j] * x[b + j]; if (s < 0) s = -s; if (s > pk) pk = s; }
      }
    });
    return toDb(pk);
  }
  /* brick-wall guarantee for the export: after the limiter, trim any residual true-peak over (a fraction of a dB at most) */
  function guardCeiling(o, ceil) {
    for (var it = 0; it < 3; it++) {
      var tp = truePeak(o.L, o.R); if (tp <= ceil - 0.05) return tp;
      var g = db(ceil - 0.1 - tp); for (var i = 0; i < o.L.length; i++) { o.L[i] *= g; o.R[i] *= g; }
    }
    return truePeak(o.L, o.R);
  }
  /* loudness stats from K-weighted prefix sums: integrated, short-term max, LRA (EBU 3342), momentary max */
  function stats(L, R, sr) {
    var kl = FX.kFilter(L, sr), kr = FX.kFilter(R, sr), n = L.length, cs = new Float64Array(n + 1);
    for (var i = 0; i < n; i++) cs[i + 1] = cs[i] + kl[i] * kl[i] + kr[i] * kr[i];
    function win(w, hop) { var W = Math.round(w * sr), H = Math.round(hop * sr), o = []; if (n < W) W = n; for (var s = 0; s + W <= n; s += H) o.push((cs[s + W] - cs[s]) / W); return o; }
    var LU = function (z) { return -0.691 + 10 * Math.log10(z + 1e-20); };
    var m = win(0.4, 0.1), I = FX.gated(m), stv = win(3, 0.1), mm = -Infinity, sm = -Infinity;
    m.forEach(function (z) { mm = Math.max(mm, LU(z)); }); stv.forEach(function (z) { sm = Math.max(sm, LU(z)); });
    var g = stv.map(LU).filter(function (x) { return x > -70; }), lra = 0;
    if (g.length) { var mean = 10 * Math.log10(g.reduce(function (a, x) { return a + Math.pow(10, x / 10); }, 0) / g.length); g = g.filter(function (x) { return x > mean - 20; }).sort(function (a, b) { return a - b; });
      if (g.length > 1) lra = g[Math.round(0.95 * (g.length - 1))] - g[Math.round(0.1 * (g.length - 1))]; }
    return { I: I, S: sm, M: mm, LRA: lra };
  }

  /* ---------------- source ---------------- */
  var src = null; // { L, R, sr, name, lufs }
  function setSource(s) {
    if (!s || !s.L || !s.L.length) { B.toast("Nothing to master yet from that source."); return; }
    src = s; src.lufs = FX.lufs([s.L, s.R], s.sr); srcBuf = null; dryMatch = null; outLufs = null;
    $("mst-src-name").textContent = s.name + " · " + fmtT(s.L.length / s.sr) + " · " + (isFinite(src.lufs) ? src.lufs.toFixed(1) + " LUFS in" : "silent");
    ["mst-play", "mst-fit", "mst-export"].forEach(function (id) { $(id).disabled = false; });
    resetMeters(); measureOut();
  }
  function fmtT(s) { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ":" + ("0" + s % 60).slice(-2); }
  function prog(f) { var p = $("mst-prog"); if (!p) return; if (f == null) { p.hidden = true; return; } p.hidden = false; p.value = Math.max(0, Math.min(1, f)); }
  function busy(on, msg) { if (!on) prog(null); var el = $("mst-busy"); el.hidden = !on; el.textContent = msg || ""; ["mst-load", "mst-fit", "mst-export"].forEach(function (id) { $(id).disabled = on || (id !== "mst-load" && !src); }); }
  function decodeBlob(blob) {
    var c = B.ctx(); return blob.arrayBuffer().then(function (ab) { return c.decodeAudioData(ab); }).then(function (b) {
      return { L: b.getChannelData(0).slice(), R: (b.numberOfChannels > 1 ? b.getChannelData(1) : b.getChannelData(0)).slice(), sr: b.sampleRate };
    });
  }
  /* "Current song (auto)": the song he is working on — the Studio mix when he came from the Studio, else the Beat mix
     (last vocal take + beat with its FX / levels when there is one, else the full song, else the loop). Rendered once
     and cached; after an edit the "Refresh from current song" button lights up. Never renders while the preview plays. */
  var srcKind = null, srcSig = null, loading = false, fromStudio = false;
  function autoPick() {
    if (fromStudio) return "studio";
    if (B.hasVocal && B.hasVocal()) return "vocal";
    return B.hasSong && B.hasSong() ? "song" : "loop";
  }
  function staleUI() {
    var b = $("mst-refresh"); if (!b) return;
    var stale = !!src && srcKind !== "file" && srcKind !== "vault" && B.songSig && srcSig !== B.songSig() && srcKind !== "studio";
    b.hidden = !src || srcKind === "file" || srcKind === "vault"; b.classList.toggle("stale", stale);
    b.textContent = stale ? "↻ Refresh from current song (edited)" : "↻ Refresh from current song";
  }
  function onMasterOpen() {
    if (loading || prev) { staleUI(); return; }
    if (!src) { $("mst-src").value = "auto"; loadSource(); return; }
    staleUI();
  }
  function loadSource() {
    var v = $("mst-src").value; stopPrev();
    if (v === "file") { $("mst-file").click(); return; }
    if (loading) return;
    var auto = v === "auto"; if (auto) v = autoPick();
    var title = (B.title && B.title()) || "My song";
    loading = true; busy(true, auto ? "Loading your current song…" : "Preparing the source…"); prog(0);
    var p, sig = B.songSig ? B.songSig() : null;
    var onP = function (f) { prog(f); $("mst-busy").textContent = "Rendering " + title + "… " + Math.round(f * 100) + "%"; };
    if (v === "song" || v === "loop") { B.stopBeat(); p = B.renderBeat(v === "song" ? "song" : (document.getElementById("bounce-bars") || {}).value || "4", onP).catch(function (e) { if (auto && v === "song") return B.renderBeat("4", onP); throw e; }); }
    else if (v === "vocal") p = B.vocalMix().then(function (r) { if (!r) throw new Error("Record a vocal take first (Record Vocals)."); return r; });
    else if (v === "studio") p = studioMix();
    else if (v.indexOf("vault:") === 0) p = B.vaultGet(v.slice(6)).then(function (it) { if (!it) throw new Error("Not found in the Vault"); return decodeBlob(it.blob).then(function (r) { r.name = it.name; return r; }); });
    else p = Promise.reject(new Error("Pick a source"));
    p.then(function (r) {
      loading = false; busy(false);
      var kind = v.indexOf("vault:") === 0 ? "vault" : v;
      if (kind === "song" || kind === "loop" || kind === "vocal") r.name = "Mastering: " + title + " (Beat mix" + (kind === "vocal" ? " + vocal" : kind === "loop" ? ", loop" : "") + ")";
      else if (kind === "studio") r.name = "Mastering: " + r.name.replace(/^Studio mix · /, "") + " (Studio mix)";
      srcKind = kind; srcSig = sig; setSource(r); staleUI();
    }).catch(function (e) { loading = false; busy(false); B.toast((e && e.message) || String(e)); });
  }
  function studioMix() {
    var w = B.studio();
    var wait = function (k) { return new Promise(function (res, rej) { (function poll(i) { w = B.studio(); if (w && w.IPBStudio && w.IPBStudio.ready) res(w); else if (i > 100) rej(new Error("The Studio didn't load")); else setTimeout(function () { poll(i + 1); }, 100); })(0); }); };
    return wait().then(function (w) {
      var P = w.IPBStudio.project(), E = w.IPBS.E, end = E.projectEnd(P);
      if (end <= 0.05) throw new Error("The Studio project is empty.");
      var Q = Object.assign({}, P, { master: Object.assign({}, P.master, { limiter: false }) }); // the master chain does the limiting
      return E.render(Q, 0, end).then(function (lr) { return { L: lr[0], R: lr[1], sr: w.IPBS.SR, name: "Studio mix · " + (P.name || "My Song") }; });
    });
  }
  function fillVault() {
    var sel = $("mst-src"); [].slice.call(sel.querySelectorAll("option[data-v]")).forEach(function (o) { o.remove(); });
    B.vaultList().then(function (items) {
      var og = sel.querySelector("optgroup"); if (!og) { og = document.createElement("optgroup"); og.label = "Vault"; sel.appendChild(og); }
      og.innerHTML = "";
      items.sort(function (a, b) { return (b.created || 0) - (a.created || 0); }).slice(0, 30).forEach(function (it) { var o = document.createElement("option"); o.value = "vault:" + it.id; o.dataset.v = 1; o.textContent = it.name; og.appendChild(o); });
    });
  }

  /* ---------------- live preview ---------------- */
  var L = null, srcBuf = null, prev = null, mode = "master", mono = false, dryMatch = null, outLufs = null;
  function MFFT(sr) { return sr > 50000 ? 16384 : 8192; } // ≥ the 100 ms the meters read each tick (was 32768)
  function ensureLive() {
    var c = B.ctx(); if (!c) return Promise.reject(new Error("Audio not available"));
    if (L && L.c === c) return Promise.resolve(L);
    L = { c: c, N: buildChain(c) };
    L.proc = c.createGain(); L.dry = c.createGain(); L.refG = c.createGain(); L.mon = c.createGain(); L.monoG = c.createGain(); L.stG = c.createGain(); L.trim = c.createGain();
    L.dryDelay = c.createDelay(0.2);
    L.monoG.channelCount = 1; L.monoG.channelCountMode = "explicit"; L.monoG.gain.value = 0;
    L.split = c.createChannelSplitter(2); L.anL = c.createAnalyser(); L.anR = c.createAnalyser(); L.anL.fftSize = L.anR.fftSize = MFFT(c.sampleRate);
    L.spec = c.createAnalyser(); L.spec.fftSize = 4096; L.spec.smoothingTimeConstant = 0.75;
    L.kl = []; // K-weighting (native biquads = BS.1770 shelf + RLB high-pass) for the live LUFS meters
    L.kIn = c.createGain(); L.kSh = c.createBiquadFilter(); L.kSh.type = "highshelf"; L.kSh.frequency.value = 1681.97; L.kSh.gain.value = 4;
    L.kHp = c.createBiquadFilter(); L.kHp.type = "highpass"; L.kHp.frequency.value = 38.14; L.kHp.Q.value = 20 * Math.log10(0.5003); // Q in dB for LP/HP
    L.kSplit = c.createChannelSplitter(2); L.kAL = c.createAnalyser(); L.kAR = c.createAnalyser(); L.kAL.fftSize = L.kAR.fftSize = MFFT(c.sampleRate);
    var after = function (lim) {
      L.N.output.connect(lim); lim.connect(L.trim); L.trim.connect(L.proc);
      route(L.N, st); L.dryDelay.delayTime.value = (latFor(st, c.sampleRate) + (L.limLat || 0)) / c.sampleRate;
      L.dryDelay.connect(L.dry);
      [L.proc, L.dry, L.refG].forEach(function (n) { n.connect(L.mon); });
      L.mon.connect(L.split); L.split.connect(L.anL, 0); L.split.connect(L.anR, 1); L.mon.connect(L.spec);
      L.mon.connect(L.kIn); L.kIn.connect(L.kSh); L.kSh.connect(L.kHp); L.kHp.connect(L.kSplit); L.kSplit.connect(L.kAL, 0); L.kSplit.connect(L.kAR, 1);
      L.mon.connect(L.stG); L.mon.connect(L.monoG); L.stG.connect(c.destination); L.monoG.connect(c.destination);
      applyLive(); return L;
    };
    var go = function () { return chainLatency(c.sampleRate).then(function () {
      if (c.audioWorklet && !L.noWorklet) return c.audioWorklet.addModule("master/master-dsp.js?v=20261018g").then(function () { return c.audioWorklet.addModule("master/master-worklet.js?v=20261018g"); }).then(function () {
        var w = new AudioWorkletNode(c, "ipb-tplimiter", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
        w.port.onmessage = function (e) { L.limGr = e.data.gr; }; L.lim = w; L.limLat = Math.round(0.005 * c.sampleRate) + 8; return after(w);
      });
      var k = c.createDynamicsCompressor(); k.knee.value = 0; k.ratio.value = 20; k.attack.value = 0.001; k.release.value = 0.08; L.lim = k; L.limFallback = true; L.limLat = Math.round(0.006 * c.sampleRate); return after(k);
    }); };
    return go().catch(function (e) { console.warn("master limiter worklet", e); L.noWorklet = true; return go(); });
  }
  var rerouteT = null;
  function applyLive() {
    if (!L || !L.lim) return;
    applyChain(L.c, L.N, st, true);
    var t = L.c.currentTime;
    if (L.N.route !== routeKey(st) && !rerouteT) { // a stage switched on / off: dip 25 ms, re-hook, keep the dry path aligned
      L.N.output.gain.setTargetAtTime(0, t, 0.004);
      rerouteT = setTimeout(function () { rerouteT = null; if (!L) return; route(L.N, st); var c = L.c; L.dryDelay.delayTime.setValueAtTime((latFor(st, c.sampleRate) + (L.limLat || 0)) / c.sampleRate, c.currentTime); L.N.output.gain.setTargetAtTime(1, c.currentTime, 0.006); }, 30);
    }
    if (L.limFallback) { L.lim.threshold.setTargetAtTime(st.lim.on ? st.lim.ceil - 1 : 0, t, 0.02); L.lim.ratio.setTargetAtTime(st.lim.on ? 20 : 1, t, 0.02); }
    else { L.lim.parameters.get("ceil").setValueAtTime(st.lim.ceil, t); L.lim.parameters.get("on").setValueAtTime(st.lim.on ? 1 : 0, t); }
    L.trim.gain.setTargetAtTime(db(Math.min(0, st.outGain)), t, 0.02);
    var match = dryMatch != null ? dryMatch : 1, rm = refMatch();
    L.proc.gain.setTargetAtTime(mode === "master" ? 1 : 0, t, 0.01);
    L.dry.gain.setTargetAtTime(mode === "bypass" ? match : 0, t, 0.01);
    L.refG.gain.setTargetAtTime(mode === "ref" ? rm : 0, t, 0.01);
    L.stG.gain.setTargetAtTime(mono ? 0 : 1, t, 0.01); L.monoG.gain.setTargetAtTime(mono ? 1 : 0, t, 0.01);
  }
  var refCache = { buf: null, lufs: null };
  function refMatch() { // reference played at the master's output loudness (level-matched A/B)
    var b = B.reference(); if (!b || outLufs == null) return 1;
    if (refCache.buf !== b) { refCache.buf = b; var ch = [b.getChannelData(0), b.numberOfChannels > 1 ? b.getChannelData(1) : b.getChannelData(0)]; refCache.lufs = FX.lufs(ch, b.sampleRate); }
    return isFinite(refCache.lufs) ? clamp(db(outLufs - refCache.lufs), 0.05, 8) : 1;
  }
  function playPrev() {
    if (prev) { stopPrev(); return; }
    if (!src) return;
    B.stopBeat();
    ensureLive().then(function (L) {
      var c = L.c;
      if (!srcBuf || srcBuf.sampleRate !== src.sr) { srcBuf = c.createBuffer(2, src.L.length, src.sr); srcBuf.getChannelData(0).set(src.L); srcBuf.getChannelData(1).set(src.R); }
      var s = c.createBufferSource(); s.buffer = srcBuf; s.connect(L.N.input); s.connect(L.dryDelay);
      var off = prevPos || 0; if (off >= srcBuf.duration - 0.05) off = 0;
      var at = c.currentTime + 0.05; s.start(at, off);
      var r = null, rb = B.reference();
      if (rb) { r = c.createBufferSource(); r.buffer = rb; r.loop = true; r.connect(L.refG); r.start(at, off % rb.duration); }
      prev = { s: s, r: r, t0: at, off: off };
      s.onended = function () { if (prev && prev.s === s) { stopPrev(); prevPos = 0; } };
      $("mst-play").textContent = "■ Stop"; $("mst-play").classList.add("on");
      resetMeters(); meterTimer = setInterval(meterTick, 100); applyLive();
      if (B.park) B.park(); // the idle Beats graph stops rendering while the master plays
    }).catch(function (e) { B.toast("Preview failed: " + ((e && e.message) || e)); });
  }
  var prevPos = 0;
  function stopPrev() {
    if (!prev) return;
    prevPos = prev.off + (L.c.currentTime - prev.t0);
    try { prev.s.onended = null; prev.s.stop(); } catch (e) { /* ended */ } if (prev.r) try { prev.r.stop(); } catch (e) { /* ended */ }
    prev = null; clearInterval(meterTimer); $("mst-play").textContent = "▶ Play"; $("mst-play").classList.remove("on");
    if (B.unpark) B.unpark();
    if (measPending) { measPending = false; clearTimeout(measT); measT = setTimeout(measureOut, 300); }
  }

  /* ---------------- live meters ---------------- */
  var meterTimer = null, mt = null, tbuf = null, tbuf2 = null, kb1 = null, kb2 = null, fbuf = null;
  function resetMeters() { mt = { blocks: [], mom: [], st: [], tp: -Infinity }; mtN = 0; mtLast = { I: -Infinity, LRA: 0 }; }
  var mtN = 0, mtLast = { I: -Infinity, LRA: 0 };
  function meterTick() {
    if (!L || !prev) return;
    if (document.hidden) return;
    mtN++;
    var c = L.c, sr = c.sampleRate, N = L.anL.fftSize;
    tbuf = tbuf || new Float32Array(N); tbuf2 = tbuf2 || new Float32Array(N); kb1 = kb1 || new Float32Array(N); kb2 = kb2 || new Float32Array(N);
    L.kAL.getFloatTimeDomainData(kb1); L.kAR.getFloatTimeDomainData(kb2);
    var h = Math.round(0.1 * sr), z = 0, i;
    for (i = N - h; i < N; i++) z += kb1[i] * kb1[i] + kb2[i] * kb2[i];
    mt.blocks.push(z / h); if (mt.blocks.length > 36000) mt.blocks.shift();
    var LU = function (x) { return -0.691 + 10 * Math.log10(x + 1e-20); };
    var avg = function (k) { var a = mt.blocks.slice(-k), s = 0; a.forEach(function (x) { s += x; }); return s / Math.max(1, a.length); };
    var M = LU(avg(4)), S = LU(avg(30)); mt.mom.push(avg(4)); if (mt.blocks.length >= 30) mt.st.push(S);
    var I = mtLast.I, lra = mtLast.LRA, g = [];
    if (mtN % 5 === 1) { I = mtLast.I = FX.gated(mt.mom); g = mt.st.filter(function (x) { return x > -70; }); lra = 0; }
    if (g.length > 10) { var mean = 10 * Math.log10(g.reduce(function (a, x) { return a + Math.pow(10, x / 10); }, 0) / g.length); g = g.filter(function (x) { return x > mean - 20; }).sort(function (a, b) { return a - b; }); if (g.length > 1) lra = g[Math.round(0.95 * (g.length - 1))] - g[Math.round(0.1 * (g.length - 1))]; mtLast.LRA = lra; }
    L.anL.getFloatTimeDomainData(tbuf); L.anR.getFloatTimeDomainData(tbuf2);
    var sl = 0, sr2 = 0, slr = 0, pk = 0, s0 = N - h;
    for (i = s0; i < N; i++) { var a = tbuf[i], b = tbuf2[i]; sl += a * a; sr2 += b * b; slr += a * b; }
    [tbuf, tbuf2].forEach(function (x) { for (var j = s0; j < N; j++) { var v = x[j] < 0 ? -x[j] : x[j]; if (v > pk) pk = v; } }); // live: sample peak (cheap); the oversampled true peak is measured on export
    var tp = toDb(pk); mt.tp = Math.max(mt.tp, tp);
    var corr = sl > 1e-9 && sr2 > 1e-9 ? slr / Math.sqrt(sl * sr2) : 0;
    showMeters({ M: M, S: S, I: I, LRA: lra, tp: tp, tpMax: mt.tp, corr: corr });
    drawSpec();
    var N0 = L.N;
    setGr("mst-gr-glue", N0.glue.reduction); setGr("mst-gr-lo", N0.cLo.reduction); setGr("mst-gr-mid", N0.cMid.reduction); setGr("mst-gr-hi", N0.cHi.reduction);
    setGr("mst-gr-lim", L.limFallback ? L.lim.reduction : (L.limGr || 0));
  }
  function fmtL(x) { return isFinite(x) ? x.toFixed(1) : "—"; }
  function showMeters(m) {
    $("mst-m").textContent = fmtL(m.M); $("mst-s").textContent = fmtL(m.S); $("mst-i").textContent = fmtL(m.I); $("mst-lra").textContent = m.LRA ? m.LRA.toFixed(1) : "—";
    $("mst-tp").textContent = fmtL(m.tpMax); $("mst-tp").classList.toggle("hot", m.tpMax > st.lim.ceil + 0.05 && mode === "master");
    var cb = $("mst-corr"); cb.style.left = ((m.corr + 1) / 2 * 100).toFixed(1) + "%"; cb.classList.toggle("neg", m.corr < 0); $("mst-corr-v").textContent = m.corr.toFixed(2);
    var tg = TARGETS[st.target]; if (tg && isFinite(m.I)) $("mst-i").classList.toggle("ok", Math.abs(m.I - tg.lufs) <= 1);
  }
  function setGr(id, v) { var el = $(id); if (!el) return; v = Math.min(0, v || 0); el.style.width = Math.min(100, -v / 12 * 100) + "%"; el.parentNode.title = v.toFixed(1) + " dB"; el.parentNode.dataset.v = v.toFixed(1); }
  function drawSpec() {
    var cv = $("mst-spec"); if (!cv || !L) return;
    var w = cv.clientWidth, h = cv.clientHeight; if (!w || !h) return;
    if (cv.width !== w) cv.width = w; if (cv.height !== h) cv.height = h;
    var x = cv.getContext("2d"), n = L.spec.frequencyBinCount, sr = L.c.sampleRate; fbuf = fbuf && fbuf.length === n ? fbuf : new Float32Array(n);
    L.spec.getFloatFrequencyData(fbuf);
    x.clearRect(0, 0, w, h); x.strokeStyle = "rgba(148,163,184,.25)"; x.lineWidth = 1;
    [100, 1000, 10000].forEach(function (f) { var px = Math.log(f / 20) / Math.log(1000) * w; x.beginPath(); x.moveTo(px, 0); x.lineTo(px, h); x.stroke(); });
    x.beginPath(); x.strokeStyle = "#22d3ee"; x.lineWidth = 1.5;
    for (var px = 0; px < w; px += 2) { var f = 20 * Math.pow(1000, px / w), bin = Math.min(n - 1, Math.round(f / (sr / 2) * n)), v = fbuf[bin] + 4.5 * Math.log2(f / 1000); // +4.5 dB/oct tilt ≈ pink reads flat
      var y = h - clamp((v + 90) / 80, 0, 1) * h; if (px === 0) x.moveTo(px, y); else x.lineTo(px, y); }
    x.stroke();
  }

  /* ---------------- output loudness, auto gain to target, export ---------------- */
  var measTok = 0;
  function measureOut() { // offline render → output LUFS (for the level-matched bypass / reference A/B and the readout)
    if (!src) return Promise.resolve();
    var tok = ++measTok;
    return renderChain(src, st).then(function (o) {
      if (tok !== measTok) return;
      outLufs = o.lufs != null ? o.lufs : FX.lufs([o.L, o.R], o.sr);
      dryMatch = isFinite(outLufs) && isFinite(src.lufs) ? clamp(db(outLufs - src.lufs), 0.05, 16) : 1;
      $("mst-out").textContent = isFinite(outLufs) ? outLufs.toFixed(1) + " LUFS out" : "—";
      applyLive();
    });
  }
  var measT = null, measPending = false;
  function changed() { save(); applyLive(); clearTimeout(measT); if (prev) measPending = true; else measT = setTimeout(measureOut, 700); renderReadouts(); } // never re-analyse while playing: on Stop
  function fitTarget() {
    if (!src) return;
    var tg = TARGETS[st.target]; if (!tg) return;
    busy(true, "Matching " + tg.name + "…");
    var tries = 0;
    (function step() {
      renderChain(src, st).then(function (o) {
        var I = o.lufs != null ? o.lufs : FX.lufs([o.L, o.R], o.sr), err = tg.lufs - I; tries++;
        if (!isFinite(I)) throw new Error("The source is silent");
        if (Math.abs(err) <= 0.2 || tries >= 5) {
          busy(false); outLufs = I; dryMatch = isFinite(src.lufs) ? clamp(db(I - src.lufs), 0.05, 16) : 1; applyLive(); renderAll();
          $("mst-out").textContent = I.toFixed(1) + " LUFS out";
          B.toast("Gain to target: " + (st.tgtGain >= 0 ? "+" : "") + st.tgtGain.toFixed(1) + " dB → " + I.toFixed(1) + " LUFS (" + tg.name + ")" + (Math.abs(err) > 0.5 ? " — the limiter can't get closer at this ceiling" : ""));
          save(); return;
        }
        st.tgtGain = clamp(st.tgtGain + err * (tries > 2 ? 1.2 : 1), -24, 24); step();
      }).catch(function (e) { busy(false); B.toast((e && e.message) || String(e)); });
    })();
  }
  function tpdf() { return (Math.random() - Math.random()); }
  function encWav(L, R, sr, bits) {
    var n = L.length, bps = bits / 8, data = n * 2 * bps, buf = new ArrayBuffer(44 + data), v = new DataView(buf), p = 0;
    function s(t) { for (var i = 0; i < t.length; i++) v.setUint8(p++, t.charCodeAt(i)); }
    s("RIFF"); v.setUint32(p, 36 + data, true); p += 4; s("WAVEfmt "); v.setUint32(p, 16, true); p += 4; v.setUint16(p, 1, true); p += 2; v.setUint16(p, 2, true); p += 2;
    v.setUint32(p, sr, true); p += 4; v.setUint32(p, sr * 2 * bps, true); p += 4; v.setUint16(p, 2 * bps, true); p += 2; v.setUint16(p, bits, true); p += 2; s("data"); v.setUint32(p, data, true); p += 4;
    for (var i = 0; i < n; i++) for (var ch = 0; ch < 2; ch++) {
      var x = ch ? R[i] : L[i];
      if (bits === 16) { var q = Math.round(x * 32767 + tpdf()); v.setInt16(p, q > 32767 ? 32767 : q < -32768 ? -32768 : q, true); p += 2; } // TPDF dither (±1 LSB)
      else { var q2 = Math.round(x * 8388607); q2 = q2 > 8388607 ? 8388607 : q2 < -8388608 ? -8388608 : q2; v.setUint8(p++, q2 & 255); v.setUint8(p++, (q2 >> 8) & 255); v.setUint8(p++, (q2 >> 16) & 255); }
    }
    return new Blob([buf], { type: "audio/wav" });
  }
  function encMp3(L, R, sr) {
    var go = function () {
      var enc = new lamejs.Mp3Encoder(2, sr, 320), out = [], blk = 1152;
      function i16(a, s, e) { var r = new Int16Array(e - s); for (var i = s; i < e; i++) { var v = clamp(a[i] + tpdf() / 32768, -1, 1); r[i - s] = v < 0 ? v * 32768 : v * 32767; } return r; }
      for (var i = 0; i < L.length; i += blk) { var e = Math.min(L.length, i + blk), m = enc.encodeBuffer(i16(L, i, e), i16(R, i, e)); if (m.length) out.push(new Uint8Array(m)); }
      var f = enc.flush(); if (f.length) out.push(new Uint8Array(f));
      return new Blob(out, { type: "audio/mpeg" });
    };
    if (window.lamejs) return Promise.resolve(go());
    return new Promise(function (res, rej) { var s = document.createElement("script"); s.src = "studio/vendor/lame.min.js"; s.onload = function () { res(go()); }; s.onerror = function () { rej(new Error("MP3 encoder didn't load")); }; document.head.appendChild(s); });
  }
  var lastReport = null;
  function exportMaster() {
    if (!src) return;
    var fmt = st.fmt, tg = TARGETS[st.target];
    busy(true, "Rendering the master…"); stopPrev();
    renderChain(src, st).then(function (o) {
      $("mst-busy").textContent = "Measuring loudness…";
      return new Promise(function (r) { setTimeout(r, 30); }).then(function () {
        var tp = st.lim.on ? guardCeiling(o, st.lim.ceil) : truePeak(o.L, o.R), s = stats(o.L, o.R, o.sr);
        lastReport = { I: s.I, S: s.S, M: s.M, LRA: s.LRA, tp: tp, plr: tp - s.I, target: tg ? tg.lufs : null, targetName: tg ? tg.name : "", ceil: st.lim.ceil, limOn: st.lim.on, fmt: fmt, sr: o.sr, dur: o.L.length / o.sr };
        $("mst-busy").textContent = "Encoding…";
        return (fmt === "mp3" ? encMp3(o.L, o.R, o.sr) : Promise.resolve(encWav(o.L, o.R, o.sr, fmt === "wav16" ? 16 : 24))).then(function (blob) {
          var name = (B.title() || "Master").replace(/[\\/:*?"<>|]+/g, " ").trim() + " (master " + (tg ? tg.lufs + " LUFS" : "") + ")";
          var ext = fmt === "mp3" ? ".mp3" : ".wav";
          var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name + ext; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
          return B.saveToVault(blob, o.L.length / o.sr, "Master · " + (src.name || "") + " · " + fmtL(s.I) + " LUFS").catch(function () {}).then(function () { busy(false); showReport(); B.toast("Master exported (" + (fmt === "mp3" ? "MP3 320" : fmt === "wav16" ? "WAV 16-bit, dithered" : "WAV 24-bit") + ") and saved to the Vault"); });
        });
      });
    }).catch(function (e) { busy(false); B.toast("Export failed: " + ((e && e.message) || e)); });
  }
  function showReport() {
    var r = lastReport, el = $("mst-report"); if (!r) { el.hidden = true; return; }
    el.hidden = false;
    var d = r.target != null ? r.I - r.target : null;
    el.innerHTML = "<h4>Loudness report</h4><table>" +
      [["Integrated", fmtL(r.I) + " LUFS" + (d != null ? " (" + (d >= 0 ? "+" : "") + d.toFixed(1) + " vs " + r.targetName + ")" : "")], ["True peak", fmtL(r.tp) + " dBTP" + (r.limOn ? " (ceiling " + r.ceil.toFixed(1) + ")" : "")],
        ["Loudness range (LRA)", r.LRA.toFixed(1) + " LU"], ["Short-term max", fmtL(r.S) + " LUFS"], ["Momentary max", fmtL(r.M) + " LUFS"], ["PLR (peak to loudness)", r.plr.toFixed(1) + " dB"],
        ["Format", (r.fmt === "mp3" ? "MP3 320 kbps" : r.fmt === "wav16" ? "WAV 16-bit + TPDF dither" : "WAV 24-bit") + " · " + r.sr + " Hz · " + fmtT(r.dur)]]
        .map(function (x) { return "<tr><th>" + x[0] + "</th><td>" + x[1] + "</td></tr>"; }).join("") + "</table>";
  }

  /* ---------------- UI ---------------- */
  var MODS = [
    { k: "eq", name: "EQ", desc: "low cut · shelves · bell · tilt", p: [["lowcut", "Low cut", 10, 200, 1, "Hz"], ["lsF", "Low shelf", 40, 400, 5, "Hz"], ["lsG", "Low gain", -12, 12, 0.5, "dB"], ["bellF", "Bell", 150, 8000, 10, "Hz"], ["bellG", "Bell gain", -12, 12, 0.5, "dB"], ["bellQ", "Bell Q", 0.3, 4, 0.1, ""], ["hsF", "High shelf", 2000, 16000, 100, "Hz"], ["hsG", "High gain", -12, 12, 0.5, "dB"], ["tilt", "Tilt (dark ↔ bright)", -4, 4, 0.25, "dB"]] },
    { k: "glue", name: "Glue compressor", desc: "bus compression", gr: "glue", p: [["thr", "Threshold", -40, 0, 0.5, "dB"], ["ratio", "Ratio", 1, 10, 0.1, ":1"], ["atk", "Attack", 1, 100, 1, "ms"], ["rel", "Release", 30, 1000, 10, "ms"], ["mk", "Makeup", 0, 12, 0.5, "dB"]] },
    { k: "mb", name: "Multiband (3-band)", desc: "low · mid · high compression", p: [["f1", "Low / mid", 60, 500, 5, "Hz"], ["f2", "Mid / high", 1000, 8000, 50, "Hz"], ["lo.thr", "Low thr", -40, 0, 0.5, "dB"], ["lo.ratio", "Low ratio", 1, 8, 0.1, ":1"], ["lo.mk", "Low makeup", -6, 6, 0.5, "dB"], ["mid.thr", "Mid thr", -40, 0, 0.5, "dB"], ["mid.ratio", "Mid ratio", 1, 8, 0.1, ":1"], ["mid.mk", "Mid makeup", -6, 6, 0.5, "dB"], ["hi.thr", "High thr", -40, 0, 0.5, "dB"], ["hi.ratio", "High ratio", 1, 8, 0.1, ":1"], ["hi.mk", "High makeup", -6, 6, 0.5, "dB"]], grs: ["lo", "mid", "hi"] },
    { k: "sat", name: "Saturation / tape", desc: "warmth", p: [["drive", "Drive", 0, 1, 0.01, "%"], ["mix", "Mix", 0, 1, 0.01, "%"], ["tape", "Tape warmth", 0, 1, 0.01, "%"]] },
    { k: "width", name: "Stereo width", desc: "mono below X Hz keeps the low end tight", p: [["w", "Width", 0, 2, 0.01, "%w"], ["mono", "Mono below", 0, 300, 5, "Hz"]] },
    { k: "lim", name: "True-peak limiter", desc: "brick-wall · 4× oversampled peaks", gr: "lim", p: [["ceil", "Ceiling", -6, 0, 0.1, "dBTP"]] }
  ];
  function getP(o, path) { return path.split(".").reduce(function (a, k) { return a[k]; }, o); }
  function setP(o, path, v) { var ks = path.split("."), last = ks.pop(); ks.reduce(function (a, k) { return a[k]; }, o)[last] = v; }
  function fmtV(v, u) { if (u === "%") return Math.round(v * 100) + "%"; if (u === "%w") return Math.round(v * 100) + "%"; if (u === "Hz") return v >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 0 : 1) + "k" : v === 0 ? "off" : Math.round(v) + ""; if (u === ":1") return (+v).toFixed(1) + ":1"; if (u === "") return (+v).toFixed(1); return (v > 0 && u === "dB" ? "+" : "") + (+v).toFixed(1) + (u === "dBTP" ? "" : ""); }
  function renderMods() {
    var G = $("mst-mods"); G.innerHTML = "";
    MODS.forEach(function (m) {
      var s = st[m.k], box = document.createElement("div"); box.className = "mst-blk" + (s.on ? " on" : ""); box.dataset.k = m.k;
      box.innerHTML = '<h4><span>' + m.name + ' <small>' + m.desc + '</small></span><button type="button" class="mst-sw' + (s.on ? " on" : "") + '" aria-pressed="' + s.on + '" title="' + m.name + ' on / off"></button></h4>' +
        (m.gr ? '<div class="mst-grm" title="Gain reduction"><i id="mst-gr-' + m.gr + '"></i></div>' : "") +
        (m.grs ? '<div class="mst-grs">' + m.grs.map(function (b) { return '<div class="mst-grm"><i id="mst-gr-' + b + '"></i></div>'; }).join("") + "</div>" : "");
      box.querySelector(".mst-sw").addEventListener("click", function () { s.on = !s.on; box.classList.toggle("on", s.on); this.classList.toggle("on", s.on); this.setAttribute("aria-pressed", String(s.on)); changed(); });
      m.p.forEach(function (p) {
        var lab = document.createElement("label"); lab.className = "mst-p";
        lab.innerHTML = "<span>" + p[1] + '</span><input type="range"><output></output>';
        var r = lab.querySelector("input"), o = lab.querySelector("output");
        r.min = p[2]; r.max = p[3]; r.step = p[4]; r.value = getP(s, p[0]); o.textContent = fmtV(getP(s, p[0]), p[5]);
        r.addEventListener("input", function () { setP(s, p[0], +r.value); o.textContent = fmtV(+r.value, p[5]); if (!s.on) { s.on = true; box.classList.add("on"); box.querySelector(".mst-sw").classList.add("on"); } changed(); });
        box.appendChild(lab);
      });
      G.appendChild(box);
    });
  }
  function renderReadouts() {
    $("mst-in").value = st.inGain; $("mst-in-v").textContent = fmtV(st.inGain, "dB") + " dB";
    $("mst-outg").value = st.outGain; $("mst-outg-v").textContent = fmtV(st.outGain, "dB") + " dB";
    $("mst-tgt-v").textContent = (st.tgtGain >= 0 ? "+" : "") + st.tgtGain.toFixed(1) + " dB";
    $("mst-target").value = st.target; $("mst-fmt").value = st.fmt;
    document.querySelectorAll("#mst-ab [data-m]").forEach(function (b) { var on = b.dataset.m === mode; b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on)); });
    $("mst-mono").classList.toggle("on", mono); $("mst-mono").setAttribute("aria-pressed", String(mono));
    var rb = $("mst-ab").querySelector('[data-m="ref"]'); rb.disabled = !B.reference(); rb.title = B.reference() ? "Reference: " + B.refName() + " (level-matched to the master)" : "Load a reference track in Beats (Reference track box) to compare";
  }
  function renderAll() { renderMods(); renderReadouts(); }
  function wire() {
    $("mst-refresh").addEventListener("click", function () { var v = srcKind === "studio" ? "studio" : "auto"; $("mst-src").value = v; loadSource(); });
    document.addEventListener("ipb-tab", function (e) { if (e.detail === "master") setTimeout(onMasterOpen, 0); else stopPrev(); }); // deferred: a Studio "Master ↗" asks for the Studio mix in the same tick
    $("mst-load").addEventListener("click", function () { if ($("mst-src").value === "file") $("mst-file").click(); else loadSource(); }); // synchronous in the tap: the picker is allowed to open
    // picking a source loads it right away (the Vault list is refreshed when the tab opens, never while the picker is open)
    $("mst-src").addEventListener("change", function () { if (this.value === "file") { try { $("mst-file").click(); } catch (e) { /* needs the button */ } return; } loadSource(); });
    $("mst-file-btn").addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("mst-file").click(); } });
    $("mst-file").addEventListener("change", function () {
      var f = this.files && this.files[0]; this.value = ""; if (!f) return;
      stopPrev(); busy(true, "Reading " + f.name + " (" + Math.max(1, Math.round(f.size / 1048576)) + " MB)…");
      setTimeout(function () { busy(true, "Decoding " + f.name + "…"); }, 300);
      decodeBlob(f).then(function (r) { r.name = "Mastering: " + f.name + " (file)"; busy(false); srcKind = "file"; setSource(r); staleUI(); B.toast("Loaded " + f.name); })
        .catch(function (e) { busy(false); var ext = (f.name.split(".").pop() || "").toUpperCase(); B.toast("Couldn't open " + f.name + ": this browser can't decode " + (ext || "that format") + " files. Try WAV, MP3, M4A/AAC, FLAC or OGG."); $("mst-src-name").textContent = "Not loaded: " + f.name + " (unsupported format)"; });
    });
    $("mst-play").addEventListener("click", playPrev);
    document.querySelectorAll("#mst-ab [data-m]").forEach(function (b) { b.addEventListener("click", function () { mode = b.dataset.m; renderReadouts(); applyLive(); }); });
    $("mst-mono").addEventListener("click", function () { mono = !mono; renderReadouts(); applyLive(); });
    $("mst-in").addEventListener("input", function () { st.inGain = +this.value; changed(); });
    $("mst-outg").addEventListener("input", function () { st.outGain = +this.value; changed(); });
    $("mst-target").addEventListener("change", function () { st.target = this.value; save(); renderReadouts(); });
    $("mst-fit").addEventListener("click", fitTarget);
    $("mst-tgt-reset").addEventListener("click", function () { st.tgtGain = 0; changed(); });
    $("mst-fmt").addEventListener("change", function () { st.fmt = this.value; save(); });
    $("mst-export").addEventListener("click", exportMaster);
    $("mst-preset").addEventListener("change", function () {
      var v = this.value; this.value = ""; if (!v) return;
      if (v === "reset") st = norm({ fmt: st.fmt }); else { var keep = { fmt: st.fmt, inGain: st.inGain, outGain: st.outGain }; st = norm(Object.assign({}, PRESETS[v].s, keep)); st.tgtGain = 0; }
      renderAll(); changed(); B.toast(v === "reset" ? "Master chain reset (all off)" : "Preset: " + PRESETS[v].name + " — tap “Auto gain to target” to hit " + TARGETS[st.target].name);
    });
    var ps = $("mst-preset"); Object.keys(PRESETS).forEach(function (k) { var o = document.createElement("option"); o.value = k; o.textContent = PRESETS[k].name; ps.insertBefore(o, ps.querySelector('[value="reset"]')); });
    var ts = $("mst-target"); Object.keys(TARGETS).forEach(function (k) { var o = document.createElement("option"); o.value = k; o.textContent = TARGETS[k].name; ts.appendChild(o); });
    // leaving the tab stops the preview
    document.querySelectorAll(".tab[data-tab]").forEach(function (t) { t.addEventListener("click", function () { if (t.dataset.tab === "master") { renderReadouts(); fillVault(); } }); });
    renderAll(); fillVault();
    try { if (new URLSearchParams(location.search).get("src") === "studio") { fromStudio = true; setTimeout(function () { $("mst-src").value = "studio"; loadSource(); }, 600); } } catch (e) { /* old browsers */ }
    if (document.querySelector('.tab[data-tab="master"].active')) setTimeout(onMasterOpen, 700);
  }
  wire();
  window.IPBMaster = { state: function () { return JSON.parse(JSON.stringify(st)); }, setSource: setSource, loadSource: function (v) { if (v === "studio") fromStudio = true; $("mst-src").value = v; loadSource(); }, renderChain: renderChain, stats: stats, truePeak: truePeak,
    source: function () { return src; }, fit: fitTarget, report: function () { return lastReport; }, mode: function () { return mode; }, live: function () { return L; }, outLufs: function () { return outLufs; }, dryMatch: function () { return dryMatch; },
    set: function (o) { st = norm(o); renderAll(); changed(); }, PRESETS: PRESETS,
    /* built-in Helper (../helper.js): checks of the loaded song + chain, each with a one-tap fix where there is a safe one */
    helperChecks: function () {
      var out = [], tg = TARGETS[st.target];
      if (loading) { out.push({ level: "tip", text: "Your song is still being prepared (progress bar). Checks run once it's loaded." }); return out; }
      if (!src) { out.push({ level: "tip", text: "No song loaded. Tap “Refresh from current song” (or pick a source / “Choose a song file…”).", fix: { label: "Load my song", run: function () { $("mst-src").value = "auto"; loadSource(); return "Loading your current song…"; } } }); return out; }
      if (srcKind !== "file" && srcKind !== "vault" && srcKind !== "studio" && B.songSig && srcSig !== B.songSig()) out.push({ level: "warn", text: "You edited the song after it was loaded here, so you're mastering an older version.", fix: { label: "Refresh song", run: function () { $("mst-src").value = "auto"; loadSource(); return "Re-loading your current song…"; } } });
      if (!STAGES.some(function (k) { return st[k].on; })) out.push({ level: "tip", text: "The master chain is all off. Start from a preset, then tap “Auto gain to target”.", fix: { label: "Hip-Hop Punch preset", run: function () { var keep = { fmt: st.fmt, inGain: st.inGain, outGain: st.outGain }; st = norm(Object.assign({}, PRESETS.hiphop.s, keep)); st.tgtGain = 0; renderAll(); changed(); return "Preset: Hip-Hop Punch (now try Auto gain to target)"; } } });
      if (!st.lim.on) out.push({ level: "warn", text: "The true-peak limiter is off: the export can clip on phones / streaming.", fix: { label: "Limiter on (−1 dBTP)", run: function () { st.lim.on = true; st.lim.ceil = -1; renderAll(); changed(); return "Limiter on, ceiling −1 dBTP"; } } });
      if (isFinite(src.lufs) && src.lufs < -24) out.push({ level: "tip", text: "The song comes in quiet (" + src.lufs.toFixed(1) + " LUFS). Raise Input gain a few dB so the chain works on a healthy level.", fix: { label: "Input +6 dB", run: function () { st.inGain = clamp(st.inGain + 6, -12, 12); renderReadouts(); changed(); return "Input gain +6 dB"; } } });
      if (tg && outLufs != null && isFinite(outLufs) && Math.abs(outLufs - tg.lufs) > 1) out.push({ level: "warn", text: "Output is " + outLufs.toFixed(1) + " LUFS, " + Math.abs(outLufs - tg.lufs).toFixed(1) + " dB " + (outLufs < tg.lufs ? "quieter" : "louder") + " than " + tg.name + ".", fix: { label: "Auto gain to target", run: function () { fitTarget(); return "Matching " + tg.name + "…"; } } });
      var corr = parseFloat(($("mst-corr-v") || {}).textContent);
      if (isFinite(corr) && corr < 0 && prev) out.push({ level: "warn", text: "Stereo correlation is negative (" + corr.toFixed(2) + "): parts can cancel out on a phone speaker / in mono.", fix: { label: "Mono below 120 Hz, width 100%", run: function () { st.width.on = true; st.width.mono = 120; st.width.w = Math.min(st.width.w, 1); renderAll(); changed(); return "Width: mono below 120 Hz"; } } });
      if (st.glue.on && st.glue.thr < -26 && st.glue.ratio > 4) out.push({ level: "tip", text: "Glue compressor is pushed hard (threshold " + st.glue.thr + " dB, " + st.glue.ratio + ":1): it can squash the punch. Watch its gain-reduction bar; 1–3 dB is typical." });
      if (!out.some(function (x) { return x.level === "warn"; })) out.push({ level: "ok", text: "Master looks healthy" + (outLufs != null && isFinite(outLufs) ? " (" + outLufs.toFixed(1) + " LUFS out" + (tg ? ", target " + tg.lufs : "") + ")" : "") + ". Play it, compare with Bypass (level-matched), then Export." });
      return out;
    }, TARGETS: TARGETS, buildChain: buildChain, applyChain: applyChain, defaults: defaults };
})();
