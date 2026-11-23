CREATE TABLE IF NOT EXISTS conversation_project_move (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id uuid NOT NULL REFERENCES chat_conversation(id) ON DELETE CASCADE,
    thread_id varchar(100) NOT NULL,
    source_message_id uuid NOT NULL REFERENCES chat_message(id) ON DELETE CASCADE,
    source_execution_id uuid NOT NULL,
    destination varchar NOT NULL CHECK (destination IN ('existing', 'create')),
    new_project_id uuid NOT NULL DEFAULT gen_random_uuid(),
    target_id uuid,
    target_name varchar(240),
    execution_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    moved_at timestamptz,
    bound boolean NOT NULL DEFAULT false,
    dismissed boolean NOT NULL DEFAULT false,
    UNIQUE (conversation_id, source_message_id)
);
CREATE INDEX IF NOT EXISTS idx_conversation_project_move_thread ON conversation_project_move(thread_id);
