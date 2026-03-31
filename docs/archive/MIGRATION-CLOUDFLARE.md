# Migrate MTSS Behavior Log to Cloudflare

## Target architecture

- **Cloudflare Pages**: static HTML/JS (Index, Teacher, Store, Admin, Home). No server-side templates; config (e.g. API base URL) from a single `config.js` or inline in each page.
- **Cloudflare Worker**: single Worker that serves **POST /api/*** (JSON). All data in **D1** (SQLite). No Google.
- **D1**: Tables `settings`, `staff`, `students`, `student_aliases`, `logs`, `store_catalog`, `store_redeems`, `tag_list`, `student_tags`, `key_aliases`. Schema in `schema.sql`.
- **Secrets**: Optional `ADMIN_API_KEY` for Admin UI. No Google credentials.

## Backend API surface (replace these GAS functions)

| GAS function              | HTTP route (suggested)   | Notes |
|---------------------------|--------------------------|--------|
| getBootstrap              | POST /api/getBootstrap   | No body |
| verifyEnrollment          | POST /api/verifyEnrollment | Body: `{ attempt }` |
| appendLog                 | POST /api/appendLog      | Body: teacher_id, teacher_name, kind, note_text, student_name, etc. |
| teacherDashboardData      | POST /api/teacherDashboardData | Body: `{ teacher_id, include_bootstrap? }` |
| assignStudentToPending    | POST /api/assignStudentToPending | Body: teacher_id, log_id, student_name |
| updateLog                 | POST /api/updateLog      | Body: teacher_id, log_id, fields |
| deleteLog                 | POST /api/deleteLog      | Body: teacher_id, log_id |
| undoConcernNugget         | POST /api/undoConcernNugget | Body: teacher_id, log_id |
| storeBootstrap            | POST /api/storeBootstrap | Body: `{ teacher_id? }` |
| storeGetBalance           | POST /api/storeGetBalance | Body: student_name, teacher_id? |
| storeRedeem               | POST /api/storeRedeem    | Body: teacher_id, student_name, item_id, qty, note? |
| (Admin) getAuthInfo       | POST /api/admin/getAuthInfo | No body |
| (Admin) getAllData        | POST /api/admin/getAllData | No body → { auth, headers } |
| (Admin) getAllDataAuthed  | POST /api/admin/getAllDataAuthed | Body: `{ key? }` → { headers, rows } |
| (Admin) buildReportPdfBase64 | POST /api/admin/buildReportPdfBase64 | Body: key, title, filters, selectedRows, columns, orientation |
| (Admin) emailReportPdf    | POST /api/admin/emailReportPdf | Body: key, to, subject, body, pdf |

All request/response: JSON. Use same success/error shape as current (e.g. `{ ok: true, ... }` or throw → client gets message).

## D1 setup (no Google)

1. Create the database: `npx wrangler d1 create mtss-db`. Copy the `database_id` into `wrangler.toml` under `[[d1_databases]]` → `database_id`.
2. Apply schema: `npx wrangler d1 execute mtss-db --remote --file=schema.sql`.
3. Seed staff/students if needed: use `wrangler d1 execute mtss-db --remote --command="INSERT INTO staff ..."` or a small script. Default `enroll_password` is in schema (ENROLL2026).
- DELETEME parse JSON key, create **JWT** (Google’s library or manual), call `https://www.googleapis.com/oauth2/v4/token` for access token, then `https://sheets.googleapis.com/v4/spreadsheets/{id}/values/...` for read/append/update.
## Auth

- **Logger / Teacher / Store**: Keep current model — enrollment password and teacher_id from client; Worker does not need to know Google user. Optionally verify enrollment server-side by storing hash of password in env and comparing.
- **Admin (read-only or full)**: Either (a) require `Authorization: Bearer <ADMIN_API_KEY>` or (b) body `key` matching a secret. No Session.getActiveUser() on Cloudflare.

## Client changes

- Remove all `google.script.run.withSuccessHandler(...).withFailureHandler(...).functionName(payload)`.
- Replace with a helper, e.g. `api.post('/api/getBootstrap').then(...).catch(...)` where `api` does `fetch(BASE_URL + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload || {}) })` and returns JSON. Base URL = same origin (Pages and Worker on same domain) or Worker URL during dev.
- In HTML, replace `<?= APP_TITLE ?>` and `<?= BASE_URL ?>` with a small inline script that sets `window.APP_TITLE` and `window.BASE_URL` (or read from a single config.js). For BASE_URL use relative paths like `''` or `'.'` so same-origin API calls work.

## Asset (cha_ching.mp3)

- Either host on Pages (e.g. /assets/cha_ching.mp3) or keep a public URL and set it in client config. No need for Worker to serve the file unless you want to gate it.

## Steps to implement

1. Add `wrangler.toml` and Worker entry (e.g. `worker/index.js` or `src/index.js`) with CORS and route table.
2. Implement Sheets client in Worker (get access token, read range, append row, update cells, clear row — same as GAS SpreadsheetApp but via REST).
3. Implement each API route by porting the corresponding Code.gs logic (getBootstrap, appendLog, etc.) to use the Sheets client.
4. Add `public/` with HTML/JS; replace GAS template vars with config; add `api.js` that wraps fetch; replace every `google.script.run` call with `api.post(...)`.
5. Deploy: Pages project linked to repo or `wrangler pages deploy public`; Worker with `wrangler deploy`. Use a single custom domain with Worker route `*` and Pages as fallback, or Workers in front of Pages.
6. Set `database_id` in wrangler.toml; optional `wrangler secret put ADMIN_API_KEY`.

## What’s in this repo

- **wrangler.toml** — Worker + D1 binding. Set `database_id` after `wrangler d1 create mtss-db`. Optional: `wrangler secret put ADMIN_API_KEY`.
- **schema.sql** — D1 schema (settings, staff, students, logs, store_catalog, store_redeems, etc.). Run with `wrangler d1 execute mtss-db --remote --file=schema.sql`.
- **worker/index.js** — Worker: CORS, `/api/*` and `/api/admin/*`, **D1 only** (no Google). Implements getBootstrap, verifyEnrollment, appendLog, teacherDashboardData, storeBootstrap, storeGetBalance, storeRedeem, updateLog, deleteLog, undoConcernNugget, assignStudentToPending, admin/getAllData, admin/getAllDataAuthed. Admin PDF/email not implemented yet.
- **public/api.js** — Drop-in for `google.script.run`; set `window.API_BASE = ''` when same origin.
- **public/** — Your HTML (index.html, teacher.html, store.html, admin.html, home.html) + api.js; replace GAS template vars with window.APP_TITLE / window.BASE_URL.

## Checklist

- [x] wrangler.toml + D1 binding
- [x] schema.sql + default settings seed
- [x] Worker with D1 (no Google)
- [x] Core /api/* handlers
- [ ] Admin buildReportPdfBase64 + emailReportPdf (optional; add later)
- [ ] Copy HTML into public/, add api.js, replace template vars
- [ ] Create D1 DB, apply schema, put database_id in wrangler.toml
- [ ] Deploy Worker + Pages; optional ADMIN_API_KEY secret
