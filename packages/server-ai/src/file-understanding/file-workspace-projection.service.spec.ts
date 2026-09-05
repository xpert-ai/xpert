const mockEnvironment = {
    envName: 'dev',
    baseUrl: 'http://localhost:3000',
    fileSystem: {
        name: 'LOCAL'
    },
    env: {
        IS_DOCKER: 'false',
        SANDBOX_VOLUME_LAYOUT: undefined as string | undefined
    },
    sandboxConfig: {
        volume: ''
    }
}

jest.mock('@xpert-ai/server-config', () => ({
    ...jest.requireActual('@xpert-ai/server-config'),
    environment: mockEnvironment
}))

import fsPromises from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { FileStorage } from '@xpert-ai/server-core'
import { IFileStorageProvider } from '@xpert-ai/plugin-sdk'
import { DevVolumeClient, VolumeHandle, VolumeSubtreeClient } from '../shared/volume'
import { XpertWorkAreaResolver } from '../shared/volume/work-area'
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
    workAreaResolver: MockWorkAreaResolver | XpertWorkAreaResolver,
    volumeClient: MockVolumeClient | DevVolumeClient = { resolve: jest.fn() },
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
                          id: input.authority.conversationId ?? asset.conversationId,
                          threadId: input.authority.threadId ?? asset.threadId,
                          tenantId: asset.tenantId,
                          organizationId: asset.organizationId,
                          createdById: asset.createdById ?? asset.userId,
                          projectId: asset.projectId,
                          xpertId: asset.xpertId,
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

    it('projects attachments from different Projects into distinct local Project subtrees', async () => {
        const originalHome = process.env.HOME
        const originalSandboxVolume = process.env.SANDBOX_VOLUME
        process.env.HOME = tempRoot
        delete process.env.SANDBOX_VOLUME
        const assets = new Map([
            [
                'file-asset-1',
                {
                    id: 'file-asset-1',
                    tenantId: 'tenant-1',
                    userId: 'user-1',
                    conversationId: 'conversation-1',
                    projectId: 'project-1',
                    xpertId: 'xpert-1',
                    originalName: 'project-one.txt',
                    capabilities: ['read']
                }
            ],
            [
                'file-asset-2',
                {
                    id: 'file-asset-2',
                    tenantId: 'tenant-1',
                    userId: 'user-1',
                    conversationId: 'conversation-2',
                    projectId: 'project-2',
                    xpertId: 'xpert-1',
                    originalName: 'project-two.txt',
                    capabilities: ['read']
                }
            ]
        ])
        const fileAssetRepository: MockFileAssetRepository = {
            findOne: jest.fn(({ where }: { where: { id: string } }) => Promise.resolve(assets.get(where.id))),
            save: jest.fn(async (value) => value)
        }
        const fileArtifactRepository: MockFileArtifactRepository = {
            find: jest.fn().mockResolvedValue([]),
            save: jest.fn(async (value) => value)
        }
        const storageFileService: MockStorageFileService = {
            findOne: jest.fn().mockResolvedValue(null)
        }
        const volumeClient = new DevVolumeClient()
        const workAreaResolver = new XpertWorkAreaResolver(volumeClient, {
            mapVolumeToWorkspace: (
                _provider: string | null | undefined,
                volume: VolumeHandle,
                options?: { serverPath?: string }
            ) => ({
                volumeRoot: volume.serverRoot,
                workspaceRoot: volume.serverRoot,
                workspacePath: options?.serverPath === undefined ? volume.serverRoot : volume.path(options.serverPath)
            })
        } as never)
        const service = createProjectionService(
            fileAssetRepository,
            fileArtifactRepository,
            storageFileService,
            workAreaResolver,
            volumeClient
        )

        try {
            await service.projectFileAsset({
                fileAssetId: 'file-asset-1',
                conversationId: 'conversation-1',
                projectId: 'project-1',
                xpertId: 'xpert-1',
                buffer: Buffer.from('project one')
            })
            await service.projectFileAsset({
                fileAssetId: 'file-asset-2',
                conversationId: 'conversation-2',
                projectId: 'project-2',
                xpertId: 'xpert-1',
                buffer: Buffer.from('project two')
            })

            const tenantRoot = path.join(tempRoot, 'data', 'tenant-1')
            const projectOneFile = path.join(
                tenantRoot,
                'project/project-1/sessions/conversation-1/files/file-asset-1/project-one.txt'
            )
            const projectTwoFile = path.join(
                tenantRoot,
                'project/project-2/sessions/conversation-2/files/file-asset-2/project-two.txt'
            )
            await expect(fsPromises.readFile(projectOneFile, 'utf8')).resolves.toBe('project one')
            await expect(fsPromises.readFile(projectTwoFile, 'utf8')).resolves.toBe('project two')
            expect(path.dirname(projectOneFile)).not.toBe(path.dirname(projectTwoFile))
        } finally {
            if (originalHome === undefined) {
                delete process.env.HOME
            } else {
                process.env.HOME = originalHome
            }
            if (originalSandboxVolume === undefined) {
                delete process.env.SANDBOX_VOLUME
            } else {
                process.env.SANDBOX_VOLUME = originalSandboxVolume
            }
        }
    })

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
        const storageFileService: MockStorageFileService = {
            findOne: jest.fn().mockResolvedValue(null)
        }
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
            conversationId: 'conversation-1',
            xpertId: 'xpert-1',
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
                conversationId: 'conversation-1',
                xpertId: 'xpert-1',
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
            conversationId: 'conversation-1',
            xpertId: 'xpert-1',
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
        await fsPromises.mkdir(targetRoot, { recursive: true })
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
            projectId: 'project-1',
            xpertId: 'xpert-1',
            conversationId: 'conversation-1',
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
        const sourceVolume = createTestVolume(sourceRoot, {
            tenantId: 'tenant-1',
            catalog: 'projects',
            projectId: 'project-1',
            userId: 'user-1'
        })
        const volumeClient: MockVolumeClient = {
            resolve: jest.fn().mockReturnValue(sourceVolume)
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
            volumeClient
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
            relativePath: targetRelativePath
        })
        expect(projected?.metadata?.workspace).not.toHaveProperty('absolutePath')
    })

    it('uses the authorized conversation scope instead of caller-supplied Project and Xpert ids', async () => {
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
            xpert: {
                workspaceDataScope: 'user'
            }
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
                volumeScope: {
                    catalog: 'projects',
                    projectId: 'canonical-project'
                },
                sessionPath: {
                    relativePath: 'sessions/conversation-1'
                },
                volume: createTestVolume(tempRoot, {
                    tenantId: 'canonical-tenant',
                    catalog: 'projects',
                    projectId: 'canonical-project',
                    userId: 'canonical-user'
                })
            })
        }
        const service = createProjectionService(
            fileAssetRepository,
            fileArtifactRepository,
            { findOne: jest.fn() },
            workAreaResolver,
            { resolve: jest.fn() },
            fileAssetAccessService
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
            locator: {
                fileAssetId: asset.id,
                storageFileId: 'authorized-storage-file'
            },
            authority: {
                kind: 'conversation',
                conversationId: conversation.id
            },
            operation: 'attach'
        })
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
        expect(workAreaResolver.resolve).not.toHaveBeenCalledWith(
            expect.objectContaining({
                projectId: 'forged-project'
            })
        )
        expect(fileAssetRepository.findOne).not.toHaveBeenCalled()
    })

    it.each(['conversation-1', undefined])('projects PDF page images with conversation %s', async (conversationId) => {
        const asset = {
            id: 'file-asset-1',
            tenantId: 'tenant-1',
            userId: 'user-1',
            storageFileId: 'storage-file-1',
            conversationId,
            projectId: 'project-1',
            xpertId: 'xpert-1',
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
                sessionPath: conversationId ? { relativePath: 'sessions/conversation-1' } : undefined,
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
            conversationId,
            projectId: 'project-1',
            xpertId: 'xpert-1',
            sandboxProvider: 'docker-sandbox',
            buffer: Buffer.from('pdf bytes')
        })

        await expect(
            fsPromises.readFile(
                path.join(
                    tempRoot,
                    `${conversationId ? 'sessions/conversation-1/' : ''}files/file-asset-1/pages/page-0001.png`
                ),
                'utf-8'
            )
        ).resolves.toContain(
            'image bytes for contexts/tenant-1/file-understanding/file-asset-1/run-1/pages/page-0001.png'
        )
        expect(fileArtifactRepository.save).toHaveBeenCalledWith([
            expect.objectContaining({
                metadata: expect.objectContaining({
                    workspacePath: `${conversationId ? 'sessions/conversation-1/' : ''}files/file-asset-1/pages/page-0001.png`
                })
            })
        ])
        getProviderSpy.mockRestore()
    })
})

function createTestVolume(root: string, scope: ConstructorParameters<typeof VolumeHandle>[0]) {
    return new VolumeHandle(scope, root, root, 'http://localhost/api/sandbox/volume/test')
}
