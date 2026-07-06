import {
	JSONValue,
	PLUGIN_COMPONENT_TYPE,
	PluginComponentType,
	PluginMarketplaceAuthenticationPolicy,
	PluginMarketplaceInstallationPolicy,
	PluginSourceConfig,
	PluginTargetAppMeta,
	XpertPluginBundleManifest,
	XpertPluginInstallInterface,
	XpertPluginMarketplacePolicy,
	XpertPluginMarketplaceSource
} from '@xpert-ai/contracts'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, dirname, extname, relative, resolve } from 'node:path'
import { getCodePackageDir, getCodeWorkspacePath } from './source-config'
import { normalizePluginName } from './types'

export interface PluginBundleManifestReadResult {
	manifest: XpertPluginBundleManifest
	manifestPath: string
}

export interface LoadedPluginBundleRootInput {
	name?: string | null
	packageName?: string | null
	baseDir?: string | null
	sourceConfig?: PluginSourceConfig | null
}

export interface PluginBundleComponentRegistration {
	componentType: PluginComponentType
	componentKey: string
	sourcePath?: string | null
	config?: JSONValue | null
	metadata?: JSONValue | null
	definitionHash: string
}

const MANIFEST_CANDIDATES = ['.xpertai-plugin/plugin.json', 'plugin.json'] as const
const DEFAULT_HOOKS_PATH = 'hooks/hooks.json'

type JsonDictionary = {
	[key: string]: unknown
}

function isJsonDictionary(value: unknown): value is JsonDictionary {
	return !!value && typeof value === 'object' && !Array.isArray(value)
}

function readString(value: unknown): string | undefined {
	return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function readBoolean(value: unknown): boolean | undefined {
	return typeof value === 'boolean' ? value : undefined
}

function readStringField(record: object | undefined | null, key: string): string | undefined {
	if (!record) {
		return undefined
	}
	return readString(Reflect.get(record, key))
}

function readBooleanField(record: object | undefined | null, key: string): boolean | undefined {
	if (!record) {
		return undefined
	}
	return readBoolean(Reflect.get(record, key))
}

function readStringArray(value: unknown): string[] | undefined {
	if (!Array.isArray(value)) {
		return undefined
	}

	const result: string[] = []
	for (const item of value) {
		const text = readString(item)
		if (!text) {
			return undefined
		}
		result.push(text)
	}
	return result
}

function readStringArrayField(record: object | undefined | null, key: string): string[] | undefined {
	if (!record) {
		return undefined
	}
	return readStringArray(Reflect.get(record, key))
}

function readObjectField(record: object | undefined | null, key: string): JsonDictionary | undefined {
	if (!record) {
		return undefined
	}
	const value = Reflect.get(record, key)
	return isJsonDictionary(value) ? value : undefined
}

function normalizeJsonValue(value: unknown): JSONValue | undefined {
	if (value === null) {
		return null
	}
	if (typeof value === 'string') {
		return value
	}
	if (typeof value === 'number') {
		return value
	}
	if (typeof value === 'boolean') {
		return value
	}

	if (Array.isArray(value)) {
		const items: JSONValue[] = []
		for (const item of value) {
			const normalized = normalizeJsonValue(item)
			if (normalized === undefined) {
				continue
			}
			items.push(normalized)
		}
		return items
	}

	if (isJsonDictionary(value)) {
		const entries: { [key: string]: JSONValue } = {}
		for (const [key, item] of Object.entries(value)) {
			const normalized = normalizeJsonValue(item)
			if (normalized !== undefined) {
				entries[key] = normalized
			}
		}
		return entries
	}

	return undefined
}

function normalizeStringOrStringArray(value: unknown): string | string[] | undefined {
	return readString(value) ?? readStringArray(value)
}

function normalizeInstallInterface(value: unknown): XpertPluginInstallInterface | undefined {
	if (!isJsonDictionary(value)) {
		return undefined
	}

	const result: XpertPluginInstallInterface = {
		displayName: readStringField(value, 'displayName'),
		shortDescription: readStringField(value, 'shortDescription'),
		longDescription: readStringField(value, 'longDescription'),
		developerName: readStringField(value, 'developerName'),
		category: readStringField(value, 'category'),
		capabilities: readStringArrayField(value, 'capabilities'),
		websiteURL: readStringField(value, 'websiteURL'),
		privacyPolicyURL: readStringField(value, 'privacyPolicyURL'),
		termsOfServiceURL: readStringField(value, 'termsOfServiceURL'),
		defaultPrompt: readStringArrayField(value, 'defaultPrompt'),
		brandColor: readStringField(value, 'brandColor'),
		composerIcon: readStringField(value, 'composerIcon'),
		logo: readStringField(value, 'logo'),
		screenshots: readStringArrayField(value, 'screenshots')
	}

	return removeUndefinedFields(result)
}

function normalizeMarketplacePolicy(value: unknown): XpertPluginMarketplacePolicy | undefined {
	if (!isJsonDictionary(value)) {
		return undefined
	}

	return removeUndefinedFields({
		installation: normalizeInstallationPolicy(readStringField(value, 'installation')),
		authentication: normalizeAuthenticationPolicy(readStringField(value, 'authentication')),
		pluginSharing: readBooleanField(value, 'pluginSharing') ?? readBooleanField(value, 'plugin_sharing')
	})
}

function normalizeInstallationPolicy(value: string | undefined): PluginMarketplaceInstallationPolicy | undefined {
	if (value === 'AVAILABLE' || value === 'INSTALLED_BY_DEFAULT' || value === 'NOT_AVAILABLE') {
		return value
	}
	return undefined
}

function normalizeAuthenticationPolicy(value: string | undefined): PluginMarketplaceAuthenticationPolicy | undefined {
	if (value === 'ON_INSTALL' || value === 'ON_FIRST_USE' || value === 'NONE') {
		return value
	}
	return undefined
}

function normalizeMarketplaceSource(value: unknown): XpertPluginMarketplaceSource | undefined {
	if (!isJsonDictionary(value)) {
		return undefined
	}

	return removeUndefinedFields({
		source: readStringField(value, 'source'),
		path: readStringField(value, 'path'),
		url: readStringField(value, 'url'),
		ref: readStringField(value, 'ref'),
		sha: readStringField(value, 'sha'),
		sparsePath: readStringField(value, 'sparsePath') ?? readStringField(value, 'sparse_path'),
		packageName: readStringField(value, 'packageName') ?? readStringField(value, 'package_name')
	})
}

function removeUndefinedFields<T extends object>(value: T): T {
	for (const key of Object.keys(value)) {
		if (Reflect.get(value, key) === undefined) {
			Reflect.deleteProperty(value, key)
		}
	}
	return value
}

function normalizeTargetAppMeta(value: unknown): PluginTargetAppMeta | undefined {
	if (!isJsonDictionary(value)) {
		return undefined
	}

	const meta: PluginTargetAppMeta = {}
	for (const [appKey, appMeta] of Object.entries(value)) {
		if (!isJsonDictionary(appMeta)) {
			continue
		}

		const marketplace = normalizeJsonValue(Reflect.get(appMeta, 'marketplace'))
		const runtime = normalizeJsonValue(Reflect.get(appMeta, 'runtime'))
		meta[appKey] = removeUndefinedFields({
			types: readStringArrayField(appMeta, 'types'),
			minAppVersion: readStringField(appMeta, 'minAppVersion'),
			capabilities: readStringArrayField(appMeta, 'capabilities'),
			marketplace: isJsonDictionary(marketplace) ? marketplace : undefined,
			runtime: isJsonDictionary(runtime) ? runtime : undefined
		})
	}

	return Object.keys(meta).length ? meta : undefined
}

export function normalizePluginBundleManifest(value: unknown): XpertPluginBundleManifest | null {
	if (!isJsonDictionary(value)) {
		return null
	}

	const name = readStringField(value, 'name')
	if (!name) {
		return null
	}

	const mcpServers =
		normalizeStringOrStringArray(Reflect.get(value, 'mcpServers')) ??
		normalizeJsonValue(Reflect.get(value, 'mcpServers'))
	const apps =
		normalizeStringOrStringArray(Reflect.get(value, 'apps')) ?? normalizeJsonValue(Reflect.get(value, 'apps'))
	const connectors =
		normalizeStringOrStringArray(Reflect.get(value, 'connectors')) ??
		normalizeJsonValue(Reflect.get(value, 'connectors'))
	const hooks =
		normalizeStringOrStringArray(Reflect.get(value, 'hooks')) ?? normalizeJsonValue(Reflect.get(value, 'hooks'))
	const assets = readObjectField(value, 'assets')

	return removeUndefinedFields({
		name,
		version: readStringField(value, 'version'),
		artifactNamespace: readStringField(value, 'artifactNamespace'),
		description: readStringField(value, 'description'),
		author: readStringField(value, 'author'),
		homepage: readStringField(value, 'homepage'),
		repository: normalizeJsonValue(Reflect.get(value, 'repository')),
		license: readStringField(value, 'license'),
		keywords: readStringArrayField(value, 'keywords'),
		skills: normalizeStringOrStringArray(Reflect.get(value, 'skills')),
		mcpServers,
		apps,
		connectors,
		hooks,
		interface: normalizeInstallInterface(Reflect.get(value, 'interface')),
		policy: normalizeMarketplacePolicy(Reflect.get(value, 'policy')),
		source: normalizeMarketplaceSource(Reflect.get(value, 'source')),
		assets: assets
			? removeUndefinedFields({
					composerIcon: readStringField(assets, 'composerIcon'),
					logo: readStringField(assets, 'logo'),
					screenshots: readStringArrayField(assets, 'screenshots')
				})
			: undefined,
		targetApps: readStringArrayField(value, 'targetApps'),
		targetAppMeta: normalizeTargetAppMeta(Reflect.get(value, 'targetAppMeta'))
	})
}

export function readPluginBundleManifest(rootDir: string): PluginBundleManifestReadResult | null {
	for (const candidate of MANIFEST_CANDIDATES) {
		const manifestPath = resolve(rootDir, candidate)
		if (!existsSync(manifestPath)) {
			continue
		}

		const manifest = normalizePluginBundleManifest(readJsonFile(manifestPath))
		if (manifest) {
			return {
				manifest,
				manifestPath
			}
		}
	}

	return null
}

export function resolveLoadedPluginBundleRoot(plugin: LoadedPluginBundleRootInput): string | null {
	for (const candidate of getLoadedPluginBundleRootCandidates(plugin)) {
		if (readPluginBundleManifest(candidate)) {
			return candidate
		}
	}
	return null
}

export function collectPluginBundleComponents(
	rootDir: string,
	manifest: XpertPluginBundleManifest
): PluginBundleComponentRegistration[] {
	return [
		...collectSkillComponents(rootDir, manifest.skills, manifest),
		...collectMcpServerComponents(rootDir, manifest.mcpServers),
		...collectAppComponents(rootDir, manifest.apps),
		...collectAppComponents(rootDir, manifest.connectors),
		...collectHookComponents(rootDir, manifest.hooks),
		...collectAssetComponents(rootDir, manifest.assets)
	]
}

function getLoadedPluginBundleRootCandidates(plugin: LoadedPluginBundleRootInput) {
	const candidates: string[] = []
	const addCandidate = (candidate: string | undefined | null) => {
		if (!candidate) {
			return
		}
		const resolved = resolve(candidate)
		if (!candidates.includes(resolved)) {
			candidates.push(resolved)
		}
	}

	const packageName = readString(plugin.packageName) ?? readString(plugin.name)
	const normalizedPackageName = packageName ? normalizePluginName(packageName) : null
	const baseDir = readString(plugin.baseDir)
	if (baseDir && normalizedPackageName) {
		addCandidate(resolve(baseDir, 'node_modules', ...normalizedPackageName.split('/')))
	}
	addCandidate(baseDir)
	addCandidate(getCodeWorkspacePath(plugin.sourceConfig))
	addCandidate(getCodePackageDir(plugin.sourceConfig))

	return candidates
}

function collectSkillComponents(
	rootDir: string,
	value: string | string[] | undefined,
	manifest: XpertPluginBundleManifest
) {
	const paths = toStringList(value)
	const components: PluginBundleComponentRegistration[] = []

	for (const entryPath of paths) {
		const resolved = resolvePluginRelativePath(rootDir, entryPath)
		if (!resolved || !existsSync(resolved)) {
			continue
		}

		const stat = statSync(resolved)
		const skillFiles = stat.isDirectory()
			? findSkillFiles(resolved)
			: basename(resolved) === 'SKILL.md'
				? [resolved]
				: []
		for (const skillFile of skillFiles) {
			const key = readSkillName(skillFile) ?? basename(dirname(skillFile))
			const sourcePath = toPluginRelativePath(rootDir, skillFile)
			const metadata = buildSkillComponentMetadata(key, manifest)
			components.push(
				createComponentRegistration({
					componentType: PLUGIN_COMPONENT_TYPE.SKILL,
					componentKey: key,
					sourcePath,
					config: {
						path: sourcePath
					},
					metadata
				})
			)
		}
	}

	return components
}

function buildSkillComponentMetadata(componentKey: string, manifest: XpertPluginBundleManifest): JSONValue {
	const contribution = findSkillMarketplaceContribution(manifest, componentKey)
	const metadata = removeUndefinedFields({
		name: componentKey,
		displayName: normalizeJsonValue(contribution ? Reflect.get(contribution, 'displayName') : undefined),
		description: normalizeJsonValue(contribution ? Reflect.get(contribution, 'description') : undefined),
		icon: normalizeJsonValue(contribution ? Reflect.get(contribution, 'icon') : undefined),
		color:
			(contribution
				? (readStringField(contribution, 'color') ?? readStringField(contribution, 'brandColor'))
				: undefined) ?? manifest.interface?.brandColor
	})

	return normalizeJsonValue(metadata) ?? { name: componentKey }
}

function findSkillMarketplaceContribution(
	manifest: XpertPluginBundleManifest,
	componentKey: string
): JsonDictionary | undefined {
	const targetMeta = manifest.targetAppMeta
	if (!targetMeta) {
		return undefined
	}

	for (const metadata of Object.values(targetMeta)) {
		const marketplace = readObjectField(metadata, 'marketplace')
		const contents = marketplace ? Reflect.get(marketplace, 'contents') : undefined
		if (!Array.isArray(contents)) {
			continue
		}

		const contribution = contents.find(
			(item) =>
				isJsonDictionary(item) &&
				readStringField(item, 'type') === PLUGIN_COMPONENT_TYPE.SKILL &&
				readStringField(item, 'name') === componentKey
		)
		if (isJsonDictionary(contribution)) {
			return contribution
		}
	}

	return undefined
}

function findSkillFiles(directory: string) {
	const direct = resolve(directory, 'SKILL.md')
	if (existsSync(direct)) {
		return [direct]
	}

	const files: string[] = []
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		if (!entry.isDirectory()) {
			continue
		}
		const skillFile = resolve(directory, entry.name, 'SKILL.md')
		if (existsSync(skillFile)) {
			files.push(skillFile)
		}
	}
	return files
}

function readSkillName(skillFile: string) {
	const content = readTextFile(skillFile)
	if (!content.startsWith('---')) {
		return undefined
	}

	const lines = content.split(/\r?\n/).slice(1, 40)
	for (const line of lines) {
		if (line.trim() === '---') {
			return undefined
		}
		const match = /^name:\s*["']?([^"'\n]+)["']?\s*$/.exec(line.trim())
		if (match?.[1]?.trim()) {
			return match[1].trim()
		}
	}
	return undefined
}

function collectMcpServerComponents(rootDir: string, value: unknown) {
	const sources = loadComponentSources(rootDir, value)
	const components: PluginBundleComponentRegistration[] = []

	for (const source of sources) {
		const serverMap = readMcpServerMap(source.value)
		for (const [serverName, serverConfig] of serverMap) {
			const config = normalizeJsonValue(serverConfig)
			if (config === undefined) {
				continue
			}
			components.push(
				createComponentRegistration({
					componentType: PLUGIN_COMPONENT_TYPE.MCP_SERVER,
					componentKey: serverName,
					sourcePath: source.sourcePath,
					config,
					metadata: {
						serverName
					}
				})
			)
		}
	}

	return components
}

function readMcpServerMap(value: unknown): Array<[string, unknown]> {
	if (!isJsonDictionary(value)) {
		return []
	}

	const wrapped = Reflect.get(value, 'mcp_servers') ?? Reflect.get(value, 'mcpServers')
	const servers = isJsonDictionary(wrapped) ? wrapped : value
	const result: Array<[string, unknown]> = []
	for (const [key, config] of Object.entries(servers)) {
		if (!key || key === 'mcp_servers' || key === 'mcpServers') {
			continue
		}
		if (isJsonDictionary(config)) {
			result.push([key, config])
		}
	}
	return result
}

function collectAppComponents(rootDir: string, value: unknown) {
	const sources = loadComponentSources(rootDir, value)
	const components: PluginBundleComponentRegistration[] = []

	for (const source of sources) {
		for (const app of toAppList(source.value)) {
			const key =
				app.componentKey ??
				readStringField(app.value, 'name') ??
				readStringField(app.value, 'id') ??
				readStringField(app.value, 'key')
			const componentKey = key ?? source.componentKey
			const config = normalizeJsonValue(app.value)
			if (!componentKey || config === undefined) {
				continue
			}
			components.push(
				createComponentRegistration({
					componentType: PLUGIN_COMPONENT_TYPE.APP,
					componentKey,
					sourcePath: source.sourcePath,
					config,
					metadata: {
						name: componentKey
					}
				})
			)
		}
	}

	return components
}

interface AppComponentValue {
	value: object
	componentKey?: string
}

function toAppList(value: unknown): AppComponentValue[] {
	if (Array.isArray(value)) {
		return value.filter((item): item is object => isJsonDictionary(item)).map((item) => ({ value: item }))
	}
	if (!isJsonDictionary(value)) {
		return []
	}

	const apps = Reflect.get(value, 'apps')
	if (isJsonDictionary(apps)) {
		const items: AppComponentValue[] = []
		for (const [componentKey, app] of Object.entries(apps)) {
			if (componentKey && isJsonDictionary(app)) {
				items.push({ componentKey, value: app })
			}
		}
		if (items.length) {
			return items
		}
	}

	return [{ value }]
}

function collectHookComponents(rootDir: string, value: unknown) {
	const hookValue =
		value ?? (existsSync(resolve(rootDir, DEFAULT_HOOKS_PATH)) ? `./${DEFAULT_HOOKS_PATH}` : undefined)
	const sources = loadComponentSources(rootDir, hookValue)
	const components: PluginBundleComponentRegistration[] = []

	for (const source of sources) {
		const config = normalizeJsonValue(source.value)
		if (config === undefined) {
			continue
		}
		components.push(
			createComponentRegistration({
				componentType: PLUGIN_COMPONENT_TYPE.HOOK,
				componentKey: source.componentKey,
				sourcePath: source.sourcePath,
				config,
				metadata: {
					dataEnv: ['XPERT_PLUGIN_ROOT', 'XPERT_PLUGIN_DATA', 'PLUGIN_ROOT', 'PLUGIN_DATA']
				}
			})
		)
	}

	return components
}

function collectAssetComponents(rootDir: string, assets: XpertPluginBundleManifest['assets']) {
	if (!assets) {
		return []
	}

	const assetEntries: Array<{ kind: string; path: string }> = []
	if (assets.composerIcon) {
		assetEntries.push({ kind: 'composerIcon', path: assets.composerIcon })
	}
	if (assets.logo) {
		assetEntries.push({ kind: 'logo', path: assets.logo })
	}
	for (const screenshot of assets.screenshots ?? []) {
		assetEntries.push({ kind: 'screenshot', path: screenshot })
	}

	const components: PluginBundleComponentRegistration[] = []
	for (const asset of assetEntries) {
		const resolved = resolvePluginRelativePath(rootDir, asset.path)
		if (!resolved || !existsSync(resolved)) {
			continue
		}
		const sourcePath = toPluginRelativePath(rootDir, resolved)
		components.push(
			createComponentRegistration({
				componentType: PLUGIN_COMPONENT_TYPE.ASSET,
				componentKey: `${asset.kind}:${sourcePath}`,
				sourcePath,
				config: {
					kind: asset.kind,
					path: sourcePath
				},
				metadata: {
					kind: asset.kind
				}
			})
		)
	}

	return components
}

interface ComponentSource {
	value: unknown
	sourcePath: string | null
	componentKey: string
}

function loadComponentSources(rootDir: string, value: unknown): ComponentSource[] {
	if (value === undefined || value === null) {
		return []
	}

	const paths = toStringList(value)
	if (paths.length) {
		return paths.flatMap((entryPath) => {
			const resolved = resolvePluginRelativePath(rootDir, entryPath)
			if (!resolved || !existsSync(resolved)) {
				return []
			}

			const sourcePath = toPluginRelativePath(rootDir, resolved)
			if (statSync(resolved).isDirectory()) {
				return readdirSync(resolved, { withFileTypes: true })
					.filter((entry) => entry.isFile() && /\.jsonc?$/i.test(entry.name))
					.map((entry) => {
						const filePath = resolve(resolved, entry.name)
						return {
							value: readJsonFile(filePath),
							sourcePath: toPluginRelativePath(rootDir, filePath),
							componentKey: basename(entry.name, extname(entry.name))
						}
					})
			}

			return [
				{
					value: readJsonFile(resolved),
					sourcePath,
					componentKey: basename(resolved, extname(resolved))
				}
			]
		})
	}

	if (Array.isArray(value)) {
		return value.map((item, index) => ({
			value: item,
			sourcePath: null,
			componentKey: `inline-${index + 1}`
		}))
	}

	return [
		{
			value,
			sourcePath: null,
			componentKey: 'inline'
		}
	]
}

function toStringList(value: unknown): string[] {
	const single = readString(value)
	if (single) {
		return [single]
	}
	return readStringArray(value) ?? []
}

function readJsonFile(filePath: string): unknown {
	return JSON.parse(readTextFile(filePath))
}

function readTextFile(filePath: string) {
	return readFileSync(filePath, 'utf8')
}

function resolvePluginRelativePath(rootDir: string, entryPath: string) {
	const root = resolve(rootDir)
	const resolved = resolve(root, entryPath)
	return isWithinRoot(root, resolved) ? resolved : null
}

function toPluginRelativePath(rootDir: string, targetPath: string) {
	return `./${relative(resolve(rootDir), resolve(targetPath)).replace(/\\/g, '/')}`
}

function isWithinRoot(rootDir: string, targetPath: string) {
	const relativePath = relative(resolve(rootDir), resolve(targetPath))
	return relativePath === '' || (!relativePath.startsWith('..') && !relativePath.startsWith('/'))
}

function createComponentRegistration(input: Omit<PluginBundleComponentRegistration, 'definitionHash'>) {
	const definitionHash = hashComponentDefinition(input)
	return {
		...input,
		definitionHash
	}
}

function hashComponentDefinition(input: Omit<PluginBundleComponentRegistration, 'definitionHash'>) {
	const hash = createHash('sha256')
	hash.update(stableStringify(normalizeJsonValue(input) ?? null))
	return hash.digest('hex')
}

function stableStringify(value: JSONValue): string {
	if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
		return JSON.stringify(value)
	}

	if (Array.isArray(value)) {
		return `[${value.map((item) => stableStringify(item)).join(',')}]`
	}

	const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
	return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`
}
