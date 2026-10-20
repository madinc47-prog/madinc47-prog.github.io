# Afterglow · New & Recent (free & legal)

A standalone static page for Afterglow (https://cinder-heart-tulip-harbor.grok.me). It lists 23 recent films (2019–2026) that are free and legal to show:

- Creative Commons open movies from Blender Studio (CC BY 4.0)
- NASA documentaries, which are U.S. Government works and public domain in the U.S.
- Full films the rights holder posted free on its own verified YouTube channel (Pixar, Disney Animation, Sony Pictures Animation, DW Documentary, Al Jazeera English, The New Yorker Screening Room)

Action (genre chip "action", or link straight to `#action`):
- **80s Action (free & legal)**: 14 films from 1980–1989 (Jackie Chan, Sammo Hung, Tsui Hark, Chuck Norris, Brandon Lee, Don "The Dragon" Wilson, post-apocalyptic B-movies), all posted free in full by Shout! Studios (owner of Shout! Factory) on its verified YouTube channel. Four are Golden Princess titles Shout! licensed in 2025. Some Shout! uploads may be limited to certain countries.
- **2026 Action (free & legal)**: 8 Chinese action films posted free in full by iQIYI on its verified official channel (iQIYI English), plus 3 action shorts (2025–2026) posted by the filmmakers on their own channels.
- Recent films already tagged action (Charge, The Spider Within) show under New & Recent in the Action view.
- The main counter ("N of 23 films") only counts the New & Recent shelf; each action shelf has its own counter. In the "all" view the action shelves stay hidden unless a search matches them.

Files:
- `index.html`, `styles.css`, `app.js`: the page
- `catalog.js`: the catalog data (`window.AFTERGLOW_NEW`); each item has `shelf`: `recent`, `action-2026` or `action-80s`
- `new-recent.json`: the same data as plain JSON

The page has no build step and doesn't need a server. YouTube titles play through youtube-nocookie embeds; Sprite Fright plays from its Internet Archive MP4, and Wing It! falls back to its MP4 if YouTube fails.
Once the repo is published, it will be at https://madinc47-prog.github.io/afterglow-new/.

## Front door, rotation and DVR (Oct 2026)

- This page is now Afterglow's home. Shelves: My DVR, Now Showing, New & Recent, 2026 Action, 80s Action, Local Films, Vintage Vault (Archive public-domain titles in the Archive's own player), Watch free elsewhere (Tubi / Pluto TV link-outs only).
- Embed-only: every title plays from its owner's official upload (YouTube nocookie or the Internet Archive embed). Nothing is re-hosted.
- `tools/check-embeds` checks every title still embeds (`--apply` removes dead ones and regenerates `catalog.js`). Run it from Dominica if you can: region locks only show up where you are.
- `tools/rotate.py` writes `now-showing.json` (21 days on air, 14 off, staggered, 20 weeks ahead). Re-run it weekly or after adding titles.
- Badges: New this week, Leaving in N days (3 or fewer), Last chance (last day). Pressing play starts a 48-hour window (or until the title leaves, if sooner). My DVR saves titles and clears them when they expire.
- Honest limits: timers live in localStorage, so clearing site data resets them. It's programming, not copy protection.
