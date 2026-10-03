#!/usr/bin/env python3
"""DJ Psycho Fingers sample pack generator.
Voice drops: Piper TTS (en_US-norman-medium, public-domain LibriVox data) + numpy/scipy/rubberband processing.
Everything else: synthesized from scratch with numpy (oscillators, noise, envelopes). No recordings ripped from anywhere.
Output: MP3 files + manifest.json into ../free-host-apps/dj/samples/
"""
import json, os, subprocess, sys, tempfile
import numpy as np
from scipy import signal
import soundfile as sf

SR = 44100
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.environ.get("PACK_OUT", os.path.join(HERE, "out"))
TTS_DIR = os.path.join(HERE, "tts")
VOICE = os.path.join(HERE, "voices", "en_US-norman-medium.onnx")
PIPER = os.path.join(HERE, "venv", "bin", "piper")
os.makedirs(OUT, exist_ok=True); os.makedirs(TTS_DIR, exist_ok=True)
rng = np.random.default_rng(47)

# ---------------- basic helpers ----------------
def t_(dur): return np.arange(int(dur * SR)) / SR
def st(x):  # mono -> stereo (N,2)
    return np.stack([x, x], 1) if x.ndim == 1 else x
def mono(x): return x.mean(1) if x.ndim == 2 else x
def pad(x, n):
    if len(x) >= n: return x[:n]
    z = np.zeros((n - len(x),) + x.shape[1:]); return np.concatenate([x, z])
def mix(*xs):
    xs = [st(x) for x in xs]; n = max(len(x) for x in xs)
    return sum(pad(x, n) for x in xs)
def at(x, sec, total=None):  # place x at offset
    n0 = int(sec * SR); x = st(x)
    y = np.zeros((n0 + len(x), 2)); y[n0:] = x
    return pad(y, int(total * SR)) if total else y
def env_ad(n, a, d, curve=4.0):
    na = max(1, int(a * SR)); e = np.ones(n)
    e[:na] = np.linspace(0, 1, na)[:n] if na <= n else np.linspace(0, 1, na)[:n]
    if n > na: e[na:] = np.exp(-curve * np.arange(n - na) / max(1, d * SR))
    return e
def fade(x, fin=0.002, fout=0.02):
    x = x.copy(); a = int(fin * SR); b = int(fout * SR)
    if a: x[:a] *= np.linspace(0, 1, a)[:, None] if x.ndim == 2 else np.linspace(0, 1, a)
    if b: x[-b:] *= np.linspace(1, 0, b)[:, None] if x.ndim == 2 else np.linspace(1, 0, b)
    return x
def osc(freq, dur=None, kind="sine", phase0=0.0):
    f = np.broadcast_to(np.asarray(freq, float), (int(dur * SR),)) if np.ndim(freq) == 0 else np.asarray(freq, float)
    ph = 2 * np.pi * np.cumsum(f) / SR + phase0
    if kind == "sine": return np.sin(ph)
    if kind == "saw":  # polyBLEP-free but softened by later filtering
        return 2 * ((ph / (2 * np.pi)) % 1.0) - 1
    if kind == "square": return np.sign(np.sin(ph))
    if kind == "tri": return 2 * np.abs(2 * ((ph / (2 * np.pi)) % 1.0) - 1) - 1
    raise ValueError(kind)
def noise(dur): return rng.uniform(-1, 1, int(dur * SR))
def bfilt(x, kind, f, order=2):
    nyq = SR / 2
    if kind == "band": sos = signal.butter(order, [f[0] / nyq, min(f[1] / nyq, 0.99)], "bandpass", output="sos")
    else: sos = signal.butter(order, min(f / nyq, 0.99), kind, output="sos")
    return signal.sosfilt(sos, x, axis=0)
def sweep_filter(x, f0, f1, kind="band", q=4.0, block=256, curve="exp"):
    """time-varying 2-pole state-variable filter (Chamberlin), f0->f1 over the length of x"""
    n = len(x); y = np.zeros(n)
    fs = np.geomspace(f0, f1, n) if curve == "exp" else np.linspace(f0, f1, n)
    low = band = 0.0; damp = 1.0 / q
    for i in range(0, n, block):
        f = 2 * np.sin(np.pi * min(fs[i], SR / 6) / SR)
        seg = x[i:i + block]; out = np.empty(len(seg))
        for j, v in enumerate(seg):
            low += f * band; high = v - low - damp * band; band += f * high
            out[j] = band if kind == "band" else (low if kind == "low" else high)
        y[i:i + block] = out
    return y
def drive(x, amt=3.0, mixw=1.0):
    y = np.tanh(x * amt) / np.tanh(amt); return x * (1 - mixw) + y * mixw
def reverb(x, size=1.6, wet=0.25, pre=0.012, bright=6000, seed=1):
    r = np.random.default_rng(seed); n = int(size * SR); tt = np.arange(n) / SR
    ir = np.zeros((n, 2))
    for c in range(2):
        e = r.standard_normal(n) * np.exp(-6.9 * tt / size)
        ir[:, c] = bfilt(e, "low", bright)
    ir[: int(pre * SR)] = 0; ir /= np.sqrt((ir ** 2).sum(0, keepdims=True)) + 1e-9
    x = st(x); y = np.zeros((len(x) + n - 1, 2))
    for c in range(2): y[:, c] = signal.fftconvolve(x[:, c], ir[:, c])
    out = pad(x, len(y)) * 1.0 + y * wet * 0.6
    return out
def delay(x, t=0.375, fb=0.45, wet=0.5, pingpong=True, tail=2.0, lp=4500, hp=250, only_from=None):
    """feedback delay; only_from: seconds -> feed only the part after this point (a 'throw')"""
    x = st(x); n = len(x) + int(tail * SR); src = pad(x, n).copy()
    if only_from is not None: src[: int(only_from * SR)] = 0
    d = int(t * SR); y = np.zeros((n, 2)); tap = mono(src)
    sig = tap.copy(); k = 0; g = 1.0
    while True:
        k += 1; g *= fb if k > 1 else 1.0
        if g < 0.01 or k * d >= n: break
        sig = bfilt(bfilt(sig, "low", lp, 1), "high", hp, 1)
        sh = np.zeros(n); sh[k * d:] = sig[: n - k * d] * g
        if pingpong: y[:, (k + 1) % 2] += sh; y[:, k % 2] += sh * 0.25
        else: y += sh[:, None]
    return pad(x, n) + y * wet
def vrate(x, rates):
    """variable signed-rate playback of mono x; rates: per-output-sample playback rate"""
    pos = np.cumsum(rates); pos = np.clip(pos, 0, len(x) - 2)
    i = pos.astype(int); fr = pos - i
    return x[i] * (1 - fr) + x[i + 1] * fr
def trim(x, thresh_db=-48, pre=0.004, tailpad=0.03):
    m = np.abs(mono(st(x))); th = 10 ** (thresh_db / 20) * max(1e-9, m.max())
    idx = np.where(m > th)[0]
    if not len(idx): return x
    a = max(0, idx[0] - int(pre * SR)); b = min(len(x), idx[-1] + int(tailpad * SR))
    return x[a:b]
def finish(x, peak_db=-1.0, rms_db=None, fout=0.03):
    x = st(x).astype(np.float64)
    x = x - x.mean(0, keepdims=True) * 0  # keep
    x = bfilt(x, "high", 22, 2)  # DC / rumble
    x = trim(x)
    if rms_db is not None:
        r = np.sqrt(np.mean(mono(x) ** 2)) + 1e-12
        x *= 10 ** (rms_db / 20) / r
        x = np.tanh(x * 1.0)  # soft limiting of the boosted peaks
    pk = np.abs(x).max() + 1e-12; x *= 10 ** (peak_db / 20) / pk
    return fade(x, 0.0015, fout)

# ---------------- TTS ----------------
def tts(text, ls=1.0, noise=0.6, nw=0.8, key=None):
    key = key or "".join(ch if ch.isalnum() else "_" for ch in text.lower())[:40] + f"_{ls}"
    wav = os.path.join(TTS_DIR, key + ".wav")
    if not os.path.exists(wav):
        subprocess.run([PIPER, "-m", VOICE, "-f", wav, "--length-scale", str(ls), "--noise-scale", str(noise), "--noise-w-scale", str(nw)],
                       input=text.encode(), check=True, capture_output=True)
    y, sr = sf.read(wav)
    y = signal.resample_poly(y, SR, sr) if sr != SR else y
    return trim(y / (np.abs(y).max() + 1e-9), -40, 0.002, 0.02)
def rb(x, semis=0.0, tempo=1.0, formant=False):
    """rubberband pitch/tempo via ffmpeg"""
    with tempfile.TemporaryDirectory() as d:
        a, b = os.path.join(d, "a.wav"), os.path.join(d, "b.wav")
        sf.write(a, x, SR, subtype="FLOAT")
        f = f"rubberband=pitch={2 ** (semis / 12):.6f}:tempo={tempo:.6f}" + (":formant=preserved" if formant else "")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", a, "-af", f, b], check=True)
        y, _ = sf.read(b)
    return y
def vox_chain(x, semis=-2, dist=0.35, radio=False, verb=0.22, vsize=1.4, throw=None, double=True):
    v = rb(x, semis, 1.0, formant=True) if semis else x
    v = bfilt(v, "high", 110, 2)
    # presence + compression-ish
    v = v + 0.35 * bfilt(v, "band", (2500, 5500), 2)
    v = v / (np.abs(v).max() + 1e-9)
    if dist: v = drive(v, 2.0 + 6 * dist, mixw=min(1, 0.5 + dist))
    if radio: v = bfilt(v, "band", (420, 3400), 3); v = drive(v * 1.5, 2.5)
    s = st(v)
    if double:  # slight stereo double: tiny pitch/time offset copy
        d2 = rb(v, 0.12, 1.0); d2 = pad(np.concatenate([np.zeros(int(0.011 * SR)), d2]), len(v))
        s = np.stack([v + 0.35 * d2, v * 0.9 + 0.45 * d2], 1)
    if throw is not None: s = delay(s, t=throw[0], fb=throw[1], wet=throw[2], only_from=throw[3] if len(throw) > 3 else None, tail=throw[4] if len(throw) > 4 else 2.0)
    if verb: s = reverb(s, vsize, verb)
    return s

# ---------------- FX synth ----------------
def airhorn(pattern, base=415, bend=-0.6):
    """reggae-style airhorn: detuned saw stack with pitch scoop, through horn formant + drive. pattern: list of (start, dur)"""
    total = max(s + d for s, d in pattern) + 0.6
    out = np.zeros(int(total * SR))
    for s, d in pattern:
        n = int(d * SR); tt = np.arange(n) / SR
        f = base * (1 + 0.05 * np.exp(-tt / 0.03)) * 2 ** (bend * np.clip(tt - d + 0.12, 0, None) / 12 / 0.12 * 2)
        f = f * (1 + 0.004 * np.sin(2 * np.pi * 5.5 * tt))
        v = sum(osc(f * m * (1 + det), kind="saw") * g for m, det, g in [(1, 0, 1), (1, 0.006, .8), (1, -0.007, .8), (1.5, 0.003, .45), (2, -0.004, .35)])
        e = np.minimum(1, tt / 0.012) * np.clip((d - tt) / 0.04, 0, 1)
        v = v * e
        out[int(s * SR): int(s * SR) + n] += v
    out = bfilt(out, "band", (300, 5200), 2); out = out + 0.6 * bfilt(out, "band", (1100, 2600), 2)
    out = drive(out / (np.abs(out).max() + 1e-9), 3.5)
    return reverb(delay(out, 0.21, 0.3, 0.25), 1.2, 0.18)
def dub_siren(dur, f_lo, f_hi, lfo_hz, lfo="square", kind="square", fall=None, echo=0.33):
    tt = t_(dur)
    if lfo == "square": l = (np.sign(np.sin(2 * np.pi * lfo_hz * tt)) + 1) / 2; l = bfilt(l, "low", 30, 1)
    elif lfo == "saw": l = (tt * lfo_hz) % 1.0
    elif lfo == "rsaw": l = 1 - (tt * lfo_hz) % 1.0
    elif lfo == "sine": l = (np.sin(2 * np.pi * lfo_hz * tt) + 1) / 2
    f = f_lo * (f_hi / f_lo) ** l
    if fall: f = f * np.geomspace(1, fall, len(tt))
    v = osc(f, kind=kind) * 0.6 + osc(f * 1.003, kind="saw") * 0.3
    v = bfilt(v, "low", 3800, 2) * np.minimum(1, tt / 0.01) * np.clip((dur - tt) / 0.05, 0, 1)
    v = drive(v, 1.8)
    return reverb(delay(v, echo, 0.55, 0.55, tail=2.5, lp=3000), 1.4, 0.15)
def laser(dur=0.35, f0=3200, f1=160, kind="square", rep=1, gap=0.16, echo=True):
    out = None
    for k in range(rep):
        tt = t_(dur); f = f0 * (f1 / f0) ** (tt / dur) ** 0.6
        v = osc(f, kind=kind) * np.exp(-tt / (dur * 0.5)) * np.minimum(1, tt / 0.002)
        v = bfilt(v, "low", 7000, 2)
        out = mix(out if out is not None else np.zeros(1), at(v, k * gap))
    out = mono(out)
    return delay(out, 0.18, 0.45, 0.45, tail=1.4) if echo else st(out)
def boom(dur=2.4, f0=70, f1=28, nlp=600, sub=1.0, crack=0.8):
    tt = t_(dur)
    s = osc(f0 * (f1 / f0) ** np.minimum(1, tt / 1.2), kind="sine") * np.exp(-tt / 0.8) * sub
    nz = bfilt(noise(dur), "low", nlp, 2) * np.exp(-tt / 0.5) * 2.2
    cr = bfilt(noise(dur), "band", (900, 6000), 2) * np.exp(-tt / 0.05) * crack
    return reverb(drive(s + nz + cr, 2.2), 2.2, 0.35)
def riser(dur=4.0, up=True):
    tt = t_(dur); u = tt / dur
    nz = sweep_filter(noise(dur), 300, 9000, "band", q=3) if up else sweep_filter(noise(dur), 9000, 250, "band", q=3)
    f = 110 * 2 ** (3 * u) if up else 880 * 2 ** (-3 * u)
    tone = sum(osc(f * (1 + d), kind="saw") for d in (-0.01, 0, 0.012)) / 3
    tone = bfilt(tone, "low", 5000, 2)
    e = (u ** 2) if up else (1 - u) ** 1.5
    v = (nz * 1.4 + tone * 0.35) * e
    return reverb(v, 1.8, 0.3)
def cymbal(dur=3.0):
    tt = t_(dur); freqs = [205.3, 304.4, 369.6, 522.7, 540.0, 800.0]
    m = sum(osc(f * 3.1, dur, kind="square") for f in freqs) / 6
    v = bfilt(m, "high", 5000, 2) * 0.6 + bfilt(noise(dur), "high", 6500, 2) * 0.8
    return v * np.exp(-tt / 0.9) * np.minimum(1, tt / 0.001)
def music_snip(dur=2.2, bpm=96):
    """short synthesized beat+chord used as the source for tape stop / rewind FX (original, generated here)"""
    beat = 60 / bpm; out = np.zeros(int(dur * SR))
    def put(x, s):
        i = int(s * SR); j = min(len(out), i + len(x)); out[i:j] += x[: j - i]
    for k in range(int(dur / beat * 2) + 1):
        s = k * beat / 2
        if k % 4 == 0 or k % 8 == 5: put(kick(0.9), s)
        if k % 4 == 2: put(snare() * 0.8, s)
        put(hat(0.05) * 0.3, s)
    tt = t_(dur); ch = sum(osc(110 * 2 ** (iv / 12), dur, kind="saw") for iv in (0, 3, 7, 10, 15)) / 5
    out += bfilt(ch, "low", 1600, 2) * 0.35 + osc(55, dur) * 0.3
    return out / (np.abs(out).max() + 1e-9)

# ---------------- drum / hit synth ----------------
def kick(dur=0.6, f0=150, f1=48, dec=0.28, click=0.5, dist=1.5):
    tt = t_(dur); f = f1 + (f0 - f1) * np.exp(-tt / 0.035)
    v = osc(f, kind="sine") * np.exp(-tt / dec) + click * bfilt(noise(dur), "band", (1500, 6000), 2) * np.exp(-tt / 0.004)
    return drive(v, dist)
def snare(dur=0.45, tone=190, nz=1.0, dec=0.14, lp=9000):
    tt = t_(dur)
    v = osc(tone * (1 + 0.5 * np.exp(-tt / 0.01)), kind="tri") * np.exp(-tt / 0.06) * 0.8
    v += bfilt(noise(dur), "band", (1200, lp), 2) * np.exp(-tt / dec) * nz
    return drive(v, 1.6)
def hat(dec=0.05, dur=None):
    dur = dur or max(0.08, dec * 7); tt = t_(dur)
    freqs = [205.3, 304.4, 369.6, 522.7, 540.0, 800.0]
    m = sum(osc(f * 2.2, dur, kind="square") for f in freqs) / 6
    v = bfilt(m * 0.6 + noise(dur) * 0.5, "high", 7000, 2) * np.exp(-tt / dec)
    return v
def clap(dur=0.6):
    tt = t_(dur); nz = bfilt(noise(dur), "band", (900, 3200), 2); e = np.zeros_like(tt)
    for k, o in enumerate([0, 0.011, 0.023, 0.034]):
        e += (tt >= o) * np.exp(-np.clip(tt - o, 0, None) / (0.007 if k < 3 else 0.16))
    return reverb(nz * e, 0.8, 0.18)
def rim(dur=0.25):
    tt = t_(dur)
    v = (osc(1700, dur) * 0.6 + osc(820, dur) * 0.5) * np.exp(-tt / 0.018) + bfilt(noise(dur), "high", 3000, 2) * np.exp(-tt / 0.006)
    return v
def pan_note(f, dur=1.6):
    tt = t_(dur); parts = [(1, 1, 1.2), (2, .55, .6), (3.0, .25, .35), (4.02, .18, .25), (5.0, .1, .18)]
    v = sum(osc(f * m, dur) * g * np.exp(-tt / (d * 0.8)) for m, g, d in parts)
    return v * np.minimum(1, tt / 0.003)

def S(*a): return a

SAMPLES = []  # (bank, pad, id, name, kind, how, array, cat)
def add(bank, pad_i, sid, name, cat, how, x, rms=-15.0, peak=-1.0):
    SAMPLES.append(dict(bank=bank, pad=pad_i, id=sid, name=name, cat=cat, how=how, x=finish(x, peak, rms)))

def build():
    # ======== BANK A: voice drops (Piper TTS, en_US-norman-medium) ========
    V = "Piper TTS (en_US-norman-medium)"
    v = tts("D. J. Psycho Fingers!", 0.95)
    add("A", 0, "a01-dj-psycho-fingers", "DJ Psycho Fingers!", "voice", V + "; pitched -3 st (formant-kept), drive, stereo double, ping-pong delay throw on the last word, plate-style reverb",
        vox_chain(v, -3, 0.4, throw=(0.3, 0.5, 0.55, len(v) / SR * 0.6, 2.2), verb=0.25))
    v = tts("Psycho Fingers, on the decks!", 1.0)
    rad = vox_chain(v[: int(len(v) * 0.5)], -2, 0.3, radio=True, verb=0, double=False)
    full = vox_chain(v[int(len(v) * 0.5):], -2, 0.35, verb=0.22)
    add("A", 1, "a02-on-the-decks", "Psycho Fingers on the decks", "voice", V + "; first half through a radio band-pass (420–3400 Hz) + drive, second half full-range with drive, double and reverb",
        mix(rad, at(full, len(rad) / SR)))
    v = tts("Dominica! Stand up!", 1.0)
    add("A", 2, "a03-dominica-stand-up", "Dominica stand up!", "voice", V + "; -2 st, drive, double, big 2.4 s reverb", vox_chain(v, -2, 0.45, verb=0.35, vsize=2.4))
    v = tts("Nature Isle!", 1.05)
    add("A", 3, "a04-nature-isle", "Nature Isle", "voice", V + "; -1 st, light drive, dotted-eighth ping-pong echo, reverb", vox_chain(v, -1, 0.25, throw=(0.47, 0.5, 0.5), verb=0.25))
    v = tts("Island Pin!", 1.0)
    add("A", 4, "a05-island-pin", "Island Pin", "voice", V + "; -2 st, drive, stereo delay throw, reverb", vox_chain(v, -2, 0.35, throw=(0.25, 0.55, 0.5, len(v) / SR * 0.4), verb=0.2))
    v = tts("Wheel it up!", 0.95)
    add("A", 5, "a06-wheel-it-up", "Wheel it up!", "voice", V + "; -3 st, heavy drive, delay throw, reverb", vox_chain(v, -3, 0.7, throw=(0.31, 0.55, 0.55, len(v) / SR * 0.5), verb=0.22))
    v = tts("Rewind!", 1.1)
    vv = vox_chain(v, -2, 0.5, verb=0)
    n = len(vv); fallr = np.concatenate([np.ones(int(n * 0.55)), np.linspace(1, 0.55, n - int(n * 0.55))])
    vv = np.stack([vrate(vv[:, 0], fallr), vrate(vv[:, 1], fallr)], 1)
    add("A", 6, "a07-rewind", "Rewind!", "voice", V + "; -2 st, drive, tape-style pitch fall on the tail (variable-rate resampling), echo + reverb",
        reverb(delay(vv, 0.33, 0.45, 0.45), 1.6, 0.25))
    v = tts("Run it back!", 0.95)
    add("A", 7, "a08-run-it-back", "Run it back", "voice", V + "; -2 st, drive, double, short slap delay, reverb", vox_chain(v, -2, 0.45, throw=(0.12, 0.25, 0.3), verb=0.2))
    v = tts("Big tune!", 1.05)
    add("A", 8, "a09-big-tune", "Big tune!", "voice", V + "; -4 st, drive, delay throw, reverb", vox_chain(v, -4, 0.55, throw=(0.375, 0.5, 0.5, len(v) / SR * 0.5), verb=0.25))
    v = tts("Selector!", 1.05)
    add("A", 9, "a10-selector", "Selector!", "voice", V + "; -2 st, radio filter + drive, long echo throw", vox_chain(v, -2, 0.4, radio=True, throw=(0.375, 0.6, 0.6, len(v) / SR * 0.5, 2.6), verb=0.18))
    v = tts("Boo yaka! Boo yaka!", 0.9)
    add("A", 10, "a11-boo-yaka", "Boo-yaka! shout", "voice", V + "; -3 st, heavy drive, double, reverb (clean shout)", vox_chain(v, -3, 0.7, verb=0.25))
    v = tts("Pull up! Pull up!", 0.9)
    add("A", 11, "a12-pull-up", "Pull up! Pull up!", "voice", V + "; -3 st, drive, double, echo + reverb", vox_chain(v, -3, 0.55, throw=(0.25, 0.4, 0.4, len(v) / SR * 0.6), verb=0.22))
    v = tts("Come again!", 1.0)
    add("A", 12, "a13-come-again", "Come again!", "voice", V + "; -2 st, drive, ping-pong echo, reverb", vox_chain(v, -2, 0.45, throw=(0.31, 0.5, 0.5, len(v) / SR * 0.5), verb=0.22))
    v = tts("Big up, Dominica!", 1.0)
    add("A", 13, "a14-big-up-dominica", "Big up Dominica!", "voice", V + "; -3 st, drive, double, big reverb", vox_chain(v, -3, 0.45, verb=0.3, vsize=2.0))
    v = tts("Psycho Fingers, in the mix!", 1.0)
    add("A", 14, "a15-in-the-mix", "Psycho Fingers in the mix", "voice", V + "; -2 st, drive, radio-to-full, stereo echo throw on 'mix'", vox_chain(v, -2, 0.4, throw=(0.375, 0.55, 0.55, len(v) / SR * 0.7, 2.4), verb=0.2))

    # ======== BANK B: DJ FX (synthesized) ========
    SY = "Synthesized in numpy"
    add("B", 0, "b01-airhorn-classic", "Airhorn classic", "fx", SY + ": detuned saw stack with pitch scoop, horn band-pass + drive, ba-ba-baaa rhythm, echo + reverb",
        airhorn([(0, .14), (.17, .14), (.34, .14), (.51, .7)]), rms=-14)
    add("B", 1, "b02-airhorn-triple", "Airhorn triple stab", "fx", SY + ": three short airhorn stabs", airhorn([(0, .16), (.2, .16), (.4, .16)], base=440), rms=-14)
    add("B", 2, "b03-airhorn-high", "Airhorn high", "fx", SY + ": higher-pitched airhorn with longer fall", airhorn([(0, .12), (.15, .12), (.3, .9)], base=560, bend=-1.5), rms=-14)
    add("B", 3, "b04-airhorn-long", "Airhorn long blast", "fx", SY + ": long single blast with downward bend", airhorn([(0, 1.4)], base=392, bend=-2.0), rms=-14)
    add("B", 4, "b05-dub-siren-classic", "Dub siren classic", "fx", SY + ": square osc, square-LFO pitch (wee-oo) at 4 Hz, dub echo 330 ms",
        dub_siren(2.0, 520, 1040, 4.0, "square"), rms=-15)
    add("B", 5, "b06-dub-siren-fast", "Dub siren fast", "fx", SY + ": rising saw-LFO siren at 9 Hz, dub echo", dub_siren(1.8, 400, 1500, 9.0, "saw"), rms=-15)
    add("B", 6, "b07-dub-siren-falling", "Dub siren falling", "fx", SY + ": sine-LFO siren with 2-octave fall, long echo", dub_siren(2.4, 700, 1300, 6.0, "sine", fall=0.25, echo=0.375), rms=-15)
    add("B", 7, "b08-dub-siren-wobble", "Dub siren wobble", "fx", SY + ": slow sine-LFO wobble siren, dub echo", dub_siren(2.6, 300, 900, 1.6, "sine", kind="saw"), rms=-15)
    add("B", 8, "b09-laser-zap", "Laser zap", "fx", SY + ": square wave exponential pitch dive 3.2 kHz→160 Hz + echo", laser(), rms=-16)
    add("B", 9, "b10-laser-triple", "Laser triple", "fx", SY + ": three fast laser dives", laser(0.22, 4200, 300, "square", rep=3, gap=0.13), rms=-16)
    add("B", 10, "b11-zap-down", "Zap down (sine)", "fx", SY + ": long sine pitch dive with echo", laser(0.9, 2400, 60, "sine"), rms=-16)
    whistle = (lambda tt: osc(2200 * (280 / 2200) ** (tt / 1.6), kind="sine") * (0.3 + 0.7 * tt / 1.6))(t_(1.6))
    add("B", 11, "b12-bomb-drop", "Bomb drop", "fx", SY + ": falling whistle (2.2 kHz→280 Hz) into a noise + sub explosion (no gunshots)",
        mix(at(whistle * 0.5, 0), at(boom(), 1.6)), rms=-14)
    add("B", 12, "b13-sub-drop", "Sub drop", "fx", SY + ": sine 90→28 Hz pitch dive with long decay", (lambda tt: drive(osc(90 * (28 / 90) ** np.minimum(1, tt / 1.5), kind="sine") * np.exp(-tt / 1.1), 1.6))(t_(2.5)), rms=-13)
    add("B", 13, "b14-impact", "Impact", "fx", SY + ": sub thump + noise burst + metallic layer + big reverb", mix(boom(1.8, 110, 35, 1800, 1.0, 1.2), cymbal(1.5) * 0.25), rms=-14)
    add("B", 14, "b15-riser", "Riser 4s", "fx", SY + ": band-pass noise sweep 300 Hz→9 kHz + rising detuned saws, reverb", riser(4.0, True), rms=-16)
    add("B", 15, "b16-downlifter", "Downlifter", "fx", SY + ": falling filtered noise + falling saws, reverb", riser(3.0, False), rms=-16)

    # ======== BANK C: turntable tricks, stabs, sweeps ========
    snip = music_snip()
    n = int(1.6 * SR); r = np.concatenate([np.ones(int(0.25 * SR)), np.linspace(1, 0, n - int(0.25 * SR)) ** 1.6])
    add("C", 0, "c01-tape-stop", "Tape stop", "fx", SY + ": a short synthesized beat played at a decelerating rate (1→0)", vrate(snip, r), rms=-15)
    n = int(1.3 * SR); tt = np.arange(n) / SR
    r = -np.concatenate([np.linspace(0, 4.5, int(0.12 * SR)), 4.5 * np.exp(-np.arange(n - int(0.12 * SR)) / SR / 0.45)])
    src = np.concatenate([snip, snip, snip]); r[0] = len(snip) * 1.8
    add("C", 1, "c02-vinyl-rewind", "Vinyl rewind", "fx", SY + ": synthesized beat played backwards at a fast-then-slowing rate (wheel-up sound)", vrate(src, r) * np.clip((tt[-1] - tt) / 0.05, 0, 1), rms=-14)
    n = int(1.2 * SR); r = np.concatenate([np.ones(int(0.2 * SR)), -2.5 * np.exp(-np.arange(n - int(0.2 * SR)) / SR / 0.35)])
    r[0] = len(snip) * 0.5
    add("C", 2, "c03-spinback", "Spinback", "fx", SY + ": beat that is flicked into a backwards spin and slows to a stop", vrate(np.concatenate([snip, snip]), r), rms=-14)
    ah = tts("Aaaaah!", 1.3, key="aaah")
    ah = rb(ah, -2, 1.0, formant=True); ah = ah / (np.abs(ah).max() + 1e-9)
    def scratch(src, moves, start):
        """moves: list of (duration, signed rate) segments with smoothed transitions"""
        rr = np.concatenate([np.full(int(d * SR), v) for d, v in moves]); rr = bfilt(rr, "low", 60, 1)
        rr[0] += start * SR
        return vrate(src, rr)
    base = int(0.05 * SR) / SR
    baby = scratch(ah, [(0.12, 1.8), (0.12, -1.8), (0.1, 2.2), (0.1, -2.2), (0.08, 2.6), (0.08, -2.6), (0.16, 1.5), (0.1, 0)], base)
    add("C", 3, "c04-scratch-ahh-baby", "Scratch 'ahh' (baby)", "scratch", "Piper TTS 'Aaaaah' (norman) scratched in numpy: forward/back variable-rate playback (baby scratch)", baby, rms=-15)
    gate = None; ch = []
    for k in range(4):
        seg = scratch(ah, [(0.07, 2.4), (0.07, -2.4)], 0.02)
        g = np.ones(len(seg)); g[int(len(seg) * 0.5):] = np.linspace(1, 0, len(seg) - int(len(seg) * 0.5)) ** 3
        ch.append(seg * g); ch.append(np.zeros(int(0.04 * SR)))
    add("C", 4, "c05-scratch-ahh-chirp", "Scratch 'ahh' (chirps)", "scratch", "Piper TTS 'Aaaaah' with forward/back scratches and a fader-closed return (chirp scratch)", np.concatenate(ch), rms=-15)
    fr = tts("Fresh!", 1.0, key="fresh")
    fr = vox_chain(fr, -1, 0.5, verb=0, double=False); fr = mono(fr)
    fs = scratch(fr, [(0.09, 1.0), (0.06, -1.6), (0.07, 1.6), (0.06, -1.6), (0.25, 1.0)], 0.0)
    add("C", 5, "c06-fresh-scratch", "'Fresh' scratch", "scratch", "Piper TTS 'Fresh' (norman), driven, then scratched forward/back", st(fs), rms=-15)
    add("C", 6, "c07-fresh-stab", "'Fresh' stab", "scratch", "Piper TTS 'Fresh' (norman), -1 st, drive, short reverb", reverb(st(fr), 0.9, 0.2), rms=-14)
    ye = tts("Yeah!", 0.9, key="yeah"); add("C", 7, "c08-yeah-stab", "'Yeah!' stab", "voice", "Piper TTS 'Yeah' (norman), -3 st, heavy drive, slap echo", vox_chain(ye, -3, 0.7, throw=(0.15, 0.3, 0.35), verb=0.15), rms=-14)
    he = tts("Hey!", 0.9, key="hey"); add("C", 8, "c09-hey-stab", "'Hey!' stab", "voice", "Piper TTS 'Hey' (norman), -2 st, drive, double, reverb", vox_chain(he, -2, 0.6, verb=0.25), rms=-14)
    rv = cymbal(2.5)[::-1]; rv = rv * np.minimum(1, np.arange(len(rv)) / SR / 0.3)
    add("C", 9, "c10-reverse-cymbal", "Reverse cymbal", "fx", SY + ": metallic cymbal (6 inharmonic square partials + high-passed noise) reversed", reverb(rv, 0.8, 0.12), rms=-17)
    add("C", 10, "c11-noise-sweep-up", "Noise sweep up", "fx", SY + ": white noise through a resonant band-pass sweeping 200 Hz→12 kHz", (lambda x: st(x * np.linspace(0.3, 1, len(x))))(sweep_filter(noise(2.0), 200, 12000, "band", 5)), rms=-17)
    add("C", 11, "c12-noise-sweep-down", "Noise sweep down", "fx", SY + ": white noise through a resonant band-pass sweeping 12 kHz→150 Hz", (lambda x: st(x * np.linspace(1, 0.2, len(x))))(sweep_filter(noise(2.0), 12000, 150, "band", 5)), rms=-17)
    rw = tts("Rewind!", 1.1)
    rwv = vox_chain(rw, -2, 0.5, verb=0, double=False); rwv = mono(reverb(rwv, 1.8, 0.6))[::-1]
    add("C", 12, "c13-reverse-rewind", "Reverse 'Rewind' swell", "voice", "Piper TTS 'Rewind' with heavy reverb, played reversed (reverse reverb swell)", st(rwv), rms=-15)
    tr = []
    for k in range(8):
        seg = ah[int(0.03 * SR) + k * int(0.04 * SR): int(0.03 * SR) + k * int(0.04 * SR) + int(0.05 * SR)]
        tr.append(seg * np.hanning(len(seg)) ** 0.3); tr.append(np.zeros(int(0.03 * SR)))
    add("C", 13, "c14-transformer", "Transformer scratch", "scratch", "Piper TTS 'Aaaaah' chopped with a fast fader gate (transformer pattern)", np.concatenate(tr), rms=-15)

    # ======== BANK D: hip-hop + dancehall hits ========
    add("D", 0, "d01-808-boom", "808 boom", "hit", SY + ": sine 808 with pitch glide 120→45 Hz, long decay, saturation", (lambda tt: drive(osc(45 + 75 * np.exp(-tt / 0.05), kind="sine") * np.exp(-tt / 0.9), 2.2))(t_(2.2)), rms=-12)
    add("D", 1, "d02-boombap-kick", "Boom-bap kick", "hit", SY + ": punchy pitched sine kick with click, drive", kick(0.5, 160, 52, 0.18, 0.6, 2.5), rms=-12)
    add("D", 2, "d03-boombap-snare", "Boom-bap snare", "hit", SY + ": triangle body + band-passed noise, drive, short room", reverb(snare(0.4, 185, 1.2, 0.12), 0.6, 0.15), rms=-13)
    add("D", 3, "d04-clap", "Clap", "hit", SY + ": 4 noise bursts (multi-tap clap) + small room", clap(), rms=-14)
    add("D", 4, "d05-rimshot", "Rimshot", "hit", SY + ": two sine partials + noise click", rim(), rms=-15)
    add("D", 5, "d06-open-hat", "Open hat", "hit", SY + ": 6 inharmonic square partials + noise, high-passed, 0.2 s decay", hat(0.2, 0.9), rms=-18)
    add("D", 6, "d07-dancehall-kick", "Dancehall kick", "hit", SY + ": tight, high-tuned kick with longer sub tail", kick(0.7, 190, 58, 0.32, 0.8, 3.0), rms=-12)
    add("D", 7, "d08-dancehall-snare", "Dancehall snare + rim", "hit", SY + ": tight high-tuned snare layered with a rim click", mix(snare(0.35, 260, 0.9, 0.07, 11000), rim() * 0.6), rms=-13)
    roll = np.zeros(int(1.0 * SR))
    for k, (s, f) in enumerate([(0, 520), (.09, 520), (.18, 440), (.27, 440), (.36, 370), (.45, 370), (.54, 330), (.6, 330), (.66, 290)]):
        tt = t_(0.35); hit_ = (osc(f * (1 + 0.3 * np.exp(-tt / 0.006)), kind="sine") * np.exp(-tt / 0.09) + bfilt(noise(0.35), "band", (2000, 7000), 2) * np.exp(-tt / 0.012) * 0.5) * (0.7 + 0.04 * k)
        i = int(s * SR); roll[i:i + len(hit_)] += hit_[: len(roll) - i]
    add("D", 8, "d09-timbale-fill", "Timbale fill", "hit", SY + ": 9 tuned metallic-drum hits descending (timbale-style fill)", reverb(roll, 0.9, 0.18), rms=-14)
    pan = sum(pan_note(440 * 2 ** (iv / 12)) for iv in (0, 4, 7))
    add("D", 9, "d10-steel-pan-stab", "Steel pan stab", "hit", SY + ": additive steel-pan style chord (A major), reverb", reverb(pan, 1.2, 0.2), rms=-15)
    tt = t_(0.9); f = np.array([220 * 2 ** (iv / 12) for iv in (0, 3, 7, 12, 15)])
    br = sum(osc(fi * (1 + 0.003 * np.sin(2 * np.pi * 6 * tt)) * (1 + d), kind="saw") for fi in f for d in (-0.004, 0.004))
    br = sweep_filter(br / 10, 4000, 900, "low", q=1.2) * np.minimum(1, tt / 0.02) * np.exp(-tt / 0.35)
    add("D", 10, "d11-brass-stab", "Brass stab", "hit", SY + ": detuned saw minor chord with closing low-pass (synth brass/orchestra stab), reverb", reverb(br, 1.4, 0.25), rms=-14)
    tt = t_(1.4)
    pn = sum(sum(osc(220 * 2 ** (iv / 12) * h, 1.4, kind="sine") * (0.6 / h) * np.exp(-tt * (1.5 + h)) for h in (1, 2, 3, 4)) for iv in (0, 3, 7, 10, 14))
    add("D", 11, "d12-piano-stab", "Piano stab (min9)", "hit", SY + ": additive piano-like A minor 9 chord", reverb(pn * np.minimum(1, tt / 0.003), 1.0, 0.18), rms=-15)
    tt = t_(0.8); wm = osc(55 * (1 + np.exp(-tt / 0.03)), kind="saw")
    wm = sweep_filter(wm, 2400, 120, "low", q=2.5) * np.exp(-tt / 0.4) * np.minimum(1, tt / 0.004)
    add("D", 12, "d13-bass-womp", "Bass womp", "hit", SY + ": saw bass with resonant low-pass dive", drive(wm, 2.0), rms=-13)
    tt = t_(0.5); cb = (osc(562, 0.5, kind="square") + osc(845, 0.5, kind="square")) * 0.5
    add("D", 13, "d14-cowbell", "Cowbell", "hit", SY + ": two square partials (562 + 845 Hz), band-passed, fast decay", bfilt(cb, "band", (500, 3000), 2) * np.exp(-tt / 0.09), rms=-16)
    tt = t_(0.3); sh = bfilt(noise(0.3), "high", 5000, 2) * (np.minimum(1, tt / 0.03) * np.exp(-tt / 0.05))
    add("D", 14, "d15-shaker", "Shaker", "hit", SY + ": high-passed noise with soft attack", sh, rms=-20)

def encode():
    man = {"generated": "2026-10-03", "voice": "Piper TTS en_US-norman-medium", "banks": {"A": [], "B": [], "C": [], "D": []}}
    total = 0
    for s in SAMPLES:
        x = s["x"]; is_mono = np.max(np.abs(x[:, 0] - x[:, 1])) < 1e-4
        wav = os.path.join(OUT, "tmp.wav"); sf.write(wav, x[:, 0] if is_mono else x, SR, subtype="PCM_16")
        fn = s["id"] + ".mp3"; out = os.path.join(OUT, fn)
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", wav, "-codec:a", "libmp3lame", "-q:a", "5" if not is_mono else "6", "-ac", "1" if is_mono else "2", out], check=True)
        sz = os.path.getsize(out); total += sz
        man["banks"][s["bank"]].append({"pad": s["pad"], "file": fn, "name": s["name"], "cat": s["cat"], "dur": round(len(x) / SR, 2), "how": s["how"], "bytes": sz})
    for b in man["banks"].values(): b.sort(key=lambda e: e["pad"])
    json.dump(man, open(os.path.join(OUT, "manifest-full.json"), "w"), indent=1)
    print("samples:", len(SAMPLES), "total MB:", round(total / 1048576, 2))
    return man

if __name__ == "__main__":
    build(); encode()
