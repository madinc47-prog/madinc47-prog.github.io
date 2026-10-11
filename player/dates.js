// Psycho Fingers Player — "My dates": birthdays / anniversaries the DJ shouts out on the day (once when the set starts,
// then now and then during the set), plus a heads-up for your girl's birthday the week before and the day before.
// Import from any calendar's .ics export (Google Calendar → Settings → Import & export → Export; Apple/Outlook: export
// .ics) — pick which events to keep (birthdays are ticked). Everything stays on this device.
// Voice: rendered on this device with the same Kokoro voice (cached); the phone's own voice only if that can't run.
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const PARTNER = /^(girlfriend|wife|fianc[eé]e?|partner|my girl|gf|boyfriend|husband|bf)$/i;
const DAY_EVERY_MS = 18 * 60000;

export function parseICS(text) {
  const raw = String(text || '').replace(/\r?\n[ \t]/g, ''); const out = [];
  const blocks = raw.split(/BEGIN:VEVENT/).slice(1);
  for (const b of blocks) {
    const body = b.split(/END:VEVENT/)[0]; const get = (k) => { const m = new RegExp('^' + k + '(;[^:\\n]*)?:(.*)$', 'mi').exec(body); return m ? m[2].trim() : ''; };
    const sum = get('SUMMARY').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\n/gi, ' ');
    const ds = get('DTSTART'); const m = /^(\d{4})(\d{2})(\d{2})/.exec(ds); if (!sum || !m) continue;
    const rr = get('RRULE'), cat = get('CATEGORIES');
    const bday = /birthday|b-?day|cumplea|anniversaire|geburtstag/i.test(sum) || /BIRTHDAY/i.test(cat) || /birthday/i.test(get('X-GOOGLE-CALENDAR-CONTENT-TITLE'));
    const anniv = /anniversary/i.test(sum);
    const name = sum.replace(/(['’]s)?\s*(birthday|b-?day|anniversary)\s*/i, ' ').replace(/^(happy|birthday|anniversary)\s*[-–:]?\s*/i, '').replace(/\s*[-–:]\s*$/, '').trim() || sum;
    out.push({ sum, name, date: `${m[1]}-${m[2]}-${m[3]}`, yearly: /FREQ=YEARLY/i.test(rr) || bday || anniv, type: bday ? 'birthday' : anniv ? 'anniversary' : 'other', pick: bday });
  }
  return out;
}

export function createDates({ hype, LS, td = () => {}, toast = () => {} }) {
  const S = Object.assign({ owner: 'Emmanuel', list: [] }, LS.get('myDates', {}));
  const said = LS.get('datesSaid', {});
  const save = () => LS.set('myDates', S), saveSaid = () => LS.set('datesSaid', said);
  const today0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  /** next occurrence (today counts) → days away */
  function daysAway(e, base = today0()) {
    const [y, mo, d] = e.date.split('-').map(Number);
    let t = new Date(e.yearly ? base.getFullYear() : y, mo - 1, d);
    if (e.yearly && t < base) t = new Date(base.getFullYear() + 1, mo - 1, d);
    return Math.round((t - base) / 864e5);
  }
  const isPartner = (e) => PARTNER.test((e.relation || '').trim());
  function lineFor(e, kind) {
    const n = e.name, me = S.owner || 'Emmanuel', girl = /boyfriend|husband|bf/i.test(e.relation || '') ? 'man' : 'girl';
    if (kind === 'week') return `Yo ${me}, your ${girl}'s birthday is next week. Don't forget!`;
    if (kind === 'tomorrow') return e.type === 'birthday' ? `Yo ${me}, your ${girl}'s birthday is tomorrow, don't forget!` : `Yo ${me}, ${n}'s ${e.type === 'anniversary' ? 'anniversary' : 'big day'} is tomorrow, don't forget!`;
    if (e.line) return e.line.replace(/\{n\}/g, n);
    if (e.type === 'birthday') return isPartner(e) ? `Happy birthday to ${n}, the love of ${me}'s life! Make some noise!` : `Big up ${n}! Happy birthday! Make some noise!`;
    if (e.type === 'anniversary') return `Happy anniversary, ${n}! Big love!`;
    return `Big up ${n}! Today is your day!`;
  }
  /** what is due today: [{e, kind:'day'|'tomorrow'|'week', text}] */
  function due(base = today0()) {
    const out = [];
    S.list.forEach((e) => {
      const d = daysAway(e, base);
      if (d === 0) out.push({ e, kind: 'day', text: lineFor(e, 'day') });
      else if (d === 1 && (isPartner(e) || e.type === 'anniversary')) out.push({ e, kind: 'tomorrow', text: lineFor(e, 'tomorrow') });
      else if (d === 7 && isPartner(e) && e.type === 'birthday') out.push({ e, kind: 'week', text: lineFor(e, 'week') });
      if (d <= 7) td(`dates: ${e.name} (${e.type}${e.relation ? ', ' + e.relation : ''}) ${e.date}${e.yearly ? ' yearly' : ''} → in ${d} day${d === 1 ? '' : 's'}` + (d === 0 ? ' · shout-out today' : d === 1 && (isPartner(e) || e.type === 'anniversary') ? ' · heads-up (tomorrow)' : d === 7 && isPartner(e) && e.type === 'birthday' ? ' · heads-up (next week)' : ' · nothing yet'));
    });
    return out;
  }
  // speech: Kokoro on this device (cached) → buffer; else the phone's voice; the bubble always shows
  async function say(text) {
    let buf = null; try { buf = await Promise.race([hype.renderText(text), new Promise((r) => setTimeout(() => r(null), 25000))]); } catch (e) { buf = null; }
    td('dates: say "' + text + '" via ' + (buf ? 'Kokoro (on device)' : 'phone voice fallback'));
    if (buf) return hype.speak([{ buf, text, pose: 'point', lufs: -20, kind: 'date' }], { force: true });
    try { if ('speechSynthesis' in window && !hype.S.muteVoice) { const u = new SpeechSynthesisUtterance(text); u.rate = 1.05; u.pitch = .9; speechSynthesis.speak(u); } } catch (e) {}
    return hype.speak([{ text, pose: 'point', kind: 'date' }], { force: true });
  }
  const DS = { lastAt: 0, started: false, warmed: false };
  /** at load: banner/toast for today's dates and heads-ups (the voice waits until the music starts) */
  function atLoad() {
    const d = due(); if (!d.length) { td('dates: nothing today (' + S.list.length + ' saved)'); return; }
    toast('📅 ' + d.map((x) => x.text).join(' · '), { label: 'My dates', fn: () => { hype.open(); setTimeout(() => sec.scrollIntoView({ block: 'center' }), 300); } });
    // warm the on-device renders so the shout-out is ready when the set starts
    setTimeout(() => d.forEach((x) => hype.renderText(x.text).catch(() => {})), 6000);
  }
  /** player loop: once when the set starts (per day), then every ~18 min on the day */
  function tick(now, playing) {
    if (!playing || !S.list.length || hype.talking || hype.busy) return;
    const key = ymd(new Date());
    if (!DS.started) { DS.started = true; DS.firstAt = now + 9000; }
    if (now < DS.firstAt) return;
    const d = due.cache && due.cache.key === key ? due.cache.v : (due.cache = { key, v: due() }).v; if (!d.length) return;
    const k0 = key + ':start';
    if (!said[k0]) { said[k0] = 1; saveSaid(); DS.lastAt = now; td('dates: set started → ' + d.length + ' line(s)'); (async () => { hype.busy = true; try { for (const x of d) await say(x.text); } finally { hype.busy = false; } })(); return; }
    if (now - DS.lastAt > DAY_EVERY_MS) { DS.lastAt = now; const x = d.find((y) => y.kind === 'day'); if (x) { td('dates: during the set → ' + x.e.name); say(x.text); } }
  }
  // ---------------- UI (Hype panel) ----------------
  const sec = document.createElement('div'); sec.className = 'hy-sec hy-dates';
  sec.innerHTML = `<div class="hy-isle-h"><b>📅 My dates</b> <small>birthdays &amp; anniversaries the DJ shouts out on the day</small></div>
    <label class="dt-owner">Your name <input id="dtOwner" maxlength="30" autocomplete="off"></label>
    <ul class="dt-list" id="dtList"></ul>
    <form class="dt-add" id="dtAdd">
      <input name="name" placeholder="Name" maxlength="40" required aria-label="Name">
      <input name="relation" placeholder="Relation (girlfriend, mom…)" maxlength="30" aria-label="Relation" list="dtRel">
      <datalist id="dtRel"><option value="girlfriend"><option value="wife"><option value="mom"><option value="dad"><option value="friend"><option value="brother"><option value="sister"></datalist>
      <input name="date" type="date" required aria-label="Date">
      <select name="type" aria-label="Type"><option value="birthday">Birthday</option><option value="anniversary">Anniversary</option><option value="other">Other</option></select>
      <label class="dt-y"><input type="checkbox" name="yearly" checked> every year</label>
      <input name="line" placeholder="Own line (optional, {n} = name)" maxlength="120" aria-label="Own line">
      <button class="eq-btn" type="submit">Add date</button>
    </form>
    <div class="hy-isle-tools"><label class="eq-btn dt-ics">Import .ics<input type="file" id="dtIcs" accept=".ics,text/calendar" hidden></label><button type="button" class="eq-btn" id="dtTest">Test today's lines</button></div>
    <p class="hy-fine">Google Calendar: Settings → Import &amp; export → Export, then import the .ics here (a direct Google sign-in could come later). Saved on this device only.</p>
    <dialog id="dtDlg" class="sheet-dlg"><form method="dialog"><h3>Import dates</h3><p class="hy-fine">Birthdays are ticked. Untick anything you don't want shouted out.</p><ul class="dt-imp" id="dtImp"></ul><div class="dlg-row"><button value="cancel" class="chip">Cancel</button><button value="ok" class="chip primary">Add ticked</button></div></form></dialog>`;
  hype.extra.appendChild(sec);
  const $ = (s) => sec.querySelector(s);
  function paint() {
    $('#dtOwner').value = S.owner || '';
    const L = $('#dtList'); L.innerHTML = '';
    if (!S.list.length) { L.innerHTML = '<li class="hy-priv">No dates yet.</li>'; return; }
    S.list.map((e, i) => ({ e, i, d: daysAway(e) })).sort((a, b) => a.d - b.d).forEach(({ e, i, d }) => {
      const li = document.createElement('li'); li.className = 'dt-row';
      li.innerHTML = `<span class="dt-n"></span><small class="dt-m"></small><button type="button" class="linkish" aria-label="Remove">✕</button>`;
      li.querySelector('.dt-n').textContent = e.name + (e.relation ? ' (' + e.relation + ')' : '');
      li.querySelector('.dt-m').textContent = `${e.type} · ${e.date.slice(e.yearly ? 5 : 0)}${e.yearly ? ' every year' : ''} · ${d === 0 ? 'TODAY' : d === 1 ? 'tomorrow' : 'in ' + d + ' days'}`;
      li.querySelector('button').addEventListener('click', () => { S.list.splice(i, 1); save(); paint(); td('dates: removed ' + e.name); });
      L.appendChild(li);
    });
  }
  $('#dtOwner').addEventListener('change', (e) => { S.owner = e.target.value.trim() || 'Emmanuel'; save(); });
  $('#dtAdd').addEventListener('submit', (ev) => {
    ev.preventDefault(); const f = new FormData(ev.target);
    const e = { name: f.get('name').trim(), relation: f.get('relation').trim(), date: f.get('date'), type: f.get('type'), yearly: !!f.get('yearly'), line: f.get('line').trim() };
    if (!e.name || !/^\d{4}-\d{2}-\d{2}$/.test(e.date)) return;
    S.list.push(e); save(); ev.target.reset(); ev.target.yearly.checked = true; paint(); due.cache = null; td('dates: added ' + e.name + ' ' + e.type + ' ' + e.date + (e.yearly ? ' yearly' : ''));
    const d = daysAway(e); toast(d === 0 ? `Saved — ${e.name}'s day is today!` : `Saved — ${e.name}: in ${d} day${d === 1 ? '' : 's'}`);
  });
  let pending = [];
  $('#dtIcs').addEventListener('change', async (ev) => {
    const f = ev.target.files[0]; ev.target.value = ''; if (!f) return;
    pending = parseICS(await f.text()); td('dates: .ics ' + f.name + ' → ' + pending.length + ' events, ' + pending.filter((x) => x.pick).length + ' birthdays');
    const U = $('#dtImp'); U.innerHTML = '';
    if (!pending.length) { toast('No events found in that file'); return; }
    pending.slice(0, 400).forEach((x, i) => { const li = document.createElement('li'); li.innerHTML = `<label><input type="checkbox" data-i="${i}"${x.pick ? ' checked' : ''}> <span></span> <small></small></label>`; li.querySelector('span').textContent = x.sum; li.querySelector('small').textContent = x.date + (x.yearly ? ' · yearly' : ''); U.appendChild(li); });
    $('#dtDlg').showModal();
  });
  $('#dtDlg').addEventListener('close', () => {
    if ($('#dtDlg').returnValue !== 'ok') return;
    const picked = [...sec.querySelectorAll('#dtImp input:checked')].map((c) => pending[+c.dataset.i]);
    picked.forEach((x) => { if (!S.list.some((e) => e.name === x.name && e.date.slice(5) === x.date.slice(5))) S.list.push({ name: x.name, relation: '', date: x.date, type: x.type, yearly: x.yearly, line: '' }); });
    save(); paint(); due.cache = null; td('dates: imported ' + picked.length); toast(`Added ${picked.length} date${picked.length === 1 ? '' : 's'}`);
  });
  $('#dtTest').addEventListener('click', async () => { const d = due(); if (!d.length) { toast('Nothing today — the DJ will speak up on the day (and before your girl’s birthday).'); return; } for (const x of d) await say(x.text); });
  paint(); setTimeout(atLoad, 2500);
  return { due, daysAway, lineFor, tick, say, parseICS, get list() { return S.list; }, set list(v) { S.list = v; save(); paint(); due.cache = null; }, paint, S };
}
