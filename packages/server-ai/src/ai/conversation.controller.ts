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
    Put,
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
import { FindOptionsOrder, In, Like } from 'typeorm'
import {
    IChatConversation,
    IChatMessage,
    IChatMessageFeedback,
    TThreadGoalPatchRequest,
    TThreadGoalSetRequest
} from '@xpert-ai/contracts'
import { ChatConversationGoalService, ChatConversationService } from '../chat-conversation'
import { ChatMessageService } from '../chat-message/chat-message.service'
import { ChatMessageFeedbackService } from '../chat-message-feedback/feedback.service'
import { ChatConversationUpsertCommand } from '../chat-conversation/commands'
import { ChatMessageUpsertCommand } from '../chat-message/commands'
import { ThreadDeleteCommand } from './commands'
import { ChatMessageDTO, ChatMessageFeedbackDTO, ConversationDTO } from './dto'
import { ChatConversation, ChatMessage, ChatMessageFeedback } from '../core/entities/internal'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import {
    assertPublicXpertSessionConversationAccess,
    getPublicXpertSessionConversationScope
} from './public-xpert-principal'
import { XpertService } from '../xpert'

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
        private readonly goalService: ChatConversationGoalService,
        private readonly messageService: ChatMessageService,
        private readonly feedbackService: ChatMessageFeedbackService,
        private readonly commandBus: CommandBus,
        private readonly xpertService: XpertService
    ) {}

    @Post()
    async createConversation(@Body() body: Partial<IChatConversation>) {
        const publicScope = getPublicXpertSessionConversationScope()
        const conversation = await this.commandBus.execute(
            new ChatConversationUpsertCommand({
                ...body,
                ...(publicScope ? { createdById: publicScope.createdById, xpertId: publicScope.xpertId } : {}),
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
        const publicScope = getPublicXpertSessionConversationScope()
        if (publicScope) {
            where['createdById'] = publicScope.createdById
            where['xpertId'] = publicScope.xpertId
        } else if (currentUser) {
            where['createdById'] = await this.resolveConversationCreatedByFilter(currentUser, body.where)
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

    private async resolveConversationCreatedByFilter(
        currentUser: string,
        rawWhere?: ConversationSearchRequest['where']
    ) {
        const xpertId = this.extractSingleXpertId(rawWhere)
        if (!xpertId) {
            return currentUser
        }

        try {
            // Conversation search is read-only: when a user filters one owned xpert, include conversations
            // created by that xpert's existing technical account, but never create or initialize that account here.
            const xpert = await this.xpertService.findOneInOrganizationOrTenant(xpertId, {
                select: ['id', 'createdById', 'userId'],
                where: { createdById: currentUser }
            })
            const xpertPrincipalUserId = this.normalizeString(xpert?.userId)
            if (xpert?.createdById === currentUser && xpertPrincipalUserId) {
                return In([currentUser, xpertPrincipalUserId])
            }
        } catch {
            return currentUser
        }

        return currentUser
    }

    private extractSingleXpertId(where?: ConversationSearchRequest['where']) {
        const value = where?.xpertId as unknown
        if (typeof value === 'string') {
            return this.normalizeString(value)
        }

        if (!value || typeof value !== 'object' || Array.isArray(value) || !('$eq' in value)) {
            return null
        }

        return this.normalizeString((value as { $eq?: unknown }).$eq)
    }

    private normalizeString(value: unknown) {
        return typeof value === 'string' ? value.trim() : ''
    }

    @Get(':conversation_id')
    async getConversation(@Param('conversation_id', UUIDValidationPipe) id: string) {
        const conversation = await this.conversationService.findOneInOrganizationOrTenant(id)
        assertPublicXpertSessionConversationAccess(conversation)
        return new ConversationDTO(conversation)
    }

    @Patch(':conversation_id')
    async updateConversation(
        @Param('conversation_id', UUIDValidationPipe) id: string,
        @Body() body: Partial<IChatConversation>
    ) {
        const existing = await this.conversationService.findOneInOrganizationOrTenant(id)
        assertPublicXpertSessionConversationAccess(existing)
        const publicScope = getPublicXpertSessionConversationScope()
        const conversation = await this.commandBus.execute(
            new ChatConversationUpsertCommand({
                ...body,
                id,
                ...(publicScope ? { createdById: publicScope.createdById, xpertId: publicScope.xpertId } : {})
            })
        )
        return new ConversationDTO(conversation)
    }

    @HttpCode(HttpStatus.ACCEPTED)
    @Delete(':conversation_id')
    async deleteConversation(@Param('conversation_id', UUIDValidationPipe) id: string) {
        const conversation = await this.conversationService.findOneInOrganizationOrTenant(id)
        assertPublicXpertSessionConversationAccess(conversation)
        await this.commandBus.execute(new ThreadDeleteCommand(conversation.threadId))
    }

    @Get(':conversation_id/goal')
    async getGoal(@Param('conversation_id', UUIDValidationPipe) conversationId: string) {
        const conversation = await this.ensurePublicConversationAccess(conversationId)
        return this.goalService.getByConversationId(conversation.id)
    }

    @Put(':conversation_id/goal')
    async setGoal(
        @Param('conversation_id', UUIDValidationPipe) conversationId: string,
        @Body() body: TThreadGoalSetRequest
    ) {
        const conversation = await this.ensurePublicConversationAccess(conversationId)
        return this.goalService.setGoalFromUser(conversation.id, body)
    }

    @Patch(':conversation_id/goal')
    async updateGoal(
        @Param('conversation_id', UUIDValidationPipe) conversationId: string,
        @Body() body: TThreadGoalPatchRequest
    ) {
        const conversation = await this.ensurePublicConversationAccess(conversationId)
        return this.goalService.patchGoalFromUser(conversation.id, body)
    }

    @Delete(':conversation_id/goal')
    async clearGoal(@Param('conversation_id', UUIDValidationPipe) conversationId: string) {
        const conversation = await this.ensurePublicConversationAccess(conversationId)
        return this.goalService.clearGoalFromUser(conversation.id)
    }

    @Get(':conversation_id/messages')
    async listMessages(
        @Param('conversation_id', UUIDValidationPipe) conversationId: string,
        @Query('limit') limit?: number,
        @Query('offset') offset?: number
    ) {
        const conversation = await this.conversationService.findOneInOrganizationOrTenant(conversationId)
        assertPublicXpertSessionConversationAccess(conversation)
        const result = await this.messageService.findAllInOrganizationOrTenant({
            where: { conversationId },
            relations: ['attachments', 'fileAssets'],
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
        const conversation = await this.conversationService.findOneInOrganizationOrTenant(conversationId)
        assertPublicXpertSessionConversationAccess(conversation)
        const where = {
            ...transformWhere(body.where ?? {}),
            conversationId
        }
        const result = await this.messageService.findAllInOrganizationOrTenant({
            where,
            relations: ['attachments', 'fileAssets'],
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
        const conversation = await this.conversationService.findOneInOrganizationOrTenant(conversationId)
        assertPublicXpertSessionConversationAccess(conversation)
        const publicScope = getPublicXpertSessionConversationScope()
        const message = await this.commandBus.execute(
            new ChatMessageUpsertCommand({
                ...body,
                ...(publicScope ? { createdById: publicScope.createdById } : {}),
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
        await this.ensurePublicConversationAccess(conversationId)
        const message = await this.messageService.findOneInOrganizationOrTenant(messageId, {
            where: { conversationId },
            relations: ['attachments', 'fileAssets']
        })
        return new ChatMessageDTO(message)
    }

    @Patch(':conversation_id/messages/:message_id')
    async updateMessage(
        @Param('conversation_id', UUIDValidationPipe) conversationId: string,
        @Param('message_id', UUIDValidationPipe) messageId: string,
        @Body() body: Partial<IChatMessage>
    ) {
        await this.ensurePublicConversationAccess(conversationId)
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
        await this.ensurePublicConversationAccess(conversationId)
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
        const publicScope = getPublicXpertSessionConversationScope()
        const feedback = await this.feedbackService.create({
            ...body,
            ...(publicScope ? { createdById: publicScope.createdById } : {}),
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
        await this.ensureMessage(conversationId, messageId)
        const feedback = await this.feedbackService.findOneInOrganizationOrTenant(feedbackId, {
            where: { conversationId, messageId }
        })
        return new ChatMessageFeedbackDTO(feedback)
    }

    @Patch(':conversation_id/messages/:message_id/feedbacks/:feedback_id')
    async updateFeedback(
        @Param('conversation_id', UUIDValidationPipe) conversationId: string,
        @Param('message_id', UUIDValidationPipe) messageId: string,
        @Param('feedback_id', UUIDValidationPipe) feedbackId: string,
        @Body() body: Partial<IChatMessageFeedback>
    ) {
        await this.ensureMessage(conversationId, messageId)
        await this.feedbackService.findOneInOrganizationOrTenant(feedbackId, { where: { conversationId, messageId } })
        await this.feedbackService.update(feedbackId, {
            ...body,
            conversationId,
            messageId
        })
        // TODO: trigger summary job when feedback changes.
        const feedback = await this.feedbackService.findOneInOrganizationOrTenant(feedbackId, {
            where: { conversationId, messageId }
        })
        return new ChatMessageFeedbackDTO(feedback)
    }

    @HttpCode(HttpStatus.ACCEPTED)
    @Delete(':conversation_id/messages/:message_id/feedbacks/:feedback_id')
    async deleteFeedback(
        @Param('conversation_id', UUIDValidationPipe) conversationId: string,
        @Param('message_id', UUIDValidationPipe) messageId: string,
        @Param('feedback_id', UUIDValidationPipe) feedbackId: string
    ) {
        await this.ensureMessage(conversationId, messageId)
        await this.feedbackService.findOneInOrganizationOrTenant(feedbackId, { where: { conversationId, messageId } })
        await this.feedbackService.delete(feedbackId)
    }

    private async ensurePublicConversationAccess(conversationId: string) {
        const conversation = await this.conversationService.findOneInOrganizationOrTenant(conversationId)
        assertPublicXpertSessionConversationAccess(conversation)
        return conversation
    }

    private async ensureMessage(conversationId: string, messageId: string) {
        await this.ensurePublicConversationAccess(conversationId)
        return this.messageService.findOneInOrganizationOrTenant(messageId, { where: { conversationId } })
    }
}
