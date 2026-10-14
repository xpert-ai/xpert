import { RequestContext } from '@xpert-ai/server-core'
import { VolumeClient, VolumeHandle, VolumeSubtreeClient } from '../../../shared/volume'
import { ReadFileAssetSourceQuery } from '../read-file-asset-source.query'
import { ReadFileAssetSourceHandler } from './read-file-asset-source.handler'

describe('ReadFileAssetSourceHandler', () => {
    afterEach(() => {
        jest.restoreAllMocks()
    })

    it.each(['human-owner', 'technical-user'])(
        'reads a technical conversation attachment from its persisted %s volume',
        async (fileOwner) => {
            const asset = {
                id: 'asset',
                tenantId: 'tenant',
                userId: fileOwner,
                xpertId: 'assistant',
                workspacePath: 'sessions/conversation/files/asset/note.txt'
            }
            const access = {
                resolve: jest.fn().mockResolvedValue({
                    asset,
                    conversation: {
                        id: 'conversation',
                        tenantId: 'tenant',
                        createdById: 'technical-user',
                        xpertId: 'assistant',
                        xpert: { workspaceDataScope: 'user' }
                    }
                })
            }
            const volumes = { resolve: jest.fn((scope) => new VolumeHandle(scope, '/tmp/source', '/tmp/source', '')) }
            jest.spyOn(VolumeSubtreeClient.prototype, 'readBuffer').mockResolvedValue(Buffer.from('bytes'))
            const handler = new ReadFileAssetSourceHandler(access as never, volumes)
            await expect(
                handler.execute(new ReadFileAssetSourceQuery('asset', { kind: 'conversation', threadId: 'thread' }))
            ).resolves.toEqual(Buffer.from('bytes'))
            expect(volumes.resolve).toHaveBeenCalledWith({
                tenantId: 'tenant',
                catalog: 'user-xperts',
                xpertId: 'assistant',
                userId: fileOwner
            })
        }
    )

    it('uses the authorized conversation scope instead of mutable FileAsset scope fields', async () => {
        const fileAsset = {
            id: 'file-asset-1',
            tenantId: 'forged-tenant',
            userId: 'forged-user',
            projectId: 'forged-project',
            xpertId: 'forged-xpert',
            workspacePath: '/workspace/sessions/conversation-1/files/file-asset-1/diagram.png',
            metadata: {
                workspace: {
                    catalog: 'xperts',
                    scopeId: 'forged-xpert',
                    isolateByUser: true,
                    relativePath: 'sessions/conversation-1/files/file-asset-1/diagram.png'
                }
            }
        }
        const fileAssetAccessService = {
            resolve: jest.fn().mockResolvedValue({
                asset: fileAsset,
                conversation: {
                    id: 'conversation-1',
                    tenantId: 'tenant-1',
                    createdById: 'conversation-owner',
                    projectId: 'project-1',
                    xpertId: 'xpert-1'
                }
            })
        }
        const volume = new VolumeHandle(
            {
                tenantId: 'tenant-1',
                catalog: 'projects',
                projectId: 'project-1',
                userId: 'conversation-owner'
            },
            '/tmp/xpert-workspace',
            '/tmp/xpert-workspace',
            'http://localhost:3000/api/sandbox/volume'
        )
        const volumeClient = { resolve: jest.fn().mockReturnValue(volume) }
        const readBuffer = jest
            .spyOn(VolumeSubtreeClient.prototype, 'readBuffer')
            .mockResolvedValue(Buffer.from('image bytes'))
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user-1')
        const handler = new ReadFileAssetSourceHandler(
            fileAssetAccessService as never,
            volumeClient as Pick<VolumeClient, 'resolve'>
        )

        await expect(
            handler.execute(
                new ReadFileAssetSourceQuery('file-asset-1', { kind: 'conversation', threadId: 'thread-1' })
            )
        ).resolves.toEqual(Buffer.from('image bytes'))
        expect(fileAssetAccessService.resolve).toHaveBeenCalledWith({
            locator: { fileAssetId: 'file-asset-1' },
            authority: { kind: 'conversation', threadId: 'thread-1' },
            operation: 'read'
        })
        expect(volumeClient.resolve).toHaveBeenCalledWith({
            tenantId: 'tenant-1',
            catalog: 'projects',
            projectId: 'project-1',
            userId: 'conversation-owner'
        })
        expect(readBuffer).toHaveBeenCalledWith('', 'sessions/conversation-1/files/file-asset-1/diagram.png')
    })
})
