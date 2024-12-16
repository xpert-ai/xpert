import { BaseStore } from '@langchain/langgraph'
import { JOB_REF, Process, Processor } from '@nestjs/bull'
import { Inject, Logger } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { Job } from 'bull'
import { v4 as uuidv4 } from 'uuid'
import { ChatMessageFeedbackUpdateJobCommand } from '../chat-message-feedback/commands/'
import { ChatMessageService } from '../chat-message/chat-message.service'
import { CreateCopilotStoreCommand } from '../copilot-store'
import { XpertSummarizeMemoryCommand } from '../xpert'
import { ChatConversationService } from './conversation.service'

export type ConversationSummaryReqType = {
	conversationId: string
	messageId?: string
	userId: string
	feedbackId?: string
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
		private readonly commandBus: CommandBus
	) {}

	@Process({ concurrency: 5 })
	async process(job: Job<ConversationSummaryReqType>) {
		const { conversationId, messageId, userId, feedbackId } = job.data
		const conversation = await this.service.findOne(conversationId, { relations: ['_messages'] })
		const message = await this.messageService.findOne(messageId)

		const { tenantId, organizationId } = conversation

		if (conversation.xpertId && message.executionId) {
			try {
				const experiences = await this.commandBus.execute(
					new XpertSummarizeMemoryCommand(conversation.xpertId, message.executionId, {
						isDraft: true,
						userId
					})
				)

				const store = await this.commandBus.execute<CreateCopilotStoreCommand, BaseStore>(
					new CreateCopilotStoreCommand({
						tenantId,
						organizationId,
						userId
					})
				)

				if (Array.isArray(experiences)) {
					await store.batch(
						experiences.map((experience) => ({
							namespace: [conversation.xpertId],
							key: uuidv4(),
							value: {
								experience
							}
						}))
					)
				} else if (typeof experiences === 'string') {
					await store.put([conversation.xpertId], uuidv4(), {
						experience: experiences
					})
				}

				if (feedbackId) {
					await this.commandBus.execute(
						new ChatMessageFeedbackUpdateJobCommand(feedbackId, {
							progress: 100,
							status: 'done'
						})
					)
				}
			} catch (err) {
				console.error(err)
			}
		}
	}
}
