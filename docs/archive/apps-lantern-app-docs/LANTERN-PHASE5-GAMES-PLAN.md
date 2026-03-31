# TMS Lantern — Phase 5: Games Integration Plan

## STEP A — PLAN

### A. Exact files to edit

| File | Scope |
|------|-------|
| `apps/lantern-app/js/lantern-api.js` | Add `spendOnGame` function + runner method |
| `apps/lantern-app/index.html` | Add Games to nav (4 columns) |
| `apps/lantern-app/store.html` | Add Games to nav (4 columns) |
| `apps/lantern-app/teacher.html` | Add Games to nav (4 columns) |

### B. Exact new files to create

| File | Purpose |
|------|---------|
| `apps/lantern-app/games.html` | Dedicated games page with 4 mini-games |

### C. Data/API additions needed

- **spendOnGame(characterName, gameName):** Check balance >= 1, add purchase (item_id: 'game_play', item_name: gameName, qty: 1, total_cost: 1, note: gameName), return { ok, error? }
- **Runner method:** `spendOnGame` payload { character_name, game_name }
- No new localStorage keys — uses existing PURCHASES and ACTIVITY via addPurchase

### D. Implementation order

1. lantern-api.js — Add spendOnGame + runner method
2. games.html — Create full page with 4 games, nav, balance check, play flow
3. index.html, store.html, teacher.html — Add Games nav button, update grid to 4 columns

### E. Watch-outs / edge cases

- **Balance check:** Must run before any game launch; block with clear message if < 1
- **First Game mission:** Call `LANTERN_MISSIONS.completeFirstGame()` on first play (adds +10); order: spend 1, then completeFirstGame
- **Redirect:** games.html must redirect to index.html if no adopted character (same as store)
- **Activity feed:** addPurchase creates redeem entry; storeStudentHistory shows it
- **Nav order:** Profile | Store | Games | Teacher (user specified)
- **Mobile:** 4-column nav collapses to 1 column on small screens (existing media query)

---

## Test checklist

- [ ] **Game launch costs 1 nugget:** Play any game → balance decreases by 1; Profile/Recognition shows "Redeemed at store" or game name
- [ ] **Insufficient balance:** Set balance to 0 (or use character with 0) → Play button disabled, "Need at least 1 nugget to play" shown; tapping Play shows toast
- [ ] **First Game Played mission:** With mission not yet completed, play any game → mission shows "Completed", +10 nuggets awarded (net +9 after spending 1)
- [ ] **Activity feed:** After playing a game, Profile → Recognition shows the game play (spend) entry
- [ ] **Reaction Tap:** Play → wait for GO → tap → reaction time shown in ms
- [ ] **Nugget Click Rush:** Play → 10-second countdown → tap repeatedly → final tap count shown
- [ ] **Memory Match:** Play → 12 cards (6 pairs) → flip to match emojis → "All matched!" when done
- [ ] **Hidden Nugget Hunt:** Play → find and click nugget in area → checkmark shown
