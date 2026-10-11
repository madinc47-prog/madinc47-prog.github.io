// Place shout-outs: "Big up, Portsmouth! Make some noise!" during normal playback.
// Which place: the one you picked (manual) > this device's detected location > DEFAULT_SHOUT_TOWN > a generic line.
// Detection runs once a day at most, only after you press play, and only on this device:
//   1) browser location (low accuracy) → nearest known town/village within 8 km, matched offline;
//      otherwise one reverse-geocode lookup (BigDataCloud client API, no key; OpenStreetMap Nominatim as backup)
//   2) if location is blocked/unavailable → approximate city from the IP address (get.geojs.io, ipapi.co backup).
// The result is cached in localStorage for 24 h. Nothing is sent anywhere else or stored on a server.
export const DEFAULT_SHOUT_TOWN = 'Dominica';
const DAY = 864e5, NEAR_KM = 8;
const hav = (a, b) => { const R = 6371, r = Math.PI / 180, dLa = (b.lat - a.lat) * r, dLo = (b.lon - a.lon) * r; const h = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
const clean = (s) => String(s || '').replace(/[<>{}"]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
const timeout = (ms) => { try { return AbortSignal.timeout(ms); } catch (e) { return undefined; } };
async function getJSON(url, ms = 8000) { const r = await fetch(url, { signal: timeout(ms), cache: 'no-store', credentials: 'omit' }); if (!r.ok) throw new Error('http ' + r.status); return r.json(); }

export function createShout(api) {
  const { hype, ladies, LS, toast } = api;
  const st = { on: LS.get('geoOn', true), geo: LS.get('geo', null), busy: false, log: [] };
  const places = () => (hype.manifest && hype.manifest.ladies ? hype.manifest.ladies.places : []);
  const shoutFor = (pid) => (hype.manifest && hype.manifest.shout ? hype.manifest.shout.places.find((p) => p.pid === pid) : null);
  const byName = (n) => { const k = clean(n).toLowerCase(); return places().find((p) => p.place.toLowerCase() === k || p.pid === k.replace(/[^a-z]+/g, '-')); };
  const fresh = () => st.geo && st.geo.name && Date.now() - st.geo.at < DAY;
  const ev = (type, d) => { const e = Object.assign({ t: Date.now(), type }, d || {}); st.log.push(e); if (st.log.length > 40) st.log.shift(); window.dispatchEvent(new CustomEvent('pf-shout', { detail: e })); };

  /** → {name, pid|null, src:'manual'|'detected'|'default'|'generic'} */
  function resolve() {
    const loc = ladies.loc;
    if (loc.id === 'custom' && clean(loc.custom)) { const p = byName(loc.custom); return { name: p ? p.place : clean(loc.custom), pid: p ? p.pid : null, src: 'manual' }; }
    if (loc.id) { const p = places().find((x) => x.pid === loc.id); if (p) return { name: p.place, pid: p.pid, src: 'manual' }; }
    if (st.on && fresh()) { const p = st.geo.pid ? places().find((x) => x.pid === st.geo.pid) : byName(st.geo.name); return { name: p ? p.place : st.geo.name, pid: p ? p.pid : null, src: 'detected', how: st.geo.how }; }
    if (DEFAULT_SHOUT_TOWN) { const p = byName(DEFAULT_SHOUT_TOWN); return { name: DEFAULT_SHOUT_TOWN, pid: p ? p.pid : null, src: 'default' }; }
    return { name: '', pid: null, src: 'generic' };
  }
  const isDominica = (r) => r && !r.pid && /^dominica$/i.test(r.name);
  const spokenFor = (name) => `Big up... ${name}! Make some noise!`;
  const textFor = (name) => `Big up, ${name}! Make some noise!`;

  /** Parts for hype.speak(). Known place → prebuilt clip; other names → on-device voice (cached), "Dominica, stand up!" while it renders. */
  async function parts() {
    const m = hype.manifest; if (!m || !m.shout) return null;
    const r = resolve(); const g = m.shout.generic;
    if (r.src === 'generic' || !r.name) { const h = m.hype.find((x) => x.id === 'make-some-noise') || m.hype[0]; return [{ file: h.file, text: h.text, lufs: h.lufs, pose: 'up', kind: 'shout-generic' }]; }
    if (isDominica(r)) return [{ file: g.file, text: g.text, lufs: g.lufs, pose: 'up', kind: 'shout', place: 'Dominica', src: r.src }];
    const e = r.pid && shoutFor(r.pid);
    if (e) return [{ file: e.file, text: e.text, lufs: e.lufs, pose: 'up', kind: 'shout', place: e.place, src: r.src }];
    let buf = null; try { buf = await Promise.race([hype.cachedText(spokenFor(r.name)), new Promise((res) => setTimeout(() => res(null), 400))]); } catch (er) {}
    if (buf) return [{ buf, text: textFor(r.name), lufs: -20, pose: 'up', kind: 'shout-custom', place: r.name, src: r.src }];
    prep(); // render it for next time
    return [{ file: g.file, text: g.text, lufs: g.lufs, pose: 'up', kind: 'shout-fallback', place: r.name, src: r.src }];
  }
  let prepFor = '';
  function prep() { // warm the on-device voice for a place without a prebuilt clip
    const r = resolve(); if (!r.name || r.pid || isDominica(r) || prepFor === r.name) return;
    prepFor = r.name; ev('render', { name: r.name });
    hype.renderText(spokenFor(r.name)).then((b) => { ev(b ? 'rendered' : 'render-failed', { name: r.name }); paint(); }).catch(() => { ev('render-failed', { name: r.name }); });
  }

  // ---------------- detection ----------------
  async function fromCoords(lat, lon) {
    const me = { lat, lon }; let best = null;
    for (const p of places()) { const d = hav(me, p); if (!best || d < best.d) best = { p, d }; }
    // towns first: a parish centroid only wins if no town/village is within range
    const towns = places().filter((p) => p.kind === 'town').map((p) => ({ p, d: hav(me, p) })).sort((a, b) => a.d - b.d);
    const ALIAS = { berekua: 'grand-bay' }; // same village — people say "Grand Bay"
    if (towns[0] && ALIAS[towns[0].p.pid]) { const a = towns.find((x) => x.p.pid === ALIAS[towns[0].p.pid]); if (a && a.d - towns[0].d < 1) towns.unshift(a); }
    if (towns[0] && towns[0].d <= NEAR_KM) return { name: towns[0].p.place, pid: towns[0].p.pid, how: `nearest town, ${towns[0].d.toFixed(1)} km` };
    try {
      const j = await getJSON(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&localityLanguage=en`);
      const n = clean(j.city || j.locality || j.principalSubdivision);
      if (n) { const p = byName(n); return { name: p ? p.place : n, pid: p ? p.pid : null, how: 'map lookup' }; }
    } catch (e) { ev('bdc-failed', { msg: String(e.message || e) }); }
    if (!LS.get('nomDay', 0) || Date.now() - LS.get('nomDay', 0) > DAY) {
      LS.set('nomDay', Date.now());
      try {
        const j = await getJSON(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=12&lat=${lat.toFixed(3)}&lon=${lon.toFixed(3)}`);
        const a = j.address || {}; const n = clean(a.city || a.town || a.village || a.hamlet || a.suburb || a.county || a.state);
        if (n) { const p = byName(n); return { name: p ? p.place : n, pid: p ? p.pid : null, how: 'map lookup' }; }
      } catch (e) { ev('nominatim-failed', { msg: String(e.message || e) }); }
    }
    if (best && best.d <= 30) return { name: best.p.place, pid: best.p.pid, how: `nearest place, ${best.d.toFixed(0)} km` };
    return null;
  }
  async function fromIP() {
    for (const [url, pick] of [['https://get.geojs.io/v1/ip/geo.json', (j) => j.city || j.region], ['https://ipapi.co/json/', (j) => j.city || j.region]]) {
      try { const n = clean(pick(await getJSON(url, 6000))); if (n) { const p = byName(n); return { name: p ? p.place : n, pid: p ? p.pid : null, how: 'approximate (internet address)' }; } } catch (e) { ev('ip-failed', { url }); }
    }
    return null;
  }
  const position = () => new Promise((res, rej) => {
    if (!navigator.geolocation) { rej({ code: 2 }); return; }
    navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: false, timeout: 10000, maximumAge: DAY });
  });
  /** Detect once per day (or now when forced). Never runs while a place is picked by hand unless forced. */
  async function detect({ force = false } = {}) {
    if (st.busy || (!force && (!st.on || fresh()))) return st.geo;
    if (!force && ladies.loc.id) return null; // manual choice wins — don't ask for location
    st.busy = true; paint(); ev('detect-start', { force });
    let res = null, denied = false;
    try { await hype.ready; } catch (e) {}
    try { const pos = await position(); ev('geo-ok', { lat: +pos.coords.latitude.toFixed(3), lon: +pos.coords.longitude.toFixed(3) }); res = await fromCoords(pos.coords.latitude, pos.coords.longitude); }
    catch (e) { denied = e && e.code === 1; ev(denied ? 'geo-denied' : 'geo-failed', { code: e && e.code }); }
    if (!res) res = await fromIP();
    st.busy = false;
    if (res) { st.geo = Object.assign(res, { at: Date.now(), denied }); LS.set('geo', st.geo); ev('detected', st.geo); prep(); }
    else ev('detect-none');
    paint(); return res;
  }

  // ---------------- UI (inside the Hype panel, under Location) ----------------
  const sec = document.createElement('div'); sec.className = 'hy-sec hy-shout';
  sec.innerHTML = `
    <div class="hy-shoutrow"><span>📣 Shouting out: <b id="shName">…</b> <small id="shSrc"></small></span>
      <button type="button" class="linkish" id="shChange">change</button></div>
    <div class="hy-locrow">
      <label class="hy-chk"><input type="checkbox" id="shOn"> Detect my town automatically</label>
      <button type="button" class="eq-btn" id="shTest" title="Play the place shout-out now">Test shout-out</button>
    </div>
    <p class="hy-priv">🔒 Your location is only used on this device to pick the town name — it is never saved on a server.</p>`;
  hype.extra.appendChild(sec);
  const $ = (s) => sec.querySelector(s);
  function paint() {
    const r = resolve();
    $('#shName').textContent = r.name || 'everybody';
    $('#shSrc').textContent = st.busy ? '(finding your town…)' : r.src === 'manual' ? '(your choice)' : r.src === 'detected' ? `(detected${r.how ? ' — ' + r.how : ''})` : r.src === 'default' ? '(default)' : '';
    $('#shOn').checked = !!st.on;
  }
  $('#shOn').addEventListener('change', (e) => { st.on = e.target.checked; LS.set('geoOn', st.on); if (!st.on) { st.geo = null; LS.set('geo', null); } else detect({ force: true }); paint(); hype.placeChanged(); });
  $('#shChange').addEventListener('click', () => { const s = document.getElementById('hyPlace'); if (s) { s.scrollIntoView({ block: 'center', behavior: 'smooth' }); s.focus(); } });
  $('#shTest').addEventListener('click', async () => { hype.fire('place', { force: true }); });
  // a new manual choice takes effect immediately (no reload)
  document.addEventListener('change', (e) => { if (e.target && (e.target.id === 'hyPlace')) { paint(); prep(); hype.placeChanged(); } });
  document.addEventListener('input', (e) => { if (e.target && e.target.id === 'hyPlaceCustom') { paint(); clearTimeout(st.it); st.it = setTimeout(() => { prep(); hype.placeChanged(); }, 1500); } });
  hype.ready.then(() => { paint(); prep(); });
  hype.setPlace(parts);

  return { resolve, detect, parts, paint, prep, get state() { return { on: st.on, geo: st.geo, busy: st.busy, log: st.log.slice() }; } };
}
