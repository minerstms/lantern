# TMS Lantern — Leaderboard Ranking / Sort-Direction Audit

**Audit only. No refactor in this pass. FERPA-safe.**

---

## 1. Findings summary

- **Worker leaderboard uses a single global rule:** `MAX(score)` per character and `ORDER BY score DESC`. So “higher score = better rank” for all games.
- **Two games are “lower is better”:** Reaction Tap (milliseconds) and Nugget Hunt (seconds). With the current Worker logic they would be **mis-ranked**: the best (lowest) time would rank **last** on the public leaderboard.
- **The other games are “higher is better”:** Avatar Match, Trivia, Nugget Click Rush. Current Worker ranking is **correct** for these.
- **Before switching Games ticker and Display to GET /api/leaderboards,** the Worker must apply game-specific sort direction for Reaction Tap and Nugget Hunt; otherwise public read-path unification would show wrong order for those two games.
- **Minimal safe step:** In the Worker, for GET /api/leaderboards, treat a small fixed list of game names as “lower is better” and use `MIN(score)` and `ORDER BY score ASC` for those games only; keep `MAX(score)` and `ORDER BY score DESC` for all others. No new tables, no change to POST or stored values.

---

## 2. Current Worker ranking logic

**File:** `lantern-worker/index.js`, `handleLeaderboardRoutes`.

**POST /api/leaderboards/record**
- Inserts one row per submission: `(id, game_name, character_name, score, score_display, meta_json, created_at)`.
- `score` = `Math.floor(Number(body.score))`. No game-specific logic.

**GET /api/leaderboards**
- Query params: `period` (daily | weekly | monthly | school_year), optional `game_name`, `limit` (default 20, max 50).
- Time window: `since` (and optional `until` for school_year) applied to `created_at`.
- **Selection / aggregation:**  
  - One row per character: `GROUP BY character_name`.  
  - “Best” score per character: **always `MAX(score)`.**  
- **Sort:** **always `ORDER BY score DESC`.**  
- **Limit:** `LIMIT ?` (limit param).
- When `game_name` is set: filter `WHERE game_name = ?`. When not set: all games combined (same MAX/ORDER BY).
- Response: `{ ok, period, entries }` with `entries[].rank` (1-based index), `character_name`, `game_name`, `score`, `score_display` (from SELECT only when available; Worker currently does not SELECT `score_display` in the aggregation query, so it is derived as `String(score)` in the mapping).

So:
- **Best score** = maximum stored score per character.
- **Rank 1** = character with the **highest** score.

There is **no** game-specific ranking logic in the Worker today.

---

## 3. Per-game score semantics

| Game | Numeric score submitted | Higher is better? | Worker ranking today | Correct? |
|------|-------------------------|-------------------|----------------------|----------|
| **Avatar Match** | Total points (e.g. 100–500) | Yes | DESC → highest points first | Yes |
| **Trivia** (Handbook, Local History, etc.) | correctCount × 10 (e.g. 0–100) | Yes | DESC → most points first | Yes |
| **Nugget Click Rush** | Tap count | Yes | DESC → most taps first | Yes |
| **Reaction Tap** | Milliseconds (reaction time) | **No (lower is better)** | DESC → **slowest time first** | **No** |
| **Nugget Hunt** | Seconds to find nugget | **No (lower is better)** | DESC → **slowest time first** | **No** |

So:
- **Reaction Tap:** Best player has the **lowest** `score` (ms). Current Worker puts them **last**.
- **Nugget Hunt:** Best player has the **lowest** `score` (seconds). Current Worker puts them **last**.

---

## 4. Correctness assessment for public read-path switch

- **If** Games ticker and Display Arcade Leaders are switched to **GET /api/leaderboards** (by period and optionally by game_name) **without** any change to Worker ranking:
  - **Avatar Match, Trivia, Nugget Click Rush:** Rankings would be correct.
  - **Reaction Tap, Nugget Hunt:** Rankings would be **wrong** (best times would appear at the bottom).
- So it is **not** safe to switch public read paths to the Worker **until** the API returns correctly ordered entries for “lower is better” games.

---

## 5. Minimal recommended next step

**Add game-specific sort direction in the Worker for GET /api/leaderboards only.**

- **Do not change:** POST /api/leaderboards/record, table schema, or the numeric values stored (keep storing actual ms and actual seconds for Reaction Tap and Nugget Hunt).
- **Do change:** In `handleLeaderboardRoutes`, for GET /api/leaderboards:
  - Define a small fixed set of game names where “lower score = better” (e.g. `['Reaction Tap', 'Nugget Hunt']`).
  - When `game_name` is in that set:
    - Use **`MIN(score)`** instead of `MAX(score)` per character.
    - Use **`ORDER BY score ASC`** instead of `ORDER BY score DESC`.
  - When `game_name` is not in that set (or when `game_name` is empty and all games are combined):
    - Keep current behavior: **`MAX(score)`** and **`ORDER BY score DESC`**.

**Combined leaderboard (no game_name filter):**  
If the front end ever calls GET without `game_name`, mixing “higher is better” and “lower is better” in one list is ambiguous. Recommended: have public surfaces request by `game_name` when showing per-game leaderboards, and keep “all games” view either undefined or document that it uses “higher is better” only (so Reaction Tap / Nugget Hunt would still be wrong in that view until a more complex aggregation is added). For the minimal step, implementing per-game ordering when `game_name` is provided is enough for correct per-game ticker and Display Arcade Leaders.

**Implementation sketch (no new tables, FERPA-safe):**
- In the Worker, before building the GET query, set e.g. `const lowerBetter = ['Reaction Tap', 'Nugget Hunt'].includes(gameName);`
- If `lowerBetter`: use `MIN(score)` and `ORDER BY score ASC` in the SELECT.
- Otherwise: use existing `MAX(score)` and `ORDER BY score DESC`.
- Return format stays the same; only the order and which “best” score is chosen (MIN vs MAX) change.

After this change, switching Games ticker and Display to GET /api/leaderboards (with `game_name` set per game or per request) would produce correct public rankings for all current games.
