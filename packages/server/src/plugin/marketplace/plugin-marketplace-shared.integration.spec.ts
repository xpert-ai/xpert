import { randomUUID } from 'node:crypto'
import { createClient } from 'redis'
import { DataSource, EntitySchema, Repository } from 'typeorm'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { PluginMarketplaceSharedCache } from './plugin-marketplace-shared-cache'
import { RedisLockService } from '../../core/redis/redis-lock.service'
import { PluginMarketplaceCatalogs } from './plugin-marketplace-catalogs'
import { PluginMarketplaceMetadata } from './plugin-marketplace-metadata'
import { PluginMarketplaceSource } from './plugin-marketplace-source.entity'
import { PluginMarketplaceAssets } from './plugin-marketplace-assets'
import { PluginMarketplacePackages } from './plugin-marketplace-packages'
import { MarketplaceSourceRecord, NormalizedMarketplaceCatalog } from './plugin-marketplace.types'

jest.mock('@xpert-ai/plugin-sdk', () => ({
	RequestContext: {
		currentTenantId: jest.fn(() => 'tenant-a'),
		currentUserId: jest.fn(() => 'user-a'),
		getOrganizationId: jest.fn(() => 'org-a'),
		getScope: jest.fn(() => ({ tenantId: 'tenant-a' }))
	},
	GLOBAL_ORGANIZATION_SCOPE: '__global__',
	SYSTEM_GLOBAL_SCOPE: 'system:global',
	resolveTenantGlobalScopeKey: (id: string) => `tenant:${id}:global`,
	derivePluginArtifactNamespace: (name: string) => name
}))
jest.mock('./plugin-marketplace-source.entity', () => ({ PluginMarketplaceSource: class {} }))

const integration =
	process.env.MARKETPLACE_TEST_REDIS_URL && process.env.MARKETPLACE_TEST_POSTGRES_URL ? describe : describe.skip
const decode = (value: unknown) => (typeof value === 'string' || value === null ? value : undefined)
const catalog = (name: string): NormalizedMarketplaceCatalog => ({ updatedAt: null, total: 1, plugins: [{ name }] })
function deferred<T>() {
	let resolve: (value: T) => void
	let reject: (error: Error) => void
	const promise = new Promise<T>((yes, no) => {
		resolve = yes
		reject = no
	})
	return { promise, resolve: (value: T) => resolve(value), reject: (error: Error) => reject(error) }
}

integration('marketplace replicas with shared Redis and PostgreSQL', () => {
	const redisA = createClient({
		url: process.env.MARKETPLACE_TEST_REDIS_URL,
		socket: { connectTimeout: 3000, reconnectStrategy: false }
	})
	const redisB = createClient({
		url: process.env.MARKETPLACE_TEST_REDIS_URL,
		socket: { connectTimeout: 3000, reconnectStrategy: false }
	})
	let sharedA: PluginMarketplaceSharedCache
	let sharedB: PluginMarketplaceSharedCache
	let dbA: DataSource
	let dbB: DataSource
	let repoA: Repository<PluginMarketplaceSource>
	let repoB: Repository<PluginMarketplaceSource>
	const metadata = new PluginMarketplaceMetadata([])
	const schema = `marketplace_test_${randomUUID().replace(/-/g, '')}`
	const sourceSchema = new EntitySchema<PluginMarketplaceSource>({
		name: 'MarketplaceSourceFixture',
		tableName: 'sources',
		schema,
		columns: {
			id: { type: 'uuid', primary: true, generated: 'uuid' },
			tenantId: { type: 'varchar', nullable: true },
			organizationId: { type: 'varchar', nullable: true },
			name: { type: 'varchar' },
			type: { type: 'varchar' },
			url: { type: 'varchar' },
			ref: { type: 'varchar', nullable: true },
			sparsePath: { type: 'varchar', nullable: true },
			enabled: { type: 'boolean', default: true },
			priority: { type: 'int', default: 0 },
			lastIndexStatus: { type: 'varchar', default: 'idle' },
			lastIndexError: { type: 'varchar', nullable: true },
			lastIndexedAt: { type: 'timestamptz', nullable: true },
			lastCatalog: { type: 'jsonb', nullable: true },
			createdById: { type: 'varchar', nullable: true },
			updatedById: { type: 'varchar', nullable: true },
			createdAt: { type: 'timestamptz', createDate: true },
			updatedAt: { type: 'timestamptz', updateDate: true }
		}
	})
	function makeShared(redis: typeof redisA) {
		const locks = new RedisLockService()
		Reflect.set(locks, 'redis', redis)
		return new PluginMarketplaceSharedCache(redis, locks)
	}
	beforeAll(async () => {
		redisA.on('error', () => undefined)
		redisB.on('error', () => undefined)
		await Promise.all([redisA.connect(), redisB.connect()])
		sharedA = makeShared(redisA)
		sharedB = makeShared(redisB)
		const options = {
			type: 'postgres' as const,
			url: process.env.MARKETPLACE_TEST_POSTGRES_URL,
			entities: [sourceSchema],
			synchronize: false
		}
		dbA = await new DataSource(options).initialize()
		await dbA.query(`CREATE SCHEMA "${schema}"`)
		await dbA.synchronize()
		dbB = await new DataSource(options).initialize()
		repoA = dbA.getRepository(sourceSchema)
		repoB = dbB.getRepository(sourceSchema)
	}, 30_000)
	afterEach(() => {
		jest.restoreAllMocks()
		jest.mocked(RequestContext.getOrganizationId).mockReturnValue('org-a')
	})
	afterAll(async () => {
		await dbB?.destroy()
		if (dbA?.isInitialized) {
			await dbA.query(`DROP SCHEMA "${schema}" CASCADE`)
			await dbA.destroy()
		}
		await Promise.all([
			redisA.isOpen ? redisA.disconnect() : undefined,
			redisB.isOpen ? redisB.disconnect() : undefined
		])
	})

	it('coalesces a cold load across independent clients and reuses the result after a replica restart', async () => {
		const namespace = randomUUID()
		const a = sharedA.cache(namespace, decode)
		const b = sharedB.cache(namespace, decode)
		const gate = deferred<string>()
		const started = deferred<void>()
		const loader = jest.fn(() => {
			started.resolve()
			return gate.promise
		})
		const first = a.load('one', loader)
		await started.promise
		const second = b.load('one', loader)
		gate.resolve('shared')
		expect(await Promise.all([first, second])).toEqual(['shared', 'shared'])
		expect(loader).toHaveBeenCalledTimes(1)
		const restarted = makeShared(redisB).cache(namespace, decode)
		expect(await restarted.load('one', loader)).toBe('shared')
		expect(loader).toHaveBeenCalledTimes(1)
	})

	it('shares null results and failed refresh backoff while serving stale data', async () => {
		const namespace = randomUUID()
		const a = sharedA.cache(namespace, decode, { ttl: 5 })
		const b = sharedB.cache(namespace, decode, { ttl: 5 })
		const missing = jest.fn(async () => null)
		expect(await a.load('missing', missing)).toBeNull()
		expect(await b.load('missing', missing)).toBeNull()
		expect(missing).toHaveBeenCalledTimes(1)
		await a.load('stale', async () => 'old')
		await new Promise((resolve) => setTimeout(resolve, 10))
		const failed = jest.fn(async () => {
			throw new Error('upstream offline')
		})
		await expect(a.load('stale', failed)).rejects.toThrow('upstream offline')
		expect(await b.load('stale', failed)).toBe('old')
		expect(failed).toHaveBeenCalledTimes(1)
	})

	it('observes recovery by another replica immediately after a local refresh failure', async () => {
		const namespace = randomUUID()
		const a = sharedA.cache(namespace, decode)
		const b = sharedB.cache(namespace, decode)
		await expect(
			a.load('one', async () => {
				throw new Error('offline')
			})
		).rejects.toThrow('offline')
		await b.load('one', async () => 'recovered', true)
		expect(await a.load('one', async () => 'wrong')).toBe('recovered')
	})

	it('keeps stale reads fast while a remote owner refreshes', async () => {
		const namespace = randomUUID()
		const a = sharedA.cache(namespace, decode, { ttl: 5 })
		const b = sharedB.cache(namespace, decode, { ttl: 5 })
		await a.load('one', async () => 'old')
		await new Promise((resolve) => setTimeout(resolve, 10))
		const gate = deferred<string>()
		const started = deferred<void>()
		const refreshing = a.load('one', () => {
			started.resolve()
			return gate.promise
		})
		await started.promise
		const duplicate = jest.fn(async () => 'duplicate')
		expect(await b.read('one', 'empty', duplicate, () => undefined)).toBe('old')
		gate.resolve('new')
		await refreshing
		expect(await b.load('one', duplicate)).toBe('new')
		expect(duplicate).not.toHaveBeenCalled()
	})

	it('renews a long lease and rejects publication by a worker whose lease was replaced', async () => {
		const namespace = randomUUID()
		const a = sharedA.cache(namespace, decode, { leaseMs: 90 })
		const b = sharedB.cache(namespace, decode)
		const started = deferred<void>()
		const gate = deferred<string>()
		const first = a.load('one', () => {
			started.resolve()
			return gate.promise
		})
		const rejected = expect(first).rejects.toThrow()
		await started.promise
		await new Promise((resolve) => setTimeout(resolve, 200))
		const key = sharedA.key(namespace, 'one')
		expect(await redisA.pTTL(`${key}:lock`)).toBeGreaterThan(0)
		await redisA.del(`${key}:lock`)
		expect(await b.load('one', async () => 'new')).toBe('new')
		gate.resolve('old')
		await rejected
		expect(await b.load('one', async () => 'wrong')).toBe('new')
		expect(await redisA.get(`${key}:failure`)).toBeNull()
	})

	it('takes over a dead replica lease after Redis expires it', async () => {
		const namespace = randomUUID()
		const key = sharedA.key(namespace, 'one')
		await redisA.set(`${key}:lock`, 'dead-worker', { PX: 50 })
		const fetch = jest.fn(async () => 'recovered')
		const b = sharedB.cache(namespace, decode, { waitMs: 1000 })
		expect(await b.load('one', fetch)).toBe('recovered')
		expect(fetch).toHaveBeenCalledTimes(1)
	})

	it('retries a negative entry only after its shared expiration', async () => {
		const namespace = randomUUID()
		const a = sharedA.cache(namespace, decode, { failureTtl: 50 })
		const b = sharedB.cache(namespace, decode, { failureTtl: 50 })
		const missing = jest.fn(async () => null)
		await a.load('one', missing)
		await b.load('one', missing)
		expect(missing).toHaveBeenCalledTimes(1)
		await new Promise((resolve) => setTimeout(resolve, 60))
		await b.load('one', missing)
		expect(missing).toHaveBeenCalledTimes(2)
	})

	it('serves cached values during Redis failure without starting upstream work', async () => {
		const namespace = randomUUID()
		const a = sharedA.cache(namespace, decode)
		await a.load('one', async () => 'cached')
		jest.spyOn(sharedA, 'get').mockRejectedValue(new Error('redis offline'))
		const upstream = jest.fn(async () => 'upstream')
		expect(await a.read('one', 'database-fallback', upstream, () => undefined)).toBe('cached')
		await expect(a.load('cold', upstream)).rejects.toThrow()
		expect(upstream).not.toHaveBeenCalled()
	})

	it('shares package metadata, bundle and README caches between replicas', async () => {
		const a = new PluginMarketplacePackages(metadata, sharedA)
		const b = new PluginMarketplacePackages(metadata, sharedB)
		const name = `@example/${randomUUID()}`
		const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 404 }))
		await a.getNpmPackageMetadata(name)
		await b.getNpmPackageMetadata(name)
		await a.getNpmBundleManifest(name, null)
		await b.getNpmBundleManifest(name, null)
		const item = { name, source: { type: 'npm', packageName: name } }
		await a.resolveMarketplaceReadme(item, {})
		await b.resolveMarketplaceReadme(item, {})
		expect(fetch).toHaveBeenCalledTimes(3)
		await Promise.all([a.close(), b.close()])
	})

	it('shares immutable icon bytes despite different replica metadata and isolates organizations', async () => {
		const a = new PluginMarketplaceAssets(sharedA)
		const b = new PluginMarketplaceAssets(sharedB)
		const item = {
			name: randomUUID(),
			sourceId: 'source',
			icon: { type: 'image' as const, value: 'data:image/png;base64,aGVsbG8=' }
		}
		const [summary] = await a.summaries([item], 'xpert')
		const otherReplica = { ...item, icon: { type: 'image' as const, value: 'data:image/png;base64,b3RoZXI=' } }
		expect((await b.get(otherReplica, summary.iconAsset, 'xpert'))?.data.toString()).toBe('hello')
		jest.mocked(RequestContext.getOrganizationId).mockReturnValue('org-b')
		expect(await b.get(otherReplica, summary.iconAsset, 'xpert')).toBeNull()
	})

	function record(entity: PluginMarketplaceSource): MarketplaceSourceRecord {
		return {
			id: entity.id,
			name: entity.name,
			type: entity.type,
			url: entity.url,
			ref: entity.ref,
			sparsePath: entity.sparsePath,
			enabled: entity.enabled,
			lastCatalog: metadata.readCachedCatalog(entity.lastCatalog),
			lastIndexedAt: entity.lastIndexedAt,
			entity
		}
	}
	async function source() {
		return repoA.save(
			repoA.create({
				name: randomUUID(),
				type: 'url',
				url: 'https://example.test/catalog',
				tenantId: 'tenant-a',
				organizationId: 'org-a',
				enabled: true,
				lastCatalog: catalog('cached'),
				lastIndexedAt: new Date(0)
			})
		)
	}

	it('creates one builtin cache row when two replicas initialize concurrently', async () => {
		const a = new PluginMarketplaceCatalogs(repoA, metadata, async () => catalog('unused'), sharedA)
		const b = new PluginMarketplaceCatalogs(repoB, metadata, async () => catalog('unused'), sharedB)
		const [one, two] = await Promise.all([a.builtin(), b.builtin()])
		expect(one.id).toBe(two.id)
		expect(await repoA.countBy({ name: one.name })).toBe(1)
	})

	it('shares a source refresh across replicas and persists its result once', async () => {
		const entity = await source()
		const gate = deferred<NormalizedMarketplaceCatalog>()
		const started = deferred<void>()
		const fetch = jest.fn(() => {
			started.resolve()
			return gate.promise
		})
		const a = new PluginMarketplaceCatalogs(repoA, metadata, fetch, sharedA)
		const b = new PluginMarketplaceCatalogs(repoB, metadata, fetch, sharedB)
		const one = a.force(record(entity))
		await started.promise
		const two = b.force(record(await repoB.findOneByOrFail({ id: entity.id })))
		gate.resolve(catalog('new'))
		expect((await Promise.all([one, two])).map((value) => value.plugins[0].name)).toEqual(['new', 'new'])
		expect(fetch).toHaveBeenCalledTimes(1)
		expect((await repoA.findOneByOrFail({ id: entity.id })).lastCatalog.plugins[0].name).toBe('new')
	})

	it('rejects an old source worker after another lease owner publishes a newer catalog', async () => {
		const entity = await source()
		const gate = deferred<NormalizedMarketplaceCatalog>()
		const started = deferred<void>()
		const a = new PluginMarketplaceCatalogs(
			repoA,
			metadata,
			() => {
				started.resolve()
				return gate.promise
			},
			sharedA
		)
		const b = new PluginMarketplaceCatalogs(repoB, metadata, async () => catalog('winner'), sharedB)
		const original = record(entity)
		const pending = a.force(original)
		const rejected = expect(pending).rejects.toThrow()
		await started.promise
		const key = sharedA.key('source-enriched', a['key'](original))
		await redisB.del(`${key}:lock`)
		await b.force(record(await repoB.findOneByOrFail({ id: entity.id })))
		gate.resolve(catalog('obsolete'))
		await rejected
		expect((await repoB.findOneByOrFail({ id: entity.id })).lastCatalog.plugins[0].name).toBe('winner')
		expect(await redisB.get(`${key}:failure`)).toBeNull()
	})

	it('returns the database snapshot when Redis is unavailable without contacting upstream', async () => {
		const entity = await source()
		jest.spyOn(sharedB, 'get').mockRejectedValue(new Error('redis offline'))
		const fetch = jest.fn(async () => catalog('upstream'))
		const b = new PluginMarketplaceCatalogs(repoB, metadata, fetch, sharedB)
		expect((await b.load(record(entity))).plugins[0].name).toBe('cached')
		expect(fetch).not.toHaveBeenCalled()
	})

	it.each(['success', 'failure'] as const)('fences a late %s after source configuration changes', async (outcome) => {
		const entity = await source()
		const gate = deferred<NormalizedMarketplaceCatalog>()
		const started = deferred<void>()
		const a = new PluginMarketplaceCatalogs(
			repoA,
			metadata,
			() => {
				started.resolve()
				return gate.promise
			},
			sharedA
		)
		const pending = a.force(record(entity))
		const rejected = expect(pending).rejects.toThrow()
		await started.promise
		await repoB.update(entity.id, {
			url: 'https://new.example.test/catalog',
			lastIndexStatus: 'idle',
			lastIndexError: null,
			lastCatalog: null
		})
		if (outcome === 'success') gate.resolve(catalog('obsolete'))
		else gate.reject(new Error('obsolete failure'))
		await rejected
		const updated = await repoB.findOneByOrFail({ id: entity.id })
		expect(updated.url).toBe('https://new.example.test/catalog')
		expect(updated.lastCatalog).toBeNull()
		expect(updated.lastIndexStatus).toBe('idle')
	})

	it('does not resurrect a source deleted while its refresh is running', async () => {
		const entity = await source()
		const gate = deferred<NormalizedMarketplaceCatalog>()
		const started = deferred<void>()
		const a = new PluginMarketplaceCatalogs(
			repoA,
			metadata,
			() => {
				started.resolve()
				return gate.promise
			},
			sharedA
		)
		const pending = a.force(record(entity))
		const rejected = expect(pending).rejects.toThrow()
		await started.promise
		await repoB.delete(entity.id)
		gate.resolve(catalog('deleted'))
		await rejected
		expect(await repoB.findOneBy({ id: entity.id })).toBeNull()
	})

	it('shares the public catalog without reading tenant sources', async () => {
		const fetch = jest.fn(async () => catalog('public'))
		const a = new PluginMarketplaceCatalogs(repoA, metadata, fetch, sharedA)
		const b = new PluginMarketplaceCatalogs(repoB, metadata, fetch, sharedB)
		const publicSource: MarketplaceSourceRecord = {
			id: 'builtin-default',
			name: 'public',
			type: 'url',
			url: `https://example.test/${randomUUID()}`
		}
		const [one, two] = await Promise.all([a.public(publicSource), b.public(publicSource)])
		expect(one).toEqual(two)
		expect(fetch).toHaveBeenCalledTimes(1)
	})
})
