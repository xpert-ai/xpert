import { randomUUID } from 'node:crypto'
import { DataSource, EntitySchema, Repository, ObjectLiteral, getMetadataArgsStorage } from 'typeorm'
import { setupPluginManagementTests } from './plugin-management.test-fixture'
import type { PluginInstance } from './plugin-instance.entity'
import type { PluginInstanceService } from './plugin-instance.service'
import { loadPluginInstances, buildOrganizationPluginConfigs } from './plugin-instance.loader'
import { replayPluginPublications } from './installation/plugin-publication'
import { PluginStoreLease } from './installation/plugin-store-lock'
import { getConfig } from '@xpert-ai/server-config'

jest.mock('@xpert-ai/server-config', () => ({ getConfig: jest.fn() }))
jest.mock('../core/entities/internal', () => ({ TenantOrganizationBaseEntity: class {} }))
jest.mock('./plugin-config.crypto', () => ({
	serializePluginConfig: (value: unknown) => value,
	deserializePluginConfig: (value: unknown) => value
}))
jest.mock('../core/crud', () => ({
	TenantOrganizationAwareCrudService: class<T extends ObjectLiteral> {
		constructor(private readonly repository: Repository<T>) {}
		create(entity: T) {
			return this.repository.save(entity)
		}
	}
}))

const ActualStrategyBus = jest.requireActual<typeof import('../../../plugin-sdk/src/lib/core/strategy-bus')>(
	'../../../plugin-sdk/src/lib/core/strategy-bus'
).StrategyBus
const ActualInstances =
	jest.requireActual<typeof import('./plugin-instance.service')>('./plugin-instance.service').PluginInstanceService
const ActualEntity =
	jest.requireActual<typeof import('./plugin-instance.entity')>('./plugin-instance.entity').PluginInstance
const publicationIndex = getMetadataArgsStorage().indices.find(
	(index) => index.target === ActualEntity && index.name === 'IDX_plugin_instance_pending_publication'
)
if (!publicationIndex || !Array.isArray(publicationIndex.columns)) {
	throw new Error('The plugin publication recovery index is missing')
}
const url = process.env.XPERT_PLUGIN_TEST_DATABASE_URL
if (
	url &&
	(!['localhost', '127.0.0.1'].includes(new URL(url).hostname) || new URL(url).pathname !== '/xpert_plugin_test_1264')
) {
	throw new Error('A dedicated local plugin regression database is required')
}

;(url ? describe : describe.skip)('Plugin refresh / startup PostgreSQL publication boundary', () => {
	const fixture = setupPluginManagementTests()
	const name = '@xpert-ai/plugin-demo',
		tenantId = randomUUID(),
		organizationId = randomUUID()
	const schema = new EntitySchema<PluginInstance>({
		name: 'PluginInstanceTest',
		tableName: 'plugin_instance',
		columns: {
			id: { type: 'uuid', primary: true, generated: 'uuid' },
			createdAt: { type: 'timestamptz', createDate: true },
			updatedAt: { type: 'timestamptz', updateDate: true },
			tenantId: { type: 'uuid', nullable: true },
			organizationId: { type: 'uuid', nullable: true },
			scopeKey: { type: 'varchar' },
			pluginName: { type: 'varchar' },
			packageName: { type: 'varchar' },
			version: { type: 'varchar', nullable: true },
			source: { type: 'varchar', nullable: true },
			sourceConfig: { type: 'jsonb', nullable: true },
			meta: { type: 'jsonb', nullable: true },
			level: { type: 'varchar' },
			config: { type: 'jsonb' },
			pendingRestart: { type: 'boolean', default: false },
			runtimePublication: { type: 'jsonb', nullable: true },
			configurationStatus: { type: 'varchar', nullable: true },
			configurationError: { type: 'text', nullable: true }
		},
		indices: [
			{ columns: ['scopeKey', 'pluginName'], unique: true },
			{ name: publicationIndex.name, columns: publicationIndex.columns, where: publicationIndex.where }
		]
	})
	let db: DataSource, instances: PluginInstanceService
	beforeAll(async () => {
		db = new DataSource({ type: 'postgres', url, entities: [schema], synchronize: true })
		await db.initialize()
	}, 30000)
	afterAll(async () => {
		await db?.destroy()
	})
	beforeEach(async () => {
		await db.getRepository(schema).clear()
		jest.mocked(getConfig).mockReturnValue({
			apiConfigOptions: { port: 0, graphqlConfigOptions: { path: '', playground: false, debug: false } },
			dbConnectionOptions: { type: 'postgres', url }
		})
		instances = new ActualInstances(db.getRepository(schema), fixture.loadedPlugins, new ActualStrategyBus())
		jest.spyOn(instances, 'getDefaultTenantId').mockResolvedValue(tenantId)
		fixture.RequestContext.getScope.mockReturnValue({ tenantId, organizationId })
		fixture.RequestContext.currentTenantId.mockReturnValue(tenantId)
		fixture.loadPlugin.mockResolvedValue({ meta: { name, version: '2.0.0', level: 'organization' } })
	})

	it('uses an indexed existence check and reads only publication fields for recovery', async () => {
		const row = {
			tenantId,
			organizationId,
			scopeKey: organizationId,
			pluginName: name,
			packageName: name,
			source: 'npm' as const,
			level: 'organization' as const,
			config: { credential: 'test-only-value-that-recovery-must-not-load' },
			version: '2.0.0'
		}
		await instances.upsert(row)
		expect(await instances.hasPendingRuntimePublications()).toBe(false)
		const publication = { publicationId: randomUUID(), scopeKey: organizationId, pluginName: name }
		await instances.upsert({ ...row, runtimePublication: publication })
		const queryLog = jest.spyOn(db.logger, 'logQuery')
		try {
			expect(await instances.hasPendingRuntimePublications()).toBe(true)
			const query = queryLog.mock.calls[0][0]
			expect(query).toContain('EXISTS')
			expect(query).not.toContain('"config"')
			// Check index eligibility on the actual generated SQL; a tiny fixture may prefer a sequential scan.
			const reader = db.createQueryRunner()
			await reader.connect()
			await reader.startTransaction()
			try {
				await reader.query('SET LOCAL enable_seqscan = off')
				const plan = await reader.query(`EXPLAIN (FORMAT JSON) ${query}`)
				expect(JSON.stringify(plan)).toContain('IDX_plugin_instance_pending_publication')
			} finally {
				await reader.rollbackTransaction()
				await reader.release()
			}
			expect(await instances.pendingRuntimePublications()).toEqual([
				{ scopeKey: organizationId, pluginName: name, runtimePublication: publication }
			])
			await instances.acknowledgeRuntimePublication(organizationId, name, publication.publicationId)
			expect(await instances.hasPendingRuntimePublications()).toBe(false)
		} finally {
			queryLog.mockRestore()
		}
	})

	it.each(['organization', 'global', 'system'] as const)(
		'exposes a complete old/new startup snapshot at the %s scope commit boundary',
		async (kind) => {
			const scopeKey = kind === 'system' ? 'system:global' : kind === 'global' ? '__global__' : organizationId
			const organization = kind === 'organization' ? organizationId : '__global__'
			const row = {
				tenantId: kind === 'system' ? null : tenantId,
				organizationId: organization,
				scopeKey,
				pluginName: name,
				packageName: name,
				source: 'npm' as const,
				level: kind === 'system' ? ('system' as const) : ('organization' as const),
				config: {},
				version: '1.0.0'
			}
			await instances.upsert(row)
			// Use the real refresh operation, including the persisted registration lookup.
			await instances.uninstallByPackageName(row.tenantId, organization, name, { scopeKey, cause: 'refresh' })
			const before = await loadPluginInstances({ defaultTenantId: tenantId })
			expect(before).toEqual([expect.objectContaining({ scopeKey, version: '1.0.0' })])
			const writer = db.createQueryRunner()
			await writer.connect()
			await writer.startTransaction()
			try {
				await writer.manager.getRepository(schema).update({ scopeKey, pluginName: name }, { version: '2.0.0' })
				// Independent reader connection while the replacement write is uncommitted.
				expect(await loadPluginInstances({ defaultTenantId: tenantId })).toEqual([
					expect.objectContaining({ version: '1.0.0' })
				])
				await writer.commitTransaction()
			} finally {
				if (writer.isTransactionActive) await writer.rollbackTransaction()
				await writer.release()
			}
			const after = buildOrganizationPluginConfigs(await loadPluginInstances({ defaultTenantId: tenantId }), {
				defaultTenantId: tenantId
			})
			expect(after).toEqual([
				expect.objectContaining({ scopeKey, plugins: [expect.objectContaining({ version: '2.0.0' })] })
			])
		}
	)

	it('preserves the committed row during a paused real management install, and on registration failure', async () => {
		await instances.upsert({
			tenantId,
			organizationId,
			scopeKey: organizationId,
			pluginName: name,
			packageName: name,
			source: 'npm',
			level: 'organization',
			config: {},
			version: '1.0.0'
		})
		const service = new fixture.PluginManagementService(
			fixture.loadedPlugins,
			instances,
			fixture.strategyBus,
			fixture.lazyLoader,
			fixture.moduleRef,
			fixture.dataSource,
			fixture.applicationConfig,
			fixture.runtimeControl,
			fixture.runtimeState,
			new fixture.PluginUninstallService(
				fixture.loadedPlugins,
				instances,
				fixture.strategyBus,
				fixture.runtimeControl,
				fixture.runtimeState
			)
		)
		let release: () => void, entered: () => void
		const gate = new Promise<void>((resolve) => {
				release = resolve
			}),
			ready = new Promise<void>((resolve) => {
				entered = resolve
			})
		fixture.registerPluginsAsync.mockImplementation(async () => {
			entered()
			await gate
			return { modules: [], errors: [{ error: 'registration rejected' }] }
		})
		const result = service
			.installPlugin({ pluginName: name, version: '2.0.0', source: 'npm' })
			.catch(() => 'rejected')
		await ready
		const snapshot = await loadPluginInstances({ defaultTenantId: tenantId })
		release()
		expect(await result).toBe('rejected')
		expect(snapshot).toEqual([expect.objectContaining({ version: '1.0.0' })])
		expect(await loadPluginInstances({ defaultTenantId: tenantId })).toEqual([
			expect.objectContaining({ version: '1.0.0' })
		])
	})

	it('recovers an intent saved with the row after process interruption, retaining it until publication succeeds', async () => {
		const publication = {
			publicationId: randomUUID(),
			pluginName: name,
			scopeKey: organizationId,
			version: '2.0.0'
		}
		await instances.upsert({
			tenantId,
			organizationId,
			scopeKey: organizationId,
			pluginName: name,
			packageName: name,
			source: 'npm',
			level: 'organization',
			config: {},
			version: '2.0.0',
			runtimePublication: publication
		})
		// A new service models a replacement process; all recovery data comes from PostgreSQL.
		const recovered = new ActualInstances(db.getRepository(schema), [], new ActualStrategyBus())
		const lease = new PluginStoreLease('/unused', 60000)
		jest.spyOn(lease, 'assertOwned').mockResolvedValue(undefined)
		fixture.runtimeControl.recordPluginRuntimeChange.mockResolvedValueOnce({ scheduled: false, generation: 0 })
		expect(await replayPluginPublications(recovered, fixture.runtimeControl, lease)).toBe(false)
		expect(await recovered.pendingRuntimePublications()).toHaveLength(1)
		expect(await replayPluginPublications(recovered, fixture.runtimeControl, lease)).toBe(true)
		expect(await recovered.pendingRuntimePublications()).toHaveLength(0)
		expect(await loadPluginInstances({ defaultTenantId: tenantId })).toEqual([
			expect.objectContaining({ version: '2.0.0' })
		])
	})

	it('keeps the previous installation when the writer connection dies before commit', async () => {
		await instances.upsert({
			tenantId,
			organizationId,
			scopeKey: organizationId,
			pluginName: name,
			packageName: name,
			source: 'npm',
			level: 'organization',
			config: {},
			version: '1.0.0'
		})
		const writer = db.createQueryRunner()
		await writer.connect()
		await writer.startTransaction()
		try {
			await writer.manager.getRepository(schema).update({ scopeKey: organizationId }, { version: '2.0.0' })
			await expect(writer.query('SELECT pg_terminate_backend(pg_backend_pid())')).rejects.toThrow()
		} finally {
			await writer.release().catch(() => undefined)
		}
		expect(await loadPluginInstances({ defaultTenantId: tenantId })).toEqual([
			expect.objectContaining({ version: '1.0.0' })
		])
	})

	it('rolls back the installation and publication intent when ownership is lost during the database write', async () => {
		const row = {
			tenantId,
			organizationId,
			scopeKey: organizationId,
			pluginName: name,
			packageName: name,
			source: 'npm' as const,
			level: 'organization' as const,
			config: {},
			version: '1.0.0'
		}
		await instances.upsert(row)
		const publicationLease = {
			assertOwned: jest.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('ELOCKLOST'))
		}
		await expect(
			instances.upsert(
				{
					...row,
					version: '2.0.0',
					runtimePublication: {
						publicationId: randomUUID(),
						scopeKey: organizationId,
						pluginName: name,
						version: '2.0.0'
					}
				},
				{ publicationLease }
			)
		).rejects.toThrow('ELOCKLOST')
		expect(await loadPluginInstances({ defaultTenantId: tenantId })).toEqual([
			expect.objectContaining({ version: '1.0.0' })
		])
		expect(await instances.pendingRuntimePublications()).toEqual([])
	})

	it('does not acknowledge a newer operation and keeps genuine uninstall visible', async () => {
		const publication = {
			publicationId: randomUUID(),
			pluginName: name,
			scopeKey: organizationId,
			version: '2.0.0'
		}
		await instances.upsert({
			tenantId,
			organizationId,
			scopeKey: organizationId,
			pluginName: name,
			packageName: name,
			source: 'npm',
			level: 'organization',
			config: {},
			version: '2.0.0',
			runtimePublication: publication
		})
		await instances.acknowledgeRuntimePublication(organizationId, name, randomUUID())
		expect(await instances.pendingRuntimePublications()).toHaveLength(1)
		// Filesystem cleanup is isolated from this database assertion.
		jest.spyOn(instances, 'removePlugins').mockResolvedValue(undefined)
		await instances.uninstall(tenantId, organizationId, [name], { scopeKey: organizationId, cause: 'uninstall' })
		expect(await loadPluginInstances({ defaultTenantId: tenantId })).toEqual([])
		expect(await instances.pendingRuntimePublications()).toEqual([])
	})
})
