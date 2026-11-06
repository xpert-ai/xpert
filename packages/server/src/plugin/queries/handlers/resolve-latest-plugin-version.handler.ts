// A forced check bypasses completed cache entries, but shares any in-flight registry request.
import { Logger } from '@nestjs/common'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import type { PluginVersionCheckResult } from '@xpert-ai/contracts'
import { ResolveLatestPluginVersionQuery } from '../resolve-latest-plugin-version.query'
import { NpmPluginVersionClient } from './npm-plugin-version'

const PLUGIN_VERSION_CACHE_TTL_MS = 5 * 60 * 1000

type PluginVersionCacheEntry = {
	expiresAt: number
	result?: PluginVersionCheckResult
	pending?: Promise<PluginVersionCheckResult>
}

@QueryHandler(ResolveLatestPluginVersionQuery)
export class ResolveLatestPluginVersionHandler implements IQueryHandler<ResolveLatestPluginVersionQuery> {
	private readonly logger = new Logger(ResolveLatestPluginVersionHandler.name)
	private readonly cache = new Map<string, PluginVersionCacheEntry>()
	private readonly registry = new NpmPluginVersionClient()

	async execute(query: ResolveLatestPluginVersionQuery): Promise<PluginVersionCheckResult> {
		const cached = this.cache.get(query.packageName)
		if (cached?.pending) return cached.pending
		if (!query.forceRefresh && cached?.result && cached.expiresAt > Date.now()) return cached.result

		const finish = (latestVersion?: string, errorCode?: PluginVersionCheckResult['errorCode']) => {
			const checkedAt = new Date().toISOString()
			const result: PluginVersionCheckResult = latestVersion
				? { status: 'success', checkedAt, latestVersion, lastSuccessfulCheckAt: checkedAt }
				: {
						status: 'failed',
						checkedAt,
						errorCode: errorCode ?? 'VERSION_NOT_FOUND',
						latestVersion: cached?.result?.latestVersion,
						lastSuccessfulCheckAt: cached?.result?.lastSuccessfulCheckAt
					}
			this.cache.set(query.packageName, { expiresAt: Date.now() + PLUGIN_VERSION_CACHE_TTL_MS, result })
			return result
		}
		const pending = this.registry
			.resolveLatestVersion(query.packageName)
			.then((version) => finish(version))
			.catch(() => {
				// Registry exceptions can contain credentials or private proxy URLs.
				this.logger.warn(`Failed to check the latest version for plugin ${query.packageName}`)
				return finish(undefined, 'REGISTRY_UNAVAILABLE')
			})
		this.cache.set(query.packageName, { expiresAt: 0, result: cached?.result, pending })
		return pending
	}
}
