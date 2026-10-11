// Psycho Fingers Player — popularity rewind ("pull up!").
// Looks the playing song up on a music service: Deezer (public search API over JSONP; `rank` is Deezer's own popularity
// score), iTunes Search as a fallback (it has no score, so a match only counts as "medium"), cached on this device.
// Offline / not found → how often the song was played here. Big songs get a real dancehall rewind: the last seconds of the
// mix spin backwards (captured from the master, played in reverse with the speed rising), the DJ's hand drags the
// platter back, "pull up!", and the tune runs again. At most once per song every REWIND_GAP_MIN minutes.
const REWIND_GAP_MIN = 20, CACHE_DAYS = 30, RING_SECS = 4;
const TIER = (rank) => (rank >= 850000 ? 'huge' : rank >= 650000 ? 'high' : rank >= 400000 ? 'medium' : 'low');
const clean = (s) => String(s || '').replace(/\.(mp3|m4a|wav|flac|ogg|opus|aac)$/i, '').replace(/[_]+/g, ' ').replace(/\((official|lyric|audio|video|visualizer|prod)[^)]*\)|\[[^\]]*\]/gi, '').replace(/\s+/g, ' ').trim();

export function createPop({ td = () => {}, LS, toast = () => {}, hype, scene, getCtx, getOut, getTap, getDeck, getBpm }) {
  const cache = LS.get('popCache', {}), plays = LS.get('popPlays', {}), last = LS.get('popLast', {});
  const S = Object.assign({ on: true }, LS.get('pop', {}));
  const save = () => { LS.set('popCache', cache); LS.set('popPlays', plays); LS.set('popLast', last); };
  /** artist + title from the tags, else from "Artist - Title" in the file name */
  function ident(item) {
    let artist = clean(item.artist), title = clean(item.title);
    if (!artist) { const m = /^(.+?)\s+[-–—]\s+(.+)$/.exec(title); if (m) { artist = m[1].trim(); title = m[2].trim(); } }
    title = title.replace(/\s*(ft\.?|feat\.?)\s.*$/i, '').trim();
    return { artist, title, key: (artist + '|' + title).toLowerCase() };
  }
  let jn = 0;
  function jsonp(url, ms = 6000) {
    return new Promise((res, rej) => {
      const cb = '__pfPop' + (++jn) + '_' + Date.now(); const sc = document.createElement('script');
      const done = (v, e) => { clearTimeout(t); delete window[cb]; sc.remove(); e ? rej(e) : res(v); };
      const t = setTimeout(() => done(null, new Error('timeout')), ms);
      window[cb] = (d) => done(d); sc.onerror = () => done(null, new Error('network'));
      sc.src = url + (url.includes('?') ? '&' : '?') + (url.includes('itunes') ? 'callback=' : 'output=jsonp&callback=') + cb; document.head.appendChild(sc);
    });
  }
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const sameish = (a, b) => { a = norm(a); b = norm(b); return !!a && !!b && (a === b || a.includes(b) || b.includes(a)); };
  async function lookup(item) {
    const id = ident(item); if (!id.title) return { tier: 'low', src: 'none', why: 'no title' };
    const c = cache[id.key]; if (c && Date.now() - c.at < CACHE_DAYS * 864e5) { td('pop: cached ' + id.key + ' → ' + c.tier + ' (' + c.src + (c.rank ? ' rank ' + c.rank : '') + ')'); return c; }
    const q = id.artist ? `artist:"${id.artist}" track:"${id.title}"` : id.title;
    td('pop: query Deezer "' + q + '"');
    let r = null;
    try {
      let d = await jsonp('https://api.deezer.com/search?limit=10&q=' + encodeURIComponent(q));
      if ((!d || !d.data || !d.data.length) && id.artist) d = await jsonp('https://api.deezer.com/search?limit=10&q=' + encodeURIComponent(id.artist + ' ' + id.title));
      const hits = (d && d.data) || [];
      const best = hits.filter((h) => sameish(h.title_short || h.title, id.title) && (!id.artist || sameish(h.artist && h.artist.name, id.artist))).sort((a, b) => b.rank - a.rank)[0];
      if (best) r = { tier: TIER(best.rank), rank: best.rank, src: 'Deezer', match: (best.artist && best.artist.name) + ' – ' + best.title, at: Date.now() };
      td('pop: Deezer ' + hits.length + ' results' + (best ? ' · match "' + r.match + '" rank ' + best.rank + ' → ' + r.tier : ' · no match'));
    } catch (e) { td('pop: Deezer failed (' + e.message + ')'); }
    if (!r) {
      try {
        const d = await jsonp('https://itunes.apple.com/search?entity=song&limit=10&term=' + encodeURIComponent((id.artist + ' ' + id.title).trim()));
        const best = ((d && d.results) || []).find((h) => sameish(h.trackName, id.title) && (!id.artist || sameish(h.artistName, id.artist)));
        if (best) r = { tier: 'medium', src: 'iTunes', match: best.artistName + ' – ' + best.trackName, at: Date.now() };
        td('pop: iTunes ' + (best ? 'match "' + r.match + '" (no popularity score → medium)' : 'no match'));
      } catch (e) { td('pop: iTunes failed (' + e.message + ')'); }
    }
    if (r) { cache[id.key] = r; save(); return r; }
    const n = plays[id.key] || 0; // offline / unknown: how often it was played on this device
    return { tier: n >= 8 ? 'high' : n >= 3 ? 'medium' : 'low', src: 'plays here', plays: n };
  }
  const label = (r) => r ? 'Popularity: ' + r.tier + ' (' + r.src + (r.src === 'plays here' ? ' ' + r.plays + '×' : '') + ')' : '';

  // ---------------- capture the last few seconds of the mix (for a real backspin) ----------------
  let ring = null;
  async function ensureRing() {
    const ctx = getCtx(); if (ring && ring.ctx === ctx) return ring;
    const n = Math.round(ctx.sampleRate * RING_SECS);
    const code = `class R extends AudioWorkletProcessor{constructor(){super();this.n=${n};this.b=[new Float32Array(this.n),new Float32Array(this.n)];this.i=0;this.port.onmessage=()=>{const o=[0,1].map(c=>{const a=new Float32Array(this.n);a.set(this.b[c].subarray(this.i));a.set(this.b[c].subarray(0,this.i),this.n-this.i);return a});this.port.postMessage(o,[o[0].buffer,o[1].buffer])}}process(I){const x=I[0];if(x&&x[0]){const L=x[0],Rr=x[1]||x[0];for(let k=0;k<L.length;k++){this.b[0][this.i]=L[k];this.b[1][this.i]=Rr[k];this.i=(this.i+1)%this.n}}return true}}registerProcessor('pf-ring',R)`;
    try {
      await ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([code], { type: 'application/javascript' })));
      const node = new AudioWorkletNode(ctx, 'pf-ring', { numberOfInputs: 1, numberOfOutputs: 0, channelCount: 2, channelCountMode: 'explicit' });
      getTap().connect(node); ring = { ctx, node };
    } catch (e) { td('pop: no capture (' + e.message + ') — synthetic backspin'); ring = { ctx, node: null }; }
    return ring;
  }
  const snap = () => new Promise((res) => { if (!ring || !ring.node) return res(null); const t = setTimeout(() => res(null), 400); ring.node.port.onmessage = (e) => { clearTimeout(t); res(e.data); }; ring.node.port.postMessage(1); });
  /** play the captured audio backwards, speeding up like a hand dragging the record; returns when done */
  async function backspin(ms) {
    const ctx = getCtx(); const ch = await snap(); const out = getOut();
    const g = ctx.createGain(); g.connect(out); const t0 = ctx.currentTime + .01, secs = ms / 1000;
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(1, t0 + .04); g.gain.setValueAtTime(1, t0 + secs * .7); g.gain.exponentialRampToValueAtTime(0.0001, t0 + secs);
    if (ch) {
      const b = ctx.createBuffer(2, ch[0].length, ctx.sampleRate);
      [0, 1].forEach((c) => { const s = ch[c], d = b.getChannelData(c); for (let i = 0; i < s.length; i++) d[i] = s[s.length - 1 - i]; });
      const src = ctx.createBufferSource(); src.buffer = b; src.playbackRate.setValueAtTime(1, t0); src.playbackRate.exponentialRampToValueAtTime(3.2, t0 + secs * .85);
      src.connect(g); src.start(t0); src.stop(t0 + secs + .05);
    } else { // synthetic: filtered noise sweeping up (no capture available)
      const b = ctx.createBuffer(1, Math.round(ctx.sampleRate * secs), ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * .35;
      const src = ctx.createBufferSource(); src.buffer = b; const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 3; bp.frequency.setValueAtTime(300, t0); bp.frequency.exponentialRampToValueAtTime(2600, t0 + secs);
      src.connect(bp).connect(g); src.start(t0);
    }
    await new Promise((r) => setTimeout(r, ms + 60)); try { g.disconnect(); } catch (e) {}
    return !!ch;
  }
  // ---------------- the rewind itself ----------------
  const R = { busy: false, track: null, done: false, dropAt: null };
  async function rewindOnce(deck, toTime, ms = 1100) {
    const ctx = getCtx(), gg = deck.gain && deck.gain.gain, t = ctx.currentTime, keep = gg ? gg.value : 1;
    scene.rewind(ms, 4.5);
    if (gg) { gg.cancelScheduledValues(t); gg.setValueAtTime(keep, t); gg.linearRampToValueAtTime(0, t + .05); }
    const real = await backspin(ms);
    try { deck.el.currentTime = Math.max(0, toTime); } catch (e) {}
    td('pop: rewind ' + (real ? 'backspin from the mix' : 'synthetic backspin') + ' → ' + toTime.toFixed(1) + ' s');
    return { keep, real };
  }
  function restore(deck, keep) { const ctx = getCtx(), gg = deck.gain && deck.gain.gain; if (!gg) return; const t = ctx.currentTime; gg.cancelScheduledValues(t); gg.setValueAtTime(0, t); gg.linearRampToValueAtTime(keep, t + .08); }
  async function doRewind(tier, why = '') {
    const deck = getDeck(); if (!deck || R.busy || deck.el.paused) return false;
    R.busy = true; hype.busy = true;
    try {
      await ensureRing();
      const bpm = getBpm() || 100, back8 = 32 * 60 / bpm, now = deck.el.currentTime;
      const top = R.dropAt != null && R.dropAt > 4 && Math.random() < .5 ? Math.max(0, R.dropAt - 4 * 60 / bpm) : 0;
      td('pop: decision ' + tier + (why ? ' · ' + why : '') + ' → ' + (tier === 'medium' ? 'one rewind (8 bars back)' : tier === 'high' ? 'rewind + pull up + from the ' + (top ? 'drop' : 'top') : 'double rewind + pull up'));
      if (tier === 'medium') { const { keep } = await rewindOnce(deck, Math.max(0, now - back8)); restore(deck, keep); }
      else {
        let { keep } = await rewindOnce(deck, top);
        if (tier === 'huge') { restore(deck, keep); await new Promise((r) => setTimeout(r, 1800)); ({ keep } = await rewindOnce(deck, top, 900)); } // the crowd wants it again
        hype.busy = false; const said = hype.pullUp ? hype.pullUp() : null; // "Pull up!" while the needle comes back
        await new Promise((r) => setTimeout(r, 650)); restore(deck, keep); await said;
      }
      return true;
    } finally { R.busy = false; hype.busy = false; }
  }
  // ---------------- per-track decision ----------------
  async function onTrackStart(item, deck) {
    const id = ident(item); R.track = { key: id.key, at: performance.now(), deck, result: null, title: item.title }; R.done = false; R.dropAt = null;
    plays[id.key] = (plays[id.key] || 0) + 1; save();
    if (!S.on) return;
    const t = R.track; const r = await lookup(item).catch(() => null); if (R.track !== t) return;
    t.result = r; item.pop = r; td('pop: ' + (item.title || '?') + ' · ' + label(r)); window.dispatchEvent(new CustomEvent('pf-pop', { detail: { key: item.key, label: label(r), tier: r && r.tier } }));
  }
  /** called every frame from the player loop; picks the moment (after the first drop / a phrase line, 35–100 s in) */
  function tick(info) {
    const t = R.track; if (!S.on || !t || !t.result || R.done || R.busy) return;
    const deck = getDeck(); if (!deck || deck !== t.deck || deck.el.paused) return;
    const pos = deck.el.currentTime, dur = deck.el.duration || 0;
    if (info && info.drop && R.dropAt == null && pos > 8) R.dropAt = pos;
    if (pos < 35 || (dur && pos > dur - 25)) return;
    const tier = t.result.tier; if (tier === 'low') { R.done = true; td('pop: decision low → no rewind'); return; }
    const lastAt = last[t.key] || 0; if (Date.now() - lastAt < REWIND_GAP_MIN * 60000) { R.done = true; td('pop: decision ' + tier + ' → skip (rewound ' + Math.round((Date.now() - lastAt) / 60000) + ' min ago, cap ' + REWIND_GAP_MIN + ' min)'); return; }
    const onLine = info && info.phrase8; if (!(onLine && (R.dropAt != null || pos > 55)) && pos < 100) return;
    if (hype.talking || scene.busy) return;
    R.done = true; last[t.key] = Date.now(); save(); doRewind(tier);
  }
  const api = { ident, lookup, label, onTrackStart, tick, doRewind, backspin, S, get state() { return { track: R.track && { key: R.track.key, result: R.track.result }, busy: R.busy, done: R.done, dropAt: R.dropAt }; }, setOn(v) { S.on = !!v; LS.set('pop', S); td('pop: ' + (S.on ? 'on' : 'off')); } };
  // switch in the Hype panel
  if (hype.extra) {
    const sec = document.createElement('div'); sec.className = 'hy-sec hy-pop';
    sec.innerHTML = `<label class="hy-chk"><input type="checkbox" id="popOn"> <b>⏪ Rewind big tunes</b> — popular songs get a "pull up!" rewind (popularity = Deezer's rank for the song, iTunes if Deezer doesn't know it, else how often you played it here; at most once per song every ${REWIND_GAP_MIN} min)</label> <button type="button" class="eq-btn" id="popTest">Test rewind</button>`;
    hype.extra.appendChild(sec);
    const cb = sec.querySelector('#popOn'); cb.checked = S.on; cb.addEventListener('change', () => api.setOn(cb.checked));
    sec.querySelector('#popTest').addEventListener('click', () => { const t = R.track && R.track.result; doRewind(t && t.tier !== 'low' ? t.tier : 'high', 'test button').then((ok) => { if (!ok) toast('Start a song first, then test the rewind'); }); });
  }
  return api;
}
