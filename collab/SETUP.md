# Collab Map — one-time setup (Emmanuel, ~10 minutes)

Until this is done the page at /collab/ shows **"Setup pending"** and nobody can sign in. Nothing is faked.

1. Go to https://supabase.com → **Start your project** → sign in (GitHub or email) → **New project**.
   Name `island-pin-collab`, pick a strong DB password (save it in your password manager), region **East US (North Virginia)**, **Free** plan.
2. When it's ready: left menu **SQL Editor** → **New query** → paste the whole of [`supabase.sql`](supabase.sql) → **Run**. It should say "Success". (Safe to run again.)
3. **Authentication → Sign In / Providers → Email**: make sure Email is **enabled** (magic link is on by default). "Confirm email" can stay on.
4. **Authentication → URL Configuration**:
   - Site URL: `https://madinc47-prog.github.io/collab/`
   - Redirect URLs → Add: `https://madinc47-prog.github.io/collab/`
5. **Project Settings → API** (or **Data API / API Keys**): copy the **Project URL** (`https://xxxx.supabase.co`) and the **anon public** key. **Do not** copy the `service_role` / secret key.
6. Send those two values to Grok Bot (or paste them into `collab/config.js`):
   ```js
   window.COLLAB_CONFIG = { supabaseUrl: "https://xxxx.supabase.co", supabaseAnonKey: "eyJ..." };
   ```
   The anon key is safe to be public because every table is locked by Row Level Security.

Optional: the free plan's built-in email sender is limited to a few sign-in emails per hour. If lots of people join, add a free SMTP (e.g. Resend) under Authentication → Emails → SMTP.

## What the SQL creates
- `profiles` — display name (≤24), tagline (≤40, user-written), role, village name + village centre (coords limited to Dominica, rounded), `visible` (default **off**), WhatsApp (stored only while "show" is on), avatar URL, last_seen. Readable only when visible (or your own); writable only by the owner.
- `messages` — DMs readable only by sender/recipient; sender forced to the signed-in user; 1–1000 chars; rate limit 20/min and 300/day; realtime enabled.
- Storage bucket `avatars` — public read, JPEG/WebP only, max 300 KB, each user can write only `avatars/<their-id>.jpg`.

---
# Collab Room (1-to-1 calls) — extra steps before launch

The room page (`/collab/room.html`) stays **"not launched"** until a TURN relay is in `collab/config.js`.
Without TURN, calls fail on many mobile-carrier, hotel and work networks (symmetric NAT). The page has a
**Test my connection** button that tells you whether a relay is reachable.

The SQL above already creates `rooms` + `room_signals` (step 2 — re-run it if you ran an older copy).
Rooms are strictly **1-to-1**: only the inviter and the accepted invitee can read/write them; members can't be
changed; nobody else can join or watch. Invites must be accepted.

## Pick ONE free TURN (do not paste any secret/API key into config.js other than what's described)
**Option A — Metered "Open Relay" (simplest).** Free: **20 GB TURN relay per month** (ports 80/443, TCP/UDP, TLS).
1. Sign up free at https://www.metered.ca/tools/openrelay/ → dashboard → **TURN Server** → create credential.
2. Copy the `iceServers` array it shows (turn: URLs + username + credential) into `iceServers` in `collab/config.js`.
   Note: that credential is public in the page; others could use your 20 GB. Set a usage cap in the dashboard.

**Option B — Cloudflare Realtime TURN.** Free: **1,000 GB/month** (shared with Cloudflare's SFU), then $0.05/GB.
1. Free Cloudflare account → Dashboard → **Realtime → TURN Server** → Create → note the Token ID + API token.
2. Cloudflare credentials are short-lived and must be minted server-side with the API token (never put the API token
   in the page). This needs one tiny Supabase Edge Function (`turn-creds`) — ask Grok Bot to add it once you have the token.

Rough usage: an audio-only call relayed ≈ 50–100 MB/hour; with video ≈ 0.5–1 GB/hour. Most calls connect directly
and use no TURN at all.
