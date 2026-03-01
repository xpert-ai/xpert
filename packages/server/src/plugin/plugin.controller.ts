import { BadRequestException, Body, Controller, Delete, Get, Inject, Logger, Post } from '@nestjs/common'
import { LazyModuleLoader, ModuleRef } from '@nestjs/core'
import { ApiTags } from '@nestjs/swagger'
import { t } from 'i18next'
import { PLUGIN_LEVEL, RolesEnum } from '@metad/contracts'
import {
	getErrorMessage,
	GLOBAL_ORGANIZATION_SCOPE,
	RequestContext,
	STRATEGY_META_KEY,
	StrategyBus
} from '@xpert-ai/plugin-sdk'
import { buildConfig } from './config'
import { getOrganizationPluginPath, getOrganizationPluginRoot } from './organization-plugin.store'
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
	getPlugins() {
		const organizationId = RequestContext.getOrganizationId() ?? GLOBAL_ORGANIZATION_SCOPE
		const isSuperAdmin = RequestContext.hasRole(RolesEnum.SUPER_ADMIN)
		return this.loadedPlugins
			.filter(
				(plugin) =>
					plugin.organizationId === organizationId || plugin.organizationId === GLOBAL_ORGANIZATION_SCOPE
			)
			.filter((plugin) => isSuperAdmin || plugin.level !== PLUGIN_LEVEL.SYSTEM)
			.map((plugin) => ({
				organizationId: plugin.organizationId,
				name: plugin.name,
				meta: plugin.instance.meta,
				isGlobal: plugin.organizationId === GLOBAL_ORGANIZATION_SCOPE,
				level: plugin.level ?? PLUGIN_LEVEL.ORGANIZATION
			}))
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
			source?: 'marketplace' | 'local' | 'git' | 'url' | 'npm' | 'env'
			config?: Record<string, unknown>
		}
	) {
		if (!body?.pluginName) {
			throw new BadRequestException(t('server:Error.PluginPackageNameRequired'))
		}

		const organizationId = RequestContext.getOrganizationId() ?? GLOBAL_ORGANIZATION_SCOPE
		const canManageSystemPlugins = this.canManageSystemPlugins(organizationId)
		const tenantId = RequestContext.currentTenantId()
		const packageName = body.pluginName
		const level = PLUGIN_LEVEL.ORGANIZATION
		try {
			await this.uninstallByPackageNameWithGuard(tenantId, organizationId, packageName, canManageSystemPlugins)

			const packageNameWithVersion = body.version ? `${packageName}@${body.version}` : packageName
			const organizationBaseDir = getOrganizationPluginRoot(organizationId)
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
				source: body.source || 'marketplace',
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
	getByNames(@Body() body: { names: string[] }) {
		const organizationId = RequestContext.getOrganizationId?.() ?? GLOBAL_ORGANIZATION_SCOPE
		const isSuperAdmin = RequestContext.hasRole(RolesEnum.SUPER_ADMIN)
		return this.loadedPlugins
			.filter((plugin) => plugin.organizationId === organizationId && body.names.includes(plugin.name))
			.filter((plugin) => isSuperAdmin || plugin.level !== PLUGIN_LEVEL.SYSTEM)
			.map((plugin) => ({
				organizationId: plugin.organizationId,
				name: plugin.name,
				meta: plugin.instance.meta
			}))
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

		return { success: true }
	}

	private canManageSystemPlugins(organizationId: string) {
		return organizationId === GLOBAL_ORGANIZATION_SCOPE && RequestContext.hasRole(RolesEnum.SUPER_ADMIN)
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
