import { BadRequestException } from '@nestjs/common'
import { GUARDS_METADATA } from '@nestjs/common/constants'

jest.mock('@metad/contracts', () => ({
	PermissionsEnum: {
		ALL_ORG_EDIT: 'ALL_ORG_EDIT'
	}
}))

jest.mock('@xpert-ai/plugin-sdk', () => {
	class RequestContextMock {
		static getOrganizationId = jest.fn()
		static currentTenantId = jest.fn()
	}
	return {
		RequestContext: RequestContextMock,
		GLOBAL_ORGANIZATION_SCOPE: 'global',
		STRATEGY_META_KEY: 'XPERT_STRATEGY_META_KEY',
		StrategyBus: class StrategyBus {},
		CORE_PLUGIN_API_TOKENS: {
			config: Symbol('core:config'),
			cache: Symbol('core:cache'),
			integration: Symbol('core:integration'),
			user: Symbol('core:user'),
			role: Symbol('core:role'),
			i18n: Symbol('core:i18n'),
			chat: Symbol('core:chat')
		},
		createPluginLogger: () => ({
			child: jest.fn(),
			debug: jest.fn(),
			log: jest.fn(),
			warn: jest.fn(),
			error: jest.fn()
		})
	}
})

jest.mock('../shared/guards', () => ({
	PermissionGuard: class PermissionGuard {}
}))

jest.mock('../shared/decorators', () => ({
	Permissions:
		(...permissions: string[]) =>
		(_target: any, _propertyKey: string, descriptor: PropertyDescriptor) => {
			Reflect.defineMetadata('permissions', permissions, descriptor.value)
		}
}))

jest.mock('./lifecycle', () => ({
	attachPluginContext: jest.fn(),
	resolvePluginAccessPolicy: jest.fn(() => ({
		allowed: [],
		allowResolve: false,
		allowAppContext: false
	}))
}))

jest.mock('./organization-plugin.store', () => ({
	getOrganizationPluginPath: jest.fn(() => '/tmp/plugin/test-plugin'),
	getOrganizationPluginRoot: jest.fn(() => '/tmp/plugin')
}))

jest.mock('./plugin-instance.service', () => ({
	PluginInstanceService: class PluginInstanceService {}
}))

jest.mock('./plugin.helper', () => ({
	collectProvidersWithMetadata: jest.fn(),
	hasLifecycleMethod: jest.fn(),
	registerPluginsAsync: jest.fn()
}))

jest.mock('./plugin-loader', () => ({
	loadPlugin: jest.fn()
}))

jest.mock('./config', () => ({
	buildConfig: jest.fn()
}))

import { RequestContext } from '@xpert-ai/plugin-sdk'
import { PermissionGuard } from '../shared/guards'
import { buildConfig } from './config'
import { PluginController } from './plugin.controller'
import { collectProvidersWithMetadata, hasLifecycleMethod, registerPluginsAsync } from './plugin.helper'
import { loadPlugin } from './plugin-loader'

const PERMISSIONS_METADATA = 'permissions'
const ALL_ORG_EDIT = 'ALL_ORG_EDIT'

describe('PluginController security', () => {
	const registerPluginsAsyncMock = registerPluginsAsync as jest.MockedFunction<typeof registerPluginsAsync>
	const collectProvidersWithMetadataMock = collectProvidersWithMetadata as jest.MockedFunction<typeof collectProvidersWithMetadata>
	const hasLifecycleMethodMock = hasLifecycleMethod as jest.MockedFunction<typeof hasLifecycleMethod>
	const loadPluginMock = loadPlugin as jest.MockedFunction<typeof loadPlugin>
	const buildConfigMock = buildConfig as jest.MockedFunction<typeof buildConfig>

	const createController = () => {
		const pluginInstanceService = {
			uninstallByPackageName: jest.fn().mockResolvedValue(undefined),
			upsert: jest.fn().mockResolvedValue(undefined),
			removePlugins: jest.fn().mockResolvedValue(undefined),
			uninstall: jest.fn().mockResolvedValue(undefined)
		}
		const strategyBus = {
			upsert: jest.fn()
		}
		const lazyLoader = {
			load: jest.fn().mockResolvedValue({})
		}
		const controller = new PluginController(
			[],
			pluginInstanceService as any,
			strategyBus as any,
			lazyLoader as any,
			{} as any
		)
		return { controller, pluginInstanceService, strategyBus, lazyLoader }
	}

	beforeEach(() => {
		jest.clearAllMocks()
		jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
		jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')

		registerPluginsAsyncMock.mockResolvedValue({ organizationId: 'org-1', modules: [{} as any] })
		collectProvidersWithMetadataMock.mockReturnValue([])
		hasLifecycleMethodMock.mockReturnValue(false as any)
		loadPluginMock.mockResolvedValue({
			meta: {
				name: 'test-plugin'
			}
		} as any)
		buildConfigMock.mockReturnValue({} as any)
	})

	afterEach(() => {
		jest.restoreAllMocks()
	})

	it('should require ALL_ORG_EDIT permission on install and uninstall routes', () => {
		const installPermissions = Reflect.getMetadata(PERMISSIONS_METADATA, PluginController.prototype.installPlugin)
		const uninstallPermissions = Reflect.getMetadata(PERMISSIONS_METADATA, PluginController.prototype.uninstall)
		expect(installPermissions).toContain(ALL_ORG_EDIT)
		expect(uninstallPermissions).toContain(ALL_ORG_EDIT)

		const installGuards = Reflect.getMetadata(GUARDS_METADATA, PluginController.prototype.installPlugin) ?? []
		const uninstallGuards = Reflect.getMetadata(GUARDS_METADATA, PluginController.prototype.uninstall) ?? []
		expect(installGuards).toContain(PermissionGuard)
		expect(uninstallGuards).toContain(PermissionGuard)
	})

	it('should reject source code install from API payload', async () => {
		const { controller } = createController()
		await expect(controller.installPlugin({ pluginName: 'test-plugin', source: 'code' })).rejects.toBeInstanceOf(
			BadRequestException
		)
		expect(registerPluginsAsyncMock).not.toHaveBeenCalled()
	})

	it('should normalize unknown install source to marketplace', async () => {
		const { controller, pluginInstanceService } = createController()

		const result = await controller.installPlugin({
			pluginName: 'test-plugin',
			source: 'unknown-source'
		})

		expect(result).toMatchObject({ success: true, packageName: 'test-plugin' })
		expect(registerPluginsAsyncMock).toHaveBeenCalledWith(
			expect.objectContaining({
				plugins: [{ name: 'test-plugin', source: 'marketplace' }]
			})
		)
		expect(pluginInstanceService.upsert).toHaveBeenCalledWith(
			expect.objectContaining({
				source: 'marketplace'
			})
		)
	})

	it('should keep valid non-code install source', async () => {
		const { controller, pluginInstanceService } = createController()

		await controller.installPlugin({
			pluginName: 'test-plugin',
			source: 'git'
		})

		expect(registerPluginsAsyncMock).toHaveBeenCalledWith(
			expect.objectContaining({
				plugins: [{ name: 'test-plugin', source: 'git' }]
			})
		)
		expect(pluginInstanceService.upsert).toHaveBeenCalledWith(
			expect.objectContaining({
				source: 'git'
			})
		)
	})
})
