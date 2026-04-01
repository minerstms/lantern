# Developer Guardrails

These rules protect core Lantern behavior. When in doubt, read **`docs/lantern-architecture.md`**, **`docs/class-access.md`**, and **`docs/missions.md`**.

---

## 1. DO NOT BREAK CLASS ACCESS

- **Explore must not load its main feed and related fetches before access is resolved.** The page listens for **`lantern-class-access-resolved`** and should only run **`refresh()`** (or equivalent) when **`event.detail.tokenValid`** is true.
- **Never auto-fetch Explore data on first paint** without going through that contract — no “fire all APIs on DOMContentLoaded” shortcuts behind the gate.
- **If Explore looks empty or stuck:** check **class access first** (event fired? `tokenValid`? gate visible?). Do not assume missing D1 rows until access is ruled out.

---

## 2. DO NOT ADD A PUBLISH SYSTEM

- Missions **do not** use:
  - separate publish tables
  - row duplication for “going live”
  - sync pipelines between stores
- **Approval** = update the **existing** row in **`lantern_mission_submissions`** (for example `status = 'accepted'`, review timestamps).
- **Visibility** = **which query** you run (`/api/missions/submissions/approved` vs character-scoped endpoints, etc.) — not a second publish step.

---

## 3. DO NOT DUPLICATE DATA

- **No** parallel `approved_missions` table (or similar) for the same submission.
- **No** copying submissions into another system for Explore/Profile visibility.
- Submissions live in **`lantern_mission_submissions`**; APIs join mission metadata from **`lantern_missions`** when needed.

---

## 4. EXPLORE RULES

**Curated sections are not the same as the merged feed rails.**

**Curated (highlights, picks, announcements-style rails):**

- **Announcements** — official approved news plus feed items flagged **`teacher_pick`** / **`teacher_featured`** (student mission completions mapped for Explore do **not** set those flags by default).
- **Featured / teacher-pick style content** — same family of rails: driven by news pipeline + those post flags, not by a separate “publish mission” path.

**Feed (chronological merged student activity):**

- **Just In**
- **Latest Posts**

**Approved student mission work** (submissions merged into the card feed) appears **only** through the **feed** path: **`GET /api/missions/submissions/approved`** merged with the explore post feed. It does **not** belong in the mission spotlight rail (that rail loads **active mission definitions** from **`GET /api/missions/active`**, which is a different thing).

---

## 5. IMAGE HANDLING RULE

- The raw **image URL may live in `submission_content`** (for example `submission_type === 'image_url'`).
- The **Worker** should keep exposing a normalized **`image_url`** on list responses where applicable.
- The **frontend** should read **`image_url`** or fall back to **`url`** (and similar helpers in `mapApprovedSubmissionToFeedPost`) — **never** assume `submission_content` is always display-ready without normalization.

---

## 6. DEBUG ORDER (MANDATORY)

If something is “not showing,” work through this order **before** rewriting features:

1. **Class access** — Did **`lantern-class-access-resolved`** fire with **`tokenValid: true`**?
2. **Endpoint** — Does the relevant **`GET`** return the row in the JSON (e.g. **`/api/missions/submissions/approved`**)?
3. **Section** — Are you looking at **Just In / Latest Posts** for approved mission cards, not the **Missions** spotlight or **Announcements** (unless flags/news apply)?
4. **Normalization** — Is **`image_url` / `url`** present for rendering?
5. **Rendering** — Only then treat it as a pure UI bug.

**Do not** jump straight to large logic rewrites or new tables.

---

## 7. ADMIN CONTROL MODEL (LOCKED)

- **Rick Radle** is the **primary global admin** account (see Worker: `LANTERN_PRIMARY_ADMIN_USERNAME` / display name constants in `worker/index.js`).
- **Admins** set and reset passwords through the existing admin flows (e.g. reset-password API used by the admin UI).
- **Temporary / must-change passwords** — users are steered through **forced password change** (`must_change_password`, change-password page) as already implemented.

**Do not** introduce alternative auth flows, parallel login systems, or ad-hoc bypasses without explicit product/security approval.
