import { Inject, Injectable } from '@nestjs/common'
import { InstanceRegistryService } from '../managed-connection'
import { loadFailures } from './plugin.helper'
import { resolvePluginRuntimeRevision } from './plugin-runtime-revision'
import { LOADED_PLUGINS, LoadedPluginRecord } from './types'

export { resolvePluginRuntimeRevision } from './plugin-runtime-revision'

@Injectable()
export class PluginRuntimeStateService {
	constructor(
		@Inject(LOADED_PLUGINS)
		private readonly loadedPlugins: LoadedPluginRecord[],
		private readonly instanceRegistry: InstanceRegistryService
	) {}

	async report(): Promise<void> {
		await this.instanceRegistry.reportPluginState({
			plugins: this.loadedPlugins.map((plugin) => this.runtimeState(plugin)),
			failures: loadFailures.map((failure) => ({
				scopeKey: failure.scopeKey ?? failure.organizationId,
				pluginName: failure.pluginName,
				...(failure.packageName ? { packageName: failure.packageName } : {}),
				error: failure.error,
				...(failure.isolation ? { isolation: { ...failure.isolation } } : {})
			}))
		})
	}

	private runtimeState(plugin: LoadedPluginRecord) {
		const meta = plugin.instance?.meta
		const version = meta && typeof meta.version === 'string' ? meta.version : undefined
		const runtimeRevision = resolvePluginRuntimeRevision(plugin)
		return {
			scopeKey: plugin.scopeKey ?? plugin.organizationId,
			pluginName: plugin.name,
			...(plugin.packageName ? { packageName: plugin.packageName } : {}),
			...(version ? { version } : {}),
			...(runtimeRevision ? { runtimeRevision } : {})
		}
	}
}
