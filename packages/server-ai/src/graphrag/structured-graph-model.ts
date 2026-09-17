// Invariants: structured publications carry explicit identities and exact chunk references.
// No text parsing, fuzzy identity matching, or model invocation belongs on this path.
import { BadRequestException } from '@nestjs/common'
import type { JSONValue } from '@xpert-ai/contracts'
import type { KnowledgeGraphPublishInput } from '@xpert-ai/plugin-sdk'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { t } from 'i18next'
import type { TKnowledgeGraphExtraction } from './types'

export const graphJsonSchema: z.ZodType<JSONValue> = z.lazy(() =>
    z.union([
        z.string(),
        z.number().finite(),
        z.boolean(),
        z.null(),
        z.array(graphJsonSchema),
        z.record(graphJsonSchema)
    ])
)
const key = z.string().trim().min(1).max(512)
const chunkIds = z.array(z.string().min(1).max(2048)).min(1).max(20000)
const properties = z.record(graphJsonSchema).optional()
export const graphPublicationSchema = z
    .object({
        knowledgebaseId: z.string().uuid(),
        documentId: z.string().uuid(),
        xpertId: z.string().uuid(),
        agentKey: key,
        publicationKey: key,
        sourceVersion: key,
        chunkIds,
        entities: z
            .array(
                z
                    .object({
                        id: key,
                        namespace: key,
                        nodeKey: key,
                        type: z.string().trim().min(1).max(120),
                        name: key,
                        description: z.string().max(12000).optional(),
                        properties,
                        chunkIds
                    })
                    .strict()
            )
            .max(10000),
        relations: z
            .array(
                z
                    .object({
                        source: key,
                        target: key,
                        type: z.string().trim().min(1).max(120),
                        description: z.string().max(12000).optional(),
                        properties,
                        chunkIds
                    })
                    .strict()
            )
            .max(30000)
    })
    .strict()

export function invalidGraphPublication(): never {
    const defaultValue =
        'Structured graph publication is invalid or its source chunks have changed. Republish from the source application.'
    throw new BadRequestException(
        t('server-ai:Error.StructuredGraphPublicationInvalid', { defaultValue }) || defaultValue
    )
}

export function parseGraphPublication(value: unknown): KnowledgeGraphPublishInput {
    const parsed = graphPublicationSchema.safeParse(value)
    if (!parsed.success) invalidGraphPublication()
    const input = parsed.data
    const ids = new Set(input.entities.map((n) => n.id))
    const identities = new Set(input.entities.map((n) => JSON.stringify([n.namespace, n.nodeKey])))
    const chunks = new Set(input.chunkIds)
    const edges = new Set(input.relations.map((r) => JSON.stringify([r.source, r.target, r.type.trim().toLowerCase()])))
    if (
        ids.size !== input.entities.length ||
        identities.size !== ids.size ||
        chunks.size !== input.chunkIds.length ||
        edges.size !== input.relations.length ||
        input.relations.some((r) => !ids.has(r.source) || !ids.has(r.target)) ||
        [...input.entities, ...input.relations].some((n) => n.chunkIds.some((id) => !chunks.has(id)))
    )
        invalidGraphPublication()
    return input as KnowledgeGraphPublishInput
}

export function toStructuredExtraction(input: KnowledgeGraphPublishInput): TKnowledgeGraphExtraction {
    return {
        publication: {
            key: input.publicationKey,
            sourceVersion: input.sourceVersion,
            hash: createHash('sha256')
                .update(JSON.stringify(['structured-graph-v1', input]))
                .digest('hex'),
            mode: 'structured'
        },
        entities: input.entities.map((n) => ({
            candidateId: n.id,
            name: n.name,
            type: n.type,
            description: n.description,
            aliases: [n.nodeKey],
            properties: { ...n.properties, nodeKey: n.nodeKey, namespace: n.namespace },
            identity: {
                kind: 'entity',
                entityType: 'other',
                scope: n.namespace,
                description: (n.description || n.name).slice(0, 2000),
                identifiers: [{ namespace: n.namespace, value: n.nodeKey }]
            },
            evidence: n.chunkIds.map((chunkId) => ({ chunkId }))
        })),
        relations: input.relations.map((r) => ({
            sourceCandidateId: r.source,
            targetCandidateId: r.target,
            type: r.type,
            description: r.description,
            properties: r.properties,
            evidence: r.chunkIds.map((chunkId) => ({ chunkId }))
        }))
    }
}
