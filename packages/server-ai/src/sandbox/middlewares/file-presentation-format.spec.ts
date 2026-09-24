import JSZip from 'jszip'
import { getFileOutputRule, validateFilePresentationFormat } from './file-presentation-format'

describe('file presentation format validation', () => {
    it.each([
        ['reports/result.DOCX', 'document'],
        ['book.xlsx', 'spreadsheet'],
        ['slides.pptx', 'presentation'],
        ['reports/report.pdf', 'document'],
        ['outputs/result.json', 'file'],
        ['outputs/notes.md', 'document'],
        ['outputs/data.csv', 'spreadsheet']
    ])('classifies %s without tool metadata', (path, kind) => {
        expect(getFileOutputRule(path)?.kind).toBe(kind)
    })
    it.each(['spec.json', 'previews/report.pdf', 'outputs/qa/report.docx', 'tmp/report.xlsx', 'tests/report.pdf'])(
        'classifies selected file %s independently of its directory',
        (path) => {
            expect(getFileOutputRule(path)).toBeDefined()
        }
    )
    it.each(['../report.pdf', '/workspace/report.pdf', '.xpert/internal.json'])('rejects unsafe path %s', (path) => {
        expect(() => getFileOutputRule(path)).toThrow()
    })
    it('allows arbitrary selected formats as downloadable files', async () => {
        const rule = getFileOutputRule('export/custom.data')
        expect(rule).toMatchObject({ kind: 'file', mimeType: 'application/octet-stream', format: 'binary' })
        expect(await validateFilePresentationFormat(Buffer.from([0, 1, 2]), rule)).toBe(true)
    })
    it.each([
        ['docx', 'word/document.xml'],
        ['xlsx', 'xl/workbook.xml'],
        ['pptx', 'ppt/presentation.xml']
    ])('recognizes %s package structure and rejects renamed bytes', async (extension, main) => {
        const rule = getFileOutputRule(`report.${extension}`)!
        expect(await validateFilePresentationFormat(Buffer.from('not an Office file'), rule)).toBe(false)
        const zip = new JSZip()
            .file('[Content_Types].xml', '<Types/>')
            .file('_rels/.rels', '<Relationships/>')
            .file(main, '<root/>')
        expect(await validateFilePresentationFormat(await zip.generateAsync({ type: 'nodebuffer' }), rule)).toBe(true)
        zip.remove(main)
        expect(await validateFilePresentationFormat(await zip.generateAsync({ type: 'nodebuffer' }), rule)).toBe(false)
    })
    it('does not publish partially written JSON, PDF or invalid text', async () => {
        const json = getFileOutputRule('outputs/data.json')!
        expect(await validateFilePresentationFormat(Buffer.from('{'), json)).toBe(false)
        expect(await validateFilePresentationFormat(Buffer.from('{"amount":230}'), json)).toBe(true)
        const pdf = getFileOutputRule('report.pdf')!
        expect(await validateFilePresentationFormat(Buffer.from('%PDF-1.7\npartial'), pdf)).toBe(false)
        expect(await validateFilePresentationFormat(Buffer.from('%PDF-1.7\n%%EOF\n'), pdf)).toBe(true)
        expect(
            await validateFilePresentationFormat(Buffer.from([255, 254]), getFileOutputRule('outputs/notes.md')!)
        ).toBe(false)
    })
})
