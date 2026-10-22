/* ⚙ Settings page logic (Island Beats Hub). Reads/writes existing keys only where they exist: ipb_session_v1.bpm,
   ipb_midi_settings_v2.autoEnable; new: ipb_ui_v1 (look) and ipb_start_page_v1. Values are set with .value / textContent only. */
(function () {
  function st(k) { try { return k === "ipb_session_v1" ? sessionStorage : localStorage; } catch (e) { return localStorage; } }
  function get(k, d) { try { var v = JSON.parse(st(k).getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
  function put(k, v) { try { st(k).setItem(k, JSON.stringify(v)); flash(); } catch (e) { flash("Could not save (private mode?)"); } }
  var $ = function (id) { return document.getElementById(id); }, t;
  function flash(m) { $("saved").textContent = m || "Saved ✓"; clearTimeout(t); t = setTimeout(function () { $("saved").textContent = ""; }, 1800); }
  var ui = get("ipb_ui_v1", {}), ses = get("ipb_session_v1", null), midi = get("ipb_midi_settings_v2", {});
  $("s-start").value = get("ipb_start_page_v1", "") || "";
  $("s-start").addEventListener("change", function () { put("ipb_start_page_v1", this.value); });
  $("s-bpm").value = ses && ses.bpm ? ses.bpm : 140; if (!ses) { $("s-bpm").disabled = true; $("s-bpm").title = "Make a beat first"; }
  $("s-bpm").addEventListener("change", function () { var s = get("ipb_session_v1", null); if (!s) return; s.bpm = Math.max(60, Math.min(200, Math.round(+this.value) || 140)); this.value = s.bpm; put("ipb_session_v1", s); });
  $("s-midi").checked = !!midi.autoEnable;
  $("s-midi").addEventListener("change", function () { var m = get("ipb_midi_settings_v2", {}); m.autoEnable = this.checked; put("ipb_midi_settings_v2", m); });
  function saveUi() { put("ipb_ui_v1", ui); }
  $("s-pad").value = ui.padSize || "m"; $("s-pad").addEventListener("change", function () { ui.padSize = this.value; saveUi(); });
  $("s-accent").value = ui.accent || "#22d3ee"; $("s-accent").addEventListener("input", function () { ui.accent = this.value; saveUi(); });
  $("s-accent-reset").addEventListener("click", function () { delete ui.accent; $("s-accent").value = "#22d3ee"; saveUi(); });
  $("s-ai").checked = ui.askAi !== false; $("s-ai").addEventListener("change", function () { ui.askAi = this.checked; saveUi(); });
})();
