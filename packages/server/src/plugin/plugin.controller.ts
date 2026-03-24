import { BadRequestException, Body, Controller, Delete, Get, Inject, Logger, Post, Put } from '@nestjs/common'
import { LazyModuleLoader, ModuleRef } from '@nestjs/core'
import { ApiTags } from '@nestjs/swagger'
import { t } from 'i18next'
import { IPluginConfiguration, IPluginDescriptor, PLUGIN_LEVEL, RolesEnum } from '@metad/contracts'
import {
	getErrorMessage,
	GLOBAL_ORGANIZATION_SCOPE,
	RequestContext,
	STRATEGY_META_KEY,
	StrategyBus
} from '@xpert-ai/plugin-sdk'
import { buildConfig } from './config'
import { getOrganizationPluginPath, getOrganizationPluginRoot, stageWorkspacePlugin } from './organization-plugin.store'
import { resolvePluginConfigSchema } from './plugin-config-schema'
import { resolvePluginLevel } from './plugin-instance.entity'
import { PluginInstanceService } from './plugin-instance.service'
import { loadPlugin } from './plugin-loader'
import { collectProvidersWithMetadata, hasLifecycleMethod, registerPluginsAsync } from './plugin.helper'
import { LOADED_PLUGINS, LoadedPluginRecord, normalizePluginName } from './types'

@ApiTags('Plugin')
// @UseGuards(OrganizationPermissionGuard)
@Controller('plugin')
export class PluginController {
	private readonly logger = new Logger(PluginController.name)

	constructor(
		@Inject(LOADED_PLUGINS)
		private readonly loadedPlugins: Array<LoadedPluginRecord>,
		private readonly pluginInstanceService: PluginInstanceService,
		private readonly strategyBus: StrategyBus,
		private readonly lazyLoader: LazyModuleLoader,
		private readonly moduleRef: ModuleRef
	) {}

	@Get()
	getPlugins(): IPluginDescriptor[] {
		return this.listVisiblePlugins()
	}

	@Post('configuration')
	async getConfiguration(@Body() body: { pluginName: string }): Promise<IPluginConfiguration> {
		if (!body?.pluginName) {
			throw new BadRequestException('pluginName is required')
		}

		const organizationId = this.getCurrentOrganizationId()
		const plugin = this.findLoadedPlugin(body.pluginName, organizationId, false)
		if (!plugin) {
			throw new BadRequestException(`Plugin "${body.pluginName}" is not configurable in the current scope`)
		}

		const instance = await this.pluginInstanceService.findOneByPluginName(plugin.name, organizationId)
		const config = buildConfig(plugin.name, this.pluginInstanceService.getConfig(instance), plugin.instance.config)

		return {
			pluginName: plugin.name,
			config,
			configSchema: resolvePluginConfigSchema(plugin.instance)
		}
	}

	@Put('configuration')
	async saveConfiguration(
		@Body() body: { pluginName: string; config?: Record<string, any> }
	): Promise<IPluginConfiguration> {
		if (!body?.pluginName) {
			throw new BadRequestException('pluginName is required')
		}

		const organizationId = this.getCurrentOrganizationId()
		const plugin = this.findLoadedPlugin(body.pluginName, organizationId, false)
		if (!plugin) {
			throw new BadRequestException(`Plugin "${body.pluginName}" is not configurable in the current scope`)
		}

		const existing = await this.pluginInstanceService.findOneByPluginName(plugin.name, organizationId)
		const config = buildConfig(plugin.name, body.config ?? {}, plugin.instance.config)

		await this.pluginInstanceService.upsert({
			tenantId: RequestContext.currentTenantId() ?? existing?.tenantId,
			organizationId,
			pluginName: plugin.name,
			packageName: existing?.packageName ?? normalizePluginName(plugin.packageName ?? plugin.name),
			version: existing?.version ?? plugin.instance.meta?.version,
			source: existing?.source ?? 'env',
			level: existing?.level ?? plugin.level ?? resolvePluginLevel(plugin.instance.meta?.level),
			config
		})

		return {
			pluginName: plugin.name,
			config,
			configSchema: resolvePluginConfigSchema(plugin.instance)
		}
	}

	/**
	 * Install a plugin into the current organization's plugin store and persist its configuration.
	 *
	 * @param body
	 * @returns
	 */
	@Post()
	async installPlugin(
		@Body()
		body: {
			pluginName: string
			version?: string
			source?: 'marketplace' | 'local' | 'git' | 'url' | 'npm' | 'env' | 'code'
			config?: Record<string, any>
			workspacePath?: string
		}
	) {
		if (!body?.pluginName) {
			throw new BadRequestException(t('server:Error.PluginPackageNameRequired'))
		}

		if (body.workspacePath && body.source !== 'code') {
			throw new BadRequestException('workspacePath is only supported when source is "code"')
		}

		const organizationId = RequestContext.getOrganizationId() ?? GLOBAL_ORGANIZATION_SCOPE
		const canManageSystemPlugins = this.canManageSystemPlugins(organizationId)
		const tenantId = RequestContext.currentTenantId()
		const packageName = body.pluginName
		const source = body.source || 'marketplace'
		const level = PLUGIN_LEVEL.ORGANIZATION
		try {
			await this.uninstallByPackageNameWithGuard(tenantId, organizationId, packageName, canManageSystemPlugins)

			const packageNameWithVersion = body.version ? `${packageName}@${body.version}` : packageName
			const organizationBaseDir = getOrganizationPluginRoot(organizationId)
			if (source === 'code' && body.workspacePath) {
				stageWorkspacePlugin({
					organizationId,
					pluginName: packageNameWithVersion,
					expectedPackageName: packageName,
					workspacePath: body.workspacePath
				})
			}
			// 1) Install and register into current module context (mirrors registerPluginsAsync logic)
			const { modules } = await registerPluginsAsync({
				module: this.moduleRef,
				organizationId,
				plugins: [{ name: packageNameWithVersion, source: body.source, level }],
				configs: { [packageName]: body.config },
				baseDir: organizationBaseDir
			})

			const pluginBaseDir = getOrganizationPluginPath(organizationId, packageNameWithVersion)
			const plugin = await loadPlugin(packageName, { basedir: pluginBaseDir })
			const resolvedLevel = resolvePluginLevel(plugin.meta?.level)
			if (resolvedLevel === PLUGIN_LEVEL.SYSTEM && !canManageSystemPlugins) {
				throw new BadRequestException(
					t('server:Error.PluginSystemLevelInstallForbidden', { name: plugin.meta?.name ?? packageName })
				)
			}

			// 2) Load the module, scan and initialize the strategy class.
			for await (const dynamicModule of modules) {
				this.logger.debug(
					`Loading plugin module for ${packageNameWithVersion} into organization ${organizationId}`
				)
				const loadedModuleRef = await this.lazyLoader.load(() => dynamicModule)
				const strategyProviders = collectProvidersWithMetadata(
					loadedModuleRef,
					organizationId,
					body.pluginName,
					this.logger
				)
				for await (const instance of strategyProviders) {
					const target = instance.metatype ?? instance.constructor
					let strategyMeta: string = null
					if (instance.metatype) {
						strategyMeta = Reflect.getMetadata(STRATEGY_META_KEY, instance.metatype)
					}
					if (!strategyMeta) {
						strategyMeta = Reflect.getMetadata(STRATEGY_META_KEY, instance.constructor)
					}
					if (strategyMeta) {
						this.logger.debug(
							`Registering strategy ${strategyMeta} for plugin ${body.pluginName} in organization ${organizationId}`
						)
						this.strategyBus.upsert(strategyMeta, {
							instance,
							sourceId: `${organizationId}:${body.pluginName}@${body.version ?? 'latest'}:${target.name}`,
							sourceKind: 'plugin'
						})
					} else {
						this.logger.debug(
							`No strategy metadata found for provider '${instance.constructor.name}' in plugin ${body.pluginName}, skipping registration into strategy bus`
						)
					}
				}

				// If the plugin instance exists and it implements the specified lifecycle method, call it
				if (loadedModuleRef && hasLifecycleMethod(loadedModuleRef, 'onPluginBootstrap')) {
					await loadedModuleRef['onPluginBootstrap']()
				}
			}

			// 3) persist canonical plugin name/config
			const pluginName = plugin.meta?.name ?? packageName
			const config = buildConfig(pluginName, body.config ?? {}, plugin.config)

			await this.pluginInstanceService.upsert({
				tenantId,
				organizationId,
				pluginName,
				packageName,
				version: body.version,
				source,
				level: resolvedLevel,
				config
			})

			return { success: true, name: pluginName, packageName, organizationId }
		} catch (error) {
			let errorMessage = getErrorMessage(error)
			this.logger.error(`Failed to install plugin ${body.pluginName}`, error)

			try {
				await this.pluginInstanceService.removePlugins(organizationId, [packageName])
			} catch (cleanupError) {
				errorMessage += `;\n\nadditionally failed to clean up plugin after installation failure: ${getErrorMessage(cleanupError)}`
				this.logger.error(
					`Failed to clean up plugin ${body.pluginName} after installation failure`,
					cleanupError
				)
			}
			throw new BadRequestException(
				t('server:Error.PluginInstallFailed', { pluginName: body.pluginName, errorMessage })
			)
		}
	}

	@Post('by-names')
	getByNames(@Body() body: { names: string[] }): IPluginDescriptor[] {
		return this.listVisiblePlugins(body.names)
	}

	@Delete('uninstall')
	async uninstall(@Body() body: { names: string[] }) {
		if (!body?.names || body.names.length === 0) {
			throw new BadRequestException(t('server:Error.PluginNamesRequired'))
		}
		const organizationId = RequestContext.getOrganizationId() ?? GLOBAL_ORGANIZATION_SCOPE
		const canManageSystemPlugins = this.canManageSystemPlugins(organizationId)
		const tenantId = RequestContext.currentTenantId()
		await this.uninstallByNamesWithGuard(tenantId, organizationId, body.names, canManageSystemPlugins)

		await this.pluginInstanceService.uninstall(tenantId, organizationId, body.names)

		return { success: true }
	}

	private canManageSystemPlugins(organizationId: string) {
		return organizationId === GLOBAL_ORGANIZATION_SCOPE && RequestContext.hasRole(RolesEnum.SUPER_ADMIN)
	}

	private getCurrentOrganizationId() {
		return RequestContext.getOrganizationId() ?? GLOBAL_ORGANIZATION_SCOPE
	}

	private listVisiblePlugins(names?: string[]) {
		const organizationId = this.getCurrentOrganizationId()
		const isSuperAdmin = RequestContext.hasRole(RolesEnum.SUPER_ADMIN)
		const normalizedNames = names?.length ? new Set(names.map((name) => normalizePluginName(name))) : null

		return this.loadedPlugins
			.filter(
				(plugin) =>
					plugin.organizationId === organizationId || plugin.organizationId === GLOBAL_ORGANIZATION_SCOPE
			)
			.filter((plugin) => isSuperAdmin || plugin.level !== PLUGIN_LEVEL.SYSTEM)
			.filter((plugin) => !normalizedNames || normalizedNames.has(normalizePluginName(plugin.name)))
			.map((plugin) => this.toPluginDescriptor(plugin, organizationId))
	}

	private toPluginDescriptor(plugin: LoadedPluginRecord, organizationId: string): IPluginDescriptor {
		return {
			organizationId: plugin.organizationId,
			name: plugin.name,
			meta: plugin.instance.meta,
			isGlobal: plugin.organizationId === GLOBAL_ORGANIZATION_SCOPE,
			level: plugin.level ?? PLUGIN_LEVEL.ORGANIZATION,
			canConfigure: plugin.organizationId === organizationId && !!resolvePluginConfigSchema(plugin.instance),
			configSchema: resolvePluginConfigSchema(plugin.instance)
		}
	}

	private findLoadedPlugin(pluginName: string, organizationId: string, fallbackToGlobal = true) {
		const normalized = normalizePluginName(pluginName)
		const matches = (plugin: LoadedPluginRecord) => {
			const candidates = [plugin.name, plugin.packageName, plugin.instance?.meta?.name]
				.filter(Boolean)
				.map((value) => normalizePluginName(value))
			return candidates.includes(normalized)
		}

		return (
			this.loadedPlugins.find((plugin) => plugin.organizationId === organizationId && matches(plugin)) ??
			(fallbackToGlobal && organizationId !== GLOBAL_ORGANIZATION_SCOPE
				? this.loadedPlugins.find(
						(plugin) => plugin.organizationId === GLOBAL_ORGANIZATION_SCOPE && matches(plugin)
					)
				: undefined)
		)
	}

	private assertNoSystemPlugins(pluginNamesOrPackages: string[], allowSystemPlugins = false) {
		if (allowSystemPlugins) {
			return
		}

		const normalizedTargets = new Set(pluginNamesOrPackages.map((name) => normalizePluginName(name)))

		const matched = this.loadedPlugins.find((plugin) => {
			const level = resolvePluginLevel(plugin.level ?? plugin.instance?.meta?.level)
			if (level !== PLUGIN_LEVEL.SYSTEM) {
				return false
			}
			const candidates = [plugin.name, plugin.packageName, plugin.instance?.meta?.name]
				.filter(Boolean)
				.map((candidate) => normalizePluginName(candidate as string))
			return candidates.some((candidate) => normalizedTargets.has(candidate))
		})

		if (matched) {
			throw new BadRequestException(t('server:Error.PluginSystemUninstallForbidden', { name: matched.name }))
		}
	}

	private async uninstallByNamesWithGuard(
		tenantId: string,
		organizationId: string,
		names: string[],
		allowSystemPlugins = false
	) {
		this.assertNoSystemPlugins(names, allowSystemPlugins)
		await this.pluginInstanceService.uninstall(tenantId, organizationId, names)
	}

	private async uninstallByPackageNameWithGuard(
		tenantId: string,
		organizationId: string,
		packageName: string,
		allowSystemPlugins = false
	) {
		this.assertNoSystemPlugins([packageName], allowSystemPlugins)
		await this.pluginInstanceService.uninstallByPackageName(tenantId, organizationId, packageName)
	}
}
