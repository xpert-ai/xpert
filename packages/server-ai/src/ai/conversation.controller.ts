import {
	Body,
	Controller,
	Delete,
	Get,
	HttpCode,
	HttpStatus,
	Param,
	Patch,
	Post,
	Query,
	UseGuards,
	UseInterceptors
} from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import {
	ApiKeyOrClientSecretAuthGuard,
	OperatorValue,
	Public,
	TransformInterceptor,
	transformWhere,
	UUIDValidationPipe
} from '@xpert-ai/server-core'
import { CommandBus } from '@nestjs/cqrs'
import { FindOptionsOrder, Like } from 'typeorm'
import { IChatConversation, IChatMessage, IChatMessageFeedback } from '@xpert-ai/contracts'
import { ChatConversationService } from '../chat-conversation'
import { ChatMessageService } from '../chat-message/chat-message.service'
import { ChatMessageFeedbackService } from '../chat-message-feedback/feedback.service'
import { ChatConversationUpsertCommand } from '../chat-conversation/commands'
import { ChatMessageUpsertCommand } from '../chat-message/commands'
import { ThreadDeleteCommand } from './commands'
import { ChatMessageDTO, ChatMessageFeedbackDTO, ConversationDTO } from './dto'
import { ChatConversation, ChatMessage, ChatMessageFeedback } from '../core/entities/internal'
import { RequestContext } from '@xpert-ai/plugin-sdk'

type ConversationSearchRequest = {
	where?: Record<string, OperatorValue>
	order?: FindOptionsOrder<ChatConversation>
	limit?: number
	offset?: number
	search?: string
}

type MessageSearchRequest = {
	where?: Record<string, OperatorValue>
	order?: FindOptionsOrder<ChatMessage>
	limit?: number
	offset?: number
}

type FeedbackSearchRequest = {
	where?: Record<string, OperatorValue>
	order?: FindOptionsOrder<ChatMessageFeedback>
	limit?: number
	offset?: number
}

@ApiTags('AI/Conversations')
@ApiBearerAuth()
@Public()
@UseGuards(ApiKeyOrClientSecretAuthGuard)
@UseInterceptors(TransformInterceptor)
@Controller('conversations')
export class ConversationsController {
	constructor(
		private readonly conversationService: ChatConversationService,
		private readonly messageService: ChatMessageService,
		private readonly feedbackService: ChatMessageFeedbackService,
		private readonly commandBus: CommandBus
	) {}

	@Post()
	async createConversation(@Body() body: Partial<IChatConversation>) {
		const conversation = await this.commandBus.execute(
			new ChatConversationUpsertCommand({
				...body,
				from: body.from ?? 'api'
			})
		)
		return new ConversationDTO(conversation)
	}

	@HttpCode(HttpStatus.OK)
	@Post('search')
	async searchConversations(@Body() body: ConversationSearchRequest) {
		const where = transformWhere(body.where ?? {})
		if (body.search) {
			where['title'] = Like(`%${body.search}%`)
		}
		const currentUser = RequestContext.currentUserId()
		if (currentUser) {
			where['createdById'] = currentUser
		}
		const result = await this.conversationService.findAllInOrganizationOrTenant({
			where,
			order: body.order,
			take: body.limit,
			skip: body.offset
		})
		return {
			...result,
			items: result.items.map((item) => new ConversationDTO(item))
		}
	}

	@Get(':conversation_id')
	async getConversation(@Param('conversation_id', UUIDValidationPipe) id: string) {
		const conversation = await this.conversationService.findOneInOrganizationOrTenant(id)
		return new ConversationDTO(conversation)
	}

	@Patch(':conversation_id')
	async updateConversation(
		@Param('conversation_id', UUIDValidationPipe) id: string,
		@Body() body: Partial<IChatConversation>
	) {
		await this.conversationService.findOneInOrganizationOrTenant(id)
		const conversation = await this.commandBus.execute(new ChatConversationUpsertCommand({ ...body, id }))
		return new ConversationDTO(conversation)
	}

	@HttpCode(HttpStatus.ACCEPTED)
	@Delete(':conversation_id')
	async deleteConversation(@Param('conversation_id', UUIDValidationPipe) id: string) {
		const conversation = await this.conversationService.findOneInOrganizationOrTenant(id)
		await this.commandBus.execute(new ThreadDeleteCommand(conversation.threadId))
	}

	@Get(':conversation_id/messages')
	async listMessages(
		@Param('conversation_id', UUIDValidationPipe) conversationId: string,
		@Query('limit') limit?: number,
		@Query('offset') offset?: number
	) {
		await this.conversationService.findOneInOrganizationOrTenant(conversationId)
		const result = await this.messageService.findAllInOrganizationOrTenant({
			where: { conversationId },
			order: { createdAt: 'ASC' },
			take: limit,
			skip: offset
		})
		return {
			...result,
			items: result.items.map((item) => new ChatMessageDTO(item))
		}
	}

	@HttpCode(HttpStatus.OK)
	@Post(':conversation_id/messages/search')
	async searchMessages(
		@Param('conversation_id', UUIDValidationPipe) conversationId: string,
		@Body() body: MessageSearchRequest
	) {
		await this.conversationService.findOneInOrganizationOrTenant(conversationId)
		const where = {
			...transformWhere(body.where ?? {}),
			conversationId
		}
		const result = await this.messageService.findAllInOrganizationOrTenant({
			where,
			order: body.order ?? { createdAt: 'ASC' },
			take: body.limit,
			skip: body.offset
		})
		return {
			...result,
			items: result.items.map((item) => new ChatMessageDTO(item))
		}
	}

	@Post(':conversation_id/messages')
	async createMessage(
		@Param('conversation_id', UUIDValidationPipe) conversationId: string,
		@Body() body: Partial<IChatMessage>
	) {
		await this.conversationService.findOneInOrganizationOrTenant(conversationId)
		const message = await this.commandBus.execute(
			new ChatMessageUpsertCommand({
				...body,
				conversationId
			})
		)
		return new ChatMessageDTO(message)
	}

	@Get(':conversation_id/messages/:message_id')
	async getMessage(
		@Param('conversation_id', UUIDValidationPipe) conversationId: string,
		@Param('message_id', UUIDValidationPipe) messageId: string
	) {
		const message = await this.messageService.findOneInOrganizationOrTenant(messageId, { where: { conversationId } })
		return new ChatMessageDTO(message)
	}

	@Patch(':conversation_id/messages/:message_id')
	async updateMessage(
		@Param('conversation_id', UUIDValidationPipe) conversationId: string,
		@Param('message_id', UUIDValidationPipe) messageId: string,
		@Body() body: Partial<IChatMessage>
	) {
		await this.messageService.findOneInOrganizationOrTenant(messageId, { where: { conversationId } })
		const message = await this.commandBus.execute(
			new ChatMessageUpsertCommand({
				...body,
				id: messageId,
				conversationId
			})
		)
		return new ChatMessageDTO(message)
	}

	@HttpCode(HttpStatus.ACCEPTED)
	@Delete(':conversation_id/messages/:message_id')
	async deleteMessage(
		@Param('conversation_id', UUIDValidationPipe) conversationId: string,
		@Param('message_id', UUIDValidationPipe) messageId: string
	) {
		await this.messageService.findOneInOrganizationOrTenant(messageId, { where: { conversationId } })
		await this.messageService.delete(messageId)
	}

	@Get(':conversation_id/messages/:message_id/feedbacks')
	async listFeedbacks(
		@Param('conversation_id', UUIDValidationPipe) conversationId: string,
		@Param('message_id', UUIDValidationPipe) messageId: string,
		@Query('limit') limit?: number,
		@Query('offset') offset?: number
	) {
		await this.ensureMessage(conversationId, messageId)
		const result = await this.feedbackService.findAllInOrganizationOrTenant({
			where: { conversationId, messageId },
			order: { createdAt: 'ASC' },
			take: limit,
			skip: offset
		})
		return {
			...result,
			items: result.items.map((item) => new ChatMessageFeedbackDTO(item))
		}
	}

	@HttpCode(HttpStatus.OK)
	@Post(':conversation_id/messages/:message_id/feedbacks/search')
	async searchFeedbacks(
		@Param('conversation_id', UUIDValidationPipe) conversationId: string,
		@Param('message_id', UUIDValidationPipe) messageId: string,
		@Body() body: FeedbackSearchRequest
	) {
		await this.ensureMessage(conversationId, messageId)
		const where = {
			...transformWhere(body.where ?? {}),
			conversationId,
			messageId
		}
		const result = await this.feedbackService.findAllInOrganizationOrTenant({
			where,
			order: body.order ?? { createdAt: 'ASC' },
			take: body.limit,
			skip: body.offset
		})
		return {
			...result,
			items: result.items.map((item) => new ChatMessageFeedbackDTO(item))
		}
	}

	@Post(':conversation_id/messages/:message_id/feedbacks')
	async createFeedback(
		@Param('conversation_id', UUIDValidationPipe) conversationId: string,
		@Param('message_id', UUIDValidationPipe) messageId: string,
		@Body() body: Partial<IChatMessageFeedback>
	) {
		await this.ensureMessage(conversationId, messageId)
		const feedback = await this.feedbackService.create({
			...body,
			conversationId,
			messageId
		})
		// TODO: trigger summary job when feedback changes.
		return new ChatMessageFeedbackDTO(feedback)
	}

	@Get(':conversation_id/messages/:message_id/feedbacks/:feedback_id')
	async getFeedback(
		@Param('conversation_id', UUIDValidationPipe) conversationId: string,
		@Param('message_id', UUIDValidationPipe) messageId: string,
		@Param('feedback_id', UUIDValidationPipe) feedbackId: string
	) {
		const feedback = await this.feedbackService.findOneInOrganizationOrTenant(feedbackId, { where: { conversationId, messageId } })
		return new ChatMessageFeedbackDTO(feedback)
	}

	@Patch(':conversation_id/messages/:message_id/feedbacks/:feedback_id')
	async updateFeedback(
		@Param('conversation_id', UUIDValidationPipe) conversationId: string,
		@Param('message_id', UUIDValidationPipe) messageId: string,
		@Param('feedback_id', UUIDValidationPipe) feedbackId: string,
		@Body() body: Partial<IChatMessageFeedback>
	) {
		await this.feedbackService.findOneInOrganizationOrTenant(feedbackId, { where: { conversationId, messageId } })
		await this.feedbackService.update(feedbackId, {
			...body,
			conversationId,
			messageId
		})
		// TODO: trigger summary job when feedback changes.
		const feedback = await this.feedbackService.findOneInOrganizationOrTenant(feedbackId, { where: { conversationId, messageId } })
		return new ChatMessageFeedbackDTO(feedback)
	}

	@HttpCode(HttpStatus.ACCEPTED)
	@Delete(':conversation_id/messages/:message_id/feedbacks/:feedback_id')
	async deleteFeedback(
		@Param('conversation_id', UUIDValidationPipe) conversationId: string,
		@Param('message_id', UUIDValidationPipe) messageId: string,
		@Param('feedback_id', UUIDValidationPipe) feedbackId: string
	) {
		await this.feedbackService.findOneInOrganizationOrTenant(feedbackId, { where: { conversationId, messageId } })
		await this.feedbackService.delete(feedbackId)
	}

	private async ensureMessage(conversationId: string, messageId: string) {
		await this.conversationService.findOneInOrganizationOrTenant(conversationId)
		return this.messageService.findOneInOrganizationOrTenant(messageId, { where: { conversationId } })
	}
}
