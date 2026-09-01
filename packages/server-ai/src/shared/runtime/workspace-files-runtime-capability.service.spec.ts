import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
    GetFileUnderstandingStatusQuery,
    ResolveAuthorizedFileAssetQuery,
    SearchFileChunksQuery
} from '../../file-understanding'
import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { VolumeHandle } from '../volume'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { WorkspaceFilesRuntimeCapabilityService } from './workspace-files-runtime-capability.service'

describe('WorkspaceFilesRuntimeCapabilityService read-only sources', () => {
    const roots: string[] = []

    afterEach(async () => {
        await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
    })

    it('maps one scoped regular file to equivalent API and Provider paths', async () => {
        const serverRoot = await temporaryRoot()
        const hostRoot = '/host/xpert/tenant-1/project/project-1'
        const filePath = 'media/source.mov'
        await mkdir(path.join(serverRoot, 'media'), { recursive: true })
        await writeFile(path.join(serverRoot, filePath), Buffer.from('seekable-media'))
        const service = createService(serverRoot, hostRoot)

        await expect(service.resolveReadOnlyFileSource(reference(filePath))).resolves.toMatchObject({
            serverPath: await realpath(path.join(serverRoot, filePath)),
            hostPath: path.join(hostRoot, filePath),
            size: 14
        })
    })

    it('rejects a Workspace symlink that escapes the scoped Volume', async () => {
        const serverRoot = await temporaryRoot()
        const outsideRoot = await temporaryRoot()
        const outsidePath = path.join(outsideRoot, 'outside.mov')
        await writeFile(outsidePath, Buffer.from('outside'))
        await symlink(outsidePath, path.join(serverRoot, 'escape.mov'))
        const service = createService(serverRoot, '/host/project-1')

        await expect(service.resolveReadOnlyFileSource(reference('escape.mov'))).rejects.toThrow(
            'outside of its scoped volume'
        )
    })

    it('resolves private Project metadata without a direct URL or reading file bytes', async () => {
        const serverRoot = await temporaryRoot()
        const filePath = 'drawings/source.pdf'
        await mkdir(path.join(serverRoot, 'drawings'), { recursive: true })
        await writeFile(path.join(serverRoot, filePath), Buffer.from('pdf-content'))
        const service = createService(serverRoot, '/host/project-1')

        await expect(service.resolveFile(reference(filePath))).resolves.toEqual({
            name: 'source.pdf',
            filePath,
            workspacePath: filePath,
            size: 11,
            catalog: 'projects',
            scopeId: 'project-1'
        })
    })

    it('reports a missing workspace file with a storage-specific error', async () => {
        const serverRoot = await temporaryRoot()
        const service = createService(serverRoot, '/host/project-1')

        await expect(service.resolveFile(reference('drawings/missing.pdf'))).rejects.toThrow('Workspace file not found')
    })

    it.each([
        ['tenantId', { tenantId: 'tenant-2' }],
        ['organizationId', { organizationId: 'organization-2' }]
    ])('rejects a portable reference whose %s conflicts with the execution scope', async (_label, override) => {
        const serverRoot = await temporaryRoot()
        const service = createService(serverRoot, '/host/project-1')
        const scoped = service.createScopedApi({
            tenantId: 'tenant-1',
            organizationId: 'organization-1',
            userId: 'user-1',
            projectId: 'project-1'
        })

        await expect(
            scoped.resolveRuntimeReference({
                ...reference('media/source.mov'),
                ...override
            })
        ).rejects.toBeInstanceOf(BadRequestException)
    })

    it.each([
        ['FileAsset id', '8d70766b-c87b-465e-b06c-c900eb18f79a'],
        ['StorageFile id', '36d672e4-063d-4e75-89ca-b39ca14588f1']
    ])('resolves a conversation-scoped %s into its projected Workspace path', async (_label, handle) => {
        const serverRoot = await temporaryRoot()
        const relativePath = 'sessions/conversation-1/files/8d70766b-c87b-465e-b06c-c900eb18f79a/crown-chest.png'
        await mkdir(path.dirname(path.join(serverRoot, relativePath)), { recursive: true })
        await writeFile(path.join(serverRoot, relativePath), Buffer.from('crown-chest'))
        const fileAsset = conversationFileAsset(relativePath)
        const expectedLocator =
            _label === 'FileAsset id' ? { fileAssetId: fileAsset.id } : { storageFileId: fileAsset.storageFileId }
        const queryBus = {
            execute: jest.fn().mockImplementation((query) => {
                if (query instanceof ResolveAuthorizedFileAssetQuery) {
                    if (JSON.stringify(query.input.locator) === JSON.stringify(expectedLocator)) {
                        return Promise.resolve({ asset: fileAsset })
                    }
                    return Promise.reject(new ForbiddenException())
                }
                return Promise.resolve(null)
            })
        }
        const service = createService(serverRoot, '/host/project-1', queryBus)
        const scoped = service.createScopedApi({
            tenantId: 'tenant-1',
            organizationId: 'organization-1',
            userId: 'user-1',
            projectId: 'project-1',
            conversationId: 'conversation-1'
        })

        await expect(scoped.readRuntimeBuffer(handle)).resolves.toMatchObject({
            filePath: relativePath,
            buffer: Buffer.from('crown-chest')
        })
        expect(queryBus.execute).toHaveBeenCalledWith(
            expect.objectContaining({
                input: expect.objectContaining({
                    locator: expectedLocator,
                    authority: { kind: 'conversation', conversationId: 'conversation-1' },
                    operation: 'read'
                })
            })
        )
    })

    it('uses the authorized conversation link instead of mutable FileAsset scope fields', async () => {
        const serverRoot = await temporaryRoot()
        const relativePath = 'sessions/conversation-1/files/8d70766b-c87b-465e-b06c-c900eb18f79a/crown-chest.png'
        const fileAsset = {
            ...conversationFileAsset(relativePath),
            conversationId: 'forged-conversation',
            projectId: 'forged-project'
        }
        await mkdir(path.dirname(path.join(serverRoot, relativePath)), { recursive: true })
        await writeFile(path.join(serverRoot, relativePath), Buffer.from('crown-chest'))
        const queryBus = {
            execute: jest.fn().mockImplementation((query) => {
                if (query instanceof ResolveAuthorizedFileAssetQuery) {
                    return Promise.resolve({ asset: fileAsset })
                }
                return Promise.resolve(null)
            })
        }
        const service = createService(serverRoot, '/host/project-1', queryBus)
        const scoped = service.createScopedApi({
            tenantId: 'tenant-1',
            organizationId: 'organization-1',
            userId: 'user-1',
            projectId: 'project-1',
            conversationId: 'conversation-2'
        })

        await expect(scoped.readRuntimeBuffer(fileAsset.id)).resolves.toMatchObject({
            filePath: relativePath,
            buffer: Buffer.from('crown-chest')
        })
        expect(queryBus.execute).toHaveBeenCalledWith(
            expect.objectContaining({
                input: expect.objectContaining({
                    authority: { kind: 'conversation', conversationId: 'conversation-2' }
                })
            })
        )
    })

    it('keeps a UUID-shaped filename readable when it is not a managed file id', async () => {
        const serverRoot = await temporaryRoot()
        const fileName = '8d70766b-c87b-465e-b06c-c900eb18f79a'
        await writeFile(path.join(serverRoot, fileName), Buffer.from('plain UUID filename'))
        const queryBus = {
            execute: jest.fn().mockRejectedValue(new ForbiddenException())
        }
        const service = createService(serverRoot, '/host/project-1', queryBus)
        const scoped = service.createScopedApi({
            tenantId: 'tenant-1',
            organizationId: 'organization-1',
            userId: 'user-1',
            projectId: 'project-1'
        })

        await expect(scoped.readRuntimeBuffer(fileName)).resolves.toMatchObject({
            filePath: fileName,
            buffer: Buffer.from('plain UUID filename')
        })
        expect(queryBus.execute).toHaveBeenCalledTimes(2)
    })

    it('lists and searches only chunks from a visible Project FileAsset', async () => {
        const serverRoot = await temporaryRoot()
        const fileAssetId = '8d70766b-c87b-465e-b06c-c900eb18f79a'
        const queryBus = {
            execute: jest.fn().mockImplementation((query) => {
                if (query instanceof ResolveAuthorizedFileAssetQuery) {
                    return Promise.resolve({ asset: { id: fileAssetId } })
                }
                if (query instanceof GetFileUnderstandingStatusQuery) {
                    return Promise.resolve({ fileAssetId, status: 'ready' })
                }
                if (query instanceof SearchFileChunksQuery) {
                    return Promise.resolve([
                        {
                            id: '36d672e4-063d-4e75-89ca-b39ca14588f1',
                            fileAssetId,
                            orderNo: 2,
                            anchor: { chunk: 2 },
                            content: '质量保证与施工进度措施'
                        }
                    ])
                }
                return Promise.resolve([])
            })
        }
        const service = createService(serverRoot, '/host/project-1', queryBus)

        await expect(
            service.searchUnderstandingChunks({
                tenantId: 'tenant-1',
                organizationId: 'organization-1',
                projectId: 'project-1',
                fileAssetId,
                query: '质量保证',
                limit: 8
            })
        ).resolves.toEqual([
            {
                fileAssetId,
                chunkId: '36d672e4-063d-4e75-89ca-b39ca14588f1',
                orderNo: 2,
                anchor: { chunk: 2 },
                content: '质量保证与施工进度措施'
            }
        ])

        expect(queryBus.execute).toHaveBeenCalledWith(expect.any(ResolveAuthorizedFileAssetQuery))
        expect(queryBus.execute).toHaveBeenCalledWith(expect.any(SearchFileChunksQuery))
    })

    it('normalizes an invisible Project FileAsset to a scoped not-found error', async () => {
        const serverRoot = await temporaryRoot()
        const queryBus = {
            execute: jest.fn().mockImplementation((query) => {
                if (query instanceof ResolveAuthorizedFileAssetQuery) {
                    return Promise.reject(new BadRequestException())
                }
                if (query instanceof GetFileUnderstandingStatusQuery) {
                    return Promise.resolve({ fileAssetId: 'file-1', status: 'ready' })
                }
                return Promise.resolve([])
            })
        }
        const service = createService(serverRoot, '/host/project-1', queryBus)

        await expect(
            service.listUnderstandingChunks({
                tenantId: 'tenant-1',
                projectId: 'project-1',
                fileAssetId: 'file-1'
            })
        ).rejects.toThrow('not found in the current workspace')
    })

    it.each(['project.md', 'skills/pdf/SKILL.md', 'shared/../skills/pdf/SKILL.md'])(
        'rejects runtime writes to governed Project Content path %s',
        async (filePath) => {
            const serverRoot = await temporaryRoot()
            const service = createService(serverRoot, '/host/project-1')

            await expect(
                service.uploadBuffer({
                    tenantId: 'tenant-1',
                    userId: 'user-1',
                    catalog: 'projects',
                    scopeId: 'project-1',
                    projectId: 'project-1',
                    fileName: filePath,
                    originalName: path.posix.basename(filePath),
                    buffer: Buffer.from('blocked')
                })
            ).rejects.toBeInstanceOf(BadRequestException)
        }
    )

    it('rejects a middleware workspace request that supplies another tenant', async () => {
        const tenantSpy = jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-actor')
        const userSpy = jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user-actor')
        const service = createService(await temporaryRoot(), '/host/project-1')

        try {
            await expect(
                service.readBuffer({
                    tenantId: 'tenant-victim',
                    userId: 'user-actor',
                    catalog: 'users',
                    scopeId: 'user-actor',
                    filePath: 'private.txt'
                })
            ).rejects.toBeInstanceOf(ForbiddenException)
        } finally {
            tenantSpy.mockRestore()
            userSpy.mockRestore()
        }
    })

    it('rejects a middleware workspace request for another user catalog', async () => {
        const tenantSpy = jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        const userSpy = jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user-actor')
        const service = createService(await temporaryRoot(), '/host/project-1')

        try {
            await expect(
                service.readBuffer({
                    tenantId: 'tenant-1',
                    userId: 'user-victim',
                    catalog: 'users',
                    scopeId: 'user-victim',
                    filePath: 'private.txt'
                })
            ).rejects.toBeInstanceOf(ForbiddenException)
        } finally {
            tenantSpy.mockRestore()
            userSpy.mockRestore()
        }
    })

    function createService(serverRoot: string, hostRoot: string, queryBus?: { execute: jest.Mock }) {
        const volume = new VolumeHandle(
            { tenantId: 'tenant-1', catalog: 'projects', projectId: 'project-1', userId: 'user-1' },
            serverRoot,
            hostRoot,
            'http://localhost/files'
        )
        return new WorkspaceFilesRuntimeCapabilityService(
            { execute: jest.fn() },
            { resolve: jest.fn().mockReturnValue(volume) },
            { assertCanEdit: jest.fn().mockResolvedValue({ role: 'editor' }) },
            queryBus
        )
    }

    function conversationFileAsset(relativePath: string) {
        return {
            id: '8d70766b-c87b-465e-b06c-c900eb18f79a',
            storageFileId: '36d672e4-063d-4e75-89ca-b39ca14588f1',
            tenantId: 'tenant-1',
            organizationId: 'organization-1',
            userId: 'user-1',
            projectId: 'project-1',
            xpertId: null,
            conversationId: 'conversation-1',
            workspacePath: `/workspace/${relativePath}`,
            metadata: { workspace: { relativePath } }
        }
    }

    function reference(filePath: string) {
        return {
            source: 'platform.workspace.files' as const,
            tenantId: 'tenant-1',
            userId: 'user-1',
            catalog: 'projects' as const,
            scopeId: 'project-1',
            projectId: 'project-1',
            filePath,
            workspacePath: `/workspace/${filePath}`
        }
    }

    async function temporaryRoot(): Promise<string> {
        const root = await mkdtemp(path.join(tmpdir(), 'xpert-workspace-readonly-'))
        roots.push(root)
        return root
    }
})
