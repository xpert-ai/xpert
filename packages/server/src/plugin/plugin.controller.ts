import { PermissionsEnum } from '@metad/contracts'
import { BadRequestException, Body, Controller, Delete, Get, Inject, Logger, Post, UseGuards } from '@nestjs/common'
import { LazyModuleLoader, ModuleRef } from '@nestjs/core'
import { ApiTags } from '@nestjs/swagger'
import { GLOBAL_ORGANIZATION_SCOPE, RequestContext, STRATEGY_META_KEY, StrategyBus } from '@xpert-ai/plugin-sdk'
import { Permissions } from '../shared/decorators'
import { PermissionGuard } from '../shared/guards'
import { buildConfig } from './config'
import { getOrganizationPluginPath, getOrganizationPluginRoot } from './organization-plugin.store'
import { PluginInstanceService } from './plugin-instance.service'
import { loadPlugin } from './plugin-loader'
import { attachPluginContext, resolvePluginAccessPolicy } from './lifecycle'
import { collectProvidersWithMetadata, hasLifecycleMethod, registerPluginsAsync } from './plugin.helper'
import { LOADED_PLUGINS, LoadedPluginRecord } from './types'

type PluginInstallSource = 'marketplace' | 'local' | 'git' | 'url'

const PLUGIN_INSTALL_SOURCES = new Set<PluginInstallSource>(['marketplace', 'local', 'git', 'url'])

function normalizePluginInstallSource(source?: string): PluginInstallSource {
	if (!source) {
		return 'marketplace'
	}
	if (source === 'code') {
		throw new BadRequestException('Plugin source "code" is reserved for built-in plugins')
	}
	return PLUGIN_INSTALL_SOURCES.has(source as PluginInstallSource)
		? (source as PluginInstallSource)
		: 'marketplace'
}

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
		return this.loadedPlugins
			.filter((plugin) => plugin.organizationId === organizationId || plugin.organizationId === GLOBAL_ORGANIZATION_SCOPE)
			.map((plugin) => ({
				organizationId: plugin.organizationId,
				name: plugin.name,
				meta: plugin.instance.meta,
				isGlobal: plugin.organizationId === GLOBAL_ORGANIZATION_SCOPE
			}))
	}

	/**
	 * Install a plugin into the current organization's plugin store and persist its configuration.
	 *
	 * @param body
	 * @returns
	 */
	@Post()
	@UseGuards(PermissionGuard)
	@Permissions(PermissionsEnum.ALL_ORG_EDIT)
	async installPlugin(@Body() body: { pluginName: string; version?: string; source?: string; config?: Record<string, any> }) {
		if (!body?.pluginName) {
			throw new BadRequestException('Plugin package name is required')
		}
		const source = normalizePluginInstallSource(body.source)

		const organizationId = RequestContext.getOrganizationId() ?? GLOBAL_ORGANIZATION_SCOPE
		const tenantId = RequestContext.currentTenantId()
		const packageName = body.pluginName
		try {
			await this.pluginInstanceService.uninstallByPackageName(tenantId, organizationId, packageName)

			const packageNameWithVersion = body.version ? `${packageName}@${body.version}` : packageName
			const organizationBaseDir = getOrganizationPluginRoot(organizationId)
			// 1) Install and register into current module context (mirrors registerPluginsAsync logic)
			const { modules } = await registerPluginsAsync({
				organizationId,
				plugins: [{name: packageNameWithVersion, source}],
				configs: { [packageName]: body.config },
				baseDir: organizationBaseDir
			})

			// 2) Load the module, scan and initialize the strategy class.
			for await (const dynamicModule of modules) {
				this.logger.debug(`Loading plugin module for ${packageNameWithVersion} into organization ${organizationId}`)
				const loadedModuleRef = await this.lazyLoader.load(() => dynamicModule)
				const strategyProviders = collectProvidersWithMetadata(loadedModuleRef, organizationId, body.pluginName, this.logger)
				for await (const instance of strategyProviders) {
					const target = instance.metatype ?? instance.constructor
					const strategyMeta = Reflect.getMetadata(STRATEGY_META_KEY, target)
					this.logger.debug(`Registering strategy ${strategyMeta} for plugin ${body.pluginName} in organization ${organizationId}`)
					if (strategyMeta) {
						this.strategyBus.upsert(strategyMeta, {
							instance,
							sourceId: `${organizationId}:${body.pluginName}@${body.version ?? 'latest'}:${target.name}`,
							sourceKind: 'plugin'
						})
					}
				}

				// If the plugin instance exists and it implements the specified lifecycle method, call it
				if (loadedModuleRef && hasLifecycleMethod(loadedModuleRef, 'onPluginBootstrap')) {
					await loadedModuleRef['onPluginBootstrap']()
				}
			}

			// 3) load plugin metadata to persist canonical plugin name/config
			const pluginBaseDir = getOrganizationPluginPath(organizationId, packageNameWithVersion)
			const plugin = await loadPlugin(packageName, { basedir: pluginBaseDir })
			const pluginName = plugin.meta?.name ?? packageName
			const config = buildConfig(pluginName, body.config ?? {}, plugin.config)

			const loadedRecord = this.loadedPlugins.find(
				(item) => item.organizationId === organizationId && item.name === pluginName
			)
			if (loadedRecord) {
				const { allowed, allowResolve, allowAppContext } = resolvePluginAccessPolicy(loadedRecord.instance, loadedRecord.source)
				attachPluginContext(loadedRecord.ctx, this.moduleRef as any, {
					allowed,
					allowResolve,
					allowAppContext,
					pluginName: loadedRecord.name
				})
				if (typeof loadedRecord.instance?.onInit === 'function') {
					await loadedRecord.instance.onInit(loadedRecord.ctx)
				}
				if (typeof loadedRecord.instance?.onStart === 'function') {
					await loadedRecord.instance.onStart(loadedRecord.ctx)
				}
			}

			await this.pluginInstanceService.upsert({
				tenantId,
				organizationId,
				pluginName,
				packageName,
				version: body.version,
				source,
				config
			})

			return { success: true, name: pluginName, packageName, organizationId }
		} catch (error) {
			this.logger.error(`Failed to install plugin ${body.pluginName}`, error)
			await this.pluginInstanceService.removePlugins(organizationId, [packageName])
			throw new BadRequestException(`Failed to install plugin ${body.pluginName}: ${error.message}`)
		}
	}

	@Post('by-names')
	getByNames(@Body() body: { names: string[] }) {
		const organizationId = RequestContext.getOrganizationId?.() ?? GLOBAL_ORGANIZATION_SCOPE
		return this.loadedPlugins
			.filter((plugin) => plugin.organizationId === organizationId && body.names.includes(plugin.name))
			.map((plugin) => ({
				organizationId: plugin.organizationId,
				name: plugin.name,
				meta: plugin.instance.meta
			}))
	}

	@Delete('uninstall')
	@UseGuards(PermissionGuard)
	@Permissions(PermissionsEnum.ALL_ORG_EDIT)
	async uninstall(@Body() body: { names: string[] }) {
		if (!body?.names || body.names.length === 0) {
			throw new BadRequestException('Plugin names are required')
		}
		const organizationId = RequestContext.getOrganizationId() ?? GLOBAL_ORGANIZATION_SCOPE
		const tenantId = RequestContext.currentTenantId()

		await this.pluginInstanceService.uninstall(tenantId, organizationId, body.names)

		return { success: true }
	}
}
