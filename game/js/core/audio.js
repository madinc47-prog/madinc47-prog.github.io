// Web Audio: voice lines, synth ambience (waves, bass hum), drums, beat loop, radio.
export const A = { ctx: null, master: null, music: null, sfx: null, voiceBus: null, bufs: {}, beat: null };
export function initAudio() {
  if (A.ctx) { A.ctx.resume(); return A; }
  const c = A.ctx = new (window.AudioContext || window.webkitAudioContext)();
  A.master = c.createGain(); A.master.gain.value = 0.9;
  const comp = c.createDynamicsCompressor(); comp.threshold.value = -10; comp.ratio.value = 4;
  A.master.connect(comp).connect(c.destination);
  A.music = c.createGain(); A.music.connect(A.master);
  A.sfx = c.createGain(); A.sfx.connect(A.master);
  A.voiceBus = c.createGain(); A.voiceBus.gain.value = 1.15; A.voiceBus.connect(A.master);
  return A;
}
let noiseBuf;
function noise() { if (noiseBuf) return noiseBuf; const c = A.ctx, b = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return noiseBuf = b; }
export async function loadVoice(name) {
  if (A.bufs[name]) return A.bufs[name];
  const r = await fetch('vo/' + name + '.mp3'); const ab = await r.arrayBuffer();
  return A.bufs[name] = await A.ctx.decodeAudioData(ab);
}
// Play a voice line with subtitle; resolves at end.
export async function say(name, text, sub) {
  sub && sub(text);
  try {
    const b = await loadVoice(name); const s = A.ctx.createBufferSource(); s.buffer = b; s.connect(A.voiceBus);
    // duck music
    const g = A.music.gain, t = A.ctx.currentTime; g.cancelScheduledValues(t); g.setTargetAtTime(0.45, t, 0.1); g.setTargetAtTime(1, t + b.duration, 0.4);
    s.start(); await new Promise(r => { s.onended = r; A._cur = s; });
  } catch (e) { await new Promise(r => setTimeout(r, 2500)); }
  sub && sub('');
}
export function stopVoice() { try { A._cur && A._cur.stop(); } catch (e) {} }
// Ocean waves: looping filtered noise with slow swells
export function waves() {
  const c = A.ctx, s = c.createBufferSource(); s.buffer = noise(); s.loop = true;
  const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700;
  const g = c.createGain(); g.gain.value = 0.0;
  const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 0.12; lg.gain.value = 0.18; lfo.connect(lg).connect(g.gain);
  const lfo2 = c.createOscillator(), lg2 = c.createGain(); lfo2.frequency.value = 0.09; lg2.gain.value = 400; lfo2.connect(lg2).connect(f.frequency);
  s.connect(f).connect(g).connect(A.sfx); s.start(); lfo.start(); lfo2.start();
  const out = c.createGain(); g.disconnect(); g.connect(out); out.connect(A.sfx); out.gain.value = 0; out.gain.setTargetAtTime(1, c.currentTime, 1.5);
  g.gain.value = 0.22;
  return { stop(t = 1) { out.gain.setTargetAtTime(0, c.currentTime, t / 3); setTimeout(() => { s.stop(); lfo.stop(); lfo2.stop(); }, t * 1000 + 200); }, out };
}
export function bassHum() {
  const c = A.ctx, o = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
  o.type = 'sawtooth'; o.frequency.value = 41.2; o2.type = 'sine'; o2.frequency.value = 55; f.type = 'lowpass'; f.frequency.value = 120;
  o.connect(f); o2.connect(f); f.connect(g).connect(A.music); g.gain.value = 0; g.gain.setTargetAtTime(0.25, c.currentTime, 2);
  o.start(); o2.start();
  return { stop() { g.gain.setTargetAtTime(0, c.currentTime, 0.2); setTimeout(() => { o.stop(); o2.stop(); }, 1200); } };
}
// ---- drums (synth) ----
export const KIT = [
  ['KICK', '#ff3b5c'], ['SNARE', '#ffb020'], ['CLAP', '#ffe14d'], ['HAT', '#5cff8a'],
  ['OPEN HAT', '#3be0ff'], ['RIM', '#5c8cff'], ['TOM LO', '#b05cff'], ['TOM HI', '#ff5ce1'],
  ['SHAKER', '#9dff5c'], ['COWBELL', '#ffd45c'], ['BASS', '#ff6a3b'], ['CONGA', '#3bffd0'],
  ['CRASH', '#c8e0ff'], ['PERC', '#ff9de1'], ['ZAP', '#7cff3b'], ['SCRATCH', '#ffffff']];
export function drum(i, t, vol = 1, dest) {
  const c = A.ctx; t = t || c.currentTime; dest = dest || A.music;
  const g = c.createGain(); g.connect(dest);
  const env = (a, d, peak = 1) => { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak * vol, t + a); g.gain.exponentialRampToValueAtTime(0.001, t + a + d); };
  const osc = (type, f0, f1, d) => { const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + d); o.connect(g); o.start(t); o.stop(t + d + 0.05); return o; };
  const nz = (type, fr, d, q = 1) => { const s = c.createBufferSource(); s.buffer = noise(); const f = c.createBiquadFilter(); f.type = type; f.frequency.value = fr; f.Q.value = q; s.connect(f).connect(g); s.start(t, Math.random()); s.stop(t + d + 0.05); };
  switch (i) {
    case 0: env(0.002, 0.45, 1.2); osc('sine', 150, 42, 0.45); break;
    case 1: env(0.001, 0.22, 0.8); nz('bandpass', 1800, 0.22, 0.7); osc('triangle', 220, 160, 0.1); break;
    case 2: env(0.001, 0.18, 0.8); nz('bandpass', 1200, 0.18, 1.5); break;
    case 3: env(0.001, 0.05, 0.4); nz('highpass', 8000, 0.05); break;
    case 4: env(0.001, 0.3, 0.35); nz('highpass', 7000, 0.3); break;
    case 5: env(0.001, 0.05, 0.6); osc('square', 800, 0, 0.05); break;
    case 6: env(0.002, 0.35, 0.9); osc('sine', 120, 70, 0.35); break;
    case 7: env(0.002, 0.28, 0.9); osc('sine', 220, 140, 0.28); break;
    case 8: env(0.01, 0.08, 0.35); nz('bandpass', 6000, 0.09, 2); break;
    case 9: env(0.001, 0.25, 0.35); osc('square', 560, 0, 0.25); osc('square', 845, 0, 0.25); break;
    case 10: env(0.005, 0.5, 0.7); osc('sawtooth', 55, 50, 0.5); break;
    case 11: env(0.001, 0.2, 0.8); osc('sine', 330, 260, 0.2); break;
    case 12: env(0.001, 1.2, 0.4); nz('highpass', 4000, 1.2, 0.5); break;
    case 13: env(0.001, 0.12, 0.6); osc('triangle', 1200, 600, 0.12); break;
    case 14: env(0.001, 0.25, 0.4); osc('sawtooth', 2000, 80, 0.25); break;
    case 15: scratch(t, dest); break;
  }
}
export function scratch(t, dest) {
  const c = A.ctx; t = t || c.currentTime; const s = c.createBufferSource(); s.buffer = noise();
  const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 4; const g = c.createGain(); s.connect(f).connect(g).connect(dest || A.sfx);
  const pts = [[0, 300], [0.08, 2500], [0.16, 400], [0.24, 1800], [0.36, 200]];
  pts.forEach(([dt, fr]) => f.frequency.linearRampToValueAtTime(fr, t + dt));
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.9, t + 0.02); g.gain.setValueAtTime(0.9, t + 0.3); g.gain.linearRampToValueAtTime(0, t + 0.38);
  s.playbackRate.setValueAtTime(0.5, t); s.playbackRate.linearRampToValueAtTime(2, t + 0.1); s.playbackRate.linearRampToValueAtTime(0.3, t + 0.2); s.playbackRate.linearRampToValueAtTime(1.5, t + 0.3);
  s.start(t); s.stop(t + 0.4);
}
export function impact() { // bass drop / logo slam
  const c = A.ctx, t = c.currentTime; drum(0, t, 1.6, A.sfx); drum(12, t, 1.2, A.sfx); drum(10, t, 1.4, A.sfx);
}
// Step sequencer loop: pattern = 16 lanes x 16 steps (bool). layers gate lanes.
export function startBeat(bpm = 100, pattern, onStep) {
  stopBeat();
  const c = A.ctx, spb = 60 / bpm / 4; let step = 0, next = c.currentTime + 0.1;
  const b = A.beat = { bpm, pattern, onStep, timer: 0, step: 0 };
  b.timer = setInterval(() => {
    while (next < c.currentTime + 0.12) {
      for (let l = 0; l < 16; l++) if (b.pattern[l] && b.pattern[l][step]) drum(l, next, l === 0 ? 1 : 0.8);
      const s = step, when = next; setTimeout(() => b.onStep && b.onStep(s), Math.max(0, (when - c.currentTime) * 1000));
      step = (step + 1) % 16; next += spb;
    }
  }, 25);
  return b;
}
export function stopBeat() { if (A.beat) { clearInterval(A.beat.timer); A.beat = null; } }
export function emptyPattern() { return Array.from({ length: 16 }, () => Array(16).fill(0)); }
// Radio: real Dominica stream (from the suite's station list), falls back to a procedural beat.
export function radio(onLabel) {
  const urls = [['Hits 767 · Roseau', 'https://stream.zeno.fm/tsjanuqnp9rtv'], ['Kairi FM 93.1', 'https://stream.zeno.fm/ych5ixtx51ktv'], ['Q95 FM', 'https://sonic01.instainternet.com/8306/stream']];
  const el = new Audio(); el.crossOrigin = 'anonymous'; el.volume = 0.8; let i = 0, done = false, fb = null;
  const fallback = () => { if (done) return; done = true; el.src = ''; onLabel && onLabel('Island Radio · Psycho Fingers Mix (offline)'); const p = emptyPattern(); [0, 6, 8, 14].forEach(s => p[0][s] = 1); [4, 12].forEach(s => p[1][s] = 1); for (let s = 0; s < 16; s += 2) p[8][s] = 1; [3, 7, 11].forEach(s => p[11][s] = 1); [0, 10].forEach(s => p[10][s] = 1); fb = startBeat(100, p); };
  const tryNext = () => { if (i >= urls.length) return fallback(); const [n, u] = urls[i++]; el.src = u; onLabel && onLabel('Island Radio · ' + n); const to = setTimeout(tryNext, 5000); el.play().then(() => { clearTimeout(to); done = true; }).catch(() => { clearTimeout(to); tryNext(); }); };
  el.onerror = () => { if (!done) tryNext(); };
  if (navigator.onLine === false) fallback(); else tryNext();
  return { stop() { done = true; el.pause(); el.src = ''; if (fb) stopBeat(); } };
}
