import { Command } from '@nestjs/cqrs'
import type { IChatConversation, TConversationBranchRequest } from '@xpert-ai/contracts'

/**
 * Fork an independently owned conversation from a sealed reply without starting a run.
 * Use from chat or Workbench; the handler owns authorization, checkpoint validation and retry deduplication.
 */
export class ConversationBranchCommand extends Command<IChatConversation> {
    static readonly type = '[Chat Conversation] Branch'

    constructor(
        public readonly conversationId: string,
        public readonly input: TConversationBranchRequest
    ) {
        super()
    }
}
