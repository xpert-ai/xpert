import fsPromises from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { FileStorage } from '@xpert-ai/server-core'
import { IFileStorageProvider } from '@xpert-ai/plugin-sdk'
import { ForbiddenException } from '@nestjs/common'
import { VolumeHandle, VolumeSubtreeClient } from '../shared/volume'
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

type MockFileAssetAccessService = {
    resolve: jest.Mock
}

type MockWorkAreaResolver = {
    resolve: jest.Mock
}

type MockVolumeClient = {
    resolve: jest.Mock
}

type MockProjectAccessService = {
    assertCanEdit: jest.Mock
}

function createProjectionService(
    fileAssetRepository: MockFileAssetRepository,
    fileArtifactRepository: MockFileArtifactRepository,
    storageFileService: MockStorageFileService,
    workAreaResolver: MockWorkAreaResolver,
    volumeClient: MockVolumeClient = { resolve: jest.fn() },
    fileAssetAccessService: MockFileAssetAccessService = createFileAssetAccessService(
        fileAssetRepository,
        storageFileService
    ),
    projectAccessService: MockProjectAccessService = { assertCanEdit: jest.fn().mockResolvedValue({ role: 'editor' }) }
): FileWorkspaceProjectionService {
    return Reflect.construct(FileWorkspaceProjectionService, [
        fileAssetRepository,
        fileArtifactRepository,
        fileAssetAccessService,
        projectAccessService,
        volumeClient,
        workAreaResolver
    ])
}

function createFileAssetAccessService(
    fileAssetRepository: MockFileAssetRepository,
    storageFileService: MockStorageFileService
): MockFileAssetAccessService {
    return {
        resolve: jest.fn(async (input) => {
            const asset = await fileAssetRepository.findOne({ where: { id: input.locator.fileAssetId } })
            if (!asset) {
                throw new Error('File asset not found')
            }
            const storageFile = asset.storageFileId ? await storageFileService.findOne(asset.storageFileId) : undefined
            const conversation =
                input.authority.kind === 'conversation'
                    ? {
                          id: input.authority.conversationId ?? asset.conversationId ?? 'conversation-1',
                          threadId: input.authority.threadId ?? asset.threadId,
                          tenantId: asset.tenantId,
                          organizationId: asset.organizationId,
                          createdById: asset.createdById ?? asset.userId,
                          projectId: asset.projectId,
                          xpertId: asset.xpertId ?? 'xpert-1',
                          xpert: asset.workspaceDataScope ? { workspaceDataScope: asset.workspaceDataScope } : undefined
                      }
                    : undefined
            return {
                asset,
                ...(storageFile ? { storageFile } : {}),
                ...(conversation ? { conversation } : {})
            }
        })
    }
}

describe('FileWorkspaceProjectionService', () => {
    let tempRoot: string

    beforeEach(async () => {
        tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'file-workspace-projection-'))
    })

    afterEach(async () => {
        await fsPromises.rm(tempRoot, { recursive: true, force: true })
    })

    it.each(['attach', 'parse'] as const)(
        'rejects a read-only Project member before creating a work area for %s projection',
        async (operation) => {
            const asset = {
                id: 'file-asset-1',
                tenantId: 'tenant-1',
                userId: 'user-1',
                originalName: 'report.txt',
                capabilities: ['read']
            }
            const fileAssetRepository: MockFileAssetRepository = {
                findOne: jest.fn(),
                save: jest.fn(async (value) => value)
            }
            const fileArtifactRepository: MockFileArtifactRepository = {
                find: jest.fn().mockResolvedValue([]),
                save: jest.fn(async (value) => value)
            }
            const fileAssetAccessService: MockFileAssetAccessService = {
                resolve: jest.fn().mockResolvedValue({
                    asset,
                    conversation: {
                        id: 'conversation-1',
                        tenantId: 'tenant-1',
                        createdById: 'user-1',
                        projectId: 'project-1',
                        xpertId: 'xpert-1'
                    }
                })
            }
            const workAreaResolver: MockWorkAreaResolver = {
                resolve: jest.fn().mockResolvedValue({
                    workspaceRoot: '/workspace',
                    volumeScope: { catalog: 'projects', projectId: 'project-1' },
                    sessionPath: { relativePath: 'sessions/conversation-1' },
                    volume: { path: (relativePath: string) => path.join(tempRoot, relativePath) }
                })
            }
            const projectAccessService: MockProjectAccessService = {
                assertCanEdit: jest.fn().mockRejectedValue(new ForbiddenException())
            }
            const service = createProjectionService(
                fileAssetRepository,
                fileArtifactRepository,
                { findOne: jest.fn() },
                workAreaResolver,
                { resolve: jest.fn() },
                fileAssetAccessService,
                projectAccessService
            )

            await expect(
                service.projectFileAsset({
                    fileAssetId: asset.id,
                    conversationId: 'conversation-1',
                    operation,
                    buffer: Buffer.from('forbidden bytes')
                })
            ).rejects.toBeInstanceOf(ForbiddenException)

            expect(projectAccessService.assertCanEdit).toHaveBeenCalledWith('project-1')
            expect(workAreaResolver.resolve).not.toHaveBeenCalled()
            expect(fileAssetRepository.save).not.toHaveBeenCalled()
            expect(fileArtifactRepository.find).not.toHaveBeenCalled()
            await expect(fsPromises.readdir(tempRoot)).resolves.toEqual([])
        }
    )

    it('does not let a Project workspace symlink redirect attachment projection into skills', async () => {
        const volumeRoot = path.join(tempRoot, 'project-volume')
        await fsPromises.mkdir(path.join(volumeRoot, 'skills'), { recursive: true })
        await fsPromises.mkdir(path.join(volumeRoot, 'sessions', 'conversation-1', 'files'), { recursive: true })
        await fsPromises.writeFile(path.join(volumeRoot, 'skills', 'SKILL.md'), '# Original\n')
        await fsPromises.symlink(
            '../../../skills',
            path.join(volumeRoot, 'sessions', 'conversation-1', 'files', 'file-asset-1')
        )
        const asset = {
            id: 'file-asset-1',
            tenantId: 'tenant-1',
            userId: 'user-1',
            conversationId: 'conversation-1',
            projectId: 'project-1',
            xpertId: 'xpert-1',
            originalName: 'SKILL.md',
            capabilities: ['read']
        }
        const fileAssetRepository: MockFileAssetRepository = {
            findOne: jest.fn().mockResolvedValue(asset),
            save: jest.fn(async (value) => value)
        }
        const fileArtifactRepository: MockFileArtifactRepository = {
            find: jest.fn().mockResolvedValue([]),
            save: jest.fn(async (value) => value)
        }
        const storageFileService: MockStorageFileService = { findOne: jest.fn().mockResolvedValue(null) }
        const projectVolume = createTestVolume(volumeRoot, {
            tenantId: 'tenant-1',
            catalog: 'projects',
            projectId: 'project-1',
            userId: 'user-1'
        })
        const workAreaResolver: MockWorkAreaResolver = {
            resolve: jest.fn().mockResolvedValue({
                workspaceRoot: '/workspace',
                volumeScope: projectVolume.scope,
                sessionPath: { relativePath: 'sessions/conversation-1' },
                volume: projectVolume
            })
        }
        const service = createProjectionService(
            fileAssetRepository,
            fileArtifactRepository,
            storageFileService,
            workAreaResolver
        )

        await service.projectFileAsset({
            fileAssetId: asset.id,
            conversationId: 'conversation-1',
            projectId: 'project-1',
            xpertId: 'xpert-1',
            buffer: Buffer.from('# Replaced\n')
        })

        await expect(fsPromises.readFile(path.join(volumeRoot, 'skills', 'SKILL.md'), 'utf8')).resolves.toBe(
            '# Original\n'
        )
        expect(fileAssetRepository.save).not.toHaveBeenCalled()
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
                volumeScope: {
                    catalog: 'xperts',
                    xpertId: 'xpert-1'
                },
                sessionPath: {
                    relativePath: 'sessions/conversation-1'
                },
                volume: createTestVolume(tempRoot, {
                    tenantId: 'tenant-1',
                    catalog: 'xperts',
                    xpertId: 'xpert-1',
                    isolateByUser: false
                })
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
                workspacePath: '/workspace/sessions/conversation-1/files/file-asset-1/简历.pdf'
            })
        )
        expect(projected?.metadata?.workspace).toMatchObject({
            catalog: 'xperts',
            scopeId: 'xpert-1'
        })

        await service.projectFileAsset({
            fileAssetId: 'file-asset-1',
            conversationId: 'conversation-1',
            xpertId: 'xpert-1',
            sandboxProvider: 'docker-sandbox',
            buffer: Buffer.from('replacement bytes')
        })
        await expect(
            fsPromises.readFile(path.join(tempRoot, 'sessions/conversation-1/files/file-asset-1/简历.pdf'), 'utf-8')
        ).resolves.toBe('pdf bytes')
    })

    it('reprojects an attachment when the sandbox environment scope changes', async () => {
        const asset = {
            id: 'file-asset-1',
            tenantId: 'tenant-1',
            userId: 'user-1',
            storageFileId: 'storage-file-1',
            originalName: 'report.pdf',
            workspacePath: '/workspace/sessions/conversation-1/files/file-asset-1/report.pdf',
            metadata: {
                workspace: {
                    catalog: 'projects',
                    scopeId: 'project-1',
                    relativePath: 'sessions/conversation-1/files/file-asset-1/report.pdf'
                }
            },
            capabilities: ['workspace']
        }
        const fileAssetRepository: MockFileAssetRepository = {
            findOne: jest.fn().mockResolvedValue(asset),
            save: jest.fn(async (value) => value)
        }
        const storageFileService: MockStorageFileService = {
            findOne: jest.fn().mockResolvedValue({
                id: 'storage-file-1',
                file: 'contexts/tenant-1/report.pdf',
                originalName: 'report.pdf'
            })
        }
        const workAreaResolver: MockWorkAreaResolver = {
            resolve: jest.fn().mockResolvedValue({
                workspaceRoot: '/workspace',
                volumeScope: {
                    catalog: 'environment',
                    environmentId: 'environment-1'
                },
                volume: createTestVolume(tempRoot, {
                    tenantId: 'tenant-1',
                    catalog: 'environment',
                    environmentId: 'environment-1'
                })
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
            environmentId: 'environment-1',
            sandboxProvider: 'docker-sandbox',
            buffer: Buffer.from('environment bytes')
        })

        expect(workAreaResolver.resolve).toHaveBeenCalledWith(
            expect.objectContaining({
                environmentId: 'environment-1'
            })
        )
        await expect(
            fsPromises.readFile(path.join(tempRoot, 'sessions/conversation-1/files/file-asset-1/report.pdf'), 'utf-8')
        ).resolves.toBe('environment bytes')
        expect(projected?.metadata?.workspace).toMatchObject({
            catalog: 'environment',
            scopeId: 'environment-1'
        })
    })

    it('copies a workspace-only attachment into the sandbox environment volume and exposes it to workspace reads', async () => {
        const sourceRoot = path.join(tempRoot, 'source')
        const targetRoot = path.join(tempRoot, 'target')
        const sourceRelativePath = 'files/inbound/contract.docx'
        const targetRelativePath = 'sessions/conversation-1/files/file-asset-1/contract.docx'
        await fsPromises.mkdir(path.dirname(path.join(sourceRoot, sourceRelativePath)), { recursive: true })
        await fsPromises.writeFile(path.join(sourceRoot, sourceRelativePath), 'workspace bytes')

        const environmentVolume = new VolumeHandle(
            {
                tenantId: 'tenant-1',
                catalog: 'environment',
                environmentId: 'environment-1',
                userId: 'user-1'
            },
            targetRoot,
            '/host/environment-1',
            'http://localhost/api/sandbox/volume/environment-1'
        )

        const asset = {
            id: 'file-asset-1',
            tenantId: 'tenant-1',
            userId: 'user-1',
            xpertId: 'xpert-1',
            originalName: 'contract.docx',
            workspacePath: sourceRelativePath,
            metadata: {
                workspace: {
                    catalog: 'projects',
                    scopeId: 'project-1',
                    relativePath: sourceRelativePath
                }
            },
            capabilities: ['workspace']
        }
        const fileAssetRepository: MockFileAssetRepository = {
            findOne: jest.fn().mockResolvedValue(asset),
            save: jest.fn(async (value) => value)
        }
        const fileArtifactRepository: MockFileArtifactRepository = {
            find: jest.fn().mockResolvedValue([]),
            save: jest.fn(async (value) => value)
        }
        const storageFileService: MockStorageFileService = {
            findOne: jest.fn().mockResolvedValue(null)
        }
        const volumeClient: MockVolumeClient = {
            resolve: jest.fn().mockReturnValue({
                ensureRoot: jest.fn().mockResolvedValue({
                    path: (relativePath: string) => path.join(sourceRoot, relativePath)
                })
            })
        }
        const workAreaResolver: MockWorkAreaResolver = {
            resolve: jest.fn().mockResolvedValue({
                workspaceRoot: '/workspace',
                volumeScope: {
                    catalog: 'environment',
                    environmentId: 'environment-1'
                },
                volume: environmentVolume
            })
        }
        const service = createProjectionService(
            fileAssetRepository,
            fileArtifactRepository,
            storageFileService,
            workAreaResolver,
            volumeClient,
            {
                resolve: jest.fn().mockResolvedValue({
                    asset,
                    conversation: {
                        id: 'conversation-1',
                        tenantId: 'tenant-1',
                        createdById: 'user-1',
                        projectId: 'project-1',
                        xpertId: 'xpert-1'
                    }
                })
            }
        )

        const projected = await service.projectFileAsset({
            fileAssetId: 'file-asset-1',
            conversationId: 'conversation-1',
            xpertId: 'xpert-1',
            environmentId: 'environment-1',
            sandboxProvider: 'docker-sandbox'
        })

        expect(volumeClient.resolve).toHaveBeenCalledWith({
            tenantId: 'tenant-1',
            catalog: 'projects',
            projectId: 'project-1',
            userId: 'user-1'
        })
        const workspaceClient = new VolumeSubtreeClient(environmentVolume, { allowRootWorkspace: true })
        await expect(workspaceClient.readBuffer('', targetRelativePath)).resolves.toEqual(
            Buffer.from('workspace bytes')
        )
        expect(projected?.metadata?.workspace).toMatchObject({
            catalog: 'environment',
            scopeId: 'environment-1',
            absolutePath: path.join(targetRoot, targetRelativePath)
        })
    })

    it('allows an editor to project using the authorized conversation scope instead of caller-supplied ids', async () => {
        const asset = {
            id: 'file-asset-1',
            tenantId: 'asset-tenant',
            userId: 'asset-user',
            originalName: 'report.txt',
            capabilities: ['read']
        }
        const conversation = {
            id: 'conversation-1',
            tenantId: 'canonical-tenant',
            createdById: 'canonical-user',
            projectId: 'canonical-project',
            xpertId: 'canonical-xpert',
            xpert: { workspaceDataScope: 'user' }
        }
        const fileAssetRepository: MockFileAssetRepository = {
            findOne: jest.fn(),
            save: jest.fn(async (value) => value)
        }
        const fileArtifactRepository: MockFileArtifactRepository = {
            find: jest.fn().mockResolvedValue([]),
            save: jest.fn(async (value) => value)
        }
        const fileAssetAccessService: MockFileAssetAccessService = {
            resolve: jest.fn().mockResolvedValue({ asset, conversation })
        }
        const workAreaResolver: MockWorkAreaResolver = {
            resolve: jest.fn().mockResolvedValue({
                workspaceRoot: '/workspace',
                volumeScope: { catalog: 'projects', projectId: 'canonical-project' },
                sessionPath: { relativePath: 'sessions/conversation-1' },
                volume: createTestVolume(tempRoot, {
                    tenantId: 'tenant-1',
                    catalog: 'projects',
                    projectId: 'canonical-project'
                })
            })
        }
        const projectAccessService: MockProjectAccessService = {
            assertCanEdit: jest.fn().mockResolvedValue({ role: 'editor' })
        }
        const service = createProjectionService(
            fileAssetRepository,
            fileArtifactRepository,
            { findOne: jest.fn() },
            workAreaResolver,
            { resolve: jest.fn() },
            fileAssetAccessService,
            projectAccessService
        )

        await service.projectFileAsset({
            fileAssetId: asset.id,
            storageFileId: 'authorized-storage-file',
            conversationId: conversation.id,
            projectId: 'forged-project',
            xpertId: 'forged-xpert',
            buffer: Buffer.from('authorized bytes')
        })

        expect(fileAssetAccessService.resolve).toHaveBeenCalledWith({
            locator: { fileAssetId: asset.id, storageFileId: 'authorized-storage-file' },
            authority: { kind: 'conversation', conversationId: conversation.id },
            operation: 'attach'
        })
        expect(projectAccessService.assertCanEdit).toHaveBeenCalledWith('canonical-project')
        expect(workAreaResolver.resolve).toHaveBeenCalledWith(
            expect.objectContaining({
                tenantId: 'canonical-tenant',
                userId: 'canonical-user',
                projectId: 'canonical-project',
                xpertId: 'canonical-xpert',
                conversationId: conversation.id,
                workspaceDataScope: 'user'
            })
        )
        await expect(
            fsPromises.readFile(path.join(tempRoot, 'sessions/conversation-1/files/file-asset-1/report.txt'), 'utf-8')
        ).resolves.toBe('authorized bytes')
        expect(fileAssetRepository.findOne).not.toHaveBeenCalled()
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
                volumeScope: {
                    catalog: 'xperts',
                    xpertId: 'xpert-1'
                },
                sessionPath: {
                    relativePath: 'sessions/conversation-1'
                },
                volume: createTestVolume(tempRoot, {
                    tenantId: 'tenant-1',
                    catalog: 'xperts',
                    xpertId: 'xpert-1',
                    isolateByUser: false
                })
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

function createTestVolume(root: string, scope: ConstructorParameters<typeof VolumeHandle>[0]) {
    return new VolumeHandle(scope, root, root, 'http://localhost/api/sandbox/volume/test')
}
