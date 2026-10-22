# Collab / device-sharing policy (whole suite)

Any feature where one user's device talks to **another user's** device — live rooms, calls, watch-together,
remote mic/camera, shared beats/lyrics/recordings, remote control — MUST:

1. Use **`/shared/collab-core.js`** (`CollabCore.invite / accept / getRoom / signal / onSignals`) and the
   `rooms` + `room_signals` tables from `/collab/supabase.sql`. No other signaling path, no other backend, no PeerJS/Firebase/etc.
2. Be **invite-only**: the invitee must accept (`status: invited → active`, only the guest can accept).
3. Be **strictly 1-to-1**: exactly the inviter (`host`) and invitee (`guest`). Members are immutable server-side;
   RLS lets only those two read/write the room and its signals; clients open one peer connection and drop
   signals from anyone else. No group rooms, no observers, no forwarding to a third party.
4. Require **signed-in users** (Supabase Auth) on both ends.
5. Share media/data **only between those two** (peer-to-peer WebRTC; TURN only relays encrypted packets).
6. Keep recordings **raw** and on the recording user's device unless that user exports them.
7. Not launch until a **TURN relay** is configured (`COLLAB_CONFIG.iceServers`), so calls work on all networks.

Out of scope (not "collab", allowed as-is): public publishing the user starts themselves (Go Live to their own
YouTube/Facebook/etc. via WHIP, TV/Radio uploads/submissions), OS share sheet / wa.me links the user taps, and
same-device sync between tabs (BroadcastChannel) or pop-out windows.

## Audit 2026-10-22
| App | Cross-user live/room/remote-device? | Status |
|---|---|---|
| Collab Map + Collab Room (`/collab/`) | Yes — DMs, 1-to-1 rooms | Built on CollabCore + RLS ✅ |
| Beats / Studio / Multitrack / MIDI / Master | No (local; optional own-account Supabase sync of own data) | Local-only ✅ |
| Go Live (`beats/live.*`) | Broadcast to the user's own platforms (WHIP), not user↔user | Out of scope ✅ |
| DJ Decks / Video DJ / Program window | Same-device only (BroadcastChannel, pop-out) | Local-only ✅ |
| Lyrics Lab, Isle Voice, Player | On-device; share sheet only | Local-only ✅ |
| Radio, TV (Afterglow) | Public content + uploads/submissions; no watch-together | No collab ✅ — a future watch-together must use CollabCore |
| Video Studio, Jobs/Shops home | No live sharing | Local/public pages ✅ |
