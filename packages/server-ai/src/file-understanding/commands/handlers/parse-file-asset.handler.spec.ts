import { IFileStorageProvider } from '@xpert-ai/plugin-sdk'
import { FileStorage } from '@xpert-ai/server-core'
import { ForbiddenException } from '@nestjs/common'
import { createVolumeFileSnapshot } from '../../../shared/volume'
import { ParseFileAssetCommand } from '../parse-file-asset.command'
import { ParseFileAssetHandler } from './parse-file-asset.handler'

jest.mock('../../../shared/volume', () => ({
    VOLUME_CLIENT: Symbol('VOLUME_CLIENT'),
    createVolumeFileSnapshot: jest.fn()
}))

const mockCreateVolumeFileSnapshot = jest.mocked(createVolumeFileSnapshot)

describe('ParseFileAssetHandler authorization', () => {
    afterEach(() => {
        jest.restoreAllMocks()
        mockCreateVolumeFileSnapshot.mockReset()
    })

    it('parses only the StorageFile returned by central FileAsset authorization', async () => {
        const asset = {
            id: 'file-asset-1',
            tenantId: 'tenant-1',
            storageFileId: 'storage-file-1',
            originalName: 'report.txt',
            mimeType: 'text/plain',
            size: 20,
            purpose: 'chat_attachment',
            parseMode: 'auto',
            status: 'uploaded',
            capabilities: [],
            conversationId: 'conversation-1',
            projectId: 'project-1',
            xpertId: 'xpert-1'
        }
        const storageFile = {
            id: 'storage-file-1',
            file: 'authorized/report.txt',
            originalName: 'authorized-report.txt',
            mimetype: 'text/plain',
            size: 20,
            storageProvider: 'LOCAL'
        }
        const fileAssetRepository = {
            findOneByOrFail: jest.fn(),
            save: jest.fn(async (value) => value)
        }
        const fileArtifactRepository = {
            find: jest.fn().mockResolvedValue([]),
            delete: jest.fn().mockResolvedValue(undefined),
            create: jest.fn((value) => value),
            save: jest.fn(async (value) => value)
        }
        const parser = {
            name: 'test-parser',
            supports: jest.fn().mockReturnValue(true),
            parse: jest.fn().mockResolvedValue({ artifacts: [], capabilities: ['read'], status: 'ready' })
        }
        const parserRegistry = { getParser: jest.fn().mockReturnValue(parser) }
        const fileAssetAccessService = { resolve: jest.fn().mockResolvedValue({ asset, storageFile }) }
        const storageProvider: IFileStorageProvider = {
            name: 'LOCAL',
            url: (filePath: string) => filePath,
            path: (filePath: string) => `/authorized-root/${filePath}`,
            handler: () => {
                throw new Error('not implemented')
            },
            getFile: async () => Buffer.alloc(0),
            putFile: async () => {
                throw new Error('not implemented')
            },
            deleteFile: async () => undefined
        }
        jest.spyOn(FileStorage.prototype, 'getProvider').mockReturnValue(storageProvider)
        const workspaceProjectionService = { projectFileAsset: jest.fn(async () => asset) }
        const handler = new ParseFileAssetHandler(
            fileAssetRepository as never,
            fileArtifactRepository as never,
            { execute: jest.fn().mockResolvedValue([]) } as never,
            parserRegistry as never,
            workspaceProjectionService as never,
            fileAssetAccessService as never,
            { resolve: jest.fn() } as never
        )

        const result = await handler.execute(new ParseFileAssetCommand(asset.id))

        expect(fileAssetAccessService.resolve).toHaveBeenCalledWith({
            locator: { fileAssetId: asset.id },
            authority: { kind: 'current-owner' },
            operation: 'parse'
        })
        expect(fileAssetRepository.findOneByOrFail).not.toHaveBeenCalled()
        expect(parserRegistry.getParser).toHaveBeenCalledWith(
            expect.objectContaining({
                filePath: '/authorized-root/authorized/report.txt',
                originalName: 'authorized-report.txt'
            })
        )
        expect(mockCreateVolumeFileSnapshot).not.toHaveBeenCalled()
        expect(workspaceProjectionService.projectFileAsset).toHaveBeenCalledWith(
            expect.objectContaining({
                fileAssetId: asset.id,
                conversationId: 'conversation-1',
                projectId: 'project-1',
                operation: 'parse'
            })
        )
        expect(result.status).toBe('ready')
    })

    it('does not mutate parse status when central authorization rejects the file', async () => {
        const fileAssetRepository = { findOneByOrFail: jest.fn(), save: jest.fn() }
        const fileAssetAccessService = { resolve: jest.fn().mockRejectedValue(new ForbiddenException()) }
        const handler = new ParseFileAssetHandler(
            fileAssetRepository as never,
            { find: jest.fn() } as never,
            { execute: jest.fn() } as never,
            { getParser: jest.fn() } as never,
            { projectFileAsset: jest.fn() } as never,
            fileAssetAccessService as never,
            { resolve: jest.fn() } as never
        )

        await expect(handler.execute(new ParseFileAssetCommand('forbidden-file'))).rejects.toBeInstanceOf(
            ForbiddenException
        )
        expect(fileAssetRepository.findOneByOrFail).not.toHaveBeenCalled()
        expect(fileAssetRepository.save).not.toHaveBeenCalled()
    })

    it('keeps a successful parse when a read-only Project member cannot project derived files', async () => {
        const asset = {
            id: 'file-asset-1',
            tenantId: 'tenant-1',
            storageFileId: 'storage-file-1',
            originalName: 'report.txt',
            mimeType: 'text/plain',
            size: 20,
            purpose: 'chat_attachment',
            parseMode: 'auto',
            status: 'uploaded',
            capabilities: [],
            conversationId: 'conversation-1',
            projectId: 'project-1',
            xpertId: 'xpert-1'
        }
        const storageFile = {
            id: 'storage-file-1',
            file: 'authorized/report.txt',
            originalName: 'authorized-report.txt',
            mimetype: 'text/plain',
            size: 20,
            storageProvider: 'LOCAL'
        }
        const fileAssetRepository = {
            save: jest.fn(async (value) => value)
        }
        const fileArtifactRepository = {
            find: jest.fn().mockResolvedValue([]),
            delete: jest.fn().mockResolvedValue(undefined),
            create: jest.fn((value) => value),
            save: jest.fn(async (value) => value)
        }
        const parser = {
            name: 'test-parser',
            parse: jest.fn().mockResolvedValue({ artifacts: [], capabilities: ['read'], status: 'ready' })
        }
        const parserRegistry = { getParser: jest.fn().mockReturnValue(parser) }
        const fileAssetAccessService = { resolve: jest.fn().mockResolvedValue({ asset, storageFile }) }
        const storageProvider: IFileStorageProvider = {
            name: 'LOCAL',
            url: (filePath: string) => filePath,
            path: (filePath: string) => `/authorized-root/${filePath}`,
            handler: () => {
                throw new Error('not implemented')
            },
            getFile: async () => Buffer.alloc(0),
            putFile: async () => {
                throw new Error('not implemented')
            },
            deleteFile: async () => undefined
        }
        jest.spyOn(FileStorage.prototype, 'getProvider').mockReturnValue(storageProvider)
        const workspaceProjectionService = {
            projectFileAsset: jest.fn().mockRejectedValue(new ForbiddenException())
        }
        const handler = new ParseFileAssetHandler(
            fileAssetRepository as never,
            fileArtifactRepository as never,
            { execute: jest.fn().mockResolvedValue([]) } as never,
            parserRegistry as never,
            workspaceProjectionService as never,
            fileAssetAccessService as never,
            { resolve: jest.fn() } as never
        )

        const result = await handler.execute(new ParseFileAssetCommand(asset.id))

        expect(workspaceProjectionService.projectFileAsset).toHaveBeenCalledWith(
            expect.objectContaining({
                fileAssetId: asset.id,
                conversationId: 'conversation-1',
                projectId: 'project-1',
                operation: 'parse'
            })
        )
        expect(result).toMatchObject({ status: 'ready', error: null })
        expect(fileAssetRepository.save).not.toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }))
    })

    it('parses a Workspace FileAsset from a stable Volume snapshot and disposes it after success', async () => {
        const dispose = jest.fn().mockResolvedValue(undefined)
        mockCreateVolumeFileSnapshot.mockResolvedValue({
            filePath: '/tmp/xpert-volume-file/source.pdf',
            dispose
        })
        const { handler, parser, volumeClient, volume } = createWorkspaceHandler()

        const result = await handler.execute(new ParseFileAssetCommand('file-asset-1'))

        expect(volumeClient.resolve).toHaveBeenCalledWith(
            expect.objectContaining({
                tenantId: 'tenant-1',
                catalog: 'projects',
                projectId: 'project-1'
            })
        )
        expect(mockCreateVolumeFileSnapshot).toHaveBeenCalledWith(volume, 'shared/report.pdf', 'report.pdf')
        expect(parser.parse).toHaveBeenCalledWith(
            expect.objectContaining({
                filePath: '/tmp/xpert-volume-file/source.pdf',
                originalName: 'report.pdf',
                mimeType: 'application/pdf',
                size: 20
            })
        )
        expect(dispose).toHaveBeenCalledTimes(1)
        expect(result).toMatchObject({ status: 'ready', error: null })
    })

    it('disposes the stable Workspace snapshot when parsing fails', async () => {
        const dispose = jest.fn().mockResolvedValue(undefined)
        mockCreateVolumeFileSnapshot.mockResolvedValue({
            filePath: '/tmp/xpert-volume-file/source.pdf',
            dispose
        })
        const { handler, parser } = createWorkspaceHandler()
        parser.parse.mockRejectedValueOnce(new Error('parser failed'))

        const result = await handler.execute(new ParseFileAssetCommand('file-asset-1'))

        expect(dispose).toHaveBeenCalledTimes(1)
        expect(result).toMatchObject({
            status: 'failed',
            error: 'parser failed',
            metadata: expect.objectContaining({ understandingErrorCode: 'file_understanding_parse_failed' })
        })
    })
})

function createWorkspaceHandler() {
    const asset = {
        id: 'file-asset-1',
        tenantId: 'tenant-1',
        storageFileId: null,
        originalName: 'report.pdf',
        mimeType: 'application/pdf',
        size: 20,
        purpose: 'workspace',
        parseMode: 'auto',
        status: 'uploaded',
        capabilities: [],
        projectId: 'project-1',
        metadata: {
            workspace: {
                catalog: 'projects',
                scopeId: 'project-1',
                relativePath: 'shared/report.pdf'
            }
        }
    }
    const fileAssetRepository = {
        save: jest.fn(async (value) => value)
    }
    const fileArtifactRepository = {
        find: jest.fn().mockResolvedValue([]),
        delete: jest.fn().mockResolvedValue(undefined),
        create: jest.fn((value) => value),
        save: jest.fn(async (value) => value)
    }
    const parser = {
        name: 'test-parser',
        parse: jest.fn().mockResolvedValue({ artifacts: [], capabilities: ['read'], status: 'ready' })
    }
    const volume = { serverRoot: '/sandbox/tenant-1/project/project-1' }
    const volumeClient = { resolve: jest.fn().mockReturnValue(volume) }
    const handler = new ParseFileAssetHandler(
        fileAssetRepository as never,
        fileArtifactRepository as never,
        { execute: jest.fn().mockResolvedValue([]) } as never,
        { getParser: jest.fn().mockReturnValue(parser) } as never,
        { projectFileAsset: jest.fn() } as never,
        { resolve: jest.fn().mockResolvedValue({ asset, storageFile: null }) } as never,
        volumeClient as never
    )

    return { handler, parser, volume, volumeClient }
}
