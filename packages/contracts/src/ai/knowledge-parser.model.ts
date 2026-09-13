import type { DocumentTextParserConfig, DocumentSheetParserConfig } from './knowledge-doc.model'
import type { KnowledgebaseParserConfig } from './knowledgebase.model'
import type { IKnowledgeDocumentChunk, IDocChunkMetadata } from './knowledge-doc-chunk.model'
import type { KnowledgeChunkingDecision, KnowledgeChunkLanguageDecision } from './knowledge-chunking.model'

export interface KnowledgeChunkPreviewInput {
  text: string
  type: 'txt' | 'md'
  parserConfig: KnowledgebaseParserConfig
}

export interface KnowledgeChunkPreviewResult {
  chunks: IKnowledgeDocumentChunk<IDocChunkMetadata>[]
  decisions?: KnowledgeChunkingDecision[]
  languages?: KnowledgeChunkLanguageDecision[]
}

/** Only copy configured defaults; do not turn built-in defaults into document overrides. */
export function knowledgebaseDocumentParserDefaults(
  config?: KnowledgebaseParserConfig | null,
  documentType?: string
): DocumentTextParserConfig & Partial<DocumentSheetParserConfig> {
  if (!config) return {}
  return {
    ...(config.spreadsheet ? { spreadsheet: { ...config.spreadsheet } } : {}),
    ...(config.tableMetadataRequirements !== undefined
      ? { tableMetadataRequirements: config.tableMetadataRequirements }
      : {}),
    ...(config.questionGeneration ? { questionGeneration: { ...config.questionGeneration } } : {}),
    ...(config.chunkLanguageHint !== undefined ? { chunkLanguageHint: config.chunkLanguageHint } : {}),
    ...(config.maxChunkTokens !== undefined ? { maxChunkTokens: config.maxChunkTokens } : {}),
    ...(config.chunkSize != null ? { chunkSize: config.chunkSize } : {}),
    ...(config.chunkOverlap != null ? { chunkOverlap: config.chunkOverlap } : {}),
    ...(config.delimiter != null ? { delimiter: config.delimiter } : {}),
    ...(config.textSplitterType ? { textSplitterType: config.textSplitterType } : {}),
    ...(config.textSplitter || config.chunkSize != null || config.chunkOverlap != null
      ? {
          textSplitter: {
            ...(config.chunkSize != null ? { chunkSize: config.chunkSize } : {}),
            ...(config.chunkOverlap != null ? { chunkOverlap: config.chunkOverlap } : {}),
            ...config.textSplitter
          }
        }
      : {}),
    ...(config.separators ? { separators: [...config.separators] } : {}),
    ...(config.imageUnderstandingEnabled !== undefined
      ? { imageUnderstandingEnabled: config.imageUnderstandingEnabled }
      : {}),
    ...(config.imageUnderstandingType ? { imageUnderstandingType: config.imageUnderstandingType } : {}),
    ...(config.imageUnderstanding ? { imageUnderstanding: { ...config.imageUnderstanding } } : {}),
    ...(documentType?.replace(/^\./, '').toLowerCase() === 'pdf' ? config.pdfParser : {})
  }
}

/** Arrays are the canonical ordered format; retain the plugin's legacy comma syntax. */
export function decodeKnowledgeSeparators(value?: string | string[]): string[] {
  const items = Array.isArray(value)
    ? value
    : value
      ? value
          .replace(/,,/g, '\0')
          .split(',')
          .map((item) => item.replace(/\0/g, ','))
      : ['\n\n', '\n', ' ', '']
  return items.map((item) =>
    item.replace(/\\(n|r|t|\\)/g, (_, escape: string) => {
      switch (escape) {
        case 'n':
          return '\n'
        case 'r':
          return '\r'
        case 't':
          return '\t'
        default:
          return '\\'
      }
    })
  )
}
