/** Shared fallback for ordinary documents without an explicitly configured strategy. */
export const DEFAULT_KNOWLEDGE_TEXT_SPLITTER = 'auto'

/** Shared revision for structured execution diagnostics and cache invalidation. */
export const KNOWLEDGE_CHUNKING_ALGORITHM_VERSION = 4
export type KnowledgeChunkingAlgorithmVersion = 1 | 2 | 3 | typeof KNOWLEDGE_CHUNKING_ALGORITHM_VERSION

/** Built-in strategies that auto routing may select. External providers remain manually selectable. */
export type KnowledgeChunkingStrategy = 'recursive-character' | 'markdown-recursive' | 'structure-aware'
export type KnowledgeChunkingRequest = KnowledgeChunkingStrategy | 'auto'
export type KnowledgeChunkBlockType = 'heading' | 'paragraph' | 'table' | 'list' | 'code' | 'formula' | 'other'
export type KnowledgeChunkingReason =
  | 'structured-blocks'
  | 'markdown-headings'
  | 'layout-headings'
  | 'plain-text'
  | 'missing-structure'
  | 'explicit-structure'
export type KnowledgeChunkingWarning =
  | 'structure-split'
  | 'context-reduced'
  | 'coarse-provenance'
  | 'unsupported-structure'
  | 'missing-format'

/** Offsets are UTF-16 positions in the pre-split source fragment, never in an added heading prefix. */
export interface KnowledgeChunkSourceRange {
  sourceIndex: number
  startOffset: number
  endOffset: number
}

export interface KnowledgeChunkingDecision {
  inputHash: string
  sourceIndexes: number[]
  requestedStrategy: KnowledgeChunkingRequest
  resolvedStrategy: KnowledgeChunkingStrategy
  reason: KnowledgeChunkingReason
  algorithmVersion: KnowledgeChunkingAlgorithmVersion
  blockCounts: Partial<Record<KnowledgeChunkBlockType, number>>
  warnings: KnowledgeChunkingWarning[]
}

export interface KnowledgeChunkingMetadata {
  inputHash: string
  requestedStrategy: KnowledgeChunkingRequest
  resolvedStrategy: KnowledgeChunkingStrategy
  reason: KnowledgeChunkingReason
  algorithmVersion: KnowledgeChunkingAlgorithmVersion
  headingPath: string[]
  sourceRanges: KnowledgeChunkSourceRange[]
  contextRanges?: KnowledgeChunkSourceRange[]
  warnings: KnowledgeChunkingWarning[]
  continued?: boolean
}

/** Common options accepted by the new built-in strategies; the token budget has a single execution owner. */
export interface KnowledgeStructuredChunkOptions {
  chunkSize?: number
  chunkOverlap?: number
  separators?: string | string[]
}

/** Language affects natural text boundaries, never strategy selection. */
export type KnowledgeChunkLanguage = 'Chinese' | 'English' | 'Mixed'
export type KnowledgeChunkLanguageHint = 'auto' | Exclude<KnowledgeChunkLanguage, 'Mixed'>

export interface KnowledgeChunkLanguageDetection {
  /** Absent when the bounded sample contains no identifiable natural text. */
  detectedLanguage?: KnowledgeChunkLanguage
  sampledCodeUnits: number
  naturalUnits: number
}

export interface KnowledgeChunkLanguageDecision extends KnowledgeChunkLanguageDetection {
  sourceIndexes: number[]
  languageHint: KnowledgeChunkLanguageHint
  resolvedLanguage: KnowledgeChunkLanguage
}
