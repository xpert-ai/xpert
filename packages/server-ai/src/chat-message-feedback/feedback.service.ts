import { ChatMessageFeedbackRatingEnum, LongTermMemoryTypeEnum } from '@xpert-ai/contracts'
import { RequestContext, TenantOrganizationAwareCrudService } from '@xpert-ai/server-core'
import { ForbiddenException, Injectable, Logger } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { FindManyOptions, Repository } from 'typeorm'
import { ChatConversationAccessOperation, ChatConversationService } from '../chat-conversation/conversation.service'
import { assertSafeChatConversationRelations } from '../chat-conversation/conversation-relations'
import { ChatMessageService } from '../chat-message/chat-message.service'
import { ChatMessageFeedback } from './feedback.entity'

export type ChatMessageFeedbackMutation = {
    conversationId: string
    messageId: string
    rating?: ChatMessageFeedbackRatingEnum
    content?: string
}

@Injectable()
export class ChatMessageFeedbackService extends TenantOrganizationAwareCrudService<ChatMessageFeedback> {
    private readonly logger = new Logger(ChatMessageFeedbackService.name)

    constructor(
        @InjectRepository(ChatMessageFeedback)
        repository: Repository<ChatMessageFeedback>,
        private readonly conversationService: ChatConversationService,
        private readonly messageService: ChatMessageService,
        readonly commandBus: CommandBus,
        readonly queryBus: QueryBus
    ) {
        super(repository)
    }

    async findAllAuthorized(options: FindManyOptions<ChatMessageFeedback>) {
        assertSafeChatConversationRelations(options.relations)
        const where = options.where
        if (!where || Array.isArray(where) || typeof where.conversationId !== 'string') {
            throw new ForbiddenException()
        }

        const conversation = await this.conversationService.assertAccess(where.conversationId)
        const messageId = typeof where.messageId === 'string' ? where.messageId : undefined
        if (messageId) {
            await this.assertMessageBelongsToConversation(conversation.id, messageId)
        }

        return this.findAll({
            ...options,
            where: {
                ...where,
                conversationId: conversation.id,
                ...(messageId ? { messageId } : {})
            }
        })
    }

    async findOneAuthorized(
        id: string,
        options?: { relations?: string[]; operation?: ChatConversationAccessOperation }
    ) {
        assertSafeChatConversationRelations(options?.relations)
        const feedback = await this.findOneInOrganizationOrTenant(id)
        if (!feedback?.conversationId || !feedback.messageId) {
            throw new ForbiddenException()
        }

        const conversation = await this.conversationService.assertAccess(
            feedback.conversationId,
            options?.operation ?? 'read'
        )
        await this.assertMessageBelongsToConversation(conversation.id, feedback.messageId)

        return options?.relations?.length
            ? this.findOneInOrganizationOrTenant(id, {
                  relations: options.relations,
                  where: { conversationId: conversation.id, messageId: feedback.messageId }
              })
            : feedback
    }

    async createAuthorized(input: ChatMessageFeedbackMutation) {
        const conversation = await this.assertTargetAccess(input.conversationId, input.messageId, 'contribute')
        return this.create({
            conversationId: conversation.id,
            messageId: input.messageId,
            ...(input.rating !== undefined ? { rating: input.rating } : {}),
            ...(input.content !== undefined ? { content: input.content } : {})
        })
    }

    async updateAuthorized(id: string, input: Pick<ChatMessageFeedbackMutation, 'rating' | 'content'>) {
        await this.findOneAuthorized(id, { operation: 'contribute' })
        await this.update(id, {
            ...(input.rating !== undefined ? { rating: input.rating } : {}),
            ...(input.content !== undefined ? { content: input.content } : {})
        })
        return this.findOneAuthorized(id)
    }

    async deleteAuthorized(id: string) {
        await this.findOneAuthorized(id, { operation: 'contribute' })
        return this.delete(id)
    }

    async triggerSummary(id: string) {
        const feedback = await this.findOneAuthorized(id, { operation: 'contribute' })
        await this.conversationService.triggerSummary(
            feedback.conversationId,
            LongTermMemoryTypeEnum.QA,
            RequestContext.currentUserId(),
            feedback.messageId
        )
    }

    async deleteSummary(id: string) {
        const feedback = await this.findOneAuthorized(id, { operation: 'contribute' })
        await this.conversationService.deleteSummary(
            feedback.conversationId,
            feedback.messageId,
            LongTermMemoryTypeEnum.QA
        )
    }

    private async assertTargetAccess(
        conversationId: string,
        messageId: string,
        operation: ChatConversationAccessOperation
    ) {
        if (!conversationId || !messageId) {
            throw new ForbiddenException()
        }
        const conversation = await this.conversationService.assertAccess(conversationId, operation)
        await this.assertMessageBelongsToConversation(conversation.id, messageId)
        return conversation
    }

    private async assertMessageBelongsToConversation(conversationId: string, messageId: string) {
        const message = await this.messageService.findOneInOrganizationOrTenant(messageId, {
            where: { conversationId }
        })
        if (!message || message.conversationId !== conversationId) {
            throw new ForbiddenException()
        }
        return message
    }
}
