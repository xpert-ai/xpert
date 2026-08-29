import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { CancelConversationCommand } from '../cancel-conversation.command'
import { ChatConversationService } from '../../conversation.service'
import { ExecutionCancelService } from '../../../shared/'
import { IChatMessage, XpertAgentExecutionStatusEnum } from '@xpert-ai/contracts'
import { XpertAgentExecutionService } from '../../../xpert-agent-execution/agent-execution.service'
import { Logger, Optional } from '@nestjs/common'
import { StopHandoffMessageCommand } from '../../../handoff/commands'
import { ChatConversationThreadService } from '../../conversation-thread.service'

/**
 * Handler to cancel
 * 1. a chat conversation and its associated executions.
 * 2. a thread's specific execution.
 *
 * mark status of ChatMessages as 'aborted'
 * mark status of XpertAgentExecutions as 'interrupted'
 * mark status of ChatConversation as 'interrupted'
 * invoke ExecutionCancelService to handle any additional cancellation logic.
 */
@CommandHandler(CancelConversationCommand)
export class CancelConversationHandler implements ICommandHandler<CancelConversationCommand> {
    private readonly logger = new Logger(CancelConversationHandler.name)

    constructor(
        private readonly service: ChatConversationService,
        private readonly executionService: XpertAgentExecutionService,
        private readonly executionCancelService: ExecutionCancelService,
        private readonly commandBus: CommandBus,
        @Optional() private readonly conversationThreadService?: ChatConversationThreadService
    ) {}

    public async execute(command: CancelConversationCommand) {
        const { conversationId, threadId, executionId } = command.input
        let runtimeThread =
            threadId && this.conversationThreadService
                ? await this.conversationThreadService.requireByThreadId(threadId)
                : null
        const conversation = conversationId
            ? await this.service.findOne(conversationId, { relations: ['messages'] })
            : (runtimeThread?.conversation ??
              (threadId ? await this.service.findOneByOptions({ where: { threadId }, relations: ['messages'] }) : null))
        if (conversation && !runtimeThread && this.conversationThreadService) {
            runtimeThread = await this.conversationThreadService.ensurePrimary(conversation)
        }
        if (conversation && runtimeThread) {
            await this.conversationThreadService?.hydrateConversationMessages(conversation, runtimeThread.threadId)
        }

        if (!conversation && !executionId) {
            return { canceledExecutionIds: [] }
        }
        const messages = (conversation?.messages ?? []) as IChatMessage[]
        const aiMessages = messages.filter((message) => message.role === 'ai' && message.executionId)

        const targetMessages = executionId
            ? aiMessages.filter((message) => message.executionId === executionId)
            : aiMessages.length
              ? (() => {
                    const runningMessages = aiMessages.filter((message) =>
                        ['thinking', 'reasoning', 'answering'].includes(message.status as string)
                    )
                    const sortedMessages = [...aiMessages].sort((a, b) => {
                        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0
                        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0
                        return aTime - bTime
                    })
                    const fallbackMessage = sortedMessages[sortedMessages.length - 1]
                    return runningMessages.length ? runningMessages : [fallbackMessage]
                })()
              : []

        const executionIds = executionId
            ? [executionId]
            : (Array.from(new Set(targetMessages.map((message) => message.executionId).filter(Boolean))) as string[])

        if (!executionIds.length) {
            return { canceledExecutionIds: [] }
        }
        const messagesToUpdate = aiMessages.filter((message) => executionIds.includes(message.executionId))

        messagesToUpdate.forEach((message) => {
            message.status = 'aborted'
            message.error = 'Canceled by user'
        })

        for (const id of executionIds) {
            await this.executionService.update(id, {
                status: XpertAgentExecutionStatusEnum.INTERRUPTED,
                error: 'Canceled by user'
            })
        }

        if (executionIds.length) {
            await this.executionCancelService.cancelExecutions(executionIds, 'Canceled by user')
            try {
                await this.commandBus.execute(
                    new StopHandoffMessageCommand({
                        executionIds,
                        reason: 'Canceled by user'
                    })
                )
            } catch (error) {
                this.logger.warn(
                    `Failed to stop handoff messages for executions [${executionIds.join(', ')}]: ${
                        (error as Error)?.message ?? error
                    }`
                )
            }
        }

        if (conversation) {
            if (!runtimeThread || runtimeThread.threadId === conversation.threadId) {
                conversation.status = 'interrupted'
                conversation.error = 'Canceled by user'
                await this.service.repository.save(conversation)
            }
            if (runtimeThread) {
                await this.conversationThreadService?.updateRuntimeState(
                    runtimeThread.threadId,
                    'interrupted',
                    'Canceled by user'
                )
            }
        }

        // Stream finalization can race cancellation and attempt to persist a
        // terminal success/error after the first update. Reassert interruption
        // after aborting and saving the conversation so cancellation wins.
        for (const id of executionIds) {
            await this.executionService.update(id, {
                status: XpertAgentExecutionStatusEnum.INTERRUPTED,
                error: 'Canceled by user'
            })
        }

        return { canceledExecutionIds: executionIds }
    }
}
