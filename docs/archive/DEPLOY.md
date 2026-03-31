# MTSS Nuggets — Deploy checklist (Cloudflare Pages + Worker + D1)

## Goal

- **Single origin**: https://tmsnuggets.pages.dev serves both the UI and the API at `/api/*` (no CORS, no separate workers.dev URL).
- Frontend uses `API_BASE = ''` so all calls go to same-origin `/api/...`.

---

## You don’t have a Worker yet — create it by deploying

The Worker lives in your repo (`worker/index.js` + `wrangler.toml`) but **doesn’t exist in Cloudflare until you deploy it**. Do this once:

1. **Create the D1 database** (if you haven’t):  
   `npx wrangler d1 create mtss-db`  
   Copy the `database_id` from the output into `wrangler.toml` under `[[d1_databases]]` → `database_id`.

2. **Apply the schema**:  
   `npx wrangler d1 execute mtss-db --remote --file=schema.sql`

3. **Deploy the Worker** (this creates the Worker in your Cloudflare account):  
   `npx wrangler deploy`  
   You’ll be prompted to log in to Cloudflare if needed. When it finishes, you’ll see a workers.dev URL; the Worker is now created.

4. **Add the route** so your Pages site uses it for `/api/*`:
   - **Cloudflare Dashboard** → **Workers & Pages** (left sidebar).
   - You should now see your Worker (e.g. `mtss-behavior-log`). Click it.
   - **Settings** → **Triggers** → **Routes** → **Add route**:
     - **Route:** `tmsnuggets.pages.dev/api/*`
     - **Worker:** this Worker.
   - Save.

After that, `https://tmsnuggets.pages.dev/api/getBootstrap` will hit the Worker and return JSON.

---

## If /api/getBootstrap still returns HTML

That means **/api/* requests are still going to Pages**, not to your Worker (e.g. the route isn’t set or the Worker wasn’t deployed).

**Fix:** Deploy the Worker (`npx wrangler deploy`), then add the route as in step 4 above. Redeploy after code changes; then open `https://tmsnuggets.pages.dev/api/getBootstrap` again — you should get JSON.

---

## 1. D1 database

- **Create DB** (once):  
  `npx wrangler d1 create mtss-db`  
  Copy the `database_id` from the output.

- **Wire in Worker**: In `wrangler.toml`, set:
  ```toml
  [[d1_databases]]
  binding = "DB"
  database_name = "mtss-db"
  database_id = "<paste-the-id-here>"
  ```

- **Apply schema** (once):  
  `npx wrangler d1 execute mtss-db --remote --file=schema.sql`

- **Seed Student Groups** (once, optional):  
  `npx wrangler d1 execute mtss-db --remote --file=seed-groups.sql`

- **If Grade is missing** (no "Grade" in admin group list, no 6th/7th/8th in dropdowns), run once:  
  `npx wrangler d1 execute mtss-db --remote --file=migrations/004_ensure_grade_category.sql`  
  (If you see "no such column: selection_mode", run first:  
  `npx wrangler d1 execute mtss-db --remote --command="ALTER TABLE student_group_categories ADD COLUMN selection_mode TEXT DEFAULT 'multi';"` then run 004 again.)

- **Seed staff** (so Teacher Dashboard has at least one teacher). Use **teacher_id** = short, display-aligned id (e.g. last name):  
  `npx wrangler d1 execute mtss-db --remote --command="INSERT OR REPLACE INTO staff (teacher_id, teacher_name, is_admin, role) VALUES ('Radle', 'Rick Radle', 'TRUE', 'Teacher');"`  
  (Add more teachers via Admin → Teachers; use IDs like `Radle`, `Smith`, etc.)

- **If you have existing data with teacher_id or last_updated_by `rick`**, standardize to `Radle` once:  
  `npx wrangler d1 execute mtss-db --remote --file=migrations/002_rick_to_radle.sql`  
  If you already ran 002 before it included `last_updated_by`, run:  
  `npx wrangler d1 execute mtss-db --remote --file=migrations/003_last_updated_by_radle.sql`

- **Optional**: Change default enrollment password in DB:  
  `UPDATE settings SET value = 'your-secret' WHERE key = 'enroll_password';`

---

## 2. Worker (backend)

- **Deploy Worker**: From project root,  
  `npx wrangler deploy`  
  (Uses `wrangler.toml`; Worker handles `/api/*` and passes all other requests through to Pages.)

- **Optional secret** (for Admin UI):  
  `npx wrangler secret put ADMIN_API_KEY`  
  Enter a key; the Admin page will send this in the request body for `getAllDataAuthed`.

---

## 3. Single-origin: Worker in front of Pages

So that **https://tmsnuggets.pages.dev/api/getBootstrap** (and every other `/api/*` call) hits your Worker on the same domain:

1. In **Cloudflare Dashboard** go to **Workers & Pages**.
2. Open your **Worker** (e.g. `mtss-behavior-log`).
3. Go to **Settings** → **Triggers** → **Routes**.
4. **Add route**:
   - **Route**: `tmsnuggets.pages.dev/api/*`  
     (so only `/api/*` goes to the Worker; `/`, `/teacher.html`, etc. stay on Pages)
   - **Worker**: select this Worker.
5. Save.

**Alternative** (Worker in front of everything): Route `tmsnuggets.pages.dev/*`. Then the Worker receives all requests; it handles `/api/*` and passes the rest through to Pages (already implemented in the Worker).

---

## 4. Frontend (Pages)

- Repo is already connected; **public/** is the build output (or the directory you set in Pages project settings).
- **GAS template tags have been removed** from `public/index.html`, `public/teacher.html`, and `public/store.html`. `BASE_URL` is `""`, `APP_TITLE` is `"Nugget Notes"`, and SFX/RESET vars are set so Pages can serve the files as-is.
- For **same-origin API**, do not set `window.API_BASE` (or set it to `''`). Then all requests go to `/api/*` on the same domain.

---

## 5. Verify

- **Backend reachable**: Open  
  `https://tmsnuggets.pages.dev/api/getBootstrap`  
  You should get JSON like `{ "ok": true, "staff": [...], "students": [...], "enroll_version": "1" }`. If you get 404 or a non-JSON page, the route or Worker binding is wrong.

- **UI flow**: From the Nugget Notes page, pick a teacher (enrollment password from settings, default ENROLL2026), add a note, open Teacher Dashboard and School Store. Confirm data loads and a new log appears (check D1 or the dashboard).

- **D1**: In **Workers & Pages** → **D1** → your database → **Console**, run `SELECT * FROM logs ORDER BY timestamp DESC LIMIT 5;` after adding a log from the UI.

---

## Quick reference

| Item            | Where / Command |
|-----------------|------------------|
| Create D1       | `npx wrangler d1 create mtss-db` |
| Schema          | `npx wrangler d1 execute mtss-db --remote --file=schema.sql` |
| Seed staff      | `npx wrangler d1 execute mtss-db --remote --command="INSERT INTO staff ..."` |
| Deploy Worker   | `npx wrangler deploy` |
| Route (same-origin) | Dashboard → Worker → Triggers → Route `*tmsnuggets.pages.dev/*` or `*tmsnuggets.pages.dev/api/*` |
| API test        | `https://tmsnuggets.pages.dev/api/getBootstrap` → JSON |
| Frontend API    | `API_BASE` unset or `''` so requests go to `/api/*` on same domain |
