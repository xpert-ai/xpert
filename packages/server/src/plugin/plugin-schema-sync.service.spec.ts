import { ModuleRef } from '@nestjs/core'
import { DataSource, Entity, QueryRunner } from 'typeorm'
import { withSchemaLock } from '../database/schema-migration'
import { PluginSchemaSyncService } from './plugin-schema-sync.service'
import { collectPluginOrmMetadata, validatePluginEntityTableNames } from './plugin-orm-metadata'
import { loadPlugin } from './plugin-loader'

jest.mock('./plugin-loader', () => ({ loadPlugin: jest.fn() }))
jest.mock('./plugin-orm-metadata', () => ({
	collectPluginOrmMetadata: jest.fn(),
	validatePluginEntityTableNames: jest.fn(jest.requireActual('./plugin-entity-policy').validatePluginEntityTableNames)
}))
jest.mock('../database/schema-migration', () => ({ withSchemaLock: jest.fn() }))
jest.mock('@xpert-ai/plugin-sdk', () => ({
	GLOBAL_ORGANIZATION_SCOPE: 'global',
	createPluginLogger: jest.fn(() => ({})),
	isPluginArtifactNamespace: (value: unknown) => typeof value === 'string' && /^[a-z][a-z0-9_]*$/.test(value)
}))
jest.mock('typeorm', () => ({ ...jest.requireActual('typeorm'), DataSource: jest.fn() }))

@Entity('plugin_test_entity')
class PluginEntity {}
class PluginModule {}
class PluginSubscriber {
	beforeInsert() {}
}

describe('plugin schema preflight', () => {
	const input = { pluginName: 'test-plugin', pluginBaseDir: '/test-plugin' }
	const pluginMetadata = {
		target: PluginEntity,
		tableName: 'plugin_test_entity',
		synchronize: true,
		relations: [],
		columns: [{ databaseName: 'tenantId' }, { databaseName: 'organizationId' }]
	}
	const hostMetadata = { target: class HostEntity {}, tableName: 'host_entity', synchronize: true, relations: [] }
	const migration = {
		options: { type: 'postgres' },
		initialize: jest.fn(),
		synchronize: jest.fn(),
		destroy: jest.fn(),
		isInitialized: true,
		entityMetadatas: [pluginMetadata, hostMetadata],
		getMetadata: jest.fn(() => pluginMetadata)
	}
	const registrationQuery = jest.fn()
	let service: PluginSchemaSyncService
	beforeEach(() => {
		jest.clearAllMocks()
		registrationQuery.mockReset()
		jest.mocked(withSchemaLock).mockImplementation(async (_source, action) =>
			action({ query: registrationQuery } as unknown as QueryRunner)
		)
		pluginMetadata.synchronize = true
		hostMetadata.synchronize = true
		migration.synchronize.mockReset()
		jest.mocked(DataSource).mockImplementation(() => migration as unknown as DataSource)
		jest.mocked(loadPlugin).mockResolvedValue({
			meta: {
				name: input.pluginName,
				version: '1.0.0',
				level: 'tenant',
				artifactNamespace: 'test',
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
			[]
		)
	})

	it.each([{ subscribers: [] }, { subscribers: [PluginSubscriber] }])(
		'does not run host DDL for a plugin with no entities',
		async ({ subscribers }) => {
			jest.mocked(collectPluginOrmMetadata).mockReturnValue({ entities: [], subscribers })
			await expect(service.synchronize(input)).resolves.toMatchObject({
				name: input.pluginName,
				displayName: 'Test',
				description: 'Test plugin'
			})
			expect(validatePluginEntityTableNames).toHaveBeenCalled()
			expect(DataSource).not.toHaveBeenCalled()
			expect(migration.synchronize).not.toHaveBeenCalled()
		}
	)

	it.each(['missing-namespace', 'organization-level', 'namespace-mismatch'])(
		'rejects invalid entity schema preflight before opening a database connection (%s)',
		async (variant) => {
			const plugin = await loadPlugin(input.pluginName)
			if (variant === 'missing-namespace') plugin.meta.artifactNamespace = undefined
			if (variant === 'organization-level') plugin.meta.level = 'organization'
			jest.mocked(collectPluginOrmMetadata).mockReturnValue({ entities: [PluginEntity], subscribers: [] })
			await expect(
				service.synchronize({
					...input,
					...(variant === 'namespace-mismatch' ? { artifactNamespace: 'other' } : {})
				})
			).rejects.toThrow()
			expect(DataSource).not.toHaveBeenCalled()
			expect(withSchemaLock).not.toHaveBeenCalled()
		}
	)

	it('still applies and closes schema preflight for plugins declaring entities', async () => {
		jest.mocked(collectPluginOrmMetadata).mockReturnValue({ entities: [PluginEntity], subscribers: [] })
		await expect(service.synchronize(input)).resolves.toMatchObject({ name: input.pluginName, version: '1.0.0' })
		expect(DataSource).toHaveBeenCalledWith(
			expect.objectContaining({
				entities: [PluginEntity],
				synchronize: false,
				dropSchema: false,
				migrationsRun: false,
				migrations: [],
				subscribers: []
			})
		)
		expect(pluginMetadata.synchronize).toBe(true)
		expect(hostMetadata.synchronize).toBe(false)
		expect(migration.initialize).toHaveBeenCalledTimes(1)
		expect(withSchemaLock).toHaveBeenCalledWith(migration, expect.any(Function))
		expect(migration.synchronize).toHaveBeenCalledTimes(1)
		expect(migration.getMetadata).toHaveBeenCalledWith(PluginEntity)
		expect(registrationQuery).toHaveBeenCalledWith('SELECT xpert_app_storage_register_relation($1::regclass)', [
			'"plugin_test_entity"'
		])
		expect(registrationQuery.mock.invocationCallOrder[0]).toBeGreaterThan(
			migration.synchronize.mock.invocationCallOrder[0]
		)
		expect(migration.destroy).toHaveBeenCalledTimes(1)
	})

	it('fails preflight and closes the connection when storage registration fails', async () => {
		jest.mocked(collectPluginOrmMetadata).mockReturnValue({ entities: [PluginEntity], subscribers: [] })
		registrationQuery.mockRejectedValueOnce(new Error('storage registration rejected'))
		await expect(service.synchronize(input)).rejects.toThrow('storage registration rejected')
		expect(migration.destroy).toHaveBeenCalledTimes(1)
	})

	it('closes the migration connection and propagates a failed schema change', async () => {
		jest.mocked(collectPluginOrmMetadata).mockReturnValue({ entities: [PluginEntity], subscribers: [] })
		migration.synchronize.mockRejectedValueOnce(new Error('schema change rejected'))
		await expect(service.synchronize(input)).rejects.toThrow('schema change rejected')
		expect(registrationQuery).not.toHaveBeenCalled()
		expect(migration.destroy).toHaveBeenCalledTimes(1)
	})
})
