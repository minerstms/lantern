# Follow-up: Media image 404 cleanup

**Type:** Media / API / R2  
**Related:** Not caused by the Missions rail migration. Track separately from rail UI work.

## Summary

Browser console still reports **404** for `GET /api/media/image?key=...` when the app loads mission (and other) cards that reference curated library or default image keys. The Worker route is functioning; **`R2.get(key)` returns no object** for those keys (or the wrong bucket is bound).

## 1. Exact failing URLs (observed)

Base host in QA: `https://lantern-api.mrradle.workers.dev` (replace with your deployed Worker origin if different).

| # | Full URL |
|---|----------|
| 1 | `https://lantern-api.mrradle.workers.dev/api/media/image?key=library%2Fai%2Fai_1.png` |
| 2 | `https://lantern-api.mrradle.workers.dev/api/media/image?key=library%2Fai%2Fai_3.png` |
| 3 | `https://lantern-api.mrradle.workers.dev/api/media/image?key=library%2Fschool-life%2Fschool-life_1.png` |
| 4 | `https://lantern-api.mrradle.workers.dev/api/media/image?key=library%2Fschool-life%2Fschool-life_2.png` |
| 5 | `https://lantern-api.mrradle.workers.dev/api/media/image?key=library%2Fschool-life%2Fschool-life_3.png` |
| 6 | `https://lantern-api.mrradle.workers.dev/api/media/image?key=default%2Fdefault_creation.png` |

Decoded `key` values:

- `library/ai/ai_1.png`
- `library/ai/ai_3.png`
- `library/school-life/school-life_1.png`
- `library/school-life/school-life_2.png`
- `library/school-life/school-life_3.png`
- `default/default_creation.png`

## 2. Root cause analysis (keys vs assets vs Worker)

| Question | Finding |
|----------|---------|
| **Are the keys malformed or “bad”?** | **No.** These keys match the Worker’s own catalog: `MEDIA_LIBRARY_CATEGORIES` and `DEFAULT_IMAGES` in `lantern-worker/index.js` define the same paths (e.g. `library/ai/ai_1.png`, `default/default_creation.png`). |
| **Are assets missing?** | **Most likely yes (primary).** `handleMediaRoutes` does `await bucket.get(key)` and returns **404** when `obj` is null — i.e. **no object at that key** in the bound R2 bucket. |
| **Is Worker lookup wrong?** | **Unlikely for path parsing.** Logic is: read `key` query param → `bucket.get(key)`. Wrong **bucket binding** (`NEWS_BUCKET` / `AVATAR_BUCKET` fallback) could also yield 404 if files were uploaded to a different bucket than the one the Worker uses. |

**Conclusion:** Treat as **R2 content + binding alignment** (objects absent or in wrong bucket), not as a frontend/rail bug.

## 3. Recommended fix path

1. **Inventory R2**  
   For the Worker’s configured bucket (`NEWS_BUCKET` or `AVATAR_BUCKET` per `wrangler.toml` / dashboard), list or spot-check whether objects exist at the keys above.

2. **Upload or sync assets**  
   Upload PNGs to R2 using **exact keys** (path-style) as in `MEDIA_LIBRARY_CATEGORIES` and `DEFAULT_IMAGES`, or run a one-time sync script from a known `media/` folder in the repo if one exists.

3. **Verify binding**  
   Confirm `wrangler.toml` / Cloudflare dashboard: the bucket that holds library/default images is the same one referenced by `NEWS_BUCKET` or `AVATAR_BUCKET` in production.

4. **Optional hardening (separate small change)**  
   - Return a **transparent 1×1** or a **single generic placeholder** from the Worker when `get` misses (reduces console noise; document so clients don’t rely on 404).  
   - Or have `/api/media/library` only advertise keys that exist (more complex; requires head/list or manifest).

5. **Re-QA**  
   Reload `missions.html` (and any page using library thumbnails) and confirm **no 404** for `/api/media/image` in the network tab / console.

## References (code)

- `lantern-worker/index.js` — `handleMediaRoutes`, `MEDIA_LIBRARY_CATEGORIES`, `DEFAULT_IMAGES`, `GET /api/media/image`.

---

**Missions rail PR:** Merged / signed off separately. Do not use this issue to reopen rail layout work.
