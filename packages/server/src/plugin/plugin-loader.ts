import { PluginLevel, PluginSource } from '@xpert-ai/contracts'
import { getErrorMessage } from '@xpert-ai/server-common'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { existsSync, readFileSync } from 'fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'path'
import { assertInstalledPluginSdkCompatibility, ensureHostPluginSdkLink } from './plugin-sdk-versioning'
import { PluginLoadError } from './errors'

export interface PluginLoadOptions {
	/** Resolve modules relative to this base directory (expects a node_modules inside it) */
	basedir?: string
	source?: PluginSource | string
	workspacePath?: string
}

function isProd() {
	return process.env.NODE_ENV === 'production'
}

function getRequire(basedir?: string) {
	if (!basedir) return require
	try {
		return createRequire(join(basedir, 'package.json'))
	} catch {
		return createRequire(basedir)
	}
}

function parsePluginLevel(level: unknown): PluginLevel | undefined {
	level = typeof level === 'string' ? level.toLowerCase() : undefined
	if (level === 'system' || level === 'organization') {
		return level
	}
	return undefined
}

function readPluginLevelFromPackageJson(modName: string, opts: PluginLoadOptions = {}) {
	const basedir = opts.basedir
	const cjsRequire = getRequire(basedir)

	const readPackage = (packageJsonPath: string) => {
		if (!existsSync(packageJsonPath)) {
			return undefined
		}
		try {
			return JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
				xpert?: { plugin?: { level?: unknown } }
			}
		} catch {
			return undefined
		}
	}

	try {
		const packageJsonPath = cjsRequire.resolve(`${modName}/package.json`)
		const packageJson = readPackage(packageJsonPath)
		const level = parsePluginLevel(packageJson?.xpert?.plugin?.level)
		if (level) {
			return level
		}
	} catch {
		// Ignore package.json resolve failures and fallback to conventional location.
	}

	const fallbackPath = resolve(basedir ?? process.cwd(), 'node_modules', modName, 'package.json')
	const fallbackPackageJson = readPackage(fallbackPath)
	return parsePluginLevel(fallbackPackageJson?.xpert?.plugin?.level)
}

async function loadModule(modName: string, opts: PluginLoadOptions = {}): Promise<any> {
	const basedir = opts.basedir
	const cjsRequire = getRequire(basedir)
	const production = isProd()
	const resolveFromBase = (name: string) => {
		if (!basedir) return name
		try {
			return cjsRequire.resolve(name)
		} catch {
			return name
		}
	}
	const target = resolveFromBase(modName)
	let errorMessage = ''
	const preferredTsEntry = getPreferredWorkspaceTsEntry(opts)

	if (!production && preferredTsEntry) {
		try {
			return loadTsEntry(cjsRequire, preferredTsEntry)
		} catch (error) {
			errorMessage += `Preferred TS source load failed for ${modName}: ${getErrorMessage(error)}\n`
		}
	}

	// Production runs the bundled server build, where a dynamic import of a runtime-resolved
	// path may be rewritten by the bundler. Prefer Node's own loader in that environment.
	if (production) {
		try {
			return cjsRequire(target)
		} catch (error) {
			errorMessage += `CJS require failed for ${target}: ${getErrorMessage(error)}\n`
			throw new PluginLoadError(modName, errorMessage, error)
		}
	}

	// Try ESM import
	try {
		return await import(target)
	} catch (e1) {
		console.warn(`ESM import failed for ${target}:`, e1)
		errorMessage += `ESM import failed for ${target}: ${getErrorMessage(e1)}\n`
		try {
			// eslint-disable-next-line @typescript-eslint/no-var-requires
			return cjsRequire(target)
		} catch (e2) {
			errorMessage += `CJS require failed for ${target}: ${getErrorMessage(e2)}\n`
			throw new PluginLoadError(modName, errorMessage, e2)
		}
	}
}

export async function loadPlugin(modName: string, opts: PluginLoadOptions = {}): Promise<XpertPlugin> {
	// Remove version suffix if present (e.g., '@xpert-ai/plugin-lark@0.0.4' -> '@xpert-ai/plugin-lark')
	if (modName.includes('@')) {
		const atIndex = modName.lastIndexOf('@')
		// If '@' is not at the start, it's a version suffix
		if (atIndex > 0) {
			modName = modName.slice(0, atIndex)
		}
	}

	ensureHostPluginSdkLink(opts.basedir)
	assertInstalledPluginSdkCompatibility(modName, opts.basedir)
	const m = await loadModule(modName, opts)
	const plugin = (m?.default ?? m) as XpertPlugin
	if (!plugin?.meta || typeof plugin.register !== 'function') {
		throw new PluginLoadError(modName, 'Module does not export a valid XpertPlugin')
	}

	if (!plugin.meta.level) {
		const packageLevel = readPluginLevelFromPackageJson(modName, opts)
		plugin.meta.level = packageLevel ?? plugin.meta.level
	}

	return plugin
}

function getPreferredWorkspaceTsEntry(opts: PluginLoadOptions) {
	const workspacePath = normalizeWorkspacePath(opts.workspacePath)
	if (opts.source !== 'code' || !workspacePath) {
		return null
	}

	const tsEntry = getWorkspaceTsEntryPath(workspacePath)
	return existsSync(tsEntry) ? tsEntry : null
}

function normalizeWorkspacePath(workspacePath?: string) {
	return typeof workspacePath === 'string' && workspacePath.trim().length > 0 ? workspacePath.trim() : null
}

function getWorkspaceTsEntryPath(workspacePath: string) {
	return resolve(workspacePath, 'src/index.ts')
}

function loadTsEntry(cjsRequire: NodeRequire, tsEntry: string) {
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	require('ts-node').register({
		transpileOnly: true,
		compilerOptions: {
			module: 'CommonJS',
			target: 'ES2021',
			experimentalDecorators: true,
			emitDecoratorMetadata: true
		}
	})

	return cjsRequire(tsEntry)
}
