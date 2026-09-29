import { EntityManager, Repository, SelectQueryBuilder } from 'typeorm'
import { PluginMarketplaceService } from './plugin-marketplace.service'
import { PluginMarketplaceSource } from './plugin-marketplace-source.entity'
import { PluginMarketplaceRegistryItem } from './plugin-marketplace-registry-item.entity'
import { PluginInstanceService } from '../plugin-instance.service'
import { MarketplaceCache, MarketplaceJobs } from './plugin-marketplace-cache'
import { marketplaceIconAsset, toMarketplaceSummary } from './plugin-marketplace-summary'
import type { PluginMarketplaceItem } from '@xpert-ai/contracts'

jest.mock('@xpert-ai/plugin-sdk', () => ({
	GLOBAL_ORGANIZATION_SCOPE: '__global__',
	SYSTEM_GLOBAL_SCOPE: 'system:global',
	derivePluginArtifactNamespace: jest.fn((packageName: string) =>
		packageName
			.trim()
			.replace(/^@[^/]+\//, '')
			.replace(/^plugin[-_]/, '')
			.replace(/([a-z0-9])([A-Z])/g, '$1_$2')
			.replace(/[^A-Za-z0-9]+/g, '_')
			.replace(/_+/g, '_')
			.replace(/^_+|_+$/g, '')
			.toLowerCase()
	),
	resolveTenantGlobalScopeKey: jest.fn((tenantId?: string | null) =>
		tenantId && tenantId !== 'default-tenant' ? `tenant:${tenantId}:global` : '__global__'
	),
	RequestContext: {
		getOrganizationId: jest.fn(() => 'org-1'),
		getScope: jest.fn(() => ({
			tenantId: 'tenant-1',
			organizationId: 'org-1'
		})),
		currentTenantId: jest.fn(() => 'tenant-1'),
		currentUserId: jest.fn(() => 'user-1'),
		hasRole: jest.fn(() => false)
	}
}))

jest.mock('../plugin-instance.service', () => ({
	PluginInstanceService: class PluginInstanceService {}
}))

jest.mock('./plugin-marketplace-registry-item.entity', () => ({
	PLUGIN_MARKETPLACE_REGISTRY_SECTIONS: ['marketplace', 'official', 'partner', 'community'],
	PluginMarketplaceRegistryItem: class PluginMarketplaceRegistryItem {}
}))

jest.mock('./plugin-marketplace-source.entity', () => ({
	PLUGIN_MARKETPLACE_SOURCE_TYPES: ['url', 'github', 'git'],
	PluginMarketplaceSource: class PluginMarketplaceSource {}
}))

function createService(registryItems: PluginMarketplaceRegistryItem[] = []) {
	const sources = new Repository(PluginMarketplaceSource, {} as EntityManager)
	const registry = new Repository(PluginMarketplaceRegistryItem, {} as EntityManager)
	const source = Object.assign(new PluginMarketplaceSource(), {
		id: 'cache-1',
		name: '__xpert_builtin_plugin_marketplace_source__',
		type: 'url',
		url: 'https://xpert-ai.github.io/xpert-plugin-registry/plugins/index.json',
		lastIndexedAt: new Date(),
		lastCatalog: {
			updatedAt: null,
			total: 1,
			plugins: [
				{
					name: '@example/cached',
					targetApps: ['xpert'],
					source: { type: 'npm', packageName: '@example/cached' }
				}
			]
		}
	})
	jest.spyOn(sources, 'find').mockResolvedValue([source])
	jest.spyOn(sources, 'findOne').mockResolvedValue(source)
	jest.spyOn(sources, 'save').mockImplementation(async (entity) => Object.assign(source, entity))
	jest.spyOn(sources, 'createQueryBuilder').mockImplementation(() => {
		let patch: Partial<PluginMarketplaceSource> = {}
		let claiming = false
		const builder = {
			update: () => builder,
			where: () => builder,
			andWhere: () => builder,
			setParameter: () => builder,
			set: (value: Partial<PluginMarketplaceSource>) => {
				patch = value
				return builder
			},
			returning: () => {
				claiming = true
				return builder
			},
			execute: async () => {
				if (claiming) return { raw: [{ revision: '1' }], affected: 1 }
				Object.assign(source, patch)
				return { affected: 1 }
			}
		}
		return builder as unknown as SelectQueryBuilder<PluginMarketplaceSource>
	})
	jest.spyOn(registry, 'find').mockResolvedValue(registryItems)
	const instances = { findVisibleInOrganization: jest.fn().mockResolvedValue([]) } as unknown as PluginInstanceService
	return {
		service: new PluginMarketplaceService(sources, registry, [], instances),
		source,
		sources,
		registry,
		instances
	}
}

afterEach(() => {
	jest.restoreAllMocks()
	jest.useRealTimers()
})

describe('marketplace request isolation', () => {
	it('looks up an icon in its scoped source without rebuilding the list or installed state', async () => {
		const { service, source, sources, registry, instances } = createService()
		const icon = { type: 'image', value: 'data:image/png;base64,aGVsbG8=' }
		source.lastCatalog.plugins[0].icon = icon
		const list = jest.spyOn(service, 'listMarketplace')
		const result = await service.getMarketplacePluginIcon('@example/cached', {
			targetApp: 'xpert',
			sourceId: 'builtin-default'
		})
		expect(result.icon).toEqual(icon)
		expect(list).not.toHaveBeenCalled()
		expect(instances.findVisibleInOrganization).not.toHaveBeenCalled()
		expect(sources.find).not.toHaveBeenCalled()
		expect(registry.find).not.toHaveBeenCalled()
		expect(sources.findOne).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({ tenantId: 'tenant-1' })
			})
		)
	})

	it('does not expose missing, disabled or unrelated sources through the icon lookup', async () => {
		const { service, source, sources } = createService()
		source.name = 'Private source'
		source.id = 'custom-source'
		source.enabled = false
		await expect(service.getMarketplacePluginIcon('@example/cached', { sourceId: source.id })).rejects.toThrow(
			'not found'
		)
		source.enabled = true
		await expect(
			service.getMarketplacePluginIcon('@example/cached', { sourceId: source.id, targetApp: 'other' })
		).rejects.toThrow('not found')
		jest.mocked(sources.findOne).mockResolvedValue(null)
		await expect(service.getMarketplacePluginIcon('@example/cached', { sourceId: source.id })).rejects.toThrow(
			'not found'
		)
		expect(sources.findOne).toHaveBeenLastCalledWith({
			where: [
				expect.objectContaining({ id: source.id, tenantId: 'tenant-1', organizationId: 'org-1' }),
				expect.objectContaining({ id: source.id, tenantId: 'tenant-1' })
			]
		})
	})

	it('hydrates only the requested detail and reads installed state once without nesting marketplacePlugin', async () => {
		const { service, instances } = createService()
		const hydrate = jest
			.spyOn(service['packages'], 'hydratePluginWithNpmBundleManifest')
			.mockImplementation(async (plugin) => plugin)
		const list = jest.spyOn(service, 'listMarketplace')
		const result = await service.getMarketplacePluginContent('@example/cached', { sourceId: 'builtin-default' })
		expect(instances.findVisibleInOrganization).toHaveBeenCalledTimes(1)
		expect(hydrate).toHaveBeenCalledTimes(1)
		expect(list).not.toHaveBeenCalled()
		expect(result.marketplacePlugin).toEqual(expect.objectContaining({ name: '@example/cached' }))
		expect(result.marketplacePlugin).not.toHaveProperty('marketplacePlugin')
	})

	it('backs off failed source refreshes while keeping the persisted catalog visible', async () => {
		const { service, source } = createService()
		source.lastIndexedAt = new Date(0)
		const fetch = jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'))
		expect((await service.listMarketplace({ sourceId: 'builtin-default' })).total).toBe(1)
		await expect(
			service['catalogs']['enriched'].load(
				service['catalogs']['key'](service['createBuiltinSourceRecord'](source)),
				async () => {
					throw new Error('unexpected retry')
				}
			)
		).rejects.toThrow('offline')
		expect((await service.listMarketplace({ sourceId: 'builtin-default' })).total).toBe(1)
		expect(fetch).toHaveBeenCalledTimes(1)
		expect(source.lastIndexStatus).toBe('failed')
	})

	it('serves the persisted catalog without requesting npm, including after a service restart', async () => {
		const fetch = jest.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => undefined))
		for (let i = 0; i < 2; i++) {
			const { service } = createService()
			const result = await service.listMarketplace({ targetApp: 'xpert' })
			expect(result.items[0].name).toBe('@example/cached')
		}
		expect(fetch).not.toHaveBeenCalled()
	})

	it('returns stale catalog data while the upstream refresh is still pending', async () => {
		const fetch = jest.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => undefined))
		const { service, source } = createService()
		source.lastIndexedAt = new Date(0)
		const first = await service.listMarketplace({ targetApp: 'xpert' })
		const second = await service.listMarketplace({ targetApp: 'xpert' })
		expect(first.items[0].name).toBe('@example/cached')
		expect(second.items).toEqual(first.items)
		expect(fetch).toHaveBeenCalledTimes(1)
	})

	it('filters explicitly unrelated platform items before requesting npm', async () => {
		const fetch = jest.spyOn(globalThis, 'fetch')
		const item = Object.assign(new PluginMarketplaceRegistryItem(), {
			packageName: '@example/unavailable',
			targetApps: ['another-app'],
			enabled: true
		})
		const { service } = createService([item])
		expect((await service.listMarketplace({ targetApp: 'xpert', sourceId: 'platform-registry' })).items).toEqual([])
		expect(fetch).not.toHaveBeenCalled()
	})

	it('returns platform cards while npm hydration is still pending', async () => {
		jest.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => undefined))
		const item = Object.assign(new PluginMarketplaceRegistryItem(), {
			packageName: '@example/pending',
			targetApps: ['xpert'],
			enabled: true,
			downloadsUpdatedAt: new Date(),
			targetAppMeta: {}
		})
		const { service } = createService([item])
		const response = await service.listMarketplace({ targetApp: 'xpert', sourceId: 'platform-registry' })
		expect(response.items[0].name).toBe(item.packageName)
	})

	it('does not wait for platform hydration and shares negative npm cache entries', async () => {
		const item = Object.assign(new PluginMarketplaceRegistryItem(), {
			packageName: '@example/unavailable',
			targetApps: ['xpert'],
			enabled: true,
			downloadsUpdatedAt: new Date(),
			targetAppMeta: {}
		})
		const { service } = createService([item])
		const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 404 }))
		const result = await service.listMarketplace({ targetApp: 'xpert', sourceId: 'platform-registry' })
		expect(result.items[0].name).toBe(item.packageName)
		await service['registry'].loadPlatformRegistryCatalog('xpert', true)
		const calls = fetch.mock.calls.length
		await service['packages'].getNpmPackageMetadata(item.packageName)
		await service['packages'].getNpmBundleManifest(item.packageName, null)
		expect(fetch).toHaveBeenCalledTimes(calls)
		expect(fetch.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal)
	})
})

describe('marketplace cache', () => {
	it('isolates refresh keys, coalesces jobs and allows explicit retry after a failure', async () => {
		const jobs = new MarketplaceJobs<string>()
		const failed = jest.fn(async () => {
			throw new Error('offline')
		})
		const first = jobs.run('tenant-a', failed)
		expect(jobs.run('tenant-a', failed)).toBe(first)
		await expect(first).rejects.toThrow('offline')
		await expect(jobs.run('tenant-a', failed)).rejects.toThrow('offline')
		expect(failed).toHaveBeenCalledTimes(1)
		await expect(jobs.run('tenant-b', async () => 'other')).resolves.toBe('other')
		await expect(jobs.run('tenant-a', async () => 'recovered', true)).resolves.toBe('recovered')
		expect(jobs.canStart('tenant-a')).toBe(true)
	})

	it('coalesces concurrent requests and retries cached failures only after the negative TTL', async () => {
		jest.useFakeTimers()
		const cache = new MarketplaceCache<string | null>(1000, 100)
		const loader = jest.fn(async () => null)
		await Promise.all([cache.load('one', loader), cache.load('one', loader)])
		await cache.load('one', loader)
		expect(loader).toHaveBeenCalledTimes(1)
		jest.advanceTimersByTime(101)
		await cache.load('one', loader)
		expect(loader).toHaveBeenCalledTimes(2)
	})

	it('keeps stale data during a failed background refresh and backs off retries', async () => {
		jest.useFakeTimers()
		const cache = new MarketplaceCache<string>(100, 200)
		await cache.load('one', async () => 'cached')
		jest.advanceTimersByTime(101)
		const loader = jest.fn(async () => {
			throw new Error('offline')
		})
		const onError = jest.fn()
		expect(cache.read('one', 'empty', loader, onError)).toBe('cached')
		await expect(cache.load('one', loader)).rejects.toThrow('offline')
		expect(cache.read('one', 'empty', loader, onError)).toBe('cached')
		expect(loader).toHaveBeenCalledTimes(1)
	})
})

describe('marketplace card projection', () => {
	it('decodes base64 only for a matching asset request, never for a summary or a wrong hash', () => {
		const item: PluginMarketplaceItem = {
			name: 'example',
			icon: { type: 'image', value: 'data:image/png;base64,aGVsbG8=' }
		}
		const decode = jest.spyOn(Buffer, 'from')
		const summary = toMarketplaceSummary(item)
		expect(marketplaceIconAsset(item, 'wrong')).toBeNull()
		expect(decode.mock.calls.filter((call) => [...call].includes('base64'))).toHaveLength(0)
		expect(marketplaceIconAsset(item, summary.iconAsset)?.data.toString()).toBe('hello')
		expect(decode.mock.calls.filter((call) => [...call].includes('base64'))).toHaveLength(1)
	})

	it('preserves installation/classification fields without inlining images and action metadata', () => {
		const data = 'data:image/png;base64,aGVsbG8='
		const item: PluginMarketplaceItem = {
			name: '@example/plugin',
			level: 'system',
			installed: true,
			sourceId: 'source-1',
			source: { type: 'npm', packageName: '@example/plugin' },
			icon: { type: 'image', value: data },
			targetAppMeta: {
				xpert: {
					types: ['skill-plugin'],
					marketplace: {
						category: 'productivity',
						contents: [{ type: 'skill', name: 'writer', icon: { type: 'image', value: data } }]
					}
				}
			},
			contributions: [{ type: 'skill', name: 'writer', metadata: { detail: 'large data' } }],
			screenshots: [data],
			marketplacePlugin: { icon: data }
		}
		const summary = toMarketplaceSummary(item)
		expect(summary).toMatchObject({
			name: item.name,
			level: 'system',
			installed: true,
			summary: true,
			contributions: [{ type: 'skill', name: 'writer' }],
			targetAppMeta: { xpert: { marketplace: { category: 'productivity' } } }
		})
		expect(JSON.stringify(summary)).not.toContain('base64')
		expect(summary.marketplacePlugin).toBeUndefined()
		expect(summary.iconAsset).toBe(marketplaceIconAsset(item)?.hash)
		expect(marketplaceIconAsset(item)?.data.toString()).toBe('hello')
		expect(item.icon?.value).toBe(data)
	})
})
