import { KnowledgeFilterNode } from '@xpert-ai/contracts'
import { KnowledgeFolderOptionsQuery } from '../knowledge-folder-options.query'
import { buildKnowledgeFolderOptions, KnowledgeFolderOptionsHandler } from './knowledge-folder-options.handler'

describe('KnowledgeFolderOptionsHandler', () => {
    it('applies the fixed boundary before returning canonical selectable paths', async () => {
        const knowledgebaseService = {
            findAll: jest.fn().mockResolvedValue({
                items: [{ id: 'kb-1', metadataSchema: [] }]
            }),
            listStructuredFilterFolderCandidates: jest.fn().mockResolvedValue([
                { folderPath: '/水利//华东/', directDocumentCount: 2 },
                { folderPath: '水利/华南', directDocumentCount: 1 }
            ])
        }
        const handler = new KnowledgeFolderOptionsHandler(knowledgebaseService as never)
        const fixedFilter: KnowledgeFilterNode = {
            kind: 'condition',
            field: 'document.folderPath',
            operator: 'under',
            value: { kind: 'variable', selector: 'input.allowedFolder' }
        }

        const result = await handler.execute(
            new KnowledgeFolderOptionsQuery({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                knowledgebaseId: 'kb-1',
                fixedFilter,
                variables: { input: { allowedFolder: '水利' } }
            })
        )

        expect(knowledgebaseService.findAll).toHaveBeenCalledWith({
            where: {
                id: 'kb-1',
                tenantId: 'tenant-1',
                organizationId: 'org-1'
            }
        })
        expect(knowledgebaseService.listStructuredFilterFolderCandidates).toHaveBeenCalledWith(
            'kb-1',
            'tenant-1',
            'org-1',
            expect.objectContaining({
                sql: expect.stringContaining('d."folder"'),
                parameters: ['水利', '水利/%']
            })
        )
        expect(result.items).toEqual([
            {
                folderPath: '',
                name: '/',
                parentPath: null,
                depth: 0,
                directDocumentCount: 0,
                documentCount: 3
            },
            {
                folderPath: '水利',
                name: '水利',
                parentPath: '',
                depth: 1,
                directDocumentCount: 0,
                documentCount: 3
            },
            {
                folderPath: '水利/华东',
                name: '华东',
                parentPath: '水利',
                depth: 2,
                directDocumentCount: 2,
                documentCount: 2
            },
            {
                folderPath: '水利/华南',
                name: '华南',
                parentPath: '水利',
                depth: 2,
                directDocumentCount: 1,
                documentCount: 1
            }
        ])
    })

    it('fails closed when a fixed-filter variable is missing', async () => {
        const knowledgebaseService = {
            findAll: jest.fn().mockResolvedValue({ items: [{ id: 'kb-1', metadataSchema: [] }] }),
            listStructuredFilterFolderCandidates: jest.fn()
        }
        const handler = new KnowledgeFolderOptionsHandler(knowledgebaseService as never)

        await expect(
            handler.execute(
                new KnowledgeFolderOptionsQuery({
                    tenantId: 'tenant-1',
                    organizationId: 'org-1',
                    knowledgebaseId: 'kb-1',
                    fixedFilter: {
                        kind: 'condition',
                        field: 'document.folderPath',
                        operator: 'eq',
                        value: { kind: 'variable', selector: 'input.allowedFolder' }
                    }
                })
            )
        ).rejects.toMatchObject({ code: 'MISSING_VARIABLE' })
        expect(knowledgebaseService.listStructuredFilterFolderCandidates).not.toHaveBeenCalled()
    })

    it('supports case-insensitive search while preserving descendant counts', () => {
        expect(
            buildKnowledgeFolderOptions(
                [
                    { folderPath: 'Engineering/Water/East', directDocumentCount: 2 },
                    { folderPath: 'Engineering/Logistics', directDocumentCount: 3 }
                ],
                'water'
            )
        ).toEqual([
            {
                folderPath: 'Engineering/Water',
                name: 'Water',
                parentPath: 'Engineering',
                depth: 2,
                directDocumentCount: 0,
                documentCount: 2
            },
            {
                folderPath: 'Engineering/Water/East',
                name: 'East',
                parentPath: 'Engineering/Water',
                depth: 3,
                directDocumentCount: 2,
                documentCount: 2
            }
        ])
    })
})
