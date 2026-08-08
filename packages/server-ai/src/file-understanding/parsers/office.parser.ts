import { DocxLoader } from '@langchain/community/document_loaders/fs/docx'
import { PPTXLoader } from '@langchain/community/document_loaders/fs/pptx'
import { Injectable } from '@nestjs/common'
import { createRequire } from 'node:module'
import { FileParseSource, ParsedFileResult } from '../domain/types'
import { FileParser, getFileExtension, summarizeText } from './file-parser'

const requireFromHere = createRequire(__filename)

@Injectable()
export class OfficeFileParser implements FileParser {
    readonly name = 'office'

    supports(source: FileParseSource): boolean {
        const extension = getFileExtension(source.originalName ?? source.filePath)
        return ['doc', 'docx', 'ppt', 'pptx'].includes(extension)
    }

    async parse(source: FileParseSource): Promise<ParsedFileResult> {
        const extension = getFileExtension(source.originalName ?? source.filePath)
        if (extension === 'doc') {
            return this.parseLegacyDoc(source)
        }
        const docs =
            extension === 'ppt' || extension === 'pptx'
                ? await new PPTXLoader(source.filePath).load()
                : await new DocxLoader(source.filePath).load()
        const text = docs.map((doc) => doc.pageContent).join('\n\n')
        const artifactKind = extension === 'ppt' || extension === 'pptx' ? 'slide' : 'text'

        return {
            capabilities: ['preview', 'read', 'search'],
            summary: summarizeText(text),
            artifacts: [
                {
                    kind: 'summary',
                    content: summarizeText(text)
                },
                ...docs.map((doc, index) => ({
                    kind: artifactKind as 'slide' | 'text',
                    content: doc.pageContent,
                    mimeType: 'text/plain',
                    anchor:
                        artifactKind === 'slide'
                            ? {
                                  slide: index + 1
                              }
                            : undefined,
                    metadata: doc.metadata
                }))
            ]
        }
    }

    private async parseLegacyDoc(source: FileParseSource): Promise<ParsedFileResult> {
        type ExtractedWordDocument = { getBody(options?: Record<string, unknown>): string }
        type WordExtractor = { extract(source: string): Promise<ExtractedWordDocument> }
        const WordExtractorConstructor = requireFromHere('word-extractor') as new () => WordExtractor
        const document = await new WordExtractorConstructor().extract(source.filePath)
        const text = document.getBody().replace(/\0/g, '').replace(/\r\n/g, '\n').trim()
        if (!text) {
            throw new Error('The binary DOC file did not contain extractable text')
        }
        return {
            capabilities: ['preview', 'read', 'search'],
            summary: summarizeText(text),
            metadata: { legacyDocExtractor: 'word-extractor', legacyDocExtractorVersion: '1.0.4' },
            artifacts: [
                { kind: 'summary', content: summarizeText(text) },
                { kind: 'text', content: text, mimeType: 'text/plain' }
            ]
        }
    }
}
