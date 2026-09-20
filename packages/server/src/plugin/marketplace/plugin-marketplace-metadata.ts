import { ForbiddenException, Logger } from '@nestjs/common'

import {
	type I18nObject,
	type I18nText,
	PLUGIN_LEVEL,
	PluginMarketplaceContribution,
	type PluginMarketplaceItem,
	PluginMarketplaceOperation,
	type PluginLevel,
	type PluginMarketplaceTrialShortcut,
	PluginMeta,
	RolesEnum,
	type XpertPluginBundleManifest
} from '@xpert-ai/contracts'
import {
	derivePluginArtifactNamespace,
	GLOBAL_ORGANIZATION_SCOPE,
	RequestContext,
	SYSTEM_GLOBAL_SCOPE,
	resolveTenantGlobalScopeKey
} from '@xpert-ai/plugin-sdk'

import { join } from 'node:path'

import { LoadedPluginRecord, normalizePluginName } from '../types'

import {
	JsonRecord,
	MarketplaceSourceRecord,
	MarketplaceRegistryPlugin,
	NormalizedMarketplaceCatalog,
	InstalledPluginContext,
	isRecord,
	readRecord,
	isArtifactNamespace
} from './plugin-marketplace.types'

/** Normalize source catalogs, bundle metadata and installed-plugin overlays consistently. */
export class PluginMarketplaceMetadata {
	constructor(private readonly loadedPlugins: Array<LoadedPluginRecord>) {}
	readonly logger = new Logger('PluginMarketplaceService')

	findLoadedPluginByName(name: string | undefined | null) {
		const normalizedName = this.normalizeOptionalString(name)
		if (!normalizedName) {
			return null
		}

		const currentOrganizationId = this.getCurrentOrganizationId()
		const tenantId = RequestContext.getScope()?.tenantId ?? RequestContext.currentTenantId()
		const currentScopeKey =
			currentOrganizationId === GLOBAL_ORGANIZATION_SCOPE
				? resolveTenantGlobalScopeKey(tenantId)
				: currentOrganizationId
		const globalScopeKey = resolveTenantGlobalScopeKey(tenantId)
		const matches = (plugin: LoadedPluginRecord) =>
			[plugin.name, plugin.packageName, plugin.instance?.meta?.name]
				.map((value) => this.normalizeOptionalString(value))
				.filter((value): value is string => !!value)
				.some((value) => normalizePluginName(value) === normalizePluginName(normalizedName))

		return (
			this.loadedPlugins.find(
				(plugin) => (plugin.scopeKey ?? plugin.organizationId) === currentScopeKey && matches(plugin)
			) ??
			this.loadedPlugins.find(
				(plugin) =>
					currentOrganizationId !== GLOBAL_ORGANIZATION_SCOPE &&
					(plugin.scopeKey ?? plugin.organizationId) === globalScopeKey &&
					matches(plugin)
			) ??
			this.loadedPlugins.find(
				(plugin) => (plugin.scopeKey ?? plugin.organizationId) === SYSTEM_GLOBAL_SCOPE && matches(plugin)
			) ??
			null
		)
	}

	normalizeCatalog(raw: unknown, source: MarketplaceSourceRecord): NormalizedMarketplaceCatalog {
		const record = readRecord(raw)
		const plugins = this.extractRegistryItems(raw)
			.map((item, index) => this.normalizeRegistryPlugin(item, source, index))
			.filter((item): item is MarketplaceRegistryPlugin => !!item)
		const updatedAt = this.normalizeOptionalString(record?.updatedAt) ?? new Date().toISOString()

		return {
			updatedAt,
			total: plugins.length,
			plugins,
			official: this.readStringArray(record?.official),
			partner: this.readStringArray(record?.partner),
			community: this.readStringArray(record?.community)
		}
	}

	readCachedCatalog(value: unknown): NormalizedMarketplaceCatalog | null {
		if (!isRecord(value)) {
			return null
		}
		if (Array.isArray(value.plugins)) {
			return {
				updatedAt: this.normalizeOptionalString(value.updatedAt),
				total: Number(value.total ?? value.plugins.length),
				plugins: value.plugins.filter(
					(plugin): plugin is MarketplaceRegistryPlugin => isRecord(plugin) && typeof plugin.name === 'string'
				),
				official: this.readStringArray(value.official),
				partner: this.readStringArray(value.partner),
				community: this.readStringArray(value.community)
			}
		}
		return null
	}

	private extractRegistryItems(raw: unknown): JsonRecord[] {
		if (Array.isArray(raw)) {
			return raw.filter(isRecord)
		}
		const record = readRecord(raw)
		if (!record) {
			return []
		}

		for (const key of ['plugins', 'items']) {
			if (Array.isArray(record[key])) {
				return record[key].filter(isRecord)
			}
		}

		const xpertPlugin = readRecord(record.xpertPlugin) ?? readRecord(record.xpertAiPlugin)
		const marketplace = readRecord(record.marketplace) ?? readRecord(xpertPlugin?.marketplace)
		if (Array.isArray(marketplace?.plugins)) {
			return marketplace.plugins.filter(isRecord)
		}
		if (marketplace && this.looksLikePlugin(marketplace)) {
			return [this.mergePackageJsonPlugin(record, marketplace)]
		}

		const meta =
			readRecord(record.plugin) ??
			readRecord(record.meta) ??
			readRecord(xpertPlugin?.meta) ??
			(xpertPlugin && this.looksLikePlugin(xpertPlugin) ? xpertPlugin : null)
		if (meta && this.looksLikePlugin(meta)) {
			return [this.mergePackageJsonPlugin(record, meta)]
		}

		if (this.looksLikePlugin(record)) {
			return [record]
		}

		return []
	}

	private mergePackageJsonPlugin(packageJson: JsonRecord, plugin: JsonRecord): JsonRecord {
		const pluginInterface = readRecord(plugin.interface) ?? readRecord(packageJson.interface) ?? {}
		return {
			name: plugin.name ?? packageJson.name,
			version: plugin.version ?? packageJson.version,
			artifactNamespace:
				this.readMarketplaceArtifactNamespace(plugin) ?? this.readMarketplaceArtifactNamespace(packageJson),
			displayName:
				plugin.displayName ??
				plugin.title ??
				pluginInterface.displayName ??
				packageJson.displayName ??
				packageJson.name,
			description:
				plugin.description ??
				packageJson.description ??
				pluginInterface.shortDescription ??
				pluginInterface.longDescription ??
				'',
			category: plugin.category ?? pluginInterface.category ?? 'integration',
			author: plugin.author ?? packageJson.author,
			homepage: plugin.homepage ?? packageJson.homepage,
			repository: plugin.repository ?? packageJson.repository,
			...plugin,
			level: this.readMarketplacePluginLevel(plugin) ?? this.readMarketplacePluginLevel(packageJson)
		}
	}

	normalizeRegistryPlugin(
		input: JsonRecord,
		source: MarketplaceSourceRecord,
		index: number
	): MarketplaceRegistryPlugin | null {
		const name = this.normalizeOptionalString(input.name ?? input.pluginName ?? input.packageName)
		if (!name) {
			return null
		}
		const pluginInterface = readRecord(input.interface) ?? {}
		const entrySource = this.normalizeMarketplacePluginSource(input.source, source)

		const item: MarketplaceRegistryPlugin = {
			...input,
			name,
			packageName: this.normalizeOptionalString(input.packageName) ?? name,
			version: this.normalizeOptionalString(input.version) ?? null,
			artifactNamespace: this.readMarketplaceArtifactNamespace(input) ?? null,
			displayName: input.displayName ?? input.title ?? pluginInterface.displayName ?? name,
			description: input.description ?? pluginInterface.shortDescription ?? pluginInterface.longDescription ?? '',
			level: this.readMarketplacePluginLevel(input),
			category: input.category ?? pluginInterface.category ?? 'integration',
			keywords: Array.isArray(input.keywords) ? input.keywords.filter((value) => typeof value === 'string') : [],
			screenshots: this.readStringArray(input.screenshots ?? pluginInterface.screenshots),
			targetApps: Array.isArray(input.targetApps)
				? input.targetApps.filter((value) => typeof value === 'string')
				: [],
			targetAppMeta: readRecord(input.targetAppMeta) ?? {},
			sourceId: source.id,
			sourceName: source.name,
			source: entrySource,
			policy: readRecord(input.policy) ?? undefined,
			interface: Object.keys(pluginInterface).length ? pluginInterface : undefined,
			defaultPrompt: this.readStringArray(pluginInterface.defaultPrompt),
			_marketplaceIndex: index
		}

		return item
	}

	readMarketplacePluginLevel(input: JsonRecord): PluginLevel | undefined {
		return (
			this.normalizePluginLevel(input.level) ??
			this.normalizePluginLevel(readRecord(input.meta)?.level) ??
			this.normalizePluginLevel(readRecord(readRecord(input.xpert)?.plugin)?.level)
		)
	}

	private readMarketplaceArtifactNamespace(input: JsonRecord) {
		return (
			this.normalizeOptionalString(readRecord(readRecord(input.xpert)?.plugin)?.artifactNamespace) ??
			this.normalizeOptionalString(input.artifactNamespace)
		)
	}

	private normalizePluginLevel(value: unknown): PluginLevel | undefined {
		if (value === PLUGIN_LEVEL.SYSTEM || value === PLUGIN_LEVEL.TENANT || value === PLUGIN_LEVEL.ORGANIZATION) {
			return value
		}
		return undefined
	}

	private normalizeMarketplacePluginSource(value: unknown, source: MarketplaceSourceRecord) {
		const sourceRecord = readRecord(value)
		if (sourceRecord) {
			const kind = this.normalizeOptionalString(sourceRecord.source ?? sourceRecord.type)
			return {
				...sourceRecord,
				...(kind ? { type: kind, source: kind } : {})
			}
		}

		const pathSource = this.normalizeOptionalString(value)
		if (pathSource) {
			return {
				type: 'local',
				source: 'local',
				path: pathSource
			}
		}

		return {
			type: source.builtin ? 'marketplace' : source.type,
			source: source.builtin ? 'marketplace' : source.type,
			url: source.url
		}
	}

	mergeBundleManifestMeta(
		plugin: MarketplaceRegistryPlugin,
		manifest: XpertPluginBundleManifest
	): MarketplaceRegistryPlugin {
		const registryInterface = readRecord(plugin.interface) ?? {}
		const bundleInterface = readRecord(manifest.interface) ?? {}
		const mergedInterface = {
			...bundleInterface,
			...registryInterface
		}
		const bundleAssets = readRecord(manifest.assets) ?? {}
		const registryDefaultPrompt = this.readStringArray(plugin.defaultPrompt)
		const bundleDefaultPrompt = this.readStringArray(mergedInterface.defaultPrompt)
		const registryScreenshots = this.readStringArray(plugin.screenshots)
		const bundleScreenshots = this.readStringArray(mergedInterface.screenshots ?? bundleAssets.screenshots)
		const bundleLogo = this.normalizeOptionalString(mergedInterface.logo ?? bundleAssets.logo)
		const bundleHomepage =
			this.normalizeOptionalString(mergedInterface.websiteURL) ?? this.normalizeOptionalString(manifest.homepage)
		const source = readRecord(plugin.source)
		const packageName = this.normalizeOptionalString(plugin.packageName) ?? normalizePluginName(manifest.name)

		return {
			...plugin,
			packageName,
			version: this.normalizeOptionalString(plugin.version) ?? manifest.version ?? null,
			artifactNamespace:
				this.normalizeOptionalString(plugin.artifactNamespace) ??
				this.normalizeOptionalString(manifest.artifactNamespace) ??
				this.resolveMarketplaceArtifactNamespace({ name: manifest.name, packageName }),
			displayName: this.hasPresentValue(plugin.displayName)
				? plugin.displayName
				: (this.normalizeOptionalString(mergedInterface.displayName) ?? manifest.name),
			description: this.hasPresentValue(plugin.description)
				? plugin.description
				: (this.normalizeOptionalString(mergedInterface.shortDescription) ??
					this.normalizeOptionalString(mergedInterface.longDescription) ??
					manifest.description ??
					''),
			author: this.hasPresentValue(plugin.author)
				? plugin.author
				: (manifest.author ?? this.normalizeOptionalString(mergedInterface.developerName)),
			homepage: this.hasPresentValue(plugin.homepage) ? plugin.homepage : (bundleHomepage ?? undefined),
			repository: plugin.repository ?? manifest.repository,
			keywords: this.readStringArray(plugin.keywords).length
				? this.readStringArray(plugin.keywords)
				: (manifest.keywords ?? []),
			icon: plugin.icon ?? (bundleLogo ? { type: 'image', value: bundleLogo } : undefined),
			screenshots: registryScreenshots.length ? registryScreenshots : bundleScreenshots,
			targetApps: this.uniqueStrings([...(plugin.targetApps ?? []), ...(manifest.targetApps ?? [])]),
			targetAppMeta: this.mergeTargetAppMeta(
				readRecord(plugin.targetAppMeta) ?? {},
				readRecord(manifest.targetAppMeta) ?? {}
			),
			source: source
				? {
						...source,
						packageName: this.normalizeOptionalString(source.packageName) ?? packageName
					}
				: plugin.source,
			policy: plugin.policy ?? manifest.policy,
			interface: Object.keys(mergedInterface).length ? mergedInterface : undefined,
			defaultPrompt: registryDefaultPrompt.length ? registryDefaultPrompt : bundleDefaultPrompt
		}
	}

	mergeInstalledPluginMeta(
		plugin: MarketplaceRegistryPlugin,
		loadedMetaByName: Map<string, PluginMeta>
	): MarketplaceRegistryPlugin {
		const loadedMeta = this.findLoadedMeta(plugin, loadedMetaByName)
		if (!loadedMeta) {
			return plugin
		}

		return {
			...plugin,
			displayName: plugin.displayName ?? loadedMeta.displayName,
			description: plugin.description ?? loadedMeta.description,
			artifactNamespace:
				this.normalizeOptionalString(plugin.artifactNamespace) ??
				this.normalizeOptionalString(loadedMeta.artifactNamespace) ??
				this.resolveMarketplaceArtifactNamespace({ name: loadedMeta.name, packageName: plugin.packageName }),
			level: this.normalizePluginLevel(plugin.level) ?? loadedMeta.level,
			icon: plugin.icon ?? loadedMeta.icon,
			keywords: plugin.keywords?.length ? plugin.keywords : (loadedMeta.keywords ?? []),
			targetApps: this.uniqueStrings([...(plugin.targetApps ?? []), ...(loadedMeta.targetApps ?? [])]),
			targetAppMeta: this.mergeTargetAppMeta(
				readRecord(plugin.targetAppMeta) ?? {},
				readRecord(loadedMeta.targetAppMeta) ?? {}
			)
		}
	}

	private mergeTargetAppMeta(registryMeta: JsonRecord, loadedMeta: JsonRecord) {
		const keys = this.uniqueStrings([...Object.keys(registryMeta), ...Object.keys(loadedMeta)])
		const merged: JsonRecord = {}

		for (const key of keys) {
			const registryEntry = readRecord(registryMeta[key]) ?? {}
			const loadedEntry = readRecord(loadedMeta[key]) ?? {}
			merged[key] = {
				...registryEntry,
				...loadedEntry,
				types: this.uniqueStrings([...(registryEntry.types ?? []), ...(loadedEntry.types ?? [])]),
				capabilities: this.uniqueStrings([
					...(registryEntry.capabilities ?? []),
					...(loadedEntry.capabilities ?? [])
				]),
				marketplace: this.mergeMarketplaceMetadata(registryEntry.marketplace, loadedEntry.marketplace),
				runtime: {
					...(readRecord(registryEntry.runtime) ?? {}),
					...(readRecord(loadedEntry.runtime) ?? {})
				}
			}
		}

		return merged
	}

	private mergeMarketplaceMetadata(registryValue: unknown, loadedValue: unknown) {
		const registry = readRecord(registryValue) ?? {}
		const loaded = readRecord(loadedValue) ?? {}
		return {
			...registry,
			...loaded,
			contents: this.mergeContributions(registry.contents, loaded.contents)
		}
	}

	private mergeContributions(...groups: unknown[]): PluginMarketplaceContribution[] {
		const byKey = new Map<string, PluginMarketplaceContribution>()

		for (const group of groups) {
			if (!Array.isArray(group)) {
				continue
			}
			for (const item of group) {
				if (!isRecord(item) || typeof item.name !== 'string' || typeof item.type !== 'string') {
					continue
				}
				const contribution = item as PluginMarketplaceContribution
				const key = this.getContributionKey(contribution)
				if (!key) {
					continue
				}
				byKey.set(key, {
					...(byKey.get(key) ?? {}),
					...contribution
				})
			}
		}

		return Array.from(byKey.values())
	}

	private getContributionKey(contribution: PluginMarketplaceContribution) {
		const type = this.normalizeOptionalString(contribution.type)
		const identity =
			type === 'assistant-template'
				? (this.normalizeOptionalString(readRecord(contribution.metadata)?.templateId) ??
					this.normalizeOptionalString(contribution.id) ??
					this.normalizeOptionalString(contribution.name))
				: (this.normalizeOptionalString(contribution.id) ?? this.normalizeOptionalString(contribution.name))

		return type && identity ? `${type}:${identity}` : null
	}

	toMarketplaceItem(
		plugin: MarketplaceRegistryPlugin,
		targetApp: string | undefined,
		installedContext: InstalledPluginContext
	): PluginMarketplaceItem {
		const installed = this.isInstalled(plugin, installedContext.installedNames)
		const contributions = this.getMarketplaceContributions(plugin, targetApp)
		const trialShortcuts = this.getMarketplaceTrialShortcuts(plugin, targetApp)

		return {
			...plugin,
			artifactNamespace: this.resolveMarketplaceArtifactNamespace(plugin),
			sourceId: plugin.sourceId,
			sourceName: plugin.sourceName,
			installed,
			contributions,
			trialShortcuts,
			operationSummary: this.countOperations(contributions),
			marketplacePlugin: plugin
		}
	}

	toPublicMarketplaceItem(item: PluginMarketplaceItem): PluginMarketplaceItem {
		return {
			name: item.name,
			packageName: item.packageName,
			displayName: item.displayName,
			description: item.description,
			version: item.version,
			artifactNamespace: item.artifactNamespace,
			level: item.level,
			deprecated: item.deprecated,
			deprecationMessage: item.deprecationMessage,
			category: item.category,
			icon: item.icon,
			author: item.author,
			keywords: item.keywords,
			screenshots: item.screenshots,
			downloads: item.downloads,
			installed: false,
			contributions: item.contributions,
			defaultPrompt: item.defaultPrompt,
			trialShortcuts: item.trialShortcuts,
			operationSummary: item.operationSummary,
			targetApps: item.targetApps,
			targetAppMeta: item.targetAppMeta,
			section: item.section
		}
	}

	getMarketplaceContributions(plugin: MarketplaceRegistryPlugin, targetApp?: string) {
		if (!targetApp) {
			return this.mergeContributions(
				...Object.values(readRecord(plugin.targetAppMeta) ?? {}).map((metadata) =>
					this.getContributionList(readRecord(metadata)?.marketplace)
				)
			)
		}

		const targetMetadata = readRecord(readRecord(plugin.targetAppMeta)?.[targetApp])
		return this.mergeContributions(this.getContributionList(targetMetadata?.marketplace))
	}

	private getContributionList(value: unknown): PluginMarketplaceContribution[] {
		const marketplace = readRecord(value)
		if (!Array.isArray(marketplace?.contents)) {
			return []
		}
		return marketplace.contents.filter(
			(item): item is PluginMarketplaceContribution =>
				isRecord(item) && typeof item.name === 'string' && typeof item.type === 'string'
		)
	}

	getMarketplaceTrialShortcuts(plugin: MarketplaceRegistryPlugin, targetApp?: string) {
		const structured = this.getMarketplaceTrialShortcutList(plugin, targetApp)
		if (structured.length) {
			return structured
		}

		return this.readStringArray(plugin.defaultPrompt ?? readRecord(plugin.interface)?.defaultPrompt)
			.slice(0, 3)
			.map(
				(prompt, index): PluginMarketplaceTrialShortcut => ({
					id: `default-${index + 1}`,
					prompt: prompt.trim()
				})
			)
	}

	private getMarketplaceTrialShortcutList(plugin: MarketplaceRegistryPlugin, targetApp?: string) {
		const targetAppMeta = readRecord(plugin.targetAppMeta) ?? {}
		const metadataValues = targetApp
			? [readRecord(targetAppMeta[targetApp])]
			: Object.values(targetAppMeta).map((metadata) => readRecord(metadata))

		return metadataValues
			.flatMap((metadata) => this.readTrialShortcuts(readRecord(metadata?.marketplace)?.trialShortcuts))
			.slice(0, 3)
	}

	private readTrialShortcuts(value: unknown): PluginMarketplaceTrialShortcut[] {
		if (!Array.isArray(value)) {
			return []
		}

		return value
			.map((item) => {
				const record = readRecord(item)
				const prompt = this.normalizeOptionalString(record?.prompt)
				if (!record || !prompt) {
					return null
				}

				const shortcut: PluginMarketplaceTrialShortcut = {
					prompt
				}
				const id = this.normalizeOptionalString(record.id)
				const label = this.normalizeTrialShortcutLabel(record.label)
				const skillKey = this.normalizeOptionalString(record.skillKey)
				const icon = readRecord(record.icon)

				if (id) {
					shortcut.id = id
				}
				if (label) {
					shortcut.label = label
				}
				if (skillKey) {
					shortcut.skillKey = skillKey
				}
				if (icon) {
					shortcut.icon = icon as PluginMarketplaceTrialShortcut['icon']
				}

				return shortcut
			})
			.filter((item): item is PluginMarketplaceTrialShortcut => !!item)
	}

	private normalizeTrialShortcutLabel(value: unknown): string | I18nObject | null {
		return this.normalizeI18nText(value)
	}

	normalizeI18nText(value: unknown): I18nText | null {
		const label = this.normalizeOptionalString(value)
		if (label) {
			return label
		}

		const record = readRecord(value)
		const en_US = this.normalizeOptionalString(record?.en_US)
		if (!record || !en_US) {
			return null
		}

		const normalized: I18nObject = { en_US }
		const zh_Hans = this.normalizeOptionalString(record.zh_Hans)
		if (zh_Hans) {
			normalized.zh_Hans = zh_Hans
		}
		return normalized
	}

	readRegistryI18nText(value: string, localized?: I18nObject | null): I18nText {
		return localized?.en_US ? localized : value
	}

	readI18nEnglishFallback(value: I18nText): string {
		return typeof value === 'string' ? value : value.en_US
	}

	countOperations(contributions: PluginMarketplaceContribution[]) {
		const operations = contributions.flatMap((item) =>
			Array.isArray(item.operations) ? (item.operations as PluginMarketplaceOperation[]) : []
		)
		return {
			total: operations.length,
			read: operations.filter((operation) => operation.access === 'read').length,
			write: operations.filter((operation) => operation.access === 'write').length,
			admin: operations.filter((operation) => operation.access === 'admin').length
		}
	}

	matchesTargetApp(plugin: MarketplaceRegistryPlugin, targetApp?: string) {
		if (!targetApp?.trim()) {
			return true
		}
		const metadata = readRecord(plugin.targetAppMeta)?.[targetApp]
		return Boolean(plugin.targetApps?.includes(targetApp) || metadata)
	}

	matchesSearch(plugin: MarketplaceRegistryPlugin, search?: string) {
		const normalized = search?.trim().toLowerCase()
		if (!normalized) {
			return true
		}

		const values = [
			plugin.name,
			plugin.packageName,
			plugin.displayName,
			plugin.description,
			plugin.author,
			...(Array.isArray(plugin.keywords) ? plugin.keywords : [])
		]

		return values
			.flatMap((value) => this.searchStrings(value))
			.some((value) => value.toLowerCase().includes(normalized))
	}

	private findLoadedMeta(plugin: MarketplaceRegistryPlugin, loadedMetaByName: Map<string, PluginMeta>) {
		const names = [plugin.name, plugin.packageName, plugin.marketplacePluginName]
		for (const name of names) {
			const normalized = this.normalizeOptionalString(name)
			if (!normalized) {
				continue
			}
			const meta = loadedMetaByName.get(normalizePluginName(normalized))
			if (meta) {
				return meta
			}
		}
		return null
	}

	private isInstalled(plugin: MarketplaceRegistryPlugin, installedNames: Set<string>) {
		return [plugin.name, plugin.packageName]
			.map((name) => this.normalizeOptionalString(name))
			.filter((name): name is string => !!name)
			.some((name) => installedNames.has(normalizePluginName(name)))
	}

	getOrganizationValue(organizationId?: string | null) {
		return !organizationId || organizationId === GLOBAL_ORGANIZATION_SCOPE ? null : organizationId
	}

	getCurrentOrganizationId() {
		return RequestContext.getOrganizationId() ?? GLOBAL_ORGANIZATION_SCOPE
	}

	assertSuperAdmin() {
		if (!RequestContext.hasRole(RolesEnum.SUPER_ADMIN)) {
			throw new ForbiddenException('Only SuperAdmin users can manage the plugin marketplace')
		}
	}

	private looksLikePlugin(value: JsonRecord) {
		return Boolean(value.name || value.targetApps || value.targetAppMeta)
	}

	buildCandidatePaths(sparsePath?: string | null) {
		const base = this.normalizePath(sparsePath)
		const candidates = [
			'.agents/plugins/marketplace.json',
			'.claude-plugin/marketplace.json',
			'plugins/index.json',
			'plugin-marketplace.json',
			'marketplace.json',
			'index.json',
			'.xpert/marketplace.json',
			'.xpert/plugin-marketplace.json',
			'.xpertai-plugin/plugin.json',
			'plugin.json',
			'package.json'
		]

		if (!base) {
			return candidates
		}
		if (/\.(json|jsonc)$/i.test(base)) {
			return [base]
		}

		return candidates.map((candidate) => `${base}/${candidate}`)
	}

	private normalizePath(value?: string | null) {
		return this.normalizeOptionalString(value)?.replace(/^\/+|\/+$/g, '') ?? ''
	}

	buildGithubRawUrl(owner: string, repo: string, ref: string, filePath: string) {
		const encodedPath = filePath
			.split('/')
			.filter(Boolean)
			.map((segment) => encodeURIComponent(segment))
			.join('/')
		return `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(ref)}/${encodedPath}`
	}

	parseGithubRepository(value: string) {
		const input = value.trim()
		const ssh = /^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/i.exec(input)
		if (ssh) {
			return {
				owner: ssh[1],
				repo: ssh[2].replace(/\.git$/i, ''),
				ref: null,
				path: null
			}
		}

		const https = /^https?:\/\/github\.com\/([^/]+)\/([^/#?]+)(?:\/tree\/([^/]+)\/?(.*))?/i.exec(input)
		if (https) {
			return {
				owner: https[1],
				repo: https[2].replace(/\.git$/i, ''),
				ref: https[3] ?? null,
				path: https[4] ?? null
			}
		}

		const shorthand = /^([^/\s]+)\/([^/\s]+)$/i.exec(input)
		if (shorthand) {
			return {
				owner: shorthand[1],
				repo: shorthand[2].replace(/\.git$/i, ''),
				ref: null,
				path: null
			}
		}

		return null
	}

	getLatestCatalogDate(catalogs: NormalizedMarketplaceCatalog[]) {
		const dates = catalogs
			.map((catalog) => catalog.updatedAt)
			.filter((value): value is string => typeof value === 'string' && !!value)
			.map((value) => new Date(value).getTime())
			.filter((value) => Number.isFinite(value))

		if (!dates.length) {
			return null
		}

		return new Date(Math.max(...dates)).toISOString()
	}

	mergeCatalogNames(catalogs: NormalizedMarketplaceCatalog[], key: 'official' | 'partner' | 'community') {
		return Array.from(new Set(catalogs.flatMap((catalog) => catalog[key] ?? [])))
	}

	inferSourceName(url: string) {
		const github = this.parseGithubRepository(url)
		if (github) {
			return `${github.owner}/${github.repo}`
		}

		try {
			return new URL(url).hostname
		} catch {
			return url
		}
	}

	private searchStrings(value: unknown): string[] {
		if (typeof value === 'string') {
			return [value]
		}
		if (Array.isArray(value)) {
			return value.flatMap((item) => this.searchStrings(item))
		}
		if (isRecord(value)) {
			return Object.values(value).flatMap((item) => this.searchStrings(item))
		}
		return []
	}

	uniqueStrings(values: unknown[]) {
		return Array.from(
			new Set(
				values
					.flat()
					.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
					.map((value) => value.trim())
			)
		)
	}

	readStringArray(value: unknown) {
		return Array.isArray(value)
			? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
			: []
	}

	normalizeOptionalString(value: unknown) {
		return typeof value === 'string' && value.trim() ? value.trim() : null
	}

	/**
	 * Resolve the namespace displayed in marketplace responses.
	 * Invalid explicit values are ignored here; install-time validation remains the authoritative blocker.
	 */
	resolveMarketplaceArtifactNamespace(plugin: {
		artifactNamespace?: unknown
		name?: unknown
		packageName?: unknown
	}) {
		const explicit = this.normalizeOptionalString(plugin.artifactNamespace)
		if (explicit && isArtifactNamespace(explicit)) {
			return explicit
		}

		const packageName =
			this.normalizeOptionalString(plugin.packageName) ?? this.normalizeOptionalString(plugin.name)
		if (!packageName) {
			return null
		}

		try {
			return derivePluginArtifactNamespace(packageName)
		} catch {
			return null
		}
	}

	private hasPresentValue(value: unknown) {
		return typeof value === 'string' ? value.trim().length > 0 : value !== undefined && value !== null
	}

	toTimestamp(value?: Date | string | null) {
		if (!value) {
			return null
		}
		const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime()
		return Number.isFinite(timestamp) ? timestamp : null
	}

	toErrorMessage(error: unknown) {
		if (error instanceof Error && error.message.trim()) {
			return error.message
		}
		return String(error)
	}
}
