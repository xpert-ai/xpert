import { GetFileAssetByStorageFileQuery, GetFileAssetQuery } from '../../../file-understanding'
import { LoadFileHandler } from './load-file.handler'

describe('LoadFileHandler', () => {
    it('does not resolve legacy fileId values as FileAsset ids', async () => {
        const queryBus = {
            execute: jest.fn().mockImplementation((query: unknown) => {
                if (query instanceof GetFileAssetQuery) {
                    throw new Error('legacy fileId should not be used as a FileAsset id')
                }
                if (query instanceof GetFileAssetByStorageFileQuery) {
                    return null
                }
                throw new Error(`Unexpected query: ${query?.constructor?.name}`)
            })
        }
        const handler = new LoadFileHandler(queryBus as unknown as ConstructorParameters<typeof LoadFileHandler>[0])
        const testHandler = handler as unknown as {
            tryLoadFileUnderstandingDocs(file: {
                id?: string
                fileId?: string
                fileAssetId?: string
                storageFileId?: string
            }): Promise<unknown>
        }

        const docs = await testHandler.tryLoadFileUnderstandingDocs({
            id: '89d94277-097f-4b9d-ad02-8e1ddab03487',
            fileId: '1780307484176_4z5k3xian'
        })

        expect(docs).toBeNull()
        expect(queryBus.execute).toHaveBeenCalledWith(expect.any(GetFileAssetByStorageFileQuery))
        expect(queryBus.execute).not.toHaveBeenCalledWith(expect.any(GetFileAssetQuery))
    })

    it('does not resolve non-uuid bare ids as StorageFile ids', async () => {
        const queryBus = {
            execute: jest.fn().mockImplementation((query: unknown) => {
                if (query instanceof GetFileAssetQuery) {
                    throw new Error('bare id should not be used as a FileAsset id')
                }
                if (query instanceof GetFileAssetByStorageFileQuery) {
                    throw new Error('bare id should not be used as a StorageFile id')
                }
                throw new Error(`Unexpected query: ${query?.constructor?.name}`)
            })
        }
        const handler = new LoadFileHandler(queryBus as unknown as ConstructorParameters<typeof LoadFileHandler>[0])
        const testHandler = handler as unknown as {
            tryLoadFileUnderstandingDocs(file: {
                id?: string
                fileId?: string
                fileAssetId?: string
                storageFileId?: string
            }): Promise<unknown>
        }

        const docs = await testHandler.tryLoadFileUnderstandingDocs({
            id: '1780307484176_4z5k3xian'
        })

        expect(docs).toBeNull()
        expect(queryBus.execute).not.toHaveBeenCalled()
    })
})
