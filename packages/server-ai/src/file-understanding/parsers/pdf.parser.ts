import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf'
import { Injectable, Logger } from '@nestjs/common'
import { FileStorage } from '@xpert-ai/server-core'
import path from 'node:path'
import sharp from 'sharp'
import { FileParseSource, ParsedFileArtifact, ParsedFileResult } from '../domain/types'
import { FileParser, getFileExtension, summarizeText } from './file-parser'

const DEFAULT_PDF_PAGE_RENDER_MAX_PAGES = 300
const PDF_PAGE_RENDER_SCALE = 2
const PDF_PAGE_IMAGE_MIME_TYPE = 'image/png'

type PdfToImgDocument = {
    length: number
    getPage(pageNumber: number): Promise<Buffer>
    destroy(): Promise<void>
}

type PdfToImgModule = {
    pdf(input: string, options?: { scale?: number }): Promise<PdfToImgDocument>
}

const importPdfToImg = new Function('specifier', 'return import(specifier)') as (
    specifier: string
) => Promise<PdfToImgModule>

type PdfPageImageRenderResult = {
    artifacts: ParsedFileArtifact[]
    metadata?: {
        parseRunId: string
        pageCount: number
        renderedPageCount: number
        truncated: boolean
        renderScale: number
        maxPages: number
        renderError?: string
    }
}

@Injectable()
export class PdfFileParser implements FileParser {
    readonly name = 'pdf'
    readonly #logger = new Logger(PdfFileParser.name)

    supports(source: FileParseSource): boolean {
        return (
            source.mimeType === 'application/pdf' || getFileExtension(source.originalName ?? source.filePath) === 'pdf'
        )
    }

    async parse(source: FileParseSource): Promise<ParsedFileResult> {
        const loader = new PDFLoader(source.filePath)
        const docs = await loader.load()
        const text = docs.map((doc) => doc.pageContent).join('\n\n')
        const pageTextArtifacts = docs.map((doc, index) => ({
            kind: 'page_text' as const,
            content: doc.pageContent,
            mimeType: 'text/plain',
            anchor: { page: Number(doc.metadata?.loc?.pageNumber ?? index + 1) },
            metadata: doc.metadata
        }))
        const pageImageResult = await this.renderPageImages(source)
        const hasText = Boolean(text.trim())
        const hasPageImages = pageImageResult.artifacts.length > 0
        const isImageRenderPartial =
            Boolean(pageImageResult.metadata?.truncated) || Boolean(pageImageResult.metadata?.renderError)
        const summary = hasText ? summarizeText(text) : 'PDF parsed without extractable text. OCR is required.'
        const capabilities: ParsedFileResult['capabilities'] = [
            'preview',
            'read',
            'search',
            'ocr',
            ...(hasPageImages ? (['vision', 'page_images'] as const) : [])
        ]
        const pageArtifacts = interleavePageArtifacts(pageTextArtifacts, pageImageResult.artifacts)

        return {
            status: hasText && !isImageRenderPartial ? 'ready' : 'partial',
            capabilities,
            summary,
            artifacts: [
                {
                    kind: 'summary',
                    content: summary
                },
                ...pageArtifacts
            ],
            metadata: pageImageResult.metadata
                ? {
                      pdfPageImages: pageImageResult.metadata
                  }
                : undefined
        }
    }

    private async renderPageImages(source: FileParseSource): Promise<PdfPageImageRenderResult> {
        if (!source.derivedOutput) {
            return { artifacts: [] }
        }

        const maxPages = resolveMaxRenderedPages()
        const artifacts: ParsedFileArtifact[] = []
        let pageCount = 0
        try {
            const document = await this.createPdfToImageDocument(source.filePath)
            try {
                pageCount = document.length
                const renderedPageCount = Math.min(pageCount, maxPages)
                const storage = this.getStorageProvider(source.derivedOutput.storageProvider)

                for (let page = 1; page <= renderedPageCount; page++) {
                    const imageBuffer = await document.getPage(page)
                    const fileName = `page-${String(page).padStart(4, '0')}.png`
                    const storageKey = path.posix.join(source.derivedOutput.directory, 'pages', fileName)
                    const uploadedFile = await storage.putFile(imageBuffer, storageKey)
                    const imageMetadata = await sharp(imageBuffer)
                        .metadata()
                        .catch(() => null)

                    artifacts.push({
                        kind: 'page_image',
                        mimeType: PDF_PAGE_IMAGE_MIME_TYPE,
                        anchor: { page, path: fileName },
                        metadata: {
                            page,
                            fileName,
                            storageKey: uploadedFile.key || storageKey,
                            url: uploadedFile.url || storage.url(uploadedFile.key || storageKey),
                            width: imageMetadata?.width,
                            height: imageMetadata?.height,
                            size: uploadedFile.size || imageBuffer.length,
                            renderScale: PDF_PAGE_RENDER_SCALE,
                            parseRunId: source.derivedOutput.parseRunId
                        }
                    })
                }

                return {
                    artifacts,
                    metadata: {
                        parseRunId: source.derivedOutput.parseRunId,
                        pageCount,
                        renderedPageCount,
                        truncated: pageCount > renderedPageCount,
                        renderScale: PDF_PAGE_RENDER_SCALE,
                        maxPages
                    }
                }
            } finally {
                await document.destroy().catch((error) => {
                    this.#logger.warn(
                        `Failed to release PDF page renderer for ${source.originalName ?? source.filePath}: ${
                            error instanceof Error ? error.message : String(error)
                        }`
                    )
                })
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            this.#logger.warn(`Failed to render PDF pages for ${source.originalName ?? source.filePath}: ${message}`)
            return {
                artifacts,
                metadata: {
                    parseRunId: source.derivedOutput.parseRunId,
                    pageCount,
                    renderedPageCount: artifacts.length,
                    truncated: pageCount > artifacts.length,
                    renderScale: PDF_PAGE_RENDER_SCALE,
                    maxPages,
                    renderError: message
                }
            }
        }
    }

    protected async createPdfToImageDocument(filePath: string) {
        const { pdf } = await importPdfToImg('pdf-to-img')
        return await pdf(filePath, { scale: PDF_PAGE_RENDER_SCALE })
    }

    protected getStorageProvider(storageProvider?: string) {
        return new FileStorage().getProvider(storageProvider)
    }
}

function resolveMaxRenderedPages() {
    const configured = Number.parseInt(process.env.FILE_UNDERSTANDING_PDF_RENDER_MAX_PAGES ?? '', 10)
    return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_PDF_PAGE_RENDER_MAX_PAGES
}

function interleavePageArtifacts(textArtifacts: ParsedFileArtifact[], imageArtifacts: ParsedFileArtifact[]) {
    const imagesByPage = new Map<number, ParsedFileArtifact[]>()
    const imagesWithoutPage: ParsedFileArtifact[] = []
    for (const artifact of imageArtifacts) {
        const page = artifact.anchor?.page
        if (typeof page === 'number') {
            imagesByPage.set(page, [...(imagesByPage.get(page) ?? []), artifact])
        } else {
            imagesWithoutPage.push(artifact)
        }
    }

    const ordered: ParsedFileArtifact[] = []
    for (const textArtifact of textArtifacts) {
        ordered.push(textArtifact)
        const page = textArtifact.anchor?.page
        if (typeof page === 'number') {
            ordered.push(...(imagesByPage.get(page) ?? []))
            imagesByPage.delete(page)
        }
    }
    for (const artifacts of imagesByPage.values()) {
        ordered.push(...artifacts)
    }
    ordered.push(...imagesWithoutPage)
    return ordered
}
