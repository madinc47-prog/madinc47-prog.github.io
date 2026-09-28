/* Isle Voice MVP — voice bank + prompt studio + draft generator.
   Honest free path: no voice cloning in-browser. Prepares files for free RVC / Applio. */
(function () {
  "use strict";

  var SR = 44100;
  var PROJ_KEY = "isv_projects_v1";
  var NOTE = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

  function $(id) { return document.getElementById(id); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function uid(p) { return (p || "id") + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function fmtTime(s) {
    s = Math.max(0, s || 0);
    var m = Math.floor(s / 60), r = Math.floor(s % 60);
    return m + ":" + (r < 10 ? "0" : "") + r;
  }
  function safeName(s) { return String(s || "untitled").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_").slice(0, 60) || "untitled"; }
  function mf(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  var toastTimer;
  function toast(msg) {
    var el = $("isv-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "isv-toast"; el.className = "toast"; el.setAttribute("role", "status");
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove("show"); }, 2800);
  }

  /* ---------------- IndexedDB ---------------- */
  var dbP = null;
  function openDB() {
    if (dbP) return dbP;
    dbP = new Promise(function (res, rej) {
      if (!window.indexedDB) return rej(new Error("IndexedDB unavailable"));
      var r = indexedDB.open("islevoice", 1);
      r.onupgradeneeded = function () {
        var d = r.result;
        if (!d.objectStoreNames.contains("clips")) d.createObjectStore("clips", { keyPath: "id" });
        if (!d.objectStoreNames.contains("takes")) d.createObjectStore("takes", { keyPath: "id" });
      };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
    return dbP;
  }
  function idb(store, mode, fn) {
    return openDB().then(function (d) {
      return new Promise(function (res, rej) {
        var tx = d.transaction(store, mode);
        var req = fn(tx.objectStore(store));
        tx.oncomplete = function () { res(req ? req.result : undefined); };
        tx.onerror = function () { rej(tx.error); };
        tx.onabort = function () { rej(tx.error); };
      });
    });
  }
  var mem = { clips: [], takes: [] }; // fallback when IndexedDB is blocked
  function getAll(store) {
    return idb(store, "readonly", function (st) { return st.getAll(); })
      .catch(function () { return []; })
      .then(function (rows) { return (rows || []).concat(mem[store]); });
  }
  function put(store, item) {
    return idb(store, "readwrite", function (st) { return st.put(item); })
      .catch(function () {
        mem[store] = mem[store].filter(function (x) { return x.id !== item.id; });
        mem[store].push(item);
        toast("Browser storage blocked — kept for this session only.");
      });
  }
  function del(store, id) {
    mem[store] = mem[store].filter(function (x) { return x.id !== id; });
    return idb(store, "readwrite", function (st) { return st.delete(id); }).catch(function () {});
  }

  /* ---------------- Audio helpers ---------------- */
  function decodeBlob(blob) {
    return blob.arrayBuffer().then(function (ab) {
      return new Promise(function (res, rej) {
        var c = new OfflineAudioContext(1, 1, SR);
        c.decodeAudioData(ab, res, function (e) { rej(e || new Error("Could not decode audio")); });
      });
    });
  }
  function wavFromChannels(chs, sr, frames) {
    var nc = chs.length;
    frames = frames == null ? chs[0].length : frames;
    var buf = new ArrayBuffer(44 + frames * nc * 2), v = new DataView(buf);
    function ws(o, s) { for (var i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); }
    ws(0, "RIFF"); v.setUint32(4, 36 + frames * nc * 2, true); ws(8, "WAVE");
    ws(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, nc, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr * nc * 2, true); v.setUint16(32, nc * 2, true); v.setUint16(34, 16, true);
    ws(36, "data"); v.setUint32(40, frames * nc * 2, true);
    var o = 44;
    for (var i = 0; i < frames; i++) {
      for (var ch = 0; ch < nc; ch++) {
        var x = clamp(chs[ch][i] || 0, -1, 1);
        v.setInt16(o, x < 0 ? x * 0x8000 : x * 0x7fff, true);
        o += 2;
      }
    }
    return new Blob([buf], { type: "audio/wav" });
  }
  function bufferToWav(ab, mono) {
    if (mono || ab.numberOfChannels === 1) {
      var n = ab.length, out = new Float32Array(n), nc = ab.numberOfChannels;
      for (var c = 0; c < nc; c++) {
        var d = ab.getChannelData(c);
        for (var i = 0; i < n; i++) out[i] += d[i] / nc;
      }
      return wavFromChannels([out], ab.sampleRate);
    }
    return wavFromChannels([ab.getChannelData(0), ab.getChannelData(1)], ab.sampleRate);
  }
  function blobToWav(blob) { return decodeBlob(blob).then(function (ab) { return bufferToWav(ab, true); }); }

  var liveCtx = null;
  function getLiveCtx() {
    if (!liveCtx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      liveCtx = new AC();
    }
    if (liveCtx.state === "suspended") liveCtx.resume();
    return liveCtx;
  }
  function pickMime() {
    if (!window.MediaRecorder) return null;
    var c = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
    for (var i = 0; i < c.length; i++) {
      if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(c[i])) return c[i];
    }
    return "";
  }
  function extFor(type) {
    if (/webm/.test(type)) return "webm";
    if (/mp4|aac|m4a/.test(type)) return "m4a";
    if (/ogg/.test(type)) return "ogg";
    if (/wav/.test(type)) return "wav";
    if (/mpeg|mp3/.test(type)) return "mp3";
    return "audio";
  }
  function startMic(onLevel) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return Promise.reject(new Error("Microphone not available (use HTTPS or localhost)."));
    }
    var mime = pickMime();
    if (mime === null) return Promise.reject(new Error("MediaRecorder not supported in this browser."));
    return navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
    }).then(function (stream) {
      var mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      var chunks = [];
      mr.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
      var ac = getLiveCtx(), src = ac.createMediaStreamSource(stream), an = ac.createAnalyser();
      an.fftSize = 1024;
      src.connect(an);
      var buf = new Float32Array(1024), raf;
      (function tick() {
        an.getFloatTimeDomainData(buf);
        var p = 0;
        for (var i = 0; i < buf.length; i++) { var a = Math.abs(buf[i]); if (a > p) p = a; }
        if (onLevel) onLevel(p);
        raf = requestAnimationFrame(tick);
      })();
      mr.start(250);
      return {
        stop: function () {
          return new Promise(function (res) {
            mr.onstop = function () {
              cancelAnimationFrame(raf);
              try { src.disconnect(); } catch (e) {}
              stream.getTracks().forEach(function (t) { t.stop(); });
              if (onLevel) onLevel(0);
              res(new Blob(chunks, { type: mr.mimeType || mime || "audio/webm" }));
            };
            mr.stop();
          });
        }
      };
    });
  }

  /* ---------------- ZIP (store, no compression) ---------------- */
  var CRC_T = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(u8) {
    var crc = 0xffffffff;
    for (var i = 0; i < u8.length; i++) crc = CRC_T[(crc ^ u8[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }
  function makeZip(files) {
    var enc = new TextEncoder(), parts = [], central = [], offset = 0, cdSize = 0;
    var d = new Date();
    var dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    var dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    files.forEach(function (f) {
      var name = enc.encode(f.name), data = f.data, crc = crc32(data), size = data.length;
      var lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
      lh.setUint16(8, 0, true); lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true);
      lh.setUint32(14, crc, true); lh.setUint32(18, size, true); lh.setUint32(22, size, true);
      lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
      parts.push(lh.buffer, name, data);
      var ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true);
      ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true); ch.setUint16(12, dosTime, true);
      ch.setUint16(14, dosDate, true); ch.setUint32(16, crc, true); ch.setUint32(20, size, true);
      ch.setUint32(24, size, true); ch.setUint16(28, name.length, true); ch.setUint16(30, 0, true);
      ch.setUint16(32, 0, true); ch.setUint16(34, 0, true); ch.setUint16(36, 0, true);
      ch.setUint32(38, 0, true); ch.setUint32(42, offset, true);
      central.push(ch.buffer, name);
      cdSize += 46 + name.length;
      offset += 30 + name.length + size;
    });
    var end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(4, 0, true); end.setUint16(6, 0, true);
    end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, cdSize, true); end.setUint32(16, offset, true); end.setUint16(20, 0, true);
    return new Blob(parts.concat(central, [end.buffer]), { type: "application/zip" });
  }
  function blobU8(b) { return b.arrayBuffer().then(function (ab) { return new Uint8Array(ab); }); }
  function textU8(s) { return new TextEncoder().encode(s); }
  function downloadBlob(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  /* ---------------- Voice bank ---------------- */
  var bankUrls = [];
  function renderBank() {
    return getAll("clips").then(function (clips) {
      clips.sort(function (a, b) { return a.created - b.created; });
      var total = clips.reduce(function (s, c) { return s + (c.duration || 0); }, 0);
      $("bank-total").textContent = clips.length + " clip" + (clips.length === 1 ? "" : "s") + " · " + fmtTime(total);
      bankUrls.forEach(URL.revokeObjectURL); bankUrls = [];
      var list = $("bank-list");
      if (!clips.length) {
        list.innerHTML = '<div class="empty">No clips yet. Record or upload your first voice clip.</div>';
        return clips;
      }
      list.innerHTML = "";
      clips.forEach(function (c) {
        var url = URL.createObjectURL(c.blob); bankUrls.push(url);
        var el = document.createElement("div");
        el.className = "item";
        el.innerHTML =
          '<div class="item-top"><strong></strong><span></span></div>' +
          '<audio controls preload="none"></audio>' +
          '<div class="item-actions">' +
            '<button class="btn small" data-a="wav">Download WAV</button>' +
            '<a class="btn small ghost" data-a="orig">Original</a>' +
            '<button class="btn small ghost" data-a="ren">Rename</button>' +
            '<button class="btn small ghost" data-a="del">Delete</button>' +
          "</div>";
        el.querySelector("strong").textContent = c.name;
        el.querySelector(".item-top span").textContent = fmtTime(c.duration) + " · " + new Date(c.created).toLocaleDateString();
        el.querySelector("audio").src = url;
        var orig = el.querySelector('[data-a="orig"]');
        orig.href = url; orig.download = safeName(c.name) + "." + extFor(c.type || c.blob.type);
        el.querySelector('[data-a="wav"]').addEventListener("click", function () {
          blobToWav(c.blob).then(function (w) { downloadBlob(w, safeName(c.name) + ".wav"); })
            .catch(function () { toast("Could not convert this clip to WAV."); });
        });
        el.querySelector('[data-a="ren"]').addEventListener("click", function () {
          var n = prompt("Clip name", c.name);
          if (!n) return;
          c.name = n.slice(0, 80);
          put("clips", c).then(renderBank);
        });
        el.querySelector('[data-a="del"]').addEventListener("click", function () {
          if (!confirm("Delete this clip?")) return;
          del("clips", c.id).then(renderBank);
        });
        list.appendChild(el);
      });
      return clips;
    });
  }
  function addClip(blob, name) {
    return decodeBlob(blob).then(function (ab) { return ab.duration; }).catch(function () { return 0; })
      .then(function (dur) {
        return put("clips", { id: uid("clip"), name: name, blob: blob, type: blob.type, duration: dur, created: Date.now() });
      }).then(renderBank);
  }
  var micSession = null, micTimer = null;
  function wireBank() {
    $("btn-mic").addEventListener("click", function () {
      if (micSession) return;
      startMic(function (p) { $("level-bar").style.width = Math.min(100, p * 140) + "%"; })
        .then(function (s) {
          micSession = s;
          var t0 = Date.now();
          $("btn-mic").classList.add("rec-on"); $("btn-mic").disabled = true;
          $("btn-mic-stop").disabled = false;
          micTimer = setInterval(function () { $("mic-time").textContent = fmtTime((Date.now() - t0) / 1000); }, 250);
        })
        .catch(function (e) { toast(e.message || "Microphone permission denied."); });
    });
    $("btn-mic-stop").addEventListener("click", function () {
      if (!micSession) return;
      var s = micSession; micSession = null;
      clearInterval(micTimer);
      $("btn-mic").classList.remove("rec-on"); $("btn-mic").disabled = false;
      $("btn-mic-stop").disabled = true;
      s.stop().then(function (blob) {
        var n = "Voice clip " + new Date().toLocaleString();
        return addClip(blob, n);
      }).then(function () { toast("Clip saved to voice bank"); $("mic-time").textContent = "0:00"; });
    });
    $("clip-file").addEventListener("change", function (e) {
      var files = Array.prototype.slice.call(e.target.files || []);
      e.target.value = "";
      files.reduce(function (p, f) {
        return p.then(function () {
          if (f.size > 60 * 1024 * 1024) { toast(f.name + " is over 60 MB — skipped."); return; }
          return addClip(f, f.name.replace(/\.[^.]+$/, ""));
        });
      }, Promise.resolve()).then(function () { if (files.length) toast(files.length + " clip(s) added"); });
    });
    $("btn-bank-zip").addEventListener("click", function () {
      buildBankFiles("").then(function (files) {
        if (!files.length) { toast("Voice bank is empty."); return; }
        files.push({ name: "README.txt", data: textU8(bankReadme()) });
        downloadBlob(makeZip(files), "isle_voice_bank.zip");
      });
    });
  }
  function buildBankFiles(prefix) {
    return getAll("clips").then(function (clips) {
      clips.sort(function (a, b) { return a.created - b.created; });
      if (clips.length) toast("Converting " + clips.length + " clip(s) to WAV…");
      var files = [], used = {};
      return clips.reduce(function (p, c, i) {
        return p.then(function () {
          return blobToWav(c.blob).then(blobU8).then(function (u8) {
            var base = String(i + 1).padStart(3, "0") + "_" + safeName(c.name);
            if (used[base]) base += "_" + i;
            used[base] = true;
            files.push({ name: prefix + base + ".wav", data: u8 });
          }).catch(function () { /* skip undecodable */ });
        });
      }, Promise.resolve()).then(function () { return files; });
    });
  }
  function bankReadme() {
    return [
      "ISLE VOICE — VOICE BANK",
      "========================",
      "These WAV files (mono, 44.1 kHz, 16-bit) are your voice training data.",
      "",
      "Free path to a voice model:",
      "1. Open a free RVC or Applio Google Colab notebook (search 'RVC WebUI Colab' or 'Applio Colab').",
      "2. Upload these WAVs as your dataset.",
      "3. Train (10-30 minutes of clean audio is a good start).",
      "4. Use the trained model to convert a sung/rapped vocal into your voice.",
      "",
      "RVC:    https://github.com/RVC-Project/Retrieval-based-Voice-Conversion-WebUI",
      "Applio: https://github.com/IAHispano/Applio",
      "",
      "Only train on voices you own or have permission to use."
    ].join("\n");
  }

  /* ---------------- Music engine ---------------- */
  function hashStr(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function mulberry(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  var GENRES = {
    trap: { bpm: 140, kick: "x......x..x.....", snare: "........x.......", clap: "........x.......", hat: "x.x.x.x.x.x.x.x.", rolls: true, bass: "808", chords: "pad", chordPat: "x...............", lead: "bell", swing: 0 },
    drill: { bpm: 142, kick: "x.........x.....", snare: "........x.......", hat: "x..x..x.x..x..x.", rim: "...x..x....x..x.", bass: "808glide", chords: "pad", chordPat: "x...............", lead: "piano", swing: 0 },
    afrobeats: { bpm: 104, kick: "x.....x...x.....", clap: "....x.......x...", shaker: "xxxxxxxxxxxxxxxx", rim: "x..x..x...x.x...", perc: "..x.....x.x...x.", bass: "sub", bassPat: "x.....x...x..x..", chords: "keys", chordPat: "..x...x...x..x..", lead: "pluck", swing: 0.12 },
    dancehall: { bpm: 98, kick: "x...x...x...x...", snare: "...x..x....x..x.", hat: "..x...x...x...x.", bass: "sub", bassPat: "x..x..x...x.....", chords: "stab", chordPat: "x..x..x...x.....", swing: 0 },
    bouyon: { bpm: 156, kick: "x...x...x...x...", snare: "....x.......x...", hat: "xxxxxxxxxxxxxxxx", ohat: "..x...x...x...x.", perc: "x..x..x..x..x.x.", bass: "pluck8", chords: "stab", chordPat: "x..x..x...x..x..", lead: "saw", swing: 0 },
    reggae: { bpm: 76, kick: "........x.......", rim: "........x.......", hat: "x.x.x.x.x.x.x.x.", bass: "sub", bassPat: "x..x..x...x.x...", chords: "skank", chordPat: "..x...x...x...x.", swing: 0.1 },
    rnb: { bpm: 86, kick: "x......x.x......", snare: "....x.......x...", hat: "x.x.x.x.x.x.x.x.", bass: "sub", chords: "keys", chordPat: "x.....x.........", swing: 0.15, sevenths: true },
    lofi: { bpm: 80, kick: "x.......x.x.....", snare: "....x.......x...", hat: "x.x.x.x.x.x.x.x.", bass: "sub", chords: "keys", chordPat: "x.......x.......", swing: 0.28, sevenths: true, vinyl: true, lp: 5000 },
    pop: { bpm: 116, kick: "x...x...x...x...", clap: "....x.......x...", hat: "..x...x...x...x.", bass: "pluck8", chords: "pad", chordPat: "x...............", lead: "pluck", swing: 0 }
  };
  var MOODS = {
    dark: { key: 5, minor: true, cut: 1100, verb: 0.25 },
    sad: { key: 9, minor: true, cut: 1400, verb: 0.35, sevenths: true },
    chill: { key: 2, minor: true, cut: 1700, verb: 0.35, sevenths: true },
    energetic: { key: 0, minor: true, cut: 3200, verb: 0.18, energy: true },
    happy: { key: 7, minor: false, cut: 3000, verb: 0.2 },
    romantic: { key: 3, minor: false, cut: 2000, verb: 0.35, sevenths: true }
  };
  var MINOR_PROGS = [
    [[0, "m"], [8, "M"], [3, "M"], [10, "M"]],
    [[0, "m"], [5, "m"], [8, "M"], [7, "m"]],
    [[0, "m"], [10, "M"], [8, "M"], [10, "M"]],
    [[0, "m"], [3, "M"], [5, "m"], [8, "M"]]
  ];
  var MAJOR_PROGS = [
    [[0, "M"], [7, "M"], [9, "m"], [5, "M"]],
    [[0, "M"], [9, "m"], [5, "M"], [7, "M"]],
    [[5, "M"], [0, "M"], [7, "M"], [9, "m"]],
    [[0, "M"], [4, "m"], [5, "M"], [7, "M"]]
  ];
  var ROMAN_MIN = { 0: "i", 3: "III", 5: "iv", 7: "v", 8: "VI", 10: "VII" };
  var ROMAN_MAJ = { 0: "I", 4: "iii", 5: "IV", 7: "V", 9: "vi" };

  function syllables(word) {
    var w = word.toLowerCase().replace(/[^a-z']/g, "");
    if (!w) return 0;
    var groups = w.match(/[aeiouy]+/g);
    var n = groups ? groups.length : 1;
    if (n > 1 && /[^aeiou]e$/.test(w) && !/le$/.test(w)) n--;
    return Math.max(1, n);
  }
  function buildGuide(P, prog, key, minor, rng) {
    var lines = String(P.lyrics || "").split(/\n/).map(function (l) { return l.trim(); }).filter(Boolean);
    if (!lines.length) return [];
    var penta = minor ? [0, 3, 5, 7, 10] : [0, 2, 4, 7, 9];
    var pool = [];
    for (var m = 57; m <= 79; m++) if (penta.indexOf(((m - key) % 12 + 12) % 12) !== -1) pool.push(m);
    var idx = Math.floor(pool.length / 2);
    var notes = [];
    for (var bar = 0; bar < P.bars && bar < lines.length; bar++) {
      var syl = 0;
      lines[bar].split(/\s+/).forEach(function (w) { syl += syllables(w); });
      if (!syl) continue;
      syl = Math.min(syl, 24);
      var stepLen = syl <= 7 ? 2 : syl <= 14 ? 1 : 14 / syl;
      var start = syl <= 7 ? (rng() < 0.5 ? 0 : 1) : 0;
      var ch = prog[bar % prog.length];
      var chordPcs = (ch[1] === "m" ? [0, 3, 7] : [0, 4, 7]).map(function (iv) { return (key + ch[0] + iv) % 12; });
      for (var s = 0; s < syl; s++) {
        var moves = [-2, -1, -1, 0, 1, 1, 2];
        idx = clamp(idx + moves[Math.floor(rng() * moves.length)], 0, pool.length - 1);
        var midi = pool[idx];
        var last = s === syl - 1;
        if (last || s === 0) {
          var best = midi, bestD = 99;
          pool.forEach(function (pm, pi) {
            if (chordPcs.indexOf(pm % 12) !== -1 && Math.abs(pm - midi) < bestD) { bestD = Math.abs(pm - midi); best = pm; idx = pi; }
          });
          midi = best;
        }
        var st = bar * 16 + start + s * stepLen;
        var dur = last ? Math.max(stepLen, 16 - (start + s * stepLen) - 0.5) : stepLen * 0.9;
        notes.push({ step: st, dur: dur, midi: midi });
      }
    }
    return notes;
  }

  function normalize(ab, target) {
    var peak = 0, ch, i, d;
    for (ch = 0; ch < ab.numberOfChannels; ch++) {
      d = ab.getChannelData(ch);
      for (i = 0; i < d.length; i++) { var a = Math.abs(d[i]); if (a > peak) peak = a; }
    }
    if (peak < 1e-6) return ab;
    var g = target / peak;
    for (ch = 0; ch < ab.numberOfChannels; ch++) {
      d = ab.getChannelData(ch);
      for (i = 0; i < d.length; i++) d[i] *= g;
    }
    return ab;
  }
  function impulse(c, secs, decay) {
    var len = Math.floor(c.sampleRate * secs), b = c.createBuffer(2, len, c.sampleRate);
    for (var ch = 0; ch < 2; ch++) {
      var d = b.getChannelData(ch);
      for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return b;
  }
  function getNoise(c) {
    if (!c._noise) {
      var len = c.sampleRate * 2, b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      c._noise = b;
    }
    return c._noise;
  }
  function noise(c, t, dur) {
    var s = c.createBufferSource();
    s.buffer = getNoise(c); s.loop = true;
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
    return s;
  }
  function ad(p, t, a, peak, d) {
    p.setValueAtTime(0.0001, t);
    p.exponentialRampToValueAtTime(peak, t + a);
    p.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  function osc(c, type, f, t, stop) {
    var o = c.createOscillator();
    o.type = type; o.frequency.value = f;
    o.start(t); o.stop(stop);
    return o;
  }
  function filt(c, type, f, q) {
    var b = c.createBiquadFilter();
    b.type = type; b.frequency.value = f; if (q) b.Q.value = q;
    return b;
  }
  function chain() {
    for (var i = 0; i < arguments.length - 1; i++) arguments[i].connect(arguments[i + 1]);
    return arguments[arguments.length - 1];
  }

  var DRUM = {
    kick: function (c, d, t, v) {
      var o = osc(c, "sine", 150, t, t + 0.6), g = c.createGain();
      o.frequency.setValueAtTime(155, t); o.frequency.exponentialRampToValueAtTime(44, t + 0.12);
      ad(g.gain, t, 0.002, v, 0.45); chain(o, g, d);
      var n = noise(c, t, 0.02), g2 = c.createGain();
      ad(g2.gain, t, 0.001, 0.25 * v, 0.012); chain(n, filt(c, "highpass", 2500), g2, d);
    },
    snare: function (c, d, t, v) {
      var o = osc(c, "triangle", 190, t, t + 0.3), g = c.createGain();
      o.frequency.exponentialRampToValueAtTime(120, t + 0.1);
      ad(g.gain, t, 0.001, 0.5 * v, 0.12); chain(o, g, d);
      var n = noise(c, t, 0.3), g2 = c.createGain();
      ad(g2.gain, t, 0.001, 0.75 * v, 0.18); chain(n, filt(c, "highpass", 1600), g2, d);
    },
    clap: function (c, d, t, v) {
      var n = noise(c, t, 0.4), g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      [0, 0.011, 0.022].forEach(function (o) {
        g.gain.setValueAtTime(0.85 * v, t + o);
        g.gain.exponentialRampToValueAtTime(0.1 * v, t + o + 0.009);
      });
      g.gain.setValueAtTime(0.75 * v, t + 0.033);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      chain(n, filt(c, "bandpass", 1200, 1.1), g, d);
    },
    hat: function (c, d, t, v, dur) {
      var n = noise(c, t, (dur || 0.05) + 0.02), g = c.createGain();
      ad(g.gain, t, 0.001, 0.35 * v, dur || 0.05); chain(n, filt(c, "highpass", 7500), g, d);
    },
    rim: function (c, d, t, v) {
      var o = osc(c, "triangle", 1700, t, t + 0.08), g = c.createGain();
      ad(g.gain, t, 0.001, 0.6 * v, 0.04); chain(o, filt(c, "bandpass", 1800, 3), g, d);
    },
    shaker: function (c, d, t, v) {
      var n = noise(c, t, 0.12), g = c.createGain();
      ad(g.gain, t, 0.012, 0.3 * v, 0.06); chain(n, filt(c, "bandpass", 6000, 1), g, d);
    },
    perc: function (c, d, t, v) {
      var o = osc(c, "sine", 520, t, t + 0.2), g = c.createGain();
      o.frequency.setValueAtTime(650, t); o.frequency.exponentialRampToValueAtTime(420, t + 0.05);
      ad(g.gain, t, 0.001, 0.55 * v, 0.12); chain(o, g, d);
    }
  };

  function renderDraft(P) {
    var G = GENRES[P.genre] || GENRES.trap, M = MOODS[P.mood] || MOODS.dark;
    var rng = mulberry(hashStr([P.name, P.genre, P.mood, P.key, P.variation].join("|")));
    var key = P.key === "auto" ? M.key : +P.key;
    var minor = M.minor;
    var progs = minor ? MINOR_PROGS : MAJOR_PROGS;
    var prog = progs[Math.floor(rng() * progs.length)];
    var sev = !!(G.sevenths || M.sevenths);
    var bpm = clamp(+P.tempo || G.bpm, 60, 180);
    var sd = 60 / bpm / 4;
    var bars = +P.bars || 8;
    var totalSteps = bars * 16;
    var len = totalSteps * sd;
    var frames = Math.ceil(len * SR);

    function tAt(step) {
      var s = Math.floor(step) % 16;
      return step * sd + (s % 2 === 1 && step === Math.floor(step) ? sd * (G.swing || 0) : 0);
    }
    function chordNotes(bar) {
      var ch = prog[bar % prog.length];
      var root = (key + ch[0]) % 12;
      var ivs = ch[1] === "m" ? [0, 3, 7] : [0, 4, 7];
      if (sev) ivs = ivs.concat(ch[1] === "m" ? [10] : [11]);
      var base = 48 + root;
      if (base > 54) base -= 12;
      return { root: root, notes: ivs.map(function (iv) { return base + iv; }) };
    }
    function chordName(ch) {
      var n = NOTE[(key + ch[0]) % 12] + (ch[1] === "m" ? "m" : "");
      return sev ? n + (ch[1] === "m" ? "7" : "maj7") : n;
    }

    /* ---- instrumental ---- */
    var c = new OfflineAudioContext(2, frames, SR);
    var comp = c.createDynamicsCompressor();
    comp.threshold.value = -12; comp.ratio.value = 3.5; comp.attack.value = 0.005; comp.release.value = 0.2;
    var out = c.createGain(); out.gain.value = 0.9;
    comp.connect(out); out.connect(c.destination);
    var verb = c.createConvolver(); verb.buffer = impulse(c, 2.4, 2.6);
    verb.connect(comp);
    function bus(vol, send, lp, pan) {
      var g = c.createGain(); g.gain.value = vol;
      var node = g;
      if (lp) { var f = filt(c, "lowpass", lp, 0.5); g.connect(f); node = f; }
      if (pan && c.createStereoPanner) { var p = c.createStereoPanner(); p.pan.value = pan; node.connect(p); node = p; }
      node.connect(comp);
      if (send) { var s = c.createGain(); s.gain.value = send; node.connect(s); s.connect(verb); }
      return g;
    }
    var drums = bus(0.9, 0.04, G.lp || 0);
    var hats = bus(0.6, 0.03, G.lp || 0, 0.2);
    var bassB = bus(0.85, 0, 0);
    var chordB = bus(0.5, M.verb, M.cut * 1.6);
    var leadB = bus(0.3, M.verb + 0.1, G.lp || 0, -0.2);

    function pat(str, s) { return str && str[s] === "x"; }

    // drums
    for (var bar = 0; bar < bars; bar++) {
      var roll = G.rolls && rng() < 0.55;
      for (var s = 0; s < 16; s++) {
        var st = bar * 16 + s, t = tAt(st);
        if (pat(G.kick, s)) DRUM.kick(c, drums, t, 1);
        if (pat(G.snare, s)) DRUM.snare(c, drums, t, 1);
        if (pat(G.clap, s)) DRUM.clap(c, drums, t, 0.9);
        if (pat(G.rim, s)) DRUM.rim(c, drums, t, 0.8);
        if (pat(G.perc, s)) DRUM.perc(c, drums, t, 0.8);
        if (pat(G.shaker, s)) DRUM.shaker(c, hats, t, s % 4 === 2 ? 1 : 0.6);
        if (pat(G.ohat, s)) DRUM.hat(c, hats, t, 0.8, 0.28);
        if (pat(G.hat, s)) {
          if (roll && s >= 12) {
            DRUM.hat(c, hats, t, 0.8); DRUM.hat(c, hats, t + sd / 2, 0.6);
          } else {
            DRUM.hat(c, hats, t, P.mood === "chill" ? 0.6 : (s % 4 === 0 ? 1 : 0.75));
          }
        } else if (M.energy && G.hat && s % 2 === 1) {
          DRUM.hat(c, hats, t, 0.35);
        }
      }
    }

    // bass
    for (bar = 0; bar < bars; bar++) {
      var cn = chordNotes(bar);
      var root808 = 28 + ((cn.root - 4 + 12) % 12);
      var rootSub = 36 + cn.root;
      if (rootSub > 43) rootSub -= 12;
      var bpat = G.bassPat || G.kick;
      var hits = [];
      if (G.bass === "pluck8") {
        for (s = 0; s < 16; s += 2) hits.push(s);
      } else {
        for (s = 0; s < 16; s++) if (pat(bpat, s)) hits.push(s);
      }
      var prevF = null;
      hits.forEach(function (hs, hi) {
        var next = hi + 1 < hits.length ? hits[hi + 1] : 16;
        var t0 = tAt(bar * 16 + hs), dur = (next - hs) * sd;
        if (G.bass === "808" || G.bass === "808glide") {
          var f = mf(root808 + (hi > 0 && rng() < 0.25 ? 12 : 0));
          var o = osc(c, "sine", f, t0, t0 + dur + 0.05), g = c.createGain();
          if (G.bass === "808glide" && prevF && prevF !== f) {
            o.frequency.setValueAtTime(prevF, t0); o.frequency.exponentialRampToValueAtTime(f, t0 + 0.12);
          } else {
            o.frequency.setValueAtTime(f * 1.8, t0); o.frequency.exponentialRampToValueAtTime(f, t0 + 0.035);
          }
          g.gain.setValueAtTime(0.0001, t0);
          g.gain.exponentialRampToValueAtTime(0.8, t0 + 0.005);
          g.gain.setValueAtTime(0.8, t0 + Math.max(0.01, dur - 0.06));
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
          var ws = c.createWaveShaper();
          var curve = new Float32Array(1024);
          for (var i = 0; i < 1024; i++) { var x = i / 512 - 1; curve[i] = Math.tanh(x * 2.2); }
          ws.curve = curve;
          chain(o, g, ws, filt(c, "lowpass", 900), bassB);
          prevF = f;
        } else if (G.bass === "pluck8") {
          var fp = mf(rootSub + 12 + (hs % 4 === 2 ? 12 : 0));
          var o1 = osc(c, "sawtooth", fp, t0, t0 + dur), g1 = c.createGain(), lp = filt(c, "lowpass", 1400, 4);
          lp.frequency.setValueAtTime(1600, t0); lp.frequency.exponentialRampToValueAtTime(220, t0 + dur * 0.9);
          ad(g1.gain, t0, 0.004, 0.35, dur * 0.9);
          chain(o1, lp, g1, bassB);
        } else {
          var fs = mf(rootSub + (hi % 3 === 2 && rng() < 0.4 ? 7 : 0));
          var d2 = Math.min(dur, 4 * sd) * 0.95;
          var o2 = osc(c, "sine", fs, t0, t0 + d2 + 0.05), o3 = osc(c, "triangle", fs, t0, t0 + d2 + 0.05);
          var g2 = c.createGain(), g3 = c.createGain();
          g3.gain.value = 0.25;
          g2.gain.setValueAtTime(0.0001, t0);
          g2.gain.exponentialRampToValueAtTime(0.7, t0 + 0.01);
          g2.gain.setValueAtTime(0.7, t0 + Math.max(0.02, d2 - 0.05));
          g2.gain.exponentialRampToValueAtTime(0.0001, t0 + d2);
          o2.connect(g2); chain(o3, g3, g2); g2.connect(bassB);
        }
      });
    }

    // chords
    for (bar = 0; bar < bars; bar++) {
      var chn = chordNotes(bar).notes;
      var cp = G.chordPat || "x...............";
      var ch_hits = [];
      for (s = 0; s < 16; s++) if (pat(cp, s)) ch_hits.push(s);
      ch_hits.forEach(function (hs, hi) {
        var next = hi + 1 < ch_hits.length ? ch_hits[hi + 1] : 16;
        var t0 = tAt(bar * 16 + hs), dur = (next - hs) * sd;
        chn.forEach(function (m) {
          var f = mf(m), g = c.createGain();
          if (G.chords === "pad") {
            [-8, 8].forEach(function (det) {
              var o = osc(c, "sawtooth", f, t0, t0 + dur + 0.4); o.detune.value = det; o.connect(g);
            });
            g.gain.setValueAtTime(0.0001, t0);
            g.gain.exponentialRampToValueAtTime(0.05, t0 + 0.15);
            g.gain.setValueAtTime(0.05, t0 + Math.max(0.16, dur - 0.05));
            g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 0.35);
          } else if (G.chords === "keys") {
            var o1 = osc(c, "sine", f, t0, t0 + dur + 0.3), o2 = osc(c, "sine", f * 2, t0, t0 + dur + 0.3), h = c.createGain();
            h.gain.value = 0.15; o1.connect(g); chain(o2, h, g);
            g.gain.setValueAtTime(0.0001, t0);
            g.gain.exponentialRampToValueAtTime(0.12, t0 + 0.006);
            g.gain.exponentialRampToValueAtTime(0.04, t0 + Math.max(0.05, dur));
            g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 0.25);
          } else if (G.chords === "skank") {
            var o3 = osc(c, "square", f * 2, t0, t0 + 0.2), bp = filt(c, "bandpass", 1300, 1.2);
            chain(o3, bp, g); ad(g.gain, t0, 0.003, 0.05, 0.11);
          } else {
            var o4 = osc(c, "sawtooth", f, t0, t0 + 0.4), lp = filt(c, "lowpass", 3000, 2);
            lp.frequency.setValueAtTime(3200, t0); lp.frequency.exponentialRampToValueAtTime(500, t0 + 0.25);
            chain(o4, lp, g); ad(g.gain, t0, 0.004, 0.07, 0.25);
          }
          g.connect(chordB);
        });
      });
    }

    // lead motif (seeded, repeats over chords)
    if (G.lead) {
      var motif = [];
      for (s = 0; s < 16; s += 2) motif.push(rng() < 0.3 ? -1 : Math.floor(rng() * 4));
      for (bar = 0; bar < bars; bar++) {
        var ln = chordNotes(bar).notes.slice(0, 3).map(function (m) { return m + 24; });
        ln.push(ln[0] + 12);
        motif.forEach(function (deg, mi) {
          if (deg < 0) return;
          var t0 = tAt(bar * 16 + mi * 2), f = mf(ln[deg]), g = c.createGain(), dd = sd * 2;
          if (G.lead === "bell") {
            var a = osc(c, "sine", f, t0, t0 + 1.2), b = osc(c, "sine", f * 2.76, t0, t0 + 1.2), bg = c.createGain();
            bg.gain.value = 0.25; a.connect(g); chain(b, bg, g); ad(g.gain, t0, 0.002, 0.16, 1.0);
          } else if (G.lead === "piano") {
            var p1 = osc(c, "triangle", f / 2, t0, t0 + 0.9), p2 = osc(c, "sine", f, t0, t0 + 0.9);
            p1.connect(g); p2.connect(g); ad(g.gain, t0, 0.003, 0.18, 0.8);
          } else if (G.lead === "saw") {
            var s1 = osc(c, "sawtooth", f, t0, t0 + dd), s2 = osc(c, "sawtooth", f, t0, t0 + dd), lp2 = filt(c, "lowpass", 2600, 1);
            s2.detune.value = 12; s1.connect(lp2); s2.connect(lp2); lp2.connect(g); ad(g.gain, t0, 0.005, 0.1, dd * 0.9);
          } else {
            var q = osc(c, "sawtooth", f, t0, t0 + 0.5), lp3 = filt(c, "lowpass", 3000, 3);
            lp3.frequency.setValueAtTime(3500, t0); lp3.frequency.exponentialRampToValueAtTime(400, t0 + 0.3);
            chain(q, lp3, g); ad(g.gain, t0, 0.003, 0.12, 0.4);
          }
          g.connect(leadB);
        });
      }
    }

    if (G.vinyl) {
      var vn = noise(c, 0, len), vg = c.createGain();
      vg.gain.value = 0.012; chain(vn, filt(c, "bandpass", 3500, 0.6), vg, out);
      for (var k = 0; k < len * 6; k++) {
        var tc = rng() * len, cn2 = noise(c, tc, 0.004), cg = c.createGain();
        ad(cg.gain, tc, 0.0005, 0.08 * rng(), 0.003); chain(cn2, filt(c, "highpass", 2000), cg, out);
      }
    }

    /* ---- guide melody ---- */
    var notes = P.guide ? buildGuide(P, prog, key, minor, rng) : [];
    var guideP = Promise.resolve(null);
    if (notes.length) {
      var gc = new OfflineAudioContext(2, frames, SR);
      var gout = gc.createGain(); gout.gain.value = 0.8;
      var gverb = gc.createConvolver(); gverb.buffer = impulse(gc, 1.6, 3);
      var gsend = gc.createGain(); gsend.gain.value = 0.2;
      gout.connect(gc.destination); gout.connect(gsend); gsend.connect(gverb); gverb.connect(gc.destination);
      notes.forEach(function (n) {
        var t0 = n.step * sd, dur = Math.max(0.08, n.dur * sd), f = mf(n.midi);
        var o = gc.createOscillator(), o2 = gc.createOscillator(), g = gc.createGain(), h = gc.createGain();
        o.type = "triangle"; o.frequency.value = f; o2.type = "sine"; o2.frequency.value = f * 2; h.gain.value = 0.2;
        var lfo = gc.createOscillator(), lg = gc.createGain();
        lfo.frequency.value = 5.5; lg.gain.setValueAtTime(0, t0); lg.gain.linearRampToValueAtTime(f * 0.007, t0 + Math.min(0.3, dur));
        lfo.connect(lg); lg.connect(o.frequency);
        var lp = gc.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2400;
        o.connect(lp); o2.connect(h); h.connect(lp); lp.connect(g); g.connect(gout);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.3, t0 + 0.03);
        g.gain.setValueAtTime(0.3, t0 + Math.max(0.04, dur - 0.06));
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        [o, o2, lfo].forEach(function (x) { x.start(t0); x.stop(t0 + dur + 0.05); });
      });
      guideP = gc.startRendering();
    }

    var info = {
      key: NOTE[key] + (minor ? " minor" : " major"),
      prog: prog.map(chordName).join(" – "),
      roman: prog.map(function (ch) { return (minor ? ROMAN_MIN : ROMAN_MAJ)[ch[0]] || "?"; }).join("–"),
      bpm: bpm, bars: bars, seconds: len, guideNotes: notes.length
    };
    return Promise.all([c.startRendering(), guideP]).then(function (r) {
      normalize(r[0], 0.89);
      if (r[1]) normalize(r[1], 0.7);
      return { inst: r[0], guide: r[1], info: info };
    });
  }

  /* ---------------- Projects ---------------- */
  function loadProjects() {
    try { var a = JSON.parse(localStorage.getItem(PROJ_KEY) || "[]"); return Array.isArray(a) ? a : []; }
    catch (e) { return []; }
  }
  function saveProjects(list) {
    try { localStorage.setItem(PROJ_KEY, JSON.stringify(list)); }
    catch (e) { toast("Could not save — browser storage full or blocked."); }
  }
  var current = { id: uid("proj") };
  function readForm() {
    return {
      id: current.id,
      name: $("p-name").value.trim() || "Untitled",
      genre: $("p-genre").value,
      mood: $("p-mood").value,
      tempo: +$("p-tempo").value,
      key: $("p-key").value,
      bars: +$("p-bars").value,
      variation: clamp(+$("p-var").value || 1, 1, 999),
      lyrics: $("p-lyrics").value,
      guide: $("p-guide").checked
    };
  }
  function writeForm(p) {
    current.id = p.id;
    $("p-name").value = p.name || "";
    $("p-genre").value = p.genre || "trap";
    $("p-mood").value = p.mood || "dark";
    $("p-tempo").value = p.tempo || 140;
    $("p-tempo-val").textContent = $("p-tempo").value;
    $("p-key").value = p.key == null ? "auto" : String(p.key);
    $("p-bars").value = String(p.bars || 8);
    $("p-var").value = p.variation || 1;
    $("p-lyrics").value = p.lyrics || "";
    $("p-guide").checked = p.guide !== false;
  }
  function saveCurrent(silent) {
    var p = readForm();
    if (!$("p-name").value.trim()) { if (!silent) toast("Add a project name first."); return null; }
    var list = loadProjects();
    var i = list.findIndex(function (x) { return x.id === p.id; });
    var now = Date.now();
    if (i === -1) { p.created = now; p.updated = now; list.push(p); }
    else { p.created = list[i].created || now; p.updated = now; list[i] = p; }
    saveProjects(list);
    renderLibrary();
    if (!silent) toast("Project saved");
    return p;
  }
  function renderLibrary() {
    var list = loadProjects().sort(function (a, b) { return (b.updated || 0) - (a.updated || 0); });
    var el = $("lib-list");
    if (!list.length) { el.innerHTML = '<div class="empty">No saved projects yet. Generate or save a draft to add one.</div>'; return; }
    el.innerHTML = "";
    list.forEach(function (p) {
      var it = document.createElement("div");
      it.className = "item";
      it.innerHTML =
        '<div class="item-top"><strong></strong><span></span></div>' +
        '<div class="item-actions">' +
          '<button class="btn small" data-a="open">Open &amp; generate</button>' +
          '<button class="btn small ghost" data-a="dup">Duplicate</button>' +
          '<button class="btn small ghost" data-a="del">Delete</button>' +
        "</div>";
      it.querySelector("strong").textContent = p.name + (p.id === current.id ? "  (open)" : "");
      it.querySelector(".item-top span").textContent =
        p.genre + " · " + p.mood + " · " + p.tempo + " BPM · " + p.bars + " bars · v" + p.variation + " · " + new Date(p.updated).toLocaleDateString();
      it.querySelector('[data-a="open"]').addEventListener("click", function () {
        writeForm(p); renderLibrary(); generate();
        $("studio").scrollIntoView({ behavior: "smooth" });
      });
      it.querySelector('[data-a="dup"]').addEventListener("click", function () {
        var copy = JSON.parse(JSON.stringify(p));
        copy.id = uid("proj"); copy.name = p.name + " (copy)"; copy.created = copy.updated = Date.now();
        var l = loadProjects(); l.push(copy); saveProjects(l); renderLibrary();
      });
      it.querySelector('[data-a="del"]').addEventListener("click", function () {
        if (!confirm("Delete project \"" + p.name + "\"? (Voice bank clips are kept.)")) return;
        saveProjects(loadProjects().filter(function (x) { return x.id !== p.id; }));
        getAll("takes").then(function (ts) {
          return Promise.all(ts.filter(function (t) { return t.projectId === p.id; }).map(function (t) { return del("takes", t.id); }));
        });
        renderLibrary();
      });
      el.appendChild(it);
    });
  }

  /* ---------------- Generate + draft UI ---------------- */
  var draft = null, draftUrls = [];
  function mixPreview(inst, guide) {
    var n = inst.length, L = new Float32Array(n), R = new Float32Array(n);
    var a = inst.getChannelData(0), b = inst.getChannelData(1);
    var gl = guide ? guide.getChannelData(0) : null, gr = guide ? guide.getChannelData(1) : null;
    for (var i = 0; i < n; i++) {
      L[i] = Math.tanh((a[i] + (gl ? gl[i] * 0.85 : 0)) * 1.1) * 0.95;
      R[i] = Math.tanh((b[i] + (gr ? gr[i] * 0.85 : 0)) * 1.1) * 0.95;
    }
    return wavFromChannels([L, R], SR);
  }
  function generate() {
    var P = readForm();
    if (!$("p-name").value.trim()) { toast("Add a project name first."); $("p-name").focus(); return Promise.resolve(null); }
    saveCurrent(true);
    $("btn-gen").disabled = true;
    $("gen-status").textContent = "Rendering…";
    return renderDraft(P).then(function (r) {
      draftUrls.forEach(URL.revokeObjectURL); draftUrls = [];
      var instWav = bufferToWav(r.inst, false);
      var guideWav = r.guide ? bufferToWav(r.guide, false) : null;
      var mixWav = r.guide ? mixPreview(r.inst, r.guide) : instWav;
      draft = { project: P, info: r.info, inst: instWav, guide: guideWav, mix: mixWav };
      var mixUrl = URL.createObjectURL(mixWav), instUrl = URL.createObjectURL(instWav);
      draftUrls.push(mixUrl, instUrl);
      $("draft").hidden = false;
      $("draft-title").textContent = P.name + (r.guide ? " — preview with guide melody" : " — instrumental");
      $("draft-meta").textContent = r.info.key + " · " + r.info.prog + " (" + r.info.roman + ") · " + r.info.bpm + " BPM · " + r.info.bars + " bars · " + fmtTime(r.info.seconds);
      $("draft-audio").src = mixUrl;
      var di = $("dl-inst");
      di.href = instUrl; di.download = safeName(P.name) + "_instrumental.wav";
      var dg = $("dl-guide");
      if (guideWav) {
        var gUrl = URL.createObjectURL(guideWav); draftUrls.push(gUrl);
        dg.href = gUrl; dg.download = safeName(P.name) + "_guide_melody.wav"; dg.hidden = false;
      } else { dg.hidden = true; }
      var msg = "Draft ready";
      if (P.guide && !r.info.guideNotes) msg += " (add lyrics for a guide melody)";
      $("gen-status").textContent = msg;
      renderTakes();
      return draft;
    }).catch(function (e) {
      console.error(e);
      $("gen-status").textContent = "Render failed: " + e.message;
      return null;
    }).then(function (d) { $("btn-gen").disabled = false; return d; });
  }
  function lyricsText(p) {
    return (p.name || "Untitled") + "\n" + p.genre + " · " + p.mood + " · " + p.tempo + " BPM\n\n" + (p.lyrics || "(no lyrics)") + "\n";
  }

  /* takes: guide vocal over the draft */
  var takeSession = null, takeTimer = null, takePlayer = null, takeUrls = [];
  function renderTakes() {
    var list = $("take-list");
    return getAll("takes").then(function (ts) {
      ts = ts.filter(function (t) { return t.projectId === current.id; }).sort(function (a, b) { return a.created - b.created; });
      takeUrls.forEach(URL.revokeObjectURL); takeUrls = [];
      if (!ts.length) { list.innerHTML = '<div class="empty">No takes for this project yet.</div>'; return ts; }
      list.innerHTML = "";
      ts.forEach(function (t) {
        var url = URL.createObjectURL(t.blob); takeUrls.push(url);
        var el = document.createElement("div");
        el.className = "item";
        el.innerHTML =
          '<div class="item-top"><strong></strong><span></span></div><audio controls preload="none"></audio>' +
          '<div class="item-actions"><button class="btn small" data-a="wav">Download WAV</button>' +
          '<button class="btn small ghost" data-a="del">Delete</button></div>';
        el.querySelector("strong").textContent = t.name;
        el.querySelector(".item-top span").textContent = fmtTime(t.duration);
        el.querySelector("audio").src = url;
        el.querySelector('[data-a="wav"]').addEventListener("click", function () {
          blobToWav(t.blob).then(function (w) { downloadBlob(w, safeName(t.name) + ".wav"); })
            .catch(function () { toast("Could not convert take."); });
        });
        el.querySelector('[data-a="del"]').addEventListener("click", function () {
          if (!confirm("Delete this take?")) return;
          del("takes", t.id).then(renderTakes);
        });
        list.appendChild(el);
      });
      return ts;
    });
  }
  function stopTake() {
    if (!takeSession) return;
    var s = takeSession; takeSession = null;
    clearInterval(takeTimer);
    if (takePlayer) { takePlayer.pause(); takePlayer = null; }
    $("btn-take").classList.remove("rec-on"); $("btn-take").disabled = false;
    $("btn-take-stop").disabled = true;
    s.stop().then(function (blob) {
      return decodeBlob(blob).then(function (ab) { return ab.duration; }).catch(function () { return 0; }).then(function (dur) {
        var n = (draft ? draft.project.name : "Project") + " take " + new Date().toLocaleTimeString();
        return put("takes", { id: uid("take"), projectId: current.id, name: n, blob: blob, type: blob.type, duration: dur, created: Date.now() });
      });
    }).then(renderTakes).then(function () { toast("Take saved"); });
  }
  function wireTakes() {
    $("btn-take").addEventListener("click", function () {
      if (!draft || takeSession) { if (!draft) toast("Generate a draft first."); return; }
      startMic(null).then(function (s) {
        takeSession = s;
        takePlayer = new Audio(URL.createObjectURL(draft.mix));
        takePlayer.onended = stopTake;
        takePlayer.play().catch(function () {});
        var t0 = Date.now();
        $("btn-take").classList.add("rec-on"); $("btn-take").disabled = true;
        $("btn-take-stop").disabled = false;
        takeTimer = setInterval(function () { $("take-time").textContent = fmtTime((Date.now() - t0) / 1000); }, 250);
      }).catch(function (e) { toast(e.message || "Microphone permission denied."); });
    });
    $("btn-take-stop").addEventListener("click", stopTake);
  }

  /* project pack */
  function packReadme(p, info) {
    return [
      "ISLE VOICE — PROJECT PACK: " + p.name,
      "==========================================",
      "Genre: " + p.genre + " | Mood: " + p.mood + " | Tempo: " + p.tempo + " BPM",
      info ? "Key: " + info.key + " | Chords: " + info.prog + " (" + info.roman + ")" : "",
      "",
      "FILES",
      "  instrumental.wav    draft beat (synthesized in the browser)",
      "  guide_melody.wav    syllable-timed synth guide for your lyrics (if lyrics were given)",
      "  lyrics.txt          your lyrics",
      "  voice_bank/         your voice clips as mono 44.1 kHz WAV (training data)",
      "  takes/              guide vocals you recorded over the draft",
      "  project.json        settings (re-open by typing them into Isle Voice)",
      "",
      "HONEST NOTE",
      "  Isle Voice does not clone or synthesize singing. To hear your voice sing,",
      "  use free, open-source RVC (Retrieval-based Voice Conversion) on a free GPU.",
      "",
      "STEPS (free)",
      "  1. Open Google Colab (free tier) and a community RVC or Applio notebook.",
      "     RVC:    https://github.com/RVC-Project/Retrieval-based-Voice-Conversion-WebUI",
      "     Applio: https://github.com/IAHispano/Applio",
      "  2. Upload voice_bank/*.wav as the dataset and train a model",
      "     (10-30 min of clean audio; ~200-300 epochs is a common start).",
      "  3. Record or pick a sung vocal (takes/ or any acapella you have rights to)",
      "     and run inference with your model. Adjust pitch/transposition to fit.",
      "  4. Mix the converted vocal over instrumental.wav in a free DAW",
      "     (Audacity, Cakewalk, BandLab, GarageBand).",
      "",
      "Only use voices you own or have permission to use."
    ].join("\n");
  }
  function wirePack() {
    $("btn-pack").addEventListener("click", function () {
      var ensure = draft && draft.project.id === current.id ? Promise.resolve(draft) : generate();
      ensure.then(function (d) {
        var p = d ? d.project : readForm();
        var files = [];
        var jobs = [];
        if (d) {
          jobs.push(blobU8(d.inst).then(function (u) { files.push({ name: "instrumental.wav", data: u }); }));
          if (d.guide) jobs.push(blobU8(d.guide).then(function (u) { files.push({ name: "guide_melody.wav", data: u }); }));
        }
        jobs.push(buildBankFiles("voice_bank/").then(function (fs) { files = files.concat(fs); }));
        jobs.push(getAll("takes").then(function (ts) {
          ts = ts.filter(function (t) { return t.projectId === current.id; });
          return ts.reduce(function (pr, t, i) {
            return pr.then(function () {
              return blobToWav(t.blob).then(blobU8).then(function (u) {
                files.push({ name: "takes/take_" + String(i + 1).padStart(2, "0") + ".wav", data: u });
              }).catch(function () {});
            });
          }, Promise.resolve());
        }));
        return Promise.all(jobs).then(function () {
          files.push({ name: "lyrics.txt", data: textU8(lyricsText(p)) });
          files.push({ name: "project.json", data: textU8(JSON.stringify(p, null, 2)) });
          files.push({ name: "README.txt", data: textU8(packReadme(p, d && d.info)) });
          downloadBlob(makeZip(files), safeName(p.name) + "_isle_voice_pack.zip");
          toast("Project pack downloaded");
        });
      }).catch(function (e) { toast("Pack failed: " + e.message); });
    });
  }

  /* ---------------- Wiring ---------------- */
  function wireStudio() {
    $("p-tempo").addEventListener("input", function () { $("p-tempo-val").textContent = $("p-tempo").value; });
    $("p-genre").addEventListener("change", function () {
      var g = GENRES[$("p-genre").value];
      if (g) { $("p-tempo").value = g.bpm; $("p-tempo-val").textContent = g.bpm; }
    });
    $("prompt-form").addEventListener("submit", function (e) { e.preventDefault(); generate(); });
    $("btn-save").addEventListener("click", function () { saveCurrent(false); });
    $("btn-new").addEventListener("click", function () {
      writeForm({ id: uid("proj"), genre: "trap", mood: "dark", tempo: 140, key: "auto", bars: 8, variation: 1, lyrics: "", guide: true, name: "" });
      draft = null; $("draft").hidden = true; $("gen-status").textContent = "";
      renderLibrary();
    });
    $("btn-lyrics-txt").addEventListener("click", function () {
      var p = readForm();
      downloadBlob(new Blob([lyricsText(p)], { type: "text/plain" }), safeName(p.name) + "_lyrics.txt");
    });
  }

  function init() {
    wireBank();
    wireStudio();
    wireTakes();
    wirePack();
    renderBank();
    renderLibrary();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  // exposed for automated tests only (no UI effect)
  window.__isleVoice = { makeZip: makeZip, wavFromChannels: wavFromChannels, syllables: syllables, renderDraft: renderDraft };
})();
