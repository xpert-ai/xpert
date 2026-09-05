import type { IKnowledgeFAQEntry, KnowledgeFAQWriteInput } from '@xpert-ai/contracts'
import * as XLSX from 'xlsx'

const WEKNORA_MULTI_VALUE_DELIMITER = '##'
const WEKNORA_UNCATEGORIZED_TAG = '未分类'

const WEKNORA_CSV_HEADERS = [
    '标签(必填)',
    '问题(必填)',
    '相似问题(选填-多个用##分隔)',
    '反例问题(选填-多个用##分隔)',
    '机器人回答(必填-多个用##分隔)',
    '是否全部回复(选填-默认FALSE)',
    '是否停用(选填-默认FALSE)',
    '是否禁止被推荐(选填-默认False 可被推荐)'
] as const

export type KnowledgeFAQTransferFile = {
    fileName: string
    buffer: Buffer
}

type WeKnoraFAQExportEntry = {
    tag_name: string
    standard_question: string
    similar_questions: string[]
    negative_questions: string[]
    answers: string[]
    answer_strategy: 'all'
    is_enabled: boolean
    is_recommended: true
}

export function parseWeKnoraFAQFile(file: KnowledgeFAQTransferFile): KnowledgeFAQWriteInput[] {
    const extension = file.fileName.toLowerCase().match(/\.([^.]+)$/u)?.[1]
    if (extension === 'json') {
        return parseWeKnoraJSON(file.buffer)
    }
    if (extension === 'csv' || extension === 'tsv' || extension === 'xlsx' || extension === 'xls') {
        return parseWeKnoraSpreadsheet(file.buffer, extension)
    }
    throw new Error('Only WeKnora JSON, CSV, TSV, XLSX, and XLS FAQ files are supported.')
}

export function serializeWeKnoraFAQCSV(entries: IKnowledgeFAQEntry[]) {
    const rows = entries.map((entry) => [
        WEKNORA_UNCATEGORIZED_TAG,
        entry.standardQuestion,
        entry.similarQuestions.join(WEKNORA_MULTI_VALUE_DELIMITER),
        entry.negativeQuestions.join(WEKNORA_MULTI_VALUE_DELIMITER),
        entry.answerBlocks.join(WEKNORA_MULTI_VALUE_DELIMITER),
        'TRUE',
        entry.enabled ? 'FALSE' : 'TRUE',
        'FALSE'
    ])
    return `\ufeff${[WEKNORA_CSV_HEADERS, ...rows]
        .map((row, rowIndex) =>
            row.map((value) => escapeCSVCell(rowIndex ? neutralizeSpreadsheetFormula(value) : value)).join(',')
        )
        .join('\n')}`
}

export function serializeWeKnoraFAQJSON(entries: IKnowledgeFAQEntry[]) {
    return JSON.stringify(entries.map(toWeKnoraExportEntry), null, 2)
}

function parseWeKnoraJSON(buffer: Buffer): KnowledgeFAQWriteInput[] {
    let value: unknown
    try {
        value = JSON.parse(stripUTF8BOM(buffer.toString('utf8')))
    } catch {
        throw new Error('The FAQ JSON file is invalid.')
    }

    const entries = Array.isArray(value) ? value : readEntriesArray(value)
    return entries.map((entry, index) => parseWeKnoraJSONEntry(entry, index + 1))
}

function readEntriesArray(value: unknown): unknown[] {
    if (typeof value !== 'object' || value === null || !('entries' in value) || !Array.isArray(value.entries)) {
        throw new Error('The FAQ JSON file must contain an array of entries.')
    }
    return value.entries
}

function parseWeKnoraJSONEntry(value: unknown, row: number): KnowledgeFAQWriteInput {
    if (
        typeof value !== 'object' ||
        value === null ||
        !('standard_question' in value) ||
        typeof value.standard_question !== 'string'
    ) {
        throw new Error(`FAQ JSON entry ${row} is missing standard_question.`)
    }

    const similarQuestions =
        'similar_questions' in value
            ? requireStringArray(value.similar_questions, `FAQ JSON entry ${row} similar_questions`)
            : []
    const negativeQuestions =
        'negative_questions' in value
            ? requireStringArray(value.negative_questions, `FAQ JSON entry ${row} negative_questions`)
            : []
    const answerBlocks = 'answers' in value ? requireStringArray(value.answers, `FAQ JSON entry ${row} answers`) : []
    const enabled = 'is_enabled' in value ? requireBoolean(value.is_enabled, `FAQ JSON entry ${row} is_enabled`) : true

    return {
        standardQuestion: value.standard_question,
        similarQuestions,
        negativeQuestions,
        answerBlocks,
        enabled
    }
}

function parseWeKnoraSpreadsheet(buffer: Buffer, extension: string): KnowledgeFAQWriteInput[] {
    let workbook: XLSX.WorkBook
    try {
        const isTextSpreadsheet = extension === 'csv' || extension === 'tsv'
        workbook = XLSX.read(isTextSpreadsheet ? stripUTF8BOM(buffer.toString('utf8')) : buffer, {
            type: isTextSpreadsheet ? 'string' : 'buffer',
            raw: false,
            codepage: 65001
        })
    } catch {
        throw new Error('The FAQ spreadsheet could not be parsed.')
    }

    const sheetName = workbook.SheetNames[0]
    if (!sheetName) throw new Error('The FAQ spreadsheet does not contain a worksheet.')
    const worksheet = workbook.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
        header: 1,
        defval: '',
        raw: false,
        blankrows: false
    })
    const headerRow = rows[0]
    if (!Array.isArray(headerRow)) throw new Error('The FAQ spreadsheet is missing a header row.')
    const headers = headerRow.map((cell) => normalizeHeader(cellToString(cell)))

    return rows.slice(1).flatMap((row, index) => {
        if (!Array.isArray(row) || row.every((cell) => !cellToString(cell).trim())) return []
        const record = new Map<string, string>()
        headers.forEach((header, columnIndex) => {
            if (header) record.set(header, cellToString(row[columnIndex]).trim())
        })
        return [parseWeKnoraSpreadsheetEntry(record, index + 2)]
    })
}

function parseWeKnoraSpreadsheetEntry(record: Map<string, string>, row: number): KnowledgeFAQWriteInput {
    const standardQuestion = pick(record, '问题', 'standard_question', 'question')
    if (!standardQuestion) throw new Error(`FAQ spreadsheet row ${row} is missing the question.`)

    const directEnabled = pick(record, 'is_enabled')
    const disabled = pick(record, '是否停用')
    return {
        standardQuestion,
        similarQuestions: splitMultiValue(pick(record, '相似问题', 'similar_questions')),
        negativeQuestions: splitMultiValue(pick(record, '反例问题', 'negative_questions')),
        answerBlocks: splitMultiValue(pick(record, '机器人回答', 'answers')),
        enabled: directEnabled
            ? parseBooleanText(directEnabled, `FAQ spreadsheet row ${row} is_enabled`)
            : !parseBooleanText(disabled, `FAQ spreadsheet row ${row} 是否停用`, false)
    }
}

function toWeKnoraExportEntry(entry: IKnowledgeFAQEntry): WeKnoraFAQExportEntry {
    return {
        tag_name: WEKNORA_UNCATEGORIZED_TAG,
        standard_question: entry.standardQuestion,
        similar_questions: entry.similarQuestions,
        negative_questions: entry.negativeQuestions,
        answers: entry.answerBlocks,
        answer_strategy: 'all',
        is_enabled: entry.enabled,
        is_recommended: true
    }
}

function normalizeHeader(value: string) {
    const stripped = stripUTF8BOM(value)
        .trim()
        .replace(/[（(][^）)]*[）)]/gu, '')
        .trim()
    return /[\u3400-\u9fff]/u.test(stripped) ? stripped : stripped.toLowerCase()
}

function splitMultiValue(value: string) {
    if (!value.trim()) return []
    return value
        .split(WEKNORA_MULTI_VALUE_DELIMITER)
        .map((item) => item.trim())
        .filter(Boolean)
}

function pick(record: Map<string, string>, ...keys: string[]) {
    for (const key of keys) {
        const value = record.get(key)
        if (value) return value
    }
    return ''
}

function cellToString(value: unknown) {
    if (value === null || value === undefined) return ''
    return String(value)
}

function requireStringArray(value: unknown, field: string): string[] {
    if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
        throw new Error(`${field} must be an array of strings.`)
    }
    return value
}

function requireBoolean(value: unknown, field: string) {
    if (typeof value !== 'boolean') throw new Error(`${field} must be a boolean.`)
    return value
}

function parseBooleanText(value: string, field: string, defaultValue = true) {
    if (!value.trim()) return defaultValue
    const normalized = value.normalize('NFKC').trim().toLowerCase()
    if (['true', '1', 'yes', 'y', '是'].includes(normalized)) return true
    if (['false', '0', 'no', 'n', '否'].includes(normalized)) return false
    throw new Error(`${field} must be TRUE or FALSE.`)
}

function escapeCSVCell(value: string) {
    return /[",\r\n]/u.test(value) ? `"${value.replace(/"/gu, '""')}"` : value
}

function neutralizeSpreadsheetFormula(value: string) {
    return /^[=+\-@]/u.test(value) ? `\t${value}` : value
}

function stripUTF8BOM(value: string) {
    return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value
}
