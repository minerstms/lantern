# TMS Lantern (beta)

School culture platform: student publishing, missions, moderated news, recognition, games, avatars/nuggets — **Cloudflare Pages** + **Worker** + **D1** + **R2**.

## Documentation (authoritative)

| Doc | Purpose |
|-----|---------|
| [**docs/LANTERN_SYSTEM_CONTEXT.md**](docs/LANTERN_SYSTEM_CONTEXT.md) | Architecture, FERPA, DB governance, schema/status pointers, card system, verify, class access, missions |
| [**docs/ACTIVE_BUILD_PLAN.md**](docs/ACTIVE_BUILD_PLAN.md) | Ordered roadmap and current re-entry point |
| [**docs/CHANGELOG_LOCKED.md**](docs/CHANGELOG_LOCKED.md) | Locked decisions and consolidation notes |
| [**docs/CURSOR_RUN_PROMPT.md**](docs/CURSOR_RUN_PROMPT.md) | Default agent/Cursor run discipline |

**Agent guardrails:** root [**AGENTS.md**](AGENTS.md).

**Older Markdown** (audits, phased plans, duplicates): **`docs/archive/`**.

## App entry

Student/teacher UI: **`apps/lantern-app/`** (static HTML/JS/CSS).  
Worker: **`lantern-worker/`**.

---

*Prior root README “deploy trigger” one-liner preserved in `docs/archive/README_deploy_trigger_snippet.md`.*
