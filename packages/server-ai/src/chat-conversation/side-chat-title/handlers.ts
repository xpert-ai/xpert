import { saveSideChatTitle } from './save-title'
import { CommandHandler, ICommandHandler, IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { ChatThreadPurpose, filterMessageText } from '@xpert-ai/contracts'
import { ChatConversationThreadService } from '../conversation-thread.service'
import { ReadSideChatTitleQuery, SaveSideChatTitleCommand, SideChatTitleContext } from './operations'

@QueryHandler(ReadSideChatTitleQuery)
export class ReadSideChatTitleHandler implements IQueryHandler<ReadSideChatTitleQuery> {
    constructor(private readonly threads: ChatConversationThreadService) {}
    async execute({ threadId }: ReadSideChatTitleQuery): Promise<SideChatTitleContext | null> {
        const thread = await this.threads.findByThreadId(threadId)
        if (thread?.metadata.purpose !== ChatThreadPurpose.SideChat) return null
        // Legacy labels have no provenance. Preserve them instead of guessing from localized text.
        if (thread.metadata.titleSource !== 'default') return { pending: false, input: '' }
        const { items } = await this.threads.findVisibleMessages(threadId, {
            where: { createdInThreadId: threadId, role: 'human' },
            order: { createdAt: 'ASC' },
            take: 1
        })
        const content = items[0]?.content
        return {
            pending: true,
            input: typeof content === 'string' ? content : content ? filterMessageText(content) : ''
        }
    }
}

@CommandHandler(SaveSideChatTitleCommand)
export class SaveSideChatTitleHandler implements ICommandHandler<SaveSideChatTitleCommand> {
    constructor(private readonly threads: ChatConversationThreadService) {}
    async execute({ threadId, title }: SaveSideChatTitleCommand): Promise<boolean> {
        const thread = await this.threads.requireByThreadId(threadId)
        return saveSideChatTitle(this.threads.repository, thread, title, 'generated')
    }
}
