# RNNoise (vendored)

Noise suppression for the Island Pin Beats take cleaner (`../../vocal-clean-worker.js`).

| File | What it is |
|---|---|
| `rnnoise.js` + `rnnoise.wasm` | RNNoise 0.1 model (small, 124 KB). Used as the fallback build. |
| `rnnoise-sync.js` | RNNoise 0.2 model with the WASM inlined (~1.9 MB, ~1.3 MB gzip). The default build: in our synthetic tests it removed 1–3 dB more beat bleed and ~2 dB more room noise than 0.1. |

Source: npm package [`@jitsi/rnnoise-wasm`](https://www.npmjs.com/package/@jitsi/rnnoise-wasm) **0.2.1**. Files are byte-for-byte copies of its `dist/` folder.

Licences:
- RNNoise by Jean-Marc Valin / Xiph.Org / Mozilla / Amazon: BSD-3-Clause, see `COPYING-rnnoise.txt`.
- The WASM build and JS glue by Jitsi (8x8): Apache-2.0, see `LICENSE-jitsi-rnnoise-wasm.txt`.

Both licences allow free redistribution with these notices kept. Everything runs in the browser and nothing is uploaded.
