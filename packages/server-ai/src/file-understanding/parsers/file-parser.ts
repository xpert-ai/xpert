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

export function isZipFile(source: Pick<FileParseSource, 'filePath' | 'originalName' | 'mimeType'>): boolean {
    const extension = getFileExtension(source.originalName ?? source.filePath)
    if (extension === 'zip') return true
    // OOXML/EPUB documents are ZIP containers but retain their document parsers.
    if (['docx', 'xlsx', 'pptx', 'epub', 'odt', 'ods', 'odp'].includes(extension)) return false
    const mimeType = source.mimeType?.split(';', 1)[0].trim().toLowerCase()
    return mimeType === 'application/zip' || mimeType === 'application/x-zip-compressed'
}

export function estimateTokenCount(content: string) {
    return Math.ceil(content.length / 4)
}

export function summarizeText(content: string, maxLength = 1200) {
    const normalized = content.replace(/\s+/g, ' ').trim()
    return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized
}
