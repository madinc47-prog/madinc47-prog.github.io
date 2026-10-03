// Psycho Fingers Player — main app (vanilla ES module, no deps)
import { saveTrack, listTracks, getTrack, deleteTrack, onMediaChange } from '../shared/media-store.js';
import { createScene } from './scene.js';
import { createViz, THEMES } from './viz.js';
import { OUTFITS, OUTFIT_FOR_THEME } from './outfits.js';
import { fmt, hash, isAudioFile, titleFromName, makeCover, makeLabel, readTags, probeDuration, computePeaks } from './util.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const LS = {
  get(k, d) { try { const v = localStorage.getItem('pf-' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('pf-' + k, JSON.stringify(v)); } catch (e) {} },
};

// ---------------- settings ----------------
const S = {
  vol: LS.get('vol', 0.85), muted: false, shuffle: LS.get('shuffle', false), repeat: LS.get('repeat', 'all'),
  xfade: LS.get('xfade', 6), theme: LS.get('theme', 'club'), anim: LS.get('anim', 'full'), tab: LS.get('tab', 'all'),
  saveImports: LS.get('saveImports', true), liked: new Set(LS.get('liked', [])),
  outfit: LS.get('outfit', 'classic'), matchOutfit: LS.get('matchOutfit', false), autoMix: LS.get('autoMix', true),
};
const ANIM_SPEED = { full: 1, quick: 2.2, off: 100 };

// ---------------- library ----------------
const DEMO = { key: 'demo:gunwalk', kind: 'demo', title: 'Gunwalk', artist: 'DJ Psycho Fingers', source: 'beats', url: new URL('../beats/tracks/gunwalk-instrumental.mp3', import.meta.url).href, duration: 198, demo: true, createdAt: 0 };
let library = [];          // all items
let sessionItems = [];     // local files not saved / deep-link URLs
const objUrls = new Map(); // key -> object URL (audio)
const artUrls = new Map(); // key -> display URL for artwork
const peaksCache = new Map();
let urlItems = LS.get('urls', []);

function itemFromRecord(r) {
  const it = { key: 'store:' + r.id, kind: 'store', id: r.id, title: r.title || 'Untitled', artist: r.artist || '', source: r.source || 'import', duration: r.duration || 0, createdAt: r.createdAt || 0, size: r.blob ? r.blob.size : 0 };
  if (r.artwork) {
    if (typeof r.artwork === 'string') it.art = r.artwork;
    else if (r.artwork instanceof Blob) { if (!artUrls.has(it.key)) artUrls.set(it.key, URL.createObjectURL(r.artwork)); it.art = artUrls.get(it.key); it.artBlob = r.artwork; }
  }
  return it;
}
function coverOf(it) { return it.art || makeCover(it.title, it.artist, 384); }
function labelOf(it) { return it.art || makeLabel(it.title, it.artist); }
const durCache = LS.get('durs', {});

async function refreshLibrary() {
  let recs = [];
  try { recs = await listTracks(); } catch (e) { console.warn('[player] library unavailable', e); }
  const stored = recs.map(itemFromRecord);
  const urls = urlItems.map((u) => ({ key: 'url:' + u.id, kind: 'url', id: u.id, url: u.url, title: u.title || 'Stream', artist: u.artist || '', source: 'import', duration: durCache['url:' + u.id] || 0, createdAt: u.addedAt || 0 }));
  library = [DEMO, ...stored, ...urls, ...sessionItems];
  library.forEach((it) => { if (!it.duration && durCache[it.key]) it.duration = durCache[it.key]; });
  renderList();
}
function inTab(it, tab) {
  if (tab === 'all') return true;
  if (tab === 'beats') return it.source === 'beats';
  if (tab === 'dj') return it.source === 'dj';
  return it.source === 'import' || it.source === 'player' || it.kind === 'url' || it.kind === 'session';
}
const visible = () => library.filter((it) => inTab(it, S.tab));
const byKey = (k) => library.find((it) => it.key === k);

async function urlFor(it) {
  if (it.kind === 'demo' || it.kind === 'url') return it.url;
  if (objUrls.has(it.key)) return objUrls.get(it.key);
  let blob = it.blob;
  if (!blob && it.kind === 'store') { const r = await getTrack(it.id); if (!r) throw new Error('Track not found in My Tracks'); blob = r.blob; }
  const u = URL.createObjectURL(blob); objUrls.set(it.key, u); it._blob = blob; return u;
}
async function blobFor(it) {
  if (it.blob) return it.blob; if (it._blob) return it._blob;
  if (it.kind === 'store') { const r = await getTrack(it.id); return r && r.blob; }
  if (it.kind === 'demo' || it.kind === 'url') { const res = await fetch(it.url, { mode: 'cors' }); if (!res.ok) throw new Error('fetch ' + res.status); return res.blob(); }
  return null;
}

// ---------------- audio engine ----------------
// deck A / deck B → per-deck fade gain → crossfader slot gain (equal-power) → mix bus → [master EQ] → duck → volume → analyser → out
let ctx = null, master, analyser, sfxBus, freq, tdata, prevFreq, mixBus, duck, postMix;
const slot = { A: null, B: null };
function ensureCtx() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'playback' });
    master = ctx.createGain(); master.gain.value = S.muted ? 0 : S.vol;
    analyser = ctx.createAnalyser(); analyser.fftSize = 2048; analyser.smoothingTimeConstant = 0.5;
    master.connect(analyser); analyser.connect(ctx.destination);
    duck = ctx.createGain(); duck.connect(master);
    mixBus = ctx.createGain(); postMix = mixBus;
    if (typeof window.__pfInsertMaster === 'function') postMix = window.__pfInsertMaster(ctx, mixBus) || mixBus;
    postMix.connect(duck);
    ['A', 'B'].forEach((s) => { slot[s] = ctx.createGain(); slot[s].connect(mixBus); });
    applyXfGains(0);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 0.55; sfxBus.connect(master);
    freq = new Uint8Array(analyser.frequencyBinCount); prevFreq = new Uint8Array(analyser.frequencyBinCount); tdata = new Uint8Array(analyser.fftSize);
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}
function isCrossOrigin(url) { try { const u = new URL(url, location.href); return (u.protocol === 'http:' || u.protocol === 'https:') && u.origin !== location.origin; } catch (e) { return false; } }

// ---------------- crossfader (0 = Deck A, 1 = Deck B; equal-power) ----------------
const XF = { pos: 0, anim: null };
const xfGain = (s, p = XF.pos) => (s === 'A' ? Math.cos(p * Math.PI / 2) : Math.sin(p * Math.PI / 2));
function xfPos() {
  const a = XF.anim; if (!a || !ctx) return XF.pos;
  const k = Math.min(1, Math.max(0, (ctx.currentTime - a.t0) / a.secs));
  XF.pos = a.from + (a.to - a.from) * k; if (k >= 1) XF.anim = null;
  return XF.pos;
}
function applyXfGains(tc = .012) {
  if (!ctx) return; const t = ctx.currentTime;
  ['A', 'B'].forEach((s) => { const g = slot[s].gain; g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); if (tc) g.setTargetAtTime(xfGain(s), t, tc); else g.setValueAtTime(xfGain(s), t); });
  allDecks().forEach((d) => d.applyVol());
}
/** Manual crossfader move (slider / keys). */
function setXf(p, { user = false } = {}) {
  XF.anim = null; XF.pos = Math.max(0, Math.min(1, p)); applyXfGains(); syncXfUI();
  if (user) XF.userTouched = performance.now();
}
/** Automatic equal-power sweep on the audio clock (keeps working with the screen locked). */
function xfSweep(to, secs) {
  ensureCtx(); const from = xfPos(); secs = Math.max(.05, secs);
  const t = ctx.currentTime + .01, N = 64;
  ['A', 'B'].forEach((s) => {
    const g = slot[s].gain, curve = new Float32Array(N);
    for (let i = 0; i < N; i++) curve[i] = xfGain(s, from + (to - from) * i / (N - 1));
    g.cancelScheduledValues(ctx.currentTime); g.setValueAtTime(g.value, ctx.currentTime);
    try { g.setValueCurveAtTime(curve, t, secs); } catch (e) { g.linearRampToValueAtTime(curve[N - 1], t + secs); }
  });
  XF.anim = { from, to, t0: t, secs };
}
const xfEnd = (s) => (s === 'A' ? 0 : 1);

class Deck {
  constructor(item, url, slotName) {
    this.item = item; this.url = url; this.slot = slotName; this.raw = false; this.fade = 1; this.disposed = false;
    this.el = new Audio(); this.el.preload = 'auto';
    if (isCrossOrigin(url)) this.el.crossOrigin = 'anonymous';
    ensureCtx();
    this.src = ctx.createMediaElementSource(this.el); this.gain = ctx.createGain(); this.src.connect(this.gain).connect(slot[slotName]);
    this.ready = new Promise((res, rej) => {
      const ok = () => { cleanup(); res(); };
      const bad = () => {
        cleanup();
        if (this.el.crossOrigin && !this.disposed) { this.toRaw(); res(); } else rej(new Error(this.el.error ? 'Cannot play this file (' + (this.el.error.message || this.el.error.code) + ')' : 'Cannot load audio'));
      };
      const cleanup = () => { this.el.removeEventListener('canplay', ok); this.el.removeEventListener('error', bad); };
      this.el.addEventListener('canplay', ok); this.el.addEventListener('error', bad);
    });
    this.el.src = url; this.el.load();
  }
  toRaw() { // CORS-less remote URL: play directly (no analyser → simulated visuals)
    try { this.src.disconnect(); } catch (e) {}
    const el = new Audio(); el.preload = 'auto'; el.src = this.url; this.el = el; this.raw = true; this.applyVol(); if (this.onSwap) this.onSwap();
    toast('Playing a remote URL without CORS — visuals are simulated for this track.');
  }
  applyVol() { if (this.raw) this.el.volume = Math.max(0, Math.min(1, (S.muted ? 0 : S.vol) * this.fade * xfGain(this.slot, xfPos()) * (duck ? duck.gain.value : 1))); }
  setFade(v, secs = 0) {
    this.fade = v;
    if (this.raw) { this.applyVol(); return; }
    const g = this.gain.gain, t = ctx.currentTime; g.cancelScheduledValues(t); g.setValueAtTime(g.value, t);
    if (secs <= 0) g.setValueAtTime(v, t); else g.linearRampToValueAtTime(v, t + secs);
  }
  get playing() { return !this.disposed && !this.el.paused; }
  dispose() { this.disposed = true; try { this.el.pause(); } catch (e) {} try { this.src.disconnect(); this.gain.disconnect(); } catch (e) {} this.el.removeAttribute('src'); try { this.el.load(); } catch (e) {} }
}

let deck = null;          // active deck (what the transport controls)
let cued = null;          // next track, loaded and paused on the other deck
let outgoing = null;      // previous deck while a transition fades it out
let transition = null;    // { old, nd, my }
let loadGen = 0;
let queueOrder = [];      // keys in play order
let current = null;       // current item
let historyStack = [];
let userActivated = false;
let activeSlot = 'A';
const other = (s) => (s === 'A' ? 'B' : 'A');
const allDecks = () => [deck, cued, outgoing].filter((d, i, a) => d && !d.disposed && a.indexOf(d) === i);

function buildOrder(startKey) {
  const keys = visible().map((it) => it.key);
  if (!S.shuffle) { queueOrder = keys; return; }
  const rest = keys.filter((k) => k !== startKey);
  for (let i = rest.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [rest[i], rest[j]] = [rest[j], rest[i]]; }
  queueOrder = startKey ? [startKey, ...rest] : rest;
}
function nextItem(dir = 1, { wrap = S.repeat === 'all' } = {}) {
  if (!current) return visible()[0] || null;
  if (!queueOrder.includes(current.key)) buildOrder(current.key);
  const live = queueOrder.filter((k) => byKey(k));
  let i = live.indexOf(current.key) + dir;
  if (i >= live.length) { if (!wrap) return null; if (S.shuffle) { buildOrder(); return byKey(queueOrder[0]); } i = 0; }
  if (i < 0) i = wrap ? live.length - 1 : 0;
  return byKey(live[i]) || null;
}

// ---------------- synthesized SFX ----------------
function sfxCrackle() {
  if (!ctx) return; const t = ctx.currentTime, sr = ctx.sampleRate;
  const out = ctx.createGain(); out.gain.value = 0.9; out.connect(sfxBus);
  const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(95, t); o.frequency.exponentialRampToValueAtTime(38, t + .14);
  const og = ctx.createGain(); og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(.8, t + .005); og.gain.exponentialRampToValueAtTime(.001, t + .2);
  o.connect(og).connect(out); o.start(t); o.stop(t + .22);
  const len = Math.floor(sr * 1.4), buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) { const s = i / sr; const env = s < .025 ? 1 : Math.exp(-s * 2.6) * .22; d[i] += (Math.random() * 2 - 1) * .32 * env; }
  for (let p = 0; p < 34; p++) { const at = Math.floor(Math.pow(Math.random(), 1.6) * len * .95); const amp = (Math.random() * .7 + .3) * (1 - at / len); const pl = 20 + (Math.random() * 60) | 0; for (let j = 0; j < pl && at + j < len; j++) d[at + j] += (Math.random() * 2 - 1) * amp * Math.exp(-j / (pl * .25)); }
  const src = ctx.createBufferSource(); src.buffer = buf;
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 700;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 7000;
  src.connect(hp).connect(lp).connect(out); src.start(t);
}
function sfxClick() {
  if (!ctx) return; const t = ctx.currentTime, sr = ctx.sampleRate;
  const len = Math.floor(sr * .03), buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sr * .004)) * .5;
  const src = ctx.createBufferSource(); src.buffer = buf; const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2500; bp.Q.value = 1.2;
  src.connect(bp).connect(sfxBus); src.start(t);
}
const SFX = { click: sfxClick, crackle: sfxCrackle };

// ---------------- playback control (two decks) ----------------
const animSpeed = () => (document.hidden ? 100 : ANIM_SPEED[S.anim] || 1);
const QUICK_MIX = 1.6; // seconds — crossfade used when you pick a track while one is playing

function setActiveSlot(s) { activeSlot = s; scene.setActive(s); syncDeckUI(); }
function stopDeck(d, { animate = true } = {}) {
  if (!d || d.disposed) return;
  try { d.el.pause(); } catch (e) {}
  scene.setPlaying(d.slot, false);
  if (animate && !document.hidden) scene.liftNeedle({ deck: d.slot, speed: animSpeed(), sounds: SFX });
  d.dispose();
  if (outgoing === d) outgoing = null;
  syncDeckUI();
}
function disposeCued() { if (cued) { cued.dispose(); cued = null; syncDeckUI(); } }

async function playItem(item, { fromUser = true } = {}) {
  if (!item) return;
  ensureCtx(); hideBigPlay();
  const my = ++loadGen;
  if (fromUser && (!queueOrder.includes(item.key))) buildOrder(item.key);
  if (current && current.key !== item.key) historyStack.push(current.key);
  if (transition) finishTransition(true);
  scene.cancel();
  const old = deck && deck.playing ? deck : null;
  if (!old && deck && deck !== cued) { stopDeck(deck, { animate: false }); deck = null; }
  let d, reuse = false;
  if (cued && cued.item.key === item.key && (!old || cued.slot !== old.slot)) { d = cued; cued = null; reuse = true; }
  else {
    const s = old ? other(old.slot) : activeSlot;
    if (cued && cued.slot === s) disposeCued();
    try { d = new Deck(item, await urlFor(item), s); } catch (e) { toast('Could not open "' + item.title + '": ' + e.message); setStatus(''); return; }
  }
  if (my !== loadGen) { if (d !== cued) d.dispose(); return; }
  current = item; updateNowPlaying(item, { loading: true }); renderList();
  if (!old) { deck = d; wireDeck(d); }
  d.setFade(1); loadPeaks(item);
  syncDeckUI();
  setStatus(reuse ? '' : 'Loading record…');
  const onDrop = () => {
    if (my !== loadGen) return;
    SFX.crackle();
    if (old) { outgoing = old; deck = d; wireDeck(d); }
    setActiveSlot(d.slot);
    const mix = old ? Math.min(QUICK_MIX, Math.max(.25, S.xfade || .25)) : 0;
    if (old) xfSweep(xfEnd(d.slot), mix); else setXf(xfEnd(d.slot));
    d.ready.catch(() => {}).then(() => startDeck(d, my));
    if (old) setTimeout(() => { if (outgoing === old) stopDeck(old); }, (mix + .25) * 1000);
    scheduleCue(old ? mix + 2.5 : 3);
    syncPlayUI();
  };
  if (reuse) await scene.dropNeedle({ deck: d.slot, speed: animSpeed(), onDrop });
  else await scene.loadRecord({ deck: d.slot, cover: coverOf(item), label: labelOf(item), speed: animSpeed(), sounds: SFX, onDrop });
}
async function startDeck(d, my) {
  if (my !== loadGen || d.disposed) return;
  try { await d.el.play(); setStatus(''); }
  catch (e) {
    if (e.name === 'NotAllowedError') { showBigPlay('Tap to drop the needle'); scene.setPlaying(d.slot, false); }
    else if (e.name !== 'AbortError') { toast('Playback failed: ' + (e.message || e.name)); }
  }
}
function wireDeck(d) {
  if (d._wired) return; d._wired = true;
  d.onSwap = () => { d._wired = false; wireDeck(d); };
  const el = d.el;
  const on = (ev, fn) => el.addEventListener(ev, fn);
  on('play', () => { scene.setPlaying(d.slot, true); if (d === deck) syncPlayUI(); });
  on('pause', () => { if (d === deck || d === outgoing) { scene.setPlaying(d.slot, false); syncPlayUI(); } });
  on('loadedmetadata', () => { if (d === deck && Number.isFinite(el.duration)) { setDuration(d.item, el.duration); } });
  on('ended', () => { if (d === deck) onEnded(); else if (d === outgoing) stopDeck(d); });
  on('error', () => { if (d === deck && !d.raw && !el.crossOrigin) toast('This file could not be played.'); });
  on('waiting', () => { if (d === deck) setStatus('Buffering…'); });
  on('playing', () => { if (d === deck) setStatus(''); });
}
function setDuration(item, dur) {
  if (!dur || !Number.isFinite(dur)) return;
  item.duration = dur; durCache[item.key] = Math.round(dur); LS.set('durs', durCache);
  if (current && current.key === item.key) $('#tDur').textContent = fmt(dur);
  renderFoot(); const row = $(`[data-key="${CSS.escape(item.key)}"] .dur`); if (row) row.textContent = fmt(dur);
}
function togglePlay() {
  ensureCtx();
  if (!deck) { const it = current || visible()[0] || DEMO; playItem(it); return; }
  if (deck.el.paused) { hideBigPlay(); deck.el.play().catch((e) => { if (e.name === 'NotAllowedError') showBigPlay('Tap to play'); }); if (outgoing) outgoing.el.play().catch(() => {}); }
  else { deck.el.pause(); if (outgoing) outgoing.el.pause(); }
}
function pauseAll() { if (deck) deck.el.pause(); if (outgoing) outgoing.el.pause(); }
function next(dir = 1) {
  if (dir < 0 && deck && deck.el.currentTime > 3) { seekTo(0); return; }
  if (dir < 0 && S.shuffle && historyStack.length) { const k = historyStack.pop(); const it = byKey(k); if (it) { current = null; return playItem(it, { fromUser: false }); } }
  const it = nextItem(dir, { wrap: true }); if (it) playItem(it, { fromUser: false });
}
function onEnded() {
  if (S.repeat === 'one' && deck) { const d = deck; scene.needleRedrop(animSpeed(), () => { d.el.currentTime = 0; d.el.play().catch(() => {}); SFX.crackle(); }, SFX); return; }
  if (transition) return;
  const it = nextItem(1);
  if (it && cued && cued.item.key === it.key) { startTransition({ immediate: true }); return; }
  if (it) playItem(it, { fromUser: false }); else { scene.setPlaying(deck.slot, false); syncPlayUI(); }
}

// cue the next queued track on the idle deck (record pulled from the crate, needle up)
let cueTimer = 0;
function scheduleCue(delay = 0) { clearTimeout(cueTimer); cueTimer = setTimeout(cueNext, Math.max(0, delay * 1000)); }
async function cueNext() {
  if (!deck || transition) return;
  const it = S.repeat === 'one' ? null : nextItem(1);
  if (!it) { disposeCued(); return; }
  const s = other(deck.slot);
  if (cued && cued.item.key === it.key && cued.slot === s) return;
  disposeCued();
  let d; try { d = new Deck(it, await urlFor(it), s); } catch (e) { return; }
  if (!deck || transition || other(deck.slot) !== s) { d.dispose(); return; }
  cued = d; d.setFade(1); syncDeckUI();
  scene.cueRecord({ deck: s, cover: coverOf(it), label: labelOf(it), speed: animSpeed(), sounds: SFX });
}
function invalidateCue() { if (transition) return; const it = deck ? nextItem(1) : null; if (cued && (!it || it.key !== cued.item.key)) disposeCued(); scheduleCue(.4); }

// auto-mix: drop the needle on the cued deck and crossfade (equal power) over the crossfade length
const NEEDLE_SECS = .75;
function transitionLead() { const sp = animSpeed(); return sp >= 50 ? .05 : NEEDLE_SECS / sp + .15; }
function checkAutoAdvance() {
  if (!deck || deck.el.paused || S.repeat === 'one' || transition) return;
  const el = deck.el, dur = el.duration; if (!Number.isFinite(dur) || dur < 8) return;
  const rem = (dur - el.currentTime) / (el.playbackRate || 1), xf = Math.min(S.xfade, Math.max(0, dur / 3));
  if (window.__pfBeforeTransition && window.__pfBeforeTransition(rem, xf)) return; // e.g. the "for the ladies" intro
  if (!cued) { if (rem < xf + 12 && !cueTimer) scheduleCue(0); return; }
  const it = nextItem(1); if (!it || it.key !== cued.item.key) { invalidateCue(); return; }
  if (rem <= Math.max(xf, .12) + transitionLead()) startTransition();
}
function startTransition({ immediate = false, mixSecs = null } = {}) {
  if (!cued || !deck || transition) return;
  const old = deck, nd = cued; cued = null;
  const my = ++loadGen; transition = { old, nd, my };
  const dur = old.el.duration, rem = Number.isFinite(dur) ? Math.max(0, (dur - old.el.currentTime) / (old.el.playbackRate || 1)) : 0;
  const xf = mixSecs != null ? mixSecs : immediate ? 0 : Math.min(S.xfade, Number.isFinite(dur) ? dur / 3 : S.xfade, Math.max(.3, rem));
  if (window.__pfOnTransition) window.__pfOnTransition({ from: old.item, to: nd.item, secs: xf });
  scene.dropNeedle({
    deck: nd.slot, speed: animSpeed(), onDrop: () => {
      if (my !== loadGen) return;
      if (current) historyStack.push(current.key);
      outgoing = old; deck = nd; current = nd.item;
      wireDeck(nd); loadPeaks(current); updateNowPlaying(current); renderList();
      SFX.crackle(); setActiveSlot(nd.slot);
      nd.ready.catch(() => {}).then(() => startDeck(nd, my));
      const target = xfEnd(nd.slot);
      if (S.autoMix) xfSweep(target, Math.max(.05, xf));
      else if (Math.abs(xfPos() - xfEnd(old.slot)) < .2) {
        // manual mode with the fader parked on the old deck: hard cut when the old record runs out
        setTimeout(() => { if (Math.abs(xfPos() - xfEnd(old.slot)) < .2) setXf(target); }, Math.max(0, Math.min(rem, xf)) * 1000);
      }
      transition.endT = setTimeout(() => finishTransition(), (Math.max(.05, xf) + .35) * 1000);
      syncPlayUI();
    },
  });
}
function finishTransition(abort = false) {
  const tr = transition; if (!tr) return; transition = null; clearTimeout(tr.endT);
  if (tr.old && !tr.old.disposed) stopDeck(tr.old, { animate: !abort });
  if (abort && tr.nd && tr.nd !== deck) tr.nd.dispose();
  if (!abort) scheduleCue(2.5);
  syncDeckUI();
}

// ---------------- analysis (onset / beat detection) ----------------
const F = { spectrum: new Float32Array(64), pulse: 0, bass: 0, mid: 0, high: 0, level: 0, beat: false, bpm: 0, playing: false };
const fluxHist = []; let lastBeat = 0; const beatIntervals = [];
let bandEdges = null;
function analyse(now, dt) {
  F.beat = false; F.playing = !!((deck && !deck.el.paused) || (outgoing && outgoing.playing));
  F.pulse *= Math.exp(-dt * 6.5);
  if (!F.playing || !ctx) { for (let i = 0; i < 64; i++) F.spectrum[i] *= .9; F.bass *= .9; F.mid *= .9; F.high *= .9; F.level *= .9; return; }
  if (!deck || deck.raw) { // simulated
    const bpm = 112, t = deck ? deck.el.currentTime : now / 1000, ph = (t * bpm / 60) % 1;
    if (ph < F._ph) { F.beat = true; F.pulse = 1; }
    F._ph = ph; F.bpm = bpm; F.bass = .5 + .4 * Math.exp(-ph * 6); F.mid = .45; F.high = .35; F.level = .5;
    for (let i = 0; i < 64; i++) F.spectrum[i] = Math.max(0, (1 - i / 70) * (.45 + .35 * Math.sin(t * 3 + i * .4)) + (i < 10 ? F.bass * .4 : 0));
    return;
  }
  analyser.getByteFrequencyData(freq); analyser.getByteTimeDomainData(tdata);
  const sr = ctx.sampleRate, binHz = sr / analyser.fftSize, N = freq.length;
  if (!bandEdges) { bandEdges = []; for (let i = 0; i <= 64; i++) bandEdges.push(Math.max(1, Math.round((30 * Math.pow(16000 / 30, i / 64)) / binHz))); }
  for (let b = 0; b < 64; b++) {
    let s = 0, n = 0; for (let k = bandEdges[b]; k <= Math.max(bandEdges[b], bandEdges[b + 1] - 1) && k < N; k++) { s += freq[k]; n++; }
    const v = n ? s / n / 255 : 0; const tilt = 0.8 + b / 64 * 0.6;
    F.spectrum[b] = Math.min(1, Math.pow(v * tilt, 1.6) * 1.2);
  }
  const avg = (a, b) => { let s = 0; for (let k = a; k <= b; k++) s += freq[k]; return s / (b - a + 1) / 255; };
  const bEnd = Math.max(2, Math.round(160 / binHz)), mEnd = Math.round(2200 / binHz), hEnd = Math.min(N - 1, Math.round(9000 / binHz));
  F.bass = avg(1, bEnd); F.mid = avg(bEnd + 1, mEnd); F.high = avg(mEnd + 1, hEnd);
  let sum = 0; for (let i = 0; i < tdata.length; i++) { const v = (tdata[i] - 128) / 128; sum += v * v; } F.level = Math.min(1, Math.sqrt(sum / tdata.length) * 2.6);
  // spectral flux on the low end (kick / bass onsets)
  let flux = 0; const fEnd = Math.max(4, Math.round(220 / binHz));
  for (let k = 1; k <= fEnd; k++) { const dlt = freq[k] - prevFreq[k]; if (dlt > 0) flux += dlt; }
  prevFreq.set(freq);
  flux /= fEnd;
  fluxHist.push(flux); if (fluxHist.length > 50) fluxHist.shift();
  const mean = fluxHist.reduce((a, b) => a + b, 0) / fluxHist.length;
  const sd = Math.sqrt(fluxHist.reduce((a, b) => a + (b - mean) * (b - mean), 0) / fluxHist.length);
  const tsec = now / 1000;
  if (flux > mean + sd * 1.35 + 2 && tsec - lastBeat > .27 && F.bass > .28) {
    const iv = tsec - lastBeat; if (iv < 1.6 && iv > .3) { beatIntervals.push(iv); if (beatIntervals.length > 24) beatIntervals.shift(); }
    lastBeat = tsec; F.beat = true; F.pulse = 1;
    if (beatIntervals.length >= 4) {
      const s = [...beatIntervals].sort((a, b) => a - b); let ivm = s[s.length >> 1]; let bpm = 60 / ivm;
      while (bpm < 75) bpm *= 2; while (bpm > 165) bpm /= 2;
      F.bpm = F.bpm ? F.bpm * .85 + bpm * .15 : bpm;
    }
  }
}

// ---------------- DOM / UI ----------------
const stage = $('#stage');
const scene = createScene($('#sceneWrap'));
const viz = createViz($('#viz'));
const wave = $('#wave'), wg = wave.getContext('2d');

function setTheme(k) {
  if (!THEMES[k]) k = 'club'; S.theme = k; LS.set('theme', k);
  const th = THEMES[k]; const r = document.documentElement.style;
  th.c.forEach((c, i) => r.setProperty('--c' + (i + 1), c));
  document.body.dataset.theme = k; viz.setTheme(k); $('#theme').value = k;
  const meta = $('meta[name="theme-color"]'); if (meta) meta.content = th.bg[1];
  if (S.matchOutfit) setOutfit(OUTFIT_FOR_THEME[k] || 'classic', { save: false });
}
// ---------------- outfits ----------------
function setOutfit(id, { save = true } = {}) {
  if (!OUTFITS[id]) id = 'classic';
  if (save) { S.outfit = id; LS.set('outfit', id); }
  scene.setOutfit(id); $('#outfit').value = id; document.body.dataset.outfit = id;
}
(() => { const sel = $('#outfit'); sel.innerHTML = Object.entries(OUTFITS).map(([k, o]) => `<option value="${k}" title="${o.desc}">${o.name}</option>`).join(''); })();
$('#outfit').addEventListener('change', (e) => { if (S.matchOutfit) { S.matchOutfit = false; LS.set('matchOutfit', false); } setOutfit(e.target.value); });
function syncPlayUI() {
  const playing = !!(deck && !deck.el.paused);
  $('#playBtn').classList.toggle('is-playing', playing);
  $('#playBtn').setAttribute('aria-label', playing ? 'Pause' : 'Play');
  document.body.classList.toggle('playing', playing);
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = playing ? 'playing' : (deck ? 'paused' : 'none');
  renderListPlaying();
}
let statusTimer;
function setStatus(t) { const s = $('#status'); s.textContent = t; s.hidden = !t; }

async function artDataUrl(it) {
  if (it.art && it.art.startsWith('data:')) return it.art;
  if (it.artBlob) return new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => res(makeCover(it.title, it.artist, 512)); fr.readAsDataURL(it.artBlob); });
  if (it.art) return it.art;
  return makeCover(it.title, it.artist, 512);
}
async function updateNowPlaying(it, { loading } = {}) {
  $('#npTitle').textContent = it.title; $('#npArtist').textContent = it.artist || (it.source === 'beats' ? 'From Beats' : it.source === 'dj' ? 'From DJ Booth' : 'Imported');
  $('#npArt').src = coverOf(it); $('#npArt').alt = 'Artwork: ' + it.title;
  $('#likeBtn').classList.toggle('on', S.liked.has(it.key)); $('#likeBtn').setAttribute('aria-pressed', S.liked.has(it.key));
  $('#tDur').textContent = fmt(it.duration); $('#tCur').textContent = '0:00';
  document.title = `${it.title} — Psycho Fingers Player`;
  if ('mediaSession' in navigator) {
    const src = await artDataUrl(it);
    try {
      navigator.mediaSession.metadata = new MediaMetadata({ title: it.title, artist: it.artist || 'DJ Psycho Fingers', album: 'Psycho Fingers Player', artwork: [{ src, sizes: '512x512', type: src.startsWith('data:image/png') ? 'image/png' : 'image/jpeg' }] });
    } catch (e) {}
  }
  drawWave();
}

// waveform
async function loadPeaks(it) {
  if (peaksCache.has(it.key)) { drawWave(); return; }
  try {
    if (it.size > 80e6) return;
    const blob = await blobFor(it); if (!blob || blob.size > 80e6) return;
    const { peaks, duration } = await computePeaks(await blob.arrayBuffer(), 900);
    peaksCache.set(it.key, peaks); if (!it.duration) setDuration(it, duration);
    if (current && current.key === it.key) drawWave();
  } catch (e) { /* remote without CORS or undecodable: procedural waveform */ }
}
function fakePeaks(it) {
  const n = 900, p = new Float32Array(n); let s = hash(it.key) || 1;
  for (let i = 0; i < n; i++) { s = (s * 16807) % 2147483647; p[i] = .25 + .5 * Math.abs(Math.sin(i * .07 + (s % 100) / 30)) * (.6 + (s % 1000) / 2500); }
  return p;
}
let seekPreview = null;
function drawWave() {
  const w = wave.clientWidth, h = wave.clientHeight; if (!w || !h) return;
  const dpr = Math.min(2, devicePixelRatio || 1);
  if (wave.width !== Math.round(w * dpr) || wave.height !== Math.round(h * dpr)) { wave.width = Math.round(w * dpr); wave.height = Math.round(h * dpr); }
  wg.setTransform(dpr, 0, 0, dpr, 0, 0); wg.clearRect(0, 0, w, h);
  const it = current; const peaks = it ? (peaksCache.get(it.key) || fakePeaks(it)) : null; const real = it && peaksCache.has(it.key);
  const dur = deck && Number.isFinite(deck.el.duration) ? deck.el.duration : (it ? it.duration : 0);
  const pos = seekPreview != null ? seekPreview : (deck ? deck.el.currentTime : 0);
  const prog = dur ? Math.min(1, pos / dur) : 0;
  const cs = getComputedStyle(document.documentElement); const c1 = cs.getPropertyValue('--c1').trim() || '#ff2bd6', c2 = cs.getPropertyValue('--c2').trim() || '#22e3ff', c4 = cs.getPropertyValue('--c4').trim() || '#7a5cff';
  const wh = h - 12, mid = wh / 2; const bw = 3, gap = 2, n = Math.floor(w / (bw + gap));
  const played = wg.createLinearGradient(0, 0, w, 0); played.addColorStop(0, c1); played.addColorStop(1, c4);
  for (let i = 0; i < n; i++) {
    const v = peaks ? peaks[Math.floor(i / n * peaks.length)] : .15; const bh = Math.max(2, v * (wh - 2));
    const x = i * (bw + gap); const isP = (i / n) <= prog;
    wg.fillStyle = isP ? played : c2; wg.globalAlpha = isP ? 1 : (real ? .55 : .3);
    wg.fillRect(x, mid - bh / 2, bw, bh);
  }
  wg.globalAlpha = 1;
  // progress line + knob
  const ly = h - 4; wg.fillStyle = 'rgba(255,255,255,.14)'; wg.fillRect(0, ly - 1.5, w, 3);
  wg.fillStyle = played; wg.fillRect(0, ly - 1.5, w * prog, 3);
  wg.fillStyle = c1; wg.beginPath(); wg.arc(Math.max(5, Math.min(w - 5, w * prog)), ly, 5.5, 0, 7); wg.fill();
  wave.setAttribute('aria-valuenow', Math.round(pos)); wave.setAttribute('aria-valuemax', Math.round(dur || 0)); wave.setAttribute('aria-valuetext', `${fmt(pos)} of ${fmt(dur)}`);
}
function seekFromEvent(e) { const r = wave.getBoundingClientRect(); const k = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); const dur = deck && Number.isFinite(deck.el.duration) ? deck.el.duration : 0; return k * dur; }
wave.addEventListener('pointerdown', (e) => { if (!deck) return; wave.setPointerCapture(e.pointerId); seekPreview = seekFromEvent(e); $('#tCur').textContent = fmt(seekPreview); drawWave(); });
wave.addEventListener('pointermove', (e) => { if (seekPreview == null) return; seekPreview = seekFromEvent(e); $('#tCur').textContent = fmt(seekPreview); drawWave(); });
const endSeek = (e) => { if (seekPreview == null) return; seekTo(seekPreview); seekPreview = null; };
wave.addEventListener('pointerup', endSeek); wave.addEventListener('pointercancel', () => { seekPreview = null; });
function seekTo(t) { if (!deck) return; const d = deck.el.duration; if (!Number.isFinite(d)) return; const delta = t - deck.el.currentTime; deck.el.currentTime = Math.max(0, Math.min(d - .05, t)); scene.st.decks[deck.slot].rot += delta * 200; drawWave(); if (t < d - 20) invalidateCue(); }

// list
function itemSourceLabel(it) { return it.demo ? 'Demo · Beats' : it.source === 'beats' ? 'From Beats' : it.source === 'dj' ? 'From DJ Booth' : it.kind === 'url' ? 'URL' : it.kind === 'session' ? 'This session' : 'Imported'; }
function renderList() {
  const ul = $('#list'); const items = visible();
  ul.innerHTML = '';
  if (!items.length) {
    const msg = S.tab === 'beats' ? 'Nothing from Beats yet. Use “Send to Player” in Beats.' : S.tab === 'dj' ? 'Nothing from the DJ Booth yet. Use “Send to Player” in the booth.' : 'No imported tracks yet. Drop files here or tap + to add music.';
    ul.innerHTML = `<li class="empty">${msg}</li>`;
  }
  const frag = document.createDocumentFragment();
  items.forEach((it) => {
    const li = document.createElement('li'); li.className = 'trk'; li.dataset.key = it.key; li.tabIndex = 0; li.setAttribute('role', 'button');
    li.innerHTML = `<span class="th"><img alt="" loading="lazy"><span class="eqmini"><i></i><i></i><i></i></span></span>
      <span class="meta"><b></b><small></small></span><span class="dur"></span>
      <button class="more" aria-label="Track options" title="Options"><svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg></button>`;
    li.querySelector('img').src = coverOf(it);
    li.querySelector('b').textContent = it.title;
    li.querySelector('small').textContent = (it.artist ? it.artist + ' · ' : '') + itemSourceLabel(it);
    li.querySelector('.dur').textContent = it.duration ? fmt(it.duration) : '';
    if (S.liked.has(it.key)) li.classList.add('liked');
    li.addEventListener('click', (e) => { if (e.target.closest('.more')) return; userActivated = true; buildOrder(it.key); playItem(it); });
    li.addEventListener('keydown', (e) => { if (e.key === 'Enter') { buildOrder(it.key); playItem(it); } });
    li.querySelector('.more').addEventListener('click', (e) => { e.stopPropagation(); openItemMenu(it, e.currentTarget); });
    frag.appendChild(li);
  });
  ul.appendChild(frag);
  renderListPlaying(); renderFoot(); renderTabs();
}
function renderListPlaying() {
  const playing = !!(deck && !deck.el.paused);
  $$('#list .trk').forEach((li) => { const on = current && li.dataset.key === current.key; li.classList.toggle('current', !!on); li.classList.toggle('anim', !!(on && playing)); li.setAttribute('aria-current', on ? 'true' : 'false'); });
}
function renderFoot() { const items = visible(); const tot = items.reduce((a, b) => a + (b.duration || 0), 0); $('#count').textContent = `${items.length} track${items.length === 1 ? '' : 's'} • ${fmt(tot)}`; }
function renderTabs() {
  $$('.tabs [role=tab]').forEach((b) => { const on = b.dataset.tab === S.tab; b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1; const n = library.filter((it) => inTab(it, b.dataset.tab)).length; b.querySelector('.n').textContent = b.dataset.tab === 'all' ? '' : (n || ''); });
}
$$('.tabs [role=tab]').forEach((b) => b.addEventListener('click', () => { S.tab = b.dataset.tab; LS.set('tab', S.tab); renderList(); }));

// item menu
const itemMenu = $('#itemMenu'); let menuItem = null;
function openItemMenu(it, anchor) {
  menuItem = it;
  itemMenu.querySelector('[data-act=remove]').hidden = !(it.kind === 'store' || it.kind === 'url' || it.kind === 'session');
  placeMenu(itemMenu, anchor);
}
function placeMenu(menu, anchor) {
  closeMenus(); menu.hidden = false; const r = anchor.getBoundingClientRect(); const mw = menu.offsetWidth, mh = menu.offsetHeight;
  let x = Math.min(innerWidth - mw - 8, Math.max(8, r.right - mw)), y = r.bottom + 6; if (y + mh > innerHeight - 8) y = Math.max(8, r.top - mh - 6);
  menu.style.left = x + 'px'; menu.style.top = y + 'px'; const f = menu.querySelector('button:not([hidden])'); f && f.focus({ preventScroll: true });
}
function closeMenus() { $$('.menu').forEach((m) => { m.hidden = true; }); }
document.addEventListener('pointerdown', (e) => { if (!e.target.closest('.menu') && !e.target.closest('[data-menu]') && !e.target.closest('.more')) closeMenus(); });
itemMenu.addEventListener('click', async (e) => {
  const b = e.target.closest('button'); if (!b || !menuItem) return; const it = menuItem; closeMenus();
  const act = b.dataset.act;
  if (act === 'play') { buildOrder(it.key); playItem(it); }
  if (act === 'next') { if (!queueOrder.length) buildOrder(current && current.key); queueOrder = queueOrder.filter((k) => k !== it.key); const i = current ? queueOrder.indexOf(current.key) : -1; queueOrder.splice(i + 1, 0, it.key); invalidateCue(); toast(`“${it.title}” plays next`); }
  if (act === 'link') {
    let link; if (it.kind === 'store') link = new URL('./?track=' + encodeURIComponent(it.id), location.href).href;
    else if (it.kind === 'demo' || it.kind === 'url') link = new URL(`./?src=${encodeURIComponent(it.url)}&title=${encodeURIComponent(it.title)}&artist=${encodeURIComponent(it.artist)}`, location.href).href;
    else { toast('Session files have no link — save them to My Tracks first.'); return; }
    try { await navigator.clipboard.writeText(link); toast('Link copied'); } catch (err) { prompt('Copy this link', link); }
  }
  if (act === 'remove') {
    if (!confirm(`Remove “${it.title}” from My Tracks on this device?`)) return;
    if (it.kind === 'store') { await deleteTrack(it.id); }
    else if (it.kind === 'url') { urlItems = urlItems.filter((u) => 'url:' + u.id !== it.key); LS.set('urls', urlItems); }
    else sessionItems = sessionItems.filter((s) => s.key !== it.key);
    await refreshLibrary(); toast('Removed');
  }
});

// header menus
$('#addBtn').addEventListener('click', (e) => placeMenu($('#addMenu'), e.currentTarget));
$('#menuBtn').addEventListener('click', (e) => { syncMenu(); placeMenu($('#mainMenu'), e.currentTarget); });
function syncMenu() {
  $('#optSave').setAttribute('aria-checked', S.saveImports); $('#optSave .chk').textContent = S.saveImports ? '✓' : '';
  $('#optMatch').setAttribute('aria-checked', S.matchOutfit); $('#optMatch .chk').textContent = S.matchOutfit ? '✓' : '';
  $$('#mainMenu [data-anim]').forEach((b) => { const on = b.dataset.anim === S.anim; b.setAttribute('aria-checked', on); b.querySelector('.chk').textContent = on ? '●' : ''; });
  $('#optInstall').hidden = !deferredInstall;
}
$('#addMenu').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; closeMenus(); const a = b.dataset.act; if (a === 'files') $('#fileIn').click(); if (a === 'folder') $('#dirIn').click(); if (a === 'url') openUrlDialog(); });
$('#mainMenu').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.anim) { S.anim = b.dataset.anim; LS.set('anim', S.anim); syncMenu(); return; }
  const a = b.dataset.act; closeMenus();
  if (a === 'match') { S.matchOutfit = !S.matchOutfit; LS.set('matchOutfit', S.matchOutfit); if (S.matchOutfit) setOutfit(OUTFIT_FOR_THEME[S.theme] || 'classic', { save: false }); else setOutfit(S.outfit); toast(S.matchOutfit ? 'Outfit follows the scene' : 'Outfit: ' + OUTFITS[S.outfit].name); }
  if (a === 'save') { S.saveImports = !S.saveImports; LS.set('saveImports', S.saveImports); toast(S.saveImports ? 'Imports will be saved to My Tracks' : 'Imports play for this session only'); }
  if (a === 'files') $('#fileIn').click(); if (a === 'folder') $('#dirIn').click(); if (a === 'url') openUrlDialog();
  if (a === 'vis') toggleVisMode(); if (a === 'help') $('#helpDlg').showModal(); if (a === 'install') doInstall();
});

// ---------------- imports ----------------
$('#fileIn').addEventListener('change', (e) => { importFiles([...e.target.files]); e.target.value = ''; });
$('#dirIn').addEventListener('change', (e) => { importFiles([...e.target.files]); e.target.value = ''; });
let persistAsked = false;
async function importFiles(files) {
  files = files.filter(isAudioFile).sort((a, b) => (a.webkitRelativePath || a.name).localeCompare(b.webkitRelativePath || b.name, undefined, { numeric: true }));
  if (!files.length) { toast('No audio files found'); return; }
  if (S.saveImports && !persistAsked && navigator.storage && navigator.storage.persist) { persistAsked = true; navigator.storage.persist().catch(() => {}); }
  setStatus(`Adding ${files.length} track${files.length > 1 ? 's' : ''}…`);
  let first = null, saved = 0, session = 0;
  for (const f of files) {
    const tags = await readTags(f); const fromName = titleFromName(f.name);
    const title = tags.title || fromName.title, artist = tags.artist || fromName.artist;
    const tmp = URL.createObjectURL(f); const duration = await probeDuration(tmp); URL.revokeObjectURL(tmp);
    let key = null;
    if (S.saveImports) {
      try { const id = await saveTrack({ title, artist, source: 'import', blob: f, mime: f.type || 'audio/mpeg', duration, artwork: tags.picture }); key = 'store:' + id; saved++; }
      catch (err) { console.warn('[player] save failed, keeping in session', err); }
    }
    if (!key) {
      key = 'session:' + hash(f.name + f.size + f.lastModified) + ':' + Date.now().toString(36);
      const it = { key, kind: 'session', title, artist, source: 'import', blob: f, duration, createdAt: Date.now(), size: f.size };
      if (tags.picture) { it.artBlob = tags.picture; it.art = URL.createObjectURL(tags.picture); }
      sessionItems.push(it); session++;
    }
    if (!first) first = key;
  }
  await refreshLibrary(); setStatus('');
  toast(saved ? `Added ${saved} track${saved > 1 ? 's' : ''} to My Tracks${session ? ` (${session} for this session only)` : ''}` : `Added ${session} track${session > 1 ? 's' : ''} for this session`);
  if (S.tab !== 'all' && S.tab !== 'import') { S.tab = 'import'; LS.set('tab', S.tab); renderList(); }
  if (first && (!deck || deck.el.paused)) { const it = byKey(first); if (it) { buildOrder(it.key); playItem(it); } }
}
function addUrl(url, title, artist, { persist = true, play = true } = {}) {
  try { url = new URL(url, location.href).href; } catch (e) { toast('That URL looks invalid'); return null; }
  if (!/^https?:|^blob:/.test(url)) { toast('Only http(s) URLs are supported'); return null; }
  const name = title || decodeURIComponent(url.split('/').pop().split('?')[0] || 'Stream');
  const t = titleFromName(name);
  let it;
  if (persist) {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    urlItems.push({ id, url, title: title || t.title, artist: artist || t.artist, addedAt: Date.now() }); LS.set('urls', urlItems);
    it = { key: 'url:' + id };
  } else {
    it = { key: 'session:url:' + hash(url), kind: 'url', url, title: title || t.title, artist: artist || t.artist, source: 'import', duration: 0, createdAt: Date.now() };
    if (url === DEMO.url) return DEMO;
    if (!sessionItems.find((s) => s.key === it.key)) sessionItems.push(it);
  }
  return it.key;
}
function openUrlDialog() { const d = $('#urlDlg'); d.querySelector('form').reset(); d.showModal(); }
$('#urlDlg form').addEventListener('submit', async (e) => {
  e.preventDefault(); const fd = new FormData(e.target); const d = $('#urlDlg');
  if (e.submitter && e.submitter.value === 'cancel') { d.close(); return; }
  const key = addUrl(fd.get('url'), fd.get('title'), fd.get('artist')); d.close();
  if (key) { await refreshLibrary(); const it = byKey(key); if (it) { buildOrder(it.key); playItem(it); } }
});
$('#urlDlg [value=cancel]').addEventListener('click', () => $('#urlDlg').close());

// drag and drop
const dropEl = $('#drop'); let dragDepth = 0;
window.addEventListener('dragenter', (e) => { if (![...(e.dataTransfer?.types || [])].some((t) => t === 'Files' || t === 'text/uri-list')) return; e.preventDefault(); dragDepth++; dropEl.hidden = false; });
window.addEventListener('dragover', (e) => { if (!dropEl.hidden) e.preventDefault(); });
window.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) dropEl.hidden = true; });
window.addEventListener('drop', async (e) => {
  e.preventDefault(); dragDepth = 0; dropEl.hidden = true;
  const dt = e.dataTransfer; const entries = [...(dt.items || [])].map((i) => i.webkitGetAsEntry && i.webkitGetAsEntry()).filter(Boolean);
  let files = [];
  if (entries.length) {
    const walk = async (en) => {
      if (en.isFile) { await new Promise((res) => en.file((f) => { files.push(f); res(); }, res)); }
      else if (en.isDirectory) { const rd = en.createReader(); let batch; do { batch = await new Promise((res) => rd.readEntries(res, () => res([]))); for (const c of batch) await walk(c); } while (batch.length); }
    };
    for (const en of entries) await walk(en);
  } else files = [...dt.files];
  if (files.length) { importFiles(files); return; }
  const url = dt.getData('text/uri-list') || dt.getData('text/plain');
  if (url && /^https?:/.test(url.trim())) { const key = addUrl(url.trim().split('\n')[0]); if (key) { await refreshLibrary(); const it = byKey(key); it && playItem(it); } }
});

// ---------------- decks + crossfader UI ----------------
const xfader = $('#xfader');
function syncXfUI() {
  const p = xfPos(); if (document.activeElement !== xfader || !xfader.matches(':active')) xfader.value = Math.round(p * 1000);
  xfader.style.setProperty('--p', (p * 100) + '%'); xfader.setAttribute('aria-valuetext', p < .02 ? 'Deck A' : p > .98 ? 'Deck B' : `A ${Math.round(xfGain('A', p) * 100)}% · B ${Math.round(xfGain('B', p) * 100)}%`);
}
function syncDeckUI() {
  ['A', 'B'].forEach((s) => {
    const d = allDecks().find((x) => x.slot === s);
    const box = $('#deck' + s + 'Info'); box.classList.toggle('on', s === activeSlot && !!d); box.classList.toggle('cued', !!(cued && cued.slot === s));
    box.querySelector('.dt').textContent = d ? d.item.title : '—';
    box.title = d ? `Deck ${s}: ${d.item.title}${cued === d ? ' (cued next)' : s === activeSlot ? ' (playing)' : ''}` : `Deck ${s}: empty`;
  });
}
xfader.addEventListener('input', () => { ensureCtx(); setXf(xfader.value / 1000, { user: true }); });
$('#autoMix').checked = S.autoMix;
$('#autoMix').addEventListener('change', (e) => { S.autoMix = e.target.checked; LS.set('autoMix', S.autoMix); toast(S.autoMix ? 'Auto mix on — the crossfader moves by itself on transitions' : 'Auto mix off — you work the crossfader'); });
// keep transitions going when the tab is hidden / screen locked (animation frames stop there)
setInterval(() => { if (document.hidden) checkAutoAdvance(); }, 500);
document.addEventListener('visibilitychange', () => { scene.setInstant(document.hidden); });

// ---------------- transport controls ----------------
$('#playBtn').addEventListener('click', () => { userActivated = true; togglePlay(); });
$('#prevBtn').addEventListener('click', () => { userActivated = true; next(-1); });
$('#nextBtn').addEventListener('click', () => { userActivated = true; next(1); });
$('#bigPlay').addEventListener('click', () => { userActivated = true; if (deck && deck.el.paused && scene.st.decks[deck.slot].visible) { hideBigPlay(); deck.el.play().catch(() => {}); } else playItem(current || visible()[0] || DEMO); });
function showBigPlay(label) { const b = $('#bigPlay'); if (label) b.querySelector('span').textContent = label; b.hidden = false; }
function hideBigPlay() { $('#bigPlay').hidden = true; }

const volEl = $('#vol');
function applyVolume() {
  const v = S.muted ? 0 : S.vol; if (master) master.gain.setTargetAtTime(v, ctx.currentTime, .02);
  allDecks().forEach((d) => d.applyVol());
  volEl.value = Math.round(S.vol * 100); volEl.style.setProperty('--p', (S.muted ? 0 : S.vol * 100) + '%');
  $('#muteBtn').classList.toggle('muted', S.muted || S.vol === 0); $('#muteBtn').setAttribute('aria-label', S.muted ? 'Unmute' : 'Mute');
}
volEl.addEventListener('input', () => { S.vol = volEl.value / 100; S.muted = false; LS.set('vol', S.vol); applyVolume(); });
$('#muteBtn').addEventListener('click', () => { S.muted = !S.muted; applyVolume(); });
$('#shuffle').addEventListener('change', (e) => { S.shuffle = e.target.checked; LS.set('shuffle', S.shuffle); buildOrder(current && current.key); invalidateCue(); });
const xfEl = $('#xfade');
function applyXf() { xfEl.value = S.xfade; $('#xfOut').textContent = S.xfade + 's'; $('#xfLbl').textContent = S.xfade ? `Crossfade ${S.xfade}s` : 'Crossfade off'; xfEl.style.setProperty('--p', (S.xfade / 12 * 100) + '%'); }
xfEl.addEventListener('input', () => { S.xfade = +xfEl.value; LS.set('xfade', S.xfade); applyXf(); });
function applyRepeat() { const b = $('#repeatBtn'); b.dataset.mode = S.repeat; b.classList.toggle('on', S.repeat !== 'off'); b.setAttribute('aria-label', `Repeat: ${S.repeat}`); b.title = `Repeat: ${S.repeat === 'all' ? 'all' : S.repeat === 'one' ? 'one' : 'off'} (R)`; }
$('#repeatBtn').addEventListener('click', () => { S.repeat = S.repeat === 'all' ? 'one' : S.repeat === 'one' ? 'off' : 'all'; LS.set('repeat', S.repeat); applyRepeat(); invalidateCue(); toast('Repeat ' + S.repeat); });
$('#theme').addEventListener('change', (e) => setTheme(e.target.value));
$('#likeBtn').addEventListener('click', () => { if (!current) return; const k = current.key; S.liked.has(k) ? S.liked.delete(k) : S.liked.add(k); LS.set('liked', [...S.liked]); $('#likeBtn').classList.toggle('on', S.liked.has(k)); $('#likeBtn').setAttribute('aria-pressed', S.liked.has(k)); renderList(); });
function toggleFullscreen() {
  const el = document.documentElement;
  if (!document.fullscreenElement) { (el.requestFullscreen || el.webkitRequestFullscreen || (() => Promise.reject())).call(el).catch(() => toast('Fullscreen not available here')); }
  else (document.exitFullscreen || document.webkitExitFullscreen).call(document);
}
$('#fsBtn').addEventListener('click', toggleFullscreen);
document.addEventListener('fullscreenchange', () => { document.body.classList.toggle('fs', !!document.fullscreenElement); setTimeout(onResize, 120); });
function toggleVisMode() { document.body.classList.toggle('vis-only'); setTimeout(onResize, 60); if (document.body.classList.contains('vis-only')) toast('Visualizer mode — tap or press V to show controls'); }
stage.addEventListener('click', (e) => { if (document.body.classList.contains('vis-only') && !e.target.closest('button')) toggleVisMode(); });

// keyboard
const KEYS = (e) => {
  if (e.target.closest('input:not([type=range]):not([type=checkbox]),select,textarea,dialog[open]')) return;
  const k = e.key;
  if (e.target.matches('input[type=range]') && k.startsWith('Arrow')) return;
  let handled = true;
  if (k === ' ' || k === 'k' || k === 'K') { if (e.target.closest('button') && k === ' ') return; togglePlay(); }
  else if (k === 'ArrowRight' && e.shiftKey || k === 'n' || k === 'N') next(1);
  else if (k === 'ArrowLeft' && e.shiftKey || k === 'p' || k === 'P') next(-1);
  else if (k === 'ArrowRight' || k === 'l' || k === 'L') deck && seekTo(deck.el.currentTime + (k === 'ArrowRight' ? 5 : 10));
  else if (k === 'ArrowLeft' || k === 'j' || k === 'J') deck && seekTo(deck.el.currentTime - (k === 'ArrowLeft' ? 5 : 10));
  else if (k === 'ArrowUp') { S.vol = Math.min(1, S.vol + .05); S.muted = false; LS.set('vol', S.vol); applyVolume(); }
  else if (k === 'ArrowDown') { S.vol = Math.max(0, S.vol - .05); LS.set('vol', S.vol); applyVolume(); }
  else if (k === 'm' || k === 'M') { S.muted = !S.muted; applyVolume(); }
  else if (k === 's' || k === 'S') { $('#shuffle').click(); toast('Shuffle ' + (S.shuffle ? 'on' : 'off')); }
  else if (k === 'r' || k === 'R') $('#repeatBtn').click();
  else if (k === 'f' || k === 'F') toggleFullscreen();
  else if (k === 't' || k === 'T') { const ks = Object.keys(THEMES); setTheme(ks[(ks.indexOf(S.theme) + 1) % ks.length]); toast('Theme: ' + THEMES[S.theme].name); }
  else if (k === 'o' || k === 'O') { const ks = Object.keys(OUTFITS); const cur = $('#outfit').value; const nx = ks[(ks.indexOf(cur) + 1) % ks.length]; if (S.matchOutfit) { S.matchOutfit = false; LS.set('matchOutfit', false); } setOutfit(nx); toast('Outfit: ' + OUTFITS[nx].name); }
  else if (k === '[' || k === ']') { ensureCtx(); setXf(xfPos() + (k === ']' ? .1 : -.1), { user: true }); }
  else if (k === 'x' || k === 'X') $('#autoMix').click();
  else if (k === 'v' || k === 'V') toggleVisMode();
  else if (k === 'h' || k === 'H') $('#likeBtn').click();
  else if (k === 'a' || k === 'A') $('#fileIn').click();
  else if (k === '?') $('#helpDlg').showModal();
  else if (k === 'Escape') { closeMenus(); if (document.body.classList.contains('vis-only')) toggleVisMode(); }
  else if (/^[0-9]$/.test(k) && deck && Number.isFinite(deck.el.duration)) seekTo(deck.el.duration * (+k / 10));
  else handled = false;
  if (handled) { e.preventDefault(); userActivated = true; }
};
document.addEventListener('keydown', KEYS);
$('#helpDlg button').addEventListener('click', () => $('#helpDlg').close());

// media session
if ('mediaSession' in navigator) {
  const ms = navigator.mediaSession; const h = (a, f) => { try { ms.setActionHandler(a, f); } catch (e) {} };
  h('play', () => togglePlay()); h('pause', () => pauseAll());
  h('previoustrack', () => next(-1)); h('nexttrack', () => next(1));
  h('seekbackward', (d) => deck && seekTo(deck.el.currentTime - (d.seekOffset || 10)));
  h('seekforward', (d) => deck && seekTo(deck.el.currentTime + (d.seekOffset || 10)));
  h('seekto', (d) => deck && seekTo(d.seekTime)); h('stop', () => { pauseAll(); if (deck) deck.el.currentTime = 0; });
}
let lastPos = 0;
function updatePosition() {
  if (!deck || !('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return;
  const d = deck.el.duration; if (!Number.isFinite(d) || d <= 0) return;
  try { navigator.mediaSession.setPositionState({ duration: d, position: Math.min(d, deck.el.currentTime), playbackRate: deck.el.playbackRate || 1 }); } catch (e) {}
}

// toast
let toastT;
function toast(msg, action) {
  const t = $('#toast'); t.innerHTML = ''; const s = document.createElement('span'); s.textContent = msg; t.appendChild(s);
  if (action) { const b = document.createElement('button'); b.textContent = action.label; b.onclick = () => { action.fn(); t.hidden = true; }; t.appendChild(b); }
  t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, action ? 7000 : 3200);
}

// install (PWA)
let deferredInstall = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e; $('#installBtn').hidden = false; });
async function doInstall() { if (!deferredInstall) { toast('Use your browser menu → “Install app” / “Add to Home screen”'); return; } deferredInstall.prompt(); await deferredInstall.userChoice.catch(() => {}); deferredInstall = null; $('#installBtn').hidden = true; }
$('#installBtn').addEventListener('click', doInstall);
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('[player] SW', e));

// ---------------- live updates from Beats / DJ ----------------
let refreshT;
onMediaChange((m) => {
  clearTimeout(refreshT);
  refreshT = setTimeout(async () => {
    await refreshLibrary();
    if (m.type === 'track-added') {
      const it = byKey('store:' + m.id);
      const li = $(`[data-key="${CSS.escape('store:' + m.id)}"]`); if (li) { li.classList.add('flash'); setTimeout(() => li.classList.remove('flash'), 2400); }
      if (it && (m.source === 'beats' || m.source === 'dj')) toast(`New from ${m.source === 'beats' ? 'Beats' : 'DJ Booth'}: ${m.title}`, { label: 'Play', fn: () => { buildOrder(it.key); playItem(it); } });
    }
    if (m.type === 'track-deleted' && current && current.key === 'store:' + m.id) { /* keep playing the loaded blob */ }
  }, 120);
});
window.addEventListener('storage', (e) => { if (e.key === 'pf-urls') { urlItems = LS.get('urls', []); refreshLibrary(); } });

// ---------------- main loop ----------------
let lastT = performance.now(), anchorsCache = null, frameN = 0, lastUi = 0;
function onResize() { viz.resize(); anchorsCache = scene.anchors(); drawWave(); }
window.addEventListener('resize', () => { clearTimeout(onResize._t); onResize._t = setTimeout(onResize, 80); });
function loop(now) {
  const dt = Math.min(.05, (now - lastT) / 1000); lastT = now; frameN++;
  analyse(now, dt);
  allDecks().forEach((dk) => { scene.setDeckRate(dk.slot, dk.el.paused ? 1 : (dk.el.playbackRate || 1)); const d = dk.el.duration; if (Number.isFinite(d) && d > 0) scene.setProgress(dk.slot, dk.el.currentTime / d); });
  scene.setXfader(xfPos());
  if (frameN % 30 === 0 || !anchorsCache) anchorsCache = scene.anchors();
  viz.draw(now, F, anchorsCache);
  scene.frame(now, F);
  if (now - lastUi > 120) {
    lastUi = now;
    if (deck && seekPreview == null) { $('#tCur').textContent = fmt(deck.el.currentTime); drawWave(); }
    checkAutoAdvance(); syncXfUI();
    if (now - lastPos > 2000) { lastPos = now; updatePosition(); }
  }
  document.documentElement.style.setProperty('--pulse', F.pulse.toFixed(3));
  requestAnimationFrame(loop);
}

// ---------------- boot ----------------
async function boot() {
  setOutfit(S.outfit, { save: false }); setTheme(S.theme); applyVolume(); syncXfUI(); syncDeckUI(); applyXf(); applyRepeat(); $('#shuffle').checked = S.shuffle;
  onResize();
  await refreshLibrary();
  const q = new URLSearchParams(location.search);
  let start = null;
  if (q.get('track')) {
    const id = q.get('track'); start = byKey('store:' + id);
    if (!start) toast('That track is not in My Tracks on this device.');
  } else if (q.get('src')) {
    const key = addUrl(q.get('src'), q.get('title') || '', q.get('artist') || '', { persist: false });
    if (key && key.key) start = key; else { await refreshLibrary(); start = byKey(key); }
  }
  if (start) {
    if (!inTab(start, S.tab)) { S.tab = 'all'; LS.set('tab', 'all'); renderList(); }
    current = start; updateNowPlaying(start); renderList(); buildOrder(start.key);
    showBigPlay(`Play “${start.title}”`);
  } else { const first = visible()[0] || DEMO; current = first; updateNowPlaying(first); renderList(); showBigPlay('Tap to drop the needle'); }
  requestAnimationFrame(loop);
  window.__pf = { get deck() { return deck; }, get cued() { return cued; }, get outgoing() { return outgoing; }, get transition() { return transition; }, XF, xfPos, setXf, get slot() { return slot; }, get ctx() { return ctx; }, startTransition, get activeSlot() { return activeSlot; }, get current() { return current; }, F, scene, playItem, refreshLibrary, get library() { return library; }, next, S, setOutfit, setTheme };
}
boot();
