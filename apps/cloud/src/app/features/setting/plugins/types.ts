import { IPluginDescriptor, PluginComponentType } from '@xpert-ai/cloud/state'
import { TPlugin } from '@cloud/app/@shared/plugins'
import { I18nObject, IconDefinition } from '@cloud/app/@core'

export type TPluginMarketplaceOperation = {
  name: string
  displayName?: I18nObject | string
  description?: I18nObject | string
  access?: 'read' | 'write' | 'admin' | string
  tags?: string[]
}

export type TPluginMarketplaceContribution = {
  id?: string
  type: 'app' | 'view' | 'feature' | 'tool' | 'assistant-template' | 'skill' | 'hook' | string
  name: string
  displayName?: I18nObject | string
  description?: I18nObject | string
  icon?: IconDefinition
  operations?: TPluginMarketplaceOperation[]
  tags?: string[]
  metadata?: Record<string, unknown>
}

export type TPluginResourceContribution = TPluginMarketplaceContribution & {
  type: 'skill' | 'tool' | 'app' | 'hook'
  componentType: PluginComponentType
}

export type TPluginWithDownloads = TPlugin & {
  packageName?: string | null
  downloads?: {
    lastWeek?: number
    lastMonth?: number
    lastYear?: number
  }
  sourceId?: string | null
  sourceName?: string | null
  sourceNameI18nKey?: string | null
  installed?: boolean
  contributions?: TPluginMarketplaceContribution[]
  operationSummary?: {
    total: number
    read: number
    write: number
    admin: number
  }
  marketplacePlugin?: Record<string, unknown> | null
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
