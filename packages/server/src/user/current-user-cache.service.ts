// Display data only: authentication and business authorization must keep reading live grants.
import { createHash, randomUUID } from 'node:crypto'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Inject, Injectable, Logger } from '@nestjs/common'
import type { Cache } from 'cache-manager'
import { instanceToPlain, plainToInstance } from 'class-transformer'
import { User } from './user.entity'

export type CurrentUserCacheLayer = 'core' | 'organizations' | 'features'
export type CurrentUserCacheDependency =
	| 'User'
	| 'Tenant'
	| 'Role'
	| 'RolePermission'
	| 'Employee'
	| 'UserOrganization'
	| 'Organization'
	| 'Feature'
	| 'FeatureOrganization'

const dependencies: Record<CurrentUserCacheLayer, readonly CurrentUserCacheDependency[]> = {
	core: ['User', 'Tenant', 'Role', 'RolePermission', 'Employee'],
	organizations: ['User', 'UserOrganization', 'Organization'],
	features: ['UserOrganization', 'Organization', 'Feature', 'FeatureOrganization']
}
const PREFIX = 'user:me:display:v1'
const TTL_MS = 60_000
const VERSION_TTL_MS = 24 * 60 * 60 * 1000

@Injectable()
export class CurrentUserCacheService {
	private readonly logger = new Logger(CurrentUserCacheService.name)
	private readonly inFlight = new Map<string, Promise<User>>()

	constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

	async version(layer: CurrentUserCacheLayer, tenantId: string): Promise<string | null> {
		try {
			const keys = dependencies[layer].flatMap((dependency) => [
				this.versionKey(dependency),
				this.versionKey(dependency, tenantId)
			])
			const versions = await this.cache.mget<string>(keys)
			return createHash('sha256').update(JSON.stringify(versions)).digest('hex')
		} catch {
			this.logger.warn('Current-user cache unavailable; reading display data from the database')
			return null
		}
	}

	async invalidate(dependency: CurrentUserCacheDependency, tenantId?: string) {
		try {
			// UUIDs avoid lost invalidations when multiple API instances update within the same millisecond.
			await this.cache.set(this.versionKey(dependency, tenantId), randomUUID(), VERSION_TTL_MS)
		} catch {
			this.logger.warn('Current-user display cache invalidation failed; falling back to entry expiry')
		}
	}

	async read(
		layer: 'core' | 'organizations',
		tenantId: string,
		userId: string,
		query: object,
		load: () => Promise<User>
	): Promise<User> {
		const version = await this.version(layer, tenantId)
		if (!version) return load()
		const hash = createHash('sha256').update(JSON.stringify(query)).digest('hex')
		const key = `${PREFIX}:${layer}:${tenantId}:${userId}:${hash}:${version}`
		try {
			const cached = await this.cache.get<User>(key)
			if (cached) return plainToInstance(User, cached)
		} catch {
			return load()
		}
		let pending = this.inFlight.get(key)
		if (!pending) {
			pending = (async () => {
				const user = await load()
				// Apply entity exclusions before serialization: never put password hashes or refresh tokens in Redis.
				const payload = plainToInstance(User, instanceToPlain(user))
				try {
					await this.cache.set(key, payload, TTL_MS)
				} catch {
					this.logger.warn('Current-user display cache write failed')
				}
				return payload
			})()
			this.inFlight.set(key, pending)
		}
		try {
			// Each caller adds features to its own object; never mutate a shared cached object.
			return plainToInstance(User, await pending)
		} finally {
			if (this.inFlight.get(key) === pending) this.inFlight.delete(key)
		}
	}

	private versionKey(dependency: CurrentUserCacheDependency, tenantId?: string) {
		return `${PREFIX}:version:${dependency}:${tenantId ? `tenant:${tenantId}` : 'global'}`
	}
}
