# Explore — scroller viability audit

**Date:** 2026-03-19 · **Scope:** `apps/lantern-app/explore.html` horizontal rails (`.lanternScroller`).  
**Rule of thumb:** A rail “earns” a dedicated scroller if it can show **~4+ swipeable cards** under normal demo seed + local API-off mode, or **API-backed** lists that routinely exceed one viewport.

**Thresholds used here**

| Label | Meaning |
|--------|---------|
| **Rendered** | Cards actually appended to the scroller (or activity rows), after UI caps. |
| **Available (seed/local)** | Rows in `localStorage` after `seedDemoWorld()` / `ensureStartupMode`, or static lists in HTML. |
| **API** | When `window.LANTERN_AVATAR_API` is set (Worker/D1 paths). |

---

## Section-by-section

### 1. Announcements (`#bestEl`)

| | |
|--|--|
| **Rendered (typical)** | Up to **12** (official teacher/staff/admin news cards + teacher-pick / teacher-featured posts; combined cap in `renderFeaturedAnnouncementsRail`). |
| **Available (seed/local)** | **~18** news articles in seed; **~many** feed posts eligible for pick/featured curation (subset shown). |
| **Scroller justified?** | **Yes** — enough mixed cards to overflow on phone landscape. |
| **Recommended action** | **Keep as scroller.** |

---

### 2. Missions & Actions → Missions (`#missionSpotlightEl`)

| | |
|--|--|
| **Rendered (before fix)** | **1** random mission (API) or **0** (no API, section hidden). |
| **Rendered (after fix)** | Up to **12** mission cards (API **or** `getActiveTeacherMissionsForCharacter` from `lantern-api` / localStorage). |
| **Available (seed/local)** | **19** active teacher missions in seed (`tm1`–`tm20` minus one inactive). |
| **Scroller justified?** | **Yes** after fix for local demo. |
| **Recommended action** | **Keep as scroller** — implementation: multi-card rail + local fallback when Worker URL absent. |

---

### 3. Missions & Actions → Polls (`#pollsEl`)

| | |
|--|--|
| **Rendered** | One card per poll returned from `GET /api/polls` (no client cap). |
| **Available (seed/local)** | **0** — polls are **not** in `lantern-data` seed; they live in D1 via Worker. |
| **Scroller justified?** | **Only with API + real polls.** Without API, a rail is empty marketing only. |
| **Recommended action** | **Hide Polls sub-lane** when `!window.LANTERN_AVATAR_API` (no fake poll seed tonight). Parent **Missions & Actions** row hides if both Missions and Polls lanes are unused. |

---

### 4. Mini Games (`#schoolSmartsEl`)

| | |
|--|--|
| **Rendered (before fix)** | **2** static link cards. |
| **Rendered (after fix)** | **8** static link cards (`games.html` + `school-survival` variants). |
| **Available** | Same as rendered (inline list in `renderAll`). |
| **Scroller justified?** | **Marginal → Yes** — 8 cards can overflow a narrow viewport. |
| **Recommended action** | **Keep as scroller** — expanded static list (no new systems). |

---

### 5. Latest Posts (`#recentEl`)

| | |
|--|--|
| **Rendered** | **30** (`renderSection` limit). |
| **Available (seed/local)** | **30** posts exposed via `getApprovedPosts` cap; **~60** in `LANTERN_POSTS` after full seed. |
| **Scroller justified?** | **Yes.** |
| **Recommended action** | **Keep as scroller.** |

---

### 6. School News — Articles (`#happeningNewsEl`)

| | |
|--|--|
| **Rendered** | **`happeningNewsLimit`** (default **12**, “Load more” adds **12**). |
| **Available (seed/local)** | **16** approved + pending/returned mix in seed templates (see `seedDemoWorld` news loop); approved count **~16** for student-facing approved filter. |
| **Scroller justified?** | **Yes** at 12+ approved articles after seed. |
| **Recommended action** | **Keep as scroller.** |

---

### 7. School News — Activity (`#happeningActivityEl`)

| | |
|--|--|
| **Rendered** | Up to **12** activity cards per `callGetActivityEvents(12)` (was higher in some paths; aligned on refresh). |
| **Available (seed/local)** | **~74** activity events in seed (`events` array + daily hunt lines in `lantern-data.js`). |
| **Scroller justified?** | **Yes.** |
| **Recommended action** | **Keep as scroller.** |

---

## Files touched (implementation)

- `apps/lantern-app/explore.html` — mission multi-card + local fallback; hide Polls without API; `syncYouCanDoSectionVisibility`; Mini Games **8** cards; refresh limits aligned (`happeningNewsLimit`, activity **12**).
- `apps/lantern-app/js/lantern-explore-dataset.js` — `LEARNING_LINK_SEEDS` expanded to **8** entries (parity with Mini Games rail for unified dataset).

---

## Summary table

| Section | Scroller OK? | Action |
|---------|----------------|--------|
| Announcements | Yes | Keep |
| Missions | Yes (local) | Keep + multi-card |
| Polls | Only with API | Hide lane if no API |
| Mini Games | Yes (8 cards) | Keep + more links |
| Latest Posts | Yes | Keep |
| School News (articles) | Yes | Keep |
| Activity | Yes | Keep |

*No card system or scroller CSS changes — behavior + counts only.*
