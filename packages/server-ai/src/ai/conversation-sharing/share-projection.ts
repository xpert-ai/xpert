import type { TreeRepository } from 'typeorm'
import type { ChatMessage } from '../../chat-message/chat-message.entity'
import { chatMessagePresentation, IChatMessage, ConversationShareSnapshot } from '@xpert-ai/contracts'
import { chatMessageText } from '../../shared/chat-message-text'
import { invalidShare } from './share.schema'

/** Explicit allowlist: no execution, reasoning, references, attachments, IDs, or interactive components. */
export function shareSnapshot(title: string, messages: IChatMessage[]): ConversationShareSnapshot {
    const snapshot: ConversationShareSnapshot = {
        title: (title ?? '').slice(0, 300),
        messages: messages.flatMap((message) => {
            if (chatMessagePresentation(message) !== 'message') return []
            if (message.role !== 'human' && message.role !== 'ai') return []
            if (message.followUpStatus && message.followUpStatus !== 'consumed') return []
            if (message.role === 'ai' && message.status !== 'success') return []
            const text = chatMessageText(message.content)
            return text ? [{ role: message.role, text }] : []
        })
    }
    // Never silently publish a clipped preview. Bound persistence and public response size.
    if (
        !snapshot.messages.length ||
        snapshot.messages.length > 1000 ||
        Buffer.byteLength(JSON.stringify(snapshot)) > 1024 * 1024
    )
        throw invalidShare()
    return snapshot
}

/** TreeRepository reserves :id for the head message; keep conversation scope in a distinct parameter. */
export function shareMessageQuery(
    messages: TreeRepository<ChatMessage>,
    conversationId: string,
    headMessageId: string
) {
    return messages
        .createAncestorsQueryBuilder('message', 'closure', messages.create({ id: headMessageId }))
        .select([
            'message.id',
            'message.parentId',
            'message.role',
            'message.content',
            'message.status',
            'message.followUpStatus',
            'message.messageEnvelope'
        ])
        .andWhere('message.conversationId = :shareConversationId', { shareConversationId: conversationId })
        .take(1001)
}
