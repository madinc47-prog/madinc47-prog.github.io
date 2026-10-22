/* Island Pin Beats · Match my song to a reference (Record page, under the Reference track box).
 * Load YOUR song (a full mix / bounce, or "Use my beat") and a REFERENCE record: as soon as both are in, the song is analysed
 * and a matched COPY is rendered in master/refmatch-worker.js (EQ curve, dynamics, width, loudness, -1 dBTP limiter).
 * Matched / Original A/B, Amount 0-100 %, Export matched WAV. The original file and vocal takes are never changed. */
(function () {
  "use strict";
  var V = (document.currentScript && /[?&]v=([^&]+)/.exec(document.currentScript.src) || [])[1] || "1";
  var base = document.currentScript ? document.currentScript.src.replace(/[^/]*$/, "") : "";
  var W = null, seq = 0, waits = {};
  var st = { song: null, songName: "", ref: null, refName: "", refOwn: false, mine: null, refA: null, out: null, rep: null, amount: 1, ab: "M", busy: false, src: null, t0: 0, off: 0, gen: 0 };
  function $(id) { return document.getElementById(id); }
  function B() { return window.IPBBeats && window.IPBBeats.master; }
  function ctx() { var b = B(); if (b && b.ctx) return b.ctx(); st.c = st.c || new (window.AudioContext || window.webkitAudioContext)(); return st.c; }
  function worker() {
    if (W) return W;
    W = new Worker(base + "master/refmatch-worker.js?v=" + V);
    W.onmessage = function (e) { var d = e.data, w = waits[d.id]; if (!w) return; if (d.prog != null) { w.p && w.p(d.prog, d.msg); return; } delete waits[d.id]; if (d.ok) w.res(d.r); else w.rej(new Error(d.err)); };
    return W;
  }
  function call(msg, onp) { msg.id = ++seq; return new Promise(function (res, rej) { waits[msg.id] = { res: res, rej: rej, p: onp }; worker().postMessage(msg); }); }
  function chs(buf) { var L = buf.getChannelData(0), R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L; return { L: new Float32Array(L), R: new Float32Array(R), sr: buf.sampleRate }; }
  function fmt(x, sign) { return isFinite(x) ? (sign && x > 0 ? "+" : "") + x.toFixed(1) : "—"; }
  function status(t) { var s = $("rm-status"); if (s) s.textContent = t; }
  function progress(p, msg) { var b = $("rm-prog"); if (!b) return; b.hidden = p == null; if (p != null) b.value = p; if (msg) status(msg + "… " + Math.round(p * 100) + "%"); }

  function build() {
    var host = $("ref-panel"); if (!host || $("rm-panel")) return;
    var el = document.createElement("section");
    el.id = "rm-panel"; el.className = "rm-panel"; el.setAttribute("aria-label", "Match my song to the reference");
    el.innerHTML =
      '<div class="rm-head"><strong>Match my song to reference</strong><span class="rm-sub">Auto mastering assistant: your song is processed to sound like the reference (EQ, dynamics, width, loudness). Your original file is never changed.</span></div>' +
      '<div class="rm-row">' +
        '<label class="btn small file-btn">1 · My song…<input type="file" id="rm-song-file" accept="audio/*,.mp3,.wav,.m4a,.aac,.flac,.ogg" hidden></label>' +
        '<button type="button" class="btn small" id="rm-use-beat" title="Render the current Beat song (offline) and use it as your song">Use my beat</button>' +
        '<span class="mono rm-name" id="rm-song-name">No song loaded</span>' +
      '</div><div class="rm-row">' +
        '<label class="btn small file-btn">2 · Reference…<input type="file" id="rm-ref-file" accept="audio/*,.mp3,.wav,.m4a,.aac,.flac,.ogg" hidden></label>' +
        '<span class="mono rm-name" id="rm-ref-name">Uses the Reference track above, or pick one</span>' +
      '</div>' +
      '<progress id="rm-prog" class="rm-prog" max="1" value="0" hidden></progress><div id="rm-status" class="rm-status" role="status">Load your song and a reference: matching starts by itself.</div>' +
      '<div class="rm-row">' +
        '<button type="button" class="btn rec" id="rm-play" disabled>▶ Play</button>' +
        '<span class="rm-seg" role="group" aria-label="Compare"><button type="button" class="btn small on" data-rm="M" aria-pressed="true">Matched</button><button type="button" class="btn small" data-rm="O" aria-pressed="false">Original</button></span>' +
        '<label class="rm-amt">Amount <input type="range" id="rm-amount" min="0" max="100" step="5" value="100"> <output id="rm-amount-v" class="mono">100%</output></label>' +
        '<button type="button" class="btn primary" id="rm-export" disabled>Export matched WAV</button>' +
      '</div><div id="rm-report" class="rm-report mono"></div>';
    host.parentNode.insertBefore(el, host.nextSibling);
    var css = document.createElement("style");
    css.textContent = ".rm-panel{margin:12px 0;padding:12px;border:1px solid rgba(255,255,255,.14);border-radius:12px;background:rgba(255,255,255,.03)}.rm-head{display:flex;flex-direction:column;gap:2px;margin-bottom:8px}.rm-sub{font-size:12px;opacity:.75}.rm-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:6px 0}.rm-row .btn{min-height:40px}.rm-name{font-size:12px;opacity:.85;overflow-wrap:anywhere;min-width:0}.rm-prog{width:100%;height:10px}.rm-status{font-size:13px;margin:4px 0}.rm-seg{display:inline-flex;gap:4px}.rm-seg .on{outline:2px solid #ffcc33}.rm-amt{display:inline-flex;align-items:center;gap:6px;font-size:13px}.rm-amt input{width:140px}.rm-report{font-size:12px;opacity:.85;white-space:pre-wrap}";
    document.head.appendChild(css);
    $("rm-song-file").addEventListener("change", function () { var f = this.files[0]; if (f) loadFile(f, "song"); this.value = ""; });
    $("rm-ref-file").addEventListener("change", function () { var f = this.files[0]; if (f) loadFile(f, "ref"); this.value = ""; });
    $("rm-use-beat").addEventListener("click", useBeat);
    $("rm-play").addEventListener("click", function () { if (st.src) stop(); else play(0); });
    el.querySelectorAll("[data-rm]").forEach(function (b) { b.addEventListener("click", function () { setAB(b.getAttribute("data-rm")); }); });
    var amt = $("rm-amount"), tm = 0;
    amt.addEventListener("input", function () { $("rm-amount-v").textContent = amt.value + "%"; clearTimeout(tm); tm = setTimeout(function () { st.amount = amt.value / 100; if (st.mine && st.refA) render(); }, 500); });
    $("rm-export").addEventListener("click", exportWav);
    // the Reference track box above: pick its reference up when one is loaded there
    setInterval(pickShared, 1500);
  }
  function pickShared() {
    if (st.refOwn || st.busy) return;
    var b = B(), r = b && b.reference && b.reference();
    if (r && r !== st.ref) { st.ref = r; st.refName = (b.refName && b.refName()) || "Reference"; st.refA = null; $("rm-ref-name").textContent = st.refName + " (from the Reference track box)"; auto(); }
  }
  function loadFile(f, which) {
    status("Decoding " + f.name + "…");
    f.arrayBuffer().then(function (ab) { return ctx().decodeAudioData(ab); }).then(function (buf) {
      if (which === "song") { st.song = buf; st.songName = f.name; st.mine = null; $("rm-song-name").textContent = f.name + " · " + buf.duration.toFixed(0) + " s"; }
      else { st.ref = buf; st.refName = f.name; st.refOwn = true; st.refA = null; $("rm-ref-name").textContent = f.name + " · " + buf.duration.toFixed(0) + " s"; }
      auto();
    }, function () { status("Couldn't open " + f.name + " — try a WAV or MP3."); });
  }
  function useBeat() {
    var b = B(); if (!b || !b.renderBeat) { status("Beat isn't ready yet."); return; }
    status("Rendering your beat…"); progress(0, "Rendering your beat");
    b.renderBeat("song", function (p) { progress(p, "Rendering your beat"); }).then(function (o) {
      var c = ctx(), buf = c.createBuffer(2, o.L.length, o.sr); buf.getChannelData(0).set(o.L); buf.getChannelData(1).set(o.R);
      st.song = buf; st.songName = o.name || "My beat"; st.mine = null; $("rm-song-name").textContent = st.songName + " · " + buf.duration.toFixed(0) + " s"; auto();
    }, function (e) { progress(null); status("Couldn't render the beat: " + e.message); });
  }
  function auto() {
    if (!st.song) { status("Now load your song (step 1)."); return; }
    if (!st.ref) { status("Now load a reference (step 2)."); return; }
    analyse();
  }
  function analyse() {
    var g = ++st.gen; st.busy = true; ui();
    var a = chs(st.song), r = chs(st.ref);
    (st.mine ? Promise.resolve(st.mine) : call({ op: "analyse", L: a.L, R: a.R, sr: a.sr }, function (p) { progress(p * 0.5, "Analysing your song"); })).then(function (m) {
      st.mine = m;
      return st.refA ? st.refA : call({ op: "analyse", L: r.L, R: r.R, sr: r.sr }, function (p) { progress(0.5 + p * 0.5, "Analysing the reference"); });
    }).then(function (ra) { if (g !== st.gen) return; st.refA = ra; return render(); }).catch(function (e) { st.busy = false; progress(null); status("Analysis failed: " + e.message); ui(); });
  }
  function render() {
    var g = ++st.gen, a = chs(st.song); st.busy = true; ui();
    return call({ op: "render", L: a.L, R: a.R, sr: a.sr, mine: st.mine, ref: st.refA, amount: st.amount }, function (p, m) { progress(p, m || "Matching"); }).then(function (o) {
      if (g !== st.gen) return;
      var c = ctx(), buf = c.createBuffer(2, o.L.length, a.sr); buf.getChannelData(0).set(o.L); buf.getChannelData(1).set(o.R);
      var wasPlaying = !!st.src, pos = pos0();
      st.out = buf; st.rep = o.report; st.busy = false; progress(null); report(); ui();
      if (wasPlaying) { stop(); play(pos); }
      if (window.__ipbRM) window.__ipbRM.last = o.report;
    }, function (e) { st.busy = false; progress(null); status("Matching failed: " + e.message); ui(); });
  }
  function report() {
    var r = st.rep, m = st.mine, f = st.refA; if (!r) return;
    var eq = r.eq.map(function (g, i) { return { f: r.eqF[i], g: g }; }).filter(function (x) { return Math.abs(x.g) >= 1; }).sort(function (a, b) { return Math.abs(b.g) - Math.abs(a.g); }).slice(0, 5)
      .map(function (x) { return (x.f >= 1000 ? (x.f / 1000).toFixed(1) + "k" : Math.round(x.f)) + " Hz " + fmt(x.g, true); }).join(", ");
    status("Matched at " + Math.round(st.amount * 100) + "%. Tap Play and switch Matched / Original to compare.");
    $("rm-report").textContent =
      "Loudness: yours " + fmt(m.lufs) + " → " + fmt(r.lufs) + " LUFS (reference " + fmt(f.lufs) + "), true peak " + fmt(r.tp) + " dBTP\n" +
      "Tone difference to reference: " + r.diffBefore.toFixed(1) + " dB → " + r.diffAfter.toFixed(1) + " dB" + (eq ? "   EQ: " + eq : "") + "\n" +
      "Dynamics: crest " + fmt(m.crest) + " → " + fmt(r.crest) + " dB (reference " + fmt(f.crest) + ")" + (r.comp ? ", compressor " + r.comp.ratio.toFixed(1) + ":1" : "") + "   Width ×" + r.width.toFixed(2);
  }
  function ui() {
    var ok = !!st.out && !st.busy;
    $("rm-play").disabled = !st.out; $("rm-export").disabled = !ok;
    $("rm-play").textContent = st.src ? "■ Stop" : "▶ Play";
    document.querySelectorAll("#rm-panel [data-rm]").forEach(function (b) { var on = b.getAttribute("data-rm") === st.ab; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); });
  }
  function pos0() { if (!st.src) return st.off; var c = ctx(), d = st.song.duration; return (st.off + c.currentTime - st.t0) % d; }
  function play(at) {
    var b = B(); if (b && b.stopBeat) b.stopBeat();
    var c = ctx(); if (c.state === "suspended") c.resume();
    var buf = st.ab === "M" && st.out ? st.out : st.song; if (!buf) return;
    var s = c.createBufferSource(); s.buffer = buf; s.connect(c.destination);
    s.onended = function () { if (st.src === s) { st.src = null; st.off = 0; ui(); } };
    st.off = at || 0; st.t0 = c.currentTime; s.start(0, st.off); st.src = s; ui();
  }
  function stop() { if (!st.src) return; var s = st.src; st.off = pos0(); st.src = null; try { s.stop(); } catch (e) { /* */ } ui(); }
  function setAB(m) { st.ab = m; if (st.src) { var p = pos0(); stop(); play(p); } else ui(); }
  function encWav(buf) {
    var n = buf.length, sr = buf.sampleRate, L = buf.getChannelData(0), R = buf.getChannelData(1), dv = new DataView(new ArrayBuffer(44 + n * 6));
    function s(o, t) { for (var i = 0; i < t.length; i++) dv.setUint8(o + i, t.charCodeAt(i)); }
    s(0, "RIFF"); dv.setUint32(4, 36 + n * 6, true); s(8, "WAVEfmt "); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 2, true);
    dv.setUint32(24, sr, true); dv.setUint32(28, sr * 6, true); dv.setUint16(32, 6, true); dv.setUint16(34, 24, true); s(36, "data"); dv.setUint32(40, n * 6, true);
    for (var i = 0, o = 44; i < n; i++) for (var ch = 0; ch < 2; ch++) { var v = Math.max(-1, Math.min(1, (ch ? R : L)[i])), x = Math.round(v * 8388607); dv.setUint8(o++, x & 255); dv.setUint8(o++, (x >> 8) & 255); dv.setUint8(o++, (x >> 16) & 255); }
    return new Blob([dv.buffer], { type: "audio/wav" });
  }
  function exportWav() {
    if (!st.out) return;
    var blob = encWav(st.out), name = (st.songName.replace(/\.[^.]+$/, "") || "song") + " (matched)";
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name + ".wav"; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    var b = B(); if (b && b.saveToVault) b.saveToVault(blob, st.out.duration, name).then(function () { status("Exported " + name + ".wav (also saved in the Vault)."); }, function () { status("Exported " + name + ".wav."); });
  }
  window.__ipbRM = { state: st, load: function (buf, which, name) { if (which === "song") { st.song = buf; st.songName = name || "song"; st.mine = null; } else { st.ref = buf; st.refName = name || "ref"; st.refOwn = true; st.refA = null; } auto(); }, enc: encWav };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build); else build();
})();
