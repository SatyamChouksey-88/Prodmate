-- Phase 8: allow audit rows without a user (e.g. auth.login.failure for unknown email)
ALTER TABLE audit_logs ALTER COLUMN user_id DROP NOT NULL;
