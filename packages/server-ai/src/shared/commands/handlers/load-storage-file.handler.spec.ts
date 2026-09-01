jest.mock('@xpert-ai/server-core', () => ({
    FileStorage: class FileStorage {
        setProvider() {
            return this
        }

        getProviderInstance() {
            return {
                path: (file: string) => `/storage/${file}`
            }
        }
    }
}))

import { ForbiddenException } from '@nestjs/common'
import { GetOwnedStorageFileQuery } from '../../../file-understanding/queries/get-owned-storage-file.query'
import { LoadFileCommand } from '../load-file.command'
import { LoadStorageFileCommand } from '../load-storage-file.command'
import { LoadStorageFileHandler } from './load-storage-file.handler'

describe('LoadStorageFileHandler', () => {
    it('loads a legacy StorageFile only after the current owner is authorized', async () => {
        const queryBus = {
            execute: jest.fn().mockImplementation(async (query: unknown) => {
                if (query instanceof GetOwnedStorageFileQuery) {
                    return {
                        id: 'storage-1',
                        file: 'tenant-1/storage-1.txt',
                        mimetype: 'text/plain',
                        storageProvider: 'LOCAL'
                    }
                }
                if (query instanceof LoadFileCommand) {
                    return [{ pageContent: 'authorized content' }]
                }
                throw new Error(`Unexpected query: ${query?.constructor?.name}`)
            })
        }
        const handler = new LoadStorageFileHandler(queryBus as never)

        await expect(handler.execute(new LoadStorageFileCommand('storage-1'))).resolves.toEqual([
            { pageContent: 'authorized content' }
        ])
        expect(queryBus.execute).toHaveBeenNthCalledWith(1, expect.any(GetOwnedStorageFileQuery))
        expect(queryBus.execute).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                file: expect.objectContaining({ filePath: '/storage/tenant-1/storage-1.txt' })
            })
        )
    })

    it('does not load bytes when the legacy StorageFile is owned by another user', async () => {
        const queryBus = {
            execute: jest.fn().mockRejectedValue(new ForbiddenException())
        }
        const handler = new LoadStorageFileHandler(queryBus as never)

        await expect(handler.execute(new LoadStorageFileCommand('storage-foreign'))).rejects.toBeInstanceOf(
            ForbiddenException
        )
        expect(queryBus.execute).toHaveBeenCalledTimes(1)
        expect(queryBus.execute).toHaveBeenCalledWith(expect.any(GetOwnedStorageFileQuery))
    })
})
