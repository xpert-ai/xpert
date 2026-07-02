jest.mock('@xpert-ai/plugin-sdk', () => ({
	GLOBAL_ORGANIZATION_SCOPE: '__global__',
	SYSTEM_GLOBAL_SCOPE: 'system:global',
	TENANT_GLOBAL_SCOPE_PREFIX: 'tenant:',
	TENANT_GLOBAL_SCOPE_SUFFIX: ':global',
	getTenantGlobalScopeKey: (tenantId: string) => `tenant:${tenantId}:global`,
	isTenantGlobalScopeKey: (value?: string | null) =>
		typeof value === 'string' && value.startsWith('tenant:') && value.endsWith(':global'),
	resolveTenantGlobalScopeKey: jest.fn((tenantId?: string | null) =>
		tenantId && tenantId !== 'default-tenant' ? `tenant:${tenantId}:global` : '__global__'
	),
	setDefaultTenantId: jest.fn(),
	RequestContext: {
		currentTenantId: jest.fn(),
		getOrganizationId: jest.fn(),
		getScope: jest.fn()
	},
	StrategyBus: class StrategyBus {}
}))

jest.mock('node:fs', () => {
	const actual = jest.requireActual('node:fs')
	return {
		...actual,
		existsSync: jest.fn(() => false),
		readFileSync: jest.fn(),
		readdirSync: jest.fn(() => []),
		rmSync: jest.fn(),
		writeFileSync: jest.fn()
	}
})

jest.mock('./organization-plugin.store', () => ({
	getOrganizationManifestPath: jest.fn((organizationId: string) => `/tmp/${organizationId}/manifest.json`),
	getOrganizationPluginPath: jest.fn(
		(organizationId: string, pluginName: string) => `/tmp/${organizationId}/${pluginName}`
	),
	getOrganizationPluginRoot: jest.fn((organizationId: string) => `/tmp/${organizationId}`)
}))

jest.mock('./plugin.helper', () => ({
	clearPluginLoadFailure: jest.fn()
}))

jest.mock('./plugin-config.crypto', () => ({
	deserializePluginConfig: jest.fn((value: unknown) => value ?? {}),
	serializePluginConfig: jest.fn((value: unknown) => value ?? {})
}))

jest.mock('./plugin-instance.entity', () => ({
	PluginInstance: class PluginInstance {}
}))

jest.mock('../core/crud', () => ({
	TenantOrganizationAwareCrudService: class TenantOrganizationAwareCrudService<T> {
		protected repository: any

		constructor(repository: any) {
			this.repository = repository
		}

		create(entity: T) {
			return entity
		}
	}
}))

const { IsNull } = require('typeorm')
const { rmSync } = require('node:fs')
const { RequestContext } = require('@xpert-ai/plugin-sdk')
const { clearPluginLoadFailure } = require('./plugin.helper')
const {
	getOrganizationManifestPath,
	getOrganizationPluginPath,
	getOrganizationPluginRoot
} = require('./organization-plugin.store')
const { PluginInstanceService } = require('./plugin-instance.service')

describe('PluginInstanceService', () => {
	const defaultTenantQuery = {
		select: jest.fn(() => defaultTenantQuery),
		from: jest.fn(() => defaultTenantQuery),
		where: jest.fn(() => defaultTenantQuery),
		limit: jest.fn(() => defaultTenantQuery),
		getRawOne: jest.fn()
	}
	const repo = {
		delete: jest.fn(),
		find: jest.fn(),
		findOne: jest.fn(),
		save: jest.fn(),
		create: jest.fn((input: any) => input),
		manager: {
			createQueryBuilder: jest.fn(() => defaultTenantQuery)
		}
	}

	const strategyBus = {
		remove: jest.fn()
	}

	const loadedPlugins: Array<any> = []

	let service: InstanceType<typeof PluginInstanceService>

	beforeEach(() => {
		jest.resetAllMocks()
		defaultTenantQuery.select.mockReturnValue(defaultTenantQuery)
		defaultTenantQuery.from.mockReturnValue(defaultTenantQuery)
		defaultTenantQuery.where.mockReturnValue(defaultTenantQuery)
		defaultTenantQuery.limit.mockReturnValue(defaultTenantQuery)
		defaultTenantQuery.getRawOne.mockResolvedValue({ id: 'default-tenant' })
		repo.create.mockImplementation((input: any) => input)
		repo.manager.createQueryBuilder.mockReturnValue(defaultTenantQuery)
		RequestContext.getScope.mockReturnValue({
			tenantId: 'tenant-1',
			organizationId: 'org-1'
		})
		RequestContext.currentTenantId.mockReturnValue('tenant-1')
		getOrganizationManifestPath.mockImplementation(
			(organizationId: string) => `/tmp/${organizationId}/manifest.json`
		)
		getOrganizationPluginPath.mockImplementation(
			(organizationId: string, pluginName: string) => `/tmp/${organizationId}/${pluginName}`
		)
		getOrganizationPluginRoot.mockImplementation((organizationId: string) => `/tmp/${organizationId}`)
		loadedPlugins.length = 0
		service = new PluginInstanceService(repo as any, loadedPlugins, strategyBus as any)
	})

	it('deletes global plugin records using the explicit global scope', async () => {
		const removePluginsSpy = jest.spyOn(service, 'removePlugins').mockResolvedValue(undefined)

		await service.uninstall('tenant-1', '__global__', ['@xpert-ai/plugin-broken-demo@1.0.0'])

		expect(repo.delete).toHaveBeenCalledTimes(2)
		expect(repo.delete).toHaveBeenCalledWith({
			scopeKey: 'tenant:tenant-1:global',
			pluginName: expect.anything()
		})
		const criteria = repo.delete.mock.calls[1][0]
		expect(criteria.tenantId).toBe('tenant-1')
		expect(criteria.organizationId).toEqual(IsNull())
		expect(criteria.scopeKey).toEqual(IsNull())
		expect(removePluginsSpy).toHaveBeenCalledWith('__global__', ['@xpert-ai/plugin-broken-demo'], {
			tenantId: 'tenant-1',
			scopeKey: 'tenant:tenant-1:global'
		})
	})

	it('clears failure cache when removing plugins', async () => {
		loadedPlugins.push({
			organizationId: 'org-1',
			name: '@xpert-ai/plugin-broken-demo',
			ctx: {}
		})

		await service.removePlugins('org-1', ['@xpert-ai/plugin-broken-demo'])

		expect(clearPluginLoadFailure).toHaveBeenCalledWith('org-1', '@xpert-ai/plugin-broken-demo')
		expect(strategyBus.remove).toHaveBeenCalledWith('org-1', '@xpert-ai/plugin-broken-demo')
		expect(loadedPlugins).toHaveLength(0)
		expect(rmSync).toHaveBeenCalled()
	})

	it('preserves stored sourceConfig when updating an existing code plugin record', async () => {
		repo.findOne.mockResolvedValue({
			pluginName: '@xpert-ai/plugin-code-demo',
			packageName: '@xpert-ai/plugin-code-demo',
			source: 'code',
			sourceConfig: {
				workspacePath: '/tmp/workspaces/plugin-code-demo'
			},
			level: 'organization'
		})
		repo.save.mockImplementation(async (entity) => entity)

		await service.upsert({
			tenantId: 'tenant-1',
			organizationId: 'org-1',
			pluginName: '@xpert-ai/plugin-code-demo',
			packageName: '@xpert-ai/plugin-code-demo',
			source: 'code',
			config: { enabled: true }
		} as any)

		expect(repo.save).toHaveBeenCalledWith(
			expect.objectContaining({
				sourceConfig: {
					workspacePath: '/tmp/workspaces/plugin-code-demo'
				}
			})
		)
	})

	it('upserts non-default tenant global plugins without matching other tenants', async () => {
		repo.findOne.mockResolvedValue(null)

		await service.upsert({
			tenantId: 'tenant-2',
			organizationId: '__global__',
			pluginName: '@xpert-ai/plugin-global-demo',
			packageName: '@xpert-ai/plugin-global-demo',
			source: 'marketplace',
			config: {}
		} as any)

		expect(repo.findOne).toHaveBeenCalledWith({
			where: [
				{
					scopeKey: 'tenant:tenant-2:global',
					pluginName: '@xpert-ai/plugin-global-demo'
				},
				{
					tenantId: 'tenant-2',
					organizationId: IsNull(),
					scopeKey: IsNull(),
					pluginName: '@xpert-ai/plugin-global-demo'
				}
			]
		})
		expect(repo.create).toHaveBeenCalledWith(
			expect.objectContaining({
				tenantId: 'tenant-2',
				organizationId: null,
				scopeKey: 'tenant:tenant-2:global',
				pluginName: '@xpert-ai/plugin-global-demo'
			})
		)
	})

	it('looks up Default Tenant global plugins through legacy null-tenant rows too', async () => {
		await service.findOneByPluginName('@xpert-ai/plugin-global-demo', '__global__', 'default-tenant')

		expect(repo.findOne).toHaveBeenCalledWith({
			where: [
				{
					scopeKey: '__global__',
					pluginName: '@xpert-ai/plugin-global-demo'
				},
				{
					tenantId: 'default-tenant',
					organizationId: IsNull(),
					scopeKey: IsNull(),
					pluginName: '@xpert-ai/plugin-global-demo'
				},
				{
					tenantId: IsNull(),
					organizationId: IsNull(),
					scopeKey: IsNull(),
					pluginName: '@xpert-ai/plugin-global-demo'
				}
			]
		})
	})

	it('lists organization plugins with only that tenant global fallback for non-default tenants', async () => {
		RequestContext.getScope.mockReturnValue({
			tenantId: 'tenant-2',
			organizationId: 'org-2'
		})

		await service.findVisibleInOrganization('org-2')

		expect(repo.find).toHaveBeenCalledWith({
			where: [
				{
					scopeKey: 'system:global'
				},
				{
					scopeKey: 'org-2'
				},
				{
					scopeKey: 'tenant:tenant-2:global'
				},
				{
					tenantId: 'tenant-2',
					organizationId: 'org-2',
					scopeKey: IsNull()
				},
				{
					tenantId: 'tenant-2',
					organizationId: IsNull(),
					scopeKey: IsNull()
				}
			]
		})
	})

	it('uninstalls non-default tenant global plugins without deleting legacy default rows', async () => {
		await service.uninstall('tenant-2', '__global__', ['@xpert-ai/plugin-global-demo'])

		expect(repo.delete).toHaveBeenCalledTimes(2)
		expect(repo.delete).toHaveBeenCalledWith({
			scopeKey: 'tenant:tenant-2:global',
			pluginName: expect.anything()
		})
		expect(repo.delete).toHaveBeenCalledWith({
			tenantId: 'tenant-2',
			organizationId: IsNull(),
			scopeKey: IsNull(),
			pluginName: expect.anything()
		})
	})

	it('writes system plugins to the singleton system scope without tenant ownership', async () => {
		repo.findOne.mockResolvedValue(null)

		await service.upsert({
			tenantId: 'tenant-2',
			organizationId: 'org-2',
			pluginName: '@xpert-ai/plugin-system-demo',
			packageName: '@xpert-ai/plugin-system-demo',
			source: 'marketplace',
			level: 'system',
			config: {}
		} as any)

		expect(repo.findOne).toHaveBeenCalledWith({
			where: expect.arrayContaining([
				{
					scopeKey: 'system:global',
					pluginName: '@xpert-ai/plugin-system-demo'
				}
			])
		})
		expect(repo.create).toHaveBeenCalledWith(
			expect.objectContaining({
				tenantId: null,
				organizationId: null,
				scopeKey: 'system:global',
				pluginName: '@xpert-ai/plugin-system-demo'
			})
		)
	})
})
