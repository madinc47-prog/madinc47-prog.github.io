// Shared outdoor world: real-elevation Dominica + ocean + physical sky + vegetation + OSM Roseau.
import * as THREE from '../../lib/three.module.min.js';
import { townGround, loadHeights, makeTerrain, makeOcean, makeSky, forest, palms, H } from './island.js';
import { loadOSM, prepTown, buildTown, neonSign } from './roseau.js';
import { Q } from '../core/quality.js';
let W = null;
export async function getWorld(renderer, progress = () => {}) {
  if (W) return W;
  progress('Loading Dominica elevation…'); await loadHeights();
  progress('Loading Roseau streets (OpenStreetMap)…'); await loadOSM(); prepTown();
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x8a5a5a, 0.00003);
  const sk = makeSky(scene, renderer, 2.5, 262);
  progress('Raising the mountains…'); const terrain = makeTerrain(); scene.add(terrain); scene.add(townGround());
  const ocean = makeOcean(sk.sun); scene.add(ocean);
  progress('Planting the rainforest…');
  const nT = Q.level >= 2 ? 16000 : Q.level === 1 ? 9000 : 4000;
  scene.add(forest(nT)); scene.add(palms(Q.level >= 1 ? 2600 : 1000, [0, 0]));
  progress('Building Roseau…'); const town = buildTown(scene);
  const hemi = new THREE.HemisphereLight(0xffc0a0, 0x304030, 1.1); scene.add(hemi);
  const sunL = new THREE.DirectionalLight(0xffa060, 2.2); sunL.position.copy(sk.sun).multiplyScalar(10000); scene.add(sunL);
  // Neon signs along the bayfront (Dame Mary Eugenia Charles Blvd) + hero club sign
  const signs = []; const bay = (W_bay());
  const names = [['BAYFRONT BAR', '#38e1ff'], ['ROTI SHOP', '#ffcf3b'], ['KUBULI', '#3bff7a'], ['CARNIVAL', '#ff3bd4'], ['FRESH FISH', '#3b9dff'], ['RUM SHOP', '#ff7a3b'], ['JAMS', '#c73bff']];
  bay.forEach(([x, z, nx, nz], i) => { const [t, c] = names[i % names.length]; const s = neonSign(t, c, 7, 1.8); s.position.set(x, Math.max(H(x, z) * 1.15, .4) + 4.3, z); s.lookAt(x + nx, s.position.y, z + nz); scene.add(s); signs.push(s); s.userData.delay = i * 0.25; });
  const club = CLUB(); const cs = neonSign('PSYCHO FINGERS LIVE', '#ff2bd6', 16, 4); cs.position.set(club.x, club.y + 9, club.z); cs.lookAt(club.x + club.nx, cs.position.y, club.z + club.nz); scene.add(cs); cs.userData.delay = 0; cs.userData.hero = true; signs.push(cs);
  const neonLights = []; [cs, ...signs.slice(0, 3)].forEach((s, i) => { const l = new THREE.PointLight(i ? 0x40d0ff : 0xff2bd6, 0, 40, 1.6); l.position.copy(s.position).add(new THREE.Vector3(club.nx * 2, -2, club.nz * 2)); scene.add(l); neonLights.push(l); s.userData.light = l; });
  let env = sk.envFromSky();
  W = { scene, sky: sk, terrain, ocean, town, signs, hemi, sunL, club, bay, envRT: env,
    setTime(dusk) { // dusk 1 = golden dusk, 0 = full night
      sk.set(dusk ? 2.5 : -9, 262); sk.sky.material.uniforms.rayleigh.value = dusk ? 2.6 : 0.6; sunL.intensity = dusk ? 2.2 : 0.05; hemi.intensity = dusk ? 1.1 : 0.35; hemi.color.set(dusk ? 0xffc0a0 : 0x5060a0);
      scene.fog.color.set(dusk ? 0x9a6058 : 0x0a0c1c); scene.fog.density = dusk ? 0.00003 : 0.0006; env.dispose(); env = sk.envFromSky(); renderer.toneMappingExposure = dusk ? 0.72 : 0.95;
      ocean.userData.water.material.uniforms.sunDirection.value.copy(sk.sun); town.userData.night(dusk ? 0.35 : 1);
    },
    signsOn(t) { signs.forEach(s => { const k = t - s.userData.delay; let v = k < 0 ? 0 : k < 0.6 ? (Math.random() < 0.5 ? 0 : 1) : 1; s.userData.mat.emissiveIntensity = v * (s.userData.hero ? 3.2 : 2.2); if (s.userData.light) s.userData.light.intensity = v * 60; }); },
    update(dt) { ocean.userData.update(dt); } };
  W.setTime(1);
  return W;
}
import { OSM } from './roseau.js';
let _bay;
function W_bay() { // points along the bayfront road, facing the sea (west)
  if (_bay) return _bay; const segs = OSM.r.filter(r => r[2] === 'Dame Mary Eugenia Charles Boulevard'); const out = [];
  segs.forEach(([p]) => { for (let i = 0; i < p.length - 1; i++) { const A = p[i], B = p[i + 1], L = Math.hypot(B[0] - A[0], B[1] - A[1]); for (let d = 10; d < L; d += 45) { const t = d / L, x = A[0] + (B[0] - A[0]) * t, z = A[1] + (B[1] - A[1]) * t; let nx = -(B[1] - A[1]) / L, nz = (B[0] - A[0]) / L; if (nx > 0) { nx = -nx; nz = -nz; } out.push([x - nx * 6.5, z - nz * 6.5, nx, nz]); } } });
  return _bay = out;
}
export function bayPath() { return W_bay(); }
export function CLUB() { const b = W_bay(); const m = b[Math.floor(b.length * 0.45)]; return { x: m[0] + m[2] * 1.5, z: m[1] + m[3] * 1.5, y: Math.max(H(m[0], m[1]) * 1.15, .4), nx: m[2], nz: m[3] }; }
