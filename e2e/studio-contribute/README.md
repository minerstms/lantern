# Create Design Studio — live E2E (Playwright)

Tests hit the **real** `window.LANTERN_AVATAR_API` Worker (`lantern-api.mrradle.workers.dev`) from a browser. Adopted character: `zane_morrison` (present in live `/api/games/characters`).

## Run against **deployed** Pages (default)

```bash
cd e2e/studio-contribute
npm install
npx playwright install chromium
npx playwright test
```

`playwright.config.js` defaults to `https://tms-lantern-beta.pages.dev`.

## Run against **local** static server

From repo root:

```bash
python -m http.server 8765 --directory apps/lantern-app
```

Then:

```bash
cd e2e/studio-contribute
set STUDIO_BASE_URL=http://127.0.0.1:8765
npx playwright test
```

(Use `contribute.html` paths automatically when `localhost` / `127.0.0.1` is set.)

## `file://` quick checks (no server)

Scripts such as `run-more-file-tests.mjs` load `apps/lantern-app/contribute.html` via `file:` URL; API calls still go to the Worker if CORS allows (verified for news/polls/missions).

## Known live issue (fixed in repo, needs **redeploy**)

If `syncContributeTypeUI()` runs before `STUDIO_FAKE_NEWS_RAIL` is assigned, `updateStudioAll` throws when building the rail (`STUDIO_FAKE_NEWS_RAIL[0]`). **Symptom:** empty left/right studio previews and `TypeError: Cannot read properties of undefined (reading '0')` in the console. **Fix:** `STUDIO_FAKE_*` arrays + `buildHappeningNewsCardHtml` moved earlier in `contribute.html`.

## Profile posts

`Save profile post` uses the `LANTERN_API` runner and **localStorage** (`LANTERN_POSTS`), not a Worker POST, in the current `lantern-api.js` implementation. E2E asserts toast + storage, not network.

## Mission submit URL

Worker endpoint is **`POST /api/missions/submit`** (not `.../submissions/complete`).
