import type { IChatMessage } from '@xpert-ai/contracts'
import { isRuntimeChatMessage } from '@xpert-ai/contracts'
import { messageBranching } from '../../chat-message/message-branching'
import type { MapNode } from './schema'

/** Only user-visible plain text blocks enter search, never arbitrary tool JSON or reasoning. */
export function visibleText(content: unknown): string {
    if (typeof content === 'string') return content
    if (!Array.isArray(content)) return ''
    return content
        .flatMap((block: unknown) => {
            if (
                block &&
                typeof block === 'object' &&
                'type' in block &&
                block.type === 'text' &&
                'text' in block &&
                typeof block.text === 'string'
            )
                return [block.text]
            return []
        })
        .join('\n')
}

export function latestUpdate(...dates: (Date | undefined)[]): string | undefined {
    const timestamps = dates.filter((date): date is Date => date instanceof Date && Number.isFinite(date.getTime()))
    return timestamps.length ? new Date(Math.max(...timestamps.map((date) => date.getTime()))).toISOString() : undefined
}

/** Receives the latest human message on the authorized ancestor path, not an arbitrary conversation sibling. */
export function humanMessageSummary(message: IChatMessage | undefined, threadId: string): MapNode['lastHumanMessage'] {
    if (!message?.id || message.role !== 'human' || isRuntimeChatMessage(message)) return undefined
    const text = visibleText(message.content).trim().replace(/\s+/g, ' ')
    return {
        id: message.id,
        text: text.length > 600 ? `${text.slice(0, 600)}…` : text,
        createdAt: latestUpdate(message.createdAt),
        inherited: Boolean(message.createdInThreadId && message.createdInThreadId !== threadId)
    }
}
export function turnNodes(
    messages: IChatMessage[],
    threadId: string,
    conversationId: string,
    showShared: boolean,
    search = '',
    conversationTitle?: string
): MapNode[] {
    const nodes: MapNode[] = []
    let current: MapNode | undefined
    for (const message of messages) {
        if (isRuntimeChatMessage(message) || (message.role !== 'human' && message.role !== 'ai')) continue
        const text = visibleText(message.content).trim()
        if (message.role === 'human') {
            current = {
                id: `turn:${threadId}:${message.id}`,
                kind: 'turn',
                parentId: `thread:${threadId}`,
                conversationId,
                conversationTitle,
                updatedAt: latestUpdate(message.updatedAt, message.createdAt),
                threadId,
                messageId: message.id,
                title: text.replace(/\s+/g, ' ').slice(0, 72) || '…',
                preview: text,
                shared: Boolean(message.createdInThreadId && message.createdInThreadId !== threadId),
                expandable: false
            }
            nodes.push(current)
        } else if (current) {
            current.updatedAt = latestUpdate(
                current.updatedAt ? new Date(current.updatedAt) : undefined,
                message.updatedAt,
                message.createdAt
            )
            current.answer = [current.answer, text].filter(Boolean).join('\n')
            const capability = messageBranching(message)
            current.branchMessageId = message.id
            current.branchAvailable = capability?.available ?? false
            current.branchReason = capability?.reason
            if (message.createdInThreadId === threadId) current.shared = false
        }
    }
    return nodes
        .filter((node) => (showShared || !node.shared) && (!search || matches(node, search)))
        .map((node) => ({
            ...node,
            preview: snippet(node.preview, search, 2000),
            answer: snippet(node.answer ?? '', search, 4000)
        }))
}
export function matches(node: MapNode, search: string) {
    const query = search.toLocaleLowerCase()
    return [node.title, node.preview, node.answer ?? ''].some((text) => text.toLocaleLowerCase().includes(query))
}

function snippet(text: string, query: string, length: number) {
    const match = query ? text.toLocaleLowerCase().indexOf(query.toLocaleLowerCase()) : 0
    const start = Math.max(0, match - 100)
    return `${start ? '…' : ''}${text.slice(start, start + length)}${start + length < text.length ? '…' : ''}`
}
