/**
 * shared/ecosystem-nav.js — tiny self-injecting switcher: Beats | DJ Booth | Player
 * Include with ONE tag (any app on this origin):
 *   <script type="module" src="../shared/ecosystem-nav.js"></script>            (thin bar at top of <body>, in flow)
 *   <script type="module" src="../shared/ecosystem-nav.js?mode=pill&pos=br"></script>  (floating pill; pos = tl|tr|bl|br)
 *   <script type="module" src="../shared/ecosystem-nav.js?mode=inline&target=%23navslot"></script> (render inside an element)
 * Highlights the current app. The Player link shows a badge with the number of tracks
 * added to the shared store (shared/media-store.js) since the Player was last opened.
 * Styles live in a shadow root, so it cannot clash with the host app's CSS.
 */
import { openMediaDB, STORE, onMediaChange } from './media-store.js';

const SEEN_KEY = 'islepin-media-seen-at';
const params = new URL(import.meta.url).searchParams;
const mode = (params.get('mode') || 'bar').toLowerCase();
const pos = (params.get('pos') || 'br').toLowerCase();
const target = params.get('target');
const base = new URL('../', import.meta.url);
const APPS = [
  { key: 'beats', label: 'Beats', href: new URL('beats/', base).href, icon: 'M3 12h3l2-6 4 12 3-9 2 3h4' },
  { key: 'dj', label: 'DJ Booth', href: new URL('dj/', base).href, icon: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 6a3 3 0 1 1 0 6 3 3 0 0 1 0-6z' },
  { key: 'player', label: 'Player', href: new URL('player/', base).href, icon: 'M8 5v14l11-7z' },
];
const path = location.pathname;
const current = /\/player\//.test(path) ? 'player' : /\/dj\//.test(path) ? 'dj' : /\/beats\//.test(path) ? 'beats' : '';

function getSeen() { return +(localStorage.getItem(SEEN_KEY) || 0); }
function markSeen() { try { localStorage.setItem(SEEN_KEY, String(Date.now())); } catch (e) {} }

async function countNew() {
  try {
    const db = await openMediaDB();
    return await new Promise((res) => {
      const t = db.transaction(STORE, 'readonly');
      const r = t.objectStore(STORE).index('createdAt').count(IDBKeyRange.lowerBound(getSeen(), true));
      r.onsuccess = () => res(r.result || 0);
      r.onerror = () => res(0);
    });
  } catch (e) { return 0; }
}

const css = `
:host{all:initial;font:600 12.5px/1 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#e9e6ff;z-index:2147483000}
.wrap{display:flex;align-items:center;gap:8px;box-sizing:border-box}
.bar{width:100%;height:34px;padding:0 10px;background:linear-gradient(90deg,#0b0716ee,#140b26ee 50%,#0b0716ee);border-bottom:1px solid #ffffff14;justify-content:center}
.pill{position:fixed;padding:4px;border-radius:999px;background:#0e0a1ccc;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border:1px solid #ffffff1f;box-shadow:0 6px 24px #0008}
.tl{top:10px;left:10px}.tr{top:10px;right:10px}.bl{bottom:10px;left:10px}.br{bottom:10px;right:10px}
.brand{font-weight:800;font-style:italic;letter-spacing:.02em;color:#ffc531;margin-right:6px;white-space:nowrap}
.seg{display:flex;gap:2px;padding:2px;border-radius:999px;background:#ffffff0d}
a{all:unset;cursor:pointer;display:flex;align-items:center;gap:6px;padding:6px 11px;border-radius:999px;color:#c9c3e6;white-space:nowrap;position:relative;transition:background .15s,color .15s}
a:hover{background:#ffffff14;color:#fff}
a:focus-visible{outline:2px solid #22e3ff;outline-offset:1px}
a[aria-current="page"]{background:linear-gradient(90deg,#ff2bd6,#7a5cff 60%,#22e3ff);color:#fff;box-shadow:0 0 14px #ff2bd655}
svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
a[data-k="player"] svg,a[data-k="dj"] svg{fill:currentColor;stroke:none}
.badge{min-width:16px;height:16px;padding:0 4px;border-radius:999px;background:#ffc531;color:#1a1200;font-size:10.5px;font-weight:800;display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box}
.badge[hidden]{display:none}
@media (max-width:420px){.brand{display:none}a{padding:6px 9px}}
`;

function build() {
  const host = document.createElement('islepin-ecosystem-nav');
  host.setAttribute('role', 'navigation');
  host.setAttribute('aria-label', 'IslePin music apps');
  const root = host.attachShadow({ mode: 'open' });
  const cls = mode === 'pill' ? `wrap pill ${['tl', 'tr', 'bl', 'br'].includes(pos) ? pos : 'br'}` : mode === 'inline' ? 'wrap' : 'wrap bar';
  root.innerHTML = `<style>${css}</style><div class="${cls}" part="nav">
    ${mode === 'bar' ? '<span class="brand">IslePin Music</span>' : ''}
    <div class="seg">${APPS.map((a) => `<a data-k="${a.key}" href="${a.href}"${a.key === current ? ' aria-current="page"' : ''} title="${a.label}">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="${a.icon}"/></svg><span>${a.label}</span>${a.key === 'player' ? '<span class="badge" hidden></span>' : ''}</a>`).join('')}</div></div>`;
  if (mode === 'bar') { host.style.cssText = 'display:block;position:relative;'; }
  const badge = root.querySelector('.badge');
  async function refresh() {
    if (current === 'player' && document.visibilityState === 'visible') markSeen();
    const n = await countNew();
    badge.textContent = n > 99 ? '99+' : String(n);
    badge.hidden = n === 0;
    badge.title = n ? `${n} new track${n > 1 ? 's' : ''} in your library` : '';
    host.dataset.newCount = String(n);
  }
  return { host, refresh };
}

function mount() {
  if (document.querySelector('islepin-ecosystem-nav')) return; // only once
  const { host, refresh } = build();
  const slot = target ? document.querySelector(target) : null;
  if (mode === 'inline' && slot) slot.appendChild(host);
  else if (mode === 'pill') document.body.appendChild(host);
  else document.body.prepend(host);
  refresh();
  onMediaChange(() => refresh());
  addEventListener('storage', (e) => { if (e.key === SEEN_KEY) refresh(); });
  document.addEventListener('visibilitychange', refresh);
  window.IslePinNav = { refresh, markSeen };
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
else mount();
