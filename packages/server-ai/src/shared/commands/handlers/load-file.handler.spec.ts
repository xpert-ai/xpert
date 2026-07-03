import type { QueryBus } from '@nestjs/cqrs'
import { Document } from 'langchain/document'
import { GetFileAssetQuery } from '../../../file-understanding'
import { VolumeClient, VolumeHandle, type VolumeRootResolution, type VolumeScope } from '../../volume'
import { LoadFileCommand } from '../load-file.command'
import { LoadFileHandler } from './load-file.handler'

class TestVolumeClient extends VolumeClient {
    readonly scopes: VolumeScope[] = []

    resolve(scope: VolumeScope): VolumeHandle {
        this.scopes.push(scope)
        const root = `/tmp/workspace-volume/${scope.tenantId}/${scope.catalog}`
        return new VolumeHandle(scope, root, root, 'https://files.example.test')
    }

    resolveRoot(_tenantId: string): VolumeRootResolution {
        return {
            serverRoot: '/tmp/workspace-volume',
            hostRoot: '/tmp/workspace-volume'
        }
    }
}

describe('LoadFileHandler', () => {
    it.each([
        ['projects', 'project-1', { catalog: 'projects', projectId: 'project-1', userId: 'user-1' }],
        ['xperts', 'xpert-1', { catalog: 'xperts', xpertId: 'xpert-1', userId: 'user-1', isolateByUser: false }],
        ['users', 'user-scope', { catalog: 'users', userId: 'user-scope' }],
        ['knowledges', 'knowledge-1', { catalog: 'knowledges', knowledgeId: 'knowledge-1', userId: 'user-1' }],
        ['skills', 'skill-root-1', { catalog: 'skills', rootId: 'skill-root-1', userId: 'user-1' }]
    ] as const)(
        'resolves %s workspace files from catalog/scope metadata and a relative path',
        async (catalog, scopeId, expectedScope) => {
            const relativePath = 'files/wechat/integration-1/uuid-1/msg-1/contract.txt'
            const queryBus = {
                execute: jest.fn().mockImplementation((query) => {
                    if (query instanceof GetFileAssetQuery) {
                        return {
                            id: 'file-asset-1',
                            tenantId: 'tenant-1',
                            userId: 'user-1',
                            originalName: 'contract.txt',
                            mimeType: 'text/plain',
                            status: 'uploaded',
                            workspacePath: relativePath,
                            metadata: {
                                workspace: {
                                    catalog,
                                    scopeId,
                                    relativePath
                                }
                            }
                        }
                    }
                    return null
                })
            }
            const volumeClient = new TestVolumeClient()
            const handler = new LoadFileHandler(queryBus as unknown as QueryBus, volumeClient)
            const processText = jest
                .spyOn(handler, 'processText')
                .mockResolvedValue([new Document({ pageContent: 'ok' })])

            await expect(
                handler.execute(
                    new LoadFileCommand({
                        fileId: 'file-asset-1',
                        filePath: relativePath,
                        mimeType: 'text/plain'
                    } as any)
                )
            ).resolves.toEqual([expect.objectContaining({ pageContent: 'ok' })])

            expect(volumeClient.scopes[0]).toMatchObject({
                tenantId: 'tenant-1',
                ...expectedScope
            })
            expect(processText).toHaveBeenCalledWith(`/tmp/workspace-volume/tenant-1/${catalog}/${relativePath}`)
        }
    )
})
