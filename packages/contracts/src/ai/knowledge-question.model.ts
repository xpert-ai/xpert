import type { TCopilotModel } from './copilot-model.model'

/** Optional Doc2Query enrichment. Questions are retrieval projections of a source chunk. */
export interface KnowledgeQuestionGenerationConfig {
  enabled: boolean
  model?: TCopilotModel
  questionCount?: number
  customInstructions?: string
}

export interface KnowledgeGeneratedQuestion {
  id: string
  question: string
  /** Physical projection ids, including an embedding rebuild awaiting promotion. */
  vectorIds?: string[]
}

export interface KnowledgeChunkQuestions {
  status: 'generating' | 'ready' | 'failed'
  generationId: string
  inputHash: string
  sourceHash: string
  updatedAt: string
  questions: KnowledgeGeneratedQuestion[]
  vectorIds: string[]
  error?: string
  /** The model found no meaningful source-grounded search questions. */
  emptyReason?: 'insufficient_content'
}
