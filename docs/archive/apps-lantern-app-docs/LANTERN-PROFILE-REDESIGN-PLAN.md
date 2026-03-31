# TMS Lantern — Profile Redesign Plan

## STEP A — PLAN

### A. Exact Lantern files to edit

| Phase | File | Scope |
|-------|------|-------|
| 1 | `apps/lantern-app/index.html` | Profile shell redesign, layout, placeholders |
| 2 | `apps/lantern-app/index.html` | Posting UI, post grid |
| 2 | `apps/lantern-app/js/lantern-data.js` | Add posts helpers |
| 2 | `apps/lantern-app/js/lantern-api.js` | Add post CRUD |
| 3 | `apps/lantern-app/index.html` | Customization modal/section |
| 3 | `apps/lantern-app/js/lantern-data.js` | Add profile custom (display_name, bio, avatar, frame) |
| 4 | `apps/lantern-app/index.html` | Missions section, mission cards |
| 4 | `apps/lantern-app/js/lantern-data.js` | Missions data |
| 5 | `apps/lantern-app/index.html` | Games section, game launcher links |
| 5 | New: `apps/lantern-app/games/*.html` | Game pages |
| 6 | `apps/lantern-app/index.html` | Achievements/badges section |
| 6 | `apps/lantern-app/js/lantern-data.js` | Achievements data |
| 7 | `apps/lantern-app/index.html` | Visual polish, family parity |

### B. Exact new files to create

| Phase | File | Purpose |
|-------|------|---------|
| 2 | None | Posts stored in localStorage via lantern-data |
| 5 | `apps/lantern-app/games/reaction-tap.html` | Reaction Tap game |
| 5 | `apps/lantern-app/games/nugget-click-rush.html` | Nugget Click Rush |
| 5 | `apps/lantern-app/games/memory-match.html` | Memory Match |
| 5 | `apps/lantern-app/games/hidden-nugget-hunt.html` | Hidden Nugget Hunt |

### C. Data model additions needed

| Phase | Key | Shape |
|-------|-----|-------|
| 2 | `LANTERN_POSTS` | `[{ id, character_name, type: 'image'\|'link'\|'video'\|'webapp'\|'project', url?, caption?, created_at }]` |
| 3 | `LANTERN_PROFILE_CUSTOM` | `{ [character_id]: { display_name?, bio?, avatar?, frame? } }` |
| 4 | `LANTERN_MISSIONS_PROGRESS` | `{ [character_id]: { daily_checkin?, hidden_nugget?, first_game? } }` |
| 6 | `LANTERN_ACHIEVEMENTS` | `[{ id, character_name, badge_id, earned_at }]` |

Phase 1: No data model changes.

### D. Implementation order for phases

1. **Phase 1 — Profile shell redesign** (now)
2. Phase 2 — Posting system
3. Phase 3 — Customization system
4. Phase 4 — Mission integration
5. Phase 5 — Games integration
6. Phase 6 — Recognition and achievements
7. Phase 7 — Visual polish / family parity

### E. Risks / watch-outs

- Do not break character adoption flow (picker → adopt → profile)
- Do not break teacher approval flow (Submit for Approval button)
- Do not break store redirect (store requires adopted character)
- Testing controls must remain; can be collapsible or tucked at bottom
- Keep `LANTERN_ADOPTED_CHARACTER` and all existing localStorage keys unchanged
- No changes to store.html, teacher.html, lantern-api.js for Phase 1
- Single-column mobile layout, font sizes 22–36px per user rules

### F. What can remain from current Lantern structure

- Character picker (when no character adopted)
- `getAdopted()`, `setAdopted()`, `getCharacters()`
- `callGetBalance()`, `callStudentHistory()`
- `addNuggets()`, `clearPurchasesForCharacter()`, `clearActivityForCharacter()`
- `submitForApproval()`, `wireTestingControls()`
- All of `lantern-data.js`, `lantern-api.js` — untouched in Phase 1
- `store.html`, `teacher.html` — untouched
- Nav: Profile | Teacher | Store
