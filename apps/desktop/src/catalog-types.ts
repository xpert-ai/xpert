import type { Bot } from './types'
import type { ModelOption } from './catalog/model-options'
import type {
  AnalyticsBinding,
  AnalyticsSourceSummary,
  PluginApplicationScope,
  PluginApplicationStatusSummary,
  PluginApplicationToolsetRequirement,
  PluginApplicationToolsetSelection
} from '@xpert-ai/contracts'

export type CatalogKind = 'experts' | 'applications' | 'plugins' | 'connectors' | 'skills' | 'templates'
interface CatalogBase extends Bot {
  imageRevision?: string
  publisher: string
  categories: string[]
  tags: string[]
}
export interface ExpertItem extends CatalogBase {
  kind: 'experts'
  hasCardAvatar?: boolean
  access: 'owned' | 'accessible' | 'approved' | 'requested' | 'not_requested' | 'rejected'
}
export interface ApplicationItem extends CatalogBase {
  kind: 'applications'
  hasCardImages?: boolean
  installationScopes?: PluginApplicationScope[]
  icon: { type: 'image' | 'emoji'; value: string } | null
  pluginName: string
  appName: string
  installationScope?: PluginApplicationScope
  status: PluginApplicationStatusSummary['status']
  botId: string | null
  initializationAccess: string
  summary: string
  composition?: { key: string; kind: string; role?: string; title: string }[]
  steps: string[]
  screenshots: string[]
}
export interface TemplateItem extends CatalogBase {
  kind: 'templates'
  source: string
  catalogAvatarId?: string
}
export type CatalogItem = ExpertItem | ApplicationItem | TemplateItem
export interface ApplicationSetup {
  application: ApplicationItem
  canInitialize: boolean
  reason: string
  requireEmbedding: boolean
  requireVision: boolean
  embeddingLabel: string
  visionLabel: string
  embeddingModels: ModelOption[]
  visionModels: ModelOption[]
  defaultEmbeddingModelId: string
  defaultVisionModelId: string
  canConfigure: boolean
  canDiscardConfiguration: boolean
  organizationFields?: OrganizationSetupField[]
  toolsetRequirements: ApplicationToolsetRequirement[]
}
export type ApplicationToolsetRequirement = Omit<PluginApplicationToolsetRequirement, 'label'> & { label: string }
export type ApplicationToolsetSelection = PluginApplicationToolsetSelection
export interface ApplicationInput {
  pluginName: string
  appName: string
  installationScope?: PluginApplicationScope
}
export type OrganizationSetupField =
  | { kind: 'members'; key: string; label: string; optional: boolean }
  | { kind: 'analytics'; key: string; label: string; providerId: string; requiredNumericFields: string[] }

export interface OrganizationSettings {
  revision: number
  members: Record<string, string[]>
  queries: Record<string, AnalyticsBinding>
}
export type BootstrapSelection = {
  integrationId: string
  workspaceId: string
  dataSourceId: string
  mode: string
  userIds: string[]
  revision: number
}
export type BootstrapPlan = {
  state: 'create' | 'resume' | 'reuse' | 'conflict'
  modelLabel: string
  differences: string[]
  receipt: string
}
export type OrganizationModelStep =
  | { step: 'bootstrap-workspaces'; integrationId: string }
  | { step: 'bootstrap-sources'; integrationId: string; workspaceId: string }
  | ({ step: 'bootstrap-plan' } & BootstrapSelection)
  | ({ step: 'bootstrap-apply'; receipt: string } & BootstrapSelection)
  | { step: 'connections' }
  | { step: 'models'; integrationId: string }
  | { step: 'preview'; integrationId: string; modelId: string; revision: number }
  | { step: 'confirm'; integrationId: string; modelId: string; revision: number; receipt: string }

export type OrganizationModelChoice = { id: string; label: string }
export interface OrganizationModelPreview {
  receipt: string
  queries: Array<{
    key: string
    rowCount: number
    fields: Array<{ id: string; label: string }>
    sample: Array<Record<string, string | number | boolean | null>>
  }>
}
export type OrganizationModelResult =
  | { choices: OrganizationModelChoice[]; actorId?: string }
  | { plan: BootstrapPlan }
  | { model: OrganizationModelChoice }
  | OrganizationModelPreview
  | { queries: OrganizationSettings['queries'] }
export interface OrganizationSettingsForm {
  modelSetup?: { kind: 'connection-model'; bootstrap?: { version: string; modes: OrganizationModelChoice[] } }
  settings: OrganizationSettings
  users: Array<{ id: string; label: string }>
  sources: AnalyticsSourceSummary[]
}
export interface OrganizationSettingsTarget extends ApplicationInput {
  organizationId: string
  installationScope: 'organization'
}
export interface InitializeApplicationInput extends ApplicationInput {
  operationId: string
  organizationId?: string
  organizationSettings?: OrganizationSettings
  embeddingModelId?: string
  visionModelId?: string
  toolsets?: ApplicationToolsetSelection[]
}
export interface ApplicationToolsetInput extends ApplicationInput {
  key: string
}
export type ApplicationCredentialValue = string | number | boolean
export interface ApplicationCredentialField {
  name: string
  type: 'secret-input' | 'text-input' | 'select' | 'boolean' | 'int' | 'number'
  label: string
  help: string
  placeholder: string
  required: boolean
  hasValue: boolean
  value?: ApplicationCredentialValue
  options: { value: string; label: string }[]
}
export interface ApplicationToolsetSetup {
  name: string
  supported: boolean
  fields: ApplicationCredentialField[]
  tools: { name: string; label: string; enabled: boolean }[]
}
export interface SaveApplicationToolsetInput extends ApplicationToolsetInput {
  name: string
  credentials: Record<string, ApplicationCredentialValue>
  tools: string[]
}
export interface WorkspaceOption {
  id: string
  name: string
}

export type VoiceSelection = { modelId: string; voice: string }
export interface VoiceModelOption extends ModelOption {
  voices: { id: string; label: string }[]
  defaultVoice: string
}

export interface TemplatePreflight {
  readiness?: import('@xpert-ai/contracts').TemplateReadiness
  realtimeModels?: VoiceModelOption[]
  canInstall: boolean
  reason: string
  requiresModel: boolean
  optionalCapabilities: { key: string; label: string; description: string }[]
  models: (ModelOption & { copilotModel: { copilotId: string; model: string } })[]
  defaultModelId?: string
}

export interface SkillCatalogItem {
  id: string
  name: string
  description: string
  publisher: string
  installed: boolean | null
}
export interface DiscoveryWorkspace extends WorkspaceOption {
  canWrite: boolean
  canManage: boolean
}

export interface WorkspaceConnectorItem {
  provider: string
  name: string
  description: string
  icon: string | null
  status: 'pending' | 'active' | 'expired' | 'error' | 'disconnected'
  bindingId: string | null
  available: boolean
  keyMethods: {
    id: string
    label: string
    fields: { name: string; label: string; required: boolean; secret: boolean; initial: string }[]
  }[]
  hasWebMethods: boolean
}

export interface WorkspaceTarget {
  organizationId: string
  workspaceId: string
}
