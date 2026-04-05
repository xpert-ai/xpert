/**
 * Invariants:
 * - Merge plugin ORM metadata into the live `DataSource` before lazy-loading plugin modules.
 * - Register HTTP routes and strategies only after the module is loaded into Nest.
 * - Preserve tenant/organization scope and existing plugin lifecycle semantics during install and refresh.
 */
import { BadRequestException, ForbiddenException, Inject, Injectable, Logger } from '@nestjs/common'
import { LazyModuleLoader, ModuleRef } from '@nestjs/core'
import { ApplicationConfig } from '@nestjs/core'
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
import {
	clearPluginLoadFailure,
	collectProvidersWithMetadata,
	hasLifecycleMethod,
	registerPluginsAsync,
	upsertPluginLoadFailure
} from './plugin.helper'
import { resolvePluginLevel } from './plugin-instance.entity'
import { PluginInstanceService } from './plugin-instance.service'
import { loadPlugin } from './plugin-loader'
import { getOrganizationPluginPath, getOrganizationPluginRoot, stageWorkspacePlugin } from './organization-plugin.store'
import { canManageGlobalPlugins, canManageSystemPlugins } from './plugin-update.utils'
import { assertPluginSdkInstallCandidate } from './plugin-sdk-versioning'
import { getCodeWorkspacePath, normalizePluginSourceConfig } from './source-config'
import {
	LOADED_PLUGINS,
	LoadedPluginRecord,
	PluginInstallInput,
	PluginInstallResult,
	normalizePluginName
} from './types'
import { DataSource } from 'typeorm'
import { collectPluginOrmMetadata, registerPluginOrmMetadataInDataSource } from './plugin-orm-metadata'
import { registerPluginControllerRoutes, snapshotHttpRouteStack, snapshotModuleIds } from './plugin-http-routes'

@Injectable()
export class PluginManagementService {
	private readonly logger = new Logger(PluginManagementService.name)
	private readonly registeredPluginRouteModuleIds = new Set<string>()

	constructor(
		@Inject(LOADED_PLUGINS)
		private readonly loadedPlugins: Array<LoadedPluginRecord>,
		private readonly pluginInstanceService: PluginInstanceService,
		private readonly strategyBus: StrategyBus,
		private readonly lazyLoader: LazyModuleLoader,
		private readonly moduleRef: ModuleRef,
		private readonly dataSource: DataSource,
		private readonly applicationConfig: ApplicationConfig
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

	async refreshCodePlugin(pluginName: string): Promise<PluginInstallResult> {
		if (!pluginName) {
			throw new BadRequestException('pluginName is required')
		}

		const organizationId = RequestContext.getOrganizationId() ?? GLOBAL_ORGANIZATION_SCOPE
		const loadedPlugin = this.findLoadedPlugin(pluginName, organizationId, false)
		const existing = await this.pluginInstanceService.findOneByPluginName(
			loadedPlugin?.name ?? pluginName,
			organizationId
		)

		if (!existing) {
			throw new BadRequestException(`Plugin "${pluginName}" is not refreshable in the current scope`)
		}

		if ((loadedPlugin?.source ?? existing.source) !== 'code') {
			throw new BadRequestException(`Plugin "${pluginName}" is not installed from local source code`)
		}

		const sourceConfig = existing.sourceConfig
		const workspacePath = getCodeWorkspacePath(sourceConfig)

		if (!workspacePath) {
			throw new BadRequestException(
				`Plugin "${pluginName}" does not have a stored sourceConfig.workspacePath to refresh from`
			)
		}

		const packageName = normalizePluginName(loadedPlugin?.packageName ?? existing.packageName ?? pluginName)
		const config = loadedPlugin?.ctx?.config ?? this.pluginInstanceService.getConfig(existing)

		return this.installPlugin({
			pluginName: packageName,
			source: 'code',
			sourceConfig,
			config
		})
	}

	async installPlugin(body: PluginInstallInput): Promise<PluginInstallResult> {
		if (!body?.pluginName) {
			throw new BadRequestException(t('server:Error.PluginPackageNameRequired'))
		}

		const source = body.source || 'marketplace'
		if (Object.prototype.hasOwnProperty.call(body, 'workspacePath')) {
			throw new BadRequestException('workspacePath has been removed. Use sourceConfig.workspacePath instead')
		}
		let sourceConfig = null
		try {
			sourceConfig = normalizePluginSourceConfig(source, body.sourceConfig)
		} catch (error) {
			throw new BadRequestException(getErrorMessage(error))
		}
		const workspacePath = getCodeWorkspacePath(sourceConfig)
		if (source === 'code' && !workspacePath) {
			throw new BadRequestException('sourceConfig.workspacePath is required when source is "code"')
		}

		const organizationId = RequestContext.getOrganizationId() ?? GLOBAL_ORGANIZATION_SCOPE
		const allowSystemPlugins = canManageSystemPlugins(organizationId)
		const tenantId = RequestContext.currentTenantId()
		const packageName = body.pluginName
		const level = PLUGIN_LEVEL.ORGANIZATION

		try {
			await assertPluginSdkInstallCandidate({
				pluginName: packageName,
				version: body.version,
				source,
				sourceConfig
			})

			await this.uninstallByPackageNameWithGuard(tenantId, organizationId, packageName, allowSystemPlugins)

			const packageNameWithVersion = body.version ? `${packageName}@${body.version}` : packageName
			const organizationBaseDir = getOrganizationPluginRoot(organizationId)
			if (source === 'code' && workspacePath) {
				stageWorkspacePlugin({
					organizationId,
					pluginName: packageNameWithVersion,
					expectedPackageName: packageName,
					workspacePath
				})
			}

			const { modules, errors } = await registerPluginsAsync({
				module: this.moduleRef,
				organizationId,
				plugins: [{ name: packageNameWithVersion, source, level }],
				configs: { [packageName]: body.config },
				baseDir: organizationBaseDir
			})

			if (errors.length) {
				throw new BadRequestException(errors[0].error)
			}

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
				const ormMetadata = collectPluginOrmMetadata([dynamicModule])
				const metadataRegistration = await registerPluginOrmMetadataInDataSource(this.dataSource, ormMetadata)
				if (metadataRegistration.changed) {
					this.logger.debug(
						`Registered ${ormMetadata.entities.length} plugin entities and ${ormMetadata.subscribers.length} plugin subscribers for ${packageNameWithVersion}`
					)
				}
				const beforeModuleIds = snapshotModuleIds(this.moduleRef)
				const beforeHttpRouteSnapshot = snapshotHttpRouteStack(this.moduleRef)
				const loadedModuleRef = await this.lazyLoader.load(() => dynamicModule)
				const routeRegistration = registerPluginControllerRoutes({
					moduleRef: this.moduleRef,
					applicationConfig: this.applicationConfig,
					beforeModuleIds,
					beforeHttpRouteSnapshot,
					rootModuleType: dynamicModule.module,
					registeredModuleIds: this.registeredPluginRouteModuleIds
				})
				if (routeRegistration.controllerCount) {
					this.logger.debug(
						`Registered ${routeRegistration.controllerCount} plugin controller routes across ${routeRegistration.moduleCount} modules for ${packageNameWithVersion}`
					)
				}
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
				sourceConfig,
				level: resolvedLevel,
				config: configInspection.config,
				configurationStatus: configInspection.error
					? PLUGIN_CONFIGURATION_STATUS.INVALID
					: PLUGIN_CONFIGURATION_STATUS.VALID,
				configurationError: configInspection.error ?? null
			})
			clearPluginLoadFailure(organizationId, pluginName, packageName)

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

			const failedPluginName = normalizePluginName(packageName)
			try {
				await this.pluginInstanceService.upsert({
					tenantId,
					organizationId,
					pluginName: failedPluginName,
					packageName: failedPluginName,
					version: body.version,
					source,
					sourceConfig,
					level,
					config: body.config ?? {},
					configurationStatus: null,
					configurationError: null
				})
			} catch (persistError) {
				this.logger.error(
					`Failed to persist plugin installation failure state for ${body.pluginName}`,
					persistError
				)
			}
			upsertPluginLoadFailure({
				organizationId,
				pluginName: failedPluginName,
				packageName: failedPluginName,
				error: errorMessage
			})

			throw new BadRequestException(
				t('server:Error.PluginInstallFailed', { pluginName: body.pluginName, errorMessage })
			)
		}
	}

	async uninstallByNamesWithGuard(names: string[], targetOrganizationId?: string) {
		const currentOrganizationId = RequestContext.getOrganizationId() ?? GLOBAL_ORGANIZATION_SCOPE
		const tenantId = RequestContext.currentTenantId()
		const organizationId = this.resolveUninstallOrganizationId(currentOrganizationId, targetOrganizationId)
		const allowSystemPlugins =
			currentOrganizationId === GLOBAL_ORGANIZATION_SCOPE &&
			organizationId === GLOBAL_ORGANIZATION_SCOPE &&
			canManageSystemPlugins(currentOrganizationId)
		this.assertNoSystemPlugins(names, allowSystemPlugins)
		await this.pluginInstanceService.uninstall(tenantId, organizationId, names)
	}

	private resolveUninstallOrganizationId(currentOrganizationId: string, targetOrganizationId?: string) {
		if (!targetOrganizationId || targetOrganizationId === currentOrganizationId) {
			if (currentOrganizationId === GLOBAL_ORGANIZATION_SCOPE && !canManageGlobalPlugins()) {
				throw new ForbiddenException('Only super admins can uninstall global plugins')
			}
			return currentOrganizationId
		}

		if (targetOrganizationId === GLOBAL_ORGANIZATION_SCOPE) {
			if (!canManageGlobalPlugins()) {
				throw new ForbiddenException('Only super admins can uninstall global plugins')
			}
			return GLOBAL_ORGANIZATION_SCOPE
		}

		throw new ForbiddenException('Plugins can only be uninstalled from the current or global organization scope')
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
