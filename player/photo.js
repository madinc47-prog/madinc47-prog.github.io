// Psycho Fingers Player — "Use your photo": any visitor can put their own face on the DJ.
// The photo never leaves the device: it is cropped in the browser (drag to move, slider / pinch / wheel to zoom) to a
// small JPEG that is saved in localStorage ('pf-photo') and drawn inside the DJ's face outline (cap stays on top).
const KEY = 'pf-photo';
const OUT_W = 232, OUT_H = 300; // face box aspect (116 × 150 in scene units, ×2)

export function initPhoto({ scene, toast = () => {}, td = () => {} }) {
  const $ = (s) => document.querySelector(s);
  const useBtn = $('#photoBtn'), resetBtn = $('#photoReset'), input = $('#photoIn'), dlg = $('#photoDlg');
  const cv = $('#photoCv'), zoomEl = $('#photoZoom'), g = cv.getContext('2d');
  let img = null, z = 1, ox = 0, oy = 0, base = 1; // image scale = base * z, offset in canvas px from centre

  function apply(url) {
    scene.setPhoto(url || null);
    resetBtn.hidden = !url;
    useBtn.querySelector('span').textContent = url ? 'Change photo' : 'Use your photo';
  }
  let saved = null; try { saved = localStorage.getItem(KEY); } catch (e) { /* private mode */ }
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
  });
  function loadImage(f) {
    // createImageBitmap honours the phone's EXIF rotation; <img> is the fallback
    if (window.createImageBitmap) return createImageBitmap(f, { imageOrientation: 'from-image' }).catch(() => viaImg(f));
    return viaImg(f);
  }
  function viaImg(f) {
    return new Promise((res, rej) => { const u = URL.createObjectURL(f), im = new Image(); im.onload = () => { res(im); setTimeout(() => URL.revokeObjectURL(u), 1000); }; im.onerror = rej; im.src = u; });
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
    // face guide: dim outside the oval the DJ shows (the cap covers the top third)
    g.save(); g.fillStyle = 'rgba(5,4,12,.62)'; g.beginPath(); g.rect(0, 0, W, H); g.ellipse(W / 2, H * .53, W * .48, H * .46, 0, 0, Math.PI * 2, true); g.fill('evenodd');
    g.fillStyle = 'rgba(5,4,12,.55)'; g.fillRect(0, 0, W, H * .26); g.restore();
    g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 2; g.setLineDash([6, 5]); g.beginPath(); g.ellipse(W / 2, H * .53, W * .48, H * .46, 0, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
    g.fillStyle = 'rgba(255,255,255,.75)'; g.font = `${Math.round(W / 20)}px system-ui,sans-serif`; g.textAlign = 'center'; g.fillText('cap goes here', W / 2, H * .15);
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
    const url = c.toDataURL('image/jpeg', 0.86);
    try { localStorage.setItem(KEY, url); } catch (e) { toast('Not enough space on this device to keep the photo; it shows until you reload.'); td('photo: save failed (storage)'); }
    apply(url); toast('Your photo is on the DJ (saved on this device only)');
    td('photo: saved ' + OUT_W + 'x' + OUT_H + ' jpeg ' + Math.round(url.length / 1024) + ' KB, zoom ' + z.toFixed(2) + ', offset ' + Math.round(ox) + ',' + Math.round(oy));
  });
  return { apply };
}
