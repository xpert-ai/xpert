import { BaseStore } from '@langchain/langgraph'
import { JOB_REF, Process, Processor } from '@nestjs/bull'
import { Inject, Logger } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { Job } from 'bull'
import { ChatMessageService } from '../chat-message/chat-message.service'
import { ChatMessageUpdateJobCommand } from '../chat-message/commands'
import { CreateCopilotStoreCommand } from '../copilot-store'
import { XpertSummarizeMemoryCommand } from '../xpert'
import { ChatConversationService } from './conversation.service'

export type ConversationSummaryReqType = {
	conversationId: string
	messageId?: string
	userId: string

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
		const { conversationId, messageId, userId } = job.data
		const conversation = await this.service.findOne(conversationId, { relations: ['messages'] })
		const message = await this.messageService.findOne(messageId)

		if (conversation.xpertId && message.executionId) {
			try {
				const memoryKey = await this.commandBus.execute(
					new XpertSummarizeMemoryCommand(conversation.xpertId, message.executionId, {
						isDraft: true,
						userId
					})
				)

				await this.commandBus.execute(
					new ChatMessageUpdateJobCommand(messageId, {
						progress: 100,
						status: 'done',
						memoryKey
					})
				)
			} catch (err) {
				console.error(err)
			}
		}
	}
}
