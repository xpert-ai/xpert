import fsPromises from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { FileStorage } from '@xpert-ai/server-core'
import { IFileStorageProvider } from '@xpert-ai/plugin-sdk'
import { FileWorkspaceProjectionService } from './file-workspace-projection.service'

type MockFileAssetRepository = {
    findOne: jest.Mock
    save: jest.Mock
}

type MockFileArtifactRepository = {
    find: jest.Mock
    save: jest.Mock
}

type MockStorageFileService = {
    findOne: jest.Mock
}

type MockWorkAreaResolver = {
    resolve: jest.Mock
}

function createProjectionService(
    fileAssetRepository: MockFileAssetRepository,
    fileArtifactRepository: MockFileArtifactRepository,
    storageFileService: MockStorageFileService,
    workAreaResolver: MockWorkAreaResolver
): FileWorkspaceProjectionService {
    return Reflect.construct(FileWorkspaceProjectionService, [
        fileAssetRepository,
        fileArtifactRepository,
        storageFileService,
        workAreaResolver
    ])
}

describe('FileWorkspaceProjectionService', () => {
    let tempRoot: string

    beforeEach(async () => {
        tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'file-workspace-projection-'))
    })

    afterEach(async () => {
        await fsPromises.rm(tempRoot, { recursive: true, force: true })
    })

    it('writes attached files into the conversation workspace and records workspacePath', async () => {
        const asset = {
            id: 'file-asset-1',
            tenantId: 'tenant-1',
            userId: 'user-1',
            storageFileId: 'storage-file-1',
            originalName: '简历.pdf',
            capabilities: ['preview', 'read']
        }
        const fileAssetRepository: MockFileAssetRepository = {
            findOne: jest.fn().mockResolvedValue(asset),
            save: jest.fn(async (value) => value)
        }
        const storageFileService: MockStorageFileService = {
            findOne: jest.fn().mockResolvedValue({
                id: 'storage-file-1',
                file: 'contexts/tenant-1/file.pdf',
                originalName: '简历.pdf'
            })
        }
        const workAreaResolver: MockWorkAreaResolver = {
            resolve: jest.fn().mockResolvedValue({
                workspaceRoot: '/workspace',
                sessionPath: {
                    relativePath: 'sessions/conversation-1'
                },
                volume: {
                    path: (relativePath: string) => path.join(tempRoot, relativePath)
                }
            })
        }
        const fileArtifactRepository: MockFileArtifactRepository = {
            find: jest.fn().mockResolvedValue([]),
            save: jest.fn(async (value) => value)
        }
        const service = createProjectionService(
            fileAssetRepository,
            fileArtifactRepository,
            storageFileService,
            workAreaResolver
        )

        const projected = await service.projectFileAsset({
            fileAssetId: 'file-asset-1',
            conversationId: 'conversation-1',
            xpertId: 'xpert-1',
            sandboxProvider: 'docker-sandbox',
            buffer: Buffer.from('pdf bytes')
        })

        expect(projected?.workspacePath).toBe('/workspace/sessions/conversation-1/files/file-asset-1/简历.pdf')
        expect(projected?.capabilities).toContain('workspace')
        await expect(
            fsPromises.readFile(path.join(tempRoot, 'sessions/conversation-1/files/file-asset-1/简历.pdf'), 'utf-8')
        ).resolves.toBe('pdf bytes')
        expect(fileAssetRepository.save).toHaveBeenCalledWith(
            expect.objectContaining({
                conversationId: 'conversation-1',
                xpertId: 'xpert-1',
                workspacePath: '/workspace/sessions/conversation-1/files/file-asset-1/简历.pdf'
            })
        )
    })

    it('projects parsed PDF page images into the same workspace file folder', async () => {
        const asset = {
            id: 'file-asset-1',
            tenantId: 'tenant-1',
            userId: 'user-1',
            storageFileId: 'storage-file-1',
            originalName: 'report.pdf',
            capabilities: ['preview', 'read']
        }
        const fileAssetRepository: MockFileAssetRepository = {
            findOne: jest.fn().mockResolvedValue(asset),
            save: jest.fn(async (value) => value)
        }
        const storageFileService: MockStorageFileService = {
            findOne: jest.fn().mockResolvedValue({
                id: 'storage-file-1',
                file: 'contexts/tenant-1/report.pdf',
                originalName: 'report.pdf',
                storageProvider: 'LOCAL'
            })
        }
        const fileArtifactRepository: MockFileArtifactRepository = {
            find: jest.fn().mockResolvedValue([
                {
                    id: 'artifact-page-1-image',
                    anchor: { page: 1 },
                    metadata: {
                        storageKey: 'contexts/tenant-1/file-understanding/file-asset-1/run-1/pages/page-0001.png',
                        fileName: 'page-0001.png',
                        url: 'https://files.example/page-0001.png',
                        width: 800,
                        height: 1000
                    }
                }
            ]),
            save: jest.fn(async (value) => value)
        }
        const workAreaResolver: MockWorkAreaResolver = {
            resolve: jest.fn().mockResolvedValue({
                workspaceRoot: '/workspace',
                sessionPath: {
                    relativePath: 'sessions/conversation-1'
                },
                volume: {
                    path: (relativePath: string) => path.join(tempRoot, relativePath)
                }
            })
        }
        const storageProvider: IFileStorageProvider = {
            name: 'LOCAL',
            url: (filePath: string) => `https://files.example/${filePath}`,
            path: (filePath: string) => filePath,
            handler: () => {
                throw new Error('not implemented')
            },
            getFile: async (filePath: string) => Buffer.from(`image bytes for ${filePath}`),
            putFile: async () => {
                throw new Error('not implemented')
            },
            deleteFile: async () => undefined
        }
        const getProviderSpy = jest.spyOn(FileStorage.prototype, 'getProvider').mockReturnValue(storageProvider)
        const service = createProjectionService(
            fileAssetRepository,
            fileArtifactRepository,
            storageFileService,
            workAreaResolver
        )

        await service.projectFileAsset({
            fileAssetId: 'file-asset-1',
            conversationId: 'conversation-1',
            xpertId: 'xpert-1',
            sandboxProvider: 'docker-sandbox',
            buffer: Buffer.from('pdf bytes')
        })

        await expect(
            fsPromises.readFile(
                path.join(tempRoot, 'sessions/conversation-1/files/file-asset-1/pages/page-0001.png'),
                'utf-8'
            )
        ).resolves.toContain(
            'image bytes for contexts/tenant-1/file-understanding/file-asset-1/run-1/pages/page-0001.png'
        )
        expect(fileArtifactRepository.save).toHaveBeenCalledWith([
            expect.objectContaining({
                metadata: expect.objectContaining({
                    workspacePath: '/workspace/sessions/conversation-1/files/file-asset-1/pages/page-0001.png',
                    workspaceRelativePath: 'sessions/conversation-1/files/file-asset-1/pages/page-0001.png'
                })
            })
        ])
        getProviderSpy.mockRestore()
    })
})
