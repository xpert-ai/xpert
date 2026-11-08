import { readWorkspacePluginRuntimeRevision } from './organization-plugin.store'
import { getCodeRuntimeName } from './source-config'
import type { LoadedPluginRecord } from './types'

export function resolvePluginRuntimeRevision(
	plugin: Pick<LoadedPluginRecord, 'source' | 'sourceConfig' | 'baseDir'>
): string | undefined {
	if (plugin.source !== 'code') return undefined

	const runtimeName = getCodeRuntimeName(plugin.sourceConfig)
	if (runtimeName) return `runtime:${runtimeName}`

	const workspaceRevision = plugin.baseDir ? readWorkspacePluginRuntimeRevision(plugin.baseDir) : undefined
	if (workspaceRevision) return workspaceRevision
	return undefined
}
