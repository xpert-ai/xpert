import { ChatMessageTypeEnum, createResourceCardContent, parseResourceCardContent } from '@xpert-ai/contracts'

/** Reject malformed cards; never accept message/execution identities from the emitting tool. */
export function bindResourceCardEvent(value: unknown, owner: { messageId: string; executionId?: string }) {
    if (
        !value ||
        typeof value !== 'object' ||
        !('type' in value) ||
        value.type !== ChatMessageTypeEnum.MESSAGE ||
        !('data' in value)
    )
        return null
    const content = parseResourceCardContent(value.data)
    if (!content) return null
    return { type: ChatMessageTypeEnum.MESSAGE, data: { ...createResourceCardContent(content.data), ...owner } }
}
