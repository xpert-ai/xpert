import { createHash } from 'node:crypto'
import type { Cache } from 'cache-manager'

export const CURRENT_USER_FEATURE_CACHE_TTL_MS = 180_000
const CURRENT_USER_FEATURE_CACHE_VERSION_TTL_MS = 24 * 60 * 60 * 1000
const CURRENT_USER_FEATURE_CACHE_PREFIX = 'user:me:feature-context'

export function hashCurrentUserRelations(relations: readonly string[]) {
	return createHash('sha1')
		.update(Array.from(new Set(relations)).sort().join('|'))
		.digest('hex')
		.slice(0, 16)
}

function buildTenantVersionKey(tenantId: string) {
	return `${CURRENT_USER_FEATURE_CACHE_PREFIX}:tenant-version:${tenantId}`
}

function buildUserVersionKey(tenantId: string, userId: string) {
	return `${CURRENT_USER_FEATURE_CACHE_PREFIX}:user-version:${tenantId}:${userId}`
}

export function buildCurrentUserFeatureCacheKey({
	tenantId,
	userId,
	relationsHash,
	version
}: {
	tenantId: string
	userId: string
	relationsHash: string
	version: string
}) {
	return `${CURRENT_USER_FEATURE_CACHE_PREFIX}:v1:${tenantId}:${userId}:${relationsHash}:${version}`
}

export async function getCurrentUserFeatureCacheVersion(
	cacheManager: Cache | undefined,
	tenantId: string,
	userId: string
) {
	if (!cacheManager) {
		return '0.0'
	}

	const [tenantVersion, userVersion] = await Promise.all([
		cacheManager.get<string | number>(buildTenantVersionKey(tenantId)),
		cacheManager.get<string | number>(buildUserVersionKey(tenantId, userId))
	])

	return `${tenantVersion?.toString() ?? '0'}.${userVersion?.toString() ?? '0'}`
}

export async function touchCurrentUserFeatureTenantCacheVersion(
	cacheManager: Cache | undefined,
	tenantId: string | null | undefined
) {
	if (!cacheManager || !tenantId) {
		return
	}

	await cacheManager.set(
		buildTenantVersionKey(tenantId),
		Date.now().toString(),
		CURRENT_USER_FEATURE_CACHE_VERSION_TTL_MS
	)
}

export async function touchCurrentUserFeatureUserCacheVersion(
	cacheManager: Cache | undefined,
	tenantId: string | null | undefined,
	userId: string | null | undefined
) {
	if (!cacheManager || !tenantId || !userId) {
		return
	}

	await cacheManager.set(
		buildUserVersionKey(tenantId, userId),
		Date.now().toString(),
		CURRENT_USER_FEATURE_CACHE_VERSION_TTL_MS
	)
}
