import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { And, Equal } from 'typeorm'
import { ChatConversationService } from '../../conversation.service'
import { ChatConversationThreadService } from '../../conversation-thread.service'
import { AssertChatConversationAccessQuery } from '../conversation-assert-access.query'

@QueryHandler(AssertChatConversationAccessQuery)
export class AssertChatConversationAccessHandler implements IQueryHandler<AssertChatConversationAccessQuery> {
    constructor(
        private readonly service: ChatConversationService,
        private readonly threads: ChatConversationThreadService
    ) {}

    async execute(query: AssertChatConversationAccessQuery) {
        const { threadId, ...conditions } = query.where
        const thread = typeof threadId === 'string' ? await this.threads.findByThreadId(threadId) : null
        // Branches share a conversation. Preserve every caller constraint and authorize that conversation.
        const where = thread
            ? {
                  ...conditions,
                  id: conditions.id
                      ? And(
                            typeof conditions.id === 'string' ? Equal(conditions.id) : conditions.id,
                            Equal(thread.conversationId)
                        )
                      : thread.conversationId
              }
            : query.where
        const conversation = await this.service.findOneByOptions({
            where,
            relations: ['xpert']
        })
        return this.service.assertAccess(conversation, query.operation)
    }
}
