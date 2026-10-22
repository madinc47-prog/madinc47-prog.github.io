// On-device speech → text with Whisper (Transformers.js, Apache-2.0), self-hosted library; weights from Hugging Face (cached by the browser).
import { pipeline, env } from './vendor/transformers.min.js';
env.allowLocalModels = false;
env.backends.onnx.wasm.wasmPaths = new URL('./vendor/', import.meta.url).href;
const P = {};
function get(model) {
  if (!P[model]) {
    P[model] = pipeline('automatic-speech-recognition', model, { dtype: 'q8', device: 'wasm',
      progress_callback: (e) => { if (e && e.status === 'progress' && e.total) self.postMessage({ type: 'progress', file: String(e.file), loaded: +e.loaded || 0, total: +e.total }); } });
    P[model].catch(() => { delete P[model]; });
  }
  return P[model];
}
self.onmessage = async (e) => {
  const { audio, model, language } = e.data || {};
  try {
    const asr = await get(model);
    self.postMessage({ type: 'status', msg: 'Listening…' });
    const opts = { return_timestamps: true, chunk_length_s: 30, stride_length_s: 5 };
    if (language) { opts.language = language; opts.task = 'transcribe'; }
    const out = await asr(audio, opts);
    self.postMessage({ type: 'done', text: out.text, chunks: out.chunks || [] });
  } catch (err) { self.postMessage({ type: 'error', error: String((err && err.message) || err) }); }
};
