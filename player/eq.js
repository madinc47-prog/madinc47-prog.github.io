// Psycho Fingers Player — master 10-band graphic EQ (after the crossfader). Web Audio only, no deps.
// mix bus → split: [dry] | [headroom → bass-boost low shelf → 10 × peaking (Q 1.4 ≈ 1 octave)] → out
// Ideas borrowed from the DJ booth's PSYCHO EQ (dj/dj-psychoeq.js): band layout, Q, presets, A/B bypass, curve over a live spectrum.
export const FREQS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
const LBL = ['31', '62', '125', '250', '500', '1k', '2k', '4k', '8k', '16k'];
export const PRESETS = {
  'Flat': [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  'Club': [5, 4, 1, 0, -2, -1, 0, 2, 3, 3],
  'Hip-Hop': [5, 4, 2, 0, -1, -1, 0, 1, 2, 2],
  'Trap 808': [7, 6, 2, -1, -2, -1, 0, 1, 3, 3],
  'Bass Boost': [8, 6, 4, 1, 0, 0, 0, 0, 0, 0],
  'Vocal': [-2, -2, -1, 0, 1, 2, 3, 3, 1, 0],
  'Car': [5, 4, 2, 0, -1, 0, 1, 2, 3, 2],
  'Small Speakers': [-6, -3, 2, 3, 1, 0, 0, 1, 1, 0],
  'Late Night': [3, 3, 1, 0, 0, 0, 0, -1, -2, -3],
};
const Q = 1.4, BASS_F = 100, MAXDB = 12, BASS_MAX = 12, KEY = 'pf-eq';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const db2g = (db) => Math.pow(10, db / 20);

function load() {
  const d = { bands: PRESETS.Flat.slice(), preset: 'Flat', bass: 0, bypass: false };
  try { const o = JSON.parse(localStorage.getItem(KEY) || 'null'); if (o) Object.assign(d, o); } catch (e) {}
  if (!Array.isArray(d.bands) || d.bands.length !== 10) d.bands = PRESETS.Flat.slice();
  d.bands = d.bands.map((v) => clamp(+v || 0, -MAXDB, MAXDB)); d.bass = clamp(+d.bass || 0, 0, BASS_MAX);
  return d;
}

// magnitude of a Web Audio biquad (RBJ cookbook, same maths as BiquadFilterNode)
function biquadMag(type, f0, gainDb, q, f, fs) {
  const A = Math.pow(10, gainDb / 40), w0 = 2 * Math.PI * f0 / fs, cw = Math.cos(w0), sw = Math.sin(w0);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'peaking') { const al = sw / (2 * q); b0 = 1 + al * A; b1 = -2 * cw; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cw; a2 = 1 - al / A; }
  else { const al = sw / 2 * Math.SQRT2, sA = 2 * Math.sqrt(A) * al; // lowshelf, S = 1
    b0 = A * ((A + 1) - (A - 1) * cw + sA); b1 = 2 * A * ((A - 1) - (A + 1) * cw); b2 = A * ((A + 1) - (A - 1) * cw - sA);
    a0 = (A + 1) + (A - 1) * cw + sA; a1 = -2 * ((A - 1) + (A + 1) * cw); a2 = (A + 1) + (A - 1) * cw - sA; }
  const w = 2 * Math.PI * f / fs, c1 = Math.cos(w), s1 = Math.sin(w), c2 = Math.cos(2 * w), s2 = Math.sin(2 * w);
  const nr = b0 + b1 * c1 + b2 * c2, ni = -(b1 * s1 + b2 * s2), dr = a0 + a1 * c1 + a2 * c2, di = -(a1 * s1 + a2 * s2);
  return Math.sqrt((nr * nr + ni * ni) / (dr * dr + di * di));
}

export function createEQ({ toast = () => {} } = {}) {
  const S = load();
  let N = null, ctx = null;
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
  const headroomDb = () => (S.bypass ? 0 : -0.5 * Math.max(0, ...S.bands, S.bass * 0.8));

  function attach(c, input) {
    if (N) return N.out; ctx = c;
    const g = (v) => { const n = ctx.createGain(); n.gain.value = v; return n; };
    N = { in: g(1), dry: g(S.bypass ? 1 : 0), wet: g(S.bypass ? 0 : 1), pre: g(db2g(headroomDb())), out: g(1) };
    N.bass = ctx.createBiquadFilter(); N.bass.type = 'lowshelf'; N.bass.frequency.value = BASS_F; N.bass.gain.value = S.bass;
    N.bands = FREQS.map((f, i) => { const b = ctx.createBiquadFilter(); b.type = 'peaking'; b.frequency.value = f; b.Q.value = Q; b.gain.value = S.bands[i]; return b; });
    input.connect(N.in); N.in.connect(N.dry).connect(N.out);
    let prev = N.in.connect(N.pre); prev = prev.connect(N.bass); N.bands.forEach((b) => { prev = prev.connect(b); }); prev.connect(N.wet).connect(N.out);
    N.an = ctx.createAnalyser(); N.an.fftSize = 4096; N.an.smoothingTimeConstant = .72; N.out.connect(N.an);
    N.spec = new Float32Array(N.an.frequencyBinCount);
    return N.out;
  }
  const ramp = (p, v) => { if (!ctx) return; const t = ctx.currentTime; p.cancelScheduledValues(t); p.setValueAtTime(p.value, t); p.linearRampToValueAtTime(v, t + .02); };
  function apply() {
    if (!N) return;
    N.bands.forEach((b, i) => ramp(b.gain, S.bands[i])); ramp(N.bass.gain, S.bass);
    ramp(N.pre.gain, db2g(headroomDb())); ramp(N.dry.gain, S.bypass ? 1 : 0); ramp(N.wet.gain, S.bypass ? 0 : 1);
  }
  function update(fromUser = true) { apply(); save(); paint(); }
  function setBand(i, db) { S.bands[i] = Math.round(clamp(db, -MAXDB, MAXDB) * 2) / 2; S.preset = matchPreset(); update(); }
  function setBass(db) { S.bass = Math.round(clamp(db, 0, BASS_MAX) * 2) / 2; update(); }
  function setPreset(name) { if (!PRESETS[name]) return; S.bands = PRESETS[name].slice(); S.preset = name; if (name === 'Flat') S.bass = 0; update(); }
  function setBypass(v) { S.bypass = !!v; update(); toast(S.bypass ? 'EQ: B — bypassed (flat, untouched)' : 'EQ: A — on'); }
  function reset() { S.bands = PRESETS.Flat.slice(); S.bass = 0; S.preset = 'Flat'; S.bypass = false; update(); toast('EQ reset to Flat'); }
  function matchPreset() { for (const k in PRESETS) if (PRESETS[k].every((v, i) => v === S.bands[i])) return k; return 'Custom'; }
  function response(f, fs = (ctx && ctx.sampleRate) || 48000) {
    if (S.bypass) return 0;
    let m = biquadMag('lowshelf', BASS_F, S.bass, 0, f, fs); FREQS.forEach((f0, i) => { m *= biquadMag('peaking', f0, S.bands[i], Q, f, fs); });
    return 20 * Math.log10(m) + headroomDb();
  }

  // ---------------- UI (slide-up sheet) ----------------
  const root = document.createElement('section');
  root.className = 'eq-sheet'; root.id = 'eqPanel'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'Equalizer'); root.hidden = true;
  root.innerHTML = `
    <div class="eq-grab" aria-hidden="true"></div>
    <header class="eq-head"><h3>EQ</h3><span class="eq-sub">Master · after the crossfader</span>
      <button type="button" class="eq-ab" id="eqAB" title="A = EQ on, B = bypass (instant compare)" aria-pressed="false"><b class="a">A</b><b class="b">B</b></button>
      <button type="button" class="eq-btn ghost" id="eqReset" title="Back to Flat (0 dB)">Reset</button>
      <button type="button" class="icon-btn" id="eqClose" aria-label="Close EQ" title="Close (Esc)"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></header>
    <div class="eq-presets" role="radiogroup" aria-label="EQ presets">${Object.keys(PRESETS).map((k) => `<button type="button" role="radio" data-p="${k}">${k}</button>`).join('')}<span class="eq-custom" hidden>Custom</span></div>
    <div class="eq-main">
      <div class="eq-graph"><canvas id="eqCv" tabindex="0" aria-label="EQ curve over the live spectrum. Drag a point up or down; arrow keys pick a band and change it."></canvas><div class="eq-read" id="eqRead"></div></div>
      <div class="eq-knobwrap"><div class="eq-knob" id="eqBass" role="slider" tabindex="0" aria-label="Bass boost" aria-valuemin="0" aria-valuemax="${BASS_MAX}"><i></i></div><span class="eq-klbl">Bass boost</span><output id="eqBassOut">0 dB</output></div>
    </div>
    <div class="eq-bands">${FREQS.map((f, i) => `<label class="eq-band"><output>0</output><input type="range" min="-${MAXDB}" max="${MAXDB}" step="0.5" value="0" data-i="${i}" aria-label="${LBL[i]} Hz"><span>${LBL[i]}</span></label>`).join('')}</div>`;
  document.body.appendChild(root);
  const $ = (s) => root.querySelector(s);
  const sliders = [...root.querySelectorAll('.eq-bands input')];
  sliders.forEach((r) => r.addEventListener('input', () => setBand(+r.dataset.i, +r.value)));
  root.querySelectorAll('.eq-presets [data-p]').forEach((b) => b.addEventListener('click', () => setPreset(b.dataset.p)));
  $('#eqAB').addEventListener('click', () => setBypass(!S.bypass));
  $('#eqReset').addEventListener('click', reset);
  $('#eqClose').addEventListener('click', () => open(false));
  // bass knob
  const knob = $('#eqBass'); let kd = null;
  knob.addEventListener('pointerdown', (e) => { kd = { y: e.clientY, v: S.bass }; knob.setPointerCapture(e.pointerId); e.preventDefault(); });
  knob.addEventListener('pointermove', (e) => { if (kd) setBass(kd.v + (kd.y - e.clientY) / 8); });
  const kup = () => { kd = null; }; knob.addEventListener('pointerup', kup); knob.addEventListener('pointercancel', kup);
  knob.addEventListener('wheel', (e) => { e.preventDefault(); setBass(S.bass + (e.deltaY < 0 ? .5 : -.5)); }, { passive: false });
  knob.addEventListener('keydown', (e) => { const k = e.key; if (k === 'ArrowUp' || k === 'ArrowRight') setBass(S.bass + .5); else if (k === 'ArrowDown' || k === 'ArrowLeft') setBass(S.bass - .5); else if (k === 'Home' || k === '0') setBass(0); else if (k === 'End') setBass(BASS_MAX); else return; e.preventDefault(); e.stopPropagation(); });
  knob.addEventListener('dblclick', () => setBass(0));
  // curve canvas
  const cv = $('#eqCv'); let sel = -1, drag = -1;
  const fx = (f, w) => Math.log(f / 20) / Math.log(1000) * w;
  const dbY = (db, h) => h / 2 - db / 15 * (h * .42);
  const hit = (e) => { const r = cv.getBoundingClientRect(), x = e.clientX - r.left; let best = 0, bd = 1e9; FREQS.forEach((f, i) => { const d = Math.abs(fx(f, r.width) - x); if (d < bd) { bd = d; best = i; } }); return { i: best, y: e.clientY - r.top, h: r.height }; };
  const fromY = (i, y, h) => setBand(i, (h / 2 - y) / (h * .42) * 15);
  cv.addEventListener('pointerdown', (e) => { const h = hit(e); drag = sel = h.i; cv.setPointerCapture(e.pointerId); fromY(h.i, h.y, h.h); e.preventDefault(); });
  cv.addEventListener('pointermove', (e) => { if (drag < 0) return; const r = cv.getBoundingClientRect(); fromY(drag, e.clientY - r.top, r.height); });
  const up = () => { drag = -1; }; cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('dblclick', (e) => setBand(hit(e).i, 0));
  cv.addEventListener('keydown', (e) => {
    if (sel < 0) sel = 0; const k = e.key;
    if (k === 'ArrowLeft') sel = Math.max(0, sel - 1); else if (k === 'ArrowRight') sel = Math.min(9, sel + 1);
    else if (k === 'ArrowUp') setBand(sel, S.bands[sel] + .5); else if (k === 'ArrowDown') setBand(sel, S.bands[sel] - .5);
    else if (k === '0' || k === 'Delete') setBand(sel, 0); else return;
    e.preventDefault(); e.stopPropagation(); paint();
  });
  root.addEventListener('keydown', (e) => { if (e.key === 'Escape') { open(false); e.stopPropagation(); } });

  function paint() {
    sliders.forEach((r, i) => { r.value = S.bands[i]; const o = r.parentElement.querySelector('output'); o.textContent = (S.bands[i] > 0 ? '+' : '') + S.bands[i]; r.style.setProperty('--p', ((S.bands[i] + MAXDB) / (2 * MAXDB) * 100) + '%'); });
    root.querySelectorAll('.eq-presets [data-p]').forEach((b) => b.setAttribute('aria-checked', b.dataset.p === S.preset));
    $('.eq-custom').hidden = S.preset !== 'Custom';
    $('#eqAB').classList.toggle('bypass', S.bypass); $('#eqAB').setAttribute('aria-pressed', S.bypass);
    root.classList.toggle('bypassed', S.bypass);
    knob.style.setProperty('--a', (-135 + S.bass / BASS_MAX * 270) + 'deg'); knob.setAttribute('aria-valuenow', S.bass); knob.setAttribute('aria-valuetext', `+${S.bass} dB at ${BASS_F} Hz`);
    $('#eqBassOut').textContent = (S.bass ? '+' : '') + S.bass + ' dB';
    const btn = document.getElementById('eqBtn'); if (btn) btn.classList.toggle('on', !S.bypass && (S.bass > 0 || S.bands.some((v) => v)));
  }
  let raf = 0;
  function draw() {
    raf = 0; if (root.hidden) return; raf = requestAnimationFrame(draw);
    const dpr = Math.min(2, devicePixelRatio || 1), w = cv.clientWidth, h = cv.clientHeight; if (!w || !h) return;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    const cs = getComputedStyle(document.documentElement), c1 = cs.getPropertyValue('--c1').trim() || '#ff2bd6', c2 = cs.getPropertyValue('--c2').trim() || '#22e3ff', c3 = cs.getPropertyValue('--c3').trim() || '#ffc531';
    g.font = '10px ui-monospace, Menlo, monospace'; g.lineWidth = 1;
    [50, 100, 200, 500, 1000, 2000, 5000, 10000].forEach((f) => { const x = Math.round(fx(f, w)) + .5; g.strokeStyle = 'rgba(255,255,255,.07)'; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); });
    [-12, -6, 0, 6, 12].forEach((db) => { const y = Math.round(dbY(db, h)) + .5; g.strokeStyle = db ? 'rgba(255,255,255,.07)' : 'rgba(255,255,255,.2)'; g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); g.fillStyle = 'rgba(255,255,255,.35)'; g.fillText((db > 0 ? '+' : '') + db, 3, y - 2); });
    // live spectrum (post EQ)
    if (N && ctx) {
      N.an.getFloatFrequencyData(N.spec); const bins = N.spec.length, hz = ctx.sampleRate / 2 / bins, nb = Math.max(40, Math.min(140, Math.round(w / 5))), bw = w / nb;
      const grad = g.createLinearGradient(0, h, 0, 0); grad.addColorStop(0, c2 + '33'); grad.addColorStop(1, c1 + 'aa'); g.fillStyle = grad;
      for (let i = 0; i < nb; i++) {
        const f0 = 20 * Math.pow(1000, i / nb), f1 = 20 * Math.pow(1000, (i + 1) / nb); let m = -140;
        for (let b = Math.max(1, Math.floor(f0 / hz)); b < Math.max(Math.floor(f0 / hz) + 1, Math.ceil(f1 / hz)) && b < bins; b++) m = Math.max(m, N.spec[b]);
        const v = clamp((m + 100) / 80, 0, 1); g.fillRect(i * bw + .5, h - v * h, bw - 1, v * h);
      }
    }
    // response curve
    g.beginPath(); for (let x = 0; x <= w; x += 2) { const f = 20 * Math.pow(1000, x / w); const y = dbY(clamp(response(f), -15, 15), h); x ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.strokeStyle = S.bypass ? 'rgba(255,255,255,.35)' : c3; g.lineWidth = 2.5; g.stroke();
    g.lineTo(w, dbY(0, h)); g.lineTo(0, dbY(0, h)); g.closePath(); g.fillStyle = S.bypass ? 'transparent' : c3 + '1f'; g.fill();
    FREQS.forEach((f, i) => { const x = fx(f, w), y = dbY(S.bands[i], h); g.beginPath(); g.arc(x, y, i === sel ? 7 : 5.5, 0, 7); g.fillStyle = i === sel ? '#fff' : c3; g.fill(); g.strokeStyle = '#000'; g.lineWidth = 1.5; g.stroke(); });
    const rd = $('#eqRead'); const txt = sel >= 0 ? `${LBL[sel]} Hz ${(S.bands[sel] > 0 ? '+' : '') + S.bands[sel]} dB` : (S.bypass ? 'Bypassed' : S.preset); if (rd.textContent !== txt) rd.textContent = txt;
  }
  function open(v = root.hidden) {
    if (v) { root.hidden = false; requestAnimationFrame(() => root.classList.add('open')); paint(); if (!raf) raf = requestAnimationFrame(draw); }
    else { root.classList.remove('open'); setTimeout(() => { if (!root.classList.contains('open')) root.hidden = true; }, 260); }
    const btn = document.getElementById('eqBtn'); if (btn) btn.setAttribute('aria-expanded', v);
    return v;
  }
  paint();
  return {
    S, attach, setBand, setBass, setPreset, setBypass, reset, open, response, PRESETS, FREQS,
    get isOpen() { return !root.hidden; },
    get nodes() { return N; },
    /** Offline proof that Flat is a 0 dB change: white noise through the exact chain vs. dry. Returns max |diff| in dB. */
    async flatTest() {
      const fs = 48000, len = fs; const oc = new OfflineAudioContext(1, len, fs); const buf = oc.createBuffer(1, len, fs); const d = buf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = oc.createBufferSource(); src.buffer = buf; let p = src; const pre = oc.createGain(); pre.gain.value = 1; p = p.connect(pre);
      const ls = oc.createBiquadFilter(); ls.type = 'lowshelf'; ls.frequency.value = BASS_F; ls.gain.value = 0; p = p.connect(ls);
      FREQS.forEach((f) => { const b = oc.createBiquadFilter(); b.type = 'peaking'; b.frequency.value = f; b.Q.value = Q; b.gain.value = 0; p = p.connect(b); });
      p.connect(oc.destination); src.start(); const out = (await oc.startRendering()).getChannelData(0);
      let md = 0; for (let i = 0; i < len; i++) md = Math.max(md, Math.abs(out[i] - d[i]));
      let mr = 0; for (let f = 20; f < 20000; f *= 1.05) mr = Math.max(mr, Math.abs(FREQS.reduce((m, f0) => m * biquadMag('peaking', f0, 0, Q, f, fs), biquadMag('lowshelf', BASS_F, 0, 0, f, fs))));
      return { maxSampleDiff: md, maxCurveDeviationDb: 20 * Math.log10(mr) };
    },
  };
}
