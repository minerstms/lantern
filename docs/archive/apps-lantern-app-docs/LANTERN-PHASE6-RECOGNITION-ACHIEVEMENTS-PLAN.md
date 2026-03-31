# TMS Lantern Phase 6 — Recognition + Achievements — Plan

## STEP A — PLAN

### A. Exact files to edit

| File | Changes |
|------|---------|
| `apps/lantern-app/js/lantern-data.js` | Add `ACHIEVEMENTS` to LS_KEYS |
| `apps/lantern-app/js/lantern-api.js` | Add achievements model, unlock logic, `addActivity` for post created, `storeStudentHistory` enhancements (source, item_id/item_name), `checkAndUnlockAchievements`, `getAchievementsForCharacter`, runner `getAchievements`, call achievement checks from createPost, storeRedeem, spendOnGame, claimDailyCheckIn, completeHiddenNugget, completeFirstGame, approveSubmission |
| `apps/lantern-app/index.html` | Recognition summary area (above Recognition section), improved `renderActivityFeed` with spotlight styling, Achievements section with real badges, spotlight badge on profile hero when spotlighted, call `getAchievements` and `checkAchievements` on profile load |

### B. Exact new files to create

None. All changes are edits to existing files.

### C. Exact localStorage / data model additions

**New key:**
- `LANTERN_ACHIEVEMENTS` — `{ [character_name]: { [achievement_id]: unlocked_at_iso } }`

**Achievement definitions (constants in lantern-api.js):**
```js
ACHIEVEMENT_DEFS = [
  { id: 'first_post', name: 'First Post', icon: '📝', desc: 'Create your first post' },
  { id: 'first_game', name: 'First Game Played', icon: '🎮', desc: 'Play your first game' },
  { id: 'first_purchase', name: 'First Purchase', icon: '🛒', desc: 'Make your first store purchase' },
  { id: 'daily_checkin', name: 'Daily Check-In Complete', icon: '✅', desc: 'Claim daily check-in' },
  { id: 'hidden_nugget', name: 'Hidden Nugget Found', icon: '🪙', desc: 'Find the hidden nugget' },
  { id: 'teacher_spotlight', name: 'Teacher Spotlight', icon: '⭐', desc: 'Get spotlighted by a teacher' },
  { id: 'ten_nuggets', name: '10 Nuggets Earned', icon: '💰', desc: 'Earn 10 nuggets total' },
  { id: 'five_posts', name: '5 Posts Shared', icon: '📢', desc: 'Share 5 posts' },
];
```

**Activity additions:**
- When creating a post: `addActivity(characterName, 0, 'POSITIVE', 'POST', 'Post created')`
- When unlocking achievement: `addActivity(characterName, 0, 'POSITIVE', 'ACHIEVEMENT', 'Achievement: ' + achievementName)`

**storeStudentHistory enhancements:**
- Preserve `source` from activity (APPROVAL, MISSION, POST, ACHIEVEMENT) instead of hardcoding 'LOG'
- Add `item_id`, `item_name` to redeem entries for feed display

### D. Implementation order

1. **lantern-data.js** — Add ACHIEVEMENTS to LS_KEYS
2. **lantern-api.js** — Add achievement definitions, getAchievements, unlockAchievement, checkAndUnlockAchievements; add activity for post created; enhance storeStudentHistory (source, item_id/item_name); call checkAndUnlockAchievements from createPost, storeRedeem, spendOnGame, claimDailyCheckIn, completeHiddenNugget, completeFirstGame, approveSubmission; add getAchievements runner method
3. **index.html** — Add recognition summary area; add spotlight badge on profile hero; improve renderActivityFeed (recognition labels, spotlight styling); replace achievements placeholder with real Achievements section; call getAchievements and checkAchievements on profile load

### E. Watch-outs / edge cases

- **Achievement check timing:** Must run after the action that triggers it (e.g. after createPost, after addPurchase). For approveSubmission (spotlight), run checkAchievements after addActivity — but approveSubmission runs on teacher page, so the profile page won't run it until next load. We need to run checkAchievements when loading profile (history) so we pick up spotlight from teacher page.
- **First purchase vs game:** Store purchase uses `item_id` from catalog (pencil, eraser, etc). Game uses `item_id: 'game_play'`. So first_purchase = first purchase where item_id !== 'game_play'.
- **10 nuggets earned:** Use getCharacterEarned(characterName) >= 10.
- **5 posts:** Use getPostsForCharacter(characterName).length >= 5.
- **Teacher spotlight:** Scan activity for note_text === 'Spotlight!' for character. When unlocking, add activity with source ACHIEVEMENT.
- **Profile load:** Call checkAchievements(characterName) when profile loads so we catch spotlight/approvals from teacher page.
- **checkAchievements:** Needs access to activity, posts, purchases, missions. All available in lantern-api.
- **No duplicate unlocks:** unlockAchievement checks if already unlocked before persisting.

---

## Test Checklist (Phase 6)

- [ ] **Achievement unlock on first post:** Adopt character → create first post → Achievements section shows "First Post" unlocked; activity feed shows "Post created" and "Achievement: First Post"
- [ ] **Achievement unlock on first purchase:** Adopt character → go to Store → redeem any item → Achievements section shows "First Purchase" unlocked; activity feed shows store purchase
- [ ] **Achievement unlock on first game played:** Adopt character → go to Games → play any game (spend 1 nugget) → Achievements section shows "First Game Played" unlocked; activity feed shows "First game played" and "Game: [name]"
- [ ] **Spotlight recognition display:** Teacher approves with Spotlight → profile shows spotlight badge on avatar; activity feed shows "Teacher Spotlight" with distinct styling; recognition summary shows "Teacher Spotlight"
- [ ] **Achievements persisting after refresh:** Unlock any achievement → refresh page → achievement still shows as unlocked
- [ ] **Achievement entries in activity feed:** Unlocking an achievement adds "Achievement: [name]" to the activity/recognition feed
