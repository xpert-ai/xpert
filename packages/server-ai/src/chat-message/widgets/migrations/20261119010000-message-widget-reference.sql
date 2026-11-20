CREATE TABLE IF NOT EXISTS chat_message_widget_reference (
    message_id uuid NOT NULL REFERENCES chat_message(id) ON DELETE CASCADE,
    widget_id text NOT NULL,
    provider text NOT NULL,
    thread_id varchar(100) NOT NULL,
    PRIMARY KEY (message_id, widget_id)
);
