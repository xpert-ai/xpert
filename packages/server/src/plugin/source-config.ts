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

export function normalizePluginSourceConfig(
	source?: PluginSource | string,
	sourceConfig?: PluginSourceConfig | null
): PluginSourceConfig | null {
	const normalizedSourceConfig: PluginSourceConfig = isRecord(sourceConfig) ? { ...sourceConfig } : {}
	const configuredWorkspacePath = normalizeString(normalizedSourceConfig.workspacePath)

	if (source === 'code') {
		if (configuredWorkspacePath) {
			normalizedSourceConfig.workspacePath = configuredWorkspacePath
		}
	}

	return Object.keys(normalizedSourceConfig).length ? normalizedSourceConfig : null
}
