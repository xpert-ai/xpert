import {
    BadRequestException,
    Body,
    Controller,
    Delete,
    ForbiddenException,
    Get,
    HttpCode,
    HttpStatus,
    Optional,
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
    AllowClientSecretBindings,
    ApiKeyOrClientSecretAuthGuard,
    OperatorValue,
    Public,
    TransformInterceptor,
    transformWhere,
    UUIDValidationPipe
} from '@xpert-ai/server-core'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { FindOptionsOrder, In, Like } from 'typeorm'
import {
    IChatConversation,
    IChatMessage,
    IChatMessageFeedback,
    SecretTokenBindingType,
    TThreadGoalPatchRequest,
    TThreadGoalSetRequest
} from '@xpert-ai/contracts'
import {
    type ChatConversationAccessOperation,
    ChatConversationGoalService,
    ChatConversationService,
    ChatConversationThreadService
} from '../chat-conversation'
import { ChatTaskSummaryService } from '../chat-conversation/task-summary.service'
import { ChatMessageService } from '../chat-message/chat-message.service'
import { ChatMessageFeedbackService } from '../chat-message-feedback/feedback.service'
import { ChatConversationUpsertCommand } from '../chat-conversation/commands'
import { ChatMessageUpsertCommand } from '../chat-message/commands'
import { ThreadDeleteCommand } from './commands'
import { ChatMessageDTO, ChatMessageFeedbackDTO, ConversationDTO, ThreadDTO } from './dto'
import { ChatConversation, ChatMessage, ChatMessageFeedback } from '../core/entities/internal'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import {
    assertPublicXpertSessionConversationAccess,
    getPublicXpertSessionConversationScope
} from './public-xpert-principal'
import { bindConversationAssistantIfUnbound, bindConversationProjectIfUnbound } from './assistant-request-context'
import { PublishedXpertAccessService, XpertService } from '../xpert'
import { XpertProjectService } from '../xpert-project'
import { t } from 'i18next'

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

type FeedbackMutationRequest = Partial<Pick<IChatMessageFeedback, 'rating' | 'content'>>
type ConversationCreateRequest = Partial<
    Pick<
        IChatConversation,
        'id' | 'threadId' | 'title' | 'status' | 'options' | 'from' | 'fromEndUserId' | 'xpertId' | 'projectId'
    >
>
type ConversationUpdateRequest = Partial<Pick<IChatConversation, 'title' | 'status' | 'options'>>
type MessageMutationRequest = Partial<
    Pick<
        IChatMessage,
        | 'id'
        | 'parentId'
        | 'role'
        | 'status'
        | 'content'
        | 'reasoning'
        | 'error'
        | 'references'
        | 'taskSummary'
        | 'thirdPartyMessage'
        | 'events'
        | 'executionId'
        | 'followUpMode'
        | 'followUpStatus'
        | 'targetExecutionId'
        | 'visibleAt'
    >
>

@ApiTags('AI/Conversations')
@ApiBearerAuth()
@Public()
@AllowClientSecretBindings(SecretTokenBindingType.ENTERPRISE_XPERT)
@UseGuards(ApiKeyOrClientSecretAuthGuard)
@UseInterceptors(TransformInterceptor)
@Controller('conversations')
export class ConversationsController {
    constructor(
        private readonly conversationService: ChatConversationService,
        private readonly goalService: ChatConversationGoalService,
        private readonly taskSummaryService: ChatTaskSummaryService,
        private readonly messageService: ChatMessageService,
        private readonly feedbackService: ChatMessageFeedbackService,
        private readonly commandBus: CommandBus,
        private readonly queryBus: QueryBus,
        private readonly publishedXpertAccessService: PublishedXpertAccessService,
        private readonly xpertService: XpertService,
        @Optional() private readonly projectService?: XpertProjectService,
        @Optional() private readonly conversationThreadService?: ChatConversationThreadService
    ) {}

    @Post()
    async createConversation(@Body() body: ConversationCreateRequest) {
        const publicScope = getPublicXpertSessionConversationScope()
        const xpertId = publicScope?.xpertId ?? this.normalizeString(body.xpertId)
        const projectId = this.normalizeString(body.projectId)
        const requestedConversationId = this.normalizeString(body.id)
        const requestedThreadId = this.normalizeString(body.threadId)
        const createdById = publicScope?.createdById ?? RequestContext.currentUserId()
        if (!createdById) {
            throw new ForbiddenException(
                t('server-ai:Error.ConversationUserContextRequired', {
                    defaultValue: 'A user context is required to create a conversation'
                })
            )
        }
        const xpert = xpertId ? await this.publishedXpertAccessService.getAccessiblePublishedXpert(xpertId) : null
        if (projectId) {
            // Validate the Project/Assistant/user tuple before projectId reaches
            // persistence; the client cannot create a conversation in another workspace.
            if (!xpertId) {
                throw new BadRequestException(
                    t('server-ai:Error.ProjectConversationXpertRequired', {
                        defaultValue: 'A Project conversation requires an Xpert ID'
                    })
                )
            }
            if (!this.projectService) {
                throw new BadRequestException(
                    t('server-ai:Error.ProjectConversationUnavailable', {
                        defaultValue: 'Project conversations are unavailable'
                    })
                )
            }
            await this.projectService.assertRuntimeAccess(projectId, xpertId)
        }

        let existingConversation = requestedConversationId
            ? await this.ensureConversationAccess(requestedConversationId, 'contribute')
            : await this.findConversationCreatedByThread(requestedThreadId, createdById)
        if (existingConversation) {
            if (requestedThreadId && existingConversation.threadId !== requestedThreadId) {
                throw this.conversationAccessDenied()
            }
            if (xpert) {
                existingConversation = await bindConversationAssistantIfUnbound(
                    this.commandBus,
                    existingConversation,
                    xpert,
                    this.publishedXpertAccessService
                )
            }
            existingConversation = await bindConversationProjectIfUnbound(
                this.commandBus,
                existingConversation,
                projectId || undefined
            )

            if (body.title === undefined && body.status === undefined && body.options === undefined) {
                return new ConversationDTO(existingConversation)
            }

            const conversation = await this.commandBus.execute(
                new ChatConversationUpsertCommand({
                    id: existingConversation.id,
                    ...(body.title !== undefined ? { title: body.title } : {}),
                    ...(body.status !== undefined ? { status: body.status } : {}),
                    ...(body.options !== undefined ? { options: body.options } : {})
                })
            )
            return new ConversationDTO(conversation)
        }

        const conversation = await this.commandBus.execute(
            new ChatConversationUpsertCommand({
                ...(requestedThreadId ? { threadId: requestedThreadId } : {}),
                ...(body.title !== undefined ? { title: body.title } : {}),
                ...(body.status !== undefined ? { status: body.status } : {}),
                ...(body.options !== undefined ? { options: body.options } : {}),
                ...(body.fromEndUserId !== undefined ? { fromEndUserId: body.fromEndUserId } : {}),
                createdById,
                ...(xpertId ? { xpertId } : {}),
                ...(projectId ? { projectId } : {}),
                from: body.from ?? 'api'
            })
        )
        return new ConversationDTO(conversation)
    }

    private async findConversationCreatedByThread(threadId: string, createdById: string) {
        if (!threadId) {
            return null
        }

        const result = await this.conversationService.findAllInOrganizationOrTenant({
            where: { threadId, createdById },
            order: { createdAt: 'ASC' },
            take: 1
        })
        const conversation = result.items[0]
        return conversation ? this.ensureConversationAccess(conversation.id, 'contribute') : null
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
            where['xpertId'] = In(
                await this.publishedXpertAccessService.getAccessiblePublishedXpertFamilyIds(publicScope.xpertId)
            )
        } else if (currentUser) {
            where['createdById'] = await this.resolveConversationCreatedByFilter(currentUser, body.where)
            const xpertId = this.extractSingleXpertId(body.where)
            if (xpertId) {
                try {
                    where['xpertId'] = In(
                        await this.publishedXpertAccessService.getAccessiblePublishedXpertFamilyIds(xpertId)
                    )
                } catch {
                    // Draft, deleted, or inaccessible filters keep their exact
                    // transformed value and remain owner-scoped below.
                }
            }
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
        const conversation = await this.ensureConversationAccess(id)
        return new ConversationDTO(conversation)
    }

    @Patch(':conversation_id')
    async updateConversation(
        @Param('conversation_id', UUIDValidationPipe) id: string,
        @Body() body: ConversationUpdateRequest
    ) {
        await this.ensureConversationAccess(id, 'manage')
        const conversation = await this.commandBus.execute(
            new ChatConversationUpsertCommand({
                id,
                ...(body.title !== undefined ? { title: body.title } : {}),
                ...(body.status !== undefined ? { status: body.status } : {}),
                ...(body.options !== undefined ? { options: body.options } : {})
            })
        )
        return new ConversationDTO(conversation)
    }

    @HttpCode(HttpStatus.ACCEPTED)
    @Delete(':conversation_id')
    async deleteConversation(@Param('conversation_id', UUIDValidationPipe) id: string) {
        const conversation = await this.ensureConversationAccess(id, 'manage')
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
        const conversation = await this.ensureConversationAccess(conversationId, 'contribute')
        return this.goalService.setGoalFromUser(conversation.id, body)
    }

    @Patch(':conversation_id/goal')
    async updateGoal(
        @Param('conversation_id', UUIDValidationPipe) conversationId: string,
        @Body() body: TThreadGoalPatchRequest
    ) {
        const conversation = await this.ensureConversationAccess(conversationId, 'contribute')
        return this.goalService.patchGoalFromUser(conversation.id, body)
    }

    @Delete(':conversation_id/goal')
    async clearGoal(@Param('conversation_id', UUIDValidationPipe) conversationId: string) {
        const conversation = await this.ensureConversationAccess(conversationId, 'contribute')
        return this.goalService.clearGoalFromUser(conversation.id)
    }

    @Get(':conversation_id/threads')
    async listConversationThreads(@Param('conversation_id', UUIDValidationPipe) conversationId: string) {
        const conversation = await this.ensurePublicConversationAccess(conversationId)
        if (!this.conversationThreadService) return []
        await this.conversationThreadService.ensurePrimary(conversation)
        const threads = await this.conversationThreadService.listByConversation(conversation.id)
        return threads.map((thread) => new ThreadDTO(conversation, {}, thread))
    }

    @Get(':conversation_id/task-summary')
    async getTaskSummary(@Param('conversation_id', UUIDValidationPipe) conversationId: string) {
        const conversation = await this.ensurePublicConversationAccess(conversationId)
        return this.taskSummaryService.getSnapshot(conversation)
    }

    @Get(':conversation_id/task-summary/:section')
    async listTaskSummaryItems(
        @Param('conversation_id', UUIDValidationPipe) conversationId: string,
        @Param('section') section: string,
        @Query('offset') offset?: number,
        @Query('limit') limit?: number
    ) {
        const conversation = await this.ensurePublicConversationAccess(conversationId)
        return this.taskSummaryService.listSection(conversation, section, offset, limit)
    }

    @Get(':conversation_id/messages')
    async listMessages(
        @Param('conversation_id', UUIDValidationPipe) conversationId: string,
        @Query('limit') limit?: number,
        @Query('offset') offset?: number
    ) {
        const conversation = await this.ensureConversationAccess(conversationId)
        const result = await this.messageService.findAllInOrganizationOrTenant({
            where: { conversationId },
            relations: ['attachments', 'fileAssets'],
            order: { createdAt: 'ASC' },
            take: limit,
            skip: offset
        })
        const items = await Promise.all(
            result.items.map(
                async (item) =>
                    new ChatMessageDTO(await this.messageService.filterAuthorizedFileRelations(item, conversation.id))
            )
        )
        return { ...result, items }
    }

    @HttpCode(HttpStatus.OK)
    @Post(':conversation_id/messages/search')
    async searchMessages(
        @Param('conversation_id', UUIDValidationPipe) conversationId: string,
        @Body() body: MessageSearchRequest
    ) {
        const conversation = await this.ensureConversationAccess(conversationId)
        const { threadId: requestedThreadIdValue, ...rawMessageWhere } = body.where ?? {}
        const where = {
            ...transformWhere(rawMessageWhere),
            conversationId
        }
        const requestedThreadId =
            this.normalizeString(requestedThreadIdValue) ||
            (this.conversationThreadService ? conversation.threadId : undefined)
        const conversationThreadService = this.conversationThreadService
        if (requestedThreadId && !conversationThreadService) {
            throw new BadRequestException('Conversation thread branching is unavailable')
        }
        if (requestedThreadId) {
            const thread = await conversationThreadService.requireByThreadId(requestedThreadId)
            if (thread.conversationId !== conversationId) {
                throw new BadRequestException('Thread does not belong to the requested conversation')
            }
        }
        const result = requestedThreadId
            ? await conversationThreadService.findVisibleMessages(requestedThreadId, {
                  where,
                  relations: ['attachments', 'fileAssets'],
                  order: body.order ?? { createdAt: 'ASC' },
                  take: body.limit,
                  skip: body.offset
              })
            : await this.messageService.findAllInOrganizationOrTenant({
                  where,
                  relations: ['attachments', 'fileAssets'],
                  order: body.order ?? { createdAt: 'ASC' },
                  take: body.limit,
                  skip: body.offset
              })
        const items = await Promise.all(
            result.items.map(
                async (item) =>
                    new ChatMessageDTO(await this.messageService.filterAuthorizedFileRelations(item, conversation.id))
            )
        )
        return { ...result, items }
    }

    @Post(':conversation_id/messages')
    async createMessage(
        @Param('conversation_id', UUIDValidationPipe) conversationId: string,
        @Body() body: MessageMutationRequest
    ) {
        await this.ensureConversationAccess(conversationId, 'contribute')
        const publicScope = getPublicXpertSessionConversationScope()
        const createdById = publicScope?.createdById ?? RequestContext.currentUserId()
        if (!createdById) {
            throw new ForbiddenException(
                t('server-ai:Error.ConversationUserContextRequired', {
                    defaultValue: 'A user context is required to create a conversation message'
                })
            )
        }
        const message = await this.commandBus.execute(
            new ChatMessageUpsertCommand({
                ...this.pickMessageMutation(body),
                createdById,
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
        const conversation = await this.ensurePublicConversationAccess(conversationId)
        const message = await this.messageService.findOneInOrganizationOrTenant(messageId, {
            where: { conversationId },
            relations: ['attachments', 'fileAssets']
        })
        return new ChatMessageDTO(await this.messageService.filterAuthorizedFileRelations(message, conversation.id))
    }

    @Patch(':conversation_id/messages/:message_id')
    async updateMessage(
        @Param('conversation_id', UUIDValidationPipe) conversationId: string,
        @Param('message_id', UUIDValidationPipe) messageId: string,
        @Body() body: MessageMutationRequest
    ) {
        await this.ensureConversationAccess(conversationId, 'contribute')
        await this.messageService.findOneInOrganizationOrTenant(messageId, { where: { conversationId } })
        const message = await this.commandBus.execute(
            new ChatMessageUpsertCommand({
                ...this.pickMessageMutation(body),
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
        await this.ensureConversationAccess(conversationId, 'contribute')
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
        @Body() body: FeedbackMutationRequest
    ) {
        await this.ensureMessage(conversationId, messageId, 'contribute')
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
        @Body() body: FeedbackMutationRequest
    ) {
        await this.ensureMessage(conversationId, messageId, 'contribute')
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
        await this.ensureMessage(conversationId, messageId, 'contribute')
        await this.feedbackService.findOneInOrganizationOrTenant(feedbackId, { where: { conversationId, messageId } })
        await this.feedbackService.delete(feedbackId)
    }

    private async ensurePublicConversationAccess(conversationId: string) {
        return this.ensureConversationAccess(conversationId)
    }

    private async ensureConversationAccess(
        conversationId: string,
        operation: ChatConversationAccessOperation = 'read'
    ) {
        const conversation = await this.conversationService.assertAccess(conversationId, operation)
        await assertPublicXpertSessionConversationAccess(conversation, this.queryBus)
        return conversation
    }

    private conversationAccessDenied() {
        return new ForbiddenException(
            t('server-ai:Error.ConversationAccessDenied', {
                defaultValue: 'You do not have access to this conversation'
            })
        )
    }

    private pickMessageMutation(body: MessageMutationRequest): MessageMutationRequest {
        return {
            ...(body.id !== undefined ? { id: body.id } : {}),
            ...(body.parentId !== undefined ? { parentId: body.parentId } : {}),
            ...(body.role !== undefined ? { role: body.role } : {}),
            ...(body.status !== undefined ? { status: body.status } : {}),
            ...(body.content !== undefined ? { content: body.content } : {}),
            ...(body.reasoning !== undefined ? { reasoning: body.reasoning } : {}),
            ...(body.error !== undefined ? { error: body.error } : {}),
            ...(body.references !== undefined ? { references: body.references } : {}),
            ...(body.taskSummary !== undefined ? { taskSummary: body.taskSummary } : {}),
            ...(body.thirdPartyMessage !== undefined ? { thirdPartyMessage: body.thirdPartyMessage } : {}),
            ...(body.events !== undefined ? { events: body.events } : {}),
            ...(body.executionId !== undefined ? { executionId: body.executionId } : {}),
            ...(body.followUpMode !== undefined ? { followUpMode: body.followUpMode } : {}),
            ...(body.followUpStatus !== undefined ? { followUpStatus: body.followUpStatus } : {}),
            ...(body.targetExecutionId !== undefined ? { targetExecutionId: body.targetExecutionId } : {}),
            ...(body.visibleAt !== undefined ? { visibleAt: body.visibleAt } : {})
        }
    }
    private async ensureMessage(conversationId: string, messageId: string, operation: 'read' | 'contribute' = 'read') {
        await this.ensureConversationAccess(conversationId, operation)
        return this.messageService.findOneInOrganizationOrTenant(messageId, { where: { conversationId } })
    }
}
