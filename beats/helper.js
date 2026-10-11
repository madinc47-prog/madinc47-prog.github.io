/* Island Pin Beats: the built-in Helper (every tab, Beats + Studio + Master). Free, offline, no AI service:
 * "Check my mix" reads the current song / mix state and explains problems in plain words, each with a one-tap Fix it;
 * "How to" walks through the tab; "Ask" searches the answers below. Nothing runs until the panel is opened. */
(function () {
  "use strict";
  if (window.frameElement && window.parent && window.parent.IPBHelper) return; // Studio inside Beats: the Beats Helper covers it
  var GUIDES = {
    beats: { name: "Beats", steps: [
      "Tap a pad to hear it. Turn on steps in the grid under it to build the pattern; ▶ plays, ■ stops. BPM is next to the play button.",
      "Pick a kit or a starter song at the top. Feel adds human timing and tone; swing 55–58 % gives bounce.",
      "Long-press a pad (or a row name) to open its Layer knobs and Swap: preview library sounds (Sample volume slider at the top) and tap Use. “Match to beat” keeps loops in time with your BPM.",
      "🎹 Keys loops ▾ adds a chord / melody loop in your song key.",
      "🎙 Record Vocals records over the beat. Headphones give the cleanest take; without them turn on “No headphones — voice only”.",
      "Bounce loop saves the beat as audio to the Vault; “Send to Studio →” puts it on Track 1 for multitrack recording."] },
    piano: { name: "Piano Roll", steps: [
      "✎ Draw adds notes, ⌫ Erase removes them; drag a note to move it, drag its end to make it longer.",
      "Pick the instrument and grid (1/16, 1/8, 1/16T); −oct / +oct moves the view.",
      "“From chord loop” turns your Keys loop into notes you can edit. ↶ Undo / ↷ Redo are always there.",
      "Long-press the instrument to swap in a library sound."] },
    studio: { name: "Studio", steps: [
      "Track 1 holds the beat (from Beats: Bounce → “Send to Studio →”).",
      "Arm a vocal track (its ● or press R) and press ● Record. Headphones recommended; “No headphones — voice only” for speaker recording.",
      "Tap a clip to select, drag to move, pinch / zoom to edit; the FX button on a track opens its effects (Effects A/B compares, Tighten to beat fixes timing).",
      "AUTO on a vocal track keeps it level-matched to the beat. The Mixer view has faders, pan and the master limiter.",
      "Export WAV / MP3, or tap “Master ↗” to master the Studio mix in the Master tab."] },
    lyrics: { name: "Lyrics", steps: [
      "Write or paste your lyrics; each song keeps its own sheet.",
      "Teleprompter scrolls the words with the beat while you record (⟲ Top jumps back).",
      "Lines follow the song sections, so the right verse shows at the right bar."] },
    mixer: { name: "Mixer", steps: [
      "Each channel has a fader and MUTE; meters show the level while the beat plays. Keep the master meter out of the red.",
      "“Samples” is the volume of sound previews (Swap sheet / Keys loops) — it never changes the beat.",
      "Vocal FX: switch effects on (compressor, EQ, de-esser, reverb, delay…). Changes are heard live while “▶ Play take with beat” runs; FX A/B compares with / without.",
      "Auto match keeps the vocal level matched to the beat; “Tighten to beat” nudges timing (raw take is always kept).",
      "Export: “With FX” for a finished vocal, “Raw take (no FX)” to mix elsewhere."] },
    master: { name: "Master", steps: [
      "Your current song loads by itself (progress bar). After editing the song, tap “↻ Refresh from current song”. “Choose a song file…” loads WAV / MP3 / M4A / AAC / FLAC / OGG.",
      "Pick a preset (e.g. Hip-Hop Punch) as a start, then a loudness target (Streaming −14, Club −9…).",
      "Tap “Auto gain to target”: it sets the level so the master lands on the target with the limiter keeping peaks under −1 dBTP.",
      "▶ Play and compare: “Bypass (matched)” plays the original at the same loudness, so you hear the processing, not just louder. Mono check tests phone speakers.",
      "Export master: WAV 24, WAV 16 (dithered) or MP3 320 — it also lands in the Vault with a loudness report."] },
    video: { name: "Video", steps: [
      "Pick a style and a take or bounce; the visualizer draws 16:9 (YouTube) and 9:16 (Shorts / Reels / TikTok) frames.",
      "Record the video while the song plays, then save or share it."] },
    vault: { name: "Vault", steps: [
      "Everything you record, bounce or master is saved here on this device (works offline).",
      "▶ plays an item; you can rename, download, send to Studio / Player / DJ Booth, or delete.",
      "Masters show their loudness in the name. Storage used is on the Sound check page (Storage card)."] }
  };
  var FAQ = [
    ["samples too loud preview sample volume", "Sample previews have their own volume: the “Sample volume” slider at the top of the Swap sheet / Keys loops, or the “Samples” fader in the Mixer. They never change the beat."],
    ["vocal buried quiet loud level match auto", "Turn on Auto match (Mixer → Vocal FX, or AUTO on a Studio track): the vocal follows the beat level. Then fine-tune with the Vocal fader. “Check my mix” does it in one tap."],
    ["effects fx not working reverb hear", "Effects are heard live while “▶ Play take with beat” (or Studio playback) runs. If nothing changes, FX A/B may be on OFF — tap it, or use “Check my mix”."],
    ["record vocals headphones speaker echo feedback bleed", "Headphones give the cleanest take. Recording through the speaker? Turn on “No headphones — voice only”: it cancels the beat bleed and keeps the raw capture too."],
    ["master loud loudness lufs target streaming club", "In Master pick a target (Streaming −14 LUFS is the safe default; Club −9 is loud) and tap “Auto gain to target”. The limiter keeps true peaks under −1 dBTP."],
    ["master export wav mp3 dither", "Export master: WAV 24-bit (best for further work), WAV 16-bit with dither (CD / most uploads), MP3 320 (sharing). It's also saved to the Vault with a loudness report."],
    ["load song file master android picker", "Master loads your current song automatically. For another song tap “📂 Choose a song file…” (WAV, MP3, M4A, AAC, FLAC, OGG) or pick one from the Vault list."],
    ["stutter sticking crackle glitch slow", "Close other apps and tabs; the Master tab pauses the idle beat engine while it plays. If it still sticks, open the page with ?tapdebug=1, play, tap Copy log and send it — it names the exact sound."],
    ["offline internet no connection download sounds", "After the first load Beats, Studio and Master work without internet. To have every instrument offline too, tap “⬇ Download all sounds” (bottom of the sound picker on any Swap, or on the Sound check page, about 17 MB). The Sound check page also shows “Offline app: ready ✓” once Beat is saved."],
    ["storage space full delete start fresh", "The Sound check page has a Storage card (what uses space, Copy report, Keep Beat data safe). “Start fresh” deletes Beats + Studio data on this device (asks first)."],
    ["tempo bpm loop time stretch match to beat key", "“Match to beat” (Swap sheet / Keys loops) time-stretches loops to your BPM without changing pitch and starts them on the bar. “Match key” shifts loops to the song key."],
    ["timing tighten late vocal off beat", "“Tighten to beat” (Vocal FX panel / Studio track FX) nudges syllables toward the grid; Strength 50 % is natural, 100 % is tight. The raw take is kept."],
    ["studio send beat track", "In Beats: Bounce loop (or the whole song) → “Send to Studio →”. It lands on Track 1; arm a vocal track and record."],
    ["swing feel bounce human", "Feel adds human timing and tone (Natural is a good start). Swing 55–58 % gives a laid-back bounce; 50 % is straight."],
    ["mono phone speaker width", "Use Mono check in Master. If the bass or vocal disappears, turn on Stereo width with “Mono below” around 120 Hz."]
  ];
  function tabNow() {
    if (window.IPBBeats && IPBBeats.activeTab) return IPBBeats.activeTab();
    return /\/studio\//.test(location.pathname) ? "studio" : "beats";
  }
  function studioWin() { var f = document.querySelector("#studio-frame, iframe[src*='studio']"); try { return f && f.contentWindow && f.contentWindow.IPBStudio ? f.contentWindow : (window.IPBStudio ? window : null); } catch (e) { return null; } }
  function checksFor(tab) {
    try {
      if (tab === "master" && window.IPBMaster && IPBMaster.helperChecks) return IPBMaster.helperChecks();
      if (tab === "studio") { var w = studioWin(); if (w && w.IPBStudio.helperChecks) return w.IPBStudio.helperChecks(); return [{ level: "tip", text: "The Studio is still loading — open it once, then check again." }]; }
      if (window.IPBBeats && IPBBeats.helperChecks) return IPBBeats.helperChecks();
    } catch (e) { return [{ level: "tip", text: "Couldn't check right now (" + (e && e.message || e) + ")." }]; }
    return [];
  }
  var el = null;
  function css() {
    var s = document.createElement("style");
    s.textContent = ".hp-btn{min-height:44px}.hp-fab{position:fixed;right:12px;bottom:12px;z-index:900;border-radius:22px;padding:0 16px;font:600 15px system-ui;background:#0e7490;color:#fff;border:0;box-shadow:0 4px 14px rgba(0,0,0,.4)}" +
      ".hp-sheet{position:fixed;top:0;right:0;bottom:0;width:min(440px,100vw);z-index:2147483000;background:#0f172a;color:#e2e8f0;border-left:1px solid #334155;box-shadow:-8px 0 24px rgba(0,0,0,.5);display:flex;flex-direction:column;font:15px/1.45 system-ui}" +
      ".hp-sheet[hidden]{display:none}.hp-hd{display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid #1e293b}.hp-hd h3{flex:1;margin:0;font-size:17px}" +
      ".hp-sheet button{min-height:44px;border-radius:10px;border:1px solid #334155;background:#1e293b;color:#e2e8f0;font:600 14px system-ui;padding:0 12px;cursor:pointer}.hp-sheet button.pri{background:#0e7490;border-color:#0891b2;color:#fff}" +
      ".hp-body{overflow:auto;padding:10px 12px 24px;flex:1}.hp-body h4{margin:14px 0 6px;font-size:14px;color:#94a3b8;text-transform:uppercase;letter-spacing:.04em}" +
      ".hp-f{border:1px solid #334155;border-radius:10px;padding:8px 10px;margin:6px 0;background:#111c33}.hp-f.warn{border-color:#f59e0b}.hp-f.ok{border-color:#22c55e}.hp-f b{margin-right:6px}.hp-f .hp-fix{margin-top:6px;display:block}" +
      ".hp-steps{margin:0;padding-left:20px}.hp-steps li{margin:4px 0}.hp-ask{width:100%;min-height:44px;box-sizing:border-box;border-radius:10px;border:1px solid #334155;background:#0b1222;color:#e2e8f0;padding:0 10px;font:15px system-ui}" +
      ".hp-a{margin:6px 0;padding:6px 8px;border-left:3px solid #0891b2;background:#0b1222;border-radius:4px}.hp-done{color:#86efac;font-weight:600;margin-top:4px}";
    document.head.appendChild(s);
  }
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function build() {
    css();
    el = document.createElement("aside"); el.className = "hp-sheet"; el.hidden = true; el.setAttribute("aria-label", "Helper");
    el.innerHTML = '<div class="hp-hd"><h3>💡 Helper</h3><button type="button" class="pri hp-check">Check my mix</button><button type="button" class="hp-x" aria-label="Close helper">✕</button></div><div class="hp-body"></div>';
    document.body.appendChild(el);
    el.querySelector(".hp-x").addEventListener("click", close);
    el.querySelector(".hp-check").addEventListener("click", function () { render(true); });
    var tabs = document.querySelector("nav.tabs:not(.st-tabs)");
    var b = document.createElement("button"); b.type = "button"; b.className = tabs ? "tab hp-btn hp-tab" : "hp-btn hp-fab"; b.textContent = "💡 Helper"; b.title = "Built-in helper: checks your mix and explains this tab (works offline)";
    b.addEventListener("click", function () { el.hidden ? open() : close(); });
    (tabs || document.body).appendChild(b);
    document.addEventListener("ipb-tab", function () { if (!el.hidden) render(true); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !el.hidden) close(); });
  }
  function open() { el.hidden = false; render(true); }
  function close() { el.hidden = true; }
  function render(runChecks) {
    var tab = tabNow(), g = GUIDES[tab] || GUIDES.beats, body = el.querySelector(".hp-body");
    el.querySelector("h3").textContent = "💡 Helper · " + g.name;
    var html = "<h4>Check my mix</h4><div class='hp-res'></div><h4>How to use " + esc(g.name) + "</h4><ol class='hp-steps'>" + g.steps.map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("") + "</ol>" +
      "<h4>Ask</h4><input class='hp-ask' type='search' placeholder='e.g. vocal too quiet, export mp3, offline…' aria-label='Ask the helper'><div class='hp-ans'></div>";
    body.innerHTML = html;
    var ask = body.querySelector(".hp-ask"), ans = body.querySelector(".hp-ans");
    ask.addEventListener("input", function () { answer(ask.value, ans); });
    if (runChecks) showChecks(tab, body.querySelector(".hp-res"));
  }
  function showChecks(tab, box) {
    var list = checksFor(tab);
    box.innerHTML = "";
    if (!list.length) { box.innerHTML = "<div class='hp-f ok'>Nothing to check on this tab — see How to below.</div>"; return; }
    list.forEach(function (f) {
      var d = document.createElement("div"); d.className = "hp-f " + f.level;
      d.innerHTML = "<b>" + (f.level === "warn" ? "⚠" : f.level === "ok" ? "✓" : "💡") + "</b>" + esc(f.text);
      if (f.fix) {
        var b = document.createElement("button"); b.type = "button"; b.className = "pri hp-fix"; b.textContent = "Fix it: " + f.fix.label;
        b.addEventListener("click", function () {
          var msg = ""; try { msg = f.fix.run() || "Done"; } catch (e) { msg = "Couldn't fix that (" + (e && e.message || e) + ")"; }
          b.remove(); var ok = document.createElement("div"); ok.className = "hp-done"; ok.textContent = "✓ " + msg; d.appendChild(ok);
        });
        d.appendChild(b);
      }
      box.appendChild(d);
    });
  }
  function answer(q, box) {
    q = String(q || "").toLowerCase().trim();
    if (q.length < 2) { box.innerHTML = ""; return; }
    var words = q.split(/\W+/).filter(function (w) { return w.length > 1; });
    var hits = FAQ.map(function (f) { var sc = 0; words.forEach(function (w) { if (f[0].indexOf(w) !== -1) sc += 2; if (f[1].toLowerCase().indexOf(w) !== -1) sc += 1; }); return { f: f, sc: sc }; })
      .filter(function (x) { return x.sc > 0; }).sort(function (a, b) { return b.sc - a.sc; }).slice(0, 3);
    box.innerHTML = hits.length ? hits.map(function (h) { return "<div class='hp-a'>" + esc(h.f[1]) + "</div>"; }).join("") : "<div class='hp-a'>No answer for that yet. Try “Check my mix”, or the How to steps above.</div>";
  }
  window.IPBHelper = { open: function () { if (!el) build(); open(); }, close: function () { if (el) close(); }, checks: function (t) { return checksFor(t || tabNow()); }, ask: function (q) { var d = document.createElement("div"); answer(q, d); return d.textContent; } };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build); else build();
})();
