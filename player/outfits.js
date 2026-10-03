// Psycho Fingers Player — DJ outfits (recolours + overlays on the scene SVG; the rig/animation is shared)
const GOLD = 'url(#gold)';
const BLACK_PHONES = { cup: '#111215', ring: '#3b3d44', inner: '#1d1f24', hub: '#2c2e35' };
export const OUTFITS = {
  classic: {
    name: 'Classic', desc: 'Black tee, charcoal bomber, black PF cap, gold chain',
    jacket: ['#3a3c3f', '#2b2d2f', '#1d1e20'], tee: ['#18181b', '#0b0b0d'], collar: '#26262a', rib: ['#1c1d1f', '#2a2b2e'],
    seam: '#1a1b1d', zip: true, hat: 'cap', cap: ['#26262a', '#08080a'], capSeam: '#2f3035', brim: '#0b0b0d', brimEdge: '#3a3b41', pf: GOLD, pfStroke: '#5a3d05',
    chain: 1, phones: BLACK_PHONES, arm: { o: '#111214', u: '#2e3033', f: '#2a2c2f', hi: '#4b4e54', hiOp: .7 }, cuff: 'url(#ribs)', watch: true,
  },
  luxe: {
    name: 'Gold Chain Luxe', desc: 'White tee, gold jacket, double chain',
    jacket: ['#f3d27a', '#c99a2e', '#8a6414'], tee: ['#f4f4f2', '#d9d9d4'], collar: '#e6e6e0', rib: ['#2a2218', '#3a3020'],
    seam: '#7a5a12', zip: true, hat: 'cap', cap: ['#f4f4f2', '#cfcfc8'], capSeam: '#bdbdb5', brim: '#e9e9e3', brimEdge: '#b8b8b0', pf: GOLD, pfStroke: '#7a5408',
    chain: 2, phones: { cup: '#e9e7e0', ring: GOLD, inner: '#c9c6bd', hub: '#a8a49a' }, arm: { o: '#5e4510', u: '#d4a63c', f: '#c0922c', hi: '#ffe9a6', hiOp: .8 }, cuff: '#2a2218', watch: true,
  },
  hoodie: {
    name: 'Street Hoodie', desc: 'Black hoodie, knit beanie',
    jacket: ['#202124', '#17181a', '#0e0e10'], tee: ['#1b1c1f', '#121315'], collar: '#1b1c1f', rib: ['#141517', '#202124'],
    seam: '#0c0c0e', zip: false, hat: 'beanie', beanie: ['#2c2f36', '#1a1c21'], pf: GOLD, pfStroke: '#5a3d05', overlays: ['hood', 'pocket'],
    chain: 1, phones: { cup: '#c8202f', ring: '#ff5a66', inner: '#7e121c', hub: '#5a0c14' }, arm: { o: '#0b0b0d', u: '#1f2023', f: '#1b1c1f', hi: '#34363b', hiOp: .6 }, cuff: '#141517', watch: true,
  },
  tracksuit: {
    name: 'Tracksuit', desc: 'Two-tone tracksuit with stripes',
    jacket: [['#1f3f8f', 0], ['#1f3f8f', .52], ['#eef0f4', .52], ['#d8dbe2', 1]], tee: ['#1f3f8f', '#173273'], collar: '#eef0f4', rib: ['#16306e', '#1f3f8f'],
    seam: '#13285c', zip: true, zipColor: '#eef0f4', hat: 'cap', cap: ['#eef0f4', '#c9ccd4'], capSeam: '#b4b8c2', brim: '#1f3f8f', brimEdge: '#3f63b8', pf: '#1f3f8f', pfStroke: '#0c1d48', overlays: ['stripes'],
    chain: 1, phones: { cup: '#eef0f4', ring: '#1f3f8f', inner: '#c9ccd4', hub: '#9aa0ad' }, arm: { o: '#0f2152', u: '#2148a0', f: '#1f3f8f', hi: '#ffffff', hiOp: .95 }, cuff: '#eef0f4', watch: true,
  },
  suit: {
    name: 'Suit & Shades', desc: 'Tailored suit, white shirt, tie, sunglasses',
    jacket: ['#2a2f3d', '#20242f', '#151821'], tee: ['#f6f6f4', '#dcdcd8'], collar: '#f6f6f4', rib: ['#20242f', '#2a2f3d'],
    seam: '#12151c', zip: false, hat: 'none', overlays: ['lapels', 'tie', 'shades', 'hair'],
    chain: 0, phones: { cup: '#15171c', ring: '#8d919b', inner: '#22252c', hub: '#3a3e48' }, arm: { o: '#0e1016', u: '#262b38', f: '#222633', hi: '#3c4252', hiOp: .6 }, cuff: '#f6f6f4', watch: true,
  },
  summer: {
    name: 'Summer', desc: 'Tank top, bucket hat',
    jacket: ['#5c3a22', '#4f311b', '#3e2614'], tee: ['#ffb547', '#f08c2a'], collar: '#ffb547', rib: ['#ffb547', '#f08c2a'],
    seam: 'none', zip: false, hat: 'bucket', bucket: ['#f4e7c8', '#d9c69a'], pf: '#f08c2a', pfStroke: '#7a3f05', overlays: ['tank'], noJacket: true,
    chain: 1, phones: { cup: '#2de3c4', ring: '#0f8f7b', inner: '#14a58d', hub: '#0b6f5f' }, arm: { o: '#24140b', u: '#5a3720', f: '#53321d', hi: '#7a4f36', hiOp: .55 }, cuff: 'none', watch: true,
  },
  glow: {
    name: 'Stage Glow', desc: 'Reflective jacket with neon strips',
    jacket: ['#26262c', '#1a1a1f', '#0f0f12'], tee: ['#101014', '#08080a'], collar: '#22e3ff', rib: ['#141418', '#1f1f25'],
    seam: '#0b0b0e', zip: true, zipColor: '#c9f6ff', hat: 'cap', cap: ['#1c1c22', '#060608'], capSeam: '#2a2a33', brim: '#08080a', brimEdge: 'var(--c2)', pf: 'var(--c2)', pfStroke: 'var(--c1)', overlays: ['neon'],
    chain: 1, phones: { cup: '#0c0c10', ring: 'var(--c1)', inner: '#16161c', hub: 'var(--c2)' }, arm: { o: '#0a0a0d', u: '#24242a', f: '#202026', hi: 'var(--c2)', hiOp: .95 }, cuff: '#141418', watch: true, neon: true,
  },
};
export const OUTFIT_FOR_THEME = { club: 'classic', island: 'summer', neon: 'glow', minimal: 'suit' };

function stops(grad, cols) {
  if (!grad) return;
  const list = cols.map((c, i) => Array.isArray(c) ? c : [c, cols.length === 1 ? 0 : i / (cols.length - 1)]);
  grad.innerHTML = list.map(([c, o]) => `<stop offset="${o}" stop-color="${c}"/>`).join('');
}
export function applyOutfit(svg, id) {
  const o = OUTFITS[id] || OUTFITS.classic;
  const q = (s) => svg.querySelectorAll(s);
  const set = (s, attrs) => q(s).forEach((el) => { for (const k in attrs) { if (attrs[k] == null) continue; el.setAttribute(k, attrs[k]); } });
  stops(svg.querySelector('#jacket'), o.jacket); stops(svg.querySelector('#tee'), o.tee);
  const rib = svg.querySelectorAll('#ribs rect'); if (rib[0]) { rib[0].setAttribute('fill', o.rib[0]); rib[1].setAttribute('fill', o.rib[1]); }
  set('.o-collar', { stroke: o.collar });
  set('.o-seam', { stroke: o.seam === 'none' ? 'transparent' : o.seam });
  q('.o-zip').forEach((el) => { el.style.display = o.zip ? '' : 'none'; });
  if (o.zipColor) set('.o-zip-a', { stroke: o.zipColor }); else set('.o-zip-a', { stroke: '#4a4c51' });
  q('.o-jacketpart').forEach((el) => { el.style.display = o.noJacket ? 'none' : ''; });
  // hats
  q('.o-cap').forEach((el) => { el.style.display = o.hat === 'cap' ? '' : 'none'; });
  q('.o-beanie').forEach((el) => { el.style.display = o.hat === 'beanie' ? '' : 'none'; });
  q('.o-bucket').forEach((el) => { el.style.display = o.hat === 'bucket' ? '' : 'none'; });
  if (o.cap) { stops(svg.querySelector('#cap'), o.cap); set('.o-capseam', { stroke: o.capSeam }); set('.o-brim', { fill: o.brim }); set('.o-brimedge', { stroke: o.brimEdge }); }
  if (o.beanie) stops(svg.querySelector('#beanieG'), o.beanie);
  if (o.bucket) stops(svg.querySelector('#bucketG'), o.bucket);
  set('.o-pf', { fill: o.pf, stroke: o.pfStroke });
  // overlays
  const ov = new Set(o.overlays || []);
  q('[data-ov]').forEach((el) => { el.style.display = ov.has(el.dataset.ov) ? '' : 'none'; });
  q('.o-chain1').forEach((el) => { el.style.display = o.chain >= 1 ? '' : 'none'; });
  q('.o-chain2').forEach((el) => { el.style.display = o.chain >= 2 ? '' : 'none'; });
  // headphones
  set('.o-ph-cup', { fill: o.phones.cup, stroke: o.phones.ring }); set('.o-ph-in', { fill: o.phones.inner }); set('.o-ph-hub', { fill: o.phones.hub }); set('.o-ph-band', { stroke: o.phones.ring === GOLD ? '#c99a2e' : '#0c0c0e' });
  // sleeves / arms
  set('.a-up-o, .a-fo-o', { stroke: o.arm.o }); set('.a-up', { stroke: o.arm.u }); set('.a-fo', { stroke: o.arm.f });
  q('.a-hi').forEach((el) => { el.setAttribute('stroke', o.arm.hi); el.dataset.op = o.arm.hiOp; el.setAttribute('opacity', o.arm.hiOp); });
  q('.cuff').forEach((el) => { el.style.display = o.cuff === 'none' ? 'none' : ''; if (o.cuff !== 'none') el.setAttribute('fill', o.cuff); });
  q('.o-watch').forEach((el) => { el.style.display = o.watch ? '' : 'none'; });
  svg.classList.toggle('outfit-neon', !!o.neon);
  svg.dataset.outfit = id in OUTFITS ? id : 'classic';
  return o;
}
