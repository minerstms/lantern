# TMS Lantern — Games & Leaderboards Truth-Map Audit

**Audit only. No refactor or redesign. Preserves current behavior. FERPA-safe.**

---

## 1. Findings summary

- **Two separate leaderboard systems exist and are both in use.**
- **Worker (D1) leaderboard**  
  - **Written by:** Explore demo seed; games.html `postLeaderboardScore()` (Avatar Match, all Trivia games).  
  - **Read by:** Explore leaderboard section only (GET /api/leaderboards).  
  - **Storage:** `lantern_leaderboard_entries` (migration 028).
- **localStorage (GAME_RESULTS) leaderboard**  
  - **Written by:** games.html via `run.recordGameResult()` (Reaction Tap, Nugget Click Rush, Nugget Hunt).  
  - **Read by:** Games page ticker and Display “Arcade Leaders” slides (via `getGameLeaderboard()` in lantern-api.js, which reads `getGameResults()` = localStorage).  
  - **Storage:** `LS.GAME_RESULTS` in browser only; no backend.
- **Split:** Three games (Reaction Tap, Nugget Click Rush, Nugget Hunt) never write to the Worker. Two surfaces (Games ticker, Display arcade slides) never read from the Worker. Explore leaderboard only shows Worker data (plus demo seed). So “game scores” and “arcade leaders” are not one source of truth.
- **Nugget balance “leaderboard”** (`computeLeaderboard()` in lantern-api.js) is a different concept (earned − spent by character). Used for store prefetch / store_leaderboard. Not game scores.

---

## 2. Score-writing systems

| Location | What writes | Where it goes | API / mechanism |
|----------|-------------|---------------|------------------|
| **explore.html** | `seedDemoLeaderboard()` | Worker | POST `exploreApiBase + '/api/leaderboards/record'` with demo payloads (e.g. lantern_demo, Demo Student, Test Player, adopted name). |
| **games.html** | `postLeaderboardScore(gameName, characterName, score, scoreDisplay, onDone)` | Worker | POST `gamesApiBase + '/api/leaderboards/record'` (gamesApiBase = LANTERN_ECONOMY_API or LANTERN_AVATAR_API). |
| **games.html** | Avatar Match completion | Worker | Calls `postLeaderboardScore('Avatar Match', adopted.name, totalScore, totalScore + ' pts', …)`. |
| **games.html** | Trivia completion (Handbook, Local History, etc.) | Worker | Calls `postLeaderboardScore(gameName, adopted.name, score, correctCount + '/10 · ' + score + ' pts', …)`. |
| **games.html** | Reaction Tap | localStorage only | `run.recordGameResult({ character_name, game_name: 'Reaction Tap', meta: { score: ms, score_display: ms + ' ms' } })` → lantern-api.js `recordGameResult()` → `DATA.setToLS(LS.GAME_RESULTS, results)`. |
| **games.html** | Nugget Click Rush | localStorage only | `run.recordGameResult({ character_name, game_name: 'Nugget Click Rush', meta: { score: count, score_display: count + ' taps' } })` → same path. |
| **games.html** | Nugget Hunt | localStorage only | `run.recordGameResult({ character_name, game_name: 'Nugget Hunt', meta: { score, score_display, difficulty, nuggets } })` → same path. |

**Worker side (lantern-worker/index.js):**  
- POST `/api/leaderboards/record`: body `game_name`, `character_name`, `score`, optional `score_display`, optional `meta`. Inserts into `lantern_leaderboard_entries`.

**lantern-api.js:**  
- `recordGameResult(characterName, gameName, meta)`: appends to in-memory array from `getGameResults()` (localStorage), then `DATA.setToLS(LS.GAME_RESULTS, results)`. Cap 2000 entries.  
- `computeLeaderboard()`: nugget balance (earned − spent) from activity/purchases; not game scores.

---

## 3. Leaderboard-reading systems

| Surface | Where it reads | Source of data | File / function |
|---------|----------------|----------------|------------------|
| **Explore — Leaderboard section** | `loadLeaderboard(period)` | Worker only | explore.html. GET `exploreApiBase + '/api/leaderboards?period=...&limit=20'`. Renders into `leaderboardEl`. Daily/weekly/monthly/school_year chips. Empty state can seed demo via `seedDemoLeaderboard()`. |
| **Games page — Ticker** | `refreshGamesTicker()` → `callGetGameLeaderboard()` | localStorage only | games.html. `run.getGameLeaderboard()` → lantern-api.js `getGameLeaderboard()` → `getGameResults()` (LS.GAME_RESULTS). Builds ticker items from daily/weekly/monthly/schoolYear. Fallback: `callGetGameEvents(60)` for game_win / nugget_earned events. |
| **Display — Arcade Leaders slide** | `callGetDisplaySlides()` → `run.getDisplaySlides()` | localStorage only | display.html. lantern-api.js `getDisplaySlides()` uses `getGameLeaderboard()` (same as above) to build `arcade_leader` slide with `meta: { daily, weekly, monthly, schoolYear }`. Rendered in display.html `renderSlide()` for type `arcade_leader`. |
| **Profile** | — | — | index.html has no leaderboard UI; no read of game leaderboard. |
| **Store** | Prefetch / bootstrap | Nugget balance only | store.html prefetch caches `store_leaderboard` from `computeLeaderboard()` (nugget balance). Not game scores. |

**Worker side:**  
- GET `/api/leaderboards`: query params `period`, `game_name`, `limit`. Reads `lantern_leaderboard_entries` with time window (daily/weekly/monthly/school_year). Returns `{ ok, period, entries }` with rank, character_name, game_name, score, score_display (score_display derived from score when not in SELECT).

---

## 4. Flow map by game / surface

| Game / source | Writes score to | Read by Explore leaderboard? | Read by Games ticker? | Read by Display arcade? |
|---------------|-----------------|------------------------------|------------------------|--------------------------|
| **Avatar Match** | Worker (postLeaderboardScore) | Yes | No | No |
| **Handbook Trivia** | Worker (postLeaderboardScore) | Yes | No | No |
| **Local History Trivia** | Worker (postLeaderboardScore) | Yes | No | No |
| **Other Trivia** | Worker (postLeaderboardScore) | Yes | No | No |
| **Reaction Tap** | localStorage (recordGameResult) | No | Yes | Yes |
| **Nugget Click Rush** | localStorage (recordGameResult) | No | Yes | Yes |
| **Nugget Hunt** | localStorage (recordGameResult) | No | Yes | Yes |
| **Explore demo seed** | Worker (lantern_demo) | Yes | No | No |

So:  
- **Explore leaderboard** = Worker only (and demo seed). Shows Avatar Match + Trivia + demo; does not show Reaction Tap, Nugget Click Rush, Nugget Hunt.  
- **Games ticker** = localStorage only. Shows only Reaction Tap, Nugget Click Rush, Nugget Hunt (and event-based game_win if used).  
- **Display Arcade Leaders** = same localStorage data as Games ticker. No Worker data.

---

## 5. Current source-of-truth assessment

- **There is no single canonical game leaderboard.**  
  - **Worker (D1)** is the source of truth for what Explore shows: Avatar Match, Trivia, and any demo seed.  
  - **localStorage (GAME_RESULTS)** is the source of truth for what Games ticker and Display arcade slides show: Reaction Tap, Nugget Click Rush, Nugget Hunt.  
- **Inconsistencies:**  
  - Three games never write to Worker, so they never appear on Explore.  
  - Explore never reads localStorage, so it only shows Worker-backed games.  
  - Display and Games ticker never read Worker for leaderboard, so they only show the three localStorage-backed games.  
- **Nugget balance leaderboard** (computeLeaderboard) is separate; used for store only.

---

## 6. Minimal recommended direction

**Preferred direction (no implementation in this audit):**

- **One backend leaderboard source of truth:** Worker + D1 `lantern_leaderboard_entries` (already exists and is used by Explore and by Avatar Match + Trivia).
- **All games that record scores write there:** In addition to existing `postLeaderboardScore()` calls, have Reaction Tap, Nugget Click Rush, and Nugget Hunt also call `postLeaderboardScore()` (or an equivalent Worker POST) when a score is recorded, so every game that has a “score” writes to the same table.
- **All public surfaces read from there:**  
  - Explore: already reads Worker; no change to source.  
  - Games ticker: optionally read from Worker (e.g. GET /api/leaderboards) instead of or in addition to `getGameLeaderboard()` (localStorage), so one source of truth.  
  - Display Arcade Leaders: get arcade slide data from Worker (e.g. same GET /api/leaderboards or a small display-specific endpoint) instead of `getGameLeaderboard()` (localStorage).

**Minimal steps (for a future change, not in this audit):**

1. In games.html, after each `run.recordGameResult(...)` for Reaction Tap, Nugget Click Rush, and Nugget Hunt, also call `postLeaderboardScore(gameName, characterName, score, scoreDisplay, …)` when `gamesApiBase` is set, so those games write to Worker as well.  
2. Optionally keep recording to localStorage for offline/fallback or phase it out once Worker is authoritative.  
3. Change Games ticker and Display arcade slides to consume Worker GET /api/leaderboards (by period and optionally game_name) instead of (or as fallback over) `getGameLeaderboard()` from localStorage.

**Constraints preserved:**  
- No new tables (use existing `lantern_leaderboard_entries`).  
- No broad refactor in this audit; this is the minimal direction.  
- Public surfaces (Explore, Display, Games) can continue to show “leaderboard” and “arcade leaders” as today; only the data source is unified.  
- FERPA: Worker already stores character_name and score; no new PII.  
- DEAD SIMPLE: one write path (POST record), one read path (GET leaderboards), all games and all surfaces use them.

---

## Reference: key files

| Purpose | File |
|---------|------|
| Worker leaderboard API | lantern-worker/index.js (handleLeaderboardRoutes): POST /api/leaderboards/record, GET /api/leaderboards |
| D1 schema | migrations/028_lantern_visual_cards_library_bug_reports_leaderboards.sql (lantern_leaderboard_entries) |
| localStorage game results | apps/lantern-app/js/lantern-api.js: getGameResults(), recordGameResult(), getGameLeaderboard() |
| Nugget balance “leaderboard” | apps/lantern-app/js/lantern-api.js: computeLeaderboard() |
| Explore leaderboard UI | apps/lantern-app/explore.html: loadLeaderboard(), seedDemoLeaderboard(), leaderboardEl |
| Games score submit | apps/lantern-app/games.html: postLeaderboardScore(), recordGameResult() calls |
| Games ticker | apps/lantern-app/games.html: refreshGamesTicker(), callGetGameLeaderboard(), buildGamesTickerItemsFromLeaderboard() |
| Display slides | apps/lantern-app/js/lantern-api.js: getDisplaySlides() (uses getGameLeaderboard() for arcade_leader) |
| Display arcade render | apps/lantern-app/display.html: callGetDisplaySlides(), renderSlide() for type arcade_leader |
