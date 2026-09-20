import { BadRequestException } from '@nestjs/common'

import {
	type PluginMarketplaceItem,
	type PluginMarketplaceReadme,
	type PluginLevel,
	type XpertPluginBundleManifest
} from '@xpert-ai/contracts'

import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { MarketplaceValueCache, PluginMarketplaceSharedCache } from './plugin-marketplace-shared-cache'
import { decodeNpmMetadata, decodeNpmReadme, decodeDownloadCount } from './plugin-marketplace-cache-codecs'
import { MarketplaceCache } from './plugin-marketplace-cache'

import { ProxyAgent, type Dispatcher } from 'undici'

import { normalizePluginName } from '../types'
import {
	normalizePluginBundleManifest,
	readPluginBundleManifest,
	resolveLoadedPluginBundleRoot
} from '../plugin-bundle-manifest'

import {
	execFile,
	MARKETPLACE_REQUEST_TIMEOUT_MS,
	NPM_DOWNLOADS_CONCURRENCY,
	MarketplaceRegistryPlugin,
	NormalizedMarketplaceCatalog,
	NpmPackageArchive,
	PluginMarketplaceDetailQuery,
	isRecord,
	readRecord
} from './plugin-marketplace.types'
import { PluginMarketplaceMetadata } from './plugin-marketplace-metadata'

/** Optional package I/O belongs to background indexing and detail requests, never cached list reads. */
export class PluginMarketplacePackages {
	constructor(
		private readonly metadata: PluginMarketplaceMetadata,
		shared?: PluginMarketplaceSharedCache
	) {
		this.npmMetadataCache =
			shared?.cache('npm-metadata', decodeNpmMetadata) ?? new MarketplaceCache<{ level?: PluginLevel } | null>()
		this.npmReadmeCache =
			shared?.cache('npm-readme', decodeNpmReadme) ?? new MarketplaceCache<PluginMarketplaceReadme | null>()
		this.npmBundleManifestCache =
			shared?.cache('npm-bundle', (value) =>
				value === null ? null : (normalizePluginBundleManifest(value) ?? undefined)
			) ?? new MarketplaceCache<XpertPluginBundleManifest | null>()
		this.npmDownloadsCache =
			shared?.cache('npm-downloads', decodeDownloadCount) ?? new MarketplaceCache<number | null>()
		this.configureMarketplaceProxy()
	}

	async close() {
		await this.marketplaceProxyAgent?.close()
	}

	private readonly npmMetadataCache: MarketplaceValueCache<{ level?: PluginLevel } | null>
	private readonly npmReadmeCache: MarketplaceValueCache<PluginMarketplaceReadme | null>
	private readonly npmBundleManifestCache: MarketplaceValueCache<XpertPluginBundleManifest | null>
	private readonly npmDownloadsCache: MarketplaceValueCache<number | null>
	private marketplaceProxyAgent: ProxyAgent | null = null
	private marketplaceProxyConfigurationError: Error | null = null

	async resolveMarketplaceReadme(
		plugin: PluginMarketplaceItem,
		query: PluginMarketplaceDetailQuery
	): Promise<PluginMarketplaceReadme> {
		const locale = this.normalizeReadmeLocale(query.locale)
		const packageReadme = await this.resolveInstalledPackageReadme(plugin, locale)
		if (packageReadme) {
			return packageReadme
		}

		const npmReadme = await this.resolveNpmPackageReadme(plugin, locale)
		if (npmReadme) {
			return npmReadme
		}

		const metadataReadme = this.resolveMarketplaceMetadataReadme(plugin, query.targetApp)
		if (metadataReadme) {
			return {
				locale: locale ?? 'en',
				requestedLocale: locale,
				fileName: null,
				content: metadataReadme,
				source: 'marketplace-metadata'
			}
		}

		return {
			locale: locale ?? 'en',
			requestedLocale: locale,
			fileName: null,
			content: this.resolveLocalizedText(plugin.description, locale) ?? plugin.name,
			source: 'description'
		}
	}

	private async resolveInstalledPackageReadme(plugin: PluginMarketplaceItem, locale: string | null) {
		const loadedPlugin = this.metadata.findLoadedPluginByName(plugin.packageName ?? plugin.name)
		const packageRoot = loadedPlugin ? resolveLoadedPluginBundleRoot(loadedPlugin) : null
		if (!packageRoot) {
			return null
		}

		return this.readReadmeFromDirectory(packageRoot, locale, 'installed-package')
	}

	private async resolveNpmPackageReadme(plugin: PluginMarketplaceItem, locale: string | null) {
		const packageName = this.resolveNpmPackageNameFromMarketplaceItem(plugin)
		if (!packageName) {
			return null
		}

		const version = this.metadata.normalizeOptionalString(plugin.version)
		const cacheKey = `${packageName}@${version ?? 'latest'}:${locale ?? 'default'}`
		return this.npmReadmeCache.load(cacheKey, () => this.fetchNpmPackageReadme(packageName, version, locale))
	}

	private resolveNpmPackageNameFromMarketplaceItem(plugin: PluginMarketplaceItem) {
		const source = readRecord(plugin.source)
		const sourceType = this.metadata.normalizeOptionalString(source?.type)?.toLowerCase()
		const sourceUrl = this.metadata.normalizeOptionalString(source?.url)
		const packageNameFromUrl = sourceUrl ? this.extractNpmPackageNameFromUrl(sourceUrl) : null
		const packageName =
			packageNameFromUrl ??
			this.metadata.normalizeOptionalString(source?.packageName) ??
			this.metadata.normalizeOptionalString(plugin.packageName) ??
			this.metadata.normalizeOptionalString(plugin.name)
		if (!packageName || !this.looksLikeNpmPackageName(packageName)) {
			return null
		}
		if (sourceType && sourceType !== 'npm' && sourceType !== 'marketplace' && !packageNameFromUrl) {
			return null
		}
		return normalizePluginName(packageName)
	}

	private async fetchNpmPackageReadme(
		packageName: string,
		version: string | null,
		locale: string | null
	): Promise<PluginMarketplaceReadme | null> {
		let tempDir: string | null = null

		try {
			const archive = await this.fetchNpmPackageArchive(packageName, version)
			if (!archive) {
				return null
			}

			const tarballResponse = await this.fetchMarketplaceRequest(archive.tarball)
			if (!tarballResponse.ok) {
				throw new Error(`npm tarball returned ${tarballResponse.status}`)
			}

			tempDir = await mkdtemp(join(tmpdir(), 'xpert-plugin-readme-'))
			const archivePath = join(tempDir, 'package.tgz')
			await writeFile(archivePath, Buffer.from(await tarballResponse.arrayBuffer()))
			await execFile('tar', ['-xzf', archivePath, '-C', tempDir])
			return await this.readReadmeFromDirectory(join(tempDir, 'package'), locale, 'npm-package')
		} catch (error) {
			this.metadata.logger.warn(
				`Failed to load README for npm plugin "${packageName}": ${this.metadata.toErrorMessage(error)}`
			)
			return null
		} finally {
			if (tempDir) {
				await rm(tempDir, { recursive: true, force: true })
			}
		}
	}

	private async fetchNpmPackageArchive(
		packageName: string,
		version: string | null
	): Promise<NpmPackageArchive | null> {
		const url = `https://registry.npmjs.org/${encodeURIComponent(packageName)}`
		const metadataResponse = await this.fetchMarketplaceRequest(url)
		if (!metadataResponse.ok) {
			throw new Error(`npm registry returned ${metadataResponse.status}`)
		}

		const metadata = readRecord(await metadataResponse.json())
		const versions = readRecord(metadata?.versions)
		const distTags = readRecord(metadata?.['dist-tags'])
		const latestVersion = this.metadata.normalizeOptionalString(distTags?.latest)
		const requestedVersion = this.metadata.normalizeOptionalString(version)
		const selectedVersion =
			requestedVersion && readRecord(versions?.[requestedVersion]) ? requestedVersion : latestVersion
		const manifest = selectedVersion ? readRecord(versions?.[selectedVersion]) : null
		const tarball = this.metadata.normalizeOptionalString(readRecord(manifest?.dist)?.tarball)
		if (!tarball) {
			return null
		}

		return {
			version: selectedVersion ?? null,
			tarball
		}
	}

	private async readReadmeFromDirectory(
		packageRoot: string,
		locale: string | null,
		source: PluginMarketplaceReadme['source']
	): Promise<PluginMarketplaceReadme | null> {
		for (const fileName of this.getReadmeFileCandidates(locale)) {
			try {
				const content = await readFile(resolve(packageRoot, fileName), 'utf8')
				return {
					locale: this.readLocaleFromReadmeFileName(fileName),
					requestedLocale: locale,
					fileName,
					content,
					source
				}
			} catch (error) {
				if (!this.isFileNotFoundError(error)) {
					this.metadata.logger.warn(
						`Failed to read README file "${fileName}" from plugin package: ${this.metadata.toErrorMessage(error)}`
					)
				}
			}
		}

		return null
	}

	async resolveAvailableReadmeLocales(plugin: PluginMarketplaceItem) {
		const loadedPlugin = this.metadata.findLoadedPluginByName(plugin.packageName ?? plugin.name)
		const packageRoot = loadedPlugin ? resolveLoadedPluginBundleRoot(loadedPlugin) : null
		if (!packageRoot) {
			return []
		}

		try {
			const entries = await readdir(packageRoot)
			return this.metadata.uniqueStrings(
				entries.map((entry) => this.matchReadmeFileName(entry)).filter((locale): locale is string => !!locale)
			)
		} catch {
			return []
		}
	}

	private getReadmeFileCandidates(locale: string | null) {
		const variants = locale && locale !== 'en' ? this.metadata.uniqueStrings([locale, locale.split('-')[0]]) : []
		return [...variants.flatMap((variant) => [`README_${variant}.md`, `README.${variant}.md`]), 'README.md']
	}

	private normalizeReadmeLocale(locale: unknown) {
		const normalized = this.metadata.normalizeOptionalString(locale)?.replace(/_/g, '-').toLowerCase()
		if (!normalized) {
			return null
		}
		if (normalized === 'zh' || normalized === 'zh-cn' || normalized === 'zh-hans') {
			return 'zh-hans'
		}
		if (normalized === 'zh-tw' || normalized === 'zh-hk' || normalized === 'zh-mo' || normalized === 'zh-hant') {
			return 'zh-hant'
		}
		if (normalized.startsWith('en')) {
			return 'en'
		}
		return normalized
	}

	private readLocaleFromReadmeFileName(fileName: string) {
		return this.matchReadmeFileName(fileName) ?? 'en'
	}

	private matchReadmeFileName(fileName: string) {
		const match = /^README(?:[_.]([a-z0-9-]+))?\.md$/i.exec(fileName)
		if (!match) {
			return null
		}
		return this.normalizeReadmeLocale(match[1]) ?? 'en'
	}

	private resolveMarketplaceMetadataReadme(plugin: PluginMarketplaceItem, targetApp?: string) {
		const targetAppMeta = readRecord(plugin.targetAppMeta)
		if (!targetAppMeta) {
			return null
		}

		if (targetApp) {
			const readme = readRecord(readRecord(targetAppMeta[targetApp])?.marketplace)?.readme
			return this.metadata.normalizeOptionalString(readme)
		}

		for (const entry of Object.values(targetAppMeta)) {
			const readme = readRecord(readRecord(entry)?.marketplace)?.readme
			const normalized = this.metadata.normalizeOptionalString(readme)
			if (normalized) {
				return normalized
			}
		}
		return null
	}

	private resolveLocalizedText(value: unknown, locale: string | null) {
		if (typeof value === 'string') {
			return value
		}
		const record = readRecord(value)
		if (!record) {
			return null
		}

		const localeKeys = this.getLocaleLookupKeys(locale)
		for (const key of localeKeys) {
			const text = this.metadata.normalizeOptionalString(record[key])
			if (text) {
				return text
			}
		}

		return Object.values(record).find((item): item is string => typeof item === 'string' && !!item.trim()) ?? null
	}

	private getLocaleLookupKeys(locale: string | null) {
		if (locale === 'zh-hans') {
			return ['zh-Hans', 'zh_Hans', 'zh-CN', 'zh_CN', 'zh-hans', 'zh_cn', 'zh']
		}
		if (locale === 'zh-hant') {
			return ['zh-Hant', 'zh_Hant', 'zh-TW', 'zh_TW', 'zh-hant', 'zh_tw']
		}
		return ['en-US', 'en_US', 'en']
	}

	private isFileNotFoundError(error: unknown) {
		return isRecord(error) && error.code === 'ENOENT'
	}

	async enrichCatalogWithNpmPackageData(
		catalog: NormalizedMarketplaceCatalog
	): Promise<NormalizedMarketplaceCatalog> {
		const withMetadata = await this.enrichCatalogWithNpmMetadata(catalog)
		return this.enrichCatalogWithNpmBundleManifests(withMetadata)
	}

	private async enrichCatalogWithNpmBundleManifests(
		catalog: NormalizedMarketplaceCatalog
	): Promise<NormalizedMarketplaceCatalog> {
		if (!catalog.plugins.length) {
			return catalog
		}

		const plugins: MarketplaceRegistryPlugin[] = []
		let changed = false
		for (let index = 0; index < catalog.plugins.length; index += NPM_DOWNLOADS_CONCURRENCY) {
			const batch = catalog.plugins.slice(index, index + NPM_DOWNLOADS_CONCURRENCY)
			const hydrated = await Promise.all(batch.map((plugin) => this.hydratePluginWithNpmBundleManifest(plugin)))
			for (let itemIndex = 0; itemIndex < hydrated.length; itemIndex += 1) {
				if (hydrated[itemIndex] !== batch[itemIndex]) {
					changed = true
				}
				plugins.push(hydrated[itemIndex])
			}
		}

		return changed
			? {
					...catalog,
					plugins
				}
			: catalog
	}

	async hydratePluginWithNpmBundleManifest(plugin: MarketplaceRegistryPlugin): Promise<MarketplaceRegistryPlugin> {
		const packageName = this.getNpmPackageName(plugin)
		if (!packageName) {
			return plugin
		}

		const manifest = await this.getNpmBundleManifest(
			packageName,
			this.metadata.normalizeOptionalString(plugin.version)
		)
		if (!manifest) {
			return plugin
		}

		return this.metadata.mergeBundleManifestMeta(plugin, manifest)
	}

	async getNpmBundleManifest(packageName: string, version: string | null) {
		const normalizedVersion = this.metadata.normalizeOptionalString(version)
		const cacheKey = `${normalizePluginName(packageName)}@${normalizedVersion ?? 'latest'}`
		return this.npmBundleManifestCache.load(cacheKey, async () => {
			try {
				return await this.fetchNpmBundleManifest(packageName, normalizedVersion)
			} catch (error) {
				this.metadata.logger.warn(
					`Failed to load bundle manifest for npm plugin "${packageName}": ${this.metadata.toErrorMessage(error)}`
				)
				return null
			}
		})
	}

	private async fetchNpmBundleManifest(
		packageName: string,
		version: string | null
	): Promise<XpertPluginBundleManifest | null> {
		let tempDir: string | null = null

		try {
			const archive = await this.fetchNpmPackageArchive(packageName, version)
			if (!archive) {
				return null
			}

			const tarballResponse = await this.fetchMarketplaceRequest(archive.tarball)
			if (!tarballResponse.ok) {
				throw new Error(`npm tarball returned ${tarballResponse.status}`)
			}

			tempDir = await mkdtemp(join(tmpdir(), 'xpert-plugin-manifest-'))
			const archivePath = join(tempDir, 'package.tgz')
			await writeFile(archivePath, Buffer.from(await tarballResponse.arrayBuffer()))
			await execFile('tar', ['-xzf', archivePath, '-C', tempDir])
			return readPluginBundleManifest(join(tempDir, 'package'))?.manifest ?? null
		} finally {
			if (tempDir) {
				await rm(tempDir, { recursive: true, force: true })
			}
		}
	}

	async enrichCatalogWithNpmDownloads(catalog: NormalizedMarketplaceCatalog): Promise<NormalizedMarketplaceCatalog> {
		const packageNames = this.metadata.uniqueStrings(
			catalog.plugins.map((plugin) => this.getNpmPackageName(plugin)).filter(Boolean)
		)
		if (!packageNames.length) {
			return catalog
		}

		const downloadsByPackageName = await this.fetchNpmDownloadCounts(packageNames)
		if (!downloadsByPackageName.size) {
			return catalog
		}

		return {
			...catalog,
			plugins: catalog.plugins.map((plugin) => {
				const packageName = this.getNpmPackageName(plugin)
				const lastMonth = packageName ? downloadsByPackageName.get(packageName) : undefined
				if (typeof lastMonth !== 'number') {
					return plugin
				}

				return {
					...plugin,
					downloads: {
						...(readRecord(plugin.downloads) ?? {}),
						lastMonth
					}
				}
			})
		}
	}

	private async enrichCatalogWithNpmMetadata(
		catalog: NormalizedMarketplaceCatalog
	): Promise<NormalizedMarketplaceCatalog> {
		const packageNames = this.metadata.uniqueStrings(
			catalog.plugins
				.filter((plugin) => !plugin.level)
				.map((plugin) => this.getNpmPackageName(plugin))
				.filter(Boolean)
		)
		if (!packageNames.length) {
			return catalog
		}

		const metadataByPackageName = await this.fetchNpmPluginMetadata(packageNames)
		if (!metadataByPackageName.size) {
			return catalog
		}

		return {
			...catalog,
			plugins: catalog.plugins.map((plugin) => {
				if (plugin.level) {
					return plugin
				}

				const packageName = this.getNpmPackageName(plugin)
				const metadata = packageName ? metadataByPackageName.get(packageName) : undefined
				if (!metadata?.level) {
					return plugin
				}

				return {
					...plugin,
					level: metadata.level
				}
			})
		}
	}

	private async fetchNpmPluginMetadata(packageNames: string[]) {
		const result = new Map<string, { level?: PluginLevel }>()

		for (let index = 0; index < packageNames.length; index += NPM_DOWNLOADS_CONCURRENCY) {
			const batch = packageNames.slice(index, index + NPM_DOWNLOADS_CONCURRENCY)
			const entries = await Promise.all(
				batch.map(
					async (packageName): Promise<[string, { level?: PluginLevel } | null]> => [
						packageName,
						await this.getNpmPackageMetadata(packageName)
					]
				)
			)

			for (const [packageName, metadata] of entries) {
				if (metadata) {
					result.set(packageName, metadata)
				}
			}
		}

		return result
	}

	async getNpmPackageMetadata(packageName: string) {
		return this.npmMetadataCache.load(packageName, () => this.fetchNpmPackageMetadata(packageName))
	}

	private async fetchNpmPackageMetadata(packageName: string): Promise<{ level?: PluginLevel } | null> {
		const url = `https://registry.npmjs.org/${encodeURIComponent(packageName)}`
		try {
			const response = await this.fetchMarketplaceRequest(url)
			if (!response.ok) {
				throw new Error(`npm registry returned ${response.status}`)
			}
			const data = readRecord(await response.json())
			const distTags = readRecord(data?.['dist-tags'])
			const latestVersion = this.metadata.normalizeOptionalString(distTags?.latest)
			const versions = readRecord(data?.versions)
			const latestManifest = latestVersion ? readRecord(versions?.[latestVersion]) : null
			const level = latestManifest ? this.metadata.readMarketplacePluginLevel(latestManifest) : undefined

			return {
				level: level ?? (data ? this.metadata.readMarketplacePluginLevel(data) : undefined)
			}
		} catch (error) {
			this.metadata.logger.warn(
				`Failed to load npm metadata for "${packageName}": ${this.metadata.toErrorMessage(error)}`
			)
			return null
		}
	}

	async fetchNpmDownloadCounts(packageNames: string[]) {
		const result = new Map<string, number>()

		for (let index = 0; index < packageNames.length; index += NPM_DOWNLOADS_CONCURRENCY) {
			const batch = packageNames.slice(index, index + NPM_DOWNLOADS_CONCURRENCY)
			const entries = await Promise.all(
				batch.map(
					async (packageName): Promise<[string, number | null]> => [
						packageName,
						await this.npmDownloadsCache.load(packageName, () => this.fetchNpmDownloadCount(packageName))
					]
				)
			)

			for (const [packageName, downloads] of entries) {
				if (typeof downloads === 'number') {
					result.set(packageName, downloads)
				}
			}
		}

		return result
	}

	private async fetchNpmDownloadCount(packageName: string) {
		const url = `https://api.npmjs.org/downloads/point/last-month/${encodeURIComponent(packageName)}`
		try {
			const response = await this.fetchMarketplaceRequest(url)
			if (!response.ok) {
				throw new Error(`npm downloads API returned ${response.status}`)
			}
			const data = await response.json()
			return typeof data?.downloads === 'number' ? data.downloads : null
		} catch (error) {
			this.metadata.logger.warn(
				`Failed to load npm downloads for "${packageName}": ${this.metadata.toErrorMessage(error)}`
			)
			return null
		}
	}

	private getNpmPackageName(plugin: MarketplaceRegistryPlugin) {
		const source = readRecord(plugin.source)
		const sourceType = this.metadata.normalizeOptionalString(source?.type)?.toLowerCase()
		const sourceUrl = this.metadata.normalizeOptionalString(source?.url)
		const packageNameFromUrl = sourceUrl ? this.extractNpmPackageNameFromUrl(sourceUrl) : null
		const packageName =
			packageNameFromUrl ??
			this.metadata.normalizeOptionalString(source?.packageName) ??
			this.metadata.normalizeOptionalString(plugin.packageName) ??
			this.metadata.normalizeOptionalString(plugin.name)
		if (!packageName) {
			return null
		}
		if (sourceType !== 'npm' && sourceType !== 'marketplace' && !packageNameFromUrl) {
			return null
		}
		if (!this.looksLikeNpmPackageName(packageName)) {
			return null
		}

		return normalizePluginName(packageName)
	}

	private extractNpmPackageNameFromUrl(value: string) {
		try {
			const url = new URL(value)
			if (!/(^|\.)npmjs\.com$/i.test(url.hostname)) {
				return null
			}
			const marker = '/package/'
			const markerIndex = url.pathname.indexOf(marker)
			if (markerIndex < 0) {
				return null
			}
			const encodedPackageName = url.pathname.slice(markerIndex + marker.length).replace(/\/+$/, '')
			return this.metadata.normalizeOptionalString(decodeURIComponent(encodedPackageName))
		} catch {
			return this.looksLikeNpmPackageName(value) ? value.trim() : null
		}
	}

	looksLikeNpmPackageName(value: string) {
		return /^(@[^/\s]+\/)?[a-z0-9._~-]+$/i.test(value.trim())
	}

	async fetchJson(url: string) {
		const response = await this.fetchMarketplaceRequest(url)
		if (!response.ok) {
			throw new BadRequestException(`Failed to fetch marketplace index (${response.status})`)
		}
		return response.json()
	}

	async tryFetchJson(url: string) {
		const response = await this.fetchMarketplaceRequest(url)
		if (response.status === 404) {
			return null
		}
		if (!response.ok) {
			throw new BadRequestException(`Failed to fetch marketplace index (${response.status})`)
		}
		return response.json()
	}

	private configureMarketplaceProxy() {
		const configuredUrl = process.env.XPERT_PLUGIN_MARKETPLACE_PROXY_URL?.trim()
		if (!configuredUrl) {
			return
		}

		try {
			const proxyUrl = new URL(configuredUrl)
			if (proxyUrl.protocol !== 'http:' && proxyUrl.protocol !== 'https:') {
				throw new Error('Unsupported proxy protocol')
			}
			this.marketplaceProxyAgent = new ProxyAgent(proxyUrl.toString())
		} catch {
			this.marketplaceProxyConfigurationError = new Error(
				'XPERT_PLUGIN_MARKETPLACE_PROXY_URL must be a valid HTTP or HTTPS URL'
			)
		}
	}

	private fetchMarketplaceRequest(input: string | URL | Request, init?: RequestInit) {
		if (this.marketplaceProxyConfigurationError) {
			throw this.marketplaceProxyConfigurationError
		}
		const timeout = AbortSignal.timeout(MARKETPLACE_REQUEST_TIMEOUT_MS)
		const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout
		if (!this.marketplaceProxyAgent) {
			return fetch(input, { ...init, signal })
		}

		return fetch(input, {
			...(init ?? {}),
			signal,
			dispatcher: this.marketplaceProxyAgent
		} as RequestInit & { dispatcher: Dispatcher })
	}
}
