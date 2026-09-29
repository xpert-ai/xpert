import { BadRequestException, NotFoundException } from '@nestjs/common'

import {
	type PluginMarketplaceRegistryItemInput,
	type PluginMarketplaceRegistryItemResponse,
	type PluginMarketplaceSourceResponse
} from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'

import { createHash } from 'node:crypto'
import {
	MarketplaceValueCache,
	MarketplaceLease,
	PluginMarketplaceSharedCache
} from './plugin-marketplace-shared-cache'
import { MarketplaceCache } from './plugin-marketplace-cache'

import { IsNull, Repository } from 'typeorm'

import {
	PLUGIN_MARKETPLACE_REGISTRY_SECTIONS,
	PluginMarketplaceRegistryItem,
	PluginMarketplaceRegistrySection
} from './plugin-marketplace-registry-item.entity'

import { normalizePluginName } from '../types'

import {
	PLATFORM_REGISTRY_SOURCE_ID,
	PLATFORM_REGISTRY_SOURCE_NAME,
	PLATFORM_REGISTRY_SOURCE_URL,
	MARKETPLACE_CACHE_TTL_MS,
	MarketplaceRegistryPlugin,
	NormalizedMarketplaceCatalog,
	readRecord,
	isArtifactNamespace
} from './plugin-marketplace.types'
import { PluginMarketplaceMetadata } from './plugin-marketplace-metadata'
import { PluginMarketplacePackages } from './plugin-marketplace-packages'

/** Tenant registry reads return existing data while optional npm metadata refreshes in the background. */
export class PluginMarketplaceRegistry {
	constructor(
		private readonly registryRepository: Repository<PluginMarketplaceRegistryItem>,
		private readonly metadata: PluginMarketplaceMetadata,
		private readonly packages: PluginMarketplacePackages,
		shared?: PluginMarketplaceSharedCache
	) {
		this.platformCatalogCache =
			shared?.cache('platform-catalog', (value) => metadata.readCachedCatalog(value) ?? undefined, {
				retention: MARKETPLACE_CACHE_TTL_MS * 2
			}) ?? new MarketplaceCache<NormalizedMarketplaceCatalog>()
		this.downloadJobs =
			shared?.cache('registry-downloads', (value) => (typeof value === 'boolean' ? value : undefined)) ??
			new MarketplaceCache<boolean>()
	}
	private readonly downloadJobs: MarketplaceValueCache<boolean>
	private readonly platformCatalogCache: MarketplaceValueCache<NormalizedMarketplaceCatalog>

	async listRegistryItems() {
		this.metadata.assertSuperAdmin()
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
		this.metadata.assertSuperAdmin()
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
		this.metadata.assertSuperAdmin()
		const entity = await this.findRegistryItemEntity(id)
		const normalized = await this.normalizeRegistryItemInput(input, entity)
		await this.assertUniqueRegistryPackage(normalized.packageName, entity.id)

		const packageChanged = normalized.packageName !== entity.packageName
		await this.registryRepository.update(entity.id, {
			...normalized,
			updatedById: RequestContext.currentUserId(),
			...(packageChanged
				? { downloads: null, downloadsStatus: 'idle', downloadsUpdatedAt: null, downloadsError: null }
				: {})
		})
		const saved = await this.findRegistryItemEntity(id)
		this.schedulePlatformRegistryDownloadsRefresh([saved])

		return this.toRegistryItemResponse(saved)
	}

	async deleteRegistryItem(id: string) {
		this.metadata.assertSuperAdmin()
		const entity = await this.findRegistryItemEntity(id)
		await this.registryRepository.delete(entity.id)
		return { success: true }
	}

	includesPlatformRegistry(sourceId?: string) {
		const normalized = this.metadata.normalizeOptionalString(sourceId)
		return !normalized || normalized === PLATFORM_REGISTRY_SOURCE_ID
	}

	createPlatformRegistrySourceResponse(): PluginMarketplaceSourceResponse {
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

	async loadPlatformRegistryCatalog(
		targetApp?: string,
		waitForRefresh = false
	): Promise<NormalizedMarketplaceCatalog> {
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

		// Explicit target declarations can be filtered before any external work.
		const visibleItems = items.filter(
			(item) =>
				!targetApp ||
				!item.targetApps?.length ||
				item.targetApps.includes(targetApp) ||
				!!item.targetAppMeta?.[targetApp]
		)
		const staleItems = visibleItems.filter((item) => this.isRegistryDownloadsCacheExpired(item))
		this.schedulePlatformRegistryDownloadsRefresh(staleItems)

		return this.hydrateRegistryCatalog(visibleItems, waitForRefresh)
	}

	private hydrateRegistryCatalog(items: PluginMarketplaceRegistryItem[], waitForRefresh: boolean) {
		const catalog = this.toPlatformRegistryCatalog(items)
		const key = `${RequestContext.currentTenantId()}:${createHash('sha256').update(JSON.stringify(catalog)).digest('hex')}`
		const hydrate = () => this.packages.enrichCatalogWithNpmPackageData(catalog)
		return waitForRefresh
			? this.platformCatalogCache.load(key, hydrate)
			: this.platformCatalogCache.read(key, catalog, hydrate, (error) =>
					this.metadata.logger.warn(
						`Failed to enrich marketplace registry: ${this.metadata.toErrorMessage(error)}`
					)
				)
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
			artifactNamespace: this.metadata.normalizeOptionalString(item.artifactNamespace) ?? null,
			displayName: this.metadata.readRegistryI18nText(item.displayName, item.displayNameI18n),
			description: this.metadata.readRegistryI18nText(item.description, item.descriptionI18n),
			category: item.category,
			author: item.author,
			icon: item.icon ?? undefined,
			keywords: this.metadata.readStringArray(item.keywords),
			homepage: item.homepage ?? undefined,
			repository: item.repository ?? undefined,
			targetApps: this.metadata.readStringArray(item.targetApps),
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

	async refreshPlatformRegistrySource() {
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
		await this.downloadJobs.load(
			this.downloadKey(items),
			(lease) => this.refreshRegistryDownloadEntities(items, lease),
			true
		)
		await this.hydrateRegistryCatalog(items, true)

		return {
			...this.createPlatformRegistrySourceResponse(),
			lastIndexedAt: this.getLatestRegistryDownloadsDate(items),
			total: items.length
		}
	}

	private schedulePlatformRegistryDownloadsRefresh(items: PluginMarketplaceRegistryItem[]) {
		const refreshableItems = items.filter((item) => item.enabled !== false)
		if (!refreshableItems.length) {
			return
		}
		void Promise.resolve(
			this.downloadJobs.read(
				this.downloadKey(refreshableItems),
				false,
				(lease) => this.refreshRegistryDownloadEntities(refreshableItems, lease),
				(error) =>
					this.metadata.logger.warn(
						`Marketplace downloads refresh failed: ${this.metadata.toErrorMessage(error)}`
					)
			)
		).catch(() => undefined)
	}

	private downloadKey(items: PluginMarketplaceRegistryItem[]) {
		return JSON.stringify([
			RequestContext.currentTenantId(),
			items.map((item) => [item.id, item.packageName, item.downloadsUpdatedAt]).sort()
		])
	}

	private async refreshRegistryDownloadEntities(items: PluginMarketplaceRegistryItem[], lease: MarketplaceLease) {
		const packageNames = this.metadata
			.uniqueStrings(items.map((item) => item.packageName).filter(Boolean))
			.map(normalizePluginName)
		const downloads = await this.packages.fetchNpmDownloadCounts(packageNames)
		const indexedAt = new Date()
		for (const item of items) {
			await lease.assertOwned()
			const count = downloads.get(normalizePluginName(item.packageName))
			const patch: Pick<
				PluginMarketplaceRegistryItem,
				'downloads' | 'downloadsStatus' | 'downloadsUpdatedAt' | 'downloadsError'
			> = {
				downloadsUpdatedAt: indexedAt,
				downloadsStatus: typeof count === 'number' ? 'success' : 'failed',
				...(typeof count === 'number'
					? { downloads: { ...(item.downloads ?? {}), lastMonth: count }, downloadsError: null }
					: {})
			}
			const result = await this.registryRepository.update(
				{
					id: item.id,
					tenantId: item.tenantId ?? IsNull(),
					packageName: item.packageName,
					enabled: true,
					downloadsUpdatedAt: item.downloadsUpdatedAt ?? IsNull()
				},
				patch
			)
			if (result.affected === 1) Object.assign(item, patch)
		}
		return true
	}

	private isRegistryDownloadsCacheExpired(item: PluginMarketplaceRegistryItem) {
		const timestamp = this.metadata.toTimestamp(item.downloadsUpdatedAt)
		if (!timestamp) {
			return true
		}
		return Date.now() - timestamp >= MARKETPLACE_CACHE_TTL_MS
	}

	private getLatestRegistryItemDate(items: PluginMarketplaceRegistryItem[]) {
		const dates = items
			.flatMap((item) => [item.updatedAt, item.downloadsUpdatedAt])
			.map((value) => this.metadata.toTimestamp(value))
			.filter((value): value is number => typeof value === 'number')

		if (!dates.length) {
			return null
		}

		return new Date(Math.max(...dates)).toISOString()
	}

	private getLatestRegistryDownloadsDate(items: PluginMarketplaceRegistryItem[]) {
		const dates = items
			.map((item) => this.metadata.toTimestamp(item.downloadsUpdatedAt))
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
			| 'artifactNamespace'
			| 'displayName'
			| 'displayNameI18n'
			| 'description'
			| 'descriptionI18n'
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
		const packageName = this.metadata.normalizeOptionalString(
			this.inputOrExisting(input.packageName, existing?.packageName)
		)
		const displayName = this.metadata.normalizeI18nText(
			this.inputOrExisting(
				input.displayName,
				existing
					? this.metadata.readRegistryI18nText(existing.displayName, existing.displayNameI18n)
					: undefined
			)
		)
		const description = this.metadata.normalizeI18nText(
			this.inputOrExisting(
				input.description,
				existing
					? this.metadata.readRegistryI18nText(existing.description, existing.descriptionI18n)
					: undefined
			)
		)
		const category = this.metadata.normalizeOptionalString(this.inputOrExisting(input.category, existing?.category))
		const author = this.metadata.normalizeOptionalString(this.inputOrExisting(input.author, existing?.author))
		const targetApps = this.metadata.uniqueStrings(
			this.inputOrExisting(input.targetApps, existing?.targetApps ?? [])
		)
		const section = this.inputOrExisting(input.section, existing?.section ?? 'marketplace')
		const artifactNamespace =
			this.metadata.normalizeOptionalString(
				this.inputOrExisting(input.artifactNamespace, existing?.artifactNamespace)
			) ?? null

		if (!packageName) {
			throw new BadRequestException('packageName is required')
		}
		if (!this.packages.looksLikeNpmPackageName(packageName)) {
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
		if (artifactNamespace && !isArtifactNamespace(artifactNamespace)) {
			throw new BadRequestException(
				'artifactNamespace must contain only lowercase letters, numbers, and underscores'
			)
		}

		const priority = Number.isFinite(Number(this.inputOrExisting(input.priority, existing?.priority)))
			? Number(this.inputOrExisting(input.priority, existing?.priority))
			: 100

		return {
			packageName: normalizePluginName(packageName),
			version:
				this.metadata.normalizeOptionalString(this.inputOrExisting(input.version, existing?.version)) ?? null,
			artifactNamespace,
			displayName: this.metadata.readI18nEnglishFallback(displayName),
			displayNameI18n: typeof displayName === 'string' ? null : displayName,
			description: this.metadata.readI18nEnglishFallback(description),
			descriptionI18n: typeof description === 'string' ? null : description,
			category,
			author,
			icon: this.inputOrExisting(input.icon, existing?.icon) ?? null,
			keywords: this.metadata.uniqueStrings(this.inputOrExisting(input.keywords, existing?.keywords ?? [])),
			homepage:
				this.metadata.normalizeOptionalString(this.inputOrExisting(input.homepage, existing?.homepage)) ?? null,
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
		const tenantId = RequestContext.getScope()?.tenantId ?? RequestContext.currentTenantId()
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
			artifactNamespace:
				this.metadata.normalizeOptionalString(item.artifactNamespace) ??
				this.metadata.resolveMarketplaceArtifactNamespace({
					name: item.packageName,
					packageName: item.packageName
				}),
			displayName: this.metadata.readRegistryI18nText(item.displayName, item.displayNameI18n),
			description: this.metadata.readRegistryI18nText(item.description, item.descriptionI18n),
			category: item.category,
			author: item.author,
			icon: item.icon,
			keywords: this.metadata.readStringArray(item.keywords),
			homepage: item.homepage,
			repository: item.repository,
			targetApps: this.metadata.readStringArray(item.targetApps),
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
}
