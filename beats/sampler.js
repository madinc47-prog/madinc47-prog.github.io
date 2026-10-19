/* Island Pin Beats — pad assignments (sampler.js).
 * Every existing drum pad can BE another sound (Replace) or carry it alongside its drum (Layer):
 * kit drum (another pad of the kit) · Keys/melodic note · sample/vocal (upload, RAW mic, built-in
 * synth one-shots, current-loop chop) · song/pattern SWITCH pad · empty. Assignments are keyed by
 * pad position (not kit), persist on-device (settings in localStorage + the session save, audio
 * blobs in IndexedDB "ipb-padassign-v1"), and survive kit switches until cleared. Sequencer steps
 * fire the assigned sound through app.js playPadInto; switch pads never sound. */
(function () {
  "use strict";
  var LS = "ipb_padassign_v1", N = 16;
  var assign = new Array(N).fill(null), bufs = new Array(N).fill(null);
  var padMode = "sounds", sel = 0, voices = [];
  var NOTES = []; for (var m = 0; m < 128; m++) NOTES[m] = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"][m % 12] + (Math.floor(m / 12) - 1);
  function $(id) { return document.getElementById(id); }
  function B() { return window.IPBBeats; }
  function td(m) { if (window.__ipbTD && window.__ipbTD.log) window.__ipbTD.log("Sampler " + m); }
  function toast(m) { if (B() && B().padBridge) B().padBridge.toast(m); }

  /* ---------- persistence ---------- */
  function pack() { return { v: 1, mode: padMode, pads: assign.map(function (a) { return a ? JSON.parse(JSON.stringify(a)) : null; }) }; }
  function save() { try { localStorage.setItem(LS, JSON.stringify(pack())); } catch (e) { /* private */ } }
  function loadSettings() {
    var d = null; try { d = JSON.parse(localStorage.getItem(LS) || "null"); } catch (e) { /* ignore */ }
    if (!d && window.__ipbPadAssignSaved) d = window.__ipbPadAssignSaved;
    if (d && Array.isArray(d.pads)) d.pads.forEach(function (a, i) { if (i < N && a && a.type) assign[i] = a; });
    if (d && (d.mode === "songs" || d.mode === "sounds")) padMode = d.mode;
  }
  function idb(mode, fn) {
    return new Promise(function (res, rej) {
      var r = indexedDB.open("ipb-padassign-v1", 1);
      r.onupgradeneeded = function () { if (!r.result.objectStoreNames.contains("samp")) r.result.createObjectStore("samp"); };
      r.onsuccess = function () {
        var tx = r.result.transaction("samp", mode);
        tx.oncomplete = function () { r.result.close(); res(); };
        tx.onerror = function () { rej(tx.error); };
        fn(tx.objectStore("samp"));
      };
      r.onerror = function () { rej(r.error); };
    });
  }
  function idbGet(i) {
    return new Promise(function (res) {
      var r = indexedDB.open("ipb-padassign-v1", 1);
      r.onupgradeneeded = function () { if (!r.result.objectStoreNames.contains("samp")) r.result.createObjectStore("samp"); };
      r.onsuccess = function () {
        var rq = r.result.transaction("samp", "readonly").objectStore("samp").get(i);
        rq.onsuccess = function () { r.result.close(); res(rq.result || null); };
        rq.onerror = function () { res(null); };
      };
      r.onerror = function () { res(null); };
    });
  }

  /* ---------- audio helpers ---------- */
  function wavBlob(L, R, sr) {
    var n = L.length, buf = new ArrayBuffer(44 + n * 4), v = new DataView(buf);
    function ws(o, s) { for (var i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); }
    ws(0, "RIFF"); v.setUint32(4, 36 + n * 4, true); ws(8, "WAVEfmt "); v.setUint32(16, 16, true);
    v.setUint16(20, 1, true); v.setUint16(22, 2, true); v.setUint32(24, sr, true); v.setUint32(28, sr * 4, true);
    v.setUint16(32, 4, true); v.setUint16(34, 16, true); ws(36, "data"); v.setUint32(40, n * 4, true);
    for (var i = 0; i < n; i++) {
      v.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i])) * 32767, true);
      v.setInt16(46 + i * 4, Math.max(-1, Math.min(1, (R || L)[i])) * 32767, true);
    }
    return new Blob([buf], { type: "audio/wav" });
  }
  function decode(blob) {
    return blob.arrayBuffer().then(function (ab) {
      var c = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 1, 44100);
      return c.decodeAudioData(ab);
    });
  }
  function setSample(i, blob, name, kind) {
    return decode(blob).then(function (b) {
      bufs[i] = b;
      var a = assign[i] && assign[i].type === "sample" ? assign[i] : { type: "sample", mode: "replace", vol: 100, pitch: 0, tstart: 0, tend: 100, loop: false, choke: false };
      a.type = "sample"; a.name = name; a.on = true; if (!a.mode) a.mode = "replace";
      assign[i] = a;
      save(); refresh();
      td("pad " + (i + 1) + " sample added: " + name + " (" + kind + ", RAW)");
      toast("Pad " + (i + 1) + ": sample “" + name + "” loaded" + (a.mode === "layer" ? " (layered with the drum)" : ""));
      return idb("readwrite", function (st) { st.put({ blob: blob, name: name }, i); }).catch(function () {});
    });
  }

  /* ---------- playback (called from app.js playPadInto, live + offline bounce) ---------- */
  function get(i) {
    var a = assign[i];
    if (!a || a.on === false) return null;
    if (a.type === "drum") return a.drum != null && a.drum !== i ? a : null;
    return a;
  }
  function playBuf(c, dest, i, when, o) {
    var a = assign[i], b = bufs[i];
    if (!a || !b || !dest) return false;
    var start = (a.tstart || 0) / 100 * b.duration, end = (a.tend == null ? 100 : a.tend) / 100 * b.duration;
    if (end <= start + 0.02) end = b.duration;
    var src = c.createBufferSource(); src.buffer = b;
    src.playbackRate.value = Math.pow(2, (a.pitch || 0) / 12);
    if (a.loop) { src.loop = true; src.loopStart = start; src.loopEnd = end; }
    var g = c.createGain(), vel = o && o.vel != null ? o.vel : 0.8;
    g.gain.value = Math.min(1.4, (a.vol == null ? 100 : a.vol) / 100 * Math.pow(vel / 0.8, 1.5));
    src.connect(g); g.connect(dest);
    src.start(when, start, a.loop ? undefined : (end - start));
    if (window.__ipbTD && B() && B().master && B().master.ctx && c === B().master.ctx()) {
      window.__ipbTD.log("pad " + (i + 1) + " sample play: " + (a.name || "") + " pitch " + (a.pitch || 0) + "st vol " + (a.vol == null ? 100 : a.vol) + "%");
      var v = { pad: i, src: src, g: g, choke: !!a.choke };
      voices.push(v);
      src.onended = function () { var k = voices.indexOf(v); if (k >= 0) voices.splice(k, 1); };
      if (a.choke) voices.slice(0, -1).forEach(function (w) { if (w.choke) try { w.g.gain.setTargetAtTime(0, c.currentTime, 0.008); w.src.stop(c.currentTime + 0.05); } catch (e) { /* stopped */ } });
      while (voices.length > 16) { var old = voices.shift(); try { old.src.stop(); } catch (e) { /* stopped */ } } // voice cap: steal oldest
    }
    return true;
  }

  /* ---------- switch pads ---------- */
  function doSwitch(i) {
    var a = assign[i], br = B() && B().padBridge; if (!a || !br) return;
    var el = document.querySelectorAll("#pads .pad")[i];
    function fire() {
      if (el) el.classList.remove("switch-arm");
      if (a.swkind === "pattern") { br.switchSlot(a.swtarget || "B"); td("pad " + (i + 1) + " SWITCH -> pattern " + (a.swtarget || "B")); }
      else if (a.swkind === "piano") { br.pianoSwitch(a.swtarget || "B"); td("pad " + (i + 1) + " SWITCH -> piano pattern " + (a.swtarget || "B")); }
      else if (a.swkind === "section") { br.section(+(a.swtarget || 0)); td("pad " + (i + 1) + " SWITCH -> section " + (+(a.swtarget || 0) + 1)); }
      else if (a.swkind === "song") {
        var was = br.playing();
        Promise.resolve(br.applySong(a.swtarget)).then(function () { if (was && !br.playing()) br.play(); });
        td("pad " + (i + 1) + " SWITCH -> song " + a.swtarget);
      }
      if (el) { el.classList.add("switch-fire"); setTimeout(function () { el.classList.remove("switch-fire"); }, 450); }
    }
    if (a.swwhen === "bar" && br.playing()) {
      var ms = br.barMs(), steps = br.posSteps() % 16, wait = Math.max(40, (16 - steps) / 16 * ms);
      if (el) el.classList.add("switch-arm");
      td("pad " + (i + 1) + " switch armed, fires at bar end in ~" + Math.round(wait) + "ms");
      setTimeout(fire, wait);
    } else fire();
  }
  function tapSwitch(i) {
    var a = assign[i];
    if (!a || a.type !== "switch" || a.on === false) return false;
    if (padMode === "songs") doSwitch(i);
    else toast("Switch pad — set Pad mode to “Songs” (top of the pads) to fire it. In Sounds mode it stays silent on purpose.");
    return true;
  }

  /* ---------- pad faces ---------- */
  var TYPE_META = { drum: ["🥁", "pa-drum"], mel: ["🎹", "pa-mel"], sample: ["🎤", "pa-sample"], switch: ["🔀", "pa-switch"], empty: ["✖", "pa-empty"] };
  function asgLabel(a, i) {
    if (!a) return "";
    if (a.type === "drum") { var kp = B() && B().padBridge ? B().padBridge.kitPads() : []; return "Kit drum: " + (kp[a.drum] || "pad " + ((a.drum || 0) + 1)); }
    if (a.type === "mel") { var ins = (window.IPBKeys && IPBKeys.BY_ID[a.inst]) || {}; return (ins.name || a.inst || "Keys") + " " + NOTES[a.note || 60]; }
    if (a.type === "sample") return a.name || "Sample";
    if (a.type === "switch") return "SWITCH → " + swLabel(a);
    return "Empty";
  }
  function swLabel(a) {
    if (a.swkind === "pattern") return "Pattern " + (a.swtarget || "B");
    if (a.swkind === "piano") return "Piano " + (a.swtarget || "B");
    if (a.swkind === "song") return "Song";
    var secs = B() && B().padBridge ? B().padBridge.sections() : [];
    var s = secs[+(a.swtarget || 0)]; return s ? s.label : "Section";
  }
  function decorate(els) {
    els = els || document.querySelectorAll("#pads .pad");
    Array.prototype.forEach.call(els, function (el, i) {
      el.classList.remove("pa-drum", "pa-mel", "pa-sample", "pa-switch", "pa-empty");
      var old = el.querySelector(".pasg"); if (old) old.remove();
      var a = assign[i]; if (!a || a.on === false || (a.type === "drum" && (a.drum == null || a.drum === i))) return;
      el.classList.add(TYPE_META[a.type][1]);
      var s = document.createElement("span"); s.className = "pasg";
      s.textContent = TYPE_META[a.type][0] + " " + asgLabel(a, i);
      el.appendChild(s);
      el.title = "Pad " + (i + 1) + " · " + asgLabel(a, i) + (a.mode === "layer" ? " (layered with drum)" : "");
    });
  }

  /* ---------- assign panel ---------- */
  function cur() { // assignment being edited (created lazily on first change)
    return assign[sel] || (assign[sel] = { type: "drum", mode: "replace", on: true, drum: sel });
  }
  function refresh() { decorate(); selChanged(sel); }
  function subShow(type) {
    ["drum", "mel", "sample", "switch", "empty"].forEach(function (k) { var e = $("pa-sub-" + k); if (e) e.hidden = k !== type; });
    document.querySelectorAll("[data-pat]").forEach(function (b) { b.classList.toggle("on", b.dataset.pat === type); });
    var md = $("pa-mode"); if (md) md.disabled = type === "switch" || type === "empty";
  }
  function fillTargets() {
    var br = B() && B().padBridge, kind = $("pa-swkind").value, selEl = $("pa-swtarget");
    selEl.innerHTML = "";
    var opts = [];
    if (kind === "pattern" || kind === "piano") opts = ["A", "B", "C", "D"].map(function (x) { return { v: x, t: (kind === "piano" ? "Piano pattern " : "Drum pattern ") + x }; });
    else if (kind === "section") { var secs = br ? br.sections() : []; opts = secs.map(function (s) { return { v: String(s.i), t: s.label + " (" + s.bars + " bars)" }; }); if (!opts.length) opts = [{ v: "0", t: "No song structure picked yet" }]; }
    else if (kind === "song") { opts = (br ? br.songs() : []).map(function (s) { return { v: s.val, t: s.title }; }); if (!opts.length) opts = [{ v: "", t: "No saved song with a beat yet (Lyrics → attach beat)" }]; }
    opts.forEach(function (o) { var op = document.createElement("option"); op.value = o.v; op.textContent = o.t; selEl.appendChild(op); });
    var a = assign[sel]; if (a && a.swtarget != null) selEl.value = a.swtarget;
  }
  function selChanged(i) {
    if (typeof i === "number") sel = i;
    var a = assign[sel] || { type: "drum", mode: "replace", on: true, drum: sel };
    if ($("pa-title")) $("pa-title").textContent = "Pad " + (sel + 1) + (assign[sel] ? " · " + asgLabel(a, sel) : " · kit default");
    if ($("pa-on")) $("pa-on").checked = a.on !== false;
    if ($("pa-mode")) $("pa-mode").value = a.mode || "replace";
    subShow(a.type || "drum");
    // drum choices = this kit's pads
    var kp = B() && B().padBridge ? B().padBridge.kitPads() : [];
    var ds = $("pa-drum"); if (ds && ds.options.length !== kp.length) { ds.innerHTML = ""; kp.forEach(function (n, j) { var o = document.createElement("option"); o.value = j; o.textContent = (j + 1) + " · " + n; ds.appendChild(o); }); }
    if (ds) ds.value = a.drum != null ? a.drum : sel;
    if ($("pa-inst") && !$("pa-inst").options.length && window.IPBKeys) IPBKeys.INSTRUMENTS.forEach(function (x) { var o = document.createElement("option"); o.value = x.id; o.textContent = x.name; $("pa-inst").appendChild(o); });
    if ($("pa-inst")) $("pa-inst").value = a.inst || "trappiano";
    var ns = $("pa-note"); if (ns && !ns.options.length) for (var mm = 24; mm <= 84; mm++) { var o2 = document.createElement("option"); o2.value = mm; o2.textContent = NOTES[mm]; ns.appendChild(o2); }
    if (ns) ns.value = a.note || 60;
    if ($("pa-dur")) { $("pa-dur").value = a.dur || 1.1; $("pa-dur-val").textContent = (+(a.dur || 1.1)).toFixed(1) + "s"; }
    if ($("pa-sname")) $("pa-sname").textContent = bufs[sel] ? "Loaded: " + (a.name || "sample") + " · " + bufs[sel].duration.toFixed(2) + "s" + (a.mode === "layer" ? " · layered with the drum" : " · replaces the drum") : "No sample loaded yet — upload, record, add a built-in or chop the loop.";
    if ($("pa-vol")) { $("pa-vol").value = a.vol == null ? 100 : a.vol; $("pa-vol-val").textContent = (a.vol == null ? 100 : a.vol) + "%"; }
    if ($("pa-pitch")) { $("pa-pitch").value = a.pitch || 0; $("pa-pitch-val").textContent = (a.pitch || 0) + " st"; }
    if ($("pa-tstart")) { $("pa-tstart").value = a.tstart || 0; $("pa-tstart-val").textContent = (a.tstart || 0) + "%"; }
    if ($("pa-tend")) { $("pa-tend").value = a.tend == null ? 100 : a.tend; $("pa-tend-val").textContent = (a.tend == null ? 100 : a.tend) + "%"; }
    if ($("pa-loop")) $("pa-loop").checked = !!a.loop;
    if ($("pa-choke")) $("pa-choke").checked = !!a.choke;
    if ($("pa-swkind")) { $("pa-swkind").value = a.swkind || "pattern"; fillTargets(); }
    if ($("pa-swwhen")) $("pa-swwhen").value = a.swwhen || "bar";
  }
  function openPanel(i) {
    selChanged(i);
    var p = $("pad-assign"); if (p) { p.hidden=false; var tg=$("btn-pad-assign"); if(tg){tg.setAttribute("aria-expanded","true");}  p.scrollIntoView({ block: "nearest", behavior: "smooth" }); p.classList.add("pa-flash"); setTimeout(function () { p.classList.remove("pa-flash"); }, 900); }
  }
  function setMode(m) {
    padMode = m; save();
    $("padmode-sounds").classList.toggle("on", m === "sounds");
    $("padmode-songs").classList.toggle("on", m === "songs");
    $("padmode-hint").textContent = m === "songs" ? "Songs mode: switch pads fire on tap (patterns/sections at bar end). Sound pads still play." : "Pads play sounds. Switch pads only work in Songs mode.";
    td("pad mode " + m);
  }

  /* ---------- mic record (RAW: echo/noise/AGC off, no cleanup, saved as-is) ---------- */
  var rec = null;
  function recStart() {
    var br = B(); if (!br) return;
    var c = br.master.ctx();
    navigator.mediaDevices.getUserMedia({ audio: window.BeatAudioInput ? window.BeatAudioInput.constraints(undefined,false) : { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }).then(function (stream) {
      var src = c.createMediaStreamSource(stream), proc = c.createScriptProcessor(4096, 1, 1), mute = c.createGain();
      mute.gain.value = 0; var chunks = [];
      proc.onaudioprocess = function (e) { chunks.push(new Float32Array(e.inputBuffer.getChannelData(0))); };
      src.connect(proc); proc.connect(mute); mute.connect(c.destination);
      rec = { stream: stream, proc: proc, src: src, chunks: chunks, sr: c.sampleRate, pad: sel };
      $("pa-rec").hidden = true; $("pa-rec-stop").hidden = false;
      toast("Recording pad " + (sel + 1) + " from the mic — RAW, nothing cleaned. Tap Stop when done.");
      td("pad " + (sel + 1) + " mic record start (raw)");
    }).catch(function (e) { toast("Mic blocked: " + (e && e.message || e)); });
  }
  function recStop() {
    if (!rec) return;
    var r = rec; rec = null;
    try { r.proc.disconnect(); r.src.disconnect(); r.stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) { /* done */ }
    $("pa-rec").hidden = false; $("pa-rec-stop").hidden = true;
    var n = r.chunks.reduce(function (a, x) { return a + x.length; }, 0), out = new Float32Array(n), off = 0;
    r.chunks.forEach(function (x) { out.set(x, off); off += x.length; });
    if (n < r.sr * 0.1) { toast("That was too short — hold the record a moment longer."); return; }
    setSample(r.pad, wavBlob(out, out, r.sr), "Mic raw " + new Date().toLocaleTimeString(), "mic raw");
  }

  /* ---------- wiring ---------- */
  function wire() {
    if (!$("pad-assign")) return;
    document.querySelectorAll("[data-pat]").forEach(function (b) {
      b.addEventListener("click", function () {
        var a = cur(); a.type = b.dataset.pat; a.on = true;
        if (a.type !== "sample" && !a.mode) a.mode = "replace";
        if (a.type === "mel" && !a.inst) { a.inst = "trappiano"; a.note = 60; }
        if (a.type === "drum" && a.drum == null) a.drum = sel;
        save(); refresh();
        td("pad " + (sel + 1) + " assigned type " + a.type);
      });
    });
    $("pa-on").addEventListener("change", function () { cur().on = this.checked; save(); refresh(); });
    $("pa-mode").addEventListener("change", function () { cur().mode = this.value; save(); refresh(); });
    $("pa-drum").addEventListener("change", function () { var a = cur(); a.type = "drum"; a.drum = +this.value; save(); refresh(); });
    $("pa-inst").addEventListener("change", function () { cur().inst = this.value; save(); refresh(); });
    $("pa-note").addEventListener("change", function () { cur().note = +this.value; save(); refresh(); });
    $("pa-dur").addEventListener("input", function () { cur().dur = +this.value; $("pa-dur-val").textContent = (+this.value).toFixed(1) + "s"; save(); });
    [["pa-vol", "vol", "%"], ["pa-pitch", "pitch", " st"], ["pa-tstart", "tstart", "%"], ["pa-tend", "tend", "%"]].forEach(function (cfg) {
      $(cfg[0]).addEventListener("input", function () { cur()[cfg[1]] = +this.value; $(cfg[0] + "-val").textContent = this.value + cfg[2]; save(); });
    });
    $("pa-loop").addEventListener("change", function () { cur().loop = this.checked; save(); });
    $("pa-choke").addEventListener("change", function () { cur().choke = this.checked; save(); });
    $("pa-swkind").addEventListener("change", function () { var a = cur(); a.type = "switch"; a.swkind = this.value; fillTargets(); a.swtarget = $("pa-swtarget").value; save(); refresh(); });
    $("pa-swtarget").addEventListener("change", function () { cur().swtarget = this.value; save(); decorate(); });
    $("pa-swwhen").addEventListener("change", function () { cur().swwhen = this.value; save(); });
    $("pa-file").addEventListener("change", function () {
      var files = Array.prototype.slice.call(this.files || []), start = sel;
      files.forEach(function (f, k) { var i = start + k; if (i < N) setSample(i, f, f.name.replace(/\.[^.]+$/, ""), "upload"); });
      this.value = "";
    });
    $("pa-rec").addEventListener("click", recStart);
    $("pa-rec-stop").addEventListener("click", recStop);
    $("pa-builtin-add").addEventListener("click", function () {
      var parts = $("pa-builtin").value.split(":"), inst = parts[0], note = +parts[1];
      var sr = 44100, c = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(2, sr * 1.6, sr);
      window.IPBKeys.play(c, c.destination, note, 0.03, 1.2, 0.9, inst, 1, null);
      c.startRendering().then(function (b) {
        setSample(sel, wavBlob(b.getChannelData(0), b.getChannelData(1), sr), "Built-in " + inst + " " + NOTES[note], "builtin synth");
      });
    });
    $("pa-loopchop").addEventListener("click", function () {
      var btn = this; btn.disabled = true; btn.textContent = "Rendering 4 bars…";
      B().master.renderBeat("4").then(function (r) {
        var name = (B().padBridge.loopName() || "Beat loop") + " chop";
        return setSample(sel, wavBlob(r.L, r.R, r.sr), name, "loop chop");
      }).catch(function (e) { toast("Loop chop failed: " + (e && e.message || e)); }).then(function () { btn.disabled = false; btn.textContent = "✂ Current loop chop (4 bars)"; });
    });
    $("pa-clear").addEventListener("click", function () {
      assign[sel] = null; bufs[sel] = null;
      idb("readwrite", function (st) { st.delete(sel); }).catch(function () {});
      save(); refresh(); toast("Pad " + (sel + 1) + " back to its kit drum.");
      td("pad " + (sel + 1) + " sample cleared (kit drum stays)");
    });
    var _tg=$("btn-pad-assign"); if(_tg) _tg.addEventListener("click", function(){ var p=$("pad-assign"); if(!p) return; p.hidden=!p.hidden; _tg.setAttribute("aria-expanded", String(!p.hidden)); if(!p.hidden) p.scrollIntoView({block:"nearest"}); });
    $("padmode-sounds").addEventListener("click", function () { setMode("sounds"); });
    $("padmode-songs").addEventListener("click", function () { setMode("songs"); });
  }

  /* ---------- init ---------- */
  loadSettings();
  wire();
  setMode(padMode);
  selChanged(0);
  // restore sample buffers (decode lazily off the stored blobs)
  var jobs = [];
  for (var i = 0; i < N; i++) if (assign[i] && assign[i].type === "sample") jobs.push(i);
  jobs.forEach(function (i) {
    idbGet(i).then(function (row) {
      if (!row || !row.blob) return;
      return decode(row.blob).then(function (b) { bufs[i] = b; decorate(); if (i === sel) selChanged(sel); td("pad " + (i + 1) + " sample restored: " + (row.name || "")); });
    }).catch(function () { /* offline / blocked: pad falls back to its drum until the blob decodes */ });
  });

  window.IPBPadAssign = {
    get: get, playBuf: playBuf, tapSwitch: tapSwitch, decorate: decorate,
    selChanged: selChanged, openPanel: openPanel, pack: pack,
    state: function () { return { mode: padMode, pads: assign.map(function (a, i) { return a ? Object.assign({}, a, { hasBuf: !!bufs[i] }) : null; }) }; },
    setSampleBlob: setSample,
    testPlay: function (i) { var c = B() && B().master.ctx(); if (c && bufs[i]) return playBuf(c, c.destination, i, c.currentTime + 0.02, { vel: 0.8 }); return false; }
  };
  td("pad assignments ready, mode " + padMode);
})();
