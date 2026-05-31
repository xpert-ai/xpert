import { IFileStorageProvider } from '@xpert-ai/plugin-sdk'
import path from 'node:path'
import { PdfFileParser } from './pdf.parser'

const mockPdfLoaderLoad = jest.fn()

jest.mock('@langchain/community/document_loaders/fs/pdf', () => ({
    PDFLoader: jest.fn().mockImplementation(() => ({
        load: mockPdfLoaderLoad
    }))
}))

const ONE_PIXEL_PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
    'base64'
)

type TestPdfDocument = {
    length: number
    getPage(pageNumber: number): Promise<Buffer>
    destroy(): Promise<void>
}

class TestPdfFileParser extends PdfFileParser {
    readonly putFileMock = jest.fn()
    readonly destroyMock = jest.fn()
    document: TestPdfDocument = {
        length: 1,
        getPage: async () => ONE_PIXEL_PNG,
        destroy: async () => {
            this.destroyMock()
        }
    }

    protected override async createPdfToImageDocument() {
        return this.document
    }

    protected override getStorageProvider(): IFileStorageProvider {
        return {
            name: 'LOCAL',
            url: (filePath: string) => `https://files.example/${filePath}`,
            path: (filePath: string) => filePath,
            handler: () => {
                throw new Error('not implemented')
            },
            getFile: async () => ONE_PIXEL_PNG,
            putFile: async (fileContent, filePath = '') => {
                this.putFileMock(fileContent, filePath)
                return {
                    fieldname: 'file',
                    key: filePath,
                    originalname: path.basename(filePath),
                    size: Buffer.isBuffer(fileContent) ? fileContent.length : 0,
                    filename: path.basename(filePath),
                    url: `https://files.example/${filePath}`,
                    path: filePath
                }
            },
            deleteFile: async () => undefined
        }
    }
}

describe('PdfFileParser', () => {
    const source = {
        filePath: '/tmp/report.pdf',
        originalName: 'report.pdf',
        mimeType: 'application/pdf',
        derivedOutput: {
            directory: 'contexts/tenant-1/file-understanding/file-1/run-1',
            parseRunId: 'run-1',
            storageProvider: 'LOCAL'
        }
    }

    afterEach(() => {
        jest.clearAllMocks()
        delete process.env.FILE_UNDERSTANDING_PDF_RENDER_MAX_PAGES
    })

    it('parses text PDFs and emits page image artifacts', async () => {
        mockPdfLoaderLoad.mockResolvedValue([
            {
                pageContent: 'Quarterly report text',
                metadata: { loc: { pageNumber: 1 } }
            }
        ])
        const parser = new TestPdfFileParser()

        const result = await parser.parse(source)

        expect(result.status).toBe('ready')
        expect(result.capabilities).toEqual(expect.arrayContaining(['search', 'read', 'page_images', 'vision']))
        expect(result.artifacts.map((artifact) => artifact.kind)).toEqual(['summary', 'page_text', 'page_image'])
        const pageImage = result.artifacts.find((artifact) => artifact.kind === 'page_image')
        expect(pageImage).toEqual(
            expect.objectContaining({
                mimeType: 'image/png',
                anchor: { page: 1, path: 'page-0001.png' },
                metadata: expect.objectContaining({
                    page: 1,
                    fileName: 'page-0001.png',
                    storageKey: 'contexts/tenant-1/file-understanding/file-1/run-1/pages/page-0001.png',
                    url: 'https://files.example/contexts/tenant-1/file-understanding/file-1/run-1/pages/page-0001.png',
                    width: 1,
                    height: 1,
                    renderScale: 2,
                    parseRunId: 'run-1'
                })
            })
        )
        expect(JSON.stringify(pageImage?.metadata)).not.toContain('/tmp/report.pdf')
    })

    it('keeps image-only PDFs partial while still emitting page images', async () => {
        mockPdfLoaderLoad.mockResolvedValue([
            {
                pageContent: '',
                metadata: { loc: { pageNumber: 1 } }
            }
        ])
        const parser = new TestPdfFileParser()

        const result = await parser.parse(source)

        expect(result.status).toBe('partial')
        expect(result.summary).toBe('PDF parsed without extractable text. OCR is required.')
        expect(result.capabilities).toEqual(expect.arrayContaining(['ocr', 'vision', 'page_images']))
        expect(result.artifacts.some((artifact) => artifact.kind === 'page_image')).toBe(true)
    })

    it('interleaves mixed PDF text and page images by page', async () => {
        mockPdfLoaderLoad.mockResolvedValue([
            {
                pageContent: 'Page one text',
                metadata: { loc: { pageNumber: 1 } }
            },
            {
                pageContent: 'Page two text with chart',
                metadata: { loc: { pageNumber: 2 } }
            }
        ])
        const parser = new TestPdfFileParser()
        parser.document = {
            length: 2,
            getPage: async () => ONE_PIXEL_PNG,
            destroy: async () => {
                parser.destroyMock()
            }
        }

        const result = await parser.parse(source)

        expect(result.artifacts.map((artifact) => artifact.kind)).toEqual([
            'summary',
            'page_text',
            'page_image',
            'page_text',
            'page_image'
        ])
        expect(result.artifacts.filter((artifact) => artifact.kind === 'page_image')).toHaveLength(2)
    })

    it('respects the configured PDF page image limit', async () => {
        process.env.FILE_UNDERSTANDING_PDF_RENDER_MAX_PAGES = '1'
        mockPdfLoaderLoad.mockResolvedValue([
            {
                pageContent: 'Page one',
                metadata: { loc: { pageNumber: 1 } }
            },
            {
                pageContent: 'Page two',
                metadata: { loc: { pageNumber: 2 } }
            }
        ])
        const parser = new TestPdfFileParser()
        parser.document = {
            length: 2,
            getPage: async () => ONE_PIXEL_PNG,
            destroy: async () => {
                parser.destroyMock()
            }
        }

        const result = await parser.parse(source)

        expect(result.status).toBe('partial')
        expect(result.artifacts.filter((artifact) => artifact.kind === 'page_image')).toHaveLength(1)
        expect(result.metadata?.pdfPageImages).toEqual(
            expect.objectContaining({
                pageCount: 2,
                renderedPageCount: 1,
                truncated: true,
                maxPages: 1
            })
        )
    })
})
