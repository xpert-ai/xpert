import type { ITag } from '../tag-entity.model'
import type { TCopilotModel } from './copilot-model.model'

export interface KnowledgeAutomaticTaggingConfig {
  enabled: boolean
  /** When absent, use the knowledgebase general LLM. */
  model?: TCopilotModel | null
  maxTags?: number
  confidenceThreshold?: number
  allowWithManualTags?: boolean
}

/** Existing organization/tenant tags selected for one knowledgebase. */
export interface KnowledgeTagCatalog {
  tags: ITag[]
  available: ITag[]
  canEdit: boolean
}

export interface IKnowledgeDocumentTag {
  tagId: string
  documentId: string
  source: 'manual' | 'automatic'
  confidence?: number | null
  tag: ITag
}

export const KNOWLEDGE_AUTOMATIC_TAG_CANDIDATES = 50
export const KNOWLEDGE_AUTOMATIC_TAG_MAXIMUM = 10
export const KNOWLEDGE_AUTOMATIC_TAG_TEXT_BUDGET = 12000
