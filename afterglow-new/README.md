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
