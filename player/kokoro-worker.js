// On-device voice (kokoro-js, Kokoro-82M) in a Web Worker, so downloading the model and generating speech never
// blocks the page — on the main thread it froze the player (and stuttered the music) for seconds at a time.
const KOKORO_URL = 'https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm';
let ttsP = null;
function load(model) {
  if (!ttsP) {
    ttsP = (async () => {
      const { KokoroTTS } = await import(KOKORO_URL);
      return KokoroTTS.from_pretrained(model, {
        dtype: 'q8', device: 'wasm',
        progress_callback: (e) => { if (e && e.file && e.total) self.postMessage({ type: 'progress', file: String(e.file), loaded: +e.loaded || 0, total: +e.total }); },
      });
    })();
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
  } catch (err) {
    self.postMessage({ id, ok: false, error: String((err && err.message) || err) });
  }
};
