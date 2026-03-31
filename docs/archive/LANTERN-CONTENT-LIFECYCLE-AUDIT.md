# Lantern content lifecycle audit and reseed plan

**Purpose:** Audit lifecycle controls for major content types, confirm mission Deactivate behavior, and recommend a safe reseed/reset strategy. No broad redesign—clarity and cleanup direction only.

---

## 1. Findings summary

| Area | Finding |
|------|--------|
| **Missions** | **Deactivate works.** Worker PATCH `/api/missions/:id` supports `active`; GET `/api/missions/active` uses `WHERE active = 1`. Student-facing mission list and submit flow both respect `active`. Teacher UI calls Worker PATCH when `LANTERN_AVATAR_API` is set. |
| **Teacher missions list** | Mission list on teacher page comes from `callDashboard()` (stub/backend). When using **Worker-only** (no MTSS dashboard), the dashboard may not return `teacherMissions`, so the teacher might see "No missions yet" even if D1 has missions. Consider also fetching GET `/api/missions/teacher` when `avatarApiBase` is set and merging into `teacherMissions`. |
| **Posts / creations** | **No Worker table for posts.** Student "posts" come from (1) stub `getPosts()` (localStorage) and (2) Worker `GET /api/missions/submissions/character` (accepted mission submissions). "Delete post" in the app only hits the stub (`deletePost` in `lantern-api.js` removes from localStorage). There is no delete/hide in the Worker for a generic "post" table. |
| **News** | Lifecycle is **status-driven**: `pending` → `approved` / `returned` / `rejected`. No "delete" or "hide" in UI or Worker; rows stay. Demo clear: `019_lantern_clear_demo.sql` deletes `id LIKE 'demo-%'`. |
| **Polls** | Visibility is **approval-only**: `WHERE approved_at IS NOT NULL`. No delete/deactivate/hide column or endpoint; once approved, polls stay visible. |
| **Seed/demo** | `018_lantern_seed_demo.sql` seeds wallets, transactions, and news only. Missions are seeded in **026/027/028** (`INSERT OR REPLACE`). Re-running 026/027/028 overwrites permanent missions; 018 does not touch missions. |

---

## 2. Mission deactivate behavior

### What it does

- **Teacher UI** (`teacher.html`): "Deactivate" / "Activate" button sends `PATCH /api/missions/:id` with `{ active: !m.active }` when `avatarApiBase` (e.g. `LANTERN_AVATAR_API`) is set.
- **Worker** (`lantern-worker/index.js`):
  - **PATCH** (lines ~1301–1330): Accepts `body.active`, updates `lantern_missions.active` to 0 or 1.
  - **GET /api/missions/active**: `SELECT ... FROM lantern_missions WHERE active = 1 ORDER BY ...`.
  - **POST /api/missions/submit**: Rejects if `mission.active === 0` with `"Mission is not active"`.

### Do student queries respect it?

- **Yes.** Student-facing mission list uses **GET /api/missions/active** (e.g. `missions.html`, `explore.html`), which only returns rows with `active = 1`. Deactivated missions are excluded. Submitting to a deactivated mission is blocked by the Worker.

**Conclusion:** Mission Deactivate is implemented correctly; student visibility and submit checks respect `active`.

---

## 3. Content lifecycle map by type

### Missions

| Action | Where | Behavior |
|--------|--------|----------|
| Create | Teacher UI → POST `/api/missions` | Inserts into `lantern_missions` with `active = 1`. |
| List (teacher) | `callDashboard()` (stub) → optionally should also use GET `/api/missions/teacher` when using Worker | Stub returns `teacherMissions`; Worker returns all missions for teacher (no `active` filter). |
| List (student) | GET `/api/missions/active` | Only `active = 1`. |
| Deactivate / Activate | Teacher UI → PATCH `/api/missions/:id` `{ active }` | Updates `active`; student list and submit respect it. |
| Delete | Not implemented | No hard delete or soft-delete column. |

### Posts / creations

| Action | Where | Behavior |
|--------|--------|----------|
| List (profile) | Stub `getPosts(character_name)` + Worker GET `/api/missions/submissions/character` | Merged: stub "posts" + accepted mission submissions. |
| Delete | Stub only: `deletePost(id)` in `lantern-api.js` | Removes from localStorage only. No Worker endpoint; no D1 "posts" table. |
| Hide / archive | Not implemented | No status or hide flag. |

### News

| Action | Where | Behavior |
|--------|--------|----------|
| Submit | POST → `lantern_news_submissions` + `lantern_approvals` | Status `pending`. |
| List (approved) | GET `/api/news/approved` | `WHERE status = 'approved'`. |
| List (mine) | GET `/api/news/mine` | By author; all statuses. |
| Moderate | Approve / Return / Reject via approvals | Updates `lantern_news_submissions.status` and `lantern_approvals.status`. |
| Delete | Not in UI | Only bulk demo clear: `DELETE ... WHERE id LIKE 'demo-%'` in 019. |

### Polls

| Action | Where | Behavior |
|--------|--------|----------|
| Create | When a poll-type mission submission is approved | Insert into `lantern_polls` with `approved_at`. |
| List | GET polls: `WHERE approved_at IS NOT NULL` | Only approved polls shown. |
| Delete / hide | Not implemented | No status or hide; no endpoint. |

### Test / demo data

| Data | Seeded in | Cleared in |
|------|-----------|------------|
| Wallets (demo names) | 018 | 019 |
| Transactions (demo-*) | 018 | 019 |
| News (demo-news-*) | 018 | 019 |
| Permanent missions | 026, 027, 028 | Not cleared; re-run overwrites with INSERT OR REPLACE |
| Test students | User-created via POST `/api/test-students` | Not in 018/019 |

---

## 4. Legacy seed/demo data risks

- **018_lantern_seed_demo.sql**  
  - Inserts fixed demo wallets, transactions, and news.  
  - **Risk:** Column set must match current schema (e.g. `lantern_news_submissions` has grown with video, etc.). 018 uses the columns that existed at that migration; later migrations (e.g. 024) add columns. Re-running 018 may leave new columns NULL—acceptable if schema uses defaults or nullable.  
  - **No missions:** 018 does not insert missions; permanent missions come from 026/027/028.

- **026 / 027 / 028**  
  - Use `INSERT OR REPLACE` for permanent missions. Re-running re-seeds those rows (same IDs). Safe and idempotent.

- **019_lantern_clear_demo.sql**  
  - Only deletes demo wallets, transactions, and news. Does **not** clear missions, mission submissions, approvals, polls, or test students. So "clear demo" is partial.

- **Stub vs Worker**  
  - If the app sometimes uses stub (e.g. `getPosts`, `teacherDashboardData`) and sometimes Worker, "creations" can be a mix of localStorage and D1. Reseed does not clear localStorage; users may still see old stub-only posts until they clear site data or stub is phased out.

---

## 5. Recommended reseed/reset plan

**Goal:** Align DB with current schema and clear or re-seed demo content without breaking the query-driven architecture.

1. **Apply migrations in order** (if not already):
   - Schema: 014, 015, 016, 017, 023, 024, 025, 026, 027, 028, 029, 030 (and any others in your chain).
   - Use **lantern-worker/migrations/** or root **migrations/** consistently for D1 (lantern-db) as decided earlier.

2. **Clear demo content (optional):**
   ```bash
   npx wrangler d1 execute lantern-db --remote --file=migrations/019_lantern_clear_demo.sql
   ```
   This removes demo wallets, transactions, and news only.

3. **Re-seed demo (optional):**
   ```bash
   npx wrangler d1 execute lantern-db --remote --file=migrations/018_lantern_seed_demo.sql
   ```
   Restores demo wallets, transactions, and news. Confirm 018 column list matches current `lantern_news_submissions` (and related tables) or add missing columns in a small follow-up migration if needed.

4. **Re-seed permanent missions (optional):**
   Re-run 026, 027, 028 to reset permanent missions to the defined set (INSERT OR REPLACE).

5. **Do not** delete mission submissions, approvals, or test students unless you add and run explicit cleanup scripts. 019 does not touch them.

6. **Local/stub data:** Reseed does not clear browser localStorage. If the stub is used for posts/dashboard, consider documenting "clear site data" or "re-login" for a full reset feel, or phase out stub for those features.

---

## 6. Minimal next fixes before reseeding

1. **Teacher missions list when Worker-only**  
   When `avatarApiBase` is set and dashboard is Worker-only, fetch GET `/api/missions/teacher?teacher_id=...` and set (or merge into) `teacherMissions` so the teacher sees missions from D1 and can use Deactivate. Small change in `teacher.html` refresh path.

2. **018 vs current news schema**  
   If 024 (or later) added columns to `lantern_news_submissions`, ensure 018 inserts either include those columns or that the table allows NULL/default. Adjust 018 or add a one-line migration if something fails on re-seed.

3. **No new tables or broad redesign**  
   Lifecycle is consistent with current design: missions use `active`; news/polls use status/approval; posts are stub + mission submissions. Optional follow-ups (e.g. soft-delete for news, or hide for polls) can be done later as small, targeted changes.

---

**File:** `docs/LANTERN-CONTENT-LIFECYCLE-AUDIT.md`  
**Constraints respected:** No broad redesign, no unnecessary new tables, query-driven architecture preserved, minimal and safe reseed plan.
