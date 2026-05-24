import { Injectable } from '@nestjs/common'
import fs from 'fs/promises'
import * as XLSX from 'xlsx'
import { FileParseSource, ParsedFileResult } from '../domain/types'
import { FileParser, getFileExtension, summarizeText } from './file-parser'

@Injectable()
export class SpreadsheetFileParser implements FileParser {
    readonly name = 'spreadsheet'

    supports(source: FileParseSource): boolean {
        const extension = getFileExtension(source.originalName ?? source.filePath)
        return ['csv', 'tsv', 'xlsx', 'xls'].includes(extension)
    }

    async parse(source: FileParseSource): Promise<ParsedFileResult> {
        const extension = getFileExtension(source.originalName ?? source.filePath)
        if (extension === 'csv' || extension === 'tsv') {
            const content = await fs.readFile(source.filePath, 'utf8')
            return {
                capabilities: ['preview', 'read', 'search', 'table_query'],
                summary: summarizeText(content),
                artifacts: [
                    { kind: 'summary', content: summarizeText(content) },
                    {
                        kind: 'table',
                        content,
                        mimeType: source.mimeType,
                        anchor: { path: source.originalName },
                        metadata: { delimiter: extension === 'tsv' ? '\\t' : ',' }
                    }
                ]
            }
        }

        const workbook = XLSX.readFile(source.filePath, { cellDates: true })
        const artifacts = workbook.SheetNames.map((sheetName) => {
            const sheet = workbook.Sheets[sheetName]
            const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null })
            const sampleRows = rows.slice(0, 30)
            const headers = rows[0] ? Object.keys(rows[0]) : []
            const content = JSON.stringify(
                {
                    sheet: sheetName,
                    rowCount: rows.length,
                    headers,
                    sampleRows
                },
                null,
                2
            )
            return {
                kind: 'sheet' as const,
                content,
                mimeType: 'application/json',
                anchor: { sheet: sheetName },
                metadata: { rowCount: rows.length, headers }
            }
        })
        const summary = artifacts
            .map((artifact) => {
                const metadata = artifact.metadata as { rowCount?: number; headers?: string[] }
                return `${artifact.anchor?.sheet}: ${metadata.rowCount ?? 0} rows, columns: ${(metadata.headers ?? []).join(', ')}`
            })
            .join('\n')

        return {
            capabilities: ['preview', 'read', 'search', 'table_query'],
            summary: summarizeText(summary),
            artifacts: [{ kind: 'summary', content: summarizeText(summary) }, ...artifacts]
        }
    }
}
