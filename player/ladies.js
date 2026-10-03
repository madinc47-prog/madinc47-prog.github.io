// "For the ladies" intro: before the next record comes in, the DJ brakes the current one (vinyl-brake slowdown +
// low-pass + dip), shouts out the ladies (with your location), then drops the ladies' tune cleanly.
// Detection: your per-track "♀ For the ladies" tag always wins; otherwise an on-device guess from title/artist (+BPM).
const LEAD = 6.5;         // seconds of the current record left when the brake starts
const BRAKE = 2.6;        // vinyl-brake length (s)
const BRAKE_RATE = .5;    // playback rate the brake winds down to
const THRESHOLD = 3;      // guess score needed
const KW = [
  [/\bladies\b|\blady\b|\bladys\b/, 3, 'ladies'], [/\bqueens?\b/, 2, 'queen'], [/\bgirls?\b|\bgyal\b|\bgal\b|\bgyals\b/, 2, 'girl'],
  [/\bmami\b|\bmamacita\b|\bmamii\b/, 2, 'mami'], [/\bshorty\b|\bshawty\b/, 2, 'shorty'], [/\bwine\b|\bwhine\b|\bwining\b|\bwhining\b|\bwinin\b/, 2, 'wine'],
  [/\bsexy\b/, 2, 'sexy'], [/\bbeautiful\b/, 2, 'beautiful'], [/\bbab(y|e|ee)\b/, 1.5, 'baby'], [/\blove\b|\blover\b|\bluv\b/, 1, 'love'], [/\bher\b|\bshe\b/, 1, 'her/she'],
];
const FEEL = /\br\s*&\s*b\b|\brnb\b|\br'n'b\b|\bdancehall\b|\blovers? rock\b|\bslow jam\b|\bzouk\b|\bkizomba\b|\bbachata\b|\bkompa\b/;
const hav = (a, b) => { const R = 6371, r = Math.PI / 180, dLa = (b.lat - a.lat) * r, dLo = (b.lon - a.lon) * r; const h = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };

export function guessScore(it, bpm) {
  const txt = ` ${it.title || ''} ${it.artist || ''} ${it.genre || ''} `.toLowerCase().replace(/[_\-.]+/g, ' ');
  let score = 0; const why = [];
  for (const [re, w, n] of KW) if (re.test(txt)) { score += w; why.push(n); }
  if (FEEL.test(txt)) { score += 1; why.push('R&B/dancehall feel'); }
  if (bpm && bpm >= 60 && bpm <= 105) { score += .75; why.push(Math.round(bpm) + ' BPM'); }
  return { score, why };
}

export function createLadies(api) {
  const { hype, LS, toast, getCtx, P } = api; // P: player accessors (deck, cued, current, nextItem, startTransition, isTransition)
  const tags = LS.get('ladies', {});   // key → true | false (explicit)
  const bpms = LS.get('bpms', {});     // key → measured BPM (weak signal)
  const loc = Object.assign({ id: '', custom: '' }, LS.get('place', {}));
  const fired = new WeakSet();          // decks whose ending already did the intro (once per track)
  let run = null;

  function status(it) {
    if (!it) return { on: false };
    if (it.key in tags) return { on: !!tags[it.key], src: 'tag' };
    const g = guessScore(it, bpms[it.key]);
    return { on: g.score >= THRESHOLD, src: 'guess', score: g.score, why: g.why };
  }
  function setTag(it, v) { if (v == null) delete tags[it.key]; else tags[it.key] = !!v; LS.set('ladies', tags); api.onChange && api.onChange(); }

  // ---------------- list badge + menus ----------------
  function decorateRow(li, it) {
    const s = status(it); if (!s.on) return;
    const b = document.createElement('button'); b.type = 'button';
    b.className = 'lady-badge' + (s.src === 'guess' ? ' guess' : '');
    b.textContent = s.src === 'guess' ? '♀?' : '♀';
    b.title = s.src === 'guess' ? `Looks like one for the ladies (guess: ${s.why.join(', ')}) — tap to confirm or clear` : 'For the ladies (your tag) — tap to change';
    b.setAttribute('aria-label', s.src === 'guess' ? 'For the ladies (guess) — confirm or clear' : 'For the ladies — change');
    b.addEventListener('click', (e) => { e.stopPropagation(); openBadgeMenu(it, b); });
    const sm = li.querySelector('.meta small'); if (sm) sm.prepend(b); else li.querySelector('.meta').appendChild(b);
  }
  const menu = document.createElement('div'); menu.className = 'menu'; menu.id = 'ladiesMenu'; menu.setAttribute('role', 'menu'); menu.hidden = true;
  menu.innerHTML = `<div class="menu-lbl" id="ldWhy"></div><button role="menuitem" data-v="yes">♀ Yes — for the ladies</button><button role="menuitem" data-v="no">✕ Not for the ladies</button><button role="menuitem" data-v="auto">↺ Back to auto guess</button>`;
  document.body.appendChild(menu);
  let menuIt = null;
  function openBadgeMenu(it, anchor) {
    menuIt = it; const s = status(it);
    menu.querySelector('#ldWhy').textContent = s.src === 'guess' ? `Guess: ${s.why.join(' · ')}` : 'Tagged by you';
    menu.querySelector('[data-v=auto]').hidden = s.src !== 'tag';
    api.placeMenu(menu, anchor);
  }
  menu.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b || !menuIt) return; api.closeMenus();
    const v = b.dataset.v; setTag(menuIt, v === 'yes' ? true : v === 'no' ? false : null);
    toast(v === 'yes' ? `♀ “${menuIt.title}” is for the ladies` : v === 'no' ? `“${menuIt.title}”: no ladies intro` : 'Back to the auto guess');
  });
  /** Item-menu toggle (⋯ → "♀ For the ladies"). */
  function syncItemMenu(btn, it) { const s = status(it); btn.setAttribute('aria-checked', s.on); btn.querySelector('.chk').textContent = s.on ? (s.src === 'guess' ? '?' : '✓') : ''; btn.title = s.src === 'guess' && s.on ? 'Guessed from the title — tap to turn off' : ''; }
  function toggle(it) { const s = status(it); setTag(it, !s.on); toast(!s.on ? `♀ “${it.title}” is for the ladies` : `“${it.title}”: no ladies intro`); }

  // ---------------- location ----------------
  const places = () => (hype.manifest ? hype.manifest.ladies.places : []);
  const sec = document.createElement('div'); sec.className = 'hy-sec';
  sec.innerHTML = `
    <label class="hy-l" for="hyPlace">Location <small>— for “What's up, … ladies?” (the DJ also calls a second big place)</small></label>
    <div class="hy-locrow"><select id="hyPlace" aria-label="Location"></select><button type="button" class="eq-btn" id="hyDetect" title="Use this device's location to pick the nearest town">📍 Detect</button></div>
    <input type="text" id="hyPlaceCustom" maxlength="40" placeholder="Type a place, e.g. Grand Fond" hidden>
    <p class="hy-note" id="hyPlaceNote" hidden></p>`;
  hype.extra.appendChild(sec);
  const sel = sec.querySelector('#hyPlace'), custom = sec.querySelector('#hyPlaceCustom'), note = sec.querySelector('#hyPlaceNote');
  const say = (t) => { note.textContent = t; note.hidden = !t; };
  function fillPlaces() {
    const pl = places(); const opt = (p) => `<option value="${p.pid}">${p.place}</option>`;
    sel.innerHTML = `<option value="">None — “What's up, ladies?”</option><optgroup label="Towns & villages">${pl.filter((p) => p.kind === 'town').map(opt).join('')}</optgroup><optgroup label="Parishes">${pl.filter((p) => p.kind === 'parish').map(opt).join('')}</optgroup><option value="custom">Custom place…</option>`;
    sel.value = loc.id || ''; custom.hidden = loc.id !== 'custom'; custom.value = loc.custom || '';
  }
  const saveLoc = () => LS.set('place', loc);
  sel.addEventListener('change', () => { loc.id = sel.value; saveLoc(); custom.hidden = loc.id !== 'custom'; if (loc.id === 'custom') { custom.focus(); } else say(''); prepCustom(); });
  let ct; custom.addEventListener('input', () => { loc.custom = custom.value.trim(); saveLoc(); clearTimeout(ct); ct = setTimeout(prepCustom, 1500); });
  sec.querySelector('#hyDetect').addEventListener('click', () => {
    if (!navigator.geolocation) { say('Location is not available in this browser — pick a place instead.'); return; }
    say('Finding the nearest town…');
    navigator.geolocation.getCurrentPosition((pos) => {
      const me = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      let best = null; for (const p of places()) { if (p.kind !== 'town') continue; const d = hav(me, p); if (!best || d < best.d) best = { p, d }; }
      if (!best) { say('Place list not loaded yet.'); return; }
      if (best.d > 60) { say(`You're about ${Math.round(best.d)} km from Dominica — pick a place or type one.`); return; }
      loc.id = best.p.pid; saveLoc(); sel.value = loc.id; custom.hidden = true; say(`Nearest: ${best.p.place} (${best.d.toFixed(1)} km)`);
    }, (err) => say(err.code === 1 ? 'Location permission denied — pick a place instead.' : 'Could not get your location — pick a place instead.'), { enableHighAccuracy: false, timeout: 12000, maximumAge: 600000 });
  });
  hype.ready.then(fillPlaces);
  const customLine = () => `What's up, ${loc.custom} ladies?`;
  const customSpoken = () => `What's up... ${loc.custom} ladies?!`;
  function prepCustom() { if (loc.id === 'custom' && loc.custom) { say(`Recording “${customLine()}” on this device…`); hype.renderText(customSpoken()).then((b) => say(b ? `Ready: “${customLine()}” ✓` : 'On-device voice unavailable — the bubble shows your place with the generic line.')).catch(() => say('On-device voice unavailable — the bubble shows your place with the generic line.')); } }

  /** Lines: intro + "What's up, {place} ladies?" + a second big place (Roseau, or Portsmouth when you're in Roseau). */
  async function lines() {
    const m = hype.manifest; const L = m.ladies; const pl = L.places;
    const intro = L.intro[(Math.random() * L.intro.length) | 0];
    const parts = [{ file: intro.file, text: intro.text, lufs: intro.lufs, pose: 'heart' }];
    const byId = (id) => pl.find((p) => p.pid === id);
    let first = null, firstId = '';
    if (loc.id === 'custom' && loc.custom) {
      let buf = null; try { buf = await Promise.race([hype.renderText(customSpoken()), new Promise((r) => setTimeout(() => r(null), 1500))]); } catch (e) {}
      first = buf ? { buf, text: customLine(), lufs: -20, pose: 'point' } : { file: L.generic.file, text: customLine(), lufs: L.generic.lufs, pose: 'point' };
    } else if (loc.id && byId(loc.id)) { const p = byId(loc.id); firstId = p.pid; first = { file: p.file, text: p.text, lufs: p.lufs, pose: 'point' }; }
    if (!first) { parts.push({ file: L.generic.file, text: L.generic.text, lufs: L.generic.lufs, pose: 'point' }); return parts; }
    parts.push(first);
    const second = byId(firstId === 'roseau' ? 'portsmouth' : 'roseau');
    if (second) parts.push({ file: second.file, text: second.text, lufs: second.lufs, pose: 'up' });
    return parts;
  }

  // ---------------- the intro itself ----------------
  function restore(d, keepRate) {
    if (!d || d.disposed) return; const ctx = getCtx(), t = ctx.currentTime;
    if (!keepRate) { try { d.el.playbackRate = 1; d.el.preservesPitch = true; } catch (e) {} }
    if (d.lp) { d.lp.frequency.cancelScheduledValues(t); d.lp.frequency.setValueAtTime(ctx.sampleRate / 2, t); }
    if (d.gain) { d.gain.gain.cancelScheduledValues(t); d.gain.gain.setValueAtTime(d.fade, t); }
  }
  function abort(why) { if (!run) return; const r = run; run = null; clearInterval(r.iv); clearInterval(r.watch); r.timers.forEach(clearTimeout); hype.busy = false; restore(r.deck); r.why = why; api.onAbort && api.onAbort(why); }
  /** Hooked into the auto-mix check. Return true to hold the normal transition. */
  function before(rem) {
    if (run) { if (P.deck() !== run.deck || run.deck.el.paused && !run.ended) { abort('interrupted'); return false; } return run.holding; }
    const d = P.deck(), nx = P.cued();
    if (!d || !nx || !hype.S.on || fired.has(d) || P.isTransition()) return false;
    if (rem > LEAD || rem < 1.2) return false;
    const it = nx.item; if (!status(it).on) return false;
    if (P.current() && P.current().key === it.key) return false; // the ladies' track is already playing
    const next = P.nextItem(); if (!next || next.key !== it.key) return false;
    if (hype.talking) return false; // let the current line finish (re-checked every tick)
    fired.add(d); start(d, nx);
    return true;
  }
  async function start(d, nx) {
    const ctx = getCtx(); hype.busy = true;
    run = { deck: d, nx, holding: true, timers: [], iv: 0, t0: performance.now(), stage: 'brake' };
    const r = run;
    try { d.el.preservesPitch = false; d.el.mozPreservesPitch = false; d.el.webkitPreservesPitch = false; } catch (e) {}
    // vinyl brake: rate 1 → BRAKE_RATE (ease-in), low-pass sweep 20 kHz → 900 Hz, dip ~ −6 dB
    const t = ctx.currentTime;
    if (d.lp) { const f = d.lp.frequency; f.cancelScheduledValues(t); f.setValueAtTime(Math.min(20000, ctx.sampleRate / 2), t); f.exponentialRampToValueAtTime(900, t + BRAKE); }
    if (d.gain && !d.raw) { const g = d.gain.gain; g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(d.fade * .5, t + BRAKE); }
    const t0 = performance.now();
    r.iv = setInterval(() => {
      if (run !== r) return; const k = Math.min(1, (performance.now() - t0) / (BRAKE * 1000));
      try { d.el.playbackRate = 1 - (1 - BRAKE_RATE) * Math.pow(k, 1.7); } catch (e) {}
      if (k >= 1) clearInterval(r.iv);
    }, 30);
    d.el.addEventListener('ended', () => { r.ended = true; }, { once: true });
    // the DJ talks as the record winds down
    const parts = await lines();
    const bufs = await Promise.all(parts.map((p) => (p.buf ? p.buf : hype.loadBuf(p.file).catch(() => null))));
    parts.forEach((p, i) => { if (bufs[i]) p.buf = bufs[i]; });
    r.parts = parts.map((p) => p.text);
    const lead = api.transitionLead ? api.transitionLead() : .9;
    const totalDur = parts.reduce((a, p) => a + (p.buf ? p.buf.duration : 1.5), 0) + (parts.length - 1) * .12;
    const talkAt = Math.max(0, BRAKE * 1000 * .55 - (performance.now() - t0));
    r.timers.push(setTimeout(async () => {
      if (run !== r) return; r.stage = 'talk';
      // keep sinking the old record under the voice
      if (d.gain && !d.raw) { const tt = ctx.currentTime, g = d.gain.gain; g.cancelScheduledValues(tt); g.setValueAtTime(g.value, tt); g.linearRampToValueAtTime(d.fade * .3, tt + totalDur); }
      // drop the ladies' record so it lands right as the last line ends
      r.timers.push(setTimeout(() => { if (run !== r) return; r.stage = 'drop'; r.holding = false; hype.busy = false; api.startTransition({ mixSecs: .35 }); }, Math.max(0, totalDur - lead) * 1000));
      const ok = await hype.speak(parts, { gap: .12 });
      if (!ok && run === r && r.holding) { r.holding = false; hype.busy = false; api.startTransition({ mixSecs: .35 }); }
      r.timers.push(setTimeout(() => { if (run === r) { run = null; hype.busy = false; } }, 1500));
    }, talkAt));
    r.watch = setInterval(() => { if (run !== r) { clearInterval(r.watch); return; } if (P.deck() !== d && r.holding) abort('track changed'); else if (d.el.paused && !r.ended && r.holding) abort('paused'); }, 200);
    api.onStart && api.onStart(r);
  }
  /** Learn BPM per track (weak signal for the guess). */
  let lastLearn = 0;
  function learn(now, it, F, deck) {
    if (!it || !deck || deck.el.paused || now - lastLearn < 5000) return; lastLearn = now;
    if (F.bpm > 40 && deck.el.currentTime > 15 && !run) { const b = Math.round(F.bpm); if (bpms[it.key] !== b) { bpms[it.key] = b; const ks = Object.keys(bpms); if (ks.length > 400) delete bpms[ks[0]]; LS.set('bpms', bpms); } }
  }
  /** Hold the auto-advance on "ended" while the intro is running. */
  const holdEnd = () => !!(run && run.holding);
  return { status, setTag, toggle, decorateRow, syncItemMenu, before, holdEnd, learn, guessScore, get run() { return run; }, loc, lines, abort };
}
