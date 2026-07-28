-- Lantern ONE FEED: normalized feed items, teacher comments, moderated trivia.
-- Additive migration; preserves existing production data.

CREATE TABLE IF NOT EXISTS lantern_feed_items (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  summary TEXT,
  author_id TEXT,
  author_display_name TEXT NOT NULL,
  author_role TEXT DEFAULT 'student',
  image_r2_key TEXT,
  video_r2_key TEXT,
  link_url TEXT,
  tags TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  private_feedback TEXT,
  slideshow_eligible INTEGER DEFAULT 0,
  featured_eligible INTEGER DEFAULT 0,
  home_eligible INTEGER DEFAULT 0,
  extra_json TEXT,
  created_at TEXT NOT NULL,
  submitted_at TEXT,
  approved_at TEXT,
  approved_by TEXT,
  hidden_at TEXT,
  hidden_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_lantern_feed_items_status ON lantern_feed_items(status);
CREATE INDEX IF NOT EXISTS idx_lantern_feed_items_type ON lantern_feed_items(type);
CREATE INDEX IF NOT EXISTS idx_lantern_feed_items_author ON lantern_feed_items(author_display_name);
CREATE INDEX IF NOT EXISTS idx_lantern_feed_items_approved ON lantern_feed_items(approved_at);

CREATE TABLE IF NOT EXISTS lantern_feed_comments (
  id TEXT PRIMARY KEY,
  feed_item_id TEXT NOT NULL,
  author_id TEXT,
  author_display_name TEXT NOT NULL,
  author_role TEXT NOT NULL DEFAULT 'teacher',
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_lantern_feed_comments_item ON lantern_feed_comments(feed_item_id);

CREATE TABLE IF NOT EXISTS lantern_trivia_questions (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  correct_answer TEXT NOT NULL,
  wrong_answer_1 TEXT NOT NULL,
  wrong_answer_2 TEXT NOT NULL,
  wrong_answer_3 TEXT,
  image_r2_key TEXT,
  author_id TEXT,
  author_display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  private_feedback TEXT,
  live INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  submitted_at TEXT,
  approved_at TEXT,
  approved_by TEXT,
  hidden_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_lantern_trivia_status ON lantern_trivia_questions(status);
CREATE INDEX IF NOT EXISTS idx_lantern_trivia_live ON lantern_trivia_questions(live);
