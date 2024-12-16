import { PaginationParams, RequestContext, TenantOrganizationAwareCrudService } from '@metad/server-core'
import { InjectQueue } from '@nestjs/bull'
import { Injectable, Logger } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Queue } from 'bull'
import { DeepPartial, Repository } from 'typeorm'
import { FindAgentExecutionsQuery } from '../xpert-agent-execution/queries'
import { ChatConversation } from './conversation.entity'
import { ChatConversationPublicDTO } from './dto'

@Injectable()
export class ChatConversationService extends TenantOrganizationAwareCrudService<ChatConversation> {
	private readonly logger = new Logger(ChatConversationService.name)

	constructor(
		@InjectRepository(ChatConversation)
		repository: Repository<ChatConversation>,
		readonly commandBus: CommandBus,
		readonly queryBus: QueryBus,
		@InjectQueue('conversation-summary') private summaryQueue: Queue
	) {
		super(repository)
	}

	async findAllByXpert(xpertId: string, options: PaginationParams<ChatConversation>) {
		return this.findAll({
			...options,
			where: {
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

	async triggerSummary(conversationId: string, messageId: string, feedbackId?: string) {
		return await this.summaryQueue.add({
			conversationId,
			messageId,
			userId: RequestContext.currentUserId(),
			feedbackId
		})
	}

	async getJob(id: number | string ) {
		return await this.summaryQueue.getJob(id)
	}
}
