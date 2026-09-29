import { ChatMessage } from '../chat-message/chat-message.entity'
import { ReadThreadInput } from './thread-reference.contract'

export const THREAD_PAGE_CHAR_LIMIT = 60000
export const THREAD_PAGE_SCAN_LIMIT = 500

/** Minimal model-facing history; internal reasoning, tool arguments and artifacts are excluded. */
export type ReadThreadMessage = {
    id: string
    role: string
    createdAt: Date
    status?: string
    text: string
    /** True when either the per-item limit or shared page character budget clipped the text. */
    truncated: boolean
    outputs?: Array<{ text: string; truncated: boolean }>
    /** Non-text outputs and outputs beyond the per-message count limit. */
    omittedOutputs?: number
}
/** Messages run oldest-to-newest within a turn; partial means its opening human message is absent. */
export type ReadThreadTurn = { id: string; partial: boolean; messages: ReadThreadMessage[] }

/**
 * Consume newest-first ancestor rows and return newest-first turns, excluding unfinished answers.
 * Message text and optional textual tool outputs share one page budget; clipping stays explicit.
 */
export function projectThreadTurns(messages: ChatMessage[], input: ReadThreadInput): ReadThreadTurn[] {
    let budget = THREAD_PAGE_CHAR_LIMIT
    const clip = (value: string) => {
        const limit = Math.min(budget, input.maxOutputCharsPerItem)
        const text = value.slice(0, limit)
        budget -= text.length
        return { text, truncated: value.length > text.length }
    }
    const turns: ReadThreadTurn[] = []
    let current: ReadThreadMessage[] = []
    for (const message of messages) {
        if (message.followUpStatus === 'pending' || message.followUpStatus === 'canceled') continue
        if (!['human', 'ai'].includes(message.role)) continue
        if (
            message.role === 'ai' &&
            ['running', 'pending', 'thinking', 'reasoning', 'answering'].includes(message.status)
        )
            continue
        const content: unknown = message.content
        const text =
            typeof content === 'string'
                ? content
                : Array.isArray(content)
                  ? content
                        .flatMap((block: unknown) =>
                            block &&
                            typeof block === 'object' &&
                            'type' in block &&
                            block.type === 'text' &&
                            'text' in block &&
                            typeof block.text === 'string'
                                ? [block.text]
                                : []
                        )
                        .join('\n')
                  : ''
        const projected: ReadThreadMessage = {
            id: message.id,
            role: message.role,
            createdAt: message.createdAt,
            status: message.status,
            ...clip(text)
        }
        if (input.includeOutputs) {
            // Never serialize arbitrary event data, arguments, artifacts, or reasoning.
            projected.outputs = []
            projected.omittedOutputs = 0
            for (const event of message.events ?? []) {
                if (typeof event.output === 'string' && projected.outputs.length < 20) {
                    projected.outputs.push(clip(event.output))
                } else if (event.output !== undefined) {
                    projected.omittedOutputs++
                }
            }
        }
        current.unshift(projected)
        if (message.role === 'human') {
            turns.push({ id: message.id, partial: false, messages: current })
            current = []
        }
    }
    if (current.length) turns.push({ id: current[0].id, partial: true, messages: current })
    return turns
}
