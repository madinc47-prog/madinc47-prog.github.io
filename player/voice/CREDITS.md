# Hype-talk voice clips

* **Model:** Kokoro-82M v1.0 (hexgrad), Apache-2.0 — https://huggingface.co/hexgrad/Kokoro-82M
* **Renderer:** kokoro-onnx 0.6.1 (MIT) on CPU; voice **am_fenrir**
* **Takes:** 3 per line (speed 1.06 / 1.12 / 1.18); the liveliest (widest pitch range) was kept
* **Processing:** light warmth (soft saturation), 85 Hz high-pass, gentle 2.5:1 compression, short slap echo (85/170 ms)
* **Loudness:** every clip normalised to about −20 LUFS integrated, sample peaks below −6 dBFS, mono 64 kb/s MP3
* **Custom names / places** typed in the player are rendered on the device with kokoro-js (same model and voice, q8 ONNX via
  transformers.js) and cached in IndexedDB (`pf-voice-cache`).

`voice.json` lists every clip with its text, duration, loudness and peak.
