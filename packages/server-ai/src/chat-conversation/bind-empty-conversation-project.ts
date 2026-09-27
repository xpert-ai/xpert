import { ForbiddenException } from '@nestjs/common'
import { t } from 'i18next'
import { Repository } from 'typeorm'
import { ChatConversation } from './conversation.entity'

/** Bind only an empty bootstrap that has not chosen a personal workspace. */
export async function bindEmptyConversationProject(
    repository: Pick<Repository<ChatConversation>, 'query' | 'findOneByOrFail'>,
    conversationId: string,
    projectId: string
) {
    await repository.query(
        `
                UPDATE "chat_conversation" AS conversation
                SET "projectId" = $2, "updatedAt" = NOW()
                WHERE conversation.id = $1
                  AND conversation."projectId" IS NULL
                  AND (conversation.options->'projectSelection'->>'mode') IS DISTINCT FROM 'none'
                  AND NOT EXISTS (
                    SELECT 1 FROM "chat_message" AS message
                    WHERE message."conversationId" = conversation.id
                  )
                  AND NOT EXISTS (
                    SELECT 1 FROM "chat_conversation_goal" AS goal
                    WHERE goal."conversationId" = conversation.id
                  )
                  AND NOT EXISTS (
                    SELECT 1 FROM "conversation_file_link" AS file_link
                    WHERE file_link."conversationId" = conversation.id::text
                  )
                  AND NOT EXISTS (
                    SELECT 1 FROM "chat_conversation_attachment" AS attachment
                    WHERE attachment."chatConversationId" = conversation.id
                  )
                  AND NOT EXISTS (
                    SELECT 1 FROM "file_asset" AS file_asset
                    WHERE file_asset."conversationId" = conversation.id::text
                  )
                  AND NOT EXISTS (
                    SELECT 1 FROM "xpert_agent_execution" AS execution
                    WHERE execution."threadId" = conversation."threadId"
                  )
            `,
        [conversationId, projectId]
    )
    const conversation = await repository.findOneByOrFail({ id: conversationId })
    if (conversation.projectId !== projectId) {
        throw new ForbiddenException(
            t('server-ai:Error.ConversationProjectImmutable', {
                defaultValue: 'A conversation cannot be moved to another Project'
            })
        )
    }
    return conversation
}

/**
 * Persist an authorized conversation's personal scope without a stale options write.
 * Both this UPDATE and Project binding lock the same row and recheck the opposing
 * scope after waiting, so only one choice can win a concurrent first send.
 */
export async function selectConversationNoProject(
    repository: Pick<Repository<ChatConversation>, 'query' | 'findOneByOrFail'>,
    conversationId: string
) {
    await repository.query(
        `UPDATE "chat_conversation" AS conversation
         SET options = (COALESCE(conversation.options::jsonb, '{}'::jsonb)
                        || '{"projectSelection":{"mode":"none"}}'::jsonb)::json,
             "updatedAt" = NOW()
         WHERE conversation.id = $1
           AND conversation."projectId" IS NULL
           AND (conversation.options->'projectSelection'->>'mode') IS DISTINCT FROM 'none'`,
        [conversationId]
    )
    const conversation = await repository.findOneByOrFail({ id: conversationId })
    if (conversation.projectId || conversation.options?.projectSelection?.mode !== 'none') {
        throw new ForbiddenException(
            t('server-ai:Error.ConversationProjectImmutable', {
                defaultValue: 'A conversation cannot be moved to another Project'
            })
        )
    }
    return conversation
}
