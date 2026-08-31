jest.mock('../core/crud', () => ({
	TenantOrganizationAwareCrudService: class TenantOrganizationAwareCrudService<T> {
		protected repository: any

		constructor(repository: any) {
			this.repository = repository
		}

		async create(input: any) {
			return input
		}

		async findOne(id: string) {
			return this.repository.findOne({ where: { id } })
		}
	}
}))

jest.mock('../core/context', () => ({
	RequestContext: {
		currentUserId: jest.fn(),
		hasRoles: jest.fn()
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

const { RequestContext } = require('../core/context')
const { StorageFileService } = require('./storage-file.service')

describe('StorageFileService', () => {
	let service: InstanceType<typeof StorageFileService>

	beforeEach(() => {
		jest.clearAllMocks()
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

	it('allows the owner to delete a StorageFile', async () => {
		const entity = { id: 'storage-1', tenantId: 'tenant-1', createdById: 'user-1' }
		const repository = {
			findOne: jest.fn().mockResolvedValue(entity),
			remove: jest.fn().mockResolvedValue(entity)
		}
		service = new StorageFileService(repository as any)
		RequestContext.currentUserId.mockReturnValue('user-1')
		RequestContext.hasRoles.mockReturnValue(false)

		await expect(service.deleteStorageFile('storage-1')).resolves.toBe(entity)

		expect(repository.remove).toHaveBeenCalledWith(entity)
	})

	it("rejects an ordinary same-tenant user deleting another user's StorageFile", async () => {
		const entity = { id: 'storage-1', tenantId: 'tenant-1', createdById: 'user-2' }
		const repository = {
			findOne: jest.fn().mockResolvedValue(entity),
			remove: jest.fn()
		}
		service = new StorageFileService(repository as any)
		RequestContext.currentUserId.mockReturnValue('user-1')
		RequestContext.hasRoles.mockReturnValue(false)

		await expect(service.deleteStorageFile('storage-1')).rejects.toMatchObject({ status: 403 })

		expect(repository.remove).not.toHaveBeenCalled()
	})

	it("preserves tenant administrators' ability to delete a StorageFile", async () => {
		const entity = { id: 'storage-1', tenantId: 'tenant-1', createdById: 'user-2' }
		const repository = {
			findOne: jest.fn().mockResolvedValue(entity),
			remove: jest.fn().mockResolvedValue(entity)
		}
		service = new StorageFileService(repository as any)
		RequestContext.currentUserId.mockReturnValue('admin-1')
		RequestContext.hasRoles.mockReturnValue(true)

		await expect(service.deleteStorageFile('storage-1')).resolves.toBe(entity)

		expect(repository.remove).toHaveBeenCalledWith(entity)
	})
})
