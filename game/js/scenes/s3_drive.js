// Scene 3 — Night drive along Roseau's real bayfront (OSM) with Island Radio, stop at the empty waterfront warehouse.
import * as THREE from '../../lib/three.module.min.js';
import { getWorld } from '../world/world.js';
import { OSM } from '../world/roseau.js';
import { H, pbr } from '../world/island.js';
import { makeCar } from '../world/car.js';
import { radio, say } from '../core/audio.js';
import { el, sub, hud, sleep } from '../core/ui.js';
import { loading } from '../main.js';
const gy = (x, z) => Math.max(H(x, z) * 1.15, 0.4) + 0.12;
export function drivePath() {
  // Victoria Street -> Bay Front (Dame Mary Eugenia Charles Blvd), north to south, real OSM geometry
  const pts = []; OSM.r.filter(r => r[2] === 'Dame Mary Eugenia Charles Boulevard').forEach(([p]) => p.forEach(q => pts.push(q)));
  pts.sort((a, b) => a[1] - b[1]); const out = []; pts.forEach(p => { if (!out.length || Math.hypot(p[0] - out[out.length - 1][0], p[1] - out[out.length - 1][1]) > 6) out.push(p); });
  const last = out[out.length - 1]; const wh = [last[0] - 10, last[1] + 70];
  out.push([last[0] - 4, last[1] + 30], [wh[0] + 2, wh[1] - 16]);
  return { pts: out.map(([x, z]) => new THREE.Vector3(x, gy(x, z), z)), wh };
}
export function warehouse(scene, wh) {
  if (scene.getObjectByName('warehouse')) return scene.getObjectByName('warehouse');
  const g = new THREE.Group(); g.name = 'warehouse'; const y = gy(wh[0], wh[1]) - 0.1;
  const tin = pbr('tin', 1, { color: 0x8a9296, metalness: 0.75, roughness: 0.4 }); [tin.map, tin.normalMap, tin.roughnessMap].forEach(t => t.repeat.set(6, 2));
  const box = new THREE.Mesh(new THREE.BoxGeometry(24, 8, 16), tin); box.position.y = 4; g.add(box);
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(9.5, 9.5, 24.4, 24, 1, false, -Math.PI / 4, Math.PI / 2), tin); roof.rotation.z = Math.PI / 2; roof.rotation.x = 0; roof.scale.set(1, 1, 0.9); roof.position.y = 1.4; roof.rotation.y = 0; roof.rotateX(0); g.add(roof); roof.rotation.set(0, 0, Math.PI / 2); roof.position.set(0, 1.4, 0);
  const door = new THREE.Mesh(new THREE.PlaneGeometry(6, 5), pbr('tin', 2, { color: 0x6b4a3a, metalness: 0.5, roughness: 0.6 })); door.position.set(0, 2.5, -8.02); door.rotation.y = Math.PI; g.add(door);
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.2, 0.4), new THREE.MeshStandardMaterial({ emissive: 0xffc070, emissiveIntensity: 5, color: 0 })); lamp.position.set(0, 5.6, -8.2); g.add(lamp);
  const pl = new THREE.SpotLight(0xffc070, 200, 25, 0.8, 0.6, 1.5); pl.position.set(0, 5.4, -8.6); pl.target.position.set(0, 0, -14); g.add(pl, pl.target);
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(30, 14), pbr('concrete', 4, { color: 0x777777, roughness: 0.35 })); apron.rotation.x = -Math.PI / 2; apron.position.set(0, 0.05, -14); g.add(apron);
  g.position.set(wh[0], y, wh[1]); g.rotation.y = Math.PI; // door faces the road (north)
  scene.add(g); return g;
}
export async function create(G) {
  const W = await getWorld(G.renderer, loading); W.setTime(0); W.signsOn(99);
  const cam = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.5, 200000);
  const { pts, wh } = drivePath(); const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal'); const L = curve.getLength();
  const wHouse = warehouse(W.scene, wh);
  const car = makeCar(); W.scene.add(car);
  let s = 0, speed = 0, t = 0, arrived = false, alive = true, rad = null; const camPos = new THREE.Vector3(), look = new THREE.Vector3();
  const lab = el('div', { class: 'panel', style: 'left:10px;top:56px;font-weight:700' }, '📻 Island Radio');
  const fwd = new THREE.Vector3();
  function place() { const u = Math.min(s / L, 1); const p = curve.getPointAt(u), tg = curve.getTangentAt(u); car.position.copy(p); car.lookAt(p.clone().add(tg)); car.userData.wheels.forEach(w => w.children.forEach(c => c.rotation.x += speed * 0.05)); fwd.copy(tg); }
  place(); camPos.copy(car.position).addScaledVector(fwd, -9).add(new THREE.Vector3(0, 3.5, 0));
  return { scene: W.scene, camera: cam,
    async start() { hud().append(lab, el('button', { class: 'skip', onclick: () => G.go(4) }, 'Skip ⏭')); rad = radio(n => lab.textContent = '📻 ' + n); },
    update(dt) { t += dt; W.update(dt);
      if (!arrived) { const left = L - s; speed = Math.min(14, speed + dt * 4, Math.max(2, left * 0.5)); s += speed * dt; if (left < 0.5) { arrived = true; arrive(); } }
      place();
      const tgt = arrived ? car.position.clone().add(new THREE.Vector3(Math.sin(t * 0.2) * 14 + 6, 5, -10)) : car.position.clone().addScaledVector(fwd, -9).add(new THREE.Vector3(Math.sin(t * 0.3) * 1.5, 3.2, 0));
      camPos.lerp(tgt, 1 - Math.exp(-dt * (arrived ? 0.8 : 3))); cam.position.copy(camPos);
      look.lerp(arrived ? wHouse.position.clone().add(new THREE.Vector3(0, 4, 0)) : car.position.clone().addScaledVector(fwd, 6).add(new THREE.Vector3(0, 1, 0)), 1 - Math.exp(-dt * 3)); cam.lookAt(look);
    },
    dispose() { alive = false; rad && rad.stop(); W.scene.remove(car); } };
  async function arrive() { await sleep(800); if (!alive) return; rad && rad.stop(); await say('s3a', "This is yours. Right now it's empty. Make it the hottest studio on the island.", sub); if (!alive) return; hud().append(el('button', { class: 'big', style: 'position:fixed;left:50%;bottom:80px;transform:translateX(-50%)', onclick: () => G.go(4) }, 'Enter the warehouse ▶')); }
}
