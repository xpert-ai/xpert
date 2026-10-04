import { ModuleRef } from '@nestjs/core'
import { DataSource } from 'typeorm'
import { RedisLockService } from '../core/redis/redis-lock.service'
import { PluginSchemaSyncService } from './plugin-schema-sync.service'
import { collectPluginOrmMetadata, validatePluginEntityTableNames } from './plugin-orm-metadata'
import { loadPlugin } from './plugin-loader'

jest.mock('./plugin-loader', () => ({ loadPlugin: jest.fn() }))
jest.mock('./plugin-orm-metadata', () => ({
	collectPluginOrmMetadata: jest.fn(),
	validatePluginEntityTableNames: jest.fn()
}))
jest.mock('../core/redis/redis-lock.service', () => ({ RedisLockService: class {} }))
jest.mock('@xpert-ai/plugin-sdk', () => ({
	GLOBAL_ORGANIZATION_SCOPE: 'global',
	createPluginLogger: jest.fn(() => ({}))
}))
jest.mock('typeorm', () => ({ DataSource: jest.fn() }))

class PluginEntity {}
class PluginModule {}
class PluginSubscriber {
	beforeInsert() {}
}

describe('plugin schema preflight', () => {
	const input = { pluginName: 'test-plugin', pluginBaseDir: '/test-plugin' }
	const migration = { initialize: jest.fn(), synchronize: jest.fn(), destroy: jest.fn(), isInitialized: true }
	let service: PluginSchemaSyncService
	beforeEach(() => {
		jest.clearAllMocks()
		jest.mocked(DataSource).mockImplementation(() => migration as unknown as DataSource)
		jest.mocked(loadPlugin).mockResolvedValue({
			meta: {
				name: input.pluginName,
				version: '1.0.0',
				level: 'organization',
				category: 'middleware',
				displayName: 'Test',
				description: 'Test plugin',
				author: 'Test'
			},
			register: () => ({ module: PluginModule })
		})
		service = new PluginSchemaSyncService(
			{ options: { type: 'postgres', synchronize: false } } as DataSource,
			{} as ModuleRef,
			{
				runWithLock: async (_key: string, _ttl: number, work: () => Promise<boolean>) => ({
					acquired: true,
					result: await work()
				})
			} as unknown as RedisLockService
		)
	})

	it.each([{ subscribers: [] }, { subscribers: [PluginSubscriber] }])(
		'does not run host DDL for a plugin with no entities',
		async ({ subscribers }) => {
			jest.mocked(collectPluginOrmMetadata).mockReturnValue({ entities: [], subscribers })
			await service.synchronize(input)
			expect(validatePluginEntityTableNames).toHaveBeenCalled()
			expect(DataSource).not.toHaveBeenCalled()
			expect(migration.synchronize).not.toHaveBeenCalled()
		}
	)

	it('still applies and closes schema preflight for plugins declaring entities', async () => {
		jest.mocked(collectPluginOrmMetadata).mockReturnValue({ entities: [PluginEntity], subscribers: [] })
		await service.synchronize(input)
		expect(DataSource).toHaveBeenCalledWith(
			expect.objectContaining({ entities: [PluginEntity], synchronize: false })
		)
		expect(migration.initialize).toHaveBeenCalledTimes(1)
		expect(migration.synchronize).toHaveBeenCalledTimes(1)
		expect(migration.destroy).toHaveBeenCalledTimes(1)
	})
})
