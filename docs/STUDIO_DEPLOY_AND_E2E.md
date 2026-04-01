# Studio (Contribute) — deploy + production E2E

## 1. Cloudflare Pages (frontend)

Project root for the static frontend is **`app/`** (see `AGENTS.md` and **`docs/PAGES_DEPLOY.md`**).

Deploy (CLI; requires `wrangler` logged in; replace **`<project-name>`** with your Cloudflare Pages project name):

```bash
cd /path/to/lantern
npx wrangler pages deploy app --project-name <project-name>
```

Or push to the Git branch connected to the Pages project (production deploy on merge).

**After deploy:** run production Playwright (from repo):

```bash
cd e2e/studio-contribute
npm install
npx playwright install chromium
npx playwright test
```

Set **`STUDIO_BASE_URL`** to your deployed Pages URL (see `playwright.config.js`). There is no hardcoded production hostname in repo.

## 2. Cloudflare Worker (API + upload-image)

Image upload fixes live in **`worker/index.js`** (`stripBase64Payload` for `/api/news/upload-image`, avatar upload, and video upload).

```bash
cd worker
npx wrangler deploy
```

## 3. Blocked E2E scenarios — data requirements

### Mission `bug_report`

Playwright uses character **`zane_morrison`** (exists in `/api/games/characters`).

**Needed:** at least one **active** mission with `submission_type: "bug_report"` returned by:

`GET https://lantern-api.<your-subdomain>.workers.dev/api/missions/active?character_name=zane_morrison`

**Quickest path:** In teacher tooling, create a mission with submission type **bug report** and scope it so `zane_morrison` is in the audience (same as other school missions). Alternatively insert/activate in D1 per `docs/LANTERN_DB_RULES.md` (no invented columns).

### Returned poll resubmit

**Needed:** a poll contribution with `status: "returned"` for that character, so:

`GET /api/polls/returned?character_name=zane_morrison` is non-empty,

and Studio can open `contribute.html?type=poll&resubmit=<id>`.

**Quickest path:** Teacher moderation: **return** a pending student poll for `zane_morrison` (do not approve/reject). After that, the returned list API will include the row.
