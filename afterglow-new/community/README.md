# Afterglow · Local Films (community submissions)

Filmmakers in Dominica can send in their own films. A person reviews every one,
and approved films appear on the **Local Films** shelf. Everything is free and
static: no server, no database, no paid plan.

| File | What it is |
|---|---|
| `local-films.html` | The public shelf. Reads `community.json`. |
| `submit.html` | The submission form, plus a guide to hosting video free. |
| `community.js` | Shared code: link checking, the form, the shelf, the player, reports. |
| `community.css` | Local Films styles. It loads after `../styles.css` and reuses Afterglow's look. |
| `community.json` | **Approved films only.** This is the only thing that makes a film public. |
| `index.html` | Redirects `/afterglow-new/community/` to `local-films.html`. |
| `home-shelf.js` | Optional Local Films teaser for the main New & Recent page. It shows up to 8 newest non-mature films, or a "Submit your film" call to action when the shelf is empty. |

The approval helper lives outside the site folder, at `/workspace/afterglow-new/approve-film.py`.
You can also copy it anywhere; it only needs Python 3.

Live URLs once pushed:
- https://madinc47-prog.github.io/afterglow-new/community/local-films.html
- https://madinc47-prog.github.io/afterglow-new/community/submit.html

## How it works

1. **The filmmaker hosts the video free** on YouTube (unlisted is fine), Vimeo,
   Google Drive ("Anyone with the link") or the Internet Archive. Afterglow never
   stores video files.
2. **They fill in `submit.html`.** The page checks every field. The film link has
   to be from one of those four hosts, and the rights box has to be ticked.
3. **The form emails you the submission** through [FormSubmit](https://formsubmit.co)
   (free, no account). The email subject is
   `Afterglow Local Films submission: <title> (<year>)` and the body is a table with
   every field. The last row, `entry_json`, is the entry ready to approve. Reply
   to the email to reach the filmmaker when they gave an email address.
4. **Nothing is public yet.** The shelf only shows what is in `community.json`,
   which starts empty and shows a "Submit your film" message.
5. **You review it**: watch the film, check the rating fits, and make sure it's
   really theirs. For example, a film that's obviously a studio movie isn't.
6. **Approve** it by adding it to `community.json` (see below), then commit and
   push. GitHub Pages updates in about a minute. Browsers can cache the old file
   for up to about 10 minutes.
7. **Viewers can press "Report this film"** in the player. You get an email with
   the subject `Afterglow Local Films REPORT: <title> [<id>]`, the reason, and the
   id to delete.

### Why FormSubmit?
GitHub Pages can't receive form posts, so a relay is needed. FormSubmit is free,
needs no account or API key, accepts AJAX posts from any site (CORS), emails the
result as a tidy table, and supports a honeypot (`_honey`). Other options were
worse for this job. Formspree's free tier needs an account and caps you at 50
submissions a month. Google Forms can't be styled or validated like this, and
putting it in an iframe looks off-brand. Netlify Forms only works on Netlify
hosting.

### Spam protection
- A hidden honeypot field (`_honey`). If a bot fills it in, the page shows "thanks"
  and sends nothing. FormSubmit also drops any post where `_honey` has a value.
- A form sent less than 4 seconds after the page loads is treated as a bot and
  quietly ignored.
- Per-browser limits: one submission every 2 minutes and 5 a day, 10 reports a
  day, and one report per film per day.
- You approve by hand, so spam can never reach the public shelf.

These limits run in the browser, so a determined person can get around them. That's
fine here because nothing goes public without your approval.

## Linking it from the main page
Three small additions to `afterglow-new/index.html` add the teaser. `app.js` doesn't change:
```html
<!-- in <nav>, after the New & Recent link -->
<a href="community/local-films.html">Local Films</a>
<!-- in <main>, before <section class="wrap note"> -->
<section class="wrap shelf" id="local-films-shelf" data-base="community/" hidden></section>
<!-- after <script src="app.js"></script> -->
<script src="community/home-shelf.js" defer></script>
```

## One-time setup: activate FormSubmit (do this once, after the first push)

FormSubmit won't deliver anything to a new address until the owner confirms it.
The first post to `madinc47@gmail.com` isn't delivered. Instead it triggers a
confirmation email.

1. Open https://madinc47-prog.github.io/afterglow-new/community/submit.html
   and send yourself a test submission. Any YouTube link will do. Wait at least 4
   seconds before pressing Send.
2. In Gmail (madinc47@gmail.com) find the email from FormSubmit ("Action Required:
   Activate FormSubmit…"). Check Spam and Promotions too. Click **Activate Form**.
3. Submit again. The test should now arrive as a table email. Ignore it; don't
   approve your test.

### Then hide your email address (recommended)
Right now your email is in `community.js`, which anyone can read in the page
source. After activation, FormSubmit gives you a random alias. It's on the page
you see after clicking Activate, and it's also in the confirmation email. It looks
like `a1b2c3d4e5f6...`.

1. Open `community/community.js`. Near the top, change
   ```js
   var RELAY = "https://formsubmit.co/ajax/madinc47@gmail.com";
   ```
   to
   ```js
   var RELAY = "https://formsubmit.co/ajax/YOUR-RANDOM-ALIAS";
   ```
2. Commit and push. Submissions and reports keep arriving at the same inbox.

Your address will still be in older commits in git history. The alias stops new
scraping, but it can't undo what's already in the history.

## Approving a submission

### Option A: with the script (easiest)
Copy the `entry_json` value from the submission email and run:
```bash
python3 /workspace/afterglow-new/approve-film.py --from-json '<paste entry_json here>'
```
The script:
- re-checks every field: title, filmmaker, description of at least 20 characters,
  year 1950 to next year, runtime 1–600 minutes, rating `all`/`teen`/`mature`, a
  supported video link, and an https poster
- rebuilds the embed URL from the link, so a tampered email can't inject a URL
- gives the film a unique `id` and sets `approvedDate` to today
- refuses a video that's already on the shelf (use `--force` to add it anyway)
- puts the newest film first and writes the file safely

You can change fields while approving, for example to fix the rating or tidy the
description:
```bash
python3 approve-film.py --from-json '<entry_json>' --rating mature --description "Better text…"
```
Or type the fields by hand:
```bash
python3 approve-film.py --title "Boli Day" --filmmaker "Jane Doe" --year 2026 --runtime 14 \
  --genre Drama --rating teen --country Dominica --parish "Saint George" \
  --description "A day in Roseau during…" --link "https://youtu.be/XXXXXXXXXXX"
```
Other commands: `--list`, `--remove <id>` (takedown), `--dry-run` (preview without
saving), and `--file <path>` (the default is
`/workspace/free-host-apps/afterglow-new/community/community.json`).

Then commit and push `afterglow-new/community/community.json`.

### Option B: by hand on github.com
Open `afterglow-new/community/community.json` in the GitHub web editor and paste
the entry at the top of `"items": [ … ]`. Put a comma between entries, and replace
`"approvedDate": "YYYY-MM-DD"` with today's date. Commit. The shelf skips any
entry whose link isn't from a supported host, so a typo hides that film instead
of breaking the page.

### Entry format
```json
{
  "id": "boli-day-2026",
  "title": "Boli Day",
  "filmmaker": "Jane Doe",
  "year": 2026,
  "runtime": 14,
  "genre": "Drama",
  "rating": "teen",
  "country": "Dominica",
  "parish": "Saint George",
  "description": "A day in Roseau during…",
  "embed": { "host": "youtube", "id": "XXXXXXXXXXX", "url": "https://www.youtube-nocookie.com/embed/XXXXXXXXXXX" },
  "link": "https://www.youtube.com/watch?v=XXXXXXXXXXX",
  "poster": "https://i.ytimg.com/vi/XXXXXXXXXXX/hqdefault.jpg",
  "approvedDate": "2026-10-01"
}
```
- `rating`: `all` (All ages), `teen` (13+) or `mature` (18+). Mature films stay
  hidden until the viewer turns on **Show mature films**, and that choice resets
  when they close the tab. An unknown rating is treated as mature.
- Embeds: YouTube uses `youtube-nocookie.com/embed/ID`, Vimeo uses
  `player.vimeo.com/video/ID?h=HASH`, Drive uses `drive.google.com/file/d/ID/preview`,
  and the Internet Archive uses `archive.org/embed/IDENTIFIER`.
- `poster` is optional. If it's missing, the film uses the YouTube or Archive
  thumbnail, or a warm gradient card with the title for Vimeo and Drive.

## Takedowns and reports
When a report comes in, or a filmmaker asks you to remove their film:
```bash
python3 approve-film.py --remove <id>
```
Then commit and push. You can also delete the entry on github.com. The report
email tells you which id to delete.

## Review checklist
- Does the film play in the embed? (YouTube: is embedding allowed? Drive: is it
  shared as "Anyone with the link"?)
- Does the rating fit? Change it with `--rating` if not.
- Is it plausibly the submitter's own work? If in doubt, reply and ask.
- No hate, harassment, illegal content, or other people's copyrighted music or
  footage used without permission.
