import { ConflictException } from '@nestjs/common'
import { t } from 'i18next'

/**
 * Return root through selectedId, inclusive, only if selectedId belongs to headId's ancestry.
 * Follow parent edges rather than timestamps; broken or cyclic paths fail instead of returning partial history.
 */
export function messageAncestorPath<T extends { id?: string; parentId?: string | null }>(
    messages: T[],
    headId: string,
    selectedId = headId
): T[] {
    const byId = new Map(messages.map((message) => [message.id, message]))
    const reversed: T[] = []
    const seen = new Set<string>()
    let cursor: string | null | undefined = headId
    let selected = false
    while (cursor) {
        const message = byId.get(cursor)
        if (!message || seen.has(cursor))
            throw new ConflictException(t('server-ai:Error.ConversationBranch.checkpoint_unavailable'))
        seen.add(cursor)
        if (cursor === selectedId) selected = true
        if (selected) reversed.push(message)
        cursor = message.parentId
    }
    if (!selected) throw new ConflictException(t('server-ai:Error.ConversationBranch.message_not_in_thread'))
    return reversed.reverse()
}
