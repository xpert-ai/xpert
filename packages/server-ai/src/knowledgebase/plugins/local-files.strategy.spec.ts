import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { STATE_VARIABLE_HUMAN } from '@xpert-ai/contracts'
import { GetOwnedStorageFileQuery } from '../../file-understanding/queries/get-owned-storage-file.query'
import { LocalFileStrategy } from './local-files.strategy'

describe('LocalFileStrategy', () => {
    it('resolves every legacy StorageFile through owner authorization', async () => {
        const queryBus = {
            execute: jest
                .fn()
                .mockResolvedValueOnce({
                    id: 'storage-file-1',
                    file: 'uploads/report.csv',
                    originalName: 'report.csv',
                    mimetype: 'text/csv',
                    size: 12
                })
                .mockResolvedValueOnce({
                    id: 'storage-file-2',
                    file: 'uploads/notes.txt',
                    originalName: 'notes.txt',
                    mimetype: 'text/plain',
                    size: 8
                })
        }
        const strategy = new LocalFileStrategy({} as never, queryBus as never)

        const documents = await strategy.loadDocuments({
            fileExtensions: [],
            [STATE_VARIABLE_HUMAN]: {
                files: [{ id: 'file-asset-1', storageFileId: 'storage-file-1' }, { id: 'storage-file-2' }]
            }
        } as never)

        expect(queryBus.execute).toHaveBeenCalledTimes(2)
        expect(queryBus.execute.mock.calls.map(([query]) => query)).toEqual([
            expect.any(GetOwnedStorageFileQuery),
            expect.any(GetOwnedStorageFileQuery)
        ])
        expect(queryBus.execute.mock.calls.map(([query]) => (query as GetOwnedStorageFileQuery).storageFileId)).toEqual(
            ['storage-file-1', 'storage-file-2']
        )
        expect(documents).toHaveLength(2)
    })

    it('rejects another user StorageFile before producing a document', async () => {
        const queryBus = { execute: jest.fn().mockRejectedValue(new ForbiddenException()) }
        const strategy = new LocalFileStrategy({} as never, queryBus as never)

        await expect(
            strategy.loadDocuments({
                fileExtensions: [],
                [STATE_VARIABLE_HUMAN]: { files: [{ id: 'victim-storage-file' }] }
            } as never)
        ).rejects.toBeInstanceOf(ForbiddenException)

        expect(queryBus.execute).toHaveBeenCalledWith(expect.any(GetOwnedStorageFileQuery))
    })

    it('rejects an unmanaged file without a StorageFile handle', async () => {
        const queryBus = { execute: jest.fn() }
        const strategy = new LocalFileStrategy({} as never, queryBus as never)

        await expect(
            strategy.loadDocuments({
                fileExtensions: [],
                [STATE_VARIABLE_HUMAN]: { files: [{ name: 'unmanaged.csv' }] }
            } as never)
        ).rejects.toBeInstanceOf(BadRequestException)

        expect(queryBus.execute).not.toHaveBeenCalled()
    })
})
