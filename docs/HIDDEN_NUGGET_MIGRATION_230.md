# Hidden Nugget assignment table — Prompt #230

**RED — HIDDEN NUGGET MIGRATION REQUIRED**

Durable once-per-student-per-school-day assignment cannot fit cleanly in existing stores:

- `lantern_settings` is the admin settings KV, not a per-student daily assignment ledger.
- `lantern_mission_completions` is a mission audit table; do not abuse it to avoid a migration.
- `lantern_transactions` is the Nugget ledger. Claim/idempotency belongs there; the assigned **card id** does not.

#230 documented this SQL and did not run it. #230A approved applying the same additive schema as `worker/migrations/075_lantern_hidden_nugget_assignments.sql`. Worker Hidden Nugget routes no-op when the table is missing.

## Exact SQL (do not run)

```sql
CREATE TABLE IF NOT EXISTS lantern_hidden_nugget_assignments (
  id TEXT PRIMARY KEY,
  account_key TEXT NOT NULL,
  school_day TEXT NOT NULL,
  card_id TEXT NOT NULL,
  claimed_at TEXT,
  claim_tx_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_hidden_nugget_account_day
  ON lantern_hidden_nugget_assignments (account_key, school_day);

CREATE INDEX IF NOT EXISTS idx_hidden_nugget_day
  ON lantern_hidden_nugget_assignments (school_day);
```

- `id` is deterministic: `hn:<school_day>:<account_key>`
- Uniqueness `(account_key, school_day)` guarantees one assignment per student per Denver school day
- Claim/idempotency for Nuggets uses `lantern:hidden_nugget:<school_day>:<account_key>` in TMS + `lantern_transactions.id`

## Rollback (do not run)

```sql
DROP INDEX IF EXISTS idx_hidden_nugget_day;
DROP INDEX IF EXISTS idx_hidden_nugget_account_day;
DROP TABLE IF EXISTS lantern_hidden_nugget_assignments;
```

## Other

- Backfill: none
- Routes: `GET /api/feed` (first page assign/pin), `POST /api/polls/vote`, `POST /api/reactions/finalize`
- Privacy: rows store economy account key + Explore card id + school day. No student popularity ranking. Staff/admin/operator are never assigned.
