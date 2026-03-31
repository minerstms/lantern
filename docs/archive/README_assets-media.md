# Lantern media assets (default + library)

Local source for R2 bucket `lantern-media`. The Worker serves these via:

- `/api/media/image?key=default/<filename>`
- `/api/media/image?key=library/<category>/<filename>`

## Structure

- **default/** — Fallback images for Explore/poll/spotlight when no media is set.
  - `default_poll.png`, `default_news.png`, `default_creation.png`, `default_explain.png`, `default_shoutout.png`, `default_generic_stem.png`
- **library/<category>/** — Curated images for the library picker (missions/polls).
  - Categories: `abstract`, `ai`, `art`, `coding`, `engineering`, `robotics`, `school-life`
  - Filenames: `<category>_1.png`, `<category>_2.png`, etc.

## Upload to R2 (mirror local → lantern-media)

From repo root:

```bash
node scripts/upload-media-to-r2.js
```

Requires Cloudflare Wrangler and access to the account that owns the `lantern-media` bucket. Keys in R2 will match the local paths (`default/...`, `library/.../...`).
