-- Immutable finalized student reactions (one per account per feed item).
CREATE TABLE IF NOT EXISTS lantern_final_reaction_responses (
  id TEXT PRIMARY KEY,
  item_type TEXT NOT NULL,
  item_id TEXT NOT NULL,
  reaction_type TEXT NOT NULL,
  reactor_username TEXT NOT NULL,
  reactor_character_name TEXT,
  finalized_at TEXT NOT NULL,
  UNIQUE(item_type, item_id, reactor_username)
);

CREATE INDEX IF NOT EXISTS idx_lantern_final_reaction_responses_item
  ON lantern_final_reaction_responses(item_type, item_id);

CREATE INDEX IF NOT EXISTS idx_lantern_final_reaction_responses_reactor
  ON lantern_final_reaction_responses(reactor_username);
