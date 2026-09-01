import { GetOwnedStorageFileQuery } from '../get-owned-storage-file.query'
import { GetOwnedStorageFileHandler } from './get-owned-storage-file.handler'

describe('GetOwnedStorageFileHandler', () => {
    it('delegates owner authorization and returns the canonical StorageFile', async () => {
        const storageFile = {
            id: 'storage-file-1',
            tenantId: 'tenant-1',
            organizationId: 'organization-1',
            createdById: 'user-1'
        }
        const fileAssetAccessService = {
            assertStorageFileOwner: jest.fn().mockResolvedValue(storageFile)
        }
        const handler = new GetOwnedStorageFileHandler(fileAssetAccessService as never)

        await expect(handler.execute(new GetOwnedStorageFileQuery(storageFile.id))).resolves.toBe(storageFile)
        expect(fileAssetAccessService.assertStorageFileOwner).toHaveBeenCalledTimes(1)
        expect(fileAssetAccessService.assertStorageFileOwner).toHaveBeenCalledWith(storageFile.id)
    })
})
