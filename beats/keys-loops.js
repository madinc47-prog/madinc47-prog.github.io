/* Island Pin Beats — hip-hop keys / piano loop bank (window.IPBKeysLoops).
 * Every loop is ORIGINAL: chord progressions, voicings, rhythms and melodies written for this app, synthesized in the
 * browser by keys-instruments.js — no samples, no recreated records. Each loop builds into a plain Piano Roll pattern
 * (pianoroll-data.js format), transposed to the song key; time is in ticks, so loops always follow the song BPM + swing.
 *
 * Loop definition (all in the loop's own reference key):
 *   prog  "Dm9:1 Gm9:1"            chord symbols with length in bars (0.5 = half a bar); "/B" = slash bass
 *   style "rootless"|"close"|"triad"|"open"   right-hand voicing; drop2 spreads it; rh:[lo,hi] its MIDI range
 *   rh    "X--.x-..X-.x..x."        comp rhythm per 16th: X accent · x normal · o ghost · - hold · . rest (repeats)
 *   lh    "X-------X-------"|null   left-hand rhythm (default: one hit per chord); lhv "r"|"r5"|"r8"|"r7"|"r10"
 *   arp   { rate, seq, len, acc }   arpeggiate the right-hand voicing instead of comping (rate/len in ticks)
 *   mel   "E5@0+3 D5@3+1!"          melody notes: pitch@start+length in 16ths (…t = ticks), ! accent, ~ soft
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
    { id: "rnb", name: "R&B-Rap", color: "#f472b6" }
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
      mel: "G#5@2+2 B5@4+4 F#5@10+4 E5@18+2 G#5@20+4 D#5@26+4 C#6@34+2 B5@36+4 G#5@42+4 A5@50+2 G#5@52+2 F#5@54+2 E5@56+8" }
  ];
  /* level trims (dB), RMS-matched offline so every loop sits ~4–5 dB under the drum kits at the default Piano Roll fader */
  var GAIN = {"dusty-ninths": -3.5, "project-window": -3, "crate-digger": -2, "brick-mortar": -2, "upright-smoke": -1.5, "late-set": -3, "cypher-changes": -2, "bookstore-vamp": 3, "rainy-tape": -3, "notebook-3am": -0.5, "window-seat": -3.5, "cassette-sunday": -0.5, "sunday-testimony": -3.5, "uplift": 1.5, "mamas-kitchen": -4, "knowledge-keys": -4, "midnight-bell": 3.5, "glacier-keys": -1, "cold-plug": 3.5, "ice-cathedral": -1, "block-ghost": -0.5, "tower-strings": 3, "night-shift-bells": 3.5, "grey-estate": -3.5, "lowrider-sunset": -2, "palm-whistle": 5, "cruise-control": 2.5, "six-four-bounce": 3, "throne-room": 2.5, "chess-moves": -2, "villain-arc": 0, "omen-box": 6, "velvet-rope": 0, "late-text": -3.5, "slow-wine": -1, "after-hours": -5.5};
  var BY_ID = {};
  LOOPS.forEach(function (L) { L.keyPc = pcOf(L.key); L.gain = GAIN[L.id] || 0; BY_ID[L.id] = L; });

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
    var n16 = L.bars * 16, prog = parseProg(L.prog), base = L.vel || 0.8, notes = [];
    var bounds = {}; prog.forEach(function (c) { bounds[c.s16] = true; });
    function chordAt(s16) { for (var i = prog.length - 1; i >= 0; i--) if (s16 >= prog[i].s16) return prog[i]; return prog[0]; }
    function push(p, s, l, v) { notes.push({ p: p, s: s, l: Math.max(1, l), v: Math.max(0.05, Math.min(1, v + (hash(notes.length + p) - 0.5) * 0.07)) }); }
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
