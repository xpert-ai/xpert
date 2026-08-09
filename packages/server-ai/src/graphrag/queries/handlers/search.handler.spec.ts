import { KnowledgebaseTypeEnum } from '@xpert-ai/contracts'
import { KnowledgeGraphFilterScopeService } from '../../../knowledgebase/filter'
import { KnowledgebaseService } from '../../../knowledgebase/knowledgebase.service'
import { KnowledgeGraphSearchQuery } from '../knowledge-graph-search.query'
import { KnowledgeGraphSearchHandler } from './search.handler'

function enabledKnowledgebase() {
    return {
        id: 'kb-1',
        name: 'Graph KB',
        type: KnowledgebaseTypeEnum.Standard,
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        graphRag: { enabled: true }
    }
}

describe('KnowledgeGraphSearchHandler', () => {
    it('progressively scans global entity vectors and returns only filter-scoped graph chunks', async () => {
        const candidates = [
            ['outside-1', 0.05],
            ['outside-2', 0.08],
            ['outside-3', 0.1],
            ['outside-4', 0.12],
            ['eligible-1', 0.15]
        ] as const
        const vectorStore = {
            similaritySearchWithScore: jest.fn(async (_query: string, take: number) =>
                candidates
                    .slice(0, take)
                    .map(([entityId, distance]) => [
                        { pageContent: entityId, metadata: { graphEntityId: entityId } },
                        distance
                    ])
            )
        }
        const knowledgebaseService = {
            getGraphEntityVectorStore: jest.fn(async () => vectorStore)
        }
        const graphFilterScopeService = {
            filterSeedEntities: jest.fn(async (ids: string[]) => ids.filter((id) => id === 'eligible-1')),
            expandEligibleSubgraph: jest.fn(async () => ({
                entityIds: ['eligible-1', 'eligible-2'],
                relations: [
                    {
                        id: 'relation-1',
                        sourceEntityId: 'eligible-1',
                        targetEntityId: 'eligible-2',
                        type: 'SUPPLIES'
                    }
                ],
                truncated: false
            })),
            resolveEligibleGraphChunks: jest.fn(async () => ({
                chunks: [
                    {
                        chunkRowId: 'row-1',
                        chunkId: 'chunk-1',
                        documentId: 'doc-1',
                        pageContent: 'Scoped graph evidence',
                        metadata: { enabled: true },
                        documentName: 'water.pdf',
                        graphScore: 0.85,
                        matchedEntityIds: ['eligible-1'],
                        matchedRelationIds: ['relation-1']
                    }
                ],
                candidateDocumentCount: 1,
                candidateChunkCount: 1,
                eligibleMentionCount: 2,
                truncated: false
            }))
        }
        const handler = new KnowledgeGraphSearchHandler(
            knowledgebaseService as unknown as KnowledgebaseService,
            graphFilterScopeService as unknown as KnowledgeGraphFilterScopeService
        )

        const result = await handler.execute(
            new KnowledgeGraphSearchQuery({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                knowledgebase: enabledKnowledgebase(),
                query: 'GOODSPRINGS',
                retrieval: { entityTopK: 1, neighborHops: 1 },
                filterScope: {
                    tenantId: 'tenant-1',
                    organizationId: 'org-1',
                    knowledgebaseId: 'kb-1',
                    compiledPostgres: { sql: 'd."folder" = $1', parameters: ['水利'] },
                    filterStatus: 'applied'
                }
            })
        )

        expect(vectorStore.similaritySearchWithScore.mock.calls.map((call) => call[1])).toEqual([4, 8])
        expect(graphFilterScopeService.filterSeedEntities).toHaveBeenCalledTimes(2)
        expect(result.docs).toEqual([
            expect.objectContaining({
                pageContent: 'Scoped graph evidence',
                metadata: expect.objectContaining({
                    chunkId: 'chunk-1',
                    matchedEntities: ['eligible-1'],
                    graphScore: 0.85
                })
            })
        ])
        expect(result.diagnostics).toMatchObject({
            graphCandidateScanRounds: 2,
            eligibleSeedEntityCount: 1,
            eligibleRelationCount: 1,
            eligibleMentionCount: 2,
            graphCandidateChunkCount: 1
        })
    })
})
