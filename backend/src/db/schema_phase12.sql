-- Phase 12: metrics indexes + collaboration metadata (D9: owner-scoped via generations.user_id)

CREATE INDEX IF NOT EXISTS audit_logs_user_action_created_idx
  ON audit_logs (user_id, action, created_at DESC);

CREATE TABLE IF NOT EXISTS generation_story_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_id UUID NOT NULL REFERENCES generations(id) ON DELETE CASCADE,
  story_id TEXT NOT NULL,
  author_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS generation_story_notes_gen_story_idx
  ON generation_story_notes (generation_id, story_id);

CREATE TABLE IF NOT EXISTS generation_story_collab (
  generation_id UUID NOT NULL REFERENCES generations(id) ON DELETE CASCADE,
  story_id TEXT NOT NULL,
  assignee_label TEXT NULL,
  reviewed_at TIMESTAMPTZ NULL,
  reviewed_by_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY (generation_id, story_id)
);
