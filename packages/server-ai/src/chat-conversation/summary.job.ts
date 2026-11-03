import { t } from 'i18next'
import { LongTermMemoryTypeEnum } from '@xpert-ai/contracts'
import { JOB_REF, Process, Processor } from '@nestjs/bull'
import { Inject, Logger, ForbiddenException } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { Job } from 'bull'
import { ChatMessageService } from '../chat-message/chat-message.service'
import { ChatMessageUpdateJobCommand } from '../chat-message/commands'
import { XpertSummarizeMemoryCommand } from '../xpert'
import {
    ExecutionContextReadyService,
    ResolveExecutionIdentityCommand,
    runWithExecutionIdentity
} from '@xpert-ai/server-core'
import { ChatConversationService } from './conversation.service'

export type ConversationSummaryReqType = {
    conversationId: string
    tenantId?: string
    organizationId?: string | null
    userId: string
    types: LongTermMemoryTypeEnum[]
    messageId?: string
}

@Processor({
    name: 'conversation-summary'
})
export class ConversationSummaryProcessor {
    private readonly logger = new Logger(ConversationSummaryProcessor.name)

    constructor(
        @Inject(JOB_REF) jobRef: Job<ConversationSummaryReqType>,
        private readonly service: ChatConversationService,
        private readonly messageService: ChatMessageService,
        private readonly commandBus: CommandBus,
        private readonly readiness: ExecutionContextReadyService
    ) {}

    @Process({ concurrency: 5 })
    async process(job: Job<ConversationSummaryReqType>) {
        await this.readiness.waitUntilReady()
        const { conversationId, userId, types } = job.data
        const conversation = await this.service.findOne(conversationId, {
            relations: ['messages']
        })
        if ((conversation.purpose && conversation.purpose !== 'private') || !conversation.messages.length) {
            return
        }
        const messageId = job.data.messageId ?? conversation.messages[conversation.messages.length - 1].id
        const message = await this.messageService.findOne(messageId)

        if (conversation.xpertId && message.executionId) {
            if (
                (job.data.tenantId && job.data.tenantId !== conversation.tenantId) ||
                (job.data.organizationId !== undefined && job.data.organizationId !== conversation.organizationId) ||
                conversation.createdById !== userId ||
                message.conversationId !== conversation.id
            ) {
                throw new ForbiddenException(t('server-ai:Error.ExecutionIdentityUnavailable'))
            }
            const identity = await this.commandBus.execute(
                new ResolveExecutionIdentityCommand({
                    userId,
                    tenantId: conversation.tenantId,
                    organizationId: conversation.organizationId,
                    kind: 'user'
                })
            )
            await runWithExecutionIdentity(identity, async () => {
                try {
                    const memoryKey = await this.commandBus.execute(
                        new XpertSummarizeMemoryCommand(
                            conversation.xpertId,
                            conversation.threadId,
                            message.executionId,
                            {
                                types,
                                isDraft: true,
                                userId
                            }
                        )
                    )

                    await this.commandBus.execute(
                        new ChatMessageUpdateJobCommand(messageId, {
                            [types[0]]: {
                                progress: 100,
                                status: 'done',
                                memoryKey
                            }
                        })
                    )
                } catch (err) {
                    console.error(err)
                }
            })
        }
    }
}
