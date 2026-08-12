-- Prompt #223 — Optional staff public display-name override (exact string).
-- Blank = use Honorific + Last Name formatter. Presentation only.
-- Run: npx wrangler d1 execute lantern-db --remote --file=migrations/070_lantern_staff_public_display_name.sql

ALTER TABLE lantern_pilot_accounts ADD COLUMN public_display_name TEXT;
