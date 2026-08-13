# Lantern Game Starter Kit

**Audience:** a developer or Cloud Agent adding game #N.  
**Rule:** reuse the existing Games architecture. Do not invent a second economy, a second leaderboard, or a new auth path.

Live games stay in `app/games.html`. This kit documents the **current** contract and adds a thin helper plus a **non-production** template.

---

## Canonical lifecycle (current production path)

```
Game catalog (frontend + worker allowlist)
  → signed-in Games shell (games.html, guardPilotPage)
  → library / leaderboard card click (hidden playBtnId)
  → Game Player pregame (canonical artwork)
  → Start → 1 Nugget paid start (TMS transact, run_id)
  → gameplay (game-specific IIFE)
  → bounded score
  → POST /api/leaderboards/record (session identity + run_id)
  → GET /api/leaderboards (public_display_name)
  → wallet refresh (GET /api/economy/balance)
```

Mission launch is a **separate, optional URL context** (`?game=<id>&mission=<id>`). Ordinary play has no `mission` query and is not a Mission.

---

## Actual files / functions (do not invent new names)

| Step | File | Function / route |
|------|------|------------------|
| Frontend catalog / cards | `app/js/lantern-game-catalog.js` | `GAMES[]`, `listGames`, `getGameById`, `leaderboardKey`, `playActionLabel` |
| Worker allowlist / score bounds | `worker/lantern-game-catalog.js` | `LANTERN_LEADERBOARD_GAMES`, `resolveRegisteredLeaderboardGame`, `validateLeaderboardScore`, `sanitizeRunId` |
| Games page / cards / boards | `app/games.html` + `app/js/lantern-games-page.js` | `LanternGamesPage.init`, `buildGameHubCardSpec`, `fetchLeaderboard` |
| Play triggers | `app/games.html` `#gamesPlayTriggersHost` | Hidden buttons: `playBtnId` from catalog |
| Auth | `app/js/lantern-pilot-auth.js` | `guardPilotPage({ mode: 'general' })`; session cookie `lantern_pilot` |
| Identity | Worker `resolveEconomyGamePlayTransact` | Server-derived; client `character_name` is ignored on record |
| Wallet | `app/js/lantern-wallet.js` | `fetchMyBalance`, `postEconomyTransact` → `/api/economy/balance`, `/api/economy/transact` |
| Paid start | `app/js/lantern-games-paid-start.js` | `LanternGamesPaidStart.startPaidGame(gameName, onSuccess)` |
| Pregame shell | `app/js/lantern-game-player.js` | `LanternGamePlayer.open({ surface, onPregameStart, ... })` |
| Charge + play | `app/games.html` | `tryPlay(gameName, showGameFn, playerOpts)` |
| Score POST | `app/games.html` | `postLeaderboardScore(gameName, characterName, score, scoreDisplay, onDone, runId)` — does **not** send `character_name` |
| Score POST (new games) | `app/js/lantern-game-starter.js` | `LanternGameStarter.postScore({ gameName, score, scoreDisplay, runId })` |
| Leaderboard GET | `app/js/lantern-games-page.js` | `GET /api/leaderboards?period=&game_name=&limit=` |
| Worker record | `worker/index.js` `handleLeaderboardRoutes` | `POST /api/leaderboards/record` |
| Same-origin API | `app/functions/api/[[path]].js` | Pages `/api/*` → Worker |
| Nav | `app/js/lantern-nav.js` | Play → `games.html` |
| Mission URL (trivia only today) | `app/js/lantern-educational-trivia-missions.js` | `candidateFromLocation`, `startRun`, `submitAnswer` |
| Mission-aware helper | `app/js/lantern-game-starter.js` | `missionLaunchContext`, `clearMissionQuery` |

---

## Existing shared infrastructure (already ~80%)

Use these. Do not replace them.

1. **Dual catalog** — every scored game must exist in **both** `app/js/lantern-game-catalog.js` and `worker/lantern-game-catalog.js` with the same `id` and display `name`.
2. **1 Nugget paid start** — `LanternGamesPaidStart` always charges **1** (`playCostForGame` returns 1). TMS is the wallet; there is no client-side balance.
3. **run_id** — generated at paid start; sent on the transact `meta.run_id` and on leaderboard `run_id` for idempotency.
4. **Game Player** — fullscreen mobile-first shell, pregame hero from `game.image`, Start/Exit, loading (`Starting…`) and error/insufficient copy.
5. **Library cards** — `LanternGamesPage` renders `listGames()`; card click proxies to `playBtnId`.
6. **Leaderboards** — Worker D1 `lantern_leaderboard_entries`; GET uses `public_display_name` (never raw account ids as the public label).
7. **Play Again** — must call `tryPlay` / `openPaidGame` again (a new paid run + new `run_id`), never a free replay.

New games may load `app/js/lantern-game-starter.js` and call `openPaidGame` / `postScore`. Production `games.html` does **not** load that helper today so existing games stay byte-stable.

---

## Developer workflow for game #N

1. Choose a unique **id** (lowercase kebab-case) and a safe **title**.
2. Choose **score bounds** (`scoreMin` / `scoreMax`) and `lowerIsBetter`.
3. Add original **card artwork** (`app/assets/…-card.png`). No copyrighted assets.
4. Register in **both** catalogs (`play_cost: 1`, `status: 'playable'`, `leaderboard: true`).
5. In `app/games.html`: hidden `playBtnId`, game surface, IIFE with `start` / play loop / `end`.
6. Wire: card already plays via `playBtnId` once the catalog entry exists.
7. On Start: `tryPlay` or `LanternGameStarter.openPaidGame`.
8. On finish: `postLeaderboardScore` or `LanternGameStarter.postScore` with canonical **name** and `run_id`.
9. Play Again → paid start again.
10. If Mission-launchable: read `missionLaunchContext()`; only enter the Mission path when `fromMission === true`. Strip `?mission=` before ordinary Play Again.
11. Tests: `node worker/scripts/game-starter-contract-test.mjs` plus existing `games-*-test.mjs`.
12. `npx wrangler pages functions build` from `app/` (or `npx.cmd` on Windows).

Copy-paste catalog snippets: `dev/game-starter/register.example.js`.  
Copy-paste mechanics pattern: `dev/game-starter/tap-once.js`.

---

## GAME CREATION CHECKLIST

- [ ] Unique `id` (not already in either catalog; not `starter-tap-once`)
- [ ] Safe title / description (no HTML, no student PII, FERPA-safe copy)
- [ ] Frontend catalog entry (`app/js/lantern-game-catalog.js`)
- [ ] Worker allowlist entry (`worker/lantern-game-catalog.js`) — **no arbitrary game id**
- [ ] Card artwork (original; `game.image`; fallback icon only)
- [ ] Hidden `playBtnId` in `app/games.html` `#gamesPlayTriggersHost`
- [ ] Game surface in `#lanternGamePlayerSurfaceHost` (or culture overlay)
- [ ] Controls: touch + keyboard; mobile-first; desktop; font 22–36 in the Games shell
- [ ] Paid start via `LanternGamesPaidStart` / `openPaidGame` (default **1 Nugget**)
- [ ] TMS balance only (`LanternWallet`); no local parallel wallet
- [ ] `run_id` from paid start; idempotent transact + record
- [ ] Explicit `scoreMin` / `scoreMax` on the worker entry
- [ ] Secure submission: `POST /api/leaderboards/record` with credentials; no client `character_name`
- [ ] Leaderboard: catalog `leaderboard: true`; GET uses canonical display name
- [ ] Restart: Play Again re-enters paid start (not free)
- [ ] Loading / error / insufficient-Nugget states (Game Player pregame already owns these)
- [ ] Mission compatibility: can **detect** `?mission=` **without** treating ordinary play as a Mission
- [ ] Viewport: Game Player `100dvh` fullscreen; no horizontal overflow
- [ ] No copyrighted / unlicensed assets
- [ ] Tests: contract test + relevant `worker/scripts/games-*-test.mjs`
- [ ] Build: `npx wrangler pages functions build`
- [ ] Live acceptance **after eventual deployment** (this kit does not deploy): signed-in play, 1 Nugget debit, score on board, Play Again charges again

---

## Economy integration

- Cost: **1 Nugget** per ordinary paid start (`kind: 'game_play'`, `delta: -1`).
- Authority: TMS via Worker `/api/economy/transact` and `/api/economy/balance`.
- Identity: session account (`resolveEconomyGamePlayTransact`); students key off username, not a client-supplied display name.
- Insufficient balance: **do not** call transact; pregame shows “You need 1 Nugget to play.”
- Do not add a second wallet, ledger, or “lab nuggets” path.

---

## Run / security integration

- `run_id` from `LanternGamesPaidStart` (`crypto.randomUUID` or fallback).
- Transact meta includes `{ game_name, run_id }` for spend idempotency.
- Leaderboard POST includes `run_id`; duplicate `(character, game, run_id)` returns `{ ok: true, idempotent: true }`.
- Record allowlist: unlisted names → `invalid_game`.
- Score bounds: `score_out_of_range`. Session required or the POST is rejected.

---

## Leaderboard integration

- Write: `POST /api/leaderboards/record` `{ game_name, score, score_display, run_id }`.
- Read: `GET /api/leaderboards?period=weekly&game_name=<display name>&limit=25`.
- Public label: `public_display_name` (fallback `display_name`, then `"Player"`).
- Sort: `lowerIsBetter` on the worker catalog (Reaction Tap, Memory Match, Nugget Hunt are lower-is-better).

---

## Mission-context integration

- Detect: `LanternGameStarter.missionLaunchContext()` or `LANTERN_EDU_TRIVIA.candidateFromLocation(location)`.
- Ordinary play: no `mission` query → `fromMission: false`.
- Do **not** auto-complete a Mission because someone opened Games.
- After a Mission run, `clearMissionQuery()` so Play Again is ordinary paid play.
- Today only Handbook Trivia and Local History Trivia have Mission challenge paths (`perm_handbook_trivia`, `perm_local_history_trivia`). New games may read the URL; they must not invent a second Mission economy.

---

## Sample / template

`dev/game-starter/` — **outside** `app/` (Pages root), so it is not in the live catalog and is not deployed as a game.

- Spec: `dev/game-starter/tap-once.spec.mjs` (`starter-tap-once`)
- Mechanics: `dev/game-starter/tap-once.js`
- Isolated page: `dev/game-starter/tap-once.html`

The template **must stay unregistered** until a real game is approved with a new id.

---

## Contract test

```bash
node worker/scripts/game-starter-contract-test.mjs
```

Reusable evaluator: `worker/scripts/game-contract-lib.mjs` → `evaluateGameContract(spec, ctx, options)`.

For a future id, add bounds to the test’s production map (or pass worker `scoreMin`/`scoreMax` on the spec) and keep both catalogs in sync. An unknown id fails closed. The template id must remain excluded.

---

## Existing exceptions (do not silently normalize)

| Game / path | How it differs | Keep? |
|-------------|----------------|-------|
| **`nuggetHunt` id** | CamelCase id (not kebab-case). New games should use kebab-case; do not rename this id | Yes |
| **Reaction Tap** | Lower-is-better (ms). False start ends the paid attempt **without** posting a time and **without** a second charge | Yes |
| **Memory Match** | Lower-is-better (moves / time semantics in worker max 3600) | Yes |
| **Handbook + Local History Trivia** | Optional Mission path (`?mission=`) uses `/api/missions/trivia/run/start` + `/answer` instead of the ordinary trivia scorer. Play Again strips `mission` | Yes |
| **Lantern Live Trivia** | Fetches approved questions **before** charge; no Mission path | Yes |
| **Avatar Match** | Needs ≥4 approved avatars from `/api/games/characters`; fail-closed before play | Yes |
| **Nugget Click Rush** | 10s tap count; higher is better | Yes |
| **Daily nugget hunt (page decoration)** | Not a catalog game; not paid start | Yes |
| **`play_cost` on frontend catalog** | Stored per game but paid-start currently **forces 1** | Yes — do not add variable pricing without an explicit economy prompt |
| **`recordGameResult` local runner** | Some IIFEs still call it; Worker HTTP record is the public leaderboard | Do not revive localStorage boards |
| **First Game mission** | Worker may complete it on successful `game_play`; not a Games catalog entry | Yes |
| **Starter helper** | Not loaded by production `games.html` | Intentional |

---

## Validation commands

```bash
node worker/scripts/games-paid-start-test.mjs
node worker/scripts/games-score-pipeline-test.mjs
node worker/scripts/games-page-test.mjs
node worker/scripts/games-routing-test.mjs
node worker/scripts/games-player-test.mjs
node worker/scripts/game-run-integrity-test.mjs
node worker/scripts/leaderboard-record-security-test.mjs
node worker/scripts/game-starter-contract-test.mjs
npx wrangler pages functions build
git diff --check
```

On Windows CI the Wrangler command may be `npx.cmd wrangler pages functions build` (run from `app/` if the CLI requires the functions directory).

---

## How the next Cloud Agent should use this kit

1. Read this file and `dev/game-starter/README.md`.
2. Do **not** rewrite `games.html` architecture or migrate old games onto the helper.
3. Copy `register.example.js` + `tap-once.js` patterns with a **new** id.
4. Register both catalogs, add artwork, wire `games.html`, keep 1 Nugget + allowlist + bounds.
5. Run the contract test and existing games tests.
6. Leave `starter-tap-once` unregistered.
