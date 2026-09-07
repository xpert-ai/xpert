import { IKnowledgebase, KnowledgeRetrievalContentScope, VectorTypeEnum } from '@xpert-ai/contracts'
import { environment } from '@xpert-ai/server-config'
import { KnowledgeDocumentChunkService } from '../../knowledge-document/chunk/chunk.service'
import { KnowledgebaseService } from '../knowledgebase.service'
import { prepareKnowledgeFilter } from '../filter'
import { milvusContentScopePredicate, postgresContentScopePredicate } from './content-scope'
import { VectorKnowledgeCandidateRetriever } from './vector-knowledge-candidate.retriever'
import { KnowledgeRetrievalRequest } from './types'

describe('Vector retrieval content scope', () => {
    const originalBackend = environment.vectorStore
    afterEach(() => {
        environment.vectorStore = originalBackend
    })

    function setup(contentScope: KnowledgeRetrievalContentScope, filtered = false) {
        const kb = { id: 'kb-1', name: 'Test', recall: { topK: 1 } } as IKnowledgebase
        const search = jest.fn(async () => ({ items: [] }))
        const counts = jest.fn(async () => ({ candidateDocumentCount: 0, candidateChunkCount: 0 }))
        const service = {
            getActiveVectorStore: jest.fn(async () => ({ structuredSimilaritySearchWithScore: search })),
            countStructuredFilterCandidates: counts
        }
        const retriever = new VectorKnowledgeCandidateRetriever(
            service as unknown as KnowledgebaseService,
            { findAll: jest.fn(async () => ({ items: [] })) } as unknown as KnowledgeDocumentChunkService
        )
        const request: KnowledgeRetrievalRequest = {
            knowledgebase: kb,
            query: 'query',
            k: 1,
            contentScope,
            scope: { tenantId: 'tenant-1', organizationId: 'org-1' },
            modelContext: {},
            preparedFilter: prepareKnowledgeFilter({
                knowledgebase: kb,
                vectorBackend: environment.vectorStore,
                filters: filtered
                    ? {
                          request: {
                              kind: 'condition',
                              field: 'document.fileExtension',
                              operator: 'eq',
                              value: { kind: 'literal', value: 'pdf' }
                          }
                      }
                    : undefined
            })
        }
        return { retriever, request, search, counts }
    }

    it.each(['wiki', 'original'] as const)(
        'constrains PostgreSQL candidates before vector Top K for %s',
        async (scope) => {
            environment.vectorStore = VectorTypeEnum.PGVECTOR
            const { retriever, request, search } = setup(scope)
            await retriever.retrieve(request)
            expect(search).toHaveBeenCalledWith('query', 1, {
                postgres: {
                    sql: `(TRUE) AND (${postgresContentScopePredicate(scope)})`,
                    parameters: [],
                    knowledgebaseId: 'kb-1'
                }
            })
        }
    )

    it('combines original-only scope with existing filters without replacing their parameters', async () => {
        environment.vectorStore = VectorTypeEnum.PGVECTOR
        const { retriever, request, search } = setup('original', true)
        await retriever.retrieve(request)
        expect(search).toHaveBeenCalledWith('query', 1, {
            postgres: expect.objectContaining({
                sql: expect.stringContaining(postgresContentScopePredicate('original')),
                parameters: ['pdf']
            })
        })
    })

    it.each(['wiki', 'original'] as const)('constrains Milvus search and relational counts for %s', async (scope) => {
        environment.vectorStore = VectorTypeEnum.MILVUS
        const { retriever, request, search, counts } = setup(scope)
        await retriever.retrieve(request)
        expect(search).toHaveBeenCalledWith('query', 1, {
            milvus: {
                expression: `enabled == true and filterAttributes["document"]["disabled"] == false and (${milvusContentScopePredicate(scope)})`,
                values: {}
            }
        })
        expect(counts).toHaveBeenCalledWith('kb-1', {
            sql: `(TRUE) AND (${postgresContentScopePredicate(scope)})`,
            parameters: []
        })
    })

    it('uses the contentKind discriminator and includes missing legacy values for original-only scope', () => {
        expect(postgresContentScopePredicate('original')).toBe(`c."metadata" ->> 'contentKind' IS DISTINCT FROM 'wiki'`)
        expect(milvusContentScopePredicate('original')).toBe(
            '(not exists filterAttributes["chunkMetadata"]["contentKind"]) or filterAttributes["chunkMetadata"]["contentKind"] != "wiki"'
        )
        expect(postgresContentScopePredicate('all')).toBe('TRUE')
        expect(milvusContentScopePredicate('all')).toBe('')
    })
})
