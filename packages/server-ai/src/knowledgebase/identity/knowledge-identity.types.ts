import {
    KnowledgeIdentityEmbedding,
    KnowledgeIdentityObservationPayload,
    KnowledgeIdentityProfile
} from '@xpert-ai/contracts'
import { EntityManager } from 'typeorm'
import { KnowledgeIdentityDedupModelInput, KnowledgeIdentityDedupModelOutput } from './knowledge-identity-model'

export type KnowledgeIdentitySource = {
    knowledgebaseId: string
    tenantId?: string | null
    organizationId?: string | null
    sourceDocumentIdSnapshot: string
    sourceContentHash: string
    sourcePublicationEpoch: number
    consumer: 'wiki' | 'graph'
    extractionId: string
}

export type KnowledgeIdentityCatalogueEntry = {
    id: string
    revision: number
    canonicalName: string
    profile: KnowledgeIdentityProfile
}

export type KnowledgeIdentityInput = KnowledgeIdentityObservationPayload & {
    candidateKey: string
    embedding?: KnowledgeIdentityEmbedding | null
}

export type KnowledgeIdentityRuntime = {
    /** Each caller retains its model configuration, billing, and durable invocation policy. */
    judge: (input: KnowledgeIdentityDedupModelInput, ordinal: number) => Promise<KnowledgeIdentityDedupModelOutput>
    /** Called inside the KB transaction, before any identity writes. */
    assertCurrent: (manager: EntityManager) => Promise<void>
}
