// Invariants: delete the conversation's whole message tree before its executions.
// Leaf messages remain soft-deleted; every mutation shares the same transaction.
// Authorization stays with the existing conversation access query.
import { NotFoundException } from '@nestjs/common'
import { CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { DataSource, EntityManager, In, IsNull } from 'typeorm'
import { getThreadDeletionLineage } from '../../../chat-conversation/side-chat-delete-lineage'
import { ThreadDeleteCommand } from '../thread-delete.command'
import { ChatConversation } from '../../../chat-conversation/conversation.entity'
import { ChatConversationThread } from '../../../chat-conversation/conversation-thread.entity'
import { AssertChatConversationAccessQuery } from '../../../chat-conversation/queries/conversation-assert-access.query'
import { ChatMessage } from '../../../chat-message/chat-message.entity'
import { XpertAgentExecution } from '../../../xpert-agent-execution/agent-execution.entity'
import { CopilotCheckpoint } from '../../../copilot-checkpoint/copilot-checkpoint.entity'
import { CopilotCheckpointWrites } from '../../../copilot-checkpoint/writes/writes.entity'
import { McpAppHistory } from '../../../mcp-app-runtime/mcp-app-history.entity'
import { collectMcpAppComponentData } from '../../../mcp-app-runtime/mcp-app-history-component'

@CommandHandler(ThreadDeleteCommand)
export class ThreadDeleteHandler implements ICommandHandler<ThreadDeleteCommand> {
    constructor(
        private readonly dataSource: DataSource,
        private readonly queryBus: QueryBus
    ) {}

    public async execute(command: ThreadDeleteCommand): Promise<void> {
        const threadId = command.id
        // Resolve legacy primary threads without creating a row outside the deletion transaction.
        const authorized = await this.queryBus.execute(new AssertChatConversationAccessQuery({ threadId }, 'manage'))
        const scope = { tenantId: authorized.tenantId, organizationId: authorized.organizationId ?? IsNull() }
        await this.dataSource.transaction(async (manager) => {
            const conversation = await manager.findOneOrFail(ChatConversation, {
                where: { ...scope, id: authorized.id },
                lock: { mode: 'pessimistic_write' }
            })
            const threads = await manager.find(ChatConversationThread, {
                where: { ...scope, conversationId: conversation.id },
                lock: { mode: 'pessimistic_write' }
            })
            const isPrimary = conversation.threadId === threadId
            const thread = threads.find((item) => item.threadId === threadId)
            if (!isPrimary && !thread) throw new NotFoundException(`Thread "${threadId}" not found`)
            const lineage = isPrimary ? threads : getThreadDeletionLineage(thread, threads)
            const threadIds = isPrimary
                ? [...new Set([conversation.threadId, ...threads.map((item) => item.threadId)])]
                : lineage.map((item) => item.threadId)
            const executions = { ...scope, threadId: In(threadIds) }
            if (isPrimary) {
                // Delete the entire message tree in one cascade before executionId can delete only its replies.
                await manager.delete(ChatConversation, { ...scope, id: conversation.id })
            } else {
                const ownedExecutions = await manager.find(XpertAgentExecution, {
                    where: executions,
                    select: { id: true }
                })
                if (ownedExecutions.length) {
                    // Soft-deleted messages still participate in parentId foreign keys.
                    await manager.update(
                        ChatMessage,
                        {
                            ...scope,
                            conversationId: conversation.id,
                            createdInThreadId: In(threadIds),
                            executionId: In(ownedExecutions.map((execution) => execution.id))
                        },
                        { executionId: null }
                    )
                }
                for (const branch of [...lineage].reverse()) await this.softDeleteBranchMessages(manager, branch)
            }
            await manager.delete(XpertAgentExecution, executions)
            await manager.delete(CopilotCheckpoint, { ...scope, thread_id: In(threadIds) })
            await manager.delete(CopilotCheckpointWrites, { ...scope, thread_id: In(threadIds) })
            if (!isPrimary)
                for (const branch of [...lineage].reverse())
                    await manager.delete(ChatConversationThread, { ...scope, id: branch.id })
        })
    }

    private async softDeleteBranchMessages(manager: EntityManager, thread: ChatConversationThread): Promise<void> {
        const scope = { tenantId: thread.tenantId, organizationId: thread.organizationId ?? IsNull() }
        const where = { ...scope, conversationId: thread.conversationId, createdInThreadId: thread.threadId }
        const messages = await manager.find(ChatMessage, {
            where,
            select: { id: true, content: true, events: true }
        })
        const ids = messages.flatMap((message) =>
            [...collectMcpAppComponentData(message.events), ...collectMcpAppComponentData(message.content)].map(
                (component) => component.appInstanceId
            )
        )
        if (ids.length) await manager.delete(McpAppHistory, { ...scope, id: In(ids) })
        await manager.softDelete(ChatMessage, where)
    }
}
