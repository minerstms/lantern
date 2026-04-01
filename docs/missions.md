# Missions System

## Submission Flow

1. Student submits a mission through the app.
2. The submission is stored in **`lantern_mission_submissions`** (one row per submission).

## Approval Flow

- The teacher **updates the same row** via the Worker (approve route):  
  **`status = 'accepted'`**, plus **`reviewed_by`** and **`reviewed_at`** (and the mission must have been **`pending`** to approve).

**There is no:**

- Second “published” table for the same submission.
- Separate publish step that copies the row.
- Duplication of the submission into another store for Explore visibility.

Rejected / returned flows also update the same row with different status values (see Worker routes).

## Visibility Model

**Visibility is query-based only.**

| Surface | Endpoint (Worker) | Role |
|--------|-------------------|------|
| Profile (per character) | **`GET /api/missions/submissions/character?character_name=...`** | Lists submissions for that character (includes multiple statuses for the student/teacher view). |
| Explore (approved mission work in the merged feed) | **`GET /api/missions/submissions/approved`** (optional `limit`) | Returns rows with **`status = 'accepted'`** and not hidden (`hidden_at` empty). |

The Worker joins mission metadata (for example title, teacher name) from **`lantern_missions`** when building each response.

## Explore Behavior

Explore mixes several rails. Important distinctions:

**Mission spotlight (“Missions & Actions” → Missions lane)**  
- Loaded from **`GET /api/missions/active`** (with optional `character_name`).  
- These are **active mission definitions** (things students can do), not the merged “latest student work” feed.

**Announcements (section title “Announcements”)**  
- **Approved official news** (teacher/staff/admin articles) from the news pipeline.  
- Plus **posts from the merged feed** that have **`teacher_pick`** or **`teacher_featured`**.  
- Approved mission completions mapped for the feed are created with **`teacher_pick: false`** and **`teacher_featured: false`** in `explore.html`, so **student mission completions are not promoted into this rail via those flags**.

**Just In** and **Latest Posts** (the main chronological rails)  
- Both use the **same merged `feed`** array: **explore feed posts** plus **`/api/missions/submissions/approved`** merged in (see `loadLatestPostsLegacyMergeThenRender` / dataset path in `explore.html`).  
- **UI label** for the big merged rail is **“Latest Posts”** (`#recentSection`, `data-help="latest_creations"`). **“Just In”** is a second rail using the same pool (newest-first), not a separate API for missions.

So: **approved mission submissions appear in the merged feed rails (Just In + Latest Posts), not in the mission spotlight rail (which is `/api/missions/active`).**

## Image Submissions

- **`submission_type === 'image_url'`** — the image URL is often stored in **`submission_content`** as plain text.
- The Worker’s approved/character responses **derive `image_url`** for the client when building the list (including JSON text missions that embed `image_url` / `image` inside `submission_content`).
- The Explore mapper uses **`image_url`** or falls back to **`submission_content`** for `image_url` type when building the card.

## Teacher Attribution

- Responses include **`created_by_teacher_name`** (from the mission’s teacher on `lantern_missions`), used on cards for context.

## Debug Checklist

If an approved mission should appear on Explore but does not:

1. **Class access** — Confirm **`lantern-class-access-resolved`** fired with **`tokenValid: true`** so **`refresh()`** ran.
2. **API** — Open **`GET .../api/missions/submissions/approved`** (same base as `LANTERN_AVATAR_API`) and confirm the row is in **`submissions`** with **`status: "accepted"`** and not hidden.
3. **Console** — Look for **`[explore] visible feed source (legacy)`** or **`[explore] latest from dataset`** (post/mission counts) in `explore.html`.
4. **Section** — Check **Just In** and **Latest Posts**, not the **Missions** spotlight rail (spotlight is active missions, not completed work).
5. **Type** — Card media type comes from image/video/link/text mapping in **`mapApprovedSubmissionToFeedPost`** (`image`, `video`, `link`, or **`create`** when no media URL).
