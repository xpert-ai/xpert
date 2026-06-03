import type { PluginSource, PluginSourceConfig } from '@xpert-ai/contracts'

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === 'object' && !Array.isArray(value)
}

function normalizeString(value: unknown): string | undefined {
	return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

export function getCodeWorkspacePath(sourceConfig?: PluginSourceConfig | null) {
	return normalizeString(sourceConfig?.workspacePath)
}

export function getCodePackageDir(sourceConfig?: PluginSourceConfig | null) {
	return normalizeString(sourceConfig?.packageDir)
}

export function getCodeRuntimeName(sourceConfig?: PluginSourceConfig | null) {
	return normalizeString(sourceConfig?.runtimeName)
}

export function omitTransientPluginSourceConfig(sourceConfig?: PluginSourceConfig | null): PluginSourceConfig | null {
	const persistedSourceConfig: PluginSourceConfig = isRecord(sourceConfig) ? { ...sourceConfig } : {}
	delete persistedSourceConfig.packageDir

	return Object.keys(persistedSourceConfig).length ? persistedSourceConfig : null
}

export function normalizePluginSourceConfig(
	source?: PluginSource | string,
	sourceConfig?: PluginSourceConfig | null
): PluginSourceConfig | null {
	const normalizedSourceConfig: PluginSourceConfig = isRecord(sourceConfig) ? { ...sourceConfig } : {}
	const configuredWorkspacePath = normalizeString(normalizedSourceConfig.workspacePath)
	const configuredPackageDir = normalizeString(normalizedSourceConfig.packageDir)
	const configuredRuntimeName = normalizeString(normalizedSourceConfig.runtimeName)

	if (source === 'code') {
		if (configuredWorkspacePath) {
			normalizedSourceConfig.workspacePath = configuredWorkspacePath
		}
		if (configuredPackageDir) {
			normalizedSourceConfig.packageDir = configuredPackageDir
		}
		if (configuredRuntimeName) {
			normalizedSourceConfig.runtimeName = configuredRuntimeName
		}
	}

	return Object.keys(normalizedSourceConfig).length ? normalizedSourceConfig : null
}
