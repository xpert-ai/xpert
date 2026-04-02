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
	hasLifecycleMethod: jest.fn(() => false),
	registerPluginsAsync: jest.fn(async () => ({ modules: [], errors: [] })),
	upsertPluginLoadFailure: jest.fn()
}))

jest.mock('./plugin-loader', () => ({
	loadPlugin: jest.fn()
}))

jest.mock('./plugin-sdk-versioning', () => ({
	assertPluginSdkInstallCandidate: jest.fn(async () => ({
		hostVersion: '3.8.4',
		peerRange: '^3.8.0'
	}))
}))

jest.mock('./organization-plugin.store', () => ({
	getOrganizationPluginPath: jest.fn(() => '/tmp/plugins/demo'),
	getOrganizationPluginRoot: jest.fn(() => '/tmp/plugins'),
	stageWorkspacePlugin: jest.fn()
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
const { assertPluginSdkInstallCandidate } = require('./plugin-sdk-versioning')
const { registerPluginsAsync } = require('./plugin.helper')
const { upsertPluginLoadFailure } = require('./plugin.helper')
const { PluginManagementService } = require('./plugin-management.service')

describe('PluginManagementService', () => {
	const pluginInstanceService = {
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
	const loadedPlugins: Array<any> = []

	let service: InstanceType<typeof PluginManagementService>

	beforeEach(() => {
		jest.resetAllMocks()
		;(canManageGlobalPlugins as jest.Mock).mockReturnValue(false)
		;(canManageSystemPlugins as jest.Mock).mockReturnValue(true)
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
			moduleRef as any
		)
		RequestContext.getOrganizationId.mockReturnValue('org-1')
		RequestContext.currentTenantId.mockReturnValue('tenant-1')
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
			workspacePath: undefined
		})
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
			workspacePath: undefined
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
