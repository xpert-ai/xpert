import type { LoadedSpreadsheetWorkbook } from '@xpert-ai/server-common'
import { createSpreadsheetFormDocuments, createSpreadsheetRecordDocuments } from './spreadsheet-document'

describe('spreadsheet document parser', () => {
    const workbook: LoadedSpreadsheetWorkbook = {
        sheets: [
            {
                name: 'Cover',
                range: 'A1:B2',
                hidden: false,
                merges: ['A1:B1'],
                cells: [
                    { address: 'A1', row: 1, column: 1, value: 'Technical inquiry' },
                    { address: 'A2', row: 2, column: 1, value: 'Voltage' },
                    { address: 'B2', row: 2, column: 2, value: '400 V' }
                ],
                records: [{ Label: 'Voltage', Value: '400 V' }]
            },
            {
                name: 'Requirements',
                range: 'A1:B2',
                hidden: false,
                merges: [],
                cells: [
                    { address: 'A1', row: 1, column: 1, value: 'Protection' },
                    { address: 'B1', row: 1, column: 2, value: 'IP55' }
                ],
                records: [{ Label: 'Protection', Value: 'IP55' }]
            }
        ]
    }

    it('keeps a form-like workbook in one anchored Markdown chunk when it fits', () => {
        const chunks = createSpreadsheetFormDocuments({
            documentId: 'doc-1',
            documentName: 'contract.xlsx',
            workbook,
            config: {
                interpretation: 'form_document',
                contextUnit: 'workbook',
                maxChunkTokens: 6000,
                preserveMergedCells: true,
                emitCellAnchors: true
            }
        })

        expect(chunks).toHaveLength(1)
        expect(chunks[0].pageContent).toContain('## Worksheet: Cover')
        expect(chunks[0].pageContent).toContain('[B2] 400 V')
        expect(chunks[0].pageContent).toContain('## Worksheet: Requirements')
        expect(chunks[0].metadata).toMatchObject({
            spreadsheetInterpretation: 'form_document',
            spreadsheetSourceUnit: 'workbook',
            sheetNames: ['Cover', 'Requirements']
        })
    })

    it('uses independent row records only when records interpretation is requested', () => {
        const chunks = createSpreadsheetRecordDocuments({
            documentId: 'doc-1',
            workbook,
            config: { interpretation: 'records', contextUnit: 'row' },
            indexedFields: ['Value']
        })

        expect(chunks).toHaveLength(2)
        expect(chunks[0].metadata).toMatchObject({
            spreadsheetInterpretation: 'records',
            sheetName: 'Cover',
            searchContent: '{"Value":"400 V"}'
        })
    })

    it('falls back to worksheet chunks when a workbook exceeds its token budget', () => {
        const largeWorkbook: LoadedSpreadsheetWorkbook = {
            sheets: workbook.sheets.map((sheet) => ({
                ...sheet,
                cells: sheet.cells.map((cell) => ({ ...cell, value: `${cell.value} ${'detail '.repeat(500)}` }))
            }))
        }
        const chunks = createSpreadsheetFormDocuments({
            documentId: 'doc-1',
            documentName: 'contract.xlsx',
            workbook: largeWorkbook,
            config: {
                interpretation: 'form_document',
                contextUnit: 'workbook',
                oversizePolicy: 'sheet',
                maxChunkTokens: 256
            }
        })

        expect(chunks.length).toBeGreaterThan(1)
        expect(chunks.every((chunk) => chunk.metadata.sheetNames.length === 1)).toBe(true)
    })
})
