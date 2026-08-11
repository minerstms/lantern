-- Prompt #213 clean-slate archive (UPDATE only — no DELETE).
-- Archive remaining approved news that were still visible (hidden_at empty).
UPDATE lantern_news_submissions
SET hidden_at = '2026-08-11T19:00:00.000Z',
    hidden_by = 'Prompt #213 clean-slate archive'
WHERE LOWER(TRIM(status)) = 'approved'
  AND (hidden_at IS NULL OR hidden_at = '');

-- Archive all published (approved) polls.
UPDATE lantern_polls
SET hidden_at = '2026-08-11T19:00:00.000Z',
    hidden_by = 'Prompt #213 clean-slate archive'
WHERE approved_at IS NOT NULL
  AND approved_at != ''
  AND (hidden_at IS NULL OR hidden_at = '');
