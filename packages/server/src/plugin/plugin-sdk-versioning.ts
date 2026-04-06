import type { PluginSourceConfig } from '@metad/contracts'
import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { major, satisfies, validRange } from 'semver'
import { PluginSdkValidationError } from './errors'
import { getCodeWorkspacePath } from './source-config'
import { normalizePluginName } from './types'

const HOSTED_PLUGIN_SDK_PACKAGE = '@xpert-ai/plugin-sdk'

type PluginPackageManifest = {
	name?: string
	version?: string
	dependencies?: Record<string, string>
	peerDependencies?: Record<string, string>
}

export interface PluginSdkCompatibilityInfo {
	hostVersion: string
	peerRange: string
}

export interface PluginInstallValidationOptions {
	pluginName: string
	version?: string
	source?: string
	sourceConfig?: PluginSourceConfig
	registry?: string
}

let cachedHostPluginSdkVersion: string | undefined
let cachedHostPluginSdkDir: string | undefined
let cachedHostPluginSdkPackageJsonPath: string | undefined

function getRequire(basedir?: string) {
	if (!basedir) {
		return require
	}
	try {
		return createRequire(join(basedir, 'package.json'))
	} catch {
		return createRequire(basedir)
	}
}

function readJsonFile<T>(filePath: string, pluginName: string) {
	if (!existsSync(filePath)) {
		throw new PluginSdkValidationError(pluginName, `package.json not found at ${filePath}`)
	}

	try {
		return JSON.parse(readFileSync(filePath, 'utf8')) as T
	} catch (error) {
		throw new PluginSdkValidationError(pluginName, `Failed to read package.json at ${filePath}`, error)
	}
}

function collectAncestorDirs(startPath?: string) {
	if (!startPath) {
		return []
	}

	const dirs: string[] = []
	let current = resolve(startPath)
	while (true) {
		dirs.push(current)
		const parent = dirname(current)
		if (parent === current) {
			break
		}
		current = parent
	}

	return dirs
}

function getWorkspacePluginSearchDirs(basedir?: string) {
	const candidates = new Set<string>()

	for (const startPath of [basedir, process.cwd(), __dirname]) {
		for (const dir of collectAncestorDirs(startPath)) {
			candidates.add(resolve(dir, 'packages', 'plugins'))
			candidates.add(resolve(dir, 'dist', 'packages', 'plugins'))
		}
	}

	return Array.from(candidates).filter((candidate) => existsSync(candidate))
}

export function findWorkspacePluginManifestPath(pluginName: string, basedir?: string) {
	for (const workspacePluginsDir of getWorkspacePluginSearchDirs(basedir)) {
		for (const entry of readdirSync(workspacePluginsDir)) {
			const candidate = resolve(workspacePluginsDir, entry, 'package.json')
			if (!existsSync(candidate)) {
				continue
			}

			try {
				const manifest = JSON.parse(readFileSync(candidate, 'utf8')) as PluginPackageManifest
				if (manifest.name === pluginName) {
					return candidate
				}
			} catch {
				// Ignore unrelated invalid manifests when searching for the requested plugin.
			}
		}
	}

	return undefined
}

export function findWorkspacePluginDirectory(pluginName: string, basedir?: string) {
	const manifestPath = findWorkspacePluginManifestPath(pluginName, basedir)
	return manifestPath ? dirname(manifestPath) : undefined
}

function resolveHostPluginSdkPackageJsonPath() {
	if (cachedHostPluginSdkPackageJsonPath) {
		return cachedHostPluginSdkPackageJsonPath
	}

	try {
		cachedHostPluginSdkPackageJsonPath = getRequire(process.cwd()).resolve(
			`${HOSTED_PLUGIN_SDK_PACKAGE}/package.json`
		)
		return cachedHostPluginSdkPackageJsonPath
	} catch {
		// Fall through to workspace-aware resolution.
	}

	const candidates = new Set<string>()
	const nxMappings = process.env.NX_MAPPINGS

	if (nxMappings) {
		try {
			const mappings = JSON.parse(nxMappings) as Record<string, string>
			const mappedPath = mappings[HOSTED_PLUGIN_SDK_PACKAGE]
			if (mappedPath) {
				candidates.add(resolve(mappedPath, 'package.json'))
			}
		} catch {
			// Ignore malformed mapping payloads and continue with local fallbacks.
		}
	}

	for (const dir of collectAncestorDirs(process.cwd())) {
		candidates.add(resolve(dir, 'packages', 'plugin-sdk', 'dist', 'package.json'))
		candidates.add(resolve(dir, 'packages', 'plugin-sdk', 'package.json'))
		candidates.add(resolve(dir, 'node_modules', ...HOSTED_PLUGIN_SDK_PACKAGE.split('/'), 'package.json'))
	}

	for (const dir of collectAncestorDirs(__dirname)) {
		candidates.add(resolve(dir, 'packages', 'plugin-sdk', 'dist', 'package.json'))
		candidates.add(resolve(dir, 'packages', 'plugin-sdk', 'package.json'))
	}

	for (const candidate of candidates) {
		if (existsSync(candidate)) {
			cachedHostPluginSdkPackageJsonPath = candidate
			return candidate
		}
	}

	throw new PluginSdkValidationError(
		HOSTED_PLUGIN_SDK_PACKAGE,
		`Unable to resolve ${HOSTED_PLUGIN_SDK_PACKAGE}/package.json from runtime or workspace fallbacks`
	)
}

function normalizePeerRange(range?: string) {
	return range?.replace(/^workspace:/, '').trim() ?? ''
}

function assertSingleMajorRange(pluginName: string, range: string, hostVersion: string, rawRange: string) {
	const hostMajor = major(hostVersion)
	const previousMajorSentinel = hostMajor > 0 ? `${hostMajor - 1}.999.999` : undefined
	const nextMajorSentinel = `${hostMajor + 1}.0.0`
	const satisfiesPreviousMajor =
		!!previousMajorSentinel && satisfies(previousMajorSentinel, range, { includePrerelease: true })
	const satisfiesNextMajor = satisfies(nextMajorSentinel, range, { includePrerelease: true })

	if (satisfiesPreviousMajor || satisfiesNextMajor) {
		throw new PluginSdkValidationError(
			pluginName,
			`${HOSTED_PLUGIN_SDK_PACKAGE} peerDependencies must use an explicit single-major range compatible with host version ${hostVersion}; received "${rawRange}".`
		)
	}
}

export function getHostPluginSdkVersion() {
	if (cachedHostPluginSdkVersion) {
		return cachedHostPluginSdkVersion
	}

	const packageJsonPath = resolveHostPluginSdkPackageJsonPath()
	const packageJson = readJsonFile<{ version?: string }>(packageJsonPath, HOSTED_PLUGIN_SDK_PACKAGE)
	if (!packageJson.version) {
		throw new PluginSdkValidationError(
			HOSTED_PLUGIN_SDK_PACKAGE,
			`Unable to determine host SDK version from ${packageJsonPath}`
		)
	}

	cachedHostPluginSdkVersion = packageJson.version
	return cachedHostPluginSdkVersion
}

function getHostPluginSdkDir() {
	if (cachedHostPluginSdkDir) {
		return cachedHostPluginSdkDir
	}

	cachedHostPluginSdkDir = dirname(resolveHostPluginSdkPackageJsonPath())
	return cachedHostPluginSdkDir
}

export function assertPluginSdkCompatibility(
	manifest: PluginPackageManifest,
	options: {
		expectedPackageName?: string
		hostVersion?: string
	} = {}
): PluginSdkCompatibilityInfo {
	const expectedPackageName = options.expectedPackageName
	const pluginName = manifest.name ?? expectedPackageName ?? 'unknown-plugin'
	const hostVersion = options.hostVersion ?? getHostPluginSdkVersion()
	const sdkDependency = manifest.dependencies?.[HOSTED_PLUGIN_SDK_PACKAGE]
	const rawPeerRange = manifest.peerDependencies?.[HOSTED_PLUGIN_SDK_PACKAGE]
	const peerRange = normalizePeerRange(rawPeerRange)

	if (expectedPackageName && manifest.name && manifest.name !== expectedPackageName) {
		throw new PluginSdkValidationError(
			expectedPackageName,
			`package name mismatch: expected "${expectedPackageName}" but found "${manifest.name}"`
		)
	}

	if (sdkDependency) {
		throw new PluginSdkValidationError(
			pluginName,
			`${HOSTED_PLUGIN_SDK_PACKAGE} must not be declared in dependencies. Declare it in peerDependencies so the host provides the single runtime SDK instance.`
		)
	}

	if (!rawPeerRange) {
		throw new PluginSdkValidationError(
			pluginName,
			`${HOSTED_PLUGIN_SDK_PACKAGE} must be declared in peerDependencies with an explicit single-major range compatible with host version ${hostVersion}.`
		)
	}

	if (!validRange(peerRange)) {
		throw new PluginSdkValidationError(
			pluginName,
			`${HOSTED_PLUGIN_SDK_PACKAGE} peerDependencies range "${rawPeerRange}" is not a valid semver range.`
		)
	}

	if (!satisfies(hostVersion, peerRange, { includePrerelease: true })) {
		throw new PluginSdkValidationError(
			pluginName,
			`${HOSTED_PLUGIN_SDK_PACKAGE} peerDependencies range "${rawPeerRange}" is incompatible with host SDK version ${hostVersion}.`
		)
	}

	assertSingleMajorRange(pluginName, peerRange, hostVersion, rawPeerRange)

	return {
		hostVersion,
		peerRange
	}
}

export function readInstalledPluginManifest(pluginName: string, basedir?: string): PluginPackageManifest {
	const normalizedPluginName = normalizePluginName(pluginName)
	const cjsRequire = getRequire(basedir)

	try {
		const packageJsonPath = cjsRequire.resolve(`${normalizedPluginName}/package.json`)
		return readJsonFile<PluginPackageManifest>(packageJsonPath, normalizedPluginName)
	} catch {
		if (basedir) {
			const localPackageJsonPath = resolve(basedir, 'package.json')
			if (existsSync(localPackageJsonPath)) {
				return readJsonFile<PluginPackageManifest>(localPackageJsonPath, normalizedPluginName)
			}
		}

		try {
			const hostResolvedPackageJsonPath = require.resolve(`${normalizedPluginName}/package.json`)
			return readJsonFile<PluginPackageManifest>(hostResolvedPackageJsonPath, normalizedPluginName)
		} catch {
			// Fall through to other workspace-aware lookups.
		}

		const workspacePackageJsonPath = findWorkspacePluginManifestPath(normalizedPluginName, basedir)
		if (workspacePackageJsonPath) {
			return readJsonFile<PluginPackageManifest>(workspacePackageJsonPath, normalizedPluginName)
		}

		const fallbackPath = resolve(basedir ?? process.cwd(), 'node_modules', normalizedPluginName, 'package.json')
		return readJsonFile<PluginPackageManifest>(fallbackPath, normalizedPluginName)
	}
}

export function assertInstalledPluginSdkCompatibility(pluginName: string, basedir?: string) {
	return assertPluginSdkCompatibility(readInstalledPluginManifest(pluginName, basedir), {
		expectedPackageName: normalizePluginName(pluginName)
	})
}

export function ensureHostPluginSdkLink(basedir?: string) {
	if (!basedir) {
		return undefined
	}

	const hostPluginSdkDir = getHostPluginSdkDir()
	const targetDir = resolve(basedir, 'node_modules', ...HOSTED_PLUGIN_SDK_PACKAGE.split('/'))
	const parentDir = dirname(targetDir)

	if (existsSync(targetDir)) {
		try {
			if (realpathSync(targetDir) === realpathSync(hostPluginSdkDir)) {
				return targetDir
			}
		} catch {
			// Fall through and replace any stale link or directory.
		}

		rmSync(targetDir, { recursive: true, force: true })
	}

	mkdirSync(parentDir, { recursive: true })
	symlinkSync(hostPluginSdkDir, targetDir, 'junction')

	return targetDir
}

function readWorkspacePluginManifest(pluginName: string, workspacePath: string) {
	if (!workspacePath) {
		throw new PluginSdkValidationError(pluginName, 'workspacePath is required for code plugins')
	}

	const packageJsonPath = resolve(workspacePath, 'package.json')
	return readJsonFile<PluginPackageManifest>(packageJsonPath, normalizePluginName(pluginName))
}

function parseRegistryManifest(output: string, pluginName: string): PluginPackageManifest {
	const trimmed = output.trim()
	if (!trimmed) {
		throw new PluginSdkValidationError(pluginName, 'npm view returned an empty package manifest response')
	}

	try {
		const parsed = JSON.parse(trimmed) as PluginPackageManifest | PluginPackageManifest[]
		return Array.isArray(parsed) ? parsed[parsed.length - 1] : parsed
	} catch (error) {
		throw new PluginSdkValidationError(pluginName, 'Failed to parse npm view package manifest response', error)
	}
}

function execFileUtf8(command: string, args: string[]) {
	return new Promise<string>((resolveOutput, reject) => {
		execFile(command, args, { encoding: 'utf8' }, (error, stdout) => {
			if (error) {
				reject(error)
				return
			}

			resolveOutput(stdout.trim())
		})
	})
}

async function fetchRegistryPluginManifest(
	pluginName: string,
	version?: string,
	registry?: string
): Promise<PluginPackageManifest> {
	const normalizedPluginName = normalizePluginName(pluginName)
	const spec = version ? `${normalizedPluginName}@${version}` : normalizedPluginName
	const args = ['view', spec, 'name', 'version', 'dependencies', 'peerDependencies', '--json']
	const effectiveRegistry = registry ?? process.env.npm_config_registry ?? process.env.NPM_CONFIG_REGISTRY

	if (effectiveRegistry) {
		args.push('--registry', effectiveRegistry)
	}

	const output = await execFileUtf8('npm', args)
	return parseRegistryManifest(output, normalizedPluginName)
}

export async function assertPluginSdkInstallCandidate(options: PluginInstallValidationOptions) {
	if (options.source === 'git' || options.source === 'local' || options.source === 'url') {
		return undefined
	}

	const workspacePath = getCodeWorkspacePath(options.sourceConfig)

	const manifest =
		options.source === 'code'
			? readWorkspacePluginManifest(options.pluginName, workspacePath)
			: await fetchRegistryPluginManifest(options.pluginName, options.version, options.registry)

	return assertPluginSdkCompatibility(manifest, {
		expectedPackageName: normalizePluginName(options.pluginName)
	})
}
