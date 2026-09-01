import { IXpertAgentExecution } from '@xpert-ai/contracts'
import { Query } from '@nestjs/cqrs'
import type { ChatConversationAccessOperation } from '../../chat-conversation/conversation.service'

export class AssertXpertAgentExecutionAccessQuery extends Query<IXpertAgentExecution> {
    static readonly type = '[Xpert Agent Execution] Assert access'

    constructor(
        public readonly id: string,
        public readonly operation: ChatConversationAccessOperation = 'read',
        public readonly expectedThreadId?: string
    ) {
        super()
    }
}
