import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common'
import { LazyModuleLoader, ModuleRef } from '@nestjs/core'
import { t } from 'i18next'
import { PLUGIN_CONFIGURATION_STATUS, PLUGIN_LEVEL } from '@metad/contracts'
import {
	getErrorMessage,
	GLOBAL_ORGANIZATION_SCOPE,
	RequestContext,
	STRATEGY_META_KEY,
	StrategyBus
} from '@xpert-ai/plugin-sdk'
import { inspectConfig } from './config'
import { collectProvidersWithMetadata, hasLifecycleMethod, registerPluginsAsync } from './plugin.helper'
import { resolvePluginLevel } from './plugin-instance.entity'
import { PluginInstanceService } from './plugin-instance.service'
import { loadPlugin } from './plugin-loader'
import { getOrganizationPluginPath, getOrganizationPluginRoot, stageWorkspacePlugin } from './organization-plugin.store'
import { canManageSystemPlugins } from './plugin-update.utils'
import {
	LOADED_PLUGINS,
	LoadedPluginRecord,
	PluginInstallInput,
	PluginInstallResult,
	normalizePluginName
} from './types'

@Injectable()
export class PluginManagementService {
	private readonly logger = new Logger(PluginManagementService.name)

	constructor(
		@Inject(LOADED_PLUGINS)
		private readonly loadedPlugins: Array<LoadedPluginRecord>,
		private readonly pluginInstanceService: PluginInstanceService,
		private readonly strategyBus: StrategyBus,
		private readonly lazyLoader: LazyModuleLoader,
		private readonly moduleRef: ModuleRef
	) {}

	findLoadedPlugin(pluginName: string, organizationId: string, fallbackToGlobal = true) {
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

	async installPlugin(body: PluginInstallInput): Promise<PluginInstallResult> {
		if (!body?.pluginName) {
			throw new BadRequestException(t('server:Error.PluginPackageNameRequired'))
		}

		if (body.workspacePath && body.source !== 'code') {
			throw new BadRequestException('workspacePath is only supported when source is "code"')
		}

		const organizationId = RequestContext.getOrganizationId() ?? GLOBAL_ORGANIZATION_SCOPE
		const allowSystemPlugins = canManageSystemPlugins(organizationId)
		const tenantId = RequestContext.currentTenantId()
		const packageName = body.pluginName
		const source = body.source || 'marketplace'
		const level = PLUGIN_LEVEL.ORGANIZATION

		try {
			await this.uninstallByPackageNameWithGuard(tenantId, organizationId, packageName, allowSystemPlugins)

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

			const { modules } = await registerPluginsAsync({
				module: this.moduleRef,
				organizationId,
				plugins: [{ name: packageNameWithVersion, source, level }],
				configs: { [packageName]: body.config },
				baseDir: organizationBaseDir
			})

			const pluginBaseDir = getOrganizationPluginPath(organizationId, packageNameWithVersion)
			const plugin = await loadPlugin(packageName, { basedir: pluginBaseDir })
			const resolvedLevel = resolvePluginLevel(plugin.meta?.level)
			if (resolvedLevel === PLUGIN_LEVEL.SYSTEM && !allowSystemPlugins) {
				throw new BadRequestException(
					t('server:Error.PluginSystemLevelInstallForbidden', { name: plugin.meta?.name ?? packageName })
				)
			}

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

				if (loadedModuleRef && hasLifecycleMethod(loadedModuleRef, 'onPluginBootstrap')) {
					await loadedModuleRef['onPluginBootstrap']()
				}
			}

			const pluginName = plugin.meta?.name ?? packageName
			const configInspection = inspectConfig(pluginName, body.config ?? {}, plugin.config)
			if (configInspection.error) {
				this.logger.warn(
					`Plugin ${pluginName} was installed with invalid configuration and requires setup before use: ${configInspection.error}`
				)
			}

			await this.pluginInstanceService.upsert({
				tenantId,
				organizationId,
				pluginName,
				packageName,
				version: plugin.meta?.version,
				source,
				level: resolvedLevel,
				config: configInspection.config,
				configurationStatus: configInspection.error
					? PLUGIN_CONFIGURATION_STATUS.INVALID
					: PLUGIN_CONFIGURATION_STATUS.VALID,
				configurationError: configInspection.error ?? null
			})

			return {
				success: true,
				name: pluginName,
				packageName,
				organizationId,
				currentVersion: plugin.meta?.version
			}
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

	async uninstallByNamesWithGuard(names: string[]) {
		const organizationId = RequestContext.getOrganizationId() ?? GLOBAL_ORGANIZATION_SCOPE
		const tenantId = RequestContext.currentTenantId()
		this.assertNoSystemPlugins(names, canManageSystemPlugins(organizationId))
		await this.pluginInstanceService.uninstall(tenantId, organizationId, names)
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
