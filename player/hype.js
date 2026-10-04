// Hype talk — the DJ talks to the crowd (pre-rendered Kokoro-82M voice clips, am_fenrir).
// Voice plays through AudioBufferSourceNodes on its own bus (after the EQ, before the master volume),
// the music is ducked ~3.5 dB while a line plays, and the voice gain adapts to the music's loudness
// so a line sits ~3–4 dB under the music (plus the "Voice volume" slider).
const DUCK_DB = 3.5, UNDER_DB = 3.5, MIN_GAP = 30;           // seconds between lines (min)
const PERIOD = { low: 150, med: 90, high: 60 };              // occasional lines (s, ±25 %)
const CHANCE = { low: .45, med: .7, high: .95 };             // chance an event (track start / mix / energy) gets a line
const DEFAULT_NAMES = 'DJ Eli';
const KOKORO_MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const VOICE = 'am_fenrir';
const CLIP_LUFS = -20.4;                                      // integrated loudness of the shipped clips (ffmpeg ebur128)
const SPEECH_OFS = 1.4;  // speech-only (gated) level reads ~1.4 dB above integrated on the live K-weighted meter → calibrate so lines land UNDER_DB below
// 12 call-out templates (the same set used for the pre-rendered "DJ Eli" clips)
export const CALLOUT_TEMPLATES = [
  '{n}, I see you in the crowd — big love!', 'Shout out {n}, we appreciate you!', '{n} in the building — make some noise for {n}!',
  'This one goes out to {n}!', '{n}, you in the crowd — we get love!', 'Big up {n}! Respect!', "Where's {n} at? Let me hear you!",
  "{n}, this one's for you!", 'Everybody say hi to {n}!', '{n}! Yeah, you — keep that energy!', 'Respect to {n} in the house!',
  '{n}, thanks for rocking with us tonight!',
];
const SPOKEN = { // how the TTS should read a template (pauses / emphasis)
  '{n}, I see you in the crowd — big love!': '{s}... I see you in the crowd! Big love!', 'Shout out {n}, we appreciate you!': 'Shout out {s}! We appreciate you!',
  '{n} in the building — make some noise for {n}!': '{s} in the building! Make some noise for {s}!!', 'This one goes out to {n}!': 'This one goes out to {s}!!',
  '{n}, you in the crowd — we get love!': '{s}! You in the crowd... we get love!', 'Big up {n}! Respect!': 'Big up {s}! Respect!!',
  "Where's {n} at? Let me hear you!": "Where's {s} at?! Let me hear you!", "{n}, this one's for you!": "{s}... this one's for you!!",
  'Everybody say hi to {n}!': 'Everybody, say hi to {s}!!', '{n}! Yeah, you — keep that energy!': '{s}! Yeah, you! Keep that energy!!',
  'Respect to {n} in the house!': 'Respect to {s}, in the house!!', '{n}, thanks for rocking with us tonight!': '{s}... thanks for rocking with us tonight!',
};
const PREFER = {
  start: ['here-we-go', 'in-the-mix', 'are-you-ready', 'lets-go', 'on-the-decks', 'party-people', 'keep-it-locked'],
  mix: ['bring-it-back', 'keep-it-locked', 'in-the-mix', 'here-we-go', 'dont-stop', 'one-more-time', 'wheel-it-up', 'dont-stop-now'],
  energy: ['make-some-noise', 'hands-in-the-air', 'put-your-hands-up', 'big-tune', 'louder', 'feel-the-bass', 'everybody-jump', 'lighters-up', 'turn-it-up', 'bounce-with-me', 'everybody-move'],
};
const UP_POSE = /hands|lighters|jump|louder|turn-it-up|noise|bounce/;
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const dbToGain = (db) => Math.pow(10, db / 20);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };

// ---------------- tiny IndexedDB cache for on-device renders (separate from media-store) ----------------
const IDB = (() => {
  let dbp = null;
  const db = () => dbp || (dbp = new Promise((res, rej) => { const r = indexedDB.open('pf-voice-cache', 1); r.onupgradeneeded = () => r.result.createObjectStore('clips'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }));
  const tx = async (mode, fn) => { const d = await db(); return new Promise((res, rej) => { const t = d.transaction('clips', mode); const st = t.objectStore('clips'); const rq = fn(st); t.oncomplete = () => res(rq && rq.result); t.onerror = () => rej(t.error); }); };
  return { get: (k) => tx('readonly', (s) => s.get(k)).catch(() => null), put: (k, v) => tx('readwrite', (s) => s.put(v, k)).catch(() => null), keys: () => tx('readonly', (s) => s.getAllKeys()).catch(() => []) };
})();

/** Bag that never repeats an item until ~80 % of the items have been used. */
function makeBag(ids) {
  let used = [];
  return {
    pick(prefer = []) {
      const all = ids(); if (!all.length) return null;
      if (used.length >= Math.max(1, Math.ceil(all.length * .8))) used = used.slice(-Math.min(3, all.length - 1));
      const free = all.filter((x) => !used.includes(x));
      const pref = free.filter((x) => prefer.includes(x));
      const pool = pref.length ? pref : free.length ? free : all;
      const id = pool[(Math.random() * pool.length) | 0]; used.push(id); return id;
    },
    get used() { return used.slice(); },
  };
}

export function createHype(api) {
  const { getCtx, getTap, getOut, getDuck, scene, toast, LS, F, isPlaying, onDuck } = api;
  const base = new URL('./voice/', import.meta.url);
  const S = Object.assign({ on: true, freq: 'med', muteVoice: false, vol: .6, names: DEFAULT_NAMES, generic: true }, LS.get('hype', {}));
  const save = () => LS.set('hype', S);
  let manifest = null; const mp = fetch(new URL('voice.json', base)).then((r) => r.json()).then((m) => (manifest = m)).catch((e) => { console.warn('[hype] no voice pack', e); return null; });
  const buffers = new Map();
  async function loadBuf(file) {
    const ctx = getCtx(); if (buffers.has(file)) return buffers.get(file);
    // never wait forever on a clip (slow / flaky mobile data): give up after 8 s and the line shows as a bubble only
    const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const to = setTimeout(() => ac && ac.abort(), 8000);
    const p = fetch(new URL(file, base), ac ? { signal: ac.signal } : {}).then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
      .then((ab) => new Promise((res, rej) => { const q = ctx.decodeAudioData(ab, res, rej); if (q && q.then) q.then(res, rej); }))
      .finally(() => clearTimeout(to));
    buffers.set(file, p); p.catch(() => buffers.delete(file)); return p;
  }

  // ---------------- audio: voice bus + loudness meters ----------------
  let A = null;
  const kChain = (ctx, src) => { // ≈ ITU-R BS.1770 K-weighting (pre-filter shelf + RLB high-pass) → analyser
    const sh = ctx.createBiquadFilter(); sh.type = 'highshelf'; sh.frequency.value = 1681; sh.gain.value = 4;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 38; hp.Q.value = .5;
    const an = ctx.createAnalyser(); an.fftSize = 2048; src.connect(sh).connect(hp).connect(an); return an;
  };
  function audio() {
    const ctx = getCtx(); if (A && A.ctx === ctx) return A;
    const bus = ctx.createGain(); bus.gain.value = 1;
    const lim = ctx.createDynamicsCompressor(); lim.threshold.value = -3; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = .002; lim.release.value = .12;
    bus.connect(lim); lim.connect(getOut());
    const vMeter = kChain(ctx, lim);
    const mouth = ctx.createAnalyser(); mouth.fftSize = 512; lim.connect(mouth);
    const mMeter = kChain(ctx, getTap());
    A = { ctx, bus, lim, vMeter, mMeter, mouth, buf: new Float32Array(2048), mbuf: new Float32Array(512) };
    return A;
  }
  // music short-term loudness (≈ LUFS, 3 s window, pre-duck) and voice momentary loudness while talking
  const M = { hist: [], lufs: null, voiceSum: 0, voiceN: 0, last: null, lines: [] };
  const msOf = (an, buf) => { an.getFloatTimeDomainData(buf); let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i]; return s / buf.length; };
  function meter(now) {
    if (!A) return;
    if (isPlaying()) {
      const ms = msOf(A.mMeter, A.buf);
      if (ms > 1e-7) { M.hist.push([now, ms]); while (M.hist.length && now - M.hist[0][0] > 3000) M.hist.shift(); }
      if (M.hist.length > 8) { const m = M.hist.reduce((a, b) => a + b[1], 0) / M.hist.length; M.lufs = -0.691 + 10 * Math.log10(m); }
    }
    if (talk.active && !S.muteVoice) {
      const vms = msOf(A.vMeter, A.buf); if (vms > 1e-6) { M.voiceSum += vms; M.voiceN++; }
      const mm = msOf(A.mouth, A.mbuf); scene.setMouth(clamp((10 * Math.log10(mm + 1e-9) + 42) / 22, 0, 1));
    } else if (talk.active) scene.setMouth(.35 + .35 * Math.sin(now / 55) * Math.sin(now / 130));
  }
  const sliderDb = () => (S.vol <= .001 ? -Infinity : clamp(40 * Math.log10(S.vol / .6), -24, 12));
  /** Voice gain (dB) so the line lands UNDER_DB below the ducked music, plus the slider. */
  function voiceGainDb(clipLufs = CLIP_LUFS) {
    const music = M.lufs != null && isFinite(M.lufs) ? clamp(M.lufs, -40, -4) : -14;
    return clamp(music - DUCK_DB - UNDER_DB - (clipLufs + SPEECH_OFS), -30, 14) + sliderDb();
  }
  function duck(on, A_) {
    const d = getDuck(); if (!d) return; const t = A_.ctx.currentTime;
    d.gain.cancelScheduledValues(t); d.gain.setValueAtTime(d.gain.value, t);
    d.gain.setTargetAtTime(on ? dbToGain(-DUCK_DB) : 1, t, on ? .05 : .13);
    if (onDuck) { onDuck(); setTimeout(onDuck, 200); setTimeout(onDuck, 600); }
  }

  // ---------------- talking ----------------
  const talk = { active: false, busy: false, lastAt: -1e9, nextPeriodic: 0, pending: null, count: 0, sinceCallout: 0 };
  /** Play a sequence of {buf|file, text, pose, lufs} clips back to back with one duck. Returns when done. */
  async function speak(parts, { gap = .12, force = false } = {}) {
    if (!S.on && !force) return false;
    if (talk.active) return false;
    talk.active = true; talk.lastAt = performance.now();
    const A_ = audio(); let ducked = false;
    try {
      const bufs = await Promise.all(parts.map((p) => (p.buf ? p.buf : p.file ? loadBuf(p.file).catch(() => null) : null)));
      const voiced = !S.muteVoice && sliderDb() > -Infinity;
      if (voiced) { duck(true, A_); ducked = true; }
      M.voiceSum = 0; M.voiceN = 0; const musicAt = M.lufs;
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i], b = bufs[i];
        const dur = b ? b.duration : Math.max(1.2, (p.text || '').length * .065);
        scene.say(p.text, { pose: p.pose || 'point', dur: dur + (i === parts.length - 1 ? .7 : .4) });
        if (p.onStart) p.onStart();
        if (voiced && b) {
          await new Promise((res) => {
            const src = A_.ctx.createBufferSource(); src.buffer = b;
            const g = A_.ctx.createGain(); g.gain.value = dbToGain(voiceGainDb(p.lufs || CLIP_LUFS));
            src.connect(g).connect(A_.bus); src.onended = () => { try { g.disconnect(); } catch (e) {} res(); };
            src.start(A_.ctx.currentTime + .03); setTimeout(res, (dur + 1.5) * 1000);
          });
        } else await new Promise((r) => setTimeout(r, dur * 1000));
        if (i < parts.length - 1) await new Promise((r) => setTimeout(r, gap * 1000));
      }
      if (ducked) { ducked = false; duck(false, A_); }
      if (M.voiceN) {
        const v = -0.691 + 10 * Math.log10(M.voiceSum / M.voiceN), mus = musicAt != null ? musicAt - DUCK_DB : null;
        M.last = { voiceLufs: +v.toFixed(1), musicLufs: musicAt != null ? +musicAt.toFixed(1) : null, musicDuckedLufs: mus != null ? +mus.toFixed(1) : null, voiceUnderMusicDb: mus != null ? +(mus - v).toFixed(1) : null, duckDb: DUCK_DB, sliderDb: +sliderDb().toFixed(1), gainDb: +voiceGainDb().toFixed(1) };
        M.lines.push(M.last); if (M.lines.length > 20) M.lines.shift();
      }
      return true;
    } finally {
      if (ducked) { try { duck(false, A_); } catch (e) {} } // an error mid-line must never leave the music ducked
      talk.active = false; talk.lastAt = performance.now(); setTimeout(() => scene.setMouth(0), 50);
    }
  }

  // ---------------- choosing lines ----------------
  const hypeBag = makeBag(() => (manifest ? manifest.hype.map((h) => h.id) : []));
  const nameBag = makeBag(() => crowd().map((c) => c.key));
  const tplBags = new Map();
  function crowd() { // [{key, name, kind:'stock'|'generic'|'custom'}]
    const out = []; const seen = new Set();
    const pre = manifest ? manifest.callouts : [];
    String(S.names || '').split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean).slice(0, 24).forEach((raw) => {
      const [n, say] = raw.split('=').map((x) => x.trim()); // "Shanice = Sha-neese" → shown as Shanice, spoken as written after "="
      const k = norm(n); if (!k || seen.has(k)) return; seen.add(k);
      const stock = pre.find((c) => norm(c.name) === k);
      out.push({ key: k, name: stock ? stock.name : n, say: say || n, kind: stock ? 'stock' : 'custom' });
    });
    if (S.generic) [...new Set(pre.filter((c) => !c.id.startsWith('dj-eli')).map((c) => c.name))].forEach((n) => { const k = norm(n); if (!seen.has(k)) { seen.add(k); out.push({ key: k, name: n, kind: 'generic' }); } });
    return out;
  }
  async function calloutParts() {
    const who = nameBag.pick(); const c = crowd().find((x) => x.key === who); if (!c) return null;
    if (c.kind !== 'custom') {
      const clips = manifest.callouts.filter((x) => norm(x.name) === c.key); if (!clips.length) return null;
      if (!tplBags.has(c.key)) tplBags.set(c.key, makeBag(() => clips.map((x) => x.id)));
      const id = tplBags.get(c.key).pick(); const e = clips.find((x) => x.id === id);
      return [{ file: e.file, text: e.text, pose: 'point', lufs: e.lufs, kind: 'callout', name: c.name }];
    }
    // custom name → on-device render (cached); fallback: bubble with the name + a stock line
    if (!tplBags.has(c.key)) tplBags.set(c.key, makeBag(() => CALLOUT_TEMPLATES.map((_, i) => String(i))));
    const ready = await customReady(c.say);
    const ti = ready.length ? ready[(Math.random() * ready.length) | 0] : +tplBags.get(c.key).pick();
    const text = CALLOUT_TEMPLATES[ti].split('{n}').join(c.name);
    const buf = ready.length ? await cachedBuffer(customKey(spokenFor(ti, c.say))) : null;
    if (buf) return [{ buf, text, pose: 'point', lufs: -20, kind: 'callout', name: c.name }];
    const stock = manifest.hype.find((h) => h.id === ['make-some-noise', 'let-me-hear-you', 'for-you'][(Math.random() * 3) | 0]) || manifest.hype[0];
    renderNames(); // make sure the renders are on their way
    return [{ file: stock.file, text, pose: 'point', lufs: stock.lufs, kind: 'callout-fallback', name: c.name }];
  }
  async function fire(type = 'periodic', { force = false } = {}) {
    await mp; if (!manifest) return false;
    if (!force && (!S.on || talk.active || talk.busy)) return false;
    let parts = null; const names = crowd();
    const wantCallout = names.length && (Math.random() < .25 || talk.sinceCallout >= 5) && type !== 'start';
    if (wantCallout || type === 'callout') { parts = await calloutParts(); if (parts) talk.sinceCallout = 0; }
    if (!parts) {
      const id = hypeBag.pick(PREFER[type] || []); const e = manifest.hype.find((h) => h.id === id);
      parts = [{ file: e.file, text: e.text, lufs: e.lufs, pose: UP_POSE.test(id) ? 'up' : (talk.count % 2 ? 'up' : 'point'), kind: 'hype', id }];
      talk.sinceCallout++;
    }
    talk.count++; talk.lastType = type; talk.lastParts = parts.map((p) => ({ text: p.text, kind: p.kind, id: p.id, name: p.name }));
    return speak(parts, { force });
  }

  // ---------------- scheduler ----------------
  const E = { fast: 0, slow: 0, lastRise: 0 };
  const gapOk = (now) => now - talk.lastAt >= MIN_GAP * 1000;
  const period = () => PERIOD[S.freq] || 90;
  function queue(type, delay = 0) {
    if (!S.on || Math.random() > (CHANCE[S.freq] || .7)) return;
    if (!talk.pending || type === 'mix') talk.pending = { type, at: performance.now() + delay * 1000, exp: performance.now() + (delay + 10) * 1000 };
  }
  function tick(now) {
    if (!A && isPlaying()) { try { audio(); } catch (e) {} }
    meter(now);
    if (!S.on || !isPlaying()) { E.fast = E.slow = 0; return; }
    if (!talk.nextPeriodic) talk.nextPeriodic = now + period() * 1000 * (.75 + Math.random() * .5);
    // energy rises (drops) — fast vs slow average of the music level
    const lvl = (F.level || 0) * .6 + (F.bass || 0) * .4;
    E.fast += (lvl - E.fast) * .08; E.slow += (lvl - E.slow) * .006;
    if (E.fast > E.slow * 1.4 + .07 && E.fast > .33 && now - E.lastRise > 20000) { E.lastRise = now; queue('energy', .4); }
    if (talk.active || talk.busy) return;
    const p = talk.pending;
    if (p && now >= p.at) { if (gapOk(now)) { talk.pending = null; fire(p.type); return; } if (now > p.exp) talk.pending = null; }
    if (now >= talk.nextPeriodic) { if (gapOk(now)) fire('periodic'); talk.nextPeriodic = now + period() * 1000 * (.75 + Math.random() * .5); }
  }
  const onTrackStart = () => queue('start', 2.5 + Math.random() * 2);
  const onTransition = (info) => queue('mix', Math.max(.5, (info && info.secs || 4) * .5));

  // ---------------- on-device voice (kokoro-js, Kokoro-82M) for custom names ----------------
  const K = { tts: null, loading: null, queue: Promise.resolve(), status: '' };
  const customKey = (spoken) => `${VOICE}|v2|${spoken}`;
  const spokenName = (n) => n.replace(/\bDJ\b/gi, 'D.J.').replace(/\bMC\b/gi, 'M.C.');
  const spokenFor = (ti, n) => (SPOKEN[CALLOUT_TEMPLATES[ti]] || CALLOUT_TEMPLATES[ti].replace(/\{n\}/g, '{s}')).split('{s}').join(spokenName(n));
  function setStatus(t) { K.status = t; const el = root && root.querySelector('#hyKStatus'); if (el) { el.textContent = t; el.hidden = !t; } }
  // kokoro runs in a lazily-started Web Worker (player/kokoro-worker.js): loading the ~90 MB model and generating
  // speech used to run on the page itself and froze the player / stuttered the music. No main-thread fallback.
  const W = { worker: null, seq: 0, calls: new Map(), files: {} };
  function kWorker() {
    if (W.worker) return W.worker;
    W.worker = new Worker(new URL('./kokoro-worker.js?v=9', import.meta.url), { type: 'module' });
    W.worker.onmessage = (e) => {
      const m = e.data || {};
      if (m.type === 'progress') { W.files[m.file] = [m.loaded, m.total]; const a = Object.values(W.files).reduce((s, x) => [s[0] + x[0], s[1] + x[1]], [0, 0]); if (!K.tts) setStatus(`Downloading the on-device voice… ${Math.round(a[0] / a[1] * 100)}%`); return; }
      const c = W.calls.get(m.id); if (!c) return; W.calls.delete(m.id); clearTimeout(c.to);
      if (m.ok) c.res(m); else c.rej(new Error(m.error || 'kokoro failed'));
    };
    W.worker.onerror = (e) => { console.warn('[hype] kokoro worker', e.message || e); W.calls.forEach((c) => { clearTimeout(c.to); c.rej(new Error('worker error')); }); W.calls.clear(); try { W.worker.terminate(); } catch (_) {} W.worker = null; K.tts = null; K.loading = null; };
    return W.worker;
  }
  function kCall(msg, ms) {
    return new Promise((res, rej) => {
      let w; try { w = kWorker(); } catch (e) { rej(e); return; }
      const id = ++W.seq; const to = setTimeout(() => { W.calls.delete(id); rej(new Error('kokoro timeout')); }, ms);
      W.calls.set(id, { res, rej, to }); w.postMessage({ id, model: KOKORO_MODEL, ...msg });
    });
  }
  async function loadKokoro() {
    if (K.tts) return K.tts; if (K.loading) return K.loading;
    if (typeof Worker === 'undefined') { setStatus('On-device voice unavailable here — custom names show in the bubble with a stock line.'); return null; }
    K.loading = (async () => {
      setStatus('Loading the on-device voice (Kokoro-82M, ~90 MB, first time only)…');
      await kCall({ type: 'load' }, 10 * 60e3); setStatus('');
      K.tts = { generate: (text, o) => kCall({ type: 'gen', text, voice: o.voice, speed: o.speed }, 90e3).then((m) => ({ audio: m.audio, sampling_rate: m.sr })) };
      return K.tts;
    })();
    K.loading.catch((e) => { console.warn('[hype] kokoro-js failed', e); K.loading = null; setStatus('On-device voice unavailable here — custom names show in the bubble with a stock line.'); });
    return K.loading;
  }
  /** Light processing like the shipped clips: high-pass, gentle compression, short slap echo; normalised to ≈ −20 LUFS, peaks < −6 dBFS. */
  async function polish(samples, sr) {
    const len = samples.length + Math.round(sr * .25);
    const oc = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, len, sr);
    const b = oc.createBuffer(1, samples.length, sr); b.copyToChannel(samples, 0);
    const src = oc.createBufferSource(); src.buffer = b;
    const hp = oc.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 85;
    const warm = oc.createBiquadFilter(); warm.type = 'lowshelf'; warm.frequency.value = 220; warm.gain.value = 1.5;
    const comp = oc.createDynamicsCompressor(); comp.threshold.value = -20; comp.ratio.value = 2.5; comp.knee.value = 6; comp.attack.value = .01; comp.release.value = .15;
    const d1 = oc.createDelay(); d1.delayTime.value = .085; const g1 = oc.createGain(); g1.gain.value = .16;
    const d2 = oc.createDelay(); d2.delayTime.value = .17; const g2 = oc.createGain(); g2.gain.value = .07;
    src.connect(hp).connect(warm).connect(comp); comp.connect(oc.destination);
    comp.connect(d1).connect(g1).connect(oc.destination); comp.connect(d2).connect(g2).connect(oc.destination);
    src.start();
    const out = (await oc.startRendering()).getChannelData(0);
    // loudness (K-weighted, gated) → gain to −20 LUFS, then keep sample peaks under −6 dBFS
    const kc = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, out.length, sr); const kb = kc.createBuffer(1, out.length, sr); kb.copyToChannel(out, 0);
    const ks = kc.createBufferSource(); ks.buffer = kb; const sh = kc.createBiquadFilter(); sh.type = 'highshelf'; sh.frequency.value = 1681; sh.gain.value = 4;
    const khp = kc.createBiquadFilter(); khp.type = 'highpass'; khp.frequency.value = 38; khp.Q.value = .5; ks.connect(sh).connect(khp).connect(kc.destination); ks.start();
    const kw = (await kc.startRendering()).getChannelData(0);
    const blk = Math.round(sr * .4), hop = Math.round(sr * .1), ms = [];
    for (let i = 0; i + blk <= kw.length; i += hop) { let s = 0; for (let j = i; j < i + blk; j++) s += kw[j] * kw[j]; ms.push(s / blk); }
    const abs = ms.filter((m) => -0.691 + 10 * Math.log10(m + 1e-12) > -70); const rel0 = abs.reduce((a, b) => a + b, 0) / (abs.length || 1);
    const gated = abs.filter((m) => m > rel0 * .1); const L = -0.691 + 10 * Math.log10((gated.reduce((a, b) => a + b, 0) / (gated.length || 1)) + 1e-12);
    // gain to −20 LUFS, then a gentle look-ahead peak limiter keeps sample peaks under −6 dBFS
    const g = dbToGain(-20 - L), thr = dbToGain(-6.3), la = Math.round(sr * .004), rel = Math.exp(-1 / (sr * .06));
    const need = new Float32Array(out.length); for (let i = 0; i < out.length; i++) { const a = Math.abs(out[i]) * g; need[i] = a > thr ? thr / a : 1; }
    const res = new Float32Array(out.length); let env = 1;
    for (let i = 0; i < out.length; i++) {
      let m = 1; for (let j = i; j < Math.min(out.length, i + la); j++) if (need[j] < m) m = need[j];
      env = m < env ? m : m + (env - m) * rel; res[i] = out[i] * g * Math.min(env, need[i]);
    }
    return res;
  }
  async function renderSpoken(spoken) {
    const key = customKey(spoken); const hit = await IDB.get(key); if (hit) return hit;
    const tts = await loadKokoro(); if (!tts) return null;
    const audioOut = await tts.generate(spoken, { voice: VOICE, speed: 1.04 });
    const data = await polish(audioOut.audio, audioOut.sampling_rate);
    const rec = { sr: audioOut.sampling_rate, data, text: spoken, at: Date.now() }; await IDB.put(key, rec); return rec;
  }
  async function cachedBuffer(key) {
    const rec = await IDB.get(key); if (!rec) return null; const ctx = getCtx();
    const b = ctx.createBuffer(1, rec.data.length, rec.sr); b.copyToChannel(rec.data, 0); return b;
  }
  const readyCache = new Map();
  async function customReady(name) { // template indices whose render is cached
    const ks = new Set(await IDB.keys()); const out = [];
    CALLOUT_TEMPLATES.forEach((_, i) => { if (ks.has(customKey(spokenFor(i, name)))) out.push(i); });
    readyCache.set(norm(name), out.length); return out;
  }
  let renderRun = 0;
  /** Render a few call-outs per custom name in the background (4 templates each). */
  function renderNames() {
    const my = ++renderRun;
    const custom = crowd().filter((c) => c.kind === 'custom');
    if (!custom.length) return Promise.resolve();
    K.queue = K.queue.then(async () => {
      for (const c of custom) {
        if (my !== renderRun) return;
        const have = await customReady(c.say); if (have.length >= 4) continue;
        const todo = shuffle(CALLOUT_TEMPLATES.map((_, i) => i).filter((i) => !have.includes(i))).slice(0, 4 - have.length);
        for (let k = 0; k < todo.length; k++) {
          if (my !== renderRun) return;
          setStatus(`Recording call-outs for “${c.name}” on this device… ${have.length + k + 1}/4`);
          try { await renderSpoken(spokenFor(todo[k], c.say)); } catch (e) { console.warn('[hype] render failed', e); setStatus('On-device voice unavailable here — custom names show in the bubble with a stock line.'); return; }
        }
      }
      if (my === renderRun) { setStatus('Custom call-outs ready ✓'); setTimeout(() => { if (K.status === 'Custom call-outs ready ✓') setStatus(''); }, 4000); }
    }).catch(() => {});
    return K.queue;
  }
  /** Render (or fetch from cache) any spoken text → AudioBuffer. Used by the ladies intro for custom places. */
  async function renderText(spoken) { const rec = await renderSpoken(spoken); if (!rec) return null; return cachedBuffer(customKey(spoken)); }

  // ---------------- settings panel ----------------
  const root = document.createElement('section');
  root.className = 'eq-sheet hype-sheet'; root.id = 'hypePanel'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'Hype talk'); root.hidden = true;
  root.innerHTML = `
    <div class="eq-grab" aria-hidden="true"></div>
    <header class="eq-head"><h3>Hype talk</h3><span class="eq-sub">The DJ talks to the crowd · voice: Kokoro-82M “${VOICE}”</span>
      <button type="button" class="eq-btn" id="hyTest" title="Say a line now">Say one</button>
      <button type="button" class="icon-btn" id="hyClose" aria-label="Close hype talk settings" title="Close (Esc)"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></header>
    <div class="hy-grid">
      <label class="switch"><input type="checkbox" id="hyOn"><span class="track"><span class="knob"></span></span><span class="sw-lbl">Hype talk</span></label>
      <div class="hy-seg" role="radiogroup" aria-label="How often"><span class="hy-l">How often</span>${['low', 'med', 'high'].map((f) => `<button type="button" role="radio" data-f="${f}">${f === 'med' ? 'Med' : f[0].toUpperCase() + f.slice(1)}</button>`).join('')}</div>
      <label class="switch"><input type="checkbox" id="hyMute"><span class="track"><span class="knob"></span></span><span class="sw-lbl">Mute voice (keep bubbles)</span></label>
      <label class="hy-vol"><span class="hy-l">Voice volume</span><input type="range" id="hyVol" min="0" max="100" step="1" class="range" aria-label="Voice volume"><output id="hyVolOut"></output></label>
    </div>
    <div class="hy-names">
      <label for="hyNames" class="hy-l">Crowd names <small>— one per line; the DJ shouts them out (about 1 line in 4)</small></label>
      <textarea id="hyNames" rows="3" spellcheck="false" placeholder="DJ Eli&#10;Shanice = Sha-neese&#10;The Roseau crew"></textarea>
      <label class="hy-chk"><input type="checkbox" id="hyGeneric"> Generic shout-outs too (ladies in the front · everybody in the back · all my DJs · birthday crew)</label>
      <p class="hy-note" id="hyKStatus" hidden></p>
      <p class="hy-fine">“DJ Eli” and the generic shout-outs are pre-recorded. Tip: “Name = how to say it” fixes pronunciation. Other names are recorded on this device with the same voice (kokoro-js, downloaded once, cached) — until then they show in the bubble with a stock line.</p>
    </div>
    <div id="hyExtra"></div>
    <p class="hy-fine">Voice levels: clips at −20 LUFS; each line sits ~${UNDER_DB} dB under the music and the music dips ${DUCK_DB} dB while the DJ talks.</p>`;
  document.body.appendChild(root);
  const q = (s) => root.querySelector(s);
  function paint() {
    q('#hyOn').checked = S.on; q('#hyMute').checked = S.muteVoice; q('#hyGeneric').checked = S.generic;
    root.querySelectorAll('[data-f]').forEach((b) => b.setAttribute('aria-checked', b.dataset.f === S.freq));
    const v = Math.round(S.vol * 100); q('#hyVol').value = v; q('#hyVol').style.setProperty('--p', v + '%');
    const sd = sliderDb(); q('#hyVolOut').textContent = `${v}% · ${sd === -Infinity ? 'off' : (sd >= 0 ? '+' : '') + sd.toFixed(1) + ' dB'}`;
    if (document.activeElement !== q('#hyNames')) q('#hyNames').value = S.names;
    root.classList.toggle('off', !S.on);
    const btn = document.getElementById('hypeBtn'); if (btn) btn.classList.toggle('on', S.on);
  }
  q('#hyOn').addEventListener('change', (e) => { S.on = e.target.checked; save(); paint(); if (!S.on) { talk.pending = null; } toast(S.on ? 'Hype talk on' : 'Hype talk off'); });
  q('#hyMute').addEventListener('change', (e) => { S.muteVoice = e.target.checked; save(); paint(); });
  q('#hyGeneric').addEventListener('change', (e) => { S.generic = e.target.checked; save(); });
  root.querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => { S.freq = b.dataset.f; save(); paint(); talk.nextPeriodic = performance.now() + period() * 1000 * (.75 + Math.random() * .5); }));
  q('#hyVol').addEventListener('input', (e) => { S.vol = e.target.value / 100; save(); paint(); });
  let namesT; q('#hyNames').addEventListener('input', (e) => { S.names = e.target.value; save(); clearTimeout(namesT); namesT = setTimeout(renderNames, 1500); });
  q('#hyNames').addEventListener('change', () => { clearTimeout(namesT); renderNames(); });
  q('#hyTest').addEventListener('click', () => { getCtx(); fire(Math.random() < .5 ? 'callout' : 'energy', { force: true }); });
  q('#hyClose').addEventListener('click', () => open(false));
  function open(v = root.hidden) {
    if (v) { paint(); root.hidden = false; requestAnimationFrame(() => root.classList.add('open')); }
    else { root.classList.remove('open'); setTimeout(() => { if (!root.classList.contains('open')) root.hidden = true; }, 260); }
    const btn = document.getElementById('hypeBtn'); if (btn) btn.setAttribute('aria-expanded', v);
    return v;
  }
  paint();
  mp.then(() => { if (crowd().some((c) => c.kind === 'custom')) setTimeout(renderNames, 4000); });

  return {
    S, tick, fire, speak, onTrackStart, onTransition, open, get isOpen() { return !root.hidden; }, root, extra: q('#hyExtra'), paint,
    get manifest() { return manifest; }, ready: mp, loadBuf, renderText, renderNames, crowd, customReady,
    get talking() { return talk.active; }, set busy(v) { talk.busy = !!v; }, get busy() { return talk.busy; },
    get stats() { return { musicLufs: M.lufs != null ? +M.lufs.toFixed(1) : null, last: M.last, lines: M.lines.slice(), gainDb: +voiceGainDb().toFixed(1), sliderDb: sliderDb(), duckDb: DUCK_DB, underDb: UNDER_DB, lastAt: talk.lastAt, count: talk.count, lastParts: talk.lastParts, used: hypeBag.used, kokoro: K.status }; },
    _resetGap() { talk.lastAt = -1e9; },
  };
}
