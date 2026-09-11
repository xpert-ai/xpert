import { DocumentInterface } from '@langchain/core/documents'
import { IDocChunkMetadata, IKnowledgebase, KnowledgebaseTypeEnum, VectorTypeEnum } from '@xpert-ai/contracts'
import { environment } from '@xpert-ai/server-config'
import { KnowledgeDocumentChunk } from '../../knowledge-document/chunk/chunk.entity'
import { KnowledgeDocumentChunkService } from '../../knowledge-document/chunk/chunk.service'
import { questionSourceHash } from '../../knowledge-document/questions/question-generation'
import { KnowledgebaseService } from '../knowledgebase.service'
import { prepareKnowledgeFilter } from '../filter'
import { VectorKnowledgeCandidateRetriever } from './vector-knowledge-candidate.retriever'

function source(id: string) {
    const chunk = Object.assign(new KnowledgeDocumentChunk(), {
        id,
        pageContent: `Source text ${id}`,
        metadata: { chunkId: id },
        document: { id: 'doc', disabled: false }
    })
    chunk.metadata.questionGeneration = {
        status: 'ready',
        generationId: 'current',
        sourceHash: questionSourceHash(chunk),
        inputHash: 'input',
        updatedAt: new Date().toISOString(),
        vectorIds: [],
        questions: [
            { id: 'q1', question: 'What does this explain?' },
            { id: 'q2', question: 'When is it used?' }
        ]
    }
    return chunk
}
function vector(
    chunkId: string,
    questionId?: string,
    generationId = 'current'
): [DocumentInterface<IDocChunkMetadata>, number] {
    return [
        {
            pageContent: 'Generated search question',
            metadata: {
                chunkId,
                ...(questionId
                    ? {
                          questionSourceChunkId: chunkId,
                          questionGenerationId: generationId,
                          generatedQuestionId: questionId
                      }
                    : {})
            }
        },
        0.1
    ]
}

describe('question retrieval projections', () => {
    const backend = environment.vectorStore
    afterEach(() => {
        environment.vectorStore = backend
    })

    function setup(chunks: KnowledgeDocumentChunk[], vectors: ReturnType<typeof vector>[]) {
        const kb = {
            id: 'kb',
            name: 'KB',
            type: KnowledgebaseTypeEnum.Standard,
            recall: { topK: 2 },
            metadataSchema: []
        } as IKnowledgebase
        const store = {
            embeddingModel: 'embedding',
            structuredSimilaritySearchWithScore: jest.fn(async (_query: string, k: number) => ({
                items: vectors.slice(0, k)
            }))
        }
        const knowledgebases = {
            getActiveVectorStore: jest.fn(async () => store),
            countStructuredFilterCandidates: jest.fn(async () => ({}))
        }
        const chunkService = {
            findAll: jest.fn(async (options?: { relations?: string[] }) => ({
                items: structuredClone(
                    options?.relations?.includes('children') ? chunks.filter((chunk) => !!chunk.children) : chunks
                )
            }))
        }
        const retriever = new VectorKnowledgeCandidateRetriever(
            knowledgebases as unknown as KnowledgebaseService,
            chunkService as unknown as KnowledgeDocumentChunkService
        )
        const request = {
            knowledgebase: kb,
            query: 'question',
            k: 2,
            modelContext: {},
            scope: { tenantId: 'tenant', organizationId: 'org' },
            preparedFilter: prepareKnowledgeFilter({ knowledgebase: kb, vectorBackend: environment.vectorStore })
        }
        return { retriever, request, store }
    }

    it.each([VectorTypeEnum.PGVECTOR, VectorTypeEnum.MILVUS])(
        'returns original text, deduplicates questions and fills Top K on %s',
        async (backend) => {
            environment.vectorStore = backend
            const f = setup([source('a'), source('b')], [vector('a', 'q1'), vector('a', 'q2'), vector('b')])
            const result = await f.retriever.retrieve(f.request)
            expect(f.store.structuredSimilaritySearchWithScore.mock.calls.map((call) => call[1])).toEqual([2, 4])
            expect(result.candidates.map((item) => item.document.pageContent)).toEqual([
                'Source text a',
                'Source text b'
            ])
        }
    )

    it.each([
        'old-generation',
        'deleted-question',
        'source-changed',
        'disabled',
        'missing-source',
        'failed-generation'
    ])('ignores %s question vectors and still retrieves the original', async (condition) => {
        environment.vectorStore = VectorTypeEnum.PGVECTOR
        const chunk = source('a')
        if (condition === 'deleted-question') chunk.metadata.questionGeneration.questions = []
        if (condition === 'source-changed') chunk.pageContent = 'New source text'
        if (condition === 'disabled') chunk.metadata.enabled = false
        if (condition === 'failed-generation') chunk.metadata.questionGeneration.status = 'failed'
        const f = setup(
            [...(condition === 'missing-source' ? [] : [chunk]), source('b')],
            [vector('a', 'q1', condition === 'old-generation' ? 'old' : 'current'), vector('b')]
        )
        const result = await f.retriever.retrieve(f.request)
        expect(result.candidates.map((item) => item.document.pageContent)).toEqual(['Source text b'])
    })

    it('does not expand ordinary child matches just because they share one parent', async () => {
        environment.vectorStore = VectorTypeEnum.PGVECTOR
        const vectors = Array.from({ length: 10000 }, (_, index) => {
            const match = vector(`child-${index}`)
            match[0].metadata.parentId = 'parent'
            return match
        })
        const f = setup([], vectors)
        await f.retriever.retrieve(f.request)
        expect(f.store.structuredSimilaritySearchWithScore).toHaveBeenCalledTimes(1)
    })

    it('bounds expansion when many question projections map to one source', async () => {
        environment.vectorStore = VectorTypeEnum.PGVECTOR
        const f = setup(
            [source('a')],
            Array.from({ length: 10000 }, () => vector('a', 'q1'))
        )
        const result = await f.retriever.retrieve(f.request)
        expect(f.store.structuredSimilaritySearchWithScore.mock.calls.length).toBeLessThanOrEqual(5)
        expect(result.candidates.map((item) => item.document.pageContent)).toEqual(['Source text a'])
    })

    it('returns parent context when its child question matches', async () => {
        environment.vectorStore = VectorTypeEnum.PGVECTOR
        const child = source('child')
        child.metadata.parentId = 'parent'
        child.metadata.questionGeneration.sourceHash = questionSourceHash(child)
        const parent = Object.assign(new KnowledgeDocumentChunk(), {
            id: 'parent',
            pageContent: 'Full parent context',
            metadata: { chunkId: 'parent' },
            children: [child],
            document: { id: 'doc', disabled: false }
        })
        const match = vector('child', 'q1')
        match[0].metadata.parentId = 'parent'
        const f = setup([parent, child], [match])
        // Simulate the id lookup followed by the parent/children hydration query.
        const result = await f.retriever.retrieve(f.request)
        expect(result.candidates[0].document.pageContent).toBe('Full parent context')
    })
})
