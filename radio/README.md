# Island Beats Radio (Beta) — how it works

Island Beats Radio is the Dominica-themed radio for **Island Beats Hub**, built by Emmanuel Griffith. It's in **beta**, and everyone using it is a tester.

Live: https://madinc47-prog.github.io/radio/

## 1. How the radio works

- **Live stations, Dominica first.** Tabs for 🇩🇲 Dominica, Caribbean and World. Every station is the station's own official public stream (for example Q95, Kairi FM, Vibes Radio, VOB 92.9, BBC World Service, NPR and KEXP). Tap a station to play it, and tap ↗ to open the station's website.
- **Island Beats Radio, your own channel.** This channel plays music **saved on the device you're using**: Beat bounces, Vault items and DJ Psycho Fingers Beta audio player uploads. It is **not a live broadcast**, so nobody else hears it. It plays through your list, with Shuffle.
- **DJ Psycho Fingers shout-outs.** Pre-recorded idents ("Make some noise!") and "Big up" shout-outs for parishes and towns. They play between songs on your channel, or whenever you tap 📣 Ident / Big up!. The station audio dips while the voice plays.
- **EQ presets.** 21 standard presets (Hip-Hop, Bass Boost, Vocal and more). Some stations don't allow browser sound processing. For those, the EQ is off and the app tells you so.
- **Sleep timer.** 15, 30, 60 or 90 minutes. The sound fades out and then stops.
- **Share & install.** Share sends the link. Install (or "Add to Home screen") adds **IB Radio** as an app with its own icon.

## 2. Artist applications

Use **Apply to get played** (`apply.html`). It's an application for review. You don't get instant access.

- The form asks for: stage name, legal name, email, phone/WhatsApp (optional), parish or Other, genre(s), short bio, track title(s), a **link** to the track (SoundCloud, YouTube, Drive or Audiomack; no file uploads), whether it's explicit, release year, and social links.
- You must confirm all of these: you own or control all rights (master + publishing), there are no uncleared samples, Island Beats Radio may stream it for free during beta, and you're 18+ (or have a guardian's OK).
- The application goes by email (through FormSubmit) to the station inbox. We review every application and email you if you're approved. Applying doesn't guarantee airplay.

## 3. Sign-in for uploads

- There are **no anonymous uploads.** Uploading music to the station needs a real email-link (magic link) sign-in. It's the same login system as Island Beats Hub, running on Supabase.
- **Status: sign-in is not set up yet.** The Upload button says "Sign in to upload — sign-in not set up yet" and stays disabled. To set it up, paste the Supabase project URL and anon key into `beats/auth-config.js` (see the beats AUTH-SETUP notes). Server-side uploading is **planned**.
- Playing music that's already saved on your own device doesn't need sign-in, because that isn't an upload.

## 4. Pinned Ads

- Local businesses can use **Pin your ad** (`pin-ad.html`) to send a business name, a short message (up to 120 characters), a link, an optional image **link**, and a contact email. They also have to agree to the terms.
- Requests arrive by email. Each ad goes live only after Emmanuel approves it and publishes it in `radio/ads.json`.
- Ads are **free during beta, and pricing is coming soon.** No payment is taken.

## 5. Revenue model (overview — mostly planned)

| Stream | Status |
|---|---|
| Local sponsor / pinned ads | Request form live. Paid pricing planned |
| Listener tips & a supporter tier | Planned |
| Artist feature spots | Planned |
| Events and live shows | Planned |
| Merch | Planned |
| A future play-share for artists | Planned (no promises yet) |

**Licensing:** playing commercial tracks you don't own on a public station needs a performance licence. In Dominica, that comes from **ECCO** (Eastern Caribbean Copyright Organisation for Music Rights). Until then, the own channel only plays music saved on the listener's own device, and artist submissions must come with full rights.

## Live broadcasting to many listeners (planned)

A true live station that everyone hears at the same time needs a streaming server. Free or low-cost options include Zeno.fm (free hosted streams), a self-hosted Icecast or AzuraCast server, or Mixlr / Radio.co free tiers. None are signed up yet.
