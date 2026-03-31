# Lantern — Missions & Visibility Pipeline

**This document locks in the current working mission approval and visibility system. Do not change behavior without updating this doc.**

---

## 1. Mission approval pipeline

End-to-end flow:

1. **Student submits mission** (via Missions UI).
2. Submission is stored in **one table only:** `lantern_mission_submissions`.
3. **Teacher approves** (via Teacher / Approvals UI):
   - `status` is set to `'accepted'`
   - `reviewed_by` is set
   - `reviewed_at` is set

There is **no second table** and **no separate publish step**. Visibility is determined only by querying this table with the appropriate filters (see Visibility model below).

---

## 2. Visibility model — CRITICAL RULE

Visibility is **query-based only**. There is no duplication, no publish table, and no sync step.

| Consumer | Endpoint | What it gets |
|----------|----------|--------------|
| **Profile / My Creations** | `GET /api/missions/submissions/character?character_name=...` | That character’s submissions where `status = 'accepted'`. |
| **Explore** | `GET /api/missions/submissions/approved?limit=50` | All approved submissions (any character), for merging into the main feed. |

- **No duplication:** The same row in `lantern_mission_submissions` is “visible” on Profile when queried by character and on Explore when queried as approved. No copy to another table.
- **No publish table:** Only `lantern_mission_submissions` with `status = 'accepted'`.
- **No sync step:** No job or process that “publishes” rows; the Worker just reads D1 with the right filters.

---

## 3. Explore page structure

Explore has **two types of surfaces**. Do not assume missions appear everywhere.

### Curated (posts only)

These surfaces show **only** posts (or other curated content). **Approved missions do not appear here.**

- **Spotlight** (hero)
- **Teacher Picks**
- **Featured Creations**

### Feed (mixed content)

- **Latest Creations** is the **only** Explore surface that shows:
  - posts from the explore feed API, and
  - approved mission submissions from `GET /api/missions/submissions/approved`

So: **only Latest Creations** shows both posts and approved missions. Future work must not assume missions appear in Spotlight, Teacher Picks, or Featured unless those systems are explicitly extended to support mission curation.

---

## 4. Image submissions

- **Storage:** When a mission submission is an image, `submission_type === 'image_url'` and the image URL may be stored in **`submission_content`** (as a string).
- **Worker normalization:** The Worker adds an **`image_url`** field to the API response for approved/character submission lists when applicable (e.g. when `submission_type === 'image_url'` or when parsed content contains an image URL).
- **Frontend:** The frontend uses **`url`** and/or **`image_url`** for card previews and teacher review. Explore and Profile normalize mission items so that `getCardImageUrl` / image preview receive the correct URL.

---

## 5. Teacher attribution

- **Created by:** The field **`created_by_teacher_name`** comes from the mission (teacher who created the mission). It appears in:
  - Mission cards (student-facing)
  - Explore feed (Latest Creations)
  - Teacher review UI (mission submission review)
- **Reviewer:** The reviewer (who approved/rejected) is shown in the **teacher review modal** only (not on student-facing cards or Explore).

---

## 6. Debugging checklist

If **missions are not visible** where expected:

1. **Class access** — Check that the class access event fired with `tokenValid === true`. If Explore never receives this, the feed (including missions) will not load. See [Class access](class-access.md).
2. **Approved endpoint** — Confirm the Worker serves `GET /api/missions/submissions/approved` (e.g. returns `{ ok: true, submissions: [...] }`). If the live Worker returns 405 or 404, fix and redeploy the Worker.
3. **Console** — On Explore, check for the log: `[explore] visible feed source: posts=X missions=Y total=Z`. If `missions=0` but you expect approved submissions, the API or filter is the next place to check.
4. **Section** — Confirm you are looking at **Latest Creations**, not Spotlight / Teacher Picks / Featured. Only Latest Creations shows the merged feed (posts + approved missions).
5. **Item type** — For image missions, confirm normalization: items should have `type: 'image'` and `url` / `image_url` set so cards show an image preview. Text-only missions use `type: 'create'`.

---

## Related

- [Lantern architecture](lantern-architecture.md)
- [Class access](class-access.md)
