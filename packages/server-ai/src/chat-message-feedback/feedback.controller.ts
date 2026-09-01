import { ChatMessageFeedbackRatingEnum } from '@xpert-ai/contracts'
import {
    PaginationParams,
    ParseJsonPipe,
    RequestContext,
    TransformInterceptor,
    UUIDValidationPipe,
    transformWhere
} from '@xpert-ai/server-core'
import {
    Body,
    Controller,
    Delete,
    ForbiddenException,
    Get,
    HttpCode,
    HttpStatus,
    Logger,
    Param,
    Post,
    Put,
    Query,
    UseInterceptors
} from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { FindOptionsOrder, FindOptionsWhere } from 'typeorm'
import { assertSafeChatConversationRelations } from '../chat-conversation/conversation-relations'
import { ChatMessageFeedback } from './feedback.entity'
import { ChatMessageFeedbackService } from './feedback.service'

type FeedbackMutationBody = {
    conversationId?: string
    messageId?: string
    rating?: ChatMessageFeedbackRatingEnum
    content?: string
}

@ApiTags('ChatMessageFeedback')
@ApiBearerAuth()
@UseInterceptors(TransformInterceptor)
@Controller()
export class ChatMessageFeedbackController {
    readonly #logger = new Logger(ChatMessageFeedbackController.name)

    constructor(private readonly service: ChatMessageFeedbackService) {}

    @Get()
    async findAll(
        @Query('data', ParseJsonPipe) filter?: PaginationParams<ChatMessageFeedback>,
        @Query('$where', ParseJsonPipe) where?: PaginationParams<ChatMessageFeedback>['where'],
        @Query('$relations', ParseJsonPipe) relations?: PaginationParams<ChatMessageFeedback>['relations'],
        @Query('$order', ParseJsonPipe) order?: PaginationParams<ChatMessageFeedback>['order'],
        @Query('$take') take?: number,
        @Query('$skip') skip?: number
    ) {
        const requestedRelations = relations ?? filter?.relations
        assertSafeChatConversationRelations(requestedRelations)
        return this.service.findAllAuthorized({
            where: transformWhere(where ?? filter?.where) as FindOptionsWhere<ChatMessageFeedback>,
            relations: requestedRelations,
            order: (order ?? filter?.order) as FindOptionsOrder<ChatMessageFeedback>,
            take: take ?? filter?.take,
            skip: skip ?? filter?.skip
        })
    }

    @Get('my')
    async findMyAll(@Query('data', ParseJsonPipe) filter?: PaginationParams<ChatMessageFeedback>) {
        const userId = RequestContext.currentUserId()
        if (!userId) {
            throw new ForbiddenException()
        }
        assertSafeChatConversationRelations(filter?.relations)
        return this.service.findAllAuthorized({
            where: {
                ...(transformWhere(filter?.where ?? {}) as FindOptionsWhere<ChatMessageFeedback>),
                createdById: userId
            },
            relations: filter?.relations,
            order: filter?.order as FindOptionsOrder<ChatMessageFeedback>,
            take: filter?.take,
            skip: filter?.skip
        })
    }

    @Get(':id')
    async findById(
        @Param('id', UUIDValidationPipe) id: string,
        @Query('$relations', ParseJsonPipe) relations?: string[]
    ) {
        assertSafeChatConversationRelations(relations)
        return this.service.findOneAuthorized(id, { relations })
    }

    @HttpCode(HttpStatus.CREATED)
    @Post()
    async create(@Body() body: FeedbackMutationBody) {
        const feedback = await this.service.createAuthorized({
            conversationId: this.requireId(body?.conversationId),
            messageId: this.requireId(body?.messageId),
            ...(body?.rating !== undefined ? { rating: body.rating } : {}),
            ...(body?.content !== undefined ? { content: body.content } : {})
        })
        this.triggerSummary(feedback.id)
        return feedback
    }

    @HttpCode(HttpStatus.ACCEPTED)
    @Put(':id')
    async update(@Param('id', UUIDValidationPipe) id: string, @Body() body: FeedbackMutationBody) {
        const feedback = await this.service.updateAuthorized(id, {
            ...(body?.rating !== undefined ? { rating: body.rating } : {}),
            ...(body?.content !== undefined ? { content: body.content } : {})
        })
        this.triggerSummary(feedback.id)
        return feedback
    }

    @HttpCode(HttpStatus.ACCEPTED)
    @Delete(':id')
    async delete(@Param('id', UUIDValidationPipe) id: string) {
        await this.service.deleteSummary(id)
        return this.service.deleteAuthorized(id)
    }

    private triggerSummary(id: string) {
        this.service.triggerSummary(id).catch((error) => {
            this.#logger.warn(
                `Failed to trigger feedback summary for ${id}: ${error instanceof Error ? error.message : String(error)}`
            )
        })
    }

    private requireId(value: unknown) {
        if (typeof value !== 'string' || !value.trim()) {
            throw new ForbiddenException()
        }
        return value
    }
}
