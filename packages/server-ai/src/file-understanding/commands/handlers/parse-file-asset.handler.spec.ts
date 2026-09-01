import { IFileStorageProvider } from '@xpert-ai/plugin-sdk'
import { FileStorage } from '@xpert-ai/server-core'
import { ForbiddenException } from '@nestjs/common'
import { ParseFileAssetCommand } from '../parse-file-asset.command'
import { ParseFileAssetHandler } from './parse-file-asset.handler'

describe('ParseFileAssetHandler authorization', () => {
    afterEach(() => {
        jest.restoreAllMocks()
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
            fileAssetAccessService as never
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
            fileAssetAccessService as never
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
            fileAssetAccessService as never
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
})
