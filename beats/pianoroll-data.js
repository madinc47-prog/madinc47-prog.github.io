/* Island Pin Beats — piano-roll pattern data (window.IPBPianoData).
 * A pattern is plain JSON, so it can be saved in slots, the library, songs, exported/imported as a file, and later
 * produced by loop banks:
 *   { v: 1, name, inst, bars: 1|2|4, grid: "1/8"|"1/16"|"1/16t"|"1/32", key: 0–11, scale: "off"|"major"|"minor"|…,
 *     snapScale: bool, notes: [{ p: midi, s: startTick, l: lengthTicks, v: velocity 0.05–1, i?: instrument id }] }
 * A note's optional `i` plays that note on another instrument (layered loops, e.g. steel pan over strings); notes
 * without it use the pattern's `inst`. Older data has no `i`, so it loads unchanged.
 * Time is in ticks: 24 per beat, 96 per 4/4 bar (1/16 = 6, 1/16 triplet = 4, 1/8 = 12).
 */
(function () {
  "use strict";
  var TPB = 24, TPBAR = 96, STEP = 6;      // ticks per beat, per bar, per 16th
  var LOW = 24, HIGH = 96;                 // C1 … C7
  var GRIDS = { "1/8": 12, "1/16": 6, "1/16t": 4, "1/32": 3 };
  var BARS = [1, 2, 4];
  var SCALES = {
    off: null,
    major: [0, 2, 4, 5, 7, 9, 11],
    minor: [0, 2, 3, 5, 7, 8, 10],
    harmonic: [0, 2, 3, 5, 7, 8, 11],
    phrygian: [0, 1, 3, 5, 7, 8, 10],
    dorian: [0, 2, 3, 5, 7, 9, 10]
  };
  var SCALE_NAMES = { off: "No scale", major: "Major", minor: "Minor", harmonic: "Harmonic minor", phrygian: "Phrygian", dorian: "Dorian" };
  var NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  var DEFAULT_INST = "grand";

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function noteName(p) { return NOTE_NAMES[((p % 12) + 12) % 12] + (Math.floor(p / 12) - 1); }
  function empty(o) {
    o = o || {};
    return { v: 1, name: o.name || "", inst: o.inst || DEFAULT_INST, bars: BARS.indexOf(+o.bars) !== -1 ? +o.bars : 2,
      grid: GRIDS[o.grid] ? o.grid : "1/16", key: o.key != null ? clamp(Math.round(+o.key) || 0, 0, 11) : 0,
      scale: SCALES.hasOwnProperty(o.scale) ? o.scale : "minor", snapScale: !!o.snapScale, notes: [] };
  }
  function lenTicks(p) { return p.bars * TPBAR; }
  function sortNotes(n) { n.sort(function (a, b) { return a.s - b.s || a.p - b.p; }); return n; }
  /* validate anything (old data, imports, loop banks) into a clean pattern; never throws */
  function normalize(src, instOk) {
    var o = src && typeof src === "object" ? src : {};
    if (o.type === "ipb-piano-pattern" && o.pattern) o = o.pattern;
    var p = empty(o);
    p.name = typeof o.name === "string" ? o.name.slice(0, 80) : "";
    if (typeof o.src === "string" && o.src) p.src = o.src.slice(0, 60); // origin tag, e.g. "kl:dusty-ninths" (keys loop bank)
    if (isFinite(+o.gain) && +o.gain) p.gain = clamp(Math.round(+o.gain * 2) / 2, -12, 12); // level trim in dB (loop bank balance)
    if (typeof o.inst === "string" && (!instOk || instOk(o.inst))) p.inst = o.inst;
    var L = lenTicks(p), seen = {};
    (Array.isArray(o.notes) ? o.notes : []).forEach(function (n) {
      if (!n || typeof n !== "object") return;
      var pitch = Math.round(+n.p), s = Math.round(+n.s), l = Math.round(+n.l), v = +n.v;
      if (!isFinite(pitch) || !isFinite(s) || pitch < LOW || pitch > HIGH || s < 0 || s >= L) return;
      if (!isFinite(l) || l < 1) l = STEP;
      l = Math.min(l, L - s);
      var ni = typeof n.i === "string" && n.i !== p.inst && (!instOk || instOk(n.i)) ? n.i.slice(0, 24) : null;
      var key = pitch + ":" + s + ":" + (ni || "");
      if (seen[key]) return; // no stacked duplicates
      seen[key] = 1;
      var nn = { p: pitch, s: s, l: l, v: isFinite(v) ? clamp(Math.round(v * 100) / 100, 0.05, 1) : 0.8 };
      if (ni) nn.i = ni;
      p.notes.push(nn);
    });
    sortNotes(p.notes);
    return p;
  }
  /* every instrument a pattern uses: its own plus any per-note layers */
  function instsOf(p) {
    var out = [p && p.inst || DEFAULT_INST];
    ((p && p.notes) || []).forEach(function (n) { if (n.i && out.indexOf(n.i) === -1) out.push(n.i); });
    return out;
  }
  function gainLin(p) { return p && p.gain ? Math.pow(10, p.gain / 20) : 1; }
  function clone(p) { return JSON.parse(JSON.stringify(p)); }
  function hasNotes(p) { return !!(p && p.notes && p.notes.length); }
  function inRange(p, semis) { return p.notes.every(function (n) { return n.p + semis >= LOW && n.p + semis <= HIGH; }); }
  function transpose(p, semis, notes) {
    notes = notes || p.notes;
    if (!notes.every(function (n) { return n.p + semis >= LOW && n.p + semis <= HIGH; })) return false;
    notes.forEach(function (n) { n.p += semis; });
    return true;
  }
  /* change length: shorter drops/clips notes past the end; longer keeps notes (optionally repeats the loop) */
  function setBars(p, bars, repeat) {
    bars = BARS.indexOf(+bars) !== -1 ? +bars : p.bars;
    var oldL = lenTicks(p), newL = bars * TPBAR;
    if (newL > oldL && repeat && p.notes.length) {
      var src = p.notes.slice();
      for (var off = oldL; off < newL; off += oldL) src.forEach(function (n) {
        if (n.s + off >= newL) return;
        var c = { p: n.p, s: n.s + off, l: Math.min(n.l, newL - n.s - off), v: n.v };
        if (n.i) c.i = n.i;
        p.notes.push(c);
      });
    }
    p.bars = bars;
    p.notes = p.notes.filter(function (n) { return n.s < newL; });
    p.notes.forEach(function (n) { n.l = Math.min(n.l, newL - n.s); });
    sortNotes(p.notes);
    return p;
  }
  function scalePcs(key, scale) {
    var s = SCALES[scale];
    if (!s) return null;
    var set = {};
    s.forEach(function (iv) { set[(key + iv) % 12] = true; });
    return set;
  }
  function inScale(pitch, key, scale) { var pcs = scalePcs(key, scale); return !pcs || !!pcs[((pitch % 12) + 12) % 12]; }
  function snapPitch(pitch, key, scale) {
    var pcs = scalePcs(key, scale);
    if (!pcs) return pitch;
    for (var d = 0; d < 7; d++) {
      if (pcs[(((pitch - d) % 12) + 12) % 12] && pitch - d >= LOW) return pitch - d;
      if (pcs[(((pitch + d) % 12) + 12) % 12] && pitch + d <= HIGH) return pitch + d;
    }
    return pitch;
  }
  /* notes whose start is in [t0, t1) ticks (for step schedulers) */
  function notesStarting(p, t0, t1) {
    var out = [];
    for (var i = 0; i < p.notes.length; i++) { var n = p.notes[i]; if (n.s >= t0 && n.s < t1) out.push(n); else if (n.s >= t1) break; }
    return out;
  }
  /* chords → pattern. chords: [{ root: semitone above C, ivs: [0,3,7,…] } | null (rest)], barsEach: bars per chord */
  function fromChords(chords, barsEach, opts) {
    opts = opts || {};
    var total = Math.max(1, chords.length * barsEach), bars = total <= 1 ? 1 : total <= 2 ? 2 : 4;
    var each = Math.max(1, Math.min(barsEach, Math.floor(4 / Math.max(1, chords.length)) || 1));
    if (total <= 4) each = barsEach;
    var p = empty({ inst: opts.inst, bars: bars, grid: opts.grid, key: opts.key, scale: opts.scale, name: opts.name });
    var base = opts.base != null ? opts.base : 60, L = lenTicks(p);
    chords.forEach(function (ch, i) {
      var s = i * each * TPBAR;
      if (!ch || s >= L) return;
      var l = Math.min(each * TPBAR, L - s), r = ((ch.root % 12) + 12) % 12;
      var root = base + r; if (root > base + 5) root -= 12;          // keep voicings around middle C
      ch.ivs.forEach(function (iv) { p.notes.push({ p: clamp(root + iv, LOW, HIGH), s: s, l: l, v: 0.78 }); });
      if (opts.bass !== false) p.notes.push({ p: clamp(root - 12, LOW, HIGH), s: s, l: l, v: 0.85 });
    });
    return normalize(p);
  }
  function toJSON(p) { return { type: "ipb-piano-pattern", v: 1, app: "Island Pin Beats", pattern: normalize(p) }; }
  function fromJSON(x, instOk) {
    var o = typeof x === "string" ? JSON.parse(x) : x;
    if (!o || typeof o !== "object") throw new Error("Not a piano pattern");
    var src = o.type === "ipb-piano-pattern" ? o.pattern : o;
    if (!src || !Array.isArray(src.notes)) throw new Error("Not a piano pattern");
    return normalize(src, instOk);
  }

  /* named pattern library in localStorage: { v:1, items: [{ id, name, created, updated, pattern }] } */
  function Library(storageKey, instOk) {
    this.key = storageKey; this.instOk = instOk; this.items = [];
    this.load();
  }
  Library.prototype.load = function () {
    var self = this;
    try {
      var d = JSON.parse(localStorage.getItem(this.key) || "null");
      this.items = d && Array.isArray(d.items) ? d.items.filter(function (it) { return it && typeof it.id === "string" && it.pattern; }).map(function (it) {
        var pat = normalize(it.pattern, self.instOk);
        return { id: it.id, name: String(it.name || pat.name || "Untitled").slice(0, 80), created: +it.created || Date.now(), updated: +it.updated || +it.created || Date.now(), pattern: pat };
      }) : [];
    } catch (e) { this.items = []; }
    return this;
  };
  Library.prototype.persist = function () {
    try { localStorage.setItem(this.key, JSON.stringify({ v: 1, items: this.items })); return true; } catch (e) { return false; }
  };
  Library.prototype.get = function (id) { for (var i = 0; i < this.items.length; i++) if (this.items[i].id === id) return this.items[i]; return null; };
  Library.prototype.byName = function (name) { var n = String(name).trim().toLowerCase(); for (var i = 0; i < this.items.length; i++) if (this.items[i].name.toLowerCase() === n) return this.items[i]; return null; };
  Library.prototype.newId = function () { return "pp_" + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36); };
  Library.prototype.save = function (name, pattern, id) {
    var now = Date.now(), pat = normalize(pattern, this.instOk), it = id ? this.get(id) : null;
    name = String(name || "Untitled").trim().slice(0, 80) || "Untitled";
    pat.name = name;
    if (it) { it.name = name; it.pattern = pat; it.updated = now; }
    else { it = { id: this.newId(), name: name, created: now, updated: now, pattern: pat }; this.items.unshift(it); }
    return this.persist() ? it : null;
  };
  Library.prototype.rename = function (id, name) {
    var it = this.get(id); if (!it) return null;
    it.name = String(name).trim().slice(0, 80) || it.name; it.pattern.name = it.name; it.updated = Date.now();
    return this.persist() ? it : null;
  };
  Library.prototype.duplicate = function (id) {
    var it = this.get(id); if (!it) return null;
    var base = it.name.replace(/ \(copy( \d+)?\)$/, ""), n = 1, name = base + " (copy)";
    while (this.byName(name)) name = base + " (copy " + (++n) + ")";
    var cp = { id: this.newId(), name: name, created: Date.now(), updated: Date.now(), pattern: clone(it.pattern) };
    cp.pattern.name = name;
    this.items.splice(this.items.indexOf(it) + 1, 0, cp);
    return this.persist() ? cp : null;
  };
  Library.prototype.remove = function (id) {
    var n = this.items.length;
    this.items = this.items.filter(function (x) { return x.id !== id; });
    return this.items.length !== n && this.persist();
  };

  window.IPBPianoData = {
    TPB: TPB, TPBAR: TPBAR, STEP: STEP, LOW: LOW, HIGH: HIGH, GRIDS: GRIDS, BARS: BARS, SCALES: SCALES, SCALE_NAMES: SCALE_NAMES, NOTE_NAMES: NOTE_NAMES,
    empty: empty, gainLin: gainLin, instsOf: instsOf, normalize: normalize, clone: clone, hasNotes: hasNotes, lenTicks: lenTicks, transpose: transpose, inRange: inRange, setBars: setBars,
    scalePcs: scalePcs, inScale: inScale, snapPitch: snapPitch, notesStarting: notesStarting, fromChords: fromChords,
    toJSON: toJSON, fromJSON: fromJSON, noteName: noteName, sortNotes: sortNotes, Library: Library
  };
})();
