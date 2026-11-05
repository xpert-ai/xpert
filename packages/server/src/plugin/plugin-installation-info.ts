import type {
	PluginInstallationInfo,
	PluginSource,
	PluginSourceConfig,
	PluginUpdateUnavailableReason
} from '@xpert-ai/contracts'

/** Translate host-written provenance into a safe, typed UI projection, including pre-discriminator uploads. */
export function pluginInstallationInfo(
	source?: PluginSource,
	config?: PluginSourceConfig | null
): PluginInstallationInfo {
	if (source === 'code') {
		if (config?.installationMethod === 'archive' || typeof config?.uploadFileName === 'string') {
			return {
				method: 'archive',
				fileName: config?.uploadFileName?.replace(/\\/g, '/').split('/').pop(),
				installedAt: config?.uploadInstalledAt
			}
		}
		return { method: config?.installationMethod === 'workspace' || config?.workspacePath ? 'workspace' : 'unknown' }
	}
	if (source === 'npm' || source === 'marketplace' || source === 'env') return { method: 'npm' }
	if (source === 'git' || source === 'url' || source === 'local') return { method: source }
	return { method: 'unknown' }
}

export function pluginUpdateUnavailableReason(
	canUpdate: boolean,
	installation: PluginInstallationInfo,
	status: 'loaded' | 'pending_restart' | 'failed'
): PluginUpdateUnavailableReason | undefined {
	if (status === 'failed') return 'load_failed'
	if (status === 'pending_restart') return 'pending_restart'
	if (installation.method === 'archive' || installation.method === 'workspace') return installation.method
	if (installation.method !== 'npm') return 'unsupported_source'
	return canUpdate ? undefined : 'scope'
}
