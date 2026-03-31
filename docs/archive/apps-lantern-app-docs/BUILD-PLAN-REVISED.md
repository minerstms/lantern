# TMS Lantern — Revised Build Plan

## Tightened Rules (Applied)

1. **Post approval** — Distinct from curation. Teachers: Approve | Reject | Return for Improvements | Feature/Spotlight/Teacher Pick. Approval gates visibility; curation is recognition after approval.
2. **Comments** — Currently enabled but unmoderated. Recommend: gate behind teacher_only, hide comment form, or defer expansion until moderation exists. Reactions only for next pass.
3. **Grade reflection** — FERPA: writing only, no screenshots.
4. **Daily nugget hunt** — Add `hint_text` to model (Phase 7).
5. **Teacher missions** — Active missions visible to all; submissions route to creator.
6. **Student news** — Explicit author roles: Student Reporter, Teacher Contributor, Staff Announcement, Admin Update.
7. **Display page** — Require `moderation_status === 'approved'` (or `approved === true`), `visibility === 'school_community'` (or `'school community'`), `feature_eligible === true`. Only safe public-facing content.
8. **Phase order** — See below.

---

## Revised Phase Order

| Phase | Focus |
|-------|-------|
| **1** | Safety + approval |
| **2** | Explore |
| **3** | Activity events |
| **4** | Writing improvements |
| **5** | Teacher-created missions |
| **6** | Student news |
| **7** | Daily nugget hunt |
| **8** | Achievement expansion |
| **9** | Display page |
| **10** | Store expansion |
| **11** | UI polish |

---

## Phase 1: Safety + Approval (Complete)

### Exact Files Edited

| File | Changes |
|------|---------|
| `js/lantern-api.js` | createPost: approved, rejected, returned, visibility, feature_eligible; updatePost: returned fields; approvePost, rejectPost, returnPostForImprovements, resubmitPostForApproval, getPendingPosts, getApprovedPosts; curatePost: require approved; getDiscoveryFeed: filter by approved; teacherDashboardData: pendingPosts, approved posts; runner: approvePost, rejectPost, returnPostForImprovements, resubmitPostForApproval |
| `teacher.html` | Pending Post Approvals card; renderPendingPosts; callApprovePost, callRejectPost, callReturnPostForImprovements; refresh uses pendingPosts |
| `index.html` | callResubmitPostForApproval; post status badges (pending/returned/rejected); postReturnedReason; Resubmit button for returned posts; CSS for postStatusBadge, postReturnedReason |
| `docs/LANTERN-DATA.md` | POSTS schema with approval fields; THANKS, GRADE_REFLECTIONS, STAFF keys; ensureStaff |

---

## Phase 2: Explore Discovery Page (Complete)

- **explore.html** — Dedicated discovery page with Teacher Picks, Featured Creations, Recent Creations, Student News (placeholder), School Activity (placeholder)
- **Filter chips:** All, Projects, Apps, Images, Videos, Games, News, Students
- **API:** getExploreFeed, teacher_pick/teacher_featured in getDiscoveryFeed
- **Nav:** Explore added to index, store, games, teacher, staff, thanks, grades

## Phase 3: Global Activity Stream (Complete)

- **LANTERN_ACTIVITY_EVENTS** — New merge-friendly event model
- **Event types:** post_created, post_approved, teacher_pick, featured, nugget_earned, mission_completed, achievement_unlocked, thanks_submitted, grade_reflection_submitted, thanks_returned, grade_reflection_returned, thanks_resubmitted, grade_reflection_resubmitted, concern_logged
- **Explore:** School Activity section populated
- **Profile:** School Activity subsection in Recognition
- **API:** createActivityEvent, getActivityEvents

## Phase 4: Writing Improvements (Complete)

- **Teacher/Staff actions:** Approve, Reject, Return for Improvements, Log Concern
- **Thank-you letters:** Return for improvements, create concern; student sees returned status and feedback; Edit & Resubmit
- **Grade reflections:** Same flow
- **Concern records:** LANTERN_CONCERNS — simple, informational only; no discipline or escalation
- **FERPA:** No screenshot upload; grade reflections remain writing-only
- **API:** returnThanksForImprovements, resubmitThanks, returnGradeReflectionForImprovements, resubmitGradeReflection, createConcern
- **Event integration:** thanks_returned, grade_reflection_returned, thanks_resubmitted, grade_reflection_resubmitted, concern_logged

## Phase 5: Teacher-Created Missions (Complete)

- **Data:** LANTERN_TEACHER_MISSIONS, LANTERN_MISSION_SUBMISSIONS
- **Teacher UI:** Create Mission, Mission List (activate/deactivate), Mission Submissions (Approve, Reject, Return, Log Concern)
- **Student UI:** Teacher Missions section; submit completion; Edit & Resubmit for returned
- **Submission routing:** Submissions route to teacher who created the mission
- **Event integration:** mission_created, mission_submitted, mission_returned, mission_approved, mission_rejected, mission_resubmitted, nugget_earned (source: teacher_mission)
- **Built-in missions:** Preserved; teacher missions are a separate layer

## Phase 6: Student News (Complete)

- **Data:** LANTERN_NEWS
- **news.html:** Published news with category filter; submission form; My Articles (returned/resubmit)
- **Author roles:** Student Reporter, Teacher Contributor, Staff Announcement, Admin Update
- **Teacher UI:** News Submissions (Approve, Reject, Return, Log Concern)
- **Explore:** Student News section shows approved articles
- **Event integration:** news_submitted, news_returned, news_resubmitted, news_published

## Phase 7: Daily Nugget Hunt (Complete)

- **Data:** LANTERN_NUGGET_HUNT
- **Spawn:** One page per day (index, explore, store, games, news); random zone; rarity tiers (normal +1, shiny +2, golden +3, legendary +5)
- **Hint:** Per-page hints; "Today's Nugget Hint" on profile and Explore
- **Claim:** Click nugget to claim; cha_ching on success; one reward per character per day
- **Event:** daily_nugget_found
- **Preserved:** Built-in Hidden Nugget mission unchanged

## Phase 8–11 (Planned)

- **Phase 8:** Achievement expansion
- **Phase 7:** Daily nugget hunt + hint_text
- **Phase 8:** Achievement expansion
- **Phase 9:** Display page (approved + visibility + feature_eligible)
- **Phase 10:** Store expansion
- **Phase 11:** UI polish
