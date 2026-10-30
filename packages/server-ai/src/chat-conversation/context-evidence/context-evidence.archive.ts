// Invariants: content IDs include the owning scope. Every read verifies both scope and payload.
import { createHash } from 'node:crypto'
import {
    ContextEvidenceScope,
    ContextEvidenceStorage,
    EvidencePayload,
    EvidenceRecord,
    evidencePayloadSchema
} from './context-evidence.schema'

export function evidenceRecordId(scope: ContextEvidenceScope, payload: string): string {
    return createHash('sha256')
        .update(
            JSON.stringify([
                scope.tenantId,
                scope.organizationId,
                scope.conversationId,
                scope.threadId,
                scope.agentKey,
                payload
            ])
        )
        .digest('hex')
}

export function encodeEvidenceRecord(scope: ContextEvidenceScope, payload: EvidencePayload): EvidenceRecord {
    const text = JSON.stringify(payload)
    if (Buffer.byteLength(text) > 16 * 1024 * 1024) throw new Error('Context evidence record exceeds its storage limit')
    return { evidenceId: evidenceRecordId(scope, text), payload: text }
}

export function decodeEvidenceRecord(scope: ContextEvidenceScope, record: EvidenceRecord): EvidencePayload {
    if (evidenceRecordId(scope, record.payload) !== record.evidenceId)
        throw new Error('Context evidence integrity check failed')
    return evidencePayloadSchema.parse(JSON.parse(record.payload))
}

export async function loadEvidenceRecord(storage: ContextEvidenceStorage, scope: ContextEvidenceScope, id: string) {
    const record = (await storage.get(scope, [id])).find((row) => row.evidenceId === id)
    if (!record) throw new Error('Context evidence is unavailable')
    return decodeEvidenceRecord(scope, record)
}

export type EvidenceThreadReader = (
    id: string
) => Promise<{ conversationId: string; parentThreadId?: string | null } | null | undefined>

export async function findEvidenceArchive(
    storage: ContextEvidenceStorage,
    scope: ContextEvidenceScope,
    id: string,
    readThread: EvidenceThreadReader
) {
    let source = scope
    const visited = new Set<string>()
    while (visited.size < 64 && !visited.has(source.threadId)) {
        visited.add(source.threadId)
        const record = (await storage.get(source, [id])).find((row) => row.evidenceId === id)
        if (record) {
            const manifest = decodeEvidenceRecord(source, record)
            if (manifest.kind !== 'manifest') throw new Error('Expected context archive manifest')
            return { source, manifest }
        }
        const thread = await readThread(source.threadId)
        if (!thread?.parentThreadId || thread.conversationId !== scope.conversationId) break
        const parent = await readThread(thread.parentThreadId)
        if (!parent || parent.conversationId !== scope.conversationId) break
        source = { ...scope, threadId: thread.parentThreadId }
    }
    throw new Error('Context archive is unavailable')
}

export async function persistEvidenceRecords(
    storage: ContextEvidenceStorage,
    scope: ContextEvidenceScope,
    records: EvidenceRecord[]
) {
    const unique = [...new Map(records.map((record) => [record.evidenceId, record])).values()]
    await storage.put(scope, unique)
    const saved = new Map(
        (
            await storage.get(
                scope,
                unique.map((row) => row.evidenceId)
            )
        ).map((row) => [row.evidenceId, row.payload])
    )
    if (unique.some((row) => saved.get(row.evidenceId) !== row.payload))
        throw new Error('Context evidence read-back failed')
}
