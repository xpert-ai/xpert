import { LongTermMemoryTypeEnum } from '@metad/contracts'
import { RequestContext, TenantOrganizationAwareCrudService } from '@metad/server-core'
import { Injectable, Logger } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ChatConversationService } from '../chat-conversation/'
import { ChatMessageFeedback } from './feedback.entity'

@Injectable()
export class ChatMessageFeedbackService extends TenantOrganizationAwareCrudService<ChatMessageFeedback> {
	private readonly logger = new Logger(ChatMessageFeedbackService.name)

	constructor(
		@InjectRepository(ChatMessageFeedback)
		repository: Repository<ChatMessageFeedback>,
		private readonly conversationService: ChatConversationService,
		readonly commandBus: CommandBus,
		readonly queryBus: QueryBus
	) {
		super(repository)
	}

	async triggerSummary(id: string) {
		const feedback = await this.findOne(id)
		await this.conversationService.triggerSummary(
			feedback.conversationId,
			LongTermMemoryTypeEnum.QA,
			RequestContext.currentUserId(),
			feedback.messageId
		)
	}

	async deleteSummary(id: string) {
		const feedback = await this.findOne(id)
		await this.conversationService.deleteSummary(feedback.conversationId, feedback.messageId, LongTermMemoryTypeEnum.QA,)
	}
}
