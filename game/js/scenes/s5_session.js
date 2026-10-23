// Scene 5 — First session: walk in, 4x4 pads + mini sequencer (lane labels/colours glow per pad), lights pulse, pull back over Roseau, Go Live.
import * as THREE from '../../lib/three.module.min.js';
import { buildStudio, fans } from '../world/studio.js';
import { getWorld } from '../world/world.js';
import { drivePath, warehouse } from './s3_drive.js';
import { camPath } from '../core/cam.js';
import { say, drum, KIT, startBeat, stopBeat, emptyPattern, A } from '../core/audio.js';
import { el, sub, hud, sleep } from '../core/ui.js';
import { loading } from '../main.js';
export async function create(G) {
  const scene = new THREE.Scene(); const cam = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 300);
  const layout = G.save.layout || { walls: {}, lights: [[5, 3, 0xff2bd6], [8, 5, 0x2b8bff]], gear: { beat: [5, 4] }, floor: 2 };
  if (!layout.gear.beat) layout.gear.beat = [5, 4]; if (!layout.lights.length) layout.lights.push([5, 3, 0xff2bd6], [8, 5, 0x2b8bff]);
  const S = await buildStudio(scene, G.renderer, layout); G.renderer.toneMappingExposure = 0.85; const F = fans(scene); F.set(30);
  const bp = S.beatPos; const walk = camPath(cam, [[0, 1.7, -14], [0, 1.7, -8.5], [bp.x * 0.5, 1.7, bp.z - 2], [bp.x, 2.3, bp.z + 3.4]], [[0, 1.6, 0], [0, 1.5, 0], [bp.x, 1.2, bp.z], [bp.x, 1.0, bp.z - 0.6]], 7);
  let mode = 'walk', t = 0, pulse = 0, alive = true, pull = null, W = null, step = -1;
  const pattern = emptyPattern();
  // ---- UI: pads + sequencer ----
  const seq = el('div', { class: 'seq' }); const cells = [];
  KIT.forEach(([n, c], l) => { const lab = el('div', { class: 'lab lane', style: `--k:${c};border-color:${c};color:${c}` }, `${l + 1} ${n}`); seq.append(lab); cells[l] = { lab, c: [] };
    for (let s = 0; s < 16; s++) { const d = el('div', { class: 'c lane', style: `--k:${c}`, onclick: () => { pattern[l][s] ^= 1; d.classList.toggle('on'); } }); seq.append(d); cells[l].c.push(d); } });
  const pads = el('div', { class: 'pads' });
  const hitPad = (l) => { drum(l); const now = A.beat ? (step + 1) % 16 : -1; if (A.beat && now >= 0) { pattern[l][now] = 1; cells[l].c[now].classList.add('on'); }
    const lane = cells[l]; [lane.lab, ...lane.c].forEach(x => x.classList.add('glow')); clearTimeout(lane.to); lane.to = setTimeout(() => [lane.lab, ...lane.c].forEach(x => x.classList.remove('glow')), 260);
    const pm = S.items.getObjectsByProperty ? null : null; padMeshes[l] && (padMeshes[l].material.emissiveIntensity = 4); if (l === 0 || l === 10) pulse = 1; else pulse = Math.max(pulse, 0.5); };
  KIT.forEach(([n, c], l) => { const b = el('button', { class: 'pad', style: `border-color:${c};color:${c};box-shadow:0 0 10px ${c}55` }, `${l + 1}\n${n}`); b.style.whiteSpace = 'pre-line';
    b.addEventListener('pointerdown', e => { e.preventDefault(); b.classList.add('hit'); hitPad(l); }); b.addEventListener('pointerup', () => b.classList.remove('hit')); b.addEventListener('pointerleave', () => b.classList.remove('hit')); pads.append(b); });
  const recB = el('button', { class: 'opt', onclick: () => { if (A.beat) { stopBeat(); recB.textContent = '▶ Loop (records your pads)'; } else { startBeat(100, pattern, s => { step = s; cells.forEach(({ c }, l) => { c.forEach((d, k) => d.classList.toggle('now', k === s)); if (pattern[l][s]) { pulse = Math.max(pulse, l === 0 ? 1 : 0.4); padMeshes[l] && (padMeshes[l].material.emissiveIntensity = 3); } }); }); recB.textContent = '■ Stop loop'; } } }, '▶ Loop (records your pads)');
  const clrB = el('button', { class: 'opt', onclick: () => { pattern.forEach(r => r.fill(0)); cells.forEach(({ c }) => c.forEach(d => d.classList.remove('on'))); } }, 'Clear');
  const doneB = el('button', { class: 'big', style: 'font-size:16px;padding:10px 16px;min-height:46px', onclick: () => pullBack() }, 'Take it outside ▶');
  const panel = el('div', { class: 'panel', style: 'left:6px;right:6px;bottom:6px;display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;justify-content:center' }, pads, el('div', { style: 'flex:1;min-width:min(520px,90vw);max-width:640px' }, seq, el('div', { class: 'row' }, recB, clrB, doneB)));
  const padMeshes = []; S.items.traverse(o => { if (o.userData.pad !== undefined) padMeshes[o.userData.pad] = o; });
  async function pullBack() {
    if (mode === 'pull') return; mode = 'pull'; panel.remove(); loading('Heading outside…');
    W = await getWorld(G.renderer, loading); loading(''); if (!alive) return; W.setTime(0); W.signsOn(99); const { wh } = drivePath(); const wo = warehouse(W.scene, wh);
    const cw = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.5, 200000); const p = wo.position;
    pull = camPath(cw, [[p.x, p.y + 4, p.z - 16], [p.x - 40, p.y + 40, p.z - 60], [p.x - 400, 220, p.z - 300], [p.x - 1500, 650, p.z - 400]], [[p.x, p.y + 3, p.z], [p.x, p.y, p.z], [p.x + 100, 0, p.z - 200], [800, 200, -800]], 16);
    G.setView(W.scene, cw); W._cam = cw;
    await say('s5b', "The island is listening. When you're ready… take it live.", sub); if (!alive) return;
    hud().append(el('div', { style: 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);text-align:center' }, el('a', { class: 'golive', href: '../beats/live.html' }, '● GO LIVE'), el('div', { style: 'margin-top:14px' }, el('button', { class: 'opt', onclick: () => G.go(4) }, '◀ Back to the studio'))));
  }
  return { scene, camera: cam,
    async start() { hud().append(el('button', { class: 'skip', style: 'bottom:auto;top:56px', onclick: () => { walk.skip(); } }, 'Skip ⏭')); await walk.promise; if (!alive) return; mode = 'play'; hud().append(panel); await say('s5a', 'Now make something. Lay down a beat.', sub); },
    update(dt) { t += dt; S.update(dt); F.update(dt); pulse = Math.max(0, pulse - dt * 3); S.pulse(pulse * 1.6); padMeshes.forEach(m => m && (m.material.emissiveIntensity = Math.max(0.6, m.material.emissiveIntensity - dt * 8)));
      if (mode === 'walk') walk.update(dt); if (mode === 'pull' && pull) { pull.update(dt); W.update(dt); } },
    dispose() { alive = false; stopBeat(); } };
}
