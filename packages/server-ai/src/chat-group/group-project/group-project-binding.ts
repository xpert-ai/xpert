import { XpertAgentExecutionStatusEnum } from '@xpert-ai/contracts'
import { EntityManager } from 'typeorm'
import { ChatConversation } from '../../chat-conversation/conversation.entity'
import { ChatConversationThread } from '../../chat-conversation/conversation-thread.entity'
import { readRunLease } from '../../chat-conversation/thread-run-lease'
import { ChatMessage } from '../../chat-message/chat-message.entity'
import { XpertAgentExecution } from '../../xpert-agent-execution/agent-execution.entity'
import { GroupMessageRecipient, GroupParticipant } from '../group.entity'

/** Called with the group and thread locked. Only terminal failures with no accepted input may recover. */
export async function canBindEmptyGroupRuntime(
    manager: EntityManager,
    member: GroupParticipant,
    runtime: ChatConversation,
    thread: ChatConversationThread
): Promise<boolean> {
    if (thread.operation || readRunLease(thread.metadata)) return false
    if (await manager.existsBy(ChatMessage, { conversationId: runtime.id })) return false
    if (thread.status === 'idle') return true
    if (thread.status !== 'error' || runtime.status !== 'error' || runtime.projectId) return false
    const scope = { tenantId: runtime.tenantId, organizationId: runtime.organizationId }
    const receipts = await manager.findBy(GroupMessageRecipient, {
        ...scope,
        groupId: member.groupId,
        participantId: member.id,
        wake: true
    })
    if (!receipts.length) return false
    for (const receipt of receipts) {
        if (
            receipt.status !== 'failed' ||
            receipt.phase !== 'finalized' ||
            receipt.inputMessageId ||
            !receipt.executionId
        )
            return false
        if (
            !(await manager.existsBy(XpertAgentExecution, {
                ...scope,
                id: receipt.executionId,
                threadId: member.runtimeThreadId,
                status: XpertAgentExecutionStatusEnum.ERROR
            }))
        )
            return false
    }
    return true
}
