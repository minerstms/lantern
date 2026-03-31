# Lantern — production ownership (isolated from MTSS)

This document locks in **who owns what** for TMS Lantern in Cloudflare so it stays separate from the MTSS Behavior stack (Nuggets, case log, etc.).

---

## Canonical Cloudflare resources (Lantern)

| Resource | Name / binding | Notes |
|----------|----------------|--------|
| **Worker** | `lantern-api` | Public HTTP API for Lantern (`/api/*`). This is the only Worker that should serve the Lantern app’s API. |
| **D1 database** | `lantern-db` | Bound in Wrangler as **`DB`**. All Lantern persistence for this Worker goes here. |
| **R2 bucket (avatars)** | `lantern-avatars` | Bound as **`AVATAR_BUCKET`**. |
| **R2 bucket (media / news images)** | `lantern-media` | Bound as **`NEWS_BUCKET`**. |

Configuration in-repo: `lantern-worker/wrangler.toml`.

---

## MTSS must not use Lantern resources

- The **MTSS** Worker(s) and **MTSS D1** (e.g. behavior log / case data) are a **different product**.
- **Do not** point the MTSS Worker at **`lantern-db`**, **`lantern-avatars`**, or **`lantern-media`**.
- **Do not** rebind Lantern’s `lantern-api` routes or secrets to MTSS deployments.
- **Do not** merge or alias MTSS and Lantern bindings in the Cloudflare dashboard “to save time” — that breaks isolation and risks wrong data or auth.

Lantern and MTSS may coexist in the same Cloudflare account; they must remain **separate named resources**.

---

## Confirmed recovery sequence (when login / session was broken)

What actually fixed Lantern pilot login in production (summary):

1. **Restore correct Worker ownership** — Requests for the Lantern API must hit **`lantern-api`**, not an MTSS or other Worker. Wrong Worker = wrong code path, no cookies, or wrong D1.
2. **Set `PILOT_SESSION_SECRET`** — Wrangler: `npx wrangler secret put PILOT_SESSION_SECRET` in **`lantern-worker`**. Required for HS256 JWT pilot session cookies.
3. **Apply Lantern schema / migrations** — D1 for **`lantern-db`** must match what `lantern-worker` expects (e.g. `lantern_pilot_accounts`, including columns such as `is_active` when added). Auth fails or behaves oddly if schema lags code.
4. **Fix login / session cookie flow** — Cross-origin Pages (`*.pages.dev`) → Worker API requires credentialed fetches from the app and cookie attributes suitable for cross-site use (e.g. `SameSite=None; Secure` with correct CORS). Without this, login can “succeed” then bounce back to `/login`.

Order matters conceptually: **right Worker + right DB + secrets + schema + browser cookie rules**.

---

## Lesson: check bindings before patching code

If something “suddenly breaks” after a deploy:

1. In Cloudflare **Workers & Pages** → open **`lantern-api`** → **Settings** → verify **D1** binding → **`lantern-db`**, and **R2** → **`lantern-avatars`** / **`lantern-media`** as intended.
2. Confirm **routes** / custom domains point to **`lantern-api`**, not another Worker.
3. Only then assume a **code** bug.

Many incidents are **mis-bound resources**, not application logic.

---

## Single line of truth

**Lantern production API = Worker `lantern-api` → D1 `lantern-db` + R2 `lantern-avatars` + `lantern-media`, with secrets documented in `docs/DEPLOY_RUNBOOK_LANTERN.md`.**
