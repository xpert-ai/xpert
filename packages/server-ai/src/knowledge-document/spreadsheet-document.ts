import { Document } from '@langchain/core/documents'
import type { DocumentSpreadsheetParserConfig, KnowledgeTableSource } from '@xpert-ai/contracts'
import { countTokensSafe } from '@xpert-ai/plugin-sdk'
import type { LoadedSpreadsheetSheet, LoadedSpreadsheetWorkbook } from '@xpert-ai/server-common'
import { v4 as uuid } from 'uuid'
import { invalidKnowledgeTableIndexedFields } from './parser-validation'

const DEFAULT_MAX_CHUNK_TOKENS = 6000
const MIN_MAX_CHUNK_TOKENS = 256
const MAX_MAX_CHUNK_TOKENS = 32000

export function createSpreadsheetFormDocuments(input: {
    documentId: string
    documentName: string
    workbook: LoadedSpreadsheetWorkbook
    config?: DocumentSpreadsheetParserConfig
}): Document[] {
    const config = input.config ?? {}
    const sheets = selectSheets(input.workbook.sheets, config)
    if (!sheets.length) {
        throw new Error('Spreadsheet form parser found no included non-empty worksheets')
    }

    const maxChunkTokens = boundedMaxChunkTokens(config.maxChunkTokens)
    const contextUnit = config.contextUnit ?? 'workbook'
    if (contextUnit === 'row') {
        throw new Error('Spreadsheet form parser does not support row context; use records interpretation instead')
    }

    const workbookContent = serializeWorkbook(input.documentName, sheets, config)
    if (contextUnit === 'workbook' && estimateSpreadsheetTokens(workbookContent) <= maxChunkTokens) {
        return [createDocument(input.documentId, workbookContent, sheets, 0, 'workbook')]
    }
    if (contextUnit === 'workbook' && config.oversizePolicy === 'reject') {
        throw new Error(
            `Spreadsheet workbook exceeds the configured ${maxChunkTokens} token limit; choose per-worksheet mode or increase the limit`
        )
    }

    const chunks = sheets.flatMap((sheet) =>
        serializeSheetSections(input.documentName, sheet, config, maxChunkTokens).map((content, sectionIndex) => ({
            content,
            sheets: [sheet],
            sourceUnit: sectionIndex === 0 ? 'sheet' : 'sheet_section'
        }))
    )
    return chunks.map((chunk, chunkIndex) =>
        createDocument(input.documentId, chunk.content, chunk.sheets, chunkIndex, chunk.sourceUnit)
    )
}

type SpreadsheetRecordInput = {
    documentId: string
    workbook: LoadedSpreadsheetWorkbook
    config?: DocumentSpreadsheetParserConfig
    indexedFields?: string[]
    /** The original first-sheet path includes its first sheet even when hidden. */
    legacy?: boolean
}

export function createSpreadsheetRecordDocuments(input: SpreadsheetRecordInput): Document[] {
    return createRecordChunks(input, selectSheets(input.workbook.sheets, input.config ?? {}))
}

export function createSpreadsheetRecordResult(input: SpreadsheetRecordInput): {
    chunks: Document[]
    tables: KnowledgeTableSource[]
} {
    const sheets = input.legacy
        ? input.workbook.sheets.slice(0, 1)
        : selectSheets(input.workbook.sheets, input.config ?? {})
    if (input.indexedFields?.length) {
        const available = new Set(sheets.flatMap((sheet) => sheet.columns.map((column) => column.key)))
        const unknown = input.indexedFields.filter((field) => !available.has(field))
        if (unknown.length) throw invalidKnowledgeTableIndexedFields(unknown)
        for (const sheet of sheets) {
            if (sheet.records.length && !sheet.columns.some((column) => input.indexedFields.includes(column.key))) {
                throw invalidKnowledgeTableIndexedFields(input.indexedFields, sheet.name)
            }
        }
    }
    const tables: KnowledgeTableSource[] = sheets
        .filter((sheet) => sheet.range)
        .map((sheet) => ({
            tableId: `sheet:${sheet.index}`,
            sheetName: sheet.name,
            range: sheet.range!,
            ...(sheet.headerRow !== undefined ? { headerRow: sheet.headerRow } : {}),
            rowCount: sheet.records.length,
            columns: sheet.columns.map((column) => {
                const values = sheet.records.map((record) => record[column.key]).filter((value) => value != null)
                return {
                    ...column,
                    ...(values.length && values.every((value) => typeof value === 'boolean')
                        ? { valueType: 'boolean' as const }
                        : {})
                }
            }),
            samples: sheet.records.slice(0, 10).map((record, index) => ({
                rowNumber: sheet.recordRows[index],
                values: Object.fromEntries(
                    sheet.columns.map((column) => [column.columnId, sampleValue(record[column.key])])
                )
            }))
        }))
    return { tables, chunks: createRecordChunks(input, sheets, true) }
}

function createRecordChunks(input: SpreadsheetRecordInput, sheets: LoadedSpreadsheetSheet[], tableSources = false) {
    let chunkIndex = 0
    return sheets.flatMap((sheet) =>
        sheet.records.map((record, recordIndex) => {
            const rowNumber = sheet.recordRows[recordIndex]
            const tableId = `sheet:${sheet.index}`
            const firstColumn = sheet.columns[0]?.columnId
            const lastColumn = sheet.columns.at(-1)?.columnId
            const metadata: Record<string, unknown> = {
                raw: record,
                documentId: input.documentId,
                chunkId: uuid(),
                chunkIndex: chunkIndex++,
                spreadsheetInterpretation: 'records',
                spreadsheetSourceUnit: 'row',
                sheetName: sheet.name,
                ...(tableSources
                    ? {
                          tableSource: {
                              tableId,
                              rowNumber,
                              ...(firstColumn && lastColumn
                                  ? { range: `${firstColumn}${rowNumber}:${lastColumn}${rowNumber}` }
                                  : {})
                          }
                      }
                    : {}),
                sourceBlockIds: [`sheet:${encodeURIComponent(sheet.name)}:record:${chunkIndex}`]
            }
            if (input.indexedFields?.length) {
                metadata.searchContent = JSON.stringify(
                    tableSources
                        ? Object.fromEntries(
                              sheet.columns
                                  .filter((column) => input.indexedFields.includes(column.key))
                                  .map((column) => [column.key, record[column.key] ?? null])
                          )
                        : Object.fromEntries(input.indexedFields.map((field) => [field, record[field]]))
                )
            }
            return new Document({ pageContent: JSON.stringify(record), metadata })
        })
    )
}

function sampleValue(value: unknown): string | number | boolean | null {
    if (value instanceof Date) return value.toISOString()
    if (typeof value === 'string' || typeof value === 'boolean') return value
    if (typeof value === 'number' && Number.isFinite(value)) return value
    return null
}

function selectSheets(sheets: LoadedSpreadsheetSheet[], config: DocumentSpreadsheetParserConfig) {
    const include = config.includeSheets?.filter(Boolean)
    const includesAll = !include?.length || include.includes('*')
    const selected = sheets.filter((sheet) => {
        if (!config.includeHiddenSheets && sheet.hidden) return false
        return includesAll || include?.includes(sheet.name)
    })
    return selected.filter((sheet) => sheet.cells.length > 0)
}

function serializeWorkbook(
    documentName: string,
    sheets: LoadedSpreadsheetSheet[],
    config: DocumentSpreadsheetParserConfig
) {
    return [`# Workbook: ${escapeInline(documentName)}`, ...sheets.map((sheet) => serializeSheet(sheet, config))].join(
        '\n\n'
    )
}

function serializeSheet(sheet: LoadedSpreadsheetSheet, config: DocumentSpreadsheetParserConfig) {
    return [sheetHeader(sheet, config), ...sheetRows(sheet, config)].join('\n')
}

function serializeSheetSections(
    documentName: string,
    sheet: LoadedSpreadsheetSheet,
    config: DocumentSpreadsheetParserConfig,
    maxChunkTokens: number
) {
    const prefix = `# Workbook: ${escapeInline(documentName)}\n\n${sheetHeader(sheet, config)}`
    const rows = sheetRows(sheet, config)
    const fullContent = [prefix, ...rows].join('\n')
    if (estimateSpreadsheetTokens(fullContent) <= maxChunkTokens) return [fullContent]

    const sections: string[] = []
    let currentRows: string[] = []
    for (const row of rows) {
        const candidate = [prefix, ...currentRows, row].join('\n')
        if (currentRows.length && estimateSpreadsheetTokens(candidate) > maxChunkTokens) {
            sections.push([prefix, ...currentRows].join('\n'))
            currentRows = [row]
        } else {
            currentRows.push(row)
        }
    }
    if (currentRows.length) sections.push([prefix, ...currentRows].join('\n'))
    return sections
}

function sheetHeader(sheet: LoadedSpreadsheetSheet, config: DocumentSpreadsheetParserConfig) {
    const details = [sheet.range ? `range=${sheet.range}` : undefined]
    if (config.preserveMergedCells !== false && sheet.merges.length) {
        details.push(`merged=${sheet.merges.join(',')}`)
    }
    return [
        `## Worksheet: ${escapeInline(sheet.name)}`,
        details.filter(Boolean).length ? `<!-- ${details.filter(Boolean).join('; ')} -->` : ''
    ]
        .filter(Boolean)
        .join('\n')
}

function sheetRows(sheet: LoadedSpreadsheetSheet, config: DocumentSpreadsheetParserConfig) {
    const byRow = new Map<number, typeof sheet.cells>()
    for (const cell of sheet.cells) {
        const row = byRow.get(cell.row) ?? []
        row.push(cell)
        byRow.set(cell.row, row)
    }
    return [...byRow.entries()].map(([rowNumber, cells]) => {
        const values = cells.map((cell) =>
            config.emitCellAnchors === false
                ? escapeInline(cell.value)
                : `[${cell.address}] ${escapeInline(cell.value)}`
        )
        return `- Row ${rowNumber}: ${values.join(' | ')}`
    })
}

function createDocument(
    documentId: string,
    pageContent: string,
    sheets: LoadedSpreadsheetSheet[],
    chunkIndex: number,
    sourceUnit: string
) {
    return new Document({
        pageContent,
        metadata: {
            documentId,
            chunkId: uuid(),
            chunkIndex,
            contentFormat: 'markdown',
            spreadsheetInterpretation: 'form_document',
            spreadsheetSourceUnit: sourceUnit,
            sheetNames: sheets.map((sheet) => sheet.name),
            cellRanges: sheets.map((sheet) => ({ sheet: sheet.name, range: sheet.range ?? null })),
            sourceBlockIds: sheets.map(
                (sheet) => `sheet:${encodeURIComponent(sheet.name)}:range:${sheet.range ?? 'unknown'}`
            )
        }
    })
}

function boundedMaxChunkTokens(value: number | undefined) {
    if (!Number.isFinite(value)) return DEFAULT_MAX_CHUNK_TOKENS
    return Math.min(MAX_MAX_CHUNK_TOKENS, Math.max(MIN_MAX_CHUNK_TOKENS, Math.floor(value!)))
}

function escapeInline(value: string) {
    return value.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim()
}

function estimateSpreadsheetTokens(value: string) {
    return countTokensSafe(value)
}
