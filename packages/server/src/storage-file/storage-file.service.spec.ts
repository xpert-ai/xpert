jest.mock('../core/crud', () => ({
	TenantOrganizationAwareCrudService: class TenantOrganizationAwareCrudService<T> {
		protected repository: any

		constructor(repository: any) {
			this.repository = repository
		}

		async create(input: any) {
			return input
		}
	}
}))

jest.mock('./storage-file.entity', () => ({
	StorageFile: class StorageFile {}
}))

jest.mock('../file/file-storage/file-storage', () => ({
	FileStorage: class FileStorage {
		getProvider() {
			return {
				name: 'LOCAL'
			}
		}
	}
}))

const { StorageFileService } = require('./storage-file.service')

describe('StorageFileService', () => {
	let service: InstanceType<typeof StorageFileService>

	beforeEach(() => {
		service = new StorageFileService({} as any)
	})

	it('keeps decoded multipart filenames unchanged when creating a storage file', async () => {
		const file = {
			key: 'files/tenant/file.txt',
			url: 'https://example.com/files/tenant/file.txt',
			originalname: '测试中文文件.txt',
			size: 22449,
			mimetype: 'text/plain',
			encoding: undefined
		}

		const result = await service.createStorageFile(file as any, 'LOCAL')

		expect(result).toEqual(
			expect.objectContaining({
				file: 'files/tenant/file.txt',
				url: 'https://example.com/files/tenant/file.txt',
				originalName: '测试中文文件.txt',
				size: 22449,
				mimetype: 'text/plain',
				storageProvider: 'LOCAL'
			})
		)
	})
})
