import { BadRequestException, Body, Controller, Delete, Get, Inject, Post } from '@nestjs/common'
import { LazyModuleLoader } from '@nestjs/core'
import { GLOBAL_ORGANIZATION_SCOPE, RequestContext, STRATEGY_META_KEY, StrategyBus } from '@xpert-ai/plugin-sdk'
import { In } from 'typeorm'
import { buildConfig } from './config'
import { getOrganizationPluginPath, getOrganizationPluginRoot } from './organization-plugin.store'
import { PluginInstanceService } from './plugin-instance.service'
import { loadPlugin } from './plugin-loader'
import { collectProvidersWithMetadata, hasLifecycleMethod, registerPluginsAsync } from './plugin.helper'
import { LOADED_PLUGINS, LoadedPluginRecord } from './types'

@Controller('plugin')
export class PluginController {
	constructor(
		@Inject(LOADED_PLUGINS)
		private readonly loadedPlugins: Array<LoadedPluginRecord>,
		private readonly pluginInstanceService: PluginInstanceService,
		private readonly strategyBus: StrategyBus,
		private readonly lazyLoader: LazyModuleLoader
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
	async installPlugin(@Body() body: { pluginName: string; version?: string; config?: Record<string, any> }) {
		if (!body?.pluginName) {
			throw new BadRequestException('Plugin package name is required')
		}
		const organizationId = RequestContext.getOrganizationId() ?? GLOBAL_ORGANIZATION_SCOPE
		const tenantId = RequestContext.currentTenantId()
		const packageName = body.pluginName
		const packageNameWithVersion = body.version ? `${packageName}@${body.version}` : packageName

		const organizationBaseDir = getOrganizationPluginRoot(organizationId)
		// 1) Install and register into current module context (mirrors registerPluginsAsync logic)
		const { modules } = await registerPluginsAsync({
			organizationId,
			plugins: [packageNameWithVersion],
			configs: { [packageName]: body.config },
			baseDir: organizationBaseDir
		})

		// 2) Load the module, scan and initialize the strategy class.
		for await (const dynamicModule of modules) {
			const loadedModuleRef = await this.lazyLoader.load(() => dynamicModule)
			const strategyProviders = collectProvidersWithMetadata(loadedModuleRef, organizationId, body.pluginName)
			for await (const instance of strategyProviders) {
				const target = instance.metatype ?? instance.constructor
				const strategyMeta = Reflect.getMetadata(STRATEGY_META_KEY, target)
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
		const pluginBaseDir = getOrganizationPluginPath(organizationId, packageName)
		const plugin = await loadPlugin(packageName, { basedir: pluginBaseDir })
		const pluginName = plugin.meta?.name ?? packageName
		const config = buildConfig(pluginName, body.config ?? {}, plugin.config)

		await this.pluginInstanceService.upsert({
			tenantId,
			organizationId,
			pluginName,
			packageName,
			version: body.version,
			source: 'marketplace',
			config
		})

		return { success: true, name: pluginName, packageName, organizationId }
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
	async uninstall(@Body() body: { names: string[] }) {
		if (!body?.names || body.names.length === 0) {
			throw new BadRequestException('Plugin names are required')
		}
		const organizationId = RequestContext.getOrganizationId() ?? GLOBAL_ORGANIZATION_SCOPE
		const tenantId = RequestContext.currentTenantId()

		const { items } = await this.pluginInstanceService.findAll({
			where: {
				tenantId,
				organizationId,
				pluginName: In(body.names)
			}
		})

		await this.pluginInstanceService.delete({
			tenantId,
			organizationId,
			pluginName: In(body.names)
		})

		for (const item of items) {
			this.strategyBus.remove(organizationId, item.pluginName)
			const pluginIndex = this.loadedPlugins.findIndex((plugin) => plugin.organizationId === organizationId && plugin.name === item.pluginName)
			if (pluginIndex !== -1) {
				this.loadedPlugins.splice(pluginIndex, 1)
			}
		}

		return { success: true }
	}
}
