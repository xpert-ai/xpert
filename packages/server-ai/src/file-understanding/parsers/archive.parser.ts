import { Injectable } from '@nestjs/common'
import { Open } from 'unzipper'
import { FileParseSource, ParsedFileArtifact, ParsedFileResult } from '../domain/types'
import { FileParser, getFileExtension, summarizeText } from './file-parser'

const TEXT_IN_ARCHIVE_EXTENSIONS = new Set([
    'txt',
    'md',
    'json',
    'yaml',
    'yml',
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
    'sql',
    'css',
    'scss',
    'html'
])

@Injectable()
export class ArchiveFileParser implements FileParser {
    readonly name = 'archive'

    supports(source: FileParseSource): boolean {
        return getFileExtension(source.originalName ?? source.filePath) === 'zip'
    }

    async parse(source: FileParseSource): Promise<ParsedFileResult> {
        const directory = await Open.file(source.filePath)
        const files = directory.files.filter((entry) => entry.type === 'File')
        const manifest = files.slice(0, 500).map((entry) => ({
            path: entry.path,
            size: entry.uncompressedSize
        }))
        const artifacts: ParsedFileArtifact[] = [
            {
                kind: 'file_manifest' as const,
                content: JSON.stringify(manifest, null, 2),
                mimeType: 'application/json',
                metadata: {
                    totalFiles: files.length,
                    truncated: files.length > manifest.length
                }
            },
            {
                kind: 'code_tree' as const,
                content: manifest.map((entry) => `${entry.path} (${entry.size} bytes)`).join('\n'),
                mimeType: 'text/plain'
            }
        ]

        for (const entry of files.slice(0, 80)) {
            const extension = getFileExtension(entry.path)
            if (!TEXT_IN_ARCHIVE_EXTENSIONS.has(extension) || entry.uncompressedSize > 200_000) {
                continue
            }
            const buffer = await entry.buffer()
            artifacts.push({
                kind: 'text',
                content: buffer.toString('utf8'),
                mimeType: 'text/plain',
                anchor: { path: entry.path },
                metadata: { size: entry.uncompressedSize }
            })
        }

        const summary = `Archive with ${files.length} files.\n${manifest
            .slice(0, 80)
            .map((entry) => entry.path)
            .join('\n')}`

        return {
            capabilities: ['preview', 'read', 'search', 'workspace'],
            summary: summarizeText(summary),
            artifacts: [{ kind: 'summary', content: summarizeText(summary) }, ...artifacts],
            metadata: {
                fileCount: files.length
            }
        }
    }
}
