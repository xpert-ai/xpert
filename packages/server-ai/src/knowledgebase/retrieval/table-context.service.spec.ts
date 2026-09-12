import { DocumentInterface } from '@langchain/core/documents'
import { DocumentMetadata, IKnowledgebase, IKnowledgeDocument, KnowledgeTableMetadata } from '@xpert-ai/contracts'
import { tableMetadataInputHash } from '../../knowledge-document/tables/table-metadata-input-hash'
import { KnowledgeTableContextService, tableContextText } from './table-context.service'
import { KBDocumentCategoryEnum } from '@xpert-ai/contracts'

const state: KnowledgeTableMetadata = {
    schemaVersion: 1,
    status: 'ready',
    inputHash: tableMetadataInputHash(
        {
            category: KBDocumentCategoryEnum.Sheet,
            type: 'xlsx',
            filePath: 'orders.xlsx',
            parserConfig: {},
            sourceConfig: null
        } as IKnowledgeDocument,
        {} as IKnowledgebase
    ),
    generationId: 'generation',
    resultHash: 'result',
    appliedResultHash: 'result',
    updatedAt: '2026-09-11T00:00:00Z',
    tables: [
        {
            tableId: 'sheet:0',
            sheetName: 'Orders',
            range: 'A1:B2',
            headerRow: 1,
            rowCount: 1,
            summary: 'Sales orders',
            columns: [
                { columnId: 'A', column: 1, key: 'amount', label: 'amount', description: 'Order amount', unit: 'CNY' }
            ]
        }
    ]
}

function chunk(): DocumentInterface<DocumentMetadata> {
    return {
        pageContent: '{"amount":10}',
        metadata: {
            documentId: 'doc',
            chunkId: 'row',
            tableSource: { tableId: 'sheet:0', rowNumber: 2 },
            tableMetadataResultHash: 'result'
        }
    }
}

function harness(metadata: unknown = state, parserConfig: IKnowledgeDocument['parserConfig'] = {}) {
    const kb = { id: 'kb', tenantId: 'tenant', organizationId: 'org' } as IKnowledgebase
    const find = jest.fn(async (_options: object) => [
        {
            id: 'doc',
            metadata: { tableMetadata: metadata },
            category: KBDocumentCategoryEnum.Sheet,
            type: 'xlsx',
            filePath: 'orders.xlsx',
            parserConfig,
            sourceConfig: null,
            knowledgebase: kb
        }
    ])
    const service = new KnowledgeTableContextService({ find })
    return { service, find, kb }
}

describe('table metadata retrieval context', () => {
    it('hydrates scoped current results without changing source content or identities', async () => {
        const { service, find, kb } = harness()
        const result = await service.hydrate(kb, [chunk()])
        expect(result[0].pageContent).toBe('{"amount":10}')
        expect(result[0].metadata.tableContext?.summary).toBe('Sales orders')
        expect(result[0].metadata.chunkId).toBe('row')
        expect(find).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({ knowledgebaseId: 'kb', tenantId: 'tenant', organizationId: 'org' })
            })
        )
        expect(tableContextText(result[0])).toContain('Order amount')
    })

    it.each([
        { ...state, status: 'generated' },
        { ...state, appliedResultHash: 'old' },
        { ...state, resultHash: 'new', appliedResultHash: 'new' },
        { ...state, tables: [{ columns: 'invalid' }] }
    ])('does not attach an unapplied, stale, or corrupt result', async (metadata) => {
        const { service, kb } = harness(metadata)
        const result = await service.hydrate(kb, [chunk()])
        expect(result[0].metadata.tableContext).toBeUndefined()
    })

    it('does not query ordinary documents and removes preexisting retrieval context', async () => {
        const { service, find, kb } = harness()
        const input = chunk()
        delete input.metadata.tableSource
        const result = await service.hydrate(kb, [input])
        expect(find).not.toHaveBeenCalled()
        expect(result[0].metadata.tableContext).toBeUndefined()
    })

    it('invalidates published context when parser requirements change before reprocessing', async () => {
        const { service, kb } = harness(state, { tableMetadataRequirements: 'New business guidance' })
        expect((await service.hydrate(kb, [chunk()]))[0].metadata.tableContext).toBeUndefined()
    })
})
