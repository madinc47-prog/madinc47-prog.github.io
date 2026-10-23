/* Isle Voice — "Make my song": one primary button drives Type → Generate → Apply my voice (free Colab RVC) → Hear it.
 * Uses app.js (window.IsleVoiceCore: beat engine, zip, voice bank), sing.js (window.IsleSing: draft vocal on the beat,
 * alignment, mix) and shared/vocal-chain.js. Progress (including audio) is kept in IndexedDB, so you can leave for
 * Colab and come back to the same step. */
(function () {
  "use strict";
  var C = window.IsleVoiceCore, IS = window.IsleSing;
  if (!C || !IS) return;
  var SR = C.SR;
  var COLAB_URL = "https://colab.research.google.com/github/madinc47-prog/madinc47-prog.github.io/blob/main/isle-voice/colab/IsleVoice_RVC.ipynb";
  var TRAINED_KEY = "isv_model_trained";
  function $(id) { return document.getElementById(id); }

  /* ---------- persistence (own small DB so app.js's DB is untouched) ---------- */
  var dbP = null;
  function db() {
    if (dbP) return dbP;
    dbP = new Promise(function (res, rej) {
      if (!window.indexedDB) return rej(new Error("no IndexedDB"));
      var r = indexedDB.open("islevoice_make", 1);
      r.onupgradeneeded = function () { r.result.createObjectStore("kv"); };
      r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); };
    });
    return dbP;
  }
  function kv(mode, fn) {
    return db().then(function (d) {
      return new Promise(function (res, rej) {
        var tx = d.transaction("kv", mode), q = fn(tx.objectStore("kv"));
        tx.oncomplete = function () { res(q && q.result); }; tx.onerror = function () { rej(tx.error); };
      });
    });
  }
  var S = fresh();
  function fresh() {
    return { v: 1, step: 1, view: 1, mode: "type", name: "", lyrics: "", style: "rap", genre: "trap", mood: "dark", voice: "am_fenrir",
      variation: 1, model: "my_voice", pitch: 0, nudge: 0, vol: 1.5, colabOpened: false, info: null, bars: 8,
      inst: null, draft: null, preview: null, converted: null, lag: 0, vocal: null, final: null };
  }
  var saveT = null;
  function save() {
    clearTimeout(saveT);
    saveT = setTimeout(function () { kv("readwrite", function (st) { return st.put(S, "state"); }).catch(function () {}); }, 150);
  }
  function trained() { try { return localStorage.getItem(TRAINED_KEY) === "1"; } catch (e) { return false; } }
  function setTrained(v) { try { localStorage.setItem(TRAINED_KEY, v ? "1" : "0"); } catch (e) {} }

  /* ---------- status / busy ---------- */
  var busy = false, genRunning = false;
  function status(t, frac) {
    $("mk-status").textContent = t || "";
    var bar = $("mk-bar");
    if (frac == null) { bar.hidden = true; return; }
    bar.hidden = false; bar.firstChild.style.width = Math.round(Math.max(0.02, Math.min(1, frac)) * 100) + "%";
  }
  function setBusy(b) { busy = b; $("mk-go").disabled = b; $("mk-go").classList.toggle("is-busy", b); }

  /* ---------- form <-> state ---------- */
  function readForm() {
    S.name = $("mk-name").value.trim(); S.lyrics = $("mk-lyrics").value;
    S.genre = $("mk-genre").value; S.mood = $("mk-mood").value; S.voice = $("mk-voice").value;
    S.model = ($("mk-model").value.trim().replace(/[^\w\-]+/g, "_") || "my_voice").slice(0, 40);
    S.pitch = Math.max(-12, Math.min(12, Math.round(+$("mk-pitch").value || 0)));
  }
  function writeForm() {
    $("mk-name").value = S.name; $("mk-lyrics").value = S.lyrics; $("mk-genre").value = S.genre; $("mk-mood").value = S.mood;
    $("mk-voice").value = S.voice; $("mk-model").value = S.model; $("mk-pitch").value = S.pitch;
    $("mk-nudge").value = S.nudge; $("mk-vol").value = S.vol; labels();
    setStyle(S.style, true); $("mk-trained").checked = trained();
  }
  function labels() {
    $("mk-nudge-val").textContent = (S.nudge > 0 ? "+" : "") + S.nudge + " ms";
    $("mk-vol-val").textContent = (S.vol > 0 ? "+" : "") + S.vol + " dB";
  }
  function setStyle(v, quiet) {
    S.style = v === "sing" ? "sing" : "rap";
    Array.prototype.forEach.call($("mk-style").children, function (b) { b.setAttribute("aria-checked", String(b.dataset.v === S.style)); });
    if (!quiet) save();
  }
  function lines() { return S.lyrics.split(/\n/).map(function (l) { return l.trim(); }).filter(Boolean).slice(0, 32); }

  /* ---------- render UI for the current step ---------- */
  var urls = {};
  function setSrc(el, key, blob) {
    if (urls[key]) URL.revokeObjectURL(urls[key]);
    urls[key] = blob ? URL.createObjectURL(blob) : "";
    $(el).src = urls[key] || ""; return urls[key];
  }
  function render() {
    var v = S.view;
    Array.prototype.forEach.call($("mk-stepper").children, function (li) {
      var s = +li.dataset.s;
      li.classList.toggle("done", s < S.step || (s === 4 && !!S.final));
      var cur = genRunning ? 2 : v;
      li.classList.toggle("current", s === cur);
      if (s === cur) li.setAttribute("aria-current", "step"); else li.removeAttribute("aria-current");
      li.querySelector("button").disabled = !(s <= S.step || (s === 2 && S.preview));
    });
    $("mk-p1").hidden = v !== 1;
    $("mk-p2").hidden = v !== 3;
    $("mk-p3").hidden = v !== 3;
    $("mk-p4").hidden = v !== 4;
    $("mk-rec").hidden = S.mode !== "record" || v !== 1;
    $("mk-rec-toggle").hidden = S.mode === "record";
    $("mk-rec-go").disabled = !(S.mode === "record" && S.inst) || !!rec;
    var go = $("mk-go");
    if (v === 1) go.textContent = S.mode === "record" ? (S.inst ? "Rebuild the beat" : "Make the beat") : "Make my song";
    else if (v === 3) go.textContent = S.colabOpened ? "Import my voice" : "Apply my voice (free Colab)";
    else go.textContent = "Download my song (WAV)";
    if (v === 3) { renderP3(); }
    $("mk-colab").href = COLAB_URL;
  }
  function showP2() {
    if (!S.preview) return;
    var u = setSrc("mk-prev", "prev", S.preview);
    $("mk-dl-prev").href = u; $("mk-dl-prev").download = C.safeName(S.name) + "_draft_preview.wav";
    $("mk-p2-title").textContent = (S.name || "Untitled") + " — draft" + (S.mode === "record" ? " (your recorded take)" : " (" + S.style + ")");
    if (S.info) $("mk-p2-meta").textContent = S.info.key + " · " + S.info.bpm + " BPM · " + S.bars + " bars · " + C.fmtTime(S.info.seconds);
  }
  function showP4() {
    if (!S.final) return;
    setSrc("mk-final", "final", S.final);
    $("mk-p4-title").textContent = (S.name || "Untitled") + " — in your voice";
    if (S.info) $("mk-p4-meta").textContent = S.info.bpm + " BPM · " + C.fmtTime(S.info.seconds) + " · aligned " + Math.round(S.lag / SR * 1000) + " ms";
  }
  var bankSecs = 0;
  function renderP3() {
    $("mk-zip-name").textContent = zipName();
    var t = $("mk-trained").checked;
    $("mk-train-li").hidden = t;
    C.getAll("clips").then(function (clips) {
      bankSecs = clips.reduce(function (s, c) { return s + (c.duration || 0); }, 0);
      var n = $("mk-bank-note");
      if (t) { n.textContent = "Training is skipped: Colab uses the voice model already saved in your Google Drive (IsleVoice/models/" + S.model + ")."; n.className = "mk-note ok"; }
      else if (!clips.length) { n.innerHTML = "First time? Your voice model needs training once, from your voice bank — and it's empty. <a href=\"#bank\">Record 10–30 minutes of your voice in Voice bank</a> (once only), then come back."; n.className = "mk-note warn"; }
      else { n.textContent = "Voice bank: " + C.fmtTime(bankSecs) + " of your voice (" + clips.length + (clips.length === 1 ? " clip" : " clips") + ") will go in the zip to train your model once." + (bankSecs < 300 ? " Tip: 10–30 minutes trains a much better model." : ""); n.className = "mk-note" + (bankSecs < 300 ? " warn" : " ok"); }
    });
  }

  /* ---------- step 1→2: generate beat + draft vocal ---------- */
  function beatParams() {
    var n = lines().length;
    S.bars = Math.max(8, Math.ceil((n + 2) / 4) * 4);
    var G = C.GENRES[S.genre] || C.GENRES.trap;
    return { id: "make", name: S.name || "Untitled", genre: S.genre, mood: S.mood, tempo: G.bpm, key: "auto", bars: S.bars, variation: S.variation, lyrics: "", guide: false };
  }
  function renderBeat() {
    status("Building the beat…", 0.05);
    return C.renderDraft(beatParams()).then(function (r) {
      S.info = { key: r.info.key, bpm: r.info.bpm, seconds: r.info.seconds, keyNum: r.info.keyNum, minor: r.info.minor, prog: r.info.progRaw, chords: r.info.prog };
      S.inst = C.bufferToWav(r.inst, false);
      return r.inst;
    });
  }
  function finishDraft(inst, vocal) {
    status("Mixing the preview…", 0.95);
    return IS.mix(inst.getChannelData(0), inst.getChannelData(1), vocal, SR, { vocalDb: 0, verb: 0.08 }).then(function (m) {
      S.draft = C.wavFromChannels([vocal], SR);
      S.preview = C.wavFromChannels(m, SR);
      S.final = null; S.converted = null; S.vocal = null; S.colabOpened = false;
      S.step = 3; S.view = 3; zipCache = null; save(); showP2(); render(); prepZip();
      status("Draft ready — press play. Next: Apply my voice.");
      try { $("mk-prev").scrollIntoView({ block: "center", behavior: "smooth" }); } catch (e) {}
    });
  }
  function generate() {
    readForm();
    var ls = lines();
    if (!ls.length) { status("Type at least one line of lyrics first."); $("mk-lyrics").focus(); return; }
    if (!S.name) { S.name = ls[0].slice(0, 40); $("mk-name").value = S.name; }
    setBusy(true); save(); genRunning = true; render();
    var inst;
    renderBeat().then(function (ib) {
      inst = ib;
      status("Getting the draft voice ready…", 0.1);
      return IS.draftVocal({
        lines: ls, bpm: S.info.bpm, bars: S.bars, firstBar: 1, mode: S.style, voice: S.voice, sr: SR,
        keyNum: S.info.keyNum, minor: S.info.minor, prog: S.info.prog,
        onProgress: function (kind, f, a, b) {
          if (kind === "load") status("Downloading the free on-device voice… " + Math.round(f * 100) + "% (about 90 MB, first time only)", 0.1 + f * 0.3);
          else status("Writing line " + Math.min(a, b) + " of " + b + " on the beat…", 0.4 + f * 0.55);
        }
      });
    }).then(function (r) { return finishDraft(inst, r.audio); })
      .catch(function (e) { console.warn("[make] generate failed", e); status("Couldn't make the draft voice: " + (e.message || e) + ". Check your connection and tap again, or use “record it instead”."); })
      .then(function () { setBusy(false); genRunning = false; render(); });
  }

  /* ---------- "or record it instead" ---------- */
  var rec = null, recTimer = null, recPlayer = null, instBuf = null;
  function makeBeatForRecording() {
    readForm(); if (!S.name) S.name = (lines()[0] || "My song").slice(0, 40);
    if (!lines().length) S.bars = 8;
    setBusy(true);
    renderBeat().then(function (ib) { instBuf = ib; save(); status("Beat ready. Headphones on, then tap ● Record over the beat."); render(); })
      .catch(function (e) { status("Beat failed: " + e.message); }).then(function () { setBusy(false); });
  }
  function startRec() {
    if (rec || !S.inst) return;
    C.startMic(null).then(function (s) {
      rec = s; var t0 = Date.now();
      recPlayer = new Audio(setSrc("mk-prev", "recbeat", S.inst)); recPlayer.onended = stopRec; recPlayer.play().catch(function () {});
      $("mk-rec-go").classList.add("rec-on"); $("mk-rec-go").disabled = true; $("mk-rec-stop").disabled = false;
      recTimer = setInterval(function () { $("mk-rec-time").textContent = C.fmtTime((Date.now() - t0) / 1000); }, 250);
      status("Recording… rap your lyrics over the beat.");
    }).catch(function (e) { status(e.message || "Microphone permission denied."); });
  }
  function stopRec() {
    if (!rec) return;
    var s = rec; rec = null; clearInterval(recTimer);
    if (recPlayer) { recPlayer.pause(); recPlayer = null; }
    $("mk-rec-go").classList.remove("rec-on"); $("mk-rec-stop").disabled = true;
    setBusy(true); status("Polishing your take (Pro vocal)…", 0.5);
    var instP = instBuf ? Promise.resolve(instBuf) : C.decodeBlob(S.inst).then(function (b) { return toStereo(b); });
    s.stop().then(function (blob) { return Promise.all([C.decodeBlob(blob), instP]); }).then(function (r) {
      var ab = r[0], inst = r[1], x = ab.getChannelData(0);
      var chainP = window.VocalChain ? window.VocalChain.render(x, ab.sampleRate, { profile: "builtin" }).catch(function () { return x; }) : Promise.resolve(x);
      return chainP.then(function (y) { return IS.resample(y, ab.sampleRate, SR); }).then(function (y) { return finishDraft(inst, IS.shift(y, 0, inst.length)); });
    }).catch(function (e) { status("Couldn't use that take: " + (e.message || e)); }).then(function () { setBusy(false); render(); });
  }
  function toStereo(b) {
    if (b.numberOfChannels >= 2) return b;
    return { length: b.length, getChannelData: function () { return b.getChannelData(0); } };
  }
  function decodeStereo(blob) { return C.decodeBlob(blob).then(toStereo); } // decodeAudioData keeps the file's channels

  /* ---------- step 3: the zip + Colab ---------- */
  function zipName() { return C.safeName(S.name || "song") + "_isle_voice.zip"; }
  var zipCache = null;
  function prepZip() {
    if (zipCache) return zipCache;
    readForm();
    var withBank = !$("mk-trained").checked, files = [];
    var job = { app: "Isle Voice", version: 1, song: S.name || "Untitled", model_name: S.model, pitch: S.pitch, style: S.mode === "record" ? "recorded" : S.style,
      bpm: S.info && S.info.bpm, created: new Date().toISOString(), train_if_needed: withBank, sample_rate: 40000, output_name: C.safeName(S.name || "song") + "_my_voice.wav" };
    zipCache = C.blobU8(S.draft).then(function (u) {
      files.push({ name: "draft_vocal.wav", data: u });
      return withBank ? C.buildBankFiles("voice_bank/", true) : [];
    }).then(function (bank) {
      files = files.concat(bank); job.voice_bank_files = bank.length;
      files.push({ name: "job.json", data: C.textU8(JSON.stringify(job, null, 2)) });
      files.push({ name: "README.txt", data: C.textU8(readme(job)) });
      var z = C.makeZip(files); zipCache.blob = z; return z;
    });
    zipCache.catch(function () { zipCache = null; });
    return zipCache;
  }
  function readme(job) {
    return ["ISLE VOICE — " + job.song, "", "Open this notebook on Google Colab (free, your Google account):", COLAB_URL, "",
      "Then: Runtime > Run all. Allow Google Drive. Pick this zip when asked (or put it in Google Drive > IsleVoice > inbox).",
      job.train_if_needed ? "First time it trains your voice model from voice_bank/ (about 45-120 min on the free T4 GPU) and saves it in Google Drive > IsleVoice > models > " + job.model_name + "." : "It uses your model in Google Drive > IsleVoice > models > " + job.model_name + ".",
      "Then it converts draft_vocal.wav into your voice and downloads " + job.output_name + ".", "Import that file back in Isle Voice (Make my song > Import my voice).", "",
      "Only use your own voice or a voice you have permission to use."].join("\n");
  }
  function applyVoice() {
    readForm(); setTrained($("mk-trained").checked);
    if (!$("mk-trained").checked && bankSecs < 1) { status("Record your voice bank first (once only) — see the note above."); location.hash = "#bank"; return; }
    if (!$("mk-trained").checked && bankSecs < 120 && !confirm("Your voice bank has only " + C.fmtTime(bankSecs) + " of your voice. 10–30 minutes gives a much better model. Train with this anyway?")) return;
    var z = zipCache && zipCache.blob;
    if (z) {
      C.downloadBlob(z, zipName());
      var w = null; try { w = window.open(COLAB_URL, "_blank"); if (w) w.opener = null; } catch (e) {}
      S.colabOpened = true; save(); render();
      status(!w ? "Zip saved. Tap “Open Colab again” below if Colab didn't open." : "Zip saved to Downloads and Colab opened. When it finishes, come back and import your voice.");
      return;
    }
    setBusy(true); status("Preparing your zip…", 0.5);
    prepZip().then(function (b) {
      C.downloadBlob(b, zipName()); S.colabOpened = true; save(); render();
      status("Zip saved to Downloads. Now tap “Open Colab again” below to open the notebook.");
      $("mk-colab").classList.add("pulse");
    }).catch(function (e) { status("Zip failed: " + e.message); }).then(function () { setBusy(false); });
  }

  /* ---------- step 4: import, align, polish, mix ---------- */
  var vocalF = null, instCache = null;
  function importVoice(file) {
    if (!file) return;
    if (!S.draft || !S.inst) { status("Make the draft first (step 1)."); return; }
    setBusy(true); status("Reading your converted voice…", 0.2);
    Promise.all([C.decodeBlob(file), C.decodeBlob(S.draft), decodeStereo(S.inst)]).then(function (r) {
      var conv = mono(r[0]), ref = r[1].getChannelData(0); instCache = r[2];
      status("Lining it up with the beat…", 0.45);
      S.lag = IS.align(ref, conv, SR, 3);
      var aligned = IS.shift(conv, S.lag, instCache.length);
      status("Polishing the vocal (Pro vocal chain)…", 0.65);
      var ch = window.VocalChain ? window.VocalChain.render(aligned, SR, { profile: "interface" }).catch(function () { return aligned; }) : Promise.resolve(aligned);
      return ch;
    }).then(function (y) {
      vocalF = y; S.converted = file instanceof Blob ? new Blob([file], { type: file.type || "audio/wav" }) : null;
      S.vocal = C.wavFromChannels([y], SR); setTrained(true);
      return remix();
    }).then(function () {
      S.step = 4; S.view = 4; save(); render(); showP4();
      status("Your song is ready — press play. Save it with the button, or Export MP3.");
    }).catch(function (e) { console.warn("[make] import failed", e); status("Couldn't use that file: " + (e.message || e) + ". Pick the WAV that Colab downloaded."); })
      .then(function () { setBusy(false); });
  }
  function mono(b) {
    if (b.numberOfChannels === 1) return b.getChannelData(0);
    var a = b.getChannelData(0), c = b.getChannelData(1), y = new Float32Array(b.length);
    for (var i = 0; i < y.length; i++) y[i] = 0.5 * (a[i] + c[i]); return y;
  }
  function ensureMixInputs() {
    var p = [];
    p.push(instCache ? Promise.resolve(instCache) : decodeStereo(S.inst).then(function (b) { instCache = b; return b; }));
    p.push(vocalF ? Promise.resolve(vocalF) : C.decodeBlob(S.vocal).then(function (b) { vocalF = b.getChannelData(0); return vocalF; }));
    return Promise.all(p);
  }
  var mixSeq = 0;
  function remix() {
    var my = ++mixSeq;
    return ensureMixInputs().then(function (r) {
      var inst = r[0], v = IS.shift(r[1], -Math.round(S.nudge / 1000 * SR), inst.length);
      return IS.mix(inst.getChannelData(0), inst.getChannelData(1), v, SR, { vocalDb: S.vol, verb: 0.12 });
    }).then(function (m) {
      if (my !== mixSeq) return;
      S.final = C.wavFromChannels(m, SR); S.finalCh = null; finalCh = m; save(); showP4(); if (window.PFLIB) window.PFLIB.addLater(S.final, { name: (S.name || "Isle Voice song"), source: "Isle Voice" });
    });
  }
  var finalCh = null;
  function exportMp3() {
    if (!S.final) return;
    setBusy(true); status("Encoding MP3…", 0.3);
    var loadLame = window.lamejs ? Promise.resolve() : new Promise(function (res, rej) {
      var s = document.createElement("script"); s.src = "vendor/lame.min.js"; s.onload = res; s.onerror = function () { rej(new Error("MP3 encoder didn't load")); }; document.head.appendChild(s);
    });
    var chP = finalCh ? Promise.resolve(finalCh) : decodeStereo(S.final).then(function (b) { return [b.getChannelData(0), b.getChannelData(1)]; });
    Promise.all([loadLame, chP]).then(function (r) {
      var ch = r[1], enc = new window.lamejs.Mp3Encoder(2, SR, 192), out = [], blk = 1152, n = ch[0].length;
      function i16(a, s, e) { var o = new Int16Array(e - s); for (var i = s; i < e; i++) { var x = Math.max(-1, Math.min(1, a[i])); o[i - s] = x < 0 ? x * 32768 : x * 32767; } return o; }
      for (var i = 0; i < n; i += blk) { var e = Math.min(n, i + blk), b = enc.encodeBuffer(i16(ch[0], i, e), i16(ch[1], i, e)); if (b.length) out.push(new Uint8Array(b)); }
      var f = enc.flush(); if (f.length) out.push(new Uint8Array(f));
      C.downloadBlob(new Blob(out, { type: "audio/mpeg" }), C.safeName(S.name) + "_isle_voice.mp3");
      status("MP3 saved to Downloads.");
    }).catch(function (e) { status("MP3 failed: " + e.message + " — the WAV export still works."); }).then(function () { setBusy(false); });
  }

  /* ---------- wiring ---------- */
  function primary() {
    if (busy) return;
    if (S.view === 1) { if (S.mode === "record") makeBeatForRecording(); else generate(); }
    else if (S.view === 3) { if (S.colabOpened) $("mk-import").click(); else applyVoice(); }
    else if (S.final) { C.downloadBlob(S.final, C.safeName(S.name) + "_isle_voice.wav"); status("WAV saved to Downloads."); }
  }
  function wire() {
    var vs = $("mk-voice");
    IS.VOICES.forEach(function (v) { var o = document.createElement("option"); o.value = v.id; o.textContent = v.label; vs.appendChild(o); });
    $("mk-go").addEventListener("click", primary);
    $("mk-style").addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) setStyle(b.dataset.v); });
    ["mk-name", "mk-lyrics", "mk-genre", "mk-mood", "mk-voice", "mk-model", "mk-pitch"].forEach(function (id) {
      $(id).addEventListener("change", function () { readForm(); zipCache = null; save(); if (S.view === 3) { prepZip(); renderP3(); } });
    });
    $("mk-lyrics").addEventListener("input", function () { readForm(); save(); });
    $("mk-trained").addEventListener("change", function () { setTrained($("mk-trained").checked); zipCache = null; renderP3(); prepZip(); });
    $("mk-stepper").addEventListener("click", function (e) {
      var li = e.target.closest("li"); if (!li || busy) return;
      var s = +li.dataset.s;
      if (s === 1) S.view = 1; else if ((s === 2 || s === 3) && S.preview) { S.view = 3; showP2(); } else if (s === 4 && S.final) { S.view = 4; showP4(); }
      save(); render();
    });
    $("mk-edit").addEventListener("click", function () { S.view = 1; save(); render(); $("mk-lyrics").focus(); });
    $("mk-regen").addEventListener("click", function () { S.variation = (S.variation || 1) + 1; S.view = 1; render(); primary(); });
    $("mk-rec-toggle").addEventListener("click", function () { S.mode = "record"; save(); render(); });
    $("mk-rec-cancel").addEventListener("click", function () { if (rec) return; S.mode = "type"; save(); render(); });
    $("mk-rec-go").addEventListener("click", startRec);
    $("mk-rec-stop").addEventListener("click", stopRec);
    $("mk-import").addEventListener("change", function (e) { var f = e.target.files && e.target.files[0]; e.target.value = ""; importVoice(f); });
    var drop = $("mk-drop");
    ["dragenter", "dragover"].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.add("over"); }); });
    ["dragleave", "drop"].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.remove("over"); }); });
    drop.addEventListener("drop", function (e) { var f = e.dataTransfer && e.dataTransfer.files[0]; if (f) importVoice(f); });
    $("mk-zip-again").addEventListener("click", function () { prepZip().then(function (b) { C.downloadBlob(b, zipName()); status("Zip saved to Downloads."); }); });
    $("mk-colab").addEventListener("click", function () { S.colabOpened = true; $("mk-colab").classList.remove("pulse"); save(); render(); });
    var nt = null;
    function slid() { S.nudge = +$("mk-nudge").value; S.vol = +$("mk-vol").value; labels(); clearTimeout(nt); nt = setTimeout(function () { status("Remixing…"); remix().then(function () { status("Updated."); }); }, 250); }
    $("mk-nudge").addEventListener("input", slid); $("mk-vol").addEventListener("input", slid);
    $("mk-mp3").addEventListener("click", exportMp3);
    $("mk-reimport").addEventListener("click", function () { $("mk-import").click(); });
    $("mk-new").addEventListener("click", function () {
      if (!confirm("Start a new song? (This song's audio here is cleared; anything you exported is kept.)")) return;
      var keep = { voice: S.voice, model: S.model, pitch: S.pitch, genre: S.genre, mood: S.mood, style: S.style };
      S = fresh(); Object.keys(keep).forEach(function (k) { S[k] = keep[k]; });
      vocalF = instCache = finalCh = instBuf = null; zipCache = null; writeForm(); save(); render(); status("");
    });
  }
  function init() {
    wire();
    kv("readonly", function (st) { return st.get("state"); }).catch(function () { return null; }).then(function (saved) {
      if (saved && saved.v === 1) { S = Object.assign(fresh(), saved); }
      if (!S.inst && S.view !== 1) { S.view = 1; S.step = 1; }
      writeForm(); render(); showP2(); showP4();
      if (S.view === 3) { prepZip(); status(S.colabOpened ? "Welcome back. When Colab has finished, import your converted voice." : "Your draft is ready. Next: Apply my voice."); }
      if (S.view === 4) status("Welcome back — your song is ready.");
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
  window.__isleMake = { state: function () { return S; }, importVoice: importVoice, generate: generate, prepZip: prepZip, COLAB_URL: COLAB_URL };
})();
