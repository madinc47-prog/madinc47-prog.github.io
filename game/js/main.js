import * as THREE from '../lib/three.module.min.js';
import { EffectComposer } from '../lib/a/EffectComposer.js';
import { RenderPass } from '../lib/a/RenderPass.js';
import { UnrealBloomPass } from '../lib/a/UnrealBloomPass.js';
import { OutputPass } from '../lib/a/OutputPass.js';
import { Q, tick, onQuality, setMode } from './core/quality.js';
import { initAudio, stopVoice, A } from './core/audio.js';
import { $, sub, clearHud, sleep } from './core/ui.js';
export const VERSION = 'v20261023-g2';
const canvas = $('#c');
export const renderer = new THREE.WebGLRenderer({ canvas, antialias: !Q.mobile, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.6; renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = false;
const composer = new EffectComposer(renderer);
const rp = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.8, 0.5, 0.86);
composer.addPass(rp); composer.addPass(bloom); composer.addPass(new OutputPass());
function resize() { const w = innerWidth, h = innerHeight; renderer.setPixelRatio(Q.pr); renderer.setSize(w, h, false); composer.setPixelRatio(Q.pr); composer.setSize(w, h); bloom.resolution.set(w * Q.pr / 2, h * Q.pr / 2); if (cur && cur.camera) { cur.camera.aspect = w / h; cur.camera.updateProjectionMatrix(); } }
addEventListener('resize', resize); onQuality(() => { resize(); bloom.enabled = Q.bloom; showQ(); });
let cur = null; export const G = { renderer, bloom, go, cur: () => cur, save: JSON.parse(localStorage.getItem('pf.save') || '{}') };
G.setView = (s, c) => { rp.scene = s; rp.camera = c; cur.scene = s; cur.camera = c; resize(); };
G.persist = () => localStorage.setItem('pf.save', JSON.stringify(G.save));
const SCENES = { 1: () => import('./scenes/s1_intro.js'), 2: () => import('./scenes/s2_role.js'), 3: () => import('./scenes/s3_drive.js'), 4: () => import('./scenes/s4_build.js'), 5: () => import('./scenes/s5_session.js') };
export function loading(t) { const l = $('#load'); l.style.display = t ? 'flex' : 'none'; if (t) $('#loadt').textContent = t; }
async function go(n, opts) {
  stopVoice(); sub(''); clearHud(); if (cur && cur.dispose) cur.dispose(); cur = null; window.__scene = n;
  loading('Loading…'); const m = await SCENES[n](); cur = await m.create(G, opts || {}); loading('');
  rp.scene = cur.scene; rp.camera = cur.camera; resize(); window.__ready = n;
  document.querySelectorAll('#chap button').forEach(b => b.classList.toggle('on', +b.dataset.n === n));
  cur.start && cur.start();
}
const clock = new THREE.Clock(); window.__ft = [];
function loop() { requestAnimationFrame(loop); const dt = Math.min(clock.getDelta(), 0.1); tick(dt); if (!cur) return; const t0 = performance.now(); cur.update && cur.update(dt); if (cur.render) cur.render(composer, renderer); else if (Q.bloom) composer.render(); else renderer.render(cur.scene, cur.camera); window.__ft.push(performance.now() - t0); if (window.__ft.length > 300) window.__ft.shift(); }
function showQ() { $('#qbtn').textContent = 'Quality: ' + (Q.mode === 'auto' ? 'Auto (' + ['Low', 'Med', 'High'][Q.level] + ')' : ['Low', 'Med', 'High'][Q.level]); }
$('#qbtn').onclick = () => { const order = ['auto', '0', '1', '2']; setMode(order[(order.indexOf(Q.mode) + 1) % 4]); };
$('#fs').onclick = () => { const d = document.documentElement; if (!document.fullscreenElement) (d.requestFullscreen || d.webkitRequestFullscreen).call(d, { navigationUI: 'hide' }).catch(() => {}); else document.exitFullscreen(); };
$('#chap').innerHTML = ['Intro', 'Role', 'Drive', 'Build', 'Session'].map((t, i) => `<button data-n="${i + 1}">${i + 1} ${t}</button>`).join('');
$('#chap').onclick = e => { const b = e.target.closest('button'); if (b) { initAudio(); go(+b.dataset.n); } };
$('#ver').textContent = VERSION;
const qs = new URLSearchParams(location.search); const startN = +qs.get('scene') || 0;
function begin(n) { $('#start').style.display = 'none'; initAudio(); go(n); }
$('#startb').onclick = () => begin(startN || 1);
$('#contb').onclick = () => begin(G.save.layout ? 4 : 3); if (!G.save.role) $('#contb').style.display = 'none';
if (qs.get('auto')) begin(startN || 1);
showQ(); bloom.enabled = Q.bloom; loop();
window.addEventListener('error', e => { (window.__errs = window.__errs || []).push(String(e.message)); });
window.__G = G; window.__Q = Q;
