jest.mock('@xpert-ai/plugin-sdk', () => ({
	GLOBAL_ORGANIZATION_SCOPE: '__global__',
	RequestContext: {
		currentTenantId: jest.fn(),
		getOrganizationId: jest.fn()
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
	getOrganizationPluginPath: jest.fn((organizationId: string, pluginName: string) => `/tmp/${organizationId}/${pluginName}`),
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
const { clearPluginLoadFailure } = require('./plugin.helper')
const {
	getOrganizationManifestPath,
	getOrganizationPluginPath,
	getOrganizationPluginRoot
} = require('./organization-plugin.store')
const { PluginInstanceService } = require('./plugin-instance.service')

describe('PluginInstanceService', () => {
	const repo = {
		delete: jest.fn(),
		find: jest.fn(),
		findOne: jest.fn(),
		save: jest.fn(),
		create: jest.fn()
	}

	const strategyBus = {
		remove: jest.fn()
	}

	const loadedPlugins: Array<any> = []

	let service: InstanceType<typeof PluginInstanceService>

	beforeEach(() => {
		jest.resetAllMocks()
		getOrganizationManifestPath.mockImplementation((organizationId: string) => `/tmp/${organizationId}/manifest.json`)
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

		expect(repo.delete).toHaveBeenCalledTimes(1)
		const criteria = repo.delete.mock.calls[0][0]
		expect(criteria.tenantId).toBe('tenant-1')
		expect(criteria.organizationId).toEqual(IsNull())
		expect(removePluginsSpy).toHaveBeenCalledWith('__global__', ['@xpert-ai/plugin-broken-demo'])
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
})
