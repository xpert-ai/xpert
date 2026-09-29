// Invariants: a Redis lease coordinates upstream work; PostgreSQL xmin fences persisted writes.
// Refreshes update only cache columns and never recreate deleted sources or overwrite source settings.
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { IsNull, Repository } from 'typeorm'
import { createHash } from 'node:crypto'
import { v5 as uuid } from 'uuid'
import { MarketplaceCache } from './plugin-marketplace-cache'
import { PluginMarketplaceMetadata } from './plugin-marketplace-metadata'
import { PluginMarketplaceSource } from './plugin-marketplace-source.entity'
import {
	marketplaceCacheUnavailable,
	MarketplaceLease,
	MarketplaceValueCache,
	PluginMarketplaceSharedCache
} from './plugin-marketplace-shared-cache'
import {
	BUILTIN_MARKETPLACE_URL,
	BUILTIN_SOURCE_CACHE_NAME,
	MARKETPLACE_CACHE_TTL_MS,
	MarketplaceSourceRecord,
	NormalizedMarketplaceCatalog
} from './plugin-marketplace.types'

type Catalog = NormalizedMarketplaceCatalog | null
export class PluginMarketplaceCatalogs {
	private readonly raw: MarketplaceValueCache<Catalog>
	private readonly enriched: MarketplaceValueCache<Catalog>
	private readonly publicCache: MarketplaceValueCache<Catalog>
	constructor(
		private readonly repository: Repository<PluginMarketplaceSource>,
		private readonly metadata: PluginMarketplaceMetadata,
		private readonly fetchCatalog: (
			source: MarketplaceSourceRecord,
			enrich: boolean
		) => Promise<NormalizedMarketplaceCatalog>,
		shared?: PluginMarketplaceSharedCache
	) {
		const decode = (value: unknown) => (value === null ? null : (metadata.readCachedCatalog(value) ?? undefined))
		const make = (name: string) =>
			shared?.cache(name, decode, {
				ttl: MARKETPLACE_CACHE_TTL_MS,
				retention: name === 'public-catalog' ? 86_400_000 : MARKETPLACE_CACHE_TTL_MS * 2
			}) ?? new MarketplaceCache<Catalog>(MARKETPLACE_CACHE_TTL_MS)
		this.raw = make('source-raw')
		this.enriched = make('source-enriched')
		this.publicCache = make('public-catalog')
	}

	async builtin(existing: PluginMarketplaceSource[] = []) {
		const tenantId = RequestContext.currentTenantId()
		const where = {
			tenantId: tenantId ?? IsNull(),
			organizationId: IsNull(),
			name: BUILTIN_SOURCE_CACHE_NAME,
			type: 'url' as const,
			url: BUILTIN_MARKETPLACE_URL
		}
		const found =
			existing.find(
				(entry) => entry.name === BUILTIN_SOURCE_CACHE_NAME && entry.url === BUILTIN_MARKETPLACE_URL
			) ?? (await this.repository.findOne({ where, order: { createdAt: 'ASC', id: 'ASC' } }))
		if (found) return found
		// Deterministic primary keys make first creation atomic without a nullable unique-index migration.
		const id = uuid(
			JSON.stringify(['xpert-marketplace-source', tenantId ?? null, BUILTIN_MARKETPLACE_URL]),
			uuid.URL
		)
		await this.repository
			.createQueryBuilder()
			.insert()
			.values({
				id,
				tenantId,
				organizationId: null,
				name: BUILTIN_SOURCE_CACHE_NAME,
				type: 'url',
				url: BUILTIN_MARKETPLACE_URL,
				enabled: true,
				priority: 0,
				lastIndexStatus: 'idle'
			})
			.orIgnore()
			.execute()
		const result = await this.repository.findOne({ where: { ...where, id } })
		if (!result) throw marketplaceCacheUnavailable()
		return result
	}

	private config(source: MarketplaceSourceRecord) {
		return JSON.stringify([
			source.entity?.tenantId,
			source.entity?.organizationId,
			source.id,
			source.type,
			source.url,
			source.ref ?? null,
			source.sparsePath ?? null,
			source.enabled !== false
		])
	}
	private key(source: MarketplaceSourceRecord) {
		return createHash('sha256')
			.update(this.config(source))
			.update(String(this.metadata.toTimestamp(source.lastIndexedAt) ?? ''))
			.digest('hex')
	}
	private fresh(source: MarketplaceSourceRecord) {
		return this.metadata.toTimestamp(source.lastIndexedAt) > Date.now() - MARKETPLACE_CACHE_TTL_MS
	}
	private warn = (error: unknown) =>
		this.metadata.logger.warn(`Marketplace refresh failed: ${this.metadata.toErrorMessage(error)}`)

	async load(source: MarketplaceSourceRecord): Promise<NormalizedMarketplaceCatalog> {
		if (source.lastCatalog) {
			if (this.fresh(source)) return source.lastCatalog
			return (
				(await this.enriched.read(
					this.key(source),
					source.lastCatalog,
					(lease) => this.refresh(source, true, lease),
					this.warn
				)) ?? source.lastCatalog
			)
		}
		const catalog = await this.raw.load(this.key(source), (lease) => this.refresh(source, false, lease))
		if (!catalog) throw marketplaceCacheUnavailable()
		// Cold lists persist the cheap raw index first; package enrichment remains optional.
		void Promise.resolve(
			this.enriched.read(this.key(source), catalog, (lease) => this.refresh(source, true, lease), this.warn)
		).catch(this.warn)
		return catalog
	}

	async force(source: MarketplaceSourceRecord) {
		const catalog = await this.enriched.load(this.key(source), (lease) => this.refresh(source, true, lease), true)
		if (!catalog) throw marketplaceCacheUnavailable()
		return catalog
	}

	async public(source: MarketplaceSourceRecord) {
		const load = () => this.fetchCatalog(source, false)
		const cached = await this.publicCache.read(source.url, null, load, this.warn)
		try {
			return cached ?? (await this.publicCache.load(source.url, load))
		} catch {
			throw marketplaceCacheUnavailable()
		}
	}

	private async refresh(source: MarketplaceSourceRecord, enrich: boolean, lease: MarketplaceLease) {
		if (!source.entity) return this.fetchCatalog(source, enrich)
		await lease.assertOwned()
		const current = await this.repository.findOne({
			where: { id: source.entity.id, tenantId: source.entity.tenantId ?? IsNull() }
		})
		if (!current) throw marketplaceCacheUnavailable()
		const latest: MarketplaceSourceRecord = {
			...source,
			type: current.type,
			url: current.url,
			ref: current.ref,
			sparsePath: current.sparsePath,
			enabled: current.enabled,
			entity: current,
			lastIndexedAt: current.lastIndexedAt,
			lastCatalog: this.metadata.readCachedCatalog(current.lastCatalog)
		}
		if (this.config(latest) !== this.config(source)) throw marketplaceCacheUnavailable()
		if (
			latest.lastCatalog &&
			this.fresh(latest) &&
			this.metadata.toTimestamp(latest.lastIndexedAt) !== this.metadata.toTimestamp(source.lastIndexedAt)
		)
			return latest.lastCatalog
		const claim = await this.repository
			.createQueryBuilder()
			.update()
			.set({ updatedAt: () => 'CURRENT_TIMESTAMP' })
			.where({
				id: current.id,
				tenantId: current.tenantId ?? IsNull(),
				organizationId: current.organizationId ?? IsNull(),
				type: current.type,
				url: current.url,
				ref: current.ref ?? IsNull(),
				sparsePath: current.sparsePath ?? IsNull(),
				enabled: current.enabled,
				lastIndexedAt: current.lastIndexedAt ?? IsNull()
			})
			.returning('xmin::text AS revision')
			.execute()
		const revision = this.revision(claim.raw)
		if (!revision) throw marketplaceCacheUnavailable()
		try {
			const catalog = await this.fetchCatalog(source, enrich)
			await lease.assertOwned()
			const indexedAt = new Date()
			const result = await this.repository
				.createQueryBuilder()
				.update()
				.set({
					lastCatalog: () => ':catalog::jsonb',
					lastIndexStatus: 'success',
					lastIndexedAt: indexedAt,
					lastIndexError: null
				})
				.where({ id: current.id })
				.andWhere('xmin::text = :revision', { revision })
				.setParameter('catalog', JSON.stringify(catalog))
				.execute()
			if (result.affected !== 1) throw marketplaceCacheUnavailable()
			source.lastCatalog = catalog
			source.lastIndexedAt = indexedAt
			source.lastIndexStatus = 'success'
			source.lastIndexError = null
			return catalog
		} catch (error) {
			await lease.assertOwned()
			await this.repository
				.createQueryBuilder()
				.update()
				.set({ lastIndexStatus: 'failed', lastIndexError: this.metadata.toErrorMessage(error) })
				.where({ id: current.id })
				.andWhere('xmin::text = :revision', { revision })
				.execute()
			throw error
		}
	}

	private revision(raw: unknown): string | undefined {
		if (!Array.isArray(raw) || raw.length !== 1) return undefined
		const row: unknown = raw[0]
		return row && typeof row === 'object' && 'revision' in row && typeof row.revision === 'string'
			? row.revision
			: undefined
	}
}
