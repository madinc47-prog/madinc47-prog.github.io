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

## `user-samples.js` — shared user samples (one-shots / loops)

Separate IndexedDB `islepin-samples` (store `samples`, BroadcastChannel `islepin-samples`) so it never forces a
version bump on `islepin-media`. Written by the DJ booth **Sample Studio → Save to library**, read by Beats
(**pad Sample library → My Samples**, via `beats/user-samples.js`). API: `saveSample`, `listSamples`, `getSample`,
`deleteSample`, `onSamplesChange` (also `globalThis.IslePinSamples`). Full docs: [USER-SAMPLES.md](USER-SAMPLES.md).

## `share.js` — Share button (any app page)

Self-contained classic script (no dependencies, no CDN, styles in a shadow root). One tag per page:

```html
<script src="/shared/share.js" defer
        data-title="Island Pin Beats" data-text="Make beats free in your browser"
        data-position="inline" data-target=".topbar .brand"></script>
```

- **Phones / tablets** (touch + `navigator.share` + `navigator.canShare` OK): opens the native share sheet with `{title, text, url}`. Closing the sheet (AbortError) is silent; any other failure falls back to the panel.
- **Desktop** (or no Web Share): copies the link (Clipboard API, `execCommand` fallback), shows a "Copied!" toast and a panel with the link, a QR code (drawn locally by `shared/qrcode.js`, qrcode-generator 2.0.4, MIT, lazy-loaded on first open), and WhatsApp / Facebook / X / Email links (+ "More" when the browser has Web Share). Esc / outside click closes; focus returns to the button.
- **Link** = this page's origin + path (`index.html` dropped), no hash, no query except `data-keep` params and the optional tab deep link. Inside an iframe the button is hidden (the parent page shares).

| Attribute | Default | |
|---|---|---|
| `data-title` / `data-text` | og:title / og:description | share sheet + panel text |
| `data-url` | current page (cleaned) | fixed link |
| `data-keep` | — | comma list of query params to keep (e.g. `track`) |
| `data-keep-hash` | off | `1` keeps `#hash` |
| `data-tab-selector`, `data-tab-attr`, `data-tab-param`, `data-tab-default` | —, `data-tab`, `tab`, — | deep link to the open tab: `?tab=<attr value>` unless it's the default tab |
| `data-position` | `br` | `br` `bl` `tr` `tl` (floating) or `inline` |
| `data-target`, `data-insert` | —, `end` | inline: CSS selector + `start` `end` `before` `after` (missing target → floating `br`) |
| `data-offset` | `16,16` | floating: x,y px from the corner (+ safe-area insets) |
| `data-label` | `Share` | |
| `data-compact` | `0` | icon-only below this viewport width (px); the aria-label stays |
| `data-native` | `auto` | `auto` (touch devices) · `always` · `never` |
| `data-in-frame` | `hide` | `show` to render inside iframes |
| `data-auto` | `true` | `false` = no button, use the API |

JS API — `window.IslePinShare`: `share(opts?)`, `open(opts?)` (desktop panel), `close()`, `getUrl()`, `configure({title, text, url, getUrl: fn, keep: [...]})`,
`attach(buttonEl, opts?)` (turn your own button into a share button), `copy(text)`, `button` (host element or null).
`document` gets an `islepin-share` event `{detail: {method: 'native'|'copy'|'panel', url}}`.

Reuse in an app that already has its own button (e.g. Player, Mastering):

```html
<script src="/shared/share.js" defer data-auto="false" data-title="Psycho Fingers Player" data-keep="track"></script>
<script>addEventListener('DOMContentLoaded', () => IslePinShare.attach(document.getElementById('my-share-btn')));</script>
```

Service workers: precache `/shared/share.js` and `/shared/qrcode.js`.
