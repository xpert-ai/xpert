ALTER TABLE user_notification ADD COLUMN IF NOT EXISTS "actionState" varchar(16);
ALTER TABLE user_notification ADD COLUMN IF NOT EXISTS "resolvedAt" timestamptz;
CREATE INDEX IF NOT EXISTS ix_user_notification_pending ON user_notification ("tenantId", "userId", "createdAt" DESC, id DESC) WHERE "actionState" = 'pending';
CREATE INDEX IF NOT EXISTS ix_user_notification_action_source ON user_notification ((source->>'provider'), id) WHERE kind = 'action.required' AND "actionState" = 'pending';
