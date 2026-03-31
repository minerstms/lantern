# LANTERN ARCHITECTURE CONTRACT (HARD RULES)

This document is the **hard rule system** for the Lantern platform in this repository. It binds humans and AI agents. Normal docs do not override it.

---

## 1. CORE PRINCIPLES (NON-NEGOTIABLE)

- DEAD SIMPLE over clever
- Single source of truth ALWAYS
- No duplication of pipelines, tables, or logic
- No hidden or parallel systems
- FERPA-safe by design (no unnecessary student exposure)
- UI consistency via shared systems ONLY (no one-off components)

**If a change violates any of the above → DO NOT IMPLEMENT**

---

## 2. DATA ARCHITECTURE RULES

- One table per concept (no shadow tables)
- No duplicated storage of the same concept
- All state must be derivable from a single authoritative source
- No "temporary" alternate pipelines
- No denormalized duplicates unless explicitly approved

**Lantern production truth:** When API mode is enabled, **Worker + D1** is the single source of truth for moderation and durable student content. `localStorage` is not a second truth for that data (allowed only for UI prefs, drafts, or explicit offline fallback when API mode is off).

---

## 3. SCHEMA GOVERNANCE (CRITICAL)

- **Remote D1** is the source of truth for what columns and tables actually exist. Verify with `PRAGMA table_info(...)` from `lantern-worker/` using `--remote` before treating "missing data" as a UI bug.
- **No field may be used in code** unless it **exists in the live schema** and is **defined in `docs/LANTERN_SCHEMA.md`**. No guessed, inferred, or assumed column names.
- **Status values** stored or compared in code must match **`docs/LANTERN_STATUS_VALUES.md`** exactly for each table/flow.
- **Operational DB rules** are subordinate to but must align with **`docs/LANTERN_DB_RULES.md`** (command routing, migrations, emergency ALTER policy, review checklist).
- **All new Lantern migrations** must be created **only** under **`lantern-worker/migrations/`**.
- **Root `migrations/`** is **legacy/historical only** for Lantern. **Do not add new Lantern migrations there.**

Schema drift is a **failure mode**, not a frontend styling problem.

---

## 4. STATUS SYSTEM (LOCKED)

- Allowed **stored** status strings are **only** those listed in **`docs/LANTERN_STATUS_VALUES.md`** for the relevant table or flow.
- For **known submission-style flows** in Lantern (e.g. poll contributions, news submissions, approvals queue items as surfaced to students), the contract expects **at minimum** these values where the schema defines them: **`pending`**, **`returned`**, **`approved`** — **only if** that table/flow is already documented in `LANTERN_STATUS_VALUES.md` with those values.
- **UI labels** may differ for readability; **database and API payload status fields** must not be renamed or overloaded for UI convenience.
- **No status invention.** No parallel status vocabularies for the same row type.
- **Do not** add new status strings in code without updating **`docs/LANTERN_STATUS_VALUES.md`** and the schema/migration path first.

---

## 5. API / WORKER RULES

- Every endpoint maps cleanly to **one** primary responsibility.
- **No overlapping endpoints** that return the **same conceptual entity** in **conflicting** shapes or ownership semantics.
- **No branching logic** that makes the same row mean different things depending on caller.
- **Worker responses must reflect backend truth**, not UI convenience hacks (no fake fields, no silent omission of moderation state that the UI then invents).

**Lantern Worker:** Production API for Lantern lives in **`lantern-worker/index.js`** (and its D1/R2 bindings). The separate **`worker/index.js`** tree serves **other** product concerns (e.g. MTSS); do not blur them into Lantern routes or schema without an explicit, approved integration design.

---

## 6. IDENTITY RULE (CANONICAL)

- **`character_name`** is the **canonical identity** for student-scoped rows and API filters in Lantern (missions, poll contributions, wallets, avatars, class access, verify simulation character binding, etc.).
- **Do not** mix **`character_name`** with **`name`**, **`display_name`**, or other presentation fields **for the same pipeline** (queries, filters, joins, ownership checks). Use **`character_name`** for durable identity; use display fields only for labels.
- **If legacy code** still queries by display name or alternate keys, treat that as **technical debt to remove**, not a pattern to copy.

---

## 7. FRONTEND RULES

- Use **existing rendering systems only** (see Card and Rail sections).
- **No one-off visual systems** without explicit approval.
- **No duplicate UI patterns** solving the same problem (e.g. a second "feed card" vocabulary).
- **All displayed data** must map **directly** to backend truth.
- **No fabricated state** that contradicts the API/D1.
- **No UI-only truth** that competes with backend truth when API mode is on.

**Lantern app surface:** Student/teacher product UI for Lantern is primarily **`apps/lantern-app/`**.

---

## 8. CARD SYSTEM ENFORCEMENT

- **Cards are the only production rendering unit** for card-shaped content.
- **No alternate preview systems** for production cards.
- **Rail mode and Opened mode** must use the **same underlying model** (same fields, same semantics); layout differs, truth does not.
- **No special-case cards** outside the shared contract.
- **Mandatory implementation:** production cards are rendered via **`apps/lantern-app/js/lantern-cards.js`** (`LanternCards`). Contract: **`docs/ui/CARD_SYSTEM.md`**. Shared shell styles live in **`apps/lantern-app/css/lantern-cards.css`** only.

---

## 9. RAIL / SCROLLER SYSTEM RULE

- **One horizontal rail / scroller paradigm** for Lantern app pages: shared **content scroller + track** patterns already used for profile rails, wins, and feeds.
- **No duplicate rail paradigms** (no second "carousel" system for the same job).
- **No alternate discovery containers** that recreate horizontal browsing with a different DOM/CSS contract for the same concept.
- **If content appears in a rail**, it is still built from the **shared card system** (Section 8), not hand-built card HTML.

---

## 10. PROFILE / MY CREATIONS RULE

- **Profile is a personal-only space:** identity, recognition, and **my** work.
- **Profile does not create new systems** (no new storage types, no parallel moderation reads from `localStorage` when API mode is on).
- **My Creations** is the **canonical on-Profile surface** for the student’s own content aggregation (posts, submissions tabs, and other approved personal rails).
- **Tabs and filters are allowed** as **filters only**, not as new sources of truth.
- **Duplicate display systems** for the same content class are **not allowed**.
- **No schoolwide discovery or community feed** as a core Profile responsibility unless explicitly approved and scoped; community surfaces belong in their designated pages/flows.

---

## 11. FERPA / VISIBILITY RULES

- **Students** only see data they are **allowed** to see (own submissions, approved public-facing derivations, teacher-scoped recognition as designed).
- **No cross-student** private data exposure unless explicitly designed, approved, and enforced in the Worker.
- **Teacher scope** (e.g. mission ownership, moderation queue scope) must be enforced at **query / authorization** level in the Worker, **not** by hiding rows in CSS or client-side filter tricks.
- **Visibility** must be guaranteed by **data access rules**, not cosmetic hiding.

---

## 12. CHANGE MANAGEMENT RULE

Before implementing any feature, ask:

1. Does this duplicate an existing system?
2. Does this introduce a second source of truth?
3. Does this break the card system?
4. Does this violate FERPA boundaries?
5. Can this be done by extending an existing system instead?

**If ANY answer is yes → STOP and redesign**

---

## 13. IMPLEMENTATION BEHAVIOR (FOR AI AGENTS)

- Do **not** invent new systems.
- Do **not** rename or restructure without a concrete, scoped reason tied to this contract.
- Do **not** create parallel pipelines.
- **Always** extend existing structures first.
- **Always** preserve existing working flows unless a migration plan explicitly replaces them.
- **Prefer modification over creation.**
- **Avoid broad rewrites** when a focused change will satisfy the requirement.

---

## 14. FAILURE CONDITION

If a requested change conflicts with this contract:

- **Do NOT proceed silently.**
- Output a clear warning:

**"Requested change violates ARCHITECTURE_CONTRACT.md — requires redesign"**

Then stop or propose a compliant alternative.
