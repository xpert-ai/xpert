import {
  IKnowledgeDocument,
  KnowledgebaseParserConfig,
  knowledgebaseDocumentParserDefaults,
  TCopilotModel
} from '@xpert-ai/contracts'
import { cloneDeep } from 'lodash-es'
import { documentFileType } from '../../../processing/document-file-types'

export function documentProcessingDraft(
  document: Partial<IKnowledgeDocument>,
  defaults?: KnowledgebaseParserConfig
): Partial<KnowledgebaseParserConfig> {
  const inherited = knowledgebaseDocumentParserDefaults(defaults, documentFileType(document))
  const explicit = document.parserConfig ?? {}
  const config = { ...inherited, ...explicit }
  for (const key of ['textSplitter', 'transformer', 'imageUnderstanding'] as const) {
    const typeKey = `${key}Type` as const
    config[key] =
      explicit[typeKey] && explicit[typeKey] !== inherited[typeKey]
        ? explicit[key]
        : { ...inherited[key], ...explicit[key] }
  }
  if (explicit.separators === undefined && explicit.textSplitter?.separators !== undefined) {
    delete config.separators
    delete config.delimiter
  }
  return cloneDeep({
    ...config,
    pdfParser:
      documentFileType(document) === 'pdf' && config.transformerType
        ? {
            transformerType: config.transformerType,
            transformer: config.transformer,
            transformerIntegration: config.transformerIntegration
          }
        : defaults?.pdfParser
  })
}

export function editedDocumentParserConfig(
  document: Partial<IKnowledgeDocument>,
  draft: KnowledgebaseParserConfig,
  defaults?: KnowledgebaseParserConfig,
  visionModel?: TCopilotModel
): IKnowledgeDocument['parserConfig'] {
  const config = {
    ...document.parserConfig,
    ...knowledgebaseDocumentParserDefaults(draft),
    ...(visionModel ? { imageUnderstandingModel: visionModel } : {})
  }
  if (documentFileType(document) === 'pdf') {
    const parser = draft.pdfParser ?? defaults?.pdfParser
    // Nulls clear old JSON-column overrides when returning to the default PDF parser.
    config.transformerType = parser?.transformerType ?? null
    config.transformer = parser?.transformer ?? null
    config.transformerIntegration = parser?.transformerIntegration ?? null
  }
  return cloneDeep(config)
}
