-- Prompt #175 — Teacher Shout-Out media parity with student Contribute Shout-Out.
-- Same R2 key / link fields as lantern_news_submissions; one attachment at a time.
ALTER TABLE lantern_teacher_recognition ADD COLUMN image_r2_key TEXT;
ALTER TABLE lantern_teacher_recognition ADD COLUMN full_image_r2_key TEXT;
ALTER TABLE lantern_teacher_recognition ADD COLUMN video_r2_key TEXT;
ALTER TABLE lantern_teacher_recognition ADD COLUMN link_url TEXT;
