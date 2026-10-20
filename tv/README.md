# Island Beats TV (Beta)

A Dominica-themed creator video hub for the Island Beats suite: music videos, past live streams, behind-the-beat, tutorials and comedy/culture from local creators. Free to run on GitHub Pages. Live at https://madinc47-prog.github.io/tv/

## How it works
- **Home**: Live Now banner, categories, Continue watching, New videos, Past lives, From creators you follow, Creators.
- **Category pages** (`category.html?c=music|live|behind|tutorials|culture`), **creator channels** (`channel.html?c=<creatorId>`), **video pages** (`watch.html?v=<id>`) with an embedded player and a Report button.
- **No video hosting.** Videos play from YouTube (privacy-enhanced embed), Vimeo, Internet Archive or Twitch (live). Free video storage isn't available, so only links are used.
- **On-device only:** watch history (continue watching) and follows are stored in the viewer's browser (localStorage). No accounts, no tracking.
- **PWA:** installs as "Island Beats TV Beta" (IB TV).

## Getting videos on
1. Creator fills in `submit.html` (link, title, description, category, thumbnail link, rights, 18+, agree to rules). It is emailed to madinc47@gmail.com via FormSubmit.
2. Emmanuel reviews it, then adds an entry to `videos.json` (format explained in its `_howto` field). Nothing appears until it's in that file.
3. To show the Live Now banner, set `live.active` to `true` and `live.url` to a YouTube or Twitch live link. Otherwise the banner points to Go Live (`/beats/live.html`).

The Upload/Send button stays off ("sign-in not set up yet") until Supabase email sign-in is configured in `/beats/auth-config.js` (see `/beats/AUTH-SETUP.md`). It's planned, not done.

## Rules (`rules/`)
Community Guidelines, strikes and appeals, Copyright policy (with takedown form, counter-notice, repeat-infringer rule, ECCO note), Partner program requirements, Age restrictions, Terms of Use and Privacy. These are original starter templates, **not legal advice**. Items marked PLACEHOLDER need Emmanuel's decision.

## Money
`earnings.html` explains planned options: supporter subscriptions, tips, sponsor ads and revenue share by watch time. **Nothing is live. No payments are collected or paid out.** Payment provider, prices, split and payout rules are still undecided.

## Security
Strict Content-Security-Policy meta (embeds only from the listed https players, forms only to FormSubmit), sandboxed iframes, `textContent`-only rendering, `rel=noopener` on new-tab links, no secrets in the repo. GitHub Pages can't set server headers, so protection is limited to what a static site allows.

## Note
FormSubmit sends one activation email the first time a form is used. Click its link in Gmail or nothing gets delivered.
