import { QueryBus } from '@nestjs/cqrs'
import { KnowledgeGraphStatus } from '@xpert-ai/contracts'
import { KnowledgeGraphEntitySearchQuery, KnowledgeGraphViewQuery } from '../../../graphrag/queries'
import { KnowledgebaseService } from '../../knowledgebase.service'
import { KnowledgeGraphFilterScopeService } from '../../filter'
import { KnowledgeGraphExploreQuery } from '../knowledge-graph-explore.query'
import { KnowledgeGraphExploreHandler } from './knowledge-graph-explore.handler'

const knowledgebase = {
    id: 'kb-1',
    name: '工程知识库',
    graphRag: { enabled: true },
    graphStatus: KnowledgeGraphStatus.READY,
    metadataSchema: [{ key: 'domain', type: 'string' as const, scope: 'document' as const }]
}

const fixedFilter = {
    kind: 'condition' as const,
    field: 'metadata.domain',
    operator: 'eq' as const,
    value: { kind: 'literal' as const, value: '水利' }
}

function createHandler(queryResult: unknown, evidence: unknown[]) {
    const knowledgebaseService = {
        findAll: jest.fn().mockResolvedValue({ items: [knowledgebase] }),
        listStructuredGraphEvidence: jest.fn().mockResolvedValue(evidence)
    }
    const graphFilterScopeService = {
        filterSeedEntities: jest.fn(async (ids: string[]) => ids),
        expandEligibleSubgraph: jest.fn(async () => ({
            entityIds: ['e1', 'e2', 'e3'],
            relations: [
                { id: 'r1', sourceEntityId: 'e1', targetEntityId: 'e2', type: 'SUPPLIED_BY' },
                { id: 'r2', sourceEntityId: 'e1', targetEntityId: 'e3', type: 'SUPPLIED_BY' }
            ],
            truncated: false
        }))
    }
    const queryBus = { execute: jest.fn().mockResolvedValue(queryResult) }
    return {
        handler: new KnowledgeGraphExploreHandler(
            knowledgebaseService as unknown as KnowledgebaseService,
            graphFilterScopeService as unknown as KnowledgeGraphFilterScopeService,
            queryBus as unknown as QueryBus
        ),
        knowledgebaseService,
        queryBus
    }
}

describe('KnowledgeGraphExploreHandler', () => {
    it('returns only semantic entity candidates backed by chunks inside the fixed boundary', async () => {
        const { handler, knowledgebaseService, queryBus } = createHandler(
            [
                {
                    entity: {
                        id: 'entity-allowed',
                        name: 'GOODSPRINGS',
                        type: 'company',
                        description: 'Global description must not cross a fixed boundary',
                        summary: 'Global summary must not cross a fixed boundary'
                    },
                    score: 0.94
                },
                {
                    entity: { id: 'entity-outside', name: 'Outside', type: 'company' },
                    score: 0.91
                }
            ],
            [
                {
                    entityId: 'entity-allowed',
                    relationId: null,
                    documentId: 'doc-1',
                    chunkId: 'chunk-1',
                    quote: 'GOODSPRINGS 提供泵站设备。',
                    confidence: 0.9,
                    documentName: '水利设备.pdf',
                    folderPath: '水利/华东'
                }
            ]
        )

        const result = await handler.execute(
            new KnowledgeGraphExploreQuery({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                knowledgebaseId: 'kb-1',
                action: 'search',
                query: '泵站供应商',
                xpertId: 'xpert-1',
                threadId: 'thread-1',
                filters: { fixed: fixedFilter }
            })
        )

        expect(queryBus.execute).toHaveBeenCalledWith(expect.any(KnowledgeGraphEntitySearchQuery))
        const entitySearchQuery = queryBus.execute.mock.calls[0]?.[0]
        expect(entitySearchQuery).toBeInstanceOf(KnowledgeGraphEntitySearchQuery)
        if (!(entitySearchQuery instanceof KnowledgeGraphEntitySearchQuery)) {
            throw new Error('Expected knowledge graph entity search query')
        }
        expect(entitySearchQuery.input).toEqual(expect.objectContaining({ xpertId: 'xpert-1', threadId: 'thread-1' }))
        expect(knowledgebaseService.listStructuredGraphEvidence).toHaveBeenCalledWith(
            'kb-1',
            'tenant-1',
            'org-1',
            expect.objectContaining({ parameters: ['domain', '水利'] }),
            expect.objectContaining({ entityIds: ['entity-allowed', 'entity-outside'] })
        )
        if (result.action !== 'search') throw new Error('Expected graph search result')
        expect(result.entities).toEqual([
            expect.objectContaining({
                id: 'entity-allowed',
                name: 'GOODSPRINGS',
                sampleEvidence: [expect.objectContaining({ chunkId: 'chunk-1' })]
            })
        ])
        expect(result.entities[0]).not.toHaveProperty('description')
        expect(result.entities[0]).not.toHaveProperty('summary')
        expect(result.retrievalHints.suggestedRetrievalQuery).toContain('GOODSPRINGS')
    })

    it('keeps only neighbors and relations with evidence inside the fixed boundary', async () => {
        const { handler, queryBus } = createHandler(
            {
                visualization: {
                    nodes: [
                        { id: 'e1', name: '泵站', type: 'facility' },
                        { id: 'e2', name: 'GOODSPRINGS', type: 'company' },
                        { id: 'e3', name: '无关公司', type: 'company' }
                    ],
                    edges: [
                        { id: 'r1', source: 'e1', target: 'e2', type: 'SUPPLIED_BY' },
                        { id: 'r2', source: 'e1', target: 'e3', type: 'SUPPLIED_BY' }
                    ],
                    totalNodes: 3,
                    totalEdges: 2
                }
            },
            [
                { entityId: 'e1', documentId: 'd1', chunkId: 'c1', folderPath: '水利' },
                { entityId: 'e2', documentId: 'd1', chunkId: 'c1', folderPath: '水利' },
                {
                    relationId: 'r1',
                    documentId: 'd1',
                    chunkId: 'c1',
                    quote: '泵站由 GOODSPRINGS 供货',
                    folderPath: '水利'
                }
            ]
        )

        const result = await handler.execute(
            new KnowledgeGraphExploreQuery({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                knowledgebaseId: 'kb-1',
                action: 'neighbors',
                entityId: 'e1',
                query: '谁供应泵站设备',
                depth: 2,
                filters: { fixed: fixedFilter }
            })
        )

        expect(queryBus.execute).toHaveBeenCalledWith(expect.any(KnowledgeGraphViewQuery))
        if (result.action !== 'neighbors') throw new Error('Expected graph neighbors result')
        expect(result.nodes.map(({ id }) => id)).toEqual(['e1', 'e2'])
        expect(result.edges).toEqual([
            expect.objectContaining({ id: 'r1', sourceEntityId: 'e1', targetEntityId: 'e2' })
        ])
        expect(result.retrievalHints.terms).toEqual(['泵站', 'GOODSPRINGS'])
        expect(result.retrievalHints.suggestedRetrievalQuery).toBe('谁供应泵站设备 泵站 GOODSPRINGS')
    })

    it('fails closed before graph exploration when a fixed variable is missing', async () => {
        const { handler, queryBus, knowledgebaseService } = createHandler([], [])

        await expect(
            handler.execute(
                new KnowledgeGraphExploreQuery({
                    tenantId: 'tenant-1',
                    organizationId: 'org-1',
                    knowledgebaseId: 'kb-1',
                    action: 'search',
                    query: '泵站',
                    filters: {
                        fixed: {
                            kind: 'condition',
                            field: 'metadata.domain',
                            operator: 'eq',
                            value: { kind: 'variable', selector: 'input.domain' }
                        }
                    }
                })
            )
        ).rejects.toThrow("Required fixed-filter variable 'input.domain' is missing")
        expect(queryBus.execute).not.toHaveBeenCalled()
        expect(knowledgebaseService.listStructuredGraphEvidence).not.toHaveBeenCalled()
    })
})
