import type { IBasePerTenantAndOrganizationEntityModel } from './base-entity.model'
import type { JsonSchemaObjectType } from './ai/types'
import type { JSONValue } from './core.model'
import type { IPluginRuntimeConvergence, IRuntimePluginRequirement } from './runtime-control'
import type {
  PluginName,
  PluginSource,
  PluginSourceConfig,
  PluginLevel,
  PluginMeta,
  PluginConfigurationStatus,
  PluginSdkCompatibilityWarning,
  PluginLoadStatus,
  PluginScopeRelation,
  PluginComponentType
} from './plugin'

export interface IPlugin extends IBasePerTenantAndOrganizationEntityModel {
  scopeKey?: string | null
  pluginName: string
  packageName: string
  version?: string
  source?: PluginSource
  sourceConfig?: PluginSourceConfig | null
  level?: PluginLevel
  config: Record<string, any>
  configurationStatus?: PluginConfigurationStatus | null
  configurationError?: string | null
}

export interface IPluginInstallInput {
  pluginName: PluginName
  version?: string
  source?: PluginSource
  config?: Record<string, any>
  sourceConfig?: PluginSourceConfig
}

export interface IPluginInstallResult {
  success: boolean
  name: PluginName
  packageName: string
  organizationId: string
  currentVersion?: string
  /**
   * The plugin package was installed and persisted, but automatic runtime convergence is either
   * intentionally deferred or unavailable. All API replicas must be gracefully replaced before
   * this version is considered active.
   */
  restartRequired?: boolean
  /** Automatic organization-level convergence that the client should wait for before refreshing runtime data. */
  runtimeConvergence?: IPluginRuntimeConvergence
  /** Expected runtime state used when an explicit restart is required. */
  runtimeRequirements?: IRuntimePluginRequirement[]
}

export interface IPluginUpdateResult extends IPluginInstallResult {
  latestVersion?: string
  updated: boolean
  previousVersion?: string
}

export interface IPluginUninstallResult {
  success: boolean
  /**
   * The persisted registration was removed, but process-global Nest artifacts
   * remain active until the API process is gracefully replaced.
   */
  restartRequired?: boolean
  runtimeConvergence?: IPluginRuntimeConvergence
  runtimeRequirements?: IRuntimePluginRequirement[]
}

export interface IPluginDescriptor {
  scopeKey?: string
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
  canRefresh?: boolean
  canUninstall?: boolean
  canUpdate?: boolean
  hasUpdate?: boolean
  configSchema?: JsonSchemaObjectType
  configurationStatus?: PluginConfigurationStatus | null
  configurationError?: string | null
  sdkCompatibilityWarnings?: PluginSdkCompatibilityWarning[]
  loadStatus?: PluginLoadStatus | null
  loadError?: string | null
  effectiveInCurrentScope: boolean
  scopeRelation?: PluginScopeRelation
  componentSummary?: PluginComponentSummary
}

export interface IPluginLatestVersionStatus {
  organizationId?: string
  name: PluginName
  packageName?: string
  latestVersion?: string
  hasUpdate: boolean
}

export interface IPluginConfiguration<TConfig extends Record<string, any> = Record<string, any>> {
  pluginName: PluginName
  config: TConfig
  configSchema?: JsonSchemaObjectType
  configurationStatus?: PluginConfigurationStatus | null
  configurationError?: string | null
}

export interface PluginComponentSummary {
  total: number
  skills: number
  mcpServers: number
  toolsets: number
  apps: number
  hooks: number
}

export interface IPluginComponentDefinition {
  componentType: PluginComponentType
  componentKey: string
  sourcePath?: string | null
  config?: JSONValue | null
  metadata?: JSONValue | null
  definitionHash: string
}
