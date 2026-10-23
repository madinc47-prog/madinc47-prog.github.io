// Adaptive quality. level 0 low, 1 medium, 2 high. mode 'auto' drops pixel ratio / effects when FPS < 45.
const mobile = matchMedia('(pointer:coarse)').matches || Math.min(screen.width, screen.height) < 820;
const saved = localStorage.getItem('pf.q') || 'auto';
export const Q = { mode: saved, level: saved === 'auto' ? (mobile ? 1 : 2) : +saved, pr: 1, bloom: true, water: true, reflect: true, mobile, fps: 60, frameMs: 16 };
function apply() { const dpr = devicePixelRatio || 1; Q.pr = Q.level === 2 ? Math.min(dpr, mobile ? 1.5 : 2) : Q.level === 1 ? Math.min(dpr, 1) : Math.min(dpr, 0.7); Q.bloom = Q.level >= 1; Q.water = Q.level >= 1; Q.reflect = Q.level >= 1; }
apply();
let acc = 0, frames = 0, cool = 3, cbs = [];
export function onQuality(f) { cbs.push(f); }
function fire() { apply(); cbs.forEach(f => f(Q)); }
export function setMode(m) { Q.mode = m; localStorage.setItem('pf.q', m); if (m !== 'auto') Q.level = +m; else Q.level = mobile ? 1 : 2; fire(); }
export function tick(dt) {
  acc += dt; frames++; Q.frameMs = Q.frameMs * 0.95 + dt * 1000 * 0.05;
  if (acc >= 2) { Q.fps = frames / acc; acc = 0; frames = 0; cool -= 2;
    if (Q.mode === 'auto' && cool <= 0) {
      if (Q.fps < 45) { if (Q.pr > 0.6 && Q.level > 0) { Q.pr = Math.max(0.6, Q.pr - 0.2); cbs.forEach(f => f(Q)); } else if (Q.level > 0) { Q.level--; fire(); } cool = 4; }
      else if (Q.fps > 58 && Q.level < (mobile ? 1 : 2)) { Q.level++; fire(); cool = 8; }
    } }
}
