// Psycho Fingers Player — ?tapdebug=1 log (same idea as Beats): a small panel with the latest lines + "Copy log".
// Every feature writes plain lines here (photo, Add music, playback length, …). Off unless ?tapdebug=1.
export const TD = /[?&]tapdebug/.test(location.search);
const ALL = []; let list = null; const t0 = performance.now();
function panel() {
  if (list || !document.body) return;
  const box = document.createElement('div');
  box.id = 'pfTapDebug';
  box.style.cssText = 'position:fixed;left:6px;bottom:6px;z-index:99999;max-width:min(96vw,520px);background:rgba(0,0,0,.82);color:#b9f;font:11px/1.35 ui-monospace,monospace;padding:6px 8px;border-radius:8px;pointer-events:auto';
  const b = document.createElement('button'); b.textContent = 'Copy log'; b.style.cssText = 'font:11px system-ui;margin-bottom:4px';
  b.onclick = () => { const txt = 'Player tap debug · ' + navigator.userAgent + ' · ' + innerWidth + 'x' + innerHeight + ' · ' + location.href + '\n' + ALL.join('\n'); (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => { b.textContent = 'Copied ✓'; }, () => { b.textContent = 'Copy failed'; }); };
  list = document.createElement('ol'); list.style.cssText = 'margin:0;padding-left:16px;max-height:120px;overflow:auto';
  box.append(b, list); document.body.appendChild(box);
}
export function td(line) {
  if (!TD) return;
  const l = ((performance.now() - t0) / 1000).toFixed(1) + 's ' + line;
  ALL.push(l); if (ALL.length > 4000) ALL.shift();
  panel(); if (!list) return;
  const li = document.createElement('li'); li.textContent = l; list.appendChild(li); while (list.children.length > 8) list.firstChild.remove();
}
if (TD) { window.__pfTD = { all: () => ALL.slice(), log: td }; addEventListener('error', (e) => td('⚠ JS error: ' + (e.message || e))); addEventListener('unhandledrejection', (e) => td('⚠ promise: ' + (e.reason && e.reason.message || e.reason))); }
