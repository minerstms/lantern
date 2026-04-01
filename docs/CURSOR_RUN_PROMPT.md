# Lantern — Cursor / agent run prompt

Use this as the **default instruction block** for Cursor and other agents working in **this repo** (TMS Lantern). Canonical production frontend: **`https://lantern-42i.pages.dev`**. It does not replace **AGENTS.md** (loaded by Cursor) or **`docs/LANTERN_SYSTEM_CONTEXT.md`** (full contract).

---

## Before you touch code

1. Read **`docs/LANTERN_SYSTEM_CONTEXT.md`** for architecture, FERPA, DB rules, cards, verify, class access, missions.
2. Read **`docs/ACTIVE_BUILD_PLAN.md`** for the ordered roadmap and current re-entry point.
3. Check **`docs/CHANGELOG_LOCKED.md`** for locked decisions that might block a naive “feature” request.

---

## Discipline

- **Smallest safe change** — no repo-wide refactors unless explicitly requested.
- **Scope** — do not expand to “helpful” adjacent files; only open what the task needs.
- If **>3–5 files** would change, propose **phases** first.
- **List files** you will modify (and intentionally not modifying) before large edits.

---

## Layer order (when building a feature)

1. D1 migration (if schema) — only under **`lantern-worker/migrations/`**
2. Worker routes / queries (`lantern-worker/`)
3. API client / `createRun` bindings if applicable
4. Student/teacher UI (`apps/lantern-app/`)

Do not skip layers or invent parallel pipelines.

---

## Database

- Run Wrangler/D1 from **`lantern-worker/`**.
- **Remote** D1 is production truth — verify with `PRAGMA table_info(...)` on `--remote`.
- **No new fields** without **`docs/archive/LANTERN_SCHEMA.md`** + migration + **system context** Appendix A if statuses change.
- Root **`migrations/`** is legacy for Lantern — **no new** Lantern migrations there.

---

## Frontend

- **One card system:** `LanternCards` + `lantern-cards.css` only for production cards.
- **No** second feed/card vocabulary; **no** hand-built `.exploreCard` shells on pages.
- **Lantern app** lives in **`apps/lantern-app/`** — do not “helpfully” redesign architecture.
- **Contribute / Design Studio (`contribute.html`):** alignment rules for rails, previews, and **missions** (real `.lanternScroller` + `LanternCards`; no Contribute-only mission styling) — **`docs/CONTRIBUTE_STUDIO_PROMPT.md`**.

---

## Product constraints

- **DEAD SIMPLE** — no LMS-style auth, CMS frameworks, or workflow engines in Lantern scope.
- **FERPA** — no cross-teacher moderation; Worker enforces ownership; no cross-student private leakage.
- **Verify** is simulation, not login. **Class access** is a gate (event `lantern-class-access-resolved`), not full accounts.

---

## Legacy / out of repo

**Google Apps Script / Code.gs / MTSS Behavior Log** rules (timestamps, spreadsheet tabs) apply to **other** projects — do not apply them to Lantern Worker/D1/Pages unless the user explicitly bridges both. Old handoff text: **`docs/archive/cursor/context.md`**.

---

## Output

- Prefer **completion summary**: what changed, what was not changed, follow-ups.
- If a request **violates** system context, **stop** and say so — do not silently “approximate.”
