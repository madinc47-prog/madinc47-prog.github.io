/* DJ Psycho Fingers — v20261022q "No headphones — voice only" (modeled on Beat Studio's toggle). OFF by default = mic unchanged.
 * ON (v20261022r): mic stays FULLY raw (no echo cancel / noise suppression / auto-gain); the mic never goes to the speaker; and while ● REC or Live Freestyle runs, the mic is ALSO
 * recorded on its own straight from the mic stream (no Web Audio, no gain, no filters → no resampling, no clipping added) as
 * Opus 192 kbps → "Voice only" in My Recordings. The show recording keeps the beat digitally from the internal bus. Only the
 * setting is stored. */
(function () {
  "use strict";
  var P = window.PFDJ; if (!P) return;
  var K = "pfdj_nohp", V = null;
  function on() { try { return localStorage.getItem(K) === "1"; } catch (e) { return false; } }
  function recording() { var r = document.getElementById("rec"); return !!((r && r.classList.contains("on")) || (window.PFFREESTYLE && window.PFFREESTYLE.on)); }
  function ui() {
    var v = on();
    document.querySelectorAll(".js-nohp").forEach(function (b) { b.classList.toggle("on", v); b.setAttribute("aria-pressed", String(v)); b.querySelector(".nh-s").textContent = v ? "ON · voice saved on its own" : "OFF · raw mic"; });
  }
  function set(v) {
    if (recording()) { P.toast("Change this between recordings."); return; }
    try { localStorage.setItem(K, v ? "1" : "0"); } catch (e) { /* ignore */ }
    ui();
    var M = window.PFMIC; if (M) { M.route(); } /* v20261022t: no mic re-open (re-open put Android in call-volume mode) */
    P.toast(v ? "No headphones ON: raw mic also saved as its own Voice only track while recording" : "No headphones OFF: mic unchanged (raw)");
  }
  function button() {
    var b = document.createElement("button"); b.type = "button"; b.className = "nohp-btn js-nohp"; b.setAttribute("aria-pressed", "false");
    b.title = "Recording with friends on the speaker? ON = while recording, your raw mic is also saved as its own Voice only track (the beat isn't mixed in; mic is never sent to the speaker). Nothing cancels speaker sound: on a loud speaker the mic still hears it. OFF = normal.";
    b.innerHTML = '<span class="nh-l">🔇 No headphones</span><span class="nh-s"></span>';
    b.addEventListener("click", function () { set(!on()); });
    return b;
  }
  function place() {
    var dock = document.querySelector(".talk-dock"); if (dock && !dock.querySelector(".js-nohp")) dock.appendChild(button());
    var fs = document.getElementById("freestyle"); if (fs && !fs.querySelector(".js-nohp")) { var h = fs.querySelector(".fs-head"); (h || fs).insertAdjacentElement("afterend", button()); }
    var rec = document.getElementById("rec"); if (rec && !document.getElementById("nohp-rec")) { var b = button(); b.id = "nohp-rec"; b.classList.add("nohp-sm"); rec.parentNode.insertBefore(b, rec.nextSibling); }
    ui();
  }
  /* separate clean voice track while recording */
  function startVoice(st) {
    if (!window.PFREC || !window.PFMP3 || !P.ctx) return;
    var mime = "audio/mpeg", sr = P.ctx.sampleRate;   /* v20261022w: MP3 320 (raw mic, no processing) */
    var mr = window.PFMP3.make(st, P.ctx); if (!mr) return;
    var id = window.PFREC.begin("mp3", mime, sr, "Voice only (no headphones)");
    V = { mr: mr, id: id, st: st, t0: performance.now() };
    mr.ondataavailable = function (e) { if (e.data && e.data.size) window.PFREC.chunk(id, e.data); };
    mr.onstop = function () { setTimeout(function () { window.PFREC.end(id, (performance.now() - V0.t0) / 1000, null).then(function (m) { if (m) P.toast("Saved MP3 · Voice-only track"); }); }, 200); };
    var V0 = V; mr.start(3000);
  }
  function stopVoice() {
    var v = V; V = null; if (!v) return;
    if (v.mr.state !== "inactive") try { v.mr.stop(); } catch (e) { /* onstop finalizes */ }
  }
  if (window.PFFREESTYLE) { var fsStop = window.PFFREESTYLE.stop; window.PFFREESTYLE.stop = function () { stopVoice(); return fsStop.apply(this, arguments); }; }
  setInterval(function () {
    var M = window.PFMIC, st = M && M.stream && M.stream(), want = on() && recording() && st && st.active;
    if (V && (!want || V.st !== st)) stopVoice();
    if (want && !V) startVoice(st);
  }, 400);
  window.addEventListener("pagehide", function () { if (V) try { V.mr.requestData(); } catch (e) { /* ignore */ } });
  window.addEventListener("storage", function (e) { if (e.key === K) ui(); });
  place(); setTimeout(place, 1500); setTimeout(place, 4000);
  window.PFNOHP = { on: on, set: set, info: function () { return { on: on(), voiceRec: !!V }; } };
})();
