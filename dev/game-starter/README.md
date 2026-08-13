# Lantern Game Starter — template folder

This folder is **outside** the Pages deploy root (`app/`). It is not in nav, not in `LANTERN_GAME_CATALOG`, and not on the Worker leaderboard allowlist.

## Files

| File | Role |
|------|------|
| `tap-once.spec.mjs` | Contract spec (id, title, score bounds, play_cost) |
| `tap-once.js` | Mechanics: `start` / `render` / `end` + touch/keyboard |
| `tap-once.html` | Isolated demo page (no production catalog card) |
| `register.example.js` | Copy-paste catalog + `games.html` snippets |

## Promote a real game

Follow **`docs/LANTERN_GAME_STARTER_KIT.md`**. Short path:

1. Choose a **new** id (not `starter-tap-once`).
2. Register in **both** catalogs with matching id/name and `play_cost: 1`.
3. Add original card artwork under `app/assets/`.
4. Add hidden `playBtnId` + surface in `app/games.html`.
5. Wire `LanternGameStarter.openPaidGame` (or existing `tryPlay`) → mechanics → `postScore` / `postLeaderboardScore`.
6. Read `LanternGameStarter.missionLaunchContext()` if the game can be Mission-launched. Do not treat ordinary play as a Mission.
7. Run `node worker/scripts/game-starter-contract-test.mjs` and existing `games-*-test.mjs`.
