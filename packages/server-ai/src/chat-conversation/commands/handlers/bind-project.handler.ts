import { ForbiddenException } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { t } from 'i18next'
import { ChatConversationService } from '../../conversation.service'
import { ChatConversationBindProjectCommand } from '../bind-project.command'

@CommandHandler(ChatConversationBindProjectCommand)
export class ChatConversationBindProjectHandler implements ICommandHandler<ChatConversationBindProjectCommand> {
    constructor(private readonly service: ChatConversationService) {}

    public async execute(command: ChatConversationBindProjectCommand) {
        // Only the empty record created by the thread bootstrap may acquire a
        // Project boundary. Once any user content, goal, file link, or run exists,
        // the conversation is personal history and can no longer be reclassified.
        await this.service.repository.query(
            `
                UPDATE "chat_conversation" AS conversation
                SET "projectId" = $2, "updatedAt" = NOW()
                WHERE conversation.id = $1
                  AND conversation."projectId" IS NULL
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
            [command.conversationId, command.projectId]
        )

        const conversation = await this.service.repository.findOneByOrFail({ id: command.conversationId })
        // A failed compare-and-set means the bootstrap is no longer empty or
        // another request already chose a scope.
        if (conversation.projectId !== command.projectId) {
            throw new ForbiddenException(
                t('server-ai:Error.ConversationProjectImmutable', {
                    defaultValue: 'A conversation cannot be moved to another Project'
                })
            )
        }
        return conversation
    }
}
