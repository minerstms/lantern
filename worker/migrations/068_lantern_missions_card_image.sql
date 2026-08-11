-- Prompt #210 — optional Mission Card Image (definition-level artwork).
-- Additive nullable column; existing missions keep NULL and use canonical fallback.
ALTER TABLE lantern_missions ADD COLUMN card_image_r2_key TEXT;
