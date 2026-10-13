import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { VolumeHandle, resolveXpertDataVolumeScope } from '../../shared/volume'
import { AssistantFilesService } from './assistant-files.service'

/** Filesystem behavior; real published Assistant ACL is exercised by assistant-files.integration.spec. */
describe('AssistantFilesService storage', () => {
    let root: string
    let user: string
    let dataScope: 'shared' | 'user'
    let service: AssistantFilesService
    let commands: { execute: jest.Mock }
    beforeEach(async () => {
        root = await mkdtemp(path.join(tmpdir(), 'assistant-files-'))
        user = 'user-a'
        dataScope = 'shared'
        commands = {
            execute: jest.fn(async () => ({
                scope: resolveXpertDataVolumeScope({
                    tenantId: 'tenant',
                    xpertId: 'assistant',
                    userId: user,
                    workspaceDataScope: dataScope
                })
            }))
        }
        service = new AssistantFilesService(commands, {
            resolve: (scope) => {
                const directory = path.join(
                    root,
                    scope.catalog,
                    scope.catalog === 'user-xperts' ? scope.userId : 'shared'
                )
                return new VolumeHandle(scope, directory, directory, 'http://localhost/files', root)
            }
        })
    })
    afterEach(async () => {
        await rm(root, { recursive: true, force: true })
    })
    const file = () =>
        ({
            originalname: 'report.html',
            buffer: Buffer.from('<html></html>'),
            mimetype: 'text/html',
            size: 13
        }) as Express.Multer.File

    it('uploads atomically to a content-addressed folder and returns a portable reference', async () => {
        const input = file()
        const files = service.forRuntime('assistant')
        const reference = await files.upload(input)
        expect(reference).toMatchObject({
            source: 'platform.workspace.files',
            tenantId: 'tenant',
            catalog: 'xperts',
            scopeId: 'assistant',
            xpertId: 'assistant',
            originalName: 'report.html',
            size: 13,
            filePath: `uploads/${createHash('sha256').update(input.buffer).digest('hex')}/report.html`
        })
        expect(await files.upload(input)).toEqual(reference)
        await expect(files.read(reference.filePath)).resolves.toMatchObject({ contents: '<html></html>' })
        expect(commands.execute.mock.calls.every(([command]) => command.entry === 'runtime')).toBe(true)
    })

    it('initializes a missing workspace and lists without requiring a conversation', async () => {
        const files = service.forRuntime('assistant')
        await expect(files.list()).resolves.toEqual([])
        await files.uploadToFolder('reports', file())
        await expect(files.list('reports')).resolves.toEqual([expect.objectContaining({ filePath: 'report.html' })])
    })

    it('binds every upload and read to the current user for user-isolated workspaces', async () => {
        dataScope = 'user'
        const files = service.forRuntime('assistant')
        const a = await files.upload(file())
        expect(a).toMatchObject({ userId: 'user-a', catalog: 'user-xperts' })
        user = 'user-b'
        await expect(files.read(a.filePath)).rejects.toMatchObject({ code: 'ENOENT' })
        const b = await files.upload(file())
        expect(b).toMatchObject({ userId: 'user-b', catalog: 'user-xperts' })
        expect(b.filePath).toBe(a.filePath)
    })

    it('preserves Studio authority for upload, and never silently changes runtime authority', async () => {
        await service.forAuthoring('assistant').upload(file())
        expect(commands.execute).toHaveBeenLastCalledWith(
            expect.objectContaining({ entry: 'authoring', operation: 'write' })
        )
        await service.forRuntime('assistant').upload(file())
        expect(commands.execute).toHaveBeenLastCalledWith(
            expect.objectContaining({ entry: 'runtime', operation: 'write' })
        )
    })
})
