// Psycho Fingers Player — Record (first step of "Record mix"): captures the Player's whole output (both decks after the
// crossfader + EQ, plus shout-outs / effects) from a tap BEFORE the volume knob, so monitor volume and mute never change
// the recording. Keeps going through pause and track changes. Compressed with MediaRecorder (Opus in WebM, or MP4/AAC on
// Safari); download when you stop.
export function initRec({ getTap, td = () => {}, toast = () => {} }) {
  const btn = document.querySelector('#recBtn'), tm = document.querySelector('#recTime');
  if (!btn) return {};
  const ok = !!(window.MediaRecorder && window.AudioContext);
  if (!ok) { btn.title = 'Recording is not supported in this browser'; }
  let mr = null, chunks = [], t0 = 0, timer = 0, dest = null, bytes = 0;
  const mime = ok ? ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4'].find((m) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) || '' : '';
  const fmtT = (s) => { s = Math.floor(s); const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
  function ui(on) { btn.classList.toggle('on', on); btn.setAttribute('aria-pressed', on); btn.querySelector('span').textContent = on ? 'Stop' : 'Rec'; tm.hidden = !on; if (!on) tm.textContent = '0:00'; }
  function start() {
    if (!ok) { toast('Recording is not supported in this browser'); return; }
    const { ctx, node } = getTap(); dest = ctx.createMediaStreamDestination(); node.connect(dest);
    chunks = []; bytes = 0;
    try { mr = new MediaRecorder(dest.stream, mime ? { mimeType: mime, audioBitsPerSecond: 192000 } : undefined); } catch (e) { mr = new MediaRecorder(dest.stream); }
    mr.ondataavailable = (e) => { if (e.data && e.data.size) { chunks.push(e.data); bytes += e.data.size; } };
    mr.onstop = finish; mr.start(1000); t0 = performance.now();
    timer = setInterval(() => { tm.textContent = fmtT((performance.now() - t0) / 1000); }, 500);
    ui(true); td('rec: start · ' + (mr.mimeType || mime || 'default') + ' · tap before volume'); toast('Recording the mix — tap Stop to save');
  }
  function stop() { if (mr && mr.state !== 'inactive') mr.stop(); }
  function finish() {
    clearInterval(timer); const secs = (performance.now() - t0) / 1000;
    try { getTap().node.disconnect(dest); } catch (e) {}
    const type = (mr && mr.mimeType) || mime || 'audio/webm', ext = /mp4/.test(type) ? 'm4a' : 'webm';
    const blob = new Blob(chunks, { type }); chunks = []; mr = null; ui(false);
    const name = 'psycho-fingers-mix-' + (() => { const d = new Date(), z = (n) => String(n).padStart(2, '0'); return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()) + '-' + z(d.getHours()) + z(d.getMinutes()); })() + '.' + ext;
    const url = URL.createObjectURL(blob);
    td('rec: stop · ' + fmtT(secs) + ' · ' + (blob.size / 1048576).toFixed(2) + ' MB · ' + name);
    const dl = () => { const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); td('rec: download ' + name); };
    window.__pfLastRec = { blob, name, secs };
    toast('Mix recorded (' + fmtT(secs) + ')', { label: 'Download', fn: dl });
  }
  btn.addEventListener('click', () => (mr ? stop() : start()));
  td('rec: button ready · ' + (ok ? (mime || 'browser default format') : 'not supported here'));
  return { start, stop, get recording() { return !!mr; } };
}
