import { IPluginDescriptor, PluginComponentType } from '@xpert-ai/cloud/state'
import { TPlugin } from '@cloud/app/@shared/plugins'
import {
  PluginMarketplaceContribution,
  PluginMarketplaceDownloads,
  PluginMarketplaceOperation,
  PluginMarketplaceOperationSummary,
  PluginTargetAppMeta
} from '@xpert-ai/contracts'

export type TPluginMarketplaceOperation = PluginMarketplaceOperation

export type TPluginMarketplaceContribution = PluginMarketplaceContribution

export type TPluginResourceContribution = TPluginMarketplaceContribution & {
  type: 'skill' | 'tool' | 'app' | 'hook'
  componentType: PluginComponentType
}

export type TPluginWithDownloads = TPlugin & {
  packageName?: string | null
  downloads?: PluginMarketplaceDownloads | null
  sourceId?: string | null
  sourceName?: string | null
  sourceNameI18nKey?: string | null
  installed?: boolean
  contributions?: TPluginMarketplaceContribution[]
  operationSummary?: PluginMarketplaceOperationSummary
  targetAppMeta?: PluginTargetAppMeta | null
}

export type TInstalledPlugin = IPluginDescriptor & {
  __trackId?: string
}

export const PLATFORM_REGISTRY_SOURCE_ID = 'platform-registry'
export const PLATFORM_REGISTRY_SOURCE_NAME = 'XpertAI Platform Registry'
export const XPERT_PLUGIN_REGISTRY_SOURCE_NAME = 'Xpert Plugin Registry'

export function getPluginMarketplaceSourceI18nKey(sourceId?: string | null, sourceName?: string | null) {
  if (sourceId === PLATFORM_REGISTRY_SOURCE_ID || sourceName === PLATFORM_REGISTRY_SOURCE_NAME) {
    return 'PAC.Plugin.SourcePlatformRegistry'
  }
  if (sourceName === XPERT_PLUGIN_REGISTRY_SOURCE_NAME) {
    return 'PAC.Plugin.SourceXpertPluginRegistry'
  }
  return null
}
