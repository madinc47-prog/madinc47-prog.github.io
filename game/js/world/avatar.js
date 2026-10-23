// Procedural stylised avatar (PBR). Future: swap for rigged glTF (CC0 Quaternius) without changing callers.
import * as THREE from '../../lib/three.module.min.js';
export const SKINS = ['#f1c9a5', '#d9a06f', '#a86b40', '#7a4a2a', '#4a2c1a'];
export const HAIRS = ['Fade', 'Afro', 'Locs', 'Braids', 'Bald'];
export const TOPS = ['#ff2bd6', '#2b8bff', '#ffcf3b', '#18d26e', '#ffffff', '#111111'];
export const CHAINS = ['None', 'Gold', 'Silver', 'Iced'];
export const ROLES = { artist: { name: 'The Artist', prop: 'mic', top: 0 }, dj: { name: 'The DJ', prop: 'decks', top: 1 }, fan: { name: 'The Fan', prop: 'glow', top: 2 } };
const std = (c, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.6, envMapIntensity: 0.35 }, o));
export function makeAvatar(o = {}) {
  o = Object.assign({ skin: 2, hair: 0, top: 0, chain: 1, prop: 'mic' }, o);
  const g = new THREE.Group(), skin = std(SKINS[o.skin], { roughness: 0.5 }), top = std(TOPS[o.top], { roughness: 0.45, sheen: 1 }), pants = std('#1d2233', { roughness: 0.8 }), shoe = std('#f4f4f4', { roughness: 0.4 });
  const cap = (r, l, m, x, y, z, rz = 0) => { const k = new THREE.Mesh(new THREE.CapsuleGeometry(r, l, 6, 12), m); k.position.set(x, y, z); k.rotation.z = rz; g.add(k); return k; };
  cap(0.11, 0.7, pants, -0.13, 0.5, 0); cap(0.11, 0.7, pants, 0.13, 0.5, 0);
  const s1 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.34), shoe); s1.position.set(-0.13, 0.05, 0.05); g.add(s1); const s2 = s1.clone(); s2.position.x = 0.13; g.add(s2);
  const torso = cap(0.25, 0.45, top, 0, 1.25, 0); torso.scale.set(1.1, 1, 0.75);
  const armL = cap(0.08, 0.55, top, -0.38, 1.2, 0, 0.18), armR = cap(0.08, 0.55, top, 0.38, 1.2, 0, -0.18);
  const handR = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 10), skin); handR.position.set(0.46, 0.88, 0.05); g.add(handR); const handL = handR.clone(); handL.position.x = -0.46; g.add(handL);
  const neck = cap(0.07, 0.1, skin, 0, 1.62, 0);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 24, 18), skin); head.scale.set(0.92, 1.1, 1); head.position.y = 1.83; g.add(head);
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), std('#111', { roughness: 0.1 })); eye.position.set(-0.06, 1.86, 0.15); g.add(eye); const e2 = eye.clone(); e2.position.x = 0.06; g.add(e2);
  const hm = std('#140d08', { roughness: 0.9 });
  if (o.hair === 0) { const h = new THREE.Mesh(new THREE.SphereGeometry(0.175, 20, 12, 0, 6.29, 0, 1.3), hm); h.position.y = 1.86; g.add(h); }
  if (o.hair === 1) { const h = new THREE.Mesh(new THREE.IcosahedronGeometry(0.25, 3), hm); h.position.set(0, 2.0, -0.1); g.add(h); }
  if (o.hair === 2) for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 1.6 + Math.PI * 0.7; const l = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.42, 3, 6), hm); l.position.set(Math.cos(a) * 0.16, 1.78, Math.sin(a) * 0.16 - 0.02); g.add(l); }
  if (o.hair === 3) for (let i = 0; i < 6; i++) { const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.025, 0.3, 3, 6), hm); b.rotation.x = Math.PI / 2; b.position.set(-0.1 + i * 0.04, 1.97, -0.02); g.add(b); }
  if (o.chain > 0) { const cm = std(['', '#ffcc33', '#d8dde2', '#e8f6ff'][o.chain], { metalness: 1, roughness: o.chain === 3 ? 0.05 : 0.2, emissive: o.chain === 3 ? '#4060a0' : '#000', emissiveIntensity: 0.4 }); const ch = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.018, 8, 32), cm); ch.rotation.x = Math.PI / 2.4; ch.position.set(0, 1.5, 0.06); g.add(ch); const pd = new THREE.Mesh(new THREE.OctahedronGeometry(0.05), cm); pd.position.set(0, 1.38, 0.2); g.add(pd); }
  if (o.prop === 'mic') { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.2, 10), std('#222', { metalness: .8, roughness: .3 })); m.position.set(0.46, 1.02, 0.1); g.add(m); const b = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), std('#888', { metalness: 1, roughness: .35 })); b.position.set(0.46, 1.14, 0.1); g.add(b); armR.rotation.z = -0.9; armR.position.set(0.42, 1.25, 0.1); handR.position.set(0.46, 1.0, 0.1); }
  if (o.prop === 'decks') { const d = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.12, 0.5), std('#151515', { metalness: .5, roughness: .3 })); d.position.set(0, 0.95, 0.45); g.add(d); for (const x of [-0.3, 0.3]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.03, 32), std('#222', { emissive: '#2b8bff', emissiveIntensity: 1.2 })); p.position.set(x, 1.02, 0.45); g.add(p); } const st = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.9, 0.5), std('#0a0a0a', { metalness: .3 })); st.position.set(0, 0.45, 0.45); g.add(st); }
  if (o.prop === 'glow') { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.35, 8), std('#3bff7a', { emissive: '#3bff7a', emissiveIntensity: 5 })); s.position.set(0.5, 1.9, 0.05); g.add(s); armR.rotation.z = -2.6; armR.position.set(0.45, 1.6, 0); handR.position.set(0.5, 1.75, 0.05); }
  g.userData.opts = o; return g;
}
