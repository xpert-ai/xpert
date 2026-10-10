import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import type { ChatConversationEntry } from '@xpert-ai/contracts'
import { GroupAccessService } from './group-access.service'
import { GetGroupConversationEntryCommand } from './group-conversation-entry.command'

/** Shared-shell entry lookup exposes group metadata only after current membership is verified. */
@CommandHandler(GetGroupConversationEntryCommand)
export class GetGroupConversationEntryHandler implements ICommandHandler<GetGroupConversationEntryCommand> {
    constructor(private readonly access: GroupAccessService) {}

    async execute({ groupId }: GetGroupConversationEntryCommand): Promise<ChatConversationEntry> {
        const { group } = await this.access.authorize(groupId)
        return { id: group.id, threadId: group.threadId, xpertId: group.xpertId, title: group.title, purpose: 'group' }
    }
}
