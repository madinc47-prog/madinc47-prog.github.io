// Scene 1 — Intro: dusk flyover of real-elevation Dominica into Roseau's bayfront, neon on, logo slam.
import * as THREE from '../../lib/three.module.min.js';
import { getWorld, CLUB } from '../world/world.js';
import { camPath } from '../core/cam.js';
import { waves, bassHum, say, impact, scratch, startBeat, stopBeat, emptyPattern, A } from '../core/audio.js';
import { $, el, sub, hud, sleep } from '../core/ui.js';
import { loading } from '../main.js';
export async function create(G) {
  const W = await getWorld(G.renderer, loading); W.setTime(1);
  const cam = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 1, 200000);
  const c = CLUB(); const end = [c.x + c.nx * 40, c.y + 4.5, c.z + c.nz * 40 + 3];
  const fly = camPath(cam, [[-9000, 40, 3500], [-6500, 420, -2500], [-3000, 1500, -9500], [2600, 1900, -9000], [4200, 1300, -2500], [1200, 380, 600], [c.x - 500, 120, c.z + 160]],
    [[0, 300, -4000], [3000, 900, -8000], [6200, 1150, -7800], [6200, 1100, -7600], [0, 100, 0], [c.x, 10, c.z], [c.x, 10, c.z]], 24);
  const dive = camPath(cam, [[c.x - 500, 120, c.z + 160], [c.x - 180, 30, c.z + 120], [c.x + c.nx * 40 + 25, 6, c.z + 60], end],
    [[c.x, 10, c.z], [c.x, 8, c.z], [c.x, 7, c.z + 20], [c.x, c.y + 8.5, c.z]], 8, { fovs: [55, 48] });
  let mode = 'fly', t = 0, snd = [], alive = true, fade = 1;
  const black = el('div', { style: 'position:fixed;inset:0;background:#000;z-index:9;pointer-events:none;transition:opacity 3s' }); document.body.append(black);
  const skip = el('button', { class: 'skip', onclick: () => G.go(2) }, 'Skip intro ⏭'); hud().append(skip);
  const ff = +new URLSearchParams(location.search).get('ff') || 0; if (ff) { black.style.display='none'; if (ff < 24) { fly.update(ff); t = ff; } else { fly.skip(); mode = 'dive'; dive.update(ff - 24); t = ff; } }
  async function run() {
    snd.push(waves(), bassHum()); await sleep(600); black.style.opacity = 0;
    await sleep(2200); if (!alive) return; say('s1a', 'Dominica… the Nature Isle. But tonight, the island has a new heartbeat.', sub);
    await fly.promise; if (!alive) return; if (mode === 'fly') mode = 'dive'; snd[1].stop(); impact();
    const p = emptyPattern(); [0, 3, 6, 8, 11, 14].forEach(s => p[0][s] = 1); [4, 12].forEach(s => p[1][s] = 1); for (let s = 0; s < 16; s += 2) p[3][s] = 1; [0, 10].forEach(s => p[10][s] = 1); [2, 7, 13].forEach(s => p[11][s] = 1);
    startBeat(104, p);
    await dive.promise; if (!alive) return; mode = 'hold';
    await say('s1b', 'Everybody stand up! Get your backs off the wall! Welcome… to DJ Psycho Fingers!', sub); if (!alive) return;
    scratch(); impact(); const lg = el('div', { id: 'logo' }, el('div', { class: 'l1 slam' }, 'DJ PSYCHO'), el('div', { class: 'l2 slam', style: 'animation-delay:.12s' }, 'FINGERS')); document.body.append(lg); document.body.classList.add('shake'); setTimeout(() => document.body.classList.remove('shake'), 400);
    snd.push({ stop: () => lg.remove() });
    skip.textContent = 'Continue ▶'; await sleep(4500); if (alive) G.go(2);
  }
  return { scene: W.scene, camera: cam, start: run,
    update(dt) { t += dt; W.update(dt); if (mode === 'fly') fly.update(dt); else if (mode === 'dive') dive.update(dt); else cam.position.y += Math.sin(t) * 0.002;
      W.signsOn(mode === 'fly' ? (fly ? Math.max(0, t - 19) : 0) : 5 + t);
    },
    dispose() { alive = false; snd.forEach(s => s.stop()); stopBeat(); black.remove(); } };
}
