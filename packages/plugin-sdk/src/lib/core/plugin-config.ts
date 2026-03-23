export interface PluginConfigResolveOptions<TConfig extends object = Record<string, any>> {
  organizationId?: string
  fallbackToGlobal?: boolean
  defaults?: Partial<TConfig>
}

export interface IPluginConfigResolver {
  resolve<TConfig extends object = Record<string, any>>(
    pluginName: string,
    options?: PluginConfigResolveOptions<TConfig>
  ): TConfig
}

export const PLUGIN_CONFIG_RESOLVER_TOKEN = 'XPERT_PLUGIN_CONFIG_RESOLVER'
