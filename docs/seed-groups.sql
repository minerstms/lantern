-- Student Groups seed: categories and groups (run after schema.sql)
-- npx wrangler d1 execute mtss-db --remote --file=seed-groups.sql
-- Idempotent: uses INSERT OR IGNORE / slug-based checks where needed

-- Categories (slug unique)
INSERT OR IGNORE INTO student_group_categories (id, name, slug, sort_order, is_active, is_hidden, created_at, updated_at) VALUES
(1, 'Sports', 'sports', 1, 1, 0, datetime('now'), datetime('now')),
(2, 'Music / Arts', 'music-arts', 2, 1, 0, datetime('now'), datetime('now')),
(3, 'Academics / Programs', 'academics-programs', 3, 1, 0, datetime('now'), datetime('now')),
(4, 'Clubs / Activities', 'clubs-activities', 4, 1, 0, datetime('now'), datetime('now')),
(5, 'Misc / Logistics', 'misc-logistics', 5, 1, 0, datetime('now'), datetime('now'));

-- Grade (single-select category: one grade per student). Full K–12; visibility in UI controlled by Worker VISIBLE_GRADE_SLUGS (currently 6th/7th/8th).
INSERT OR IGNORE INTO student_group_categories (id, name, slug, sort_order, is_active, is_hidden, selection_mode, created_at, updated_at) VALUES
(6, 'Grade', 'grade', 0, 1, 0, 'single', datetime('now'), datetime('now'));

INSERT OR IGNORE INTO student_groups (category_id, name, slug, color, sort_order, is_active, is_hidden, created_at, updated_at) VALUES
(6, 'Kindergarten', 'grade-k', '#0d9488', 0, 1, 1, datetime('now'), datetime('now')),
(6, '1st Grade', 'grade-1', '#0d9488', 1, 1, 1, datetime('now'), datetime('now')),
(6, '2nd Grade', 'grade-2', '#0d9488', 2, 1, 1, datetime('now'), datetime('now')),
(6, '3rd Grade', 'grade-3', '#0d9488', 3, 1, 1, datetime('now'), datetime('now')),
(6, '4th Grade', 'grade-4', '#0d9488', 4, 1, 1, datetime('now'), datetime('now')),
(6, '5th Grade', 'grade-5', '#0d9488', 5, 1, 1, datetime('now'), datetime('now')),
(6, '6th Grade', 'grade-6', '#0d9488', 6, 1, 0, datetime('now'), datetime('now')),
(6, '7th Grade', 'grade-7', '#0891b2', 7, 1, 0, datetime('now'), datetime('now')),
(6, '8th Grade', 'grade-8', '#6366f1', 8, 1, 0, datetime('now'), datetime('now')),
(6, '9th Grade', 'grade-9', '#6366f1', 9, 1, 1, datetime('now'), datetime('now')),
(6, '10th Grade', 'grade-10', '#6366f1', 10, 1, 1, datetime('now'), datetime('now')),
(6, '11th Grade', 'grade-11', '#6366f1', 11, 1, 1, datetime('now'), datetime('now')),
(6, '12th Grade', 'grade-12', '#6366f1', 12, 1, 1, datetime('now'), datetime('now'));

-- Sports (category_id 1): Active then Hidden
INSERT OR IGNORE INTO student_groups (category_id, name, slug, color, sort_order, is_active, is_hidden, created_at, updated_at) VALUES
(1, 'Boys Basketball', 'sports-boys-basketball', '#1e63d6', 1, 1, 0, datetime('now'), datetime('now')),
(1, 'Girls Basketball', 'sports-girls-basketball', '#a855f7', 2, 1, 0, datetime('now'), datetime('now')),
(1, 'Football', 'sports-football', '#0f3b86', 3, 1, 0, datetime('now'), datetime('now')),
(1, 'Volleyball', 'sports-volleyball', '#e11d48', 4, 1, 0, datetime('now'), datetime('now')),
(1, 'Wrestling', 'sports-wrestling', '#64748b', 5, 1, 0, datetime('now'), datetime('now')),
(1, 'Baseball', 'sports-baseball', '#ca8a04', 6, 1, 0, datetime('now'), datetime('now')),
(1, 'Softball', 'sports-softball', NULL, 7, 1, 1, datetime('now'), datetime('now')),
(1, 'Track & Field', 'sports-track-field', '#16a34a', 8, 1, 0, datetime('now'), datetime('now')),
(1, 'Cross Country', 'sports-cross-country', NULL, 9, 1, 1, datetime('now'), datetime('now')),
(1, 'Soccer', 'sports-soccer', NULL, 10, 1, 1, datetime('now'), datetime('now')),
(1, 'Swimming', 'sports-swimming', NULL, 11, 1, 1, datetime('now'), datetime('now')),
(1, 'Tennis', 'sports-tennis', NULL, 12, 1, 1, datetime('now'), datetime('now')),
(1, 'Golf', 'sports-golf', NULL, 13, 1, 1, datetime('now'), datetime('now')),
(1, 'Cheerleading', 'sports-cheerleading', NULL, 14, 1, 1, datetime('now'), datetime('now')),
(1, 'Placeholder Sport 01', 'sports-placeholder-01', NULL, 15, 1, 1, datetime('now'), datetime('now')),
(1, 'Placeholder Sport 02', 'sports-placeholder-02', NULL, 16, 1, 1, datetime('now'), datetime('now'));

-- Music / Arts (category_id 2)
INSERT OR IGNORE INTO student_groups (category_id, name, slug, color, sort_order, is_active, is_hidden, created_at, updated_at) VALUES
(2, 'Band', 'music-band', '#0d9488', 1, 1, 0, datetime('now'), datetime('now')),
(2, 'Choir', 'music-choir', '#be185d', 2, 1, 0, datetime('now'), datetime('now')),
(2, 'Orchestra', 'music-orchestra', NULL, 3, 1, 1, datetime('now'), datetime('now')),
(2, 'Drama / Theater', 'music-drama-theater', NULL, 4, 1, 1, datetime('now'), datetime('now')),
(2, 'Art Club', 'music-art-club', NULL, 5, 1, 1, datetime('now'), datetime('now')),
(2, 'Dance', 'music-dance', NULL, 6, 1, 1, datetime('now'), datetime('now')),
(2, 'Placeholder Arts 01', 'music-placeholder-01', NULL, 7, 1, 1, datetime('now'), datetime('now')),
(2, 'Placeholder Arts 02', 'music-placeholder-02', NULL, 8, 1, 1, datetime('now'), datetime('now'));

-- Academics / Programs (category_id 3)
INSERT OR IGNORE INTO student_groups (category_id, name, slug, color, sort_order, is_active, is_hidden, created_at, updated_at) VALUES
(3, 'STEM', 'academics-stem', '#0891b2', 1, 1, 0, datetime('now'), datetime('now')),
(3, 'Track (academic tracking)', 'academics-track', '#2563eb', 2, 1, 0, datetime('now'), datetime('now')),
(3, 'EARSS', 'academics-earss', '#dc2626', 3, 1, 0, datetime('now'), datetime('now')),
(3, 'COAAP', 'academics-coaap', '#ea580c', 4, 1, 0, datetime('now'), datetime('now')),
(3, 'Honors Program', 'academics-honors', NULL, 5, 1, 1, datetime('now'), datetime('now')),
(3, 'Advanced Placement (AP)', 'academics-ap', NULL, 6, 1, 1, datetime('now'), datetime('now')),
(3, 'Tutoring / After School Academic Support', 'academics-tutoring', NULL, 7, 1, 1, datetime('now'), datetime('now')),
(3, 'Special Education (SPED)', 'academics-sped', NULL, 8, 1, 1, datetime('now'), datetime('now')),
(3, 'Placeholder Academic 01', 'academics-placeholder-01', NULL, 9, 1, 1, datetime('now'), datetime('now')),
(3, 'Placeholder Academic 02', 'academics-placeholder-02', NULL, 10, 1, 1, datetime('now'), datetime('now'));

-- Clubs / Activities (category_id 4)
INSERT OR IGNORE INTO student_groups (category_id, name, slug, color, sort_order, is_active, is_hidden, created_at, updated_at) VALUES
(4, 'Student Council', 'clubs-student-council', NULL, 1, 1, 1, datetime('now'), datetime('now')),
(4, 'Robotics', 'clubs-robotics', NULL, 2, 1, 1, datetime('now'), datetime('now')),
(4, 'FFA / Agriculture Club', 'clubs-ffa', NULL, 3, 1, 1, datetime('now'), datetime('now')),
(4, 'Debate Team', 'clubs-debate', NULL, 4, 1, 1, datetime('now'), datetime('now')),
(4, 'Yearbook', 'clubs-yearbook', NULL, 5, 1, 1, datetime('now'), datetime('now')),
(4, 'Environmental Club', 'clubs-environmental', NULL, 6, 1, 1, datetime('now'), datetime('now')),
(4, 'Language / Cultural Club', 'clubs-language-cultural', NULL, 7, 1, 1, datetime('now'), datetime('now')),
(4, 'Chess Club', 'clubs-chess', NULL, 8, 1, 1, datetime('now'), datetime('now')),
(4, 'Math Club', 'clubs-math', NULL, 9, 1, 1, datetime('now'), datetime('now')),
(4, 'Science Club', 'clubs-science', NULL, 10, 1, 1, datetime('now'), datetime('now')),
(4, 'Placeholder Club 01', 'clubs-placeholder-01', NULL, 11, 1, 1, datetime('now'), datetime('now')),
(4, 'Placeholder Club 02', 'clubs-placeholder-02', NULL, 12, 1, 1, datetime('now'), datetime('now'));

-- Misc / Logistics (category_id 5)
INSERT OR IGNORE INTO student_groups (category_id, name, slug, color, sort_order, is_active, is_hidden, created_at, updated_at) VALUES
(5, 'New Students (onboarding)', 'misc-new-students', '#65a30d', 1, 1, 0, datetime('now'), datetime('now')),
(5, 'Peer Mentoring / Buddy Program', 'misc-peer-mentoring', NULL, 2, 1, 1, datetime('now'), datetime('now')),
(5, 'Summer School', 'misc-summer-school', NULL, 3, 1, 1, datetime('now'), datetime('now')),
(5, 'Attendance / Intervention Group', 'misc-attendance-intervention', NULL, 4, 1, 1, datetime('now'), datetime('now')),
(5, 'Placeholder Misc 01', 'misc-placeholder-01', NULL, 5, 1, 1, datetime('now'), datetime('now')),
(5, 'Placeholder Misc 02', 'misc-placeholder-02', NULL, 6, 1, 1, datetime('now'), datetime('now')),
(5, 'Placeholder Misc 03', 'misc-placeholder-03', NULL, 7, 1, 1, datetime('now'), datetime('now'));
