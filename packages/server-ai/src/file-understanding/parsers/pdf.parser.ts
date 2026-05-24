import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf'
import { Injectable } from '@nestjs/common'
import { FileParseSource, ParsedFileResult } from '../domain/types'
import { FileParser, getFileExtension, summarizeText } from './file-parser'

@Injectable()
export class PdfFileParser implements FileParser {
    readonly name = 'pdf'

    supports(source: FileParseSource): boolean {
        return (
            source.mimeType === 'application/pdf' || getFileExtension(source.originalName ?? source.filePath) === 'pdf'
        )
    }

    async parse(source: FileParseSource): Promise<ParsedFileResult> {
        const loader = new PDFLoader(source.filePath)
        const docs = await loader.load()
        const text = docs.map((doc) => doc.pageContent).join('\n\n')
        const artifacts = docs.map((doc, index) => ({
            kind: 'page_text' as const,
            content: doc.pageContent,
            mimeType: 'text/plain',
            anchor: { page: Number(doc.metadata?.loc?.pageNumber ?? index + 1) },
            metadata: doc.metadata
        }))

        return {
            status: text.trim() ? 'ready' : 'partial',
            capabilities: ['preview', 'read', 'search', 'ocr'],
            summary: text.trim() ? summarizeText(text) : 'PDF parsed without extractable text. OCR is required.',
            artifacts: [
                {
                    kind: 'summary',
                    content: text.trim() ? summarizeText(text) : 'PDF parsed without extractable text. OCR is required.'
                },
                ...artifacts
            ]
        }
    }
}
