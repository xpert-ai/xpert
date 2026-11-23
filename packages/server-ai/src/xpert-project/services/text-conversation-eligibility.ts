import { ConflictException } from '@nestjs/common'
import type { EntityManager } from 'typeorm'
import type { ChatConversation } from '../../chat-conversation/conversation.entity'

// All branches acquire Project visibility. Only text, consent and built-in instruction reads are portable.
export async function assertTextConversation(manager: EntityManager, c: ChatConversation, issuingExecutionId?: string) {
    if (
        c.branchSource ||
        c.operation ||
        c.options?.features?.some((feature) => feature === 'sandbox' || feature === 'files') ||
        c.options?.workspacePath ||
        c.options?.workspaceRoot ||
        c.options?.sessionWorkspacePath ||
        c.options?.sandboxEnvironmentId ||
        c.options?.projectCreation?.status === 'awaiting_confirmation'
    )
        throw new ConflictException('This conversation already owns a workspace or pending operation')
    const [result]: { blocked: boolean }[] = await manager.query(
        `
        WITH messages AS (SELECT * FROM chat_message WHERE "conversationId"=$1),
        threads AS (SELECT "threadId" FROM chat_conversation_thread WHERE "conversationId"=$1)
        SELECT EXISTS (
            SELECT 1 FROM conversation_file_link WHERE "conversationId"=$1::text
            UNION ALL SELECT 1 FROM file_asset WHERE "conversationId"=$1::text
            UNION ALL SELECT 1 FROM chat_conversation_attachment WHERE "chatConversationId"=$1::uuid
            UNION ALL SELECT 1 FROM chat_message_attachment a JOIN messages m ON m.id=a."chatMessageId"
            UNION ALL SELECT 1 FROM chat_message_file_asset a JOIN messages m ON m.id=a."chatMessageId"
            UNION ALL SELECT 1 FROM chat_conversation_goal WHERE "conversationId"=$1::uuid
            UNION ALL SELECT 1 FROM agent_invocation_wait w JOIN threads t ON t."threadId"=w."threadId"
                WHERE w.state IN ('waiting','ready','blocked')
            UNION ALL SELECT 1 FROM mcp_app_history WHERE "conversationId"=$1::uuid
            UNION ALL SELECT 1 FROM sandbox_managed_service WHERE "conversationId"=$1::uuid
            UNION ALL SELECT 1 FROM shell_process_execution WHERE binding->>'conversationId'=$1::text
            UNION ALL SELECT 1 FROM xpert_agent_execution e JOIN threads t USING ("threadId")
                WHERE e.status IN ('running','interrupted') AND e.id IS DISTINCT FROM $2::uuid
            UNION ALL SELECT 1 FROM messages m
                WHERE m.content IS NULL OR m.role IS NULL OR m.role NOT IN ('human','ai') OR m."followUpStatus"='pending' OR m."messageEnvelope" IS NOT NULL
                OR COALESCE(m.references::jsonb,'[]') <> '[]'
                OR (jsonb_typeof(m.content::jsonb) <> 'string' AND (
                    jsonb_typeof(m.content::jsonb) <> 'array' OR EXISTS (
                      SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(m.content::jsonb)='array'
                        THEN m.content::jsonb ELSE '[]' END) part
                      WHERE COALESCE(part->>'type','') NOT IN ('text','reasoning')
                        AND NOT (m.role='ai' AND COALESCE(part->>'type','')='component' AND (
                          COALESCE(part#>>'{data,tool}','') IN ('request_user_input','request_project_selection')
                          OR (COALESCE(part#>>'{data,type}','')='Widget' AND EXISTS (
                            SELECT 1 FROM chat_message_widget_reference w
                            WHERE w.message_id=m.id AND w.widget_id=part->>'id' AND w.provider='project.move'))
                          OR (COALESCE(part#>>'{data,tool}','')='DynamicStructuredTool'
                            AND COALESCE(part#>>'{data,toolset}','') IN ('RequestUserInputMiddleware','ProjectMiddleware')
                            AND COALESCE(part#>>'{data,toolPresentation}','')='redacted')
                          OR (COALESCE(part#>>'{data,tool}','')='read_skill_file' AND (
                            (COALESCE(part#>>'{data,category}','')='Tool'
                              AND COALESCE(part#>>'{data,toolset}','')='skillsMiddleware')
                            OR (COALESCE(part#>>'{data,category}','')='Computer'
                              AND COALESCE(part#>>'{data,taskSummary,version}','')='1'
                              AND COALESCE(jsonb_typeof(part#>'{data,taskSummary,skillUsages}'),'')='array'
                              AND part#>'{data,taskSummary,skillUsages}' <> '[]'::jsonb))))))))
                OR EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(m.events::jsonb,'[]')) step
                    WHERE COALESCE(step->>'tool','') NOT IN ('request_user_input','request_project_selection','read_skill_file'))
        ) AS blocked`,
        [c.id, issuingExecutionId ?? null]
    )
    if (result.blocked)
        throw new ConflictException(
            'Only text conversations with supported instruction reads and no pending operations can be moved'
        )
}
