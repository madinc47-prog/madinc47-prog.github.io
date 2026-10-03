# shared/user-samples.js — shared user samples (DJ Sample Studio ⇄ Island Pin Beats)

Short sounds made in the DJ booth's **Sample Studio** (`/dj/?studio=1`) are saved here and show up in
**Island Pin Beats → pad → Sample library → My Samples** (read by `beats/user-samples.js`).
Full songs/mixes go to `media-store.js` instead (Player library).

- IndexedDB **`islepin-samples`**, store **`samples`** (keyPath `id`, index `createdAt`). Separate DB from `islepin-media`, so neither module needs a schema upgrade that could block the other.
- BroadcastChannel **`islepin-samples`** → `{ type: 'sample-added' | 'sample-deleted', id, name }`.

Record: `{ id, name, blob /* audio/wav */, mime, duration, sampleRate, createdAt, source: 'dj-studio'|'beats'|'import', tags?, loop?: { start, end } }`

| Function | Returns |
|---|---|
| `saveSample({ name, blob, duration?, sampleRate?, source?, tags?, loop?, id? })` | `Promise<id>` (existing `id` overwrites) |
| `listSamples()` | `Promise<Sample[]>` newest first |
| `getSample(id)` | `Promise<Sample \| null>` |
| `deleteSample(id)` | `Promise<true>` |
| `onSamplesChange(cb)` | `unsubscribe()` |

Deep link: `/beats/?sample=<id>` opens Beats with that sample highlighted in the pad Sample library (My Samples), ready to **Use** on a pad.
