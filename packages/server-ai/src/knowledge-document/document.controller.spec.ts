import fsPromises from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import { finished } from 'node:stream/promises'
import { KnowledgeDocumentController } from './document.controller'

class TestResponse extends PassThrough {
    statusCode = 200
    readonly headers = new Map<string, string>()

    setHeader(name: string, value: string | number) {
        this.headers.set(name.toLowerCase(), String(value))
        return this
    }

    status(code: number) {
        this.statusCode = code
        return this
    }
}

describe('KnowledgeDocumentController original file preview', () => {
    let rootPath: string
    let filePath: string
    let controller: KnowledgeDocumentController

    beforeEach(async () => {
        rootPath = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'xpert-original-preview-'))
        filePath = path.join(rootPath, 'manual.pdf')
        await fsPromises.writeFile(filePath, Buffer.from('0123456789'))
        controller = new KnowledgeDocumentController(
            {
                getOriginalFilePreviewTarget: jest.fn(async () => ({
                    absolutePath: filePath,
                    fileName: 'manual.pdf',
                    mimeType: 'application/pdf'
                }))
            } as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never
        )
    })

    afterEach(async () => {
        await fsPromises.rm(rootPath, { recursive: true, force: true })
    })

    it('streams the complete PDF with 200 and Range capability headers', async () => {
        const response = new TestResponse()
        const chunks: Buffer[] = []
        response.on('data', (chunk) => chunks.push(Buffer.from(chunk)))

        await controller.previewOriginalFile('doc-1', { headers: {} } as never, response as never)
        await finished(response)

        expect(response.statusCode).toBe(200)
        expect(response.headers.get('accept-ranges')).toBe('bytes')
        expect(response.headers.get('content-length')).toBe('10')
        expect(Buffer.concat(chunks).toString()).toBe('0123456789')
    })

    it('serves a bounded byte range with 206', async () => {
        const response = new TestResponse()
        const chunks: Buffer[] = []
        response.on('data', (chunk) => chunks.push(Buffer.from(chunk)))

        await controller.previewOriginalFile('doc-1', { headers: { range: 'bytes=2-5' } } as never, response as never)
        await finished(response)

        expect(response.statusCode).toBe(206)
        expect(response.headers.get('content-range')).toBe('bytes 2-5/10')
        expect(response.headers.get('content-length')).toBe('4')
        expect(Buffer.concat(chunks).toString()).toBe('2345')
    })

    it('returns 416 for an unsatisfiable range', async () => {
        const response = new TestResponse()

        await controller.headOriginalFile('doc-1', { headers: { range: 'bytes=10-' } } as never, response as never)

        expect(response.statusCode).toBe(416)
        expect(response.headers.get('content-range')).toBe('bytes */10')
    })

    it('supports HEAD without reading the PDF body', async () => {
        const response = new TestResponse()
        const chunks: Buffer[] = []
        response.on('data', (chunk) => chunks.push(Buffer.from(chunk)))

        await controller.headOriginalFile('doc-1', { headers: {} } as never, response as never)

        expect(response.statusCode).toBe(200)
        expect(response.headers.get('content-length')).toBe('10')
        expect(chunks).toHaveLength(0)
    })
})
