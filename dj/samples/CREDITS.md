# DJ Psycho Fingers sample pack — credits & licences

Original samples made on 3 Oct 2026 for **DJ Psycho Fingers** (Emmanuel Griffith, Dominica) and his free Island Pin DJ booth.

**Honest note:** nothing here is a recording of a real person or ripped from a record. The voice drops are **computer-generated speech (free, local text-to-speech)**, then processed. Everything else is **synthesized from scratch** in code (oscillators, filtered noise, envelopes, delays, reverbs). The generator script is included: [`generate_pack.py`](generate_pack.py).

## Licences

- **The pack itself (all 60 files):** original work created for and owned by **Emmanuel Griffith (DJ Psycho Fingers)**. He can use it anywhere — mixes, live shows, beats, videos, commercial or not. It contains no third-party samples, so nothing needs clearing. (Other people: please ask him before reusing it.)
- **TTS engine:** [Piper](https://github.com/OHF-Voice/piper1-gpl) (`piper-tts` 1.8.0 from PyPI, GPL-3.0). The GPL covers the software, not the audio it outputs; it was only run locally to render the speech.
- **Voice model:** `en_US-norman-medium` from [rhasspy/piper-voices](https://huggingface.co/rhasspy/piper-voices/tree/main/en/en_US/norman/medium) (repository licence: MIT). Model card: US English male voice, trained from scratch on ~15.5 h of **public-domain LibriVox** recordings (dataset licence: public domain), by Bryce Beattie. Chosen over other voices because its training data is public domain (some popular Piper voices use non-commercial datasets).
- **Processing tools:** numpy / scipy (BSD), Rubber Band pitch shifting via FFmpeg (`rubberband` filter, formant-preserving), LAME MP3 encoder via FFmpeg. All free / open source, run locally.

## Format

60 files, MP3 (44.1 kHz; VBR ~100–130 kbps, mono for mono sounds), trimmed, DC-filtered, loudness-matched by RMS and peak-normalised to −1 dBFS. Total **1.62 MB**. The sampler also trims any leading codec silence on load so pads hit on time.

## Bank A — Voice drops & tags

| Pad | Key | Sample | File | Length | How it was made |
|---|---|---|---|---|---|
| A1 | E | DJ Psycho Fingers! | `a01-dj-psycho-fingers.mp3` | 8.2 s | Piper TTS (en_US-norman-medium); pitched -3 st (formant-kept), drive, stereo double, ping-pong delay throw on the last word, plate-style reverb |
| A2 | R | Psycho Fingers on the decks | `a02-on-the-decks.mp3` | 2.5 s | Piper TTS (en_US-norman-medium); first half through a radio band-pass (420–3400 Hz) + drive, second half full-range with drive, double and reverb |
| A3 | T | Dominica stand up! | `a03-dominica-stand-up.mp3` | 3.8 s | Piper TTS (en_US-norman-medium); -2 st, drive, double, big 2.4 s reverb |
| A4 | Y | Nature Isle | `a04-nature-isle.mp3` | 3.0 s | Piper TTS (en_US-norman-medium); -1 st, light drive, dotted-eighth ping-pong echo, reverb |
| A5 | D | Island Pin | `a05-island-pin.mp3` | 2.1 s | Piper TTS (en_US-norman-medium); -2 st, drive, stereo delay throw, reverb |
| A6 | F | Wheel it up! | `a06-wheel-it-up.mp3` | 3.6 s | Piper TTS (en_US-norman-medium); -3 st, heavy drive, delay throw, reverb |
| A7 | G | Rewind! | `a07-rewind.mp3` | 3.0 s | Piper TTS (en_US-norman-medium); -2 st, drive, tape-style pitch fall on the tail (variable-rate resampling), echo + reverb |
| A8 | H | Run it back | `a08-run-it-back.mp3` | 1.8 s | Piper TTS (en_US-norman-medium); -2 st, drive, double, short slap delay, reverb |
| A9 | C | Big tune! | `a09-big-tune.mp3` | 3.1 s | Piper TTS (en_US-norman-medium); -4 st, drive, delay throw, reverb |
| A10 | V | Selector! | `a10-selector.mp3` | 3.3 s | Piper TTS (en_US-norman-medium); -2 st, radio filter + drive, long echo throw |
| A11 | B | Boo-yaka! shout | `a11-boo-yaka.mp3` | 3.6 s | Piper TTS (en_US-norman-medium); -3 st, heavy drive, double, reverb (clean shout) |
| A12 | N | Pull up! Pull up! | `a12-pull-up.mp3` | 2.2 s | Piper TTS (en_US-norman-medium); -3 st, drive, double, echo + reverb |
| A13 | U | Come again! | `a13-come-again.mp3` | 2.1 s | Piper TTS (en_US-norman-medium); -2 st, drive, ping-pong echo, reverb |
| A14 | I | Big up Dominica! | `a14-big-up-dominica.mp3` | 2.6 s | Piper TTS (en_US-norman-medium); -3 st, drive, double, big reverb |
| A15 | J | Psycho Fingers in the mix | `a15-in-the-mix.mp3` | 4.1 s | Piper TTS (en_US-norman-medium); -2 st, drive, radio-to-full, stereo echo throw on 'mix' |

## Bank B — DJ FX

| Pad | Key | Sample | File | Length | How it was made |
|---|---|---|---|---|---|
| B1 | E | Airhorn classic | `b01-airhorn-classic.mp3` | 2.0 s | Synthesized in numpy: detuned saw stack with pitch scoop, horn band-pass + drive, ba-ba-baaa rhythm, echo + reverb |
| B2 | R | Airhorn triple stab | `b02-airhorn-triple.mp3` | 1.4 s | Synthesized in numpy: three short airhorn stabs |
| B3 | T | Airhorn high | `b03-airhorn-high.mp3` | 2.0 s | Synthesized in numpy: higher-pitched airhorn with longer fall |
| B4 | Y | Airhorn long blast | `b04-airhorn-long.mp3` | 2.2 s | Synthesized in numpy: long single blast with downward bend |
| B5 | D | Dub siren classic | `b05-dub-siren-classic.mp3` | 4.3 s | Synthesized in numpy: square osc, square-LFO pitch (wee-oo) at 4 Hz, dub echo 330 ms |
| B6 | F | Dub siren fast | `b06-dub-siren-fast.mp3` | 4.1 s | Synthesized in numpy: rising saw-LFO siren at 9 Hz, dub echo |
| B7 | G | Dub siren falling | `b07-dub-siren-falling.mp3` | 4.7 s | Synthesized in numpy: sine-LFO siren with 2-octave fall, long echo |
| B8 | H | Dub siren wobble | `b08-dub-siren-wobble.mp3` | 4.9 s | Synthesized in numpy: slow sine-LFO wobble siren, dub echo |
| B9 | C | Laser zap | `b09-laser-zap.mp3` | 1.2 s | Synthesized in numpy: square wave exponential pitch dive 3.2 kHz→160 Hz + echo |
| B10 | V | Laser triple | `b10-laser-triple.mp3` | 1.3 s | Synthesized in numpy: three fast laser dives |
| B11 | B | Zap down (sine) | `b11-zap-down.mp3` | 1.3 s | Synthesized in numpy: long sine pitch dive with echo |
| B12 | N | Bomb drop | `b12-bomb-drop.mp3` | 4.6 s | Synthesized in numpy: falling whistle (2.2 kHz→280 Hz) into a noise + sub explosion (no gunshots) |
| B13 | U | Sub drop | `b13-sub-drop.mp3` | 2.5 s | Synthesized in numpy: sine 90→28 Hz pitch dive with long decay |
| B14 | I | Impact | `b14-impact.mp3` | 2.5 s | Synthesized in numpy: sub thump + noise burst + metallic layer + big reverb |
| B15 | J | Riser 4s | `b15-riser.mp3` | 4.3 s | Synthesized in numpy: band-pass noise sweep 300 Hz→9 kHz + rising detuned saws, reverb |
| B16 | K | Downlifter | `b16-downlifter.mp3` | 2.8 s | Synthesized in numpy: falling filtered noise + falling saws, reverb |

## Bank C — Turntable tricks, stabs & sweeps

| Pad | Key | Sample | File | Length | How it was made |
|---|---|---|---|---|---|
| C1 | E | Tape stop | `c01-tape-stop.mp3` | 1.6 s | Synthesized in numpy: a short synthesized beat played at a decelerating rate (1→0) |
| C2 | R | Vinyl rewind | `c02-vinyl-rewind.mp3` | 1.3 s | Synthesized in numpy: synthesized beat played backwards at a fast-then-slowing rate (wheel-up sound) |
| C3 | T | Spinback | `c03-spinback.mp3` | 1.2 s | Synthesized in numpy: beat that is flicked into a backwards spin and slows to a stop |
| C4 | Y | Scratch 'ahh' (baby) | `c04-scratch-ahh-baby.mp3` | 0.8 s | Piper TTS 'Aaaaah' (norman) scratched in numpy: forward/back variable-rate playback (baby scratch) |
| C5 | D | Scratch 'ahh' (chirps) | `c05-scratch-ahh-chirp.mp3` | 0.7 s | Piper TTS 'Aaaaah' with forward/back scratches and a fader-closed return (chirp scratch) |
| C6 | F | 'Fresh' scratch | `c06-fresh-scratch.mp3` | 0.5 s | Piper TTS 'Fresh' (norman), driven, then scratched forward/back |
| C7 | G | 'Fresh' stab | `c07-fresh-stab.mp3` | 1.0 s | Piper TTS 'Fresh' (norman), -1 st, drive, short reverb |
| C8 | H | 'Yeah!' stab | `c08-yeah-stab.mp3` | 1.2 s | Piper TTS 'Yeah' (norman), -3 st, heavy drive, slap echo |
| C9 | C | 'Hey!' stab | `c09-hey-stab.mp3` | 3.0 s | Piper TTS 'Hey' (norman), -2 st, drive, double, reverb |
| C10 | V | Reverse cymbal | `c10-reverse-cymbal.mp3` | 2.8 s | Synthesized in numpy: metallic cymbal (6 inharmonic square partials + high-passed noise) reversed |
| C11 | B | Noise sweep up | `c11-noise-sweep-up.mp3` | 2.0 s | Synthesized in numpy: white noise through a resonant band-pass sweeping 200 Hz→12 kHz |
| C12 | N | Noise sweep down | `c12-noise-sweep-down.mp3` | 2.0 s | Synthesized in numpy: white noise through a resonant band-pass sweeping 12 kHz→150 Hz |
| C13 | U | Reverse 'Rewind' swell | `c13-reverse-rewind.mp3` | 2.6 s | Piper TTS 'Rewind' with heavy reverb, played reversed (reverse reverb swell) |
| C14 | I | Transformer scratch | `c14-transformer.mp3` | 0.6 s | Piper TTS 'Aaaaah' chopped with a fast fader gate (transformer pattern) |

## Bank D — Hip-hop & dancehall hits

| Pad | Key | Sample | File | Length | How it was made |
|---|---|---|---|---|---|
| D1 | E | 808 boom | `d01-808-boom.mp3` | 2.2 s | Synthesized in numpy: sine 808 with pitch glide 120→45 Hz, long decay, saturation |
| D2 | R | Boom-bap kick | `d02-boombap-kick.mp3` | 0.5 s | Synthesized in numpy: punchy pitched sine kick with click, drive |
| D3 | T | Boom-bap snare | `d03-boombap-snare.mp3` | 0.5 s | Synthesized in numpy: triangle body + band-passed noise, drive, short room |
| D4 | Y | Clap | `d04-clap.mp3` | 0.7 s | Synthesized in numpy: 4 noise bursts (multi-tap clap) + small room |
| D5 | D | Rimshot | `d05-rimshot.mp3` | 0.1 s | Synthesized in numpy: two sine partials + noise click |
| D6 | F | Open hat | `d06-open-hat.mp3` | 0.9 s | Synthesized in numpy: 6 inharmonic square partials + noise, high-passed, 0.2 s decay |
| D7 | G | Dancehall kick | `d07-dancehall-kick.mp3` | 0.7 s | Synthesized in numpy: tight, high-tuned kick with longer sub tail |
| D8 | H | Dancehall snare + rim | `d08-dancehall-snare.mp3` | 0.3 s | Synthesized in numpy: tight high-tuned snare layered with a rim click |
| D9 | C | Timbale fill | `d09-timbale-fill.mp3` | 1.2 s | Synthesized in numpy: 9 tuned metallic-drum hits descending (timbale-style fill) |
| D10 | V | Steel pan stab | `d10-steel-pan-stab.mp3` | 1.9 s | Synthesized in numpy: additive steel-pan style chord (A major), reverb |
| D11 | B | Brass stab | `d11-brass-stab.mp3` | 1.2 s | Synthesized in numpy: detuned saw minor chord with closing low-pass (synth brass/orchestra stab), reverb |
| D12 | N | Piano stab (min9) | `d12-piano-stab.mp3` | 1.4 s | Synthesized in numpy: additive piano-like A minor 9 chord |
| D13 | U | Bass womp | `d13-bass-womp.mp3` | 0.8 s | Synthesized in numpy: saw bass with resonant low-pass dive |
| D14 | I | Cowbell | `d14-cowbell.mp3` | 0.5 s | Synthesized in numpy: two square partials (562 + 845 Hz), band-passed, fast decay |
| D15 | J | Shaker | `d15-shaker.mp3` | 0.3 s | Synthesized in numpy: high-passed noise with soft attack |

Empty pads (A16, C15, C16, D16) are left free for your own samples (EDIT → *Load your own file…*; stored only in your browser).

## Regenerate

```
python3 -m venv venv && ./venv/bin/pip install numpy scipy soundfile piper-tts
# download en_US-norman-medium.onnx + .onnx.json into voices/ (rhasspy/piper-voices)
./venv/bin/python generate_pack.py   # needs ffmpeg with librubberband + libmp3lame
```
