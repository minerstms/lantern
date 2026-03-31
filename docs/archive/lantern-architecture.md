# Lantern — Architecture

**This document is the authoritative reference for Lantern’s architecture.**

---

## Project context

Lantern is a **school culture platform** that integrates:

- Student identity
- Missions
- Recognition
- Posts / news
- Nuggets economy
- Avatars / themes / store
- Teacher moderation
- Hallway display feed

Lantern works alongside a sister system:

- **MTSS / TMS Nuggets** — teacher behavior documentation system.
- **Lantern** — student-facing culture layer.

---

## Current architecture

Lantern runs on a **hybrid architecture**:

| Layer | Description |
|-------|-------------|
| **Frontend** | Static web application under `apps/lantern-app/` |
| **Backend** | Cloudflare Worker in `lantern-worker/` |
| **Data storage** | D1 database (`lantern-db`) |
| **Media storage** | R2 buckets (avatars, news media) |

The Worker is the **single authoritative API layer**.

---

## Critical architecture rule

**When API mode is enabled:**

### Worker + D1 is the single source of truth

- No moderation-facing UI may read data from localStorage.
- Moderation data must always flow: **Worker → API → frontend**.
- Never: **localStorage → dashboard**.

### localStorage is allowed only for

- UI preferences
- Draft content
- Compatibility fallback when API is disabled

Moderation data (pending approvals, mission submissions, counts, etc.) must come from the Worker when `LANTERN_AVATAR_API` (or equivalent) is set.

---

## Data flow

- **Student/teacher browser** → requests to Worker (`window.LANTERN_AVATAR_API`).
- **Worker** → reads/writes D1 and R2; returns JSON.
- **Frontend** → renders from API responses; does not use localStorage as the source for moderation data in API mode.

---

## FERPA safety rule

The system must prevent:

- Cross-teacher moderation (Teacher A must not see or act on Teacher B’s items).
- Cross-student private data exposure.

**Mission moderation** must enforce teacher ownership:

- Teacher A cannot approve/reject/return missions owned by Teacher B.
- The Worker must enforce `teacher_id` ownership checks on all mission moderation actions (approve, reject, return).

---

## Teacher approvals UI

The teacher approvals experience uses **two side-by-side columns**:

- **Left column — My Classroom:** The teacher’s primary workflow. Contains teacher-owned items only: mission submissions, classroom review items. Handle these first.
- **Right column — Schoolwide Queue:** Shared, public-facing moderation: avatar approvals, news/post approvals, other shared items. Teacher-owned mission submissions **must never** appear here.

**Full review before approval:** Teachers must be able to open a full review view (full text, image, content) before approving. Thumbnail-only or snippet-only moderation is not acceptable.

**Mission submissions:** The separate “Mission submissions” card on the teacher page is **reference-only** (count and pointer). The primary action surface for reviewing and approving mission work is **My Classroom** in the Approvals card. There is no second competing review surface for the same mission items.

---

## Dead simple rule

Lantern intentionally avoids overbuilt systems:

- Teacher workflows must stay under **5 seconds**.
- Do not introduce LMS-style complexity.
- Prefer simple, explicit flows over configurable systems.
- Duplicates are acceptable where they keep flows clear.
- **Cross-user data leakage is never acceptable.**

---

## Class access

- Class access is **required** for Explore and other protected features. It is a **gate**, not full authentication.
- The system is **event-driven**: pages load feed/data only after the event `lantern-class-access-resolved` fires with `tokenValid === true`. If the event never fires, Explore shows an empty feed — that is a **gate issue**, not a data bug.
- **Full specification:** [Class access](class-access.md).

---

## Explore page structure

Explore has **two types of surfaces**. Do not assume missions appear everywhere.

| Type | Surfaces | Content |
|------|----------|---------|
| **Curated (posts only)** | Spotlight, Teacher Picks, Featured Creations | Posts / curated content only. **Approved missions do not appear here.** |
| **Feed (mixed)** | **Latest Creations** only | Posts **and** approved mission submissions. |

**Only Latest Creations** shows the merged feed (posts + approved missions). See [Missions & visibility](missions.md).

---

## Product guardrails

- **FERPA-safe fictional identity** stays intact; no real PII in student-facing layer.
- **No student-to-student typed comments** — emoji reactions only; only teachers type comments on student posts.
- **Teacher moderation** remains central; access control is a classroom gate, not a full authentication platform.
- **DEAD SIMPLE** always wins over overbuilt feature design.

---

## Related documentation

- [Class access](class-access.md) — Gate system, event, Explore dependency.
- [Missions & visibility](missions.md) — Approval pipeline, query-based visibility, Explore surfaces, image submissions, attribution, debugging.
- [Verify / simulation system](lantern-verify-system.md)
- [Development phases](lantern-development-phases.md)
