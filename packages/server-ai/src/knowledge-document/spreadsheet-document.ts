import { Document } from '@langchain/core/documents'
import type { DocumentSpreadsheetParserConfig } from '@xpert-ai/contracts'
import type { LoadedSpreadsheetSheet, LoadedSpreadsheetWorkbook } from '@xpert-ai/server-common'
import { v4 as uuid } from 'uuid'

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

export function createSpreadsheetRecordDocuments(input: {
    documentId: string
    workbook: LoadedSpreadsheetWorkbook
    config?: DocumentSpreadsheetParserConfig
    indexedFields?: string[]
}): Document[] {
    const sheets = selectSheets(input.workbook.sheets, input.config ?? {})
    let chunkIndex = 0
    return sheets.flatMap((sheet) =>
        sheet.records.map((record) => {
            const metadata: Record<string, unknown> = {
                raw: record,
                documentId: input.documentId,
                chunkId: uuid(),
                chunkIndex: chunkIndex++,
                spreadsheetInterpretation: 'records',
                spreadsheetSourceUnit: 'row',
                sheetName: sheet.name,
                sourceBlockIds: [`sheet:${encodeURIComponent(sheet.name)}:record:${chunkIndex}`]
            }
            if (input.indexedFields?.length) {
                metadata.searchContent = JSON.stringify(
                    Object.fromEntries(input.indexedFields.map((field) => [field, record[field]]))
                )
            }
            return new Document({ pageContent: JSON.stringify(record), metadata })
        })
    )
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
    let cjkCharacters = 0
    let otherCharacters = 0
    for (const character of value) {
        if (/\p{Script=Han}/u.test(character)) cjkCharacters += 1
        else otherCharacters += 1
    }
    return Math.ceil(cjkCharacters / 1.5 + otherCharacters / 4)
}
