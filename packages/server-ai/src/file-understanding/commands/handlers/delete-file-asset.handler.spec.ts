import { DeleteFileAssetCommand } from '../delete-file-asset.command'
import { DeleteFileAssetHandler } from './delete-file-asset.handler'

describe('DeleteFileAssetHandler', () => {
    it('cleans file vectors before deleting local embedding rows', async () => {
        const asset = {
            id: 'file-1',
            tenantId: 'tenant-1',
            storageFileId: undefined
        }
        const fileAssetRepository = {
            findOne: jest.fn().mockResolvedValue(asset),
            delete: jest.fn().mockResolvedValue({ affected: 1 })
        }
        const fileArtifactRepository = {
            find: jest.fn().mockResolvedValue([]),
            delete: jest.fn().mockResolvedValue({ affected: 1 })
        }
        const fileChunkRepository = {
            delete: jest.fn().mockResolvedValue({ affected: 1 })
        }
        const fileCitationAnchorRepository = {
            delete: jest.fn().mockResolvedValue({ affected: 1 })
        }
        const fileEmbeddingRepository = {
            delete: jest.fn().mockResolvedValue({ affected: 1 })
        }
        const conversationFileLinkRepository = {
            delete: jest.fn().mockResolvedValue({ affected: 1 })
        }
        const storageFileService = {
            findOne: jest.fn()
        }
        const fileVectorService = {
            deleteFileVectors: jest.fn().mockResolvedValue(undefined)
        }
        const fileAssetAccessService = {
            resolve: jest.fn().mockResolvedValue({ asset })
        }
        const handler = Reflect.construct(DeleteFileAssetHandler, [
            fileAssetRepository,
            fileArtifactRepository,
            fileChunkRepository,
            fileCitationAnchorRepository,
            fileEmbeddingRepository,
            conversationFileLinkRepository,
            storageFileService,
            fileVectorService,
            fileAssetAccessService
        ]) as DeleteFileAssetHandler

        await handler.execute(new DeleteFileAssetCommand('file-1'))

        expect(fileVectorService.deleteFileVectors).toHaveBeenCalledWith('file-1', asset)
        expect(fileAssetAccessService.resolve).toHaveBeenCalledWith({
            locator: { fileAssetId: 'file-1' },
            authority: { kind: 'current-owner' },
            operation: 'delete'
        })
        expect(fileVectorService.deleteFileVectors.mock.invocationCallOrder[0]).toBeLessThan(
            fileEmbeddingRepository.delete.mock.invocationCallOrder[0]
        )
    })
})
