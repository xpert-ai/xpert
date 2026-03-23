import { IBasePerTenantAndOrganizationEntityModel } from './base-entity.model'
import { JsonSchemaObjectType } from './ai/types'
import { IconDefinition } from './types'

export type PluginName = string
export const PLUGIN_LEVEL = {
  SYSTEM: 'system',
  ORGANIZATION: 'organization'
} as const

export const PLUGIN_SOURCE = {
  MARKETPLACE: 'marketplace',
  LOCAL: 'local',
  GIT: 'git',
  URL: 'url',
  NPM: 'npm',
  CODE: 'code',
  ENV: 'env'
} as const

export const PLUGIN_CONFIGURATION_STATUS = {
  VALID: 'valid',
  INVALID: 'invalid'
} as const

/**
 * Classifies plugin scope and governance.
 * - `system`: built-in/platform-managed plugin that users cannot install/uninstall from org APIs.
 * - `organization`: tenant/org-managed plugin that can be installed and removed per organization.
 */
export type PluginLevel = (typeof PLUGIN_LEVEL)[keyof typeof PLUGIN_LEVEL]
export type PluginSource = (typeof PLUGIN_SOURCE)[keyof typeof PLUGIN_SOURCE]
export type PluginConfigurationStatus = (typeof PLUGIN_CONFIGURATION_STATUS)[keyof typeof PLUGIN_CONFIGURATION_STATUS]

export interface PluginMeta {
  name: PluginName
  version: string
  /**
   * Declares the plugin's operational level used for visibility and install/uninstall guardrails.
   */
  level?: PluginLevel
  icon?: IconDefinition
  category:
    | 'set'
    | 'doc-source'
    | 'agent'
    | 'tools'
    | 'model'
    | 'vlm'
    | 'vector-store'
    | 'integration'
    | 'datasource'
    | 'database'
    | 'middleware'
  displayName: string
  description: string
  keywords?: string[]
  author: string
  homepage?: string
}

export interface IPlugin extends IBasePerTenantAndOrganizationEntityModel {
  pluginName: string
  packageName: string
  version?: string
  source?: PluginSource
  level?: PluginLevel
  config: Record<string, any>
  configurationStatus?: PluginConfigurationStatus | null
  configurationError?: string | null
}

export interface IPluginDescriptor {
  organizationId?: string
  name: PluginName
  meta: PluginMeta
  packageName?: string
  source?: PluginSource
  currentVersion?: string
  latestVersion?: string
  isGlobal: boolean
  level: PluginLevel
  canConfigure?: boolean
  canUpdate?: boolean
  hasUpdate?: boolean
  configSchema?: JsonSchemaObjectType
  configurationStatus?: PluginConfigurationStatus | null
  configurationError?: string | null
}

export interface IPluginConfiguration<TConfig extends Record<string, any> = Record<string, any>> {
  pluginName: PluginName
  config: TConfig
  configSchema?: JsonSchemaObjectType
  configurationStatus?: PluginConfigurationStatus | null
  configurationError?: string | null
}
