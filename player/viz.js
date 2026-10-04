// Psycho Fingers Player — full-screen canvas visualizer (lights, haze, lasers, spectrum ring, crowd)
export const THEMES = {
  club:    { name: 'Club',         bg: ['#05030c', '#120626', '#05030c'], c: ['#ff2bd6', '#22e3ff', '#ffc531', '#7a5cff'], lasers: 1, beams: 1, crowd: '#07040d', haze: .9 },
  island:  { name: 'Island Night', bg: ['#020c14', '#082433', '#24101e'], c: ['#ff5fa2', '#2de3c4', '#ffb547', '#ff7a3d'], lasers: .8, beams: .9, crowd: '#03080c', haze: 1, palms: true },
  neon:    { name: 'Neon',         bg: ['#000000', '#03100a', '#000000'], c: ['#ff00e6', '#00e5ff', '#d4ff00', '#39ff14'], lasers: 1.2, beams: .7, crowd: '#000', haze: .7, grid: true },
  minimal: { name: 'Minimal',      bg: ['#0b0b0d', '#121216', '#0b0b0d'], c: ['#f2f2f2', '#9aa0a6', '#ffc531', '#cfd2d6'], lasers: 0, beams: .35, crowd: '#060607', haze: .35 },
};

export function createViz(canvas) {
  const g = canvas.getContext('2d', { alpha: false });
  let W = 0, H = 0, dpr = 1, theme = THEMES.club, bgGrad = null;
  const crowd = [];
  const hazeBlobs = Array.from({ length: 6 }, (_, i) => ({ x: Math.random(), y: .2 + Math.random() * .6, r: .25 + Math.random() * .25, sp: .02 + Math.random() * .03, ph: i * 1.7, ci: i % 4 }));
  const ringSmooth = new Float32Array(64), ringBlocks = new Uint8Array(64);
  let flash = 0, laserPhase = 0, beamPhase = 0, lastDraw = 0;
  // quality: 0 full … 3 battery saver. Lower levels render at a lower resolution with fewer haze blobs / crowd details.
  let qLevel = 0, qRes = 1;
  function setQuality(level, res) { const r = res || 1; qLevel = level | 0; if (r !== qRes) { qRes = r; if (W) resize(); } }

  function resize() {
    W = canvas.clientWidth; H = canvas.clientHeight;
    dpr = Math.max(.5, Math.min(window.devicePixelRatio || 1, W * H > 1.6e6 ? 1.25 : 1.6) * qRes);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildBg(); buildCrowd();
  }
  function buildBg() {
    bgGrad = g.createLinearGradient(0, 0, 0, H);
    bgGrad.addColorStop(0, theme.bg[0]); bgGrad.addColorStop(.55, theme.bg[1]); bgGrad.addColorStop(1, theme.bg[2]);
  }
  function buildCrowd() {
    crowd.length = 0; let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const n = Math.max(14, Math.round(W / 26));
    for (let row = 0; row < 3; row++) for (let i = 0; i < n; i++) {
      crowd.push({ x: (i + rnd() * .8 + (row % 2) * .5) / n, row, s: .75 + rnd() * .5 - row * .12, ph: rnd() * 6.28, amp: .5 + rnd(), arm: rnd() < .32 ? (rnd() < .5 ? 1 : 2) : 0, armPh: rnd() * 6.28 });
    }
    crowd.sort((a, b) => b.row - a.row);
  }
  function setTheme(key) { theme = THEMES[key] || THEMES.club; buildBg(); }

  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
  }

  function draw(now, f, an) {
    const t = now / 1000; const pulse = f.pulse || 0, bass = f.bass || 0, mid = f.mid || 0, high = f.high || 0;
    const playing = !!f.playing; const energy = playing ? (f.level || 0) : 0;
    const fdt = lastDraw ? Math.min(.25, Math.max(0, (now - lastDraw) / 1000)) : 1 / 60; lastDraw = now;
    const k60 = fdt * 60; // motion keeps its real speed whatever the frame rate
    if (f.beat) flash = 1; flash *= Math.pow(.9, k60);
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = bgGrad; g.fillRect(0, 0, W, H);
    const C = theme.c;
    const ring = an && an.ring ? an.ring : { x: W * .45, y: H * .3 };
    const ringR = an && an.ringR ? an.ringR : Math.min(W, H) * .2;
    const crowdTop = an ? an.crowdTop : H * .4, booth = an ? an.booth : H * .6;

    g.globalCompositeOperation = 'lighter';
    // haze
    const nHaze = qLevel >= 2 ? 2 : qLevel === 1 ? 4 : 6;
    for (let hi = 0; hi < nHaze; hi++) {
      const b = hazeBlobs[hi];
      const x = (b.x + Math.sin(t * b.sp + b.ph) * .15) * W, y = (b.y + Math.cos(t * b.sp * .8 + b.ph) * .08) * H, r = b.r * Math.max(W, H);
      const a = (0.05 + energy * .06 + pulse * .05) * theme.haze;
      const rg = g.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, hexA(C[b.ci], a)); rg.addColorStop(1, hexA(C[b.ci], 0));
      g.fillStyle = rg; g.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
    // neon grid floor
    if (theme.grid) {
      g.strokeStyle = hexA(C[3], .12 + pulse * .15); g.lineWidth = 1;
      const hy = booth - 10;
      for (let i = 0; i < 10; i++) { const y = hy + Math.pow(i / 9, 2) * (H - hy); g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
      for (let i = -14; i <= 14; i++) { g.beginPath(); g.moveTo(W / 2 + i * 30, hy); g.lineTo(W / 2 + i * 160, H); g.stroke(); }
    }
    // moving-head beams from the ceiling
    beamPhase += (0.3 + energy * 1.2) / 60 * k60;
    const nb = 5;
    for (let i = 0; i < nb; i++) {
      const ox = W * (0.08 + i * (0.84 / (nb - 1))), oy = -10;
      const ang = Math.PI / 2 + Math.sin(beamPhase * (0.8 + i * .13) + i * 1.3) * 0.55;
      const len = H * 1.15, spread = 0.07 + bass * .03;
      const a = (0.05 + mid * .12 + flash * .12) * theme.beams;
      const col = C[i % 4];
      const gr = g.createLinearGradient(ox, oy, ox + Math.cos(ang) * len, oy + Math.sin(ang) * len);
      gr.addColorStop(0, hexA(col, a * 2.2)); gr.addColorStop(1, hexA(col, 0));
      g.fillStyle = gr; g.beginPath(); g.moveTo(ox, oy);
      g.lineTo(ox + Math.cos(ang - spread) * len, oy + Math.sin(ang - spread) * len);
      g.lineTo(ox + Math.cos(ang + spread) * len, oy + Math.sin(ang + spread) * len); g.closePath(); g.fill();
      g.fillStyle = hexA(col, .5 + flash * .5); g.beginPath(); g.arc(ox, 4, 5, 0, 7); g.fill();
    }
    // lasers
    if (theme.lasers > 0) {
      laserPhase += (0.4 + energy * 2.2) / 60 * k60;
      const ox = ring.x + ringR * .15, oy = Math.max(10, ring.y - ringR * 1.25);
      const nl = 7; const la = (0.12 + flash * .55 + high * .3) * theme.lasers;
      for (let i = 0; i < nl; i++) {
        const base = Math.PI * (0.18 + i * (0.64 / (nl - 1)));
        const ang = base + Math.sin(laserPhase + i * .9) * .28;
        const len = Math.hypot(W, H);
        const x2 = ox + Math.cos(ang) * len, y2 = oy + Math.sin(ang) * len;
        const col = [C[0], C[2], C[1]][i % 3];
        g.strokeStyle = hexA(col, la * .25); g.lineWidth = 7; g.beginPath(); g.moveTo(ox, oy); g.lineTo(x2, y2); g.stroke();
        g.strokeStyle = hexA(col, Math.min(1, la)); g.lineWidth = 1.6; g.beginPath(); g.moveTo(ox, oy); g.lineTo(x2, y2); g.stroke();
      }
      g.fillStyle = hexA('#ffffff', .4 + flash * .6); g.beginPath(); g.arc(ox, oy, 3 + flash * 3, 0, 7); g.fill();
    }
    // spectrum ring (segmented)
    const spec = f.spectrum; const segs = 56; const gapA = 0.0;
    const sk = 1 - Math.pow(.65, k60);
    for (let i = 0; i < 64; i++) { const v = spec ? spec[i] || 0 : 0; ringSmooth[i] += (v - ringSmooth[i]) * sk; }
    const r0 = ringR * (0.78 + pulse * .04);
    const blocksOf = ringBlocks; let maxB = 1;
    for (let i = 0; i < segs; i++) {
      const fr = i / segs; const si = Math.floor((fr < .5 ? fr * 2 : (1 - fr) * 2) * 63);
      const v = playing ? ringSmooth[si] : 0.05 + Math.sin(t * 1.5 + i * .3) * .03;
      blocksOf[i] = Math.max(1, Math.round(v * 9)); if (blocksOf[i] > maxB) maxB = blocksOf[i];
    }
    const aw = (Math.PI * 2 / segs) * .62; g.lineWidth = ringR * .04;
    const quarters = [C[0], C[3], C[3], C[1]];
    for (let k = 0; k < maxB; k++) {
      const rr = r0 + k * ringR * .055, alpha = (0.45 + .55 * (1 - k / 10)) * (theme.lasers ? 1 : .6);
      for (let q = 0; q < 4; q++) {
        g.strokeStyle = hexA(quarters[q], alpha); g.beginPath(); let any = false;
        for (let i = Math.ceil(q * segs / 4); i < Math.ceil((q + 1) * segs / 4); i++) {
          if (blocksOf[i] <= k) continue;
          const ang = -Math.PI / 2 + (i / segs) * Math.PI * 2, a0 = ang - aw / 2 + gapA;
          g.moveTo(ring.x + Math.cos(a0) * rr, ring.y + Math.sin(a0) * rr); g.arc(ring.x, ring.y, rr, a0, ang + aw / 2); any = true;
        }
        if (any) g.stroke();
      }
    }
    // inner glow ring
    g.strokeStyle = hexA(C[0], .25 + pulse * .4); g.lineWidth = 3; g.beginPath(); g.arc(ring.x, ring.y, r0 - ringR * .08, 0, 7); g.stroke();

    // palms (Island Night)
    g.globalCompositeOperation = 'source-over';
    if (theme.palms) {
      const hg = g.createLinearGradient(0, booth - H * .25, 0, booth);
      hg.addColorStop(0, 'rgba(255,120,60,0)'); hg.addColorStop(1, `rgba(255,120,60,${.12 + pulse * .08})`);
      g.fillStyle = hg; g.fillRect(0, booth - H * .25, W, H * .25);
      drawPalm(W * .03, booth, H * .45, -0.12); drawPalm(W * .97, booth, H * .38, 0.15);
    }
    // crowd silhouettes
    const band = Math.max(20, booth - crowdTop);
    g.lineCap = 'round';
    for (let row = 2; row >= 0; row--) {
      const shade = row === 0 ? theme.crowd : row === 1 ? '#0c0816' : '#120c20';
      const ps = [];
      g.fillStyle = shade; g.beginPath();
      for (const p of crowd) {
        if (p.row !== row) continue;
        const sc = band * .22 * p.s; const bob = playing ? Math.max(0, Math.sin(t * Math.PI * 2 * ((f.bpm || 110) / 120) + p.ph)) * pulse * sc * .5 * p.amp + pulse * sc * .25 : Math.sin(t + p.ph) * sc * .04;
        const x = p.x * W, y = booth - band * (0.12 + row * .2) - bob;
        ps.push(p, x, y, sc);
        // shoulders + head
        g.moveTo(x - sc * 1.05, y + sc * 1.25); g.ellipse(x, y + sc * 1.25, sc * 1.05, sc * .7, 0, Math.PI, 0); g.lineTo(x + sc * 1.05, booth + 40); g.lineTo(x - sc * 1.05, booth + 40); g.closePath();
        g.moveTo(x + sc * .5, y); g.arc(x, y, sc * .5, 0, Math.PI * 2);
      }
      g.fill();
      if (playing && qLevel < 3) { // raised arms
        g.strokeStyle = shade;
        for (let j = 0; j < ps.length; j += 4) {
          const p = ps[j], x = ps[j + 1], y = ps[j + 2], sc = ps[j + 3]; if (!p.arm) continue;
          const up = Math.sin(t * 3 + p.armPh) * .2 + .9 + pulse * .3, side = p.arm === 1 ? 1 : -1;
          g.lineWidth = sc * .32; g.beginPath(); g.moveTo(x + side * sc * .8, y + sc * 1.1); g.lineTo(x + side * sc * 1.1, y - sc * up * 1.1); g.lineTo(x + side * sc * .9, y - sc * up * 2.1); g.stroke();
        }
      }
      if (qLevel < 2) { // rim light
        g.strokeStyle = hexA(C[(row + 1) % 4], .12 + pulse * .25 * (row === 0 ? 1 : .5)); g.lineWidth = 1.2; g.beginPath();
        for (let j = 0; j < ps.length; j += 4) { const x = ps[j + 1], y = ps[j + 2], sc = ps[j + 3], a0 = Math.PI * 1.1; g.moveTo(x + Math.cos(a0) * sc * .5, y + Math.sin(a0) * sc * .5); g.arc(x, y, sc * .5, a0, Math.PI * 1.9); }
        g.stroke();
      }
    }
    // vignette
    const vg = g.createRadialGradient(W / 2, H * .45, Math.min(W, H) * .3, W / 2, H * .5, Math.max(W, H) * .8);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.55)');
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
  }
  function drawPalm(x, y, h, lean) {
    g.save(); g.fillStyle = '#02060a'; g.strokeStyle = '#02060a'; g.lineCap = 'round';
    g.lineWidth = h * .035; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + lean * h * 1.2, y - h * .5, x + lean * h * 2, y - h); g.stroke();
    const tx = x + lean * h * 2, ty = y - h;
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI / 2 + (i - 3) * .5; g.lineWidth = h * .025;
      g.beginPath(); g.moveTo(tx, ty); g.quadraticCurveTo(tx + Math.cos(a) * h * .25, ty + Math.sin(a) * h * .25 - h * .05, tx + Math.cos(a) * h * .38, ty + Math.sin(a) * h * .2 + h * .12); g.stroke();
    }
    g.restore();
  }
  return { resize, draw, setTheme, setQuality, get theme() { return theme; } };
}
