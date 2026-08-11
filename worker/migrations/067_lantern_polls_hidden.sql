-- Prompt #213 — reversible poll archive/hide (same semantics as news/mission hidden_at).
-- Additive only; preserves approved_at, votes, and all poll row data.
ALTER TABLE lantern_polls ADD COLUMN hidden_at TEXT;
ALTER TABLE lantern_polls ADD COLUMN hidden_by TEXT;
