import fs from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod/v3'
import type { FileMemoryTopicRecord } from './file-memory.service'
import type { FileMemoryConversationHistoryReader, FileMemoryXpertScope } from './ports'
import { parseFileMemorySignal } from './signals'
import { FILE_MEMORY_DREAM_DIR, type FileMemorySignal } from './types'

const uuid = z.string().uuid()

export async function readRecentSignals(root: string) {
    const dir = path.join(root, FILE_MEMORY_DREAM_DIR, 'signals')
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
    const files = entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.jsonl'))
        .map((entry) => entry.name)
        .sort()
        .slice(-14)
    const changes: FileMemorySignal[] = []
    const usage: FileMemorySignal[] = []
    for (const file of files) {
        const content = await fs.readFile(path.join(dir, file), 'utf8')
        for (const line of content.split(/\r?\n/)) {
            if (!line.trim()) continue
            try {
                // Older writeback journals may contain a verbatim conversation preview in metadata.
                const { metadata: _metadata, ...signal } = parseFileMemorySignal(line)
                const bucket = signal.type === 'recall_hit' || signal.type === 'detail_read' ? usage : changes
                bucket.push(signal)
            } catch {
                /* Ignore incomplete journal entries. */
            }
        }
    }
    const selected = changes.slice(-500)
    return [...selected, ...usage.slice(usage.length - Math.min(usage.length, 500 - selected.length))].sort((a, b) =>
        a.createdAt.localeCompare(b.createdAt)
    )
}

export function readSessionEvidence(
    reader: FileMemoryConversationHistoryReader,
    xpert: FileMemoryXpertScope,
    signals: FileMemorySignal[],
    records: FileMemoryTopicRecord[]
) {
    const conversationIds = new Set<string>()
    const anchors = new Map<string, { conversationId: string; messageId: string }>()
    function include(ref?: string, fallback?: string) {
        const match = ref?.match(/^conversation:([^#]+)(?:#message:([^#]+))?$/)
        const id = match?.[1] ?? fallback
        if (!id || !uuid.safeParse(id).success || (!conversationIds.has(id) && conversationIds.size >= 20)) return
        conversationIds.add(id)
        if (match?.[2] && uuid.safeParse(match[2]).success && anchors.size < 200)
            anchors.set(ref!, { conversationId: id, messageId: match[2] })
    }
    const newest = [...signals].reverse()
    for (const signal of newest.filter((s) => s.type === 'user_correction' || s.type === 'writeback_candidate')) {
        include(signal.sourceRef, signal.conversationId)
        const old = signal.memoryId && records.find((r) => r.document.frontmatter.id === signal.memoryId)
        if (old) for (const ref of [...(old.document.frontmatter.sourceRefs ?? [])].reverse()) include(ref)
    }
    for (const record of records)
        for (const ref of [...(record.document.frontmatter.sourceRefs ?? [])].reverse()) include(ref)
    for (const signal of newest) include(signal.sourceRef, signal.conversationId)
    return reader.readSnippets({
        xpert,
        conversationIds: [...conversationIds],
        anchors: [...anchors.values()],
        maxMessages: 500,
        maxBytes: 200 * 1024
    })
}
