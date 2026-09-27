import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { OfficeFileParser } from './office.parser'

const mockDocxLoad = jest.fn()
const mockPptxLoad = jest.fn()
const mockExtract = jest.fn()

jest.mock('@langchain/community/document_loaders/fs/docx', () => ({
    DocxLoader: jest.fn().mockImplementation(() => ({ load: mockDocxLoad }))
}))
jest.mock('@langchain/community/document_loaders/fs/pptx', () => ({
    PPTXLoader: jest.fn().mockImplementation(() => ({ load: mockPptxLoad }))
}))
jest.mock('node:module', () => ({
    createRequire: () => () =>
        class {
            extract = mockExtract
        }
}))

describe('OfficeFileParser content detection', () => {
    let directory: string
    const parser = new OfficeFileParser()

    beforeEach(async () => {
        jest.clearAllMocks()
        directory = await mkdtemp(join(tmpdir(), 'office-parser-'))
        mockExtract.mockResolvedValue({ getBody: () => 'Tender scope\r\nScoring criteria' })
        mockDocxLoad.mockResolvedValue([{ pageContent: 'OOXML content', metadata: {} }])
        mockPptxLoad.mockResolvedValue([{ pageContent: 'Slide content', metadata: {} }])
    })

    afterEach(() => rm(directory, { recursive: true, force: true }))

    it('reads binary Word stored under a DOCX filename even when a ZIP trailer exists', async () => {
        const filePath = join(directory, 'upload')
        await writeFile(
            filePath,
            Buffer.concat([
                Buffer.from('d0cf11e0a1b11ae1', 'hex'),
                Buffer.from('binary Word PK\x03\x04embedded WPS data')
            ])
        )
        const result = await parser.parse({
            filePath,
            originalName: 'tender.docx',
            mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        })
        expect(mockExtract).toHaveBeenCalledWith(filePath)
        expect(mockDocxLoad).not.toHaveBeenCalled()
        expect(result.artifacts).toContainEqual({
            kind: 'text',
            content: 'Tender scope\nScoring criteria',
            mimeType: 'text/plain'
        })
    })

    it('keeps genuine OOXML files on the DOCX loader', async () => {
        const filePath = join(directory, 'tender.docx')
        await writeFile(filePath, Buffer.from('PK\x03\x04OOXML'))
        await parser.parse({ filePath })
        expect(mockDocxLoad).toHaveBeenCalledTimes(1)
        expect(mockExtract).not.toHaveBeenCalled()
    })

    it('does not reinterpret a truncated signature as binary Word', async () => {
        const filePath = join(directory, 'truncated.docx')
        await writeFile(filePath, Buffer.from('d0cf11', 'hex'))
        mockDocxLoad.mockRejectedValueOnce(new Error('Invalid OOXML'))
        await expect(parser.parse({ filePath })).rejects.toThrow('Invalid OOXML')
        expect(mockExtract).not.toHaveBeenCalled()
    })

    it('preserves existing DOC and presentation routing', async () => {
        await parser.parse({ filePath: join(directory, 'tender.doc') })
        await parser.parse({ filePath: join(directory, 'slides.pptx') })
        expect(mockExtract).toHaveBeenCalledTimes(1)
        expect(mockPptxLoad).toHaveBeenCalledTimes(1)
        expect(mockDocxLoad).not.toHaveBeenCalled()
    })

    it('reports a missing file instead of falling back to another loader', async () => {
        await expect(parser.parse({ filePath: join(directory, 'missing.docx') })).rejects.toThrow('ENOENT')
        expect(mockDocxLoad).not.toHaveBeenCalled()
        expect(mockExtract).not.toHaveBeenCalled()
    })
})
