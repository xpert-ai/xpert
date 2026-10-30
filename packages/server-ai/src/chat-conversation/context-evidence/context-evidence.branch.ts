// Invariants: called only inside the authorized branch transaction. Copy the referenced closure,
// rebind every archive ID, and never retain an ownership dependency on the source conversation.
import { HumanMessage, isBaseMessage, isHumanMessage } from '@langchain/core/messages'
import type { Checkpoint } from '@langchain/langgraph-checkpoint'
import {
    ContextEvidenceScope,
    ContextEvidenceStorage,
    EvidenceArchive,
    EvidenceRecord,
    evidenceArchiveSchema
} from './context-evidence.schema'
import {
    decodeEvidenceRecord,
    encodeEvidenceRecord,
    EvidenceThreadReader,
    findEvidenceArchive,
    persistEvidenceRecords
} from './context-evidence.archive'

const archivesSchema = evidenceArchiveSchema.array()

export function createBranchEvidenceCopier(params: {
    storage: ContextEvidenceStorage
    readThread: EvidenceThreadReader
    source: Omit<ContextEvidenceScope, 'threadId' | 'agentKey'>
    targetConversationId: string
    targetThreadId: string
}) {
    const completed = new Map<string, EvidenceArchive>()
    const pending = new Set<string>()
    const reboundArrays = new WeakSet<unknown[]>()

    async function copyArchive(archive: EvidenceArchive, threadId: string): Promise<EvidenceArchive> {
        const key = JSON.stringify([threadId, archive.agentKey, archive.archiveId])
        const existing = completed.get(key)
        if (existing) return existing
        if (pending.has(key)) throw new Error('Cyclic context archive reference')
        pending.add(key)
        const { source, manifest } = await findEvidenceArchive(
            params.storage,
            { ...params.source, threadId, agentKey: archive.agentKey },
            archive.archiveId,
            params.readThread
        )
        const target = { ...source, conversationId: params.targetConversationId, threadId: params.targetThreadId }
        const records: EvidenceRecord[] = []
        const entries: typeof manifest.entries = []
        const originalRows = new Map(
            (
                await params.storage.get(
                    source,
                    manifest.entries.map((entry) => entry.recordId)
                )
            ).map((row) => [row.evidenceId, row])
        )
        for (const entry of manifest.entries) {
            const row = originalRows.get(entry.recordId)
            if (!row) throw new Error('Missing archived message')
            const payload = decodeEvidenceRecord(source, row)
            if (payload.kind !== 'message') throw new Error('Expected archived message')
            const original = payload.message.archives ?? []
            const archives: EvidenceArchive[] = []
            for (const reference of original) archives.push(await copyArchive(reference, source.threadId))
            const content = rebindIds(payload.message.content, original, archives)
            const message = { ...payload.message, content, ...(original.length ? { archives } : {}) }
            const record = encodeEvidenceRecord(target, { version: 1, kind: 'message', message })
            records.push(record)
            entries.push({
                ...entry,
                recordId: record.evidenceId,
                preview: (content || message.calls[0]?.arguments || '').slice(0, 240)
            })
        }
        await persistEvidenceRecords(params.storage, target, records)
        const copied = encodeEvidenceRecord(target, { version: 1, kind: 'manifest', entries })
        await persistEvidenceRecords(params.storage, target, [copied])
        const result = { ...archive, archiveId: copied.evidenceId }
        completed.set(key, result)
        pending.delete(key)
        return result
    }

    async function rebindMessages(messages: unknown[], threadId: string) {
        if (reboundArrays.has(messages)) return
        reboundArrays.add(messages)
        for (let i = 0; i < messages.length; i++) {
            const message = messages[i]
            if (!isBaseMessage(message) || message.additional_kwargs.contextEvidenceArchives === undefined) continue
            if (
                !isHumanMessage(message) ||
                message.additional_kwargs.compressed !== true ||
                typeof message.content !== 'string'
            )
                throw new Error('Invalid context summary metadata')
            const originals = archivesSchema.parse(message.additional_kwargs.contextEvidenceArchives)
            const archives: EvidenceArchive[] = []
            for (const archive of originals) archives.push(await copyArchive(archive, threadId))
            messages[i] = new HumanMessage({
                id: message.id,
                name: message.name,
                content: rebindIds(message.content, originals, archives),
                additional_kwargs: { ...message.additional_kwargs, contextEvidenceArchives: archives },
                response_metadata: message.response_metadata
            })
        }
    }

    return async (checkpoint: Checkpoint, sourceThreadId: string): Promise<void> => {
        if (Array.isArray(checkpoint.channel_values.messages))
            await rebindMessages(checkpoint.channel_values.messages, sourceThreadId)
        for (const value of Object.values(checkpoint.channel_values)) {
            if (value && typeof value === 'object' && 'messages' in value && Array.isArray(value.messages))
                await rebindMessages(value.messages, sourceThreadId)
        }
    }
}

function rebindIds(content: string, originals: EvidenceArchive[], copies: EvidenceArchive[]) {
    return originals.reduce((text, reference, i) => text.split(reference.archiveId).join(copies[i].archiveId), content)
}
