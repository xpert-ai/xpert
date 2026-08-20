import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { GetFileUnderstandingStatusQuery, ListProjectFilesQuery, SearchFileChunksQuery } from '../../file-understanding'
import { VolumeHandle } from '../volume'
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

    it('resolves metadata and a public URL without reading file bytes', async () => {
        const serverRoot = await temporaryRoot()
        const filePath = 'drawings/source.pdf'
        await mkdir(path.join(serverRoot, 'drawings'), { recursive: true })
        await writeFile(path.join(serverRoot, filePath), Buffer.from('pdf-content'))
        const service = createService(serverRoot, '/host/project-1')

        await expect(service.resolveFile(reference(filePath))).resolves.toEqual({
            name: 'source.pdf',
            filePath,
            workspacePath: filePath,
            fileUrl: `http://localhost/files/${filePath}`,
            url: `http://localhost/files/${filePath}`,
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
        ['FileAsset id', '8d70766b-c87b-465e-b06c-c900eb18f79a'],
        ['StorageFile id', '36d672e4-063d-4e75-89ca-b39ca14588f1']
    ])('resolves a conversation-scoped %s into its projected Workspace path', async (_label, handle) => {
        const serverRoot = await temporaryRoot()
        const relativePath = 'sessions/conversation-1/files/8d70766b-c87b-465e-b06c-c900eb18f79a/crown-chest.png'
        await mkdir(path.dirname(path.join(serverRoot, relativePath)), { recursive: true })
        await writeFile(path.join(serverRoot, relativePath), Buffer.from('crown-chest'))
        const fileAsset = conversationFileAsset(relativePath)
        const queryBus = {
            execute: jest.fn().mockImplementation((query) => {
                if (query.fileAssetId === fileAsset.id || query.storageFileId === fileAsset.storageFileId) {
                    return Promise.resolve(fileAsset)
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
    })

    it('rejects a FileAsset handle attached to another conversation', async () => {
        const serverRoot = await temporaryRoot()
        const relativePath = 'sessions/conversation-1/files/8d70766b-c87b-465e-b06c-c900eb18f79a/crown-chest.png'
        const fileAsset = conversationFileAsset(relativePath)
        const queryBus = { execute: jest.fn().mockResolvedValue(fileAsset) }
        const service = createService(serverRoot, '/host/project-1', queryBus)
        const scoped = service.createScopedApi({
            tenantId: 'tenant-1',
            organizationId: 'organization-1',
            userId: 'user-1',
            projectId: 'project-1',
            conversationId: 'conversation-2'
        })

        await expect(scoped.readRuntimeBuffer(fileAsset.id)).rejects.toThrow('Workspace file not found')
    })

    it('lists and searches only chunks from a visible Project FileAsset', async () => {
        const serverRoot = await temporaryRoot()
        const fileAssetId = '8d70766b-c87b-465e-b06c-c900eb18f79a'
        const queryBus = {
            execute: jest.fn().mockImplementation((query) => {
                if (query instanceof GetFileUnderstandingStatusQuery) {
                    return Promise.resolve({ fileAssetId, status: 'ready' })
                }
                if (query instanceof ListProjectFilesQuery) {
                    return Promise.resolve([{ id: fileAssetId }])
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

        expect(queryBus.execute).toHaveBeenCalledWith(expect.any(ListProjectFilesQuery))
        expect(queryBus.execute).toHaveBeenCalledWith(expect.any(SearchFileChunksQuery))
    })

    it('normalizes an invisible Project FileAsset to a scoped not-found error', async () => {
        const serverRoot = await temporaryRoot()
        const queryBus = {
            execute: jest.fn().mockImplementation((query) => {
                if (query instanceof GetFileUnderstandingStatusQuery) {
                    return Promise.resolve({ fileAssetId: 'file-1', status: 'ready' })
                }
                if (query instanceof ListProjectFilesQuery) {
                    return Promise.resolve([])
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
