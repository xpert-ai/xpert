import type { DocumentInterface } from '@langchain/core/documents'
import type { DocumentMetadata, IKnowledgebase, KnowledgeFilterDiagnostics } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import { KnowledgebaseService } from '../knowledgebase.service'
import type { KnowledgeDocumentStore } from '../vector-store'
import type { KnowledgeRetrievalRequest } from '../retrieval/types'
import { isKnowledgebaseFAQConfig } from './faq-config'
import { isKnowledgeFAQChunkMetadata } from './faq-projection'
import { FAQSemanticCacheService, faqContentHash, withFAQTimeout } from './faq-semantic-cache.service'
import {
    compareFAQVectors,
    FAQQuestions,
    FAQSemanticDecision,
    FAQSemanticError,
    matchFAQExactly
} from './faq-semantic-match'

export function faqModelIdentity(store: KnowledgeDocumentStore, scope: { tenantId: string; organizationId: string }) {
    const kb = store.knowledgebase
    return faqContentHash([
        scope.tenantId,
        scope.organizationId,
        kb.id,
        kb.embeddingModelFingerprint,
        kb.embeddingRevision,
        kb.embeddingDimensions,
        kb.copilotModelId,
        kb.copilotModel?.copilotId,
        store.embeddingModel,
        kb.copilotModel?.options,
        'document-v1'
    ])
}

export function faqQuestionTexts(questions: FAQQuestions) {
    return [questions.standardQuestion, ...questions.similarQuestions, ...(questions.negativeQuestions ?? [])]
}

@Injectable()
export class FAQSemanticService {
    constructor(
        private readonly knowledgebaseService: KnowledgebaseService,
        private readonly cache: FAQSemanticCacheService
    ) {}

    createSession(request: KnowledgeRetrievalRequest) {
        const config = request.knowledgebase.faqConfig
        if (!isKnowledgebaseFAQConfig(config) || config.negativeMatchMode !== 'semantic')
            throw new FAQSemanticError('invalid_config')
        const policy = { threshold: config.semanticThreshold, margin: config.semanticMargin }
        const decisions = new Map<string, FAQSemanticDecision>()
        const vectors = new Map<string, number[]>()
        const diagnostics: NonNullable<KnowledgeFilterDiagnostics['faqExclusion']> = {
            mode: 'semantic',
            ...policy,
            compared: 0,
            reused: 0,
            excluded: 0,
            cacheHits: 0,
            encodedTexts: 0,
            cacheErrors: 0,
            coalescedTexts: 0,
            rounds: 0,
            candidateSlots: 0,
            retrievalCalls: 0,
            decisions: []
        }
        request.preparedFilter.diagnostics.faqExclusion = diagnostics
        const getStore = () =>
            (request.faqSession.vectorStore ??= this.knowledgebaseService.getActiveVectorStore(
                request.knowledgebase.id,
                true,
                request.modelContext,
                { rerankEnabled: false }
            ))
        const remember = (key: string, faqId: string, decision: FAQSemanticDecision) => {
            decisions.set(key, decision)
            if (decision.action === 'exclude') diagnostics.excluded++
            if (diagnostics.decisions.length < request.faqSession.budget.limits.semanticComparisons) {
                diagnostics.decisions.push({ faqId, ...decision })
            }
        }
        return {
            diagnostics,
            filter: async (documents: DocumentInterface<DocumentMetadata>[]) => {
                const keep: DocumentInterface<DocumentMetadata>[] = []
                const seen = new Set<string>()
                for (const document of documents) {
                    const metadata = document.metadata
                    if (
                        !isKnowledgeFAQChunkMetadata(metadata) ||
                        !metadata.enabled ||
                        metadata.vectorSyncStatus === 'pending' ||
                        metadata.vectorSyncStatus === 'failed'
                    )
                        continue
                    if (seen.has(metadata.chunkId)) continue
                    seen.add(metadata.chunkId)
                    const key = faqContentHash([metadata.chunkId, faqQuestionTexts(metadata)])
                    let decision = decisions.get(key)
                    if (decision) {
                        diagnostics.reused++
                    } else {
                        decision = matchFAQExactly(request.query, metadata)
                        if (!decision) {
                            const texts = faqQuestionTexts(metadata)
                            const missing = [...new Set(texts)].filter((text) => !vectors.has(text))
                            if (!request.faqSession.budget.reserveComparison(missing.length)) continue
                            try {
                                const store = await withFAQTimeout(getStore())
                                request.faqSession.vectorSearch ??= store.createSearchSession(request.query, true)
                                const queryVector = await withFAQTimeout(
                                    request.faqSession.vectorSearch.getQueryEmbedding()
                                )
                                if (queryVector.length !== store.knowledgebase.embeddingDimensions)
                                    throw new FAQSemanticError('invalid_vector')
                                const identity = faqModelIdentity(store, request.scope)
                                diagnostics.modelFingerprint = store.knowledgebase.embeddingModelFingerprint ?? identity
                                const computed = await this.cache.vectors(
                                    identity,
                                    missing,
                                    queryVector.length,
                                    (batch) => store.vStore.embeddings.embedDocuments(batch),
                                    diagnostics
                                )
                                computed.forEach((vector, text) => vectors.set(text, vector))
                                decision = compareFAQVectors(
                                    queryVector,
                                    [metadata.standardQuestion, ...metadata.similarQuestions].map((text) =>
                                        vectors.get(text)
                                    ),
                                    metadata.negativeQuestions.map((text) => vectors.get(text)),
                                    policy
                                )
                                diagnostics.compared++
                            } catch (error) {
                                diagnostics.failureReason =
                                    error instanceof FAQSemanticError ? error.reason : 'model_failed'
                                throw error instanceof FAQSemanticError ? error : new FAQSemanticError('model_failed')
                            }
                        }
                        remember(key, metadata.chunkId, decision)
                    }
                    if (decision.action === 'keep') keep.push(document)
                }
                return keep
            }
        }
    }

    async prewarm(knowledgebase: IKnowledgebase, questions: FAQQuestions) {
        const store = await withFAQTimeout(
            this.knowledgebaseService.getActiveVectorStore(knowledgebase.id, true, undefined, { rerankEnabled: false })
        )
        const dimensions = store.knowledgebase.embeddingDimensions
        if (!Number.isInteger(dimensions) || dimensions <= 0) throw new FAQSemanticError('invalid_config')
        return this.cache.vectors(
            faqModelIdentity(store, { tenantId: knowledgebase.tenantId, organizationId: knowledgebase.organizationId }),
            faqQuestionTexts(questions),
            dimensions,
            (batch) => store.vStore.embeddings.embedDocuments(batch),
            { cacheHits: 0, encodedTexts: 0, cacheErrors: 0, coalescedTexts: 0 }
        )
    }
}
