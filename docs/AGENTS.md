# Lantern — Architectural Guardrails

**Full contract (architecture, DB, cards, FERPA, verify, class access, missions):**  
→ **`docs/LANTERN_SYSTEM_CONTEXT.md`**

**Roadmap / re-entry:** **`docs/ACTIVE_BUILD_PLAN.md`**  
**Locked decisions log:** **`docs/CHANGELOG_LOCKED.md`**  
**Cursor discipline:** **`docs/CURSOR_RUN_PROMPT.md`**

---

## Non-negotiables (summary)

| Area | Rule |
|------|------|
| **Stack** | Frontend `apps/lantern-app/` · API **`lantern-worker/`** · D1 · R2 |
| **Truth** | API mode on → **Worker + D1** only for moderation/persistence — **not** localStorage |
| **Verify** | Simulation only — `lantern_verify_state`, `/api/verify/*`, reset secret `LANTERN_VERIFY_RESET_PASSWORD` |
| **FERPA** | No cross-teacher mission moderation; Worker enforces ownership; no cross-student private exposure |
| **Cards** | **One** production system: `LanternCards` + `lantern-cards.css` — see system context §10 |
| **Contribute Studio** | **`contribute.html`** — rails/cards/previews: **`docs/CONTRIBUTE_STUDIO_PROMPT.md`** (missions: real Lantern rail + cards; left panel may scroll; no Contribute-only mission carousel styling) |
| **DB** | New migrations **only** `lantern-worker/migrations/` · remote PRAGMA is truth · schema file **`docs/archive/LANTERN_SCHEMA.md`** |

**Current phase / focus:** See **`docs/ACTIVE_BUILD_PLAN.md`** (class access UX + demo hardening).  
**Do not add in this phase:** new social/chat/auth/LMS/economy systems — stabilize existing.

---

## Cursor

Root **`.cursorrules`** and **`.cursor/lantern-rules.md`** should stay aligned with **`docs/LANTERN_SYSTEM_CONTEXT.md`** and **`docs/CURSOR_RUN_PROMPT.md`**.

---

## Beta feedback triage (Lantern)

Use this when triaging real beta issues. **Lantern only** — same-origin `/api`, `window.LANTERN_AVATAR_API = ''`, no MTSS; preserve Rick Radle bootstrap/admin behavior; no speculative auth redesigns.

**Principles**

- **Stability first** — prefer no change over a risky change during beta.
- **Evidence over speculation** — one-offs get noted; **repeated** friction or clear bugs get small fixes.
- **Surgical edits** — fewest files/lines; reuse existing patterns (guards, logout, messages).
- **Auth/session frozen** — treat `app/js/lantern-pilot-auth.js`, cookies, and `/api` contracts as read-mostly unless the issue is provably wrong there.

**Classify each issue (primary bucket)**

| Bucket | Examples |
|--------|----------|
| **auth/routing** | Redirects, `return=`, login/logout, `/api` errors |
| **role/guard** | Wrong page for role, guard/pending shell, `guardPilotPage` |
| **UX feedback** | Loading/error visibility, focus, `aria-*`, double-submit |
| **copy** | Labels, stale instructions, misleading success text |
| **identity display** | Session hint, name/role display, header vs session |
| **nav** | Links, active tab, extensionless vs `.html` |
| **feature gap** | Missing capability — default **defer** unless tiny and bug-shaped |

**Required per-issue deliverable**

1. **Root cause** — what failed (file/flow), not symptom only.  
2. **Exact files to change** — paths; no vague refactors.  
3. **Smallest safe fix** — concrete minimal edit.  
4. **Regression risk** — e.g. low (copy) vs medium (touches guard — re-test roles).  
5. **Copy-paste patch summary** — short bullets per file for PR/commits.
