// Psycho Fingers Player — Record mix. Captures the Player's whole output (both decks after the crossfader + EQ, plus
// shout-outs / effects) from a tap BEFORE the volume knob, so monitor volume and mute never change the recording.
// Keeps going through pause and track changes. Always writes lossless WAV (16-bit stereo PCM from an AudioWorklet) and,
// where the browser can, a compressed copy (MediaRecorder: Opus/WebM, or AAC/MP4 on Safari). Both stream to IndexedDB in
// small chunks while recording, so hour-long sets don't sit in memory; storage is checked before and during. The last
// recordings stay on this device (list with Download WAV / compressed, Delete).
const DB = 'pf-rec', MB = 1048576;
const idb = (() => {
  let p = null;
  const open = () => p || (p = new Promise((res, rej) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('recs', { keyPath: 'id' }); const c = d.createObjectStore('chunks', { autoIncrement: true }); c.createIndex('rec', ['rec', 'kind', 'i']); }; r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }));
  const tx = async (stores, mode, fn) => { const d = await open(); return new Promise((res, rej) => { const t = d.transaction(stores, mode); let out; Promise.resolve(fn(t)).then((v) => { out = v; }); t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); }); };
  const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  return {
    putRec: (m) => tx(['recs'], 'readwrite', (t) => req(t.objectStore('recs').put(m))),
    recs: () => tx(['recs'], 'readonly', (t) => req(t.objectStore('recs').getAll())),
    addChunk: (rec, kind, i, data) => tx(['chunks'], 'readwrite', (t) => req(t.objectStore('chunks').add({ rec, kind, i, data }))),
    chunks: (rec, kind) => tx(['chunks'], 'readonly', (t) => req(t.objectStore('chunks').index('rec').getAll(IDBKeyRange.bound([rec, kind, 0], [rec, kind, Infinity])))),
    del: (rec) => tx(['recs', 'chunks'], 'readwrite', async (t) => { t.objectStore('recs').delete(rec); const ix = t.objectStore('chunks').index('rec'); const keys = await req(ix.getAllKeys(IDBKeyRange.bound([rec, '', 0], [rec, '\uffff', Infinity]))); keys.forEach((k) => t.objectStore('chunks').delete(k)); }),
  };
})();
const WORKLET = `class R extends AudioWorkletProcessor{constructor(){super();this.n=0;this.L=new Float32Array(8192);this.R=new Float32Array(8192);this.on=true;this.port.onmessage=(e)=>{if(e.data==='stop'){this.flush();this.on=false;}}}
flush(){if(!this.n)return;const l=this.L.slice(0,this.n),r=this.R.slice(0,this.n);this.port.postMessage([l,r],[l.buffer,r.buffer]);this.n=0;}
process(i){if(!this.on)return false;const c=i[0];if(c&&c.length){const a=c[0],b=c[1]||c[0];for(let k=0;k<a.length;k++){this.L[this.n]=a[k];this.R[this.n]=b[k];if(++this.n===8192)this.flush();}}return true}}registerProcessor('pf-rec',R)`;
const fmtT = (s) => { s = Math.floor(s); const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
const stamp = () => { const d = new Date(), z = (n) => String(n).padStart(2, '0'); return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()) + '-' + z(d.getHours()) + z(d.getMinutes()); };
function wavHeader(bytes, sr, ch = 2) {
  const b = new ArrayBuffer(44), v = new DataView(b), s = (o, t) => { for (let i = 0; i < 4; i++) v.setUint8(o + i, t.charCodeAt(i)); };
  s(0, 'RIFF'); v.setUint32(4, 36 + bytes, true); s(8, 'WAVE'); s(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true); s(36, 'data'); v.setUint32(40, bytes, true); return b;
}

export function initRec({ getTap, td = () => {}, toast = () => {} }) {
  const btn = document.querySelector('#recBtn'), tm = document.querySelector('#recTime'), dlg = document.querySelector('#recDlg');
  if (!btn) return {};
  const canComp = !!window.MediaRecorder;
  const mime = canComp ? ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4'].find((m) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) || '' : '';
  let R = null; // current recording
  function ui(on) { btn.classList.toggle('on', on); btn.setAttribute('aria-pressed', on); btn.querySelector('span').textContent = on ? 'Stop' : 'Rec'; tm.hidden = !on; if (!on) tm.textContent = '0:00'; }
  async function freeMB() { try { const e = await navigator.storage.estimate(); return (e.quota - e.usage) / MB; } catch (e) { return null; } }
  async function start() {
    const { ctx, node } = getTap(); const sr = ctx.sampleRate;
    const free = await freeMB(); const perMin = sr * 4 * 60 / MB + (mime ? 1.5 : 0);
    if (free != null && free < perMin * 10) toast(`Storage is low: about ${Math.max(0, Math.floor(free / perMin))} min of recording fits on this device. Delete old mixes to make room.`);
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    const id = 'mix-' + Date.now().toString(36);
    R = { id, name: 'psycho-fingers-mix-' + stamp(), sr, t0: performance.now(), frames: 0, wavI: 0, compI: 0, wavBytes: 0, compBytes: 0, pend: [], pendFrames: 0, writes: Promise.resolve(), mime, warned: false, ctx, node };
    await idb.putRec({ id, name: R.name, start: Date.now(), secs: 0, sr, wavBytes: 0, compBytes: 0, mime, done: false });
    // lossless PCM tap
    try {
      if (!ctx.audioWorklet) throw new Error('no AudioWorklet');
      if (!ctx.__pfRecWorklet) ctx.__pfRecWorklet = ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' })));
      await ctx.__pfRecWorklet;
      R.wn = new AudioWorkletNode(ctx, 'pf-rec', { numberOfInputs: 1, numberOfOutputs: 0, channelCount: 2, channelCountMode: 'explicit' });
      R.wn.port.onmessage = (e) => onPCM(e.data[0], e.data[1]); node.connect(R.wn);
    } catch (e) {
      const sp = ctx.createScriptProcessor(4096, 2, 2); sp.onaudioprocess = (ev) => onPCM(ev.inputBuffer.getChannelData(0).slice(0), ev.inputBuffer.getChannelData(1).slice(0));
      const mute = ctx.createGain(); mute.gain.value = 0; node.connect(sp); sp.connect(mute); mute.connect(ctx.destination); R.sp = sp; R.spMute = mute; td('rec: AudioWorklet unavailable, using ScriptProcessor');
    }
    // compressed copy
    if (mime) {
      R.dest = ctx.createMediaStreamDestination(); node.connect(R.dest);
      try { R.mr = new MediaRecorder(R.dest.stream, { mimeType: mime, audioBitsPerSecond: 192000 }); } catch (e) { R.mr = new MediaRecorder(R.dest.stream); }
      R.mr.ondataavailable = (e) => { if (e.data && e.data.size && R) { const r = R, i = r.compI++; r.compBytes += e.data.size; r.writes = r.writes.then(() => idb.addChunk(r.id, 'comp', i, e.data)).catch((er) => storageFail(er)); } };
      R.mrDone = new Promise((res) => { R.mr.onstop = res; }); R.mr.start(5000);
    }
    R.timer = setInterval(tickUI, 500); R.chk = setInterval(checkStorage, 60000);
    ui(true); td('rec: start · WAV ' + sr + ' Hz stereo' + (mime ? ' + ' + mime : '') + ' · tap before volume · free ' + (free != null ? Math.round(free) + ' MB' : '?'));
    toast('Recording the mix — tap Stop to save');
  }
  function onPCM(L, Rt) {
    const r = R; if (!r) return; r.pend.push([L, Rt]); r.pendFrames += L.length; r.frames += L.length;
    if (r.pendFrames >= r.sr * 2) flushPCM(r);
  }
  function flushPCM(r) {
    if (!r.pendFrames) return; const out = new Int16Array(r.pendFrames * 2); let o = 0;
    for (const [L, Rt] of r.pend) for (let k = 0; k < L.length; k++) { const a = Math.max(-1, Math.min(1, L[k])), b = Math.max(-1, Math.min(1, Rt[k])); out[o++] = a < 0 ? a * 32768 : a * 32767; out[o++] = b < 0 ? b * 32768 : b * 32767; }
    r.pend = []; r.pendFrames = 0; const i = r.wavI++; r.wavBytes += out.byteLength;
    r.writes = r.writes.then(() => idb.addChunk(r.id, 'wav', i, out.buffer)).catch((er) => storageFail(er));
  }
  function storageFail(er) { td('rec: storage write failed ' + (er && er.name)); if (R && !R.warned) { R.warned = true; toast('This device ran out of space for the recording — stopping and saving what was captured.'); stop(); } }
  async function checkStorage() { const f = await freeMB(); if (R && f != null && f < 200) { toast(`Storage low: ~${Math.round(f)} MB left on this device for the recording.`); td('rec: storage low ' + Math.round(f) + ' MB'); } }
  function tickUI() { if (!R) return; tm.textContent = fmtT((performance.now() - R.t0) / 1000); }
  async function stop() {
    const r = R; if (!r) return; R = null; clearInterval(r.timer); clearInterval(r.chk); ui(false); btn.disabled = true;
    try { if (r.wn) { r.wn.port.postMessage('stop'); await new Promise((res) => setTimeout(res, 120)); r.node.disconnect(r.wn); r.wn.port.onmessage = null; } if (r.sp) { r.node.disconnect(r.sp); r.sp.disconnect(); r.spMute.disconnect(); } } catch (e) {}
    R = r; flushPCM(r); R = null;
    if (r.mr && r.mr.state !== 'inactive') { const R2 = r; R = R2; r.mr.stop(); await r.mrDone; R = null; try { r.node.disconnect(r.dest); } catch (e) {} }
    await r.writes.catch(() => {});
    const secs = r.frames / r.sr;
    await idb.putRec({ id: r.id, name: r.name, start: Date.now() - secs * 1000, secs, sr: r.sr, wavBytes: r.wavBytes, compBytes: r.compBytes, mime: r.mime, done: true });
    btn.disabled = false;
    td('rec: stop · ' + fmtT(secs) + ' · WAV ' + (r.wavBytes / MB).toFixed(1) + ' MB' + (r.compBytes ? ' · ' + (r.mime.includes('mp4') ? 'M4A' : 'Opus') + ' ' + (r.compBytes / MB).toFixed(2) + ' MB' : '') + ' · saved on this device');
    toast('Mix saved on this device (' + fmtT(secs) + ')', { label: 'Download', fn: () => openList() });
    window.__pfLastRec = { id: r.id, secs, wavBytes: r.wavBytes, compBytes: r.compBytes };
    paintList();
  }
  async function blobFor(m, kind) {
    const ch = await idb.chunks(m.id, kind); ch.sort((a, b) => a.i - b.i);
    if (kind === 'wav') { const bytes = ch.reduce((a, c) => a + c.data.byteLength, 0); return new Blob([wavHeader(bytes, m.sr), ...ch.map((c) => c.data)], { type: 'audio/wav' }); }
    return new Blob(ch.map((c) => c.data), { type: m.mime || 'audio/webm' });
  }
  async function download(m, kind) {
    const b = await blobFor(m, kind); const ext = kind === 'wav' ? 'wav' : (m.mime || '').includes('mp4') ? 'm4a' : 'webm';
    const u = URL.createObjectURL(b), a = document.createElement('a'); a.href = u; a.download = m.name + '.' + ext; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 60000);
    td('rec: download ' + a.download + ' · ' + (b.size / MB).toFixed(1) + ' MB'); return b;
  }
  async function paintList() {
    if (!dlg) return; const ul = dlg.querySelector('.rec-list'); const all = (await idb.recs()).sort((a, b) => b.start - a.start);
    ul.innerHTML = all.length ? '' : '<li class="empty">No mixes yet. Tap REC while the music plays.</li>';
    all.forEach((m) => {
      const li = document.createElement('li'); li.innerHTML = `<div class="rm"><b></b><small></small></div><div class="ra"><button class="btn small" data-k="wav">WAV</button>${m.compBytes ? `<button class="btn ghost small" data-k="comp">${(m.mime || '').includes('mp4') ? 'M4A' : 'Opus'}</button>` : ''}<button class="btn ghost small del" title="Delete">✕</button></div>`;
      li.querySelector('b').textContent = m.name; li.querySelector('small').textContent = `${new Date(m.start).toLocaleString()} · ${fmtT(m.secs || 0)} · WAV ${((m.wavBytes || 0) / MB).toFixed(1)} MB${m.compBytes ? ' · ' + (m.compBytes / MB).toFixed(1) + ' MB compressed' : ''}${m.done ? '' : ' · (interrupted)'}`;
      li.querySelectorAll('[data-k]').forEach((b) => b.addEventListener('click', () => download(m, b.dataset.k)));
      li.querySelector('.del').addEventListener('click', async () => { if (!confirm(`Delete “${m.name}” from this device?`)) return; await idb.del(m.id); td('rec: deleted ' + m.name); paintList(); });
      ul.appendChild(li);
    });
    const f = await freeMB(); dlg.querySelector('.rec-free').textContent = f != null ? `About ${Math.round(f / (44100 * 4 * 60 / MB))} min of WAV recording space left on this device.` : '';
  }
  function openList() { paintList(); dlg && !dlg.open && dlg.showModal(); }
  btn.addEventListener('click', () => (R ? stop() : start().catch((e) => { td('rec: start failed ' + e.message); toast('Could not start recording: ' + e.message); R = null; ui(false); })));
  const lb = document.querySelector('#recList'); lb && lb.addEventListener('click', openList);
  td('rec: ready · WAV always' + (mime ? ' + ' + mime : ''));
  return { start, stop, openList, blobFor, recs: () => idb.recs(), get recording() { return !!R; } };
}
