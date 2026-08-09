import { KnowledgebaseService } from './knowledgebase.service'

describe('KnowledgebaseService filter option SQL', () => {
    it('binds fixed values and search text while using only a registered document column', async () => {
        const query = jest.fn().mockResolvedValue([
            {
                items: [{ value: 'pdf', documentCount: 2, chunkCount: 8 }],
                total: 1,
                eligibleDocumentCount: 3,
                eligibleChunkCount: 10,
                existingDocumentCount: 3,
                existingChunkCount: 10
            }
        ])
        const service = Object.create(KnowledgebaseService.prototype) as KnowledgebaseService
        Object.defineProperty(service, 'dataSource', { value: { query } })

        const result = await service.listStructuredFilterValueCandidates(
            'kb-1',
            'tenant-1',
            'org-1',
            { sql: 'd."category" = $1', parameters: ['text'] },
            {
                field: 'document.fileExtension',
                type: 'string',
                scope: 'document',
                column: 'type',
                operators: ['eq', 'contains'],
                agentVisible: true
            },
            { search: "%_' OR TRUE --", limit: 20, offset: 0 }
        )

        const [sql, parameters] = query.mock.calls[0]
        expect(sql).toContain('to_jsonb(d."type")')
        expect(sql).toContain('d."category" = $4')
        expect(sql).not.toContain('OR TRUE --')
        expect(parameters).toEqual(['tenant-1', 'org-1', 'kb-1', 'text', "%\\%\\_' OR TRUE --%", 20, 0])
        expect(result.items).toEqual([{ value: 'pdf', documentCount: 2, chunkCount: 8 }])
    })

    it('binds chunk metadata keys and expands array members', async () => {
        const query = jest.fn().mockResolvedValue([
            {
                items: [{ value: '概算', documentCount: 1, chunkCount: 3 }],
                total: 1,
                eligibleDocumentCount: 1,
                eligibleChunkCount: 3,
                existingDocumentCount: 1,
                existingChunkCount: 3
            }
        ])
        const service = Object.create(KnowledgebaseService.prototype) as KnowledgebaseService
        Object.defineProperty(service, 'dataSource', { value: { query } })

        await service.listStructuredFilterValueCandidates(
            'kb-1',
            'tenant-1',
            'org-1',
            { sql: 'TRUE', parameters: [] },
            {
                field: 'chunk.metadata.specialties',
                type: 'string[]',
                scope: 'chunkMetadata',
                metadataKey: 'specialties"] OR TRUE --',
                operators: ['containsAny'],
                agentVisible: true
            },
            { limit: 50, offset: 0 }
        )

        const [sql, parameters] = query.mock.calls[0]
        expect(sql).toContain('c."metadata"::jsonb -> $4')
        expect(sql).toContain('jsonb_array_elements')
        expect(sql).not.toContain('specialties"] OR TRUE --')
        expect(parameters).toEqual(['tenant-1', 'org-1', 'kb-1', 'specialties"] OR TRUE --', 50, 0])
    })

    it('binds graph identifiers and shifts fixed-filter parameters without interpolating user input', async () => {
        const query = jest.fn().mockResolvedValue([
            {
                entityId: "entity-1' OR TRUE --",
                relationId: null,
                documentId: 'doc-1',
                chunkId: 'chunk-1',
                quote: '泵站证据',
                confidence: '0.91',
                documentName: '水利手册.pdf',
                folderPath: '水利/华东'
            }
        ])
        const service = Object.create(KnowledgebaseService.prototype) as KnowledgebaseService
        Object.defineProperty(service, 'dataSource', { value: { query } })

        const result = await service.listStructuredGraphEvidence(
            'kb-1',
            'tenant-1',
            'org-1',
            { sql: 'd."category" = $1', parameters: ['text'] },
            { entityIds: ["entity-1' OR TRUE --"], take: 500 }
        )

        const [sql, parameters] = query.mock.calls[0]
        expect(sql).toContain('gm."entityId" = ANY($4)')
        expect(sql).toContain('d."category" = $5')
        expect(sql).toContain('LIMIT $6')
        expect(sql).not.toContain("entity-1' OR TRUE --")
        expect(parameters).toEqual(['tenant-1', 'org-1', 'kb-1', ["entity-1' OR TRUE --"], 'text', 200])
        expect(result).toEqual([
            expect.objectContaining({
                entityId: "entity-1' OR TRUE --",
                confidence: 0.91,
                folderPath: '水利/华东'
            })
        ])
    })
})
