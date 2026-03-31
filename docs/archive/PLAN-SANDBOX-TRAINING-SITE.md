# Plan: New Sandbox Training Site with Fictitious Names (Cloudflare)

## Overview

You have two paths for a training sandbox:

| Approach | Backend | Data | Best for |
|----------|---------|------|----------|
| **A. Static sandbox** | None (fake API in JS) | Hardcoded in `packages/sandbox-data` | Quick demo, read-only walkthrough |
| **B. Full backend sandbox** | Worker + D1 | Seeded with fictitious names | Real training: add logs, assign students, etc. |

---

## Option A: Static Sandbox (Already Built)

The repo already has `apps/sandbox-app` with fictitious staff (Ms. Frizzle, Mr. Keating, Mrs. Johnson, Ms. Kimble) and students (Bart Simpson, Lisa Simpson, Hermione Granger, etc.). No production API or D1 is used.

### Steps

1. **Copy shared packages** (run before each deploy):
   ```bash
   node scripts/copy-shared-to-sandbox.js
   ```

2. **Create Cloudflare Pages project**
   - **Workers & Pages** → **Create** → **Pages** → **Connect to Git** (or direct upload)
   - **Project name:** `mtss-sandbox` (→ `mtss-sandbox.pages.dev`)
   - **Root directory:** `apps/sandbox-app`
   - **Build command:** `node ../scripts/copy-shared-to-sandbox.js` (or run manually; no build output needed)
   - **Build output directory:** `./` (this folder)

3. **Deploy**
   - Pages serves the static files; no Worker or D1 needed.
   - URL: `https://mtss-sandbox.pages.dev`

4. **Add more fictitious data** by editing `packages/sandbox-data/index.js` (FAKE_STAFF, FAKE_STUDENTS, FAKE_CASES, FAKE_PENDING, FAKE_CATALOG). Re-run copy script and redeploy.

**Limitation:** Sandbox provider only fakes certain endpoints. Features that require real DB writes (e.g. adding students, saving logs to D1, case workflows) will not persist—they appear to work but data is discarded.

---

## Option B: Full Backend Sandbox (Real D1 + Worker)

A fully functional training site with its own D1 database and Worker, seeded with fictitious names only. Trainers can log concerns, assign students to groups, and see real persistence—with zero production data.

### 1. Create a new D1 database

```bash
npx wrangler d1 create mtss-sandbox-db
```

Copy the `database_id` from the output.

### 2. Add a wrangler environment for sandbox

Create `wrangler.sandbox.toml` (or add to existing `wrangler.toml`):

```toml
name = "mtss-behavior-log-sandbox"
main = "worker/index.js"
compatibility_date = "2024-01-01"

[[d1_databases]]
binding = "DB"
database_name = "mtss-sandbox-db"
database_id = "<paste-database_id-from-step-1>"

[vars]
ENVIRONMENT = "sandbox"
APP_URL = "https://mtss-sandbox.pages.dev"
```

### 3. Apply schema and migrations to sandbox D1

```bash
npx wrangler d1 execute mtss-sandbox-db --remote --file=schema.sql
npx wrangler d1 execute mtss-sandbox-db --remote --file=seed-groups.sql
```

Run all migrations in order (001 through 013):

```bash
for f in migrations/*.sql; do npx wrangler d1 execute mtss-sandbox-db --remote --file="$f"; done
```

### 4. Create seed script for fictitious data

Create `scripts/seed-sandbox-db.sql` with fictitious staff, students, and sample logs:

```sql
-- Fictitious staff (teacher_id = short display ID)
INSERT OR REPLACE INTO staff (teacher_id, teacher_name, is_admin, role) VALUES
('Frizzle', 'Ms. Frizzle', '', 'Teacher'),
('Keating', 'Mr. Keating', '', 'Teacher'),
('Johnson', 'Mrs. Johnson', 'TRUE', 'Admin'),
('Kimble', 'Ms. Kimble', '', 'Secretary');

-- Fictitious students
INSERT OR IGNORE INTO students (student_name, student_id) VALUES
('Bart Simpson', 'SANDBOX-001'),
('Lisa Simpson', 'SANDBOX-002'),
('Hermione Granger', 'SANDBOX-003'),
('Charlie Brown', 'SANDBOX-004'),
('Matilda Wormwood', 'SANDBOX-005');

-- Optional: sample logs (use INSERT with unique log_id)
-- Optional: sample cases, store catalog, etc.
```

Run it:

```bash
npx wrangler d1 execute mtss-sandbox-db --remote --file=scripts/seed-sandbox-db.sql
```

### 5. Deploy sandbox Worker

```bash
npx wrangler deploy -c wrangler.sandbox.toml
```

Note the Workers URL (e.g. `https://mtss-behavior-log-sandbox.<your-subdomain>.workers.dev`).

### 6. Wire Worker to allow sandbox origin

In `worker/index.js`, ensure `ALLOWED_ORIGINS` (or equivalent) includes:

- `https://mtss-sandbox.pages.dev`
- `https://mtss-behavior-log.pages.dev` (if you use that for sandbox)

### 7. Deploy sandbox frontend (Pages)

- Create a **new** Pages project (e.g. `mtss-sandbox`).
- **Build output:** `public/` (same as production, but you need a way to point API to sandbox Worker).

**Important:** The production `public/api.js` uses `API_ORIGIN = 'https://mtss-behavior-log.mrradle.workers.dev'`. For the sandbox Pages site, the frontend must use the **sandbox Worker** URL instead.

**Options:**

- **A)** Duplicate `public/` into `public-sandbox/` and set `API_ORIGIN` to the sandbox Worker URL in `public-sandbox/api.js`. Deploy that folder as the sandbox Pages project.
- **B)** Use a build step or env var (e.g. `VITE_API_ORIGIN`) if you introduce a build tool. The current app is static HTML/JS, so a simple copy is easiest.

### 8. Add route (optional, for same-origin)

If you want `https://mtss-sandbox.pages.dev/api/*` to hit the sandbox Worker:

- Dashboard → **Workers & Pages** → `mtss-behavior-log-sandbox` → **Triggers** → **Routes**
- Add route: `mtss-sandbox.pages.dev/api/*` → this Worker

Then the sandbox frontend can use `API_ORIGIN = 'https://mtss-sandbox.pages.dev'` (same-origin).

### 9. (Optional) Admin key for sandbox

```bash
npx wrangler secret put ADMIN_API_KEY -c wrangler.sandbox.toml
```

Use a different key from production for safety.

---

## Summary Table

| Step | Static (A) | Full Backend (B) |
|------|------------|------------------|
| D1 database | No | `npx wrangler d1 create mtss-sandbox-db` |
| Schema/migrations | No | Execute schema + seed-groups + migrations |
| Seed fictitious data | Edit `packages/sandbox-data/index.js` | Run `scripts/seed-sandbox-db.sql` |
| Worker | No | `wrangler deploy -c wrangler.sandbox.toml` |
| Pages | `apps/sandbox-app` → mtss-sandbox | `public/` or `public-sandbox/` → mtss-sandbox |
| API_ORIGIN | N/A (fake) | Sandbox Worker URL or same-origin |

---

## Recommendation

- **For quick demos / parity checks:** Use **Option A** (static sandbox). It’s already built; deploy `apps/sandbox-app` to Pages.
- **For real training (log concerns, assign groups, full workflow):** Use **Option B** (full backend). Create `mtss-sandbox-db`, seed with fictitious names, deploy sandbox Worker + Pages with `API_ORIGIN` pointing to the sandbox Worker.
