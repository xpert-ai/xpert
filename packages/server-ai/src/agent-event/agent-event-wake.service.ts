import { ForbiddenException, Injectable, Logger } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { In, IsNull } from 'typeorm'
import { z } from 'zod/v3'
import { AssertChatConversationAccessQuery } from '../chat-conversation/queries/conversation-assert-access.query'
import { PublishedXpertAccessService } from '../xpert/published-xpert-access.service'
import { XpertChatCommand } from '../xpert/commands/chat.command'
import { AgentEventBindingService } from './agent-event-binding.service'
import type { EventClaim } from './agent-event.store'
import type { AgentEventBinding } from './agent-event.entity'

const targetSchema = z
    .object({
        conversationId: z.string().uuid(),
        threadId: z.string().trim().min(1).max(100).optional(),
        agentKey: z.string().trim().min(1).optional(),
        prompt: z.string().trim().min(1).max(8000)
    })
    .strict()

@Injectable()
export class AgentEventWakeService {
    private readonly logger = new Logger(AgentEventWakeService.name)
    constructor(
        private readonly commands: CommandBus,
        private readonly queries: QueryBus,
        private readonly published: PublishedXpertAccessService,
        private readonly bindings: AgentEventBindingService
    ) {}

    async start(
        binding: AgentEventBinding,
        { receiptId, fence }: Pick<EventClaim, 'receiptId' | 'fence'>,
        input: z.input<typeof targetSchema>,
        signal: AbortSignal
    ) {
        const target = targetSchema.parse(input)
        if (target.agentKey) {
            const assistant = await this.published.getAccessiblePublishedXpert(binding.xpertId, {
                relations: ['agent', 'agents']
            })
            if (
                assistant.agent?.key !== target.agentKey &&
                !assistant.agents?.some((agent) => agent.key === target.agentKey)
            )
                throw new ForbiddenException('event_agent_changed')
        }
        const family = await this.published.getAccessiblePublishedXpertFamilyIds(binding.xpertId)
        const conversation = await this.queries.execute(
            new AssertChatConversationAccessQuery(
                {
                    id: target.conversationId,
                    ...(target.threadId ? { threadId: target.threadId } : {}),
                    createdById: binding.userId,
                    tenantId: binding.tenantId,
                    organizationId: binding.organizationId,
                    projectId: binding.projectId ?? IsNull(),
                    xpertId: In(family)
                },
                'contribute'
            )
        )
        const current = await this.bindings.findEnabled(binding.id, binding.tenantId, binding.organizationId)
        if (current?.revision !== binding.revision || !conversation.threadId)
            throw new ForbiddenException('event_target_changed')
        signal.throwIfAborted()
        const stream = await this.commands.execute(
            new XpertChatCommand(
                { action: 'send', conversationId: conversation.id, message: { input: { input: target.prompt } } },
                {
                    from: 'job',
                    agentKey: target.agentKey,
                    xpertId: binding.xpertId,
                    threadId: target.threadId ?? conversation.threadId,
                    isDerivedThread: Boolean(target.threadId && target.threadId !== conversation.threadId),
                    messageEnvelope: {
                        version: 1,
                        source: { type: 'assistant', xpertId: binding.xpertId },
                        presentation: 'event',
                        correlation: { executionId: receiptId },
                        target: {
                            xpertId: binding.xpertId,
                            conversationId: conversation.id,
                            threadId: target.threadId ?? conversation.threadId
                        }
                    },
                    projectId: binding.projectId ?? undefined,
                    once: true,
                    eventBinding: { id: binding.id, revision: binding.revision, fence },
                    execution: { id: receiptId },
                    streamPersistence: { transport: 'redis-stream' }
                }
            )
        )
        // The receipt records admission. The execution owns its stream and terminal status beyond the scan deadline.
        stream.subscribe({ error: () => this.logger.warn(`Follow-up execution failed: ${receiptId}`) })
    }
}
