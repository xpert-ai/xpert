import {
	GLOBAL_ORGANIZATION_SCOPE,
	IPluginConfigResolver,
	PLUGIN_CONFIG_RESOLVER_TOKEN,
	PluginConfigResolveOptions,
	RequestContext
} from '@xpert-ai/plugin-sdk'
import { Inject, Injectable } from '@nestjs/common'
import { LOADED_PLUGINS, LoadedPluginRecord, normalizePluginName } from './types'

@Injectable()
export class PluginConfigResolver implements IPluginConfigResolver {
	constructor(
		@Inject(LOADED_PLUGINS)
		private readonly loadedPlugins: Array<LoadedPluginRecord>
	) {}

	resolve<TConfig extends object = Record<string, any>>(
		pluginName: string,
		options: PluginConfigResolveOptions<TConfig> = {}
	): TConfig {
		const defaults = (options.defaults ?? {}) as TConfig
		const normalized = normalizePluginName(pluginName)
		const organizationId = options.organizationId ?? RequestContext.getOrganizationId() ?? GLOBAL_ORGANIZATION_SCOPE
		const fallbackToGlobal = options.fallbackToGlobal !== false

		const scoped =
			this.findRecord(normalized, organizationId) ??
			(fallbackToGlobal && organizationId !== GLOBAL_ORGANIZATION_SCOPE
				? this.findRecord(normalized, GLOBAL_ORGANIZATION_SCOPE)
				: undefined)

		return {
			...defaults,
			...(scoped?.ctx?.config ?? {})
		}
	}

	private findRecord(pluginName: string, organizationId: string) {
		return this.loadedPlugins.find((plugin) => {
			if (plugin.organizationId !== organizationId) {
				return false
			}

			const candidates = [plugin.name, plugin.packageName, plugin.instance?.meta?.name]
				.filter(Boolean)
				.map((value) => normalizePluginName(value))

			return candidates.includes(pluginName)
		})
	}
}

export const PluginConfigResolverProvider = {
	provide: PLUGIN_CONFIG_RESOLVER_TOKEN,
	useExisting: PluginConfigResolver
}
