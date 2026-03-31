# Lantern Database Governance Rules

Hard rules for schema safety and drift prevention. These are mandatory.

## 1) Migration Location

- Root `migrations/` is legacy/historical only for Lantern migration history.
- No NEW Lantern migrations may be added to root `migrations/`.
- All NEW Lantern migrations must be created only in `lantern-worker/migrations/`.

## 2) Command Routing

- All D1 commands must be run from `lantern-worker/`.
- Use the Worker's `wrangler.toml` and bindings only.

Standard verification command:

```bash
cd lantern-worker
npx wrangler d1 execute lantern-db --remote --command "PRAGMA table_info(lantern_poll_contributions);"
```

## 3) Remote Is Source Of Truth

- Remote D1 is the authoritative schema.
- Always verify schema remotely with `PRAGMA table_info(table_name)` before debugging UI/data behavior.
- Local D1 is not sufficient evidence for production behavior.

## 4) Schema Contract Rule

- No field may be used in code unless both are true:
  - It exists in D1 schema.
  - It is defined in `docs/LANTERN_SCHEMA.md`.

## 5) Required Changes For Every Schema Update

Every schema change must include all of:
- A migration file in `lantern-worker/migrations/`.
- Updates to `docs/LANTERN_SCHEMA.md`.
- Updates to `docs/LANTERN_STATUS_VALUES.md` (if status set changes).
- Code updates for both read and write paths where relevant.

## 6) Emergency ALTER TABLE Rule

- Direct `ALTER TABLE` using `--command` is allowed only for emergency live fixes.
- Any emergency direct SQL must be followed by:
  - A permanent migration file.
  - Documentation update in schema/status docs.

## 7) Status Value Rule

- Status fields must use only values defined in `docs/LANTERN_STATUS_VALUES.md`.
- No synonyms or ad-hoc values are permitted.

## 8) Review Checklist (Locked)

Before merging any DB-related change:
- Verified remote schema with `PRAGMA table_info(...)`.
- Migration file exists in `lantern-worker/migrations/`.
- `docs/LANTERN_SCHEMA.md` updated.
- `docs/LANTERN_STATUS_VALUES.md` updated if needed.
- Worker write queries match schema fields.
- Worker read queries match schema fields.
- Frontend expectations match response payload fields.

Schema-sensitive change checklist:
- [ ] checked actual table/columns
- [ ] checked docs/LANTERN_SCHEMA.md
- [ ] checked docs/LANTERN_STATUS_VALUES.md
- [ ] migration added if needed
- [ ] remote schema verified with PRAGMA
- [ ] write path tested
- [ ] read path tested

## 9) Drift Detection Triggers

Treat any of the following as schema drift until disproven:
- `no such table`
- `no such column`
- empty API datasets with known DB rows
- moderation state visible in DB but missing in UI

First action: verify remote schema, then reconcile query fields with `docs/LANTERN_SCHEMA.md`.
