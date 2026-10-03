import {
    ChatMessageEventTypeEnum,
    ChatMessageTypeEnum,
    createResourceCardContent,
    parseResourceCardContent
} from '@xpert-ai/contracts'

/** Resource presentation cannot choose its owning reply or execution. */
export function bindResourceCardEvent(value: unknown, owner: { messageId: string; executionId?: string }) {
    if (!value || typeof value !== 'object' || !('type' in value) || !('data' in value)) return null
    if (
        value.type !== ChatMessageTypeEnum.MESSAGE &&
        !(
            value.type === ChatMessageTypeEnum.EVENT &&
            'event' in value &&
            value.event === ChatMessageEventTypeEnum.ON_CHAT_EVENT
        )
    )
        return null
    const content = parseResourceCardContent(value.data)
    if (!content) return null
    return { type: ChatMessageTypeEnum.MESSAGE, data: { ...createResourceCardContent(content.data), ...owner } }
}
