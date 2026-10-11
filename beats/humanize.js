/* Island Pin Beats — Feel engine (window.IPBFeel). Shared, dependency-free.
 * Makes programmed parts sound played: velocity → level AND tone (harder = brighter), per-hit micro-variation
 * (pitch / level, on top of the kits' round-robin layers), genre-aware micro-timing (boom-bap lay-back, tight trap,
 * Afro push), hi-hat accent maps, crescendo hat rolls, ghost-note helper, humanised chord rolls with a louder top
 * voice, and per-instrument articulation for the synth voices (bow / breath swells, longer piano release).
 * Feel modes: off | tight | natural (default) | live. "off" returns the input untouched, so Off = the old sound.
 * Everything is deterministic (hashed from song position + pad/note), so a bounce sounds the same every time and
 * matches live playback. Live input (pads, MIDI, keyboard) only gets tone/level variation — never a delay.
 * Research notes: /diagnostics/instrument-realism/RESEARCH.md (repo-external).
 */
(function () {
  "use strict";
  var MODES = ["off", "tight", "natural", "live"];
  var LABEL = { off: "Off", tight: "Tight", natural: "Natural", live: "Live" };
  var AMT = { off: 0, tight: 0.45, natural: 1, live: 1.7 };
  function norm(m) { return AMT[m] != null ? m : "natural"; }
  function amt(m) { return AMT[norm(m)]; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  /* deterministic hash → [-1, 1) */
  function h(a, b, c) {
    var x = Math.imul(((a | 0) * 31 + (b | 0)) ^ 0x5bd1e995, 0x9e3779b1) ^ Math.imul((c | 0) + 0x27d4eb2f, 0x85ebca6b);
    x ^= x >>> 15; x = Math.imul(x, 0x2c1b3c6d); x ^= x >>> 12; x = Math.imul(x, 0x297a2d39); x ^= x >>> 15;
    return ((x >>> 0) / 4294967296) * 2 - 1;
  }
  /* groove style from the kit */
  var SWUNG = { boombap: 1, rnb: 1 }, SWUNG_ID = { dusty: 1, lofilib: 1, westcoast: 1, lofi: 1 };
  function style(kit) {
    if (!kit) return "tight";
    if (SWUNG[kit.cat] || SWUNG_ID[kit.id]) return "swing";
    if (kit.cat === "afro" || kit.id === "bouyon") return "afro";
    return "tight"; // trap, drill, club, techno, jersey
  }
  /* drum role from the pad definition */
  function role(def) {
    if (!def) return "fx";
    var v = def.v;
    if (v === "kick") return "kick";
    if (v === "snare" || v === "clap" || v === "snap" || v === "rim") return "snare";
    if (v === "hat" || v === "shaker" || v === "tamb") return def.p && def.p.dec > 0.2 ? "ohat" : "hat";
    if (v === "crash") return "cym";
    if (v === "bass808" || def.g === "bass") return "808";
    if (v === "conga" || v === "cowbell" || v === "tom" || v === "tone") return "perc";
    if (def.g === "keys") return "keys";
    return "fx";
  }
  /* per-role, per-style: [lay-back ms, jitter ms, cents, level ±, accent depth] */
  var T = {
    swing: { kick: [0, 3, 4, 0.05, 0], snare: [8, 3, 7, 0.06, 0], hat: [3, 4, 11, 0.07, 0.1], ohat: [3, 3, 6, 0.05, 0.04], perc: [2, 5, 10, 0.07, 0.06], cym: [0, 3, 5, 0.04, 0], keys: [4, 3, 0, 0.04, 0] },
    tight: { kick: [0, 1.2, 3, 0.04, 0], snare: [1.5, 1.2, 6, 0.05, 0], hat: [0, 0.9, 10, 0.06, 0.07], ohat: [0, 0.8, 6, 0.05, 0.03], perc: [0, 1.5, 9, 0.06, 0.05], cym: [0, 1, 4, 0.04, 0], keys: [0, 1, 0, 0.03, 0] },
    afro: { kick: [0, 2, 4, 0.05, 0], snare: [3, 2.5, 7, 0.06, 0], hat: [-2, 3, 11, 0.07, 0.09], ohat: [-1, 2.5, 6, 0.05, 0.04], perc: [-1, 4, 12, 0.08, 0.08], cym: [0, 2, 5, 0.04, 0], keys: [1, 2, 0, 0.04, 0] }
  };
  /* metric accent: quarter > 8th > 16th (how a drummer rides hats) */
  function metric(step) { return step % 4 === 0 ? 1 : step % 2 === 0 ? 0.2 : -0.8; }
  /* velocity → low-pass cutoff (Hz): ~20 kHz at full, ~4.5 kHz for a ghost; the 808 / kick lose less */
  function cutoff(vel, r) {
    var lo = r === "808" || r === "kick" ? 900 : r === "hat" || r === "ohat" || r === "cym" ? 3200 : 1900;
    var f = lo * Math.pow(20000 / lo, Math.pow(clamp(vel / 0.85, 0, 1.3), 1.6)); // a normal 0.8 hit stays open, ghosts go dark
    return f >= 19000 ? 0 : clamp(f, lo, 19000);
  }
  /* One sequenced drum hit. o = { mode, kit, def, k (global 16th), step (pattern step), pad, vel, r (roll index), n (rolls) }
     → { dt seconds, vel, cents, lp Hz (0 = no filter) }. mode off → identical to the old engine. */
  function drum(o) {
    var a = amt(o.mode), vel = o.vel == null ? 0.8 : o.vel, n = o.n || 1, r = o.r || 0;
    if (!a) return { dt: 0, vel: r ? vel * 0.88 : vel, cents: 0, lp: 0 };
    var rl = role(o.def), st = style(o.kit), p = (T[st] || T.tight)[rl];
    if (n > 1) { // roll: crescendo into the next hit (trap rolls), first stroke a touch softer
      vel = vel * (0.66 + 0.34 * (r / (n - 1)));
    }
    if (!p) return { dt: 0, vel: vel, cents: 0, lp: 0 }; // fx / risers / vinyl: leave as designed
    var k = o.k | 0, pad = o.pad | 0, sub = r + 1;
    var dt = 0, cents = 0, lv = 0;
    if (!o.live) {
      var lay = p[0] * (o.step % 4 === 0 && rl === "snare" ? 1 : rl === "snare" ? 0.5 : 1);
      dt = (lay + h(k, pad, 11 + sub) * p[1]) * Math.min(a, 1.35) / 1000;
      if (o.mode === "live") { // a drummer pushes and pulls over the bars (slow drift, ± ~4 ms), more in fills
        var bar = k / 16; dt += (Math.sin(bar * 0.9 + pad * 0.0) * 2.4 + Math.sin(bar * 2.3) * 1.4) / 1000;
      }
      if (n > 1) dt *= 0.4; // rolls stay locked to the grid
    }
    if (p[4] && n === 1 && o.step != null) lv += metric(o.step) * p[4] * Math.min(a, 1.2);
    lv += h(k, pad, 23 + sub) * p[3] * a;
    cents = h(k, pad, 37 + sub) * p[2] * a;
    vel = clamp(vel * (1 + lv), 0.05, 1.15);
    return { dt: dt, vel: vel, cents: cents, lp: cutoff(vel, rl) };
  }
  /* live (pad / MIDI) hit: same tone + variation, never delayed */
  var liveN = 0;
  function liveDrum(mode, kit, def, pad, vel) { liveN++; return drum({ mode: mode, kit: kit, def: def, k: liveN, pad: pad, vel: vel, live: true }); }
  /* ghost note before a backbeat (Live feel, swung styles): returns velocity or 0 */
  function ghost(mode, kit, def, k, step, hasNow, nextIsBackbeat) {
    if (norm(mode) !== "live" || hasNow || !nextIsBackbeat || def.v !== "snare" || style(kit) === "tight") return 0;
    return h(k, 7, 99) > 0.1 ? 0.26 + 0.06 * h(k, 3, 5) : 0;
  }
  /* Piano Roll / chord notes. notes = [{ t, v, p, mono }] starting together (same tick) → modifies t / v in place.
     Chords roll low → high (4–14 ms, wider on soft/slow chords), top note voiced louder, inner voices softer. */
  function chord(mode, notes, seed, styleName) {
    var a = amt(mode); if (!a || !notes.length) return notes;
    var sorted = notes.slice().sort(function (x, y) { return x.p - y.p; }), N = sorted.length;
    var st = T[styleName] || T.tight, lay = (st.keys[0] || 0) / 1000, jit = (st.keys[1] || 1) / 1000;
    var base = h(seed, 1, 2) * jit * Math.min(a, 1.35) + lay * Math.min(a, 1.35);
    var spread = N > 1 ? (0.004 + 0.007 * (1 - clamp(sorted[N - 1].v, 0, 1))) * Math.min(a, 1.4) : 0;
    sorted.forEach(function (n, i) {
      if (n.mono) { n.t += base * 0.4; n.v = clamp(n.v * (1 + h(seed, n.p, 3) * 0.03 * a), 0.05, 1); return; }
      n.t += base + i * spread + h(seed, n.p, 4) * 0.0012 * a;
      var voice = N > 2 ? (i === N - 1 ? 0.06 : i === 0 ? 0.0 : -0.04) : 0;
      n.v = clamp(n.v * (1 + voice * Math.min(a, 1.2) + h(seed, n.p, 5) * 0.04 * a), 0.05, 1);
    });
    notes.forEach(function (n) { if (n.t < 0) n.t = 0; });
    return notes;
  }
  /* per-instrument articulation for the synth voices (used by keys-instruments.js):
     sw = attack swell by softness (s), rel = release × , vt = add velocity→tone low-pass, ens = ensemble drift cents */
  var ART = {
    grand: { rel: 1.6, vt: 0 }, trappiano: { rel: 1.5 }, feltpiano: { rel: 1.5 }, lofipiano: { rel: 1.4 }, rhodes: { rel: 1.4, vt: 1 }, lofi: { rel: 1.3 },
    strings: { sw: 0.45, rel: 1.3, ens: 4, vt: 1 }, pad: { sw: 0.35, rel: 1.2, ens: 3 }, sidepad: { sw: 0.2, ens: 3 },
    horn: { sw: 0.06, vt: 1, rel: 1.2 }, whine: { sw: 0.05, rel: 1.2 }, lead: { sw: 0.05, vt: 1 }, trapflute: { sw: 0.06, rel: 1.15 },
    trappluck: { vt: 1 }, gtrpluck: { vt: 1, rel: 1.3 }, pluck: { vt: 1, rel: 1.2 }, arp: { vt: 1 }, dbell: { rel: 1.2 }, bell: { rel: 1.2 },
    voxah: { sw: 0.05 }, voxoo: { sw: 0.05 },
    "808": { rel: 1.25 }, reese: { rel: 1.2 }, bass: { rel: 1.3 }, synthbass: { vt: 1, rel: 1.2 }
  };
  function art(id) { return ART[id] || null; }
  window.IPBFeel = { MODES: MODES, LABEL: LABEL, norm: norm, amt: amt, style: style, role: role, drum: drum, liveDrum: liveDrum,
    ghost: ghost, chord: chord, art: art, cutoff: cutoff, hash: h };
})();
