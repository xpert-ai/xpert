import type { DocumentInterface } from '@langchain/core/documents'
import type { DocumentMetadata, IKnowledgebase } from '@xpert-ai/contracts'
import { prepareKnowledgeFilter } from '../filter'
import type { KnowledgeCandidateRetriever, KnowledgeRetrievalRequest } from '../retrieval/types'
import { WeightedRrfFusion } from '../retrieval/weighted-rrf.fusion'
import { refillFAQCandidates } from './faq-candidate-refill'
import { FAQRetrievalBudget, FAQ_RETRIEVAL_LIMITS } from './faq-retrieval-budget'

const doc = (id: string): DocumentInterface<DocumentMetadata> => ({ pageContent: id, metadata: { chunkId: id } })
function request(k = 2): KnowledgeRetrievalRequest {
    const knowledgebase = { id: 'kb' } as IKnowledgebase
    return {
        knowledgebase,
        k,
        query: 'question',
        scope: { tenantId: 'tenant', organizationId: 'org' },
        modelContext: {},
        preparedFilter: prepareKnowledgeFilter({ knowledgebase }),
        faqSession: { budget: new FAQRetrievalBudget() }
    }
}
function retriever(source: 'vector' | 'keyword', ids: string[]): KnowledgeCandidateRetriever {
    return {
        source,
        retrieve: jest.fn(async (input: KnowledgeRetrievalRequest) => {
            const count = input.faqSession.budget.reserveCandidates(input.k)
            return {
                source,
                candidates: ids.slice(0, count).map((id, i) => ({ document: doc(id), rank: i + 1 })),
                diagnostics: input.preparedFilter.diagnostics,
                exhausted: count > 0 && count >= ids.length,
                budgetLimited: count === 0
            }
        })
    }
}

describe('FAQ candidate refill', () => {
    it('continues beyond a single refill and only stops on filtered distinct FAQ counts', async () => {
        const source = retriever('vector', [
            'reject-a',
            'reject-b',
            'reject-c',
            'reject-d',
            'keep-e',
            'keep-f',
            'keep-g'
        ])
        const result = await refillFAQCandidates({
            request: request(),
            retrievers: [source],
            fuse: (batches) => batches.flatMap((batch) => batch.candidates.map((item) => item.document)),
            filter: async (docs) => docs.filter((item) => item.pageContent.startsWith('keep'))
        })
        expect(result.rounds).toBe(3)
        expect(result.reason).toBe('target_reached')
        expect(result.documents.map((item) => item.pageContent)).toEqual(['keep-e', 'keep-f', 'keep-g'])
    })

    it('retains an exhausted branch and recomputes RRF with new contributions, not previous fused scores', async () => {
        const vector = retriever('vector', ['shared'])
        const keyword = retriever('keyword', ['reject-a', 'reject-b', 'shared', 'keep'])
        const rrf = new WeightedRrfFusion()
        const fusedScores: number[] = []
        const result = await refillFAQCandidates({
            request: request(),
            retrievers: [vector, keyword],
            fuse: (batches) => {
                const docs = rrf.fuse(batches, { rankConstant: 60, weights: { vector: 1, keyword: 1, graph: 0 } })
                fusedScores.push(docs.find((item) => item.metadata.chunkId === 'shared').metadata.score)
                return docs
            },
            filter: async (docs) => docs.filter((item) => !item.pageContent.startsWith('reject'))
        })
        expect(result.rounds).toBe(2)
        expect(vector.retrieve).toHaveBeenCalledTimes(1)
        expect(keyword.retrieve).toHaveBeenCalledTimes(2)
        expect(fusedScores[1]).toBeCloseTo(1 / 61 + 1 / 63)
        expect(fusedScores[1]).toBeGreaterThan(fusedScores[0])
    })

    it('stops within the shared candidate budget and preserves previous valid results', async () => {
        const input = request()
        input.faqSession.budget = new FAQRetrievalBudget({ ...FAQ_RETRIEVAL_LIMITS, candidateSlots: 3 })
        const source = retriever('vector', ['keep', 'reject', 'later'])
        const result = await refillFAQCandidates({
            request: input,
            retrievers: [source],
            fuse: (batches) => batches.flatMap((batch) => batch.candidates.map((item) => item.document)),
            filter: async (docs) => docs.filter((item) => item.pageContent === 'keep')
        })
        expect(result.reason).toBe('budget_exhausted')
        expect(result.documents.map((item) => item.pageContent)).toEqual(['keep'])
        expect(input.faqSession.budget.candidateSlots).toBeLessThanOrEqual(3)
    })

    it('reports exhausted when every candidate is excluded', async () => {
        const result = await refillFAQCandidates({
            request: request(),
            retrievers: [retriever('vector', ['reject'])],
            fuse: (batches) => batches.flatMap((batch) => batch.candidates.map((item) => item.document)),
            filter: async () => []
        })
        expect(result.documents).toEqual([])
        expect(result.reason).toBe('exhausted')
    })

    it('does not turn an in-flight semantic error into budget exhaustion', async () => {
        await expect(
            refillFAQCandidates({
                request: request(),
                retrievers: [retriever('vector', ['a'])],
                fuse: (batches) => batches.flatMap((batch) => batch.candidates.map((item) => item.document)),
                filter: async () => {
                    throw new Error('semantic timeout')
                }
            })
        ).rejects.toThrow('semantic timeout')
    })
})
