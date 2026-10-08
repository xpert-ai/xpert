import type { DefaultAgentPluginsImportResult } from './default-agent-plugins'
import type { IRuntimePluginRequirement } from './runtime-control'
import type { PluginLevel, PluginMarketplaceCategory, PluginMarketplaceItem, PluginMarketplaceResponse } from './plugin'
import type { I18nObject } from './types'

export interface SetupPluginChoice {
  packageName: string
  title: string | I18nObject
  level?: PluginLevel
  version?: string
}

export interface SetupPluginCatalogItem extends SetupPluginChoice {
  description?: PluginMarketplaceItem['description']
  icon?: PluginMarketplaceItem['icon']
  author?: PluginMarketplaceItem['author']
  sourceName?: string
  type?: string
  businessCategory?: PluginMarketplaceCategory
  installed: boolean
  deprecated?: boolean
  deprecationMessage?: PluginMarketplaceItem['deprecationMessage']
  unavailableReason?: 'unsupported-source' | 'organization-required'
}

export interface SetupPluginCatalogQuery {
  page?: number
  pageSize?: number
  search?: string
  type?: string
  businessCategory?: PluginMarketplaceCategory
  level?: PluginLevel
  groupBy?: 'none' | 'type' | 'business'
}

export interface SetupPluginCatalogResponse {
  items: SetupPluginCatalogItem[]
  total: number
  page: number
  pageSize: number
  /** Lightweight selection identities for all matching pages, excluding installed/unavailable plugins. */
  selectableNames: string[]
  facets: {
    types: Array<{ value: string; count: number }>
    businessCategories: Array<{ value: PluginMarketplaceCategory; count: number }>
  }
  errors: PluginMarketplaceResponse['errors']
}

export type SetupPluginItemStatus = 'pending' | 'installing' | 'installed' | 'existing' | 'failed'
export interface SetupPluginItem extends SetupPluginChoice {
  status: SetupPluginItemStatus
  error?: string
  runtimeRequirements: IRuntimePluginRequirement[]
}

export interface SetupPluginProgress {
  phase: 'idle' | 'installing' | 'restarting' | 'completed' | 'attention'
  items: SetupPluginItem[]
  defaultAgentPlugins?: {
    status: 'pending' | 'importing' | 'completed' | 'failed'
    result?: DefaultAgentPluginsImportResult
    error?: string
  }
  /** Pin organization-level installations when a persisted job is resumed. */
  organizationId?: string | null
  updatedAt: string
  restartId?: string
  generation?: number
  error?: string
}

export interface SetupPluginsResponse {
  progress: SetupPluginProgress
  automaticRestart: boolean
}
