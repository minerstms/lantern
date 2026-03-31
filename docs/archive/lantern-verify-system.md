# Lantern — Verify / Simulation System

**This document is the authoritative reference for the verify and simulation system.**

---

## Purpose

The application includes a **cloud-backed simulation system** used for testing and demos. It answers: *“Who are we demoing as?”*

- **verify.html** acts as the development cockpit.
- Verify state is stored in the Worker + D1; it is **not** real authentication.

---

## What verify is not

Verify mode is **simulation only**. There are no:

- User accounts
- Login sessions
- JWT tokens
- Password tables (except one Worker secret for destructive reset)

Identity in verify mode simply represents **“who we are demoing as”** for demos and verification.

---

## Storage and API

### D1 table

- **lantern_verify_state** — single row (e.g. `id = 'default'`) holding:
  - `state_json` — simulated role, teacher_id, character_name, display_name, checklist state, optional build metadata
  - `updated_at`

### Worker endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/verify/config` | GET | Returns build metadata, teachers list, students list, checklist definition (static config). |
| `/api/verify/state` | GET | Returns current verify state (role, teacher_id, character_name, display_name, checklist, build). |
| `/api/verify/state` | PUT | Merges provided fields into verify state (partial update). |
| `/api/verify/reset` | POST | Destructive: clears or reseeds verify state. **Requires password.** |

### Reset password

- Worker secret: **LANTERN_VERIFY_RESET_PASSWORD**
- Set via: `npx wrangler secret put LANTERN_VERIFY_RESET_PASSWORD`
- Required only for reset/reseed; **not** for choosing an identity or using verify mode.

---

## Simulated identities

### Teachers

| teacher_id | Display name |
|------------|--------------|
| teacherA   | Ms. Frizzleton |
| teacherB   | Mr. Feenan    |

### Students

- zane_morrison  
- winnie_addair  
- brett_simms  
- kimber_pace  
- velma_voss  
- archie_rivers  
- raven_hart  
- tori_sparks  
- miles_parker  
- lola_luna  

---

## Identity resolution (when API mode is enabled)

### Teacher page

1. **URL param** `simTeacher` (e.g. `teacher.html?simTeacher=teacherA`)
2. **Verify cloud state** from GET `/api/verify/state` (`state.teacher_id`)
3. **Fallback** (e.g. default teacher id)

Identity is kept **in memory** for the session. localStorage is **not** used for verify identity when the API is on.

### Student page

1. **URL param** `simStudent` (e.g. `index.html?simStudent=zane_morrison`)
2. **Verify cloud state** from GET `/api/verify/state` (`state.character_name`, `state.display_name`)
3. **Adopted character fallback** (localStorage only when API is off or not in verify mode)

When API is on, student verify identity is held in an **in-memory** context (e.g. `verifyStudentContext`). UI shows `display_name`; API calls use `character_name`.

---

## Cloud-native behavior

When API mode is enabled:

- Verify state is **cloud-native** and does **not** depend on localStorage for identity.
- Teacher and student pages resolve identity from URL → cloud state → fallback.
- No reload is required to apply cloud verify state; it is applied in memory after a single fetch where needed.

---

## Verify page (verify.html)

- Displays current simulation state, what to test first, build summary, verification checklist, FERPA guidance, demo flow.
- **Act as teacher** or **Act as student**: sends PUT to `/api/verify/state` and redirects to teacher or profile with the appropriate URL param.
- Checklist state and notes are read/written via GET/PUT `/api/verify/state`.
- **Reset / Reseed**: password prompt → POST `/api/verify/reset` with `action: 'reset'` or `'reseed'`.
- When API is on, **Cloud sync active** is shown; identity source is labeled (URL, Cloud, or local fallback).

The teacher page uses a two-column approvals layout (My Classroom left, Schoolwide Queue right); see [Architecture](lantern-architecture.md#teacher-approvals-ui).

---

## Related documentation

- [Architecture](lantern-architecture.md)
- [Development phases](lantern-development-phases.md)
