import type { Bot } from './types'

export type CatalogKind = 'experts' | 'applications' | 'templates'
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
  pluginName: string
  appName: string
  status: 'ready' | 'not_installed' | 'initializing' | 'degraded' | 'failed'
  botId: string | null
  initializationAccess: string
  summary: string
  steps: string[]
}
export interface TemplateItem extends CatalogBase {
  kind: 'templates'
  source: string
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
  embeddingModels: { id: string; label: string }[]
  visionModels: { id: string; label: string }[]
  defaultEmbeddingModelId: string
  defaultVisionModelId: string
}
export interface ApplicationInput {
  pluginName: string
  appName: string
}
export interface InitializeApplicationInput extends ApplicationInput {
  operationId: string
  embeddingModelId?: string
  visionModelId?: string
}
export interface WorkspaceOption {
  id: string
  name: string
}
