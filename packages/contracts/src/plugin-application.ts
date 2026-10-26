import type { AiModelTypeEnum } from './agent'
import type { ModelSelectionMetadata } from './ai/copilot-model.model'
import type { IBasePerTenantAndOrganizationEntityModel } from './base-entity.model'
import type { PluginMarketplaceCategory } from './plugin'
import type { IconDefinition, I18nObject } from './types'

/** Stable placement scopes declared by plugin application contributions. */
export const PLUGIN_APPLICATION_SCOPE = {
  TENANT: 'tenant',
  ORGANIZATION: 'organization',
  PERSONAL: 'personal'
} as const

/**
 * Lifecycle states persisted for a governed plugin application installation.
 * `degraded` means the installation record exists but one or more managed
 * resources failed the host health check.
 */
export const PLUGIN_APPLICATION_INSTALLATION_STATUS = {
  CONFIGURING: 'configuring',
  INITIALIZING: 'initializing',
  READY: 'ready',
  FAILED: 'failed',
  DEGRADED: 'degraded'
} as const

/**
 * Scope declared by a trusted plugin application contribution.
 *
 * Organization and personal installations remain inside the current organization.
 * Tenant is reserved for discovery until a tenant initializer is implemented.
 */
export type PluginApplicationScope = (typeof PLUGIN_APPLICATION_SCOPE)[keyof typeof PLUGIN_APPLICATION_SCOPE]
export type PluginApplicationInstallationStatus =
  (typeof PLUGIN_APPLICATION_INSTALLATION_STATUS)[keyof typeof PLUGIN_APPLICATION_INSTALLATION_STATUS]

/** Product capability rendered on a plugin application's marketplace detail page. */
export interface PluginMarketplaceAppFeature {
  key: string
  title: string | I18nObject
  description?: string | I18nObject
  icon?: IconDefinition
}

/**
 * Knowledge base resource that the host creates as part of an organization
 * application installation. The plugin declares intent; the host supplies all
 * tenant, organization, workspace, and actor scope.
 */
export interface PluginMarketplaceAppKnowledgebaseConfig {
  key: string
  name: string | I18nObject
  description?: string | I18nObject
  /** Personal installations always create private knowledge bases. */
  permission: 'organization' | 'private'
  applicationTags?: string[]
  graphRag?: { enabled: boolean }
}

/** Model capabilities required before the host may initialize an application. */
export interface PluginMarketplaceAppModelRequirements {
  primary?: boolean
  embedding?: boolean
  vision?: boolean
  speechToText?: boolean
  embeddingLabel?: string | I18nObject
  visionLabel?: string | I18nObject
}

export interface PluginMarketplaceAppAssistantDefinition {
  key: string
  templateKey: string
  primaryAgentKey: string
  title?: string | I18nObject
  /** Role keys this Assistant may delegate to; omitted means no role delegation. */
  externalRoleKeys?: string[]
}

/** Portable independent Assistant topology owned by a trusted App. Instance IDs are host-managed. */
export interface PluginMarketplaceAppAssistantSuite {
  version: string
  coordinatorAgentKey: string
  /** Direct coordinator dependencies. Omitted preserves the legacy all-roles topology. */
  coordinatorRoleKeys?: string[]
  /** Published roles, with explicit nested delegation through externalRoleKeys. */
  roles: PluginMarketplaceAppAssistantDefinition[]
  /** Published in the same workspace without granting coordinator delegation. */
  standaloneAssistants?: PluginMarketplaceAppAssistantDefinition[]
}

/**
 * Declarative, host-owned initialization contract for a trusted plugin App.
 * The host only executes this contract from a loaded plugin contribution.
 */
export interface PluginMarketplaceAppConfig {
  /** A single scope or ordered choices. The first choice is the backward-compatible default. */
  scope: PluginApplicationScope | PluginApplicationScope[]
  assistantTemplateKey: string
  assistantSuite?: PluginMarketplaceAppAssistantSuite
  workspace: {
    mode: 'dedicated'
    name: string | I18nObject
    description?: string | I18nObject
    /** New app workspaces are private. Legacy 'organization' is accepted but does not grant sharing. */
    sharing?: 'private' | 'organization'
  }
  knowledgebases?: PluginMarketplaceAppKnowledgebaseConfig[]
  modelRequirements?: PluginMarketplaceAppModelRequirements
  presentation?: {
    tagline?: string | I18nObject
    longDescription?: string | I18nObject
    developer?: string
    screenshots?: string[]
    features?: PluginMarketplaceAppFeature[]
    useCases?: Array<string | I18nObject>
    dataScope?: string | I18nObject
    initializationSummary?: string | I18nObject
    initializationSteps?: Array<string | I18nObject>
  }
  entry?: {
    type: 'assistant-chat'
  }
}

/**
 * Trusted application metadata attached to an Assistant template after the
 * host resolves an explicit `assistantTemplateKey` link from a loaded plugin.
 */
export interface PluginTemplateApplicationSummary {
  id: string
  pluginName: string
  appName: string
  displayName: string | I18nObject
  description?: string | I18nObject
  icon?: IconDefinition
  color?: string
  scope: PluginApplicationScope
  assistantTemplateKey: string
  config: PluginMarketplaceAppConfig
}

/**
 * Persisted control-plane record for one plugin application in one declared
 * scope. Managed resource identifiers are retained so health checks and
 * retries never need to rediscover resources by display name.
 */
export interface IPluginApplicationInstallation extends IBasePerTenantAndOrganizationEntityModel {
  pluginName: string
  appName: string
  /** Actual scope selected for this installation, independent of the App declaration. */
  declaredScope: PluginApplicationScope
  ownerUserId?: string | null
  scopeKey: string
  status: PluginApplicationInstallationStatus
  pluginVersion?: string | null
  templateId?: string | null
  templateVersion?: string | null
  operationId?: string | null
  workspaceId?: string | null
  xpertId?: string | null
  knowledgebaseIds?: string[] | null
  resourceRefs?: Record<string, string> | null
  errorCode?: string | null
  errorMessage?: string | null
}

/** Host-authorized model choice returned by application initialization preflight. */
export interface PluginApplicationModelOption extends ModelSelectionMetadata {
  id: string
  copilotId: string
  model: string
  label: string | I18nObject
  modelType: AiModelTypeEnum
}

/** Authorized source configuration. Credentials are never included in App preflight. */
export interface PluginApplicationToolsetOption {
  id: string
  name: string
  workspaceName?: string
}

/** A deduplicated builtin toolset dependency across the App's Assistant templates. */
export interface PluginApplicationToolsetRequirement {
  key: string
  pluginName: string
  provider: string
  instanceName?: string
  label: string | I18nObject
  providerAvailable: boolean
  options: PluginApplicationToolsetOption[]
  /** Existing managed configuration; omitted when the administrator must choose a source. */
  configuredToolsetId?: string
}

/** Selects a source configuration; the host owns the target Workspace and instance name. */
export interface PluginApplicationToolsetSelection {
  key: string
  toolsetId: string
}

/** Read model used by marketplace cards to render installation health and actions. */
export interface PluginApplicationStatusSummary {
  appId: string
  installationScope?: PluginApplicationScope
  status: PluginApplicationInstallationStatus | 'not_installed'
  initializationAccess?: 'allowed' | 'organization_required' | 'role_required' | 'unsupported'
  installationId?: string
  workspaceId?: string | null
  xpertId?: string | null
  assistantSlug?: string | null
  errorCode?: string | null
  errorMessage?: string | null
  /** Only an unactivated configuration can be explicitly discarded. */
  canDiscardConfiguration?: boolean
}

/** Marketplace metadata paired with a trusted plugin App contribution. */
export interface PluginApplicationCatalogMetadata {
  category?: PluginMarketplaceCategory
  subcategory?: string
  featured?: boolean
  tags: string[]
  updatedAt?: string
}

/** Card-sized App definition and scoped runtime status for marketplace discovery. */
export interface PluginApplicationCatalogItem {
  application: PluginTemplateApplicationSummary
  status: PluginApplicationStatusSummary
  marketplace: PluginApplicationCatalogMetadata
}

/**
 * Server-computed initialization readiness. Clients may select only model/toolset IDs
 * returned here and cannot provide tenant, organization, or workspace scope.
 */
export interface PluginApplicationPreflight {
  supported: boolean
  scope: PluginApplicationScope
  canInitialize: boolean
  reason?:
    | 'organization_scope_required'
    | 'role_required'
    | 'scope_not_supported'
    | 'primary_model_required'
    | 'embedding_model_required'
    | 'vision_model_required'
    | 'speech_to_text_model_required'
    | 'toolset_provider_required'
    | 'toolset_configuration_required'
  embeddingModels: PluginApplicationModelOption[]
  visionModels: PluginApplicationModelOption[]
  speechToTextModels?: PluginApplicationModelOption[]
  /** Organization Embedding-role default when it is present in embeddingModels. */
  defaultEmbeddingModelId?: string | null
  /** Organization Primary-role default when it is vision-capable and present in visionModels. */
  defaultVisionModelId?: string | null
  primaryModelAvailable: boolean
  modelRequirements: PluginMarketplaceAppModelRequirements
  toolsetRequirements?: PluginApplicationToolsetRequirement[]
}

/** Complete application detail assembled from trusted plugin metadata and scoped runtime state. */
export interface PluginApplicationCompositionItem {
  key: string
  kind: 'assistant' | 'workspace' | 'knowledgebase'
  role?: 'primary' | 'specialist' | 'standalone'
  templateKey?: string
  title: string | I18nObject
}

export interface PluginApplicationDetail {
  canUpdate?: boolean
  composition: PluginApplicationCompositionItem[]
  application: PluginTemplateApplicationSummary
  status: PluginApplicationStatusSummary
  preflight: PluginApplicationPreflight
}

/**
 * Clients select a declared installation scope; identity and target resource IDs
 * are derived exclusively from the authenticated request context.
 */
export interface PluginApplicationInitializeInput {
  installationScope?: PluginApplicationScope
  pluginName: string
  appName: string
  embeddingModelId?: string
  visionModelId?: string
  speechToTextModelId?: string
  toolsets?: PluginApplicationToolsetSelection[]
  operationId: string
}

/** Prepares or discards configuration in the current request scope; never accepts a Workspace ID. */
export interface PluginApplicationSetupInput {
  installationScope?: PluginApplicationScope
  pluginName: string
  appName: string
}

/** Binds a configured instance already saved in the application's prepared Workspace. */
export interface PluginApplicationBindToolsetInput extends PluginApplicationSetupInput {
  key: string
  toolsetId: string
}

/** Validate portable metadata without inferring a scope from names or presentation text. */
export function getPluginApplicationScopes(value: unknown): PluginApplicationScope[] {
  const values = Array.isArray(value) ? value : [value]
  if (!values.length || !values.every(isPluginApplicationScope)) return []
  return [...new Set(values)]
}

export function isPluginApplicationScope(value: unknown): value is PluginApplicationScope {
  return value === 'organization' || value === 'personal' || value === 'tenant'
}

/** A scoped, durable release; clients never select resource IDs or template versions. */
export interface PluginApplicationUpdateInput extends PluginApplicationSetupInput {
  operationId: string
  resume?: boolean
}
export interface PluginApplicationUpdateProgress {
  operationId: string
  status: 'running' | 'failed' | 'completed'
  updatedAt: string
  errorCode: 'UPDATE_FAILED' | null
  completed: number
  total: number
  entries: Array<{ key: string; stage: 'pending' | 'preparing' | 'prepared' | 'binding' | 'publishing' | 'published' }>
}
