jest.mock('@xpert-ai/server-core', () => ({
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
import { RequestContext } from '@xpert-ai/server-core'
import { createHash } from 'node:crypto'
import { XpertWorkspaceFilesService } from './xpert-workspace-files.service'

describe('XpertWorkspaceFilesService', () => {
    it('uploads through a server-scoped xpert workspace and returns the portable reference', async () => {
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
            findOne: jest.fn().mockResolvedValue({ id: 'xpert-1', tenantId: 'tenant-1' })
        }
        const service = new XpertWorkspaceFilesService(xpertService, { createScopedApi })
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
                findOne: jest.fn().mockResolvedValue({ id: 'xpert-1', tenantId: 'tenant-1' })
            },
            { createScopedApi }
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
})
