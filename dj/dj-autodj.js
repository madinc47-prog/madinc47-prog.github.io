/* DJ Psycho Fingers — Auto DJ. Plays a queue automatically: offline BPM + beat-grid + outro analysis (cached),
 * tempo + phase sync, mix-out point N bars before the music ends (snapped to a 4-bar phrase), automatic crossfade
 * with an EQ bass swap, tempo glide back to the track's own BPM, and the next track loaded on the idle deck.
 * Grabbing any deck / mixer / crossfader control hands control back to you. */
(function () {
  "use strict";
  var P = window.PFDJ; if (!P) return;
  var $ = function (id) { return document.getElementById(id); };
  var AK = "pfdj_autodj_v1", CK = "pfdj_anal_v1";
  var A = { on: false, paused: false, played: [], loop: true, queue: [], bars: 16, shuffle: false, order: "queue", bassSwap: true, phase: "idle", cur: null, inc: null, mix: null, glide: null, prepped: null, loadingNext: false, nextItem: null, analyzing: 0, msg: "" };
  try { var s = JSON.parse(localStorage.getItem(AK) || "null"); if (s) { A.bars = [4, 8, 16, 32].indexOf(s.bars) >= 0 ? s.bars : 16; A.shuffle = !!s.shuffle; A.order = s.order === "bpm" ? "bpm" : "queue"; A.bassSwap = s.bassSwap !== false; } } catch (e) { /* ignore */ }
  var cache = {}; try { cache = JSON.parse(localStorage.getItem(CK) || "{}") || {}; } catch (e) { cache = {}; }
  function save() { try { localStorage.setItem(AK, JSON.stringify({ bars: A.bars, shuffle: A.shuffle, order: A.order, bassSwap: A.bassSwap })); } catch (e) { /* ignore */ } }
  function saveCache() { try { localStorage.setItem(CK, JSON.stringify(cache)); } catch (e) { /* ignore */ } }

  /* ---------- analysis ---------- */
  function analyzeBuf(buf, known) {
    var r = known && known.bpm ? { bpm: known.bpm, grid: known.grid || 0 } : (P.estimateBpm(buf) || { bpm: known && known.bpmHint || null, grid: 0 });
    var c0 = buf.getChannelData(0), sr = buf.sampleRate, win = Math.round(sr / 2), n = Math.floor(c0.length / win), e = new Float32Array(n);
    for (var i = 0; i < n; i++) { var s = 0; for (var j = i * win, k = j + win; j < k; j += 4) s += c0[j] * c0[j]; e[i] = s; }
    var sortedE = Array.prototype.slice.call(e).sort(function (a, b) { return a - b; }), med = sortedE[Math.floor(n / 2)] || 0;
    var end = n - 1; while (end > 0 && e[end] < med * 0.3) end--;              // last loud moment = end of the music
    var lastLoud = (end + 1) / 2;
    var outro = lastLoud; for (var q = end; q > n * 0.5; q--) { var m = 0; for (var z = q - 16; z < q; z++) m += e[Math.max(0, z)] || 0; if (m / 16 > med * 0.8) { outro = q / 2; break; } } // energy drop = outro
    return { bpm: r.bpm, grid: r.grid, end: lastLoud, outro: outro, dur: buf.duration };
  }
  function anaOf(it) { return it.ana || cache[it.key] || null; }
  function setAna(it, a) { it.ana = a; if (it.libId && window.PFLIB) window.PFLIB.saveAnalysis(it.libId, a); else if (it.key) { cache[it.key] = a; saveCache(); } }
  var anaQ = [], anaBusy = false;
  function analyzeLater(it) { if (anaOf(it) || anaQ.indexOf(it) >= 0) return; anaQ.push(it); pump(); }
  function pump() {
    if (anaBusy || !anaQ.length) return;
    if (!P.ctx) return; // decoding needs the audio context (starts on first tap)
    anaBusy = true; var it = anaQ.shift(); A.analyzing = anaQ.length + 1; render();
    it.get().then(function (x) { return x instanceof AudioBuffer ? x : P.decode(x); }).then(function (buf) { setAna(it, analyzeBuf(buf, { bpm: it.bpm, grid: it.grid, bpmHint: it.bpmHint })); })
      .catch(function () { it.bad = true; }).then(function () { anaBusy = false; A.analyzing = anaQ.length; render(); setTimeout(pump, 50); });
  }
  P.on("ctx", function () { setTimeout(pump, 500); });

  /* ---------- queue ---------- */
  function add(it, quiet) {
    if (!it) return;
    if (!it.key) it.key = "x:" + it.name;
    if (A.queue.some(function (q) { return q.key === it.key; })) { if (!quiet) P.toast("Already in the Auto DJ queue."); return; }
    if (!it.ana && cache[it.key]) it.ana = cache[it.key];
    A.queue.push(it); analyzeLater(it);
    if (!quiet) P.toast("Auto DJ queue: + " + it.name);
    render();
  }
  function bpmOf(it) { var a = anaOf(it); return (a && a.bpm) || it.bpm || it.bpmHint || null; }
  function onDeckKeys() { return P.DECKS.map(function (d) { return d.item ? (d.item.key || (d.item.id ? "builtin:" + d.item.id : "")) : ""; }); }
  function pickNext() {
    if (!A.queue.length && A.loop && A.played.length) {             // loop the set: re-queue what has played (not what's on the decks)
      var busy = onDeckKeys(); A.queue = A.played.filter(function (it) { return busy.indexOf(it.key) < 0; }); A.played = A.played.filter(function (it) { return busy.indexOf(it.key) >= 0; });
    }
    if (!A.queue.length) return null;
    var k = 0;
    if (A.shuffle) k = Math.floor(Math.random() * A.queue.length);
    else if (A.order === "bpm" && A.cur && P.effBpm(A.cur)) {
      var ref = P.effBpm(A.cur), best = 1e9;
      A.queue.forEach(function (it, i) { var b = bpmOf(it); if (!b) return; var dd = Math.min(Math.abs(b - ref), Math.abs(b * 2 - ref), Math.abs(b / 2 - ref)); if (dd < best) { best = dd; k = i; } });
    }
    var it = A.queue.splice(k, 1)[0];
    A.played.push(it);
    return it;
  }
  function builtinItem(b) { return { name: b.name, sub: b.sub, bpm: b.bpm, grid: b.grid, key: "builtin:" + b.id, get: b.get }; }
  function builtins(quiet) { P.BUILTIN.forEach(function (b) { add(builtinItem(b), true); }); if (!quiet) P.toast("Queued his beats & demos"); }
  /* empty queue → fill it from what's in the crate: the library view if that tab is open and has tracks, plus any
     extra crates registered by other modules (PFAUTODJ.sources), else his beats & demos. Tracks already on a deck are skipped. */
  var SOURCES = [];
  function fillQueue() {
    var busy = onDeckKeys(), before = A.queue.length, items = [];
    if (P.libTab === "mylib" && window.PFLIB && window.PFLIB.L.tracks.length) items = window.PFLIB.L.tracks.map(window.PFLIB.item);
    if (!items.length) SOURCES.forEach(function (fn) { try { items = items.concat(fn() || []); } catch (e) { /* ignore */ } });
    if (!items.length) items = P.BUILTIN.map(builtinItem);
    items.forEach(function (it) { if (busy.indexOf(it.key) < 0) add(it, true); });
    if (!A.queue.length && busy.some(Boolean)) P.BUILTIN.forEach(function (b) { var it = builtinItem(b); if (busy.indexOf(it.key) < 0) add(it, true); });
    return A.queue.length - before;
  }

  /* ---------- engine ---------- */
  function side(d) { var s = d === P.DECKS[0] ? -1 : 1; return P.X.ham ? -s : s; }
  function setXf(v) { P.CTL.xf.set(v, true); }
  function eqLow(d, db) { var c = P.CTL[d.id + ".eqLow"]; if (c) c.set(db, true); }
  function loadNext(d) {
    var it = pickNext(); if (!it) return false;
    A.loadingNext = true; A.nextItem = it; A.prepped = null;
    var a = anaOf(it);
    var li = Object.assign({}, it); if (a && a.bpm) { li.bpm = a.bpm; li.grid = a.grid; }
    P.loadInto(d, li, true).then(function (ok) {
      A.loadingNext = false;
      if (!ok) { A.nextItem = null; P.toast("Auto DJ: couldn't load " + it.name + " — skipping"); return; }
      d.adItem = it; d.adLoaded = Date.now();
      if (!anaOf(it)) setTimeout(function () { if (d.buf) setAna(it, analyzeBuf(d.buf, { bpm: d.bpm, grid: d.grid, bpmHint: it.bpmHint })); render(); }, 400);
      render();
    });
    return true;
  }
  function prep(d) { // park the incoming deck on its first downbeat, bass cut if bass-swapping
    if (!d.buf || A.prepped === d.buf) return;
    var g = d.grid || 0; while (g < 0) g += 60 / (d.bpm || 120);
    d.pos = d.bpm ? g : 0; d.cue = d.pos; d.loop.on = false;
    eqLow(d, A.bassSwap ? -26 : 0); A.prepped = d.buf; P.ui(d);
  }
  function mixPoint(d) {
    var it = d.adItem, a = it && anaOf(it), dur = d.buf.duration, bar = d.bpm ? 240 / d.bpm : 8, len = A.bars * bar;
    var end = a && a.end ? Math.min(dur, a.end) : dur, outro = a && a.outro ? a.outro : end;
    var start = Math.min(end - len, Math.max(outro - len * 0.25, end - len * 1.5));
    if (d.bpm) start = d.grid + Math.floor((start - d.grid) / (bar * 4)) * bar * 4;  // 4-bar phrase boundary
    start = Math.max(Math.min(30, dur * 0.4), start);
    return { start: start, len: Math.max(4, Math.min(len, dur - start - 0.5)) };
  }
  function startMix(cur, inc) {
    A.inc = inc; A.phase = "mixing";
    var mp = mixPoint(cur), incLen = inc.buf ? (inc.buf.duration - inc.pos) * 0.45 * P.rate(cur) : mp.len;
    A.mix = { t0: P.pos(cur), len: Math.max(4, Math.min(mp.len, incLen, cur.buf.duration - P.pos(cur) - 0.3)), swapped: false, curLow: P.CTL[cur.id + ".eqLow"].get(), from: side(cur), to: side(inc) };
    if (cur.bpm && inc.bpm) { inc.sync = false; P.doSync(inc); }
    P.play(inc, true);
    P.toast("Auto DJ: mixing in " + inc.name + " over " + A.bars + " bars");
  }
  function finishMix() {
    var cur = A.cur, inc = A.inc;
    P.pause(cur, true); eqLow(cur, A.mix.curLow || 0); eqLow(inc, 0); setXf(side(inc));
    inc.sync = false; P.ui(inc);
    if (Math.abs(inc.pitch) > 0.05) A.glide = { d: inc, from: inc.pitch, t0: P.pos(inc), len: inc.bpm ? 8 * 240 / inc.bpm : 16 };
    A.cur = inc; A.inc = null; A.mix = null; A.phase = "playing"; A.prepped = null; cur.adItem = null;
    if (!loadNext(cur) && !A.queue.length) A.msg = "Last track — queue more to keep going";
    render();
  }
  function tick() {
    if (!A.on) return;
    var D = P.DECKS;
    if (A.phase !== "mixing" && (!A.cur || !A.cur.playing)) {                  // start / restart
      var playing = D.filter(function (d) { return d.playing; })[0];
      if (playing) { A.cur = playing; A.phase = "playing"; }
      else if (A.phase !== "starting") {
        if (A.loadingNext) return;                                           // next track still loading — wait for it
        var ready = D.filter(function (d) { return d.buf && d.adItem && !d.playing && d.pos < d.buf.duration - 1; })[0];
        if (ready) { prep(ready); eqLow(ready, 0); setXf(side(ready)); P.play(ready, true); A.cur = ready; A.phase = "playing"; A.prepped = null; render(); return; }
        var d0 = D[0], it = pickNext();
        if (!it && fillQueue()) it = pickNext();
        if (!it) { stop("Auto DJ: nothing to play — add tracks from your library or the crate."); return; }
        A.phase = "starting"; A.msg = "Loading " + it.name + "…"; renderStatus();
        var a = anaOf(it), li = Object.assign({}, it); if (a && a.bpm) { li.bpm = a.bpm; li.grid = a.grid; }
        P.loadInto(d0, li, true).then(function (ok) {
          if (!A.on) return;
          if (!ok) { A.phase = "idle"; A.cur = null; return; }
          d0.adItem = it; setXf(side(d0)); eqLow(d0, 0); P.play(d0, true); A.cur = d0; A.phase = "playing";
          if (!anaOf(it)) setTimeout(function () { if (d0.buf) setAna(it, analyzeBuf(d0.buf, { bpm: d0.bpm, grid: d0.grid })); }, 400);
          render();
        });
        return;
      } else return;
    }
    if (A.phase === "idle" || A.phase === "starting") A.phase = "playing";
    var cur = A.cur, idle = P.other(cur);
    if (A.phase === "playing") {
      if (!idle.playing && !A.loadingNext && (!idle.adItem || !idle.buf)) {
        if (!A.queue.length && !A.played.length) fillQueue();
        if (!loadNext(idle)) { A.msg = "Playing " + cur.name + " — queue is empty"; if (P.pos(cur) > cur.buf.duration - 1) stop("Auto DJ: end of the queue."); }
      }
      if (A.loadingNext && A.nextItem) A.msg = "Loading next: " + A.nextItem.name + "…";
      else if (idle.buf && idle.adItem && A.prepped !== idle.buf) A.msg = "Analyzing " + idle.name + "…";
      if (idle.buf && idle.adItem && !idle.playing && (idle.bpm || Date.now() - (idle.adLoaded || 0) > 3000)) prep(idle);
      if (A.glide) {
        var gl = A.glide, u = Math.min(1, (P.pos(gl.d) - gl.t0) / gl.len);
        P.setPitch(gl.d, gl.from * (1 - u)); if (u >= 1) A.glide = null;
      }
      if (cur.buf && idle.buf && idle.adItem && A.prepped === idle.buf) {
        var mp = mixPoint(cur);
        A.msg = "Next: " + idle.name + (idle.bpm ? " (" + Math.round(idle.bpm) + " BPM)" : "") + " · mixing in " + P.fmtTime(Math.max(0, (mp.start - P.pos(cur)) / P.rate(cur)));
        if (P.pos(cur) >= mp.start) { A.glide = null; startMix(cur, idle); }
      } else if (cur.buf && P.pos(cur) > cur.buf.duration - 0.3) { A.cur = null; }
    } else if (A.phase === "mixing") {
      var m = A.mix, inc = A.inc, uu = P.clamp((P.pos(cur) - m.t0) / m.len, 0, 1);
      if (!cur.playing) uu = 1;
      var sm = uu * uu * (3 - 2 * uu);
      setXf(m.from + (m.to - m.from) * sm);
      if (A.bassSwap && !m.swapped && uu >= 0.5) { m.swapped = true; eqLow(cur, -26); eqLow(inc, 0); }
      A.msg = "Mixing into " + inc.name + " · " + Math.round(uu * 100) + "%" + (A.bassSwap ? (m.swapped ? " · bass swapped" : " · bass swap at 50%") : "");
      if (uu >= 1) finishMix();
    }
    renderStatus();
  }
  var timer = null;
  function start() {
    P.ensureCtx();
    var added = A.queue.length ? 0 : fillQueue();
    A.on = true; A.paused = false; A.mix = null; A.inc = null;
    A.cur = P.DECKS.filter(function (d) { return d.playing; })[0] || null;
    A.phase = A.cur ? "playing" : "idle";
    A.msg = A.cur ? "Taking over from " + A.cur.name + "…" : "Starting…";
    if (!timer) timer = setInterval(tick, 80);
    tick(); pump(); render();
    P.toast("Auto DJ on" + (added ? " — queued " + added + " track" + (added === 1 ? "" : "s") + " from the crate" : "") + " · touch any deck, EQ or the crossfader to take over");
  }
  function stop(msg, pause) {
    var wasMixing = A.phase === "mixing";
    A.on = false; clearInterval(timer); timer = null;
    if (wasMixing && A.inc) { A.inc.sync = false; }
    if (A.prepped && !wasMixing) { var idle = A.cur ? P.other(A.cur) : null; if (idle && idle.buf === A.prepped && !idle.playing) eqLow(idle, 0); }
    A.phase = "idle"; A.mix = null; A.glide = null; A.prepped = null;
    A.paused = !!pause; A.msg = pause ? "Auto DJ paused — you have control" : "";
    render(); if (msg) P.toast(msg);
  }
  // manual takeover: any touch on the decks, mixer strips or crossfader (not the master knob, not the Auto DJ button)
  document.addEventListener("pointerdown", function (e) {
    if (!A.on || !e.isTrusted) return;
    var t = e.target;
    if (t.closest && t.closest(".console, .xfbar, .waves") && !t.closest("#autodj-btn, .master, .xf-play, #ad-live")) stop("Auto DJ paused — you've got the controls (tap Resume to hand back)", true);
  }, true);
  P.on("manual", function () { if (A.on) stop("Auto DJ paused — you've got the controls (tap Resume to hand back)", true); });

  /* ---------- UI ---------- */
  function renderStatus() {
    var b = $("autodj-btn"); if (b) { b.classList.toggle("on", A.on); b.textContent = A.on ? "AUTO DJ ●" : "AUTO DJ"; }
    var lv = $("ad-live");
    if (lv) {
      lv.hidden = !A.on && !A.paused;
      $("ad-live-msg").textContent = A.on ? "Auto DJ · " + (A.msg || "Running…") + (A.analyzing && !/Analyzing/.test(A.msg) ? " · analysing " + A.analyzing + "…" : "") : A.msg;
      $("ad-resume").hidden = A.on || !A.paused;
      $("ad-live").classList.toggle("paused", !A.on && A.paused);
    }
    var st = $("ad-status"); if (st) st.textContent = A.on ? (A.msg || "Running…") + (A.analyzing ? " · analysing " + A.analyzing + "…" : "") : (A.analyzing ? "Analysing BPM / outros: " + A.analyzing + " left" : "Off");
  }
  function render() {
    renderStatus();
    if (P.libTab !== "autodj") return;
    var box = $("ad-queue"); if (!box) return;
    box.innerHTML = "";
    if (!A.queue.length) box.innerHTML = '<p class="empty">Queue is empty. Add tracks with “+ Auto DJ” in My Library, “Queue shown”, or add his beats &amp; demos.</p>';
    A.queue.forEach(function (it, i) {
      var r = document.createElement("div"); r.className = "lib-row ad-row";
      var a = anaOf(it), bpm = bpmOf(it);
      r.innerHTML = '<span class="ad-n mono">' + (i + 1) + '</span><div class="lib-main"><strong></strong><span class="mono"></span></div><div class="lib-acts"><button type="button" class="btn small up" aria-label="Move up">↑</button><button type="button" class="btn small dn" aria-label="Move down">↓</button><button type="button" class="btn small rm" aria-label="Remove">✕</button></div>';
      r.querySelector("strong").textContent = it.name;
      r.querySelector(".mono:not(.ad-n)").textContent = (bpm ? (Math.round(bpm * 10) / 10) + " BPM" : it.bad ? "couldn't analyse" : "analysing…") + (a && a.dur ? " · " + P.fmtTime(a.dur) : "") + (a && a.outro ? " · outro ≈ " + P.fmtTime(a.outro) : "");
      r.querySelector(".up").onclick = function () { if (i > 0) { A.queue.splice(i - 1, 0, A.queue.splice(i, 1)[0]); render(); } };
      r.querySelector(".dn").onclick = function () { if (i < A.queue.length - 1) { A.queue.splice(i + 1, 0, A.queue.splice(i, 1)[0]); render(); } };
      r.querySelector(".rm").onclick = function () { A.queue.splice(i, 1); render(); };
      box.appendChild(r);
    });
  }
  function tab(list) {
    list.innerHTML = '<div class="ad-bar"><button type="button" class="btn small" id="ad-start"></button>' +
      '<label class="ad-set">Transition <select id="ad-bars" class="btn small"><option value="4">4 bars</option><option value="8">8 bars</option><option value="16">16 bars</option><option value="32">32 bars</option></select></label>' +
      '<label class="ad-set">Order <select id="ad-order" class="btn small"><option value="queue">Queue order</option><option value="bpm">Similar BPM</option></select></label>' +
      '<button type="button" class="pill small" id="ad-shuffle">SHUFFLE</button><button type="button" class="pill small" id="ad-bass">BASS SWAP</button>' +
      '<button type="button" class="btn small" id="ad-builtins">+ His beats &amp; demos</button><button type="button" class="btn small ghost" id="ad-clear">Clear</button></div>' +
      '<p class="ad-status mono" id="ad-status"></p><div id="ad-queue" class="lib-list"></div>' +
      '<p class="lib-note">Auto DJ detects each track\'s BPM, beat grid and outro (cached), syncs the next track, starts the blend ' + '<b>N bars</b> before the music ends (on a 4-bar phrase), crossfades with a bass swap halfway, then glides the tempo back to the track\'s own BPM. Touch any deck, EQ, fader or the crossfader to take over.</p>';
    var sb = $("ad-start"); sb.textContent = A.on ? "■ Stop Auto DJ" : "▶ Start Auto DJ"; sb.onclick = function () { if (A.on) stop("Auto DJ off"); else start(); tab(list); };
    $("ad-bars").value = String(A.bars); $("ad-bars").onchange = function () { A.bars = +$("ad-bars").value; save(); };
    $("ad-order").value = A.order; $("ad-order").onchange = function () { A.order = $("ad-order").value; save(); };
    var sh = $("ad-shuffle"); sh.classList.toggle("on", A.shuffle); sh.onclick = function () { A.shuffle = !A.shuffle; sh.classList.toggle("on", A.shuffle); save(); };
    var bs = $("ad-bass"); bs.classList.toggle("on", A.bassSwap); bs.onclick = function () { A.bassSwap = !A.bassSwap; bs.classList.toggle("on", A.bassSwap); save(); };
    $("ad-builtins").onclick = function () { builtins(); render(); };
    $("ad-clear").onclick = function () { A.queue = []; render(); };
    render();
  }
  P.LIBTABS.autodj = tab;
  var btn = $("autodj-btn");
  if (btn) btn.addEventListener("click", function () { if (A.on) stop("Auto DJ off"); else { start(); } if (P.libTab === "autodj") P.showLib("autodj"); });
  var rs = $("ad-resume"); if (rs) rs.addEventListener("click", function () { start(); });
  var rx = $("ad-live-x"); if (rx) rx.addEventListener("click", function () { if (A.on) stop("Auto DJ off"); else { A.paused = false; A.msg = ""; renderStatus(); } });
  renderStatus();
  window.PFAUTODJ = { A: A, add: add, fillQueue: fillQueue, sources: SOURCES, start: start, stop: stop, analyzeBuf: analyzeBuf, mixPoint: mixPoint, builtins: builtins,
    info: function () { return { on: A.on, phase: A.phase, queue: A.queue.map(function (q) { return { name: q.name, bpm: bpmOf(q), ana: anaOf(q) }; }), cur: A.cur && A.cur.id, inc: A.inc && A.inc.id, msg: A.msg, bars: A.bars, mix: A.mix }; } };
})();
