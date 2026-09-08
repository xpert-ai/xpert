import { z } from 'zod'
import { t } from 'i18next'
import {
    createIdentityDescriptorOptions,
    parseKnowledgeIdentityDescriptor
} from '../knowledgebase/identity/knowledge-identity-model'
import { KnowledgeIdentityError } from '../knowledgebase/identity/knowledge-identity-error'
import { TKnowledgeGraphExtraction } from './types'

const createGraphExtractionSchema = (candidateIdLimit: number) =>
    z.object({
        entities: z
            .array(
                z.object({
                    candidateId: z.string().min(1).max(candidateIdLimit),
                    identity: z.discriminatedUnion('kind', [...createIdentityDescriptorOptions()]),
                    name: z.string().min(1),
                    type: z.string().min(1),
                    aliases: z.array(z.string()).optional().nullable(),
                    description: z.string().optional().nullable(),
                    confidence: z.number().min(0).max(1).optional().nullable(),
                    evidence: z
                        .array(
                            z.object({
                                chunkId: z.string().min(1),
                                quote: z.string().optional().nullable(),
                                confidence: z.number().min(0).max(1).optional().nullable()
                            })
                        )
                        .min(1)
                })
            )
            .default([]),
        relations: z
            .array(
                z.object({
                    sourceCandidateId: z.string().min(1).max(candidateIdLimit),
                    targetCandidateId: z.string().min(1).max(candidateIdLimit),
                    type: z.string().min(1),
                    description: z.string().optional().nullable(),
                    confidence: z.number().min(0).max(1).optional().nullable(),
                    evidence: z
                        .array(
                            z.object({
                                chunkId: z.string().min(1),
                                quote: z.string().optional().nullable(),
                                confidence: z.number().min(0).max(1).optional().nullable()
                            })
                        )
                        .min(1)
                })
            )
            .default([])
    })

export const graphExtractionSchema = createGraphExtractionSchema(128)
const graphExtractionSnapshotSchema = createGraphExtractionSchema(512)

export function validateKnowledgeGraphExtractionEvidence(
    extraction: TKnowledgeGraphExtraction,
    validChunkIds: ReadonlySet<string>,
    options: { allowEmpty?: boolean } = {}
) {
    const graphItems = [...extraction.entities, ...extraction.relations]
    const hasInvalidEvidence = graphItems.some(
        (item) => !item.evidence?.length || item.evidence.some(({ chunkId }) => !validChunkIds.has(chunkId))
    )
    if ((!options.allowEmpty && !graphItems.length) || hasInvalidEvidence) {
        const defaultValue = 'GraphRAG extraction did not return valid source evidence for every graph item.'
        throw new Error(t('server-ai:Error.GraphExtractionEvidenceInvalid', { defaultValue }) || defaultValue)
    }
    const candidateIds = new Set(extraction.entities.map((entity) => entity.candidateId))
    if (
        candidateIds.has(undefined) ||
        candidateIds.size !== extraction.entities.length ||
        extraction.relations.some(
            (relation) => !candidateIds.has(relation.sourceCandidateId) || !candidateIds.has(relation.targetCandidateId)
        )
    ) {
        throw new KnowledgeIdentityError('invalid')
    }
    for (const entity of extraction.entities) entity.identity = parseKnowledgeIdentityDescriptor(entity.identity)
}

export function parseGraphExtraction(value: unknown): TKnowledgeGraphExtraction {
    return parseExtraction(value, graphExtractionSchema)
}

export function parseGraphExtractionSnapshot(value: unknown): TKnowledgeGraphExtraction {
    return parseExtraction(value, graphExtractionSnapshotSchema)
}

function parseExtraction(value: unknown, schema: typeof graphExtractionSchema): TKnowledgeGraphExtraction {
    const parsed = schema.safeParse(value)
    if (!parsed.success) {
        if (parsed.error.issues.some((issue) => issue.path.includes('evidence'))) {
            const defaultValue = 'GraphRAG extraction did not return valid source evidence for every graph item.'
            throw new Error(t('server-ai:Error.GraphExtractionEvidenceInvalid', { defaultValue }) || defaultValue)
        }
        throw new KnowledgeIdentityError('invalid')
    }
    return parsed.data as TKnowledgeGraphExtraction
}
