/* DJ Psycho Fingers — pro DJ hardware (v20261022l).
 * Web MIDI controllers (auto-detect + built-in maps in dj-hw-maps.js, MIDI Learn), LED feedback, MIDI clock out,
 * Audio panel: output device (AudioContext.setSinkId), headphone cue split (4-ch interface: master 1/2, cue 3/4;
 * otherwise mono split: master left, cue right), raw mic input picker.
 * Nothing here is saved: Learn mappings and settings last for this session only. */
(function () {
  "use strict";
  var P = window.PFDJ; if (!P) return;
  var MAPS = window.PFDJ_HWMAPS || {};
  // Pioneer DDJ pro boards (1000 / REV1 / SX3) use the same deck layout as the FLX4/400 family in their MIDI mode.
  if (MAPS["ddj-flx4"]) { MAPS["ddj-pro"] = { match: "DDJ-(1000|REV1|SX3|SX2|800|FLX6)", map: MAPS["ddj-flx4"].map, approx: true }; }
  var H = { acc: null, ins: [], outs: [], map: null, mapId: "", learn: null, L: {}, clock: null, clockOut: "", log: [], cueOn: { A: false, B: false }, cueMode: "off", sysex: false };
  var $ = function (id) { return document.getElementById(id); };
  var ROLES = [];
  ["A", "B"].forEach(function (d) { ["play", "cue", "sync", "tempo", "vol", "trim", "eqLow", "eqMid", "eqHigh", "filter", "jog", "jogTouch", "load", "hot1", "hot2", "hot3", "hot4", "hot5", "hot6", "hot7", "hot8"].forEach(function (r) { ROLES.push(d + "." + r); }); });
  ["M.xf", "M.browse", "S.smp1", "S.smp2", "S.smp3", "S.smp4", "S.smp5", "S.smp6", "S.smp7", "S.smp8", "S.stopLoops"].forEach(function (r) { ROLES.push(r); });
  function keyOf(st, d1) { var t = st >> 4, ch = st & 15; return (t === 9 || t === 8 ? "n" : t === 11 ? "c" : "x") + ch + ":" + d1; }
  function lookup(k) {
    var out = [];
    Object.keys(H.L).forEach(function (r) { if (H.L[r] === k) out.push(r); });
    if (!out.length && H.map) Object.keys(H.map.map).forEach(function (r) { if (H.map.map[r].indexOf(k) >= 0) out.push(r); });
    return out;
  }
  function ctlSet(name, f) { var c = P.CTL[name]; if (!c) return; var mn = +c.el.getAttribute("aria-valuemin"), mx = +c.el.getAttribute("aria-valuemax"); c.set(mn + f * (mx - mn), true); }
  function jogTicks(v) { return H.map && /ddj/.test(H.mapId) ? v - 64 : v < 64 ? v : v - 128; }
  var lib = { i: -1 };
  function browse(n) {
    var rows = document.querySelectorAll(".lib-row"); if (!rows.length) { P.showLib && P.showLib(); return; }
    lib.i = Math.max(0, Math.min(rows.length - 1, lib.i + n));
    rows.forEach(function (r, j) { r.classList.toggle("hw-sel", j === lib.i); }); rows[lib.i].scrollIntoView({ block: "nearest" });
  }
  function act(role, val, isNote, on) {
    var p = role.split("."), dk = p[0], r = p[1], d = P.BY[dk], f = val / 127;
    if (dk === "S") {
      var S = window.PFSAMPLER; if (!S) return;
      if (r === "stopLoops") { if (on) S.stopLoops(); return; }
      S.fire(S.S.bank + (+r.slice(3) - 1), on); return;   // SFX pad on the current bank: loop + stutter behave as on screen
    }
    if (dk === "M") { if (r === "xf") ctlSet("xf", f); else if (r === "browse") { if (isNote) return; browse(jogTicks(val) > 0 ? 1 : -1); } return; }
    if (!d) return;
    switch (r) {
      case "play": if (on) P.toggle(d); break;
      case "cue": if (on) P.cue(d); break;
      case "sync": if (on) P.doSync(d); break;
      case "tempo": ctlSet(dk + ".pitch", f); break;
      case "vol": ctlSet(dk + ".vol", f); break;
      case "trim": ctlSet(dk + ".trim", f); break;
      case "eqLow": case "eqMid": case "eqHigh": ctlSet(dk + "." + r, f); break;
      case "filter": ctlSet(dk + ".filter", f); break;
      case "jogTouch": P.jogTouch(d, on); break;
      case "jog": P.jogTurn(d, jogTicks(val)); break;
      case "load": if (on) { var rows = document.querySelectorAll(".lib-row"), row = rows[lib.i]; if (row) { var b = row.querySelector(dk === "A" ? ".to-a" : ".to-b"); if (b) b.click(); } } break;
      default: if (/^hot[1-8]$/.test(r) && on) P.hotCue(d, +r.slice(3) - 1);
    }
  }
  function onMsg(e) {
    var a = e.data; if (!a || a.length < 2) return;
    var st = a[0], t = st >> 4; if (st >= 0xF0) return;
    var v = a.length > 2 ? a[2] : 0, isNote = t === 8 || t === 9, on = t === 9 && v > 0, k = keyOf(st, a[1]);
    H.last = k; H.log.unshift(k + " = " + v); H.log.length = Math.min(H.log.length, 6);
    if (H.learn) { if (isNote && !on) return; H.L[H.learn] = k; P.toast("Learned " + H.learn + " → " + k + " (this session)"); H.learn = null; paint(); return; }
    lookup(k).forEach(function (r) { act(r, v, isNote, isNote ? on : true); });
    if ($("hw-log")) $("hw-log").textContent = H.log.join("  ·  ");
  }
  function detect() {
    H.map = null; H.mapId = "";
    H.ins.forEach(function (i) { if (H.map) return; var nm = (i.name || "") + " " + (i.manufacturer || ""); Object.keys(MAPS).some(function (id) { if (new RegExp(MAPS[id].match, "i").test(nm)) { H.map = MAPS[id]; H.mapId = id; return true; } return false; }); });
  }
  function refresh() {
    if (!H.acc) return;
    H.ins = []; H.outs = [];
    H.acc.inputs.forEach(function (i) { H.ins.push(i); i.onmidimessage = onMsg; });
    H.acc.outputs.forEach(function (o) { H.outs.push(o); });
    detect(); paint();
  }
  function connect() {
    if (!navigator.requestMIDIAccess) { P.toast("This browser has no Web MIDI. Use Chrome on Android/desktop."); paint(); return; }
    navigator.requestMIDIAccess({ sysex: H.sysex }).then(function (acc) { H.acc = acc; acc.onstatechange = refresh; refresh(); P.toast(H.ins.length ? "MIDI ready: " + H.ins.map(function (i) { return i.name; }).join(", ") : "MIDI ready — plug in a controller"); })
      .catch(function (e) { P.toast("MIDI not allowed (" + (e && e.message || e) + ")"); });
  }
  /* ---- LED feedback: echo note-on 127/0 to the same note on every output (Pioneer / Hercules / Numark convention) ---- */
  var ledState = {};
  function leds() {
    if (!H.outs.length) return;
    var want = {};
    ["A", "B"].forEach(function (dk) { var d = P.BY[dk]; if (!d) return;
      want[dk + ".play"] = !!d.playing; want[dk + ".cue"] = !!d.buf && !d.playing; want[dk + ".sync"] = !!d.sync;
      for (var i = 1; i <= 8; i++) want[dk + ".hot" + i] = d.hot && d.hot[i - 1] != null; });
    var S = window.PFSAMPLER; if (S) for (var j = 1; j <= 8; j++) { var p = S.S.pads[S.S.bank + (j - 1)]; want["S.smp" + j] = !!(p && (p.lv || p.shots.length || p.voice)); }
    Object.keys(want).forEach(function (r) {
      if (ledState[r] === want[r]) return; ledState[r] = want[r];
      var ks = H.L[r] ? [H.L[r]] : H.map && H.map.map[r] ? H.map.map[r].slice(0, 1) : [];
      ks.forEach(function (k) { if (k[0] !== "n") return; var m = /^n(\d+):(\d+)$/.exec(k); H.outs.forEach(function (o) { try { o.send([0x90 | +m[1], +m[2], want[r] ? 0x7F : 0]); } catch (e) { /* ignore */ } }); });
    });
  }
  setInterval(leds, 120);
  /* ---- MIDI clock out: 24 ppq from the deck you're hearing ---- */
  function clockBpm() { var g = P.xfGains(), best = null; P.DECKS.forEach(function (d, j) { if (d.playing && d.bpm && (!best || g[j] > best.w)) best = { b: P.effBpm ? P.effBpm(d) : d.bpm, w: g[j] }; }); return best ? best.b : 0; }
  function clockStart() {
    var o = H.outs.filter(function (x) { return x.id === H.clockOut; })[0] || H.outs[0]; if (!o) { P.toast("No MIDI output for clock."); return; }
    clockStop(); var c = H.clock = { o: o, next: performance.now() + 50, run: false };
    c.iv = setInterval(function () {
      var bpm = clockBpm(), now = performance.now();
      if (!bpm) { if (c.run) { o.send([0xFC]); c.run = false; } c.next = now + 50; return; }
      if (!c.run) { o.send([0xFA]); c.run = true; c.next = now + 5; }
      var step = 60000 / bpm / 24;
      while (c.next < now + 60) { o.send([0xF8], c.next); c.next += step; }
    }, 25);
    paint();
  }
  function clockStop() { if (H.clock) { clearInterval(H.clock.iv); try { H.clock.o.send([0xFC]); } catch (e) { /* ignore */ } H.clock = null; } paint(); }
  /* ---- audio: output device + cue split ---- */
  var A = {};
  function cueBuild(mode) {
    var ctx = P.ensureCtx(), M = P.M; if (!ctx || !M) return;
    if (A.m) { try { M.clip.disconnect(A.sp); } catch (e) { /* ignore */ } A.m.disconnect(); P.DECKS.forEach(function (d) { if (d.n && d.n.cue) { d.n.filt.disconnect(d.n.cue); d.n.cue.disconnect(); d.n.cue = null; } }); A.m = null; try { M.clip.connect(ctx.destination); } catch (e) { /* ignore */ } }
    H.cueMode = mode; if (mode === "off") { paint(); return; }
    var four = mode === "4ch";
    if (four) { ctx.destination.channelCount = 4; ctx.destination.channelCountMode = "explicit"; ctx.destination.channelInterpretation = "discrete"; }
    try { M.clip.disconnect(ctx.destination); } catch (e) { /* ignore */ }
    A.sp = ctx.createChannelSplitter(2); A.m = ctx.createChannelMerger(four ? 4 : 2); A.cue = ctx.createGain(); A.cue.channelCount = 1; A.cue.channelCountMode = "explicit";
    M.clip.connect(A.sp);
    if (four) { A.sp.connect(A.m, 0, 0); A.sp.connect(A.m, 1, 1); A.cue.connect(A.m, 0, 2); A.cue.connect(A.m, 0, 3); }
    else { var mono = ctx.createGain(); mono.channelCount = 1; mono.channelCountMode = "explicit"; M.clip.connect(mono); mono.connect(A.m, 0, 0); A.cue.connect(A.m, 0, 1); A.sp.disconnect(); }
    A.m.connect(ctx.destination);
    P.DECKS.forEach(function (d) { if (!d.n) return; d.n.cue = ctx.createGain(); d.n.cue.gain.value = H.cueOn[d.id] ? 1 : 0; d.n.filt.connect(d.n.cue); d.n.cue.connect(A.cue); });
    paint();
  }
  function setCue(dk, on) { H.cueOn[dk] = on; var d = P.BY[dk]; if (d && d.n && d.n.cue) d.n.cue.gain.setTargetAtTime(on ? 1 : 0, P.ctx.currentTime, 0.01); paint(); }
  function devices() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return Promise.resolve([]);
    return navigator.mediaDevices.enumerateDevices().catch(function () { return []; });
  }
  function fillDevs() {
    devices().then(function (ds) {
      var o = $("hw-out"), i = $("hw-in"); if (!o) return;
      o.innerHTML = '<option value="">System default</option>'; i.innerHTML = '<option value="">Default mic</option>';
      ds.forEach(function (d) { var op = document.createElement("option"); op.value = d.deviceId; op.textContent = d.label || d.kind + " " + d.deviceId.slice(0, 6); if (d.kind === "audiooutput") o.appendChild(op); else if (d.kind === "audioinput") i.appendChild(op); });
      o.value = A.sink || ""; i.value = window.PFDJ_MICDEV || "";
      var ctx = P.ctx; $("hw-ch").textContent = ctx ? "Output channels available: " + ctx.destination.maxChannelCount + (ctx.destination.maxChannelCount >= 4 ? " — 4-channel cue split available" : " — use mono split for headphone cue") : "";
    });
  }
  /* ---- UI ---- */
  function build() {
    var w = document.createElement("section"); w.id = "hw-panel"; w.className = "hw-panel"; w.hidden = true; w.setAttribute("aria-label", "DJ hardware");
    w.innerHTML = '<div class="hw-head"><h2>🎛 Hardware</h2><button type="button" class="btn small" id="hw-close">✕</button></div>' +
      '<div class="hw-sec"><h3>MIDI controller</h3><div class="hw-row"><button type="button" class="btn small" id="hw-connect">Connect MIDI</button><label><input type="checkbox" id="hw-sysex"> allow SysEx</label></div>' +
      '<p class="hw-st mono" id="hw-st">Not connected</p>' +
      '<div class="hw-row"><select id="hw-role" class="btn small" aria-label="Control to learn"></select><button type="button" class="btn small" id="hw-learn">MIDI Learn</button><button type="button" class="btn small ghost" id="hw-unlearn">Clear learned</button></div>' +
      '<p class="hw-log mono" id="hw-log"></p></div>' +
      '<div class="hw-sec"><h3>MIDI clock out</h3><div class="hw-row"><select id="hw-clkout" class="btn small" aria-label="Clock output"></select><button type="button" class="btn small" id="hw-clock">Start clock</button></div></div>' +
      '<div class="hw-sec"><h3>Audio</h3><label class="hw-row">Output <select id="hw-out" class="btn small"></select></label>' +
      '<p class="hw-st mono" id="hw-ch"></p>' +
      '<div class="hw-row">Headphone cue <select id="hw-cuemode" class="btn small"><option value="off">Off</option><option value="4ch">4-ch: master 1/2, cue 3/4</option><option value="mono">Mono split: master L, cue R</option></select>' +
      '<button type="button" class="pill small" id="hw-cueA">CUE A</button><button type="button" class="pill small" id="hw-cueB">CUE B</button></div>' +
      '<label class="hw-row">Mic input <select id="hw-in" class="btn small"></select><label><input type="checkbox" id="hw-raw" checked> raw (no echo cancel / noise / auto gain)</label></label></div>' +
      '<p class="hw-note">Settings and learned controls last for this session only. Not possible in a browser: Pro DJ Link / CDJ networking, timecode vinyl, HID-only controllers (e.g. Traktor S2/S4 MK3).</p>';
    document.body.appendChild(w);
    var rs = $("hw-role"); ROLES.forEach(function (r) { var o = document.createElement("option"); o.value = r; o.textContent = r.replace(/^S\./, "Pad ").replace(/^M\./, "Mixer "); rs.appendChild(o); });
    $("hw-close").onclick = function () { w.hidden = true; };
    $("hw-connect").onclick = connect;
    $("hw-sysex").onchange = function (e) { H.sysex = e.target.checked; if (H.acc) connect(); };
    $("hw-learn").onclick = function () { if (!H.acc) { connect(); } H.learn = rs.value; paint(); P.toast("Move or press the control for " + H.learn); };
    $("hw-unlearn").onclick = function () { H.L = {}; paint(); };
    $("hw-clock").onclick = function () { if (H.clock) clockStop(); else clockStart(); };
    $("hw-clkout").onchange = function (e) { H.clockOut = e.target.value; if (H.clock) clockStart(); };
    $("hw-out").onchange = function (e) { var ctx = P.ensureCtx(); A.sink = e.target.value; if (ctx && ctx.setSinkId) ctx.setSinkId(A.sink).then(fillDevs).catch(function (er) { P.toast("Couldn't switch output: " + (er && er.message || er)); }); else P.toast("This browser can't pick an output device (needs Chrome 110+)."); };
    $("hw-cuemode").onchange = function (e) { cueBuild(e.target.value); };
    $("hw-cueA").onclick = function () { setCue("A", !H.cueOn.A); }; $("hw-cueB").onclick = function () { setCue("B", !H.cueOn.B); };
    $("hw-in").onchange = function (e) { window.PFDJ_MICDEV = e.target.value; P.toast("Mic input set — restart the mic to use it"); };
    $("hw-raw").onchange = function (e) { window.PFDJ_MICRAW = e.target.checked; }; window.PFDJ_MICRAW = true;
    var qb = document.querySelector(".quickbar, #quickbar, .qbar");
    var btn = document.createElement("button"); btn.type = "button"; btn.className = "qb"; btn.id = "qb-hw"; btn.textContent = "🎛 Hardware";
    btn.onclick = function () { w.hidden = !w.hidden; if (!w.hidden) { fillDevs(); paint(); w.scrollIntoView({ block: "start" }); } };
    var pads = $("qb-pads"); if (pads && pads.parentNode) pads.parentNode.insertBefore(btn, pads.nextSibling); else if (qb) qb.appendChild(btn); else w.before(btn);
    paint();
  }
  function paint() {
    var st = $("hw-st"); if (!st) return;
    st.textContent = !H.acc ? (navigator.requestMIDIAccess ? "Not connected — tap Connect MIDI" : "Web MIDI not available in this browser") :
      (H.ins.length ? H.ins.map(function (i) { return i.name; }).join(", ") : "No controller found") + (H.mapId ? " · map: " + H.mapId + (H.map.approx ? " (shared Pioneer layout — use Learn for anything off)" : "") : H.ins.length ? " · no built-in map: use MIDI Learn" : "") +
      (Object.keys(H.L).length ? " · learned " + Object.keys(H.L).length : "");
    $("hw-learn").classList.toggle("on", !!H.learn); $("hw-learn").textContent = H.learn ? "Waiting… " + H.learn : "MIDI Learn";
    var co = $("hw-clkout"); co.innerHTML = ""; H.outs.forEach(function (o) { var op = document.createElement("option"); op.value = o.id; op.textContent = o.name; co.appendChild(op); }); if (H.clockOut) co.value = H.clockOut;
    $("hw-clock").textContent = H.clock ? "Stop clock" : "Start clock"; $("hw-clock").classList.toggle("on", !!H.clock);
    $("hw-cuemode").value = H.cueMode; $("hw-cueA").classList.toggle("on", H.cueOn.A); $("hw-cueB").classList.toggle("on", H.cueOn.B);
  }
  build();
  window.PFHW = { H: H, connect: connect, onMsg: onMsg, act: act, cueBuild: cueBuild, setCue: setCue, clockStart: clockStart, clockStop: clockStop, MAPS: MAPS };
})();
