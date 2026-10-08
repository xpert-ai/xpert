import { BadRequestException } from '@nestjs/common'
import { PluginLevel } from '@xpert-ai/contracts'
import { LoadedPluginRecord, normalizePluginName } from './types'
import { resolvePluginLevel } from './plugin-instance.entity'
import { readPluginBundleManifest, resolveLoadedPluginBundleRoot } from './plugin-bundle-manifest'

export function findLoadedPluginByLevels(
	loadedPlugins: LoadedPluginRecord[],
	pluginNamesOrPackages: string[],
	levels: PluginLevel[],
	scopeKey?: string
) {
	const normalizedTargets = new Set(pluginNamesOrPackages.map((name) => normalizePluginName(name)))
	return loadedPlugins.find((plugin) => {
		if (scopeKey && (plugin.scopeKey ?? plugin.organizationId) !== scopeKey) {
			return false
		}
		const level = resolvePluginLevel(plugin.level ?? plugin.instance?.meta?.level)
		if (!levels.includes(level)) {
			return false
		}
		const candidates = [plugin.name, plugin.packageName, plugin.instance?.meta?.name]
			.filter(Boolean)
			.map((candidate) => normalizePluginName(candidate as string))
		return candidates.some((candidate) => normalizedTargets.has(candidate))
	})
}

export function assertPluginArtifactNamespaceAvailable(
	loadedPlugins: LoadedPluginRecord[],
	input: {
		artifactNamespace: string
		pluginName: string
		packageName: string
	}
) {
	const targetNames = new Set(
		[input.pluginName, input.packageName]
			.map((value) => normalizeOptionalPluginName(value))
			.filter((value): value is string => Boolean(value))
	)
	const conflict = loadedPlugins.find((plugin) => {
		const loadedNamespace = resolveLoadedPluginExplicitArtifactNamespace(plugin)
		if (loadedNamespace !== input.artifactNamespace) {
			return false
		}

		const loadedNames = [plugin.name, plugin.packageName, plugin.instance?.meta?.name]
			.map((value) => normalizeOptionalPluginName(value))
			.filter((value): value is string => Boolean(value))
		return !loadedNames.some((value) => targetNames.has(value))
	})

	if (!conflict) {
		return
	}

	const conflictScope = conflict.scopeKey ?? conflict.organizationId
	throw new BadRequestException(
		`Plugin "${input.pluginName}" declares artifactNamespace="${input.artifactNamespace}", but it is already used by installed plugin "${getLoadedPluginDisplayName(conflict)}" in scope "${conflictScope}".`
	)
}

function normalizeOptionalString(value: unknown) {
	if (typeof value !== 'string') {
		return null
	}
	const normalized = value.trim()
	return normalized || null
}

function normalizeOptionalPluginName(value: unknown) {
	const normalized = normalizeOptionalString(value)
	return normalized ? normalizePluginName(normalized) : null
}

/**
 * Read only explicit namespace declarations from loaded plugins.
 * Derived namespaces remain compatibility-only in v1 and are not used as hard install blockers.
 */
function resolveLoadedPluginExplicitArtifactNamespace(plugin: LoadedPluginRecord) {
	const metaNamespace = normalizeOptionalString(plugin.instance?.meta?.artifactNamespace)
	if (metaNamespace) {
		return metaNamespace
	}

	const packageRoot = resolveLoadedPluginBundleRoot(plugin)
	if (!packageRoot) {
		return null
	}

	return normalizeOptionalString(readPluginBundleManifest(packageRoot)?.manifest.artifactNamespace)
}

function getLoadedPluginDisplayName(plugin: LoadedPluginRecord) {
	return (
		normalizeOptionalString(plugin.instance?.meta?.name) ??
		normalizeOptionalString(plugin.packageName) ??
		plugin.name
	)
}
