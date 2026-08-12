-- Prompt #220 — Additive staff honorific (Mr./Miss/Ms./Mrs.) for public-facing names.
-- Nullable for existing staff. Presentation only — no auth/role meaning.
-- Run: npx wrangler d1 execute lantern-db --remote --file=migrations/069_lantern_staff_honorific.sql

ALTER TABLE lantern_pilot_accounts ADD COLUMN honorific TEXT;
