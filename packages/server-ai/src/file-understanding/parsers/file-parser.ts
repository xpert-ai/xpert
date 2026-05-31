import { FileParseSource, ParsedFileResult } from '../domain/types'

export interface FileParser {
    readonly name: string
    supports(source: FileParseSource): boolean
    parse(source: FileParseSource): Promise<ParsedFileResult>
}

export function getFileExtension(fileNameOrPath?: string) {
    const value = fileNameOrPath ?? ''
    const index = value.lastIndexOf('.')
    return index >= 0 ? value.slice(index + 1).toLowerCase() : ''
}

export function estimateTokenCount(content: string) {
    return Math.ceil(content.length / 4)
}

export function summarizeText(content: string, maxLength = 1200) {
    const normalized = content.replace(/\s+/g, ' ').trim()
    return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized
}
