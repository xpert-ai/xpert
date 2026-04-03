import { BadRequestException } from '@nestjs/common'
import { UpdatePluginCommand } from './commands'
import { ResolveLatestPluginVersionQuery } from './queries'
import type { PluginInstanceService } from './plugin-instance.service'
import type { PluginManagementService } from './plugin-management.service'

jest.mock('@metad/contracts', () => ({
	PLUGIN_CONFIGURATION_STATUS: {
		VALID: 'valid',
		INVALID: 'invalid'
	},
	PLUGIN_LOAD_STATUS: {
		LOADED: 'loaded',
		FAILED: 'failed'
	},
	PLUGIN_LEVEL: {
		SYSTEM: 'system',
		ORGANIZATION: 'organization'
	},
	RolesEnum: {
		SUPER_ADMIN: 'SUPER_ADMIN'
	}
}))

jest.mock('@xpert-ai/plugin-sdk', () => ({
	GLOBAL_ORGANIZATION_SCOPE: '__global__',
	RequestContext: {
		getOrganizationId: jest.fn(),
		currentTenantId: jest.fn(),
		hasRole: jest.fn()
	}
}))

jest.mock('./config', () => ({
	buildConfig: jest.fn((_: string, config: Record<string, any>) => config ?? {}),
	inspectConfig: jest.fn((_: string, config: Record<string, any>) => ({
		config: config ?? {}
	}))
}))

jest.mock('./plugin-config-schema', () => ({
	resolvePluginConfigSchema: jest.fn(() => undefined)
}))

jest.mock('./plugin.helper', () => ({
	findPluginLoadFailure: jest.fn()
}))

jest.mock('./plugin-instance.entity', () => ({
	resolvePluginLevel: jest.fn(() => 'organization')
}))

jest.mock('./plugin-instance.service', () => ({
	PluginInstanceService: class PluginInstanceService {}
}))

jest.mock('./plugin-management.service', () => ({
	PluginManagementService: class PluginManagementService {}
}))

const { PLUGIN_LEVEL } = require('@metad/contracts')
const { GLOBAL_ORGANIZATION_SCOPE, RequestContext } = require('@xpert-ai/plugin-sdk')
const { buildConfig, inspectConfig } = require('./config')
const { findPluginLoadFailure } = require('./plugin.helper')
const { PluginController } = require('./plugin.controller')

describe('PluginController', () => {
	const pluginInstanceService = {
		findOneByPluginName: jest.fn(),
		findVisibleInOrganization: jest.fn(),
		getConfig: jest.fn(),
		upsert: jest.fn()
	} as unknown as PluginInstanceService

	const pluginManagementService = {
		findLoadedPlugin: jest.fn(),
		installPlugin: jest.fn(),
		uninstallByNamesWithGuard: jest.fn()
	} as unknown as PluginManagementService

	const queryBus = {
		execute: jest.fn()
	}

	const commandBus = {
		execute: jest.fn()
	}

	const loadedPlugins: Array<any> = []

	let controller: any

	beforeEach(() => {
		jest.resetAllMocks()
		loadedPlugins.length = 0
		;(buildConfig as jest.Mock).mockImplementation((_: string, config: Record<string, any>) => config ?? {})
		;(inspectConfig as jest.Mock).mockImplementation((_: string, config: Record<string, any>) => ({
			config: config ?? {}
		}))
		;(findPluginLoadFailure as jest.Mock).mockReturnValue(undefined)
		;(pluginInstanceService as any).findVisibleInOrganization.mockResolvedValue([])
		controller = new PluginController(
			loadedPlugins,
			pluginInstanceService,
			pluginManagementService,
			queryBus as any,
			commandBus as any
		)

		RequestContext.getOrganizationId.mockReturnValue('org-1')
		RequestContext.currentTenantId.mockReturnValue('tenant-1')
		RequestContext.hasRole.mockReturnValue(false)
	})

	it('delegates installation to plugin management service', async () => {
		;(pluginManagementService as any).installPlugin.mockResolvedValue({
			success: true,
			name: '@xpert-ai/plugin-org-demo',
			packageName: '@xpert-ai/plugin-org-demo',
			organizationId: 'org-1'
		})

		await expect(controller.installPlugin({ pluginName: '@xpert-ai/plugin-org-demo' })).resolves.toEqual(
			expect.objectContaining({
				success: true,
				name: '@xpert-ai/plugin-org-demo'
			})
		)
		expect((pluginManagementService as any).installPlugin).toHaveBeenCalledWith({
			pluginName: '@xpert-ai/plugin-org-demo'
		})
	})

	it('returns merged configuration without validating when opening the configuration dialog', async () => {
		const plugin = {
			organizationId: 'org-1',
			name: '@xpert-ai/plugin-config-demo',
			packageName: '@xpert-ai/plugin-config-demo',
			instance: {
				meta: {
					name: '@xpert-ai/plugin-config-demo',
					version: '0.0.1'
				},
				config: {
					defaults: {
						enabled: true
					}
				}
			},
			ctx: {}
		}
		;(pluginManagementService as any).findLoadedPlugin.mockReturnValue(plugin)
		;(pluginInstanceService as any).findOneByPluginName.mockResolvedValue({
			pluginName: plugin.name
		})
		;(pluginInstanceService as any).getConfig.mockReturnValue({
			enabled: 'definitely-not-a-boolean'
		})
		;(inspectConfig as jest.Mock).mockReturnValue({
			config: {
				enabled: 'definitely-not-a-boolean'
			},
			error: 'enabled must be a boolean'
		})

		await expect(controller.getConfiguration({ pluginName: plugin.name })).resolves.toEqual({
			pluginName: plugin.name,
			config: {
				enabled: 'definitely-not-a-boolean'
			},
			configSchema: undefined,
			configurationStatus: 'invalid',
			configurationError: 'enabled must be a boolean'
		})

		expect(inspectConfig).toHaveBeenCalledWith(
			plugin.name,
			{
				enabled: 'definitely-not-a-boolean'
			},
			plugin.instance.config
		)
		expect(buildConfig).not.toHaveBeenCalled()
	})

	it('still validates configuration when saving', async () => {
		const plugin = {
			organizationId: 'org-1',
			name: '@xpert-ai/plugin-config-demo',
			packageName: '@xpert-ai/plugin-config-demo',
			source: 'env',
			level: PLUGIN_LEVEL.ORGANIZATION,
			instance: {
				meta: {
					name: '@xpert-ai/plugin-config-demo',
					version: '0.0.1'
				},
				config: {
					defaults: {
						enabled: true
					}
				}
			},
			ctx: {}
		}
		;(pluginManagementService as any).findLoadedPlugin.mockReturnValue(plugin)
		;(pluginInstanceService as any).findOneByPluginName.mockResolvedValue(null)
		;(buildConfig as jest.Mock).mockReturnValue({
			enabled: false
		})

		await expect(
			controller.saveConfiguration({
				pluginName: plugin.name,
				config: {
					enabled: false
				}
			})
		).resolves.toEqual({
			pluginName: plugin.name,
			config: {
				enabled: false
			},
			configSchema: undefined,
			configurationStatus: 'valid',
			configurationError: null
		})

		expect(buildConfig).toHaveBeenCalledWith(
			plugin.name,
			{
				enabled: false
			},
			plugin.instance.config
		)
		expect(inspectConfig).not.toHaveBeenCalled()
		expect((pluginInstanceService as any).upsert).toHaveBeenCalledWith(
			expect.objectContaining({
				pluginName: plugin.name,
				config: {
					enabled: false
				},
				configurationStatus: 'valid',
				configurationError: null
			})
		)
	})

	it('includes configuration warning state in plugin descriptors', async () => {
		loadedPlugins.push({
			organizationId: 'org-1',
			name: '@xpert-ai/plugin-config-demo',
			packageName: '@xpert-ai/plugin-config-demo',
			source: 'env',
			level: PLUGIN_LEVEL.ORGANIZATION,
			instance: {
				meta: {
					name: '@xpert-ai/plugin-config-demo',
					version: '0.0.1',
					level: PLUGIN_LEVEL.ORGANIZATION
				},
				config: {
					defaults: {}
				}
			},
			ctx: {}
		})
		;(pluginInstanceService as any).findOneByPluginName.mockResolvedValue({
			configurationStatus: 'invalid',
			configurationError: 'apiKey is required'
		})
		;(inspectConfig as jest.Mock).mockReturnValue({
			config: {},
			error: 'apiKey is required'
		})

		await expect(controller.getPlugins()).resolves.toEqual([
			expect.objectContaining({
				name: '@xpert-ai/plugin-config-demo',
				configurationStatus: 'invalid',
				configurationError: 'apiKey is required',
				loadStatus: 'loaded',
				loadError: null
			})
		])
	})

	it('delegates updates to command bus', async () => {
		;(commandBus as any).execute.mockResolvedValue({
			success: true,
			name: '@xpert-ai/plugin-env-demo',
			updated: true,
			currentVersion: '0.0.2'
		})

		await expect(controller.updatePlugin({ pluginName: '@xpert-ai/plugin-env-demo' })).resolves.toEqual(
			expect.objectContaining({
				updated: true,
				currentVersion: '0.0.2'
			})
		)
		expect((commandBus as any).execute).toHaveBeenCalledWith(new UpdatePluginCommand('@xpert-ai/plugin-env-demo'))
	})

	it('throws when update request does not include plugin name', async () => {
		await expect(controller.updatePlugin({ pluginName: '' })).rejects.toBeInstanceOf(BadRequestException)
		expect((commandBus as any).execute).not.toHaveBeenCalled()
	})

	it('passes plugin scope through uninstall requests', async () => {
		await expect(
			controller.uninstall({
				names: ['@xpert-ai/plugin-global-demo'],
				organizationId: GLOBAL_ORGANIZATION_SCOPE
			})
		).resolves.toEqual({ success: true })

		expect((pluginManagementService as any).uninstallByNamesWithGuard).toHaveBeenCalledWith(
			['@xpert-ai/plugin-global-demo'],
			GLOBAL_ORGANIZATION_SCOPE
		)
	})

	it('includes update status only when the user can update and a newer version exists', async () => {
		loadedPlugins.push({
			organizationId: 'org-1',
			name: '@xpert-ai/plugin-env-demo',
			packageName: '@xpert-ai/plugin-env-demo',
			source: 'env',
			level: PLUGIN_LEVEL.ORGANIZATION,
			instance: {
				meta: {
					name: '@xpert-ai/plugin-env-demo',
					version: '0.0.1',
					level: PLUGIN_LEVEL.ORGANIZATION
				}
			},
			ctx: {}
		})
		;(queryBus as any).execute.mockResolvedValue('0.0.2')

		await expect(controller.getPlugins()).resolves.toEqual([
			expect.objectContaining({
				name: '@xpert-ai/plugin-env-demo',
				canUninstall: true,
				canUpdate: true,
				hasUpdate: true,
				currentVersion: '0.0.1',
				latestVersion: '0.0.2'
			})
		])
		expect((queryBus as any).execute).toHaveBeenCalledWith(
			new ResolveLatestPluginVersionQuery('@xpert-ai/plugin-env-demo')
		)
	})

	it('does not surface update availability for code plugins', async () => {
		loadedPlugins.push({
			organizationId: 'org-1',
			name: '@xpert-ai/plugin-code-demo',
			packageName: '@xpert-ai/plugin-code-demo',
			source: 'code',
			level: PLUGIN_LEVEL.ORGANIZATION,
			instance: {
				meta: {
					name: '@xpert-ai/plugin-code-demo',
					version: '0.0.1',
					level: PLUGIN_LEVEL.ORGANIZATION
				}
			},
			ctx: {}
		})

		await expect(controller.getPlugins()).resolves.toEqual([
			expect.objectContaining({
				name: '@xpert-ai/plugin-code-demo',
				canUpdate: false,
				hasUpdate: false,
				latestVersion: undefined
			})
		])
		expect((queryBus as any).execute).not.toHaveBeenCalled()
	})

	it('does not allow organization-scoped users to update global plugins', async () => {
		loadedPlugins.push({
			organizationId: GLOBAL_ORGANIZATION_SCOPE,
			name: '@xpert-ai/plugin-global-demo',
			packageName: '@xpert-ai/plugin-global-demo',
			source: 'env',
			level: PLUGIN_LEVEL.ORGANIZATION,
			instance: {
				meta: {
					name: '@xpert-ai/plugin-global-demo',
					version: '0.0.1',
					level: PLUGIN_LEVEL.ORGANIZATION
				}
			},
			ctx: {}
		})

		await expect(controller.getPlugins()).resolves.toEqual([
			expect.objectContaining({
				name: '@xpert-ai/plugin-global-demo',
				isGlobal: true,
				canUninstall: false,
				canUpdate: false,
				hasUpdate: false,
				latestVersion: undefined
			})
		])
		expect((queryBus as any).execute).not.toHaveBeenCalled()
	})

	it('allows tenant-level super admins to update global plugins', async () => {
		RequestContext.getOrganizationId.mockReturnValue(GLOBAL_ORGANIZATION_SCOPE)
		RequestContext.hasRole.mockImplementation((role: string) => role === 'SUPER_ADMIN')
		loadedPlugins.push({
			organizationId: GLOBAL_ORGANIZATION_SCOPE,
			name: '@xpert-ai/plugin-global-demo',
			packageName: '@xpert-ai/plugin-global-demo',
			source: 'env',
			level: PLUGIN_LEVEL.ORGANIZATION,
			instance: {
				meta: {
					name: '@xpert-ai/plugin-global-demo',
					version: '0.0.1',
					level: PLUGIN_LEVEL.ORGANIZATION
				}
			},
			ctx: {}
		})
		;(queryBus as any).execute.mockResolvedValue('0.0.2')

		await expect(controller.getPlugins()).resolves.toEqual([
			expect.objectContaining({
				name: '@xpert-ai/plugin-global-demo',
				isGlobal: true,
				canUninstall: true,
				canUpdate: true,
				hasUpdate: true,
				latestVersion: '0.0.2'
			})
		])
		expect((queryBus as any).execute).toHaveBeenCalledWith(
			new ResolveLatestPluginVersionQuery('@xpert-ai/plugin-global-demo')
		)
	})

	it('returns both organization and global plugin records while marking the organization record as effective', async () => {
		loadedPlugins.push(
			{
				organizationId: GLOBAL_ORGANIZATION_SCOPE,
				name: '@xpert-ai/plugin-scope-demo',
				packageName: '@xpert-ai/plugin-scope-demo',
				source: 'code',
				level: PLUGIN_LEVEL.ORGANIZATION,
				instance: {
					meta: {
						name: '@xpert-ai/plugin-scope-demo',
						version: '0.0.1',
						level: PLUGIN_LEVEL.ORGANIZATION
					}
				},
				ctx: {}
			},
			{
				organizationId: 'org-1',
				name: '@xpert-ai/plugin-scope-demo',
				packageName: '@xpert-ai/plugin-scope-demo',
				source: 'code',
				level: PLUGIN_LEVEL.ORGANIZATION,
				instance: {
					meta: {
						name: '@xpert-ai/plugin-scope-demo',
						version: '0.0.2',
						level: PLUGIN_LEVEL.ORGANIZATION
					}
				},
				ctx: {}
			}
		)

		const plugins = await controller.getPlugins()
		const organizationPlugin = plugins.find((plugin) => plugin.organizationId === 'org-1')
		const globalPlugin = plugins.find((plugin) => plugin.organizationId === GLOBAL_ORGANIZATION_SCOPE)

		expect(plugins).toHaveLength(2)
		expect(organizationPlugin).toEqual(
			expect.objectContaining({
				name: '@xpert-ai/plugin-scope-demo',
				effectiveInCurrentScope: true,
				scopeRelation: 'overrides-global',
				isGlobal: false
			})
		)
		expect(globalPlugin).toEqual(
			expect.objectContaining({
				name: '@xpert-ai/plugin-scope-demo',
				effectiveInCurrentScope: false,
				scopeRelation: 'shadowed-by-organization',
				isGlobal: true
			})
		)
	})

	it('keeps the global plugin effective when the organization-scoped installation failed to load', async () => {
		loadedPlugins.push({
			organizationId: GLOBAL_ORGANIZATION_SCOPE,
			name: '@xpert-ai/plugin-scope-demo',
			packageName: '@xpert-ai/plugin-scope-demo',
			source: 'code',
			level: PLUGIN_LEVEL.ORGANIZATION,
			instance: {
				meta: {
					name: '@xpert-ai/plugin-scope-demo',
					version: '0.0.1',
					level: PLUGIN_LEVEL.ORGANIZATION
				}
			},
			ctx: {}
		})
		;(pluginInstanceService as any).findVisibleInOrganization.mockResolvedValue([
			{
				pluginName: '@xpert-ai/plugin-scope-demo',
				packageName: '@xpert-ai/plugin-scope-demo',
				version: '0.0.2',
				source: 'npm',
				level: PLUGIN_LEVEL.ORGANIZATION,
				organizationId: 'org-1',
				configurationStatus: null,
				configurationError: null
			}
		])
		;(findPluginLoadFailure as jest.Mock).mockReturnValue({
			error: 'Cannot find module ./dist/index.js'
		})

		const plugins = await controller.getPlugins()
		const organizationPlugin = plugins.find((plugin) => plugin.organizationId === 'org-1')
		const globalPlugin = plugins.find((plugin) => plugin.organizationId === GLOBAL_ORGANIZATION_SCOPE)

		expect(plugins).toHaveLength(2)
		expect(organizationPlugin).toEqual(
			expect.objectContaining({
				name: '@xpert-ai/plugin-scope-demo',
				loadStatus: 'failed',
				effectiveInCurrentScope: false,
				scopeRelation: 'none',
				isGlobal: false
			})
		)
		expect(globalPlugin).toEqual(
			expect.objectContaining({
				name: '@xpert-ai/plugin-scope-demo',
				loadStatus: 'loaded',
				effectiveInCurrentScope: true,
				scopeRelation: 'none',
				isGlobal: true
			})
		)
	})

	it('keeps system plugins hidden from non-super-admin users', async () => {
		loadedPlugins.push({
			organizationId: GLOBAL_ORGANIZATION_SCOPE,
			name: '@xpert-ai/plugin-system-demo',
			packageName: '@xpert-ai/plugin-system-demo',
			source: 'env',
			level: PLUGIN_LEVEL.SYSTEM,
			instance: {
				meta: {
					name: '@xpert-ai/plugin-system-demo',
					version: '0.0.1',
					level: PLUGIN_LEVEL.SYSTEM
				}
			},
			ctx: {}
		})

		await expect(controller.getPlugins()).resolves.toEqual([])
	})

	it('includes persisted plugin instances that failed to load', async () => {
		;(pluginInstanceService as any).findVisibleInOrganization.mockResolvedValue([
			{
				pluginName: '@xpert-ai/plugin-broken-demo',
				packageName: '@xpert-ai/plugin-broken-demo',
				version: '1.2.3',
				source: 'npm',
				level: PLUGIN_LEVEL.ORGANIZATION,
				organizationId: 'org-1',
				configurationStatus: null,
				configurationError: null
			}
		])
		;(findPluginLoadFailure as jest.Mock).mockReturnValue({
			error: 'Cannot find module ./dist/index.js'
		})

		await expect(controller.getPlugins()).resolves.toEqual([
			expect.objectContaining({
				name: '@xpert-ai/plugin-broken-demo',
				loadStatus: 'failed',
				loadError: 'Cannot find module ./dist/index.js',
				canConfigure: false,
				canUninstall: true,
				canUpdate: false,
				isGlobal: false
			})
		])
		expect((pluginInstanceService as any).findVisibleInOrganization).toHaveBeenCalledWith('org-1')
	})
})
