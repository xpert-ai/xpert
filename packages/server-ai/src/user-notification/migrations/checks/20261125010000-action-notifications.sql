SELECT column_name AS missing FROM (VALUES ('actionState'), ('resolvedAt')) AS required(column_name)
WHERE NOT EXISTS (
 SELECT 1 FROM pg_attribute WHERE attrelid = to_regclass('user_notification') AND attname = required.column_name AND NOT attisdropped
);
