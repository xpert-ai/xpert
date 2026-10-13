import Config from '@npmcli/config'
import { definitions, flatten, shorthands } from '@npmcli/config/lib/definitions'
import npmFetch from 'npm-registry-fetch'
import { createRequire } from 'node:module'
import { dirname } from 'node:path'

const REQUEST_TIMEOUT_MS = 10_000
const CONFIG_CACHE_TTL_MS = 5 * 60 * 1000
const REGISTRY_CONFIG_KEYS = new Set([
	'registry',
	'proxy',
	'https-proxy',
	'noproxy',
	'strict-ssl',
	'ca',
	'cafile',
	'cert',
	'key',
	'cache',
	'offline',
	'prefer-online',
	'prefer-offline',
	'maxsockets',
	'local-address',
	'auth-type'
])

function flattenRegistryConfig(data: Parameters<typeof flatten>[0], target: Parameters<typeof flatten>[1]) {
	// npm's CLI-only flatteners mutate process.env (NODE_ENV and npm_config_user_agent).
	return flatten(
		Object.fromEntries(
			Object.entries(data).filter(
				([key]) => REGISTRY_CONFIG_KEYS.has(key) || /^@.*:registry$/i.test(key) || key.startsWith('//')
			)
		),
		target
	)
}

/** Reuse npm configuration and HTTP connections without launching a CLI per package. */
export class NpmPluginVersionClient {
	private configuration?: Promise<Config>
	private configurationExpiresAt = 0

	async resolveLatestVersion(packageName: string): Promise<string | undefined> {
		if (this.configurationExpiresAt && this.configurationExpiresAt <= Date.now()) {
			this.configuration = undefined
			this.configurationExpiresAt = 0
		}
		const config = await (this.configuration ??= this.loadConfiguration()
			.then((loaded) => {
				this.configurationExpiresAt = Date.now() + CONFIG_CACHE_TTL_MS
				return loaded
			})
			.catch((error) => {
				this.configuration = undefined
				throw error
			}))
		const configuredTag: unknown = config.get('tag')
		const tag = typeof configuredTag === 'string' ? configuredTag : 'latest'
		const options: npmFetch.Options & { signal: AbortSignal } = {
			...config.flat,
			spec: packageName,
			preferOnline: true,
			// Recover transient failures without npm's long default retry delays.
			retry: { retries: 1, minTimeout: 250, maxTimeout: 250 },
			timeout: REQUEST_TIMEOUT_MS,
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
		}
		const tags: unknown = await npmFetch.json(`/-/package/${encodeURIComponent(packageName)}/dist-tags`, options)
		if (!tags || typeof tags !== 'object' || Array.isArray(tags)) {
			return undefined
		}
		const version: unknown = Object.entries(tags).find(([name]) => name === tag)?.[1]
		return typeof version === 'string' ? version : undefined
	}

	private async loadConfiguration(): Promise<Config> {
		const config = new Config({
			definitions,
			flatten: flattenRegistryConfig,
			shorthands,
			// Resolve at runtime; Webpack rewrites a static require.resolve to a module ID.
			npmPath: dirname(createRequire(__filename).resolve('@npmcli/config/package.json')),
			argv: [],
			// npm's loader populates its environment; keep those changes local to this client.
			env: { ...process.env }
		})
		await config.load()
		config.validate()
		return config
	}
}
