/* Island Pin Beats — keys / piano / orchestra loop bank (window.IPBKeysLoops).
 * Every loop is ORIGINAL: chord progressions, voicings, rhythms and melodies written for this app and played in the
 * browser by keys-instruments.js (synth voices, plus CC0 VSCO-2 CE multisamples for the Orchestra sounds) — no
 * recreated records. Each loop builds into a plain Piano Roll pattern
 * (pianoroll-data.js format), transposed to the song key; time is in ticks, so loops always follow the song BPM + swing.
 *
 * Loop definition (all in the loop's own reference key):
 *   prog  "Dm9:1 Gm9:1"            chord symbols with length in bars (0.5 = half a bar); "/B" = slash bass
 *   style "rootless"|"close"|"triad"|"open"   right-hand voicing; drop2 spreads it; rh:[lo,hi] its MIDI range
 *   rh    "X--.x-..X-.x..x."        comp rhythm per 16th: X accent · x normal · o ghost · - hold · . rest (repeats)
 *   lh    "X-------X-------"|null   left-hand rhythm (default: one hit per chord); lhv "r"|"r5"|"r8"|"r7"|"r10"
 *   arp   { rate, seq, len, acc }   arpeggiate the right-hand voicing instead of comping (rate/len in ticks)
 *   mel   "E5@0+3 D5@3+1!"          melody notes: pitch@start+length in 16ths (…t = ticks), ! accent, ~ soft
 *   swing8 true                     jazz swing: off-beat 8ths move to the triplet position (grid "1/16t")
 *   layers [{ inst, rh, lh, arp, mel, style, rhr, … vel }]   extra instruments over the same chords (Orchestra / Island
 *                                   loops); their notes carry a per-note `i` so one Piano Roll pattern plays the ensemble.
 *                                   A layer has no left hand unless it sets `lh`.
 */
(function () {
  "use strict";
  var TPBAR = 96, STEP = 6, LOW = 24, HIGH = 96;
  var NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  var KEY_NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
  var MODE_NAMES = { minor: "minor", major: "major", dorian: "dorian", phrygian: "phrygian", harmonic: "harm. minor" };

  var QUAL = {
    "": [0, 4, 7], m: [0, 3, 7], dim: [0, 3, 6], aug: [0, 4, 8], "5": [0, 7], sus2: [0, 2, 7], sus4: [0, 5, 7], sus: [0, 5, 7],
    "6": [0, 4, 7, 9], m6: [0, 3, 7, 9], "69": [0, 4, 7, 9, 14], add9: [0, 4, 7, 14], madd9: [0, 3, 7, 14],
    "7": [0, 4, 7, 10], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], m7b5: [0, 3, 6, 10], dim7: [0, 3, 6, 9], mmaj7: [0, 3, 7, 11],
    "9": [0, 4, 7, 10, 14], maj9: [0, 4, 7, 11, 14], m9: [0, 3, 7, 10, 14], m11: [0, 3, 7, 10, 14, 17], "11": [0, 7, 10, 14, 17],
    "13": [0, 4, 7, 10, 14, 21], "7#9": [0, 4, 7, 10, 15], "7b9": [0, 4, 7, 10, 13], "7b13": [0, 4, 7, 10, 20],
    "7alt": [0, 4, 10, 13, 20], "7sus": [0, 5, 7, 10], "9sus": [0, 5, 7, 10, 14], "13sus": [0, 5, 10, 14, 21],
    "maj7#11": [0, 4, 7, 11, 18], "maj13": [0, 4, 7, 11, 14, 21]
  };
  function pcOf(s) { var pc = NOTE[s[0]]; if (s[1] === "#") pc++; else if (s[1] === "b") pc--; return ((pc % 12) + 12) % 12; }
  function midiOf(s) { // "Eb4" → 63
    var m = /^([A-G][#b]?)(-?\d)$/.exec(s);
    if (!m) throw new Error("bad note " + s);
    var base = NOTE[m[1][0]] + (m[1][1] === "#" ? 1 : m[1][1] === "b" ? -1 : 0);
    return base + (+m[2] + 1) * 12;
  }
  function parseChord(sym) {
    var m = /^([A-G][#b]?)([^/]*)(?:\/([A-G][#b]?))?$/.exec(sym);
    if (!m || !QUAL.hasOwnProperty(m[2])) throw new Error("bad chord " + sym);
    return { root: pcOf(m[1]), ivs: QUAL[m[2]], bass: m[3] ? pcOf(m[3]) : null, sym: sym };
  }
  function parseProg(str) {
    var at = 0;
    return str.trim().split(/\s+/).map(function (tok) {
      var p = tok.split(":"), ch = parseChord(p[0]), bars = p[1] ? +p[1] : 1;
      ch.s16 = Math.round(at * 16); ch.l16 = Math.round(bars * 16); at += bars;
      return ch;
    });
  }
  /* right-hand tone set (intervals) for a style */
  function rhTones(ch, style) {
    var iv = ch.ivs.slice();
    if (style === "triad") return iv.slice(0, 3);
    if (style === "rootless") {
      var t = iv.filter(function (x) { return x !== 0; });
      if (t.length > 4 && t.indexOf(7) !== -1) t.splice(t.indexOf(7), 1);
      while (t.length > 4) t.pop();
      if (t.length >= 3) return t;
      iv = ch.ivs.slice();
    }
    if (iv.length > 4 && iv.indexOf(7) !== -1) iv.splice(iv.indexOf(7), 1);
    if (iv.length > 4) iv.shift();
    while (iv.length > 4) iv.pop();
    return iv;
  }
  /* all close voicings (every inversion, every octave) of the pitch classes, voice-led from `prev` */
  function voice(pcs, lo, hi, prev, drop2, center) {
    var uniq = [];
    pcs.forEach(function (p) { p = ((p % 12) + 12) % 12; if (uniq.indexOf(p) === -1) uniq.push(p); });
    var best = null, bestScore = 1e9;
    var srt = uniq.slice().sort(function (a, b) { return a - b; }), orders = [];
    for (var inv = 0; inv < uniq.length; inv++) { orders.push(uniq.slice(inv).concat(uniq.slice(0, inv))); orders.push(srt.slice(inv).concat(srt.slice(0, inv))); }
    for (var oi = 0; oi < orders.length; oi++) {
      var rot = orders[oi];
      for (var o = 2; o <= 7; o++) {
        var notes = [], cur = rot[0] + o * 12;
        notes.push(cur);
        for (var i = 1; i < rot.length; i++) { var n = rot[i] + Math.floor(cur / 12) * 12; while (n <= cur) n += 12; notes.push(n); cur = n; }
        if (drop2 && notes.length >= 4) { var d = notes.splice(notes.length - 2, 1)[0] - 12; notes.unshift(d); }
        notes.sort(function (a, b) { return a - b; });
        if (notes[0] < lo || notes[notes.length - 1] > hi) continue;
        var sc = 0;
        if (prev && prev.length) {
          var k = Math.min(prev.length, notes.length);
          for (var j = 0; j < k; j++) sc += Math.abs(notes[j] - prev[j]);
          sc += Math.abs(notes[notes.length - 1] - prev[prev.length - 1]) * 0.5;
        } else {
          var mean = notes.reduce(function (a, b) { return a + b; }, 0) / notes.length;
          sc = Math.abs(mean - center) * 2;
        }
        for (var q = 1; q < notes.length; q++) {
          var gap = notes[q] - notes[q - 1];
          if ((gap <= 2 && notes[q - 1] < 55) || (gap === 1 && notes[q - 1] < 58)) sc += 6; // no mud down low
          if (gap === 1) sc += q === notes.length - 1 ? 7 : 2.5;          // semitone rubs: fine inside, not on top
          if (gap === 2 && q > 1 && notes[q - 1] - notes[q - 2] <= 2) sc += 3; // three-note clusters
        }
        if (sc < bestScore) { bestScore = sc; best = notes; }
      }
    }
    return best || uniq.map(function (p) { return 60 + p; });
  }
  function lhNotes(ch, kind, lo) {
    var b = ch.bass != null ? ch.bass : ch.root, r = lo + ((b - lo) % 12 + 12) % 12;
    var third = ch.ivs.indexOf(3) !== -1 ? 3 : 4, sev = ch.ivs.indexOf(10) !== -1 ? 10 : ch.ivs.indexOf(11) !== -1 ? 11 : 7;
    switch (kind) {
      case "r": return [r];
      case "r5": return [r, r + 7];
      case "r7": return [r, r + sev];
      case "r10": return [r, r + 12 + third];
      default: return [r, r + 12];
    }
  }
  function expand(str, n) { var out = ""; while (out.length < n) out += str; return out.slice(0, n); }
  var HITV = { X: 1, x: 0.82, o: 0.62 };
  /* rhythm string → [{s16, l16, v}] (holds are split where the chord changes) */
  function hits(str, n, bounds) {
    str = expand(str.replace(/\s+/g, ""), n);
    var out = [], cur = null;
    for (var i = 0; i < n; i++) {
      var c = str[i];
      if (HITV[c]) { cur = { s16: i, l16: 1, v: HITV[c] }; out.push(cur); }
      else if (c === "-" && cur) {
        if (bounds[i]) { cur = { s16: i, l16: 1, v: cur.v * 0.85 }; out.push(cur); } else cur.l16++;
      } else cur = null;
    }
    return out;
  }
  function hash(i) { var x = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); }
  function parseMel(str) {
    if (!str) return [];
    return str.trim().split(/\s+/).map(function (tok) {
      var m = /^([A-G][#b]?-?\d)@([\d.]+)(t?)\+([\d.]+)(t?)(!|~|:[\d.]+)?$/.exec(tok);
      if (!m) throw new Error("bad melody token " + tok);
      return { p: midiOf(m[1]), s: Math.round(m[3] ? +m[2] : +m[2] * STEP), l: Math.round(m[5] ? +m[4] : +m[4] * STEP),
        acc: !m[6] ? 1 : m[6] === "!" ? 1.15 : m[6] === "~" ? 0.78 : +m[6].slice(1) };
    });
  }

  /* ---------------- the bank ---------------- */
  var CATS = [
    { id: "boombap", name: "Boom-Bap", color: "#f5b301" },
    { id: "jazzrap", name: "Jazz-Rap", color: "#fb923c" },
    { id: "lofi", name: "Lo-Fi", color: "#a78bfa" },
    { id: "soul", name: "Soulful / Conscious", color: "#facc15" },
    { id: "trap", name: "Trap", color: "#f43f5e" },
    { id: "drill", name: "Drill", color: "#e11d48" },
    { id: "westcoast", name: "West Coast / G-Funk", color: "#22d3ee" },
    { id: "dark", name: "Dark / Cinematic", color: "#94a3b8" },
    { id: "rnb", name: "R&B-Rap", color: "#f472b6" },
    { id: "orchestra", name: "Orchestra", color: "#818cf8" },
    { id: "islandorch", name: "Island Orchestra", color: "#2dd4bf" },
    { id: "jazz", name: "Jazz", color: "#38bdf8" },
    { id: "rap", name: "Rap", color: "#d946ef" },
    { id: "hiphop", name: "Hip-Hop", color: "#84cc16" }
  ];
  var LOOPS = [
    /* Boom-Bap */
    { id: "dusty-ninths", name: "Dusty Ninths", cat: "boombap", inst: "grand", bpm: 90, key: "D", mode: "minor", bars: 2,
      desc: "Chopped piano stabs on a minor-nine to minor-nine swap. Head-nod classic.",
      prog: "Dm9:1 Gm9:1", style: "rootless", rh: "X--.x-..X-.x..x.", lh: "X------.x-----..", lhv: "r8", mel: "D5@14+2~ C5@30+2~" },
    { id: "project-window", name: "Project Window", cat: "boombap", inst: "grand", bpm: 88, key: "A", mode: "minor", bars: 4,
      desc: "Minor piano with a falling bass line under it. Grimy and cinematic.",
      prog: "Am:1 Am/G#:1 Am/G:1 Am/F#:1", style: "close", rh: "X-.x..X-..x.X-..", lh: "X---------x-----", lhv: "r8", mel: "E5@14+2~ D5@30+2~ C5@46+2~ B4@62+2~" },
    { id: "crate-digger", name: "Crate Digger", cat: "boombap", inst: "rhodes", bpm: 92, key: "C", mode: "major", bars: 4,
      desc: "Laid-back Rhodes moving IV–iii–ii–V with ninths and a thirteenth.",
      prog: "Fmaj9:1 Em7:1 Dm9:1 G13:1", style: "rootless", rh: "X-----x-..X---..", lh: "X-----..X-----..", lhv: "r" },
    { id: "brick-mortar", name: "Brick & Mortar", cat: "boombap", inst: "grand", bpm: 86, key: "G", mode: "minor", bars: 4,
      desc: "Hard piano jabs in G minor, ending on a sharp-nine chord for tension.",
      prog: "Gm7:1 Ebmaj7:1 Cm9:1 D7#9:1", style: "close", drop2: true, rh: "X.x...X..X..x...", lh: "X.....X..X......", lhv: "r8" },

    /* Jazz-Rap */
    { id: "upright-smoke", name: "Upright Smoke", cat: "jazzrap", inst: "rhodes", bpm: 90, key: "Bb", mode: "major", bars: 4,
      desc: "Rootless ii–V–I Rhodes with a Charleston comp and a short horn-like line.",
      prog: "Cm9:1 F13:1 Bbmaj9:1 G7alt:1", style: "rootless", rh: "X-----x---------", lh: "X-------X-------", lhv: "r",
      mel: "A5@22+2 C6@24+4 A5@28+2 G5@30+2 F5@32+6 D5@38+2 C5@40+4 D5@44+4 Eb5@50+2 F5@52+2 Ab5@54+2 B4@56+8~" },
    { id: "late-set", name: "Late Set", cat: "jazzrap", inst: "grand", bpm: 88, key: "D", mode: "dorian", bars: 4,
      desc: "Smoky club piano: minor eleven, dominant thirteenth, major nine.",
      prog: "Dm11:1 G13:1 Cmaj9:1 A7b13:1", style: "rootless", drop2: true, rh: "X--x----..x.x---", lh: "X-------..x-----", lhv: "r" },
    { id: "cypher-changes", name: "Cypher Changes", cat: "jazzrap", inst: "grand", bpm: 94, key: "D", mode: "minor", bars: 4,
      desc: "Minor ii–V with a walking left hand and offbeat right-hand comping.",
      prog: "Em7b5:1 A7b9:1 Dm9:2", style: "rootless", rh: "..X...x...X.....", lh: null,
      mel: "E2@0+4 G2@4+4 Bb2@8+4 G#2@12+4 A2@16+4 C#3@20+4 E3@24+4 Eb3@28+4 D3@32+4 A2@36+4 F2@40+4 A2@44+4 D2@48+4 A2@52+4 G2@56+4 F2@60+4" },
    { id: "bookstore-vamp", name: "Bookstore Vamp", cat: "jazzrap", inst: "organ", bpm: 88, key: "F", mode: "dorian", bars: 2,
      desc: "Soul-jazz organ vamping between two chords. Made for storytelling verses.",
      prog: "Fm9:1 Bb13:1", style: "rootless", rh: "X--..x-...X--.x.", lh: "X-----..X-----..", lhv: "r" },

    /* Lo-Fi */
    { id: "rainy-tape", name: "Rainy Tape", cat: "lofi", inst: "lofi", bpm: 78, key: "C", mode: "major", bars: 4, vel: 0.7,
      desc: "Warbly lo-fi electric piano with a soft top line. Rain-on-the-window chords.",
      prog: "Cmaj9:1 Am9:1 Dm9:1 G13sus:1", style: "rootless", rh: "X-------..x-----", lh: "X-------x-------", lhv: "r", rhr: [50, 67],
      mel: "G5@4+2~ E5@6+2~ D5@8+8~ E5@20+2~ G5@22+2~ B5@24+8~ A5@36+2~ F5@38+2~ E5@40+8~ D5@52+2~ C5@54+2~ D5@56+6~" },
    { id: "notebook-3am", name: "3AM Notebook", cat: "lofi", inst: "rhodes", bpm: 74, key: "F", mode: "major", bars: 4, vel: 0.68,
      desc: "Sleepy Rhodes on a slow descending line. Writing-session music.",
      prog: "Bbmaj9:1 Am7:1 Gm9:1 C9sus:1", style: "rootless", rh: "X---..x-----x---", lh: "X-------..x-----", lhv: "r5", strum: 1 },
    { id: "window-seat", name: "Window Seat", cat: "lofi", inst: "lofi", bpm: 80, key: "F", mode: "minor", bars: 4, vel: 0.72,
      desc: "Dusty keys: major-nine, sharp-nine, then a long minor-nine exhale.",
      prog: "Dbmaj9:1 C7#9:1 Fm9:2", style: "rootless", rh: "X--.x-----..x---", lh: "X-------X-------", lhv: "r" },
    { id: "cassette-sunday", name: "Cassette Sunday", cat: "lofi", inst: "grand", bpm: 82, key: "D", mode: "major", bars: 4, vel: 0.6,
      desc: "Soft felt-piano feel in dotted rhythms. Chill and hopeful.",
      prog: "Gmaj9:1 F#m7:1 Em9:1 A13:1", style: "rootless", drop2: true, rh: "X-----x-----x---", lh: "X-------X-------", lhv: "r", strum: 1 },

    /* Soulful / Conscious */
    { id: "sunday-testimony", name: "Sunday Testimony", cat: "soul", inst: "grand", bpm: 84, key: "Ab", mode: "major", bars: 4,
      desc: "Gospel-flavoured piano with a quick ii–V turnaround in bar four.",
      prog: "Dbmaj9:1 Cm7:1 Fm9:1 Bbm7:0.5 Eb13:0.5", style: "close", drop2: true, rh: "X--.x-..X--.x-x.", lh: "X--.....X--.....", lhv: "r8" },
    { id: "uplift", name: "Uplift", cat: "soul", inst: "organ", bpm: 90, key: "C", mode: "major", bars: 4,
      desc: "Church-organ swells with secondary dominants. Positive, message-music energy.",
      prog: "Fmaj7:1 Em7:0.5 A7:0.5 Dm9:1 G7sus:0.5 G7:0.5", style: "close", rh: "X-------x---x---", lh: "X-------X-------", lhv: "r" },
    { id: "mamas-kitchen", name: "Mama's Kitchen", cat: "soul", inst: "rhodes", bpm: 88, key: "Eb", mode: "major", bars: 4,
      desc: "Warm Rhodes with a singing melody on top. Soulful and nostalgic.",
      prog: "Ebmaj9:1 Cm9:1 Abmaj9:1 Bb13sus:1", style: "rootless", rh: "X-----x-..x---x-", lh: "X-------..X-----", lhv: "r", rhr: [50, 67],
      mel: "Bb5@4+2~ G5@6+2 F5@8+2 G5@10+6 Eb5@18+2~ D5@20+2 C5@22+2 D5@24+8 C6@36+2~ Bb5@38+2 G5@40+2 Bb5@42+6 Ab5@52+2 G5@54+2 F5@56+4 Eb5@60+4" },
    { id: "knowledge-keys", name: "Knowledge Keys", cat: "soul", inst: "grand", bpm: 92, key: "A", mode: "minor", bars: 4,
      desc: "Reflective piano: minor nine, sharp-eleven colour, bright major nine.",
      prog: "Am9:1 Fmaj7#11:1 Cmaj9:1 Gadd9/B:1", style: "rootless", drop2: true, rh: "X--x--X---x-x---", lh: "X-------x-------", lhv: "r8" },

    /* Trap */
    { id: "midnight-bell", name: "Midnight Bell", cat: "trap", inst: "bell", bpm: 140, key: "A", mode: "harmonic", bars: 4, vel: 0.75,
      desc: "Triplet bell arpeggios over a dark minor progression with a harmonic-minor V.",
      prog: "Am:1 F:1 Dm:1 E:1", style: "triad", rhr: [64, 84], lh: null, grid: "1/16t",
      arp: { rate: 8, seq: [0, 1, 2, 3, 2, 1], acc: [1, 0.7, 0.8, 0.9, 0.7, 0.75] } },
    { id: "glacier-keys", name: "Glacier Keys", cat: "trap", inst: "grand", bpm: 142, key: "C", mode: "harmonic", bars: 4,
      desc: "Cold, spacious piano melody over soft minor chords. Leaves room for 808s.",
      prog: "Cm:1 Ab:1 Fm:1 G:1", style: "triad", rhr: [52, 67], rh: "X---------------", lh: "X---------------", lhv: "r8", vel: 0.62,
      mel: "G5@0+4! Eb5@4+2 D5@6+2 Eb5@8+6 C6@16+4! Ab5@20+2 G5@22+2 Eb5@24+6 F5@32+4! Ab5@36+2 G5@38+2 F5@40+6 D5@48+4! F5@52+2 Eb5@54+2 D5@56+2 B4@58+6" },
    { id: "cold-plug", name: "Cold Plug", cat: "trap", inst: "pluck", bpm: 150, key: "F#", mode: "harmonic", bars: 4, vel: 0.72,
      desc: "Bouncy 16th-note pluck arpeggio. Plugg / melodic-trap energy.",
      prog: "F#m:1 D:1 Bm:1 C#7:1", style: "close", rhr: [61, 81], lh: null,
      arp: { rate: 6, seq: [0, 2, 1, 3, 2, 1, 3, 4], acc: [1, 0.65, 0.8, 0.7, 0.9, 0.65, 0.8, 0.75] } },
    { id: "ice-cathedral", name: "Ice Cathedral", cat: "trap", inst: "pad", bpm: 136, key: "E", mode: "minor", bars: 4,
      desc: "Wide, dark pad chords for atmospheric trap. Add-nine shimmer, then a V7 pull.",
      prog: "Emadd9:1 Cmaj7:1 Am9:1 B7:1", style: "close", drop2: true, rhr: [52, 76], rh: "X---------------", lh: "X---------------", lhv: "r5" },

    /* Drill */
    { id: "block-ghost", name: "Block Ghost", cat: "drill", inst: "grand", bpm: 142, key: "Eb", mode: "harmonic", bars: 4,
      desc: "Menacing drill piano in 3-3-2 rhythm over soft held chords.",
      prog: "Ebm:1 Cb:1 Abm:1 Bb7:1", style: "triad", rhr: [50, 65], rh: "X---------------", lh: "X---------------", lhv: "r8", vel: 0.55,
      mel: "Bb5@0+3! Gb5@3+3 F5@6+2 Gb5@8+3 Bb5@11+3 Eb6@14+2 Db6@16+3! B5@19+3 Bb5@22+2 Gb5@24+8 Eb6@32+3! B5@35+3 Ab5@38+2 B5@40+3 Ab5@43+3 Gb5@46+2 F5@48+3! Ab5@51+3 Bb5@54+2 D6@56+8" },
    { id: "tower-strings", name: "Tower Strings", cat: "drill", inst: "strings", bpm: 144, key: "F", mode: "harmonic", bars: 4,
      desc: "Stabbing cinematic strings in the drill 3-3-2 pocket.",
      prog: "Fm:1 Db:1 Bbm:1 C7:1", style: "close", drop2: true, rhr: [53, 77], rh: "X--x--X-X--x--x-", lh: "X--x--X-X--x--x-", lhv: "r8" },
    { id: "night-shift-bells", name: "Night Shift Bells", cat: "drill", inst: "bell", bpm: 140, key: "G", mode: "harmonic", bars: 4, vel: 0.78,
      desc: "Triplet glockenspiel melody that slides over the bar line. UK / NY drill feel.",
      prog: "Gm:1 Eb:1 Cm:1 D:1", style: "triad", rh: null, lh: null, grid: "1/16t",
      mel: "G5@0t+8t! Bb5@8t+8t D6@16t+8t C6@24t+12t Bb5@36t+12t A5@48t+8t Bb5@56t+8t G5@64t+24t " +
           "G5@96t+8t! Bb5@104t+8t Eb6@112t+8t D6@120t+12t Bb5@132t+12t G5@144t+8t Bb5@152t+8t C6@160t+24t " +
           "Eb6@192t+8t! D6@200t+8t C6@208t+8t G5@216t+12t Eb5@228t+12t G5@240t+8t A5@248t+8t Bb5@256t+24t " +
           "A5@288t+8t! F#5@296t+8t A5@304t+8t D6@312t+12t C6@324t+12t Bb5@336t+8t A5@344t+8t F#5@352t+32t" },
    { id: "grey-estate", name: "Grey Estate", cat: "drill", inst: "grand", bpm: 142, key: "E", mode: "phrygian", bars: 4,
      desc: "Phrygian piano: the half-step lift from Em to F gives it the dread.",
      prog: "Em:1 Fmaj7:1 Em:1 D:1", style: "close", rhr: [55, 74], rh: "X-----x-----X---", lh: "X---------------", lhv: "r8" },

    /* West Coast / G-Funk */
    { id: "lowrider-sunset", name: "Lowrider Sunset", cat: "westcoast", inst: "rhodes", bpm: 92, key: "G", mode: "dorian", bars: 2,
      desc: "Funky 16th-note Rhodes on a minor-nine to dominant-nine dorian vamp.",
      prog: "Gm9:1 C9:1", style: "rootless", rh: "X.x..x.xX.x..x..", lh: "X-----x.X-----..", lhv: "r" },
    { id: "palm-whistle", name: "Palm Tree Whistle", cat: "westcoast", inst: "whine", bpm: 92, key: "G", mode: "dorian", bars: 4,
      desc: "High, whiny G-funk synth lead. Load Lowrider Sunset in another slot for the chords.",
      prog: "Gm9:1 C9:1 Gm9:1 C9:1", style: "rootless", rh: null, lh: null,
      mel: "D6@0+6! C6@6+2 Bb5@8+4 G5@12+4 A5@16+4 Bb5@20+2 C6@22+10 D6@32+6! F6@38+2 E6@40+4 D6@44+4 C6@48+4 Bb5@52+4 A5@56+2 G5@58+6" },
    { id: "cruise-control", name: "Cruise Control", cat: "westcoast", inst: "organ", bpm: 94, key: "A", mode: "dorian", bars: 2,
      desc: "Laid-back organ swell, minor-nine to minor-eleven. Top-down cruising.",
      prog: "Am9:1 Bm11:1", style: "rootless", rh: "X---x-..X--.x---", lh: "X-----..X-----..", lhv: "r" },
    { id: "six-four-bounce", name: "Six-Four Bounce", cat: "westcoast", inst: "synthbass", bpm: 94, key: "G", mode: "dorian", bars: 2,
      desc: "Rubbery analog-synth bassline, West Coast bounce. Pairs with the Rhodes or organ loops.",
      prog: "Gm7:1 Gm7:1", style: "close", rh: null, lh: null,
      mel: "G2@0+3! G2@3+1 Bb2@6+2 C3@8+3 D3@12+2 F2@14+2 G2@16+3! F3@20+2 D3@22+2 C3@24+4 Bb2@28+2 A2@30+2" },

    /* Dark / Cinematic */
    { id: "throne-room", name: "Throne Room", cat: "dark", inst: "strings", bpm: 80, key: "C", mode: "harmonic", bars: 4,
      desc: "Epic strings with a Neapolitan (flat-II) turn. Villain-speech energy.",
      prog: "Cm:1 Ab:1 Db:1 G:1", style: "close", drop2: true, rhr: [48, 72], rh: "X---------------", lh: "X---------------", lhv: "r5", vel: 0.7,
      mel: "G5@0+16 Ab5@16+16 F5@32+16 D5@48+8 B4@56+8" },
    { id: "chess-moves", name: "Chess Moves", cat: "dark", inst: "grand", bpm: 86, key: "D", mode: "harmonic", bars: 4,
      desc: "Relentless 16th-note piano ostinato. Mafioso, calculated.",
      prog: "Dm:1 Bb:1 Gm6:1 A7:1", style: "close", rhr: [57, 76], lh: "X-------X-------", lhv: "r8",
      arp: { rate: 6, seq: [0, 2, 1, 2], acc: [1, 0.7, 0.8, 0.7] } },
    { id: "villain-arc", name: "Villain Arc", cat: "dark", inst: "pad", bpm: 76, key: "Bb", mode: "minor", bars: 4,
      desc: "Slow, heavy pad chords in B-flat minor. Space for a dark, slow flow.",
      prog: "Bbm:1 Gb:1 Ebm:1 F:1", style: "close", drop2: true, rhr: [50, 74], rh: "X---------------", lh: "X---------------", lhv: "r5" },
    { id: "omen-box", name: "Omen Box", cat: "dark", inst: "bell", bpm: 84, key: "E", mode: "harmonic", bars: 4, vel: 0.72,
      desc: "Creepy music-box melody. Horror-core and dark-trap intros.",
      prog: "Em:1 C:1 Am:1 B7:1", style: "triad", rh: null, lh: null,
      mel: "B5@0+2 E6@2+2 G6@4+4 F#6@8+2 E6@10+2 B5@12+4 C6@16+2 E6@18+2 G6@20+4 E6@24+4 C6@28+4 A5@32+2 C6@34+2 E6@36+4 D6@40+2 C6@42+2 A5@44+4 B5@48+2 D#6@50+2 F#6@52+4 A6@56+4 D#6@60+4" },

    /* R&B-Rap */
    { id: "velvet-rope", name: "Velvet Rope", cat: "rnb", inst: "rhodes", bpm: 86, key: "Ab", mode: "major", bars: 4, vel: 0.72,
      desc: "Silky rolled Rhodes chords. Smooth R&B-rap.",
      prog: "Dbmaj9:1 Cm7:1 Bbm9:1 Eb9sus:1", style: "rootless", rh: "X-----..x-----..", lh: "X-------..x-----", lhv: "r", strum: 1 },
    { id: "late-text", name: "Late Text", cat: "rnb", inst: "grand", bpm: 92, key: "A", mode: "minor", bars: 4,
      desc: "Moody piano: major nine, sharp-nine, minor nine. Late-night R&B-rap.",
      prog: "Fmaj9:1 E7#9:1 Am9:1 G13:1", style: "rootless", drop2: true, rh: "X--.x-..X--.x---", lh: "X-------X-----..", lhv: "r8" },
    { id: "slow-wine", name: "Slow Wine", cat: "rnb", inst: "pad", bpm: 80, key: "Bb", mode: "minor", bars: 4, vel: 0.75,
      desc: "Lush pad chords with minor nines. Slow, sensual bounce.",
      prog: "Bbm9:1 Ebm9:1 Abmaj9:1 Gbmaj7#11:1", style: "rootless", rh: "X-------x-------", lh: "X---------------", lhv: "r5" },
    { id: "after-hours", name: "After Hours", cat: "rnb", inst: "lofi", bpm: 96, key: "E", mode: "major", bars: 4, vel: 0.74,
      desc: "Dusty electric piano with a hook-ready top melody.",
      prog: "Emaj9:1 C#m9:1 Amaj9:1 B13sus:1", style: "rootless", rh: "X--x--x---x-x---", lh: "X-------X-------", lhv: "r", rhr: [50, 67],
      mel: "G#5@2+2 B5@4+4 F#5@10+4 E5@18+2 G#5@20+4 D#5@26+4 C#6@34+2 B5@36+4 G#5@42+4 A5@50+2 G#5@52+2 F#5@54+2 E5@56+8" },
    /* Orchestra (sampled VSCO-2 CE strings / brass / winds; layered parts play from one pattern) */
    { id: "siege-ostinato", name: "Siege Ostinato", cat: "orchestra", inst: "ostrings", bpm: 84, key: "C", mode: "minor", bars: 4,
      desc: "Driving 16th string ostinato over a low pedal, brass stabs and an orchestral hit on the one. Battle-rap intro.",
      prog: "Cm:1 Ab/C:1 Fm/C:1 G/B:1", style: "triad", rhr: [55, 72], lh: "X---------------", lhv: "r8", lhLo: 36,
      arp: { rate: 6, seq: [0, 1, 2, 1], acc: [1, 0.66, 0.8, 0.66], len: 5 },
      layers: [{ inst: "brass", style: "close", rhr: [55, 70], rh: "X.....X.........", vel: 0.82 },
               { inst: "orchhit", mel: "C4@0+4!", vel: 0.85 }] },
    { id: "cathedral-march", name: "Cathedral March", cat: "orchestra", inst: "ostrings", bpm: 78, key: "D", mode: "minor", bars: 4, vel: 0.72,
      desc: "Slow processional: legato strings, choir-like pad, brass on the march rhythm, hits to close the phrase.",
      prog: "Dm:1 Bb:1 F/A:1 Gm:0.5 A:0.5", style: "open", rhr: [50, 72], rh: "X---------------", lh: "X-------X-------", lhv: "r8", lhLo: 38,
      layers: [{ inst: "pad", style: "close", rhr: [57, 76], rh: "X---------------", vel: 0.55 },
               { inst: "brass", style: "close", rhr: [58, 74], rh: "X.....x.....x...", vel: 0.78 },
               { inst: "orchhit", mel: "D4@0+4! A3@56+2 A3@60+2!", vel: 0.8 }] },
    { id: "pizzicato-heist", name: "Pizzicato Heist", cat: "orchestra", inst: "pizz", bpm: 92, key: "E", mode: "minor", bars: 4,
      desc: "Sneaky pizzicato on the 8ths, clarinet melody and low strings. Storytelling, caper energy.",
      prog: "Em:1 C:1 Am6:1 B7:1", style: "triad", rhr: [55, 71], rh: "X.x.X.x.X.x.X.x.", lh: "X...x...X...x...", lhv: "r", lhLo: 36,
      layers: [{ inst: "clarinet", vel: 0.74, mel: "B4@0+2 E5@2+2 G5@4+2 F#5@6+1 E5@7+1 D#5@8+4 E5@12+4 G5@16+2 E5@18+2 C5@20+4 B4@24+2 C5@26+2 E5@28+4 " +
                 "F#5@32+2 A5@34+2 C6@36+4 B5@40+2 A5@42+2 F#5@44+4 D#5@48+2 F#5@50+2 A5@52+2 G5@54+2 F#5@56+8" },
               { inst: "ostrings", style: "open", rhr: [47, 64], rh: "X---------------", vel: 0.5 }] },
    { id: "harbour-overture", name: "Harbour Overture", cat: "orchestra", inst: "steelpan", bpm: 98, key: "F", mode: "major", bars: 4,
      desc: "Island orchestra: steel-pan melody and offbeat pan chords over strings, a pizzicato tresillo bass and a flute answer.",
      prog: "F:1 Dm7:1 Bbmaj7:1 C9sus:0.5 C7:0.5", style: "triad", rhr: [53, 67], rh: "..x...x...x...x.", lh: null,
      mel: "C5@0+3 F5@3+3 A5@6+2 G5@8+2 A5@10+2 C6@12+4 D6@16+3 C6@19+3 A5@22+2 F5@24+2 A5@26+2 G5@28+4 " +
           "F5@32+3 D5@35+3 Bb4@38+2 D5@40+2 F5@42+2 A5@44+4 G5@48+3 F5@51+3 D5@54+2 E5@56+2 G5@58+2 Bb5@60+4",
      layers: [{ inst: "ostrings", style: "open", rhr: [53, 74], rh: "X-------X-------", vel: 0.5 },
               { inst: "pizz", lh: "X..x..x.X.......", lhv: "r", lhLo: 36, vel: 0.85 },
               { inst: "flute", mel: "C6@44+2 D6@46+2 C6@52+2 Bb5@54+2 G5@56+8~", vel: 0.62 }] },
    { id: "cane-field-strings", name: "Cane Field Strings", cat: "orchestra", inst: "marimba", bpm: 96, key: "A", mode: "minor", bars: 4,
      desc: "Island orchestra: 3-3-2 marimba ostinato, warm strings, brass skanks on 2 and 4, pizzicato bass.",
      prog: "Am7:1 Fmaj7:1 Dm7:1 E7sus:0.5 E7:0.5", style: "close", rhr: [57, 76], lh: null,
      arp: { rate: 6, seq: [0, 1, 2, 1, 3, 2, 1, 2], acc: [1, 0.55, 0.62, 0.95, 0.55, 0.62, 0.9, 0.55], len: 5 },
      layers: [{ inst: "ostrings", style: "open", rhr: [50, 69], rh: "X-------X-------", vel: 0.5 },
               { inst: "brass", style: "close", rhr: [57, 72], rh: "....X.......X..x", vel: 0.7 },
               { inst: "pizz", lh: "X.....x.X.....x.", lhv: "r", lhLo: 33, vel: 0.85 }] },

    /* Island Orchestra */
    { id: "sunrise-pan-suite", name: "Sunrise Pan Suite", cat: "islandorch", inst: "steelpan", bpm: 104, key: "D", mode: "major", bars: 4,
      desc: "Bright steel-pan melody, flute descant, marimba offbeats and legato strings. Feel-good island hook.",
      prog: "Dmaj7:1 Bm7:1 Em9:1 A7sus:0.5 A7:0.5", style: "close", lh: null,
      mel: "A5@0+2 F#5@2+2 A5@4+1 B5@5+1 C#6@6+4 A5@10+2 F#5@12+4 D6@16+2 C#6@18+1 B5@19+3 F#5@22+2 D5@24+2 F#5@26+2 B5@28+4 " +
           "G5@32+2 F#5@34+2 E5@36+2 B5@38+4 A5@42+2 G5@44+2 F#5@46+2 E5@48+3 D5@51+3 E5@54+2 G5@56+3 C#6@59+3 E6@62+2",
      layers: [{ inst: "ostrings", style: "close", rhr: [55, 72], rh: "X-------x-------", vel: 0.48 },
               { inst: "marimba", style: "triad", rhr: [50, 64], rh: "..x...x...x...xx", vel: 0.6 },
               { inst: "flute", mel: "C#6@0+8~ D6@16+8~ B5@32+8~ C#6@56+8~", vel: 0.55 },
               { inst: "pizz", lh: "X...x...X...x...", lhv: "r", lhLo: 38, vel: 0.8 }] },
    { id: "calypso-concerto", name: "Calypso Concerto", cat: "islandorch", inst: "brass", bpm: 112, key: "G", mode: "major", bars: 4,
      desc: "Soca-paced brass stabs answering a steel-pan line, pizzicato bass bounce and string bed.",
      prog: "G:1 Em7:1 C6:1 D7:1", style: "close", rhr: [55, 72], rh: "X..X..X...X..X..", lh: null, vel: 0.82,
      layers: [{ inst: "steelpan", vel: 0.8, mel: "B5@0+2 D6@2+2 B5@4+2 G5@6+2 A5@8+2 B5@10+2 D6@12+4 E6@16+3 D6@19+3 B5@22+2 G5@24+2 B5@26+2 E5@28+4 " +
                 "A5@32+2 G5@34+2 E5@36+2 C6@38+4 A5@42+2 G5@44+4 F#5@48+2 A5@50+2 C6@52+2 A5@54+2 F#5@56+2 E5@58+2 D5@60+4" },
               { inst: "ostrings", style: "open", rhr: [50, 67], rh: "X-------X-------", vel: 0.45 },
               { inst: "pizz", lh: "X..x..x.X..x..x.", lhv: "r", lhLo: 36, vel: 0.85 },
               { inst: "orchhit", mel: "G3@0+4!", vel: 0.75 }] },
    { id: "lagoon-kalimba", name: "Lagoon Kalimba", cat: "islandorch", inst: "kalimba", bpm: 88, key: "E", mode: "major", bars: 4,
      desc: "Rippling kalimba arpeggio, a low clarinet tune and a soft string pad. Chill beach-at-dusk vibe.",
      prog: "Emaj9:1 C#m7:1 Amaj7:1 B7sus:1", style: "close", rhr: [59, 78], lh: null,
      arp: { rate: 6, seq: [0, 2, 1, 3, 2, 1, 3, 2], acc: [1, 0.6, 0.8, 0.6, 0.9, 0.6, 0.8, 0.6], len: 6 },
      layers: [{ inst: "clarinet", vel: 0.7, mel: "B4@0+6 G#4@6+2 F#4@8+8 E4@16+4 G#4@20+4 B4@24+8 C#5@32+6 B4@38+2 A4@40+8 F#4@48+4 A4@52+4 B4@56+8" },
               { inst: "ostrings", style: "open", rhr: [47, 64], rh: "X---------------", vel: 0.42 },
               { inst: "marimba", lh: "X.......x.......", lhv: "r", lhLo: 40, vel: 0.75 }] },
    { id: "carnival-fanfare", name: "Carnival Fanfare", cat: "islandorch", inst: "brass", bpm: 118, key: "Bb", mode: "major", bars: 4, vel: 0.82,
      desc: "Road-march energy: brass fanfare, orchestral hits, marimba runs, strings and a bouncing pizzicato bass.",
      prog: "Bb:1 F/A:1 Gm7:1 Eb:0.5 F7:0.5", style: "close", rhr: [58, 74], rh: "X.xX..x.X.xX..x.", lh: null,
      layers: [{ inst: "orchhit", mel: "Bb3@0+3! F3@32+3!", vel: 0.8 },
               { inst: "marimba", style: "triad", rhr: [62, 79], arp: { rate: 6, seq: [0, 1, 2, 1], acc: [1, 0.6, 0.8, 0.6], len: 5 }, vel: 0.66 },
               { inst: "ostrings", style: "open", rhr: [50, 70], rh: "X-------X-------", vel: 0.45 },
               { inst: "pizz", lh: "X..X..X.X..X..X.", lhv: "r", lhLo: 34, vel: 0.85 }] },

    /* Jazz (straight-ahead: ii–V–I, turnarounds, swing, walking bass) */
    { id: "blue-room-changes", name: "Blue Room Changes", cat: "jazz", inst: "grand", bpm: 112, key: "F", mode: "major", bars: 4, swing8: true, grid: "1/16t",
      desc: "Swinging ii–V–I–VI in F: rootless Charleston comping over a walking bass line.",
      prog: "Gm9:1 C13:1 Fmaj9:1 D7b9:1", style: "rootless", rhr: [55, 72], rh: "X-----x---------", lh: null,
      mel: "G2@0+4~ A2@4+4~ Bb2@8+4~ B2@12+4~ C3@16+4~ E3@20+4~ G2@24+4~ Bb2@28+4~ A2@32+4~ C3@36+4~ F2@40+4~ A2@44+4~ D3@48+4~ F#2@52+4~ A2@56+4~ F#2@60+4~" },
    { id: "nine-oclock-turnaround", name: "Nine O'Clock Turnaround", cat: "jazz", inst: "rhodes", bpm: 104, key: "Eb", mode: "major", bars: 4, swing8: true, grid: "1/16t",
      desc: "Two chords a bar: I–VI–ii–V then iii–VI–ii–V in E-flat, swung Rhodes stabs and a walking bass.",
      prog: "Ebmaj9:0.5 C7b9:0.5 Fm9:0.5 Bb13:0.5 Gm7:0.5 C7alt:0.5 Fm9:0.5 Bb7b9:0.5", style: "rootless", rhr: [55, 72], rh: "X.....x.", lh: null,
      mel: "Eb2@0+4~ G2@4+4~ C3@8+4~ Bb2@12+4~ Ab2@16+4~ F2@20+4~ Bb2@24+4~ Ab2@28+4~ G2@32+4~ Bb2@36+4~ C3@40+4~ E2@44+4~ F2@48+4~ Ab2@52+4~ Bb2@56+4~ D3@60+4~" },
    { id: "lantern-ballad", name: "Lantern Ballad", cat: "jazz", inst: "grand", bpm: 70, key: "Ab", mode: "major", bars: 4, vel: 0.74,
      desc: "Jazz ballad: rolled drop-2 chords and a singing top line over ii–V–I–VI in A-flat.",
      prog: "Bbm9:1 Eb13:1 Abmaj9:1 F7b9:1", style: "rootless", drop2: true, rhr: [53, 70], rh: "X-------..x-----", lh: "X-------X-------", lhv: "r", strum: 1,
      mel: "F5@0+6 Eb5@6+2 Db5@8+8 G5@16+6 F5@22+2 Db5@24+8 C5@32+4 Eb5@36+4 G5@40+8 A5@48+6 Gb5@54+2 Eb5@56+8" },
    { id: "organ-trio-strut", name: "Organ Trio Strut", cat: "jazz", inst: "organ", bpm: 116, key: "Bb", mode: "major", bars: 4, swing8: true, grid: "1/16t",
      desc: "Organ-trio swing: ii–V–I–VI and ii–V–I in B-flat, left-hand walking bass and crisp comping.",
      prog: "Cm7:0.5 F7:0.5 Bbmaj7:0.5 G7b9:0.5 Cm9:0.5 F13:0.5 Bb6:1", style: "rootless", rhr: [62, 78], rh: "X.....x.......x.", lh: null,
      mel: "C4@0+4~ Eb4@4+4~ F3@8+4~ A3@12+4~ Bb3@16+4~ D4@20+4~ G3@24+4~ B3@28+4~ C4@32+4~ G3@36+4~ F3@40+4~ Eb3@44+4~ D3@48+4~ F3@52+4~ G3@56+4~ B3@60+4~" },

    /* Rap (sparse, hard, lots of space) */
    { id: "two-note-threat", name: "Two-Note Threat", cat: "rap", inst: "grand", bpm: 90, key: "F#", mode: "minor", bars: 2, vel: 0.86,
      desc: "Two piano notes and a low octave hit. All the space in the world for the bars.",
      prog: "F#m:2", style: "close", rh: null, lh: "X---------------", lhv: "r8", lhLo: 30,
      mel: "C#5@0+3! D5@4+2 C#5@16+3! A4@22+6~" },
    { id: "cold-bell-toll", name: "Cold Bell Toll", cat: "rap", inst: "bell", bpm: 82, key: "D", mode: "minor", bars: 4, vel: 0.8,
      desc: "A tolling bell motif over deep piano octaves. Hard, slow, serious.",
      prog: "Dm:1 Bb:1 Dm:1 Gm:1", style: "triad", rh: null, lh: null,
      mel: "A5@0+4! A5@6+2 Bb5@16+6! A5@32+4! A5@38+2 G5@48+6!",
      layers: [{ inst: "grand", mel: "D2@0+12 D3@0+12 Bb1@16+12 Bb2@16+12 D2@32+12 D3@32+12 G1@48+12 G2@48+12", vel: 0.76 }] },
    { id: "hallway-sirens", name: "Hallway Sirens", cat: "rap", inst: "grand", bpm: 92, key: "G", mode: "harmonic", bars: 4,
      desc: "One dark piano stab and a late answer per bar, a high warning note on top. Menacing, minimal.",
      prog: "Gm:2 Eb:1 D:1", style: "close", drop2: true, rhr: [55, 70], rh: "X.........x.....", lh: "X...............", lhv: "r8", lhLo: 31,
      mel: "D6@6+2~ D6@38+2~ Eb6@54+2~ D6@58+2~" },
    { id: "basement-phrygian", name: "Basement Phrygian", cat: "rap", inst: "grand", bpm: 88, key: "E", mode: "phrygian", bars: 2,
      desc: "E-to-F half-step motif and sub-low piano roots. Raw underground energy.",
      prog: "Em:1 F:1", style: "close", rh: null, lh: "X---------......", lhv: "r8", lhLo: 28,
      mel: "E5@0+2! F5@2+4 E5@10+2 F5@16+2! E5@18+6" },

    /* Hip-Hop (modern soulful, bouncy) */
    { id: "golden-hour-bounce", name: "Golden Hour Bounce", cat: "hiphop", inst: "rhodes", bpm: 94, key: "Eb", mode: "major", bars: 4,
      desc: "Bouncy Rhodes on major and minor ninths with a falling top note. Warm, modern, sunny.",
      prog: "Abmaj9:1 Gm7:1 Fm9:1 Bb13sus:1", style: "rootless", rhr: [55, 72], rh: "X..x..x...x..x..", lh: "X.....x...X.....", lhv: "r",
      mel: "Eb6@14+2~ D6@30+2~ C6@46+2~ Bb5@60+4~" },
    { id: "sunday-drive-keys", name: "Sunday Drive Keys", cat: "hiphop", inst: "grand", bpm: 96, key: "C", mode: "major", bars: 4,
      desc: "Syncopated soulful piano: IV–iii–ii–V with ninths. Feel-good, head-nodding bounce.",
      prog: "Fmaj9:1 Em9:1 Dm9:1 G13sus:0.5 G13:0.5", style: "rootless", drop2: true, rhr: [55, 72], rh: "X..x.X..x..X.x..", lh: "X.......X.x.....", lhv: "r8" },
    { id: "corner-store-soul", name: "Corner Store Soul", cat: "hiphop", inst: "rhodes", bpm: 88, key: "Bb", mode: "minor", bars: 4, vel: 0.76,
      desc: "Rolled Rhodes on minor ninths to a sharp-nine turnaround. Soulful, a little gritty.",
      prog: "Bbm9:1 Ebm9:1 Ab13:1 Dbmaj9:0.5 F7#9:0.5", style: "rootless", rhr: [53, 70], rh: "X-.x-.x-..X-.x..", lh: "X-------..x-----", lhv: "r", strum: 1 },
    { id: "penthouse-steps", name: "Penthouse Steps", cat: "hiphop", inst: "grand", bpm: 92, key: "A", mode: "major", bars: 4,
      desc: "Lush piano with a stepping bounce and a hook-ready top line. Polished modern hip-hop.",
      prog: "Dmaj9:1 C#m7:1 Bm9:1 E13:1", style: "rootless", drop2: true, rhr: [55, 72], rh: "X.x..x..X.x..x..", lh: "X.....x.X.......", lhv: "r8",
      mel: "C#6@6+2 B5@8+4 E6@22+2 C#6@24+4 D6@38+2 C#6@40+4 B5@54+2 G#5@56+8" }

  ];
  /* level trims (dB), RMS-matched offline so every loop sits ~4–5 dB under the drum kits at the default Piano Roll fader */
  var GAIN = {"dusty-ninths": -3.5, "project-window": -3, "crate-digger": -2, "brick-mortar": -2, "upright-smoke": -1.5, "late-set": -3, "cypher-changes": -2, "bookstore-vamp": 3, "rainy-tape": -3, "notebook-3am": -0.5, "window-seat": -3.5, "cassette-sunday": -0.5, "sunday-testimony": -3.5, "uplift": 1.5, "mamas-kitchen": -4, "knowledge-keys": -4, "midnight-bell": 3.5, "glacier-keys": -1, "cold-plug": 3.5, "ice-cathedral": -1, "block-ghost": -0.5, "tower-strings": 3, "night-shift-bells": 3.5, "grey-estate": -3.5, "lowrider-sunset": -2, "palm-whistle": 5, "cruise-control": 2.5, "six-four-bounce": 3, "throne-room": 2.5, "chess-moves": -2, "villain-arc": 0, "omen-box": 6, "velvet-rope": 0, "late-text": -3.5, "slow-wine": -1, "after-hours": -5.5, "siege-ostinato": 3.5, "cathedral-march": -2, "pizzicato-heist": -1, "harbour-overture": -0.5, "calypso-concerto": 0.5, "lagoon-kalimba": -2, "carnival-fanfare": -0.5, "blue-room-changes": -2.5, "lantern-ballad": -1.5, "organ-trio-strut": 6, "two-note-threat": 0.5, "cold-bell-toll": 2, "hallway-sirens": 1, "basement-phrygian": 1.5, "golden-hour-bounce": -0.5, "sunday-drive-keys": -3, "corner-store-soul": 0.5, "penthouse-steps": -3};
  var BY_ID = {};
  LOOPS.forEach(function (L) {
    L.keyPc = pcOf(L.key); L.gain = GAIN[L.id] || 0; BY_ID[L.id] = L;
    L.insts = [L.inst]; (L.layers || []).forEach(function (Y) { if (L.insts.indexOf(Y.inst) === -1) L.insts.push(Y.inst); }); // every instrument it plays
  });

  /* nearest transposition (−5…+6 semitones) from the loop's key to the song key */
  function shiftFor(L, toKey) {
    if (toKey == null || toKey === "") return 0;
    var d = (((+toKey - L.keyPc) % 12) + 12) % 12;
    return d > 6 ? d - 12 : d;
  }
  /* loop → Piano Roll pattern in `opts.key` (0–11, null = the loop's own key) */
  function build(id, opts) {
    var L = BY_ID[id];
    if (!L) return null;
    opts = opts || {};
    var n16 = L.bars * 16, prog = parseProg(L.prog), notes = [];
    var bounds = {}; prog.forEach(function (c) { bounds[c.s16] = true; });
    function chordAt(s16) { for (var i = prog.length - 1; i >= 0; i--) if (s16 >= prog[i].s16) return prog[i]; return prog[0]; }
    gen(L, null);
    (L.layers || []).forEach(function (Y) {
      var spec = { style: Y.style || L.style, drop2: Y.drop2, rhr: Y.rhr, rh: Y.rh, lh: Y.lh || null, lhv: Y.lhv, lhLo: Y.lhLo,
        arp: Y.arp, mel: Y.mel, strum: Y.strum, vel: Y.vel || L.vel };
      gen(spec, Y.inst !== L.inst ? Y.inst : null);
    });
    function gen(L, inst) {
    var base = L.vel || 0.8;
    function push(p, s, l, v) {
      var n = { p: p, s: s, l: Math.max(1, l), v: Math.max(0.05, Math.min(1, v + (hash(notes.length + p) - 0.5) * 0.07)) };
      if (inst) n.i = inst;
      notes.push(n);
    }
    var rng = L.rhr || [52, 74], center = (rng[0] + rng[1]) / 2, prev = null;
    prog.forEach(function (c) { c.rhv = voice(rhTones(c, L.style).map(function (iv) { return c.root + iv; }), rng[0], rng[1], prev, L.drop2, center); prev = c.rhv; });
    if (L.rh) hits(L.rh, n16, bounds).forEach(function (h) {
      var c = chordAt(h.s16), st = L.strum || 0;
      c.rhv.forEach(function (p, i) {
        var top = i === c.rhv.length - 1 ? 0.05 : i === 0 ? 0 : -0.04;
        push(p, h.s16 * STEP + i * st, h.l16 * STEP - i * st, base * h.v + top);
      });
    });
    if (L.arp) {
      var A = L.arp, k = 0;
      for (var t = 0; t < n16 * STEP; t += A.rate, k++) {
        var c2 = chordAt(Math.floor(t / STEP)), vv = c2.rhv, idx = A.seq[k % A.seq.length];
        var p2 = vv[idx % vv.length] + 12 * Math.floor(idx / vv.length);
        push(p2, t, A.len || A.rate, base * (A.acc ? A.acc[k % A.acc.length] : 0.85));
      }
    }
    if (L.lh !== null) {
      var lhs = L.lh ? hits(L.lh, n16, bounds) : prog.map(function (c) { return { s16: c.s16, l16: c.l16, v: 1 }; });
      lhs.forEach(function (h) {
        var c3 = chordAt(h.s16), ln = lhNotes(c3, L.lhv || "r8", L.lhLo || 36), floor = c3.rhv[0] - 3;
        ln = ln.filter(function (p, i) { return i === 0 || p <= floor; }); // left hand never crowds the right hand
        ln.forEach(function (p) { push(p, h.s16 * STEP, h.l16 * STEP, base * h.v * 0.9); });
      });
    }
    parseMel(L.mel).forEach(function (m) { push(m.p, m.s, m.l, Math.min(1, base * 1.05 * m.acc)); });
    }
    L = BY_ID[id];
    if (L.swing8) notes.forEach(function (n) { if (n.s % 24 === 12) { n.s += 4; n.l = Math.max(2, n.l - 4); } });

    var sh = shiftFor(L, opts.key);
    notes.forEach(function (n) { n.p += sh; });
    var lo = Math.min.apply(null, notes.map(function (n) { return n.p; })), hi = Math.max.apply(null, notes.map(function (n) { return n.p; }));
    var oct = hi > HIGH ? -12 : lo < LOW ? 12 : 0;
    notes.forEach(function (n) { n.p += oct; while (n.p > HIGH) n.p -= 12; while (n.p < LOW) n.p += 12; });
    var L16 = n16 * STEP;
    notes = notes.filter(function (n) { return n.s < L16; });
    notes.forEach(function (n) { n.l = Math.min(n.l, L16 - n.s); n.v = Math.round(n.v * 100) / 100; });
    notes.sort(function (a, b) { return a.s - b.s || a.p - b.p; });
    var key = (L.keyPc + sh + 120) % 12;
    return { v: 1, name: L.name, inst: L.inst, bars: L.bars, grid: L.grid || "1/16", key: key, scale: L.mode, snapScale: false, notes: notes, src: "kl:" + L.id, gain: L.gain };
  }
  function keyLabel(L, toKey) {
    var sh = shiftFor(L, toKey);
    return KEY_NAMES[(L.keyPc + sh + 120) % 12] + " " + (MODE_NAMES[L.mode] || L.mode);
  }
  window.IPBKeysLoops = { CATS: CATS, LOOPS: LOOPS, BY_ID: BY_ID, KEY_NAMES: KEY_NAMES, MODE_NAMES: MODE_NAMES, build: build, keyLabel: keyLabel, shiftFor: shiftFor, parseChord: parseChord };
})();
