jest.mock('@xpert-ai/server-core', () =>
    jest.requireActual('../../../../server/src/file/file-upload/file-content-type')
)

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ArchiveFileParser } from './archive.parser'
import { FileParserRegistry } from './file-parser.registry'
import { ImageFileParser } from './image.parser'
import { OfficeFileParser } from './office.parser'
import { PdfFileParser } from './pdf.parser'
import { SpreadsheetFileParser } from './spreadsheet.parser'
import { TextFileParser } from './text.parser'

describe('file parsing type boundary', () => {
    let directory: string
    const textParser = new TextFileParser()
    const registry = new FileParserRegistry(
        textParser,
        new PdfFileParser(),
        new OfficeFileParser(),
        new SpreadsheetFileParser(),
        new ImageFileParser(),
        new ArchiveFileParser()
    )

    beforeEach(async () => {
        directory = await mkdtemp(join(tmpdir(), 'file-type-boundary-'))
    })
    afterEach(() => rm(directory, { recursive: true, force: true }))

    it('does not select the text parser for an unsupported type', () => {
        expect(() => registry.getParser({ filePath: 'model.bin', mimeType: 'application/octet-stream' })).toThrow(
            expect.objectContaining({ name: 'UnsupportedFileContentError' })
        )
    })

    it.each([
        ['notes.txt', 'text'],
        ['notes.md', 'text'],
        ['data.csv', 'spreadsheet'],
        ['resume.pdf', 'pdf'],
        ['resume.docx', 'office'],
        ['grades.xlsx', 'spreadsheet'],
        ['photo.png', 'image'],
        ['students.zip', 'archive']
    ])('keeps %s on its format parser', (filePath, parser) => {
        expect(registry.getParser({ filePath }).name).toBe(parser)
    })

    it('recognizes ZIP MIME without a filename extension', () => {
        expect(registry.getParser({ filePath: 'upload', mimeType: 'application/zip' }).name).toBe('archive')
    })

    it.each([
        Buffer.from('PK\x03\x04archive payload'),
        Buffer.from([0xff, 0xfe, 0xfd]),
        Buffer.from('valid UTF-8 but binary\x00payload')
    ])('rejects binary bytes even when the filename and MIME say text', async (content) => {
        const filePath = join(directory, 'resume.txt')
        await writeFile(filePath, content)
        await expect(textParser.parse({ filePath, mimeType: 'text/plain' })).rejects.toMatchObject({
            name: 'UnsupportedFileContentError'
        })
    })

    it('preserves valid UTF-8 text, whitespace, and an intentional replacement character', async () => {
        const content = '\u7b80\u5386\nName\tScore\r\nA\t90\f\ufffd'
        const filePath = join(directory, 'resume.txt')
        await writeFile(filePath, content)
        const parsed = await textParser.parse({ filePath, mimeType: 'text/plain' })
        expect(parsed.artifacts.find((artifact) => artifact.kind === 'text')?.content).toBe(content)
    })
})
