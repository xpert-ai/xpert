import type { AssistantCapabilityDeclaration } from './assistant-capability.model'
import type { TemplateManifest, TemplateReadiness } from './template-manifest.model'
import { IBasePerTenantEntityModel } from '../base-entity.model'
import { IconDefinition, TAvatar } from '../types'
import { ModelSelectionMetadata, TCopilotModel } from './copilot-model.model'
import { ModelFeature } from './ai-model.model'
import { MCPServerType, TMCPServer } from './xpert-tool-mcp.model'
import { XpertTypeEnum } from './xpert.model'
import type { TPromptWorkflow } from './prompt-workflow.model'
import { PluginTargetApp, PluginTargetAppMeta, PluginTemplateApplicationSummary } from '../plugin'

export interface IXpertTemplate extends IBasePerTenantEntityModel {
  key: string
  name?: string
  visitCount: number
  lastVisitedAt?: Date
}

export type TemplateSkillSyncMode = 'incremental' | 'full'

export type TemplateSkillSyncStatus = 'created' | 'updated' | 'unchanged' | 'missing' | 'failed'

export interface ITemplateSkillSyncItemSummary {
  created: number
  updated: number
  unchanged: number
  missing: number
  failed: number
}

export interface ITemplateSkillSyncRepositoryResult {
  name: string
  provider: string
  repositoryId?: string
  status: TemplateSkillSyncStatus
  message?: string
}

export interface ITemplateSkillSyncIndexResult {
  repositoryId?: string
  repositoryName: string
  provider: string
  mode: TemplateSkillSyncMode
  status: TemplateSkillSyncStatus
  syncedCount?: number
  message?: string
}

export interface ITemplateSkillSyncBundleResult {
  sharedSkillId: string
  provider: string
  repositoryName: string
  skillId: string
  status: TemplateSkillSyncStatus
  hash?: string
  repositoryId?: string
  indexId?: string
  message?: string
}

export interface ITemplateSkillSyncRefResult {
  provider: string
  repositoryName: string
  skillId: string
  status: TemplateSkillSyncStatus
  repositoryId?: string
  indexId?: string
  message?: string
}

export interface ITemplateSkillSyncSummary {
  repositories: ITemplateSkillSyncItemSummary
  indexes: ITemplateSkillSyncItemSummary
  bundles: ITemplateSkillSyncItemSummary
  featuredRefs: ITemplateSkillSyncItemSummary
  workspaceDefaults: ITemplateSkillSyncItemSummary
}

export interface ITemplateSkillSyncResult {
  mode: TemplateSkillSyncMode
  validateOnly: boolean
  fingerprint: string
  repositories: ITemplateSkillSyncRepositoryResult[]
  indexes: ITemplateSkillSyncIndexResult[]
  bundles: ITemplateSkillSyncBundleResult[]
  featuredRefs: ITemplateSkillSyncRefResult[]
  workspaceDefaults: ITemplateSkillSyncRefResult[]
  summary: ITemplateSkillSyncSummary
}

export type TTemplate = {
  id: string
  key?: string
  name: string
  title: string
  description: string
  category: string
  copyright: string
  privacyPolicy?: string
  export_data: string
  targetApps?: PluginTargetApp[]
  targetAppMeta?: PluginTargetAppMeta | null
  source?: 'builtin' | 'plugin' | string
  pluginName?: string
  pluginDisplayName?: string
  order?: number
  default?: boolean
  startPrompts?: string[]
  promptWorkflows?: TPromptWorkflow[]
  releaseNotes?: string
  availableLocales?: string[]
  defaultLocale?: string
  locale?: string
  pluginVersion?: string
  contentHash?: string
  xpertName?: string
  manifest?: TemplateManifest
  dependencies?: import('./assistant-template-dependencies.model').AssistantTemplateDependencies
  /** Explicit capability requirements/options, implemented by registered providers. */
  capabilities?: AssistantCapabilityDeclaration[]
  /** Capabilities composed into this resolved template variant. */
  enabledCapabilities?: string[]
  /** Require an explicitly selected, authorized LLM even without capability constraints. */
  requiresModelSelection?: boolean
  /** Trusted plugin App explicitly linked to this Assistant template. */
  application?: PluginTemplateApplicationSummary
}

export type TXpertTemplate = TTemplate & {
  avatar: TAvatar
  // icon: IconDefinition | string
  type: XpertTypeEnum | 'project'
  copilotModel?: Partial<TCopilotModel>
}

export type TXpertTemplateSummary = Omit<TXpertTemplate, 'export_data' | 'manifest'> & {
  /** Catalog membership discriminator; full application configuration is detail-only. */
  hasApplication?: boolean
}

/** Opt-in capabilities offered by the serving distribution for a template. */
export type XpertTemplateCapability = string

export type { AssistantCapabilityDeclaration } from './assistant-capability.model'

/** Public model metadata for capability setup; never includes provider credentials or model configuration. */
export interface XpertTemplateModelOption extends ModelSelectionMetadata {
  /** Opaque selection key; clients must submit it unchanged rather than reconstructing it. */
  id: string
  label: string
  /** Model reference for installation; setup responses only project copilotId, model and modelType. */
  copilotModel: TCopilotModel
}

export interface XpertTemplateSetup {
  readiness?: TemplateReadiness
  /** ID of a compatible organization default in `models`; absent if none qualifies. */
  defaultModelId?: string
  realtimeModels?: import('./realtime-voice.model').RealtimeModelOption[]
  requiresModel?: boolean
  optionalCapabilities: {
    key: XpertTemplateCapability
    label: string
    description: string
    /** Safe to add through a creation switch without an additional configuration form. */
    supportsQuickCreation?: boolean
  }[]
  requiredModelFeatures: ModelFeature[]
  models: XpertTemplateModelOption[]
  canInstall: boolean
  reason?: string
}

export interface TXpertTemplateCatalogQuery {
  assistantsOnly?: boolean
  search?: string
  category?: string
  pluginName?: string
  offset?: number
  limit?: number
}

export interface TXpertTemplateCatalogPage {
  items: TXpertTemplateSummary[]
  total: number
  offset: number
  limit: number
  categories: string[]
}

export interface IXpertMCPTemplate extends TTemplate {
  /**
   * string is the backward compatible image file URL format
   */
  icon: IconDefinition | string
  type: MCPServerType
  author: string
  transport: MCPServerType
  explore: string
  tags?: string[]
  visitCount?: number
  server: TMCPServer
  options?: any
}

export type TKnowledgePipelineTemplate = TTemplate & {
  icon: IconDefinition
  author: string
  explore: string
  tags?: string[]
  visitCount?: number
}
