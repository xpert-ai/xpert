import {
	BadRequestException,
	Body,
	Controller,
	Delete,
	Get,
	Inject,
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
	IPluginDescriptor,
	IPluginLatestVersionStatus,
	PLUGIN_CONFIGURATION_STATUS,
	PLUGIN_LOAD_STATUS,
	PLUGIN_LEVEL,
	PluginScopeRelation,
	RolesEnum
} from '@xpert-ai/contracts'
import { GLOBAL_ORGANIZATION_SCOPE, RequestContext } from '@xpert-ai/plugin-sdk'
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
import { canUninstallPlugin, canUpdatePlugin, hasNewerVersion, supportsNpmRegistryUpdates } from './plugin-update.utils'
import { ResolveLatestPluginVersionQuery } from './queries'
import { UpdatePluginCommand } from './commands'
import { UploadedPluginArchiveFile } from './plugin-archive'
import { LOADED_PLUGINS, LoadedPluginRecord, PluginInstallInput, normalizePluginName } from './types'

type LoadedPluginScopeState = {
	effectiveScope: string | null
	hasLoadedGlobal: boolean
	hasLoadedOrganization: boolean
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

		const instance = await this.pluginInstanceService.findOneByPluginName(plugin.name, organizationId)
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
	async installPluginArchive(
		@UploadedFile() file: UploadedPluginArchiveFile | undefined,
		@Body() body: Record<string, unknown>
	) {
		if (!file?.buffer?.length) {
			throw new BadRequestException('file is required')
		}

		return this.pluginManagementService.installArchivePlugin(file, {
			config: parseOptionalObject(body?.config, 'config') ?? undefined
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
	async uninstall(@Body() body: { names: string[]; organizationId?: string }) {
		if (!body?.names || body.names.length === 0) {
			throw new BadRequestException(t('server:Error.PluginNamesRequired'))
		}
		await this.pluginManagementService.uninstallByNamesWithGuard(body.names, body.organizationId)

		return { success: true }
	}

	private getCurrentOrganizationId() {
		return RequestContext.getOrganizationId() ?? GLOBAL_ORGANIZATION_SCOPE
	}

	private async listVisiblePlugins(names?: string[]) {
		const organizationId = this.getCurrentOrganizationId()
		const isSuperAdmin = RequestContext.hasRole(RolesEnum.SUPER_ADMIN)
		const normalizedNames = names?.length ? new Set(names.map((name) => normalizePluginName(name))) : null

		const visiblePlugins = this.loadedPlugins
			.filter(
				(plugin) =>
					plugin.organizationId === organizationId || plugin.organizationId === GLOBAL_ORGANIZATION_SCOPE
			)
			.filter((plugin) => isSuperAdmin || plugin.level !== PLUGIN_LEVEL.SYSTEM)
			.filter(
				(plugin) =>
					!normalizedNames ||
					this.matchesNames(normalizedNames, plugin.name, plugin.packageName, plugin.instance?.meta?.name)
			)
		const loadedScopeStates = this.buildLoadedPluginScopeStates(visiblePlugins, organizationId)
		const loadedDescriptors = await Promise.all(
			visiblePlugins.map((plugin) => this.toPluginDescriptor(plugin, organizationId, loadedScopeStates))
		)
		const loadedKeys = new Set(
			visiblePlugins.flatMap((plugin) =>
				this.createDescriptorLookupKeys(plugin.organizationId, plugin.name, plugin.packageName)
			)
		)
		const pluginInstances = await this.pluginInstanceService.findVisibleInOrganization(organizationId)
		const failedDescriptors = pluginInstances
			.filter((plugin) => isSuperAdmin || plugin.level !== PLUGIN_LEVEL.SYSTEM)
			.filter(
				(plugin) =>
					!normalizedNames || this.matchesNames(normalizedNames, plugin.pluginName, plugin.packageName)
			)
			.filter(
				(plugin) =>
					!this.createDescriptorLookupKeys(
						plugin.organizationId ?? GLOBAL_ORGANIZATION_SCOPE,
						plugin.pluginName,
						plugin.packageName
					).some((key) => loadedKeys.has(key))
			)
			.map((plugin) => this.toFailedPluginDescriptor(plugin, organizationId, loadedScopeStates))

		return [...loadedDescriptors, ...failedDescriptors]
	}

	private async toPluginDescriptor(
		plugin: LoadedPluginRecord,
		organizationId: string,
		loadedScopeStates: Map<string, LoadedPluginScopeState>
	): Promise<IPluginDescriptor> {
		const packageName = normalizePluginName(plugin.packageName ?? plugin.name)
		const scope = plugin.organizationId ?? GLOBAL_ORGANIZATION_SCOPE
		const canUpdate = canUpdatePlugin(plugin, organizationId) && supportsNpmRegistryUpdates(plugin.source)
		const instance = await this.pluginInstanceService.findOneByPluginName(plugin.name, plugin.organizationId)
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
			scope,
			organizationId,
			loadedScopeStates
		)

		return {
			organizationId: scope,
			name: plugin.name,
			meta: plugin.instance.meta,
			packageName,
			source: plugin.source,
			currentVersion: plugin.instance.meta?.version,
			latestVersion: undefined,
			isGlobal: scope === GLOBAL_ORGANIZATION_SCOPE,
			level: plugin.level ?? PLUGIN_LEVEL.ORGANIZATION,
			canConfigure: plugin.organizationId === organizationId && !!resolvePluginConfigSchema(plugin.instance),
			canRefresh: plugin.source === 'code' && !!workspacePath && canUninstallPlugin(plugin, organizationId),
			canUninstall: canUninstallPlugin(plugin, organizationId),
			canUpdate,
			hasUpdate: false,
			configSchema: resolvePluginConfigSchema(plugin.instance),
			configurationStatus,
			configurationError,
			sdkCompatibilityWarnings: plugin.sdkCompatibilityWarnings ?? [],
			loadStatus: PLUGIN_LOAD_STATUS.LOADED,
			loadError: null,
			effectiveInCurrentScope: scopeSemantics.effectiveInCurrentScope,
			scopeRelation: scopeSemantics.scopeRelation
		}
	}

	private toFailedPluginDescriptor(
		plugin: Awaited<ReturnType<PluginInstanceService['findVisibleInOrganization']>>[number],
		organizationId: string,
		loadedScopeStates: Map<string, LoadedPluginScopeState>
	): IPluginDescriptor {
		const scope = plugin.organizationId ?? GLOBAL_ORGANIZATION_SCOPE
		const failure = findPluginLoadFailure(scope, plugin.pluginName, plugin.packageName)
		const loadError =
			failure?.error ??
			'This plugin is registered in the database but could not be loaded by the current server process.'
		const workspacePath = getCodeWorkspacePath(plugin.sourceConfig)
		const scopeSemantics = this.resolveDescriptorScopeSemantics(
			this.getNormalizedPluginName(plugin.pluginName, plugin.packageName),
			scope,
			organizationId,
			loadedScopeStates
		)

		return {
			organizationId: scope,
			name: plugin.pluginName,
			meta: {
				name: plugin.packageName ?? plugin.pluginName,
				version: plugin.version ?? '',
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
			canRefresh:
				plugin.source === 'code' &&
				!!workspacePath &&
				canUninstallPlugin({ organizationId: scope, level: plugin.level }, organizationId),
			canUninstall: true, // allow uninstalling failed plugins to recover from load failures, even if they would normally be protected from uninstallation based on their level
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

	private buildLoadedPluginScopeStates(plugins: LoadedPluginRecord[], organizationId: string) {
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
				hasLoadedOrganization: false
			}
			const scope = plugin.organizationId ?? GLOBAL_ORGANIZATION_SCOPE

			if (scope === GLOBAL_ORGANIZATION_SCOPE) {
				state.hasLoadedGlobal = true
			} else if (scope === organizationId) {
				state.hasLoadedOrganization = true
			}

			state.effectiveScope = state.hasLoadedOrganization
				? organizationId
				: state.hasLoadedGlobal
					? GLOBAL_ORGANIZATION_SCOPE
					: null
			states.set(normalizedName, state)
		}

		return states
	}

	private resolveDescriptorScopeSemantics(
		normalizedName: string,
		scope: string,
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
				effectiveInCurrentScope:
					scope === GLOBAL_ORGANIZATION_SCOPE && state.effectiveScope === GLOBAL_ORGANIZATION_SCOPE,
				scopeRelation: 'none'
			}
		}

		const effectiveInCurrentScope = state.effectiveScope === scope
		let scopeRelation: PluginScopeRelation = 'none'

		if (scope === organizationId && effectiveInCurrentScope && state.hasLoadedGlobal) {
			scopeRelation = 'overrides-global'
		} else if (scope === GLOBAL_ORGANIZATION_SCOPE && state.effectiveScope === organizationId) {
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

function parseOptionalObject(value: unknown, fieldName: string): Record<string, unknown> | undefined {
	if (value === undefined || value === null || value === '') {
		return undefined
	}

	const parsed = typeof value === 'string' ? parseJson(value, fieldName) : value
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
		throw new BadRequestException(`${fieldName} must be a JSON object`)
	}

	return parsed as Record<string, unknown>
}

function parseJson(value: string, fieldName: string): unknown {
	try {
		return JSON.parse(value)
	} catch {
		throw new BadRequestException(`${fieldName} must be valid JSON`)
	}
}
