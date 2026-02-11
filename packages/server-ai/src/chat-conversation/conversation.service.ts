import { BaseStore } from '@langchain/langgraph'
import { IChatMessage, LongTermMemoryTypeEnum } from '@metad/contracts'
import { PaginationParams, RequestContext, TenantOrganizationAwareCrudService } from '@metad/server-core'
import { InjectQueue } from '@nestjs/bull'
import { Injectable, Logger } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Queue } from 'bull'
import { DeepPartial, FindOneOptions, Repository } from 'typeorm'
import { ChatMessageService } from '../chat-message/chat-message.service'
import { CreateCopilotStoreCommand } from '../copilot-store'
import { FindAgentExecutionsQuery, XpertAgentExecutionStateQuery } from '../xpert-agent-execution/queries'
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
		@InjectQueue('conversation-summary') private summaryQueue: Queue
	) {
		super(repository)
	}

	async update(id: string, entity: Partial<ChatConversation>) {
		let record: ChatConversation | null = null
		try {
			record = await super.findOne(id)
		} catch (error: any) {
			if (isNotFoundError(error)) {
				this.logger.debug(`Scoped conversation lookup missed id=${id}, falling back to id-only lookup`)
				record = await this.findOneByIdAnyScope(id)
			} else {
				throw error
			}
		}

		if (!record) {
			throw new Error(`Conversation ${id} not found`)
		}

		Object.assign(record, entity)
		return await this.repository.save(record)
	}

	async findOneByIdAnyScope(id: string, options?: FindOneOptions<ChatConversation>): Promise<ChatConversation | null> {
		return this.repository.findOne({
			...(options ?? {}),
			where: {
				id,
				...((options?.where as Record<string, any>) ?? {})
			} as any
		})
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
		const { tenantId, organizationId } = message
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
				if (summaryJob.memoryKey) {
					const keys = Array.isArray(summaryJob.memoryKey) ? summaryJob.memoryKey : [summaryJob.memoryKey]

					const store = await this.commandBus.execute<CreateCopilotStoreCommand, BaseStore>(
						new CreateCopilotStoreCommand({
							tenantId,
							organizationId,
							userId
						})
					)

					for await (const key of keys) {
						await store.delete([conversation.xpertId], key)
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

function isNotFoundError(error: unknown): boolean {
	if (!error || typeof error !== 'object') {
		return false
	}
	const anyError = error as any
	return (
		anyError?.status === 404 ||
		anyError?.response?.statusCode === 404 ||
		`${anyError?.message ?? ''}`.toLowerCase().includes('requested record was not found')
	)
}
