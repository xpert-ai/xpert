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
    // The stream mapper sets the outer execution from runtime metadata, never the plugin card payload.
    const executionId =
        'executionId' in value && typeof value.executionId === 'string' && value.executionId.trim()
            ? value.executionId
            : owner.executionId
    return {
        type: ChatMessageTypeEnum.MESSAGE,
        data: {
            ...createResourceCardContent(content.data),
            messageId: owner.messageId,
            ...(executionId ? { executionId } : {})
        }
    }
}
