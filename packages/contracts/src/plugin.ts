import { IBasePerTenantAndOrganizationEntityModel } from './base-entity.model'
import { IconDefinition } from './types'

export type PluginName = string
export const PLUGIN_LEVEL = {
  SYSTEM: 'system',
  ORGANIZATION: 'organization'
} as const

/**
 * Classifies plugin scope and governance.
 * - `system`: built-in/platform-managed plugin that users cannot install/uninstall from org APIs.
 * - `organization`: tenant/org-managed plugin that can be installed and removed per organization.
 */
export type PluginLevel = (typeof PLUGIN_LEVEL)[keyof typeof PLUGIN_LEVEL]

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
  source?: 'marketplace' | 'local' | 'git' | 'url' | 'npm' | 'code' | 'env'
  level?: PluginLevel
  config: Record<string, any>
}
