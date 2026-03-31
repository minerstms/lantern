# Missions — Implementation Master Prompt

**Source of truth:** `.cursor/phase1-missions-audit.md`  
**Rules:** `.cursor/lantern-rules.md` (FERPA, Dead Simple, Platform Purpose, Architecture)

---

## Actual State of Missions (Do Not Assume Otherwise)

Missions **already exist** in the Lantern frontend and are **client-only**.

- **Data:** Stored in **localStorage** via `apps/lantern-app/js/lantern-api.js`. Keys: `LANTERN_TEACHER_MISSIONS`, `LANTERN_MISSION_SUBMISSIONS`. System missions (daily check-in, hidden nugget, first game) use `LANTERN_MISSIONS_PROGRESS` (see `lantern-data.js` LS_KEYS).
- **Logic:** All mission and submission logic lives in **lantern-api.js**: create/update missions, submit completion, approve/reject/return/resubmit. The app uses the **runner** pattern: `createRun()` from `LANTERN_API` invokes this same API. There is **no** fetch to the Worker for missions.
- **Profile (student):** **index.html** has one **My Missions** section (`#myMissionsSection`) with:
  - Featured mission card (`#featuredMissionCard`)
  - Active missions list (`#activeMissionsList`)
  - Completed missions list (`#completedMissionsList`)
  - Quick missions (`#missionsBd`): Daily Check-In, Hidden Nugget, First Game Played
- **Teacher:** **teacher.html** has Create Mission (title, description, reward, submission type, audience, site-eligible, featured), Your Missions list (`#teacherMissionsEl`), and mission submissions in the **unified approvals** area. Dashboard returns `teacherMissions` and `missionSubmissions` via the runner.
- **Worker:** **lantern-worker/index.js** has **no** `/api/missions` routes. Only: `/api/avatar`, `/api/economy`, `/api/news`, `/api/approvals`, `/api/recognition`. Mission approval is entirely client-side.

The **correct strategy** is to **preserve** the current frontend flow and, if needed later, add a **minimal** backend path that **mirrors** the current model. Do **not** redesign Missions from scratch.

---

## Instructions for Future Implementation

When working on Missions (or anything that touches missions), follow these rules.

### 1. Read the real codebase first

- Open and read the relevant parts of:
  - `apps/lantern-app/js/lantern-api.js` (mission and submission functions, runner exports)
  - `apps/lantern-app/js/lantern-data.js` (LS_KEYS, any mission-related defaults)
  - `apps/lantern-app/index.html` (My Missions section, `renderMyMissions`, `callGetActiveTeacherMissionsForCharacter`, `callGetMissionSubmissionsForCharacter`, mission submit modal)
  - `apps/lantern-app/teacher.html` (Create Mission form, dashboard, mission submission approval UI)
- Use `.cursor/phase1-missions-audit.md` as the authoritative summary of structure, data flow, and insertion points.
- Do **not** assume architecture. Verify against the files above.

### 2. Preserve the current mission UX and FERPA rules

- **Students** must only see:
  - Missions visible to them (`getActiveTeacherMissionsForCharacter`: audience + optional `target_character_names`).
  - Their own submissions (`getMissionSubmissionsForCharacter`).
- **Teachers** must only see:
  - Missions they own (`getTeacherMissionsForTeacher`).
  - Submissions for those missions only (`getMissionSubmissionsForTeacher(teacherId)`).
- Mission submissions are **teacher_only** visibility; no automatic public/community exposure. Do not add a global browse-all-student-submissions view.
- Keep the existing My Missions section structure (featured, active, completed, quick missions) and the existing Teacher Create Mission + approvals flow. Do not remove or replace them without an explicit product decision.

### 3. Avoid LMS complexity

- Do **not** add: due dates, grades, rubrics, late penalties, threaded comments, peer review, assignment analytics, standards alignment, gradebook sync, multi-stage assignment workflows, assignment dependencies, or complex teacher configuration panels.
- Lantern is a student identity hub, creativity platform, and recognition system—**not** a gradebook or LMS. Keep Missions as **invitations**, not requirements.

### 4. Build incrementally from the current localStorage mission system

- Treat the current **localStorage + lantern-api.js** implementation as the **base**. Any new feature (e.g. optional mission type/category, Selected Students UI) must **extend** this base, not replace it.
- Reuse existing functions: `getActiveTeacherMissionsForCharacter`, `getMissionSubmissionsForCharacter`, `createTeacherMission`, `submitMissionCompletion`, `approveMissionSubmission`, `rejectMissionSubmission`, `returnMissionSubmissionForImprovements`, `resubmitMissionSubmission`, etc.
- Do not introduce a second, parallel mission system.

### 5. Prefer minimal changes

- Prefer the smallest readable change that achieves the goal.
- Do not refactor working mission code unless necessary for a concrete requirement.
- Do not change the existing mission or submission **model** (fields, statuses) unless there is a clear product need; if you do, keep the same FERPA and visibility semantics.

### 6. Worker + D1 mission persistence is a later, optional phase

- **Do not** add Worker or D1 mission support unless the task explicitly asks for **backend persistence** or **hardening** of missions.
- When that phase is requested:
  - Add a **single** route group (e.g. `/api/missions`) with minimal endpoints that mirror the current JS model (list missions for character, create mission, list submissions for character/teacher, submit, approve, reject, return).
  - Add D1 tables (e.g. `lantern_missions`, `lantern_mission_submissions`) with columns that match the current mission and submission fields; no extra LMS-style columns.
  - Add a **thin** fetch-based path in the frontend (e.g. when `window.LANTERN_AVATAR_API` is set) that calls these endpoints; keep the same UI and the same FERPA filtering (by character for students, by teacher for teachers). Prefer **fallback**: use Worker when available, otherwise keep using the runner/localStorage.

### 7. Keep teacher routing and student visibility rules intact

- Submissions must continue to route to the **mission owner** (created_by_teacher_id). Teachers see only submissions for missions they own.
- Student visibility must continue to respect **audience** (my_students, selected_students, school_mission) and optional **target_character_names**. Do not relax these rules when adding features or a backend.

### 8. Avoid architectural drift

- Preserve the current **frontend + Worker + D1 + R2** structure. Do not redesign the Worker or introduce new architectural layers for missions unless required.
- If you add Worker/D1 missions, keep the same **runner** pattern as an option (e.g. static deploy or no-Worker mode). Do not remove or bypass the runner-based mission flow without an explicit requirement.

---

## Quick Reference (from Phase 1 audit)

| What | Where |
|------|--------|
| Mission/submission LS keys | `lantern-data.js`: TEACHER_MISSIONS, MISSION_SUBMISSIONS |
| Mission API & runner | `lantern-api.js`: getTeacherMissions, getActiveTeacherMissionsForCharacter, createTeacherMission, submitMissionCompletion, getMissionSubmissionsForCharacter, getMissionSubmissionsForTeacher, approve/reject/return/resubmit |
| Student My Missions UI | `index.html`: #myMissionsSection, #featuredMissionCard, #activeMissionsList, #completedMissionsList, #missionsBd; renderMyMissions() |
| Teacher mission UI | `teacher.html`: Create Mission card, #teacherMissionsEl, mission rows in unified approvals; callCreateTeacherMission, callApproveMissionSubmission, etc. |
| Worker | `lantern-worker/index.js`: no /api/missions; only avatar, economy, news, approvals, recognition |

---

When in doubt, re-read the Phase 1 audit and lantern-rules.md, then make the smallest change that preserves current behavior and FERPA.
