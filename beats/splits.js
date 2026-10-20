/* Royalty Splits sheet (BETA). On-device only: localStorage "ipb_splits_v1". DOM + textContent only, no innerHTML, no server. */
(function () {
  "use strict";
  var KEY = "ipb_splits_v1", ROLES = ["Writer", "Producer", "Beatmaker", "Featured artist", "Main artist", "Composer", "Engineer", "Other"];
  var root = document.getElementById("sp"), D = load(), cur = D.songs[0] ? D.songs[0].id : null;
  function load() { try { var d = JSON.parse(localStorage.getItem(KEY) || "null"); if (d && Array.isArray(d.songs)) return d; } catch (e) { /* bad data */ } return { v: 1, songs: [] }; }
  function save(msg) { try { localStorage.setItem(KEY, JSON.stringify(D)); flash(msg || "Saved on this device ✓"); } catch (e) { flash("Could not save (storage full or private mode)"); } }
  function uid() { return "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function song() { return D.songs.filter(function (s) { return s.id === cur; })[0] || null; }
  function el(t, a, kids) { var e = document.createElement(t); a = a || {}; Object.keys(a).forEach(function (k) { if (k === "text") e.textContent = a[k]; else if (k === "on") Object.keys(a.on).forEach(function (ev) { e.addEventListener(ev, a.on[ev]); }); else e.setAttribute(k, a[k]); }); (kids || []).forEach(function (c) { if (c) e.appendChild(c); }); return e; }
  var st = el("p", { id: "saved", role: "status" }), tm;
  function flash(m) { st.textContent = m; clearTimeout(tm); tm = setTimeout(function () { st.textContent = ""; }, 2200); }
  function num(v) { v = parseFloat(String(v).replace(",", ".")); return isFinite(v) ? Math.round(v * 100) / 100 : 0; }
  function newSong() { var s = { id: uid(), title: "New song", isrc: "", date: "", people: [{ name: "", role: "Writer", master: 50, pub: 50 }, { name: "", role: "Producer", master: 50, pub: 50 }] }; D.songs.unshift(s); cur = s.id; save("New song added"); render(); }

  function render() {
    root.textContent = "";
    root.appendChild(el("h1", { text: "Royalty Splits sheet" }));
    root.appendChild(el("p", { class: "note", text: "Write down who gets what on each song — the master (recording) % and the publishing / songwriter % — and agree it before you release. Money is collected by your distributor (master / streaming) and by ECCO (songwriter performance royalties in the Eastern Caribbean); this sheet only records what was agreed. It is not a contract or legal advice. Saved only on this device — export a copy to keep it safe." }));
    root.appendChild(st);
    var pick = el("select", { "aria-label": "Song", on: { change: function () { cur = this.value; render(); } } });
    D.songs.forEach(function (s) { var o = el("option", { value: s.id, text: (s.title || "Untitled") + (s.date ? " · " + s.date : "") }); if (s.id === cur) o.selected = true; pick.appendChild(o); });
    if (!D.songs.length) pick.appendChild(el("option", { text: "No songs yet — tap ＋ New song" }));
    root.appendChild(el("section", { class: "grp noprint" }, [el("div", { class: "songbar" }, [pick,
      el("button", { type: "button", class: "btn primary", text: "＋ New song", on: { click: newSong } }),
      song() ? el("button", { type: "button", class: "btn rec", text: "Delete song", on: { click: function () { if (!confirm("Delete “" + song().title + "” from this device?")) return; D.songs = D.songs.filter(function (s) { return s.id !== cur; }); cur = D.songs[0] ? D.songs[0].id : null; save("Song deleted"); render(); } } }) : null])]));
    var s = song();
    if (s) {
      function fld(lbl, k, type, ph) { return el("label", {}, [document.createTextNode(lbl), el("input", { type: type || "text", value: s[k] || "", placeholder: ph || "", maxlength: "120", on: { change: function () { s[k] = type === "date" ? this.value : this.value.trim(); if (k === "isrc") { s.isrc = s.isrc.toUpperCase().replace(/[^A-Z0-9-]/g, ""); this.value = s.isrc; } save(); if (k === "title") render(); } } })]); }
      root.appendChild(el("section", { class: "grp" }, [el("h2", { text: "Song" }), el("div", { class: "f" }, [fld("Title", "title"), fld("ISRC (optional — your distributor issues it)", "isrc", "text", "e.g. DM-XXX-26-00001"), fld("Release date", "date", "date")])]));
      var g = el("section", { class: "grp" }, [el("h2", { text: "Contributors" })]);
      s.people.forEach(function (p, i) {
        var role = el("select", { on: { change: function () { p.role = this.value; save(); } } });
        ROLES.forEach(function (r) { var o = el("option", { value: r, text: r }); if (r === p.role) o.selected = true; role.appendChild(o); });
        function pct(k, lbl) { return el("label", {}, [document.createTextNode(lbl), el("input", { type: "number", inputmode: "decimal", min: "0", max: "100", step: "0.01", value: String(p[k]), on: { input: function () { p[k] = num(this.value); totals(); }, change: function () { save(); } } })]); }
        g.appendChild(el("div", { class: "c" }, [el("label", { class: "nm" }, [document.createTextNode("Name"), el("input", { type: "text", value: p.name, maxlength: "80", placeholder: "Artist / legal name", on: { change: function () { p.name = this.value.trim(); save(); } } })]),
          el("label", {}, [document.createTextNode("Role"), role]), pct("master", "Master %"), pct("pub", "Publishing %"),
          el("button", { type: "button", class: "btn small x", "aria-label": "Remove contributor", text: "✕", on: { click: function () { s.people.splice(i, 1); save(); render(); } } })]));
      });
      var tot = el("div", { class: "tot", role: "status", "aria-live": "polite" });
      g.appendChild(tot);
      g.appendChild(el("div", { class: "acts" }, [el("button", { type: "button", class: "btn", text: "＋ Add contributor", on: { click: function () { s.people.push({ name: "", role: "Featured artist", master: 0, pub: 0 }); save(); render(); } } }),
        el("button", { type: "button", class: "btn", text: "Split evenly", on: { click: function () { var n = s.people.length; if (!n) return; var e = Math.floor(10000 / n) / 100, r = Math.round((100 - e * (n - 1)) * 100) / 100; s.people.forEach(function (p, j) { p.master = p.pub = j === n - 1 ? r : e; }); save(); render(); } } })]));
      root.appendChild(g);
      function totals() { tot.textContent = ""; [["master", "Master"], ["pub", "Publishing"]].forEach(function (c) { var t = Math.round(s.people.reduce(function (a, p) { return a + num(p[c[0]]); }, 0) * 100) / 100, ok = Math.abs(t - 100) < 0.005; tot.appendChild(el("span", { class: ok ? "ok" : "", text: c[1] + " total: " + t + "% " + (ok ? "✓" : "— must be 100%") })); }); }
      totals();
    }
    var file = el("input", { type: "file", accept: ".json,.csv,application/json,text/csv", hidden: "", on: { change: function () { var f = this.files[0]; if (f) f.text().then(importText); this.value = ""; } } });
    root.appendChild(el("section", { class: "grp noprint" }, [el("h2", { text: "Keep it safe & share" }), el("div", { class: "acts" }, [
      el("button", { type: "button", class: "btn", text: "Export JSON (all songs)", on: { click: function () { dl("royalty-splits.json", JSON.stringify(D, null, 2), "application/json"); } } }),
      el("button", { type: "button", class: "btn", text: "Export CSV (all songs)", on: { click: function () { dl("royalty-splits.csv", toCSV(), "text/csv"); } } }),
      el("button", { type: "button", class: "btn", text: "Import JSON / CSV", on: { click: function () { file.click(); } } }), file,
      el("button", { type: "button", class: "btn", text: "🖨 Print", on: { click: function () { window.print(); } } }),
      el("button", { type: "button", class: "btn primary", text: "↗ Share this song", on: { click: share } })])]));
  }
  function csvq(v) { v = String(v == null ? "" : v); if (/^[=+\-@]/.test(v)) v = "'" + v; return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; } // ' prefix: no spreadsheet formula injection
  function toCSV() { var L = ["song_title,isrc,release_date,name,role,master_pct,publishing_pct"]; D.songs.forEach(function (s) { s.people.forEach(function (p) { L.push([s.title, s.isrc, s.date, p.name, p.role, p.master, p.pub].map(csvq).join(",")); }); }); return L.join("\n") + "\n"; }
  function parseCSV(t) { var rows = [], r = [], f = "", q = false; for (var i = 0; i < t.length; i++) { var c = t[i]; if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; } else if (c === '"') q = true; else if (c === ",") { r.push(f); f = ""; } else if (c === "\n" || c === "\r") { if (c === "\r" && t[i + 1] === "\n") i++; r.push(f); rows.push(r); r = []; f = ""; } else f += c; } if (f || r.length) { r.push(f); rows.push(r); } return rows; }
  function clean(v, n) { return String(v == null ? "" : v).replace(/^'/, "").slice(0, n || 120); }
  function importText(t) {
    var songs = [];
    try {
      if (/^\s*\{/.test(t)) { var d = JSON.parse(t); (d.songs || []).forEach(function (s) { songs.push({ id: uid(), title: clean(s.title), isrc: clean(s.isrc, 20), date: clean(s.date, 10), people: (s.people || []).slice(0, 50).map(function (p) { return { name: clean(p.name, 80), role: ROLES.indexOf(p.role) >= 0 ? p.role : "Other", master: num(p.master), pub: num(p.pub) }; }) }); }); }
      else { var by = {}; parseCSV(t).slice(1).forEach(function (r) { if (r.length < 7) return; var k = r[0] + "|" + r[1] + "|" + r[2]; if (!by[k]) { by[k] = { id: uid(), title: clean(r[0]), isrc: clean(r[1], 20), date: clean(r[2], 10), people: [] }; songs.push(by[k]); } by[k].people.push({ name: clean(r[3], 80), role: ROLES.indexOf(r[4]) >= 0 ? r[4] : "Other", master: num(r[5]), pub: num(r[6]) }); }); }
    } catch (e) { flash("That file could not be read — export from this page and try again."); return; }
    if (!songs.length) { flash("No songs found in that file."); return; }
    D.songs = songs.concat(D.songs); cur = songs[0].id; save("Imported " + songs.length + " song(s)"); render();
  }
  function dl(name, text, type) { var a = el("a", { href: URL.createObjectURL(new Blob([text], { type: type })), download: name }); document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
  function share() {
    var s = song(); if (!s) return;
    var txt = "Royalty splits — " + s.title + (s.isrc ? " (ISRC " + s.isrc + ")" : "") + (s.date ? ", release " + s.date : "") + "\n" + s.people.map(function (p) { return "• " + (p.name || "?") + " — " + p.role + ": master " + p.master + "%, publishing " + p.pub + "%"; }).join("\n") + "\nRecorded with Island Beats Hub (sheet only — money is collected by the distributor and ECCO).";
    var f = null; try { f = new File([JSON.stringify({ v: 1, songs: [s] }, null, 2)], (s.title || "song").replace(/[^\w-]+/g, "_") + "-splits.json", { type: "application/json" }); } catch (e) { f = null; }
    var d = { title: "Royalty splits — " + s.title, text: txt };
    if (f && navigator.canShare && navigator.canShare({ files: [f] })) d.files = [f];
    if (navigator.share) navigator.share(d).catch(function () {}); else if (navigator.clipboard) navigator.clipboard.writeText(txt).then(function () { flash("Copied the split summary — paste it in WhatsApp or email."); });
  }
  render();
})();
