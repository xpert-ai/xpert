// Archive provenance is supplied only by a host-verified archive operation.
// Reuse decisions run under the plugin store lease and do not attest live runtime readiness.
import { BadRequestException, ForbiddenException } from '@nestjs/common'
import type { PluginLevel, PluginSourceConfig } from '@xpert-ai/contracts'
import { t } from 'i18next'
import { readPluginPackageJson } from '../plugin-archive'
import type { PluginInstance } from '../plugin-instance.entity'
import { getCodePackageDir, getCodeWorkspacePath } from '../source-config'

export type PluginInstallOptions = {
	allowPackageDir?: boolean
	deferActivation?: boolean
	requiredLevel?: PluginLevel
	archiveDeployment?: { sha256: string; allowReplace: boolean }
}

export function prepareArchiveSourceConfig(
	source: string,
	sourceConfig: PluginSourceConfig | null,
	options: PluginInstallOptions,
	hasConfig: boolean
): PluginSourceConfig | null {
	const config = { ...sourceConfig }
	delete config.archiveSha256
	if (options.archiveDeployment) {
		if (source !== 'code' || !options.allowPackageDir || !getCodePackageDir(config) ||
			getCodeWorkspacePath(config) || hasConfig || !/^[a-f0-9]{64}$/.test(options.archiveDeployment.sha256)) {
			throw new BadRequestException(t('server-ai:Error.PluginArchiveDeploymentInput'))
		}
		config.archiveSha256 = options.archiveDeployment.sha256
	}
	return Object.keys(config).length ? config : null
}

export function canReusePluginArchive(
	existing: Pick<PluginInstance, 'source' | 'sourceConfig' | 'version'> | null | undefined,
	archive: NonNullable<PluginInstallOptions['archiveDeployment']>,
	packageName: string,
	version: string | undefined,
	runtimePath: string | undefined
) {
	if (!existing) return false
	const sameArchive = existing.source === 'code' && !!version && existing.version === version &&
		existing.sourceConfig?.archiveSha256 === archive.sha256
	if (!sameArchive) {
		if (!archive.allowReplace) throw new ForbiddenException(t('server-ai:Error.PluginDeploymentConflict'))
		return false
	}
	if (!runtimePath || existing.sourceConfig?.immutableRuntime !== true) return false
	try {
		const manifest = readPluginPackageJson(runtimePath)
		return manifest.name === packageName && manifest.version === version
	} catch {
		// The same approved archive can repair a missing or unreadable immutable directory.
		return false
	}
}
