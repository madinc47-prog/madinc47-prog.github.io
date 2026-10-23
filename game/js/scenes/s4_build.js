// Scene 4 — Studio build: top-down grid build mode (Cities: Skylines style). Walls, floor, lights, unlockable gear, hype + fans.
import * as THREE from '../../lib/three.module.min.js';
import { buildStudio, fans, GEAR, GW, GH, CELL, cellPos } from '../world/studio.js';
import { say, drum } from '../core/audio.js';
import { el, sub, hud, toast } from '../core/ui.js';
export async function create(G) {
  const scene = new THREE.Scene(); const cam = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.5, 300);
  const layout = G.save.layout ? JSON.parse(JSON.stringify(G.save.layout)) : { walls: {}, lights: [], gear: {}, floor: 0 };
  const S = await buildStudio(scene, G.renderer, layout); G.renderer.toneMappingExposure = 0.85;
  const F = fans(scene);
  // grid overlay
  const grid = new THREE.GridHelper(GW * CELL, GW, 0x38e1ff, 0x38e1ff); grid.scale.z = GH / GW; grid.position.y = 0.05; grid.material.transparent = true; grid.material.opacity = 0.35; scene.add(grid);
  const hover = new THREE.Mesh(new THREE.PlaneGeometry(CELL, CELL), new THREE.MeshBasicMaterial({ color: 0x38e1ff, transparent: true, opacity: 0.35 })); hover.rotation.x = -Math.PI / 2; hover.position.y = 0.06; scene.add(hover);
  let tool = 'wall', wallM = 'wood', lightC = 0xfff0d8, gearT = 'beat', drag = false, last = null, firstGear = !Object.keys(layout.gear).length, yaw = 0, zoom = 1, wallV = false, sel = null;
  const hype = () => Math.min(100, Object.keys(layout.walls).length * 1 + layout.lights.length * 3 + (layout.floor ? 5 : 0) + Object.keys(layout.gear).length * 12);
  const meter = el('div', { class: 'meter' }, el('i'), el('span', {}, 'HYPE 0'));
  const setHype = () => { const h = hype(); meter.firstChild.style.width = h + '%'; meter.lastChild.textContent = 'HYPE ' + h + ' · ' + Math.floor(h / 2) + ' fans outside'; F.set(Math.floor(h / 2)); refreshGear(); };
  const btn = (t, f, cls = 'opt') => el('button', { class: cls, onclick: f }, t);
  const toolsRow = el('div', { class: 'row' }); const subRow = el('div', { class: 'row' });
  const pal = el('div', { class: 'panel', style: 'left:8px;bottom:8px;max-width:calc(100vw - 16px)' }, toolsRow, subRow);
  const TOOLS = [['wall', '🧱 Walls'], ['floor', '✨ Floor'], ['light', '💡 Lights'], ['gear', '🎛️ Gear'], ['erase', '🧽 Erase']];
  TOOLS.forEach(([k, t]) => toolsRow.append(el('button', { class: 'opt', 'data-k': k, onclick: () => setTool(k) }, t)));
  toolsRow.append(el('button', { class: 'opt', onclick: () => { yaw += Math.PI / 2; } }, '⟳'), el('button', { class: 'opt', onclick: () => { zoom = zoom > 0.8 ? 0.65 : 1; } }, '🔍'));
  const nextBtn = el('button', { class: 'big', style: 'position:fixed;right:10px;top:100px;font-size:17px;padding:12px 18px;min-height:50px', onclick: () => { save(); G.go(5); } }, 'First session ▶');
  function refreshGear() { if (tool !== 'gear') return; subRow.innerHTML = ''; const h = hype(); for (const k in GEAR) { const ok = h >= GEAR[k].hype; const b = el('button', { class: 'opt' + (gearT === k ? ' on' : ''), style: ok ? '' : 'opacity:.45', onclick: () => { if (!ok) return toast('Unlocks at hype ' + GEAR[k].hype); gearT = k; refreshGear(); } }, (ok ? '' : '🔒 ') + GEAR[k].name + (layout.gear[k] ? ' ✓' : '')); subRow.append(b); } }
  function setTool(k) { tool = k; toolsRow.querySelectorAll('button[data-k]').forEach(b => b.classList.toggle('on', b.dataset.k === k)); subRow.innerHTML = '';
    if (k === 'wall') [['wood', 'Wood'], ['concrete', 'Concrete'], ['neon', 'Neon panel']].forEach(([m, t]) => { const b = btn(t, () => { wallM = m; subRow.querySelectorAll('button').forEach(x => x.classList.remove('on')); b.classList.add('on'); }); if (m === wallM) b.classList.add('on'); subRow.append(b); }); if (k === 'wall') { const rb = btn(wallV ? '↻ Place: ↕' : '↻ Place: ↔', () => { wallV = !wallV; rb.textContent = wallV ? '↻ Place: ↕' : '↻ Place: ↔'; }); const rs = btn('⟲ Rotate selected 90°', () => rotSel()); subRow.append(rb, rs, el('span', { style: 'font-size:13px;opacity:.8' }, 'Tap a wall to select it')); }
    if (k === 'floor') ['Bare concrete', 'Wood planks (gloss)', 'Black mirror', 'Polished concrete'].forEach((t, i) => subRow.append(btn(t, () => { layout.floor = i; S.rebuild(); setHype(); drum(12); save(); })));
    if (k === 'light') [[0xfff0d8, 'Warm'], [0xff2bd6, 'Pink'], [0x2b8bff, 'Blue'], [0x3bff7a, 'Green']].forEach(([c, t]) => { const b = btn(t, () => { lightC = c; subRow.querySelectorAll('button').forEach(x => x.classList.remove('on')); b.classList.add('on'); }); b.style.borderColor = '#' + c.toString(16).padStart(6, '0'); if (c === lightC) b.classList.add('on'); subRow.append(b); });
    if (k === 'gear') refreshGear(); if (k === 'erase') subRow.append(el('span', { style: 'font-size:13px;opacity:.8' }, 'Tap or drag over anything to remove it'));
  }
  const ray = new THREE.Raycaster(), v2 = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
  const cellAt = e => { v2.set(e.clientX / innerWidth * 2 - 1, -e.clientY / innerHeight * 2 + 1); ray.setFromCamera(v2, cam); if (!ray.ray.intersectPlane(plane, hit)) return null; const i = Math.floor(hit.x / CELL + GW / 2), j = Math.floor(hit.z / CELL + GH / 2); return i >= 0 && j >= 0 && i < GW && j < GH ? [i, j] : null; };
  function apply(c, first) {
    const [i, j] = c, key = i + ',' + j;
    if (tool === 'wall') { const v = last && last[0] === i && last[1] !== j; layout.walls[key] = { m: wallM, v: last ? v : wallV }; drum(5, 0, 0.5); }
    else if (tool === 'light' && first) { if (!layout.lights.some(l => l[0] === i && l[1] === j)) { layout.lights.push([i, j, lightC]); drum(13); } }
    else if (tool === 'gear' && first) { const g = GEAR[gearT]; if (i + g.w > GW || j + g.h > GH) return toast("Doesn't fit there"); layout.gear[gearT] = [i, j]; drum(0); drum(12); if (firstGear) { firstGear = false; say('s4b', 'Every piece you add gets your studio more fans.', sub); } }
    else if (tool === 'erase') { delete layout.walls[key]; layout.lights = layout.lights.filter(l => !(l[0] === i && l[1] === j)); for (const g in layout.gear) { const [a, b] = layout.gear[g], G2 = GEAR[g]; if (i >= a && i < a + G2.w && j >= b && j < b + G2.h) delete layout.gear[g]; } }
    else if (tool === 'floor' && first) { layout.floor = ((layout.floor || 0) + 1) % 4; drum(12); }
    S.rebuild(); setHype(); last = c;
  }
  const wallAt = e => { v2.set(e.clientX / innerWidth * 2 - 1, -e.clientY / innerHeight * 2 + 1); ray.setFromCamera(v2, cam); const h = ray.intersectObjects(S.items.children, true).find(x => { let o = x.object; while (o && !o.userData.wall) o = o.parent; return o; }); if (!h) return null; let o = h.object; while (!o.userData.wall) o = o.parent; return o.userData.wall; };
  function selWall(k) { sel = k; S.rebuild(); if (k) S.items.children.forEach(m => { if (m.userData.wall === k && m.material) { m.material = m.material.clone(); m.material.emissive && m.material.emissive.setHex(0x38e1ff); m.material.emissiveIntensity = 0.8; } }); }
  function rotSel() { if (!sel || !layout.walls[sel]) return toast('Tap a wall first to select it'); layout.walls[sel].v = !layout.walls[sel].v; drum(5, 0, 0.5); selWall(sel); save(); }
  const cv = G.renderer.domElement;
  const down = e => { e.preventDefault && e.preventDefault(); const wk = (tool === 'erase' || tool === 'wall') ? wallAt(e) : null;
    if (wk && tool === 'erase') { delete layout.walls[wk]; if (sel === wk) sel = null; S.rebuild(); setHype(); drum(5, 0, 0.5); save(); drag = true; last = null; return; }
    if (wk && tool === 'wall') { selWall(wk); toast('Wall selected — tap ⟲ Rotate selected 90°'); return; }
    const c = cellAt(e); if (!c) return; drag = true; last = null; apply(c, true); };
  const move = e => { const c = cellAt(e); if (c) { const p = cellPos(...c); hover.position.x = p.x; hover.position.z = p.z; } if (drag && c && (!last || c[0] !== last[0] || c[1] !== last[1]) && (tool === 'wall' || tool === 'erase')) { if (tool === 'erase') { const wk = wallAt(e); if (wk) { delete layout.walls[wk]; S.rebuild(); setHype(); } } apply(c, false); } };
  const up = () => { if (drag) save(); drag = false; };
  function save() { G.save.layout = layout; G.persist(); }
  cv.addEventListener('pointerdown', down); addEventListener('pointermove', move); addEventListener('pointerup', up);
  let t = 0; const cp = new THREE.Vector3(0, 30, 22);
  return { scene, camera: cam,
    async start() { hud().append(meter, pal, nextBtn, el('button', { class: 'skip', style: 'bottom:auto;top:160px', onclick: () => { if (!layout.gear.beat) layout.gear.beat = [5, 3]; save(); G.go(5); } }, 'Skip ⏭')); setTool('wall'); setHype(); await say('s4a', 'Start with the room. Walls, floor, lights.', sub); },
    update(dt) { t += dt; S.update(dt); F.update(dt); const portrait = innerHeight > innerWidth; const d = (portrait ? 40 : 27) * zoom; const tgt = new THREE.Vector3(Math.sin(yaw) * d * 0.62, d, Math.cos(yaw) * d * 0.62 + 0); cp.lerp(tgt, 1 - Math.exp(-dt * 4)); cam.position.copy(cp); cam.lookAt(0, 0, portrait ? -2 : -1); },
    dispose() { cv.removeEventListener('pointerdown', down); removeEventListener('pointermove', move); removeEventListener('pointerup', up); } };
}
