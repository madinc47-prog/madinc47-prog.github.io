// DJ Psycho Fingers Beta audio player — ⚙ Settings. Edits the player's existing pf-* keys (same keys the app already uses),
// then reloads so everything applies cleanly. Built with DOM APIs + textContent only (no innerHTML with user data).
const K = (k) => 'pf-' + k;
const get = (k, d) => { try { const v = localStorage.getItem(K(k)); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
const put = (k, v) => { try { localStorage.setItem(K(k), JSON.stringify(v)); } catch (e) { /* private mode */ } };
const el = (t, a = {}, kids = []) => { const e = document.createElement(t); for (const [k, v] of Object.entries(a)) { if (k === 'text') e.textContent = v; else e.setAttribute(k, v); } kids.forEach((c) => e.appendChild(c)); return e; };
function sel(id, label, opts, val) { const s = el('select', { id }); opts.forEach(([v, t]) => { const o = el('option', { value: v, text: t }); if (String(v) === String(val)) o.selected = true; s.appendChild(o); }); return row(label, s); }
function chk(id, label, on) { const c = el('input', { id, type: 'checkbox' }); c.checked = !!on; return row(label, c); }
function rng(id, label, min, max, step, val) { const r = el('input', { id, type: 'range', min, max, step }); r.value = val; return row(label, r); }
function row(label, ctl) { const l = el('label', { class: 'pfs-row' }, [el('span', { text: label }), ctl]); return l; }
function build() {
  const hype = get('hype', {});
  const d = el('dialog', { id: 'pfSettings', class: 'dlg pfs' });
  const f = el('form', { method: 'dialog' });
  f.append(el('h2', { text: '⚙ Settings — saved on this device' }),
    sel('pfs-dj', 'DJ on the decks', [['emmanuel', 'DJ Emmanuel'], ['psycho', 'DJ Psycho Fingers']], get('djVariant', 'emmanuel')),
    chk('pfs-hype', 'DJ shout-outs on', hype.on !== false),
    sel('pfs-freq', 'Shout-out density', [['low', 'Low'], ['med', 'Medium'], ['high', 'High']], hype.freq || 'high'),
    rng('pfs-hvol', 'Shout-out volume', 0, 1, 0.05, hype.vol == null ? 0.6 : hype.vol),
    sel('pfs-isle', 'Island shout-outs', [['random', 'Random around the island'], ['picks', 'Only my picks'], ['off', 'Off (just my town)']], get('isleMode', 'random')),
    rng('pfs-vol', 'Volume', 0, 1, 0.01, get('vol', 0.85)),
    rng('pfs-xf', 'Crossfade (seconds)', 0, 12, 1, get('xfade', 6)),
    chk('pfs-auto', 'Auto mix', get('autoMix', true)),
    chk('pfs-shuf', 'Shuffle', get('shuffle', false)),
    sel('pfs-rep', 'Repeat', [['all', 'All'], ['one', 'One'], ['off', 'Off']], get('repeat', 'all')),
    sel('pfs-theme', 'Scene', [['club', 'Club'], ['island', 'Island'], ['neon', 'Neon'], ['minimal', 'Minimal']], get('theme', 'club')),
    sel('pfs-anim', 'DJ animation', [['full', 'Full performance'], ['quick', 'Quick'], ['off', 'Off (instant start)']], get('anim', 'full')),
    chk('pfs-save', 'Save imports to My Tracks', get('saveImports', true)));
  const bar = el('div', { class: 'pfs-bar' }, [el('button', { value: 'cancel', class: 'btn', text: 'Cancel' }), el('button', { value: 'ok', class: 'btn primary', text: 'Save & apply' })]);
  f.appendChild(bar); d.appendChild(f); document.body.appendChild(d);
  d.addEventListener('close', () => {
    if (d.returnValue !== 'ok') return;
    const v = (id) => document.getElementById(id), h = Object.assign({}, get('hype', {}));
    put('djVariant', v('pfs-dj').value); h.on = v('pfs-hype').checked; h.freq = v('pfs-freq').value; h.vol = +v('pfs-hvol').value; put('hype', h);
    put('isleMode', v('pfs-isle').value); put('vol', +v('pfs-vol').value); put('xfade', +v('pfs-xf').value); put('autoMix', v('pfs-auto').checked);
    put('shuffle', v('pfs-shuf').checked); put('repeat', v('pfs-rep').value); put('theme', v('pfs-theme').value); put('anim', v('pfs-anim').value); put('saveImports', v('pfs-save').checked);
    location.replace(location.pathname + location.search); // reload applies everything; playback restarts from your queue
  });
  return d;
}
function open() { (document.getElementById('pfSettings') || build()).showModal(); }
const st = el('style', { text: '.pfs{max-width:min(560px,94vw)}.pfs form{display:grid;gap:4px}.pfs h2{font-size:1rem;margin:0 0 8px}.pfs-row{display:flex!important;flex-direction:row!important;text-align:left;justify-content:space-between;align-items:center;gap:12px;min-height:52px;border-top:1px solid #ffffff1a}.pfs{color-scheme:dark}.pfs-row select{background:#1b1630;color:#eee;border:1px solid #ffffff33;border-radius:8px;padding:0 8px}.pfs-row select,.pfs-row input[type=range]{min-height:44px;width:50%;min-width:50%;margin:0}.pfs-row input[type=checkbox]{width:26px;height:26px}.pfs-bar{display:flex;gap:10px;justify-content:flex-end;margin-top:10px}.pfs-bar .btn{min-height:48px;padding:0 18px}.pfs-btn{min-width:44px;min-height:44px}' });
document.head.appendChild(st);
const menu = document.getElementById('mainMenu');
if (menu) { const b = el('button', { role: 'menuitem', 'data-pfs': '1', text: '⚙ Settings' }); menu.insertBefore(b, menu.firstChild); b.addEventListener('click', () => { menu.hidden = true; open(); }); }
const mb = document.getElementById('menuBtn');
if (mb) { const g = el('button', { class: 'icon-btn pfs-btn', type: 'button', 'aria-label': 'Settings', title: 'Settings', text: '⚙' }); mb.parentNode.insertBefore(g, mb); g.addEventListener('click', open); }
if (location.hash === '#settings') setTimeout(open, 400);
export { open };
