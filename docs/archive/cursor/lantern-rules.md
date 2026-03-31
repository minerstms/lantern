# Lantern Core Rules

FERPA SAFETY (NON-NEGOTIABLE)
- Students may only see their own private submissions.
- Teachers may only see submissions routed to them or owned by them.
- Students may not browse other students' private work.
- Public/community visibility must require teacher approval first.
- Do not expose raw private student media publicly.
- Do not create a global browse-all-student-submissions view.

DEAD SIMPLE RULE
Lantern must not become an LMS.

Do NOT add:
- due dates
- grades
- rubrics
- late penalties
- threaded comments
- peer review
- assignment analytics
- standards alignment
- gradebook syncing
- multi-stage assignment workflows
- assignment dependencies
- complex teacher configuration panels

PLATFORM PURPOSE
Lantern is:
- a student identity hub
- a creativity platform
- a recognition system
- a school community feed

Lantern is NOT:
- a gradebook
- an LMS
- a homework portal
- a discipline system

ARCHITECTURE RULE
- Read the real codebase first.
- Do not assume architecture.
- Preserve the current frontend + Worker + D1 + R2 structure unless a small change is truly necessary.
- Keep changes minimal.

DATABASE & MIGRATION RULES (see docs/LANTERN_DB_RULES.md)
- Run all D1/Wrangler DB commands from /lantern-worker. Remote D1 is production source of truth; use --remote for verification and migrations.
- Root /migrations is legacy/historical only for Lantern. Do not add NEW Lantern migrations there.
- All NEW Lantern migrations must be created only in /lantern-worker/migrations/.
- Before changing storage/schema logic: read docs/LANTERN_SCHEMA.md and docs/LANTERN_STATUS_VALUES.md, determine whether a migration is required, and do not invent field names.
- After any schema change, verify with PRAGMA table_info(table_name); on remote. If "no such table" or "no such column" appears, check remote schema first; do not assume UI or frontend bug.
- If file-based migration fails, use --command with direct SQL. Live fix first; migration cleanup/consolidation is a separate task.

CARD SYSTEM (CONSTITUTIONAL)
- There is exactly ONE production card system. Source of truth: apps/lantern-app/js/lantern-cards.js and docs/ui/CARD_SYSTEM.md.
- All production cards MUST be rendered by LanternCards. No page may emit hand-built production card HTML.
- No page may define structural card-shell CSS. All card CSS lives in apps/lantern-app/css/lantern-cards.css.
- No inline geometry/typography styles in card renderer or lantern-media.js card output. Use shared classes only.
- No parallel card systems (e.g. no .lanternCard production shell). All production cards use .exploreCard.
- All badges are created in lantern-cards.js and styled in the shared stylesheet.
- New card surfaces must use the shared renderer and shared stylesheet.
