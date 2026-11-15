import { isHumanMessage, type BaseMessage } from '@langchain/core/messages'
import { z } from 'zod/v3'
import { chatMessagePresentation } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, Repository } from 'typeorm'
import { ChatMessage } from '../../chat-message/chat-message.entity'
import { hasGroupRuntime } from '../../chat-group/group-runtime-context'
import { FileMemoryUserInput, type FileMemoryXpertScope } from '../../plugins/file-memory/ports'

// Other middleware may rewrite messages. Approvals apply only to this turn's plain user input.
const noSelections = z.array(z.unknown()).max(0).nullish()
const plainTurn = z.object({
    inputIdentity: z.object({ id: z.string() }),
    human: z.object({
        input: z.string(),
        files: noSelections,
        references: noSelections,
        resourceSkills: noSelections,
        commandSource: z.null().optional(),
        planMode: z.literal(false).nullish()
    })
})

@Injectable()
export class XpertMemoryUserInput implements FileMemoryUserInput {
    constructor(@InjectRepository(ChatMessage) private readonly messages: Repository<ChatMessage>) {}
    plainText(messageId: string, messages: BaseMessage[], state: unknown) {
        const message = messages.at(-1)
        if (!message || !isHumanMessage(message) || typeof message.content !== 'string') return
        const turn = plainTurn.safeParse(state)
        if (turn.success && turn.data.inputIdentity.id === messageId && turn.data.human.input === message.content)
            return message.content
    }

    async matches(scope: FileMemoryXpertScope, conversationId: string, id: string, text: string) {
        if (!scope.userId || hasGroupRuntime()) return false
        const row = await this.messages.findOne({
            where: {
                id,
                conversationId,
                tenantId: scope.tenantId,
                organizationId: scope.organizationId ?? IsNull(),
                role: 'human',
                createdById: scope.userId,
                conversation: {
                    id: conversationId,
                    xpertId: scope.id,
                    purpose: 'private',
                    taskId: IsNull(),
                    projectId: scope.projectId ?? IsNull()
                }
            },
            select: ['id', 'content', 'messageEnvelope', 'thirdPartyMessage', 'followUpMode']
        })
        return (
            !!row &&
            row.content === text &&
            !row.followUpMode &&
            chatMessagePresentation(row) === 'message' &&
            (!row.messageEnvelope || ['user', 'voice'].includes(row.messageEnvelope.source.type)) &&
            !row.thirdPartyMessage?.internalGoalRun
        )
    }
}
