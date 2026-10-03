/**
 * shared/media-store.js — IslePin shared media library (same-origin, no deps).
 *
 * One IndexedDB database ('islepin-media', store 'tracks') shared by
 * /beats/ (Island Pin Beats), /dj/ (DJ booth) and /player/ (Psycho Fingers Player).
 * Everything stays on the user's device. A BroadcastChannel('islepin-media')
 * tells any open tab (e.g. the Player) the moment a track is added or removed.
 *
 * Track record:
 *   { id, title, artist, source: 'beats'|'dj'|'player'|'import',
 *     blob, mime, duration, createdAt, artwork? }
 *   artwork may be a Blob (image/*) or a string URL / data: URL.
 *
 * API (all async except the subscribe helpers):
 *   saveTrack({ title, artist, source, blob, mime?, duration?, artwork?, id?, createdAt? }) -> id
 *   listTracks({ source? })  -> Track[]  (newest first)
 *   getTrack(id)             -> Track | null
 *   deleteTrack(id)          -> true
 *   onTrackAdded(cb)         -> unsubscribe()   cb({ type:'track-added', id, source, title, artist, createdAt })
 *   onMediaChange(cb)        -> unsubscribe()   cb(msg) for 'track-added' and 'track-deleted'
 *   playerUrl(id)            -> absolute URL of /player/?track=<id>
 *   sendToPlayer(track, { open = true } = {}) -> id   (saveTrack + open the Player in a new tab)
 */

export const DB_NAME = 'islepin-media';
export const STORE = 'tracks';
export const CHANNEL = 'islepin-media';
export const SOURCES = ['beats', 'dj', 'player', 'import'];
const DB_VERSION = 1;

let dbPromise = null;

function req2p(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function openMediaDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) { reject(new Error('IndexedDB not available')); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const st = db.createObjectStore(STORE, { keyPath: 'id' });
        st.createIndex('source', 'source', { unique: false });
        st.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => { db.close(); dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => { dbPromise = null; reject(req.error); };
    req.onblocked = () => console.warn('[media-store] open blocked by another tab');
  });
  return dbPromise;
}

async function tx(mode, fn) {
  const db = await openMediaDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const st = t.objectStore(STORE);
    let result;
    Promise.resolve(fn(st)).then((r) => { result = r; }, reject);
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('transaction aborted'));
  });
}

function newId() {
  const rnd = (globalThis.crypto && crypto.randomUUID) ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
  return 't' + Date.now().toString(36) + '-' + rnd;
}

function post(msg) {
  try {
    if (!('BroadcastChannel' in globalThis)) return;
    const ch = new BroadcastChannel(CHANNEL); // separate instance so same-page listeners also hear it
    ch.postMessage(msg);
    setTimeout(() => ch.close(), 50);
  } catch (e) { /* ignore */ }
}

/** Save (or overwrite, if id given) a track. Returns its id. */
export async function saveTrack(track = {}) {
  const { blob } = track;
  if (!(blob instanceof Blob)) throw new TypeError('saveTrack: blob (Blob/File) is required');
  const source = SOURCES.includes(track.source) ? track.source : 'import';
  const rec = {
    id: track.id ? String(track.id) : newId(),
    title: String(track.title || (blob.name ? blob.name.replace(/\.[^.]+$/, '') : 'Untitled')).slice(0, 200),
    artist: String(track.artist || '').slice(0, 200),
    source,
    blob,
    mime: track.mime || blob.type || 'audio/mpeg',
    duration: Number.isFinite(+track.duration) ? +track.duration : 0,
    createdAt: Number.isFinite(+track.createdAt) && +track.createdAt > 0 ? +track.createdAt : Date.now(),
  };
  if (track.artwork) rec.artwork = track.artwork;
  await tx('readwrite', (st) => req2p(st.put(rec)));
  post({ type: 'track-added', id: rec.id, source: rec.source, title: rec.title, artist: rec.artist, createdAt: rec.createdAt });
  return rec.id;
}

/** List tracks, newest first. Optionally filter by source. */
export async function listTracks({ source } = {}) {
  const rows = await tx('readonly', (st) => {
    if (source) return req2p(st.index('source').getAll(IDBKeyRange.only(source)));
    return req2p(st.getAll());
  });
  return (rows || []).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export async function getTrack(id) {
  if (id == null) return null;
  const r = await tx('readonly', (st) => req2p(st.get(String(id))));
  return r || null;
}

export async function deleteTrack(id) {
  await tx('readwrite', (st) => req2p(st.delete(String(id))));
  post({ type: 'track-deleted', id: String(id) });
  return true;
}

/** Subscribe to every change message. Returns an unsubscribe function. */
export function onMediaChange(cb) {
  if (!('BroadcastChannel' in globalThis)) return () => {};
  const ch = new BroadcastChannel(CHANNEL);
  ch.onmessage = (e) => { if (e.data && e.data.type) cb(e.data); };
  return () => ch.close();
}

/** Subscribe to 'track-added' only. */
export function onTrackAdded(cb) {
  return onMediaChange((m) => { if (m.type === 'track-added') cb(m); });
}

/** Absolute URL of the Player deep link for a stored track. */
export function playerUrl(id) {
  return new URL('../player/?track=' + encodeURIComponent(id), import.meta.url).href;
}

/** Save then (optionally) open the Player on it. Returns the id. */
export async function sendToPlayer(track, { open = true } = {}) {
  const id = await saveTrack(track);
  if (open && typeof window !== 'undefined') window.open(playerUrl(id), 'psycho-fingers-player');
  return id;
}

export default { saveTrack, listTracks, getTrack, deleteTrack, onTrackAdded, onMediaChange, playerUrl, sendToPlayer, openMediaDB };
