import { FindOptionsWhere } from '@xpert-ai/server-core'
import { Query } from '@nestjs/cqrs'
import { ChatConversation } from '../conversation.entity'
import { ChatConversationAccessOperation } from '../conversation.service'

export class AssertChatConversationAccessQuery extends Query<ChatConversation> {
    static readonly type = '[Chat Conversation] Assert access'

    constructor(
        public readonly where: FindOptionsWhere<ChatConversation>,
        public readonly operation: ChatConversationAccessOperation = 'read'
    ) {
        super()
    }
}
