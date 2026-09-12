import type { LoadedSpreadsheetWorkbook } from '@xpert-ai/server-common'
import i18next from 'i18next'
import {
    createSpreadsheetFormDocuments,
    createSpreadsheetRecordDocuments,
    createSpreadsheetRecordResult
} from './spreadsheet-document'

describe('spreadsheet document parser', () => {
    beforeAll(async () => {
        await i18next.init({ lng: 'en', resources: {} })
    })
    const workbook: LoadedSpreadsheetWorkbook = {
        sheets: [
            {
                index: 0,
                name: 'Cover',
                range: 'A1:B2',
                hidden: false,
                merges: ['A1:B1'],
                cells: [
                    { address: 'A1', row: 1, column: 1, value: 'Technical inquiry' },
                    { address: 'A2', row: 2, column: 1, value: 'Voltage' },
                    { address: 'B2', row: 2, column: 2, value: '400 V' }
                ],
                records: [{ Label: 'Voltage', Value: '400 V' }],
                recordRows: [2],
                headerRow: 1,
                columns: [
                    { columnId: 'A', column: 1, key: 'Label', label: 'Label' },
                    { columnId: 'B', column: 2, key: 'Value', label: 'Value' }
                ]
            },
            {
                index: 1,
                name: 'Requirements',
                range: 'A1:B2',
                hidden: false,
                merges: [],
                cells: [
                    { address: 'A1', row: 1, column: 1, value: 'Protection' },
                    { address: 'B1', row: 1, column: 2, value: 'IP55' }
                ],
                records: [{ Label: 'Protection', Value: 'IP55' }],
                recordRows: [2],
                headerRow: 1,
                columns: [
                    { columnId: 'A', column: 1, key: 'Label', label: 'Label' },
                    { columnId: 'B', column: 2, key: 'Value', label: 'Value' }
                ]
            }
        ]
    }

    it('certifies boolean columns from all rows rather than the ten model samples', () => {
        const copy = structuredClone(workbook)
        copy.sheets = [copy.sheets[0]]
        copy.sheets[0].records = Array.from({ length: 11 }, () => ({ Label: 'flag', Value: true }))
        copy.sheets[0].recordRows = Array.from({ length: 11 }, (_, index) => index + 2)
        const parse = () => createSpreadsheetRecordResult({ workbook: copy, documentId: 'doc' })
        expect(parse().tables[0].columns[1].valueType).toBe('boolean')
        copy.sheets[0].records[10].Value = 'unknown'
        expect(parse().tables[0].columns[1].valueType).toBeUndefined()
    })

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

    it('returns only selected table sources and attaches their stable identities to row chunks', () => {
        const result = createSpreadsheetRecordResult({
            documentId: 'doc-1',
            workbook,
            config: { interpretation: 'records', includeSheets: ['Requirements'] },
            indexedFields: ['Value']
        })
        expect(result.tables).toEqual([
            {
                tableId: 'sheet:1',
                sheetName: 'Requirements',
                range: 'A1:B2',
                headerRow: 1,
                rowCount: 1,
                columns: workbook.sheets[1].columns,
                samples: [{ rowNumber: 2, values: { A: 'Protection', B: 'IP55' } }]
            }
        ])
        expect(result.chunks[0].metadata).toMatchObject({
            tableSource: { tableId: 'sheet:1', rowNumber: 2, range: 'A2:B2' },
            raw: { Label: 'Protection', Value: 'IP55' },
            searchContent: '{"Value":"IP55"}'
        })
        expect(result.chunks[0].metadata).not.toHaveProperty('samples')
    })

    it('rejects stale indexed fields instead of creating an empty retrieval projection', () => {
        expect(() =>
            createSpreadsheetRecordResult({
                documentId: 'doc-1',
                workbook,
                indexedFields: ['PreviousHeader']
            })
        ).toThrow(/PreviousHeader/)
    })

    it('bounds source samples and retains first-sheet visibility behavior independently of record mode', () => {
        const manyRows = {
            sheets: [
                {
                    ...workbook.sheets[0],
                    hidden: true,
                    records: Array.from({ length: 20 }, (_, index) => ({ Label: `Item ${index}`, Value: index })),
                    recordRows: Array.from({ length: 20 }, (_, index) => index + 2)
                }
            ]
        }
        expect(createSpreadsheetRecordResult({ documentId: 'doc', workbook: manyRows }).tables).toEqual([])
        const legacy = createSpreadsheetRecordResult({ documentId: 'doc', workbook: manyRows, legacy: true })
        expect(legacy.tables[0].samples).toHaveLength(10)
        expect(legacy.tables[0].rowCount).toBe(20)
        expect(legacy.chunks).toHaveLength(20)
        expect(legacy.tables[0].samples[0].values).toEqual({ A: 'Item 0', B: 0 })
    })

    it('rejects a selection that would leave a different worksheet with no searchable columns', () => {
        const differentSchemas = {
            sheets: [
                workbook.sheets[0],
                {
                    ...workbook.sheets[1],
                    columns: [{ columnId: 'A', column: 1, key: 'Other', label: 'Other' }],
                    records: [{ Other: 'Data' }]
                }
            ]
        }
        expect(() =>
            createSpreadsheetRecordResult({ documentId: 'doc', workbook: differentSchemas, indexedFields: ['Value'] })
        ).toThrow(/Requirements/)
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
