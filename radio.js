/* Island Pin Radio — in-page live player. No dependencies.
   Every stream below is HTTPS and was checked to serve real audio.
   "Warm & Wide" sound: stations whose streams send CORS headers (Access-Control-Allow-Origin,
   checked on every redirect hop, Sep 2026) are routed through a gentle Web Audio chain.
   Stations marked fx: false (no CORS headers) always play their original sound. */
(function () {
  "use strict";

  var STATIONS = [
    // Dominica
    { id: "dbs", name: "DBS Radio", group: "Dominica", place: "Roseau · 88.1", genre: "News & talk", stream: "https://stream.dbcradio.net:8005/live", site: "https://dbcradio.net/" },
    { id: "q95", name: "Q95 FM", group: "Dominica", place: "Roseau · 95.1", genre: "Talk & music", stream: "https://sonic01.instainternet.com/8306/stream", site: "https://www.q95da.com/" },
    { id: "kairi", name: "Kairi FM", group: "Dominica", place: "Roseau · 93.1", genre: "News & jams", stream: "https://stream.zeno.fm/ych5ixtx51ktv", site: "https://zeno.fm/radio/kairi-fm/" },
    { id: "vibes", name: "Vibes Radio", group: "Dominica", place: "Roseau · 99.5", genre: "Urban", stream: "https://vibesradio.dm/stream", site: "https://vibesradio.dm/", fx: false },
    { id: "vol", name: "Voice of Life Radio", group: "Dominica", place: "Loubiere", genre: "Gospel", stream: "https://cdn.comeseetv.com:8000/vol", site: "https://voiceofliferadio.dm/" },
    { id: "dcr", name: "Dominica Catholic Radio", group: "Dominica", place: "Roseau · 96.1", genre: "Faith", stream: "https://cdn.comeseetv.com:8010/dominicacatholicradio", site: "http://www.dominicacatholicradio.org/" },
    { id: "my-worship", name: "My Worship FM", group: "Dominica", place: "Mahaut · 103.3", genre: "Gospel", stream: "https://playerservices.streamtheworld.com/api/livestream-redirect/SP_R2796427_SC", site: "https://myworshipfm.com/" },
    { id: "en-ba-mango", name: "Radio En Ba Mango", group: "Dominica", place: "Grand Bay", genre: "Soca & local", stream: "https://s10.myradiostream.com/:4212/listen.mp3", site: "https://www.facebook.com/oobinmmani/" },
    { id: "tdn", name: "TDN Radio", group: "Dominica", place: "Roseau", genre: "News & Caribbean", stream: "https://sonic01.instainternet.com/8308/stream", site: "https://tdnradio.net/" },
    { id: "hits-767", name: "Hits 767", group: "Dominica", place: "Roseau", genre: "Hits", stream: "https://stream.zeno.fm/tsjanuqnp9rtv", site: "https://zeno.fm/radio/hits-767-radio/" },
    { id: "gtm", name: "GTM Radio", group: "Dominica", place: "Roseau", genre: "Local", stream: "https://sonic01.instainternet.com/8314/stream", site: "https://www.gtmradio.com/" },
    { id: "life-101", name: "Life 101", group: "Dominica", place: "Roseau", genre: "Worship", stream: "https://sonic01.instainternet.com/8310/stream", site: "https://life101radio.net/" },
    { id: "rvr-jamz", name: "RVR Jamz", group: "Dominica", place: "Roseau", genre: "Jamz", stream: "https://vousstream.com/8320/stream", site: "https://onlineradiobox.com/dm/rvrjamz/" },
    { id: "mount-zion", name: "Mt. Zion FM", group: "Dominica", place: "Dominica", genre: "Gospel", stream: "https://streaming.live365.com/a42752", site: "https://live365.com/station/Mt--Zion-FM-a42752" },
    // Caribbean
    { id: "blazin", name: "Blazin 99.3", group: "Caribbean", place: "Castries, Saint Lucia", genre: "Urban", stream: "https://streams.radio.co/s5f11a7ef9/listen", site: "https://www.blazin993.com/" },
    { id: "kiss-slu", name: "Caribbean KISS FM", group: "Caribbean", place: "Castries, Saint Lucia", genre: "Hits", stream: "https://auds2.intacs.com/caribbeankissfm", site: "https://www.caribbeankissfm.com/" },
    { id: "vob", name: "VOB 92.9", group: "Caribbean", place: "Bridgetown, Barbados", genre: "Talk & music", stream: "https://ice66.securenetsystems.net/VOB929", site: "https://vob929.com/" },
    { id: "hott", name: "HOTT 95.3", group: "Caribbean", place: "Bridgetown, Barbados", genre: "Urban", stream: "https://ice64.securenetsystems.net/HOTT953", site: "https://www.starcomnetwork.net/hott-953-fm-landing/" },
    { id: "irie", name: "Irie FM", group: "Caribbean", place: "Ocho Rios, Jamaica", genre: "Reggae", stream: "https://stream.iriefm.net:8008/stream", site: "https://iriefm.net/" },
    { id: "boss", name: "Boss FM", group: "Caribbean", place: "St. George's, Grenada", genre: "Hits", stream: "https://usa8.fastcast4u.com/proxy/bossfm2?mp=/1", site: "https://www.bossfmgrenada.net/" },
    { id: "hot97", name: "Hot 97 SVG", group: "Caribbean", place: "Kingstown, St. Vincent", genre: "Urban", stream: "https://usa7.fastcast4u.com/proxy/hot97svg?mp=/1", site: "http://www.hot97svg.com/" },
    // World
    { id: "bbc-ws", name: "BBC World Service", group: "World", place: "London", genre: "World news", stream: "https://stream.live.vc.bbcmedia.co.uk/bbc_world_service", site: "https://www.bbc.co.uk/worldserviceradio" },
    { id: "npr", name: "NPR", group: "World", place: "Washington", genre: "News", stream: "https://npr-ice.streamguys1.com/live.mp3", site: "https://www.npr.org/" },
    { id: "rfi", name: "RFI English", group: "World", place: "Paris", genre: "World news", stream: "https://rfienanglais64k.ice.infomaniak.ch/rfienanglais-64.mp3", site: "https://www.rfi.fr/en/" },
    { id: "kexp", name: "KEXP", group: "World", place: "Seattle", genre: "Indie", stream: "https://kexp-mp3-128.streamguys1.com/kexp128.mp3", site: "https://www.kexp.org/" },
    { id: "fip", name: "FIP", group: "World", place: "Paris", genre: "Eclectic", stream: "https://icecast.radiofrance.fr/fip-midfi.mp3", site: "https://www.radiofrance.fr/fip" },
    { id: "classic-fm", name: "Classic FM", group: "World", place: "London", genre: "Classical", stream: "https://media-ice.musicradio.com/ClassicFMMP3", site: "https://www.classicfm.com/" }
  ];

  var GROUPS = ["Dominica", "Caribbean", "World"];
  var VOLUME_KEY = "islepin_radio_volume";
  var FX_KEY = "islepin_radio_fx";        // "1" = Warm & Wide on (default), "0" = original sound
  var START_TIMEOUT_MS = 20000;

  // ---- Warm & Wide: gentle "car sound" chain (Web Audio) ----
  // A browser approximation of a warm, spacious surround feel — not real Dolby processing.
  //   tone:     +1.2 dB low shelf @170 Hz, -1.8 dB dip @3.4 kHz, -3.5 dB high shelf @8 kHz
  //   width:    mid/side, side x1.28 above 150 Hz; side below 150 Hz removed so bass stays mono;
  //             mid gets a matching all-pass so the image stays phase-coherent (mono-compatible)
  //   ambience: short synthetic stereo room (0.8 s decay, decorrelated L/R), band-limited 280 Hz–4.5 kHz,
  //             mixed in at 11 %
  //   safety:   -1 dB headroom into a soft compressor/limiter (-5 dB threshold, 5:1), trim so loudness
  //             stays within about 0.5 dB of the original (never louder)
  var FX = {
    warmthHz: 170, warmthDb: 1.2,
    harshHz: 3400, harshQ: 0.9, harshDb: -1.8,
    airHz: 8000, airDb: -3.5,
    monoBassHz: 150, sideGain: 1.28,
    roomDecay: 0.8, roomLength: 0.85, wetHpHz: 280, wetLpHz: 4500, wetMix: 0.11,
    headroom: 0.89, compThreshold: -5, compKnee: 5, compRatio: 5, compAttack: 0.002, compRelease: 0.2,
    trim: 1.02
  };
  var BUTTERWORTH_Q_DB = -3.0103; // Q of 0.7071 in dB, as Web Audio's lowpass/highpass expect

  function makeRoomImpulse(ctx) {
    var sr = ctx.sampleRate, len = Math.round(sr * FX.roomLength);
    var buf = ctx.createBuffer(2, len, sr);
    var seed = 20260929;
    function rnd() { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2147483648 - 1; }
    for (var ch = 0; ch < 2; ch++) {
      var d = buf.getChannelData(ch);
      var pre = Math.round(sr * (ch ? 0.0115 : 0.0085)); // slightly different pre-delays: wide, not echoey
      var fade = Math.round(sr * 0.006);
      var lp = 0, energy = 0, i;
      for (i = pre; i < len; i++) {
        var t = (i - pre) / sr;
        var env = Math.exp(-6.9078 * t / FX.roomDecay);       // -60 dB at roomDecay seconds
        if (i - pre < fade) env *= (i - pre) / fade;          // soft onset, no early "slap"
        var a = 0.6 - 0.45 * Math.min(1, t / FX.roomDecay);   // tail darkens like air absorption
        lp += a * (rnd() - lp);
        d[i] = lp * env;
        energy += d[i] * d[i];
      }
      var norm = energy > 0 ? 1 / Math.sqrt(energy) : 0;     // unit energy: wetMix is the real wet level
      for (i = 0; i < len; i++) d[i] *= norm;
    }
    return buf;
  }

  // Builds the chain on any BaseAudioContext (also used by offline tests). Returns { input, output, setProcessed }.
  function buildWarmWide(ctx) {
    function biquad(type, freq, q, g) {
      var f = ctx.createBiquadFilter();
      f.type = type; f.frequency.value = freq;
      if (q != null) f.Q.value = q;
      if (g != null) f.gain.value = g;
      return f;
    }
    function gain(v) { var g = ctx.createGain(); g.gain.value = v; return g; }

    var input = gain(1);
    input.channelCount = 2; input.channelCountMode = "explicit"; input.channelInterpretation = "speakers"; // mono -> centred stereo
    var output = gain(1);

    // 1) tone
    var warmth = biquad("lowshelf", FX.warmthHz, null, FX.warmthDb);
    var deharsh = biquad("peaking", FX.harshHz, FX.harshQ, FX.harshDb);
    var air = biquad("highshelf", FX.airHz, null, FX.airDb);
    input.connect(warmth); warmth.connect(deharsh); deharsh.connect(air);

    // 2) mid/side width
    var split = ctx.createChannelSplitter(2);
    var mid = gain(1), side = gain(1);
    var lm = gain(0.5), rm = gain(0.5), ls = gain(0.5), rs = gain(-0.5);
    air.connect(split);
    split.connect(lm, 0); split.connect(rm, 1); split.connect(ls, 0); split.connect(rs, 1);
    lm.connect(mid); rm.connect(mid); ls.connect(side); rs.connect(side);
    var midAlign = biquad("allpass", FX.monoBassHz, 0.7071);          // = phase of the LR4 crossover below
    var sideHp1 = biquad("highpass", FX.monoBassHz, BUTTERWORTH_Q_DB);
    var sideHp2 = biquad("highpass", FX.monoBassHz, BUTTERWORTH_Q_DB); // 24 dB/oct: bass stays mono
    var width = gain(FX.sideGain), widthInv = gain(-1);
    mid.connect(midAlign); side.connect(sideHp1); sideHp1.connect(sideHp2); sideHp2.connect(width); width.connect(widthInv);
    var outL = gain(1), outR = gain(1);
    midAlign.connect(outL); width.connect(outL);
    midAlign.connect(outR); widthInv.connect(outR);
    var merge = ctx.createChannelMerger(2);
    outL.connect(merge, 0, 0); outR.connect(merge, 0, 1);

    // 3) soft room ambience
    var wetHp = biquad("highpass", FX.wetHpHz, BUTTERWORTH_Q_DB);
    var wetLp = biquad("lowpass", FX.wetLpHz, BUTTERWORTH_Q_DB);
    var room = ctx.createConvolver();
    room.normalize = false;
    room.buffer = makeRoomImpulse(ctx);
    var wet = gain(FX.wetMix);
    air.connect(wetHp); wetHp.connect(wetLp); wetLp.connect(room); room.connect(wet);

    // 4) sum -> gentle compressor/limiter -> loudness trim
    var sum = gain(1);
    merge.connect(sum); wet.connect(sum);
    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = FX.compThreshold; comp.knee.value = FX.compKnee; comp.ratio.value = FX.compRatio;
    comp.attack.value = FX.compAttack; comp.release.value = FX.compRelease;
    var headroom = gain(FX.headroom), trim = gain(FX.trim);
    sum.connect(headroom); headroom.connect(comp); comp.connect(trim);

    // processed / original crossfade (instant A/B, no reconnect)
    var fxLevel = gain(1), dryLevel = gain(0);
    trim.connect(fxLevel); fxLevel.connect(output);
    input.connect(dryLevel); dryLevel.connect(output);
    function setProcessed(on, instant) {
      var t = ctx.currentTime;
      [[fxLevel, on ? 1 : 0], [dryLevel, on ? 0 : 1]].forEach(function (p) {
        var g = p[0].gain;
        g.cancelScheduledValues(t);
        if (instant) g.setValueAtTime(p[1], t);
        else { g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(p[1], t + 0.25); }
      });
    }
    return { input: input, output: output, setProcessed: setProcessed, compressor: comp };
  }

  var root = document.getElementById("radio-player");
  if (!root) return;

  var listEl = document.getElementById("radio-list");
  var tabsEl = document.getElementById("radio-groups");
  var nowName = document.getElementById("radio-now-name");
  var nowStatus = document.getElementById("radio-now-status");
  var nowToggle = document.getElementById("radio-now-toggle");
  var volumeEl = document.getElementById("radio-volume");
  var fxWrap = document.getElementById("radio-fx");
  var fxToggle = document.getElementById("radio-fx-toggle");
  var fxNote = document.getElementById("radio-fx-note");

  function makeAudio(id, cors) {
    var a = new Audio();
    a.preload = "none";
    a.id = id;
    if (cors) a.crossOrigin = "anonymous";
    root.appendChild(a);
    return a;
  }
  // plainAudio: exactly the original playback path (no crossOrigin, never touches Web Audio).
  // fxAudio: crossOrigin="anonymous", wired once into the Warm & Wide chain (created on first use).
  var plainAudio = makeAudio("radio-audio", false);
  var fxAudio = null;
  var audio = plainAudio;  // element currently in use

  var activeGroup = "Dominica";
  var current = null;      // station object currently selected
  var status = {};         // id -> { state: idle|loading|buffering|playing|paused|error, msg }
  var session = 0;         // increments on every new play/stop; stale events are ignored
  var startTimer = null;
  var fxBroken = {};       // id -> true after a runtime fallback (this page visit only)
  var fxWatch = null;

  function byId(id) {
    for (var i = 0; i < STATIONS.length; i++) if (STATIONS[i].id === id) return STATIONS[i];
    return null;
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function host(u) {
    try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return ""; }
  }
  function store(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function load(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }

  // ---- Web Audio engine (one context, one MediaElementSource, ever) ----
  var AC = window.AudioContext || window.webkitAudioContext;
  var fxSupported = !!(AC && typeof Promise !== "undefined");
  var fxOn = load(FX_KEY) !== "0";
  var engine = null;       // { ctx, source, chain, out }
  var engineFailed = false;

  function ensureEngine() {
    if (engine) return engine;
    if (!fxSupported || engineFailed) return null;
    try {
      var ctx;
      try { ctx = new AC({ latencyHint: "playback" }); } catch (e) { ctx = new AC(); }
      var el = makeAudio("radio-audio-fx", true);
      wire(el);
      var source = ctx.createMediaElementSource(el);
      var chain = buildWarmWide(ctx);
      var out = ctx.createGain();
      var probe = ctx.createAnalyser(), outProbe = ctx.createAnalyser();
      probe.fftSize = outProbe.fftSize = 2048;
      source.connect(chain.input); source.connect(probe);
      chain.output.connect(out); out.connect(ctx.destination); out.connect(outProbe);
      fxAudio = el;
      engine = { ctx: ctx, source: source, chain: chain, out: out, probe: probe, outProbe: outProbe };
      try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch (e) {} // iOS: keep playing when locked / silent switch
      ctx.onstatechange = function () {
        if (audio !== fxAudio || ctx.state === "running" || ctx.state === "closed") return;
        if (!current || !isActive(current.id)) return;
        resumeEngine();
        var my = session, s = current;
        setTimeout(function () {
          if (my === session && audio === fxAudio && ctx.state !== "running") fallBack(s, false);
        }, 1500);
      };
      applyVolume();
      return engine;
    } catch (e) {
      engineFailed = true;
      return null;
    }
  }
  function resumeEngine() {
    if (engine && engine.ctx.state !== "running" && engine.ctx.resume) {
      try { var p = engine.ctx.resume(); if (p && p.catch) p.catch(function () {}); } catch (e) {}
    }
  }
  function idleEngine() {   // save battery while the processed path isn't in use
    if (engine && engine.ctx.state === "running" && engine.ctx.suspend) {
      try { var p = engine.ctx.suspend(); if (p && p.catch) p.catch(function () {}); } catch (e) {}
    }
  }
  function canProcess(s) {
    return fxSupported && !engineFailed && s.fx !== false && !fxBroken[s.id];
  }

  // ---- volume ----
  var savedVol = parseFloat(load(VOLUME_KEY));
  var volume = isFinite(savedVol) && savedVol >= 0 && savedVol <= 1 ? savedVol : 0.8;
  function applyVolume() {
    plainAudio.volume = volume;
    if (fxAudio) fxAudio.volume = 1;   // processed path: volume is applied after the chain
    if (engine) engine.out.gain.setTargetAtTime(volume, engine.ctx.currentTime, 0.015);
  }
  applyVolume();
  volumeEl.value = String(Math.round(volume * 100));
  volumeEl.addEventListener("input", function () {
    volume = Math.max(0, Math.min(1, Number(volumeEl.value) / 100));
    applyVolume();
    store(VOLUME_KEY, String(volume));
  });

  // ---- state + rendering ----
  var LABELS = {
    idle: "", loading: "Connecting…", buffering: "Buffering…",
    playing: "Live", paused: "Paused", error: ""
  };

  function isActive(id) {
    var st = status[id] && status[id].state;
    return st === "loading" || st === "buffering" || st === "playing";
  }

  function setStatus(id, state, msg) {
    status[id] = { state: state, msg: msg || LABELS[state] || "" };
    paintCard(id);
    paintNow();
  }

  function paintCard(id) {
    var card = listEl.querySelector('[data-station="' + id + '"]');
    if (!card) return;
    var st = status[id] || { state: "idle", msg: "" };
    var btn = card.querySelector(".radio-play");
    var line = card.querySelector(".radio-status");
    var active = isActive(id);
    card.setAttribute("data-state", st.state);
    btn.setAttribute("aria-pressed", active ? "true" : "false");
    btn.textContent = active ? "Pause" : (st.state === "error" ? "Retry" : "Play");
    btn.setAttribute("aria-label", (active ? "Pause " : "Play ") + byId(id).name);
    line.textContent = st.msg;
    line.className = "radio-status" + (st.state === "error" ? " is-error" : "");
  }

  function paintFx() {
    if (!fxWrap) return;
    fxWrap.hidden = !fxSupported;
    if (!fxSupported) return;
    fxToggle.setAttribute("aria-checked", fxOn ? "true" : "false");
    var note, original = false;
    if (!fxOn) { note = "Original sound"; original = true; }
    else if (current && (!canProcess(current) || (isActive(current.id) && audio !== fxAudio))) {
      note = "Original sound for this station"; original = true;
    } else note = "Smoother highs · wider stage";
    fxNote.textContent = note;
    fxWrap.setAttribute("data-fx", original ? "original" : "on");
  }

  function paintNow() {
    paintFx();
    if (!current) {
      nowName.textContent = "Nothing playing";
      nowStatus.textContent = "Pick a station below.";
      nowStatus.className = "radio-now-status";
      nowToggle.hidden = true;
      root.setAttribute("data-state", "idle");
      return;
    }
    var st = status[current.id] || { state: "idle", msg: "" };
    nowName.textContent = current.name;
    nowStatus.textContent = st.msg || (current.place + " · " + current.genre);
    nowStatus.className = "radio-now-status" + (st.state === "error" ? " is-error" : "");
    var active = isActive(current.id);
    nowToggle.hidden = false;
    nowToggle.textContent = active ? "Pause" : (st.state === "error" ? "Retry" : "Play");
    root.setAttribute("data-state", st.state);
  }

  function renderTabs() {
    tabsEl.innerHTML = GROUPS.map(function (g) {
      var n = STATIONS.filter(function (s) { return s.group === g; }).length;
      return '<button type="button" class="chip' + (g === activeGroup ? " active" : "") +
        '" data-group="' + esc(g) + '" aria-pressed="' + (g === activeGroup) + '">' +
        esc(g) + " (" + n + ")</button>";
    }).join("");
  }

  function renderList() {
    var items = STATIONS.filter(function (s) { return s.group === activeGroup; });
    listEl.innerHTML = items.map(function (s) {
      return '<article class="radio-card" data-station="' + esc(s.id) + '" data-state="idle">' +
        '<div class="radio-card-main">' +
          '<h3>' + esc(s.name) + '</h3>' +
          '<p class="meta">' + esc(s.place) + " · " + esc(s.genre) + '</p>' +
          '<p class="radio-status" aria-live="polite"></p>' +
        '</div>' +
        '<div class="radio-card-actions">' +
          '<button type="button" class="btn btn-primary radio-play" data-play="' + esc(s.id) + '" aria-pressed="false">Play</button>' +
          '<a class="btn btn-ghost radio-site" href="' + esc(s.site) + '" target="_blank" rel="noopener"' +
            ' title="Opens ' + esc(host(s.site)) + ' in a new tab — the radio keeps playing here">Visit station website</a>' +
          '<span class="radio-site-host">' + esc(host(s.site)) + '</span>' +
        '</div>' +
      '</article>';
    }).join("");
    items.forEach(function (s) { paintCard(s.id); });
  }

  // ---- playback ----
  function clearStartTimer() { if (startTimer) { clearTimeout(startTimer); startTimer = null; } }
  function clearFxWatch() { if (fxWatch) { clearInterval(fxWatch); fxWatch = null; } }

  function errorMessage() {
    var e = audio.error;
    if (!navigator.onLine) return "You appear to be offline. Check your connection and retry.";
    if (!e) return "This station's stream could not be played right now.";
    switch (e.code) {
      case 1: return "Playback was stopped before the stream loaded.";
      case 2: return "Network error while loading this station. It may be offline — try again later.";
      case 3: return "The stream sent audio this browser could not decode.";
      case 4: return "This station's stream is offline or unreachable right now.";
      default: return "This station's stream could not be played right now.";
    }
  }

  var attempts = 0;          // automatic reconnect attempts for the current station

  function silence(el) {
    if (!el || !el.getAttribute("src")) return;
    el.pause();
    el.removeAttribute("src"); // drop the live connection so data stops downloading
    el.load();
  }

  // opts: { retry: bool, plain: bool (force original sound), keepAttempts: bool }
  function play(station, opts) {
    opts = opts || {};
    if (current && current.id !== station.id) setStatus(current.id, "idle");
    if (!opts.retry && !opts.keepAttempts) attempts = 0;
    current = station;
    var my = ++session;
    clearStartTimer();
    clearFxWatch();
    var useFx = !opts.plain && fxOn && canProcess(station) && !!ensureEngine();
    var el = useFx ? fxAudio : plainAudio;
    silence(el === fxAudio ? plainAudio : fxAudio);
    audio = el;
    if (useFx) { resumeEngine(); engine.chain.setProcessed(true, true); } else idleEngine();
    setStatus(station.id, "loading", opts.retry ? "Reconnecting…" : (opts.statusMsg || ""));
    el.src = station.stream;   // fresh connection = live edge
    el.load();
    startTimer = setTimeout(function () {
      if (my !== session) return;
      if (status[station.id] && status[station.id].state !== "playing") {
        stopAudio();
        setStatus(station.id, "error", "The stream did not start within " + (START_TIMEOUT_MS / 1000) + " seconds. It may be offline — tap Retry.");
      }
    }, START_TIMEOUT_MS);
    var p = el.play();
    if (p && typeof p.catch === "function") {
      p.catch(function (err) {
        if (my !== session || audio !== el) return;
        if (err && err.name === "AbortError") return; // superseded by another action
        if (el === fxAudio) { fallBack(station, true); return; }
        clearStartTimer();
        if (err && err.name === "NotAllowedError") {
          setStatus(station.id, "error", "Your browser blocked autoplay. Tap Play again.");
        } else {
          fail(station, errorMessage());
        }
      });
    }
    if ("mediaSession" in navigator && window.MediaMetadata) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({ title: station.name, artist: station.place + " · " + station.genre, album: "Island Pin Radio" });
      } catch (e) {}
    }
  }

  // Processed playback didn't work (stream refused crossOrigin, audio context blocked, or silent output):
  // play the same station again exactly as before, unprocessed. Never leave it silent.
  function fallBack(s, streamProblem) {
    if (streamProblem) fxBroken[s.id] = true;
    clearFxWatch();
    play(s, { plain: true, keepAttempts: true });
  }

  // After processed playback starts, make sure sound really comes out of the chain.
  function watchFx(s) {
    clearFxWatch();
    if (!engine) return;
    var my = session, started = Date.now(), t0 = fxAudio.currentTime, heard = false;
    var buf = new Float32Array(engine.probe.fftSize);
    fxWatch = setInterval(function () {
      if (my !== session || audio !== fxAudio) { clearFxWatch(); return; }
      var ctx = engine.ctx;
      if (ctx.state !== "running") {
        resumeEngine();
        if (Date.now() - started > 1500) fallBack(s, false);
        return;
      }
      engine.probe.getFloatTimeDomainData(buf);
      for (var i = 0; i < buf.length; i++) if (buf[i] !== 0) { heard = true; break; }
      if (heard) { clearFxWatch(); return; }
      if (fxAudio.currentTime - t0 > 4) fallBack(s, true); // stream advances but the chain gets only silence
    }, 400);
  }

  function stopAudio() {
    session++;
    clearStartTimer();
    clearFxWatch();
    silence(plainAudio);
    silence(fxAudio);
    idleEngine();
  }

  function pause() {
    if (!current) return;
    stopAudio();
    setStatus(current.id, "paused");
  }

  function toggle(station) {
    var active = current && current.id === station.id && isActive(station.id);
    if (active) pause(); else play(station);
  }

  function setFx(on) {
    fxOn = on;
    store(FX_KEY, on ? "1" : "0");
    if (current && isActive(current.id)) {
      if (audio === fxAudio && engine) {
        resumeEngine();
        engine.chain.setProcessed(on, false);   // smooth crossfade, stream keeps going
      } else if (on && canProcess(current)) {
        play(current, { keepAttempts: true });  // switch to the processed path (brief reconnect)
      }
    }
    paintNow();
  }

  function wire(el) {
    function guard(fn) {
      return function () {
        if (el !== audio || !current || !el.getAttribute("src")) return;
        fn(current);
      };
    }
    el.addEventListener("playing", guard(function (s) {
      clearStartTimer(); attempts = 0; setStatus(s.id, "playing");
      if (el === fxAudio) watchFx(s);
    }));
    el.addEventListener("waiting", guard(function (s) {
      if (status[s.id] && status[s.id].state === "playing") setStatus(s.id, "buffering");
    }));
    el.addEventListener("error", guard(function (s) {
      if (el === fxAudio) { fallBack(s, true); return; }
      fail(s, errorMessage());
    }));
    el.addEventListener("ended", guard(function (s) {
      stopAudio();
      setStatus(s.id, "error", "The station ended the stream. Tap Retry to reconnect.");
    }));
  }
  wire(plainAudio);

  function fail(s, msg) {
    clearStartTimer();
    stopAudio();
    if (attempts < 1 && navigator.onLine) {
      // Some stream hosts drop the first connection now and then; try once more before reporting.
      attempts++;
      setStatus(s.id, "loading", "Reconnecting…");
      var my = session;
      setTimeout(function () { if (my === session && current === s) play(s, { retry: true }); }, 1200);
      return;
    }
    setStatus(s.id, "error", msg);
  }

  // ---- events ----
  tabsEl.addEventListener("click", function (e) {
    var b = e.target.closest("[data-group]");
    if (!b) return;
    activeGroup = b.getAttribute("data-group");
    renderTabs();
    renderList();
  });
  listEl.addEventListener("click", function (e) {
    var b = e.target.closest("[data-play]");
    if (!b) return;          // website links are plain new-tab links; never intercepted
    e.preventDefault();
    var s = byId(b.getAttribute("data-play"));
    if (s) toggle(s);
  });
  nowToggle.addEventListener("click", function () { if (current) toggle(current); });
  if (fxToggle) fxToggle.addEventListener("click", function () { setFx(!fxOn); });
  // iOS Safari: (re)start the audio context from a real user gesture
  document.addEventListener("pointerdown", resumeEngine, true);
  document.addEventListener("keydown", resumeEngine, true);

  if ("mediaSession" in navigator) {
    try {
      navigator.mediaSession.setActionHandler("play", function () { if (current) play(current); });
      navigator.mediaSession.setActionHandler("pause", pause);
    } catch (e) {}
  }

  // Test/debug hook (read-only helpers)
  window.IslePinRadio = {
    stations: STATIONS,
    get audio() { return audio; },
    play: function (id) { var s = byId(id); if (s) play(s); },
    pause: pause,
    status: function (id) { return status[id]; },
    fx: {
      settings: FX,
      build: buildWarmWide,
      isOn: function () { return fxOn; },
      set: setFx,
      processing: function () { return !!(engine && audio === fxAudio && fxOn && current && isActive(current.id)); },
      context: function () { return engine && engine.ctx; },
      levels: function () {   // peak of the stream going into / coming out of the chain (debug)
        if (!engine) return null;
        function pk(a) { var b = new Float32Array(a.fftSize), m = 0; a.getFloatTimeDomainData(b); for (var i = 0; i < b.length; i++) m = Math.max(m, Math.abs(b[i])); return m; }
        return { input: pk(engine.probe), output: pk(engine.outProbe), state: engine.ctx.state };
      }
    }
  };

  renderTabs();
  renderList();
  paintNow();
})();
