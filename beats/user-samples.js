/* Island Pin Beats — "My Samples": reads the shared user-samples store (../shared/user-samples.js, filled by the DJ booth's
 * Sample Studio) and adds it to the pad Sample library as a "My Samples" category. Self-contained: it merges into
 * window.IPBLib when the library index loads and serves "samples/lib/mine/<id>.wav" from IndexedDB, so app.js is untouched.
 * Also: /beats/?sample=<id> highlights that sample, ready to Use on a pad, and a link to the Sample Studio (/dj/?studio=1). */
import { listSamples, getSample, onSamplesChange } from '../shared/user-samples.js';

const CAT = { id: 'mine', name: 'My Samples' };
let mine = [];
let lib = window.IPBLib || null;

function merge() {
  if (!lib || !Array.isArray(lib.ITEMS)) return;
  if (!lib.CATS.some((c) => c.id === CAT.id)) lib.CATS.unshift(CAT);
  for (let i = lib.ITEMS.length - 1; i >= 0; i--) if (lib.ITEMS[i].c === CAT.id) lib.ITEMS.splice(i, 1);
  mine.slice().reverse().forEach((s) => lib.ITEMS.unshift({ f: 'mine/' + s.id + '.wav', n: s.name, c: CAT.id, by: 'You (Sample Studio)', d: +s.duration || 0, k: 'your sample' + (s.tags && s.tags.length ? ' · ' + s.tags.join(', ') : '') }));
}
// catch the library index (loaded lazily by app.js) and merge "My Samples" into it
try {
  Object.defineProperty(window, 'IPBLib', { configurable: true, get() { return lib; }, set(v) { lib = v; merge(); } });
} catch (e) { /* already non-configurable: merge on refresh */ }

// serve samples/lib/mine/<id>.wav from IndexedDB (used by the library's preview and Use buttons)
const realFetch = window.fetch.bind(window);
window.fetch = function (input, init) {
  const url = typeof input === 'string' ? input : input && input.url;
  const m = url && /samples\/lib\/mine\/([^/?#]+)\.wav/.exec(url);
  if (!m) return realFetch(input, init);
  return getSample(decodeURIComponent(m[1])).then((s) => s ? new Response(s.blob, { status: 200, headers: { 'Content-Type': s.blob.type || 'audio/wav' } }) : new Response('not found', { status: 404 }));
};

function refresh() { return listSamples().then((rows) => { mine = rows; merge(); rerender(); }).catch(() => {}); }
function rerender() {   // if the library sheet is open on My Samples, nudge it to redraw
  const sheet = document.getElementById('lib-sheet');
  const on = sheet && !sheet.hidden && document.querySelector('.kb-cat.on[data-cat="mine"]');
  if (on) on.click();
}
onSamplesChange(refresh);
refresh();

// link to the Sample Studio inside the library sheet header
function addLink() {
  const head = document.querySelector('#lib-sheet .kb-head');
  if (!head || head.querySelector('.us-studio')) return;
  const a = document.createElement('a');
  a.className = 'btn small ghost us-studio'; a.href = '../dj/?studio=1'; a.target = '_blank'; a.rel = 'noopener';
  a.textContent = '🎙 Open Sample Studio'; a.title = 'Record and style your own samples in the DJ booth — they appear here under My Samples';
  a.style.marginLeft = 'auto'; a.style.marginRight = '6px';
  head.insertBefore(a, head.querySelector('#lib-close'));
}
addLink();

// /beats/?sample=<id> → banner, then open the library on My Samples with that sample highlighted
const want = new URLSearchParams(location.search).get('sample');
if (want) {
  getSample(want).then((s) => {
    if (!s) return;
    const bar = document.createElement('div');
    bar.setAttribute('role', 'status');
    bar.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:18px;z-index:9999;display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:center;max-width:calc(100% - 20px);padding:10px 14px;border-radius:12px;background:#1a1230f2;border:1px solid #ffc53188;color:#fff;font:600 13px system-ui,sans-serif;box-shadow:0 8px 30px #000a';
    bar.innerHTML = '<span></span><button type="button" style="background:#ffc531;color:#1a1200;border:0;border-radius:8px;padding:7px 12px;font-weight:800;cursor:pointer">Choose pad &amp; assign</button><button type="button" aria-label="Dismiss" style="background:none;border:0;color:#aaa;font-size:16px;cursor:pointer">✕</button>';
    bar.querySelector('span').textContent = '🎙 “' + s.name + '” from the Sample Studio is ready. Select a pad, then:';
    const [go, x] = bar.querySelectorAll('button');
    x.onclick = () => bar.remove();
    go.onclick = () => {
      const btn = document.getElementById('btn-pad-lib');
      if (!btn) return;
      btn.click();
      let tries = 0;
      (function pick() {
        const cat = document.querySelector('.kb-cat[data-cat="mine"]');
        if (!cat) { if (++tries < 40) setTimeout(pick, 100); return; }
        cat.click();
        setTimeout(() => {
          const row = document.querySelector('.lib-row[data-f="mine/' + CSS.escape(want) + '.wav"]');
          if (row) { row.scrollIntoView({ block: 'center' }); row.style.outline = '2px solid #ffc531'; row.style.borderRadius = '8px'; }
        }, 60);
      })();
      bar.remove();
    };
    document.body.appendChild(bar);
  }).catch(() => {});
}
window.IPBUserSamples = { refresh, list: () => mine.slice() };
