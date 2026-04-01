# TMS Lantern — Project Plan

## Vision

Lantern is a school culture platform combining:

- Student publishing
- Recognition
- Avatars
- Engagement
- Display boards
- Positive reinforcement

Comparable tools: ClassDojo, PBIS systems.

Lantern expands student voice and culture building beyond typical behavior-tracking tools.

---

## Current System Summary

- **Lantern** is a school culture platform for middle school use.
- It connects **student creations, missions, recognition, games, school display, and moderated publishing**.
- It is **FERPA-safe** through fictional character identities (no real PII in the student-facing layer).
- It is **teacher moderated**: news, avatars, and mission submissions require teacher approval before public visibility.
- It must remain **DEAD SIMPLE**: no LMS complexity, no overbuilt auth, teacher workflows under 5 seconds.
- **Students react with emoji only**; students do not comment on each other’s posts.
- **Only teachers** can type comments on student posts (e.g. recognition, approval feedback).
- **Games** cost nuggets but do not award nuggets.
- Lantern is intended to connect later to **MTSS / Nuggets** ecosystem.

---

## Architecture (Live)

| Layer | Technology | Live URL / location |
|-------|------------|----------------------|
| Frontend | Static site (Cloudflare Pages) | `https://<project>.pages.dev` (see `docs/PAGES_DEPLOY.md`) |
| Backend | Cloudflare Worker | https://lantern-api.mrradle.workers.dev |
| Database | D1 | lantern-db (Worker binding) |
| Media | R2 | Avatars, news media |

Worker is the single API layer. When API mode is enabled, Worker + D1 is the source of truth for moderation and persistence.

---

## Current Phase

**MISSION FLOW VERIFICATION / DEMO HARDENING + CLASS ACCESS**

The project has moved through missions, news, approvals, recognition, persistence, and **class access**. The codebase supports a full teacher → student → approval loop with durable storage and a **teacher-controlled class access gate** (board code during school hours). The current focus is **class access UX refinement**, **stability, and repeatable demos** — then the ordered phase plan below.

### Explore Page (Current UI Status)

The Explore page has been through **UI-only stabilization** (no backend or API changes):

- **Responsive header:** Lantern menu (dropdown), centered search (wider on desktop), bell, avatar with dropdown (Profile, My Missions, My Posts, Settings, Logout).
- **Help Mode** is demoted responsively to a second row on tablet and below (compact pill on desktop; moves below header with border on smaller widths).
- **Phone:** Search collapses to an icon; expands on tap/focus; bell hidden on very narrow screens.
- **Filter chips:** Single row, horizontally scrollable (no wrap); smaller pill chips; category filtering unchanged.
- **Top-of-page spacing:** Tighter, balanced spacing between ticker, header, chip row, and first content section (Spotlight); subtle separator under chips for visual cohesion.

This work was **UI-only** — no backend, Worker, API, routes, missions, news, teacher logic, search logic, or chip filtering logic was changed.

### Phase Completion: Explore UI Stabilization

**Status:** Substantially complete.

- Responsive Explore header implemented (wide center search on desktop; Help demoted on tablet/phone; phone search icon expand/collapse; bell hidden only on very narrow).
- Filter chip row fixed: single row, horizontal scroll, no wrap.
- Top-of-page spacing polished (ticker → header → chips → Spotlight).
- Mobile behavior defined and stable.

### Current Priorities

1. **Moderation correctness** — Teacher sees accurate pending queues; single source of truth for moderation views.
2. **Single source of truth for teacher moderation views** — No split between localStorage and Worker for pending news/missions when API is enabled.
3. **Persistence across days/devices** — Missions, submissions, news, avatars, and economy durable in Worker + D1.
4. **No cross-user data leakage** — FERPA-safe; teachers only see their scope; students only see their own data where appropriate.
5. **Teacher workflow under 5 seconds** — Quick create, review, approve/reject/return without friction.
6. **50+ user classroom stability** — Reliable under real classroom load.
7. **Repeatable demo flow** — Teacher creates mission → student sees and submits → teacher reviews → approved work can support recognition/community.

---

## CURRENT PRODUCT STATE

What already exists in the repo:

- **Missions** — Teacher-created missions (title, description, reward, submission type, audience, featured, active). Stored in D1 when API is set; localStorage fallback for dev/demo without API.
- **Mission submissions** — Students submit completions; teacher approves, rejects, or returns for improvements. Stored in D1 when API is set; teacher dashboard shows pending submissions from Worker.
- **News pipeline** — Student (or author) news articles with image upload; R2 + D1; moderation via shared approvals queue; approved content on display and explore.
- **Moderation approvals** — Shared queue (news, avatar) in D1; teacher dashboard unified view; approve / reject / return / take.
- **Avatars** — Upload, approve, reject; R2 + D1; profile and display show approved avatar.
- **Recognition** — Teacher-authored positive recognition (no approval queue); D1; display and profile.
- **Profile system** — Adopted character, avatar, balance, missions, posts, thanks, grade reflections, achievements, activity.
- **Nuggets economy** — Per-character balance and transactions in D1; used by store, games, mission rewards.
- **Store / themes** — Redeem nuggets for cosmetics; catalog; themes/frames.
- **Helper app** — FERPA-safe helper utilities (separate from main lantern-app).
- **Class access** — Teacher-controlled access gate: lock window (e.g. Colorado Mon–Thu 8am–4pm), teacher-generated board code, student join via code, temporary token; live and simulation/demo modes; D1 class_access_sessions, class_access_tokens; Worker `/api/class-access/*`. Gated pages: index, explore, missions, news, games, store.
- **Worker APIs** — Lantern Worker (`lantern-worker/`): avatar, economy, news, approvals, recognition, reactions, **missions** (create, list, submit, approve, reject, return, resubmit), **class-access** (session start/end/status, join, validate, state).
- **D1 persistence** — lantern_avatar_submissions, lantern_avatar_profiles, lantern_wallets, lantern_transactions, lantern_news_submissions, lantern_approvals, lantern_teacher_recognition, lantern_reactions, **lantern_missions**, **lantern_mission_submissions**, **class_access_sessions**, **class_access_tokens**, lantern_verify_state.

---

## Current Access-Control Direction

- A **class-access system** exists and is being hardened.
- During school-use windows, the app can be **locked by default**; teachers generate a **class code** for board/projector use; students enter the code for **temporary access**.
- There is a **live mode** and a **simulation/demo mode** (with banner and safe return to live).
- **Projector-friendly class code display** is a next priority (teacher/Promethean/projector use).
- This is **not a full auth system** — it is a **teacher-controlled access gate** for the classroom.

---

## Current Known / Recent Work

- **Mission image submission** wiring and **teacher mission activation/deactivation** debugging were recent focus areas.
- **Class access system** was recently added (lock window, teacher code, student join, simulation).
- **Simulation/demo banner** exists and is being hardened (Return to Live, confirm simulation).
- **Canonical avatar propagation** remains an active integration concern on some surfaces.
- **Explore ticker avatars** still need attention.
- **Polls** remain a planned feature.
- **School Announcements** is a planned News format.
- **Demo scores** are a planned game/demo feature.
- **Mission “Deactivate but save for later reuse”** is a planned teacher workflow improvement.

---

## Next Development Plan (Ordered Priority Roadmap)

Use this sequence for build order. Do not jump phases unless blocked.

### Phase 1 — Class Access UX / Entry Fixes

1. Add projector-friendly “Show Class Code” card for teacher/Promethean/projector use.
2. Fix generated class code visibility after teacher creates code.
3. Refine teacher class code UX/status/expiration display.

### Phase 2 — Teacher Workflow

4. Default “Act as Teacher” to Teacher A with one-click switch to B.
5. Allow missions to deactivate but remain saved for later reuse.

### Phase 3 — Explore / Nav Polish

6. Fix Explore ticker avatars.
7. Add Polls entry to Explore nav bar.
8. Clarify or implement golden bell nav/search-area behavior.

### Phase 4 — Interaction Features

9. Implement Polls feature.
10. Add School Announcements as a News submission format.

### Phase 5 — Game / Demo Support

11. Add demo scores option for games.

### Phase 6 — Mission Expansion

12. Continue expanding mission features/types carefully without violating DEAD SIMPLE.

---

## Guardrails (Product Rules)

- **FERPA-safe fictional identity system** stays intact; no real PII in student-facing layer.
- **No student-to-student typed comments** — students react with emoji only; only teachers type comments on student posts.
- **Teacher moderation** remains central for news, avatars, missions, and approvals.
- **DEAD SIMPLE** always wins over overbuilt feature design; teacher workflows under 5 seconds.
- **Reuse and extend** existing systems rather than creating parallel ones.
- **Access control** is a classroom gate (class code, lock window), not a full authentication platform.

---

## Known Working Architecture

- **Frontend:** Static pages in `apps/lantern-app/` (HTML/JS/CSS). Explore UI work (header, chips, spacing) did not change backend architecture.
- **Backend:** Cloudflare Worker (`lantern-worker/`).
- **Storage:** D1 database; R2 buckets for media (avatars, news).
- Explore header and top-of-page polish were UI-only; no Worker, API, or D1 changes.

---

## Current Re-entry Point

**Where to resume development now:** The immediate next build focus is **Phase 1 — Class Access UX / Entry Fixes**. Prioritize projector-friendly class code display (e.g. a dedicated “Show Class Code” card for teacher/Promethean/projector use), fixing generated class code visibility after the teacher creates a session, and refining the teacher class code UX (status and expiration). Keep **FERPA** and **DEAD SIMPLE** in mind: no new auth systems, no student-facing controls for simulation, and no overbuilding of the access gate. Open `docs/lantern-development-phases.md` and `PROJECT_PLAN.md` for the full ordered phase plan and guardrails.

---

## Open Questions / Follow-up Items

- **Golden bell** — What should the golden bell do (search, notifications, both)? Clarify or implement behavior.
- **store.html** — Should the store eventually be gated by class access (or same lock window)?
- **Polls v1** — How far should Polls go in v1 (e.g. single question per poll, teacher-created only)?
- **School Announcements** — Teacher-only posts, or moderated student submissions?
- **Demo scores** — How should demo scores be labeled to avoid confusion with real game scores?

---

## Deferred (Not in Current Scope)

- **LMS expansion** — No full learning management system; no gradebook sync, no complex assignment workflows.
- **Complex grading** — No rubrics, points, or formal grading system.
- **Additional social features** — No threaded comments, no student-to-student public text commenting beyond existing reactions (icons only).
- **Cosmetic-only UI work** — Polish deferred until demo hardening is complete.
- **Major store expansion** — Store exists; large catalog or new purchase flows deferred.

---

## Sandbox App Purpose

`sandbox-app` is used for experiments and prototype features. Successful experiments may later be moved into `lantern-app`.

---

## Development Principles

- Follow **DEAD SIMPLE** rule: no generic CMS, no complex media frameworks, minimal tables and flows.
- Follow **FERPA safety** rule: never expose sensitive data; moderation queues scoped appropriately.
- Prefer small, safe changes.
- Protect moderation workflows and existing systems (avatars, nugget economy, missions).
- For historical phase order (Safety, Explore, Activity, Writing, Missions, News, Nugget Hunt, etc.), see `apps/lantern-app/docs/BUILD-PLAN-REVISED.md`.
