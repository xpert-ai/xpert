import { IChatMessage, LongTermMemoryTypeEnum, TSummaryMemoryRef } from '@metad/contracts'
import { PaginationParams, RequestContext, TenantOrganizationAwareCrudService } from '@metad/server-core'
import { InjectQueue } from '@nestjs/bull'
import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Queue } from 'bull'
import { DeepPartial, Repository } from 'typeorm'
import { ChatMessageService } from '../chat-message/chat-message.service'
import { DEFAULT_MEMORY_PROVIDER_NAME, MemoryRegistry } from '../xpert-memory'
import { FindAgentExecutionsQuery, XpertAgentExecutionStateQuery } from '../xpert-agent-execution/queries'
import { XpertService } from '../xpert'
import { ChatConversation } from './conversation.entity'
import { ChatConversationPublicDTO } from './dto'

@Injectable()
export class ChatConversationService extends TenantOrganizationAwareCrudService<ChatConversation> {
    private readonly logger = new Logger(ChatConversationService.name)

    constructor(
        @InjectRepository(ChatConversation)
        public repository: Repository<ChatConversation>,
        private readonly messageService: ChatMessageService,
        readonly commandBus: CommandBus,
        readonly queryBus: QueryBus,
        @InjectQueue('conversation-summary') private summaryQueue: Queue,
        private readonly xpertService: XpertService,
        private readonly memoryRegistry: MemoryRegistry
    ) {
        super(repository)
    }

    async save(entity: DeepPartial<ChatConversation>): Promise<ChatConversation> {
        const tenantId = RequestContext.currentTenantId()
        const organizationId = RequestContext.getOrganizationId()

        try {
            return await this.repository.save({
                ...entity,
                tenantId: tenantId ?? (entity as ChatConversation).tenantId,
                organizationId: organizationId ?? (entity as ChatConversation).organizationId
            })
        } catch (error) {
            this.logger.error(error)
            throw new BadRequestException(error)
        }
    }

    async findAllByXpert(xpertId: string, options: PaginationParams<ChatConversation>) {
        return this.findAll({
            ...options,
            where: {
                ...(options.where ?? {}),
                xpertId
            }
        })
    }

    async findOneDetail(id: string, options: DeepPartial<PaginationParams<ChatConversation>>) {
        // Split executions relation
        const { relations } = options ?? {}
        const entity = await this.findOne(id, {
            ...(options ?? {}),
            relations: relations?.filter((_) => _ !== 'executions')
        })

        let executions = null
        if (relations?.includes('executions')) {
            const result = await this.queryBus.execute(
                new FindAgentExecutionsQuery({ where: { threadId: entity.threadId } })
            )
            executions = result.items
        }

        return new ChatConversationPublicDTO({
            ...entity,
            executions
        })
    }

    async triggerSummary(conversationId: string, type: LongTermMemoryTypeEnum, userId: string, messageId?: string) {
        let message: IChatMessage = null
        if (messageId) {
            message = await this.messageService.findOne(messageId)
        } else {
            const conversation = await this.findOne(conversationId, { relations: ['messages'] })
            if (!conversation.messages.length) {
                return
            }
            message = conversation.messages[conversation.messages.length - 1]
        }

        if (message?.summaryJob?.[type]) {
            return
        }
        return await this.summaryQueue.add({
            conversationId,
            userId,
            messageId,
            types: [type]
        })
    }

    async deleteSummary(conversationId: string, messageId: string, type: LongTermMemoryTypeEnum) {
        const conversation = await this.findOne(conversationId)
        const message = await this.messageService.findOne(messageId)
        const { tenantId } = message
        const userId = RequestContext.currentUserId()

        const summaryJob = message.summaryJob?.[type]
        try {
            if (summaryJob?.jobId) {
                const job = await this.getJob(summaryJob.jobId)
                // cancel job
                if (job) {
                    await job.discard()
                    await job.moveToFailed({ message: 'Job stopped by user' }, true)
                }
            }

            if (summaryJob) {
                if (summaryJob.memoryKey && conversation.xpertId) {
                    const xpert = await this.xpertService.findOne(conversation.xpertId)
                    const memoryRefs = normalizeSummaryMemoryRefs(summaryJob.memoryKey)

                    for (const ref of memoryRefs) {
                        const providerName = ref.providerName ?? DEFAULT_MEMORY_PROVIDER_NAME
                        const provider = this.memoryRegistry.getProvider(providerName)
                        if (!provider) {
                            this.logger.warn(`Memory provider "${providerName}" is unavailable while deleting summary.`)
                            continue
                        }

                        await provider.applyGovernance(
                            tenantId,
                            provider.resolveScope(xpert),
                            ref.memoryId,
                            'archive',
                            userId,
                            {
                                userId,
                                audience: ref.audience ?? 'all',
                                ownerUserId: ref.ownerUserId
                            }
                        )
                    }
                }

                await this.messageService.update(messageId, {
                    summaryJob: {
                        ...message.summaryJob,
                        [type]: null
                    }
                })
            }
        } catch (err) {
            this.logger.error(err)
        }
    }

    async getJob(id: number | string) {
        return await this.summaryQueue.getJob(id)
    }

    async getThreadState(id: string) {
        const conversation = await this.findOne(id, { relations: ['messages'] })
        const lastMessage = conversation.messages[conversation.messages.length - 1]

        if (lastMessage.executionId) {
            return await this.queryBus.execute(new XpertAgentExecutionStateQuery(lastMessage.executionId))
        }

        return null
    }

    async getAttachments(id: string) {
        const conversation = await this.findOne(id, { relations: ['attachments'] })
        return conversation.attachments
    }
}

function normalizeSummaryMemoryRefs(
    memoryKey: string | TSummaryMemoryRef | Array<string | TSummaryMemoryRef>
): TSummaryMemoryRef[] {
    const items = Array.isArray(memoryKey) ? memoryKey : [memoryKey]
    return items
        .map((item) =>
            typeof item === 'string'
                ? {
                      memoryId: item
                  }
                : item
        )
        .filter((item): item is TSummaryMemoryRef => !!item?.memoryId)
}
