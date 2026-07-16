-- Audit retrofit: history list is always WHERE user_id = $1 ORDER BY created_at DESC.
-- Compound index matches Phase 12 audit_logs pattern; replaces single-column user_id index.

CREATE INDEX IF NOT EXISTS generations_user_created_idx
  ON generations (user_id, created_at DESC);

DROP INDEX IF EXISTS generations_user_id_idx;
