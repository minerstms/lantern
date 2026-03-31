# TMS Nuggets — Sandbox Parity Checklist

Track parity between live app (tmsnuggets.pages.dev) and sandbox (mtss-sandbox.pages.dev).

## Shared Code (single source of truth)

| Item | Location | Used by |
|------|----------|---------|
| Page names | packages/shared-config | live, sandbox |
| Nav button labels | packages/shared-config | live, sandbox |
| Workflow status labels | packages/shared-workflows | live, sandbox |
| Role visibility rules | packages/shared-roles | live, sandbox |
| Nav rendering | packages/shared-ui | live, sandbox |

## Parity Checklist

- [ ] **Top nav** — Same 5 buttons, same order, same labels
- [ ] **Role visibility** — Teacher, Secretary, Admin, Store see correct buttons
- [ ] **Workflow statuses** — Logged, Principal notified, Student requested, In office, Resolved
- [ ] **Card titles** — Pending Nuggets, Recent Escalations, Active Queue, etc.
- [ ] **Button labels** — Log Concern, Claim, Acknowledge, etc.
- [ ] **Version label** — Same in both (VERSION_LABEL in shared-config)

## Safety Guards

- [ ] Production Worker rejects non-production origins (403)
- [ ] Sandbox never loads production API config
- [ ] Sandbox provider throws if on production host
- [ ] Bootstrap fail-closed on mode mismatch

## Deploy

- **Live:** Pages project, output = `public/`, domain = tmsnuggets.pages.dev
- **Sandbox:** Pages project, output = `apps/sandbox-app/`, domain = mtss-sandbox.pages.dev
- **Shared packages:** Must be copied into sandbox output if using relative paths, or build step includes them
