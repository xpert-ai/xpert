import { z } from 'zod'
import type { PluginInstanceService } from './plugin-instance.service'

jest.mock('@metad/contracts', () => ({
	PLUGIN_CONFIGURATION_STATUS: {
		VALID: 'valid',
		INVALID: 'invalid'
	},
	PLUGIN_LEVEL: {
		SYSTEM: 'system',
		ORGANIZATION: 'organization'
	}
}))

jest.mock('@xpert-ai/plugin-sdk', () => ({
	GLOBAL_ORGANIZATION_SCOPE: '__global__',
	RequestContext: {
		getOrganizationId: jest.fn(),
		currentTenantId: jest.fn()
	},
	STRATEGY_META_KEY: 'strategy-meta',
	StrategyBus: class StrategyBus {},
	getErrorMessage: jest.fn((error: unknown) => (error instanceof Error ? error.message : String(error)))
}))

jest.mock('i18next', () => ({
	t: jest.fn((_: string, options?: Record<string, any>) => options?.errorMessage ?? options?.pluginName ?? '')
}))

jest.mock('./plugin.helper', () => ({
	collectProvidersWithMetadata: jest.fn(() => []),
	clearPluginLoadFailure: jest.fn(),
	getEntitiesFromPlugins: jest.fn(() => []),
	getSubscribersFromPlugins: jest.fn(() => []),
	hasLifecycleMethod: jest.fn(() => false),
	registerPluginsAsync: jest.fn(async () => ({ modules: [], errors: [] })),
	upsertPluginLoadFailure: jest.fn()
}))

jest.mock('./plugin-loader', () => ({
	loadPlugin: jest.fn()
}))

jest.mock('./plugin-http-routes', () => ({
	registerPluginControllerRoutes: jest.fn(() => ({
		controllerCount: 0,
		moduleCount: 0
	})),
	snapshotHttpRouteStack: jest.fn(() => null),
	snapshotModuleIds: jest.fn(() => new Set())
}))

jest.mock('./plugin-sdk-versioning', () => ({
	assertPluginSdkInstallCandidate: jest.fn(async () => ({
		hostVersion: '3.8.4',
		peerRange: '^3.8.0'
	}))
}))

jest.mock('./organization-plugin.store', () => ({
	getOrganizationPluginPath: jest.fn((organizationId: string, pluginName: string) => {
		const sanitizedName = pluginName.replace(/[\/@]/g, '__')
		return `/tmp/plugins/${organizationId}/${sanitizedName}`
	}),
	getOrganizationPluginRoot: jest.fn(() => '/tmp/plugins'),
}))

jest.mock('./plugin-instance.service', () => ({
	PluginInstanceService: class PluginInstanceService {}
}))

jest.mock('./plugin-update.utils', () => ({
	canManageGlobalPlugins: jest.fn(() => false),
	canManageSystemPlugins: jest.fn(() => true)
}))

jest.mock('./plugin-instance.entity', () => ({
	resolvePluginLevel: jest.fn(() => 'organization')
}))

const { RequestContext } = require('@xpert-ai/plugin-sdk')
const { canManageGlobalPlugins, canManageSystemPlugins } = require('./plugin-update.utils')
const { loadPlugin } = require('./plugin-loader')
const { registerPluginControllerRoutes, snapshotHttpRouteStack, snapshotModuleIds } = require('./plugin-http-routes')
const { assertPluginSdkInstallCandidate } = require('./plugin-sdk-versioning')
const {
	collectProvidersWithMetadata,
	getEntitiesFromPlugins,
	getSubscribersFromPlugins,
	registerPluginsAsync,
	upsertPluginLoadFailure
} = require('./plugin.helper')
const { getOrganizationPluginPath, getOrganizationPluginRoot } = require('./organization-plugin.store')
const { PluginManagementService } = require('./plugin-management.service')

class ExistingEntity {}
class ExistingSubscriber {}

describe('PluginManagementService', () => {
	const pluginInstanceService = {
		findOneByPluginName: jest.fn(),
		uninstall: jest.fn(),
		uninstallByPackageName: jest.fn(),
		removePlugins: jest.fn(),
		upsert: jest.fn()
	} as unknown as PluginInstanceService

	const strategyBus = {
		upsert: jest.fn(),
		remove: jest.fn()
	}

	const lazyLoader = {
		load: jest.fn()
	}

	const moduleRef = {}
	const dataSource = {
		options: {
			entities: [ExistingEntity],
			subscribers: [ExistingSubscriber],
			synchronize: false
		},
		isInitialized: true,
		setOptions: jest.fn(function (options: Record<string, any>) {
			this.options = { ...this.options, ...options }
			return this
		}),
		synchronize: jest.fn(),
		buildMetadatas: jest.fn()
	}
	const loadedPlugins: Array<any> = []
	const applicationConfig = {
		getGlobalPrefix: jest.fn(() => 'api')
	}

	let service: InstanceType<typeof PluginManagementService>

	beforeEach(() => {
		jest.resetAllMocks()
		;(canManageGlobalPlugins as jest.Mock).mockReturnValue(false)
		;(canManageSystemPlugins as jest.Mock).mockReturnValue(true)
		dataSource.options = {
			entities: [ExistingEntity],
			subscribers: [ExistingSubscriber],
			synchronize: false
		}
		dataSource.isInitialized = true
		dataSource.setOptions.mockImplementation(function (options: Record<string, any>) {
			this.options = { ...this.options, ...options }
			return this
		})
		;(snapshotHttpRouteStack as jest.Mock).mockReturnValue(null)
		;(snapshotModuleIds as jest.Mock).mockReturnValue(new Set())
		;(getOrganizationPluginPath as jest.Mock).mockImplementation((organizationId: string, pluginName: string) => {
			const sanitizedName = pluginName.replace(/[\/@]/g, '__')
			return `/tmp/plugins/${organizationId}/${sanitizedName}`
		})
		;(getOrganizationPluginRoot as jest.Mock).mockReturnValue('/tmp/plugins')
		;(registerPluginControllerRoutes as jest.Mock).mockReturnValue({
			controllerCount: 0,
			moduleCount: 0
		})
		;(collectProvidersWithMetadata as jest.Mock).mockReturnValue([])
		;(registerPluginsAsync as jest.Mock).mockResolvedValue({ modules: [], errors: [] })
		;(assertPluginSdkInstallCandidate as jest.Mock).mockResolvedValue({
			hostVersion: '3.8.4',
			peerRange: '^3.8.0'
		})
		service = new PluginManagementService(
			loadedPlugins,
			pluginInstanceService,
			strategyBus as any,
			lazyLoader as any,
			moduleRef as any,
			dataSource as any,
			applicationConfig as any
		)
		RequestContext.getOrganizationId.mockReturnValue('org-1')
		RequestContext.currentTenantId.mockReturnValue('tenant-1')
		;(pluginInstanceService as any).findOneByPluginName.mockResolvedValue(null)
	})

	it('persists a non-blocking configuration warning when install-time config is invalid', async () => {
		;(loadPlugin as jest.Mock).mockResolvedValue({
			meta: {
				name: '@xpert-ai/plugin-config-demo',
				version: '1.0.0',
				level: 'organization'
			},
			config: {
				schema: z.object({
					apiKey: z.string().min(1)
				})
			}
		})

		await expect(
			service.installPlugin({
				pluginName: '@xpert-ai/plugin-config-demo'
			})
		).resolves.toEqual(
			expect.objectContaining({
				success: true,
				name: '@xpert-ai/plugin-config-demo'
			})
		)

		expect((pluginInstanceService as any).upsert).toHaveBeenCalledWith(
			expect.objectContaining({
				pluginName: '@xpert-ai/plugin-config-demo',
				configurationStatus: 'invalid',
				configurationError: expect.stringContaining('apiKey')
			})
		)
		expect(assertPluginSdkInstallCandidate).toHaveBeenCalledWith({
			pluginName: '@xpert-ai/plugin-config-demo',
			version: undefined,
			source: 'marketplace',
			sourceConfig: null
		})
	})

	it('registers plugin orm metadata before lazy-loading plugin modules', async () => {
		class RuntimeEntity {}
		class RuntimeSubscriber {}

		;(getEntitiesFromPlugins as jest.Mock).mockReturnValue([RuntimeEntity])
		;(getSubscribersFromPlugins as jest.Mock).mockReturnValue([RuntimeSubscriber])
		;(registerPluginsAsync as jest.Mock).mockResolvedValue({
			modules: [
				{
					module: class RuntimePluginModule {}
				}
			],
			errors: []
		})
		;(loadPlugin as jest.Mock).mockResolvedValue({
			meta: {
				name: '@xpert-ai/plugin-runtime-demo',
				version: '1.0.0',
				level: 'organization'
			}
		})
		lazyLoader.load.mockResolvedValue({})

		await expect(
			service.installPlugin({
				pluginName: '@xpert-ai/plugin-runtime-demo'
			})
		).resolves.toEqual(
			expect.objectContaining({
				success: true,
				name: '@xpert-ai/plugin-runtime-demo'
			})
		)

		expect(dataSource.setOptions).toHaveBeenCalledWith(
			expect.objectContaining({
				entities: [ExistingEntity, RuntimeEntity],
				subscribers: [ExistingSubscriber, RuntimeSubscriber]
			})
		)
		expect(snapshotModuleIds).toHaveBeenCalledWith(moduleRef)
		expect(registerPluginControllerRoutes).toHaveBeenCalledWith(
			expect.objectContaining({
				moduleRef,
				applicationConfig,
				rootModuleType: expect.any(Function)
			})
		)
		expect(collectProvidersWithMetadata).toHaveBeenCalledWith(
			{},
			'org-1',
			'@xpert-ai/plugin-runtime-demo',
			expect.anything(),
			expect.any(Set)
		)
		expect(dataSource.buildMetadatas).toHaveBeenCalledTimes(1)
		expect(dataSource.buildMetadatas.mock.invocationCallOrder[0]).toBeLessThan(
			lazyLoader.load.mock.invocationCallOrder[0]
		)
		expect(dataSource.synchronize).not.toHaveBeenCalled()
	})

	it('uses isolated runtime directories for code plugins from local workspaces', async () => {
		;(loadPlugin as jest.Mock).mockResolvedValue({
			meta: {
				name: '@xpert-ai/plugin-code-demo',
				version: '1.0.0',
				level: 'organization'
			}
		})

		await expect(
			service.installPlugin({
				pluginName: '@xpert-ai/plugin-code-demo',
				source: 'code',
				sourceConfig: {
					workspacePath: '/tmp/workspaces/plugin-code-demo'
				}
			})
		).resolves.toEqual(
			expect.objectContaining({
				success: true,
				name: '@xpert-ai/plugin-code-demo'
			})
		)

		const runtimeName = (registerPluginsAsync as jest.Mock).mock.calls[0][0].plugins[0].runtimeName

		expect(runtimeName).toMatch(/^@xpert-ai\/plugin-code-demo@runtime__/)
		expect(registerPluginsAsync).toHaveBeenCalledWith(
			expect.objectContaining({
				plugins: [
					expect.objectContaining({
						name: '@xpert-ai/plugin-code-demo',
						runtimeName,
						source: 'code',
						sourceConfig: {
							workspacePath: '/tmp/workspaces/plugin-code-demo'
						}
					})
				]
			})
		)
		expect(getOrganizationPluginPath).toHaveBeenCalledWith('org-1', runtimeName)
		expect(loadPlugin).toHaveBeenCalledWith('@xpert-ai/plugin-code-demo', {
			basedir: `/tmp/plugins/org-1/${runtimeName.replace(/[\/@]/g, '__')}`,
			source: 'code',
			workspacePath: '/tmp/workspaces/plugin-code-demo'
		})
		expect(assertPluginSdkInstallCandidate).toHaveBeenCalledWith({
			pluginName: '@xpert-ai/plugin-code-demo',
			version: undefined,
			source: 'code',
			sourceConfig: {
				workspacePath: '/tmp/workspaces/plugin-code-demo'
			}
		})
		expect((pluginInstanceService as any).upsert).toHaveBeenCalledWith(
			expect.objectContaining({
				source: 'code',
				sourceConfig: {
					workspacePath: '/tmp/workspaces/plugin-code-demo'
				}
			})
		)
	})

	it('refreshes code plugins from their persisted workspace path', async () => {
		loadedPlugins.push({
			organizationId: 'org-1',
			name: '@xpert-ai/plugin-code-demo',
			packageName: '@xpert-ai/plugin-code-demo',
			source: 'code',
			ctx: {
				config: {
					apiKey: 'demo'
				}
			},
			instance: {
				meta: {
					name: '@xpert-ai/plugin-code-demo',
					version: '1.0.0',
					level: 'organization'
				}
			}
		})
		;(pluginInstanceService as any).findOneByPluginName.mockResolvedValue({
			pluginName: '@xpert-ai/plugin-code-demo',
			packageName: '@xpert-ai/plugin-code-demo',
			source: 'code',
			sourceConfig: {
				workspacePath: '/tmp/workspaces/plugin-code-demo'
			},
			config: {
				apiKey: 'persisted'
			}
		})
		const installSpy = jest.spyOn(service, 'installPlugin').mockResolvedValue({
			success: true,
			name: '@xpert-ai/plugin-code-demo',
			packageName: '@xpert-ai/plugin-code-demo',
			organizationId: 'org-1',
			currentVersion: '1.0.1'
		})

		await expect(service.refreshCodePlugin('@xpert-ai/plugin-code-demo')).resolves.toEqual(
			expect.objectContaining({
				success: true,
				name: '@xpert-ai/plugin-code-demo'
			})
		)

		expect(installSpy).toHaveBeenCalledWith({
			pluginName: '@xpert-ai/plugin-code-demo',
			source: 'code',
			sourceConfig: {
				workspacePath: '/tmp/workspaces/plugin-code-demo'
			},
			config: {
				apiKey: 'demo'
			}
		})
	})

	it('rejects refreshing code plugins without a stored workspace path', async () => {
		;(pluginInstanceService as any).findOneByPluginName.mockResolvedValue({
			pluginName: '@xpert-ai/plugin-code-demo',
			packageName: '@xpert-ai/plugin-code-demo',
			source: 'code'
		})

		await expect(service.refreshCodePlugin('@xpert-ai/plugin-code-demo')).rejects.toThrow(
			'does not have a stored sourceConfig.workspacePath'
		)
	})

	it('persists a placeholder plugin record when installation fails', async () => {
		;(registerPluginsAsync as jest.Mock).mockResolvedValue({
			modules: [],
			errors: [
				{
					error: 'Cannot find module ./dist/index.js'
				}
			]
		})

		await expect(
			service.installPlugin({
				pluginName: '@xpert-ai/plugin-broken-demo',
				source: 'npm'
			})
		).rejects.toBeInstanceOf(Error)

		expect((pluginInstanceService as any).upsert).toHaveBeenCalledWith(
			expect.objectContaining({
				pluginName: '@xpert-ai/plugin-broken-demo',
				packageName: '@xpert-ai/plugin-broken-demo',
				source: 'npm'
			})
		)
		expect(upsertPluginLoadFailure).toHaveBeenCalledWith(
			expect.objectContaining({
				pluginName: '@xpert-ai/plugin-broken-demo'
			})
		)
	})

	it('rejects sdk-incompatible plugins before uninstalling the current installation', async () => {
		;(assertPluginSdkInstallCandidate as jest.Mock).mockRejectedValue(
			new Error('plugin-sdk peerDependencies range "^4.0.0" is incompatible with host SDK version 3.8.4')
		)

		await expect(
			service.installPlugin({
				pluginName: '@xpert-ai/plugin-future-demo',
				version: '1.2.3',
				source: 'npm'
			})
		).rejects.toBeInstanceOf(Error)

		expect(assertPluginSdkInstallCandidate).toHaveBeenCalledWith({
			pluginName: '@xpert-ai/plugin-future-demo',
			version: '1.2.3',
			source: 'npm',
			sourceConfig: null
		})
		expect((pluginInstanceService as any).uninstallByPackageName).not.toHaveBeenCalled()
		expect(registerPluginsAsync).not.toHaveBeenCalled()
	})

	it('allows super admins to uninstall global plugins from an organization context', async () => {
		;(canManageGlobalPlugins as jest.Mock).mockReturnValue(true)

		await expect(
			service.uninstallByNamesWithGuard(['@xpert-ai/plugin-global-demo'], '__global__')
		).resolves.toBeUndefined()

		expect((pluginInstanceService as any).uninstall).toHaveBeenCalledWith(
			'tenant-1',
			'__global__',
			['@xpert-ai/plugin-global-demo']
		)
	})

	it('rejects global plugin uninstalls for non-super-admin users', async () => {
		;(canManageGlobalPlugins as jest.Mock).mockReturnValue(false)

		await expect(
			service.uninstallByNamesWithGuard(['@xpert-ai/plugin-global-demo'], '__global__')
		).rejects.toThrow('Only super admins can uninstall global plugins')

		expect((pluginInstanceService as any).uninstall).not.toHaveBeenCalled()
	})
})
