import {
  IKnowledgeDocument,
  KnowledgebaseParserConfig,
  knowledgebaseDocumentParserDefaults,
  knowledgebaseParserSelection,
  TCopilotModel
} from '@xpert-ai/contracts'
import { cloneDeep } from 'lodash-es'
import { documentFileType } from '../../../processing/document-file-types'
import { applySpreadsheetParserMode } from '../../../processing/spreadsheet-parser-mode'

export function documentProcessingDraft(
  document: Partial<IKnowledgeDocument>,
  defaults?: KnowledgebaseParserConfig
): Partial<KnowledgebaseParserConfig> {
  const inherited = knowledgebaseDocumentParserDefaults(defaults, documentFileType(document))
  const explicit = document.parserConfig ?? {}
  const config = {
    ...inherited,
    ...explicit,
    spreadsheet: { ...inherited.spreadsheet, ...explicit.spreadsheet }
  }
  for (const key of ['textSplitter', 'transformer', 'imageUnderstanding'] as const) {
    const typeKey = `${key}Type` as const
    const integrationChanged =
      key === 'transformer' &&
      !!explicit.transformerIntegration &&
      explicit.transformerIntegration !== inherited.transformerIntegration
    config[key] =
      (explicit[typeKey] && explicit[typeKey] !== inherited[typeKey]) || integrationChanged
        ? explicit[key]
        : { ...inherited[key], ...explicit[key] }
  }
  if (explicit.separators === undefined && explicit.textSplitter?.separators !== undefined) {
    delete config.separators
    delete config.delimiter
  }
  config.transformerType = explicit.transformerType || inherited.transformerType
  if (!explicit.transformerType) {
    config.transformer = inherited.transformer
    config.transformerIntegration = inherited.transformerIntegration
  } else if (explicit.transformerType !== inherited.transformerType) {
    config.transformerIntegration = explicit.transformerIntegration
  } else {
    config.transformerIntegration = explicit.transformerIntegration ?? inherited.transformerIntegration
  }
  return cloneDeep({
    ...config,
    parsers: {
      ...defaults?.parsers,
      [documentFileType(document)]: config.transformerType
        ? {
            transformerType: config.transformerType,
            transformer: config.transformer,
            transformerIntegration: config.transformerIntegration
          }
        : null
    },
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
  const type = documentFileType(document)
  const parser = knowledgebaseParserSelection(draft, type) ?? knowledgebaseParserSelection(defaults, type)
  // Nulls clear JSON-column overrides when restoring inherited settings.
  config.transformerType = parser?.transformerType ?? null
  config.transformer = parser?.transformer ?? null
  config.transformerIntegration = parser?.transformerIntegration ?? null
  return cloneDeep(applySpreadsheetParserMode(document, config, parser))
}
