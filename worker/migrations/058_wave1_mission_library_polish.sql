-- Prompt #164 — WAVE 1 mission library polish (content only).
-- Guarded UPDATEs by exact mission id. No deletes/archives.
-- Does not touch test junk, baseline stubs, Explain Something, videos, or Create Something.
-- Historical lantern_mission_submissions and lantern_transactions are untouched.
-- Reward stays 1 on every row.

-- 1. Report Good News
UPDATE lantern_missions
SET title = 'Report Good News',
    description = 'Share something positive happening at school or in our community. Tell us what happened and why it matters.',
    reward_amount = 1
WHERE id = 'perm_report_good_news'
  AND reward_amount = 1;

-- 2. Teach Us Something (preserve optional media flags already on the row)
UPDATE lantern_missions
SET title = 'Teach Us Something',
    description = 'Teach one idea, fact, skill, or trick clearly enough that another student could learn it from you.',
    reward_amount = 1
WHERE id = 'perm_teach_us_something'
  AND reward_amount = 1;

-- 3. Show Something Cool
UPDATE lantern_missions
SET title = 'Show Something Cool',
    description = 'Share something interesting you made, found, learned, or noticed. Tell us what makes it worth seeing.',
    reward_amount = 1
WHERE id = 'perm_show_something_cool'
  AND reward_amount = 1;

-- 4. Shout-Out Someone (Review Queue remains; no Create auto-complete)
UPDATE lantern_missions
SET title = 'Shout-Out Someone',
    description = 'Celebrate someone who helped, encouraged, or impressed you. Tell us who they are and what they did.',
    reward_amount = 1
WHERE id = 'perm_shoutout_someone'
  AND reward_amount = 1;

-- 5. STEM Today (keep image_url path)
UPDATE lantern_missions
SET title = 'STEM Today',
    description = 'Share one STEM thing you noticed, built, tested, designed, coded, measured, or investigated today. Add a photo when you can and a short caption explaining what is happening.',
    reward_amount = 1
WHERE id = 'tmission_1773763739628_hhzqrr'
  AND reward_amount = 1;

-- 6. Draw Something — correct to image-capable model (was text)
UPDATE lantern_missions
SET title = 'Draw Something',
    description = 'Make a drawing, sketch, diagram, or design. Upload a clear photo of it and add 1–2 sentences about what you made.',
    submission_type = 'image_url',
    allows_text = 1,
    allows_image = 1,
    allows_video = 0,
    allows_link = 0,
    min_characters = 20,
    reward_amount = 1
WHERE id = 'tmission_1773778519518_x2oe3m'
  AND reward_amount = 1;

-- 7. Help Someone
UPDATE lantern_missions
SET title = 'Help Someone',
    description = 'Help a classmate or staff member with something useful. Tell us what you did and how it helped.',
    min_characters = 40,
    reward_amount = 1
WHERE id = 'tmission_1773626540637_abm6oh'
  AND reward_amount = 1;

-- 8. Random Act of Kindness — fix typo + junk instructions; text + optional image
UPDATE lantern_missions
SET title = 'Random Act of Kindness',
    description = 'Do one kind thing at school without being asked. Tell us what you did, or share a photo if that helps tell the story.',
    submission_type = 'text',
    allows_text = 1,
    allows_image = 1,
    allows_video = 0,
    allows_link = 0,
    min_characters = 40,
    reward_amount = 1
WHERE id = 'tmission_1773860977399_p9ilb3'
  AND reward_amount = 1;

-- 9. Family / Community Interview (was Lighthouse Interview; fix broken link flags)
UPDATE lantern_missions
SET title = 'Family / Community Interview',
    description = 'Interview a family member, community member, or another trusted adult about something they know, remember, or have experienced. Share a short quote and tell us what you learned.',
    submission_type = 'text',
    allows_text = 1,
    allows_image = 0,
    allows_video = 0,
    allows_link = 1,
    min_characters = 40,
    reward_amount = 1
WHERE id = 'tmission_1773760134919_yy72fc'
  AND reward_amount = 1;

-- Create a Poll — polish copy only; keep poll submission + review pipeline
UPDATE lantern_missions
SET title = 'Create a Poll',
    description = 'Write a fair, school-appropriate question and give people 2–4 clear choices.',
    reward_amount = 1
WHERE id = 'perm_create_a_poll'
  AND reward_amount = 1;
