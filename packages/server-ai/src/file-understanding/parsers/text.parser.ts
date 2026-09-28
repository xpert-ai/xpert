import { Injectable } from '@nestjs/common'
import { FileParseSource, ParsedFileResult } from '../domain/types'
import { FileParser, summarizeText } from './file-parser'
import { readTextFile, supportsTextFile } from './text-file'
import { UnsupportedFileContentError } from './unsupported-file-content.error'

@Injectable()
export class TextFileParser implements FileParser {
    readonly name = 'text'

    supports(source: FileParseSource): boolean {
        return supportsTextFile(source)
    }

    async parse(source: FileParseSource): Promise<ParsedFileResult> {
        if (!this.supports(source)) throw new UnsupportedFileContentError()
        const content = await readTextFile(source.filePath)
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
