import * as THREE from '../../lib/three.module.min.js';
export function makeCar(color = 0xb0102a) {
  const g = new THREE.Group();
  const paint = new THREE.MeshPhysicalMaterial({ color, metalness: 0.6, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.05 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x0a0f18, metalness: 0.2, roughness: 0.05, transparent: true, opacity: 0.85 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.6, 4.4), paint); body.position.y = 0.65; g.add(body);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.2), glass); cab.position.set(0, 1.2, -0.2); g.add(cab);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.08, 1.9), paint); roof.position.set(0, 1.5, -0.25); g.add(roof);
  const tire = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 }), rim = new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 1, roughness: 0.2 });
  g.userData.wheels = [];
  [[-0.95, 1.4], [0.95, 1.4], [-0.95, -1.4], [0.95, -1.4]].forEach(([x, z]) => { const w = new THREE.Group(); const t = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.28, 18), tire); t.rotation.z = Math.PI / 2; const r = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.3, 10), rim); r.rotation.z = Math.PI / 2; w.add(t, r); w.position.set(x, 0.36, z); g.add(w); g.userData.wheels.push(w); });
  const hl = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4d0, emissiveIntensity: 6 }), tl = new THREE.MeshStandardMaterial({ color: 0x300000, emissive: 0xff1020, emissiveIntensity: 4 });
  [-0.65, 0.65].forEach(x => { const h = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.14, 0.05), hl); h.position.set(x, 0.75, 2.21); g.add(h); const t = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.12, 0.05), tl); t.position.set(x, 0.8, -2.21); g.add(t); });
  const beam = new THREE.SpotLight(0xfff0d0, 400, 70, 0.45, 0.5, 1.6); beam.position.set(0, 0.8, 2.3); beam.target.position.set(0, 0, 14); g.add(beam, beam.target);
  const under = new THREE.PointLight(0xff2bd6, 6, 5, 2); under.position.set(0, 0.15, 0); g.add(under); // neon underglow
  return g;
}
export function makeWarehouse() {
  const g = new THREE.Group();
  return g;
}
