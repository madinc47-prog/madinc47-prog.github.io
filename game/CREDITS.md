# DJ Psycho Fingers — The Game: credits & licences

- **Engine:** three.js r160 (MIT), vendored in `lib/` (Water, Sky, Reflector, EffectComposer, UnrealBloomPass, OutputPass, RGBELoader, BufferGeometryUtils from three.js examples, MIT).
- **Elevation:** AWS Terrain Tiles (Terrarium encoding, z12; sources incl. SRTM / USGS, public domain / open), resampled to `data/dominica_h.png`.
- **Streets & building footprints:** © OpenStreetMap contributors, ODbL 1.0 — https://www.openstreetmap.org/copyright (`data/roseau.json`, Roseau extract, 22 Oct 2026).
- **PBR textures (CC0):** ambientCG — Asphalt025C, Concrete031, WoodSiding008, CorrugatedSteel007A, Planks037B, Grass004, PaintedPlaster017 (resized to 512 px).
- **HDRI (CC0):** Poly Haven — venice_sunset (1k), used as interior environment lighting.
- **Water normals:** three.js examples `waternormals.jpg` (MIT).
- **Voice lines:** Kokoro-82M TTS (kokoro-onnx, Apache-2.0), voice `af_bella` — the same voice used for the DJ Psycho Fingers female drop in DJ Decks — rendered locally, light EQ/compression via FFmpeg.
- **Drums, ambience, scratch:** synthesized live with Web Audio (original).
- **Car radio:** live Dominica stations from the Island Beats Radio list (Hits 767, Kairi FM, Q95), procedural beat fallback when offline.
- Facades, fretwork, neon signs, canopy, palms, trees, avatars, car, studio gear: procedural, original.
