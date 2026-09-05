import { FileAssetDeletionService } from './file-asset-deletion.service'
import { ForbiddenException } from '@nestjs/common'

describe('FileAssetDeletionService', () => {
    it.each(['ordinary', 'purge', 'wrong-project', 'denied'] as const)(
        'enforces deletion boundary: %s',
        async (mode) => {
            const asset = {
                id: 'file-1',
                projectId: mode === 'wrong-project' ? 'other' : 'project-1',
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
            const handler = Reflect.construct(FileAssetDeletionService, [
                fileAssetRepository,
                fileArtifactRepository,
                fileChunkRepository,
                fileCitationAnchorRepository,
                fileEmbeddingRepository,
                conversationFileLinkRepository,
                storageFileService,
                fileVectorService,
                fileAssetAccessService,
                {
                    assertCanPurge:
                        mode === 'denied'
                            ? jest.fn().mockRejectedValue(new ForbiddenException())
                            : jest.fn().mockResolvedValue({ project: { id: 'project-1', tenantId: 'tenant-1' } })
                }
            ]) as FileAssetDeletionService

            if (mode === 'wrong-project' || mode === 'denied') {
                await expect(handler.purgeProjectFile('file-1', 'project-1')).rejects.toBeInstanceOf(ForbiddenException)
                expect(fileVectorService.deleteFileVectors).not.toHaveBeenCalled()
                expect(fileAssetRepository.delete).not.toHaveBeenCalled()
                return
            }
            if (mode === 'ordinary') await handler.delete('file-1')
            else await handler.purgeProjectFile('file-1', 'project-1')

            expect(fileVectorService.deleteFileVectors).toHaveBeenCalledWith('file-1', asset)
            expect(fileAssetAccessService.resolve).toHaveBeenCalledWith({
                locator: { fileAssetId: 'file-1' },
                authority: { kind: 'current-owner' },
                operation: mode === 'ordinary' ? 'delete' : 'read'
            })
            expect(fileVectorService.deleteFileVectors.mock.invocationCallOrder[0]).toBeLessThan(
                fileEmbeddingRepository.delete.mock.invocationCallOrder[0]
            )
        }
    )
})
