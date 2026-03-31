# Lantern Schema Contract

This file is the canonical schema contract for Lantern Worker + D1.
All worker/frontend field usage must match this file.

Source baseline:
- `migrations/014` through `migrations/035`
- `lantern-worker/schema-verify.sql`

Note:
- `lantern_news` table does not exist in current Lantern schema.
- News content is stored in `lantern_news_submissions`.

## lantern_avatar_submissions

Purpose:
Stores avatar uploads and moderation lifecycle for student avatar changes.

Columns:
- `id TEXT PRIMARY KEY`
- `character_name TEXT NOT NULL`
- `image_key TEXT NOT NULL`
- `status TEXT NOT NULL DEFAULT 'pending'`
- `created_at TEXT NOT NULL`
- `approved_at TEXT NULL`
- `approved_by TEXT NULL`
- `rejected_at TEXT NULL`
- `rejected_by TEXT NULL`
- `rejected_reason TEXT NULL`

Write sources:
- Student avatar upload submit.
- Teacher/staff avatar approve/reject flows.

Read sources:
- Avatar moderation queue.
- Avatar status lookup for a character.

UI surfaces:
- Profile avatar status and approved avatar display.
- Teacher moderation approvals views.

## lantern_avatar_profiles

Purpose:
Stores the active approved avatar pointer per character.

Columns:
- `character_name TEXT PRIMARY KEY`
- `current_avatar_key TEXT NOT NULL`
- `updated_at TEXT NOT NULL`

Write sources:
- Avatar approval flow (upsert active avatar).

Read sources:
- Avatar status endpoint.
- Canonical avatar rendering paths.

UI surfaces:
- Profile hero avatar.
- Cards/rails using canonical avatar image.

## lantern_wallets

Purpose:
Stores nugget balance per character.

Columns:
- `character_name TEXT PRIMARY KEY`
- `balance INTEGER NOT NULL DEFAULT 0`
- `updated_at TEXT NOT NULL`

Write sources:
- Economy transaction application (balance increment/decrement).

Read sources:
- Balance and summary endpoints.

UI surfaces:
- Profile nugget balance/progress.
- Store purchasing checks.

## lantern_transactions

Purpose:
Immutable ledger of nugget economy events.

Columns:
- `id TEXT PRIMARY KEY`
- `character_name TEXT NOT NULL`
- `delta INTEGER NOT NULL`
- `kind TEXT DEFAULT ''`
- `source TEXT DEFAULT ''`
- `note TEXT DEFAULT ''`
- `created_at TEXT NOT NULL`
- `meta_json TEXT NULL`

Write sources:
- Economy award/spend events.

Read sources:
- Balance history and activity summaries.

UI surfaces:
- Profile activity/history elements.
- Economy debug/audit APIs.

## lantern_news_submissions

Purpose:
Stores Lantern news article submissions and moderation lifecycle.

Columns:
- `id TEXT PRIMARY KEY`
- `title TEXT NOT NULL`
- `body TEXT NOT NULL`
- `actor_id TEXT NULL`
- `author_name TEXT NOT NULL`
- `author_type TEXT NOT NULL DEFAULT 'student'`
- `image_r2_key TEXT NULL`
- `image_file_name TEXT NULL`
- `image_mime_type TEXT NULL`
- `image_file_size INTEGER NULL`
- `photo_credit TEXT NULL`
- `status TEXT NOT NULL DEFAULT 'pending'`
- `created_at TEXT NOT NULL`
- `reviewed_at TEXT NULL`
- `reviewed_by_staff_id TEXT NULL`
- `reviewed_by_staff_name TEXT NULL`
- `decision_note TEXT NULL`
- `video_r2_key TEXT NULL`
- `video_file_name TEXT NULL`
- `video_mime_type TEXT NULL`
- `video_file_size INTEGER NULL`
- `link_url TEXT NULL`
- `full_image_r2_key TEXT NULL`
- `hidden_at TEXT NULL`
- `hidden_by TEXT NULL`

Write sources:
- News submission create.
- News approve/return/reject/resubmit.
- News hide/unhide moderation actions.

Read sources:
- Approved news feed.
- Author "my submissions" view.
- Moderation/approvals detail joins.

UI surfaces:
- News page feed/cards.
- Profile recognition-derived surfaces that include approved news-derived shoutouts.
- Teacher moderation tools.

## lantern_approvals

Purpose:
Shared moderation queue metadata for content types (news, avatar, poll contribution).

Columns:
- `id TEXT PRIMARY KEY`
- `item_type TEXT NOT NULL`
- `item_id TEXT NOT NULL`
- `status TEXT NOT NULL DEFAULT 'pending'`
- `submitted_by_actor_id TEXT NULL`
- `submitted_by_actor_name TEXT NULL`
- `assigned_to_staff_id TEXT NULL`
- `assigned_to_staff_name TEXT NULL`
- `suggested_staff_id TEXT NULL`
- `suggested_staff_name TEXT NULL`
- `school_id TEXT NULL`
- `created_at TEXT NOT NULL`
- `reviewed_at TEXT NULL`
- `reviewed_by_staff_id TEXT NULL`
- `reviewed_by_staff_name TEXT NULL`
- `decision_note TEXT NULL`

Write sources:
- Creation of moderation work items for avatar/news/poll contributions.
- Approval assignment and decision endpoints.

Read sources:
- Pending approvals queue.
- Approval history endpoints.

UI surfaces:
- Teacher/staff moderation queue.
- Approval history and review tooling.

## lantern_teacher_recognition

Purpose:
Stores teacher-authored recognition messages for students.

Columns:
- `id TEXT PRIMARY KEY`
- `character_name TEXT NOT NULL`
- `message TEXT NOT NULL`
- `category TEXT NULL`
- `created_at TEXT NOT NULL`
- `created_by_teacher_id TEXT NULL`
- `created_by_teacher_name TEXT NULL`

Write sources:
- Teacher recognition creation flow.

Read sources:
- Recognition list endpoints.

UI surfaces:
- Profile spotlight/wins surfaces.

## lantern_reactions

Purpose:
Stores student reactions on approved content (one reaction type per item+character uniqueness).

Columns:
- `id TEXT PRIMARY KEY`
- `item_type TEXT NOT NULL`
- `item_id TEXT NOT NULL`
- `reaction_type TEXT NOT NULL`
- `character_name TEXT NOT NULL`
- `created_at TEXT NOT NULL`

Write sources:
- Reaction toggle/add/remove flow.

Read sources:
- Reaction counts/breakdowns.

UI surfaces:
- Cards with reaction counts.
- Profile reaction summary modules.

## lantern_early_encourager_rewards

Purpose:
Tracks one-time reward grants for early reaction behavior to prevent duplicate payouts.

Columns:
- `id TEXT PRIMARY KEY`
- `character_name TEXT NOT NULL`
- `item_type TEXT NOT NULL`
- `item_id TEXT NOT NULL`
- `rewarded_at TEXT NOT NULL`

Write sources:
- Economy/reaction reward grant logic.

Read sources:
- Reward dedup and daily cap checks.

UI surfaces:
- Indirect only (economy totals and activity).

## lantern_praise_preferences

Purpose:
Stores allowed reaction vocabulary preferences per character.

Columns:
- `character_name TEXT PRIMARY KEY`
- `reaction_types TEXT NOT NULL`
- `updated_at TEXT NOT NULL`

Write sources:
- Preference save endpoints.

Read sources:
- Reaction UX personalization.

UI surfaces:
- Reaction picker configuration.

## lantern_missions

Purpose:
Stores teacher missions and mission configuration.

Columns:
- `id TEXT PRIMARY KEY`
- `teacher_id TEXT NOT NULL DEFAULT 'teacher'`
- `teacher_name TEXT NOT NULL DEFAULT 'Teacher'`
- `title TEXT NOT NULL`
- `description TEXT NOT NULL DEFAULT ''`
- `reward_amount INTEGER NOT NULL DEFAULT 3`
- `submission_type TEXT NOT NULL DEFAULT 'text'`
- `audience TEXT NOT NULL DEFAULT 'school_mission'`
- `target_character_names TEXT NULL`
- `featured INTEGER NOT NULL DEFAULT 0`
- `active INTEGER NOT NULL DEFAULT 1`
- `site_eligible INTEGER NOT NULL DEFAULT 0`
- `created_at TEXT NOT NULL`
- `allows_text INTEGER NOT NULL DEFAULT 1`
- `allows_image INTEGER NOT NULL DEFAULT 0`
- `allows_video INTEGER NOT NULL DEFAULT 0`
- `allows_link INTEGER NOT NULL DEFAULT 0`
- `min_characters INTEGER NOT NULL DEFAULT 200`

Write sources:
- Teacher mission create/update.
- Permanent mission seed/update migrations.

Read sources:
- Student mission availability endpoints.
- Teacher mission management endpoints.

UI surfaces:
- Missions page (student + teacher views).

## lantern_mission_submissions

Purpose:
Stores student mission submissions and moderation lifecycle.

Columns:
- `id TEXT PRIMARY KEY`
- `mission_id TEXT NOT NULL`
- `character_name TEXT NOT NULL`
- `submission_type TEXT NOT NULL DEFAULT 'text'`
- `submission_content TEXT NOT NULL DEFAULT ''`
- `status TEXT NOT NULL DEFAULT 'pending'`
- `created_at TEXT NOT NULL`
- `reviewed_by TEXT NULL`
- `reviewed_at TEXT NULL`
- `returned_reason TEXT NULL`
- `returned_by TEXT NULL`
- `returned_at TEXT NULL`
- `hidden_at TEXT NULL`
- `hidden_by TEXT NULL`

Write sources:
- Student mission submit/resubmit.
- Teacher accept/return/reject and hide/unhide actions.

Read sources:
- Teacher moderation queues.
- Student mission submission history.
- Approved/accepted mission feed composition.

UI surfaces:
- Missions submission cards.
- Profile creation rails/stats that include accepted missions.
- Teacher moderation controls.

## lantern_polls

Purpose:
Stores approved poll records that are published to community voting surfaces.

Columns:
- `id TEXT PRIMARY KEY`
- `mission_submission_id TEXT NOT NULL`
- `question TEXT NOT NULL`
- `choices_json TEXT NOT NULL`
- `created_by_character TEXT NOT NULL` (legacy; retained for backward compatibility)
- `created_at TEXT NOT NULL`
- `approved_at TEXT NULL`
- `image_url TEXT NULL`
- `character_name TEXT NOT NULL DEFAULT ''` (canonical identity field after migration 035)

Write sources:
- Poll approval publishing from mission submissions and poll contributions.

Read sources:
- Poll feed/list endpoints.
- Poll detail/vote endpoints.

UI surfaces:
- Explore poll cards.
- Poll detail/voting experiences.

## lantern_poll_votes

Purpose:
Stores one vote per character per poll.

Columns:
- `id TEXT PRIMARY KEY`
- `poll_id TEXT NOT NULL`
- `character_name TEXT NOT NULL`
- `choice_index INTEGER NOT NULL`
- `created_at TEXT NOT NULL`

Write sources:
- Poll vote endpoint.

Read sources:
- Poll results/counting endpoints.

UI surfaces:
- Poll vote state and result displays.

## lantern_poll_voter_rewards

Purpose:
Prevents duplicate voter rewards by tracking one reward row per poll+character.

Columns:
- `id TEXT PRIMARY KEY`
- `poll_id TEXT NOT NULL`
- `character_name TEXT NOT NULL`
- `created_at TEXT NOT NULL`

Write sources:
- Poll-voter reward grant logic.

Read sources:
- Reward dedup checks.

UI surfaces:
- Indirect only (economy totals/activity).

## lantern_bug_reports

Purpose:
Stores approved bug reports published from mission flow.

Columns:
- `id TEXT PRIMARY KEY`
- `character_name TEXT NOT NULL`
- `description TEXT NOT NULL`
- `image_url TEXT NULL`
- `status TEXT NOT NULL DEFAULT 'approved'`
- `created_at TEXT NOT NULL`

Write sources:
- Mission approval pipeline for bug_report submissions.

Read sources:
- Bug report listing endpoints.

UI surfaces:
- Verify bug report surfaces.

## lantern_leaderboard_entries

Purpose:
Stores game score entries for leaderboard windows.

Columns:
- `id TEXT PRIMARY KEY`
- `game_name TEXT NOT NULL`
- `character_name TEXT NOT NULL`
- `score INTEGER NOT NULL`
- `score_display TEXT NULL`
- `meta_json TEXT NULL`
- `created_at TEXT NOT NULL`

Write sources:
- Game score submission endpoints.

Read sources:
- Leaderboard query endpoints.

UI surfaces:
- Games leaderboards.
- Display leaderboard slides.

## lantern_media_library

Purpose:
Stores curated image keys for reusable media selection categories.

Columns:
- `id TEXT PRIMARY KEY`
- `category TEXT NOT NULL`
- `image_key TEXT NOT NULL`
- `sort_order INTEGER NOT NULL DEFAULT 0`
- `created_at TEXT NOT NULL`

Write sources:
- Admin/teacher media library curation endpoints.

Read sources:
- Media library fetch endpoints.

UI surfaces:
- Contribute and media-picker flows.

## lantern_poll_contributions

Purpose:
Stores student poll contribution submissions and moderation lifecycle before publication.

Columns:
- `id TEXT PRIMARY KEY`
- `character_name TEXT NOT NULL`
- `question TEXT NOT NULL`
- `choices_json TEXT NOT NULL`
- `image_url TEXT NULL`
- `fallback_key TEXT NULL`
- `status TEXT NOT NULL DEFAULT 'pending'`
- `created_at TEXT NOT NULL`
- `reviewed_at TEXT NULL`
- `reviewed_by TEXT NULL`
- `decision_note TEXT NULL`

Write sources:
- Student poll contribution submit/resubmit.
- Teacher approve/return/reject moderation actions.

Read sources:
- Poll contributions list endpoints (`/api/polls/contributions`, returned subsets).
- Approvals joins for poll contribution cards.

UI surfaces:
- Profile My Creations -> Submissions tabs.
- Profile Returned rail and Returned tab.
- Teacher approvals UI.

## lantern_test_students

Purpose:
Stores temporary test identities for verify/demo testing mode.

Columns:
- `id TEXT PRIMARY KEY`
- `character_name TEXT NOT NULL UNIQUE`
- `display_name TEXT NOT NULL`
- `mode TEXT NOT NULL DEFAULT 'test'`
- `created_at TEXT NOT NULL`
- `expires_at TEXT NOT NULL`
- `is_active INTEGER NOT NULL DEFAULT 1`

Write sources:
- Test student create/expire management endpoints.

Read sources:
- Test student listing and identity adoption flows.

UI surfaces:
- Student picker test identities.

## lantern_content_flags

Purpose:
Stores user content flag reports for moderation follow-up.

Columns:
- `id TEXT PRIMARY KEY`
- `item_type TEXT NOT NULL`
- `item_id TEXT NOT NULL`
- `reported_by TEXT NOT NULL`
- `reason TEXT NULL`
- `created_at TEXT NOT NULL`

Write sources:
- Content flag/report endpoint.

Read sources:
- Flag review list endpoint.

UI surfaces:
- Teacher/staff moderation follow-up surfaces.

## lantern_verify_state

Purpose:
Stores verify simulation state as a single D1 row (not authentication data).

Columns:
- `id TEXT PRIMARY KEY`
- `state_json TEXT NOT NULL DEFAULT '{}'`
- `updated_at TEXT NOT NULL`

Write sources:
- `/api/verify/state` update/reset flows.

Read sources:
- `/api/verify/state` and verify bootstrap flows.

UI surfaces:
- Verify simulation identity/state behavior.
