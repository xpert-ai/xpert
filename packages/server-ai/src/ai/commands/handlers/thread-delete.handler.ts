import { ConflictException, Optional } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { ThreadDeleteCommand } from '../thread-delete.command'
import { CheckpointDeleteCommand } from '../../../copilot-checkpoint/'
import { ChatConversationDeleteCommand } from '../../../chat-conversation'
import { XpertAgentExecutionDelCommand } from '../../../xpert-agent-execution/'
import { ChatConversationThreadService } from '../../../chat-conversation'

@CommandHandler(ThreadDeleteCommand)
export class ThreadDeleteHandler implements ICommandHandler<ThreadDeleteCommand> {
    constructor(
        private readonly commandBus: CommandBus,
        private readonly queryBus: QueryBus,
        @Optional() private readonly conversationThreadService?: ChatConversationThreadService
    ) {}

    public async execute(command: ThreadDeleteCommand): Promise<void> {
        const threadId = command.id
        if (!this.conversationThreadService) {
            await this.commandBus.execute(new XpertAgentExecutionDelCommand({ threadId }))
            await this.commandBus.execute(new CheckpointDeleteCommand({ thread_id: threadId }))
            await this.commandBus.execute(new ChatConversationDeleteCommand({ threadId }))
            return
        }
        const thread = await this.conversationThreadService.requireByThreadId(threadId)
        const conversation = thread.conversation
        const isPrimary = conversation.threadId === threadId
        const threads = isPrimary ? await this.conversationThreadService.listByConversation(conversation.id) : [thread]

        if (!isPrimary) {
            const children = (
                await this.conversationThreadService.findAllInOrganizationOrTenant({
                    where: { parentThreadId: threadId },
                    take: 1
                })
            ).items
            if (children.length > 0) {
                throw new ConflictException('A thread with child branches cannot be deleted')
            }
        }

        for (const item of threads) {
            await this.commandBus.execute(new XpertAgentExecutionDelCommand({ threadId: item.threadId }))
            await this.commandBus.execute(new CheckpointDeleteCommand({ thread_id: item.threadId }))
        }

        if (isPrimary) {
            await this.commandBus.execute(new ChatConversationDeleteCommand({ threadId }))
        } else {
            await this.conversationThreadService.deleteBranchMessages(threadId)
            await this.conversationThreadService.delete(thread.id)
        }
    }
}
