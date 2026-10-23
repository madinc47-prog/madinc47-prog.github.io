// The warehouse studio interior: grid build system shared by Scene 4 (build) and Scene 5 (session).
import * as THREE from '../../lib/three.module.min.js';
import { Reflector } from '../../lib/a/Reflector.js';
import { RGBELoader } from '../../lib/a/RGBELoader.js';
import { pbr } from './island.js';
import { neonSign } from './roseau.js';
import { makeAvatar } from './avatar.js';
import { Q } from '../core/quality.js';
import { KIT } from '../core/audio.js';
export const GW = 12, GH = 8, CELL = 2; // 24 m x 16 m
export const cellPos = (i, j) => new THREE.Vector3((i - GW / 2 + 0.5) * CELL, 0, (j - GH / 2 + 0.5) * CELL);
export const GEAR = {
  beat: { name: 'Beat station', hype: 0, w: 2, h: 1 }, vocal: { name: 'Vocal booth', hype: 10, w: 2, h: 2 }, dj: { name: 'DJ booth', hype: 20, w: 2, h: 1 },
  lounge: { name: 'Lounge + Island TV', hype: 35, w: 3, h: 2 }, live: { name: 'Live corner', hype: 50, w: 2, h: 2 } };
const M = (c, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.5 }, o));
function tvTex() { const c = document.createElement('canvas'); c.width = 512; c.height = 288; const g = c.getContext('2d'); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; let k = 0;
  t.userData.tick = () => { k++; const gr = g.createLinearGradient(0, 0, 512, 288); gr.addColorStop(0, `hsl(${(k * 2) % 360},80%,35%)`); gr.addColorStop(1, `hsl(${(k * 2 + 120) % 360},80%,20%)`); g.fillStyle = gr; g.fillRect(0, 0, 512, 288);
    g.fillStyle = '#fff'; g.font = '900 64px Arial Black,Impact,sans-serif'; g.textAlign = 'center'; g.fillText('ISLAND TV', 256, 130); g.font = '700 24px system-ui'; g.fillText('LIVE FROM ROSEAU', 256, 170);
    g.fillStyle = '#e0002a'; g.fillRect(0, 248, 512, 40); g.fillStyle = '#fff'; g.textAlign = 'left'; g.font = '700 22px system-ui'; g.fillText('DJ PSYCHO FINGERS · NEW STUDIO OPENING TONIGHT · BAYFRONT · ', 512 - (k * 3) % 1100, 276); t.needsUpdate = true; };
  t.userData.tick(); return t; }
export async function buildStudio(scene, renderer, layout) {
  const pm = new THREE.PMREMGenerator(renderer);
  try { const hdr = await new RGBELoader().loadAsync('dusk.hdr'); scene.environment = pm.fromEquirectangular(hdr).texture; hdr.dispose(); } catch (e) {}
  scene.background = new THREE.Color(0x05060c); scene.fog = new THREE.Fog(0x05060c, 30, 90);
  scene.add(new THREE.HemisphereLight(0x8090c0, 0x201010, 0.25));
  const moon = new THREE.DirectionalLight(0x8090ff, 0.4); moon.position.set(-20, 30, 10); scene.add(moon);
  // outside lot + street
  const lot = new THREE.Mesh(new THREE.PlaneGeometry(90, 70), pbr('asphalt', 14, { color: 0x555560, roughness: 0.4 })); lot.rotation.x = -Math.PI / 2; lot.position.y = -0.02; scene.add(lot);
  // floor: concrete slab + optional glossy finish with real planar reflections
  const fg = new THREE.PlaneGeometry(GW * CELL, GH * CELL);
  const slab = new THREE.Mesh(fg, pbr('concrete', 6, { color: 0x9a9a9a, roughness: 0.8 })); slab.rotation.x = -Math.PI / 2; slab.position.y = 0.01; scene.add(slab);
  const refl = new Reflector(fg, { textureWidth: Q.level >= 2 ? 1024 : 512, textureHeight: Q.level >= 2 ? 768 : 384, color: 0x888888 }); refl.rotation.x = -Math.PI / 2; refl.position.y = 0.015; refl.visible = false; scene.add(refl);
  const FLOORS = [null, pbr('planks', 5, { color: 0xd0a070, roughness: 0.35, transparent: true, opacity: 0.72 }), new THREE.MeshPhysicalMaterial({ color: 0x0a0a10, roughness: 0.08, metalness: 0.3, clearcoat: 1, transparent: true, opacity: 0.6 }), pbr('concrete', 6, { color: 0xc8c8c8, roughness: 0.15, transparent: true, opacity: 0.7 })];
  const finish = new THREE.Mesh(fg, FLOORS[2]); finish.rotation.x = -Math.PI / 2; finish.position.y = 0.02; finish.visible = false; scene.add(finish);
  // shell: low cut-away corrugated walls (top-down build view) with door gap at north
  const tin = pbr('tin', 1, { color: 0x8a9296, metalness: 0.7, roughness: 0.45 }); [tin.map, tin.normalMap, tin.roughnessMap].forEach(t => t.repeat.set(8, 1));
  const shell = new THREE.Group(); scene.add(shell); const WH = 3;
  const wall = (w, x, z, r) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, WH, 0.25), tin); m.position.set(x, WH / 2, z); m.rotation.y = r; shell.add(m); };
  wall(24, 0, 8, 0); wall(16, -12, 0, Math.PI / 2); wall(16, 12, 0, Math.PI / 2); wall(9, -7.5, -8, 0); wall(9, 7.5, -8, 0);
  const dl = new THREE.Mesh(new THREE.BoxGeometry(1, 0.2, 0.4), M(0, { emissive: 0xffc070, emissiveIntensity: 5 })); dl.position.set(0, 3.2, -8.3); scene.add(dl);
  const items = new THREE.Group(); scene.add(items);
  const WALLM = { wood: pbr('siding', 1, { color: 0xc89060 }), concrete: pbr('concrete', 1, { color: 0xb0b0b0 }), neon: M(0x111111, { emissive: 0xff2bd6, emissiveIntensity: 1.1, roughness: 0.3 }) };
  const lights = []; const MAXL = Q.level >= 2 ? 10 : Q.level === 1 ? 6 : 3; let tvT = null;
  const S = { layout: layout || { walls: {}, lights: [], gear: {}, floor: 0 }, refl, items, lights, shell, beatPos: null, scene };
  function rebuild() {
    items.clear(); lights.forEach(l => scene.remove(l)); lights.length = 0; tvT = null; const L = S.layout;
    for (const k in L.walls) { const [i, j] = k.split(',').map(Number), w = L.walls[k]; const p = cellPos(i, j); const m = new THREE.Mesh(new THREE.BoxGeometry(CELL, WH, 0.3), WALLM[w.m]); m.position.set(p.x, WH / 2, p.z); if (w.v) m.rotation.y = Math.PI / 2; m.userData.wall = k; items.add(m); if (w.m === 'neon' && lights.length < MAXL && Math.random() < 0.3) { const l = new THREE.PointLight(0xff2bd6, 12, 8, 2); l.position.set(p.x, 1.8, p.z); scene.add(l); lights.push(l); } }
    L.lights.forEach(([i, j, c], n) => { const p = cellPos(i, j); const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 0.3, 16), M(0x111111, { emissive: c || 0xfff0d8, emissiveIntensity: 2.2 })); lamp.position.set(p.x, 4.2, p.z); items.add(lamp); const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.2, 4), M(0x222222)); cone.position.set(p.x, 4.9, p.z); items.add(cone);
      if (lights.length < MAXL) { const l = new THREE.PointLight(c || 0xfff0d8, 40, 14, 1.6); l.position.set(p.x, 3.6, p.z); l.userData.base = 40; scene.add(l); lights.push(l); } });
    for (const g in L.gear) { const [i, j] = L.gear[g]; items.add(gearMesh(g, i, j)); }
    const f = L.floor || 0; finish.visible = f > 0; if (f) finish.material = FLOORS[f]; refl.visible = f > 0 && Q.reflect;
  }
  function gearMesh(type, i, j) {
    const G = GEAR[type], g = new THREE.Group(); const p = cellPos(i, j); g.position.set(p.x + (G.w - 1) * CELL / 2, 0, p.z + (G.h - 1) * CELL / 2); g.userData.type = type;
    if (type === 'beat') { const desk = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.9, 1.1), M(0x15151a, { metalness: 0.4, roughness: 0.3 })); desk.position.y = 0.45; g.add(desk);
      for (let a = 0; a < 16; a++) { const pad = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 0.16), M(0x111111, { emissive: new THREE.Color(KIT[a][1]), emissiveIntensity: 0.6 })); pad.position.set(-0.4 + (a % 4) * 0.2, 0.93, -0.3 + Math.floor(a / 4) * 0.2); pad.userData.pad = a; g.add(pad); }
      const kb = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.05, 0.3), M(0xeeeeee)); kb.position.set(0.9, 0.93, 0); g.add(kb); const mon = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.75, 0.05), M(0x050505, { emissive: 0x2b8bff, emissiveIntensity: 0.6 })); mon.position.set(0, 1.45, -0.45); g.add(mon);
      [-1.6, 1.6].forEach(x => { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.6, 0.35), M(0x111111)); sp.position.set(x, 1.2, -0.3); g.add(sp); }); S.beatPos = g.position.clone(); }
    if (type === 'vocal') { const foam = M(0x2a2a35, { roughness: 1 }); [[0, -1.9, 3.8, 0], [-1.9, 0, 3.8, Math.PI / 2], [1.9, 0, 3.8, Math.PI / 2]].forEach(([x, z, w, r]) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, 2.6, 0.2), foam); b.position.set(x, 1.3, z); b.rotation.y = r; g.add(b); });
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.6), M(0x888888, { metalness: 1 })); st.position.y = 0.8; g.add(st); const mic = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.12, 4, 10), M(0x999999, { metalness: 1, roughness: .3 })); mic.position.y = 1.65; g.add(mic); const ring = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.01, 6, 24), M(0x111111)); ring.position.set(0, 1.65, 0.25); g.add(ring); }
    if (type === 'dj') { const a = makeAvatar({ prop: 'decks', top: 1 }); a.children.forEach(c => { }); const d = a; d.scale.setScalar(1); d.position.set(0, 0, 0); g.add(d); }
    if (type === 'lounge') { const sofa = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.5, 1), M(0x5a1a5a, { roughness: 0.9 })); sofa.position.set(0, 0.25, 1); g.add(sofa); const back = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.7, 0.3), M(0x5a1a5a, { roughness: 0.9 })); back.position.set(0, 0.7, 1.45); g.add(back);
      tvT = tvTex(); const tv = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 1.58), new THREE.MeshStandardMaterial({ map: tvT, emissive: 0xffffff, emissiveMap: tvT, emissiveIntensity: 1.2, color: 0 })); tv.position.set(0, 1.8, -1.6); g.add(tv); const fr = new THREE.Mesh(new THREE.BoxGeometry(2.9, 1.68, 0.06), M(0x050505)); fr.position.set(0, 1.8, -1.64); g.add(fr); }
    if (type === 'live') { const tri = M(0x222222, { metalness: .7 }); for (let k = 0; k < 3; k++) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.5), tri); const a = k / 3 * 6.28; l.position.set(Math.cos(a) * 0.25, 0.7, Math.sin(a) * 0.25); l.rotation.set(Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3); g.add(l); }
      const camb = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.3, 0.5), M(0x111111)); camb.position.y = 1.5; g.add(camb); const ln = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.25, 16), M(0x050505, { metalness: 1, roughness: .1 })); ln.rotation.x = Math.PI / 2; ln.position.set(0, 1.5, 0.35); g.add(ln);
      const sg = neonSign('GO LIVE', '#ff2040', 2.4, 0.6); sg.userData.mat.emissiveIntensity = 2.2; sg.position.set(0, 2.6, -1.8); g.add(sg); const rec = new THREE.Mesh(new THREE.SphereGeometry(0.04), M(0, { emissive: 0xff0000, emissiveIntensity: 8 })); rec.position.set(0.12, 1.7, 0.1); g.add(rec); }
    return g;
  }
  S.rebuild = rebuild; S.gearMesh = gearMesh;
  S.pulse = k => lights.forEach(l => { l.intensity = (l.userData.base || 12) * (0.6 + k); });
  S.update = dt => { if (tvT) tvT.userData.tick(); refl.visible = finish.visible && Q.reflect; };
  rebuild(); return S;
}
// fans queueing outside the door (instanced, bobbing)
export function fans(scene) {
  const g = new THREE.CapsuleGeometry(0.25, 1.1, 4, 8); g.translate(0, 0.8, 0);
  const im = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ roughness: 0.6 }), 60); im.count = 0; scene.add(im);
  const c = new THREE.Color(), m = new THREE.Matrix4(); for (let i = 0; i < 60; i++) im.setColorAt(i, c.setHSL(Math.random(), 0.7, 0.55));
  const glow = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.02, 0.02, 0.3), new THREE.MeshStandardMaterial({ emissive: 0x3bff7a, emissiveIntensity: 5, color: 0 }), 60); glow.count = 0; scene.add(glow);
  let t = 0;
  return { set(n) { im.count = glow.count = Math.min(60, n); }, update(dt) { t += dt; for (let i = 0; i < im.count; i++) { const x = 3 + (i % 20) * 1.1 * (i < 20 ? 1 : 1), z = -10.5 - Math.floor(i / 20) * 1.2, y = Math.abs(Math.sin(t * 5 + i)) * 0.15; m.makeTranslation(i < 20 ? 2 + i * 1.05 : -2 - (i - 20) * 1.05 + (i >= 40 ? 0 : 0), y, i >= 40 ? -12 : -10.5); im.setMatrixAt(i, m); m.makeTranslation((i < 20 ? 2 + i * 1.05 : -2 - (i - 20) * 1.05) + 0.3, 2 + y, i >= 40 ? -12 : -10.5); glow.setMatrixAt(i, m); } im.instanceMatrix.needsUpdate = true; glow.instanceMatrix.needsUpdate = true; } };
}
