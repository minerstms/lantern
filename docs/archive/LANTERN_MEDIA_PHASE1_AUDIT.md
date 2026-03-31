# Lantern Media Completion Phase — Phase 1 Audit

## 1. All current media-capable submission paths

| Path | Location | Media types | How submitted |
|------|----------|-------------|----------------|
| **News** | news.html | Image (file), Video (file .mp4/.webm), Link (URL) | Form: image file → crop → upload to `/api/news/upload-image`; video file → upload to `/api/news/upload-video`; link in `newsLinkUrl`. Then `callCreateNewsArticle(payload)` with image_r2_key / video_r2_key / link_url. |
| **Missions** | missions.html | Image (file + URL), Video (URL only), Link (URL), Text | Image: file → `callUploadMissionImage` → `/api/news/upload-image` → URL in `missionSubmitImageUrl`; or paste URL. Video: **URL only** in `missionSubmitVideoUrl`. Link: `missionSubmitUrl`. Submit via `callSubmitMissionCompletion(missionId, characterName, type, content)` with submission_type in `text` / `image_url` / `link` and submission_content = string (URL or text). |
| **Explore/Profile posts** | index.html | Image, link, video (URL) | Profile “Create” post: type + URL; no file upload for posts. |
| **Avatar** | index.html | Image (file) | File → upload to `/api/avatar/upload` → pending approval. |
| **Teacher recognition** | teacher.html | Text only | No media; message + category. No moderation. |

## 2. All current teacher submission paths

| Path | Where | What |
|------|--------|------|
| **News as teacher** | news.html | User selects “Teacher Contributor” in `newsAuthorType`; same form as student. Payload includes `author_type: 'teacher'`. Worker stores author_type but **always** sets status = `pending` and creates approval row. |
| **Mission create** | teacher.html | Teacher creates missions (POST `/api/missions/create`). No “submission” by teacher to a mission; missions are created by teachers, submitted by students. |
| **Teacher recognition** | teacher.html | POST recognition for a student; no approval queue. |
| **Avatar** | — | No separate “teacher avatar” path; avatars are per character (student). |

So the only teacher *content* submission that currently goes to an approval queue is **News** when submitted with author_type = teacher.

## 3. All current approval points

| Item type | Table / ID | Approval table | Where approved |
|-----------|------------|----------------|----------------|
| **News** | lantern_news_submissions.id | lantern_approvals (item_type='news', item_id) | Teacher dashboard: Approvals → News; POST `/api/approvals/review` with action approve/reject/return. Worker updates lantern_news_submissions.status to approved/rejected/returned. |
| **Missions** | lantern_mission_submissions.id | No separate approvals table | Teacher dashboard: Mission submissions; POST `/api/missions/submissions/approve` or reject/return. Worker updates lantern_mission_submissions.status to accepted/rejected/pending (returned). |
| **Avatar** | lantern_avatar_submissions.id | lantern_approvals (item_type='avatar') | Teacher dashboard: Approvals → Avatar; POST `/api/approvals/review` or `/api/avatar/approve` and `/api/avatar/reject`. |

## 4. Where teacher-submitted content could bypass approval

- **News**: When `author_type === 'teacher'` (or 'staff' / 'admin'), Worker can set `lantern_news_submissions.status = 'approved'` and `reviewed_at = now` on insert, and either skip creating a pending approval row or create it as already approved. **Implementation**: In `POST /api/news/create`, if author_type is one of teacher/staff/admin, set status = 'approved', reviewed_at = now, and do not create a row in lantern_approvals (or create with status = 'approved'). Student submissions unchanged: status = 'pending', create approval.
- Missions: Teachers do not submit to missions; no change.
- Avatar: No “teacher avatar” path; no change.

## 5. Current mission video-file-upload gaps

- **Backend**: `POST /api/missions/submit` accepts submission_type in `['text','link','image_url','confirmation','poll','bug_report']`. There is no `video` type. For “video” missions, frontend sends submission_type `'link'` and submission_content = video URL (user pastes URL). So **no video file upload** for missions.
- **Frontend**: missions.html has “Video URL” input only; no file input for video. Note under field: “Paste a video link only; mission video file upload is not supported.”
- **Display**: Teacher review and explore treat mission “video” as link (text/URL). Approved mission submissions with image_url are shown as image; link/video URL is not rendered as `<video>`.
- **To add real video file support**: (1) Add submission_type `'video'` in Worker and store video URL in submission_content (upload to `/api/news/upload-video`, then submission_content = origin + '/api/news/video?key=' + key). (2) missions.html: add video file input, accept video/mp4,video/webm, upload on submit, send type 'video', content = video URL. (3) Worker approved/character responses: include video_url when submission_type === 'video' (submission_content is the URL). (4) Teacher review and explore: render video when submission_type === 'video' or when link URL is video (e.g. /api/news/video?key=).

## 6. Remaining inconsistent media rendering across surfaces

| Surface | News | Missions |
|---------|------|----------|
| **news.html** | Uses LanternMedia.renderMedia(item, { variant: 'newsFeatured' / 'newsList' }) → imgBlock, videoBlock, linkBlock; precedence is implicit (all three can show; typically one). | N/A |
| **explore.html** | Uses LanternMedia.renderMedia(n, { variant: 'explore' }) → single mediaBlock with precedence: image → video → link. | Mission cards: only image_url; no video/link rendering. missionImageUrl(s) → type 'image' or 'create'; video/link submissions become 'create' with no media. |
| **teacher.html** | News review uses LanternMedia.renderMedia(item, { variant: 'teacher' }) → imageHtml, videoHtml, linkHtml. | Mission review: custom block; image when isImageMission + missionImageUrl; else text + optional image. **No** LanternMedia; no video or link rendering for missions. |
| **Precedence** | LanternMedia (explore variant) is image → video → link. News list/featured can show multiple. | Mission: image only; video/link not rendered as media. |

So inconsistencies: (1) Mission submissions with video (URL) or link are not rendered as video/link in teacher review or explore. (2) When we add mission video file, we need teacher and explore to use a single precedence: image → video → link → text.

---

# Implementation Summary (Phases 2–5 completed)

## Phase 2 — Teacher auto-approval
- **Worker** `POST /api/news/create`: If `author_type` is `teacher`, `staff`, or `admin`, set `status = 'approved'`, `reviewed_at = now`, `reviewed_by_staff_name = authorName`; do not create a row in `lantern_approvals`. Student submissions unchanged.
- **news.html**: Toast shows "Published! Your article is live." when `res.status === 'approved'`, else "Submitted! Your article is now in the teacher review queue."

## Phase 3 — Mission video file upload
- **Worker**: `submission_type` now allows `'video'`. Store video playback URL in `submission_content`. GET `/api/missions/submissions/teacher`, `/approved`, `/character` include `video_url` when `submission_type === 'video'`.
- **missions.html**: Video file input (accept="video/mp4,video/webm"), placeholder "Tap to choose a video file", upload via `callUploadMissionVideo` → `/api/news/upload-video`, then submit with `type: 'video'`, `content: missionVideoUploadedUrl`. "Or paste a video link" still sends `type: 'link'`. Remove-video button clears file and URL.

## Phase 4 — Shared media helpers
- **js/lantern-media.js**: Added `normalizeMissionItemForMedia(item)` returning `{ image_url?, video_url?, link_url? }` from mission submission_type/submission_content/image_url/video_url. Exposed on `LanternMedia`.

## Phase 5 — Standardize display
- **News (news.html)**: Featured and list use single media block: `imgBlock || videoBlock || linkBlock` (image → video → link).
- **Teacher (teacher.html)**: News review uses `teacherMedia.imageHtml || teacherMedia.videoHtml || teacherMedia.linkHtml`. Mission review uses `normalizeMissionItemForMedia` + `renderMedia(..., 'teacher')` and single block in same precedence.
- **Explore (explore.html)**: Mission items include `video_url` and `link_url`; `type` is `image`|`video`|`link`|`create`. `renderCard` uses `LanternMedia.renderMedia` for items with any of `image_url`/`video_url`/`link_url` (single mediaBlock with precedence).
