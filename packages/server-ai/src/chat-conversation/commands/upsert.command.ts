import { IChatConversation } from '@xpert-ai/contracts'
import { ICommand } from '@nestjs/cqrs'

export class ChatConversationUpsertCommand implements ICommand {
    static readonly type = '[Chat Conversation] Upsert'

    constructor(
        public readonly entity: Partial<IChatConversation>,
        public readonly relations?: string[],
        /** Fence late runtime writes after another branch became the working thread. */
        public readonly expectedThreadId?: string
    ) {}
}
