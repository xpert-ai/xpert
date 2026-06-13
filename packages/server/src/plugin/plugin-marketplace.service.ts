import { BadRequestException, ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { PluginMarketplaceContribution, PluginMarketplaceOperation, PluginMeta, RolesEnum } from '@xpert-ai/contracts'
import { GLOBAL_ORGANIZATION_SCOPE, RequestContext } from '@xpert-ai/plugin-sdk'
import { execFile as execFileCallback } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { IsNull, Repository } from 'typeorm'
import { PluginInstanceService } from './plugin-instance.service'
import {
	PLUGIN_MARKETPLACE_REGISTRY_SECTIONS,
	PluginMarketplaceRegistryItem,
	PluginMarketplaceRegistrySection
} from './plugin-marketplace-registry-item.entity'
import {
	PLUGIN_MARKETPLACE_SOURCE_TYPES,
	PluginMarketplaceSource,
	PluginMarketplaceSourceType
} from './plugin-marketplace-source.entity'
import { LOADED_PLUGINS, LoadedPluginRecord, normalizePluginName } from './types'

const execFile = promisify(execFileCallback)
const BUILTIN_SOURCE_ID = 'builtin-default'
const BUILTIN_SOURCE_CACHE_NAME = '__xpert_builtin_plugin_marketplace_source__'
const PLATFORM_REGISTRY_SOURCE_ID = 'platform-registry'
const PLATFORM_REGISTRY_SOURCE_NAME = 'XpertAI Platform Registry'
const PLATFORM_REGISTRY_SOURCE_URL = 'xpert-platform://plugins'
const BUILTIN_MARKETPLACE_URL =
	process.env.XPERT_PLUGIN_MARKETPLACE_URL ?? 'https://xpert-ai.github.io/xpert-plugin-registry/plugins/index.json'
const MARKETPLACE_CACHE_TTL_MS = parsePositiveInteger(process.env.XPERT_PLUGIN_MARKETPLACE_CACHE_TTL_MS, 10 * 60 * 1000)
const NPM_DOWNLOADS_CONCURRENCY = parsePositiveInteger(process.env.XPERT_PLUGIN_NPM_DOWNLOADS_CONCURRENCY, 6)

type JsonRecord = Record<string, any>

interface MarketplaceSourceRecord {
	id: string
	name: string
	type: PluginMarketplaceSourceType | 'platform'
	url: string
	ref?: string | null
	sparsePath?: string | null
	enabled?: boolean
	priority?: number
	lastIndexStatus?: string | null
	lastIndexedAt?: Date | string | null
	lastIndexError?: string | null
	lastCatalog?: NormalizedMarketplaceCatalog | null
	builtin?: boolean
	entity?: PluginMarketplaceSource
}

interface MarketplaceRegistryPlugin extends JsonRecord {
	name: string
	sourceId?: string
	sourceName?: string
	source?: {
		type?: string
		url?: string
		packageName?: string
	}
}

interface NormalizedMarketplaceCatalog {
	updatedAt: string | null
	total: number
	plugins: MarketplaceRegistryPlugin[]
	official?: string[]
	partner?: string[]
	community?: string[]
}

interface InstalledPluginContext {
	installedNames: Set<string>
	loadedMetaByName: Map<string, PluginMeta>
}

export interface PluginMarketplaceListQuery {
	targetApp?: string
	sourceId?: string
	search?: string
}

export interface PluginMarketplaceSourceInput {
	name?: string
	type?: PluginMarketplaceSourceType
	url?: string
	ref?: string | null
	sparsePath?: string | null
	enabled?: boolean
	priority?: number
}

export interface PluginMarketplaceSourceResponse {
	id: string
	name: string
	type: PluginMarketplaceSourceType | 'platform'
	url: string
	ref?: string | null
	sparsePath?: string | null
	enabled: boolean
	priority: number
	lastIndexStatus?: string | null
	lastIndexedAt?: Date | string | null
	lastIndexError?: string | null
	builtin?: boolean
}

export interface PluginMarketplaceRegistryItemInput {
	packageName?: string
	version?: string | null
	displayName?: string
	description?: string
	category?: string
	author?: string
	icon?: unknown
	keywords?: string[]
	homepage?: string | null
	repository?: unknown
	targetApps?: string[]
	targetAppMeta?: JsonRecord | null
	enabled?: boolean
	priority?: number
	section?: PluginMarketplaceRegistrySection
}

export interface PluginMarketplaceRegistryItemResponse {
	id: string
	packageName: string
	version?: string | null
	displayName: string
	description: string
	category: string
	author: string
	icon?: unknown
	keywords: string[]
	homepage?: string | null
	repository?: unknown
	targetApps: string[]
	targetAppMeta: JsonRecord
	enabled: boolean
	priority: number
	section: PluginMarketplaceRegistrySection
	downloads?: JsonRecord | null
	downloadsStatus?: string | null
	downloadsUpdatedAt?: Date | string | null
	downloadsError?: string | null
	createdAt?: Date | string | null
	updatedAt?: Date | string | null
}

@Injectable()
export class PluginMarketplaceService {
	private readonly logger = new Logger(PluginMarketplaceService.name)
	private readonly refreshJobs = new Map<string, Promise<void>>()

	constructor(
		@InjectRepository(PluginMarketplaceSource)
		private readonly sourceRepository: Repository<PluginMarketplaceSource>,
		@InjectRepository(PluginMarketplaceRegistryItem)
		private readonly registryRepository: Repository<PluginMarketplaceRegistryItem>,
		@Inject(LOADED_PLUGINS)
		private readonly loadedPlugins: Array<LoadedPluginRecord>,
		private readonly pluginInstanceService: PluginInstanceService
	) {}

	async listMarketplace(query: PluginMarketplaceListQuery = {}) {
		const sources = await this.getSourceRecords()
		const enabledSources = this.filterSources(sources, query.sourceId).filter((source) => source.enabled !== false)
		const includePlatformRegistry = this.includesPlatformRegistry(query.sourceId)
		const installedContext = await this.buildInstalledContext()
		const errors: Array<{ sourceId: string; sourceName: string; message: string }> = []
		const platformCatalog = includePlatformRegistry ? await this.loadPlatformRegistryCatalog() : null
		const sourceCatalogs = await Promise.all(
			enabledSources.map(async (source) => {
				try {
					return await this.loadCatalog(source)
				} catch (error) {
					const message = this.toErrorMessage(error)
					errors.push({
						sourceId: source.id,
						sourceName: source.name,
						message
					})
					this.logger.warn(`Failed to load plugin marketplace source "${source.name}": ${message}`)
					return null
				}
			})
		)
		const catalogs = [platformCatalog, ...sourceCatalogs].filter(
			(catalog): catalog is NormalizedMarketplaceCatalog => !!catalog
		)
		const byName = new Map<string, any>()

		for (const catalog of catalogs) {
			for (const plugin of catalog.plugins) {
				const enriched = this.mergeInstalledPluginMeta(plugin, installedContext.loadedMetaByName)
				if (!this.matchesTargetApp(enriched, query.targetApp)) {
					continue
				}
				if (!this.matchesSearch(enriched, query.search)) {
					continue
				}

				const normalizedName = normalizePluginName(enriched.name)
				if (!byName.has(normalizedName)) {
					byName.set(normalizedName, this.toMarketplaceItem(enriched, query.targetApp, installedContext))
				}
			}
		}

		const items = Array.from(byName.values())

		return {
			updatedAt: this.getLatestCatalogDate(catalogs),
			total: items.length,
			items,
			official: this.mergeCatalogNames(catalogs, 'official'),
			partner: this.mergeCatalogNames(catalogs, 'partner'),
			community: this.mergeCatalogNames(catalogs, 'community'),
			sources: this.getMarketplaceSourceResponses(sources),
			errors
		}
	}

	async getMarketplacePlugin(name: string, query: PluginMarketplaceListQuery = {}) {
		const response = await this.listMarketplace(query)
		const normalizedName = normalizePluginName(name)
		const plugin = response.items.find((item) => normalizePluginName(item.name) === normalizedName)

		if (!plugin) {
			throw new NotFoundException(`Plugin "${name}" was not found in the marketplace`)
		}

		return plugin
	}

	async listSources() {
		const sources = await this.getSourceRecords()
		return {
			items: this.getMarketplaceSourceResponses(sources)
		}
	}

	async createSource(input: PluginMarketplaceSourceInput) {
		this.assertSuperAdmin()
		const normalized = this.normalizeSourceInput(input)
		const entity = this.sourceRepository.create({
			...normalized,
			tenantId: RequestContext.currentTenantId(),
			organizationId: this.getOrganizationValue(this.getCurrentOrganizationId()),
			createdById: RequestContext.currentUserId(),
			updatedById: RequestContext.currentUserId(),
			lastIndexStatus: 'idle'
		})
		const saved = await this.sourceRepository.save(entity)

		try {
			return await this.refreshSource(saved.id)
		} catch (error) {
			const message = this.toErrorMessage(error)
			saved.lastIndexStatus = 'failed'
			saved.lastIndexError = message
			await this.sourceRepository.save(saved)
			throw new BadRequestException(`Marketplace source was saved but could not be refreshed: ${message}`)
		}
	}

	async updateSource(id: string, input: PluginMarketplaceSourceInput) {
		this.assertSuperAdmin()
		const entity = await this.findSourceEntity(id)
		const normalized = this.normalizeSourceInput(input, entity)
		const sourceChanged =
			normalized.type !== entity.type ||
			normalized.url !== entity.url ||
			normalized.ref !== entity.ref ||
			normalized.sparsePath !== entity.sparsePath
		Object.assign(entity, normalized, {
			updatedById: RequestContext.currentUserId()
		})
		if (sourceChanged) {
			entity.lastCatalog = null
			entity.lastIndexStatus = 'idle'
			entity.lastIndexedAt = null
			entity.lastIndexError = null
		}
		const saved = await this.sourceRepository.save(entity)
		return this.toSourceResponse(this.toSourceRecord(saved))
	}

	async deleteSource(id: string) {
		this.assertSuperAdmin()
		const entity = await this.findSourceEntity(id)
		await this.sourceRepository.delete(entity.id)
		return { success: true }
	}

	async refreshSource(id: string) {
		this.assertSuperAdmin()
		if (id === PLATFORM_REGISTRY_SOURCE_ID) {
			return this.refreshPlatformRegistrySource()
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
		this.assertSuperAdmin()
		const sources = (await this.getSourceRecords()).filter((source) => source.enabled !== false)
		const errors: Array<{ sourceId: string; sourceName: string; message: string }> = []
		const platformRegistryItem = await this.refreshPlatformRegistrySource().catch((error) => {
			const message = this.toErrorMessage(error)
			errors.push({
				sourceId: PLATFORM_REGISTRY_SOURCE_ID,
				sourceName: PLATFORM_REGISTRY_SOURCE_NAME,
				message
			})
			this.logger.warn(
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
					const message = this.toErrorMessage(error)
					errors.push({
						sourceId: source.id,
						sourceName: source.name,
						message
					})
					this.logger.warn(`Failed to refresh plugin marketplace source "${source.name}": ${message}`)
					return null
				}
			})
		)

		return {
			items: [platformRegistryItem, ...sourceItems].filter((item): item is NonNullable<typeof item> => !!item),
			errors
		}
	}

	async listRegistryItems() {
		this.assertSuperAdmin()
		const items = await this.registryRepository.find({
			where: this.getRegistryWhere(),
			order: {
				priority: 'ASC',
				createdAt: 'ASC'
			}
		})

		return {
			items: items.map((item) => this.toRegistryItemResponse(item))
		}
	}

	async createRegistryItem(input: PluginMarketplaceRegistryItemInput) {
		this.assertSuperAdmin()
		const normalized = await this.normalizeRegistryItemInput(input)
		await this.assertUniqueRegistryPackage(normalized.packageName)

		const entity = this.registryRepository.create({
			...normalized,
			tenantId: RequestContext.currentTenantId(),
			createdById: RequestContext.currentUserId(),
			updatedById: RequestContext.currentUserId(),
			downloadsStatus: 'idle'
		})
		const saved = await this.registryRepository.save(entity)
		this.schedulePlatformRegistryDownloadsRefresh([saved])

		return this.toRegistryItemResponse(saved)
	}

	async updateRegistryItem(id: string, input: PluginMarketplaceRegistryItemInput) {
		this.assertSuperAdmin()
		const entity = await this.findRegistryItemEntity(id)
		const normalized = await this.normalizeRegistryItemInput(input, entity)
		await this.assertUniqueRegistryPackage(normalized.packageName, entity.id)

		const packageChanged = normalized.packageName !== entity.packageName
		Object.assign(entity, normalized, {
			updatedById: RequestContext.currentUserId()
		})
		if (packageChanged) {
			entity.downloads = null
			entity.downloadsStatus = 'idle'
			entity.downloadsUpdatedAt = null
			entity.downloadsError = null
		}

		const saved = await this.registryRepository.save(entity)
		this.schedulePlatformRegistryDownloadsRefresh([saved])

		return this.toRegistryItemResponse(saved)
	}

	async deleteRegistryItem(id: string) {
		this.assertSuperAdmin()
		const entity = await this.findRegistryItemEntity(id)
		await this.registryRepository.delete(entity.id)
		return { success: true }
	}

	private includesPlatformRegistry(sourceId?: string) {
		const normalized = this.normalizeOptionalString(sourceId)
		return !normalized || normalized === PLATFORM_REGISTRY_SOURCE_ID
	}

	private getMarketplaceSourceResponses(sources: MarketplaceSourceRecord[]) {
		return [this.createPlatformRegistrySourceResponse(), ...sources.map((source) => this.toSourceResponse(source))]
	}

	private createPlatformRegistrySourceResponse(): PluginMarketplaceSourceResponse {
		return {
			id: PLATFORM_REGISTRY_SOURCE_ID,
			name: PLATFORM_REGISTRY_SOURCE_NAME,
			type: 'platform',
			url: PLATFORM_REGISTRY_SOURCE_URL,
			enabled: true,
			priority: -10,
			lastIndexStatus: 'success',
			lastIndexedAt: null,
			lastIndexError: null,
			builtin: true
		}
	}

	private async loadPlatformRegistryCatalog(): Promise<NormalizedMarketplaceCatalog> {
		const items = await this.registryRepository.find({
			where: {
				...this.getRegistryWhere(),
				enabled: true
			},
			order: {
				priority: 'ASC',
				createdAt: 'ASC'
			}
		})

		const staleItems = items.filter((item) => this.isRegistryDownloadsCacheExpired(item))
		this.schedulePlatformRegistryDownloadsRefresh(staleItems)

		return this.toPlatformRegistryCatalog(items)
	}

	private toPlatformRegistryCatalog(items: PluginMarketplaceRegistryItem[]): NormalizedMarketplaceCatalog {
		const plugins = items.map((item, index) => this.toPlatformRegistryPlugin(item, index))
		const namesBySection = (section: PluginMarketplaceRegistrySection) =>
			plugins.filter((plugin) => plugin.section === section).map((plugin) => plugin.name)

		return {
			updatedAt: this.getLatestRegistryItemDate(items),
			total: plugins.length,
			plugins,
			official: namesBySection('official'),
			partner: namesBySection('partner'),
			community: namesBySection('community')
		}
	}

	private toPlatformRegistryPlugin(item: PluginMarketplaceRegistryItem, index: number): MarketplaceRegistryPlugin {
		const sourceUrl = this.buildNpmPackageUrl(item.packageName)
		return {
			name: item.packageName,
			packageName: item.packageName,
			version: item.version ?? null,
			displayName: item.displayName,
			description: item.description,
			category: item.category,
			author: item.author,
			icon: item.icon ?? undefined,
			keywords: this.readStringArray(item.keywords),
			homepage: item.homepage ?? undefined,
			repository: item.repository ?? undefined,
			targetApps: this.readStringArray(item.targetApps),
			targetAppMeta: readRecord(item.targetAppMeta) ?? {},
			sourceId: PLATFORM_REGISTRY_SOURCE_ID,
			sourceName: PLATFORM_REGISTRY_SOURCE_NAME,
			source: {
				type: 'npm',
				packageName: item.packageName,
				url: sourceUrl
			},
			downloads: readRecord(item.downloads) ?? undefined,
			section: item.section ?? 'marketplace',
			_marketplaceIndex: index
		}
	}

	private async refreshPlatformRegistrySource() {
		const items = await this.registryRepository.find({
			where: {
				...this.getRegistryWhere(),
				enabled: true
			},
			order: {
				priority: 'ASC',
				createdAt: 'ASC'
			}
		})
		await this.refreshRegistryDownloadEntities(items)
		const refreshedItems = await this.registryRepository.find({
			where: {
				...this.getRegistryWhere(),
				enabled: true
			}
		})

		return {
			...this.createPlatformRegistrySourceResponse(),
			lastIndexedAt: this.getLatestRegistryDownloadsDate(refreshedItems),
			total: refreshedItems.length
		}
	}

	private schedulePlatformRegistryDownloadsRefresh(items: PluginMarketplaceRegistryItem[]) {
		const refreshableItems = items.filter((item) => item.enabled !== false)
		if (!refreshableItems.length) {
			return
		}
		if (this.refreshJobs.has(PLATFORM_REGISTRY_SOURCE_ID)) {
			return
		}

		const job = this.refreshRegistryDownloadEntities(refreshableItems)
			.catch((error) => {
				this.logger.warn(
					`Failed to refresh stale plugin marketplace source "${PLATFORM_REGISTRY_SOURCE_NAME}": ${this.toErrorMessage(error)}`
				)
			})
			.finally(() => {
				this.refreshJobs.delete(PLATFORM_REGISTRY_SOURCE_ID)
			})

		this.refreshJobs.set(
			PLATFORM_REGISTRY_SOURCE_ID,
			job.then(() => undefined)
		)
	}

	private async refreshRegistryDownloadEntities(items: PluginMarketplaceRegistryItem[]) {
		const packageNames = this.uniqueStrings(items.map((item) => item.packageName).filter(Boolean)).map((name) =>
			normalizePluginName(name)
		)
		if (!packageNames.length) {
			return
		}

		const downloadsByPackageName = await this.fetchNpmDownloadCounts(packageNames)
		const indexedAt = new Date()
		const changedItems: PluginMarketplaceRegistryItem[] = []

		for (const item of items) {
			const packageName = normalizePluginName(item.packageName)
			const lastMonth = downloadsByPackageName.get(packageName)
			if (typeof lastMonth !== 'number') {
				continue
			}

			item.downloads = {
				...(readRecord(item.downloads) ?? {}),
				lastMonth
			}
			item.downloadsStatus = 'success'
			item.downloadsUpdatedAt = indexedAt
			item.downloadsError = null
			const userId = RequestContext.currentUserId()
			if (userId) {
				item.updatedById = userId
			}
			changedItems.push(item)
		}

		if (changedItems.length) {
			await this.registryRepository.save(changedItems)
		}
	}

	private isRegistryDownloadsCacheExpired(item: PluginMarketplaceRegistryItem) {
		const timestamp = this.toTimestamp(item.downloadsUpdatedAt)
		if (!timestamp) {
			return true
		}
		return Date.now() - timestamp >= MARKETPLACE_CACHE_TTL_MS
	}

	private getLatestRegistryItemDate(items: PluginMarketplaceRegistryItem[]) {
		const dates = items
			.flatMap((item) => [item.updatedAt, item.downloadsUpdatedAt])
			.map((value) => this.toTimestamp(value))
			.filter((value): value is number => typeof value === 'number')

		if (!dates.length) {
			return null
		}

		return new Date(Math.max(...dates)).toISOString()
	}

	private getLatestRegistryDownloadsDate(items: PluginMarketplaceRegistryItem[]) {
		const dates = items
			.map((item) => this.toTimestamp(item.downloadsUpdatedAt))
			.filter((value): value is number => typeof value === 'number')

		if (!dates.length) {
			return null
		}

		return new Date(Math.max(...dates)).toISOString()
	}

	private buildNpmPackageUrl(packageName: string) {
		return `https://www.npmjs.com/package/${encodeURIComponent(packageName)}`
	}

	private async normalizeRegistryItemInput(
		input: PluginMarketplaceRegistryItemInput,
		existing?: PluginMarketplaceRegistryItem
	): Promise<
		Pick<
			PluginMarketplaceRegistryItem,
			| 'packageName'
			| 'version'
			| 'displayName'
			| 'description'
			| 'category'
			| 'author'
			| 'icon'
			| 'keywords'
			| 'homepage'
			| 'repository'
			| 'targetApps'
			| 'targetAppMeta'
			| 'enabled'
			| 'priority'
			| 'section'
		>
	> {
		const packageName = this.normalizeOptionalString(this.inputOrExisting(input.packageName, existing?.packageName))
		const displayName = this.normalizeOptionalString(this.inputOrExisting(input.displayName, existing?.displayName))
		const description = this.normalizeOptionalString(this.inputOrExisting(input.description, existing?.description))
		const category = this.normalizeOptionalString(this.inputOrExisting(input.category, existing?.category))
		const author = this.normalizeOptionalString(this.inputOrExisting(input.author, existing?.author))
		const targetApps = this.uniqueStrings(this.inputOrExisting(input.targetApps, existing?.targetApps ?? []))
		const section = this.inputOrExisting(input.section, existing?.section ?? 'marketplace')

		if (!packageName) {
			throw new BadRequestException('packageName is required')
		}
		if (!this.looksLikeNpmPackageName(packageName)) {
			throw new BadRequestException('packageName must be an npm package name')
		}
		if (!displayName) {
			throw new BadRequestException('displayName is required')
		}
		if (!description) {
			throw new BadRequestException('description is required')
		}
		if (!category) {
			throw new BadRequestException('category is required')
		}
		if (!author) {
			throw new BadRequestException('author is required')
		}
		if (!targetApps.length) {
			throw new BadRequestException('targetApps is required')
		}
		if (!PLUGIN_MARKETPLACE_REGISTRY_SECTIONS.includes(section as PluginMarketplaceRegistrySection)) {
			throw new BadRequestException('Unsupported registry section')
		}

		const priority = Number.isFinite(Number(this.inputOrExisting(input.priority, existing?.priority)))
			? Number(this.inputOrExisting(input.priority, existing?.priority))
			: 100

		return {
			packageName: normalizePluginName(packageName),
			version: this.normalizeOptionalString(this.inputOrExisting(input.version, existing?.version)) ?? null,
			displayName,
			description,
			category,
			author,
			icon: this.inputOrExisting(input.icon, existing?.icon) ?? null,
			keywords: this.uniqueStrings(this.inputOrExisting(input.keywords, existing?.keywords ?? [])),
			homepage: this.normalizeOptionalString(this.inputOrExisting(input.homepage, existing?.homepage)) ?? null,
			repository: this.inputOrExisting(input.repository, existing?.repository) ?? null,
			targetApps,
			targetAppMeta: readRecord(this.inputOrExisting(input.targetAppMeta, existing?.targetAppMeta)) ?? {},
			enabled: input.enabled ?? existing?.enabled ?? true,
			priority,
			section: section as PluginMarketplaceRegistrySection
		}
	}

	private inputOrExisting<T>(inputValue: T | undefined, existingValue: T | undefined): T | undefined {
		return inputValue === undefined ? existingValue : inputValue
	}

	private async assertUniqueRegistryPackage(packageName: string, excludeId?: string) {
		const existing = await this.registryRepository.findOne({
			where: {
				...this.getRegistryWhere(),
				packageName
			}
		})
		if (existing && existing.id !== excludeId) {
			throw new BadRequestException(`Plugin "${packageName}" is already registered`)
		}
	}

	private async findRegistryItemEntity(id: string) {
		if (!id) {
			throw new BadRequestException('Registry item id is required')
		}

		const entity = await this.registryRepository.findOne({
			where: this.getRegistryWhere(id)
		})

		if (!entity) {
			throw new NotFoundException(`Registered plugin "${id}" was not found`)
		}

		return entity
	}

	private getRegistryWhere(id?: string) {
		const tenantId = RequestContext.currentTenantId()
		return {
			...(id ? { id } : {}),
			tenantId: tenantId ?? IsNull()
		}
	}

	private toRegistryItemResponse(item: PluginMarketplaceRegistryItem): PluginMarketplaceRegistryItemResponse {
		return {
			id: item.id,
			packageName: item.packageName,
			version: item.version,
			displayName: item.displayName,
			description: item.description,
			category: item.category,
			author: item.author,
			icon: item.icon,
			keywords: this.readStringArray(item.keywords),
			homepage: item.homepage,
			repository: item.repository,
			targetApps: this.readStringArray(item.targetApps),
			targetAppMeta: readRecord(item.targetAppMeta) ?? {},
			enabled: item.enabled !== false,
			priority: item.priority ?? 100,
			section: item.section ?? 'marketplace',
			downloads: readRecord(item.downloads),
			downloadsStatus: item.downloadsStatus,
			downloadsUpdatedAt: item.downloadsUpdatedAt,
			downloadsError: item.downloadsError,
			createdAt: item.createdAt,
			updatedAt: item.updatedAt
		}
	}

	private async getSourceRecords(): Promise<MarketplaceSourceRecord[]> {
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
			lastCatalog: this.readCachedCatalog(entity?.lastCatalog),
			builtin: true,
			entity: entity ?? undefined
		}
	}

	private async getOrCreateBuiltinSourceEntity(existingEntities: PluginMarketplaceSource[] = []) {
		const existing =
			existingEntities.find(
				(entity) => this.isBuiltinCacheEntity(entity) && entity.url === BUILTIN_MARKETPLACE_URL
			) ??
			(await this.sourceRepository.findOne({
				where: {
					...(RequestContext.currentTenantId() ? { tenantId: RequestContext.currentTenantId() } : {}),
					organizationId: IsNull(),
					name: BUILTIN_SOURCE_CACHE_NAME,
					type: 'url',
					url: BUILTIN_MARKETPLACE_URL
				}
			}))

		if (existing) {
			return existing
		}

		const entity = this.sourceRepository.create({
			name: BUILTIN_SOURCE_CACHE_NAME,
			type: 'url',
			url: BUILTIN_MARKETPLACE_URL,
			enabled: true,
			priority: 0,
			tenantId: RequestContext.currentTenantId(),
			organizationId: null,
			lastIndexStatus: 'idle'
		})

		return this.sourceRepository.save(entity)
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
			lastCatalog: this.readCachedCatalog(entity.lastCatalog),
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

		const url = this.normalizeOptionalString(input.url ?? existing?.url)
		if (!url) {
			throw new BadRequestException('Marketplace source url is required')
		}
		if (type === 'url' && !/^https?:\/\//i.test(url)) {
			throw new BadRequestException('Static index URL sources must use http(s)')
		}

		const name = this.normalizeOptionalString(input.name ?? existing?.name) ?? this.inferSourceName(url)
		const priority = Number.isFinite(Number(input.priority ?? existing?.priority))
			? Number(input.priority ?? existing?.priority)
			: 100

		return {
			name,
			type,
			url,
			ref: this.normalizeOptionalString(input.ref) ?? existing?.ref ?? null,
			sparsePath: this.normalizeOptionalString(input.sparsePath) ?? existing?.sparsePath ?? null,
			enabled: input.enabled ?? existing?.enabled ?? true,
			priority
		}
	}

	private async loadCatalog(source: MarketplaceSourceRecord): Promise<NormalizedMarketplaceCatalog> {
		if (source.lastCatalog) {
			if (this.isSourceCacheExpired(source)) {
				this.scheduleSourceRefresh(source)
			}
			return source.lastCatalog
		}

		return this.refreshSourceCache(source)
	}

	private isSourceCacheExpired(source: MarketplaceSourceRecord) {
		const timestamp = this.toTimestamp(source.lastIndexedAt)
		if (!timestamp) {
			return true
		}
		return Date.now() - timestamp >= MARKETPLACE_CACHE_TTL_MS
	}

	private scheduleSourceRefresh(source: MarketplaceSourceRecord) {
		const key = this.getSourceRefreshKey(source)
		if (this.refreshJobs.has(key)) {
			return
		}

		const job = this.refreshSourceCache(source)
			.then(() => undefined)
			.catch((error) => {
				this.logger.warn(
					`Failed to refresh stale plugin marketplace source "${source.name}": ${this.toErrorMessage(error)}`
				)
			})
			.finally(() => {
				this.refreshJobs.delete(key)
			})

		this.refreshJobs.set(key, job)
	}

	private getSourceRefreshKey(source: MarketplaceSourceRecord) {
		return source.entity?.id ?? `${source.id}:${source.url}`
	}

	private async refreshSourceCache(source: MarketplaceSourceRecord): Promise<NormalizedMarketplaceCatalog> {
		try {
			const catalog = await this.fetchSourceCatalog(source)
			await this.persistSourceCatalog(source, catalog)
			return catalog
		} catch (error) {
			await this.persistSourceRefreshFailure(source, error)
			const cachedCatalog = this.readCachedCatalog(source.entity?.lastCatalog)
			if (cachedCatalog) {
				source.lastCatalog = cachedCatalog
				return cachedCatalog
			}
			throw error
		}
	}

	private async persistSourceCatalog(source: MarketplaceSourceRecord, catalog: NormalizedMarketplaceCatalog) {
		const indexedAt = new Date()
		source.lastCatalog = catalog
		source.lastIndexStatus = 'success'
		source.lastIndexedAt = indexedAt
		source.lastIndexError = null

		if (!source.entity) {
			return
		}

		source.entity.lastCatalog = catalog
		source.entity.lastIndexStatus = 'success'
		source.entity.lastIndexedAt = indexedAt
		source.entity.lastIndexError = null
		const userId = RequestContext.currentUserId()
		if (userId) {
			source.entity.updatedById = userId
		}
		await this.sourceRepository.save(source.entity)
	}

	private async persistSourceRefreshFailure(source: MarketplaceSourceRecord, error: unknown) {
		const message = this.toErrorMessage(error)
		source.lastIndexStatus = 'failed'
		source.lastIndexError = message

		if (!source.entity) {
			return
		}

		source.entity.lastIndexStatus = 'failed'
		source.entity.lastIndexError = message
		await this.sourceRepository.save(source.entity)
	}

	private async fetchSourceCatalog(source: MarketplaceSourceRecord): Promise<NormalizedMarketplaceCatalog> {
		let catalog: NormalizedMarketplaceCatalog
		if (source.type === 'github') {
			catalog = await this.fetchGithubCatalog(source)
		} else if (source.type === 'git') {
			catalog = await this.fetchGitCatalog(source)
		} else {
			const raw = await this.fetchJson(source.url)
			catalog = this.normalizeCatalog(raw, source)
		}

		return this.enrichCatalogWithNpmDownloads(catalog)
	}

	private async fetchGithubCatalog(source: MarketplaceSourceRecord): Promise<NormalizedMarketplaceCatalog> {
		const repository = this.parseGithubRepository(source.url)
		if (!repository) {
			throw new BadRequestException('GitHub marketplace sources must be owner/repo or a GitHub URL')
		}

		const sparsePath = source.sparsePath ?? repository.path
		const refs = this.uniqueStrings([source.ref, repository.ref, 'main', 'master'])
		const candidatePaths = this.buildCandidatePaths(sparsePath)
		let lastError: string | null = null

		for (const ref of refs) {
			for (const candidatePath of candidatePaths) {
				const rawUrl = this.buildGithubRawUrl(repository.owner, repository.repo, ref, candidatePath)
				try {
					const raw = await this.tryFetchJson(rawUrl)
					if (raw !== null) {
						return this.normalizeCatalog(raw, source)
					}
				} catch (error) {
					lastError = this.toErrorMessage(error)
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
			return this.normalizeCatalog(raw, source)
		} finally {
			await rm(directory, { recursive: true, force: true })
		}
	}

	private async readFirstCatalogFile(directory: string, sparsePath?: string | null) {
		const root = resolve(directory)
		let lastError: string | null = null

		for (const candidate of this.buildCandidatePaths(sparsePath)) {
			const filePath = resolve(root, candidate)
			if (!filePath.startsWith(root)) {
				continue
			}
			try {
				const text = await readFile(filePath, 'utf8')
				return JSON.parse(text)
			} catch (error) {
				lastError = this.toErrorMessage(error)
			}
		}

		throw new BadRequestException(lastError ?? 'No marketplace manifest was found in the git repository')
	}

	private normalizeCatalog(raw: unknown, source: MarketplaceSourceRecord): NormalizedMarketplaceCatalog {
		const record = readRecord(raw)
		const plugins = this.extractRegistryItems(raw)
			.map((item, index) => this.normalizeRegistryPlugin(item, source, index))
			.filter((item): item is MarketplaceRegistryPlugin => !!item)
		const updatedAt = this.normalizeOptionalString(record?.updatedAt) ?? new Date().toISOString()

		return {
			updatedAt,
			total: plugins.length,
			plugins,
			official: this.readStringArray(record?.official),
			partner: this.readStringArray(record?.partner),
			community: this.readStringArray(record?.community)
		}
	}

	private readCachedCatalog(value: unknown): NormalizedMarketplaceCatalog | null {
		if (!isRecord(value)) {
			return null
		}
		if (Array.isArray(value.plugins)) {
			return {
				updatedAt: this.normalizeOptionalString(value.updatedAt),
				total: Number(value.total ?? value.plugins.length),
				plugins: value.plugins.filter(isRecord) as MarketplaceRegistryPlugin[],
				official: this.readStringArray(value.official),
				partner: this.readStringArray(value.partner),
				community: this.readStringArray(value.community)
			}
		}
		return null
	}

	private extractRegistryItems(raw: unknown): JsonRecord[] {
		if (Array.isArray(raw)) {
			return raw.filter(isRecord)
		}
		const record = readRecord(raw)
		if (!record) {
			return []
		}

		for (const key of ['plugins', 'items']) {
			if (Array.isArray(record[key])) {
				return record[key].filter(isRecord)
			}
		}

		const xpertPlugin = readRecord(record.xpertPlugin) ?? readRecord(record.xpertAiPlugin)
		const marketplace = readRecord(record.marketplace) ?? readRecord(xpertPlugin?.marketplace)
		if (Array.isArray(marketplace?.plugins)) {
			return marketplace.plugins.filter(isRecord)
		}
		if (marketplace && this.looksLikePlugin(marketplace)) {
			return [this.mergePackageJsonPlugin(record, marketplace)]
		}

		const meta =
			readRecord(record.plugin) ??
			readRecord(record.meta) ??
			readRecord(xpertPlugin?.meta) ??
			(xpertPlugin && this.looksLikePlugin(xpertPlugin) ? xpertPlugin : null)
		if (meta && this.looksLikePlugin(meta)) {
			return [this.mergePackageJsonPlugin(record, meta)]
		}

		if (this.looksLikePlugin(record)) {
			return [record]
		}

		return []
	}

	private mergePackageJsonPlugin(packageJson: JsonRecord, plugin: JsonRecord): JsonRecord {
		const pluginInterface = readRecord(plugin.interface) ?? readRecord(packageJson.interface) ?? {}
		return {
			name: plugin.name ?? packageJson.name,
			version: plugin.version ?? packageJson.version,
			displayName:
				plugin.displayName ??
				plugin.title ??
				pluginInterface.displayName ??
				packageJson.displayName ??
				packageJson.name,
			description:
				plugin.description ??
				packageJson.description ??
				pluginInterface.shortDescription ??
				pluginInterface.longDescription ??
				'',
			category: plugin.category ?? pluginInterface.category ?? 'integration',
			author: plugin.author ?? packageJson.author,
			homepage: plugin.homepage ?? packageJson.homepage,
			repository: plugin.repository ?? packageJson.repository,
			...plugin
		}
	}

	private normalizeRegistryPlugin(
		input: JsonRecord,
		source: MarketplaceSourceRecord,
		index: number
	): MarketplaceRegistryPlugin | null {
		const name = this.normalizeOptionalString(input.name ?? input.pluginName ?? input.packageName)
		if (!name) {
			return null
		}
		const pluginInterface = readRecord(input.interface) ?? {}
		const entrySource = this.normalizeMarketplacePluginSource(input.source, source)

		const item: MarketplaceRegistryPlugin = {
			...input,
			name,
			packageName: this.normalizeOptionalString(input.packageName) ?? name,
			version: this.normalizeOptionalString(input.version) ?? null,
			displayName: input.displayName ?? input.title ?? pluginInterface.displayName ?? name,
			description: input.description ?? pluginInterface.shortDescription ?? pluginInterface.longDescription ?? '',
			category: input.category ?? pluginInterface.category ?? 'integration',
			keywords: Array.isArray(input.keywords) ? input.keywords.filter((value) => typeof value === 'string') : [],
			targetApps: Array.isArray(input.targetApps)
				? input.targetApps.filter((value) => typeof value === 'string')
				: [],
			targetAppMeta: readRecord(input.targetAppMeta) ?? {},
			sourceId: source.id,
			sourceName: source.name,
			source: entrySource,
			policy: readRecord(input.policy) ?? undefined,
			interface: Object.keys(pluginInterface).length ? pluginInterface : undefined,
			defaultPrompt: this.readStringArray(pluginInterface.defaultPrompt),
			_marketplaceIndex: index
		}

		return item
	}

	private normalizeMarketplacePluginSource(value: unknown, source: MarketplaceSourceRecord) {
		const sourceRecord = readRecord(value)
		if (sourceRecord) {
			const kind = this.normalizeOptionalString(sourceRecord.source ?? sourceRecord.type)
			return {
				...sourceRecord,
				...(kind ? { type: kind, source: kind } : {})
			}
		}

		const pathSource = this.normalizeOptionalString(value)
		if (pathSource) {
			return {
				type: 'local',
				source: 'local',
				path: pathSource
			}
		}

		return {
			type: source.builtin ? 'marketplace' : source.type,
			source: source.builtin ? 'marketplace' : source.type,
			url: source.url
		}
	}

	private async enrichCatalogWithNpmDownloads(
		catalog: NormalizedMarketplaceCatalog
	): Promise<NormalizedMarketplaceCatalog> {
		const packageNames = this.uniqueStrings(
			catalog.plugins.map((plugin) => this.getNpmPackageName(plugin)).filter(Boolean)
		)
		if (!packageNames.length) {
			return catalog
		}

		const downloadsByPackageName = await this.fetchNpmDownloadCounts(packageNames)
		if (!downloadsByPackageName.size) {
			return catalog
		}

		return {
			...catalog,
			plugins: catalog.plugins.map((plugin) => {
				const packageName = this.getNpmPackageName(plugin)
				const lastMonth = packageName ? downloadsByPackageName.get(packageName) : undefined
				if (typeof lastMonth !== 'number') {
					return plugin
				}

				return {
					...plugin,
					downloads: {
						...(readRecord(plugin.downloads) ?? {}),
						lastMonth
					}
				}
			})
		}
	}

	private async fetchNpmDownloadCounts(packageNames: string[]) {
		const result = new Map<string, number>()

		for (let index = 0; index < packageNames.length; index += NPM_DOWNLOADS_CONCURRENCY) {
			const batch = packageNames.slice(index, index + NPM_DOWNLOADS_CONCURRENCY)
			const entries = await Promise.all(
				batch.map(
					async (packageName): Promise<[string, number | null]> => [
						packageName,
						await this.fetchNpmDownloadCount(packageName)
					]
				)
			)

			for (const [packageName, downloads] of entries) {
				if (typeof downloads === 'number') {
					result.set(packageName, downloads)
				}
			}
		}

		return result
	}

	private async fetchNpmDownloadCount(packageName: string) {
		const url = `https://api.npmjs.org/downloads/point/last-month/${encodeURIComponent(packageName)}`
		try {
			const response = await fetch(url)
			if (!response.ok) {
				throw new Error(`npm downloads API returned ${response.status}`)
			}
			const data = await response.json()
			return typeof data?.downloads === 'number' ? data.downloads : null
		} catch (error) {
			this.logger.warn(`Failed to load npm downloads for "${packageName}": ${this.toErrorMessage(error)}`)
			return null
		}
	}

	private getNpmPackageName(plugin: MarketplaceRegistryPlugin) {
		const source = readRecord(plugin.source)
		const sourceType = this.normalizeOptionalString(source?.type)?.toLowerCase()
		const sourceUrl = this.normalizeOptionalString(source?.url)
		const packageNameFromUrl = sourceUrl ? this.extractNpmPackageNameFromUrl(sourceUrl) : null
		if (sourceType !== 'npm' && !packageNameFromUrl) {
			return null
		}

		const packageName =
			packageNameFromUrl ??
			this.normalizeOptionalString(source?.packageName) ??
			this.normalizeOptionalString(plugin.packageName) ??
			this.normalizeOptionalString(plugin.name)

		return packageName ? normalizePluginName(packageName) : null
	}

	private extractNpmPackageNameFromUrl(value: string) {
		try {
			const url = new URL(value)
			if (!/(^|\.)npmjs\.com$/i.test(url.hostname)) {
				return null
			}
			const marker = '/package/'
			const markerIndex = url.pathname.indexOf(marker)
			if (markerIndex < 0) {
				return null
			}
			const encodedPackageName = url.pathname.slice(markerIndex + marker.length).replace(/\/+$/, '')
			return this.normalizeOptionalString(decodeURIComponent(encodedPackageName))
		} catch {
			return this.looksLikeNpmPackageName(value) ? value.trim() : null
		}
	}

	private looksLikeNpmPackageName(value: string) {
		return /^(@[^/\s]+\/)?[a-z0-9._~-]+$/i.test(value.trim())
	}

	private mergeInstalledPluginMeta(
		plugin: MarketplaceRegistryPlugin,
		loadedMetaByName: Map<string, PluginMeta>
	): MarketplaceRegistryPlugin {
		const loadedMeta = this.findLoadedMeta(plugin, loadedMetaByName)
		if (!loadedMeta) {
			return plugin
		}

		return {
			...plugin,
			displayName: plugin.displayName ?? loadedMeta.displayName,
			description: plugin.description ?? loadedMeta.description,
			icon: plugin.icon ?? loadedMeta.icon,
			keywords: plugin.keywords?.length ? plugin.keywords : (loadedMeta.keywords ?? []),
			targetApps: this.uniqueStrings([...(plugin.targetApps ?? []), ...(loadedMeta.targetApps ?? [])]),
			targetAppMeta: this.mergeTargetAppMeta(
				readRecord(plugin.targetAppMeta) ?? {},
				readRecord(loadedMeta.targetAppMeta) ?? {}
			)
		}
	}

	private mergeTargetAppMeta(registryMeta: JsonRecord, loadedMeta: JsonRecord) {
		const keys = this.uniqueStrings([...Object.keys(registryMeta), ...Object.keys(loadedMeta)])
		const merged: JsonRecord = {}

		for (const key of keys) {
			const registryEntry = readRecord(registryMeta[key]) ?? {}
			const loadedEntry = readRecord(loadedMeta[key]) ?? {}
			merged[key] = {
				...registryEntry,
				...loadedEntry,
				types: this.uniqueStrings([...(registryEntry.types ?? []), ...(loadedEntry.types ?? [])]),
				capabilities: this.uniqueStrings([
					...(registryEntry.capabilities ?? []),
					...(loadedEntry.capabilities ?? [])
				]),
				marketplace: this.mergeMarketplaceMetadata(registryEntry.marketplace, loadedEntry.marketplace),
				runtime: {
					...(readRecord(registryEntry.runtime) ?? {}),
					...(readRecord(loadedEntry.runtime) ?? {})
				}
			}
		}

		return merged
	}

	private mergeMarketplaceMetadata(registryValue: unknown, loadedValue: unknown) {
		const registry = readRecord(registryValue) ?? {}
		const loaded = readRecord(loadedValue) ?? {}
		return {
			...registry,
			...loaded,
			contents: this.mergeContributions(registry.contents, loaded.contents)
		}
	}

	private mergeContributions(...groups: unknown[]): PluginMarketplaceContribution[] {
		const byKey = new Map<string, PluginMarketplaceContribution>()

		for (const group of groups) {
			if (!Array.isArray(group)) {
				continue
			}
			for (const item of group) {
				if (!isRecord(item) || typeof item.name !== 'string' || typeof item.type !== 'string') {
					continue
				}
				const key = `${item.type}:${item.id ?? item.name}`
				byKey.set(key, {
					...(byKey.get(key) ?? {}),
					...(item as PluginMarketplaceContribution)
				})
			}
		}

		return Array.from(byKey.values())
	}

	private toMarketplaceItem(
		plugin: MarketplaceRegistryPlugin,
		targetApp: string | undefined,
		installedContext: InstalledPluginContext
	) {
		const installed = this.isInstalled(plugin, installedContext.installedNames)
		const contributions = this.getMarketplaceContributions(plugin, targetApp)

		return {
			...plugin,
			sourceId: plugin.sourceId,
			sourceName: plugin.sourceName,
			installed,
			contributions,
			operationSummary: this.countOperations(contributions),
			marketplacePlugin: plugin
		}
	}

	private getMarketplaceContributions(plugin: MarketplaceRegistryPlugin, targetApp?: string) {
		if (!targetApp) {
			return Object.values(readRecord(plugin.targetAppMeta) ?? {}).flatMap((metadata) =>
				this.getContributionList(readRecord(metadata)?.marketplace)
			)
		}

		const targetMetadata = readRecord(readRecord(plugin.targetAppMeta)?.[targetApp])
		return this.getContributionList(targetMetadata?.marketplace)
	}

	private getContributionList(value: unknown): PluginMarketplaceContribution[] {
		const marketplace = readRecord(value)
		if (!Array.isArray(marketplace?.contents)) {
			return []
		}
		return marketplace.contents.filter(
			(item): item is PluginMarketplaceContribution =>
				isRecord(item) && typeof item.name === 'string' && typeof item.type === 'string'
		)
	}

	private countOperations(contributions: PluginMarketplaceContribution[]) {
		const operations = contributions.flatMap((item) =>
			Array.isArray(item.operations) ? (item.operations as PluginMarketplaceOperation[]) : []
		)
		return {
			total: operations.length,
			read: operations.filter((operation) => operation.access === 'read').length,
			write: operations.filter((operation) => operation.access === 'write').length,
			admin: operations.filter((operation) => operation.access === 'admin').length
		}
	}

	private matchesTargetApp(plugin: MarketplaceRegistryPlugin, targetApp?: string) {
		if (!targetApp?.trim()) {
			return true
		}
		const metadata = readRecord(plugin.targetAppMeta)?.[targetApp]
		return Boolean(plugin.targetApps?.includes(targetApp) || metadata)
	}

	private matchesSearch(plugin: MarketplaceRegistryPlugin, search?: string) {
		const normalized = search?.trim().toLowerCase()
		if (!normalized) {
			return true
		}

		const values = [
			plugin.name,
			plugin.packageName,
			plugin.displayName,
			plugin.description,
			plugin.author,
			...(Array.isArray(plugin.keywords) ? plugin.keywords : [])
		]

		return values
			.flatMap((value) => this.searchStrings(value))
			.some((value) => value.toLowerCase().includes(normalized))
	}

	private async buildInstalledContext(): Promise<InstalledPluginContext> {
		const organizationId = this.getCurrentOrganizationId()
		const installedNames = new Set<string>()
		const loadedMetaByName = new Map<string, PluginMeta>()

		const addName = (name?: string | null) => {
			const normalized = this.normalizeOptionalString(name)
			if (normalized) {
				installedNames.add(normalizePluginName(normalized))
			}
		}
		const addLoadedMeta = (meta: PluginMeta | undefined, ...names: Array<string | undefined>) => {
			if (!meta) {
				return
			}
			for (const name of names) {
				const normalized = this.normalizeOptionalString(name)
				if (normalized) {
					loadedMetaByName.set(normalizePluginName(normalized), meta)
				}
			}
		}

		for (const plugin of this.loadedPlugins) {
			if (plugin.organizationId !== organizationId && plugin.organizationId !== GLOBAL_ORGANIZATION_SCOPE) {
				continue
			}
			addName(plugin.name)
			addName(plugin.packageName)
			addName(plugin.instance?.meta?.name)
			addLoadedMeta(plugin.instance?.meta, plugin.name, plugin.packageName, plugin.instance?.meta?.name)
		}

		const instances = await this.pluginInstanceService.findVisibleInOrganization(organizationId)
		for (const instance of instances) {
			addName(instance.pluginName)
			addName(instance.packageName)
		}

		return {
			installedNames,
			loadedMetaByName
		}
	}

	private findLoadedMeta(plugin: MarketplaceRegistryPlugin, loadedMetaByName: Map<string, PluginMeta>) {
		const names = [plugin.name, plugin.packageName, plugin.marketplacePluginName]
		for (const name of names) {
			const normalized = this.normalizeOptionalString(name)
			if (!normalized) {
				continue
			}
			const meta = loadedMetaByName.get(normalizePluginName(normalized))
			if (meta) {
				return meta
			}
		}
		return null
	}

	private isInstalled(plugin: MarketplaceRegistryPlugin, installedNames: Set<string>) {
		return [plugin.name, plugin.packageName]
			.map((name) => this.normalizeOptionalString(name))
			.filter((name): name is string => !!name)
			.some((name) => installedNames.has(normalizePluginName(name)))
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
		const organizationId = this.getCurrentOrganizationId()
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

	private getOrganizationValue(organizationId?: string | null) {
		return !organizationId || organizationId === GLOBAL_ORGANIZATION_SCOPE ? null : organizationId
	}

	private getCurrentOrganizationId() {
		return RequestContext.getOrganizationId() ?? GLOBAL_ORGANIZATION_SCOPE
	}

	private assertSuperAdmin() {
		if (!RequestContext.hasRole(RolesEnum.SUPER_ADMIN)) {
			throw new ForbiddenException('Only SuperAdmin users can manage the plugin marketplace')
		}
	}

	private looksLikePlugin(value: JsonRecord) {
		return Boolean(value.name || value.targetApps || value.targetAppMeta)
	}

	private buildCandidatePaths(sparsePath?: string | null) {
		const base = this.normalizePath(sparsePath)
		const candidates = [
			'.agents/plugins/marketplace.json',
			'.claude-plugin/marketplace.json',
			'plugins/index.json',
			'plugin-marketplace.json',
			'marketplace.json',
			'index.json',
			'.xpert/marketplace.json',
			'.xpert/plugin-marketplace.json',
			'.xpertai-plugin/plugin.json',
			'plugin.json',
			'package.json'
		]

		if (!base) {
			return candidates
		}
		if (/\.(json|jsonc)$/i.test(base)) {
			return [base]
		}

		return candidates.map((candidate) => `${base}/${candidate}`)
	}

	private normalizePath(value?: string | null) {
		return this.normalizeOptionalString(value)?.replace(/^\/+|\/+$/g, '') ?? ''
	}

	private buildGithubRawUrl(owner: string, repo: string, ref: string, filePath: string) {
		const encodedPath = filePath
			.split('/')
			.filter(Boolean)
			.map((segment) => encodeURIComponent(segment))
			.join('/')
		return `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(ref)}/${encodedPath}`
	}

	private parseGithubRepository(value: string) {
		const input = value.trim()
		const ssh = /^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/i.exec(input)
		if (ssh) {
			return {
				owner: ssh[1],
				repo: ssh[2].replace(/\.git$/i, ''),
				ref: null,
				path: null
			}
		}

		const https = /^https?:\/\/github\.com\/([^/]+)\/([^/#?]+)(?:\/tree\/([^/]+)\/?(.*))?/i.exec(input)
		if (https) {
			return {
				owner: https[1],
				repo: https[2].replace(/\.git$/i, ''),
				ref: https[3] ?? null,
				path: https[4] ?? null
			}
		}

		const shorthand = /^([^/\s]+)\/([^/\s]+)$/i.exec(input)
		if (shorthand) {
			return {
				owner: shorthand[1],
				repo: shorthand[2].replace(/\.git$/i, ''),
				ref: null,
				path: null
			}
		}

		return null
	}

	private async fetchJson(url: string) {
		const response = await fetch(url)
		if (!response.ok) {
			throw new BadRequestException(`Failed to fetch marketplace index (${response.status})`)
		}
		return response.json()
	}

	private async tryFetchJson(url: string) {
		const response = await fetch(url)
		if (response.status === 404) {
			return null
		}
		if (!response.ok) {
			throw new BadRequestException(`Failed to fetch marketplace index (${response.status})`)
		}
		return response.json()
	}

	private getLatestCatalogDate(catalogs: NormalizedMarketplaceCatalog[]) {
		const dates = catalogs
			.map((catalog) => catalog.updatedAt)
			.filter((value): value is string => typeof value === 'string' && !!value)
			.map((value) => new Date(value).getTime())
			.filter((value) => Number.isFinite(value))

		if (!dates.length) {
			return null
		}

		return new Date(Math.max(...dates)).toISOString()
	}

	private mergeCatalogNames(catalogs: NormalizedMarketplaceCatalog[], key: 'official' | 'partner' | 'community') {
		return Array.from(new Set(catalogs.flatMap((catalog) => catalog[key] ?? [])))
	}

	private inferSourceName(url: string) {
		const github = this.parseGithubRepository(url)
		if (github) {
			return `${github.owner}/${github.repo}`
		}

		try {
			return new URL(url).hostname
		} catch {
			return url
		}
	}

	private searchStrings(value: unknown): string[] {
		if (typeof value === 'string') {
			return [value]
		}
		if (Array.isArray(value)) {
			return value.flatMap((item) => this.searchStrings(item))
		}
		if (isRecord(value)) {
			return Object.values(value).flatMap((item) => this.searchStrings(item))
		}
		return []
	}

	private uniqueStrings(values: unknown[]) {
		return Array.from(
			new Set(
				values
					.flat()
					.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
					.map((value) => value.trim())
			)
		)
	}

	private readStringArray(value: unknown) {
		return Array.isArray(value)
			? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
			: []
	}

	private normalizeOptionalString(value: unknown) {
		return typeof value === 'string' && value.trim() ? value.trim() : null
	}

	private toTimestamp(value?: Date | string | null) {
		if (!value) {
			return null
		}
		const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime()
		return Number.isFinite(timestamp) ? timestamp : null
	}

	private toErrorMessage(error: unknown) {
		if (error instanceof Error && error.message.trim()) {
			return error.message
		}
		return String(error)
	}
}

function isRecord(value: unknown): value is JsonRecord {
	return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function readRecord(value: unknown): JsonRecord | null {
	return isRecord(value) ? value : null
}

function parsePositiveInteger(value: unknown, fallback: number) {
	const parsed = Number(value)
	return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}
