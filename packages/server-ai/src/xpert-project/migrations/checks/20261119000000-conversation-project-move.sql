SELECT 'conversation_project_move.' || required.name AS missing
FROM (VALUES ('conversation_id'), ('thread_id'), ('source_message_id'), ('source_execution_id'), ('destination'),
             ('new_project_id'), ('target_id'), ('execution_id'), ('bound'), ('dismissed'), ('moved_at')) required(name)
WHERE NOT EXISTS (
    SELECT 1 FROM pg_attribute WHERE attrelid=to_regclass('conversation_project_move')
    AND attname=required.name AND NOT attisdropped
)
UNION ALL SELECT 'idx_conversation_project_move_thread' WHERE to_regclass('idx_conversation_project_move_thread') IS NULL;
