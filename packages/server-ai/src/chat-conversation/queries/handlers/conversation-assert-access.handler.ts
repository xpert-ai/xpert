import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { ChatConversationService } from '../../conversation.service'
import { AssertChatConversationAccessQuery } from '../conversation-assert-access.query'

@QueryHandler(AssertChatConversationAccessQuery)
export class AssertChatConversationAccessHandler implements IQueryHandler<AssertChatConversationAccessQuery> {
    constructor(private readonly service: ChatConversationService) {}

    async execute(query: AssertChatConversationAccessQuery) {
        const conversation = await this.service.findOneByOptions({
            where: query.where,
            relations: ['xpert']
        })
        return this.service.assertAccess(conversation, query.operation)
    }
}
