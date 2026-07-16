import { mkdtemp, mkdir, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { VolumeHandle } from './volume'
import { VolumeSubtreeClient } from './volume-subtree'

describe('VolumeSubtreeClient', () => {
    let tempRoot: string | null = null

    afterEach(async () => {
        if (tempRoot) {
            await rm(tempRoot, { recursive: true, force: true })
            tempRoot = null
        }
    })

    it('deletes folders recursively inside a subtree', async () => {
        tempRoot = await mkdtemp(join(tmpdir(), 'volume-subtree-delete-folder-'))
        await mkdir(join(tempRoot, 'docs', 'nested'), { recursive: true })
        await writeFile(join(tempRoot, 'docs', 'nested', 'readme.md'), 'hello', 'utf8')
        await writeFile(join(tempRoot, 'README.md'), '# Root\n', 'utf8')

        const volume = new VolumeHandle(
            {
                tenantId: 'tenant-1',
                catalog: 'projects',
                projectId: 'project-1'
            },
            tempRoot,
            tempRoot,
            'http://localhost/volume'
        )
        const client = new VolumeSubtreeClient(volume, { allowRootWorkspace: true })

        await client.deleteFile('', 'docs')

        await expect(readFile(join(tempRoot, 'docs', 'nested', 'readme.md'), 'utf8')).rejects.toMatchObject({
            code: 'ENOENT'
        })
        await expect(readFile(join(tempRoot, 'README.md'), 'utf8')).resolves.toBe('# Root\n')
    })

    it('returns zip download metadata for folders inside a subtree', async () => {
        tempRoot = await mkdtemp(join(tmpdir(), 'volume-subtree-download-folder-'))
        await mkdir(join(tempRoot, 'docs', 'nested'), { recursive: true })
        await writeFile(join(tempRoot, 'docs', 'nested', 'readme.md'), 'hello', 'utf8')

        const volume = new VolumeHandle(
            {
                tenantId: 'tenant-1',
                catalog: 'projects',
                projectId: 'project-1'
            },
            tempRoot,
            tempRoot,
            'http://localhost/volume'
        )
        const client = new VolumeSubtreeClient(volume, { allowRootWorkspace: true })

        await expect(client.getDownloadTarget('', 'docs')).resolves.toEqual({
            absolutePath: join(tempRoot, 'docs'),
            fileName: 'docs.zip',
            mimeType: 'application/zip',
            type: 'directory'
        })
    })

    it('reads binary buffers inside a subtree', async () => {
        tempRoot = await mkdtemp(join(tmpdir(), 'volume-subtree-read-buffer-'))
        await mkdir(join(tempRoot, 'files'), { recursive: true })
        await writeFile(join(tempRoot, 'files', 'document.docx'), Buffer.from([0x50, 0x4b, 0x03, 0x04]))

        const volume = new VolumeHandle(
            {
                tenantId: 'tenant-1',
                catalog: 'xperts',
                xpertId: 'xpert-1',
                isolateByUser: false
            },
            tempRoot,
            tempRoot,
            'http://localhost/volume'
        )
        const client = new VolumeSubtreeClient(volume, { allowRootWorkspace: true })

        await expect(client.readBuffer('', 'files/document.docx')).resolves.toEqual(
            Buffer.from([0x50, 0x4b, 0x03, 0x04])
        )
    })

    it('returns file metadata without reading file contents', async () => {
        tempRoot = await mkdtemp(join(tmpdir(), 'volume-subtree-file-metadata-'))
        await mkdir(join(tempRoot, 'files'), { recursive: true })
        await writeFile(join(tempRoot, 'files', 'report.xlsx'), Buffer.alloc(2 * 1024 * 1024))

        const volume = new VolumeHandle(
            {
                tenantId: 'tenant-1',
                catalog: 'projects',
                projectId: 'project-1'
            },
            tempRoot,
            tempRoot,
            'http://localhost/volume'
        )
        const client = new VolumeSubtreeClient(volume, { allowRootWorkspace: true })

        await expect(client.readFile('', 'files/report.xlsx', { metadataOnly: true })).resolves.toMatchObject({
            filePath: 'files/report.xlsx',
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            size: 2 * 1024 * 1024,
            fileUrl: 'http://localhost/volume/files/report.xlsx'
        })
    })
})
