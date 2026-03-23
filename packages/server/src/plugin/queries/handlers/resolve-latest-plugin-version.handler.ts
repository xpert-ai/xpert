import { execFile } from 'node:child_process'
import { Logger } from '@nestjs/common'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { getErrorMessage } from '@xpert-ai/plugin-sdk'
import { ResolveLatestPluginVersionQuery } from '../resolve-latest-plugin-version.query'

const PLUGIN_VERSION_CACHE_TTL_MS = 5 * 60 * 1000

type PluginVersionCacheEntry = {
	expiresAt: number
	latestVersion?: string
	pending?: Promise<string | undefined>
}

@QueryHandler(ResolveLatestPluginVersionQuery)
export class ResolveLatestPluginVersionHandler implements IQueryHandler<ResolveLatestPluginVersionQuery> {
	private readonly logger = new Logger(ResolveLatestPluginVersionHandler.name)
	private readonly cache = new Map<string, PluginVersionCacheEntry>()

	async execute(query: ResolveLatestPluginVersionQuery): Promise<string | undefined> {
		const now = Date.now()
		const cached = this.cache.get(query.packageName)

		if (cached?.pending) {
			return cached.pending
		}

		if (cached && cached.expiresAt > now) {
			return cached.latestVersion
		}

		const pending = execFileUtf8('npm', ['view', query.packageName, 'version', '--json'])
			.then(parseLatestVersionOutput)
			.then((latestVersion) => {
				this.cache.set(query.packageName, {
					expiresAt: Date.now() + PLUGIN_VERSION_CACHE_TTL_MS,
					latestVersion
				})
				return latestVersion
			})
			.catch((error) => {
				this.logger.warn(
					`Failed to resolve latest version for plugin ${query.packageName}: ${getErrorMessage(error)}`
				)
				this.cache.set(query.packageName, {
					expiresAt: Date.now() + PLUGIN_VERSION_CACHE_TTL_MS,
					latestVersion: undefined
				})
				return undefined
			})

		this.cache.set(query.packageName, {
			expiresAt: now + PLUGIN_VERSION_CACHE_TTL_MS,
			latestVersion: cached?.latestVersion,
			pending
		})

		return pending
	}
}

function parseLatestVersionOutput(output: string) {
	const trimmed = output.trim()
	if (!trimmed) {
		return undefined
	}

	const parsed = JSON.parse(trimmed)
	return typeof parsed === 'string' ? parsed : undefined
}

function execFileUtf8(command: string, args: string[]) {
	return new Promise<string>((resolve, reject) => {
		execFile(command, args, { encoding: 'utf8' }, (error, stdout) => {
			if (error) {
				reject(error)
				return
			}
			resolve(stdout.trim())
		})
	})
}
