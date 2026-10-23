// Scene 2 — Choose your role: club interior, glossy reflective floor, three spotlit avatars, customization.
import * as THREE from '../../lib/three.module.min.js';
import { Reflector } from '../../lib/a/Reflector.js';
import { RGBELoader } from '../../lib/a/RGBELoader.js';
import { makeAvatar, ROLES, SKINS, HAIRS, TOPS, CHAINS } from '../world/avatar.js';
import { say, startBeat, stopBeat, emptyPattern, drum, A } from '../core/audio.js';
import { neonSign } from '../world/roseau.js';
import { pbr } from '../world/island.js';
import { el, sub, hud, sleep, toast } from '../core/ui.js';
import { Q } from '../core/quality.js';
export async function clubRoom(scene, renderer) {
  const pm = new THREE.PMREMGenerator(renderer);
  try { const hdr = await new RGBELoader().loadAsync('dusk.hdr'); scene.environment = pm.fromEquirectangular(hdr).texture; scene.userData.envDim = true; hdr.dispose(); } catch (e) {}
  scene.background = new THREE.Color(0x020106); scene.fog = new THREE.Fog(0x05020a, 12, 34);
  const conc = pbr('concrete', 3, { color: 0x2a2630, roughness: 0.9, envMapIntensity: 0.25 });
  const room = new THREE.Mesh(new THREE.BoxGeometry(26, 8, 20), conc); room.material.side = THREE.BackSide; room.position.y = 4; scene.add(room);
  // glossy floor: real planar reflection (Reflector) under a semi-transparent dark lacquer
  const floorG = new THREE.PlaneGeometry(26, 20);
  const refl = new Reflector(floorG, { textureWidth: 1024 * (Q.level >= 2 ? 1 : 0.5), textureHeight: 1024 * (Q.level >= 2 ? 1 : 0.5), color: 0x777777 }); refl.rotation.x = -Math.PI / 2; refl.position.y = 0; scene.add(refl);
  const lac = new THREE.Mesh(floorG, new THREE.MeshStandardMaterial({ color: 0x08060c, roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.55 })); lac.rotation.x = -Math.PI / 2; lac.position.y = 0.01; scene.add(lac);
  const lacSolid = new THREE.Mesh(floorG, new THREE.MeshStandardMaterial({ color: 0x0a080e, roughness: 0.12, metalness: 0.4 })); lacSolid.rotation.x = -Math.PI / 2; lacSolid.position.y = 0.012; scene.add(lacSolid);
  const upd = () => { refl.visible = Q.reflect; lac.visible = Q.reflect; lacSolid.visible = !Q.reflect; }; upd();
  // neon strips + sign
  const cols = [0xff2bd6, 0x2b8bff, 0x38e1ff, 0xff2bd6];
  [[-12.9, 0, Math.PI / 2], [12.9, 0, -Math.PI / 2]].forEach(([x, z, r], i) => { for (let k = 0; k < 3; k++) { const s = new THREE.Mesh(new THREE.BoxGeometry(18, 0.08, 0.08), new THREE.MeshStandardMaterial({ color: 0, emissive: cols[(i + k) % 4], emissiveIntensity: 2 })); s.position.set(x, 1.5 + k * 2, z); s.rotation.y = r; scene.add(s); } });
  const sg = neonSign('PSYCHO FINGERS LIVE', '#ff2bd6', 9, 2.25); sg.position.set(0, 5.4, -9.9); sg.userData.mat.emissiveIntensity = 1.3; scene.add(sg);
  const stage = new THREE.Mesh(new THREE.CylinderGeometry(6.5, 6.8, 0.4, 48), new THREE.MeshStandardMaterial({ color: 0x111018, metalness: 0.6, roughness: 0.25, envMapIntensity: 0.3 })); stage.position.set(0, 0.2, -4); scene.add(stage);
  const edge = new THREE.Mesh(new THREE.TorusGeometry(6.6, 0.04, 8, 96), new THREE.MeshStandardMaterial({ emissive: 0x38e1ff, emissiveIntensity: 1.6, color: 0 })); edge.rotation.x = Math.PI / 2; edge.position.set(0, 0.41, -4); scene.add(edge);
  scene.add(new THREE.HemisphereLight(0x6040a0, 0x100010, 0.35));
  const moving = []; [0xff2bd6, 0x2b8bff].forEach((c, i) => { const l = new THREE.SpotLight(c, 80, 30, 0.35, 0.6, 1.5); l.position.set(i ? 8 : -8, 7.5, 3); l.target.position.set(0, 0, -4); scene.add(l, l.target); moving.push(l); });
  return { refl, upd, moving, edge };
}
export async function create(G) {
  const scene = new THREE.Scene(); const cam = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
  const room = await clubRoom(scene, G.renderer); G.renderer.toneMappingExposure = 0.5;
  const keys = ['artist', 'dj', 'fan'], avs = {}, spots = {};
  const save = G.save; let opts = Object.assign({ skin: 2, hair: 0, top: 0, chain: 1 }, save.look || {});
  keys.forEach((k, i) => { const a = makeAvatar({ prop: ROLES[k].prop, top: ROLES[k].top, skin: [2, 3, 1][i], hair: [3, 0, 1][i], chain: [1, 2, 0][i] }); a.position.set((i - 1) * 3.2, 0.4, -4); a.userData.role = k; scene.add(a); avs[k] = a;
    const s = new THREE.SpotLight(0xfff1dd, 0, 14, 0.28, 0.5, 1.2); s.position.set((i - 1) * 3.2, 7.6, -1.5); s.target = a; scene.add(s); spots[k] = s; });
  let chosen = save.role || null, orbit = 0.4, drag = null, t = 0, layers = 0, alive = true;
  const pattern = emptyPattern(); const LAYERS = [[0, [0, 4, 8, 12]], [3, [2, 6, 10, 14]], [1, [4, 12]], [10, [0, 3, 10]], [8, [0, 2, 4, 6, 8, 10, 12, 14]], [11, [3, 7, 11, 15]]];
  const addLayer = () => { if (layers >= LAYERS.length) return; const [l, st] = LAYERS[layers++]; st.forEach(s => pattern[l][s] = 1); if (!A.beat) startBeat(98, pattern, () => { room.moving.forEach((m, i) => m.intensity = 80 + (pattern[0][A.beat?.step] ? 80 : 0)); }); };
  const camAt = () => { if (!chosen) { cam.position.set(Math.sin(t * 0.15) * 1.2, 2.4, 6.5); cam.lookAt(0, 1.4, -4); return; } const a = avs[chosen]; const r = innerHeight > innerWidth ? 7 : 3.6, ang = orbit; cam.position.set(a.position.x + Math.sin(ang) * r, innerHeight > innerWidth ? 2.6 : 1.8, a.position.z + Math.cos(ang) * r); cam.lookAt(a.position.x, innerHeight > innerWidth ? 1.9 : 1.3, a.position.z); };
  const ray = new THREE.Raycaster(), v2 = new THREE.Vector2();
  const cv = G.renderer.domElement;
  const down = e => { drag = { x: e.clientX, o: orbit, moved: false }; };
  const move = e => { if (!drag) return; const dx = e.clientX - drag.x; if (Math.abs(dx) > 6) drag.moved = true; if (chosen) orbit = drag.o + dx * 0.01; };
  const up = e => { if (drag && !drag.moved && !chosen) { v2.set(e.clientX / innerWidth * 2 - 1, -e.clientY / innerHeight * 2 + 1); ray.setFromCamera(v2, cam); const h = ray.intersectObjects(Object.values(avs), true)[0]; if (h) { let o = h.object; while (o && !o.userData.role) o = o.parent; o && pick(o.userData.role); } } drag = null; };
  cv.addEventListener('pointerdown', down); addEventListener('pointermove', move); addEventListener('pointerup', up);
  const bar = el('div', { class: 'panel', style: 'left:50%;transform:translateX(-50%);bottom:70px;display:flex;gap:10px' }, ...keys.map(k => el('button', { class: 'big', style: 'font-size:18px;padding:12px 18px', onclick: () => pick(k) }, ROLES[k].name)));
  function rebuild() { const a = avs[chosen], p = a.position.clone(); scene.remove(a); const n = makeAvatar(Object.assign({}, opts, { prop: ROLES[chosen].prop })); n.position.copy(p); n.userData.role = chosen; scene.add(n); avs[chosen] = n; spots[chosen].target = n; }
  function pick(k) { chosen = k; bar.remove(); keys.forEach(o => { avs[o].visible = o === k; }); opts.top = save.look ? opts.top : ROLES[k].top; rebuild(); addLayer(); drum(15); showPanel(); }
  function opt(label, arr, key, isCol) { return el('div', { class: 'row' }, el('b', {}, label), ...arr.map((v, i) => { const b = el('button', { class: (isCol ? 'sw' : 'opt') + (opts[key] === i ? ' on' : ''), style: isCol ? `background:${v}` : '', onclick: () => { opts[key] = i; b.parentNode.querySelectorAll('button').forEach(x => x.classList.remove('on')); b.classList.add('on'); rebuild(); addLayer(); drum([0, 1, 3, 15][Object.keys(opts).indexOf(key) % 4]); } }, isCol ? '' : v); return b; })); }
  let panel;
  function showPanel() {
    panel = el('div', { class: 'panel', style: (innerHeight > innerWidth ? 'left:8px;right:8px;bottom:64px;' : 'left:10px;top:56px;max-width:min(92vw,420px);') + 'max-height:calc(50vh);overflow:auto' },
      el('div', { style: 'font:800 18px system-ui;margin-bottom:4px' }, ROLES[chosen].name + ' — make it yours'),
      opt('Skin', SKINS, 'skin', true), opt('Hair', HAIRS, 'hair'), opt('Clothes', TOPS, 'top', true), opt('Chain', CHAINS, 'chain'),
      el('div', { class: 'row' }, el('button', { class: 'opt', onclick: () => { chosen = null; panel.remove(); keys.forEach(o => avs[o].visible = true); hud().append(bar); } }, '◀ Change role'), el('button', { class: 'big', style: 'font-size:18px;padding:10px 20px;min-height:48px', onclick: done }, 'Done ✓')),
      el('div', { style: 'font-size:12px;opacity:.7' }, 'Drag to spin the camera'));
    hud().append(panel);
  }
  async function done() { save.role = chosen; save.look = opts; G.persist(); panel.remove(); toast('Saved'); await say('s2b', "Looking good. Now let's build your sound.", sub); if (alive) G.go(3); }
  return { scene, camera: cam,
    async start() { hud().append(bar, el('button', { class: 'skip', onclick: () => { if (!chosen) pick('dj'); done(); } }, 'Skip ⏭')); addLayer(); if (chosen) pick(chosen); await say('s2a', 'Every legend starts somewhere. Who are you tonight? The Artist… the DJ… or the Fan?', sub); },
    update(dt) { t += dt; room.upd(); if (chosen && !drag) orbit = Math.sin(t * 0.25) * 1.1; camAt(); keys.forEach((k, i) => { spots[k].intensity = chosen ? (k === chosen ? 45 : 0) : 22 + Math.sin(t * 2 + i * 2) * 10; avs[k].rotation.y = chosen ? 0 : Math.sin(t * .5 + i) * .3; avs[k].position.y = 0.4 + (A.beat && k === chosen ? Math.abs(Math.sin(t * Math.PI * 98 / 60)) * 0.04 : 0); });
      room.moving.forEach((m, i) => { m.target.position.set(Math.sin(t * 0.7 + i * 3) * 6, 0, -4 + Math.cos(t * 0.5 + i) * 4); }); },
    dispose() { alive = false; stopBeat(); cv.removeEventListener('pointerdown', down); removeEventListener('pointermove', move); removeEventListener('pointerup', up); } };
}
