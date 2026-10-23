import * as THREE from '../../lib/three.module.min.js';
import { Water } from '../../lib/a/Water.js';
import { Sky } from '../../lib/a/Sky.js';
import { mergeGeometries } from '../../lib/a/BufferGeometryUtils.js';
import { T0, T1 } from './geo.js';
import { Q } from '../core/quality.js';

export const tl = new THREE.TextureLoader();
export function tex(name, rep = 1, srgb = false) { const t = tl.load('tex/' + name + '.jpg'); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
export function pbr(name, rep, o = {}) { return new THREE.MeshStandardMaterial(Object.assign({ map: tex(name + '_C', rep, true), normalMap: tex(name + '_N', rep), roughnessMap: tex(name + '_R', rep) }, o)); }

// ---- Heightfield (real elevation, AWS Terrain Tiles / SRTM-derived) ----
export const HF = { w: 0, h: 0, d: null };
export async function loadHeights() {
  if (HF.d) return HF;
  const img = new Image(); img.src = 'data/dominica_h.png'; await img.decode();
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
  const px = g.getImageData(0, 0, c.width, c.height).data; const d = new Float32Array(c.width * c.height);
  for (let i = 0; i < d.length; i++) { const v = px[i * 4] * 256 + px[i * 4 + 1] - 100; d[i] = v <= -99 ? -60 : v; }
  Object.assign(HF, { w: c.width, h: c.height, d });
  return HF;
}
export function H(x, z) { // bilinear sample, meters
  const u = (x - T0[0]) / (T1[0] - T0[0]) * (HF.w - 1), v = (z - T0[1]) / (T1[1] - T0[1]) * (HF.h - 1);
  if (u < 0 || v < 0 || u > HF.w - 1 || v > HF.h - 1) return -60;
  const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j, w = HF.w, d = HF.d;
  const a = d[j * w + i], b = d[j * w + Math.min(i + 1, w - 1)], c = d[Math.min(j + 1, HF.h - 1) * w + i], e = d[Math.min(j + 1, HF.h - 1) * w + Math.min(i + 1, w - 1)];
  return (a * (1 - fu) + b * fu) * (1 - fv) + (c * (1 - fu) + e * fu) * fv;
}
// Raise coastal cells under the town so OSM buildings never stand in the sea (57 m DEM is coarse).
export function raiseTown(points) {
  const w = HF.w, h = HF.h;
  for (const [x, z] of points) {
    const u = Math.round((x - T0[0]) / (T1[0] - T0[0]) * (w - 1)), v = Math.round((z - T0[1]) / (T1[1] - T0[1]) * (h - 1));
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const k = (v + dj) * w + u + di; if (k >= 0 && k < HF.d.length && HF.d[k] < 2.2) HF.d[k] = 2.2; }
  }
}

export function makeTerrain() {
  const segX = Q.level >= 2 ? 384 : Q.level === 1 ? 256 : 160; const segZ = Math.round(segX * HF.h / HF.w);
  const W = T1[0] - T0[0], D = T1[1] - T0[1];
  const geo = new THREE.PlaneGeometry(W, D, segX, segZ); geo.rotateX(-Math.PI / 2); geo.translate(T0[0] + W / 2, 0, T0[1] + D / 2);
  const p = geo.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color();
  const forest = new THREE.Color(0x3d7a2c), forest2 = new THREE.Color(0x5e9a3a), sand = new THREE.Color(0xb59a6a), rock = new THREE.Color(0x5b5a4c), sea = new THREE.Color(0x29424a), cloud = new THREE.Color(0x4a6a46);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i); let y = H(x, z) * 1.15; const dT = Math.hypot(x - 150, z + 100); p.setY(i, dT < 1150 ? y - 3 : y);
    const s = Math.abs(H(x + 40, z) - H(x - 40, z)) + Math.abs(H(x, z + 40) - H(x, z - 40)); // slope
    if (y < 0) c.copy(sea); else if (y < 6) c.copy(sand).lerp(forest2, y / 6);
    else { c.copy(forest).lerp(forest2, (Math.sin(x * 0.003) * Math.cos(z * 0.004) + 1) / 2 * 0.7); if (s > 70) c.lerp(rock, Math.min(1, (s - 70) / 80)); if (y > 1100) c.lerp(cloud, Math.min(1, (y - 1100) / 300)); }
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.computeVertexNormals();
  const can = canopyTex(); can.repeat.set(W / 160, D / 160);
  const gn = tex('grass_N', 1); gn.repeat.set(W / 160, D / 160);
  const m = new THREE.MeshStandardMaterial({ map: can, normalMap: gn, vertexColors: true, roughness: 0.95 }); m.normalScale.set(1.4, 1.4);
  const mesh = new THREE.Mesh(geo, m); mesh.receiveShadow = true; mesh.name = 'terrain';
  return mesh;
}

function canopyTex() { // rainforest canopy seen from above: overlapping crowns
  const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d'); g.fillStyle = '#5a6a4a'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 2600; i++) { const x = Math.random() * 512, y = Math.random() * 512, r = 6 + Math.random() * 18, l = 25 + Math.random() * 40, hcol = 80 + Math.random() * 50;
    for (const [ox, oy] of [[0, 0], [512, 0], [-512, 0], [0, 512], [0, -512]]) { const gr = g.createRadialGradient(x + ox - r * .3, y + oy - r * .3, 1, x + ox, y + oy, r); gr.addColorStop(0, `hsl(${hcol},55%,${l + 18}%)`); gr.addColorStop(1, `hsl(${hcol},60%,${l * .45}%)`); g.fillStyle = gr; g.beginPath(); g.arc(x + ox, y + oy, r, 0, 6.3); g.fill(); } }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
export function makeOcean(sunDir) {
  const g = new THREE.PlaneGeometry(160000, 160000);
  const wn = tl.load('tex/waternormals.jpg', t => { t.wrapS = t.wrapT = THREE.RepeatWrapping; });
  const water = new Water(g, { textureWidth: Q.level >= 2 ? 512 : 256, textureHeight: Q.level >= 2 ? 512 : 256, waterNormals: wn, sunDirection: sunDir.clone(), sunColor: 0xb07850, waterColor: 0x0b2a3a, distortionScale: 3.2, fog: true });
  water.rotation.x = -Math.PI / 2; water.position.y = 0.0;
  // cheap fallback for low quality
  const cheap = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x0c2c3c, roughness: 0.08, metalness: 0.2 })); cheap.rotation.x = -Math.PI / 2;
  const grp = new THREE.Group(); grp.add(water, cheap);
  grp.userData.update = (dt) => { water.material.uniforms.time.value += dt * 0.6; const hi = Q.level >= 1 && Q.water; water.visible = hi; cheap.visible = !hi; };
  grp.userData.water = water;
  return grp;
}

export function makeSky(scene, renderer, elevDeg = 2.5, azDeg = 250) {
  const sky = new Sky(); sky.scale.setScalar(140000);
  const u = sky.material.uniforms; u.turbidity.value = 12; u.rayleigh.value = 3; u.mieCoefficient.value = 0.008; u.mieDirectionalG.value = 0.86;
  const sun = new THREE.Vector3();
  const set = (e, a) => { sun.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - e), THREE.MathUtils.degToRad(a)); u.sunPosition.value.copy(sun); };
  set(elevDeg, azDeg);
  scene.add(sky);
  const pm = new THREE.PMREMGenerator(renderer);
  const envFromSky = () => { const s = new THREE.Scene(); const sk = new Sky(); sk.scale.setScalar(1000); Object.keys(u).forEach(k => sk.material.uniforms[k].value = u[k].value); s.add(sk); const rt = pm.fromScene(s); scene.environment = rt.texture; return rt; };
  return { sky, sun, set, envFromSky };
}

// ---- Vegetation: instanced rainforest trees + coconut palms (procedural low-poly, vertex-coloured) ----
function colorGeo(g, hex) { const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const k = 0.85 + Math.random() * 0.3; a.set([c.r * k, c.g * k, c.b * k], i * 3); } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g.toNonIndexed ? (g.index ? g.toNonIndexed() : g) : g; }
function strip(g) { g = g.index ? g.toNonIndexed() : g; ['uv', 'uv1', 'uv2'].forEach(k => g.deleteAttribute(k)); return g; }
export function treeGeo() {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.25, 0.45, 6, 5); trunk.translate(0, 3, 0); parts.push(colorGeo(strip(trunk), 0x4a3524));
  [[0, 7, 0, 3.2], [1.6, 6.2, 0.6, 2.4], [-1.4, 6.4, -0.8, 2.5], [0.3, 8.6, -0.5, 2.2]].forEach(([x, y, z, r], i) => { const s = new THREE.IcosahedronGeometry(r, 1); s.translate(x, y, z); parts.push(colorGeo(strip(s), [0x2f6b22, 0x3a7a28, 0x275a1c, 0x44852e][i])); });
  return mergeGeometries(parts);
}
export function palmGeo() {
  const parts = [], segs = 6;
  for (let i = 0; i < segs; i++) { const c = new THREE.CylinderGeometry(0.17, 0.22, 1.6, 6); c.translate(Math.pow(i / segs, 2) * 1.2, 0.8 + i * 1.55, 0); parts.push(colorGeo(strip(c), 0x7a6248)); }
  const top = [1.2, 9.4, 0];
  for (let f = 0; f < 9; f++) {
    const fr = new THREE.PlaneGeometry(4.2, 0.9, 6, 1); const p = fr.attributes.position;
    for (let k = 0; k < p.count; k++) { const x = p.getX(k) + 2.1; p.setX(k, x); p.setY(k, -0.09 * x * x + 0.35 * x); p.setZ(k, p.getY(k) * 0 + (p.getZ(k))); }
    fr.rotateX(-Math.PI / 2 * 0.15); fr.rotateY(f / 9 * Math.PI * 2); fr.translate(...top); parts.push(colorGeo(strip(fr), f % 2 ? 0x3f7a2a : 0x4f8f30));
  }
  const nut = new THREE.IcosahedronGeometry(0.5, 0); nut.translate(top[0], top[1] - 0.3, 0); parts.push(colorGeo(strip(nut), 0x5a4a20));
  return mergeGeometries(parts);
}
export function scatter(geo, count, accept, scaleR = [0.8, 1.4], tint) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });
  const im = new THREE.InstancedMesh(geo, mat, count); const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  let n = 0, tries = 0;
  while (n < count && tries < count * 30) { tries++; const r = accept(); if (!r) continue; const [x, y, z, sc] = r; const k = (scaleR[0] + Math.random() * (scaleR[1] - scaleR[0])) * (sc || 1); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * 6.28); m.compose(p.set(x, y - 0.3, z), q, s.set(k, k * (0.9 + Math.random() * 0.3), k)); im.setMatrixAt(n++, m); }
  im.count = n; im.instanceMatrix.needsUpdate = true; im.castShadow = false; im.frustumCulled = false; return im;
}
export function forest(count) { // rainforest canopy over the whole island, bigger scale far from town (reads from the air)
  return scatter(treeGeo(), count, () => {
    const x = T0[0] + Math.random() * (T1[0] - T0[0]), z = T0[1] + Math.random() * (T1[1] - T0[1]); const y = H(x, z);
    if (y < 8 || y > 1250) return null; const d = Math.hypot(x, z); if (d < 900) return null;
    return [x, y * 1.15, z, d < 3000 ? 1.4 : 3.2];
  }, [0.8, 1.5]);
}
export function palms(count, near) { // coconut palms along the coast (0.5..18 m) with a dense band around Roseau bayfront
  return scatter(palmGeo(), count, () => {
    let x, z; if (Math.random() < 0.55) { x = near[0] + (Math.random() - 0.5) * 3000; z = near[1] + (Math.random() - 0.5) * 3000; } else { x = T0[0] + Math.random() * (T1[0] - T0[0]); z = T0[1] + Math.random() * (T1[1] - T0[1]); }
    const y = H(x, z); if (y < 1.5 || y > 22) return null; return [x, y * 1.15, z, 1];
  }, [0.8, 1.25]);
}

// Fine town ground (10 m grid) so streets/buildings sit exactly on it; dusty urban plaster/grass mix.
export function townGround(cx = 150, cz = -100, size = 2200, seg = 220) {
  const geo = new THREE.PlaneGeometry(size, size, seg, seg); geo.rotateX(-Math.PI / 2); geo.translate(cx, 0, cz);
  const p = geo.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color(), urban = new THREE.Color(0x8a8478), green = new THREE.Color(0x5a7a3a);
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), h = H(x, z) * 1.15; const edge = Math.max(Math.abs(x - cx), Math.abs(z - cz)) / (size / 2); p.setY(i, Math.max(h, 0.4) - (edge > 0.92 ? (edge - 0.92) * 60 : 0)); c.copy(urban).lerp(green, Math.min(1, Math.max(0, (h - 25) / 60) + (Math.sin(x * .05) * Math.cos(z * .04) > .6 ? .5 : 0))); col.set([c.r, c.g, c.b], i * 3); }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.computeVertexNormals();
  const m = pbr('concrete', size / 8, { vertexColors: true, roughness: 0.75, color: 0xbbbbbb });
  const mesh = new THREE.Mesh(geo, m); mesh.name = 'townGround'; return mesh;
}
