import { ChatMessageEventTypeEnum, ChatMessageTypeEnum } from '@xpert-ai/contracts'
import { parseFileActivityContent } from '@xpert-ai/chatkit-types'

/** Bind internal facts to their owning reply before persistence and SSE forwarding. */
export function bindFileActivityEvent(value: unknown, owner: { messageId: string; executionId?: string }) {
    if (!value || typeof value !== 'object' || !('type' in value) || !('data' in value)) return null
    const isEvent =
        value.type === ChatMessageTypeEnum.EVENT &&
        'event' in value &&
        value.event === ChatMessageEventTypeEnum.ON_CHAT_EVENT
    if (!isEvent && value.type !== ChatMessageTypeEnum.MESSAGE) return null
    const content = parseFileActivityContent(value.data)
    if (!content) return null
    return {
        type: ChatMessageTypeEnum.MESSAGE,
        data: {
            ...content,
            messageId: owner.messageId,
            executionId: content.executionId ?? owner.executionId
        }
    }
}
