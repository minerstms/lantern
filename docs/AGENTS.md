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
