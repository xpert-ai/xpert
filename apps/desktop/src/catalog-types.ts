import type { Bot } from './types'
import type { ModelOption } from './catalog/model-options'
import type {
  PluginApplicationScope,
  PluginApplicationStatusSummary,
  PluginApplicationToolsetRequirement,
  PluginApplicationToolsetSelection
} from '@xpert-ai/contracts'

export type CatalogKind = 'experts' | 'applications' | 'plugins' | 'templates'
interface CatalogBase extends Bot {
  publisher: string
  categories: string[]
  tags: string[]
}
export interface ExpertItem extends CatalogBase {
  kind: 'experts'
  access: 'owned' | 'accessible' | 'approved' | 'requested' | 'not_requested' | 'rejected'
}
export interface ApplicationItem extends CatalogBase {
  kind: 'applications'
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
  toolsetRequirements: ApplicationToolsetRequirement[]
}
export type ApplicationToolsetRequirement = Omit<PluginApplicationToolsetRequirement, 'label'> & { label: string }
export type ApplicationToolsetSelection = PluginApplicationToolsetSelection
export interface ApplicationInput {
  pluginName: string
  appName: string
  installationScope?: PluginApplicationScope
}
export interface InitializeApplicationInput extends ApplicationInput {
  operationId: string
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
