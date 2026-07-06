import {
	BadRequestException,
	Body,
	Controller,
	Delete,
	Get,
	Inject,
	NotFoundException,
	Param,
	Post,
	Put,
	Query,
	UploadedFile,
	UseInterceptors
} from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { FileInterceptor } from '@nestjs/platform-express'
import { ApiConsumes, ApiTags } from '@nestjs/swagger'
import { t } from 'i18next'
import {
	IPluginConfiguration,
	type IPluginComponentDocument,
	IPluginDescriptor,
	IPluginLatestVersionStatus,
	PLUGIN_COMPONENT_TYPE,
	PLUGIN_CONFIGURATION_STATUS,
	PLUGIN_LOAD_STATUS,
	PLUGIN_LEVEL,
	PluginComponentSummary,
	PluginComponentType,
	PluginScopeRelation
} from '@xpert-ai/contracts'
import {
	derivePluginArtifactNamespace,
	GLOBAL_ORGANIZATION_SCOPE,
	RequestContext,
	SYSTEM_GLOBAL_SCOPE,
	resolveTenantGlobalScopeKey
} from '@xpert-ai/plugin-sdk'
import { buildConfig, inspectConfig } from './config'
import { findPluginLoadFailure } from './plugin.helper'
import { resolvePluginConfigSchema } from './plugin-config-schema'
import { resolvePluginLevel } from './plugin-instance.entity'
import { PluginInstanceService } from './plugin-instance.service'
import {
	PluginMarketplaceRegistryItemInput,
	PluginMarketplaceService,
	PluginMarketplaceSourceInput
} from './plugin-marketplace.service'
import { PluginManagementService } from './plugin-management.service'
import { getCodeWorkspacePath } from './source-config'
import {
	canManageSystemPlugins,
	canUninstallPlugin,
	canUpdatePlugin,
	hasNewerVersion,
	supportsNpmRegistryUpdates
} from './plugin-update.utils'
import { GetPluginSkillDocumentQuery, ResolveLatestPluginVersionQuery } from './queries'
import { UpdatePluginCommand } from './commands'
import { UploadedPluginArchiveFile } from './plugin-archive'
import { LOADED_PLUGINS, LoadedPluginRecord, PluginInstallInput, normalizePluginName } from './types'

type LoadedPluginScopeState = {
	effectiveScope: string | null
	hasLoadedGlobal: boolean
	hasLoadedOrganization: boolean
	hasLoadedSystem: boolean
}

type ParsedJsonObject = {
	[key: string]: unknown
}

@ApiTags('Plugin')
// @UseGuards(OrganizationPermissionGuard)
@Controller('plugin')
export class PluginController {
	constructor(
		@Inject(LOADED_PLUGINS)
		private readonly loadedPlugins: Array<LoadedPluginRecord>,
		private readonly pluginInstanceService: PluginInstanceService,
		private readonly pluginMarketplaceService: PluginMarketplaceService,
		private readonly pluginManagementService: PluginManagementService,
		private readonly queryBus: QueryBus,
		private readonly commandBus: CommandBus
	) {}

	@Get()
	async getPlugins(): Promise<IPluginDescriptor[]> {
		return this.listVisiblePlugins()
	}

	@Get(':name/components')
	async getPluginComponents(@Param('name') name: string) {
		if (!name?.trim()) {
			throw new BadRequestException('plugin name is required')
		}
		const organizationId = this.getCurrentOrganizationId()
		const loadedPlugin = this.pluginManagementService.findLoadedPlugin(name, organizationId)
		if (!loadedPlugin) {
			throw new NotFoundException('plugin was not found')
		}
		return {
			items: this.pluginManagementService.readLoadedPluginBundleComponents(loadedPlugin)
		}
	}

	@Get(':name/components/skill/:componentKey/document')
	async getPluginSkillDocument(
		@Param('name') name: string,
		@Param('componentKey') componentKey: string
	): Promise<IPluginComponentDocument> {
		return this.queryBus.execute(
			new GetPluginSkillDocumentQuery({
				pluginName: name,
				componentKey,
				organizationId: this.getCurrentOrganizationId()
			})
		)
	}

	@Post('configuration')
	async getConfiguration(@Body() body: { pluginName: string }): Promise<IPluginConfiguration> {
		if (!body?.pluginName) {
			throw new BadRequestException('pluginName is required')
		}

		const organizationId = this.getCurrentOrganizationId()
		const plugin = this.pluginManagementService.findLoadedPlugin(body.pluginName, organizationId, false)
		if (!plugin) {
			throw new BadRequestException(`Plugin "${body.pluginName}" is not configurable in the current scope`)
		}
		const defaultTenantId = await this.pluginInstanceService.getDefaultTenantId()
		if (
			resolvePluginLevel(plugin.level ?? plugin.instance?.meta?.level) === PLUGIN_LEVEL.SYSTEM &&
			!canManageSystemPlugins(organizationId, defaultTenantId)
		) {
			throw new BadRequestException(`Plugin "${body.pluginName}" cannot be configured from the current scope`)
		}

		const instance = await this.pluginInstanceService.findOneByPluginName(
			plugin.name,
			organizationId,
			undefined,
			plugin.scopeKey
		)
		const inspected = inspectConfig(
			plugin.name,
			this.pluginInstanceService.getConfig(instance),
			plugin.instance.config
		)
		const configurationStatus = inspected.error
			? PLUGIN_CONFIGURATION_STATUS.INVALID
			: instance?.configurationStatus
		const configurationError = inspected.error ?? instance?.configurationError

		return {
			pluginName: plugin.name,
			config: inspected.config,
			configSchema: resolvePluginConfigSchema(plugin.instance),
			configurationStatus,
			configurationError
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
		const plugin = this.pluginManagementService.findLoadedPlugin(body.pluginName, organizationId, false)
		if (!plugin) {
			throw new BadRequestException(`Plugin "${body.pluginName}" is not configurable in the current scope`)
		}
		const defaultTenantId = await this.pluginInstanceService.getDefaultTenantId()
		if (
			resolvePluginLevel(plugin.level ?? plugin.instance?.meta?.level) === PLUGIN_LEVEL.SYSTEM &&
			!canManageSystemPlugins(organizationId, defaultTenantId)
		) {
			throw new BadRequestException(`Plugin "${body.pluginName}" cannot be configured from the current scope`)
		}

		const existing = await this.pluginInstanceService.findOneByPluginName(
			plugin.name,
			organizationId,
			undefined,
			plugin.scopeKey
		)
		const config = buildConfig(plugin.name, body.config ?? {}, plugin.instance.config)

		await this.pluginInstanceService.upsert({
			tenantId: this.getCurrentTenantId() ?? existing?.tenantId,
			organizationId,
			scopeKey: plugin.scopeKey,
			pluginName: plugin.name,
			packageName: existing?.packageName ?? normalizePluginName(plugin.packageName ?? plugin.name),
			version: existing?.version ?? plugin.instance.meta?.version,
			source: existing?.source ?? 'env',
			level: existing?.level ?? plugin.level ?? resolvePluginLevel(plugin.instance.meta?.level),
			config,
			configurationStatus: PLUGIN_CONFIGURATION_STATUS.VALID,
			configurationError: null
		})

		return {
			pluginName: plugin.name,
			config,
			configSchema: resolvePluginConfigSchema(plugin.instance),
			configurationStatus: PLUGIN_CONFIGURATION_STATUS.VALID,
			configurationError: null
		}
	}

	@Get('marketplace')
	async getMarketplace(
		@Query('targetApp') targetApp?: string,
		@Query('sourceId') sourceId?: string,
		@Query('search') search?: string
	) {
		return this.pluginMarketplaceService.listMarketplace({ targetApp, sourceId, search })
	}

	@Get('marketplace/sources')
	async getMarketplaceSources() {
		return this.pluginMarketplaceService.listSources()
	}

	@Post('marketplace/sources')
	async createMarketplaceSource(@Body() body: PluginMarketplaceSourceInput) {
		return this.pluginMarketplaceService.createSource(body)
	}

	@Post('marketplace/sources/refresh')
	async refreshMarketplaceSources() {
		return this.pluginMarketplaceService.refreshSources()
	}

	@Put('marketplace/sources/:id')
	async updateMarketplaceSource(@Param('id') id: string, @Body() body: PluginMarketplaceSourceInput) {
		return this.pluginMarketplaceService.updateSource(id, body)
	}

	@Delete('marketplace/sources/:id')
	async deleteMarketplaceSource(@Param('id') id: string) {
		return this.pluginMarketplaceService.deleteSource(id)
	}

	@Post('marketplace/sources/:id/refresh')
	async refreshMarketplaceSource(@Param('id') id: string) {
		return this.pluginMarketplaceService.refreshSource(id)
	}

	@Get('marketplace/registry')
	async getMarketplaceRegistryItems() {
		return this.pluginMarketplaceService.listRegistryItems()
	}

	@Get('marketplace/detail')
	async getMarketplacePluginDetail(
		@Query('name') name?: string,
		@Query('targetApp') targetApp?: string,
		@Query('sourceId') sourceId?: string,
		@Query('locale') locale?: string
	) {
		return this.pluginMarketplaceService.getMarketplacePluginDetail(name ?? '', {
			targetApp,
			sourceId,
			locale
		})
	}

	@Post('marketplace/registry')
	async createMarketplaceRegistryItem(@Body() body: PluginMarketplaceRegistryItemInput) {
		return this.pluginMarketplaceService.createRegistryItem(body)
	}

	@Put('marketplace/registry/:id')
	async updateMarketplaceRegistryItem(@Param('id') id: string, @Body() body: PluginMarketplaceRegistryItemInput) {
		return this.pluginMarketplaceService.updateRegistryItem(id, body)
	}

	@Delete('marketplace/registry/:id')
	async deleteMarketplaceRegistryItem(@Param('id') id: string) {
		return this.pluginMarketplaceService.deleteRegistryItem(id)
	}

	@Get('marketplace/:name')
	async getMarketplacePlugin(@Param('name') name: string, @Query('targetApp') targetApp?: string) {
		return this.pluginMarketplaceService.getMarketplacePlugin(name, { targetApp })
	}

	/**
	 * Install a plugin into the current organization's plugin store and persist its configuration.
	 *
	 * @param body
	 * @returns
	 */
	@Post()
	async installPlugin(@Body() body: PluginInstallInput) {
		return this.pluginManagementService.installPlugin(body)
	}

	@Post('archive')
	@ApiConsumes('multipart/form-data')
	@UseInterceptors(FileInterceptor('file', { limits: { fileSize: 100 * 1024 * 1024 } }))
	async installPluginArchive(@UploadedFile() file: UploadedPluginArchiveFile | undefined, @Body() body: unknown) {
		if (!file?.buffer?.length) {
			throw new BadRequestException('file is required')
		}

		return this.pluginManagementService.installArchivePlugin(file, {
			config: parseOptionalObject(readParsedJsonObjectProperty(body, 'config'), 'config') ?? undefined
		})
	}

	@Post('by-names')
	async getByNames(@Body() body: { names: string[] }): Promise<IPluginDescriptor[]> {
		return this.listVisiblePlugins(body.names)
	}

	@Post('latest-versions')
	async getLatestVersions(@Body() body?: { names?: string[] }): Promise<IPluginLatestVersionStatus[]> {
		return this.listLatestPluginVersions(body?.names)
	}

	@Post('update')
	async updatePlugin(@Body() body: { pluginName: string }) {
		if (!body?.pluginName) {
			throw new BadRequestException('pluginName is required')
		}

		return this.commandBus.execute(new UpdatePluginCommand(body.pluginName))
	}

	@Post('refresh')
	async refreshPlugin(@Body() body: { pluginName: string }) {
		if (!body?.pluginName) {
			throw new BadRequestException('pluginName is required')
		}

		return this.pluginManagementService.refreshCodePlugin(body.pluginName)
	}

	@Delete('uninstall')
	async uninstall(@Body() body: { names: string[]; organizationId?: string; scopeKey?: string }) {
		if (!body?.names || body.names.length === 0) {
			throw new BadRequestException(t('server:Error.PluginNamesRequired'))
		}
		await this.pluginManagementService.uninstallByNamesWithGuard(body.names, body.organizationId, body.scopeKey)

		return { success: true }
	}

	private getCurrentOrganizationId() {
		return RequestContext.getOrganizationId() ?? GLOBAL_ORGANIZATION_SCOPE
	}

	private async listVisiblePlugins(names?: string[]) {
		const organizationId = this.getCurrentOrganizationId()
		const tenantId = this.getCurrentTenantId()
		const defaultTenantId = await this.pluginInstanceService.getDefaultTenantId()
		const organizationScopeKey = this.getScopeKey(organizationId, tenantId)
		const globalScopeKey = resolveTenantGlobalScopeKey(tenantId)
		const normalizedNames = names?.length ? new Set(names.map((name) => normalizePluginName(name))) : null

		const visiblePlugins = this.loadedPlugins
			.filter(
				(plugin) =>
					(plugin.scopeKey ?? plugin.organizationId) === organizationScopeKey ||
					(organizationId !== GLOBAL_ORGANIZATION_SCOPE &&
						(plugin.scopeKey ?? plugin.organizationId) === globalScopeKey) ||
					(plugin.scopeKey ?? plugin.organizationId) === SYSTEM_GLOBAL_SCOPE
			)
			.filter(
				(plugin) =>
					!normalizedNames ||
					this.matchesNames(normalizedNames, plugin.name, plugin.packageName, plugin.instance?.meta?.name)
			)
		const loadedScopeStates = this.buildLoadedPluginScopeStates(
			visiblePlugins,
			organizationId,
			organizationScopeKey,
			globalScopeKey
		)
		const loadedDescriptors = await Promise.all(
			visiblePlugins.map((plugin) =>
				this.toPluginDescriptor(plugin, organizationId, loadedScopeStates, defaultTenantId)
			)
		)
		const loadedKeys = new Set(
			visiblePlugins.flatMap((plugin) =>
				this.createDescriptorLookupKeys(
					plugin.scopeKey ?? this.getScopeKey(plugin.organizationId, plugin.tenantId ?? tenantId),
					plugin.name,
					plugin.packageName
				)
			)
		)
		const pluginInstances = await this.pluginInstanceService.findVisibleInOrganization(organizationId)
		const failedDescriptors = pluginInstances
			.filter(
				(plugin) =>
					!normalizedNames || this.matchesNames(normalizedNames, plugin.pluginName, plugin.packageName)
			)
			.filter(
				(plugin) =>
					!this.createDescriptorLookupKeys(
						plugin.scopeKey ??
							this.getScopeKey(
								plugin.organizationId ?? GLOBAL_ORGANIZATION_SCOPE,
								plugin.tenantId ?? tenantId
							),
						plugin.pluginName,
						plugin.packageName
					).some((key) => loadedKeys.has(key))
			)
			.map((plugin) => this.toFailedPluginDescriptor(plugin, organizationId, loadedScopeStates, defaultTenantId))

		return [...loadedDescriptors, ...failedDescriptors]
	}

	private async toPluginDescriptor(
		plugin: LoadedPluginRecord,
		organizationId: string,
		loadedScopeStates: Map<string, LoadedPluginScopeState>,
		defaultTenantId?: string | null
	): Promise<IPluginDescriptor> {
		const packageName = normalizePluginName(plugin.packageName ?? plugin.name)
		const scope = plugin.organizationId ?? GLOBAL_ORGANIZATION_SCOPE
		const scopeKey = plugin.scopeKey ?? this.getScopeKey(scope, plugin.tenantId ?? this.getCurrentTenantId())
		const level = resolvePluginLevel(plugin.level ?? plugin.instance?.meta?.level)
		const configSchema = resolvePluginConfigSchema(plugin.instance)
		const canUninstall = canUninstallPlugin(plugin, organizationId, defaultTenantId)
		const canUpdate =
			canUpdatePlugin(plugin, organizationId, defaultTenantId) && supportsNpmRegistryUpdates(plugin.source)
		const canConfigure =
			level === PLUGIN_LEVEL.SYSTEM
				? canManageSystemPlugins(organizationId, defaultTenantId) && !!configSchema
				: plugin.organizationId === organizationId && !!configSchema
		const instance = await this.pluginInstanceService.findOneByPluginName(
			plugin.name,
			plugin.organizationId,
			plugin.tenantId,
			scopeKey
		)
		const inspected = inspectConfig(
			plugin.name,
			this.pluginInstanceService.getConfig(instance),
			plugin.instance.config
		)
		const configurationStatus = inspected.error
			? PLUGIN_CONFIGURATION_STATUS.INVALID
			: instance?.configurationStatus
		const configurationError = inspected.error ?? instance?.configurationError
		const workspacePath = getCodeWorkspacePath(instance?.sourceConfig)
		const scopeSemantics = this.resolveDescriptorScopeSemantics(
			this.getNormalizedPluginName(plugin.name, plugin.packageName, plugin.instance?.meta?.name),
			scopeKey,
			organizationId,
			loadedScopeStates
		)
		const componentSummary = summarizePluginComponents(
			this.pluginManagementService.readLoadedPluginBundleComponents(plugin)
		)
		const meta = plugin.instance.meta

		return {
			organizationId: scope,
			scopeKey,
			name: plugin.name,
			meta: {
				...meta,
				artifactNamespace:
					meta.artifactNamespace ??
					resolvePluginArtifactNamespace(plugin.packageName ?? meta.name ?? plugin.name)
			},
			packageName,
			source: plugin.source,
			currentVersion: plugin.instance.meta?.version,
			latestVersion: undefined,
			isGlobal: scope === GLOBAL_ORGANIZATION_SCOPE,
			level,
			canConfigure,
			canRefresh: plugin.source === 'code' && !!workspacePath && canUninstall,
			canUninstall,
			canUpdate,
			hasUpdate: false,
			configSchema,
			configurationStatus,
			configurationError,
			sdkCompatibilityWarnings: plugin.sdkCompatibilityWarnings ?? [],
			loadStatus: PLUGIN_LOAD_STATUS.LOADED,
			loadError: null,
			effectiveInCurrentScope: scopeSemantics.effectiveInCurrentScope,
			scopeRelation: scopeSemantics.scopeRelation,
			componentSummary
		}
	}

	private toFailedPluginDescriptor(
		plugin: Awaited<ReturnType<PluginInstanceService['findVisibleInOrganization']>>[number],
		organizationId: string,
		loadedScopeStates: Map<string, LoadedPluginScopeState>,
		defaultTenantId?: string | null
	): IPluginDescriptor {
		const scope = plugin.organizationId ?? GLOBAL_ORGANIZATION_SCOPE
		const scopeKey = plugin.scopeKey ?? this.getScopeKey(scope, plugin.tenantId ?? this.getCurrentTenantId())
		const failure = findPluginLoadFailure(scopeKey, plugin.pluginName, plugin.packageName)
		const loadError =
			failure?.error ??
			'This plugin is registered in the database but could not be loaded by the current server process.'
		const workspacePath = getCodeWorkspacePath(plugin.sourceConfig)
		const scopeSemantics = this.resolveDescriptorScopeSemantics(
			this.getNormalizedPluginName(plugin.pluginName, plugin.packageName),
			scopeKey,
			organizationId,
			loadedScopeStates
		)
		const canUninstall = canUninstallPlugin(
			{ organizationId: scope, level: plugin.level },
			organizationId,
			defaultTenantId
		)

		return {
			organizationId: scope,
			scopeKey,
			name: plugin.pluginName,
			meta: {
				name: plugin.packageName ?? plugin.pluginName,
				version: plugin.version ?? '',
				artifactNamespace: resolvePluginArtifactNamespace(plugin.packageName ?? plugin.pluginName),
				level: plugin.level,
				category: 'integration',
				displayName: plugin.pluginName,
				description: 'Plugin metadata is unavailable because the plugin failed to load.',
				keywords: [],
				author: '-'
			},
			packageName: plugin.packageName,
			source: plugin.source,
			currentVersion: plugin.version,
			latestVersion: undefined,
			isGlobal: !plugin.organizationId,
			level: plugin.level ?? PLUGIN_LEVEL.ORGANIZATION,
			canConfigure: false,
			canRefresh: plugin.source === 'code' && !!workspacePath && canUninstall,
			canUninstall,
			canUpdate: false,
			hasUpdate: false,
			configSchema: undefined,
			configurationStatus: plugin.configurationStatus,
			configurationError: plugin.configurationError,
			sdkCompatibilityWarnings: [],
			loadStatus: PLUGIN_LOAD_STATUS.FAILED,
			loadError,
			effectiveInCurrentScope: scopeSemantics.effectiveInCurrentScope,
			scopeRelation: scopeSemantics.scopeRelation
		}
	}

	private buildLoadedPluginScopeStates(
		plugins: LoadedPluginRecord[],
		organizationId: string,
		organizationScopeKey: string,
		globalScopeKey: string
	) {
		const states = new Map<string, LoadedPluginScopeState>()

		for (const plugin of plugins) {
			const normalizedName = this.getNormalizedPluginName(
				plugin.name,
				plugin.packageName,
				plugin.instance?.meta?.name
			)
			if (!normalizedName) {
				continue
			}

			const state = states.get(normalizedName) ?? {
				effectiveScope: null,
				hasLoadedGlobal: false,
				hasLoadedOrganization: false,
				hasLoadedSystem: false
			}
			const scope = plugin.scopeKey ?? plugin.organizationId ?? GLOBAL_ORGANIZATION_SCOPE

			if (scope === globalScopeKey) {
				state.hasLoadedGlobal = true
			} else if (scope === organizationScopeKey) {
				state.hasLoadedOrganization = true
			} else if (scope === SYSTEM_GLOBAL_SCOPE) {
				state.hasLoadedSystem = true
			}

			state.effectiveScope = state.hasLoadedOrganization
				? organizationScopeKey
				: state.hasLoadedGlobal
					? globalScopeKey
					: state.hasLoadedSystem
						? SYSTEM_GLOBAL_SCOPE
						: null
			states.set(normalizedName, state)
		}

		return states
	}

	private resolveDescriptorScopeSemantics(
		normalizedName: string,
		scopeKey: string,
		organizationId: string,
		loadedScopeStates: Map<string, LoadedPluginScopeState>
	): Pick<IPluginDescriptor, 'effectiveInCurrentScope' | 'scopeRelation'> {
		const state = normalizedName ? loadedScopeStates.get(normalizedName) : null
		if (!state) {
			return {
				effectiveInCurrentScope: false,
				scopeRelation: 'none'
			}
		}

		if (organizationId === GLOBAL_ORGANIZATION_SCOPE) {
			return {
				effectiveInCurrentScope: scopeKey === state.effectiveScope,
				scopeRelation: 'none'
			}
		}

		const organizationScopeKey = this.getScopeKey(organizationId, this.getCurrentTenantId())
		const globalScopeKey = resolveTenantGlobalScopeKey(this.getCurrentTenantId())
		const effectiveInCurrentScope = state.effectiveScope === scopeKey
		let scopeRelation: PluginScopeRelation = 'none'

		if (scopeKey === organizationScopeKey && effectiveInCurrentScope && state.hasLoadedGlobal) {
			scopeRelation = 'overrides-global'
		} else if (scopeKey === globalScopeKey && state.effectiveScope === organizationScopeKey) {
			scopeRelation = 'shadowed-by-organization'
		}

		return {
			effectiveInCurrentScope,
			scopeRelation
		}
	}

	private getNormalizedPluginName(...candidates: Array<string | undefined>) {
		for (const candidate of candidates) {
			if (typeof candidate === 'string' && candidate) {
				return normalizePluginName(candidate)
			}
		}
		return ''
	}

	private createDescriptorLookupKeys(scope: string, ...names: Array<string | undefined>) {
		return names
			.filter((name): name is string => typeof name === 'string' && !!name)
			.map((name) => this.buildPluginScopeKey(scope, name))
	}

	private buildPluginScopeKey(scope: string | undefined | null, name: string) {
		return `${scope ?? GLOBAL_ORGANIZATION_SCOPE}:${normalizePluginName(name)}`
	}

	private getScopeKey(organizationId: string, tenantId?: string | null) {
		return organizationId === GLOBAL_ORGANIZATION_SCOPE ? resolveTenantGlobalScopeKey(tenantId) : organizationId
	}

	private getCurrentTenantId() {
		return RequestContext.getScope()?.tenantId ?? RequestContext.currentTenantId()
	}

	private matchesNames(names: Set<string>, ...candidates: Array<string | undefined>) {
		return candidates.some(
			(candidate) => typeof candidate === 'string' && !!candidate && names.has(normalizePluginName(candidate))
		)
	}

	private async resolveLatestPluginVersion(packageName: string): Promise<string | undefined> {
		return this.queryBus.execute(new ResolveLatestPluginVersionQuery(packageName))
	}

	private async listLatestPluginVersions(names?: string[]): Promise<IPluginLatestVersionStatus[]> {
		const visiblePlugins = await this.listVisiblePlugins(names)
		const updateablePlugins = visiblePlugins.filter(
			(plugin) => plugin.canUpdate && plugin.loadStatus === PLUGIN_LOAD_STATUS.LOADED
		)

		const latestVersionByPackageName = new Map<string, string | undefined>()
		const uniquePackageNames = Array.from(
			new Set(
				updateablePlugins
					.map((plugin) => plugin.packageName ?? plugin.name)
					.filter((packageName): packageName is string => typeof packageName === 'string' && !!packageName)
			)
		)

		await Promise.all(
			uniquePackageNames.map(async (packageName) => {
				latestVersionByPackageName.set(packageName, await this.resolveLatestPluginVersion(packageName))
			})
		)

		return updateablePlugins.map((plugin) => {
			const packageName = plugin.packageName ?? plugin.name
			const latestVersion = latestVersionByPackageName.get(packageName)

			return {
				organizationId: plugin.organizationId,
				name: plugin.name,
				packageName: plugin.packageName,
				latestVersion,
				hasUpdate: hasNewerVersion(plugin.currentVersion, latestVersion)
			}
		})
	}
}

function summarizePluginComponents(components: Array<{ componentType: PluginComponentType }>) {
	const summary: PluginComponentSummary = {
		total: 0,
		skills: 0,
		mcpServers: 0,
		apps: 0,
		hooks: 0
	}

	for (const component of components) {
		if (component.componentType === PLUGIN_COMPONENT_TYPE.SKILL) {
			summary.skills += 1
		} else if (component.componentType === PLUGIN_COMPONENT_TYPE.MCP_SERVER) {
			summary.mcpServers += 1
		} else if (component.componentType === PLUGIN_COMPONENT_TYPE.APP) {
			summary.apps += 1
		} else if (component.componentType === PLUGIN_COMPONENT_TYPE.HOOK) {
			summary.hooks += 1
		}
	}
	summary.total = summary.skills + summary.mcpServers + summary.apps + summary.hooks
	return summary
}

/**
 * Derive the descriptor fallback namespace for installed-plugin responses.
 * Runtime meta wins earlier; this keeps older installed plugins visible without forcing a hard declaration.
 */
function resolvePluginArtifactNamespace(packageName?: string | null) {
	if (!packageName) {
		return undefined
	}
	try {
		return derivePluginArtifactNamespace(packageName)
	} catch {
		return undefined
	}
}

function parseOptionalObject(value: unknown, fieldName: string): ParsedJsonObject | undefined {
	if (value === undefined || value === null || value === '') {
		return undefined
	}

	const parsed = typeof value === 'string' ? parseJson(value, fieldName) : value
	if (!isParsedJsonObject(parsed)) {
		throw new BadRequestException(`${fieldName} must be a JSON object`)
	}

	return parsed
}

function parseJson(value: string, fieldName: string): unknown {
	try {
		return JSON.parse(value)
	} catch {
		throw new BadRequestException(`${fieldName} must be valid JSON`)
	}
}

function isParsedJsonObject(value: unknown): value is ParsedJsonObject {
	return !!value && typeof value === 'object' && !Array.isArray(value)
}

function readParsedJsonObjectProperty(value: unknown, key: string): unknown {
	return isParsedJsonObject(value) ? value[key] : undefined
}
