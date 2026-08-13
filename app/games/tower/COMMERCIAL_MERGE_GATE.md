# Commercial merge gate — stacking lab (Prompt #132)

**Do not merge this game to `origin/main` as a production Play title while any row below is open.**

Preferred architecture (from commercial clearance):

permissively licensed donor **code** + original Lantern **name** + original Lantern **art** + original Lantern **UI** + Lantern-owned or clearly commercial/CC0 **audio** + Lantern game shell + **secure leaderboard** + authoritative TMS **Nugget** economy.

| # | Gate | Status on this branch | Notes |
|---|------|------------------------|--------|
| 1 | Secure score pipeline | **OPEN** | Lab preview still skips all writes. Unauthenticated `POST /api/leaderboards/record` remains a separate RED item (fix lives on `cursor/game-leaderboard-auth-0c71`). Do not enable lab score POSTs until that lands. |
| 2 | Correct Nugget economy integration | **OPEN** | `NUGGET_WRITES_ENABLED = false`. Preview mode hardcoded. Authoritative `game_play` / `game_win` path is documented on the bridge and must stay server-delta ±1 with session identity. |
| 3 | Original Lantern name | **OPEN** | Working chrome: **Stack Lab**. Candidates in [`NAME_CANDIDATES.md`](./NAME_CANDIDATES.md). None selected. No trademark review. |
| 4 | Questionable donor art replaced | **OPEN** | HTML chrome is Lantern CSS. Canvas gameplay sprites in `assets/` are still **temporary donor placeholders**. See [`asset-slots.json`](./asset-slots.json). |
| 5 | Questionable donor audio replaced | **PARTIAL** | Playable path is silent. Caketown and donor SFX remain in `donor/assets/` for provenance and must not ship. |
| 6 | BMQB files/branding removed from shipping assets | **PARTIAL** | Hosted UI does not load BMQB logos. `donor/assets/main-index-logo.png` and `main-loading-logo.png` remain in the vendor snapshot and must not be copied into `assets/` or any shipping bundle. |
| 7 | Provenance / notices retained | **HELD** | `GAME_PROVENANCE.md`, `THIRD_PARTY_NOTICES.md`, `LICENSE`, `donor/LICENSE` are present. Keep them. |
| 8 | Final commercial-clearance review | **OPEN** | Not requested; not passed. |

## This prompt’s engineering posture

- Continue technical integration in the unlinked lab
- Donor art/audio are **temporary placeholders** only where the canvas engine still requires a file
- Swap by dropping Lantern files into `lantern-assets/` and running `apply-asset-overlay.mjs`
- Do **not** recommend production merge
- Do not add this game to the Play catalog, nav, Explore, Missions, or Create
- Do not deploy production
