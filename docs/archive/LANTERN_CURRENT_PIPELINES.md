# LANTERN CURRENT PIPELINES

## Purpose

This file exists to protect the current live data flows while UI and product iteration continue. Future cleanup or refactors should not break core Lantern behavior. Use it as the single source of truth for what pipelines actually exist and how they work today.

## Active Architecture

- **Frontend:** `apps/lantern-app/` — static HTML/JS/CSS. Main pages: index.html (Profile), teacher.html, missions.html, news.html, explore.html, display.html, thanks.html, grades.html, staff.html, store.html, games.html, locker.html. Gated by class access when lock window is active: index, explore, missions, news, games, store (teacher or student with valid token). Scripts: `js/lantern-api.js` (runner + fetch to Worker when `LANTERN_AVATAR_API` is set), `js/lantern-data.js`, `js/lantern-nav.js`, `js/lantern-help.js`, `js/lantern-broadcast.js`, `js/writing-guard.js`.
- **Lantern backend:** `lantern-worker/index.js` — Cloudflare Worker. Routes: `/api/avatar`, `/api/economy`, `/api/news`, `/api/approvals`, `/api/recognition`, `/api/reactions`, **`/api/missions`** (missions and mission submissions CRUD, approve/reject/return/resubmit), **`/api/class-access/*`** (session start/end/status, join, validate, state); **`/api/verify/*`** (config, state, reset for simulation).
- **D1:** Single database (lantern-db per wrangler.toml). Tables: `lantern_avatar_submissions`, `lantern_avatar_profiles`, `lantern_wallets`, `lantern_transactions`, `lantern_news_submissions`, `lantern_approvals`, `lantern_teacher_recognition`, `lantern_reactions`, **`lantern_missions`**, **`lantern_mission_submissions`**, **`class_access_sessions`**, **`class_access_tokens`**, **`lantern_verify_state`**. Used for avatars, economy, news, approvals, recognition, reactions, missions, class access, and verify simulation.
- **R2:** Two buckets: `AVATAR_BUCKET` (lantern-avatars), `NEWS_BUCKET` (lantern-media). Avatar images and news article images stored by key; metadata in D1.
- **Fallback / local mode:** When `window.LANTERN_AVATAR_API` is not set, the app uses the in-memory/localStorage “runner” in `lantern-api.js` only. Missions, posts, profiles, and some economy/avatar logic can run off localStorage; news/avatar approval and shared economy then have no backend. So “local runner” mode is real but partial — no shared persistence for news, avatar, or economy.

## Core Product Loop

Intended loop: **Teacher Mission → Student Contribution → Teacher Approval → Community Visibility.**

The current code implements this:

- **Missions:** Full loop exists in the UI and runner (localStorage): teacher creates missions, student submits, teacher approves/rejects/returns. Mission submissions stay `visibility: 'teacher_only'`; there is no “approved mission work → Explore/News” step in code.
- **News and avatars:** Full loop with Worker: student (or author) submits → entry in D1 + optional R2 → teacher approves via approvals queue → approved news/avatar becomes visible on display, explore, and profile. Recognition is teacher-authored and published immediately (no approval queue).

## Current Pipelines

### Missions (Worker + D1 when API set; localStorage fallback)

- **Purpose:** Teacher-created tasks; students submit; teacher approves/rejects/returns; rewards (nuggets) can be granted.
- **Entry points:** Teacher: teacher.html (Create Mission, Your Missions, Mission submissions card). Student: missions.html, index.html (My Missions), mission submit modal.
- **Storage / source of truth:** When LANTERN_AVATAR_API is set: D1 lantern_missions, lantern_mission_submissions; Worker routes /api/missions/*, /api/missions/submissions/*. When API not set: localStorage (runner) only.
- **Approval step:** Teacher uses Approve / Reject / Return in teacher dashboard; mission submissions loaded from GET /api/missions/submissions/teacher; approve/reject/return/resubmit via Worker. Mission submissions use their own D1 table and routes (not lantern_approvals).
- **Output surfaces:** Profile “My Missions” (featured, active, completed, quick missions). No community-wide display of approved mission work.
- **FERPA boundary:** Students see only missions visible to them (audience + target_character_names) and only their own submissions. Teachers see only their missions and submissions (filtered by teacher_id). All submission visibility is teacher_only.

### Mission submissions (same pipeline as Missions)

- Stored in D1 lantern_mission_submissions when API set; teacher dashboard fetches via Worker; approve/reject/return/resubmit via Worker. localStorage fallback when API not set.

### News submissions

- **Purpose:** Students (or authors) submit news articles; staff/teacher approves; approved articles appear in community feed and display.
- **Entry points:** news.html (create article, upload image, submit). Optionally other pages that call runner’s `createNewsArticle` with API base set.
- **Storage / source of truth:** D1 `lantern_news_submissions`; images in R2 (NEWS_BUCKET or AVATAR_BUCKET). Key written on create; `status`: pending → approved | returned | rejected.
- **Approval step:** On create, a row is inserted into `lantern_approvals` (item_type `news`). Teacher/staff uses teacher.html: either unified approvals queue (Worker: GET `/api/approvals/pending`, POST `/api/approvals/approve` or return/reject) or the “News submissions” section (which when API is set can be fed from dashboard — see Known Split). Approving updates both `lantern_approvals` and `lantern_news_submissions.status`.
- **Output surfaces:** GET `/api/news/approved` → display.html ticker, explore.html “Recently approved” news, index.html news scroller. Only `status = 'approved'` rows are returned.
- **FERPA boundary:** Pending/returned/rejected articles are not exposed publicly. Only approved news is returned by `/api/news/approved`. Author sees own list via `/api/news/mine?author_name=...`.

### Avatar upload / approval

- **Purpose:** Student uploads avatar image; teacher approves; approved image becomes the character’s public avatar.
- **Entry points:** index.html (Profile) — upload from adopted character.
- **Storage / source of truth:** R2 AVATAR_BUCKET (image bytes); D1 `lantern_avatar_submissions` (per submission), `lantern_avatar_profiles` (current_avatar_key per character_name).
- **Approval step:** Upload creates submission (status pending) and optionally a `lantern_approvals` row (item_type `avatar`). Teacher: teacher.html uses `/api/avatar/pending`, `/api/avatar/approve`, `/api/avatar/reject` (or unified approvals queue). On approve, submission is marked approved and `lantern_avatar_profiles` is updated for that character.
- **Output surfaces:** GET `/api/avatar/status?character_name=...`, GET `/api/avatar/image?key=...`. Display, recognition list, and profile show approved avatar.
- **FERPA boundary:** Pending avatars are only in pending queue (teacher view). Public image URL is only for approved key; no listing of other students’ pending uploads to students.

### Economy / nuggets

- **Purpose:** Per-character nugget balance and transactions (earn/spend); used by store, games, missions (rewards).
- **Storage / source of truth:** D1 `lantern_wallets`, `lantern_transactions`. Worker: GET `/api/economy/balance`, POST `/api/economy/transact`.
- **Approval step:** None. Transactions are immediate. Mission rewards may be granted via economy transact when teacher approves a mission submission (client-side flow can call economy API).
- **Output surfaces:** Profile balance, store, games, mission reward display. Balance and history by character_name only.
- **FERPA boundary:** API is keyed by character_name; no endpoint exposes other students’ balances or full ledger. Frontend only requests balance for current adopted character (or teacher-authorized views).

### Approvals queue

- **Purpose:** Single queue for items needing teacher/staff review. Currently only news and avatar.
- **Entry points:** teacher.html when `LANTERN_AVATAR_API` is set (`useApprovalsApi`). Fetches via runner’s `getPendingApprovals` → GET `/api/approvals/pending`. Also GET `/api/approvals/history`; POST approve/return/reject/take.
- **Storage / source of truth:** D1 `lantern_approvals` (item_type, item_id, status, assignee, etc.). Content lives in respective tables (news, avatar).
- **Approval step:** This *is* the approval step for news and avatar; actions update both `lantern_approvals` and the related content table.
- **Output surfaces:** Teacher dashboard unified list and approval history. No student-facing queue.
- **FERPA boundary:** Only staff/teacher sees pending list. Item types are news and avatar only; no private student work beyond what’s already in those pipelines.

### Profile / identity propagation

- **Purpose:** Adopted character name and approved avatar flow to all Lantern surfaces that show “who” the user is.
- **Entry points:** index.html (Profile): adopt character, upload avatar. Identity comes from localStorage (adopted character) + Worker `/api/avatar/status` when API is set.
- **Storage / source of truth:** Adopted character: localStorage. Avatar: D1 `lantern_avatar_profiles` + R2; served via `/api/avatar/status` and `/api/avatar/image`.
- **Output surfaces:** Profile header, display page (character list + avatars), recognition list (avatar_image), explore (when posts show author avatar). No approval for “identity” itself; avatar visibility follows avatar approval.
- **FERPA boundary:** Only display name and approved avatar are shared. No PII beyond what teacher/system already have; no cross-student private data.

### Display / ticker / community surfaces

- **Purpose:** Public or kiosk view: approved news, teacher recognition, and character avatars.
- **Entry points:** display.html (and explore.html for news + feed).
- **Storage / source of truth:** Display fetches GET `/api/news/approved`, GET `/api/recognition/list`, and GET `/api/avatar/status` per character. Explore uses runner’s `getApprovedNews` which, when API is set, calls GET `/api/news/approved`; plus feed/activity from runner.
- **Approval step:** Only approved news and approved avatars appear. Recognition is teacher-created and has no queue.
- **Output surfaces:** display.html (ticker, recognition, avatars); explore.html (news section, feed, activity). index.html news scroller.
- **FERPA boundary:** Only content that has passed approval (news, avatar) or is explicitly teacher-authored (recognition) is shown. No pending or private student work.

### Teacher recognition (no approval queue)

- **Purpose:** Teacher writes a positive recognition message for a character; it appears immediately (no moderation).
- **Entry points:** teacher.html — create recognition. Fetched on display, explore, profile.
- **Storage / source of truth:** D1 `lantern_teacher_recognition`. POST `/api/recognition/create`, GET `/api/recognition/list` (optional ?character_name=).
- **Approval step:** None. Teacher content is published directly.
- **Output surfaces:** display.html, explore (if wired), profile (recognition list for character).
- **FERPA boundary:** Recognition is visible to anyone who can load the list; scope is by design (celebration). No private student data in message.

### Class access (lock window, teacher session, board code, join)

- **Purpose:** Teacher-controlled access gate during school-use windows. When the app is “locked” (e.g. Colorado Mon–Thu 8am–4pm), gated pages require either teacher session or a valid student token obtained by entering the class code.
- **Entry points:** Teacher: start/end session, get class code (e.g. teacher.html or dedicated entry). Student: enter code on gate screen to receive temporary token. Lock window is configurable (e.g. verify config or env).
- **Storage / source of truth:** D1 `class_access_sessions` (teacher session, code, expiry), `class_access_tokens` (student token tied to session). Worker: `/api/class-access/session/start`, `/api/class-access/session/end`, `/api/class-access/session/status`, `/api/class-access/join`, `/api/class-access/validate`, `/api/class-access/state`. Live and simulation/demo modes; verify state in `lantern_verify_state`.
- **Output surfaces:** Gate screen when locked and no valid token; gated pages (index, explore, missions, news, games, store) after valid teacher session or student join. Projector-friendly “Show Class Code” is a Phase 1 UX priority.
- **FERPA boundary:** Class access is a classroom gate only; no full auth, no student accounts. Tokens are temporary and session-scoped.

### Student reactions (icons only, no comments)

- **Purpose:** Students react to approved public content with predefined positive icons (heart, star, lightbulb, teamwork, thumbs up, creative, fire). One reaction per type per item per student; no text input. Optional: creator praise preferences (subset of types shown on their content), early encourager reward, reaction breakdown for creator/teacher, inclusion boost row—all behind feature flags (default off).
- **Entry points:** explore.html (approved news cards), news.html (published news list and featured), index.html Profile Studio (My Praise Buttons). Reaction bar only rendered when Worker API is set. Display page shows praise summaries (e.g. “Praised for Creativity · Teamwork”) instead of raw counts.
- **Storage / source of truth:** D1 `lantern_reactions`; `lantern_early_encourager_rewards` (when flag on); `lantern_praise_preferences` (creator’s chosen reaction types). Worker: POST `/api/reactions/add`, GET counts/mine, GET/POST praise-preferences, GET breakdown (min 5 reactions, creator/teacher only), GET need-encouragement, GET summary, GET feature-flags.
- **Approval step:** None. Reactions are only allowed on content that is already approved (news) or public by design (recognition). Worker validates news item has status=approved before accepting a reaction.
- **Output surfaces:** Reaction buttons and counts on approved news cards on Explore and News; praise summary on Display news spotlight; creator/teacher breakdown and inclusion boost when flags on.
- **FERPA boundary:** Reactions apply only to approved public items. Students never see or react to pending, rejected, or private work. No student-authored text in this pipeline. Breakdown does not reveal who reacted.

## Approval Rules

- **Requires approval before public visibility:** News submissions, avatar uploads. Both go through `lantern_approvals` (or direct avatar approve/reject endpoints). Status must become `approved` before the content is returned by `/api/news/approved` or used as current avatar.
- **Can become public after approval:** Approved news (feed, display, explore); approved avatar (profile, display, recognition list).
- **Stays private / teacher-only:** Mission submissions (visibility teacher_only in model; no public pipeline). Pending or returned news/avatar; rejected avatar/news. Student’s own “mine” views (e.g. `/api/news/mine`) show only that author’s items with status.
- **Who can review:** Staff/teacher in teacher.html. Approval API does not enforce role in code; it is assumed the frontend is used only by authorized staff. Assign/take and filter by staff_id exist for workload.

## Known Split / Legacy Risk Areas

- **Two worker folders:** `worker/` is MTSS (cases, behavior log, D1 for non-Lantern). `lantern-worker/` is Lantern-only (avatar, economy, news, approvals, recognition). Do not mix routes or D1 bindings. Lantern frontend should call only the Lantern Worker URL (`LANTERN_AVATAR_API`).
- **Teacher dashboard news pending vs unified queue:** When `useApprovalsApi` is true, the unified approvals list comes from GET `/api/approvals/pending` (Worker) and shows real pending news and avatar. The “News submissions” section on teacher dashboard is populated from `callDashboard()` → `teacherDashboardData()` in the runner, which returns `newsPending` from `getNewsPending()` — that reads from **localStorage** (getNews()), not from the Worker. So with API set, the single source of truth for pending news is the approvals queue; the dedicated News submissions panel can be out of sync or empty. Prefer unifying on Worker data if both are shown.
- **Missions now have Worker + D1:** Mission and mission-submission state is in D1 when LANTERN_AVATAR_API is set; Worker exposes `/api/missions` and `/api/missions/submissions/*`. Teacher dashboard loads missions and submissions from Worker; teacher_id comes from approvalStaffId. localStorage remains fallback when API is not set.
- **Migrations DB name:** Some migration comments say `mtss-db`, others `lantern-db`. Lantern Worker’s wrangler.toml uses `lantern-db`. Confirm which D1 database is used in production for Lantern tables and run migrations against that.

## Protected Principles

- **FERPA separation:** Students do not see other students’ private submissions. Teachers see only what is routed to them or owned by them. Public/community visibility only after approval.
- **Teacher approval before public visibility:** News and avatar must be approved before they appear on display, explore, or public feed.
- **No unrelated student private work visibility:** No global “browse all student submissions” view. Mission submissions are teacher_only; news/avatar pending is staff-only.
- **Missions stay simple, not LMS-heavy:** No due dates, grades, rubrics, late penalties, gradebook sync, or complex assignment workflows in the current design. Keep it that way unless explicitly decided.
- **One clear source of truth per pipeline:** For news, avatar, and missions, the Worker + D1 (and R2 for media) are the source of truth when LANTERN_AVATAR_API is set. Avoid duplicating truth between localStorage and Worker for the same concept.

## Current Reality Check

### Stable now

- **Worker routes:** Avatar (upload, image, status, pending, approve, reject), economy (balance, transact), news (upload-image, create, resubmit, approved, mine, image), approvals (pending, history, approve, return, reject, take), recognition (create, list), missions (active, teacher, create, update, submit, submissions/teacher, submissions/character, approve, reject, return, resubmit). All implemented and used by the frontend when API is set.
- **D1/R2 usage:** Tables and buckets exist and are used as described above. Approvals and news/avatar status flows are consistent.
- **Display and explore:** Approved news and recognition list load from Worker; display page uses approved news + recognition + avatar status. Explore uses getApprovedNews (Worker when API set) and feed/activity from runner.
- **Explore page UI:** Responsive header (Lantern menu, centered search, bell, avatar); Help demoted to second row on tablet and below; expandable search on phone; single-row horizontally scrollable filter chips; polished spacing (ticker → header → chips → Spotlight). This work was UI-only; no backend, API, or pipeline changes.
- **Architecture:** Frontend: static pages in `apps/lantern-app/`. Backend: Cloudflare Worker. Storage: D1 database; R2 buckets for media. Explore UI work did not change backend architecture.
- **FERPA:** No endpoint returns another student’s private submissions or unapproved content to the public. Approval gates are in place for news and avatar.

### Still in progress / demo hardening focus

- **Missions:** When LANTERN_AVATAR_API is set, missions and mission submissions persist in D1 and are served/modified via Worker (`/api/missions`, `/api/missions/submissions/*`). Mission submission approval is handled by mission-specific routes (approve/reject/return/resubmit), not the unified approvals queue. localStorage remains fallback when API is not set. Remaining work: mission deactivate-but-save, and Phase 1 class access UX (projector code, visibility, teacher UX).
- **Teacher dashboard data consistency:** newsPending in dashboard comes from runner/localStorage while unified approvals come from Worker; the two can diverge when API is set. The “News submissions” UI may not match the real pending news in D1.
- **Explore feed/activity:** Feed and school activity come from the runner (e.g. getExploreFeed, getActivityEvents); when those use localStorage only, they are not shared across devices. Only approved news is shared via Worker.

---

*Document grounded in repo as of creation. Update this file when pipelines or architecture change.*
