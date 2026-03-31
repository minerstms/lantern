# Lantern — Active build plan (authoritative)

Ordered roadmap and **current re-entry point**. For architecture and rules, see **`docs/LANTERN_SYSTEM_CONTEXT.md`**. For locked history bits, see **`docs/CHANGELOG_LOCKED.md`**.

---

## Vision (one paragraph)

Lantern is a **school culture** surface: student publishing, missions, recognition, games, moderated news, avatars/nuggets/store, and display — **FERPA-safe** fictional characters, **teacher-moderated**, **DEAD SIMPLE** (no LMS-style auth/product complexity in the student layer). Comparable intent: ClassDojo / PBIS-style culture, with stronger student voice.

---

## Current phase label

**MISSION FLOW VERIFICATION / DEMO HARDENING + CLASS ACCESS UX**

Focus: class-access UX (projector-friendly code, visibility, teacher clarity), moderation correctness, persistence, repeatable demos, stability at classroom scale.

**Tonight / beta stress data (optional ops):** See **`docs/PHASE-CONTENT-RESEED-BETA.md`** — seed **`seedDemoWorld`** in **`lantern-data.js`** for scroll/overflow stress testing; not a roadmap phase change.

### During this phase — do **not** add

- New social systems, chat/messaging, authentication platforms, LMS integrations, new economies, or new identity systems. **Stabilize existing systems.**

---

## Product / IA note (vs older docs)

Older plans refer to **“Explore”** as the main discovery page. **Current product language:** **Lantern** = home feed; the **file/route** may still be **`explore.html`**. Polls and missions integration have evolved — treat **Lantern home** + **tabs (All / News / Missions)** as the student-facing feed shell unless a task says otherwise.

---

## What already exists (summary)

- Missions (D1 + Worker), submissions, approve/return/reject; image/link/video/text paths.
- News pipeline (R2 + D1), shared approvals queue, **News desk** (`news.html`) for submit/resubmit/My Articles.
- Avatars, nuggets, store, recognition, reactions, games/leaderboards, polls (Worker + UI on Lantern home).
- Class access gate (session/code/token, Worker `/api/class-access/*`, gated pages).
- Verify simulation (D1 `lantern_verify_state`, Worker verify endpoints).

Details and table names: **`docs/archive/PROJECT_PLAN.md`** and **`docs/LANTERN_SYSTEM_CONTEXT.md`** §14–15.

---

## Ordered priority roadmap

Do not skip ahead unless blocked.

### Phase 1 — Class access UX / entry fixes
1. Projector-friendly **Show Class Code** card (teacher/Promethean).
2. Generated class code **visibility** after teacher creates session.
3. Teacher class code **status / expiration** UX.

### Phase 2 — Teacher workflow
4. Default **Act as Teacher** to Teacher A with one-click switch to B.
5. Missions: **deactivate** but keep saved for later reuse.

### Phase 3 — Lantern home / nav polish
6. Ticker / avatar polish on home feed.
7. Polls entry discoverability (if not already satisfied by current nav).
8. **Golden bell** behavior: clarify or implement (notifications vs placeholder).

### Phase 4 — Interaction features
9. Polls feature completeness (if any gaps vs product intent).
10. **School announcements** as a news format (if not already covered).

### Phase 5 — Game / demo support
11. Demo scores option for games (clearly labeled vs live scores).

### Phase 6 — Mission expansion
12. Expand mission types/features **carefully** without violating DEAD SIMPLE.

---

## Current priorities (always-on)

1. Moderation correctness; Worker-backed teacher views when API mode is on.
2. No localStorage as truth for moderation when API is enabled.
3. Persistence across devices for missions, news, avatars, economy.
4. No cross-user data leakage; FERPA-safe boundaries.
5. Teacher workflow under ~5 seconds where possible.
6. 50+ concurrent users stability.
7. Repeatable demo: teacher creates mission → student submits → teacher reviews → approved work visible.

---

## Current re-entry point

**Start with Phase 1 — Class access UX / entry fixes.** Keep **DEAD SIMPLE** and **FERPA**; no new auth systems; don’t overbuild the gate.

---

## Guardrails (product)

- Fictional identity; no real PII in student-facing layer.
- No student-to-student typed comments; emoji reactions; teachers type feedback.
- Teacher moderation for news, avatars, missions, approvals.
- Reuse/extend existing pipelines — no parallel systems.
- Access control = classroom gate (code + window), not a full auth platform.

---

## Open questions (carry forward)

- Golden bell: notifications vs search vs both?
- `store.html`: same class-access gate as other pages?
- Polls v1 scope (single question, teacher-created only, …)?
- School announcements: teacher-only vs moderated student?
- Demo scores: labeling to avoid confusion with real leaderboards?

---

## Archived detail

Longer phase history, Explore UI stabilization notes, and duplicate roadmap text: **`docs/archive/lantern-development-phases.md`**, **`docs/archive/PROJECT_PLAN.md`**, and phase plan files under **`docs/archive/apps-lantern-app-docs/`**.
