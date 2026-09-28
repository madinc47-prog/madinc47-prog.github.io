/* Island Pin Radio — in-page live player. No dependencies.
   Every stream below is HTTPS and was checked to serve real audio. */
(function () {
  "use strict";

  var STATIONS = [
    // Dominica
    { id: "dbs", name: "DBS Radio", group: "Dominica", place: "Roseau · 88.1", genre: "News & talk", stream: "https://stream.dbcradio.net:8005/live", site: "https://dbcradio.net/" },
    { id: "q95", name: "Q95 FM", group: "Dominica", place: "Roseau · 95.1", genre: "Talk & music", stream: "https://sonic01.instainternet.com/8306/stream", site: "https://www.q95da.com/" },
    { id: "kairi", name: "Kairi FM", group: "Dominica", place: "Roseau · 93.1", genre: "News & jams", stream: "https://stream.zeno.fm/ych5ixtx51ktv", site: "https://zeno.fm/radio/kairi-fm/" },
    { id: "vibes", name: "Vibes Radio", group: "Dominica", place: "Roseau · 99.5", genre: "Urban", stream: "https://vibesradio.dm/stream", site: "https://vibesradio.dm/" },
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
  var START_TIMEOUT_MS = 20000;

  var root = document.getElementById("radio-player");
  if (!root) return;

  var listEl = document.getElementById("radio-list");
  var tabsEl = document.getElementById("radio-groups");
  var nowName = document.getElementById("radio-now-name");
  var nowStatus = document.getElementById("radio-now-status");
  var nowToggle = document.getElementById("radio-now-toggle");
  var volumeEl = document.getElementById("radio-volume");

  var audio = new Audio();
  audio.preload = "none";
  audio.id = "radio-audio";
  root.appendChild(audio);

  var activeGroup = "Dominica";
  var current = null;      // station object currently selected
  var status = {};         // id -> { state: idle|loading|buffering|playing|paused|error, msg }
  var session = 0;         // increments on every new play/stop; stale events are ignored
  var startTimer = null;

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

  // ---- volume ----
  var savedVol = parseFloat(localStorage.getItem(VOLUME_KEY));
  audio.volume = isFinite(savedVol) && savedVol >= 0 && savedVol <= 1 ? savedVol : 0.8;
  volumeEl.value = String(Math.round(audio.volume * 100));
  volumeEl.addEventListener("input", function () {
    audio.volume = Math.max(0, Math.min(1, Number(volumeEl.value) / 100));
    try { localStorage.setItem(VOLUME_KEY, String(audio.volume)); } catch (e) {}
  });

  // ---- state + rendering ----
  var LABELS = {
    idle: "", loading: "Connecting…", buffering: "Buffering…",
    playing: "Live", paused: "Paused", error: ""
  };

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
    var active = st.state === "loading" || st.state === "buffering" || st.state === "playing";
    card.setAttribute("data-state", st.state);
    btn.setAttribute("aria-pressed", active ? "true" : "false");
    btn.textContent = active ? "Pause" : (st.state === "error" ? "Retry" : "Play");
    btn.setAttribute("aria-label", (active ? "Pause " : "Play ") + byId(id).name);
    line.textContent = st.msg;
    line.className = "radio-status" + (st.state === "error" ? " is-error" : "");
  }

  function paintNow() {
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
    var active = st.state === "loading" || st.state === "buffering" || st.state === "playing";
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

  function play(station, isRetry) {
    if (current && current.id !== station.id) setStatus(current.id, "idle");
    if (!isRetry) attempts = 0;
    current = station;
    var my = ++session;
    clearStartTimer();
    setStatus(station.id, "loading", isRetry ? "Reconnecting…" : "");
    audio.src = station.stream;   // fresh connection = live edge
    audio.load();
    startTimer = setTimeout(function () {
      if (my !== session) return;
      if (status[station.id] && status[station.id].state !== "playing") {
        stopAudio();
        setStatus(station.id, "error", "The stream did not start within " + (START_TIMEOUT_MS / 1000) + " seconds. It may be offline — tap Retry.");
      }
    }, START_TIMEOUT_MS);
    var p = audio.play();
    if (p && typeof p.catch === "function") {
      p.catch(function (err) {
        if (my !== session) return;
        clearStartTimer();
        if (err && err.name === "NotAllowedError") {
          setStatus(station.id, "error", "Your browser blocked autoplay. Tap Play again.");
        } else if (err && err.name === "AbortError") {
          return; // superseded by another action
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

  function stopAudio() {
    session++;
    clearStartTimer();
    audio.pause();
    audio.removeAttribute("src"); // drop the live connection so data stops downloading
    audio.load();
  }

  function pause() {
    if (!current) return;
    stopAudio();
    setStatus(current.id, "paused");
  }

  function toggle(station) {
    var st = status[station.id] && status[station.id].state;
    var active = current && current.id === station.id &&
      (st === "loading" || st === "buffering" || st === "playing");
    if (active) pause(); else play(station);
  }

  function guard(fn) {
    return function () {
      if (!current || !audio.getAttribute("src")) return;
      fn(current);
    };
  }

  audio.addEventListener("playing", guard(function (s) { clearStartTimer(); attempts = 0; setStatus(s.id, "playing"); }));
  audio.addEventListener("waiting", guard(function (s) {
    if (status[s.id] && status[s.id].state === "playing") setStatus(s.id, "buffering");
  }));
  function fail(s, msg) {
    clearStartTimer();
    stopAudio();
    if (attempts < 1 && navigator.onLine) {
      // Some stream hosts drop the first connection now and then; try once more before reporting.
      attempts++;
      setStatus(s.id, "loading", "Reconnecting…");
      var my = session;
      setTimeout(function () { if (my === session && current === s) play(s, true); }, 1200);
      return;
    }
    setStatus(s.id, "error", msg);
  }

  audio.addEventListener("error", guard(function (s) { fail(s, errorMessage()); }));
  audio.addEventListener("ended", guard(function (s) {
    stopAudio();
    setStatus(s.id, "error", "The station ended the stream. Tap Retry to reconnect.");
  }));

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

  if ("mediaSession" in navigator) {
    try {
      navigator.mediaSession.setActionHandler("play", function () { if (current) play(current); });
      navigator.mediaSession.setActionHandler("pause", pause);
    } catch (e) {}
  }

  // Test/debug hook (read-only helpers)
  window.IslePinRadio = { stations: STATIONS, audio: audio, play: function (id) { var s = byId(id); if (s) play(s); }, pause: pause, status: function (id) { return status[id]; } };

  renderTabs();
  renderList();
  paintNow();
})();
