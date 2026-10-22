// Kokoro-82M (kokoro-js, Apache-2.0) in a Web Worker — library self-hosted here; only the model weights come from Hugging Face.
import { KokoroTTS, env } from './vendor/kokoro.web.js';
env.wasmPaths = new URL('./vendor/', import.meta.url).href;
let ttsP = null;
function load(model) {
  if (!ttsP) {
    ttsP = KokoroTTS.from_pretrained(model, { dtype: 'q8', device: 'wasm',
      progress_callback: (e) => { if (e && e.file && e.total) self.postMessage({ type: 'progress', file: String(e.file), loaded: +e.loaded || 0, total: +e.total }); } });
    ttsP.catch(() => { ttsP = null; });
  }
  return ttsP;
}
self.onmessage = async (e) => {
  const { id, type, model, text, voice, speed } = e.data || {};
  try {
    const tts = await load(model);
    if (type === 'load') { self.postMessage({ id, ok: true }); return; }
    const out = await tts.generate(text, { voice, speed });
    const audio = out.audio instanceof Float32Array ? out.audio : new Float32Array(out.audio);
    self.postMessage({ id, ok: true, audio, sr: out.sampling_rate }, [audio.buffer]);
  } catch (err) { self.postMessage({ id, ok: false, error: String((err && err.message) || err) }); }
};
