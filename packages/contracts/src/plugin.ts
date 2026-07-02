import { IBasePerTenantAndOrganizationEntityModel } from './base-entity.model'
import { JsonSchemaObjectType } from './ai/types'
import type { IXpert } from './ai/xpert.model'
import type { TMcpStdioRuntimePolicy } from './ai/xpert-tool-mcp.model'
import type { JSONValue } from './core.model'
import { IconDefinition, I18nObject } from './types'

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

export const PLUGIN_LOAD_STATUS = {
  LOADED: 'loaded',
  FAILED: 'failed'
} as const

export const PLUGIN_COMPONENT_TYPE = {
  SKILL: 'skill',
  MCP_SERVER: 'mcp_server',
  APP: 'app',
  HOOK: 'hook',
  ASSET: 'asset'
} as const

export const PLUGIN_MARKETPLACE_INSTALLATION_POLICY = {
  AVAILABLE: 'AVAILABLE',
  INSTALLED_BY_DEFAULT: 'INSTALLED_BY_DEFAULT',
  NOT_AVAILABLE: 'NOT_AVAILABLE'
} as const

export const PLUGIN_MARKETPLACE_AUTHENTICATION_POLICY = {
  ON_INSTALL: 'ON_INSTALL',
  ON_FIRST_USE: 'ON_FIRST_USE',
  NONE: 'NONE'
} as const

export const PLUGIN_MCP_TOOL_APPROVAL_MODE = {
  PROMPT: 'prompt',
  APPROVE: 'approve',
  DENY: 'deny'
} as const

export const PLUGIN_RESOURCE_RUNTIME_TYPE = {
  SKILL_PACKAGE: 'skill_package',
  TOOLSET: 'toolset',
  HOOK_PROFILE: 'hook_profile',
  APP_CONNECTOR: 'app_connector'
} as const

export const PLUGIN_RESOURCE_INSTALLATION_STATUS = {
  READY: 'ready',
  PENDING_AUTH: 'pending_auth',
  BLOCKED: 'blocked',
  FAILED: 'failed'
} as const

/**
 * Classifies plugin scope and governance.
 * - `system`: built-in/platform-managed plugin that users cannot install/uninstall from org APIs.
 * - `organization`: tenant/org-managed plugin that can be installed and removed per organization.
 */
export type PluginLevel = (typeof PLUGIN_LEVEL)[keyof typeof PLUGIN_LEVEL]
export type PluginSource = (typeof PLUGIN_SOURCE)[keyof typeof PLUGIN_SOURCE]
export type PluginConfigurationStatus = (typeof PLUGIN_CONFIGURATION_STATUS)[keyof typeof PLUGIN_CONFIGURATION_STATUS]
export type PluginLoadStatus = (typeof PLUGIN_LOAD_STATUS)[keyof typeof PLUGIN_LOAD_STATUS]
export type PluginComponentType = (typeof PLUGIN_COMPONENT_TYPE)[keyof typeof PLUGIN_COMPONENT_TYPE]
export type PluginMarketplaceInstallationPolicy =
  (typeof PLUGIN_MARKETPLACE_INSTALLATION_POLICY)[keyof typeof PLUGIN_MARKETPLACE_INSTALLATION_POLICY]
export type PluginMarketplaceAuthenticationPolicy =
  (typeof PLUGIN_MARKETPLACE_AUTHENTICATION_POLICY)[keyof typeof PLUGIN_MARKETPLACE_AUTHENTICATION_POLICY]
export type PluginMcpToolApprovalMode =
  (typeof PLUGIN_MCP_TOOL_APPROVAL_MODE)[keyof typeof PLUGIN_MCP_TOOL_APPROVAL_MODE]
export type PluginResourceRuntimeType = (typeof PLUGIN_RESOURCE_RUNTIME_TYPE)[keyof typeof PLUGIN_RESOURCE_RUNTIME_TYPE]
export type PluginResourceInstallationStatus =
  (typeof PLUGIN_RESOURCE_INSTALLATION_STATUS)[keyof typeof PLUGIN_RESOURCE_INSTALLATION_STATUS]
export type PluginScopeRelation = 'none' | 'overrides-global' | 'shadowed-by-organization'
export type PluginTargetApp = 'xpert' | 'data-xpert' | (string & {})
export type PluginSdkCompatibilityWarningCode =
  | 'plugin-sdk-peer-dependency-missing'
  | 'plugin-sdk-peer-range-invalid'
  | 'plugin-sdk-peer-range-incompatible'
  | 'plugin-sdk-peer-range-spans-major'
export type PluginMarketplaceContributionType =
  | 'app'
  | 'view'
  | 'feature'
  | 'skill'
  | 'tool'
  | 'hook'
  | 'assistant-template'
  | (string & {})
export type PluginMarketplaceOperationAccess = 'read' | 'write' | 'admin' | (string & {})

export interface PluginMarketplaceOperation {
  name: string
  displayName?: string | I18nObject
  description?: string | I18nObject
  access?: PluginMarketplaceOperationAccess
  tags?: string[]
}

export interface XpertPluginMarketplacePolicy {
  installation?: PluginMarketplaceInstallationPolicy
  authentication?: PluginMarketplaceAuthenticationPolicy
  pluginSharing?: boolean
}

export interface XpertPluginMarketplaceSource {
  source?: 'local' | 'url' | 'git-subdir' | 'github' | 'git' | 'npm' | 'marketplace' | (string & {})
  path?: string
  url?: string
  ref?: string
  sha?: string
  sparsePath?: string
  packageName?: string
}

export interface XpertPluginInstallInterface {
  displayName?: string
  shortDescription?: string
  longDescription?: string
  developerName?: string
  category?: string
  capabilities?: string[]
  websiteURL?: string
  privacyPolicyURL?: string
  termsOfServiceURL?: string
  defaultPrompt?: string[]
  brandColor?: string
  composerIcon?: string
  logo?: string
  screenshots?: string[]
}

export interface XpertPluginMcpServerPolicy {
  enabled?: boolean
  defaultToolsApprovalMode?: PluginMcpToolApprovalMode
  enabledTools?: string[]
  runtime?: TMcpStdioRuntimePolicy
  tools?: {
    [toolName: string]: {
      approvalMode?: PluginMcpToolApprovalMode
    }
  }
}

export interface XpertPluginBundleManifest {
  name: string
  version?: string
  description?: string
  author?: string
  homepage?: string
  repository?: JSONValue
  license?: string
  keywords?: string[]
  skills?: string | string[]
  mcpServers?: string | string[] | JSONValue
  apps?: string | string[] | JSONValue
  connectors?: string | string[] | JSONValue
  hooks?: string | string[] | JSONValue | JSONValue[]
  interface?: XpertPluginInstallInterface
  policy?: XpertPluginMarketplacePolicy
  source?: XpertPluginMarketplaceSource
  assets?: {
    composerIcon?: string
    logo?: string
    screenshots?: string[]
  }
  targetApps?: PluginTargetApp[]
  targetAppMeta?: PluginTargetAppMeta
}

export interface XpertTemplatePluginSkillDependency {
  pluginName?: PluginName
  componentKey: string
  targetAgentKey?: string
}

export interface XpertTemplatePluginMcpServerDependency {
  pluginName?: PluginName
  componentKey: string
  targetAgentKey?: string
  policyOverrides?: XpertPluginMcpServerPolicy
}

export interface XpertTemplatePluginHookDependency {
  pluginName?: PluginName
  componentKey: string
  targetAgentKey?: string
  events?: string[]
}

export interface XpertTemplatePluginAppDependency {
  pluginName?: PluginName
  componentKey: string
  auth?: 'on_install' | 'on_first_use'
}

export interface XpertTemplatePluginToolsetDependency {
  pluginName?: PluginName
  provider: string
  templateNodeKey: string
  targetAgentKey?: string
  instanceName?: string
}

export interface XpertTemplatePluginDependencies {
  plugins?: PluginName[]
  skills?: XpertTemplatePluginSkillDependency[]
  mcpServers?: XpertTemplatePluginMcpServerDependency[]
  hooks?: XpertTemplatePluginHookDependency[]
  apps?: XpertTemplatePluginAppDependency[]
  toolsets?: XpertTemplatePluginToolsetDependency[]
}

export interface PluginMarketplaceContribution {
  id?: string
  type: PluginMarketplaceContributionType
  name: string
  displayName?: string | I18nObject
  description?: string | I18nObject
  icon?: IconDefinition
  color?: string
  operations?: PluginMarketplaceOperation[]
  tags?: string[]
  metadata?: Record<string, unknown>
}

export interface PluginMarketplaceTrialShortcut {
  id?: string
  label?: string | I18nObject
  prompt: string
  skillKey?: string
  icon?: IconDefinition
}

export type PluginMarketplaceCategory =
  | 'featured'
  | 'business-operations'
  | 'communication'
  | 'creativity'
  | 'data-analytics'
  | 'developer-tools'
  | 'education-research'
  | 'finance'
  | 'productivity'
  | 'research'
  | 'security'
  | 'travel'
  | 'sales'
  | 'other'

export interface PluginTargetAppMarketplaceMetadata {
  contents?: PluginMarketplaceContribution[]
  category?: PluginMarketplaceCategory
  subcategory?: string
  featured?: boolean
  screenshots?: string[]
  trialShortcuts?: PluginMarketplaceTrialShortcut[]
  readme?: string
  updatedAt?: string
}

export interface PluginTargetAppRuntimeMetadata {
  middlewareProviders?: string[]
  viewProviders?: string[]
  templateProviders?: string[]
  [key: string]: unknown
}

export interface PluginSdkCompatibilityWarning {
  code: PluginSdkCompatibilityWarningCode
  packageName: PluginName
  hostVersion: string
  peerRange?: string | null
  message: string
}

export interface PluginTargetAppMetadata {
  /**
   * App-owned classification values. Each target app owns the vocabulary for its own entry.
   */
  types?: string[]
  /**
   * Minimum version of the target app that can safely use this plugin.
   */
  minAppVersion?: string
  capabilities?: string[]
  marketplace?: PluginTargetAppMarketplaceMetadata
  runtime?: PluginTargetAppRuntimeMetadata
  [key: string]: unknown
}

export type PluginTargetAppMeta = Record<string, PluginTargetAppMetadata | undefined>

export interface PluginCodeSourceConfig {
  workspacePath?: string
}

export interface PluginSourceConfig extends PluginCodeSourceConfig {
  [key: string]: unknown
}

export interface PluginMeta {
  name: PluginName
  version: string
  /**
   * Declares the plugin's operational level used for visibility and install/uninstall guardrails.
   */
  level?: PluginLevel
  /**
   * Declares the product surfaces this plugin is intended to appear in.
   *
   * When omitted, the plugin remains a generic xpert-pro plugin for backwards compatibility.
   */
  targetApps?: PluginTargetApp[]
  /**
   * App-specific metadata grouped by target app without overloading the technical category.
   */
  targetAppMeta?: PluginTargetAppMeta
  /**
   * Marks a plugin as deprecated while keeping it installable/visible for migration.
   */
  deprecated?: boolean
  /**
   * Optional user-facing migration guidance shown when the plugin is deprecated.
   */
  deprecationMessage?: I18nObject
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

export type PluginMarketplaceSourceType = 'url' | 'github' | 'git'
export type PluginMarketplaceSourceResponseType = PluginMarketplaceSourceType | 'platform'
export type PluginMarketplaceRegistrySection = 'marketplace' | 'official' | 'partner' | 'community'
export type PluginMarketplaceRegistryDownloadStatus = 'idle' | 'success' | 'failed'
export type PluginMarketplaceItemSourceType =
  | 'marketplace'
  | 'github'
  | 'git'
  | 'url'
  | 'npm'
  | 'website'
  | 'other'
  | (string & {})

export interface PluginMarketplaceSourceInput {
  name?: string
  type?: PluginMarketplaceSourceType
  url?: string
  ref?: string | null
  sparsePath?: string | null
  enabled?: boolean
  priority?: number
}

export interface PluginMarketplaceSourceResponse {
  id: string
  name: string
  type: PluginMarketplaceSourceResponseType
  url: string
  ref?: string | null
  sparsePath?: string | null
  enabled: boolean
  priority: number
  lastIndexStatus?: string | null
  lastIndexedAt?: Date | string | null
  lastIndexError?: string | null
  builtin?: boolean
}

export interface PluginMarketplaceRegistryItem {
  id: string
  packageName: string
  version?: string | null
  displayName: string
  description: string
  category: string
  author: string
  icon?: IconDefinition | null
  keywords: string[]
  homepage?: string | null
  repository?: JSONValue | null
  targetApps: PluginTargetApp[]
  targetAppMeta: PluginTargetAppMeta
  enabled: boolean
  priority: number
  section: PluginMarketplaceRegistrySection
  downloads?: PluginMarketplaceDownloads | null
  downloadsStatus?: PluginMarketplaceRegistryDownloadStatus | string | null
  downloadsUpdatedAt?: Date | string | null
  downloadsError?: string | null
  createdAt?: Date | string | null
  updatedAt?: Date | string | null
}

export type PluginMarketplaceRegistryItemResponse = PluginMarketplaceRegistryItem

export interface PluginMarketplaceRegistryItemInput {
  packageName?: string
  version?: string | null
  displayName?: string
  description?: string
  category?: string
  author?: string
  icon?: IconDefinition | null
  keywords?: string[]
  homepage?: string | null
  repository?: JSONValue | null
  targetApps?: PluginTargetApp[]
  targetAppMeta?: PluginTargetAppMeta | null
  enabled?: boolean
  priority?: number
  section?: PluginMarketplaceRegistrySection
}

export interface PluginMarketplaceAuthor {
  name?: string | null
  displayName?: string | null
  url?: string | null
  homepage?: string | null
}

export interface PluginMarketplaceDownloads {
  lastWeek?: number
  lastMonth?: number
  lastYear?: number
  [key: string]: JSONValue | undefined
}

export interface PluginMarketplaceOperationSummary {
  total: number
  read: number
  write: number
  admin: number
}

export interface PluginMarketplaceItemSource {
  type?: PluginMarketplaceItemSourceType
  url?: string | null
  path?: string | null
  ref?: string | null
  packageName?: string | null
}

export interface PluginMarketplaceItem {
  name: string
  packageName?: string | null
  displayName?: I18nObject | string
  description?: I18nObject | string
  version?: string | null
  level?: PluginLevel
  deprecated?: boolean
  deprecationMessage?: I18nObject | string | null
  category?: PluginMeta['category'] | string
  icon?: IconDefinition | null
  author?: PluginMarketplaceAuthor | string | null
  source?: PluginMarketplaceItemSource | null
  keywords?: string[]
  screenshots?: string[]
  downloads?: PluginMarketplaceDownloads | null
  sourceId?: string | null
  sourceName?: string | null
  sourceNameI18nKey?: string | null
  installed?: boolean
  contributions?: PluginMarketplaceContribution[]
  defaultPrompt?: string[]
  trialShortcuts?: PluginMarketplaceTrialShortcut[]
  operationSummary?: PluginMarketplaceOperationSummary
  targetApps?: PluginTargetApp[]
  targetAppMeta?: PluginTargetAppMeta | null
  marketplacePlugin?: JSONValue | null
  section?: PluginMarketplaceRegistrySection | string
}

export type PluginMarketplaceReadmeSource = 'installed-package' | 'npm-package' | 'marketplace-metadata' | 'description'

export interface PluginMarketplaceReadme {
  locale: string
  requestedLocale?: string | null
  fileName?: string | null
  content: string
  source: PluginMarketplaceReadmeSource
}

export interface PluginMarketplaceDetailItem extends PluginMarketplaceItem {
  readme: PluginMarketplaceReadme
  availableReadmeLocales?: string[]
}

export interface PluginMarketplaceResponse {
  updatedAt: string | null
  total: number
  items: PluginMarketplaceItem[]
  sources: PluginMarketplaceSourceResponse[]
  official?: string[]
  partner?: string[]
  community?: string[]
  errors?: Array<{ sourceId: string; sourceName: string; message: string }>
}

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
}

export interface IPluginUpdateResult extends IPluginInstallResult {
  latestVersion?: string
  updated: boolean
  previousVersion?: string
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

export interface IPluginComponentDocument {
  pluginName: PluginName
  componentType: PluginComponentType
  componentKey: string
  sourcePath?: string | null
  fileName?: string | null
  content: string
}

export interface IPluginResourceComponentState {
  componentType: PluginComponentType
  componentKey: string
  installed: boolean
  staleDefinition: boolean
  runtimeType?: PluginResourceRuntimeType | null
  runtimeId?: string | null
  status?: PluginResourceInstallationStatus | null
  installation?: IPluginResourceInstallation | null
}

export interface PluginResourceComponentSelector {
  componentType?: PluginComponentType
  componentKey: string
  pluginName?: PluginName
  targetAgentKey?: string
  policyOverrides?: XpertPluginMcpServerPolicy
  events?: string[]
  auth?: 'on_install' | 'on_first_use'
}

export interface IPluginResourceInstallation extends IBasePerTenantAndOrganizationEntityModel {
  pluginName: PluginName
  componentType: PluginComponentType
  componentKey: string
  workspaceId: string
  xpertId?: string | null
  agentKey?: string | null
  runtimeType: PluginResourceRuntimeType
  runtimeId?: string | null
  runtimeNodeKey?: string | null
  definitionHash: string
  status: PluginResourceInstallationStatus
  config?: JSONValue | null
  enabled: boolean
}

export interface IPluginResourceInstallResult {
  installations: IPluginResourceInstallation[]
  pendingAuth: IPluginResourceInstallation[]
  xpert?: IXpert
}

export interface PluginResourceInstallWorkspaceInput {
  workspaceId: string
  components?: PluginResourceComponentSelector[]
}

export interface PluginResourceInstallXpertInput {
  xpertId: string
  components?: PluginResourceComponentSelector[]
  agentKey?: string
}

export interface XpertTemplateInstallInput {
  workspaceId: string
  basic?: {
    name?: string
    title?: string
    description?: string
    avatar?: JSONValue | null
    copilotModel?: JSONValue | null
  }
}
