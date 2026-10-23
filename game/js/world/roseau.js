// Roseau from OpenStreetMap (© OpenStreetMap contributors, ODbL): real building footprints + streets,
// styled as Caribbean colonial: pastel plaster/wood, louvered shutters, fretwork balconies, galvanized tin hip roofs.
import * as THREE from '../../lib/three.module.min.js';
import { mergeGeometries } from '../../lib/a/BufferGeometryUtils.js';
import { H, tex, pbr, raiseTown } from './island.js';
import { Q } from '../core/quality.js';

export let OSM = null;
export async function loadOSM() { if (!OSM) OSM = await (await fetch('data/roseau.json')).json(); return OSM; }
export function prepTown() { const pts = []; OSM.b.forEach(([p]) => p.forEach(q => pts.push(q))); OSM.r.forEach(([p, t]) => { if (t !== 'footway' && t !== 'path' && t !== 'steps') p.forEach(q => pts.push(q)); }); raiseTown(pts); }
const gy = (x, z) => Math.max(H(x, z) * 1.15, 0.4);
const PASTEL = [0xf4d58d, 0x9fd8cb, 0xf2a7a0, 0xc9e4a6, 0xa9c8f0, 0xf6efe2, 0xf7c59f, 0xd5b8f0, 0xffffff, 0xe8e0b0, 0x8fd1e8, 0xf0b6c9];
const ROOF = [0x9aa3a8, 0xa8423a, 0x4c7a4e, 0xb9c0c4, 0x7d3a30, 0x3b6e8c];

function facadeTex() { // 3 m x 3.2 m storey tile: plaster, door/window with louvered shutters
  const c = document.createElement('canvas'); c.width = 256; c.height = 256; const g = c.getContext('2d');
  g.fillStyle = '#e9e4d8'; g.fillRect(0, 0, 256, 256); for (let i = 0; i < 1400; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.05})`; g.fillRect(Math.random() * 256, Math.random() * 256, 3, 3); }
  g.fillStyle = '#d8d0bf'; g.fillRect(0, 232, 256, 24); // string course
  // window frame
  g.fillStyle = '#f8f6f0'; g.fillRect(70, 40, 116, 170);
  g.fillStyle = '#2b5e48'; g.fillRect(78, 48, 48, 156); g.fillRect(130, 48, 48, 156); // shutters
  g.fillStyle = '#1b3e30'; for (let y = 52; y < 200; y += 7) { g.fillRect(80, y, 44, 3); g.fillRect(132, y, 44, 3); }
  return new THREE.CanvasTexture(c);
}
function windowGlow() { const c = document.createElement('canvas'); c.width = 256; c.height = 256; const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256); const gr = g.createLinearGradient(0, 48, 0, 204); gr.addColorStop(0, '#ffcf80'); gr.addColorStop(1, '#a8601c'); g.fillStyle = gr; g.globalAlpha = 0.9; for (let y = 52; y < 200; y += 7) { g.fillRect(80, y + 3, 44, 4); g.fillRect(132, y + 3, 44, 4); } return new THREE.CanvasTexture(c); }
function fretTex() { // gingerbread fretwork railing (alpha)
  const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d'); g.strokeStyle = '#fff'; g.fillStyle = '#fff';
  g.lineWidth = 8; g.strokeRect(4, 4, 248, 120); g.lineWidth = 5; for (let x = 16; x < 256; x += 24) { g.beginPath(); g.moveTo(x, 8); g.lineTo(x, 120); g.stroke(); }
  g.lineWidth = 4; for (let x = 4; x < 256; x += 48) { g.beginPath(); g.arc(x + 24, 8, 20, 0, Math.PI); g.stroke(); g.beginPath(); g.arc(x + 24, 64, 8, 0, 6.3); g.stroke(); }
  return new THREE.CanvasTexture(c);
}
export function neonTex(text, col, w = 1024, h = 256, font = 'bold 150px "Arial Black",Impact,sans-serif') {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  g.fillStyle = '#05010a'; g.fillRect(0, 0, w, h); g.font = font; let fs = 150; while (g.measureText(text).width > w * 0.9 && fs > 30) { fs -= 8; g.font = font.replace('150px', fs + 'px'); } g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = col; g.shadowBlur = 30; g.strokeStyle = col; g.lineWidth = 10; g.strokeText(text, w / 2, h / 2); g.fillStyle = '#fff'; g.shadowBlur = 12; g.fillText(text, w / 2, h / 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function area(p) { let a = 0; for (let i = 0; i < p.length - 1; i++) a += p[i][0] * p[i + 1][1] - p[i + 1][0] * p[i][1]; return a / 2; }

export function buildTown(scene) {
  const grp = new THREE.Group(); grp.name = 'roseau';
  const walls = [], roofs = [], balc = [], rails = [], posts = [];
  const col = new THREE.Color();
  const pushColor = (g, hex, jit = 0.06) => { col.set(hex); const n = g.attributes.position.count, a = new Float32Array(n * 3); const k = 1 - Math.random() * jit; for (let i = 0; i < n; i++) a.set([col.r * k, col.g * k, col.b * k], i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); };
  const maxB = Q.level >= 2 ? 99999 : Q.level === 1 ? 3200 : 1600;
  const list = OSM.b.map(b => [b, Math.hypot(b[0][0][0], b[0][0][1])]).sort((a, b) => a[1] - b[1]).slice(0, maxB);
  for (const [[p, lv], dist] of list) {
    if (p.length < 4) continue; let pts = p.slice(0, -1); const a = area(p); if (Math.abs(a) < 12) continue; if (a < 0) pts = pts.reverse();
    let cx = 0, cz = 0; pts.forEach(q => { cx += q[0]; cz += q[1]; }); cx /= pts.length; cz /= pts.length;
    const base = gy(cx, cz) - 1.2;
    const storeys = lv || (dist < 700 ? (Math.random() < 0.75 ? 2 : Math.random() < 0.5 ? 3 : 1) : (Math.random() < 0.6 ? 1 : 2));
    const hgt = storeys * 3.2 + 1.2;
    const shape = new THREE.Shape(pts.map(q => new THREE.Vector2(q[0], -q[1])));
    let g = new THREE.ExtrudeGeometry(shape, { depth: hgt, bevelEnabled: false, UVGenerator: WUV });
    g.rotateX(-Math.PI / 2); g.translate(0, base, 0);
    g = g.toNonIndexed(); // keep only sides (group 1); roofs are separate
    pushColor(g, PASTEL[(Math.abs(cx * 7 + cz * 13) | 0) % PASTEL.length]); walls.push(g);
    // hip roof: pyramid to centroid with 0.5 m overhang
    const top = base + hgt, rh = Math.min(3.5, Math.sqrt(Math.abs(a)) * 0.22), rp = [], rn = [], ruv = [];
    for (let i = 0; i < pts.length; i++) { const A = pts[i], B = pts[(i + 1) % pts.length]; const o = (q) => { const dx = q[0] - cx, dz = q[1] - cz, l = Math.hypot(dx, dz) || 1; return [q[0] + dx / l * 0.5, q[1] + dz / l * 0.5]; }; const a1 = o(A), b1 = o(B); rp.push(a1[0], top - 0.2, a1[1], cx, top + rh, cz, b1[0], top - 0.2, b1[1]); const L = Math.hypot(b1[0] - a1[0], b1[1] - a1[1]); ruv.push(0, 0, L / 2 / 2, rh / 2, L / 2, 0); }
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3)); rg.setAttribute('uv', new THREE.Float32BufferAttribute(ruv, 2)); rg.computeVertexNormals();
    pushColor(rg, ROOF[(Math.abs(cx * 3 + cz) | 0) % ROOF.length], 0.15); roofs.push(rg);
    // fretwork balcony on longest edge for 2+ storeys near downtown
    if (storeys >= 2 && dist < 900) {
      let best = 0, bi = 0; for (let i = 0; i < pts.length; i++) { const A = pts[i], B = pts[(i + 1) % pts.length], L = Math.hypot(B[0] - A[0], B[1] - A[1]); if (L > best) { best = L; bi = i; } }
      if (best > 4) {
        const A = pts[bi], B = pts[(bi + 1) % pts.length], dx = (B[0] - A[0]) / best, dz = (B[1] - A[1]) / best; let nx = dz, nz = -dx; if ((A[0] + B[0]) / 2 + nx - cx < (A[0] + B[0]) / 2 - cx && false) { }
        if (((A[0] + B[0]) / 2 + nx - cx) ** 2 + ((A[1] + B[1]) / 2 + nz - cz) ** 2 < ((A[0] + B[0]) / 2 - cx) ** 2 + ((A[1] + B[1]) / 2 - cz) ** 2) { nx = -nx; nz = -nz; }
        const L = best * 0.86, mx = (A[0] + B[0]) / 2 + nx * 0.75, mz = (A[1] + B[1]) / 2 + nz * 0.75, ang = Math.atan2(-dz, dx), y = base + 1.2 + 3.2;
        const slab = new THREE.BoxGeometry(L, 0.18, 1.5); slab.rotateY(ang); slab.translate(mx, y, mz); const s2 = slab.toNonIndexed(); s2.deleteAttribute('uv'); pushColor(s2, 0xf2efe6); balc.push(s2);
        const rail = new THREE.PlaneGeometry(L, 1.05); rail.rotateY(ang); rail.translate(mx + nx * 0.72, y + 0.6, mz + nz * 0.72); rails.push(rail);
        const roofB = new THREE.BoxGeometry(L, 0.08, 1.7); roofB.rotateY(ang); roofB.translate(mx, y + 3.0, mz); const r2 = roofB.toNonIndexed(); r2.deleteAttribute('uv'); pushColor(r2, 0x9aa3a8); balc.push(r2);
        for (let k = 0; k <= Math.floor(L / 2.5); k++) { const t = -L / 2 + k * (L / Math.floor(L / 2.5 || 1)); const po = new THREE.BoxGeometry(0.14, 3, 0.14); po.translate(mx + dx * t + nx * 0.7, y + 1.5, mz + dz * t + nz * 0.7); const p2 = po.toNonIndexed(); p2.deleteAttribute('uv'); pushColor(p2, 0xffffff); posts.push(p2); }
      }
    }
  }
  const fac = facadeTex(); fac.wrapS = fac.wrapT = THREE.RepeatWrapping; fac.colorSpace = THREE.SRGBColorSpace; fac.repeat.set(1 / 3, 1 / 3.2);
  const glow = windowGlow(); glow.wrapS = glow.wrapT = THREE.RepeatWrapping; glow.repeat.copy(fac.repeat); glow.colorSpace = THREE.SRGBColorSpace;
  const plN = tex('plaster_N', 1); plN.repeat.set(1 / 3, 1 / 3.2);
  const wallMat = new THREE.MeshStandardMaterial({ map: fac, vertexColors: true, roughness: 0.85, normalMap: plN, emissive: 0xffffff, emissiveMap: glow, emissiveIntensity: 0 });
  const tin = pbr('tin', 1, { vertexColors: true, metalness: 0.7, roughness: 0.45 });
  const wg = mergeGeometries(walls.map(g => { ['uv'].forEach(() => {}); return g; }).filter(g => g.attributes.uv)); 
  const W = new THREE.Mesh(wg, wallMat); W.name = 'walls';
  const R = new THREE.Mesh(mergeGeometries(roofs), tin); R.name = 'roofs';
  grp.add(W, R);
  if (balc.length) grp.add(new THREE.Mesh(mergeGeometries([...balc, ...posts]), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 })));
  if (rails.length) { const ft = fretTex(); const rm = new THREE.MeshStandardMaterial({ map: ft, alphaTest: 0.5, side: THREE.DoubleSide, color: 0xffffff, roughness: 0.6 }); ft.wrapS = THREE.RepeatWrapping; grp.add(new THREE.Mesh(mergeGeometries(rails), rm)); }
  grp.userData.night = (k) => { wallMat.emissiveIntensity = k * 1.1; };
  // ---- streets (wet asphalt) ----
  const roads = [], lamps = [];
  const WID = { primary: 9, secondary: 8, tertiary: 7, unclassified: 6, residential: 5.5, service: 4, living_street: 4.5, pedestrian: 5 };
  for (const [p, t] of OSM.r) {
    const w = WID[t]; if (!w || p.length < 2) continue;
    const pos = [], uv = []; let run = 0;
    const dense = []; for (let i = 0; i < p.length - 1; i++) { const A = p[i], B = p[i + 1], L = Math.hypot(B[0] - A[0], B[1] - A[1]), n = Math.max(1, Math.ceil(L / 12)); for (let k = 0; k < n; k++) dense.push([A[0] + (B[0] - A[0]) * k / n, A[1] + (B[1] - A[1]) * k / n]); } dense.push(p[p.length - 1]);
    for (let i = 0; i < dense.length - 1; i++) {
      const A = dense[i], B = dense[i + 1], L = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1, nx = -(B[1] - A[1]) / L * w / 2, nz = (B[0] - A[0]) / L * w / 2;
      const ya = gy(A[0], A[1]) + 0.12, yb = gy(B[0], B[1]) + 0.12;
      pos.push(A[0] + nx, ya, A[1] + nz, A[0] - nx, ya, A[1] - nz, B[0] + nx, yb, B[1] + nz, B[0] - nx, yb, B[1] - nz, B[0] + nx, yb, B[1] + nz, A[0] - nx, ya, A[1] - nz);
      const r1 = run / 6; run += L; const r2 = run / 6; uv.push(0, r1, w / 6, r1, 0, r2, w / 6, r2, 0, r2, w / 6, r1);
      if ((t === 'primary' || t === 'secondary' || t === 'tertiary') && i % 3 === 0) lamps.push([A[0] + nx * 1.15, ya, A[1] + nz * 1.15]);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals(); roads.push(g);
  }
  const asphalt = pbr('asphalt', 1, { roughness: 0.32, metalness: 0.0, color: 0x6a6a70, envMapIntensity: 1.4, polygonOffset: true, polygonOffsetFactor: -2 });
  asphalt.roughnessMap = null; // wet look
  const RD = new THREE.Mesh(mergeGeometries(roads), asphalt); RD.name = 'roads'; grp.add(RD);
  // street lamps (instanced) with emissive heads
  const pole = new THREE.CylinderGeometry(0.08, 0.12, 6, 5); pole.translate(0, 3, 0);
  const head = new THREE.SphereGeometry(0.35, 8, 6); head.translate(0, 6.1, 0);
  const pm = new THREE.InstancedMesh(pole, new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.6, roughness: 0.4 }), lamps.length);
  const hm = new THREE.InstancedMesh(head, new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffb760, emissiveIntensity: 0 }), lamps.length);
  const M = new THREE.Matrix4(); lamps.forEach((l, i) => { M.makeTranslation(...l); pm.setMatrixAt(i, M); hm.setMatrixAt(i, M); });
  grp.add(pm, hm); const nightL = grp.userData.night; grp.userData.night = k => { nightL(k); hm.material.emissiveIntensity = 2.2 * k; };
  grp.userData.lamps = lamps;
  scene.add(grp); return grp;
}
// UV generator: like WorldUVGenerator but for side walls uses horizontal distance along the wall
const WUV = {
  generateTopUV(g, v, a, b, c) { return [new THREE.Vector2(v[a * 3], v[a * 3 + 1]), new THREE.Vector2(v[b * 3], v[b * 3 + 1]), new THREE.Vector2(v[c * 3], v[c * 3 + 1])]; },
  generateSideWallUV(g, v, a, b, c, d) { const ax = v[a * 3], ay = v[a * 3 + 1], az = v[a * 3 + 2], bx = v[b * 3], by = v[b * 3 + 1], bz = v[b * 3 + 2], cz = v[c * 3 + 2], dz = v[d * 3 + 2]; const s = ax * 0.7 + ay * 0.7; const L = Math.hypot(bx - ax, by - ay); const u0 = Math.round(s / 3) * 3; return [new THREE.Vector2(u0, az), new THREE.Vector2(u0 + L, bz), new THREE.Vector2(u0 + L, cz), new THREE.Vector2(u0, dz)]; }
};
// Neon sign board
export function neonSign(text, col, w, h) { const t = neonTex(text, col); const m = new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0, color: 0x111111 }); const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); mesh.userData.mat = m; return mesh; }
