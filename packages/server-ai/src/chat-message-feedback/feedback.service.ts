import { TenantOrganizationAwareCrudService } from '@metad/server-core'
import { Injectable, Logger } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ChatConversationService } from '../chat-conversation/conversation.service'
import { ChatMessageFeedback } from './feedback.entity'

@Injectable()
export class ChatMessageFeedbackService extends TenantOrganizationAwareCrudService<ChatMessageFeedback> {
	private readonly logger = new Logger(ChatMessageFeedbackService.name)

	constructor(
		@InjectRepository(ChatMessageFeedback)
		chatRepository: Repository<ChatMessageFeedback>,
		private readonly conversationService: ChatConversationService,
		readonly commandBus: CommandBus,
		readonly queryBus: QueryBus
	) {
		super(chatRepository)
	}

	async triggerSummary(id: string) {
		const feedback = await this.findOne(id)
		if (feedback) {
			const job = await this.conversationService.triggerSummary(
				feedback.conversationId, feedback.messageId,
				id
			)
			feedback.summaryJob = {
				jobId: job.id,
				progress: 0,
				status: ''
			}
			await this.repository.save(feedback)
		} else {
			this.logger.warn(`未找到反馈ID: ${id}`)
		}
	}

	async deleteSummary(id: string) {
		const feedback = await this.findOne(id)
		if (feedback) {
			try {
				if (feedback.summaryJob?.jobId) {
					const job = await this.conversationService.getJob(feedback.summaryJob.jobId)
					// cancel job
					if (job) {
						await job.discard()
						await job.moveToFailed({ message: 'Job stopped by user' }, true)
					}

					feedback.summaryJob = null
					await this.repository.save(feedback)
				}
			} catch (err) {}
		} else {
			this.logger.warn(`未找到反馈ID: ${id}`)
		}
	}
}
