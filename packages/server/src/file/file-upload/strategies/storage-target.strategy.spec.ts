const mockPutFile = jest.fn()
const mockProviderUrl = jest.fn((key: string) => `https://storage.example/${key}`)

jest.mock('../../file-storage', () => ({
	FileStorage: class FileStorage {
		getProvider() {
			return {
				name: 'LOCAL',
				putFile: mockPutFile,
				url: mockProviderUrl
			}
		}
	}
}))

import { StorageTargetStrategy } from './storage-target.strategy'

describe('StorageTargetStrategy', () => {
	const source = {
		name: 'report.txt',
		originalName: 'report.txt',
		mimeType: 'text/plain',
		size: 7,
		buffer: Buffer.from('content'),
		source: {
			kind: 'multipart' as const,
			name: 'report.txt',
			originalName: 'report.txt'
		}
	}
	const context = {
		request: {
			tenantId: 'tenant-A',
			userId: 'user-A'
		}
	}
	const storageFileService = {
		createStorageFile: jest.fn()
	}
	let strategy: StorageTargetStrategy

	beforeEach(() => {
		jest.clearAllMocks()
		mockPutFile.mockImplementation(async (_buffer: Buffer, key: string) => ({ key }))
		storageFileService.createStorageFile.mockResolvedValue({ id: 'storage-1' })
		strategy = new StorageTargetStrategy(storageFileService as never)
	})

	it.each(['../tenant-B/key.txt', '/tenant-B/key.txt', String.raw`..\tenant-B\key.txt`])(
		'rejects a path-bearing file name before writing: %s',
		async (fileName) => {
			await expect(
				strategy.upload(source, { kind: 'storage', fileName }, context)
			).rejects.toThrow('Invalid file name')

			expect(mockPutFile).not.toHaveBeenCalled()
			expect(storageFileService.createStorageFile).not.toHaveBeenCalled()
		}
	)

	it('writes a plain file name inside the authenticated tenant directory', async () => {
		await strategy.upload(source, { kind: 'storage', directory: 'files', fileName: 'report.txt' }, context)

		expect(mockPutFile).toHaveBeenCalledWith(source.buffer, 'files/tenant-A/report.txt')
		expect(storageFileService.createStorageFile).toHaveBeenCalledWith(
			expect.objectContaining({ key: 'files/tenant-A/report.txt' }),
			'LOCAL'
		)
	})
})
