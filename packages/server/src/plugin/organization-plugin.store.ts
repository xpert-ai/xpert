import { getConfig } from '@xpert-ai/server-config'
import { execSync } from 'child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import chalk from 'chalk'
import { normalizePluginName } from './types'

export interface OrganizationPluginStoreOptions {
	/** Base directory to keep organization plugin workspaces, defaults to `<repo>/data/plugins` */
	rootDir?: string
	/** Manifest filename, defaults to `plugins.json` under each organization folder */
	manifestName?: string
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
	dependencies?: Record<string, string>
}

type WorkspacePluginProjectJson = {
	targets?: Record<string, { options?: { outputPath?: string } }>
}

export const DEFAULT_ORG_PLUGIN_ROOT = path.join(getConfig().assetOptions.serverRoot, 'plugins')
export const DEFAULT_ORG_MANIFEST = 'plugins.json'
const COMPILED_PLUGIN_ENTRY_FILES = ['index.js', 'index.cjs.js', 'index.esm.js'] as const

function ensureDir(dir: string) {
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true })
	}
}

function hasRuntimeDependencies(packageJson: WorkspacePluginPackageJson) {
	return Object.keys(packageJson.dependencies ?? {}).length > 0
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

	try {
		execSync('npm install --omit=dev --ignore-scripts --no-save --legacy-peer-deps', {
			cwd: targetPackageDir,
			stdio: 'pipe',
			env: {
				...process.env,
				npm_config_package_lock: 'false',
				npm_config_lockfile: 'false'
			}
		})
	} catch (error) {
		const details =
			readExecFailureOutput((error as { stderr?: unknown })?.stderr) ||
			readExecFailureOutput((error as { stdout?: unknown })?.stdout)
		throw new Error(
			details
				? `Failed to install runtime dependencies for staged workspace plugin at ${targetPackageDir}: ${details}`
				: `Failed to install runtime dependencies for staged workspace plugin at ${targetPackageDir}`
		)
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
	return path.join(opts?.rootDir ?? DEFAULT_ORG_PLUGIN_ROOT, organizationId)
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
		return JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as string[]
	} catch (err) {
		console.warn(`Failed to parse plugin manifest for org ${organizationId} at ${manifestPath}:`, err)
		return []
	}
}

export function writeOrganizationManifest(
	organizationId: string,
	plugins: string[],
	opts?: OrganizationPluginStoreOptions
) {
	const manifestPath = getOrganizationManifestPath(organizationId, opts)
	ensureDir(path.dirname(manifestPath))
	fs.writeFileSync(manifestPath, JSON.stringify(Array.from(new Set(plugins)), null, 2))
}

export function stageWorkspacePlugin(opts: StageWorkspacePluginOptions): string {
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

	const hasDist = fs.existsSync(path.join(workspacePath, 'dist'))
	const hasSrcEntry = fs.existsSync(path.join(workspacePath, 'src', 'index.ts'))
	const hasCompiledRootEntry = COMPILED_PLUGIN_ENTRY_FILES.some((fileName) =>
		fs.existsSync(path.join(workspacePath, fileName))
	)
	if (!hasDist && !hasSrcEntry && !hasCompiledRootEntry) {
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

	fs.rmSync(pluginDir, { recursive: true, force: true })
	ensureDir(targetBaseDir)

	fs.cpSync(workspacePath, targetPackageDir, {
		recursive: true,
		dereference: true,
		filter: (source) => {
			const base = path.basename(source)
			return !['node_modules', '.git', '.DS_Store'].includes(base)
		}
	})

	const workspaceDist = resolveWorkspaceBuildOutput(workspacePath)
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

	installStagedWorkspaceRuntimeDependencies(targetPackageDir, packageJson)

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

	process.stdout.write(`Installing plugins for org ${organizationId}: `)
	for (const plugin of plugins) {
		process.stdout.write(chalk.bgBlue(plugin) + ' ')
	}
	process.stdout.write('\n')

	const manifest = new Set(readOrganizationManifest(organizationId, opts))

	for (const plugin of plugins) {
		const pluginDir = getOrganizationPluginPath(organizationId, plugin, opts)
		if (isPluginInstalled(pluginDir, plugin)) {
			console.log(chalk.yellow(`Plugin ${plugin} already installed at ${pluginDir}, skipping install.`))
			manifest.add(plugin)
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
			console.log(chalk.green(`Installed plugin ${plugin} for org ${organizationId} at ${pluginDir}`))
			manifest.add(plugin)
		} catch (error) {
			console.error(`Failed to install plugin ${plugin} for org ${organizationId}:`, error)
		}
	}

	writeOrganizationManifest(organizationId, Array.from(manifest), opts)
}
