import { DataSource } from 'typeorm'
import { KnowledgeGraphFilterScope } from './knowledge-graph-filter-scope'
import { KnowledgeGraphFilterScopeService } from './knowledge-graph-filter-scope.service'

const scope: KnowledgeGraphFilterScope = {
    tenantId: 'tenant-1',
    organizationId: 'org-1',
    knowledgebaseId: 'kb-1',
    compiledPostgres: {
        sql: `(d."folder" = $1 AND (c."metadata"::jsonb -> $2 #>> '{}') = $3)`,
        parameters: ["水利/%' OR TRUE --", 'effective', true]
    },
    filterStatus: 'applied',
    filterHash: 'filter-hash'
}

describe('KnowledgeGraphFilterScopeService', () => {
    it('gates seed entities through the same document and chunk row with bound filter parameters', async () => {
        const query = jest.fn(async (_sql: string, _parameters?: unknown[]) => [{ entityId: 'entity-allowed' }])
        const dataSource = { query }
        const service = new KnowledgeGraphFilterScopeService(dataSource as unknown as DataSource)

        const result = await service.filterSeedEntities(['entity-outside', 'entity-allowed'], scope)

        expect(result).toEqual(['entity-allowed'])
        const [sql, parameters] = query.mock.calls[0]
        expect(sql).toContain('INNER JOIN "knowledge_document" d')
        expect(sql).toContain('INNER JOIN "knowledge_document_chunk" c')
        expect(sql).toContain('d."folder" = $5')
        expect(sql).toContain('c."metadata"::jsonb -> $6 #>> \'{}\'')
        expect(sql).not.toContain("水利/%' OR TRUE --")
        expect(parameters).toEqual([
            'tenant-1',
            'org-1',
            'kb-1',
            ['entity-outside', 'entity-allowed'],
            "水利/%' OR TRUE --",
            'effective',
            true
        ])
    })

    it('expands only active relations that have eligible evidence and respects graph caps', async () => {
        const query = jest.fn(async (_sql: string, _parameters?: unknown[]) => [
            {
                id: 'relation-1',
                sourceEntityId: 'entity-1',
                targetEntityId: 'entity-2',
                type: 'SUPPLIED_BY',
                weight: '0.8'
            }
        ])
        const dataSource = { query }
        const service = new KnowledgeGraphFilterScopeService(dataSource as unknown as DataSource)

        const result = await service.expandEligibleSubgraph(['entity-1'], 1, scope, {
            maxEntities: 10,
            maxRelations: 10
        })

        expect(result).toEqual({
            entityIds: ['entity-1', 'entity-2'],
            relations: [
                {
                    id: 'relation-1',
                    sourceEntityId: 'entity-1',
                    targetEntityId: 'entity-2',
                    type: 'SUPPLIED_BY',
                    weight: 0.8
                }
            ],
            truncated: false
        })
        const [sql] = query.mock.calls[0]
        expect(sql).toContain('AND EXISTS (')
        expect(sql).toContain('gm."relationId" = r."id"')
        expect(sql).toContain('(source_entity."visibility" = \'active\'')
        expect(sql).toContain('(target_entity."visibility" = \'active\'')
    })

    it('returns bounded filtered chunks and graph diagnostics without building ID lists into SQL', async () => {
        const query = jest.fn(async (_sql: string, _parameters?: unknown[]) => [
            {
                items: [
                    {
                        chunkRowId: 'row-1',
                        chunkId: 'chunk-1',
                        documentId: 'doc-1',
                        pageContent: 'GOODSPRINGS supplies the station.',
                        metadata: { enabled: true },
                        documentName: 'quote.pdf',
                        graphScore: 0.81,
                        matchedEntityIds: ['entity-1'],
                        matchedRelationIds: ['relation-1']
                    }
                ],
                candidateDocumentCount: '1',
                candidateChunkCount: '1',
                eligibleMentionCount: '2'
            }
        ])
        const dataSource = { query }
        const service = new KnowledgeGraphFilterScopeService(dataSource as unknown as DataSource)

        const result = await service.resolveEligibleGraphChunks({
            scope,
            entityIds: ['entity-1'],
            relationIds: ['relation-1'],
            seedScores: [{ entityId: 'entity-1', score: 0.9 }],
            topK: 5
        })

        expect(result).toMatchObject({
            candidateDocumentCount: 1,
            candidateChunkCount: 1,
            eligibleMentionCount: 2,
            chunks: [expect.objectContaining({ chunkId: 'chunk-1', graphScore: 0.81 })]
        })
        const [sql, parameters] = query.mock.calls[0]
        expect(sql).toContain('COALESCE(seed_scores.score, 0.5) * COALESCE(gm."confidence", 1)')
        expect(sql).toContain('LIMIT 2001')
        expect(sql).toContain('LIMIT $11')
        expect(sql).not.toContain('entity-1')
        expect(parameters).toEqual([
            'tenant-1',
            'org-1',
            'kb-1',
            ['entity-1'],
            ['relation-1'],
            ['entity-1'],
            [0.9],
            "水利/%' OR TRUE --",
            'effective',
            true,
            5
        ])
    })
})
