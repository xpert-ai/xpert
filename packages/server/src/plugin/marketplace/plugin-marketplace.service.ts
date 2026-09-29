import { BadRequestException, Inject, Injectable, NotFoundException, type OnModuleDestroy } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import {
	type PluginMarketplaceDetailItem,
	type PluginMarketplaceItem,
	type PluginMarketplaceResponse,
	type PluginMarketplaceSourceInput,
	type PluginMarketplaceSourceResponse,
	PluginMeta
} from '@xpert-ai/contracts'
import {
	GLOBAL_ORGANIZATION_SCOPE,
	RequestContext,
	SYSTEM_GLOBAL_SCOPE,
	resolveTenantGlobalScopeKey
} from '@xpert-ai/plugin-sdk'

import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { PluginMarketplaceSharedCache } from './plugin-marketplace-shared-cache'
import { PluginMarketplaceCatalogs } from './plugin-marketplace-catalogs'
import { PluginMarketplaceAssets } from './plugin-marketplace-assets'
import { IsNull, Repository } from 'typeorm'

import { PluginInstanceService } from '../plugin-instance.service'
import { PluginMarketplaceRegistryItem } from './plugin-marketplace-registry-item.entity'
import {
	PLUGIN_MARKETPLACE_SOURCE_TYPES,
	PluginMarketplaceSource,
	PluginMarketplaceSourceType
} from './plugin-marketplace-source.entity'
import { LOADED_PLUGINS, LoadedPluginRecord, normalizePluginName } from '../types'

import {
	execFile,
	BUILTIN_SOURCE_ID,
	BUILTIN_SOURCE_CACHE_NAME,
	PLATFORM_REGISTRY_SOURCE_ID,
	PLATFORM_REGISTRY_SOURCE_NAME,
	BUILTIN_MARKETPLACE_URL,
	MarketplaceSourceRecord,
	MarketplaceRegistryPlugin,
	NormalizedMarketplaceCatalog,
	InstalledPluginContext,
	PluginMarketplaceListQuery,
	PluginMarketplaceDetailQuery
} from './plugin-marketplace.types'
import { PluginMarketplaceMetadata } from './plugin-marketplace-metadata'
import { PluginMarketplacePackages } from './plugin-marketplace-packages'
import { PluginMarketplaceRegistry } from './plugin-marketplace-registry'

@Injectable()
export class PluginMarketplaceService implements OnModuleDestroy {
	private readonly metadata: PluginMarketplaceMetadata
	private readonly packages: PluginMarketplacePackages
	readonly registry: PluginMarketplaceRegistry
	private readonly catalogs: PluginMarketplaceCatalogs
	private readonly assets: PluginMarketplaceAssets
	private readonly publicBuiltinSource: MarketplaceSourceRecord
	constructor(
		@InjectRepository(PluginMarketplaceSource)
		protected readonly sourceRepository: Repository<PluginMarketplaceSource>,
		@InjectRepository(PluginMarketplaceRegistryItem)
		registryRepository: Repository<PluginMarketplaceRegistryItem>,
		@Inject(LOADED_PLUGINS)
		protected readonly loadedPlugins: Array<LoadedPluginRecord>,
		protected readonly pluginInstanceService: PluginInstanceService,
		shared?: PluginMarketplaceSharedCache
	) {
		this.metadata = new PluginMarketplaceMetadata(loadedPlugins)
		this.assets = new PluginMarketplaceAssets(shared)
		this.packages = new PluginMarketplacePackages(this.metadata, shared)
		this.registry = new PluginMarketplaceRegistry(registryRepository, this.metadata, this.packages, shared)
		this.publicBuiltinSource = this.createBuiltinSourceRecord()
		this.catalogs = new PluginMarketplaceCatalogs(
			sourceRepository,
			this.metadata,
			(source, enrich) => this.fetchSourceCatalog(source, enrich),
			shared
		)
	}
	async onModuleDestroy() {
		await this.packages.close()
	}

	async listMarketplace(query: PluginMarketplaceListQuery = {}): Promise<PluginMarketplaceResponse> {
		const sources = await this.getSourceRecords()
		const enabledSources = this.filterSources(sources, query.sourceId).filter((source) => source.enabled !== false)
		const includePlatformRegistry = this.registry.includesPlatformRegistry(query.sourceId)
		const installedContext = await this.buildInstalledContext()
		const errors: Array<{ sourceId: string; sourceName: string; message: string }> = []
		const platformCatalog = includePlatformRegistry
			? await this.registry.loadPlatformRegistryCatalog(query.targetApp)
			: null
		const sourceCatalogs = await Promise.all(
			enabledSources.map(async (source) => {
				try {
					return await this.loadCatalog(source)
				} catch (error) {
					const message = this.metadata.toErrorMessage(error)
					errors.push({
						sourceId: source.id,
						sourceName: source.name,
						message
					})
					this.metadata.logger.warn(`Failed to load plugin marketplace source "${source.name}": ${message}`)
					return null
				}
			})
		)
		const catalogs = [platformCatalog, ...sourceCatalogs].filter(
			(catalog): catalog is NormalizedMarketplaceCatalog => !!catalog
		)
		const byName = new Map<string, PluginMarketplaceItem>()

		for (const catalog of catalogs) {
			for (const plugin of catalog.plugins) {
				const enriched = this.metadata.mergeInstalledPluginMeta(plugin, installedContext.loadedMetaByName)
				if (!this.metadata.matchesTargetApp(enriched, query.targetApp)) {
					continue
				}
				if (!this.metadata.matchesSearch(enriched, query.search)) {
					continue
				}

				const normalizedName = normalizePluginName(enriched.name)
				if (!byName.has(normalizedName)) {
					byName.set(
						normalizedName,
						this.metadata.toMarketplaceItem(enriched, query.targetApp, installedContext)
					)
				}
			}
		}

		const items = Array.from(byName.values())

		return {
			updatedAt: this.metadata.getLatestCatalogDate(catalogs),
			total: items.length,
			items: query.view === 'summary' ? await this.assets.summaries(items, query.targetApp) : items,
			official: this.metadata.mergeCatalogNames(catalogs, 'official'),
			partner: this.metadata.mergeCatalogNames(catalogs, 'partner'),
			community: this.metadata.mergeCatalogNames(catalogs, 'community'),
			sources: this.getMarketplaceSourceResponses(sources),
			errors
		}
	}

	async listPublicMarketplace(
		query: Pick<PluginMarketplaceListQuery, 'targetApp'> = {}
	): Promise<PluginMarketplaceResponse> {
		const catalog = await this.loadPublicBuiltinCatalog()
		const installedContext: InstalledPluginContext = {
			installedNames: new Set<string>(),
			loadedMetaByName: new Map<string, PluginMeta>()
		}
		const byName = new Map<string, PluginMarketplaceItem>()

		for (const plugin of catalog.plugins) {
			if (!this.metadata.matchesTargetApp(plugin, query.targetApp)) {
				continue
			}

			const normalizedName = normalizePluginName(plugin.name)
			if (!byName.has(normalizedName)) {
				const item = this.metadata.toMarketplaceItem(plugin, query.targetApp, installedContext)
				byName.set(normalizedName, this.metadata.toPublicMarketplaceItem(item))
			}
		}

		const items = Array.from(byName.values())
		return {
			updatedAt: catalog.updatedAt,
			total: items.length,
			items,
			official: catalog.official,
			partner: catalog.partner,
			community: catalog.community,
			sources: [],
			errors: []
		}
	}

	async getMarketplacePlugin(name: string, query: PluginMarketplaceListQuery = {}) {
		const plugin = await this.findMarketplacePlugin(name, query)
		if (!plugin) throw new NotFoundException(`Plugin "${name}" was not found in the marketplace`)
		return plugin
	}

	async getMarketplacePluginIcon(name: string, query: PluginMarketplaceListQuery = {}) {
		const { loadedMetaByName: loadedMeta } = this.buildLoadedContext()
		const plugin = await this.findMarketplaceRecord(name, query, loadedMeta)
		if (!plugin) throw new NotFoundException(`Plugin "${name}" was not found in the marketplace`)
		return this.metadata.mergeInstalledPluginMeta(plugin, loadedMeta)
	}

	async getMarketplaceIconAsset(name: string, hash: string, query: PluginMarketplaceListQuery = {}) {
		// Recheck source/plugin visibility on every request before serving even a historical hash.
		const item = await this.getMarketplacePluginIcon(name, query)
		return this.assets.get({ ...item, name: item.name, sourceId: item.sourceId }, hash, query.targetApp)
	}

	async getMarketplacePluginDetail(
		name: string,
		query: PluginMarketplaceDetailQuery = {}
	): Promise<PluginMarketplaceDetailItem> {
		if (!this.metadata.normalizeOptionalString(name)) {
			throw new BadRequestException('name is required')
		}

		const marketplacePlugin = await this.findMarketplacePlugin(name, query)
		const plugin = marketplacePlugin ?? this.toMarketplaceItemFromLoadedPlugin(name, query)

		if (!plugin) {
			throw new NotFoundException(`Plugin "${name}" was not found`)
		}

		const readme = await this.packages.resolveMarketplaceReadme(plugin, query)
		const availableReadmeLocales =
			readme.source === 'description'
				? []
				: this.metadata.uniqueStrings([
						...(await this.packages.resolveAvailableReadmeLocales(plugin)),
						readme.locale
					])
		return {
			...plugin,
			readme,
			availableReadmeLocales
		}
	}

	async getMarketplacePluginContent(name: string, query: PluginMarketplaceListQuery = {}) {
		const context = await this.buildInstalledContext()
		const plugin = await this.findMarketplaceRecord(name, query, context.loadedMetaByName)
		if (!plugin) throw new NotFoundException(`Plugin "${name}" was not found in the marketplace`)
		const enriched = await this.packages.hydratePluginWithNpmBundleManifest(plugin)
		return this.metadata.toMarketplaceItem(
			this.metadata.mergeInstalledPluginMeta(enriched, context.loadedMetaByName),
			query.targetApp,
			context
		)
	}

	private async findMarketplacePlugin(name: string, query: PluginMarketplaceListQuery = {}) {
		const context = await this.buildInstalledContext()
		const plugin = await this.findMarketplaceRecord(name, query, context.loadedMetaByName)
		if (!plugin) return null
		return this.metadata.toMarketplaceItem(
			this.metadata.mergeInstalledPluginMeta(plugin, context.loadedMetaByName),
			query.targetApp,
			context
		)
	}

	private async findMarketplaceRecord(
		name: string,
		query: PluginMarketplaceListQuery,
		loadedMeta: Map<string, PluginMeta>
	) {
		const normalizedName = normalizePluginName(name)
		const find = (catalog: NormalizedMarketplaceCatalog) =>
			catalog.plugins.find((plugin) => {
				if (!this.marketplaceItemMatchesName(plugin, normalizedName)) return false
				const enriched = this.metadata.mergeInstalledPluginMeta(plugin, loadedMeta)
				return (
					this.metadata.matchesTargetApp(enriched, query.targetApp) &&
					this.metadata.matchesSearch(enriched, query.search)
				)
			})
		if (this.registry.includesPlatformRegistry(query.sourceId)) {
			const plugin = find(await this.registry.loadPlatformRegistryCatalog(query.targetApp))
			if (plugin) return plugin
		}
		const sources = await this.getSourceRecords(query.sourceId)
		for (const source of sources) {
			if (source.enabled === false) continue
			try {
				const plugin = find(await this.loadCatalog(source))
				if (plugin) return plugin
			} catch (error) {
				this.metadata.logger.warn(
					`Failed to load marketplace source "${source.name}": ${this.metadata.toErrorMessage(error)}`
				)
			}
		}
		return null
	}

	private marketplaceItemMatchesName(
		item: Pick<PluginMarketplaceItem, 'name' | 'packageName'>,
		normalizedName: string
	) {
		return [item.name, item.packageName]
			.map((value) => this.metadata.normalizeOptionalString(value))
			.filter((value): value is string => !!value)
			.some((value) => normalizePluginName(value) === normalizedName)
	}

	private toMarketplaceItemFromLoadedPlugin(
		name: string,
		query: PluginMarketplaceListQuery = {}
	): PluginMarketplaceItem | null {
		const plugin = this.metadata.findLoadedPluginByName(name)
		if (!plugin?.instance?.meta) {
			return null
		}

		const meta = plugin.instance.meta as PluginMeta
		const packageName = normalizePluginName(plugin.packageName ?? meta.name ?? plugin.name)
		const marketplacePlugin = {
			name: packageName,
			packageName,
			version: meta.version,
			artifactNamespace:
				this.metadata.normalizeOptionalString(meta.artifactNamespace) ??
				this.metadata.resolveMarketplaceArtifactNamespace({ name: meta.name, packageName }),
			level: plugin.level ?? meta.level,
			category: meta.category,
			author: meta.author,
			homepage: meta.homepage,
			targetApps: meta.targetApps ?? [],
			targetAppMeta: meta.targetAppMeta ?? {},
			source: {
				type: plugin.source,
				packageName
			}
		} satisfies MarketplaceRegistryPlugin

		if (!this.metadata.matchesTargetApp(marketplacePlugin, query.targetApp)) {
			return null
		}

		const contributions = this.metadata.getMarketplaceContributions(marketplacePlugin, query.targetApp)
		const trialShortcuts = this.metadata.getMarketplaceTrialShortcuts(marketplacePlugin, query.targetApp)
		return {
			name: packageName,
			packageName,
			displayName: meta.displayName ?? packageName,
			description: meta.description ?? packageName,
			version: meta.version,
			artifactNamespace:
				this.metadata.normalizeOptionalString(meta.artifactNamespace) ??
				this.metadata.resolveMarketplaceArtifactNamespace({ name: meta.name, packageName }),
			level: plugin.level ?? meta.level,
			category: meta.category,
			icon: meta.icon ?? null,
			author: meta.author ?? null,
			source: {
				type: plugin.source ?? 'other',
				url: meta.homepage ?? null,
				packageName
			},
			keywords: meta.keywords ?? [],
			installed: true,
			contributions,
			trialShortcuts,
			operationSummary: this.metadata.countOperations(contributions),
			targetApps: meta.targetApps ?? [],
			targetAppMeta: meta.targetAppMeta ?? null,
			marketplacePlugin: null
		}
	}

	async listSources() {
		const sources = await this.getSourceRecords()
		return {
			items: this.getMarketplaceSourceResponses(sources)
		}
	}

	async createSource(input: PluginMarketplaceSourceInput) {
		this.metadata.assertSuperAdmin()
		const normalized = this.normalizeSourceInput(input)
		const entity = this.sourceRepository.create({
			...normalized,
			tenantId: RequestContext.currentTenantId(),
			organizationId: this.metadata.getOrganizationValue(this.metadata.getCurrentOrganizationId()),
			createdById: RequestContext.currentUserId(),
			updatedById: RequestContext.currentUserId(),
			lastIndexStatus: 'idle'
		})
		const saved = await this.sourceRepository.save(entity)

		try {
			return await this.refreshSource(saved.id)
		} catch (error) {
			const message = this.metadata.toErrorMessage(error)
			throw new BadRequestException(`Marketplace source was saved but could not be refreshed: ${message}`)
		}
	}

	async updateSource(id: string, input: PluginMarketplaceSourceInput) {
		this.metadata.assertSuperAdmin()
		const entity = await this.findSourceEntity(id)
		const normalized = this.normalizeSourceInput(input, entity)
		const sourceChanged =
			normalized.type !== entity.type ||
			normalized.url !== entity.url ||
			normalized.ref !== entity.ref ||
			normalized.sparsePath !== entity.sparsePath
		await this.sourceRepository.update(entity.id, {
			...normalized,
			updatedById: RequestContext.currentUserId(),
			...(sourceChanged
				? { lastCatalog: null, lastIndexStatus: 'idle', lastIndexedAt: null, lastIndexError: null }
				: {})
		})
		const saved = await this.findSourceEntity(id)
		return this.toSourceResponse(this.toSourceRecord(saved))
	}

	async deleteSource(id: string) {
		this.metadata.assertSuperAdmin()
		const entity = await this.findSourceEntity(id)
		await this.sourceRepository.delete(entity.id)
		return { success: true }
	}

	async refreshSource(id: string) {
		this.metadata.assertSuperAdmin()
		if (id === PLATFORM_REGISTRY_SOURCE_ID) {
			return this.registry.refreshPlatformRegistrySource()
		}
		const source =
			id === BUILTIN_SOURCE_ID
				? this.createBuiltinSourceRecord(await this.getOrCreateBuiltinSourceEntity())
				: this.toSourceRecord(await this.findSourceEntity(id))
		const catalog = await this.refreshSourceCache(source)

		return {
			...this.toSourceResponse(source),
			lastIndexedAt: source.lastIndexedAt ?? new Date().toISOString(),
			total: catalog.total
		}
	}

	async refreshSources() {
		this.metadata.assertSuperAdmin()
		const sources = (await this.getSourceRecords()).filter((source) => source.enabled !== false)
		const errors: Array<{ sourceId: string; sourceName: string; message: string }> = []
		const platformRegistryItem = await this.registry.refreshPlatformRegistrySource().catch((error) => {
			const message = this.metadata.toErrorMessage(error)
			errors.push({
				sourceId: PLATFORM_REGISTRY_SOURCE_ID,
				sourceName: PLATFORM_REGISTRY_SOURCE_NAME,
				message
			})
			this.metadata.logger.warn(
				`Failed to refresh plugin marketplace source "${PLATFORM_REGISTRY_SOURCE_NAME}": ${message}`
			)
			return null
		})
		const sourceItems = await Promise.all(
			sources.map(async (source) => {
				try {
					const catalog = await this.refreshSourceCache(source)
					return {
						...this.toSourceResponse(source),
						lastIndexedAt: source.lastIndexedAt ?? new Date().toISOString(),
						total: catalog.total
					}
				} catch (error) {
					const message = this.metadata.toErrorMessage(error)
					errors.push({
						sourceId: source.id,
						sourceName: source.name,
						message
					})
					this.metadata.logger.warn(
						`Failed to refresh plugin marketplace source "${source.name}": ${message}`
					)
					return null
				}
			})
		)

		return {
			items: [platformRegistryItem, ...sourceItems].filter((item): item is NonNullable<typeof item> => !!item),
			errors
		}
	}

	private getMarketplaceSourceResponses(sources: MarketplaceSourceRecord[]) {
		return [
			this.registry.createPlatformRegistrySourceResponse(),
			...sources.map((source) => this.toSourceResponse(source))
		]
	}

	private async getSourceRecords(sourceId?: string): Promise<MarketplaceSourceRecord[]> {
		if (sourceId === PLATFORM_REGISTRY_SOURCE_ID) return []
		if (sourceId === BUILTIN_SOURCE_ID) {
			return [this.createBuiltinSourceRecord(await this.getOrCreateBuiltinSourceEntity())]
		}
		if (sourceId?.trim()) {
			const entity = await this.sourceRepository.findOne({ where: this.getVisibleSourceWhere(sourceId) })
			return entity && !this.isBuiltinCacheEntity(entity) ? [this.toSourceRecord(entity)] : []
		}
		const entities = await this.sourceRepository.find({
			where: this.getVisibleSourceWhere(),
			order: {
				priority: 'ASC',
				createdAt: 'ASC'
			}
		})
		const builtinEntity = await this.getOrCreateBuiltinSourceEntity(entities)
		const customEntities = entities.filter((entity) => !this.isBuiltinCacheEntity(entity))

		return [
			this.createBuiltinSourceRecord(builtinEntity),
			...customEntities.map((entity) => this.toSourceRecord(entity))
		]
	}

	private filterSources(sources: MarketplaceSourceRecord[], sourceId?: string) {
		if (!sourceId?.trim()) {
			return sources
		}
		return sources.filter((source) => source.id === sourceId)
	}

	private createBuiltinSourceRecord(entity?: PluginMarketplaceSource | null): MarketplaceSourceRecord {
		return {
			id: BUILTIN_SOURCE_ID,
			name: 'Xpert Plugin Registry',
			type: 'url',
			url: BUILTIN_MARKETPLACE_URL,
			enabled: true,
			priority: 0,
			lastIndexStatus: entity?.lastIndexStatus ?? 'idle',
			lastIndexedAt: entity?.lastIndexedAt,
			lastIndexError: entity?.lastIndexError,
			lastCatalog: this.metadata.readCachedCatalog(entity?.lastCatalog),
			builtin: true,
			entity: entity ?? undefined
		}
	}

	private getOrCreateBuiltinSourceEntity(existingEntities: PluginMarketplaceSource[] = []) {
		return this.catalogs.builtin(existingEntities)
	}

	private isBuiltinCacheEntity(entity: PluginMarketplaceSource) {
		return entity.name === BUILTIN_SOURCE_CACHE_NAME
	}

	private toSourceRecord(entity: PluginMarketplaceSource): MarketplaceSourceRecord {
		return {
			id: entity.id,
			name: entity.name,
			type: entity.type,
			url: entity.url,
			ref: entity.ref,
			sparsePath: entity.sparsePath,
			enabled: entity.enabled !== false,
			priority: entity.priority ?? 100,
			lastIndexStatus: entity.lastIndexStatus,
			lastIndexedAt: entity.lastIndexedAt,
			lastIndexError: entity.lastIndexError,
			lastCatalog: this.metadata.readCachedCatalog(entity.lastCatalog),
			entity
		}
	}

	private toSourceResponse(source: MarketplaceSourceRecord): PluginMarketplaceSourceResponse {
		return {
			id: source.id,
			name: source.name,
			type: source.type,
			url: source.url,
			ref: source.ref,
			sparsePath: source.sparsePath,
			enabled: source.enabled !== false,
			priority: source.priority ?? 100,
			lastIndexStatus: source.lastIndexStatus ?? 'idle',
			lastIndexedAt: source.lastIndexedAt,
			lastIndexError: source.lastIndexError,
			builtin: source.builtin
		}
	}

	private normalizeSourceInput(
		input: PluginMarketplaceSourceInput,
		existing?: PluginMarketplaceSource
	): Required<Pick<PluginMarketplaceSource, 'name' | 'type' | 'url' | 'enabled' | 'priority'>> &
		Pick<PluginMarketplaceSource, 'ref' | 'sparsePath'> {
		const type = (input.type ?? existing?.type ?? 'url') as PluginMarketplaceSourceType
		if (!PLUGIN_MARKETPLACE_SOURCE_TYPES.includes(type)) {
			throw new BadRequestException('Unsupported marketplace source type')
		}

		const url = this.metadata.normalizeOptionalString(input.url ?? existing?.url)
		if (!url) {
			throw new BadRequestException('Marketplace source url is required')
		}
		if (type === 'url' && !/^https?:\/\//i.test(url)) {
			throw new BadRequestException('Static index URL sources must use http(s)')
		}

		const name =
			this.metadata.normalizeOptionalString(input.name ?? existing?.name) ?? this.metadata.inferSourceName(url)
		const priority = Number.isFinite(Number(input.priority ?? existing?.priority))
			? Number(input.priority ?? existing?.priority)
			: 100

		return {
			name,
			type,
			url,
			ref: this.metadata.normalizeOptionalString(input.ref) ?? existing?.ref ?? null,
			sparsePath: this.metadata.normalizeOptionalString(input.sparsePath) ?? existing?.sparsePath ?? null,
			enabled: input.enabled ?? existing?.enabled ?? true,
			priority
		}
	}

	private loadCatalog(source: MarketplaceSourceRecord) {
		return this.catalogs.load(source)
	}
	private loadPublicBuiltinCatalog() {
		return this.catalogs.public(this.publicBuiltinSource)
	}
	private refreshSourceCache(source: MarketplaceSourceRecord) {
		return this.catalogs.force(source)
	}

	private async fetchSourceCatalog(
		source: MarketplaceSourceRecord,
		enrich = true
	): Promise<NormalizedMarketplaceCatalog> {
		let catalog: NormalizedMarketplaceCatalog
		if (source.type === 'github') {
			catalog = await this.fetchGithubCatalog(source)
		} else if (source.type === 'git') {
			catalog = await this.fetchGitCatalog(source)
		} else {
			const raw = await this.packages.fetchJson(source.url)
			catalog = this.metadata.normalizeCatalog(raw, source)
		}

		return enrich
			? this.packages.enrichCatalogWithNpmPackageData(await this.packages.enrichCatalogWithNpmDownloads(catalog))
			: catalog
	}

	private async fetchGithubCatalog(source: MarketplaceSourceRecord): Promise<NormalizedMarketplaceCatalog> {
		const repository = this.metadata.parseGithubRepository(source.url)
		if (!repository) {
			throw new BadRequestException('GitHub marketplace sources must be owner/repo or a GitHub URL')
		}

		const sparsePath = source.sparsePath ?? repository.path
		const refs = this.metadata.uniqueStrings([source.ref, repository.ref, 'main', 'master'])
		const candidatePaths = this.metadata.buildCandidatePaths(sparsePath)
		let lastError: string | null = null

		for (const ref of refs) {
			for (const candidatePath of candidatePaths) {
				const rawUrl = this.metadata.buildGithubRawUrl(repository.owner, repository.repo, ref, candidatePath)
				try {
					const raw = await this.packages.tryFetchJson(rawUrl)
					if (raw !== null) {
						return this.metadata.normalizeCatalog(raw, source)
					}
				} catch (error) {
					lastError = this.metadata.toErrorMessage(error)
				}
			}
		}

		throw new BadRequestException(lastError ?? 'No marketplace manifest was found in the GitHub repository')
	}

	private async fetchGitCatalog(source: MarketplaceSourceRecord): Promise<NormalizedMarketplaceCatalog> {
		const directory = await mkdtemp(join(tmpdir(), 'xpert-plugin-marketplace-'))

		try {
			const args = ['clone', '--depth', '1']
			if (source.ref) {
				args.push('--branch', source.ref)
			}
			args.push(source.url, directory)
			await execFile('git', args, { timeout: 45_000 })

			const raw = await this.readFirstCatalogFile(directory, source.sparsePath)
			return this.metadata.normalizeCatalog(raw, source)
		} finally {
			await rm(directory, { recursive: true, force: true })
		}
	}

	private async readFirstCatalogFile(directory: string, sparsePath?: string | null) {
		const root = resolve(directory)
		let lastError: string | null = null

		for (const candidate of this.metadata.buildCandidatePaths(sparsePath)) {
			const filePath = resolve(root, candidate)
			if (!filePath.startsWith(root)) {
				continue
			}
			try {
				const text = await readFile(filePath, 'utf8')
				return JSON.parse(text)
			} catch (error) {
				lastError = this.metadata.toErrorMessage(error)
			}
		}

		throw new BadRequestException(lastError ?? 'No marketplace manifest was found in the git repository')
	}

	private buildLoadedContext(): InstalledPluginContext {
		const organizationId = this.metadata.getCurrentOrganizationId()
		const loadedMetaByName = new Map<string, PluginMeta>()
		const installedNames = new Set<string>()
		const addLoadedMeta = (meta: PluginMeta | undefined, ...names: Array<string | undefined>) => {
			for (const name of names) {
				const normalized = this.metadata.normalizeOptionalString(name)
				if (normalized) {
					installedNames.add(normalizePluginName(normalized))
					if (meta) loadedMetaByName.set(normalizePluginName(normalized), meta)
				}
			}
		}

		const tenantId = RequestContext.getScope()?.tenantId ?? RequestContext.currentTenantId()
		const organizationScopeKey =
			organizationId === GLOBAL_ORGANIZATION_SCOPE ? resolveTenantGlobalScopeKey(tenantId) : organizationId
		const globalScopeKey = resolveTenantGlobalScopeKey(tenantId)
		for (const plugin of this.loadedPlugins) {
			const pluginScopeKey = plugin.scopeKey ?? plugin.organizationId
			if (
				pluginScopeKey !== organizationScopeKey &&
				(organizationId === GLOBAL_ORGANIZATION_SCOPE || pluginScopeKey !== globalScopeKey) &&
				pluginScopeKey !== SYSTEM_GLOBAL_SCOPE
			) {
				continue
			}
			addLoadedMeta(plugin.instance?.meta, plugin.name, plugin.packageName, plugin.instance?.meta?.name)
		}

		return { installedNames, loadedMetaByName }
	}

	private async buildInstalledContext(): Promise<InstalledPluginContext> {
		const { installedNames, loadedMetaByName } = this.buildLoadedContext()
		const instances = await this.pluginInstanceService.findVisibleInOrganization(
			this.metadata.getCurrentOrganizationId()
		)
		for (const instance of instances) {
			for (const name of [instance.pluginName, instance.packageName]) {
				if (name?.trim()) installedNames.add(normalizePluginName(name))
			}
		}
		return { installedNames, loadedMetaByName }
	}

	private async findSourceEntity(id: string) {
		if (!id || id === BUILTIN_SOURCE_ID) {
			throw new BadRequestException('Built-in marketplace source cannot be modified')
		}

		const entity = await this.sourceRepository.findOne({
			where: this.getVisibleSourceWhere(id)
		})

		if (!entity) {
			throw new NotFoundException(`Marketplace source "${id}" was not found`)
		}
		if (this.isBuiltinCacheEntity(entity)) {
			throw new BadRequestException('Built-in marketplace source cannot be modified')
		}

		return entity
	}

	private getVisibleSourceWhere(id?: string) {
		const tenantId = RequestContext.currentTenantId()
		const organizationId = this.metadata.getCurrentOrganizationId()
		const base = {
			...(id ? { id } : {}),
			...(tenantId ? { tenantId } : {})
		}

		if (organizationId && organizationId !== GLOBAL_ORGANIZATION_SCOPE) {
			return [
				{
					...base,
					organizationId
				},
				{
					...base,
					organizationId: IsNull()
				}
			]
		}

		return [
			{
				...base,
				organizationId: IsNull()
			}
		]
	}
}
