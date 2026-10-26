import type { IChatConversation } from '@xpert-ai/contracts'
import type { XpertChatStreamPersistenceOptions } from '../chat.command'

/** Bind replay to the admitted run, never to identifiers supplied in chat options. */
export function chatStreamPersistence(
    target: XpertChatStreamPersistenceOptions | undefined,
    conversation: Pick<IChatConversation, 'tenantId' | 'organizationId'>,
    threadId: string,
    runId: string,
    owner: string | undefined
): XpertChatStreamPersistenceOptions | undefined {
    if (!target) return undefined
    return {
        transport: 'redis-stream',
        threadId,
        runId,
        snapshotOwner: owner ?? target.snapshotOwner,
        snapshotScope: { tenantId: conversation.tenantId, organizationId: conversation.organizationId }
    }
}
