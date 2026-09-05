import type { IDocChunkMetadata } from './knowledge-doc-chunk.model'

export const KNOWLEDGE_FAQ_STANDARD_QUESTION_MAX_LENGTH = 500
export const KNOWLEDGE_FAQ_SIMILAR_QUESTION_MAX_COUNT = 10
export const KNOWLEDGE_FAQ_SIMILAR_QUESTION_MAX_LENGTH = 500
export const KNOWLEDGE_FAQ_NEGATIVE_QUESTION_MAX_COUNT = 10
export const KNOWLEDGE_FAQ_NEGATIVE_QUESTION_MAX_LENGTH = 500
export const KNOWLEDGE_FAQ_ANSWER_BLOCK_MAX_COUNT = 5
export const KNOWLEDGE_FAQ_ANSWER_TOTAL_MAX_LENGTH = 10_000
export const KNOWLEDGE_FAQ_MAX_LOGICAL_VECTOR_COUNT =
  1 + KNOWLEDGE_FAQ_SIMILAR_QUESTION_MAX_COUNT + KNOWLEDGE_FAQ_ANSWER_BLOCK_MAX_COUNT

export type KnowledgeFAQWriteInput = {
  standardQuestion: string
  similarQuestions?: string[]
  negativeQuestions?: string[]
  answerBlocks: string[]
  enabled?: boolean
}

export type KnowledgeFAQUpdateInput = KnowledgeFAQWriteInput & {
  version: number
}

export type KnowledgeFAQListParams = {
  search?: string
  enabled?: boolean
  skip?: number
  take?: number
}

export type KnowledgeFAQExportFormat = 'csv' | 'json'

export type KnowledgeFAQImportMode = 'append' | 'replace'

export type KnowledgeFAQImportPreviewItem = {
  row: number
  standardQuestion: string
}

export type KnowledgeFAQImportPreview = {
  total: number
  items: KnowledgeFAQImportPreviewItem[]
  truncated: boolean
}

export type KnowledgeFAQImportFailure = {
  row: number
  standardQuestion?: string
  message: string
}

export type KnowledgeFAQImportResult = {
  total: number
  imported: number
  failed: KnowledgeFAQImportFailure[]
}

export interface IKnowledgeFAQEntry {
  id: string
  knowledgebaseId: string
  standardQuestion: string
  similarQuestions: string[]
  negativeQuestions: string[]
  answerBlocks: string[]
  enabled: boolean
  version: number
  createdAt?: Date
  updatedAt?: Date
}

export type KnowledgeFAQVectorKey = 'combined' | `question:${number}` | `answer:${number}`

export interface IKnowledgeFAQChunkMetadata extends IDocChunkMetadata {
  contentKind: 'faq'
  standardQuestion: string
  similarQuestions: string[]
  negativeQuestions?: string[]
  answerBlocks: string[]
  enabled: boolean
  faqVectorIds: string[]
  faqVectorId?: string
  faqVectorKey?: KnowledgeFAQVectorKey
  sourceChunkId?: string
  vectorSyncStatus?: 'pending' | 'ready' | 'failed'
}
