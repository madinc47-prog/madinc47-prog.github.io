# shared/ — IslePin music ecosystem glue

Same-origin vanilla ES modules (no dependencies, no build) used by
`/beats/` (Island Pin Beats), `/dj/` (DJ booth) and `/player/` (Psycho Fingers Player).
Everything stays on the user's device (IndexedDB). Nothing is uploaded.

## `media-store.js` — shared track library

- IndexedDB database **`islepin-media`**, object store **`tracks`** (keyPath `id`, indexes `source`, `createdAt`).
- BroadcastChannel **`islepin-media`** — every open tab (e.g. the Player) hears changes live.

Track record:

```js
{ id, title, artist, source: 'beats'|'dj'|'player'|'import',
  blob, mime, duration /* seconds, 0 if unknown */, createdAt /* ms epoch */,
  artwork? /* Blob (image/*) or URL / data: URL string */ }
```

API:

| Function | Returns | Notes |
|---|---|---|
| `saveTrack({ title, artist, source, blob, mime?, duration?, artwork?, id?, createdAt? })` | `Promise<id>` | `blob` (Blob/File) required. Unknown `source` → `'import'`. Passing an existing `id` overwrites. Broadcasts `{type:'track-added', id, source, title, artist, createdAt}`. |
| `listTracks({ source? })` | `Promise<Track[]>` | Newest first. |
| `getTrack(id)` | `Promise<Track\|null>` | |
| `deleteTrack(id)` | `Promise<true>` | Broadcasts `{type:'track-deleted', id}`. |
| `onTrackAdded(cb)` | `unsubscribe()` | `cb(msg)` on `track-added` (other tabs **and** the same page). |
| `onMediaChange(cb)` | `unsubscribe()` | All messages (`track-added`, `track-deleted`). |
| `playerUrl(id)` | `string` | Absolute `/player/?track=<id>` deep link. |
| `sendToPlayer(track, { open = true })` | `Promise<id>` | `saveTrack` + opens the Player tab (named `psycho-fingers-player`). Call it from a click handler so the popup isn't blocked. |

### "Send to Player" — 3-line integration

From an ES module (or inside any `async` click handler in a classic script — dynamic `import()` works there too):

```js
const { saveTrack } = await import('../shared/media-store.js');
const id = await saveTrack({ title: 'My Beat', artist: 'DJ Psycho Fingers', source: 'beats' /* or 'dj' */, blob: wavBlob, mime: 'audio/wav', duration: seconds });
window.open('../player/?track=' + id, 'psycho-fingers-player'); // optional: jump to the Player
```

If the Player is already open in another tab it updates live (BroadcastChannel) — the `window.open` line is optional.
`artwork` is optional; pass a cover image Blob or data URL if you have one, otherwise the Player generates a label.

## Player deep links

- `/player/?track=<id>` — play a stored track.
- `/player/?src=<url>&title=<title>&artist=<artist>` — play any URL (must be same-origin or CORS-enabled for the visualizer).

## `ecosystem-nav.js` — Beats | DJ Booth | Player switcher

One tag, self-injecting, styles isolated in a shadow root, highlights the current app, and shows a gold badge
on **Player** with the number of tracks added to the shared store since the Player was last opened.

```html
<script type="module" src="../shared/ecosystem-nav.js"></script>                    <!-- thin 34px bar at top of <body> (in flow) -->
<script type="module" src="../shared/ecosystem-nav.js?mode=pill&pos=br"></script>   <!-- floating pill: pos = tl | tr | bl | br -->
<script type="module" src="../shared/ecosystem-nav.js?mode=inline&target=%23navslot"></script> <!-- inside #navslot -->
```

For full-height (100vh) layouts prefer `mode=pill` so the bar doesn't push content down.
`window.IslePinNav.refresh()` re-counts the badge on demand.
