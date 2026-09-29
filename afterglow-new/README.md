# Afterglow · New & Recent (free & legal)

A standalone static page for Afterglow (https://cinder-heart-tulip-harbor.grok.me). It lists 23 recent films (2019–2026) that are free and legal to show:

- Creative Commons open movies from Blender Studio (CC BY 4.0)
- NASA documentaries, which are U.S. Government works and public domain in the U.S.
- Full films the rights holder posted free on its own verified YouTube channel (Pixar, Disney Animation, Sony Pictures Animation, DW Documentary, Al Jazeera English, The New Yorker Screening Room)

Files:
- `index.html`, `styles.css`, `app.js`: the page
- `catalog.js`: the catalog data (`window.AFTERGLOW_NEW`)
- `new-recent.json`: the same data as plain JSON

The page has no build step and doesn't need a server. YouTube titles play through youtube-nocookie embeds; Sprite Fright plays from its Internet Archive MP4, and Wing It! falls back to its MP4 if YouTube fails.
Once the repo is published, it will be at https://madinc47-prog.github.io/afterglow-new/.
