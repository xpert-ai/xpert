import { IDocChunkMetadata, KnowledgeTableMetadata } from '@xpert-ai/contracts'
import {
    protectTableChunkMetadata,
    withoutGeneratedTableMetadata,
    writePublicDocumentMetadata
} from './table-metadata-input'

const state: KnowledgeTableMetadata = {
    schemaVersion: 1,
    status: 'ready',
    generationId: 'g',
    inputHash: 'i',
    resultHash: 'r',
    updatedAt: '2026-09-11',
    tables: []
}

describe('server-owned table metadata', () => {
    it('drops supplied generated results without dropping source metadata', () => {
        expect(withoutGeneratedTableMetadata({ source: 'file', tableMetadata: state })).toEqual({ source: 'file' })
    })

    it('updates public metadata with parameters and preserves the current server JSON key atomically', async () => {
        const query = jest.fn(async (_sql: string, _values: unknown[]) => undefined)
        await writePublicDocumentMetadata({ query }, 'doc', { source: "user's file", tableMetadata: state })
        expect(query).toHaveBeenCalledWith(expect.stringContaining('"metadata" -> \'tableMetadata\''), [
            'doc',
            JSON.stringify({ source: "user's file" })
        ])
    })

    it('prevents pointer spoofing and clears obsolete search text when row content changes', () => {
        const stored: IDocChunkMetadata = {
            chunkId: 'c',
            tableSource: { tableId: 'real', rowNumber: 2 },
            tableMetadataResultHash: 'r',
            searchContent: 'old projected row'
        }
        const input: IDocChunkMetadata = { ...stored, tableSource: { tableId: 'spoofed', rowNumber: 1 } }
        protectTableChunkMetadata(input, stored, true)
        expect(input.tableSource).toEqual(stored.tableSource)
        expect(input.tableMetadataResultHash).toBeUndefined()
        expect(input.searchContent).toBeUndefined()
    })
})
