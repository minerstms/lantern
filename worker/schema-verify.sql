-- Lantern schema verification checks (read-only).
-- Run from lantern-worker:
--   npx wrangler d1 execute lantern-db --remote --file=schema-verify.sql
--
-- This file reports only drift findings.
-- If schema is healthy, all result sets should be empty.

-- 1) Required core tables must exist.
WITH required_tables(name) AS (
  VALUES
    ('lantern_poll_contributions'),
    ('lantern_polls'),
    ('lantern_news_submissions'),
    ('lantern_mission_submissions'),
    ('lantern_approvals')
)
SELECT
  'missing_required_table' AS issue,
  r.name AS detail
FROM required_tables r
LEFT JOIN sqlite_master s
  ON s.type = 'table' AND s.name = r.name
WHERE s.name IS NULL;

-- 2) Required core columns must exist for lantern_poll_contributions.
WITH required_columns(column_name) AS (
  VALUES ('id'), ('character_name'), ('question'), ('choices_json'), ('status'), ('created_at')
)
SELECT
  'missing_required_column' AS issue,
  'lantern_poll_contributions.' || rc.column_name AS detail
FROM required_columns rc
LEFT JOIN pragma_table_info('lantern_poll_contributions') p
  ON p.name = rc.column_name
WHERE p.name IS NULL;

-- 3) Required core columns must exist for lantern_polls.
WITH required_columns(column_name) AS (
  VALUES ('id'), ('question'), ('choices_json'), ('character_name')
)
SELECT
  'missing_required_column' AS issue,
  'lantern_polls.' || rc.column_name AS detail
FROM required_columns rc
LEFT JOIN pragma_table_info('lantern_polls') p
  ON p.name = rc.column_name
WHERE p.name IS NULL;

-- 4) Required core columns must exist for lantern_news_submissions.
WITH required_columns(column_name) AS (
  VALUES ('id'), ('author_name'), ('status'), ('created_at')
)
SELECT
  'missing_required_column' AS issue,
  'lantern_news_submissions.' || rc.column_name AS detail
FROM required_columns rc
LEFT JOIN pragma_table_info('lantern_news_submissions') p
  ON p.name = rc.column_name
WHERE p.name IS NULL;

-- 5) Required core columns must exist for lantern_mission_submissions.
WITH required_columns(column_name) AS (
  VALUES ('id'), ('mission_id'), ('character_name'), ('status'), ('created_at')
)
SELECT
  'missing_required_column' AS issue,
  'lantern_mission_submissions.' || rc.column_name AS detail
FROM required_columns rc
LEFT JOIN pragma_table_info('lantern_mission_submissions') p
  ON p.name = rc.column_name
WHERE p.name IS NULL;

-- 6) Canonical poll identity field must be character_name.
SELECT
  'missing_canonical_poll_identity' AS issue,
  'lantern_polls.character_name' AS detail
WHERE NOT EXISTS (
  SELECT 1 FROM pragma_table_info('lantern_polls') WHERE name = 'character_name'
);

-- 7) Status-bearing table set must stay explicit and expected.
-- Missing expected status tables:
WITH expected_status_tables(name) AS (
  VALUES
    ('lantern_avatar_submissions'),
    ('lantern_news_submissions'),
    ('lantern_approvals'),
    ('lantern_mission_submissions'),
    ('lantern_poll_contributions'),
    ('lantern_bug_reports')
)
SELECT
  'missing_expected_status_table' AS issue,
  e.name AS detail
FROM expected_status_tables e
WHERE NOT EXISTS (
  SELECT 1 FROM sqlite_master s
  WHERE s.type = 'table'
    AND s.name = e.name
)
OR NOT EXISTS (
  SELECT 1 FROM pragma_table_info(e.name) p WHERE p.name = 'status'
);

-- Unexpected Lantern tables that contain a status column:
WITH expected_status_tables(name) AS (
  VALUES
    ('lantern_avatar_submissions'),
    ('lantern_news_submissions'),
    ('lantern_approvals'),
    ('lantern_mission_submissions'),
    ('lantern_poll_contributions'),
    ('lantern_bug_reports')
),
lantern_tables(name) AS (
  SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'lantern_%'
)
SELECT
  'unexpected_status_table' AS issue,
  t.name AS detail
FROM lantern_tables t
WHERE EXISTS (
  SELECT 1 FROM pragma_table_info(t.name) p WHERE p.name = 'status'
)
AND NOT EXISTS (
  SELECT 1 FROM expected_status_tables e WHERE e.name = t.name
);
