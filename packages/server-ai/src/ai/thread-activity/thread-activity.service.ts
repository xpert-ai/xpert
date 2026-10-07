// Discovery reads committed facts. Every reconnect receives a complete snapshot;
// no ephemeral notification or client cursor can cause a short run to disappear.
import { Injectable } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { DataSource, In, IsNull } from 'typeorm'
import { IChatConversation, parseResourceCardContent, ThreadActivitySnapshot } from '@xpert-ai/contracts'
import { XpertAgentExecution } from '../../xpert-agent-execution/agent-execution.entity'
import { ChatMessage } from '../../chat-message/chat-message.entity'
import {
    BoundConversationResourceCard,
    RefreshConversationResourceCardsCommand
} from '../../chat-message/commands/refresh-resource-cards.command'

@Injectable()
export class ThreadActivityService {
    constructor(
        private readonly dataSource: DataSource,
        private readonly commandBus: CommandBus
    ) {}

    /** Caller re-authorizes the conversation before each read, including a live subscription. */
    async snapshot(conversation: IChatConversation, threadId: string): Promise<ThreadActivitySnapshot> {
        const scope = { tenantId: conversation.tenantId, organizationId: conversation.organizationId ?? IsNull() }
        const runs = await this.dataSource.getRepository(XpertAgentExecution).find({
            where: { ...scope, threadId, parentId: IsNull() },
            select: ['id', 'status', 'updatedAt', 'createdAt'],
            order: { createdAt: 'ASC', id: 'ASC' }
        })
        const revisions = runs.length
            ? await this.dataSource.getRepository(ChatMessage).find({
                  where: {
                      ...scope,
                      conversationId: conversation.id,
                      role: 'ai',
                      executionId: In(runs.map((run) => run.id))
                  },
                  select: ['executionId', 'updatedAt']
              })
            : []
        const result: ThreadActivitySnapshot = {
            version: 1,
            threadId,
            runs: runs.map((run) => ({
                id: run.id,
                status: run.status,
                updatedAt: run.updatedAt.toISOString(),
                createdAt: run.createdAt.toISOString(),
                messageRevision:
                    revisions
                        .filter((message) => message.executionId === run.id)
                        .map((message) => message.updatedAt.toISOString())
                        .sort()
                        .at(-1) ?? ''
            })),
            cards: []
        }
        if (!runs.length) return result
        const messages = await this.dataSource
            .getRepository(ChatMessage)
            .createQueryBuilder('message')
            .select(['message.id', 'message.executionId', 'message.content'])
            .where({
                ...scope,
                conversationId: conversation.id,
                role: 'ai',
                executionId: In(runs.map((run) => run.id))
            })
            .andWhere('CAST(message.content AS text) LIKE :card', { card: '%"resource_card"%' })
            .getMany()
        const cards: BoundConversationResourceCard[] = []
        for (const message of messages) {
            if (!Array.isArray(message.content)) continue
            for (const part of message.content) {
                const card = parseResourceCardContent(part)
                if (card) cards.push({ ...card, messageId: message.id, executionId: message.executionId })
            }
        }
        result.cards = await this.commandBus.execute(
            new RefreshConversationResourceCardsCommand(conversation, threadId, cards)
        )
        return result
    }
}
