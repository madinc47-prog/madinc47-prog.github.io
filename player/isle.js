// Psycho Fingers Player — "Island shout-outs": all 10 Dominica parishes + towns/villages, pre-rendered on the box with
// Kokoro-82M (voice am_fenrir, hype-man pacing, 4 phrasings per place, loudness-normalised to -20 LUFS, small MP3s that
// load only when used). Pick places grouped by parish (multi-select) or "Random around the island".
// Typed custom names keep using the on-device voice in shout.js (no robotic speechSynthesis anywhere).
export function createIsle({ hype, LS, td = () => {}, toast = () => {} }) {
  const st = { mode: LS.get('isleMode', 'random'), picks: new Set(LS.get('islePicks', [])), recent: [], vUsed: LS.get('isleV', {}), man: null, loading: null };
  const load = () => st.loading || (st.loading = fetch(new URL('./voice/isle.json', import.meta.url)).then((r) => r.json()).then((m) => { st.man = m; td('isle: ' + m.places.length + ' places, ' + m.places.reduce((a, p) => a + p.clips.length, 0) + ' clips available'); paintList(); return m; }).catch((e) => { td('isle: manifest failed ' + e.message); st.loading = null; return null; }));
  function pool() {
    if (!st.man) return [];
    const all = st.man.places.filter((p) => p.clips.length);
    return st.mode === 'random' ? all : all.filter((p) => st.picks.has(p.pid));
  }
  /** parts for hype.speak, or null to let the regular place logic run */
  async function parts() {
    if (st.mode === 'off') return null;
    await load(); const P = pool(); if (!P.length) { td('isle: nothing picked — using the usual town shout-out'); return null; }
    // no back-to-back repeats: skip the last few places (as many as the pool allows)
    const keep = Math.min(P.length - 1, 6); const fresh = P.filter((p) => !st.recent.slice(-keep).includes(p.pid));
    const p = fresh[(Math.random() * fresh.length) | 0] || P[0];
    st.recent.push(p.pid); if (st.recent.length > 12) st.recent.shift();
    // rotate phrasings per place
    const used = st.vUsed[p.pid] || []; let opts = p.clips.filter((c) => !used.includes(c.v)); if (!opts.length) { opts = p.clips.filter((c) => c.v !== used[used.length - 1]); st.vUsed[p.pid] = []; }
    const c = opts[(Math.random() * opts.length) | 0]; (st.vUsed[p.pid] = st.vUsed[p.pid] || []).push(c.v); LS.set('isleV', st.vUsed);
    td('isle: ' + st.mode + ' → ' + p.place + ' (' + p.parish + ') · "' + c.text + '"');
    return [{ file: c.file, text: c.text, lufs: c.lufs, pose: 'up', kind: 'isle', place: p.place, src: st.mode }];
  }
  // ---------------- UI (Hype panel) ----------------
  const sec = document.createElement('div'); sec.className = 'hy-sec hy-isle';
  sec.innerHTML = `<div class="hy-isle-h"><b>🇩🇲 Island shout-outs</b> <small>natural voice, 4 ways per place</small></div>
    <div class="hy-isle-modes" role="radiogroup" aria-label="Island shout-outs">
      <label><input type="radio" name="isleMode" value="random"> Random around the island</label>
      <label><input type="radio" name="isleMode" value="picks"> Only my picks</label>
      <label><input type="radio" name="isleMode" value="off"> Off (just my town)</label></div>
    <div class="hy-isle-tools"><span id="isleCount"></span><button type="button" class="linkish" id="isleAll">all</button><button type="button" class="linkish" id="isleNone">none</button><button type="button" class="eq-btn" id="isleTest">Test</button></div>
    <div class="hy-isle-list" id="isleList"><p class="hy-priv">Loading places…</p></div>`;
  hype.extra.appendChild(sec);
  const $ = (s) => sec.querySelector(s);
  const save = () => { LS.set('isleMode', st.mode); LS.set('islePicks', [...st.picks]); };
  function paintList() {
    sec.querySelectorAll('input[name=isleMode]').forEach((r) => { r.checked = r.value === st.mode; });
    const L = $('#isleList'); if (!st.man) return;
    const groups = new Map(); st.man.places.forEach((p) => { if (!groups.has(p.parish)) groups.set(p.parish, []); groups.get(p.parish).push(p); });
    L.innerHTML = ''; [...groups.keys()].sort().forEach((par) => {
      const ps = groups.get(par).sort((a, b) => (a.kind === 'parish' ? -1 : b.kind === 'parish' ? 1 : a.place.localeCompare(b.place)));
      const g = document.createElement('fieldset'); g.className = 'isle-g';
      const all = ps.every((p) => st.picks.has(p.pid));
      g.innerHTML = `<legend><label><input type="checkbox" class="isle-par"${all ? ' checked' : ''}> ${par}</label></legend>`;
      ps.forEach((p) => { const l = document.createElement('label'); l.className = 'isle-p'; l.innerHTML = `<input type="checkbox" value="${p.pid}"${st.picks.has(p.pid) ? ' checked' : ''}> <span></span>`; l.querySelector('span').textContent = p.kind === 'parish' ? 'the whole parish' : p.place; g.appendChild(l); });
      g.querySelector('.isle-par').addEventListener('change', (e) => { ps.forEach((p) => (e.target.checked ? st.picks.add(p.pid) : st.picks.delete(p.pid))); pickChanged(); });
      L.appendChild(g);
    });
    $('#isleCount').textContent = st.mode === 'random' ? `all ${st.man.places.length} places` : `${st.picks.size} picked`;
    L.classList.toggle('dim', st.mode !== 'picks');
  }
  function pickChanged() { if (st.mode !== 'picks' && st.picks.size) st.mode = 'picks'; save(); paintList(); td('isle: picks ' + st.picks.size + ' · mode ' + st.mode); hype.placeChanged && hype.placeChanged(); }
  sec.addEventListener('change', (e) => {
    if (e.target.name === 'isleMode') { st.mode = e.target.value; save(); paintList(); td('isle: mode ' + st.mode); }
    else if (e.target.closest('.isle-p')) { e.target.checked ? st.picks.add(e.target.value) : st.picks.delete(e.target.value); pickChanged(); }
  });
  $('#isleAll').addEventListener('click', () => { st.man && st.man.places.forEach((p) => st.picks.add(p.pid)); pickChanged(); });
  $('#isleNone').addEventListener('click', () => { st.picks.clear(); save(); paintList(); });
  $('#isleTest').addEventListener('click', () => { const m = st.mode; if (m === 'off') { st.mode = 'random'; } hype.fire('place', { force: true }).finally(() => { st.mode = m; }); });
  // the manifest is small; the MP3s themselves load only when a shout-out plays
  hype.root && hype.root.addEventListener('click', () => load(), { once: true });
  setTimeout(load, 8000);
  return { parts, load, get state() { return { mode: st.mode, picks: [...st.picks], recent: st.recent.slice() }; } };
}
