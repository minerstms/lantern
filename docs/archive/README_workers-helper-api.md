# MTSS Helper API

Separate Worker for feedback only. No student data. No access to mtss-db.

## Setup

```bash
npx wrangler d1 create mtss-helper-db
```

Edit `wrangler.toml` and replace `REPLACE_AFTER_D1_CREATE` with the `database_id` from the create output.

```bash
npx wrangler d1 execute mtss-helper-db --remote --file=schema.sql
npx wrangler deploy
```

## Endpoint

- `POST /api/submit` — body: `{ "type": "bug"|"suggestion", "content": "..." }`. Returns `{ "ok": true }`.

## View feedback

```bash
npx wrangler d1 execute mtss-helper-db --remote --command "SELECT * FROM helper_feedback ORDER BY created_at DESC LIMIT 50"
```
