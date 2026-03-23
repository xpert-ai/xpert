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
	hasLifecycleMethod: jest.fn(() => false),
	registerPluginsAsync: jest.fn(async () => ({ modules: [] }))
}))

jest.mock('./plugin-loader', () => ({
	loadPlugin: jest.fn()
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
	canManageSystemPlugins: jest.fn(() => true)
}))

jest.mock('./plugin-instance.entity', () => ({
	resolvePluginLevel: jest.fn(() => 'organization')
}))

const { RequestContext } = require('@xpert-ai/plugin-sdk')
const { loadPlugin } = require('./plugin-loader')
const { registerPluginsAsync } = require('./plugin.helper')
const { PluginManagementService } = require('./plugin-management.service')

describe('PluginManagementService', () => {
	const pluginInstanceService = {
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
		;(registerPluginsAsync as jest.Mock).mockResolvedValue({ modules: [] })
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
	})
})
