jest.mock('@xpert-ai/server-core', () =>
    jest.requireActual('../../../../server/src/file/file-upload/file-content-type')
)

import JSZip from 'jszip'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ArchiveFileParser } from './archive.parser'
import { SpreadsheetFileParser } from './spreadsheet.parser'

describe('binary contents in declared text files', () => {
    let directory: string
    beforeEach(async () => {
        directory = await mkdtemp(join(tmpdir(), 'binary-parser-'))
    })
    afterEach(() => rm(directory, { recursive: true, force: true }))

    it('keeps binary ZIP entries accessible in the manifest without indexing their bytes as text', async () => {
        const zip = new JSZip()
        zip.file('student/notes.txt', 'Student: Alice')
        zip.file('student/binary.txt', Buffer.from([0xff, 0x00, 0xfe]))
        const filePath = join(directory, 'students.zip')
        await writeFile(filePath, await zip.generateAsync({ type: 'nodebuffer' }))

        const result = await new ArchiveFileParser().parse({ filePath })
        const texts = result.artifacts.filter((artifact) => artifact.kind === 'text')
        expect(texts).toHaveLength(1)
        expect(texts[0].content).toBe('Student: Alice')
        expect(result.artifacts.find((artifact) => artifact.kind === 'file_manifest')?.content).toContain(
            'student/binary.txt'
        )
        expect(result.capabilities).toContain('workspace')
    })

    it.each(['csv', 'tsv'])('does not decode binary bytes in %s as table text', async (extension) => {
        const filePath = join(directory, 'data.' + extension)
        await writeFile(filePath, Buffer.from('PK\x03\x04binary'))
        await expect(new SpreadsheetFileParser().parse({ filePath })).rejects.toMatchObject({
            name: 'UnsupportedFileContentError'
        })
    })

    it('preserves valid CSV text and its table metadata', async () => {
        const filePath = join(directory, 'data.csv')
        const content = 'Name,Score\nAlice,90'
        await writeFile(filePath, content)
        const result = await new SpreadsheetFileParser().parse({ filePath })
        expect(result.artifacts).toContainEqual(
            expect.objectContaining({
                kind: 'table',
                content,
                metadata: { delimiter: ',' }
            })
        )
    })
})
