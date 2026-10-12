import type { IChatMessage } from '@xpert-ai/contracts'

/** Read the visible answer only. Component payloads and reasoning are not visible answer text. */
export function chatMessageText(content: IChatMessage['content']): string | undefined {
    if (typeof content === 'string') return content || undefined
    if (!Array.isArray(content)) return undefined
    return (
        content
            .flatMap((block) =>
                block.type === 'text' && 'text' in block && typeof block.text === 'string' ? [block.text] : []
            )
            .join('\n\n') || undefined
    )
}
