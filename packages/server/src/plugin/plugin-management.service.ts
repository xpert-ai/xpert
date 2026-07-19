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
import { PLUGIN_CONFIGURATION_STATUS, PLUGIN_LEVEL, type PluginLevel } from '@xpert-ai/contracts'
import {
	derivePluginArtifactNamespace,
	getErrorMessage,
	GLOBAL_ORGANIZATION_SCOPE,
	RequestContext,
	PLUGIN_JOB_PROCESSOR_METADATA,
	SYSTEM_GLOBAL_SCOPE,
	resolveTenantGlobalScopeKey,
	STRATEGY_META_KEY,
	StrategyBus
} from '@xpert-ai/plugin-sdk'
import { inspectConfig } from './config'
import {
	clearPluginLoadFailure,
	collectProvidersWithMetadata,
	hasLifecycleMethod,
	PLUGIN_SYSTEM_LEVEL_INSTALL_FORBIDDEN_CODE,
	registerPluginsAsync,
	upsertPluginLoadFailure
} from './plugin.helper'
import { resolvePluginLevel } from './plugin-instance.entity'
import { PluginInstanceService } from './plugin-instance.service'
import { loadPlugin } from './plugin-loader'
import { getOrganizationPluginPath, getOrganizationPluginRoot } from './organization-plugin.store'
import { canManageGlobalPlugins, canManageSystemPlugins } from './plugin-update.utils'
import {
	assertInstalledPluginSdkCompatibility,
	assertPluginSdkCompatibility,
	assertPluginSdkInstallCandidate
} from './plugin-sdk-versioning'
import {
	cleanupExtractedPluginArchive,
	extractPluginArchive,
	readPluginPackageJson,
	UploadedPluginArchiveFile
} from './plugin-archive'
import {
	getCodePackageDir,
	getCodeRuntimeName,
	getCodeWorkspacePath,
	normalizePluginSourceConfig,
	omitTransientPluginSourceConfig
} from './source-config'
import {
	LOADED_PLUGINS,
	LoadedPluginRecord,
	PluginInstallInput,
	PluginInstallResult,
	normalizePluginName
} from './types'
import { resolvePluginScope } from './plugin-scope'
import { DataSource } from 'typeorm'
import {
	collectPluginOrmMetadata,
	registerPluginOrmMetadataInDataSource,
	validatePluginEntityTableNames
} from './plugin-orm-metadata'
import { registerPluginControllerRoutes, snapshotHttpRouteStack, snapshotModuleIds } from './plugin-http-routes'
import {
	collectPluginBundleComponents,
	readPluginBundleManifest,
	resolveLoadedPluginBundleRoot
} from './plugin-bundle-manifest'

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

	findLoadedPlugin(
		pluginName: string,
		organizationId: string,
		fallbackToGlobal = true,
		tenantId = RequestContext.getScope?.()?.tenantId ?? RequestContext.currentTenantId()
	) {
		const normalized = normalizePluginName(pluginName)
		const scopeKey =
			organizationId === GLOBAL_ORGANIZATION_SCOPE ? resolveTenantGlobalScopeKey(tenantId) : organizationId
		const globalScopeKey = resolveTenantGlobalScopeKey(tenantId)
		const matches = (plugin: LoadedPluginRecord) => {
			const candidates = [plugin.name, plugin.packageName, plugin.instance?.meta?.name]
				.filter(Boolean)
				.map((value) => normalizePluginName(value))
			return candidates.includes(normalized)
		}

		return (
			this.loadedPlugins.find(
				(plugin) => (plugin.scopeKey ?? plugin.organizationId) === scopeKey && matches(plugin)
			) ??
			(fallbackToGlobal && organizationId !== GLOBAL_ORGANIZATION_SCOPE
				? this.loadedPlugins.find(
						(plugin) => (plugin.scopeKey ?? plugin.organizationId) === globalScopeKey && matches(plugin)
					)
				: undefined) ??
			this.loadedPlugins.find(
				(plugin) => (plugin.scopeKey ?? plugin.organizationId) === SYSTEM_GLOBAL_SCOPE && matches(plugin)
			)
		)
	}

	private createCodeRuntimePluginName(pluginName: string) {
		const runtimeId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
		return `${normalizePluginName(pluginName)}@runtime__${runtimeId}`
	}

	async refreshCodePlugin(pluginName: string): Promise<PluginInstallResult> {
		if (!pluginName) {
			throw new BadRequestException('pluginName is required')
		}

		const scopeContext = RequestContext.getScope?.() ?? { tenantId: null, organizationId: null }
		const tenantId = scopeContext.tenantId ?? RequestContext.currentTenantId()
		const organizationId = scopeContext.organizationId ?? GLOBAL_ORGANIZATION_SCOPE
		const loadedPlugin = this.findLoadedPlugin(pluginName, organizationId, false, tenantId)
		if (
			organizationId === GLOBAL_ORGANIZATION_SCOPE &&
			!tenantId &&
			loadedPlugin?.scopeKey !== SYSTEM_GLOBAL_SCOPE
		) {
			throw new BadRequestException('tenantId is required for tenant-scoped plugin refresh')
		}
		const existing = await this.pluginInstanceService.findOneByPluginName(
			loadedPlugin?.name ?? pluginName,
			organizationId,
			tenantId,
			loadedPlugin?.scopeKey
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

	async installArchivePlugin(
		file: UploadedPluginArchiveFile,
		options: { config?: Record<string, any> } = {}
	): Promise<PluginInstallResult> {
		let extracted: Awaited<ReturnType<typeof extractPluginArchive>> | null = null

		try {
			extracted = await extractPluginArchive(file)
			return await this.installPlugin(
				{
					pluginName: normalizePluginName(extracted.packageJson.name),
					source: 'code',
					sourceConfig: {
						packageDir: extracted.packageDir,
						uploadFileName: extracted.originalName,
						uploadInstalledAt: new Date().toISOString()
					},
					config: options.config
				},
				{ allowPackageDir: true }
			)
		} finally {
			await cleanupExtractedPluginArchive(extracted?.tempDir)
		}
	}

	async installPlugin(
		body: PluginInstallInput,
		options: { allowPackageDir?: boolean } = {}
	): Promise<PluginInstallResult> {
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
		const packageDir = getCodePackageDir(sourceConfig)
		if (source === 'code' && packageDir && !options.allowPackageDir) {
			throw new BadRequestException(
				'sourceConfig.packageDir is internal. Upload plugin archives through /plugin/archive.'
			)
		}
		if (source === 'code' && !workspacePath && !packageDir) {
			throw new BadRequestException(
				'sourceConfig.workspacePath or sourceConfig.packageDir is required when source is "code"'
			)
		}

		const scopeContext = RequestContext.getScope?.() ?? { tenantId: null, organizationId: null }
		const tenantId = scopeContext.tenantId ?? RequestContext.currentTenantId()
		const organizationId = scopeContext.organizationId ?? GLOBAL_ORGANIZATION_SCOPE
		const defaultTenantId = await this.pluginInstanceService.getDefaultTenantId()
		const packageName = body.pluginName
		let level: PluginLevel = PLUGIN_LEVEL.ORGANIZATION
		let targetTenantId = tenantId
		let targetOrganizationId = organizationId
		let scope = resolvePluginScope({
			tenantId: targetTenantId,
			organizationId: targetOrganizationId,
			defaultTenantId
		})
		let scopeStoreOptions = {
			tenantId: targetTenantId,
			defaultTenantId,
			scopeKey: scope.scopeKey
		}
		let allowSystemPlugins = canManageSystemPlugins(targetOrganizationId, defaultTenantId)
		let shouldPersistFailureState = false
		let shouldCleanupPlugin = false
		let persistedSourceConfig = omitTransientPluginSourceConfig(sourceConfig)

		try {
			let compatibilityInfo:
				| Awaited<ReturnType<typeof assertPluginSdkInstallCandidate>>
				| ReturnType<typeof assertPluginSdkCompatibility>
			if (source === 'code' && packageDir) {
				compatibilityInfo = assertPluginSdkCompatibility(readPluginPackageJson(packageDir), {
					expectedPackageName: normalizePluginName(packageName)
				})
			} else {
				compatibilityInfo = await assertPluginSdkInstallCandidate({
					pluginName: packageName,
					version: body.version,
					source,
					sourceConfig
				})
			}
			level = resolvePluginLevel(compatibilityInfo?.level)
			if (level !== PLUGIN_LEVEL.SYSTEM && organizationId === GLOBAL_ORGANIZATION_SCOPE && !tenantId) {
				throw new BadRequestException('tenantId is required for tenant-scoped plugin installation')
			}
			if (level === PLUGIN_LEVEL.SYSTEM) {
				this.assertSystemInstallTenant(tenantId, defaultTenantId, packageName)
				targetTenantId = null
				targetOrganizationId = GLOBAL_ORGANIZATION_SCOPE
				scope = resolvePluginScope({
					tenantId: targetTenantId,
					organizationId: targetOrganizationId,
					defaultTenantId,
					scopeKey: SYSTEM_GLOBAL_SCOPE
				})
				scopeStoreOptions = {
					tenantId: targetTenantId,
					defaultTenantId,
					scopeKey: scope.scopeKey
				}
				allowSystemPlugins = canManageSystemPlugins(targetOrganizationId, defaultTenantId)
				if (!allowSystemPlugins) {
					shouldPersistFailureState = false
					throw new BadRequestException(
						t('server:Error.PluginSystemLevelInstallForbidden', { name: packageName })
					)
				}
			}

			const packageNameWithVersion = body.version ? `${packageName}@${body.version}` : packageName
			const runtimePluginName =
				source === 'code'
					? level === PLUGIN_LEVEL.SYSTEM
						? this.createCodeRuntimePluginName(packageName)
						: (getCodeRuntimeName(sourceConfig) ?? this.createCodeRuntimePluginName(packageName))
					: packageNameWithVersion
			if (
				source === 'code' &&
				(packageDir || level === PLUGIN_LEVEL.SYSTEM) &&
				getCodeRuntimeName(sourceConfig) !== runtimePluginName
			) {
				sourceConfig = {
					...sourceConfig,
					runtimeName: runtimePluginName
				}
			}
			persistedSourceConfig = omitTransientPluginSourceConfig(sourceConfig)
			const organizationBaseDir = getOrganizationPluginRoot(targetOrganizationId, scopeStoreOptions)

			if (level === PLUGIN_LEVEL.SYSTEM) {
				// A system plugin can own controllers, ORM metadata and other process-global
				// Nest artifacts. Stage and persist it, but never mutate the live module graph.
				// The next API process loads the staged runtime during normal bootstrap.
				const { errors } = await registerPluginsAsync(
					{
						module: this.moduleRef,
						tenantId: targetTenantId,
						organizationId: targetOrganizationId,
						defaultTenantId,
						scopeKey: scope.scopeKey,
						plugins: [
							{
								name: source === 'code' ? packageName : packageNameWithVersion,
								runtimeName: source === 'code' ? runtimePluginName : undefined,
								source,
								level,
								sourceConfig
							}
						],
						baseDir: organizationBaseDir,
						allowSystemPlugins,
						stageOnly: true
					},
					this.logger
				)

				if (errors.length) {
					throw new BadRequestException(errors[0].error)
				}

				const pluginBaseDir = getOrganizationPluginPath(
					targetOrganizationId,
					runtimePluginName,
					scopeStoreOptions
				)
				const stagedCompatibility = assertInstalledPluginSdkCompatibility(packageName, pluginBaseDir)
				const stagedLevel = resolvePluginLevel(stagedCompatibility.level)
				if (stagedLevel !== PLUGIN_LEVEL.SYSTEM) {
					throw new BadRequestException(
						`Plugin "${packageName}" was staged in ${SYSTEM_GLOBAL_SCOPE} but does not declare level=system`
					)
				}
				const artifactNamespace = stagedCompatibility.artifactNamespace
				if (!artifactNamespace) {
					throw new BadRequestException(
						`System-level plugin "${packageName}" must declare artifactNamespace in package.json`
					)
				}
				if (!isPluginArtifactNamespace(artifactNamespace)) {
					throw new BadRequestException(
						`Plugin "${packageName}" artifactNamespace must contain only lowercase letters, numbers, and underscores`
					)
				}
				this.assertPluginArtifactNamespaceAvailable({
					artifactNamespace,
					pluginName: normalizePluginName(packageName),
					packageName
				})

				const existingSystemPlugin = await this.pluginInstanceService.findOneByPluginName(
					normalizePluginName(packageName),
					targetOrganizationId,
					targetTenantId,
					scope.scopeKey
				)
				const persistedConfig =
					body.config ??
					(existingSystemPlugin ? this.pluginInstanceService.getConfig(existingSystemPlugin) : {})
				await this.pluginInstanceService.upsert(
					{
						tenantId: targetTenantId,
						organizationId: targetOrganizationId,
						scopeKey: scope.scopeKey,
						pluginName: normalizePluginName(packageName),
						packageName: normalizePluginName(packageName),
						version: stagedCompatibility.version ?? body.version,
						source,
						sourceConfig: persistedSourceConfig,
						level: PLUGIN_LEVEL.SYSTEM,
						config: persistedConfig,
						configurationStatus: existingSystemPlugin?.configurationStatus ?? null,
						configurationError: existingSystemPlugin?.configurationError ?? null
					},
					{ syncLoadedConfig: false }
				)

				this.logger.log(
					`Staged system plugin ${packageName}@${stagedCompatibility.version ?? body.version ?? 'latest'}; API restart required for activation`
				)
				return {
					success: true,
					name: normalizePluginName(packageName),
					packageName: normalizePluginName(packageName),
					organizationId: targetOrganizationId,
					currentVersion: stagedCompatibility.version ?? body.version,
					restartRequired: true
				}
			}

			await this.uninstallByPackageNameWithGuard(
				targetTenantId,
				targetOrganizationId,
				packageName,
				allowSystemPlugins,
				scope.scopeKey
			)
			shouldCleanupPlugin = true
			shouldPersistFailureState = true

			const { modules, errors } = await registerPluginsAsync(
				{
					module: this.moduleRef,
					tenantId: targetTenantId,
					organizationId: targetOrganizationId,
					defaultTenantId,
					scopeKey: scope.scopeKey,
					plugins: [
						{
							name: source === 'code' ? packageName : packageNameWithVersion,
							runtimeName: source === 'code' ? runtimePluginName : undefined,
							source,
							level,
							sourceConfig
						}
					],
					configs: { [packageName]: body.config },
					baseDir: organizationBaseDir,
					allowSystemPlugins
				},
				this.logger
			)

			if (errors.length) {
				const systemLevelError = errors.find(
					(error) => error.code === PLUGIN_SYSTEM_LEVEL_INSTALL_FORBIDDEN_CODE
				)
				if (systemLevelError) {
					shouldPersistFailureState = false
					throw new BadRequestException(
						t('server:Error.PluginSystemLevelInstallForbidden', { name: packageName })
					)
				}
				throw new BadRequestException(errors[0].error)
			}

			const pluginBaseDir = getOrganizationPluginPath(targetOrganizationId, runtimePluginName, scopeStoreOptions)
			const plugin = await loadPlugin(packageName, {
				basedir: pluginBaseDir,
				source,
				workspacePath
			})
			const declaredSystemLevel = plugin.meta?.level === PLUGIN_LEVEL.SYSTEM
			const resolvedLevel = declaredSystemLevel ? PLUGIN_LEVEL.SYSTEM : resolvePluginLevel(plugin.meta?.level)
			if (declaredSystemLevel && !allowSystemPlugins) {
				shouldPersistFailureState = false
				throw new BadRequestException(
					t('server:Error.PluginSystemLevelInstallForbidden', { name: plugin.meta?.name ?? packageName })
				)
			}
			if (resolvedLevel === PLUGIN_LEVEL.SYSTEM && scope.scopeKey !== SYSTEM_GLOBAL_SCOPE) {
				shouldPersistFailureState = false
				throw new BadRequestException(
					`System-level plugin "${plugin.meta?.name ?? packageName}" must be installed in ${SYSTEM_GLOBAL_SCOPE}`
				)
			}
			if (resolvedLevel === PLUGIN_LEVEL.SYSTEM) {
				this.assertSystemInstallTenant(tenantId, defaultTenantId, plugin.meta?.name ?? packageName)
			}
			if (resolvedLevel !== PLUGIN_LEVEL.SYSTEM && scope.scopeKey === SYSTEM_GLOBAL_SCOPE) {
				shouldPersistFailureState = false
				throw new BadRequestException(
					`Plugin "${plugin.meta?.name ?? packageName}" was routed to ${SYSTEM_GLOBAL_SCOPE} but does not declare level=system`
				)
			}
			const pluginName = plugin.meta?.name ?? packageName
			const manifestArtifactNamespace = readPluginBundleManifest(pluginBaseDir)?.manifest.artifactNamespace
			if (
				plugin.meta?.artifactNamespace &&
				manifestArtifactNamespace &&
				plugin.meta.artifactNamespace !== manifestArtifactNamespace
			) {
				throw new BadRequestException(
					`Plugin "${pluginName}" declares artifactNamespace="${plugin.meta.artifactNamespace}" but bundle manifest declares "${manifestArtifactNamespace}"`
				)
			}
			const explicitArtifactNamespace = plugin.meta?.artifactNamespace ?? manifestArtifactNamespace ?? null
			const artifactNamespace = explicitArtifactNamespace ?? derivePluginArtifactNamespace(pluginName)
			if (explicitArtifactNamespace && !isPluginArtifactNamespace(explicitArtifactNamespace)) {
				throw new BadRequestException(
					`Plugin "${pluginName}" artifactNamespace must contain only lowercase letters, numbers, and underscores`
				)
			}
			if (explicitArtifactNamespace) {
				this.assertPluginArtifactNamespaceAvailable({
					artifactNamespace: explicitArtifactNamespace,
					pluginName,
					packageName
				})
			}

			for await (const dynamicModule of modules) {
				this.logger.debug(`Loading plugin module for ${runtimePluginName} into scope ${scope.scopeKey}`)
				const ormMetadata = collectPluginOrmMetadata([dynamicModule])
				if (ormMetadata.entities.length && !explicitArtifactNamespace) {
					this.logger.warn(
						`Plugin "${pluginName}" declares TypeORM entities but does not declare artifactNamespace; using derived namespace "${artifactNamespace}" for v1 compatibility.`
					)
				}
				validatePluginEntityTableNames({
					pluginName,
					entities: ormMetadata.entities,
					artifactNamespace,
					requireNamespaceMatch: Boolean(explicitArtifactNamespace)
				})
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
					scope.scopeKey,
					body.pluginName,
					this.logger,
					beforeModuleIds
				)

				for await (const instance of strategyProviders) {
					const target = instance.metatype ?? instance.constructor
					const sourceId = `${scope.scopeKey}:${body.pluginName}@${body.version ?? 'latest'}:${target.name}`
					let strategyMeta: string = null
					if (instance.metatype) {
						strategyMeta = Reflect.getMetadata(STRATEGY_META_KEY, instance.metatype)
					}
					if (!strategyMeta) {
						strategyMeta = Reflect.getMetadata(STRATEGY_META_KEY, instance.constructor)
					}
					let managedQueueProcessorMeta: unknown = null
					if (instance.metatype) {
						managedQueueProcessorMeta = Reflect.getMetadata(
							PLUGIN_JOB_PROCESSOR_METADATA,
							instance.metatype
						)
					}
					if (!managedQueueProcessorMeta) {
						managedQueueProcessorMeta = Reflect.getMetadata(
							PLUGIN_JOB_PROCESSOR_METADATA,
							instance.constructor
						)
					}
					if (strategyMeta) {
						this.logger.debug(
							`Registering strategy ${strategyMeta} for plugin ${body.pluginName} in organization ${targetOrganizationId}`
						)
						this.strategyBus.upsert(strategyMeta, {
							instance,
							sourceId,
							sourceKind: 'plugin'
						})
					}
					if (Array.isArray(managedQueueProcessorMeta) && managedQueueProcessorMeta.length) {
						this.logger.debug(
							`Registering managed queue processor for plugin ${body.pluginName} in organization ${targetOrganizationId}`
						)
						this.strategyBus.upsert(PLUGIN_JOB_PROCESSOR_METADATA, {
							instance,
							sourceId,
							sourceKind: 'plugin'
						})
					}
					if (
						!strategyMeta &&
						!(Array.isArray(managedQueueProcessorMeta) && managedQueueProcessorMeta.length)
					) {
						this.logger.debug(
							`No strategy or managed queue processor metadata found for provider '${instance.constructor.name}' in plugin ${body.pluginName}, skipping registration into strategy bus`
						)
					}
				}

				if (loadedModuleRef && hasLifecycleMethod(loadedModuleRef, 'onPluginBootstrap')) {
					await loadedModuleRef['onPluginBootstrap']()
				}
			}

			const configInspection = inspectConfig(pluginName, body.config ?? {}, plugin.config)
			if (configInspection.error) {
				this.logger.warn(
					`Plugin ${pluginName} was installed with invalid configuration and requires setup before use: ${configInspection.error}`
				)
			}

			await this.pluginInstanceService.upsert({
				tenantId: targetTenantId,
				organizationId: targetOrganizationId,
				scopeKey: scope.scopeKey,
				pluginName,
				packageName,
				version: plugin.meta?.version,
				source,
				sourceConfig: persistedSourceConfig,
				level: resolvedLevel,
				config: configInspection.config,
				configurationStatus: configInspection.error
					? PLUGIN_CONFIGURATION_STATUS.INVALID
					: PLUGIN_CONFIGURATION_STATUS.VALID,
				configurationError: configInspection.error ?? null
			})
			clearPluginLoadFailure(scope.scopeKey, pluginName, packageName)

			return {
				success: true,
				name: pluginName,
				packageName,
				organizationId: targetOrganizationId,
				currentVersion: plugin.meta?.version
			}
		} catch (error) {
			let errorMessage = getErrorMessage(error)
			this.logger.error(`Failed to install plugin ${body.pluginName}`, error)

			if (shouldCleanupPlugin) {
				try {
					await this.pluginInstanceService.removePlugins(targetOrganizationId, [packageName], {
						tenantId: targetTenantId,
						defaultTenantId,
						scopeKey: scope.scopeKey
					})
				} catch (cleanupError) {
					errorMessage += `;\n\nadditionally failed to clean up plugin after installation failure: ${getErrorMessage(cleanupError)}`
					this.logger.error(
						`Failed to clean up plugin ${body.pluginName} after installation failure`,
						cleanupError
					)
				}
			}

			if (shouldPersistFailureState) {
				const failedPluginName = normalizePluginName(packageName)
				try {
					await this.pluginInstanceService.upsert({
						tenantId: targetTenantId,
						organizationId: targetOrganizationId,
						scopeKey: scope.scopeKey,
						pluginName: failedPluginName,
						packageName: failedPluginName,
						version: body.version,
						source,
						sourceConfig: persistedSourceConfig,
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
					tenantId: targetTenantId,
					organizationId: targetOrganizationId,
					scopeKey: scope.scopeKey,
					pluginName: failedPluginName,
					packageName: failedPluginName,
					error: errorMessage
				})
			}

			throw new BadRequestException(
				t('server:Error.PluginInstallFailed', { pluginName: body.pluginName, errorMessage })
			)
		}
	}

	async uninstallByNamesWithGuard(
		names: string[],
		targetOrganizationId?: string,
		targetScopeKey?: string
	): Promise<{ restartRequired?: boolean }> {
		const scopeContext = RequestContext.getScope?.() ?? { tenantId: null, organizationId: null }
		const currentOrganizationId = scopeContext.organizationId ?? GLOBAL_ORGANIZATION_SCOPE
		const tenantId = scopeContext.tenantId ?? RequestContext.currentTenantId()
		const defaultTenantId = await this.pluginInstanceService.getDefaultTenantId()
		const organizationId = this.resolveUninstallOrganizationId(currentOrganizationId, targetOrganizationId)
		const allowSystemPlugins =
			currentOrganizationId === GLOBAL_ORGANIZATION_SCOPE &&
			organizationId === GLOBAL_ORGANIZATION_SCOPE &&
			canManageSystemPlugins(currentOrganizationId, defaultTenantId)
		const targetsLoadedSystemPlugin = !targetScopeKey && !!this.findLoadedSystemPlugin(names)
		const scopeKey =
			targetScopeKey ??
			(targetsLoadedSystemPlugin
				? SYSTEM_GLOBAL_SCOPE
				: organizationId === GLOBAL_ORGANIZATION_SCOPE
					? resolveTenantGlobalScopeKey(tenantId)
					: organizationId)
		if (scopeKey === SYSTEM_GLOBAL_SCOPE && !canManageSystemPlugins(GLOBAL_ORGANIZATION_SCOPE, defaultTenantId)) {
			throw new ForbiddenException('Only super admins can uninstall system plugins')
		}
		this.assertNoSystemPlugins(names, allowSystemPlugins, scopeKey)
		if (scopeKey === SYSTEM_GLOBAL_SCOPE) {
			await this.pluginInstanceService.deactivate(tenantId, organizationId, names, { scopeKey })
			this.logger.log(
				`Deactivated persisted registrations for system plugins ${names.join(', ')}; API restart required for unload`
			)
			return { restartRequired: true }
		}
		await this.pluginInstanceService.uninstall(tenantId, organizationId, names, { scopeKey })
		return {}
	}

	readLoadedPluginBundleComponents(plugin: LoadedPluginRecord) {
		if (!plugin?.name) {
			return []
		}

		const packageRoot = resolveLoadedPluginBundleRoot(plugin)
		if (!packageRoot) {
			return []
		}
		const manifestResult = readPluginBundleManifest(packageRoot)
		if (!manifestResult) {
			return []
		}
		return collectPluginBundleComponents(packageRoot, manifestResult.manifest)
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

	private assertNoSystemPlugins(pluginNamesOrPackages: string[], allowSystemPlugins = false, scopeKey?: string) {
		const matched = this.findLoadedSystemPlugin(pluginNamesOrPackages, scopeKey)

		if (matched && !allowSystemPlugins) {
			throw new BadRequestException(t('server:Error.PluginSystemUninstallForbidden', { name: matched.name }))
		}
	}

	private findLoadedSystemPlugin(pluginNamesOrPackages: string[], scopeKey?: string) {
		const normalizedTargets = new Set(pluginNamesOrPackages.map((name) => normalizePluginName(name)))
		return this.loadedPlugins.find((plugin) => {
			if (scopeKey && (plugin.scopeKey ?? plugin.organizationId) !== scopeKey) {
				return false
			}
			const level = resolvePluginLevel(plugin.level ?? plugin.instance?.meta?.level)
			if (level !== PLUGIN_LEVEL.SYSTEM) {
				return false
			}
			const candidates = [plugin.name, plugin.packageName, plugin.instance?.meta?.name]
				.filter(Boolean)
				.map((candidate) => normalizePluginName(candidate as string))
			return candidates.some((candidate) => normalizedTargets.has(candidate))
		})
	}

	/**
	 * Fail fast when a newly installed plugin explicitly claims a namespace already owned by another loaded plugin.
	 * Reinstalling/upgrading the same plugin is allowed so a stable namespace does not block normal refresh flows.
	 */
	private assertPluginArtifactNamespaceAvailable(input: {
		artifactNamespace: string
		pluginName: string
		packageName: string
	}) {
		const targetNames = new Set(
			[input.pluginName, input.packageName]
				.map((value) => normalizeOptionalPluginName(value))
				.filter((value): value is string => Boolean(value))
		)
		const conflict = this.loadedPlugins.find((plugin) => {
			const loadedNamespace = resolveLoadedPluginExplicitArtifactNamespace(plugin)
			if (loadedNamespace !== input.artifactNamespace) {
				return false
			}

			const loadedNames = [plugin.name, plugin.packageName, plugin.instance?.meta?.name]
				.map((value) => normalizeOptionalPluginName(value))
				.filter((value): value is string => Boolean(value))
			return !loadedNames.some((value) => targetNames.has(value))
		})

		if (!conflict) {
			return
		}

		const conflictScope = conflict.scopeKey ?? conflict.organizationId
		throw new BadRequestException(
			`Plugin "${input.pluginName}" declares artifactNamespace="${input.artifactNamespace}", but it is already used by installed plugin "${getLoadedPluginDisplayName(conflict)}" in scope "${conflictScope}".`
		)
	}

	private assertSystemInstallTenant(
		tenantId: string | null | undefined,
		defaultTenantId: string | null | undefined,
		pluginName: string
	) {
		if (!tenantId || !defaultTenantId || tenantId !== defaultTenantId) {
			throw new BadRequestException(
				t('server:Error.PluginSystemLevelDefaultTenantRequired', { name: pluginName })
			)
		}
	}

	private async uninstallByPackageNameWithGuard(
		tenantId: string | null,
		organizationId: string,
		packageName: string,
		allowSystemPlugins = false,
		scopeKey?: string | null
	) {
		const resolvedScopeKey =
			scopeKey ??
			(organizationId === GLOBAL_ORGANIZATION_SCOPE ? resolveTenantGlobalScopeKey(tenantId) : organizationId)
		this.assertNoSystemPlugins([packageName], allowSystemPlugins, resolvedScopeKey)
		await this.pluginInstanceService.uninstallByPackageName(tenantId, organizationId, packageName, {
			scopeKey: resolvedScopeKey
		})
	}
}

function isPluginArtifactNamespace(value: string) {
	return /^[a-z0-9_]+$/.test(value)
}

function normalizeOptionalString(value: unknown) {
	if (typeof value !== 'string') {
		return null
	}
	const normalized = value.trim()
	return normalized || null
}

function normalizeOptionalPluginName(value: unknown) {
	const normalized = normalizeOptionalString(value)
	return normalized ? normalizePluginName(normalized) : null
}

/**
 * Read only explicit namespace declarations from loaded plugins.
 * Derived namespaces remain compatibility-only in v1 and are not used as hard install blockers.
 */
function resolveLoadedPluginExplicitArtifactNamespace(plugin: LoadedPluginRecord) {
	const metaNamespace = normalizeOptionalString(plugin.instance?.meta?.artifactNamespace)
	if (metaNamespace) {
		return metaNamespace
	}

	const packageRoot = resolveLoadedPluginBundleRoot(plugin)
	if (!packageRoot) {
		return null
	}

	return normalizeOptionalString(readPluginBundleManifest(packageRoot)?.manifest.artifactNamespace)
}

function getLoadedPluginDisplayName(plugin: LoadedPluginRecord) {
	return (
		normalizeOptionalString(plugin.instance?.meta?.name) ??
		normalizeOptionalString(plugin.packageName) ??
		plugin.name
	)
}
