import { normalizeFileMimeType } from '@xpert-ai/server-core'
import { readFile } from 'node:fs/promises'
import type { FileParseSource } from '../domain/types'
import { getFileExtension, isZipFile } from './file-parser'
import { UnsupportedFileContentError } from './unsupported-file-content.error'

const TEXT_EXTENSIONS = new Set([
    'txt',
    'md',
    'mdx',
    'markdown',
    'json',
    'jsonl',
    'yaml',
    'yml',
    'xml',
    'html',
    'htm',
    'css',
    'scss',
    'ts',
    'tsx',
    'js',
    'jsx',
    'py',
    'java',
    'go',
    'rs',
    'rb',
    'php',
    'c',
    'cc',
    'cpp',
    'h',
    'hpp',
    'log',
    'sql',
    'csv',
    'tsv'
])
const TEXT_MIME_TYPES = new Set([
    'application/json',
    'application/ld+json',
    'application/x-ndjson',
    'application/xml',
    'application/javascript',
    'application/yaml',
    'application/x-yaml'
])

export function supportsTextFile(source: FileParseSource): boolean {
    if (isZipFile(source)) return false
    const mimeType = source.mimeType?.split(';', 1)[0].trim().toLowerCase()
    return Boolean(
        mimeType?.startsWith('text/') ||
        TEXT_MIME_TYPES.has(mimeType) ||
        TEXT_EXTENSIONS.has(getFileExtension(source.originalName ?? source.filePath))
    )
}

export function decodeTextFileContent(data: Buffer): string {
    // Reuse upload's strict UTF-8/control-byte check, ignoring untrusted MIME labels.
    if (normalizeFileMimeType(data, 'application/octet-stream') !== 'text/plain') {
        throw new UnsupportedFileContentError()
    }
    return data.toString('utf8')
}

export async function readTextFile(filePath: string): Promise<string> {
    return decodeTextFileContent(await readFile(filePath))
}
