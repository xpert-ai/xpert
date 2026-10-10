import { Command } from '@nestjs/cqrs'
import type { ChatConversationEntry } from '@xpert-ai/contracts'

/** Resolve group entry metadata for the current member; never grants private runtime access. */
export class GetGroupConversationEntryCommand extends Command<ChatConversationEntry> {
    constructor(readonly groupId: string) {
        super()
    }
}
