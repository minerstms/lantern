# Lantern — deploy runbook

Operational steps for deploying **`lantern-api`** and keeping Lantern isolated from MTSS.

---

## Where to deploy the Worker from

- **Directory:** `worker/` from this repository root (Worker project folder).
- **Command:** from `worker/`, run:
  ```bash
  npx wrangler deploy
  ```
- **Config file:** `lantern-worker/wrangler.toml` defines `name = "lantern-api"`, D1, and R2 bindings.

Do **not** deploy Lantern by running Wrangler from an MTSS project folder.

---

## Secret: `PILOT_SESSION_SECRET`

- **Required** for pilot login (JWT in HttpOnly cookie).
- Set on the **`lantern-api`** Worker (not MTSS):
  ```bash
  cd worker
  npx wrangler secret put PILOT_SESSION_SECRET
  ```
- If missing or wrong, login/session will not work reliably.

Other secrets (e.g. setup, verify, bootstrap) are documented in `worker/wrangler.toml` comments and system context docs.

---

## Schema and migrations (before expecting auth to work)

- Migrations live in **`worker/migrations/`**.
- Apply to **remote** D1 **`lantern-db`** when you change schema (follow your team’s `wrangler d1 execute … --remote --file=…` process).
- **Auth and pilot tables** must exist and match code (e.g. `lantern_pilot_accounts`, `lantern_setup_state`, etc.). If migrations are not applied, login or `/api/auth/me` can fail even when code and secrets are correct.

---

## Worker deploy vs database readiness (separate steps)

- **`npx wrangler deploy`** updates **Worker code** only.
- **D1 schema** changes require **migration commands** against **`lantern-db`**. Deploying the Worker does **not** automatically run SQL files.
- **R2 buckets** must exist and match `wrangler.toml` names; create them in the dashboard if a deploy complains about missing buckets.

Always verify: **Worker version**, **DB schema version**, and **bindings** together.

---

## Do not touch MTSS bindings from Lantern work

- When fixing Lantern, **do not** change MTSS Worker routes, MTSS D1 bindings, or MTSS environment variables.
- **Do not** point MTSS at `lantern-db` or Lantern buckets.
- If you need both apps in one account, keep **two Workers**, **two D1 databases** (or clearly separated datasets), and **separate** R2 buckets as documented in `docs/DEPLOY_OWNERSHIP_LANTERN.md`.

---

## Quick post-deploy checks

1. `GET https://<lantern-api-host>/api/health` returns JSON with `service: lantern-api` (or equivalent).
2. Cloudflare dashboard: **`lantern-api`** → bindings show **`lantern-db`**, **`lantern-avatars`**, **`lantern-media`**.
3. After migration + secret: pilot login from the Lantern Pages URL and confirm session persists on navigation.

---

## Related doc

- **Ownership and isolation:** `docs/DEPLOY_OWNERSHIP_LANTERN.md`
