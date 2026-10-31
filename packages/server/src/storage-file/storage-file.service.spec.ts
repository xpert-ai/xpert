const mockDeleteFile = jest.fn()
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
		setProvider() {
			return this
		}
		getProviderInstance() {
			return this.getProvider()
		}
		getProvider() {
			return {
				name: 'LOCAL',
				deleteFile: mockDeleteFile
			}
		}
	}
}))

const { RequestContext } = require('../core/context')
const { StorageFileService } = require('./storage-file.service')
const { StorageFileSubscriber } = require('./storage-file.subscriber')

describe('StorageFileService', () => {
	let service: InstanceType<typeof StorageFileService>

	beforeEach(() => {
		jest.clearAllMocks()
		mockDeleteFile.mockReset().mockResolvedValue(undefined)
		service = new StorageFileService({} as never)
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

		const result = await service.createStorageFile(file as never, 'LOCAL')

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
		service = new StorageFileService(repository as never)
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
		service = new StorageFileService(repository as never)
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
		service = new StorageFileService(repository as never)
		RequestContext.currentUserId.mockReturnValue('admin-1')
		RequestContext.hasRoles.mockReturnValue(true)

		await expect(service.deleteStorageFile('storage-1')).resolves.toBe(entity)

		expect(repository.remove).toHaveBeenCalledWith(entity)
	})
	function removalFixture() {
		const entity = {
			id: 'storage-1',
			tenantId: 'tenant-1',
			organizationId: 'org-1',
			createdById: 'user-1',
			file: 'original',
			thumb: 'thumbnail',
			storageProvider: 'LOCAL'
		}
		const subscriber = new StorageFileSubscriber()
		const repository = {
			findOne: jest.fn().mockResolvedValue(entity),
			remove: jest.fn(async (_entity, options?: { data?: object }) => {
				await subscriber.afterRemove({ entityId: entity.id, entity, queryRunner: { data: options?.data } })
				return entity
			})
		}
		RequestContext.currentUserId.mockReturnValue('user-1')
		RequestContext.hasRoles.mockReturnValue(false)
		service = new StorageFileService(repository as never)
		return { entity, repository, subscriber }
	}

	it('deletes the original once, preserves thumbnail cleanup, after confirmation', async () => {
		const { entity, repository } = removalFixture()
		await expect(service.deleteStorageFile(entity.id)).resolves.toBe(entity)
		expect(mockDeleteFile.mock.calls).toEqual([['original'], ['thumbnail']])
		expect(mockDeleteFile.mock.invocationCallOrder[0]).toBeLessThan(repository.remove.mock.invocationCallOrder[0])
	})

	it('keeps metadata when object deletion fails and propagates the storage error', async () => {
		const { entity, repository } = removalFixture()
		const failure = new Error('provider timeout')
		mockDeleteFile.mockRejectedValueOnce(failure)
		await expect(service.deleteStorageFile(entity.id)).rejects.toBe(failure)
		expect(repository.remove).not.toHaveBeenCalled()
	})

	it('propagates metadata failure without reporting successful cleanup', async () => {
		const { entity, repository } = removalFixture()
		const failure = new Error('database unavailable')
		repository.remove.mockRejectedValueOnce(failure)
		await expect(service.deleteStorageFile(entity.id)).rejects.toBe(failure)
		expect(mockDeleteFile).toHaveBeenCalledWith('original')
	})

	it('does not call the provider for an unauthorized removal', async () => {
		const { entity, repository } = removalFixture()
		RequestContext.currentUserId.mockReturnValue('other-user')
		await expect(service.deleteStorageFile(entity.id)).rejects.toMatchObject({ status: 403 })
		expect(mockDeleteFile).not.toHaveBeenCalled()
		expect(repository.remove).not.toHaveBeenCalled()
	})

	it('revalidates the scope of domain-authorized removal', async () => {
		const { entity } = removalFixture()
		for (const scope of [
			{ ...entity, tenantId: 'other-tenant' },
			{ ...entity, organizationId: 'other-org' }
		]) {
			await expect(service.deleteAuthorizedStorageFile(scope)).rejects.toMatchObject({ status: 403 })
		}
		await expect(service.deleteAuthorizedStorageFile(entity)).resolves.toBe(entity)
	})

	it.each([undefined, { provider: 'OTHER', key: 'original' }, { provider: 'LOCAL', key: 'other-key' }])(
		'retains direct ORM cleanup without matching confirmation: %j',
		async (confirmation) => {
			const { entity, subscriber } = removalFixture()
			await subscriber.afterRemove({
				entityId: entity.id,
				entity,
				queryRunner: { data: { confirmedStorageFileDeletion: confirmation } }
			})
			expect(mockDeleteFile.mock.calls).toEqual([['original'], ['thumbnail']])
		}
	)
})
