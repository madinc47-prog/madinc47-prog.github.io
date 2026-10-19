# Beats login setup (Supabase, free) — for Emmanuel

Status: code is ready-to-connect. Until steps below are done, Beats shows
"Login not set up yet" and works exactly as before (guest, on-device only).
Cross-device sync does NOT work until a real project is connected + tested.

## 1. Create the free project (5 min, no card)
1. supabase.com → Sign in (GitHub/Google) → New project. Name: island-pin-beats.
2. Wait for provisioning. Note: free projects pause after ~1 week idle;
   first visit after that is slow while it wakes. No backups on free.

## 2. Run the SQL
SQL Editor → paste all of `supabase/schema.sql` → Run.
This creates `user_data` + Row-Level Security: a signed-in user can only
read/write rows where user_id = their own id.

## 3. Auth settings
Authentication → URL Configuration:
- Site URL: https://madinc47-prog.github.io/beats/
- Redirect URLs: add https://madinc47-prog.github.io/beats/ (and http://localhost:* if testing)
Email provider stays ON (magic link). No SMTP needed for low volume
(Supabase sends the mail; free limits apply — check their current docs).

## 4. Paste keys into Beats
Project Settings → API: copy Project URL + anon/public key.
Put them in `beats/auth-config.js` (the two empty strings).
NEVER paste the service_role key anywhere in this repo — anon key + RLS is the safe public key.
Commit + push; GitHub Pages deploys.

## 5. Test (do not skip)
- Computer A: open Beats, make a beat, Account → email link → sign in →
  "Bring this device's beats" → Sync now shows Synced.
- Computer B (or phone): sign in with same email → account copy loads.
- Sign in with a different email → must see clean empty state, none of A's songs.
- Log out on A → A's beats gone from that device; guest Restore button offers pre-login guest copy.

## What syncs (v1)
ipb_session_v1 (beat/patterns/mixer), ipb_songs_v1 (lyrics/songs),
ipb_piano_lib_v1, ipb_padassign_v1 (metadata; sample audio blobs stay local),
ipb_midi_settings_v2, ipb_midi_learn_v2.
Not synced: Vault/Studio audio (1GB free storage fills fast with WAV),
USB deviceId (meaningless on another machine), voice-clone, device prefs.
Known v1 limitation: deleting a synced key locally does not delete its
remote row yet (upsert-only). Offline: work is saved on-device, Sync line
says so, next Sync now / auto-sync (20s after a change) uploads.
