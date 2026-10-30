import type { BaseMessage } from '@langchain/core/messages'
import { z } from 'zod/v3'

export const CONTEXT_EVIDENCE_TOOL = 'read_context_evidence'
export const evidenceIdSchema = z.string().regex(/^[a-f0-9]{64}$/)
export const evidenceArchiveSchema = z.object({
    archiveId: evidenceIdSchema,
    records: z.number().int().nonnegative(),
    partial: z.boolean(),
    agentKey: z.string()
})
export const evidenceScopeSchema = z.object({
    tenantId: z.string().min(1),
    organizationId: z.string().nullable(),
    userId: z.string().min(1),
    conversationId: z.string().min(1),
    threadId: z.string().min(1),
    agentKey: z.string(),
    xpertId: z.string().optional(),
    conversationXpertId: z.string().optional()
})
export type ContextEvidenceScope = z.infer<typeof evidenceScopeSchema>
export const evidenceMessageSchema = z.object({
    role: z.enum(['human', 'ai', 'tool', 'system', 'other']),
    messageId: z.string().optional(),
    name: z.string().optional(),
    callId: z.string().optional(),
    status: z.enum(['success', 'error']).optional(),
    content: z.string(),
    format: z.enum(['text', 'json']),
    partial: z.boolean(),
    archives: z.array(evidenceArchiveSchema).optional(),
    calls: z.array(z.object({ id: z.string().optional(), name: z.string(), arguments: z.string() }))
})
export type EvidenceMessage = z.infer<typeof evidenceMessageSchema>
export const evidenceEntrySchema = z.object({
    recordId: evidenceIdSchema,
    role: evidenceMessageSchema.shape.role,
    name: z.string().optional(),
    preview: z.string().max(240).optional(),
    status: evidenceMessageSchema.shape.status,
    callIds: z.array(z.string()),
    partial: z.boolean()
})
export const evidencePayloadSchema = z.discriminatedUnion('kind', [
    z.object({ version: z.literal(1), kind: z.literal('message'), message: evidenceMessageSchema }),
    z.object({ version: z.literal(1), kind: z.literal('manifest'), entries: z.array(evidenceEntrySchema).max(10000) })
])
export type EvidencePayload = z.infer<typeof evidencePayloadSchema>
export type EvidenceRecord = { evidenceId: string; payload: string }
export type EvidenceArchive = z.infer<typeof evidenceArchiveSchema>

export const readContextEvidenceSchema = z
    .object({
        archiveId: evidenceIdSchema.describe('Copy the archive ID from a context recovery reference.'),
        part: z.enum(['index', 'content', 'arguments']).default('index'),
        record: z.number().int().nonnegative().optional().describe('Zero-based record number from the index.'),
        call: z.number().int().nonnegative().default(0).describe('Zero-based call within an assistant record.'),
        offset: z.number().int().nonnegative().default(0),
        limit: z.number().int().min(1).max(8000).default(4000)
    })
    .strict()
export type ReadContextEvidenceInput = z.infer<typeof readContextEvidenceSchema>

/** Bound by the host, never by model arguments. Archive success includes durable read-back verification. */
export interface ContextEvidenceAccess {
    archive(messages: BaseMessage[]): Promise<EvidenceArchive>
    read(input: ReadContextEvidenceInput): Promise<unknown>
}

/** Persistence boundary; the service owns authorization, serialization and integrity checks. */
export abstract class ContextEvidenceStorage {
    abstract put(scope: ContextEvidenceScope, records: EvidenceRecord[]): Promise<void>
    abstract get(scope: ContextEvidenceScope, ids: string[]): Promise<EvidenceRecord[]>
}
