import type { ChatMessage } from '../chat-message/chat-message.entity'
import { groupDenied } from './group.errors'
import { parseGroupCommunication } from './group.schema'

/** Persisted human input owns its run; Assistant handoffs retain the original human initiator. */
export function groupDeliveryUserId(source: Pick<ChatMessage, 'role' | 'createdById' | 'groupCommunication'>): string {
    const userId =
        source.role === 'human' ? source.createdById : parseGroupCommunication(source.groupCommunication).rootUserId
    if (!userId) throw groupDenied()
    return userId
}
