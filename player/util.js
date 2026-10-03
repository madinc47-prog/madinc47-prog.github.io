// Psycho Fingers Player — small helpers (no deps)

export const fmt = (s) => {
  if (!Number.isFinite(s) || s < 0) s = 0;
  s = Math.floor(s);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`;
};

export function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

const AUDIO_EXT = /\.(mp3|m4a|aac|wav|wave|ogg|oga|opus|flac|webm|weba|mp4|aif|aiff|caf)$/i;
export const isAudioFile = (f) => (f.type && /^audio\//.test(f.type)) || AUDIO_EXT.test(f.name || '') || (f.type === 'video/mp4' || f.type === 'video/webm');

export function titleFromName(name = '') {
  const base = name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim();
  const m = base.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (m) return { artist: m[1].trim(), title: m[2].trim() };
  return { artist: '', title: base || 'Untitled' };
}

// ---------- generated artwork (original, procedural) ----------
const coverCache = new Map();
function palette(seed) {
  const h1 = seed % 360, h2 = (h1 + 40 + (seed >> 9) % 80) % 360, h3 = (h1 + 180 + (seed >> 5) % 40) % 360;
  return { h1, h2, h3 };
}
function wrapText(ctx, text, maxW) {
  const words = String(text).split(/\s+/); const lines = []; let cur = '';
  for (const w of words) { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
  if (cur) lines.push(cur); return lines.slice(0, 2);
}

/** Square cover art (data URL) — retro sun over grid + title. */
export function makeCover(title = 'Untitled', artist = '', size = 512) {
  const key = `c|${title}|${artist}|${size}`;
  if (coverCache.has(key)) return coverCache.get(key);
  const seed = hash(title + '|' + artist); const { h1, h2, h3 } = palette(seed);
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d');
  const s = size / 512;
  const sky = g.createLinearGradient(0, 0, 0, size);
  sky.addColorStop(0, `hsl(${h1},70%,12%)`); sky.addColorStop(.55, `hsl(${h2},85%,45%)`); sky.addColorStop(.62, `hsl(${(h2 + 20) % 360},95%,62%)`); sky.addColorStop(.63, `hsl(${h1},60%,10%)`); sky.addColorStop(1, `hsl(${h1},70%,6%)`);
  g.fillStyle = sky; g.fillRect(0, 0, size, size);
  // stars
  g.fillStyle = 'rgba(255,255,255,.7)';
  for (let i = 0; i < 40; i++) { const r = ((seed >> (i % 24)) ^ (i * 2654435761)) >>> 0; g.fillRect((r % 512) * s, ((r >> 9) % 220) * s, 1.6 * s, 1.6 * s); }
  // sun with stripes
  const cx = size * (.5 + ((seed % 7) - 3) * .03), cy = size * .5, R = size * .24;
  const sun = g.createLinearGradient(0, cy - R, 0, cy + R);
  sun.addColorStop(0, `hsl(${(h2 + 50) % 360},100%,70%)`); sun.addColorStop(1, `hsl(${h2},100%,55%)`);
  g.save(); g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.clip(); g.fillStyle = sun; g.fillRect(cx - R, cy - R, 2 * R, 2 * R);
  g.fillStyle = `hsl(${h1},60%,12%)`;
  for (let i = 0; i < 6; i++) { const y = cy + R * (.15 + i * .15); g.fillRect(cx - R, y, 2 * R, (2 + i * 2.2) * s); }
  g.restore();
  // grid floor
  g.strokeStyle = `hsla(${h3},100%,65%,.55)`; g.lineWidth = 1.5 * s;
  const hy = size * .625;
  for (let i = 0; i < 9; i++) { const y = hy + Math.pow(i / 8, 2) * (size - hy); g.beginPath(); g.moveTo(0, y); g.lineTo(size, y); g.stroke(); }
  for (let i = -10; i <= 10; i++) { g.beginPath(); g.moveTo(size / 2 + i * 12 * s, hy); g.lineTo(size / 2 + i * 70 * s, size); g.stroke(); }
  // mountains silhouette
  g.fillStyle = `hsl(${h1},50%,8%)`; g.beginPath(); g.moveTo(0, hy);
  for (let x = 0; x <= 512; x += 32) { const r = ((seed >> (x % 20)) + x * 31) % 60; g.lineTo(x * s, hy - (10 + r) * s * (x % 64 ? 1 : .6)); }
  g.lineTo(size, hy); g.closePath(); g.fill();
  // text
  g.textBaseline = 'alphabetic'; g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 8 * s;
  g.font = `italic 900 ${46 * s}px system-ui, "Segoe UI", Roboto, sans-serif`; g.fillStyle = '#fff';
  const lines = wrapText(g, title.toUpperCase(), size * .86);
  lines.forEach((ln, i) => g.fillText(ln, 28 * s, size - (lines.length - i) * 48 * s - 30 * s + 40 * s));
  if (artist) { g.font = `600 ${22 * s}px system-ui, sans-serif`; g.fillStyle = `hsl(${(h2 + 40) % 360},100%,80%)`; g.fillText(artist, 30 * s, size - 22 * s); }
  g.shadowBlur = 0; g.font = `italic 900 ${30 * s}px system-ui, sans-serif`; g.fillStyle = 'rgba(255,255,255,.85)'; g.fillText('PF', size - 64 * s, 46 * s);
  const url = c.toDataURL('image/jpeg', .86);
  coverCache.set(key, url); return url;
}

/** Round record label (data URL) — used when a track has no artwork. */
export function makeLabel(title = 'Untitled', artist = '', size = 256) {
  const key = `l|${title}|${artist}|${size}`;
  if (coverCache.has(key)) return coverCache.get(key);
  const seed = hash(title + '|' + artist); const { h1, h2 } = palette(seed);
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'); const s = size / 256;
  const rg = g.createRadialGradient(size / 2, size / 2, 10 * s, size / 2, size / 2, size / 2);
  rg.addColorStop(0, `hsl(${(h2 + 30) % 360},100%,60%)`); rg.addColorStop(1, `hsl(${h2},95%,42%)`);
  g.fillStyle = rg; g.fillRect(0, 0, size, size);
  g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 3 * s; g.beginPath(); g.arc(size / 2, size / 2, size * .44, 0, 7); g.stroke();
  g.fillStyle = `hsl(${h1},70%,10%)`; g.textAlign = 'center';
  g.font = `italic 900 ${30 * s}px system-ui, sans-serif`;
  const t = title.length > 14 ? title.slice(0, 13) + '…' : title;
  g.fillText(t.toUpperCase(), size / 2, size * .40);
  g.font = `700 ${15 * s}px system-ui, sans-serif`; g.fillText((artist || 'PSYCHO FINGERS').slice(0, 22).toUpperCase(), size / 2, size * .74);
  g.font = `600 ${11 * s}px system-ui, sans-serif`; g.fillText('33⅓ RPM · SIDE A', size / 2, size * .86);
  const url = c.toDataURL('image/png');
  coverCache.set(key, url); return url;
}

// ---------- tiny ID3v2 reader (title / artist / picture) ----------
export async function readTags(blob) {
  try {
    const head = new Uint8Array(await blob.slice(0, 10).arrayBuffer());
    if (head[0] !== 0x49 || head[1] !== 0x44 || head[2] !== 0x33) return {};
    const ver = head[3], flags = head[5];
    const size = (head[6] << 21) | (head[7] << 14) | (head[8] << 7) | head[9];
    if (size > 8e6) return {};
    let buf = new Uint8Array(await blob.slice(10, 10 + size).arrayBuffer());
    if (flags & 0x80) { const out = []; for (let i = 0; i < buf.length; i++) { out.push(buf[i]); if (buf[i] === 0xff && buf[i + 1] === 0) i++; } buf = new Uint8Array(out); }
    let p = 0; if (flags & 0x40 && ver >= 3) { const ext = ver === 4 ? ((buf[0] << 21) | (buf[1] << 14) | (buf[2] << 7) | buf[3]) : ((buf[0] << 24) | (buf[1] << 16) | (buf[2] << 8) | buf[3]) + 4; p = ext; }
    const tags = {};
    const dec = (enc, bytes) => {
      try {
        if (enc === 0) return new TextDecoder('latin1').decode(bytes).replace(/\0+$/, '');
        if (enc === 1) return new TextDecoder('utf-16').decode(bytes).replace(/\0+$/, '');
        if (enc === 2) return new TextDecoder('utf-16be').decode(bytes).replace(/\0+$/, '');
        return new TextDecoder('utf-8').decode(bytes).replace(/\0+$/, '');
      } catch (e) { return ''; }
    };
    const idLen = ver === 2 ? 3 : 4, hdrLen = ver === 2 ? 6 : 10;
    while (p + hdrLen < buf.length) {
      const id = String.fromCharCode(...buf.subarray(p, p + idLen));
      if (!/^[A-Z0-9]+$/.test(id)) break;
      let fs;
      if (ver === 2) fs = (buf[p + 3] << 16) | (buf[p + 4] << 8) | buf[p + 5];
      else if (ver === 4) fs = (buf[p + 4] << 21) | (buf[p + 5] << 14) | (buf[p + 6] << 7) | buf[p + 7];
      else fs = (buf[p + 4] << 24) | (buf[p + 5] << 16) | (buf[p + 6] << 8) | buf[p + 7];
      const data = buf.subarray(p + hdrLen, p + hdrLen + fs);
      if (id === 'TIT2' || id === 'TT2') tags.title = dec(data[0], data.subarray(1)).trim();
      else if (id === 'TPE1' || id === 'TP1') tags.artist = dec(data[0], data.subarray(1)).trim();
      else if ((id === 'APIC' || id === 'PIC') && !tags.picture) {
        const enc = data[0]; let q = 1, mime;
        if (id === 'PIC') { const f = String.fromCharCode(...data.subarray(1, 4)).toLowerCase(); mime = f === 'png' ? 'image/png' : 'image/jpeg'; q = 4; }
        else { let e = q; while (e < data.length && data[e] !== 0) e++; mime = String.fromCharCode(...data.subarray(q, e)) || 'image/jpeg'; q = e + 1; if (!mime.includes('/')) mime = 'image/' + mime.toLowerCase(); }
        q++; // picture type
        if (enc === 1 || enc === 2) { while (q + 1 < data.length && !(data[q] === 0 && data[q + 1] === 0)) q += 2; q += 2; }
        else { while (q < data.length && data[q] !== 0) q++; q++; }
        if (q < data.length) tags.picture = new Blob([data.slice(q)], { type: mime });
      }
      p += hdrLen + fs;
    }
    return tags;
  } catch (e) { return {}; }
}

/** Duration via a throwaway <audio> (cheap, no decode). */
export function probeDuration(url) {
  return new Promise((res) => {
    const a = new Audio(); a.preload = 'metadata'; let done = false;
    const fin = (v) => { if (done) return; done = true; a.removeAttribute('src'); a.load(); res(v); };
    a.onloadedmetadata = () => fin(Number.isFinite(a.duration) ? a.duration : 0);
    a.onerror = () => fin(0); setTimeout(() => fin(0), 8000); a.src = url;
  });
}

/** Peaks for the waveform seek bar. */
export async function computePeaks(arrayBuffer, bins = 800) {
  const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const ctx = new Ctx(1, 1, 44100);
  const ab = await ctx.decodeAudioData(arrayBuffer);
  const ch0 = ab.getChannelData(0), ch1 = ab.numberOfChannels > 1 ? ab.getChannelData(1) : ch0;
  const step = Math.max(1, Math.floor(ch0.length / bins)); const peaks = new Float32Array(bins);
  let max = 0;
  for (let b = 0; b < bins; b++) {
    let m = 0, sum = 0; const st = b * step, en = Math.min(ch0.length, st + step);
    for (let i = st; i < en; i += 4) { const v = (Math.abs(ch0[i]) + Math.abs(ch1[i])) * .5; sum += v * v; if (v > m) m = v; }
    const rms = Math.sqrt(sum / Math.max(1, (en - st) / 4)); peaks[b] = m * .55 + rms * 1.2; if (peaks[b] > max) max = peaks[b];
  }
  if (max > 0) for (let b = 0; b < bins; b++) peaks[b] /= max;
  return { peaks, duration: ab.duration };
}
