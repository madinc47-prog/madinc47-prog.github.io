/**
 * shared/user-samples.js — IslePin shared USER SAMPLES store (same-origin, no deps).
 * Short sounds (one-shots, vocal drops, loops) made in the DJ booth's Sample Studio (/dj/?studio=1) and read by
 * Island Pin Beats (/beats/ → pad Sample library → "My Samples"). Separate database from media-store.js (full tracks),
 * so neither module ever needs a schema upgrade that would block the other.
 *
 * IndexedDB 'islepin-samples' · store 'samples' (keyPath 'id', index 'createdAt')
 * Record: { id, name, blob (audio/wav), mime, duration, sampleRate, createdAt, source: 'dj-studio'|'beats'|'import', tags?: string[], loop?: {start, end} }
 * BroadcastChannel 'islepin-samples' → { type: 'sample-added' | 'sample-deleted', id, name }
 *
 * API: saveSample(rec) → id · listSamples() → newest first · getSample(id) · deleteSample(id) · onSamplesChange(cb) → unsubscribe
 * Classic scripts: `import('../shared/user-samples.js')` inside a function, or read window.IslePinSamples after it loads.
 */
export const DB_NAME = 'islepin-samples';
export const STORE = 'samples';
export const CHANNEL = 'islepin-samples';
let dbp = null;
function p(req) { return new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); }); }
function open() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    if (!('indexedDB' in globalThis)) { rej(new Error('IndexedDB not available')); return; }
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => { const db = r.result; if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' }).createIndex('createdAt', 'createdAt'); };
    r.onsuccess = () => { const db = r.result; db.onversionchange = () => { db.close(); dbp = null; }; res(db); };
    r.onerror = () => { dbp = null; rej(r.error); };
  });
  return dbp;
}
async function tx(mode, fn) {
  const db = await open();
  return new Promise((res, rej) => { const t = db.transaction(STORE, mode); let out; Promise.resolve(fn(t.objectStore(STORE))).then((v) => { out = v; }, rej); t.oncomplete = () => res(out); t.onerror = t.onabort = () => rej(t.error || new Error('transaction failed')); });
}
function post(msg) { try { const ch = new BroadcastChannel(CHANNEL); ch.postMessage(msg); setTimeout(() => ch.close(), 50); } catch (e) { /* no BroadcastChannel */ } }
export async function saveSample(rec = {}) {
  if (!(rec.blob instanceof Blob)) throw new TypeError('saveSample: blob is required');
  const r = { id: rec.id ? String(rec.id) : 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: String(rec.name || 'My sample').slice(0, 80),
    blob: rec.blob, mime: rec.mime || rec.blob.type || 'audio/wav', duration: +rec.duration || 0, sampleRate: +rec.sampleRate || 0,
    createdAt: +rec.createdAt || Date.now(), source: rec.source || 'import', tags: Array.isArray(rec.tags) ? rec.tags.slice(0, 12) : [] };
  if (rec.loop && rec.loop.end > rec.loop.start) r.loop = { start: +rec.loop.start, end: +rec.loop.end };
  await tx('readwrite', (st) => p(st.put(r)));
  post({ type: 'sample-added', id: r.id, name: r.name });
  return r.id;
}
export async function listSamples() { const rows = await tx('readonly', (st) => p(st.getAll())); return (rows || []).filter((r) => r && r.blob).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)); }
export async function getSample(id) { if (id == null) return null; return (await tx('readonly', (st) => p(st.get(String(id))))) || null; }
export async function deleteSample(id) { await tx('readwrite', (st) => p(st.delete(String(id)))); post({ type: 'sample-deleted', id: String(id) }); return true; }
export function onSamplesChange(cb) { try { const ch = new BroadcastChannel(CHANNEL); ch.onmessage = (e) => { if (e.data && e.data.type) cb(e.data); }; return () => ch.close(); } catch (e) { return () => {}; } }
const api = { saveSample, listSamples, getSample, deleteSample, onSamplesChange, DB_NAME, STORE, CHANNEL };
globalThis.IslePinSamples = api;
export default api;
