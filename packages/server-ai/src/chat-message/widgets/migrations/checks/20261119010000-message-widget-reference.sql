SELECT 'chat_message_widget_reference.' || col AS missing
FROM unnest(ARRAY['message_id','widget_id','provider','thread_id']) AS col
WHERE NOT EXISTS (
    SELECT 1 FROM pg_attribute WHERE attrelid = to_regclass('chat_message_widget_reference')
    AND attname = col AND NOT attisdropped
);
