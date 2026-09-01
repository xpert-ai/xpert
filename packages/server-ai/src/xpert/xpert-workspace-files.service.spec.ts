jest.mock('@xpert-ai/plugin-sdk', () => ({
    ...jest.requireActual('@xpert-ai/plugin-sdk'),
    RequestContext: {
        currentUserId: jest.fn()
    }
}))

jest.mock('../shared/runtime/workspace-files-runtime-capability.service', () => ({
    WorkspaceFilesRuntimeCapabilityService: class WorkspaceFilesRuntimeCapabilityService {}
}))

jest.mock('./xpert.service', () => ({
    XpertService: class XpertService {}
}))

import type { IArtifactWorkspaceFileReference } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { VolumeHandle, VolumeSubtreeClient } from '../shared/volume'
import { XpertWorkspaceFilesService } from './xpert-workspace-files.service'

describe('XpertWorkspaceFilesService', () => {
    afterEach(() => {
        jest.restoreAllMocks()
    })

    it('uploads through a server-scoped shared Xpert workspace and returns the portable reference', async () => {
        jest.mocked(RequestContext.currentUserId).mockReturnValue('user-1')
        const reference: IArtifactWorkspaceFileReference = {
            source: 'platform.workspace.files',
            filePath: 'imports/report.html',
            workspacePath: '/workspace/imports/report.html',
            tenantId: 'tenant-1',
            userId: 'user-1',
            catalog: 'xperts',
            scopeId: 'xpert-1',
            xpertId: 'xpert-1',
            isolateByUser: false,
            originalName: 'report.html',
            name: 'report.html',
            mimeType: 'text/html',
            size: 13
        }
        const writeRuntimeBuffer = jest.fn().mockResolvedValue({ reference })
        const createScopedApi = jest.fn().mockReturnValue({ writeRuntimeBuffer })
        const xpertService = {
            findOne: jest.fn().mockResolvedValue({
                id: 'xpert-1',
                tenantId: 'tenant-1',
                workspaceDataScope: 'shared'
            })
        }
        const service = new XpertWorkspaceFilesService(xpertService, { createScopedApi }, { resolve: jest.fn() })
        const file = {
            originalname: 'report.html',
            mimetype: 'text/html',
            size: 13,
            buffer: Buffer.from('<html></html>')
        } as Express.Multer.File
        const contentSha256 = createHash('sha256').update(file.buffer).digest('hex')

        await expect(service.upload('xpert-1', file)).resolves.toEqual(reference)
        expect(xpertService.findOne).toHaveBeenCalledWith('xpert-1')
        expect(createScopedApi).toHaveBeenCalledWith({
            tenantId: 'tenant-1',
            userId: 'user-1',
            xpertId: 'xpert-1',
            catalog: 'xperts',
            scopeId: 'xpert-1',
            isolateByUser: false
        })
        expect(writeRuntimeBuffer).toHaveBeenCalledWith({
            folder: `uploads/${contentSha256}`,
            fileName: 'report.html',
            buffer: file.buffer,
            originalName: 'report.html',
            mimeType: 'text/html',
            size: 13
        })
    })

    it('uses the same content-addressed destination for identical bytes', async () => {
        jest.mocked(RequestContext.currentUserId).mockReturnValue('user-1')
        const writeRuntimeBuffer = jest.fn().mockResolvedValue({
            reference: {
                source: 'platform.workspace.files',
                filePath: 'uploads/content/report.html',
                workspacePath: '/workspace/uploads/content/report.html'
            }
        })
        const createScopedApi = jest.fn().mockReturnValue({ writeRuntimeBuffer })
        const service = new XpertWorkspaceFilesService(
            {
                findOne: jest.fn().mockResolvedValue({
                    id: 'xpert-1',
                    tenantId: 'tenant-1',
                    workspaceDataScope: 'shared'
                })
            },
            { createScopedApi },
            { resolve: jest.fn() }
        )
        const file = {
            originalname: 'report.html',
            mimetype: 'text/html',
            size: 13,
            buffer: Buffer.from('<html></html>')
        } as Express.Multer.File

        await service.upload('xpert-1', file)
        await service.upload('xpert-1', file)

        expect(writeRuntimeBuffer).toHaveBeenCalledTimes(2)
        expect(writeRuntimeBuffer.mock.calls[0][0].folder).toBe(writeRuntimeBuffer.mock.calls[1][0].folder)
        expect(writeRuntimeBuffer.mock.calls[0][0]).not.toEqual(
            expect.objectContaining({
                tenantId: expect.anything(),
                xpertId: expect.anything(),
                catalog: expect.anything()
            })
        )
    })

    it('lists the bound xpert workspace without requiring a conversation', async () => {
        jest.mocked(RequestContext.currentUserId).mockReturnValue('user-1')
        const ensureRoot = jest.fn()
        const volume = { name: 'xpert-volume', ensureRoot }
        ensureRoot.mockResolvedValue(volume)
        const resolve = jest.fn().mockReturnValue(volume)
        const list = jest.spyOn(VolumeSubtreeClient.prototype, 'list').mockResolvedValue([])
        const service = new XpertWorkspaceFilesService(
            {
                findOne: jest.fn().mockResolvedValue({
                    id: 'xpert-1',
                    tenantId: 'tenant-1',
                    workspaceDataScope: 'shared'
                })
            },
            { createScopedApi: jest.fn() },
            { resolve }
        )

        await expect(service.list('xpert-1', 'files', 2)).resolves.toEqual([])

        expect(resolve).toHaveBeenCalledWith({
            tenantId: 'tenant-1',
            catalog: 'xperts',
            userId: 'user-1',
            xpertId: 'xpert-1',
            isolateByUser: false
        })
        expect(list).toHaveBeenCalledWith('', { path: 'files', deepth: 2 })
    })

    it('initializes a missing xpert workspace before listing it for the first time', async () => {
        jest.mocked(RequestContext.currentUserId).mockReturnValue('user-1')
        const provisioningRoot = await mkdtemp(path.join(tmpdir(), 'xpert-workspace-files-'))
        const workspaceRoot = path.join(provisioningRoot, 'xpert', 'xpert-1')
        const volume = new VolumeHandle(
            {
                tenantId: 'tenant-1',
                catalog: 'xperts',
                userId: 'user-1',
                xpertId: 'xpert-1',
                isolateByUser: false
            },
            workspaceRoot,
            workspaceRoot,
            'http://localhost/volume/xpert/xpert-1',
            provisioningRoot
        )
        const service = new XpertWorkspaceFilesService(
            {
                findOne: jest.fn().mockResolvedValue({
                    id: 'xpert-1',
                    tenantId: 'tenant-1',
                    workspaceDataScope: 'shared'
                })
            },
            { createScopedApi: jest.fn() },
            { resolve: jest.fn().mockReturnValue(volume) }
        )

        try {
            await expect(service.list('xpert-1')).resolves.toEqual([])
        } finally {
            await rm(provisioningRoot, { recursive: true, force: true })
        }
    })

    it('resolves the same user-scoped Xpert to distinct volumes for two users', async () => {
        const ensureRoot = jest.fn()
        const volume = { ensureRoot }
        ensureRoot.mockResolvedValue(volume)
        const resolve = jest.fn().mockReturnValue(volume)
        const list = jest.spyOn(VolumeSubtreeClient.prototype, 'list').mockResolvedValue([])
        const xpertService = {
            findOne: jest.fn().mockResolvedValue({
                id: 'xpert-1',
                tenantId: 'tenant-1',
                workspaceDataScope: 'user'
            })
        }
        const service = new XpertWorkspaceFilesService(xpertService, { createScopedApi: jest.fn() }, { resolve })

        jest.mocked(RequestContext.currentUserId).mockReturnValue('user-a')
        await service.list('xpert-1')
        jest.mocked(RequestContext.currentUserId).mockReturnValue('user-b')
        await service.list('xpert-1')

        expect(resolve.mock.calls.map(([scope]) => scope)).toEqual([
            { tenantId: 'tenant-1', catalog: 'user-xperts', userId: 'user-a', xpertId: 'xpert-1' },
            { tenantId: 'tenant-1', catalog: 'user-xperts', userId: 'user-b', xpertId: 'xpert-1' }
        ])
        expect(list).toHaveBeenCalledTimes(2)
    })

    it('binds upload to the current user when the Xpert workspace is user-scoped', async () => {
        jest.mocked(RequestContext.currentUserId).mockReturnValue('user-a')
        const createScopedApi = jest.fn().mockReturnValue({
            writeRuntimeBuffer: jest.fn().mockResolvedValue({ reference: { filePath: 'uploads/a.txt' } })
        })
        const service = new XpertWorkspaceFilesService(
            {
                findOne: jest.fn().mockResolvedValue({
                    id: 'xpert-1',
                    tenantId: 'tenant-1',
                    workspaceDataScope: 'user'
                })
            },
            { createScopedApi },
            { resolve: jest.fn() }
        )

        await service.upload('xpert-1', {
            originalname: 'a.txt',
            mimetype: 'text/plain',
            size: 1,
            buffer: Buffer.from('a')
        } as Express.Multer.File)

        expect(createScopedApi).toHaveBeenCalledWith({
            tenantId: 'tenant-1',
            catalog: 'user-xperts',
            userId: 'user-a',
            xpertId: 'xpert-1',
            scopeId: 'xpert-1'
        })
    })
})
