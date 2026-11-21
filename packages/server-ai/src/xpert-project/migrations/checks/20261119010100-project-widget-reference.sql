SELECT 'project Widget reference missing' AS missing
FROM conversation_project_move r JOIN chat_message ai ON ai."conversationId"=r.conversation_id
 AND ai."parentId"=r.source_message_id AND ai."executionId"=r.source_execution_id AND ai.role='ai'
WHERE NOT EXISTS (SELECT 1 FROM chat_message_widget_reference w WHERE w.message_id=ai.id
 AND w.widget_id=r.id::text AND w.thread_id=r.thread_id AND w.provider='project.move') LIMIT 1;
