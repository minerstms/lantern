# TMS Nuggets Helper App

**Product help and feedback. No student data. Separate Worker + separate D1.**

## Architecture (Option A)

- **Helper app** (Pages): static HTML, submits feedback to helper-api
- **Helper API** (Worker): `POST /api/submit` → writes to helper-db
- **Helper DB** (D1): single table `helper_feedback` (type, content, created_at). No student tables.

Zero connection to main mtss Worker or mtss-db. FERPA-safe.

## Deploy helper-api Worker + D1

From repo root:

```bash
cd workers/helper-api
npx wrangler d1 create mtss-helper-db
```

Copy the `database_id` from the output into `wrangler.toml` (replace `REPLACE_AFTER_D1_CREATE`).

```bash
npx wrangler d1 execute mtss-helper-db --remote --file=schema.sql
npx wrangler deploy
```

Note the deployed Worker URL (e.g. `https://mtss-helper-api.<your-subdomain>.workers.dev`).

## Deploy helper app (Pages)

Deploy `apps/helper-app` as a **separate** Cloudflare Pages project (e.g. `mtss-helper.pages.dev`).

- **Build command:** (none — static)
- **Build output:** `./` (this folder)
- **Root directory:** `apps/helper-app`

## Update helper app API URL

In `apps/helper-app/index.html`, set `HELPER_API` in the script block to your deployed helper-api Worker URL:

```javascript
var HELPER_API = 'https://mtss-helper-api.YOUR_SUBDOMAIN.workers.dev';
```

## Link from main app

The main app `public/*.html` Help link points to the helper app URL. Update `HELPER_URL` in `public/api.js` if your helper Pages URL differs from `https://mtss-helper.pages.dev`.

## View feedback (admin/dev)

```bash
cd workers/helper-api
npx wrangler d1 execute mtss-helper-db --remote --command "SELECT * FROM helper_feedback ORDER BY created_at DESC LIMIT 50"
```

## Knowledge sync

Knowledge files in `knowledge/` are synced from `packages/helper-knowledge/`. Update the package when the app evolves; copy to `knowledge/` before deploy if using manual sync.
