import { KnowledgeFilterValueOptionsQuery } from '../knowledge-filter-options.query'
import { KnowledgeFilterValueOptionsHandler } from './knowledge-filter-options.handler'

describe('KnowledgeFilterValueOptionsHandler', () => {
    it('resolves registered metadata fields and applies the fixed boundary before listing values', async () => {
        const knowledgebaseService = {
            findAll: jest.fn().mockResolvedValue({
                items: [
                    {
                        id: 'kb-1',
                        metadataSchema: [
                            { key: 'domain', type: 'string', scope: 'document' },
                            { key: 'effectiveYear', type: 'number', scope: 'document' }
                        ]
                    }
                ]
            }),
            listStructuredFilterValueCandidates: jest.fn().mockResolvedValue({
                items: [
                    { value: 2024, documentCount: 2, chunkCount: 8 },
                    { value: 2025, documentCount: 5, chunkCount: 20 }
                ],
                total: 2,
                statistics: {
                    eligibleDocumentCount: 7,
                    eligibleChunkCount: 28,
                    existingDocumentCount: 7,
                    existingChunkCount: 28,
                    min: 2024,
                    max: 2025
                }
            })
        }
        const handler = new KnowledgeFilterValueOptionsHandler(knowledgebaseService as never)

        const result = await handler.execute(
            new KnowledgeFilterValueOptionsQuery({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                knowledgebaseId: 'kb-1',
                field: 'metadata.effectiveYear',
                fixedFilter: {
                    kind: 'condition',
                    field: 'metadata.domain',
                    operator: 'eq',
                    value: { kind: 'literal', value: '水利' }
                },
                limit: 20,
                offset: 0
            })
        )

        expect(knowledgebaseService.listStructuredFilterValueCandidates).toHaveBeenCalledWith(
            'kb-1',
            'tenant-1',
            'org-1',
            expect.objectContaining({ parameters: ['domain', '水利'] }),
            expect.objectContaining({
                field: 'metadata.effectiveYear',
                metadataKey: 'effectiveYear',
                scope: 'documentMetadata'
            }),
            { search: undefined, allowedValues: undefined, limit: 20, offset: 0 }
        )
        expect(result).toEqual(
            expect.objectContaining({
                field: 'metadata.effectiveYear',
                fieldType: 'number',
                optionKind: 'rangeValues',
                items: expect.arrayContaining([expect.objectContaining({ value: 2025 })]),
                statistics: expect.objectContaining({ min: 2024, max: 2025 })
            })
        )
    })

    it('rejects unregistered fields before querying values', async () => {
        const knowledgebaseService = {
            findAll: jest.fn().mockResolvedValue({ items: [{ id: 'kb-1', metadataSchema: [] }] }),
            listStructuredFilterValueCandidates: jest.fn()
        }
        const handler = new KnowledgeFilterValueOptionsHandler(knowledgebaseService as never)

        await expect(
            handler.execute(
                new KnowledgeFilterValueOptionsQuery({
                    tenantId: 'tenant-1',
                    organizationId: 'org-1',
                    knowledgebaseId: 'kb-1',
                    field: 'metadata.secret'
                })
            )
        ).rejects.toThrow("Filter options are not available for field 'metadata.secret'.")
        expect(knowledgebaseService.listStructuredFilterValueCandidates).not.toHaveBeenCalled()
    })
})
