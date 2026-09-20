// Invariants: Redis owns refresh leases and publication; local state is only an outage fallback.
// A worker that loses its lease cannot publish data or failure markers. Keys use a single
// Redis Cluster hash slot per resource, and no request/organization context is cached globally.
import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common'
import { createHash } from 'node:crypto'
import { t } from 'i18next'
import { RedisLockService } from '../../core/redis/redis-lock.service'
import { REDIS_CLIENT } from '../../core/redis/types'
import { MarketplaceJobs } from './plugin-marketplace-cache'

export interface MarketplaceRedis {
	get(key: string): Promise<string | null>
	set(key: string, value: string, options: { PX: number }): Promise<unknown>
	eval(script: string, options: { keys: string[]; arguments: string[] }): Promise<unknown>
}
export interface MarketplaceLease {
	assertOwned(): Promise<void>
}
export type MarketplaceLoader<T> = (lease: MarketplaceLease) => Promise<T>
export interface MarketplaceValueCache<T> {
	load(key: string, loader: MarketplaceLoader<T>, force?: boolean): Promise<T>
	read(key: string, fallback: T, loader: MarketplaceLoader<T>, onError: (error: unknown) => void): T | Promise<T>
}
export type MarketplaceDecoder<T> = (value: unknown) => T | undefined
export interface SharedCacheOptions {
	ttl?: number
	failureTtl?: number
	retention?: number
	waitMs?: number
	leaseMs?: number
}
interface CacheEntry<T> {
	value: T
	freshUntil: number
	version: string
	expiresAt: number
}

const PUBLISH = `
if redis.call('get', KEYS[1]) ~= ARGV[1] then return 0 end
redis.call('set', KEYS[2], ARGV[2], 'PX', ARGV[3])
redis.call('del', KEYS[3])
return 1`
const FAIL = `
if redis.call('get', KEYS[1]) ~= ARGV[1] then return 0 end
redis.call('set', KEYS[2], '1', 'PX', ARGV[2])
return 1`

export function marketplaceCacheUnavailable() {
	return new ServiceUnavailableException(
		t('server-ai:Error.MarketplaceCacheUnavailable', {
			defaultValue: 'The plugin marketplace is temporarily unavailable. Please retry shortly.'
		})
	)
}

@Injectable()
export class PluginMarketplaceSharedCache {
	private retryRedisAt = 0
	private readonly logger = new Logger(PluginMarketplaceSharedCache.name)
	constructor(
		@Inject(REDIS_CLIENT) private readonly redis: MarketplaceRedis,
		private readonly locks: RedisLockService
	) {}

	cache<T>(
		namespace: string,
		decode: MarketplaceDecoder<T>,
		options: SharedCacheOptions = {}
	): MarketplaceValueCache<T> {
		return new SharedMarketplaceValueCache(this, namespace, decode, options)
	}

	key(namespace: string, identity: string) {
		const digest = createHash('sha256')
			.update(JSON.stringify([namespace, identity]))
			.digest('hex')
		return `xpert:marketplace:v2:{${digest}}`
	}

	async io<T>(operation: () => Promise<T>): Promise<T> {
		if (this.retryRedisAt > Date.now()) throw marketplaceCacheUnavailable()
		let timer: ReturnType<typeof setTimeout>
		try {
			return await Promise.race([
				operation(),
				new Promise<never>((_, reject) => {
					timer = setTimeout(() => reject(marketplaceCacheUnavailable()), 1000)
				})
			])
		} catch (error) {
			this.retryRedisAt = Date.now() + 1000
			throw error
		} finally {
			clearTimeout(timer)
		}
	}

	get(key: string) {
		return this.io(() => this.redis.get(key))
	}
	async put(namespace: string, identity: string, value: string, ttl: number) {
		await this.io(() => this.redis.set(this.key(namespace, identity), value, { PX: ttl }))
	}
	async acquire(key: string, ttl: number) {
		return this.io(() => this.locks.acquireLock(`${key}:lock`, ttl))
	}

	async withLease<T>(key: string, token: string, ttl: number, operation: (lease: MarketplaceLease) => Promise<T>) {
		let lost = false
		let renewing = false
		const timer = setInterval(
			async () => {
				if (renewing) return
				renewing = true
				try {
					if (!(await this.io(() => this.locks.refreshLock(`${key}:lock`, token, ttl)))) lost = true
				} catch {
					lost = true
				} finally {
					renewing = false
				}
			},
			Math.max(10, Math.floor(ttl / 3))
		)
		timer.unref()
		const lease: MarketplaceLease = {
			assertOwned: async () => {
				if (lost || (await this.get(`${key}:lock`)) !== token) throw marketplaceCacheUnavailable()
			}
		}
		try {
			return await operation(lease)
		} finally {
			clearInterval(timer)
			try {
				await this.io(() => this.locks.releaseLock(`${key}:lock`, token))
			} catch {
				this.logger.warn('Marketplace refresh lease could not be released; it will expire.')
			}
		}
	}

	async publish(key: string, token: string, value: string, ttl: number) {
		const published = await this.io(() =>
			this.redis.eval(PUBLISH, {
				keys: [`${key}:lock`, `${key}:data`, `${key}:failure`],
				arguments: [token, value, String(ttl)]
			})
		)
		if (published !== 1) throw marketplaceCacheUnavailable()
	}
	async fail(key: string, token: string, ttl: number) {
		await this.io(() =>
			this.redis.eval(FAIL, {
				keys: [`${key}:lock`, `${key}:failure`],
				arguments: [token, String(ttl)]
			})
		)
	}
}

class SharedMarketplaceValueCache<T> implements MarketplaceValueCache<T> {
	private readonly local = new Map<string, CacheEntry<T>>()
	private readonly jobs: MarketplaceJobs<T>
	private readonly ttl: number
	private readonly failureTtl: number
	private readonly retention: number
	private readonly waitMs: number
	private readonly leaseMs: number
	constructor(
		private readonly shared: PluginMarketplaceSharedCache,
		private readonly namespace: string,
		private readonly decode: MarketplaceDecoder<T>,
		options: SharedCacheOptions
	) {
		this.ttl = options.ttl ?? 600_000
		this.failureTtl = options.failureTtl ?? 60_000
		this.retention = Math.max(this.ttl, options.retention ?? 86_400_000)
		this.waitMs = options.waitMs ?? 30_000
		this.leaseMs = options.leaseMs ?? 30_000
		this.jobs = new MarketplaceJobs(0)
	}

	private async entry(key: string): Promise<CacheEntry<T> | undefined> {
		const raw = await this.shared.get(`${key}:data`)
		if (!raw) return undefined
		try {
			const value: unknown = JSON.parse(raw)
			if (
				!value ||
				typeof value !== 'object' ||
				!('value' in value) ||
				!('version' in value) ||
				typeof value.version !== 'string' ||
				!('freshUntil' in value) ||
				typeof value.freshUntil !== 'number' ||
				!('expiresAt' in value) ||
				typeof value.expiresAt !== 'number' ||
				value.expiresAt <= Date.now()
			)
				return undefined
			const decoded = this.decode(value.value)
			if (decoded === undefined) return undefined
			const entry = {
				value: decoded,
				version: value.version,
				freshUntil: value.freshUntil,
				expiresAt: value.expiresAt
			}
			this.remember(key, entry)
			return entry
		} catch {
			return undefined
		}
	}
	private remember(key: string, entry: CacheEntry<T>) {
		this.local.delete(key)
		this.local.set(key, entry)
		while (this.local.size > 512) this.local.delete(this.local.keys().next().value)
	}
	private fallback(key: string) {
		const entry = this.local.get(key)
		return entry && entry.expiresAt > Date.now() ? entry : undefined
	}

	async read(identity: string, fallback: T, loader: MarketplaceLoader<T>, onError: (error: unknown) => void) {
		const key = this.shared.key(this.namespace, identity)
		let entry: CacheEntry<T> | undefined
		try {
			entry = await this.entry(key)
		} catch {
			return this.fallback(key)?.value ?? fallback
		}
		if (!entry || entry.freshUntil <= Date.now()) {
			this.jobs.schedule(key, () => this.refresh(key, loader), onError)
		}
		return entry ? entry.value : fallback
	}

	load(identity: string, loader: MarketplaceLoader<T>, force = false): Promise<T> {
		const key = this.shared.key(this.namespace, identity)
		return this.jobs.run(key, () => this.refresh(key, loader, force), force)
	}

	private async refresh(key: string, loader: MarketplaceLoader<T>, force = false): Promise<T> {
		let initial: CacheEntry<T> | undefined
		try {
			initial = await this.entry(key)
		} catch {
			const cached = this.fallback(key)
			if (cached) return cached.value
			throw marketplaceCacheUnavailable()
		}
		if (!force && initial && initial.freshUntil > Date.now()) return initial.value
		const deadline = Date.now() + this.waitMs
		do {
			const current = await this.entry(key)
			if (current && current.freshUntil > Date.now() && (!force || current.version !== initial?.version))
				return current.value
			if (!force && (await this.shared.get(`${key}:failure`))) {
				if (current) return current.value
				throw marketplaceCacheUnavailable()
			}
			const token = await this.shared.acquire(key, this.leaseMs)
			if (token)
				return this.shared.withLease(key, token, this.leaseMs, async (lease) => {
					// The preceding owner may have published between our read and lock acquisition.
					const latest = await this.entry(key)
					if (latest && latest.freshUntil > Date.now() && (!force || latest.version !== initial?.version))
						return latest.value
					if (!force && (await this.shared.get(`${key}:failure`))) {
						if (latest) return latest.value
						throw marketplaceCacheUnavailable()
					}
					try {
						const value = this.decode(await loader(lease))
						if (value === undefined) throw marketplaceCacheUnavailable()
						await lease.assertOwned()
						const entry = {
							value,
							version: token,
							freshUntil: Date.now() + (value === null ? this.failureTtl : this.ttl),
							expiresAt: Date.now() + (value === null ? this.failureTtl : this.retention)
						}
						await this.shared.publish(key, token, JSON.stringify(entry), entry.expiresAt - Date.now())
						this.remember(key, entry)
						return value
					} catch (error) {
						await this.shared.fail(key, token, this.failureTtl).catch(() => undefined)
						throw error
					}
				})
			await new Promise((resolve) => setTimeout(resolve, 100))
		} while (Date.now() < deadline)
		throw marketplaceCacheUnavailable()
	}
}
