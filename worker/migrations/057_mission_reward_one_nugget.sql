-- Prompt #159 — lock ordinary Lantern mission rewards to exactly 1 Nugget.
-- Normalizes existing definition rows. Does NOT rebuild the table to change the
-- legacy SQLite column DEFAULT (still "3" cosmetically); create/update handlers
-- always persist reward_amount = 1 so new rows cannot drift back to 3.
-- Historical TMS ledger transactions are intentionally untouched.

UPDATE lantern_missions
SET reward_amount = 1
WHERE reward_amount IS NULL OR reward_amount <> 1;
