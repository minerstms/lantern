# TMS Lantern — localStorage Data Structures

All data is stored in `localStorage` with keys prefixed `LANTERN_`. No network, Worker, or D1.

## Actor Identity Model

Across Lantern systems, identity is standardized with these fields:

| Field | Description | Values |
|-------|-------------|--------|
| `actor_id` | Synthetic identifier (never real SIS/email). | `char_alex`, `char_sam`, `teacher_demo`, `staff_demo`, `system` |
| `actor_name` | Display name. | Fictional names only |
| `actor_type` | Role of the actor. | `student`, `teacher`, `staff`, `admin`, `system` |

**FERPA:** All `actor_id` values must be synthetic. Do NOT use emails, SIS IDs, or district staff IDs. Lantern actors remain fictional.

## Visibility + Moderation Model

Content uses shared fields for moderation and visibility:

| Field | Description | Values |
|-------|-------------|--------|
| `visibility` | Who can see the content. | `private`, `teacher_only`, `staff_only`, `school_community` (optional: `display_only`) |
| `moderation_status` | Moderation state. | `pending`, `approved`, `rejected`, `returned` |

**FERPA safeguards:**
- Grade reflections: `visibility = teacher_only`
- Thank-you letters: `visibility = teacher_only` or `staff_only`
- Posts and news: `visibility = school_community` after approval
- Display page: only content with `moderation_status = approved` and `visibility = school_community`

## Backward Compatibility

Legacy fields (`approved`, `rejected`, `returned`, `status`, `feature_eligible`) continue to work. Bridge logic maps them internally, e.g. `approved === true` → `moderation_status = approved`. Do not remove legacy fields.

## Keys

| Key | Structure | Purpose |
|-----|-----------|---------|
| `LANTERN_CHARACTERS` | `[{ character_id, name, avatar, balance, owned }]` | Default characters (ensured on load) |
| `LANTERN_CATALOG` | `[{ item_id, item_name, cost, stock }]` | Physical store items (ensured on load) |
| `LANTERN_ACTIVITY` | `[{ timestamp, character_name, nugget_delta, kind, source, note_text }]` | Earnings, approvals, curations |
| `LANTERN_PURCHASES` | `[{ timestamp, character_name, item_id, item_name, qty, total_cost, note }]` | Store redemptions, game plays |
| `LANTERN_ADOPTED_CHARACTER` | `{ character_id, name, avatar }` | Current adopted character |
| `LANTERN_PENDING_SUBMISSIONS` | `[{ id, character_name, submission_type, note, created_at }]` | Pending teacher approvals |
| `LANTERN_TEACHER_ID` | — | (Reserved) |
| `LANTERN_POSTS` | `[{ id, character_name, actor_id, actor_name, actor_type, type, title, caption, url, created_at, pinned, approved, rejected, returned, moderation_status, visibility, returned_reason, returned_at, feature_eligible }]` | User posts. New posts: approved=false. Discovery shows approved content only. |
| `LANTERN_PROFILES` | `{ [character_name]: { display_name, bio, avatar, frame, theme, featured_post_id } }` | Profile customization |
| `LANTERN_MISSIONS_PROGRESS` | `{ [character_name]: { daily_checkin_last, hidden_nugget, first_game } }` | Mission state |
| `LANTERN_ACHIEVEMENTS` | `{ [character_name]: { [achievement_id]: unlocked_at_iso } }` | Unlocked achievements |
| `LANTERN_POST_REACTIONS` | `{ [post_id]: { [character_name]: { like, favorite, fire } } }` | Post reactions |
| `LANTERN_POST_COMMENTS` | `[{ id, post_id, character_name, actor_id, actor_name, actor_type, text, created_at }]` | Post comments. Unmoderated; consider gating or hiding comment form until moderation exists. |
| `LANTERN_COSMETIC_OWNERSHIP` | `{ [character_name]: { owned: [id], equipped: { [category]: id } } }` | Cosmetic ownership/equip |
| `LANTERN_POST_CURATIONS` | `{ [post_id]: { spotlighted, teacher_featured, teacher_pick, teacher_praise } }` | Teacher curation flags (only for approved posts) |
| `LANTERN_THANKS` | `[{ id, character_name, actor_id, actor_name, actor_type, staff_id, staff_name, staff_designation, text, word_count, nugget_tier, created_at, status, moderation_status, visibility, accepted_at, accepted_by, nugget_awarded, returned_reason, returned_at, returned_by }]` | Thank-you letters. visibility: teacher_only. status: pending, accepted, rejected, returned. |
| `LANTERN_GRADE_REFLECTIONS` | `[{ id, character_name, actor_id, actor_name, actor_type, reflection_text, word_count, nugget_tier, created_at, status, moderation_status, visibility, accepted_at, accepted_by, nugget_awarded, returned_reason, returned_at, returned_by }]` | Grade reflections. visibility: teacher_only. status: pending, accepted, rejected, returned. |
| `LANTERN_CONCERNS` | `[{ id, subject_type, subject_id, character_name, recorded_by, recorded_at, note }]` | Lantern-only concern records. Informational only; no discipline or escalation. subject_type: thanks, grade_reflection, mission_submission, news_article. |
| `LANTERN_STAFF` | `[{ id, name, designation, avatar }]` | Staff directory for thank-you letters |
| `LANTERN_ACTIVITY_EVENTS` | `[{ id, actor_id, actor_name, actor_type, object_type, object_id, event_type, created_at, meta }]` | Global activity stream (merge-friendly event model) |
| `LANTERN_TEACHER_MISSIONS` | `[{ id, title, description, reward_amount, submission_type, created_by_teacher_id, created_by_teacher_name, actor_id, actor_name, actor_type, due_date, active, created_at }]` | Teacher-created missions. submission_type: text, link, image_url, confirmation. active: boolean. |
| `LANTERN_MISSION_SUBMISSIONS` | `[{ id, mission_id, character_name, actor_id, actor_name, actor_type, submission_type, submission_content, status, moderation_status, visibility, returned_reason, returned_at, returned_by, created_at }]` | Mission completions. visibility: teacher_only. status: pending, accepted, rejected, returned. |
| `LANTERN_NEWS` | `[{ id, title, body, category, author_name, author_type, actor_id, actor_name, actor_type, status, moderation_status, visibility, created_at, approved_at, approved_by, feature_eligible, returned_reason, returned_at, returned_by }]` | News articles. visibility: school_community after approval. status: pending, approved, rejected, returned. author_type: student, teacher, staff, admin. |
| `LANTERN_NUGGET_HUNT` | `{ spawn_date, page, x, y, rarity, nuggets, hint_text, claims }` | Daily nugget hunt. One spawn per day on index/explore/store/games/news. claims: { [character_name]: claimed_at }. rarity: normal/shiny/golden/legendary → 1/2/3/5 nuggets. |
| `LANTERN_CURRENT_ROLE` | `"student"` \| `"teacher"` \| `"staff"` \| `"admin"` | Role simulation for page behavior/testing. Teachers and staff are role-simulated, not adoptable characters. Default: student. |

## Role Simulation

Teachers and staff are role-simulated, not modeled as adoptable characters. Use `LANTERN_CURRENT_ROLE` only for page behavior/testing where needed. Allowed values: `student`, `teacher`, `staff`, `admin`. Access via `LANTERN_DATA.getCurrentRole()` and `LANTERN_DATA.setCurrentRole(role)`.

## Bootstrap

- `ensureCharacters()` — Restores default characters if missing or empty
- `ensureCatalog()` — Restores default catalog if missing or empty
- `ensureStaff()` — Restores staff directory if missing or empty
- All run on page load for index, store, teacher, games

## Reset

- `resetAllLanternData()` — Removes all `LANTERN_*` keys. Call then reload.
- `seedDemoContent()` — Adds sample posts and activity if sparse. Safe to call multiple times.
