# TMS Lantern — Phase 4: Mission Integration Plan

## STEP A — PLAN

### A. Exact files to edit

| File | Scope |
|------|-------|
| `apps/lantern-app/js/lantern-data.js` | Add `MISSIONS_PROGRESS` to LS_KEYS |
| `apps/lantern-app/js/lantern-api.js` | Add mission get/complete, claimDailyCheckIn, completeHiddenNugget, completeFirstGame + runner methods + `LANTERN_MISSIONS.completeFirstGame()` hook |
| `apps/lantern-app/index.html` | Add Missions section near top, hidden nugget element, wire mission handlers |

### B. Exact new localStorage / data model additions

| Key | Shape |
|-----|-------|
| `LANTERN_MISSIONS_PROGRESS` | `{ [character_name: string]: MissionProgress }` |

**MissionProgress:**
```js
{
  daily_checkin_last: string,  // "YYYY-MM-DD" last claim date (resets daily)
  hidden_nugget: boolean,      // true when completed
  first_game: boolean          // true when completed
}
```

### C. What existing Lantern logic remains untouched

- Profile shell (hero, wallet, quick actions)
- Posting system (create, pin, delete, feed, tabs)
- Customization (Edit Profile, display name, bio, avatar, frame, theme, featured post)
- Character adoption / picker
- Teacher approval flow (Submit for Approval, approve/reject)
- Store, activity feed, recognition
- All existing LANTERN_* keys (CHARACTERS, CATALOG, ACTIVITY, PURCHASES, ADOPTED, PENDING_SUBMISSIONS, POSTS, PROFILES)

### D. Implementation order

1. lantern-data.js — Add MISSIONS_PROGRESS key
2. lantern-api.js — Add getMissionsProgress, claimDailyCheckIn, completeHiddenNugget, completeFirstGame + runner methods + `LANTERN_MISSIONS.completeFirstGame()` hook
3. index.html — Add Missions section near top, hidden nugget element, renderMissions, wireMissions

### E. Watch-outs / edge cases

- **Daily Check-In:** Compare YYYY-MM-DD; reset each calendar day; use `todayStr()` for consistency
- **Hidden nugget:** Must be subtle but discoverable; fixed position bottom-right; hide when mission completed
- **First Game:** Expose `window.LANTERN_MISSIONS.completeFirstGame()` — games call it on first launch; reads adopted character from localStorage
- **Mission completion:** Must call `addActivity` so balance and activity feed update via existing logic
- **Character switch:** Mission progress is per-character; renderMissions runs on showProfile
- **No duplicate claims:** Each mission checks completed state before awarding

---

## Test checklist

- [ ] **Daily Check-In:** Adopt character → Missions section shows "Ready to claim" and Claim button → tap Claim → toast "+3 nuggets!", status shows "Completed", Claim button hides, balance increases, activity feed shows "+3 nuggets"
- [ ] **Hidden Nugget:** Look for subtle nugget (bottom-right, low opacity) → click it → toast "+5 nuggets!", mission shows "Completed", nugget disappears, balance increases, activity feed shows "+5 nuggets"
- [ ] **Mission persistence:** Complete Daily Check-In or Hidden Nugget → refresh page → mission still shows "Completed", balance unchanged
- [ ] **First Game scaffold:** Missions section shows "Ready — play any game" → in console run `LANTERN_MISSIONS.completeFirstGame()` → returns `{ ok: true, nuggets: 10 }` → mission shows "Completed", balance +10, activity feed shows "+10 nuggets"
