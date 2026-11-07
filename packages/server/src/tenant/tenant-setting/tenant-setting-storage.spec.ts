import { TenantSettingService } from './tenant-setting.service'
import { TenantSetting } from './tenant-setting.entity'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { CACHE_MANAGER } from '@nestjs/cache-manager'

describe('storage provider configuration cache', () => {
	const tenantId = 'tenant-a'
	const row = Object.assign(new TenantSetting(), { tenantId, name: 'fileStorageProvider', value: 'LOCAL' })
	const repository = { find: jest.fn(), save: jest.fn() }
	const cache = { del: jest.fn() }
	let service: TenantSettingService
	beforeAll(async () => {
		const module = await Test.createTestingModule({
			providers: [
				TenantSettingService,
				{ provide: getRepositoryToken(TenantSetting), useValue: repository },
				{ provide: CACHE_MANAGER, useValue: cache }
			]
		}).compile()
		service = module.get(TenantSettingService)
	})
	beforeEach(() => {
		jest.resetAllMocks()
		row.value = 'LOCAL'
		repository.find.mockResolvedValue([row])
		repository.save.mockResolvedValue([row])
		cache.del.mockResolvedValue(true)
	})
	it('invalidates only the saved tenant after persistence, so the next request reloads the provider', async () => {
		expect(await service.saveSettngs({ fileStorageProvider: 'MINIO' }, tenantId)).toEqual({
			fileStorageProvider: 'MINIO'
		})
		expect(cache.del).toHaveBeenCalledWith('tenantSettings_tenant-a')
		expect(cache.del).toHaveBeenCalledTimes(1)
		expect(repository.save.mock.invocationCallOrder[0]).toBeLessThan(cache.del.mock.invocationCallOrder[0])
	})
	it('does not invalidate settings when persistence fails', async () => {
		repository.save.mockRejectedValue(new Error('database unavailable'))
		await expect(service.saveSettngs({ fileStorageProvider: 'MINIO' }, tenantId)).rejects.toThrow(
			'database unavailable'
		)
		expect(cache.del).not.toHaveBeenCalled()
	})
	it('reports cache invalidation failures instead of acknowledging an effective provider change', async () => {
		cache.del.mockRejectedValue(new Error('cache unavailable'))
		await expect(service.saveSettngs({ fileStorageProvider: 'MINIO' }, tenantId)).rejects.toThrow(
			'cache unavailable'
		)
	})
})
