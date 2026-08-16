# Premium Games Contract

**Canonical.** Prompt #259. Future Premium Games changes MUST update this document in the same change. Do not relabel existing library games as Premium.

Related:

- `docs/NUGGET_ECONOMY_CONTRACT.md` — TMS Nugget authority
- `app/js/lantern-game-catalog.js` and `worker/lantern-game-catalog.js` — ids / names / play cost
- `docs/PREMIUM_GAME_PROVENANCE_STACK_LAB.md`
- `docs/PREMIUM_GAME_PROVENANCE_MINECART_SWITCH.md`
- `docs/PREMIUM_GAME_PROVENANCE_ORBIT_LOCK.md`

---

## 1. The three Premium Games

Premium Games are exactly:

1. **Stack Lab** (internal id `tower`)
2. **Minecart Switch** (internal id `minecart-switch`)
3. **Orbit Lock** (internal id `orbit-lock`)

No substitutions.

These are genuinely new native Lantern games. They are not Handbook Trivia, Local History Trivia, Reaction Tap, Memory Match, Nugget Click Rush, Nugget Hunt, Avatar Match, Lantern Live Trivia, or any other already-live library game with a Premium label.

Existing trivia / Reaction / arcade games remain in the standard Games library. They are **not** Premium merely because they were previously featured under that label (#245).

---

## 2. Hosting

- Same-origin Lantern runtime on `tmslantern.org`
- Path: Play → Premium Games → pregame → paid Start → same-origin game
- No external game website
- No external account
- No iframe to a third-party host
- No ads
- No analytics

Stack Lab plays in a same-origin iframe at `/games/tower/index.html?lanternPlay=1`.
Minecart Switch and Orbit Lock run as native canvas engines in `games.html`.

Deep links (pregame only; cost 0 until Start):

- `/games.html?game=tower`
- `/games.html?game=minecart-switch`
- `/games.html?game=orbit-lock`

---

## 3. Paid start

- Browsing the card: free
- Opening pregame: free
- Deep-linking to pregame: free
- Clicking Start: exactly **−1** authoritative TMS Nugget
- Insufficient balance: the game does not begin
- Reloading pregame: does not spend
- Starting another run / Play Again: another −1 Nugget
- Presentation: **1 Nugget = 1 Play**
- No Lantern parallel wallet

---

## 4. Run proof

Start → server creates a paid run → opaque `run_id` → play → score submission tied to that run → the run cannot be reused for multiple accepted scores or rewards.

Do not trust client-selected game cost, student, account, or arbitrary `character_name`.

---

## 5. Rewards

Do not invent new reward math.

| Game | Win reward |
|---|---|
| Stack Lab | Qualifying win: 10 floors → +1 Nugget via existing `game_win`, same `run_id`, idempotent |
| Minecart Switch | Survival / leaderboard score only. No `game_win` |
| Orbit Lock | Timing / leaderboard score only. No `game_win` |

Paid play and leaderboard score are separate from win reward.

---

## 6. Leaderboards

All three use higher-is-better scoring. Identity comes from authenticated server session, never from client display-name input.

| Game | Score direction | Server ceiling |
|---|---|---|
| Stack Lab | Higher better | 2500 |
| Minecart Switch | Higher better | 15000 |
| Orbit Lock | Higher better | 6000 |

---

## 7. Media

Shipping runtime may contain only original Lantern artwork, canvas-generated sprites, original WebAudio, CC0, or permissively licensed assets/code with required notices.

Not allowed: donor artwork, logos, title screens, branded sprites, donor MP3/OGG, uncleared SFX, proprietary fonts, tracking, hotlinked external game assets.

See the per-game provenance records.

---

## 8. Input

Desktop mouse and keyboard, Chromebook trackpad/keyboard/touch, phone/tablet touch. No hover-only essential controls. No tiny targets. No right-click requirement.
