/**
 * Invariants:
 * - Workspace plugins are restaged only when their copied inputs change.
 * - Runtime dependencies are reused only while their install fingerprint matches.
 * - Cache state is published only after copying and dependency installation succeed.
 */
import { getConfig } from '@xpert-ai/server-config'
import { execSync } from 'child_process'
import { createHash, type Hash } from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import chalk from 'chalk'
import { normalizePluginName } from './types'
import { getPluginScopeLogLabel, resolvePluginScope, safePluginScopePathSegment } from './plugin-scope'

export interface OrganizationPluginStoreOptions {
	/** Base directory to keep organization plugin workspaces, defaults to `<repo>/data/plugins` */
	rootDir?: string
	/** Manifest filename, defaults to `plugins.json` under each organization folder */
	manifestName?: string
	/** Tenant that owns tenant-global plugin installs. */
	tenantId?: string | null
	/** Default tenant id. Its global plugins keep using the legacy `global` directory. */
	defaultTenantId?: string | null
	/** Internal runtime scope key used for tenant-global isolation. */
	scopeKey?: string | null
}

export interface InstallOrganizationPluginsOptions extends OrganizationPluginStoreOptions {
	/** npm registry override when installing plugins */
	registry?: string
	/** Whether to pass --legacy-peer-deps, default true to match existing behaviour */
	legacyPeerDeps?: boolean
}

export interface StageWorkspacePluginOptions extends OrganizationPluginStoreOptions {
	organizationId: string
	pluginName: string
	expectedPackageName: string
	workspacePath: string
}

export interface StagePackageDirectoryPluginOptions extends OrganizationPluginStoreOptions {
	organizationId: string
	pluginName: string
	expectedPackageName: string
	packageDir: string
}

type WorkspacePluginPackageJson = {
	name?: string
	version?: string
	type?: string
	main?: string
	module?: string
	exports?: unknown
	bin?: unknown
	dependencies?: Record<string, string>
	optionalDependencies?: Record<string, string>
	overrides?: unknown
	engines?: unknown
	os?: string[]
	cpu?: string[]
}

type WorkspacePluginProjectJson = {
	targets?: Record<string, { options?: { outputPath?: string } }>
}

type WorkspaceBuildOutput = {
	distPath: string
	relativeDistPath: string
}

type WorkspaceStageState = {
	schemaVersion: 1
	packageName: string
	workspacePath: string
	/** All trees copied into the staged plugin, excluding ignored development directories. */
	sourceFingerprint: string
	/** The runtime-only package manifest plus local file dependency contents and host runtime. */
	runtimeDependenciesFingerprint: string
	relativeDistPath: string | null
}

export const DEFAULT_ORG_PLUGIN_ROOT = path.join(getConfig().assetOptions.serverRoot, 'plugins')
export const DEFAULT_ORG_MANIFEST = 'plugins.json'
const COMPILED_PLUGIN_ENTRY_FILES = ['index.js', 'index.cjs.js', 'index.esm.js'] as const
const WORKSPACE_STAGE_STATE_SCHEMA_VERSION = 1 as const
const WORKSPACE_STAGE_STATE_FILE = '.xpert-workspace-stage.json'
const STAGING_IGNORED_NAMES = new Set(['node_modules', '.git', '.DS_Store'])

function ensureDir(dir: string) {
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true })
	}
}

function hasRuntimeDependencies(packageJson: WorkspacePluginPackageJson) {
	return (
		Object.keys(packageJson.dependencies ?? {}).length > 0 ||
		Object.keys(packageJson.optionalDependencies ?? {}).length > 0
	)
}

function createRuntimeInstallPackageJson(packageJson: WorkspacePluginPackageJson): WorkspacePluginPackageJson {
	const runtimePackageJson: WorkspacePluginPackageJson = {}

	if (packageJson.name) {
		runtimePackageJson.name = packageJson.name
	}
	if (packageJson.version) {
		runtimePackageJson.version = packageJson.version
	}
	if (packageJson.type) {
		runtimePackageJson.type = packageJson.type
	}
	if (packageJson.main) {
		runtimePackageJson.main = packageJson.main
	}
	if (packageJson.module) {
		runtimePackageJson.module = packageJson.module
	}
	if (packageJson.exports) {
		runtimePackageJson.exports = packageJson.exports
	}
	if (packageJson.bin) {
		runtimePackageJson.bin = packageJson.bin
	}
	if (packageJson.dependencies && Object.keys(packageJson.dependencies).length) {
		runtimePackageJson.dependencies = packageJson.dependencies
	}
	if (packageJson.optionalDependencies && Object.keys(packageJson.optionalDependencies).length) {
		runtimePackageJson.optionalDependencies = packageJson.optionalDependencies
	}
	if (packageJson.overrides) {
		runtimePackageJson.overrides = packageJson.overrides
	}
	if (packageJson.engines) {
		runtimePackageJson.engines = packageJson.engines
	}
	if (packageJson.os) {
		runtimePackageJson.os = packageJson.os
	}
	if (packageJson.cpu) {
		runtimePackageJson.cpu = packageJson.cpu
	}

	return runtimePackageJson
}

function readExecFailureOutput(value: unknown) {
	if (typeof value === 'string') {
		return value.trim()
	}
	if (Buffer.isBuffer(value)) {
		return value.toString('utf8').trim()
	}
	return ''
}

function installStagedWorkspaceRuntimeDependencies(targetPackageDir: string, packageJson: WorkspacePluginPackageJson) {
	if (!hasRuntimeDependencies(packageJson)) {
		return
	}

	const startedAt = Date.now()
	const packageName = packageJson.name ?? targetPackageDir
	const packageJsonPath = path.join(targetPackageDir, 'package.json')
	const originalPackageJson = fs.readFileSync(packageJsonPath, 'utf8')
	const runtimePackageJson = createRuntimeInstallPackageJson(packageJson)

	console.log(chalk.gray(`Installing staged runtime dependencies for ${packageName}...`))
	try {
		fs.writeFileSync(packageJsonPath, JSON.stringify(runtimePackageJson, null, 2))
		// Startup staging is not an update workflow: avoid audit/funding network work and
		// prefer the local npm cache while still allowing a registry fallback on cache miss.
		execSync(
			'npm install --omit=dev --omit=peer --ignore-scripts --no-save --legacy-peer-deps --no-audit --no-fund --prefer-offline',
			{
				cwd: targetPackageDir,
				stdio: 'pipe',
				env: {
					...process.env,
					npm_config_package_lock: 'false',
					npm_config_lockfile: 'false',
					npm_config_audit: 'false',
					npm_config_fund: 'false'
				}
			}
		)
		console.log(
			chalk.gray(`Installed staged runtime dependencies for ${packageName} in ${Date.now() - startedAt}ms.`)
		)
	} catch (error) {
		const details =
			readExecFailureOutput((error as { stderr?: unknown })?.stderr) ||
			readExecFailureOutput((error as { stdout?: unknown })?.stdout)
		throw new Error(
			details
				? `Failed to install runtime dependencies for staged workspace plugin at ${targetPackageDir}: ${details}`
				: `Failed to install runtime dependencies for staged workspace plugin at ${targetPackageDir}`
		)
	} finally {
		fs.writeFileSync(packageJsonPath, originalPackageJson)
	}
}

function isWithinRoot(targetPath: string, rootPath: string): boolean {
	const relative = path.relative(rootPath, targetPath)
	return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function resolveAllowedWorkspaceRoots(): string[] {
	const configuredRoots = process.env.PLUGIN_WORKSPACE_ROOTS?.split(/[;,]/)
		.map((item) => item.trim())
		.filter(Boolean)
		.map((item) => path.resolve(item))
		.filter((item) => fs.existsSync(item))
		.map((item) => fs.realpathSync.native(item))

	if (configuredRoots?.length) {
		return configuredRoots
	}

	return [path.resolve(process.cwd()), path.resolve(process.cwd(), '..')]
		.filter((item, index, items) => items.indexOf(item) === index)
		.filter((item) => fs.existsSync(item))
		.map((item) => fs.realpathSync.native(item))
}

function assertWorkspacePathAllowed(workspacePath: string) {
	const roots = resolveAllowedWorkspaceRoots()
	if (!roots.some((root) => isWithinRoot(workspacePath, root))) {
		throw new Error(`workspacePath '${workspacePath}' is outside allowed roots: ${roots.join(', ')}`)
	}
}

function readJsonFile<T>(filePath: string): T | null {
	if (!fs.existsSync(filePath)) {
		return null
	}

	try {
		return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T
	} catch {
		return null
	}
}

function isWorkspaceStageState(value: unknown): value is WorkspaceStageState {
	return (
		typeof value === 'object' &&
		value !== null &&
		'schemaVersion' in value &&
		value.schemaVersion === WORKSPACE_STAGE_STATE_SCHEMA_VERSION &&
		'packageName' in value &&
		typeof value.packageName === 'string' &&
		'workspacePath' in value &&
		typeof value.workspacePath === 'string' &&
		'sourceFingerprint' in value &&
		typeof value.sourceFingerprint === 'string' &&
		'runtimeDependenciesFingerprint' in value &&
		typeof value.runtimeDependenciesFingerprint === 'string' &&
		'relativeDistPath' in value &&
		(value.relativeDistPath === null || typeof value.relativeDistPath === 'string')
	)
}

function readWorkspaceStageState(statePath: string): WorkspaceStageState | null {
	const value = readJsonFile<unknown>(statePath)
	return isWorkspaceStageState(value) ? value : null
}

function writeWorkspaceStageState(statePath: string, state: WorkspaceStageState) {
	const temporaryPath = `${statePath}.${process.pid}.${Date.now()}.tmp`
	try {
		fs.writeFileSync(temporaryPath, JSON.stringify(state, null, 2))
		fs.renameSync(temporaryPath, statePath)
	} finally {
		fs.rmSync(temporaryPath, { force: true })
	}
}

function appendFileToFingerprint(hash: Hash, filePath: string) {
	const file = fs.openSync(filePath, 'r')
	const buffer = Buffer.allocUnsafe(64 * 1024)
	try {
		let bytesRead = 0
		do {
			bytesRead = fs.readSync(file, buffer, 0, buffer.length, null)
			if (bytesRead > 0) {
				hash.update(buffer.subarray(0, bytesRead))
			}
		} while (bytesRead > 0)
	} finally {
		fs.closeSync(file)
	}
}

function appendPathToFingerprint(hash: Hash, inputPath: string, label: string, activeDirectories = new Set<string>()) {
	const stats = fs.statSync(inputPath)
	hash.update(`${label}\0${stats.mode & 0o777}\0${stats.size}\0`)

	if (stats.isFile()) {
		appendFileToFingerprint(hash, inputPath)
		return
	}

	if (!stats.isDirectory()) {
		return
	}

	// Staging dereferences symlinks, so the fingerprint must follow them too. Track
	// only the active recursion chain to stop cycles without collapsing valid repeats.
	const realPath = fs.realpathSync.native(inputPath)
	if (activeDirectories.has(realPath)) {
		hash.update('directory-cycle\0')
		return
	}

	activeDirectories.add(realPath)
	try {
		const entries = fs
			.readdirSync(inputPath, { withFileTypes: true })
			.filter((entry) => !STAGING_IGNORED_NAMES.has(entry.name))
			.sort((left, right) => left.name.localeCompare(right.name))
		for (const entry of entries) {
			appendPathToFingerprint(hash, path.join(inputPath, entry.name), `${label}/${entry.name}`, activeDirectories)
		}
	} finally {
		activeDirectories.delete(realPath)
	}
}

function computeWorkspaceSourceFingerprint(workspacePath: string, workspaceDist: WorkspaceBuildOutput | null) {
	const hash = createHash('sha256')
	hash.update(`workspace-stage-v${WORKSPACE_STAGE_STATE_SCHEMA_VERSION}\0${workspacePath}\0`)
	// Keep this traversal aligned with fs.cpSync below: workspace source and an
	// optional Nx output tree are the complete set of copied staging inputs.
	appendPathToFingerprint(hash, workspacePath, 'workspace')
	if (workspaceDist) {
		hash.update(`workspace-dist\0${workspaceDist.relativeDistPath}\0`)
		appendPathToFingerprint(hash, workspaceDist.distPath, 'workspace-dist')
	}
	return hash.digest('hex')
}

function getRuntimeDependencyEntries(packageJson: WorkspacePluginPackageJson) {
	return [
		...Object.entries(packageJson.dependencies ?? {}),
		...Object.entries(packageJson.optionalDependencies ?? {})
	].sort(([left], [right]) => left.localeCompare(right))
}

function computeRuntimeDependenciesFingerprint(workspacePath: string, packageJson: WorkspacePluginPackageJson) {
	const hash = createHash('sha256')
	hash.update(
		JSON.stringify({
			runtimePackage: createRuntimeInstallPackageJson(packageJson),
			platform: process.platform,
			architecture: process.arch,
			node: process.versions.node
		})
	)

	// Registry dependencies are identified by their manifest specs. A file: spec can
	// keep the same path while its package changes, so include that tree's contents.
	for (const [dependencyName, dependencySpec] of getRuntimeDependencyEntries(packageJson)) {
		if (!dependencySpec.startsWith('file:')) {
			continue
		}

		const dependencyPath = path.resolve(workspacePath, dependencySpec.slice('file:'.length))
		hash.update(`file-dependency\0${dependencyName}\0${dependencyPath}\0`)
		if (fs.existsSync(dependencyPath)) {
			appendPathToFingerprint(hash, dependencyPath, `file-dependency/${dependencyName}`)
		} else {
			hash.update('missing\0')
		}
	}

	return hash.digest('hex')
}

function hasLoadablePluginEntry(packageDir: string) {
	return (
		fs.existsSync(path.join(packageDir, 'dist')) ||
		fs.existsSync(path.join(packageDir, 'src', 'index.ts')) ||
		COMPILED_PLUGIN_ENTRY_FILES.some((fileName) => fs.existsSync(path.join(packageDir, fileName)))
	)
}

function isWorkspaceStageCacheHit(
	state: WorkspaceStageState | null,
	expectedState: WorkspaceStageState,
	targetPackageDir: string,
	hasDependencies: boolean
) {
	// Do not trust state alone: an operator or failed cleanup may have removed the
	// staged entry or runtime dependencies after the state was written.
	return (
		state?.packageName === expectedState.packageName &&
		state.workspacePath === expectedState.workspacePath &&
		state.sourceFingerprint === expectedState.sourceFingerprint &&
		state.runtimeDependenciesFingerprint === expectedState.runtimeDependenciesFingerprint &&
		state.relativeDistPath === expectedState.relativeDistPath &&
		hasLoadablePluginEntry(targetPackageDir) &&
		(!hasDependencies || fs.existsSync(path.join(targetPackageDir, 'node_modules')))
	)
}

function clearDirectoryExcept(directoryPath: string, preservedNames: Set<string>) {
	ensureDir(directoryPath)
	for (const name of fs.readdirSync(directoryPath)) {
		if (!preservedNames.has(name)) {
			fs.rmSync(path.join(directoryPath, name), { recursive: true, force: true })
		}
	}
}

function removePreviousBuildOutput(pluginDir: string, relativeDistPath: string | null) {
	if (!relativeDistPath) {
		return
	}

	const outputPath = path.resolve(pluginDir, relativeDistPath)
	if (outputPath !== pluginDir && isWithinRoot(outputPath, pluginDir)) {
		fs.rmSync(outputPath, { recursive: true, force: true })
	}
}

function findNxWorkspaceRoot(startPath: string) {
	let current = path.resolve(startPath)
	while (true) {
		if (fs.existsSync(path.join(current, 'nx.json')) && fs.existsSync(path.join(current, 'package.json'))) {
			return current
		}

		const parent = path.dirname(current)
		if (parent === current) {
			return null
		}
		current = parent
	}
}

function findWorkspaceBuildInfo(workspacePath: string) {
	for (const allowedRoot of resolveAllowedWorkspaceRoots()) {
		if (!isWithinRoot(workspacePath, allowedRoot)) {
			continue
		}

		// PLUGIN_WORKSPACE_ROOTS is an allow-list for source paths, not a build root.
		// It may point inside an Nx workspace, such as `packages/plugins`, while Nx
		// outputPath remains relative to the workspace root. Resolve that root only
		// for locating an already-built dist; staging never triggers a build.
		const nxRoot = findNxWorkspaceRoot(workspacePath)
		const root =
			nxRoot && (isWithinRoot(allowedRoot, nxRoot) || isWithinRoot(nxRoot, allowedRoot)) ? nxRoot : allowedRoot
		const relativeWorkspacePath = path.relative(root, workspacePath)
		const projectJson = readJsonFile<WorkspacePluginProjectJson>(path.join(workspacePath, 'project.json'))
		const outputPath = projectJson?.targets?.build?.options?.outputPath
		const distPath = outputPath ? path.resolve(root, outputPath) : path.join(root, 'dist', relativeWorkspacePath)
		if (!isWithinRoot(distPath, root)) {
			throw new Error(`Plugin build outputPath '${outputPath}' resolves outside workspace root '${root}'`)
		}

		return {
			root,
			distPath,
			relativeDistPath: path.relative(root, distPath)
		}
	}

	return null
}

function resolveWorkspaceBuildOutput(workspacePath: string) {
	const buildInfo = findWorkspaceBuildInfo(workspacePath)
	if (!buildInfo) {
		return null
	}

	if (fs.existsSync(buildInfo.distPath) && fs.statSync(buildInfo.distPath).isDirectory()) {
		return {
			distPath: buildInfo.distPath,
			relativeDistPath: buildInfo.relativeDistPath
		}
	}

	return null
}

function isPluginInstalled(pluginDir: string, pluginName: string) {
	const normalizedName = normalizePluginName(pluginName)
	const pkgJsonPath = path.join(pluginDir, 'node_modules', normalizedName, 'package.json')
	return fs.existsSync(pkgJsonPath)
}

function extractPluginVersion(pluginName: string) {
	const atIndex = pluginName.lastIndexOf('@')
	if (atIndex > 0) {
		return pluginName.slice(atIndex + 1)
	}
	return ''
}

function getPluginDirName(pluginName: string) {
	const normalized = normalizePluginName(pluginName)
	const version = extractPluginVersion(pluginName)
	return version ? `${normalized}@${version}` : normalized
}

export function getOrganizationPluginRoot(organizationId: string, opts?: OrganizationPluginStoreOptions) {
	const rootDir = opts?.rootDir ?? DEFAULT_ORG_PLUGIN_ROOT
	const scope = resolvePluginScope({
		tenantId: opts?.tenantId,
		organizationId,
		defaultTenantId: opts?.defaultTenantId,
		scopeKey: opts?.scopeKey
	})

	if (scope.isTenantGlobal && scope.tenantId) {
		return path.join(rootDir, 'tenants', safePluginScopePathSegment(scope.tenantId), scope.organizationId)
	}

	if (scope.isSystem) {
		return path.join(rootDir, safePluginScopePathSegment(scope.scopeKey))
	}

	return path.join(rootDir, scope.organizationId)
}

export function getOrganizationManifestPath(organizationId: string, opts?: OrganizationPluginStoreOptions) {
	const root = getOrganizationPluginRoot(organizationId, opts)
	return path.join(root, opts?.manifestName ?? DEFAULT_ORG_MANIFEST)
}

/**
 * Get the filesystem path for a given plugin under the organization's plugin workspace.
 *
 * Normalize plugin spec to a filesystem-friendly folder name (drops version suffix).
 */
export function getOrganizationPluginPath(
	organizationId: string,
	pluginName: string,
	opts?: OrganizationPluginStoreOptions
) {
	const dirName = getPluginDirName(pluginName)
	return path.join(getOrganizationPluginRoot(organizationId, opts), dirName)
}

export function readOrganizationManifest(organizationId: string, opts?: OrganizationPluginStoreOptions): string[] {
	const manifestPath = getOrganizationManifestPath(organizationId, opts)
	if (!fs.existsSync(manifestPath)) {
		return []
	}
	try {
		const manifest: unknown = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
		return Array.isArray(manifest) ? manifest.filter((plugin): plugin is string => typeof plugin === 'string') : []
	} catch (err) {
		console.warn(`Failed to parse plugin manifest for org ${organizationId} at ${manifestPath}:`, err)
		return []
	}
}

function normalizeManifestPlugins(plugins: string[]) {
	// Last spec wins so a current versioned install replaces a stale unversioned (or
	// older-version) entry for the same package without changing unrelated ordering.
	const byPackageName = new Map<string, string>()
	for (const plugin of plugins) {
		const packageName = normalizePluginName(plugin)
		byPackageName.delete(packageName)
		byPackageName.set(packageName, plugin)
	}
	return Array.from(byPackageName.values())
}

function replaceManifestPlugin(manifest: Set<string>, plugin: string) {
	const packageName = normalizePluginName(plugin)
	for (const existing of manifest) {
		if (normalizePluginName(existing) === packageName) {
			manifest.delete(existing)
		}
	}
	manifest.add(plugin)
}

export function writeOrganizationManifest(
	organizationId: string,
	plugins: string[],
	opts?: OrganizationPluginStoreOptions
) {
	const manifestPath = getOrganizationManifestPath(organizationId, opts)
	ensureDir(path.dirname(manifestPath))
	fs.writeFileSync(manifestPath, JSON.stringify(normalizeManifestPlugins(plugins), null, 2))
}

export function stageWorkspacePlugin(opts: StageWorkspacePluginOptions): string {
	const startedAt = Date.now()
	if (!opts.workspacePath) {
		throw new Error('workspacePath is required')
	}

	if (!path.isAbsolute(opts.workspacePath)) {
		throw new Error('workspacePath must be an absolute path')
	}

	if (!fs.existsSync(opts.workspacePath) || !fs.statSync(opts.workspacePath).isDirectory()) {
		throw new Error(`workspacePath does not exist or is not a directory: ${opts.workspacePath}`)
	}

	const workspacePath = fs.realpathSync.native(opts.workspacePath)
	assertWorkspacePathAllowed(workspacePath)

	const pkgJsonPath = path.join(workspacePath, 'package.json')
	if (!fs.existsSync(pkgJsonPath)) {
		throw new Error(`package.json not found in workspacePath: ${workspacePath}`)
	}

	const packageJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8')) as WorkspacePluginPackageJson
	if (!packageJson?.name) {
		throw new Error(`Invalid package.json in workspacePath: missing 'name'`)
	}

	const normalizedPackageName = normalizePluginName(opts.expectedPackageName)
	if (packageJson.name !== normalizedPackageName) {
		throw new Error(
			`workspace package name mismatch: expected '${normalizedPackageName}', got '${packageJson.name}'`
		)
	}

	if (!hasLoadablePluginEntry(workspacePath)) {
		throw new Error(
			`Plugin "${opts.pluginName}" (expected package "${normalizedPackageName}") has an invalid workspacePath "${workspacePath}": ` +
				`workspacePath must contain 'dist/', 'src/index.ts', or a compiled root entry (${COMPILED_PLUGIN_ENTRY_FILES.join(
					', '
				)}) for plugin loading`
		)
	}

	const pluginDir = getOrganizationPluginPath(opts.organizationId, opts.pluginName, opts)
	const targetPackageDir = path.join(pluginDir, 'node_modules', normalizedPackageName)
	const targetBaseDir = path.dirname(targetPackageDir)
	const statePath = path.join(pluginDir, WORKSPACE_STAGE_STATE_FILE)
	const previousState = readWorkspaceStageState(statePath)
	const workspaceDist = resolveWorkspaceBuildOutput(workspacePath)
	const sourceFingerprint = computeWorkspaceSourceFingerprint(workspacePath, workspaceDist)
	const runtimeDependenciesFingerprint = computeRuntimeDependenciesFingerprint(workspacePath, packageJson)
	const expectedState: WorkspaceStageState = {
		schemaVersion: WORKSPACE_STAGE_STATE_SCHEMA_VERSION,
		packageName: normalizedPackageName,
		workspacePath,
		sourceFingerprint,
		runtimeDependenciesFingerprint,
		relativeDistPath: workspaceDist?.relativeDistPath ?? null
	}
	const scopeLabel = getPluginScopeLogLabel({
		tenantId: opts.tenantId,
		organizationId: opts.organizationId,
		defaultTenantId: opts.defaultTenantId,
		scopeKey: opts.scopeKey
	})
	const runtimeDependenciesExist = fs.existsSync(path.join(targetPackageDir, 'node_modules'))
	const hasDependencies = hasRuntimeDependencies(packageJson)
	// Never reuse state from another logical package or workspace, even if two
	// dependency manifests happen to produce the same fingerprint.
	const stateMatchesWorkspace =
		previousState?.packageName === normalizedPackageName && previousState.workspacePath === workspacePath

	if (isWorkspaceStageCacheHit(previousState, expectedState, targetPackageDir, hasDependencies)) {
		console.log(
			chalk.gray(
				`Plugin ${normalizedPackageName} staging cache hit for scope ${scopeLabel} (${Date.now() - startedAt}ms).`
			)
		)
		return pluginDir
	}

	// Source and dependency fingerprints are separate so ordinary code/asset edits
	// can refresh the staged package without paying for another npm install.
	const reuseRuntimeDependencies =
		stateMatchesWorkspace &&
		hasDependencies &&
		runtimeDependenciesExist &&
		previousState?.runtimeDependenciesFingerprint === runtimeDependenciesFingerprint
	console.log(chalk.gray(`Staging code plugin ${normalizedPackageName} for scope ${scopeLabel}...`))
	if (stateMatchesWorkspace) {
		fs.rmSync(statePath, { force: true })
	} else {
		// A missing or incompatible state predates this cache contract, so clean the
		// whole staging directory once to avoid retaining unknown legacy build output.
		fs.rmSync(pluginDir, { recursive: true, force: true })
	}
	ensureDir(targetBaseDir)
	clearDirectoryExcept(targetPackageDir, reuseRuntimeDependencies ? new Set(['node_modules']) : new Set())
	fs.cpSync(workspacePath, targetPackageDir, {
		recursive: true,
		dereference: true,
		filter: (source) => {
			const base = path.basename(source)
			return !STAGING_IGNORED_NAMES.has(base)
		}
	})

	removePreviousBuildOutput(pluginDir, stateMatchesWorkspace ? (previousState?.relativeDistPath ?? null) : null)
	if (workspaceDist) {
		// Keep staged root-relative dist paths available for package-level `index.cjs` fallback files.
		const targetDistPath = path.join(pluginDir, workspaceDist.relativeDistPath)
		fs.rmSync(targetDistPath, { recursive: true, force: true })
		ensureDir(path.dirname(targetDistPath))
		fs.cpSync(workspaceDist.distPath, targetDistPath, {
			recursive: true,
			dereference: true
		})
	}

	let dependencyAction = 'no runtime dependencies'
	if (hasDependencies) {
		if (reuseRuntimeDependencies) {
			dependencyAction = 'runtime dependencies reused'
		} else {
			installStagedWorkspaceRuntimeDependencies(targetPackageDir, packageJson)
			dependencyAction = 'runtime dependencies installed'
		}
	}

	// Publish the cache marker only after copying and dependency installation finish.
	// Any earlier failure leaves no valid marker, forcing a clean retry next startup.
	writeWorkspaceStageState(statePath, expectedState)
	console.log(
		chalk.gray(
			`Staged code plugin ${normalizedPackageName} for scope ${scopeLabel} in ${Date.now() - startedAt}ms (${dependencyAction}).`
		)
	)

	return pluginDir
}

export function stagePackageDirectoryPlugin(opts: StagePackageDirectoryPluginOptions): string {
	if (!opts.packageDir) {
		throw new Error('packageDir is required')
	}

	if (!path.isAbsolute(opts.packageDir)) {
		throw new Error('packageDir must be an absolute path')
	}

	if (!fs.existsSync(opts.packageDir) || !fs.statSync(opts.packageDir).isDirectory()) {
		throw new Error(`packageDir does not exist or is not a directory: ${opts.packageDir}`)
	}

	const packageDir = fs.realpathSync.native(opts.packageDir)
	const pkgJsonPath = path.join(packageDir, 'package.json')
	if (!fs.existsSync(pkgJsonPath)) {
		throw new Error(`package.json not found in uploaded plugin package: ${packageDir}`)
	}

	const packageJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8')) as WorkspacePluginPackageJson
	if (!packageJson?.name) {
		throw new Error(`Invalid package.json in uploaded plugin package: missing 'name'`)
	}

	const normalizedPackageName = normalizePluginName(opts.expectedPackageName)
	if (packageJson.name !== normalizedPackageName) {
		throw new Error(
			`uploaded package name mismatch: expected '${normalizedPackageName}', got '${packageJson.name}'`
		)
	}

	const hasDist = fs.existsSync(path.join(packageDir, 'dist'))
	const hasSrcEntry = fs.existsSync(path.join(packageDir, 'src', 'index.ts'))
	const hasCompiledRootEntry = COMPILED_PLUGIN_ENTRY_FILES.some((fileName) =>
		fs.existsSync(path.join(packageDir, fileName))
	)
	if (!hasDist && !hasSrcEntry && !hasCompiledRootEntry) {
		throw new Error(
			`Uploaded plugin "${opts.pluginName}" (expected package "${normalizedPackageName}") has an invalid package directory "${packageDir}": ` +
				`package must contain 'dist/', 'src/index.ts', or a compiled root entry (${COMPILED_PLUGIN_ENTRY_FILES.join(
					', '
				)}) for plugin loading`
		)
	}

	const pluginDir = getOrganizationPluginPath(opts.organizationId, opts.pluginName, opts)
	const targetPackageDir = path.join(pluginDir, 'node_modules', normalizedPackageName)
	const targetBaseDir = path.dirname(targetPackageDir)

	fs.rmSync(pluginDir, { recursive: true, force: true })
	ensureDir(targetBaseDir)

	fs.cpSync(packageDir, targetPackageDir, {
		recursive: true,
		dereference: true,
		filter: (source) => {
			const base = path.basename(source)
			return !['node_modules', '.git', '.DS_Store'].includes(base)
		}
	})

	installStagedWorkspaceRuntimeDependencies(targetPackageDir, packageJson)

	return pluginDir
}

/**
 * Install plugins into the given organization's plugin workspace and update its manifest.
 *
 * @param organizationId
 * @param plugins
 * @param opts
 * @returns
 */
export function installOrganizationPlugins(
	organizationId: string,
	plugins: string[],
	opts: InstallOrganizationPluginsOptions = {}
) {
	if (!plugins?.length) {
		return
	}
	const root = getOrganizationPluginRoot(organizationId, opts)
	ensureDir(root)

	const scopeLabel = getPluginScopeLogLabel({
		tenantId: opts.tenantId,
		organizationId,
		defaultTenantId: opts.defaultTenantId,
		scopeKey: opts.scopeKey
	})
	process.stdout.write(`Installing plugins for scope ${scopeLabel}: `)
	for (const plugin of plugins) {
		process.stdout.write(chalk.bgBlue(plugin) + ' ')
	}
	process.stdout.write('\n')

	const manifest = new Set(readOrganizationManifest(organizationId, opts))

	for (const plugin of plugins) {
		const pluginDir = getOrganizationPluginPath(organizationId, plugin, opts)
		if (isPluginInstalled(pluginDir, plugin)) {
			console.log(chalk.yellow(`Plugin ${plugin} already installed at ${pluginDir}, skipping install.`))
			replaceManifestPlugin(manifest, plugin)
			continue
		}
		ensureDir(pluginDir)

		const args = [
			'npm',
			'install',
			'--no-save',
			opts.legacyPeerDeps === false ? '' : '--legacy-peer-deps',
			'--prefix',
			pluginDir,
			plugin
		].filter(Boolean)
		if (opts.registry) {
			args.push('--registry', opts.registry)
		}

		try {
			execSync(args.join(' '), {
				stdio: 'inherit',
				env: {
					...process.env,
					npm_config_package_lock: 'false',
					npm_config_lockfile: 'false'
				}
			})
			console.log(chalk.green(`Installed plugin ${plugin} for scope ${scopeLabel} at ${pluginDir}`))
			replaceManifestPlugin(manifest, plugin)
		} catch (error) {
			console.error(`Failed to install plugin ${plugin} for scope ${scopeLabel}:`, error)
		}
	}

	writeOrganizationManifest(organizationId, Array.from(manifest), opts)
}
