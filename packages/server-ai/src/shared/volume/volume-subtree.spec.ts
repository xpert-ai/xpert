import { link, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'fs/promises'
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

        const target = await client.getDownloadTarget('', 'docs')
        expect(target).toMatchObject({
            fileName: 'docs.zip',
            mimeType: 'application/zip',
            type: 'directory'
        })
        const archivePaths: string[] = []
        if (target.type === 'directory') {
            for await (const entry of target.entries) {
                archivePaths.push(entry.archivePath)
            }
            await target.directoryHandle.close().catch(() => undefined)
        }
        expect(archivePaths).toEqual(['nested/', 'nested/readme.md'])
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

    it('returns project file metadata without a direct URL or reading file contents', async () => {
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
            size: 2 * 1024 * 1024
        })
        const file = await client.readFile('', 'files/report.xlsx', { metadataOnly: true })
        expect(file.fileUrl).toBeUndefined()
        expect(file.url).toBeUndefined()
    })

    it('omits direct URLs for user-isolated xpert files so callers use authenticated downloads', async () => {
        tempRoot = await mkdtemp(join(tmpdir(), 'volume-subtree-user-xpert-'))
        await mkdir(join(tempRoot, 'files'), { recursive: true })
        await writeFile(join(tempRoot, 'files', 'report.pdf'), Buffer.from('%PDF-1.4'))

        const volume = new VolumeHandle(
            {
                tenantId: 'tenant-1',
                catalog: 'user-xperts',
                userId: 'user-1',
                xpertId: 'xpert-1'
            },
            tempRoot,
            tempRoot,
            'http://localhost/volume/user/user-1/xpert/xpert-1'
        )
        const client = new VolumeSubtreeClient(volume, { allowRootWorkspace: true })

        const files = await client.list('', { path: 'files', deepth: 1 })
        expect(files[0]).toMatchObject({ fullPath: 'files/report.pdf' })
        expect(files[0].url).toBeUndefined()

        const file = await client.readFile('', 'files/report.pdf', { metadataOnly: true })
        expect(file.fileUrl).toBeUndefined()
        expect(file.url).toBeUndefined()
    })

    it('keeps direct URLs for legacy shared xpert files', async () => {
        tempRoot = await mkdtemp(join(tmpdir(), 'volume-subtree-shared-xpert-'))
        await mkdir(join(tempRoot, 'files'), { recursive: true })
        await writeFile(join(tempRoot, 'files', 'report.pdf'), Buffer.from('%PDF-1.4'))

        const volume = new VolumeHandle(
            {
                tenantId: 'tenant-1',
                catalog: 'xperts',
                xpertId: 'xpert-1',
                isolateByUser: false
            },
            tempRoot,
            tempRoot,
            'http://localhost/volume/xpert/xpert-1'
        )
        const client = new VolumeSubtreeClient(volume, { allowRootWorkspace: true })

        await expect(client.readFile('', 'files/report.pdf', { metadataOnly: true })).resolves.toMatchObject({
            fileUrl: 'http://localhost/volume/xpert/xpert-1/files/report.pdf',
            url: 'http://localhost/volume/xpert/xpert-1/files/report.pdf'
        })
    })

    it('rejects reads, writes, uploads, and deletes through a symlink outside the volume root', async () => {
        tempRoot = await mkdtemp(join(tmpdir(), 'volume-subtree-symlink-'))
        const volumeRoot = join(tempRoot, 'volume')
        const privateRoot = join(tempRoot, 'private')
        await mkdir(volumeRoot)
        await mkdir(privateRoot)
        await writeFile(join(privateRoot, 'secret.md'), 'secret', 'utf8')
        await symlink(privateRoot, join(volumeRoot, 'escape'))

        const volume = new VolumeHandle(
            {
                tenantId: 'tenant-1',
                catalog: 'user-xperts',
                userId: 'user-1',
                xpertId: 'xpert-1'
            },
            volumeRoot,
            volumeRoot,
            'http://localhost/volume/user/user-1/xpert/xpert-1'
        )
        const client = new VolumeSubtreeClient(volume, { allowRootWorkspace: true })

        await expect(client.readBuffer('', 'escape/secret.md')).rejects.toBeInstanceOf(Error)
        await expect(client.saveFile('', 'escape/secret.md', 'overwritten')).rejects.toBeInstanceOf(Error)
        await expect(
            client.uploadFile('', 'escape', { originalname: 'uploaded.txt', buffer: Buffer.from('uploaded') })
        ).rejects.toBeInstanceOf(Error)
        await expect(client.deleteFile('', 'escape/secret.md')).rejects.toBeInstanceOf(Error)
        await expect(readFile(join(privateRoot, 'secret.md'), 'utf8')).resolves.toBe('secret')
        await expect(readFile(join(privateRoot, 'uploaded.txt'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    })

    it('allows a final file symlink when its target remains inside the volume root', async () => {
        tempRoot = await mkdtemp(join(tmpdir(), 'volume-subtree-internal-symlink-'))
        await mkdir(join(tempRoot, 'files'))
        await writeFile(join(tempRoot, 'files', 'report.txt'), 'report', 'utf8')
        await symlink(join(tempRoot, 'files', 'report.txt'), join(tempRoot, 'latest.txt'))

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

        await expect(client.readBuffer('', 'latest.txt')).resolves.toEqual(Buffer.from('report'))
    })

    it('rejects Project content mutations through internal directory and file symlinks', async () => {
        tempRoot = await mkdtemp(join(tmpdir(), 'volume-subtree-project-content-symlink-'))
        await mkdir(join(tempRoot, 'shared'), { recursive: true })
        await mkdir(join(tempRoot, 'skills', 'research'), { recursive: true })
        await writeFile(join(tempRoot, 'project.md'), '# Original\n', 'utf8')
        await writeFile(join(tempRoot, 'skills', 'research', 'SKILL.md'), '# Research\n', 'utf8')
        await symlink('..', join(tempRoot, 'shared', 'project-root'))
        await symlink(join(tempRoot, 'project.md'), join(tempRoot, 'shared', 'instructions.md'))

        const volume = new VolumeHandle(
            {
                tenantId: 'tenant-1',
                catalog: 'projects',
                projectId: 'project-1'
            },
            tempRoot,
            tempRoot,
            'http://localhost/volume/project/project-1'
        )
        const client = new VolumeSubtreeClient(volume, { allowRootWorkspace: true })

        await expect(client.saveFile('', 'shared/instructions.md', '# Replaced\n')).rejects.toBeInstanceOf(Error)
        await expect(
            client.uploadFile('', 'shared/project-root/skills/research', {
                originalname: 'notes.md',
                buffer: Buffer.from('# Notes\n')
            })
        ).rejects.toBeInstanceOf(Error)
        await expect(client.deleteFile('', 'shared/project-root/skills/research')).rejects.toBeInstanceOf(Error)

        await expect(readFile(join(tempRoot, 'project.md'), 'utf8')).resolves.toBe('# Original\n')
        await expect(readFile(join(tempRoot, 'skills', 'research', 'SKILL.md'), 'utf8')).resolves.toBe('# Research\n')
        await expect(readFile(join(tempRoot, 'skills', 'research', 'notes.md'), 'utf8')).rejects.toMatchObject({
            code: 'ENOENT'
        })
    })

    it('rejects Project writes through a hard link to governed content', async () => {
        tempRoot = await mkdtemp(join(tmpdir(), 'volume-subtree-project-content-hardlink-'))
        await mkdir(join(tempRoot, 'shared'), { recursive: true })
        await writeFile(join(tempRoot, 'project.md'), '# Original\n', 'utf8')
        await link(join(tempRoot, 'project.md'), join(tempRoot, 'shared', 'instructions.md'))

        const volume = new VolumeHandle(
            {
                tenantId: 'tenant-1',
                catalog: 'projects',
                projectId: 'project-1'
            },
            tempRoot,
            tempRoot,
            'http://localhost/volume/project/project-1'
        )
        const client = new VolumeSubtreeClient(volume, { allowRootWorkspace: true })

        await expect(client.saveFile('', 'shared/instructions.md', '# Replaced\n')).rejects.toBeInstanceOf(Error)
        await expect(
            client.uploadFile('', 'shared', {
                originalname: 'instructions.md',
                buffer: Buffer.from('# Replaced\n')
            })
        ).rejects.toBeInstanceOf(Error)
        await expect(readFile(join(tempRoot, 'project.md'), 'utf8')).resolves.toBe('# Original\n')
    })
})
