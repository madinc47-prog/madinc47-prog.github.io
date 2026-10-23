import * as THREE from '../../lib/three.module.min.js';
import { ease } from './ui.js';
// Cinematic camera move along Catmull-Rom splines for position and look target, eased.
export function camPath(cam, pts, looks, dur, { easeFn = ease, fovs } = {}) {
  const P = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p)), false, 'centripetal');
  const L = new THREE.CatmullRomCurve3(looks.map(p => new THREE.Vector3(...p)), false, 'centripetal');
  let t = 0, done = false, res; const pr = new Promise(r => res = r); const tmp = new THREE.Vector3();
  return { promise: pr, get done() { return done; }, update(dt) { if (done) return; t = Math.min(1, t + dt / dur); const e = easeFn(t); cam.position.copy(P.getPoint(e)); cam.lookAt(L.getPoint(e)); if (fovs) { cam.fov = fovs[0] + (fovs[1] - fovs[0]) * e; cam.updateProjectionMatrix(); } if (t >= 1) { done = true; res(); } }, skip() { t = 1; this.update(0); } };
}
