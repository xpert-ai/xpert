import { DocxLoader } from '@langchain/community/document_loaders/fs/docx'
import { PPTXLoader } from '@langchain/community/document_loaders/fs/pptx'
import { Injectable } from '@nestjs/common'
import { FileParseSource, ParsedFileResult } from '../domain/types'
import { FileParser, getFileExtension, summarizeText } from './file-parser'

@Injectable()
export class OfficeFileParser implements FileParser {
    readonly name = 'office'

    supports(source: FileParseSource): boolean {
        const extension = getFileExtension(source.originalName ?? source.filePath)
        return ['doc', 'docx', 'ppt', 'pptx'].includes(extension)
    }

    async parse(source: FileParseSource): Promise<ParsedFileResult> {
        const extension = getFileExtension(source.originalName ?? source.filePath)
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
}
