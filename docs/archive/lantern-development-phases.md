# Lantern — Development Phases

**This document is the authoritative reference for the current development phase and sequence.**

---

## Current development phase

Lantern is in **post–class-access hardening**: mission flow verification and demo hardening remain in scope, and **class access UX** is the immediate next focus.

**Current phase label:** **MISSION FLOW VERIFICATION / DEMO HARDENING + CLASS ACCESS UX**

**Goal:** Harden class access entry UX (projector-friendly code, visibility, teacher usability), then continue stability, correctness, and repeatable demos.

### Goals

- Class access UX: projector-friendly code display, generated code visibility, teacher code status/expiration
- Single source of truth enforcement (Worker + D1)
- Moderation correctness
- Persistence across devices
- FERPA-safe data handling
- Repeatable classroom demo flow
- Stability with 50+ simultaneous users

---

## Important development rule

**During Demo Hardening Phase, do NOT add:**

- New social systems
- Chat or messaging
- New economies
- New identity systems
- Authentication systems
- LMS integrations

**Only stabilize existing systems.**

---

## Phases completed

### Explore UI stabilization / header polish (substantially complete)

- **Explore page:** Responsive header (Lantern menu, centered search, bell, avatar); Help Mode demoted to second row on tablet and below; expandable search on phone; bell hidden on very narrow screens.
- **Filter chips:** Single row, horizontally scrollable; no wrap; smaller pill chips.
- **Spacing:** Polished top-of-page rhythm (ticker → header → chips → Spotlight); no backend or API changes.

### Phase 1 — Dashboard single source of truth enforcement

- Removed use of localStorage as the source of moderation data when API mode is enabled.
- Dashboard payload in API mode uses Worker-backed data only (e.g. `buildPayload(..., workerOnly: true)`).

### Phase 2 — Mission moderation FERPA enforcement

- `teacher_id` is passed with mission moderation actions (approve, reject, return).
- Worker enforces ownership checks; returns 403 when a teacher attempts to moderate another teacher’s mission submission.

### Phase 3 — Cloud-backed verify simulation system

- Verify state stored in Worker + D1 (`lantern_verify_state`).
- Endpoints: `/api/verify/config`, `/api/verify/state` (GET/PUT), `/api/verify/reset`.
- Cross-device demo identity supported.

### Phase 4 — Verify-mode cloud-native cleanup

- Teacher and student pages no longer rely on localStorage for verify identity when API mode is enabled.
- Identity resolved from URL param → cloud state → fallback; held in memory for the session.
- No reload required when loading identity from cloud.

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

## Current Re-entry Point

**Where to resume development now:** Start with **Phase 1 — Class Access UX / Entry Fixes**. Focus on projector-friendly class code display (e.g. “Show Class Code” card), fixing generated code visibility after the teacher creates a session, and refining teacher class code status/expiration UX. Keep FERPA and DEAD SIMPLE in mind. See `PROJECT_PLAN.md` for full plan and guardrails.

---

## Guardrails (Product Rules)

- **FERPA-safe fictional identity** stays intact; no real PII in student-facing layer.
- **No student-to-student typed comments** — emoji reactions only; only teachers type comments on student posts.
- **Teacher moderation** remains central for news, avatars, missions, approvals.
- **DEAD SIMPLE** wins over overbuilt design; teacher workflows under 5 seconds.
- **Reuse and extend** existing systems; avoid parallel or duplicate systems.
- **Access control** is a classroom gate (class code, lock window), not a full auth platform.

---

## Open Questions / Follow-up Items

- **Golden bell** — What should it do (search, notifications, both)? Clarify or implement.
- **store.html** — Already gated by class access; confirm behavior and scope.
- **Polls v1** — How far should Polls go in v1 (e.g. single question, teacher-created only)?
- **School Announcements** — Teacher-only or moderated student submissions?
- **Demo scores** — How to label so they are not confused with real game scores?

---

## Reference rules (summary)

- **Architecture:** When API is on, Worker + D1 is the single source of truth; no moderation data from localStorage. See [lantern-architecture.md](lantern-architecture.md).
- **Verify:** Simulation only; cloud-backed state; no real auth. See [lantern-verify-system.md](lantern-verify-system.md).
- **Dead simple:** Teacher workflows &lt; 5 seconds; no LMS complexity; no cross-user leakage.
- **FERPA:** No cross-teacher moderation; no cross-student private data; Worker enforces ownership.
