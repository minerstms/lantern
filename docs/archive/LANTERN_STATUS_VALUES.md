# Lantern Status Values (Canonical)

This file is the single allowed status dictionary for Lantern data models.

Rules:
- No synonyms.
- No alternate spellings.
- No additional values unless this file is updated first.

## lantern_avatar_submissions.status
- `pending`
- `approved`
- `rejected`

## lantern_news_submissions.status
- `pending`
- `approved`
- `returned`
- `rejected`

## lantern_approvals.status
- `pending`
- `approved`
- `returned`
- `rejected`

## lantern_mission_submissions.status
- `pending`
- `accepted`
- `returned`
- `rejected`

## lantern_poll_contributions.status
- `pending`
- `approved`
- `returned`
- `rejected`

## lantern_bug_reports.status
- `approved`

## Non-status fields (do not treat as status)
- `lantern_test_students.mode`: currently `test` only.
- `lantern_news_submissions.author_type`: actor classification (for example `student`, `teacher`, `staff`, `admin`), not a moderation status.
- `lantern_missions.submission_type`: mission submission kind (for example `text`, `poll`, `bug_report`), not a moderation status.
