# Free Host Apps — IslePin suite

Static HTML/CSS/JS sites for free GitHub Pages. No build step, no paid APIs.

**Site base URL:** https://madinc47-prog.github.io  
**Author:** Emmanuel Griffith (Dominica)

## Apps

| Path | App | What it is |
|------|-----|------------|
| `/` | **IslePin** | Dominica local pinboard — post jobs, pin shops, filter by parish. Offline-first (`localStorage`). Starts empty; no sample listings. |
| `/beats/` | **Island Pin Beats** | Browser beat maker for rappers/DJs. Trap / Drill / Phonk kits (Web Audio synth), 16 pads, step sequencer with hat rolls, chord loop, song form timeline, chords/keys, mixer (incl. Vocal channel), Lyrics tab + BPM-synced teleprompter, Record Vocals over the beat (mic, 1-bar count-in), song presets ("The Streets Is Calling"), Studio preview frames, Record/Bounce → WAV Vault, Reference track (upload a song you own; A/B vs your beat with `R`, loop region, sync start, tempo estimate; Mixer: Ref channel, approx-LUFS level match, meters, spectrum overlay — monitor-only, never recorded/bounced, stays on device). |
| `/isle-voice/` | **Isle Voice MVP** | Voice bank + lyrics/prompt studio + draft instrumental generator. Honest free path: prepares WAVs/lyrics for free RVC (Colab) voice conversion — does **not** claim in-browser voice-clone singing. |

## Open locally

From this folder:

```bash
# any static server works, e.g.
python3 -m http.server 8080
```

Then visit:

- http://localhost:8080/ — IslePin  
- http://localhost:8080/beats/ — Island Pin Beats  
- http://localhost:8080/isle-voice/ — Isle Voice  

Or open the HTML files directly in a browser. Mic recording and some storage features need a secure context (HTTPS or `localhost`).

## Deploy (GitHub Pages)

Point Pages at this folder (or push it as the Pages root). Keep relative paths. Do not rename `beats/` or `isle-voice/`.

Included at site root: `robots.txt`, `sitemap.xml`, `404.html`.

`assets/hero-dominica.jpg` is the original IslePin hero photo (aerial view of Dominica's west coast), restored byte-for-byte from https://islepin.grok.me/hero-dominica.jpg.

## Constraints

- Pure static: HTML / CSS / JS only  
- Free only — no paid APIs, no accounts required  
- User content stays on the device (`localStorage` / IndexedDB) until the user downloads it  
