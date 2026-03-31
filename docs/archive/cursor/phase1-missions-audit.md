# Phase 1: Missions — Codebase Audit & Insertion Points

**Read and followed:** `.cursor/lantern-rules.md`.  
**Note:** `.cursor/missions-master.prompt.md` currently contains only the placeholder; no full Missions master prompt text was available.

---

## 1. Current Repo Structure (High Level)

| Layer | Location | Role |
|-------|----------|------|
| **Frontend app** | `apps/lantern-app/` | Static HTML/JS/CSS. Multi-page: index.html (Profile), teacher.html, explore.html, news.html, games.html, locker.html, store.html, display.html, thanks.html, grades.html, staff.html. |
| **Shared JS** | `apps/lantern-app/js/` | lantern-data.js (defaults, LS keys, ensure*), lantern-api.js (mock API + runner), lantern-nav.js, lantern-help.js, lantern-broadcast.js, writing-guard.js, sfx.js. |
| **Worker** | `lantern-worker/index.js` | Cloudflare Worker. Routes: `/api/avatar`, `/api/economy`, `/api/news`, `/api/approvals`, `/api/recognition`. **No `/api/missions`.** Uses D1 (DB) and R2 where applicable. |
| **Data source for missions** | Client only | Missions and mission submissions live in **localStorage** via `lantern-api.js` (keys `LANTERN_TEACHER_MISSIONS`, `LANTERN_MISSION_SUBMISSIONS`). The app uses a **runner** pattern: `createRun()` from `LANTERN_API` (exposed by lantern-api.js) invokes the same in-memory/localStorage API. When no external backend is wired, missions still work client-side. |

---

## 2. Current Missions-Related Structure

### 2.1 Data (lantern-data.js)

- **LS keys:** `TEACHER_MISSIONS`, `MISSION_SUBMISSIONS`, `MISSIONS_PROGRESS` (system missions: daily check-in, hidden nugget, first game).
- **Seed:** Default teacher missions can be ensured elsewhere (lantern-api.js or data); seed entries include `audience: 'school_mission'`, `featured`, `site_eligible`.

### 2.2 API (lantern-api.js)

- **Mission model (teacher-created):**  
  `id`, `title`, `description`, `reward_amount`, `submission_type` (text|link|image_url|confirmation), `created_by_teacher_id`, `created_by_teacher_name`, `active`, `created_at`, `audience` (my_students|selected_students|school_mission), `target_character_names` (optional), `featured`, `site_eligible`. No due_date in logic.
- **Submission model:**  
  `id`, `mission_id`, `character_name`, `submission_type`, `submission_content`, `status` (pending|returned|accepted|rejected), `moderation_status`, `visibility: 'teacher_only'`, timestamps, `returned_reason`, `accepted_by`, etc.
- **Key functions:**  
  `getTeacherMissions()`, `getActiveTeacherMissions()`, `getActiveTeacherMissionsForCharacter(characterName)` (filters by audience; sorts by featured then created_at), `getTeacherMissionsForTeacher(teacherId)`, `createTeacherMission(opts)`, `updateTeacherMission(id, updates)`, `getMissionSubmissions()`, `submitMissionCompletion(...)`, `getMissionSubmissionsForTeacher(teacherId)`, `getMissionSubmissionsForCharacter(characterName)`, `approveMissionSubmission`, `rejectMissionSubmission`, `returnMissionSubmissionForImprovements`, `resubmitMissionSubmission`.
- **Runner:** All of the above are exposed via the runner used by `createRun()` (e.g. `getActiveTeacherMissionsForCharacter`, `createTeacherMission`, etc.). No fetch to Worker for missions.

### 2.3 Profile (index.html) — Student view

- **Section:** One **“My Missions”** section (`#myMissionsSection`).
- **Contents:**  
  - **Featured mission card** (`#featuredMissionCard`): one large card (title, prompt, reward, teacher, Start/Continue or status).  
  - **Active missions** (`#activeMissionsList`): list of missions that are not accepted/rejected, excluding the featured one.  
  - **Completed missions** (`#completedMissionsList`): list of missions with accepted/rejected submissions.  
  - **Quick missions** (`#missionsBd`): system missions (Daily Check-In, Hidden Nugget, First Game Played).
- **Data flow:**  
  `callGetActiveTeacherMissionsForCharacter(adopted.name)` → then `callGetMissionSubmissionsForCharacter(adopted.name)` → `renderMyMissions(missions, subs)`.  
  Featured = first mission from the (already sorted) list; no separate “pinned” API.
- **Submit flow:** Modal `#missionSubmitOverlay`; `callSubmitMissionCompletion` / `callResubmitMissionSubmission` via runner.

### 2.4 Teacher (teacher.html)

- **Create Mission card:** Title, Description, Reward, Submission type, **Audience** (My Students / School Mission / Selected Students), **Highlight-worthy / site-eligible** checkbox, **Pin as featured mission** checkbox. Submits via `callCreateTeacherMission` with `audience`, `site_eligible`, `featured`.
- **Your Missions:** List from dashboard data (`teacherMissions`), rendered in `#teacherMissionsEl`; toggle active/inactive via `callUpdateTeacherMission`.
- **Mission submissions:** Shown in unified approvals (when using dashboard) and in dedicated mission-submission rows; Approve / Reject / Return for improvements via `callApproveMissionSubmission`, `callRejectMissionSubmission`, `callReturnMissionSubmissionForImprovements`.
- **Dashboard:** `callDashboard()` → `teacherDashboardData()` (runner) returns `teacherMissions`, `missionSubmissions` (and other queues). When `createRun` is missing, dashboard can fail; missions then rely on same runner from lantern-api.js in static deploy.

### 2.5 Worker (lantern-worker/index.js)

- **No mission routes.** Only: avatar, economy, news, approvals, recognition.  
- **Approvals:** `item_type` in `lantern_approvals` is `news` or `avatar`; no `mission` type. Mission approval is entirely client-side (lantern-api.js).

---

## 3. FERPA / Visibility Alignment (Current)

- **Students:** See only missions visible to them via `getActiveTeacherMissionsForCharacter` (audience + optional `target_character_names`). See only their own submissions via `getMissionSubmissionsForCharacter`. No browse-all-submissions view.
- **Teachers:** See missions they own (`getTeacherMissionsForTeacher`) and submissions for those missions only (`getMissionSubmissionsForTeacher(teacherId)`). Submissions are scoped by mission ownership.
- **Public/community:** Mission submissions are stored with `visibility: 'teacher_only'`; no automatic public exposure. Any future “approved work → Explore/News” would need an explicit step (not present for missions yet).

---

## 4. Best Insertion Points for Missions (No Code Yet)

### 4.1 Keep as-is (no change)

- **Profile “My Missions”** section and **Teacher Create Mission + Your Missions + mission submissions in approvals** are already the main insertion points. Data and API support audience, featured, site_eligible, and teacher-owned submission routing.

### 4.2 If Missions are moved to Worker/D1 later (minimal backend)

- **Worker:** Add a single route group, e.g. `/api/missions`, with minimal endpoints such as:  
  - `GET /api/missions?character_name=...` (list visible missions),  
  - `POST /api/missions` (create mission; body: title, description, reward_amount, submission_type, audience, featured, site_eligible, created_by_teacher_id/name),  
  - `GET /api/missions/submissions?character_name=...` (student’s submissions),  
  - `GET /api/missions/submissions?teacher_id=...` (teacher’s pending submissions),  
  - `POST /api/missions/submit`, `POST /api/missions/submissions/:id/approve`, `reject`, `return`.  
- **D1:** Add tables only for missions and mission_submissions (e.g. `lantern_missions`, `lantern_mission_submissions`) with columns mirroring current JS model; no extra LMS fields.
- **Frontend:** Add a thin fetch-based path in index.html and teacher.html (e.g. when `window.LANTERN_AVATAR_API` is set) that calls these endpoints and merges with or replaces the runner-based flow, while keeping the same UI and same FERPA rules (filter by character for students, by teacher for teachers).

### 4.3 Optional UI/UX only (no backend change)

- **Teacher Create Mission:** “Selected Students” audience is not yet wired to a character multi-select; insertion point: add a multi-select (or tag input) bound to `target_character_names` when audience is `selected_students`.
- **Profile:** Optional “mission type” or category label (e.g. Writing, Reflection) can be added as a display-only field on the mission card if the model gains an optional `mission_type` later; no change to Worker required.

### 4.4 What not to add (per lantern-rules.md)

- No due dates, grades, rubrics, late penalties, threaded comments, peer review, assignment analytics, gradebook sync, multi-stage workflows, or complex teacher configuration. No new “browse all student submissions” view.

---

## 5. Summary Table

| Area | Current state | Best insertion point for “Missions” evolution |
|------|----------------|-----------------------------------------------|
| **Data** | localStorage via lantern-api.js; LS_KEYS TEACHER_MISSIONS, MISSION_SUBMISSIONS | Keep; optional future: D1 tables + Worker `/api/missions` with same model. |
| **Student profile** | Single “My Missions” section: featured card + active + completed + quick missions | Already the main surface; extend only with optional display fields (e.g. type/category). |
| **Teacher** | Create Mission (with audience, site_eligible, featured), Your Missions list, mission submissions in approvals | Already the main surface; optional: Selected Students multi-select. |
| **Worker** | No missions | If persisting missions: add `/api/missions` and D1 only; preserve FERPA (filter by character/teacher). |
| **Runner (createRun)** | All mission APIs exposed and used by index/teacher | Keep; optional: add fetch fallback when Worker missions exist. |

---

**Phase 1 complete.** No code changes made. Ready for Phase 2 when the full Missions master prompt is available or when you specify the next step.
