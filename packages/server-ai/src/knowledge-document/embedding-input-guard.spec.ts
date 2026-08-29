import { Document } from '@langchain/core/documents'
import {
    conservativeEmbeddingTokenCount,
    guardEmbeddingInputDocuments,
    resolveEmbeddingInputBudget
} from './embedding-input-guard'

describe('embedding input guard', () => {
    it('splits an oversized spreadsheet-style chunk into deterministic safe parts', () => {
        const source = new Document({
            pageContent: Array.from(
                { length: 80 },
                (_, index) => `- Row ${index + 1}: [A${index + 1}] ${'84350022-01A-R '.repeat(8)}\n`
            ).join(''),
            metadata: { chunkId: 'bom-sheet-1', spreadsheetInterpretation: 'form_document' }
        })

        const guarded = guardEmbeddingInputDocuments([source], 256)
        const budget = resolveEmbeddingInputBudget(256)

        expect(guarded.length).toBeGreaterThan(1)
        expect(guarded.every((chunk) => conservativeEmbeddingTokenCount(chunk.pageContent) <= budget)).toBe(true)
        expect(guarded.map((chunk) => chunk.metadata.chunkId)).toEqual(
            guarded.map((_, index) => `bom-sheet-1::embedding-part:${index + 1}`)
        )
        expect(guarded.every((chunk) => chunk.metadata.embeddingSplitCount === guarded.length)).toBe(true)
    })

    it('does not split a hierarchy parent that is not embedded', () => {
        const parent = new Document({ pageContent: 'P'.repeat(1000), metadata: { chunkId: 'parent-1' } })
        const child = new Document({ pageContent: 'child', metadata: { chunkId: 'child-1', parentId: 'parent-1' } })

        expect(guardEmbeddingInputDocuments([parent, child], 128)[0]).toBe(parent)
    })
})
