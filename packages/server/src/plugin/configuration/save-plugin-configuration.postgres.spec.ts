import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { DataSource, EntitySchema, type Repository } from 'typeorm'
import { RequestContext, StrategyBus } from '@xpert-ai/plugin-sdk'
import { RequestScopeLevel } from '@xpert-ai/contracts'
import { PluginInstance } from '../plugin-instance.entity'
import { PluginInstanceService } from '../plugin-instance.service'
import { deserializePluginConfigStrict, serializePluginConfig } from '../plugin-config.crypto'
import type { LoadedPluginRecord } from '../types'
import { PluginConfigurationReader } from './plugin-configuration-reader.service'

jest.mock('@xpert-ai/server-config', () => ({ environment: { secretsEncryptionKey: 'configuration-write-test' } }))
jest.mock('@xpert-ai/plugin-sdk', () => ({
	GLOBAL_ORGANIZATION_SCOPE: '__global__', SYSTEM_GLOBAL_SCOPE: 'system:global',
	getTenantGlobalScopeKey: (id: string) => `tenant:${id}:global`,
	isTenantGlobalScopeKey: (value?: string) => value?.startsWith('tenant:') && value.endsWith(':global'),
	resolveTenantGlobalScopeKey: (id: string) => `tenant:${id}:global`,
	setDefaultTenantId: jest.fn(), StrategyBus: class {},
	RequestContext: { getScope: jest.fn(), currentTenantId: jest.fn() }
}))
jest.mock('../plugin-instance.entity', () => ({ PluginInstance: class {} }))
jest.mock('../plugin.helper', () => ({ clearPluginLoadFailure: jest.fn() }))
jest.mock('../organization-plugin.store', () => ({}))
jest.mock('../../core/crud', () => ({ TenantOrganizationAwareCrudService: class {} }))

const url = process.env.XPERT_PLUGIN_CONFIGURATION_TEST_DATABASE_URL
if (url && (!['localhost', '127.0.0.1'].includes(new URL(url).hostname) ||
	!/^\/xpert_config_test_[a-z0-9_]+$/.test(new URL(url).pathname))) {
	throw new Error('A dedicated local configuration test database is required')
}

;(url ? describe : describe.skip)('plugin configuration PostgreSQL persistence', () => {
	const schemaName = `configuration_${randomUUID().replace(/-/g, '')}`
	const tenantId = randomUUID(), organizationId = randomUUID(), name = '@fixture/code-plugin'
	const entity = new EntitySchema<PluginInstance>({
		name: 'PluginConfigurationFixture', tableName: 'plugin_instance',
		columns: {
			id: { type: 'uuid', primary: true, generated: 'uuid' },
			updatedAt: { type: 'timestamptz', updateDate: true },
			tenantId: { type: 'uuid', nullable: true }, organizationId: { type: 'uuid', nullable: true },
			scopeKey: { type: 'varchar', nullable: true }, pluginName: { type: 'varchar' },
			packageName: { type: 'varchar' }, version: { type: 'varchar', nullable: true },
			source: { type: 'varchar', nullable: true }, sourceConfig: { type: 'jsonb', nullable: true },
			meta: { type: 'jsonb', nullable: true }, level: { type: 'varchar' }, config: { type: 'jsonb' },
			pendingRestart: { type: 'boolean', default: false }, runtimePublication: { type: 'jsonb', nullable: true },
			configurationStatus: { type: 'varchar', nullable: true }, configurationError: { type: 'text', nullable: true }
		},
		indices: [{ columns: ['scopeKey', 'pluginName'], unique: true },
			{ columns: ['tenantId', 'organizationId', 'pluginName'], unique: true }]
	})
	let db: DataSource, repo: Repository<PluginInstance>, service: PluginInstanceService
	let loaded: LoadedPluginRecord[]
	beforeAll(async () => {
		db = await new DataSource({ type: 'postgres', url, schema: schemaName, entities: [entity],
			extra: { application_name: schemaName } }).initialize()
		await db.query(`CREATE SCHEMA "${schemaName}"`)
		await db.synchronize()
		repo = db.getRepository(entity)
	}, 30000)
	afterAll(async () => {
		if (db?.isInitialized) {
			try { await db.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`) }
			finally { await db.destroy() }
		}
	})
	beforeEach(async () => {
		await repo.clear()
		loaded = []
		service = new PluginInstanceService(repo, loaded, new StrategyBus(), new PluginConfigurationReader(repo))
		jest.spyOn(service, 'getDefaultTenantId').mockResolvedValue(tenantId)
		jest.mocked(RequestContext.getScope).mockReturnValue({ tenantId, organizationId, level: RequestScopeLevel.ORGANIZATION })
		jest.mocked(RequestContext.currentTenantId).mockReturnValue(tenantId)
	})
	function input(overrides: Partial<PluginInstance> = {}): PluginInstance {
		return { tenantId, organizationId, scopeKey: organizationId, pluginName: name, packageName: name,
			version: '1.0.0', source: 'code', sourceConfig: { workspacePath: '/prepared/builtin', runtimeName: 'running' },
			level: 'organization', config: { key: 'new-secret' }, configurationStatus: 'valid', configurationError: null,
			...overrides }
	}
	function staged(): PluginInstance {
		return input({ version: '2.0.0', sourceConfig: { runtimeName: 'staged' }, pendingRestart: true,
			runtimePublication: { publicationId: randomUUID(), scopeKey: organizationId, pluginName: name },
			meta: { name, version: '2.0.0', category: 'middleware', displayName: 'Fixture', description: 'Fixture', author: 'Test' }, config: serializePluginConfig({ key: 'installed-secret' }) })
	}
	async function expectSavedIdentity(row: PluginInstance) {
		const saved = await repo.findOneByOrFail({ id: row.id })
		for (const key of ['id', 'version', 'source', 'sourceConfig', 'packageName', 'level', 'scopeKey',
			'tenantId', 'organizationId', 'pendingRestart', 'runtimePublication', 'meta'] as const) {
			expect(saved[key]).toEqual(row[key])
		}
		expect(deserializePluginConfigStrict(saved.config)).toEqual({ key: 'new-secret' })
		expect(JSON.stringify(saved.config)).not.toContain('new-secret')
		expect(saved.configurationStatus).toBe('valid')
		expect(saved.configurationError).toBeNull()
	}
	async function waitForDatabaseLock() {
		const deadline = Date.now() + 3000
		while (Date.now() < deadline) {
			const rows: Array<{ waiting: boolean }> = await db.query(
				`SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE application_name = $1 AND wait_event_type = 'Lock') AS waiting`,
				[schemaName])
			if (rows[0].waiting) return
			await delay(10)
		}
		throw new Error('Expected the configuration writer to wait for the installation transaction')
	}

	it.each(['organization', 'tenant', 'system'] as const)('first %s configuration keeps the loaded artifact readable', async level => {
		const global = level !== 'organization'
		const scopeKey = level === 'system' ? 'system:global' : global ? `tenant:${tenantId}:global` : organizationId
		const plugin: LoadedPluginRecord = { name, packageName: name, source: 'code',
			sourceConfig: { workspacePath: '/prepared/builtin', runtimeName: 'running' }, level, scopeKey,
			tenantId: level === 'system' ? null : tenantId, organizationId: global ? '__global__' : organizationId,
			instance: { meta: { name, version: '1.0.0', category: 'middleware', displayName: 'Fixture', description: 'Fixture', author: 'Test' } },
			ctx: { config: {} } }
		loaded.push(plugin)
		await service.saveConfiguration(input({ level, scopeKey, organizationId: plugin.organizationId }))
		const row = await repo.findOneByOrFail({ scopeKey })
		expect(row.source).toBe('code')
		expect(row.sourceConfig).toEqual(plugin.sourceConfig)
		expect(row.tenantId).toBe(plugin.tenantId)
		expect(row.organizationId).toBe(global ? null : organizationId)
		await expect(new PluginConfigurationReader(repo).createReader(plugin)()).resolves.toEqual({ key: 'new-secret' })
	})

	it('configuration updates preserve a staged installation and all publication metadata', async () => {
		const row = await repo.save(staged())
		await service.saveConfiguration(input())
		await expectSavedIdentity(row)
	})

	it.each(['existing', 'first'] as const)('does not undo an installation racing the %s configuration save', async kind => {
		if (kind === 'existing') await repo.save(input())
		const installer = db.createQueryRunner()
		await installer.connect()
		await installer.startTransaction()
		let saving: Promise<void> | undefined
		try {
			const installation = staged()
			const installationRepo = installer.manager.getRepository(entity)
			if (kind === 'existing') await installationRepo.update({ scopeKey: organizationId }, installation)
			else await installationRepo.insert(installation)
			const row = await installationRepo.findOneByOrFail({ scopeKey: organizationId })
			const sync = jest.spyOn(service, 'syncLoadedPluginConfig')
			saving = service.saveConfiguration(input())
			void saving.catch(() => undefined)
			await waitForDatabaseLock()
			expect(sync).not.toHaveBeenCalled()
			await installer.commitTransaction()
			await saving
			await expectSavedIdentity(row)
			expect(sync).toHaveBeenCalledTimes(1)
		} finally {
			if (installer.isTransactionActive) await installer.rollbackTransaction()
			await saving?.catch(() => undefined)
			await installer.release()
		}
	})

	it('concurrent first saves create one registration', async () => {
		await Promise.all([service.saveConfiguration(input()), service.saveConfiguration(input())])
		expect(await repo.count()).toBe(1)
		const row = await repo.findOneByOrFail({ scopeKey: organizationId })
		expect(row.sourceConfig).toEqual(input().sourceConfig)
		expect(deserializePluginConfigStrict(row.config)).toEqual({ key: 'new-secret' })
	})

	it('normalizes legacy scope without creating a duplicate or replacing the installed artifact', async () => {
		const row = await repo.save({ ...staged(), scopeKey: null, tenantId: null })
		await service.saveConfiguration(input())
		await expectSavedIdentity({ ...row, scopeKey: organizationId, tenantId })
		expect(await repo.count()).toBe(1)
	})

	it('keeps another organization unchanged and does not sync failed writes', async () => {
		const other = await repo.save(input({ organizationId: randomUUID(), scopeKey: randomUUID(), config: {} }))
		await service.saveConfiguration(input())
		expect((await repo.findOneByOrFail({ id: other.id })).config).toEqual({})
		const sync = jest.spyOn(service, 'syncLoadedPluginConfig')
		const transaction = jest.spyOn(repo.manager, 'transaction').mockRejectedValueOnce(new Error('database unavailable'))
		try {
			await expect(service.saveConfiguration(input())).rejects.toThrow('database unavailable')
			expect(sync).not.toHaveBeenCalled()
		} finally { transaction.mockRestore() }
	})

	it('rejects a unique-key conflict outside the selected scope without changing configuration', async () => {
		const row = await repo.save(input({ scopeKey: 'foreign-scope', config: {} }))
		const sync = jest.spyOn(service, 'syncLoadedPluginConfig')
		await expect(service.saveConfiguration(input())).rejects.toMatchObject({ status: 409 })
		expect((await repo.findOneByOrFail({ id: row.id })).config).toEqual({})
		expect(await repo.count()).toBe(1)
		expect(sync).not.toHaveBeenCalled()
	})
})
