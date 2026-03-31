# Lantern — Games as Culture Engine

Games in Lantern support the community and culture of the app. They reinforce identity, school expectations, local history, 7 Habits / leadership thinking, Safe2Tell awareness, and recognition and participation.

## Game categories (Phase 1)

Defined in `apps/lantern-app/js/lantern-game-content.js` as `GAME_CATEGORIES`:

1. **Identity Games** — Avatar Match, name ↔ avatar, teacher/club recognition (later).
2. **Handbook / Expectations** — Behavior expectation trivia, scenario choice, digital citizenship.
3. **Local History / Community** — Trinidad and local history trivia, school history, community pride.
4. **Safety / Support Awareness** — Safe2Tell awareness, trusted adult / reporting, support resource recognition (content later).
5. **Leadership / 7 Habits** — Scenario matching, habit recognition, better-choice questions (content later).

## First three games (Phase 1)

| Game | Category | How it works | Score → Leaderboard |
|------|----------|--------------|---------------------|
| **Avatar Match** | Identity | Match avatar to character name; 5 rounds; score from speed + correctness. Uses approved public characters (Worker `GET /api/games/characters`). | `POST /api/leaderboards/record` with `game_name: "Avatar Match"`, numeric score, `score_display` e.g. `"N pts"`. |
| **Handbook Trivia** | Handbook | 10 multiple-choice questions (school expectations, digital citizenship). One question at a time; score = correct count × 10. | Same API; `game_name: "Handbook Trivia"`, score, `score_display` e.g. `"8/10 · 80 pts"`. |
| **Local History Trivia** | Local History | 10 multiple-choice questions (local/school/community). Same flow as Handbook. | Same API; `game_name: "Local History Trivia"`. |

## Content structure

- **Trivia / scenario games:** `lantern-game-content.js` exports:
  - `HANDBOOK_TRIVIA`, `LOCAL_HISTORY_TRIVIA`: arrays of `{ id, category, question, options[], correctIndex, explanation? }`.
  - `getHandbookQuestions()`, `getLocalHistoryQuestions()` (return shuffled copies for play).
  - To expand: add more items to the arrays or new arrays and getters; no CMS.

## Leaderboard

- Existing API only: `POST https://lantern-api.mrradle.workers.dev/api/leaderboards/record` with `game_name`, `character_name`, `score`, `score_display`.
- Windows: daily (24h), weekly (7d), monthly (30d), school year (Aug 1–May 31). One best score per student per window.

## FERPA / safety

- Identity only for Avatar Match (public character names/avatars already approved for app surfaces).
- No real student names required beyond character identity.
- Safe2Tell can be referenced and linked externally; Lantern does not collect safety reports.

## Phase 2 (later)

- More games in Safety and Leadership categories.
- Optional nugget cost/rewards, mission tie-ins, seasonal challenges (not in Phase 1).
