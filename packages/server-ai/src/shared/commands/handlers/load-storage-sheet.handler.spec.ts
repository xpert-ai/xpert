import { loadCsvWithAutoEncoding, loadExcel } from '@xpert-ai/server-common'
import type { StorageFile } from '@xpert-ai/server-core'
import { GetOwnedStorageFileQuery } from '../../../file-understanding/queries/get-owned-storage-file.query'
import { LoadStorageSheetCommand } from '../load-storage-sheet.command'
import { LoadStorageSheetHandler } from './load-storage-sheet.handler'

jest.mock('@xpert-ai/server-common', () => {
    const actual = jest.requireActual<typeof import('@xpert-ai/server-common')>('@xpert-ai/server-common')
    return {
        ...actual,
        loadCsvWithAutoEncoding: jest.fn(),
        loadExcel: jest.fn()
    }
})

describe('LoadStorageSheetHandler', () => {
    it('loads a legacy StorageFile only through the owner-authorized query', async () => {
        const storageFile = {
            id: 'storage-file-1',
            file: 'uploads/report.csv'
        } as StorageFile
        const queryBus = { execute: jest.fn().mockResolvedValue(storageFile) }
        const handler = new LoadStorageSheetHandler(queryBus as never)
        jest.spyOn(handler, 'getFilePath').mockReturnValue('/authorized/report.csv')
        jest.mocked(loadCsvWithAutoEncoding).mockResolvedValue([])

        await handler.execute(new LoadStorageSheetCommand(storageFile.id))

        expect(queryBus.execute).toHaveBeenCalledWith(expect.any(GetOwnedStorageFileQuery))
        expect((queryBus.execute.mock.calls[0][0] as GetOwnedStorageFileQuery).storageFileId).toBe(storageFile.id)
        expect(loadCsvWithAutoEncoding).toHaveBeenCalledWith('/authorized/report.csv')
        expect(loadExcel).not.toHaveBeenCalled()
    })
})
