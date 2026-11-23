/* xpert-migration {"dependsOn":["core.project.20261119000000-conversation-project-move","ai.message-widget.20261119010000-message-widget-reference"]} */
INSERT INTO chat_message_widget_reference (message_id, widget_id, provider, thread_id)
SELECT ai.id, r.id::text, 'project.move', r.thread_id
FROM conversation_project_move r
JOIN chat_message ai ON ai."conversationId" = r.conversation_id AND ai."parentId" = r.source_message_id
    AND ai."executionId" = r.source_execution_id AND ai.role = 'ai'
ON CONFLICT (message_id, widget_id) DO NOTHING;
