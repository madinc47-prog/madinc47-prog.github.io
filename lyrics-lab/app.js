/* Lyrics Lab — pick audio → Whisper (on-device) → edit lyrics → Kokoro draft read/rap (IsleSing) → Colab RVC → export / Multitrack.
 * Everything stays in this browser (IndexedDB). Library code is self-hosted; only model weights download from Hugging Face. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var DOC = null, SRC = null, OUT = null, BEAT = null, AC = null;
  function ac() { return AC || (AC = new (window.AudioContext || window.webkitAudioContext)()); }
  var tt; function toast(m, ms) { var t = $("toast"); t.textContent = m; t.hidden = false; clearTimeout(tt); tt = setTimeout(function () { t.hidden = true; }, ms || 3200); }
  function fmt(s) { s = Math.max(0, s || 0); return Math.floor(s / 60) + ":" + ("0" + Math.floor(s % 60)).slice(-2); }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});

  /* ---------- IndexedDB ---------- */
  function open(name, ver, up) { return new Promise(function (res, rej) { var r = ver ? indexedDB.open(name, ver) : indexedDB.open(name); if (up) r.onupgradeneeded = function () { up(r.result); }; r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; }); }
  function all(name, store) {
    return open(name).then(function (d) { if (!d.objectStoreNames.contains(store)) { d.close(); return []; } return new Promise(function (res) { var q = d.transaction(store).objectStore(store).getAll(); q.onsuccess = function () { d.close(); res(q.result || []); }; q.onerror = function () { d.close(); res([]); }; }); }).catch(function () { return []; });
  }
  function getKey(name, store, key) { return open(name).then(function (d) { if (!d.objectStoreNames.contains(store)) { d.close(); return null; } return new Promise(function (res) { var q = d.transaction(store).objectStore(store).get(key); q.onsuccess = function () { d.close(); res(q.result); }; q.onerror = function () { d.close(); res(null); }; }); }).catch(function () { return null; }); }
  function mine() { return open("ipb_lyricslab", 1, function (d) { d.createObjectStore("docs", { keyPath: "id" }); }); }
  function putDoc(doc) { doc.updated = Date.now(); return mine().then(function (d) { return new Promise(function (res) { var t = d.transaction("docs", "readwrite"); t.objectStore("docs").put(doc); t.oncomplete = function () { d.close(); res(); }; t.onerror = function () { d.close(); res(); }; }); }); }
  function delDoc(id) { return mine().then(function (d) { return new Promise(function (res) { var t = d.transaction("docs", "readwrite"); t.objectStore("docs").delete(id); t.oncomplete = function () { d.close(); res(); }; }); }); }
  function docs() { return mine().then(function (d) { return new Promise(function (res) { var q = d.transaction("docs").objectStore("docs").getAll(); q.onsuccess = function () { d.close(); res((q.result || []).sort(function (a, b) { return b.updated - a.updated; })); }; }); }); }

  /* ---------- WAV ---------- */
  function wav(chs, sr) {
    var n = chs[0].length, c = chs.length, b = new ArrayBuffer(44 + n * c * 2), v = new DataView(b), o = 0;
    function s(x) { for (var i = 0; i < x.length; i++) v.setUint8(o++, x.charCodeAt(i)); } function u32(x) { v.setUint32(o, x, true); o += 4; } function u16(x) { v.setUint16(o, x, true); o += 2; }
    s("RIFF"); u32(36 + n * c * 2); s("WAVEfmt "); u32(16); u16(1); u16(c); u32(sr); u32(sr * c * 2); u16(c * 2); u16(16); s("data"); u32(n * c * 2);
    for (var i = 0; i < n; i++) for (var k = 0; k < c; k++) { var x = Math.max(-1, Math.min(1, chs[k][i])); v.setInt16(o, x < 0 ? x * 32768 : x * 32767, true); o += 2; }
    return new Blob([b], { type: "audio/wav" });
  }
  function decode(blob) { return blob.arrayBuffer().then(function (ab) { return new Promise(function (res, rej) { ac().decodeAudioData(ab, res, rej); }); }); }
  function resample(buf, sr, chans) {
    var n = Math.ceil(buf.duration * sr), c = new OfflineAudioContext(chans, n, sr), s = c.createBufferSource(); s.buffer = buf; s.connect(c.destination); s.start();
    return c.startRendering();
  }
  function download(blob, name) { var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000); }
  function safe(n) { return (n || "lyrics").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_") || "lyrics"; }

  /* ---------- 1) sources ---------- */
  var SOURCES = {};
  function loadSources() {
    var sel = $("src-sel");
    return Promise.all([all("pfdj_freestyle", "takes"), getKey("ipb_multitrack", "meta", "active")]).then(function (r) {
      sel.innerHTML = '<option value="">— choose a freestyle or take —</option>';
      var g1 = document.createElement("optgroup"); g1.label = "My Freestyles (DJ)";
      r[0].sort(function (a, b) { return b.created - a.created; }).forEach(function (t) { SOURCES["fs:" + t.id] = { name: t.name, get: function () { return Promise.resolve(t.blob); } }; var o = new Option(t.name, "fs:" + t.id); g1.appendChild(o); });
      if (g1.children.length) sel.appendChild(g1);
      var st = r[1], g2 = document.createElement("optgroup"); g2.label = "Multitrack takes";
      if (st && st.tracks) st.tracks.forEach(function (tr) { (tr.takes || []).forEach(function (k) {
        SOURCES["mt:" + k.buf] = { name: k.name, get: function () { return getKey("ipb_multitrack", "bufs", k.buf).then(function (raw) { if (!raw) throw new Error("take missing"); return wav(raw.ch, raw.sr); }); } };
        g2.appendChild(new Option(k.name + " (" + (k.dur || 0).toFixed(1) + " s)", "mt:" + k.buf)); }); });
      if (g2.children.length) sel.appendChild(g2);
    });
  }
  function useSource(name, blob, key) {
    SRC = { name: name, blob: blob, key: key || null };
    var a = $("src-audio"); a.src = URL.createObjectURL(blob); a.hidden = false;
    $("src-info").textContent = "Picked: " + name + " · " + Math.round(blob.size / 1024) + " KB";
    if (!DOC || DOC.lines.length) newDoc(name); else { DOC.name = name; $("doc-name").value = name; }
    DOC.src = { name: name, key: SRC.key }; putDoc(DOC);
  }
  $("src-sel").onchange = function () { var s = SOURCES[this.value], k = this.value; if (!s) return; s.get().then(function (b) { useSource(s.name, b, k); }).catch(function (e) { toast("Could not open: " + e.message); }); };
  $("src-up").onclick = function () { $("src-file").click(); };
  $("src-file").onchange = function () { var f = this.files[0]; this.value = ""; if (f) useSource(f.name.replace(/\.[^.]+$/, ""), f, null); };

  /* ---------- 2) Whisper ---------- */
  var W = null, files = {};
  function prog(id, f) { var p = $(id); p.hidden = f == null; if (f != null) p.firstChild.style.width = Math.round(f * 100) + "%"; }
  $("asr-go").onclick = function () {
    if (!SRC) { toast("Pick audio first (step 1)."); return; }
    var btn = this; btn.disabled = true; $("asr-status").textContent = "Preparing audio…"; prog("asr-prog", 0);
    decode(SRC.blob).then(function (b) { return resample(b, 16000, 1); }).then(function (b16) {
      var x = new Float32Array(b16.getChannelData(0));
      if (!W) W = new Worker("whisper-worker.js?v=20261022a", { type: "module" });
      files = {};
      return new Promise(function (res, rej) {
        W.onmessage = function (e) {
          var m = e.data;
          if (m.type === "progress") { files[m.file] = [m.loaded, m.total]; var a = 0, t = 0; Object.keys(files).forEach(function (k) { a += files[k][0]; t += files[k][1]; }); prog("asr-prog", a / t); $("asr-status").textContent = "Downloading Whisper (once): " + Math.round(a / 1048576) + " / " + Math.round(t / 1048576) + " MB"; }
          else if (m.type === "status") { $("asr-status").textContent = m.msg + " (" + fmt(x.length / 16000) + " of audio — on a Tab this can take about as long as the audio, or longer)"; prog("asr-prog", 1); }
          else if (m.type === "done") res(m); else if (m.type === "error") rej(new Error(m.error));
        };
        W.onerror = function (e) { rej(new Error(e.message || "worker failed")); };
        W.postMessage({ audio: x, model: $("asr-model").value, language: $("asr-lang").value || null }, [x.buffer]);
      });
    }).then(function (m) {
      var ch = (m.chunks || []).filter(function (c) { return c.text && c.text.trim(); });
      DOC.lines = ch.length ? ch.map(function (c) { return { t: c.timestamp ? c.timestamp[0] : null, text: c.text.trim() }; }) : String(m.text || "").split(/(?<=[.!?])\s+/).filter(Boolean).map(function (s) { return { t: null, text: s.trim() }; });
      DOC.lang = $("asr-lang").value; snapshot("Transcribed"); putDoc(DOC); renderLines(); listDocs();
      $("asr-status").textContent = "Done — " + DOC.lines.length + " lines. Fix any words below (dialect is kept as heard)."; prog("asr-prog", null);
    }).catch(function (e) { $("asr-status").textContent = "Transcribe failed: " + e.message; prog("asr-prog", null); }).then(function () { btn.disabled = false; });
  };

  /* ---------- 3) editor ---------- */
  function newDoc(name) { DOC = { id: "ly_" + Date.now().toString(36), name: name || "New lyrics", lines: [], versions: [], created: Date.now() }; $("doc-name").value = DOC.name; renderLines(); renderVersions(); }
  function snapshot(label) { DOC.versions.unshift({ at: Date.now(), label: label || "Saved", lines: JSON.parse(JSON.stringify(DOC.lines)) }); DOC.versions = DOC.versions.slice(0, 30); renderVersions(); }
  var saveT; function soon() { clearTimeout(saveT); saveT = setTimeout(function () { putDoc(DOC).then(listDocs); }, 500); }
  function renderLines() {
    var box = $("lines"); box.innerHTML = "";
    if (!DOC.lines.length) { box.innerHTML = '<p class="muted">No lyrics yet — run Audio → Text, type with “+ Bar”, or “Edit as one text”.</p>'; return; }
    DOC.lines.forEach(function (l, i) {
      var r = document.createElement("div"); r.className = "ln";
      r.innerHTML = '<span class="ts"></span><input type="text" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"><span class="mv"><button type="button" class="btn" aria-label="Move up">↑</button><button type="button" class="btn" aria-label="Move down">↓</button><button type="button" class="btn danger" aria-label="Delete bar">✕</button></span>';
      r.querySelector(".ts").textContent = l.t == null ? "bar " + (i + 1) : fmt(l.t);
      var inp = r.querySelector("input"); inp.value = l.text; inp.oninput = function () { l.text = inp.value; soon(); };
      var b = r.querySelectorAll(".mv .btn");
      b[0].onclick = function () { if (i) { DOC.lines.splice(i - 1, 0, DOC.lines.splice(i, 1)[0]); renderLines(); soon(); } };
      b[1].onclick = function () { if (i < DOC.lines.length - 1) { DOC.lines.splice(i + 1, 0, DOC.lines.splice(i, 1)[0]); renderLines(); soon(); } };
      b[2].onclick = function () { DOC.lines.splice(i, 1); renderLines(); soon(); };
      box.appendChild(r);
    });
  }
  function renderVersions() { var s = $("ver-sel"); s.innerHTML = '<option value="">Versions (' + DOC.versions.length + ')…</option>'; DOC.versions.forEach(function (v, i) { s.appendChild(new Option(new Date(v.at).toLocaleString() + " · " + v.label, String(i))); }); }
  $("ver-sel").onchange = function () { var v = DOC.versions[+this.value]; if (!v || this.value === "") return; if (!confirm("Go back to this version? (Your current text is saved as a version first.)")) { this.value = ""; return; } snapshot("Before restore"); DOC.lines = JSON.parse(JSON.stringify(v.lines)); renderLines(); soon(); this.value = ""; };
  $("ver-save").onclick = function () { snapshot("Saved"); putDoc(DOC).then(listDocs); toast("Version saved"); };
  $("doc-name").oninput = function () { DOC.name = this.value.slice(0, 80); soon(); };
  $("ln-add").onclick = function () { DOC.lines.push({ t: null, text: "" }); renderLines(); var ins = $("lines").querySelectorAll("input"); ins[ins.length - 1].focus(); };
  $("ln-text").onclick = function () {
    var b = $("bulk");
    if (b.hidden) { b.value = DOC.lines.map(function (l) { return l.text; }).join("\n"); b.hidden = false; $("lines").hidden = true; this.textContent = "✓ Done (back to bars)"; b.focus(); }
    else { var old = DOC.lines; DOC.lines = b.value.split("\n").map(function (s, i) { return { t: old[i] && old[i].text === s ? old[i].t : null, text: s }; }).filter(function (l) { return l.text.trim(); }); b.hidden = true; $("lines").hidden = false; this.textContent = "✎ Edit as one text"; renderLines(); soon(); }
  };

  /* ---------- 4) Text → Audio ---------- */
  (window.IsleSing ? IsleSing.VOICES : []).forEach(function (v) { $("tts-voice").appendChild(new Option(v.label + " (English)", v.id)); });
  [["bm_george", "UK male (English)"], ["bf_emma", "UK female (English)"]].forEach(function (v) { $("tts-voice").appendChild(new Option(v[1], v[0])); });
  $("tts-beat").onchange = function () { if (this.value === "file") $("beat-file").click(); };
  $("beat-file").onchange = function () { var f = this.files[0]; this.value = ""; if (f) { BEAT = f; toast("Beat: " + f.name); } else $("tts-beat").value = ""; };
  $("tts-go").onclick = function () {
    var lines = DOC.lines.map(function (l) { return l.text; }).filter(function (s) { return s.trim(); });
    if (!lines.length) { toast("Write or transcribe some lyrics first."); return; }
    var btn = this, bpm = +$("tts-bpm").value || 90, bars = lines.length + 2, sr = 44100, mode = $("tts-beat").value;
    btn.disabled = true; prog("tts-prog", 0); $("tts-status").textContent = "Loading the draft voice…";
    IsleSing.draftVocal({ lines: lines, bpm: bpm, bars: bars, firstBar: 1, mode: $("tts-mode").value, voice: $("tts-voice").value, sr: sr, onProgress: function (k, f, a, b) {
      prog("tts-prog", f); $("tts-status").textContent = k === "load" ? "Downloading draft voice (once)… " + Math.round(f * 100) + "%" : "Rapping bar " + a + " of " + b + "…"; } })
    .then(function (r) {
      var beatBlob = mode === "src" ? (SRC && SRC.blob) : mode === "file" ? BEAT : null;
      if (!beatBlob) return [r.audio, r.audio];
      return decode(beatBlob).then(function (b) { return resample(b, sr, 2); }).then(function (b) {
        var n = Math.max(r.audio.length, b.length), L = new Float32Array(n), R = new Float32Array(n);
        L.set(b.getChannelData(0)); R.set(b.getChannelData(1));
        return IsleSing.mix(L, R, r.audio, sr, {});
      });
    }).then(function (lr) {
      OUT = { blob: wav(lr, 44100), name: (DOC.name || "lyrics") + " — draft" };
      var a = $("tts-audio"); a.src = URL.createObjectURL(OUT.blob); a.hidden = false; $("tts-acts").hidden = false;
      $("tts-status").textContent = "Draft ready. Download it (step 5) and run the Colab step to make it your voice."; prog("tts-prog", null);
    }).catch(function (e) { $("tts-status").textContent = "Text → Audio failed: " + (e && e.message || e); prog("tts-prog", null); }).then(function () { btn.disabled = false; });
  };

  /* ---------- 5) export / send ---------- */
  $("ex-txt").onclick = function () { download(new Blob([(DOC.name ? DOC.name + "\n\n" : "") + DOC.lines.map(function (l) { return l.text; }).join("\n") + "\n"], { type: "text/plain" }), safe(DOC.name) + ".txt"); };
  $("ex-wav").onclick = function () { if (!OUT) { toast("Make audio first (step 4)."); return; } download(OUT.blob, safe(OUT.name) + ".wav"); };
  function toMultitrack(blob, name) {
    return open("ipb_inbox", 1, function (d) { d.createObjectStore("items", { keyPath: "id" }); }).then(function (d) { return new Promise(function (res) { var t = d.transaction("items", "readwrite"); t.objectStore("items").put({ id: "in_" + Date.now().toString(36), to: "multitrack", name: name, blob: blob, at: Date.now() }); t.oncomplete = function () { d.close(); res(); }; }); })
      .then(function () { location.href = "../beats/multitrack.html"; });
  }
  $("ex-mt").onclick = function () { if (!OUT) { toast("Make audio first (step 4)."); return; } toMultitrack(OUT.blob, OUT.name); };
  $("ex-mt-src").onclick = function () { if (!SRC) { toast("Pick audio first (step 1)."); return; } toMultitrack(SRC.blob, SRC.name); };
  function listDocs() {
    return docs().then(function (l) {
      var box = $("docs"); box.innerHTML = l.length ? "" : '<p class="muted">Nothing saved yet.</p>';
      l.forEach(function (d) {
        var r = document.createElement("div"); r.className = "doc"; r.innerHTML = '<b></b><span class="muted"></span><button type="button" class="btn">Open</button><button type="button" class="btn danger">🗑</button>';
        r.querySelector("b").textContent = d.name; r.querySelector(".muted").textContent = d.lines.length + " lines · " + new Date(d.updated).toLocaleString();
        var b = r.querySelectorAll(".btn"); b[0].onclick = function () { DOC = d; $("doc-name").value = d.name; renderLines(); renderVersions(); window.scrollTo(0, $("s3").offsetTop); };
        b[1].onclick = function () { if (confirm("Delete “" + d.name + "”?")) delDoc(d.id).then(function () { if (DOC.id === d.id) newDoc(); listDocs(); }); };
        box.appendChild(r);
      });
    });
  }

  /* ---------- boot ---------- */
  newDoc();
  docs().then(function (l) { if (l[0]) { DOC = l[0]; $("doc-name").value = DOC.name; renderLines(); renderVersions(); } }).then(listDocs);
  loadSources().then(function () {
    var q = new URLSearchParams(location.search).get("freestyle");
    if (q && SOURCES["fs:" + q]) { $("src-sel").value = "fs:" + q; $("src-sel").onchange(); }
  });
  window.LyricsLab = { get doc() { return DOC; }, get src() { return SRC; }, get out() { return OUT; } };
})();
