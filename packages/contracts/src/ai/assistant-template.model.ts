import type { TXpertTeamDraft } from './xpert.model'
import type { AssistantTemplateDependencies } from './assistant-template-dependencies.model'
import type { AssistantTemplateManifest } from './assistant-template-manifest.model'

/** Portable metadata carried by both ordinary DSL exports and plugin distribution. */
export interface AssistantTemplateMetadata {
  schemaVersion: 2
  dependencies?: AssistantTemplateDependencies
  manifest?: AssistantTemplateManifest
}

export type AssistantTemplateDefinition = TXpertTeamDraft & {
  template?: AssistantTemplateMetadata
  memories?: { prefix: string; value: unknown }[]
}
