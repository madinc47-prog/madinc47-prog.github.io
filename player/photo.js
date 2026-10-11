// Psycho Fingers Player — "Use your photo": any visitor can put their own face on the DJ.
// The photo never leaves the device: it is cropped in the browser (drag to move, slider / pinch / wheel to zoom) to a
// small square JPEG of just the FACE, saved in localStorage ('pf-face'). The animated DJ stays exactly as drawn (body,
// outfit, hands, decks, dance, lights); the face is laid on his head in a soft-edged circle and nods with the head.
// A normal selfie is enough. Auto-centres on the face with the browser FaceDetector API when available, else manual.
const KEY = 'pf-face', OLD_KEY = 'pf-photo'; // v13 stored a whole-head picture under 'pf-photo' — dropped on load
const OUT_W = 256, OUT_H = 256; // square crop; shown as a feathered circle

export function initPhoto({ scene, toast = () => {}, td = () => {} }) {
  const $ = (s) => document.querySelector(s);
  const useBtn = $('#photoBtn'), resetBtn = $('#photoReset'), input = $('#photoIn'), dlg = $('#photoDlg');
  const cv = $('#photoCv'), zoomEl = $('#photoZoom'), g = cv.getContext('2d');
  let img = null, z = 1, ox = 0, oy = 0, base = 1; // image scale = base * z, offset in canvas px from centre

  function apply(url) {
    scene.setPhoto(url || null);
    resetBtn.hidden = !url;
    useBtn.querySelector('span').textContent = url ? 'Change face' : 'Use your photo';
  }
  let saved = null; try { if (localStorage.getItem(OLD_KEY)) { localStorage.removeItem(OLD_KEY); td('photo: removed old whole-head photo (v13); pick a selfie again for the face-only look'); } saved = localStorage.getItem(KEY); } catch (e) { /* private mode */ }
  apply(saved);
  td('photo: ' + (saved ? 'saved photo loaded (' + Math.round(saved.length / 1024) + ' KB)' : 'default DJ face'));

  useBtn.addEventListener('click', () => input.click());
  resetBtn.addEventListener('click', () => {
    try { localStorage.removeItem(KEY); } catch (e) {}
    apply(null); toast('Back to the default DJ face'); td('photo: reset to default');
  });
  input.addEventListener('change', async () => {
    const f = input.files && input.files[0]; input.value = '';
    if (!f) return;
    td('photo: picked ' + (f.type || '?') + ' ' + Math.round(f.size / 1024) + ' KB');
    try { img = await loadImage(f); } catch (e) { toast('That photo could not be opened. Try a JPG or PNG.'); td('photo: decode failed ' + (e && e.message)); return; }
    base = Math.max(OUT_W / img.width, OUT_H / img.height); z = 1; ox = 0; oy = 0; zoomEl.value = '1';
    draw(); dlg.showModal();
    autoFace();
  });
  function loadImage(f) {
    // createImageBitmap honours the phone's EXIF rotation; <img> is the fallback
    if (window.createImageBitmap) return createImageBitmap(f, { imageOrientation: 'from-image' }).catch(() => viaImg(f));
    return viaImg(f);
  }
  function viaImg(f) {
    return new Promise((res, rej) => { const u = URL.createObjectURL(f), im = new Image(); im.onload = () => { res(im); setTimeout(() => URL.revokeObjectURL(u), 1000); }; im.onerror = rej; im.src = u; });
  }
  async function autoFace() { // centre + zoom on the biggest face when the browser can find it
    if (!('FaceDetector' in window)) { td('photo: no FaceDetector in this browser — manual crop'); return; }
    try {
      const faces = await new window.FaceDetector({ fastMode: true, maxDetectedFaces: 3 }).detect(img);
      if (!faces.length) { td('photo: auto face: none found — manual crop'); return; }
      const b = faces.sort((a, c) => c.boundingBox.width * c.boundingBox.height - a.boundingBox.width * a.boundingBox.height)[0].boundingBox;
      setZoom((OUT_W * 0.8) / (b.width * base));
      const s = base * z; ox = (img.width / 2 - (b.x + b.width / 2)) * s; oy = (img.height / 2 - (b.y + b.height * 0.55)) * s;
      draw(); td('photo: auto face found ' + Math.round(b.width) + 'px, zoom ' + z.toFixed(2));
    } catch (e) { td('photo: auto face failed ' + (e && e.message) + ' — manual crop'); }
  }
  function clampOff() {
    const w = img.width * base * z, h = img.height * base * z;
    ox = Math.max(-(w - OUT_W) / 2, Math.min((w - OUT_W) / 2, ox)); oy = Math.max(-(h - OUT_H) / 2, Math.min((h - OUT_H) / 2, oy));
  }
  function render(ctx, W, H, k) { // k = canvas px per crop px
    const s = base * z * k, w = img.width * s, h = img.height * s;
    ctx.drawImage(img, W / 2 - w / 2 + ox * k, H / 2 - h / 2 + oy * k, w, h);
  }
  function draw() {
    if (!img) return; clampOff();
    const W = cv.width, H = cv.height, k = W / OUT_W;
    g.clearRect(0, 0, W, H); render(g, W, H, k);
    // face guide: only the circle goes on the DJ (soft edge)
    const R = W * .46;
    g.save(); g.fillStyle = 'rgba(5,4,12,.66)'; g.beginPath(); g.rect(0, 0, W, H); g.arc(W / 2, H / 2, R, 0, Math.PI * 2, true); g.fill('evenodd'); g.restore();
    g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 2; g.setLineDash([6, 5]); g.beginPath(); g.arc(W / 2, H / 2, R, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
    g.fillStyle = 'rgba(255,255,255,.8)'; g.font = `${Math.round(W / 22)}px system-ui,sans-serif`; g.textAlign = 'center'; g.fillText('your face in the circle', W / 2, H * .035 + W / 22);
  }
  // drag (mouse / touch / pen) + pinch with two fingers
  const pts = new Map(); let pinch0 = 0, z0 = 1;
  cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); z0 = z; } });
  cv.addEventListener('pointermove', (e) => {
    const p = pts.get(e.pointerId); if (!p) return;
    const r = cv.getBoundingClientRect(), k = OUT_W / r.width;
    if (pts.size === 1) { ox += (e.clientX - p.x) * k; oy += (e.clientY - p.y) * k; }
    p.x = e.clientX; p.y = e.clientY;
    if (pts.size === 2 && pinch0) { const [a, b] = [...pts.values()]; setZoom(z0 * Math.hypot(a.x - b.x, a.y - b.y) / pinch0); }
    draw();
  });
  const up = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch0 = 0; };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('wheel', (e) => { e.preventDefault(); setZoom(z * (e.deltaY < 0 ? 1.08 : 1 / 1.08)); draw(); }, { passive: false });
  function setZoom(v) { z = Math.max(1, Math.min(5, v)); zoomEl.value = String(z); }
  zoomEl.addEventListener('input', () => { setZoom(+zoomEl.value); draw(); });
  dlg.addEventListener('close', () => {
    if (dlg.returnValue !== 'ok' || !img) return;
    const c = document.createElement('canvas'); c.width = OUT_W; c.height = OUT_H;
    render(c.getContext('2d'), OUT_W, OUT_H, 1);
    const lv = autoLevels(c); // phone selfies are often back-lit / blue: even the face out so it sits on the DJ
    const url = c.toDataURL('image/jpeg', 0.86);
    try { localStorage.setItem(KEY, url); } catch (e) { toast('Not enough space on this device to keep the photo; it shows until you reload.'); td('photo: save failed (storage)'); }
    apply(url); toast('Your face is on the DJ (saved on this device only)');
    td('photo: saved ' + OUT_W + 'x' + OUT_H + ' jpeg ' + Math.round(url.length / 1024) + ' KB, zoom ' + z.toFixed(2) + ', offset ' + Math.round(ox) + ',' + Math.round(oy) + ', levels ' + lv);
  });
  // per-channel stretch measured inside the face circle (2nd–98th percentile), so a washed-out or tinted selfie gets
  // normal contrast and neutral colour; gentle (blended 85 %, plus a grey-world colour balance) so it still looks like the photo
  function autoLevels(c) {
    try {
      const x = c.getContext('2d'), d = x.getImageData(0, 0, c.width, c.height), a = d.data, W = c.width, H = c.height, R2 = (W * .42) ** 2;
      const hist = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)]; let n = 0;
      for (let y = 0; y < H; y += 2) for (let xx = 0; xx < W; xx += 2) { if ((xx - W / 2) ** 2 + (y - H / 2) ** 2 > R2) continue; const i = (y * W + xx) * 4; hist[0][a[i]]++; hist[1][a[i + 1]]++; hist[2][a[i + 2]]++; n++; }
      const pct = (h, q) => { let s = 0; for (let v = 0; v < 256; v++) { s += h[v]; if (s >= n * q) return v; } return 255; };
      const lo = hist.map((h) => pct(h, .02)), hi = hist.map((h) => Math.max(pct(h, .98), pct(h, .02) + 40));
      // after the stretch, nudge the mid-tones toward a neutral/warm skin balance (grey-world on the face circle)
      const mean = [0, 1, 2].map((ch) => { let s = 0; for (let v = 0; v < 256; v++) s += hist[ch][v] * Math.max(0, Math.min(255, (v - lo[ch]) * 255 / (hi[ch] - lo[ch]))); return s / n; });
      const avg = (mean[0] + mean[1] + mean[2]) / 3, warm = [1.12, 1, .86], gain = [0, 1, 2].map((ch) => Math.max(.7, Math.min(1.4, avg * warm[ch] / Math.max(1, mean[ch]))));
      const lut = [0, 1, 2].map((ch) => { const t = new Uint8ClampedArray(256); for (let v = 0; v < 256; v++) t[v] = v * .15 + .85 * ((v - lo[ch]) * 255 / (hi[ch] - lo[ch])) * gain[ch]; return t; });
      for (let i = 0; i < a.length; i += 4) { a[i] = lut[0][a[i]]; a[i + 1] = lut[1][a[i + 1]]; a[i + 2] = lut[2][a[i + 2]]; }
      x.putImageData(d, 0, 0); return lo.join('/') + '–' + hi.join('/');
    } catch (e) { return 'skipped'; }
  }
  // test/debug hook (headless previews): set the crop exactly
  window.__pfPhoto = { crop(nz, nx, ny) { setZoom(nz); ox = nx; oy = ny; draw(); return { z, ox, oy, base }; } };
  return { apply };
}
