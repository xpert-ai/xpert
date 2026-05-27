import { Injectable } from '@nestjs/common'
import fs from 'fs/promises'
import { FileParseSource, ParsedFileResult } from '../domain/types'
import { FileParser, getFileExtension, summarizeText } from './file-parser'

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
    'sql'
])

@Injectable()
export class TextFileParser implements FileParser {
    readonly name = 'text'

    supports(source: FileParseSource): boolean {
        const extension = getFileExtension(source.originalName ?? source.filePath)
        return source.mimeType?.startsWith('text/') || TEXT_EXTENSIONS.has(extension)
    }

    async parse(source: FileParseSource): Promise<ParsedFileResult> {
        const content = await fs.readFile(source.filePath, 'utf8')
        return {
            capabilities: ['preview', 'read', 'search'],
            summary: summarizeText(content),
            artifacts: [
                {
                    kind: 'summary',
                    content: summarizeText(content)
                },
                {
                    kind: 'text',
                    content,
                    mimeType: source.mimeType,
                    anchor: { path: source.originalName }
                }
            ]
        }
    }
}
