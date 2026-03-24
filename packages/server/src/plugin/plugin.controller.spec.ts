import { BadRequestException } from '@nestjs/common'
import { PLUGIN_LEVEL } from '@metad/contracts'
import { GLOBAL_ORGANIZATION_SCOPE, RequestContext, StrategyBus } from '@xpert-ai/plugin-sdk'
import { PluginController } from './plugin.controller'
import { PluginInstanceService } from './plugin-instance.service'
import { collectProvidersWithMetadata, hasLifecycleMethod, registerPluginsAsync } from './plugin.helper'
import { loadPlugin } from './plugin-loader'

jest.mock('./plugin.helper', () => ({
	registerPluginsAsync: jest.fn(),
	collectProvidersWithMetadata: jest.fn(),
	hasLifecycleMethod: jest.fn()
}))

jest.mock('./plugin-loader', () => ({
	loadPlugin: jest.fn()
}))

describe('PluginController install plugin level checks', () => {
	const mockedRegisterPluginsAsync = registerPluginsAsync as jest.MockedFunction<typeof registerPluginsAsync>
	const mockedCollectProvidersWithMetadata = collectProvidersWithMetadata as jest.MockedFunction<
		typeof collectProvidersWithMetadata
	>
	const mockedHasLifecycleMethod = hasLifecycleMethod as jest.MockedFunction<typeof hasLifecycleMethod>
	const mockedLoadPlugin = loadPlugin as jest.MockedFunction<typeof loadPlugin>

	const pluginInstanceService = {
		uninstallByPackageName: jest.fn(),
		upsert: jest.fn(),
		removePlugins: jest.fn(),
		uninstall: jest.fn()
	} as unknown as PluginInstanceService

	const strategyBus = {
		upsert: jest.fn()
	} as unknown as StrategyBus

	const lazyLoader = {
		load: jest.fn()
	}

	const moduleRef = {}

	const loadedPlugins: Array<any> = []

	let controller: PluginController

	beforeEach(() => {
		jest.resetAllMocks()
		controller = new PluginController(
			loadedPlugins,
			pluginInstanceService,
			strategyBus,
			lazyLoader as any,
			moduleRef as any
		)

		jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
		jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
		jest.spyOn(RequestContext, 'hasRole').mockReturnValue(false)

		mockedRegisterPluginsAsync.mockResolvedValue({ organizationId: 'org-1', modules: [] })
		mockedCollectProvidersWithMetadata.mockReturnValue([])
		mockedHasLifecycleMethod.mockReturnValue(false)
	})

	afterEach(() => {
		jest.restoreAllMocks()
	})

	it('rejects install when plugin metadata level is system', async () => {
		mockedLoadPlugin.mockResolvedValue({
			meta: {
				name: '@xpert-ai/plugin-system-demo',
				level: PLUGIN_LEVEL.SYSTEM
			},
			register: jest.fn()
		} as any)

		await expect(controller.installPlugin({ pluginName: '@xpert-ai/plugin-system-demo' })).rejects.toBeInstanceOf(
			BadRequestException
		)

		expect((pluginInstanceService as any).upsert).not.toHaveBeenCalled()
	})

	it('allows install when plugin metadata level is organization', async () => {
		mockedLoadPlugin.mockResolvedValue({
			meta: {
				name: '@xpert-ai/plugin-org-demo',
				level: PLUGIN_LEVEL.ORGANIZATION
			},
			register: jest.fn()
		} as any)

		const result = await controller.installPlugin({ pluginName: '@xpert-ai/plugin-org-demo' })

		expect(result).toEqual({
			success: true,
			name: '@xpert-ai/plugin-org-demo',
			packageName: '@xpert-ai/plugin-org-demo',
			organizationId: 'org-1'
		})
		expect((pluginInstanceService as any).upsert).toHaveBeenCalledWith(
			expect.objectContaining({
				pluginName: '@xpert-ai/plugin-org-demo',
				packageName: '@xpert-ai/plugin-org-demo',
				level: PLUGIN_LEVEL.ORGANIZATION
			})
		)
	})
})
