import { KnowledgebaseTypeEnum } from '@xpert-ai/contracts'
import type { Cache } from 'cache-manager'
import type { KnowledgebaseService } from '../../knowledgebase.service'
import { FAQSemanticService } from '../../faq/faq-semantic.service'
import { FAQSemanticCacheService } from '../../faq/faq-semantic-cache.service'
import { FAQRetrievalBudget, FAQ_RETRIEVAL_LIMITS } from '../../faq/faq-retrieval-budget'
import type {
    VectorKnowledgeCandidateRetriever,
    KeywordKnowledgeCandidateRetriever,
    GraphKnowledgeCandidateRetriever,
    KnowledgeRetrievalBatch
} from '../../retrieval'
import { LegacyWeightedFusion, WeightedRrfFusion } from '../../retrieval'
import { KnowledgeSearchQuery } from '../knowledge-search.query'
import { KnowledgeSearchQueryHandler } from './knowledge-search.handler'

jest.mock('../../knowledgebase.service', () => ({ KnowledgebaseService: class KnowledgebaseService {} }))
jest.mock('../../../knowledge-document/chunk/chunk.service', () => ({
    KnowledgeDocumentChunkService: class KnowledgeDocumentChunkService {}
}))

describe('Semantic FAQ candidate ordering', () => {
    it.each(['vector', 'keyword'] as const)('spends the comparison budget on the best %s ranks first', async (mode) => {
        const kb = {
            id: 'kb',
            type: KnowledgebaseTypeEnum.FAQ,
            embeddingDimensions: 2,
            recall: { mode, topK: 1 },
            faqConfig: {
                indexMode: 'question_only',
                questionIndexMode: 'separate',
                negativeMatchMode: 'semantic',
                semanticThreshold: 0.85,
                semanticMargin: 0.05
            }
        }
        const backend = {
            findAll: jest.fn(async () => ({ items: [kb] })),
            getActiveVectorStore: jest.fn(async () => ({
                knowledgebase: kb,
                embeddingModel: 'model',
                createSearchSession: () => ({ getQueryEmbedding: async () => [1, 0] }),
                vStore: { embeddings: { embedDocuments: async (texts: string[]) => texts.map(() => [0.8, 0.6]) } }
            }))
        } as unknown as KnowledgebaseService
        const batch: KnowledgeRetrievalBatch = {
            source: mode,
            // Relational hydration order differs from the explicit retrieval ranks.
            candidates: [3, 2, 1].map((rank) => ({
                rank,
                document: {
                    pageContent: `answer-${rank}`,
                    metadata: {
                        contentKind: 'faq',
                        chunkId: `faq-${rank}`,
                        standardQuestion: `positive-${rank}`,
                        similarQuestions: [],
                        negativeQuestions: [`negative-${rank}`],
                        answerBlocks: [`answer-${rank}`],
                        enabled: true,
                        faqVectorIds: [],
                        vectorSyncStatus: 'ready',
                        score: 1 - rank / 10
                    }
                }
            })),
            diagnostics: { filterVersion: 2, filterStatus: 'not_applied', hitCount: 3 },
            exhausted: true
        }
        const vector = { retrieve: jest.fn(async () => batch) }
        const keyword = { retrieve: jest.fn(async () => batch) }
        const graph = { retrieve: jest.fn() }
        const handler = new KnowledgeSearchQueryHandler(
            backend,
            vector as unknown as VectorKnowledgeCandidateRetriever,
            graph as unknown as GraphKnowledgeCandidateRetriever,
            keyword as unknown as KeywordKnowledgeCandidateRetriever,
            new LegacyWeightedFusion(),
            new WeightedRrfFusion()
        )
        const semantic = new FAQSemanticService(
            backend,
            new FAQSemanticCacheService({
                get: async () => undefined,
                set: async () => undefined
            } as unknown as Cache)
        )
        const createSession = semantic.createSession.bind(semantic)
        jest.spyOn(semantic, 'createSession').mockImplementation((request) => {
            request.faqSession.budget = new FAQRetrievalBudget({ ...FAQ_RETRIEVAL_LIMITS, semanticComparisons: 2 })
            return createSession(request)
        })
        Object.assign(handler, { faqSemanticService: semantic, retrievalLogService: { create: jest.fn() } })
        const result = await handler.execute(
            new KnowledgeSearchQuery({
                knowledgebases: ['kb'],
                query: 'query',
                source: 'retriever',
                k: 1,
                tenantId: 'tenant',
                organizationId: 'org'
            })
        )
        expect(result.diagnostics[0].faqExclusion.decisions.map(({ faqId }) => faqId)).toEqual(['faq-1', 'faq-2'])
        expect(result.documents.map((document) => document.metadata.chunkId)).toEqual(['faq-1'])
        expect(batch.candidates.map(({ rank }) => rank)).toEqual([3, 2, 1])
        expect((mode === 'vector' ? keyword : vector).retrieve).not.toHaveBeenCalled()
        expect(graph.retrieve).not.toHaveBeenCalled()
    })
})
