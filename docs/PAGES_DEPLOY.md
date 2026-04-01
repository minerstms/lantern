# Cloudflare Pages — Lantern static frontend

Use this when creating or recreating the Pages project from this repo.

## Repository layout

- **Deploy root:** `app/` (static HTML, JS, CSS, `_redirects`).
- **No build step:** no npm build, no framework output folder.
- **API:** `https://lantern-api.mrradle.workers.dev` (set in `window.LANTERN_AVATAR_API` in HTML pages).

## Cloudflare Pages project settings

| Setting | Value |
|--------|--------|
| **Git repository** | This repo |
| **Branch** | Your production branch (e.g. `main`) |
| **Root directory** | `app` |
| **Build command** | *(empty / none)* |
| **Build output directory** | *(empty / none)* — or **`.`** if the UI requires a value (assets are already under `app/`) |
| **Framework preset** | None |

**Note:** The intent is **no compile step**: HTML/JS/CSS and `_redirects` live directly under `app/` and are uploaded as-is.

## Worker pairing (required after first deploy)

1. **Copy the Pages URL** from **Pages → project → Domains** (e.g. `https://<name>.pages.dev`).
2. In **`worker/index.js`**, set **`PRODUCTION_PAGES_ORIGIN`** to that exact origin (including `https://`, no trailing slash).
3. Run **`npx wrangler deploy`** from the **`worker/`** directory.

Without this, **cookie-based auth** and **credentialed** `fetch` from the site may fail CORS checks.

## `_redirects`

`app/_redirects` is the single source of URL rules for the static site. Deploy with the repo; no separate step unless you change the file.

## E2E / Playwright

Set **`STUDIO_BASE_URL`** to your deployed Pages URL when running `e2e/studio-contribute` tests (see that folder’s `README.md`).
