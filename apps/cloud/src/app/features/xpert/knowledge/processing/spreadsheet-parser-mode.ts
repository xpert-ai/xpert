import {
  BUILTIN_KNOWLEDGE_PARSER,
  IKnowledgeDocument,
  KnowledgeParserSelection,
  knowledgeDocumentFileType
} from '@xpert-ai/contracts'

export function isRecordSpreadsheetFormat(format: string): boolean {
  return ['xls', 'xlsx', 'csv'].includes(knowledgeDocumentFileType({ type: format }))
}

function isDocumentParser(name: string | null | undefined): boolean {
  return !!name && name !== BUILTIN_KNOWLEDGE_PARSER && name !== 'default'
}

/** An explicit UI parser selection also chooses the spreadsheet output semantics. */
export function applySpreadsheetParserMode(
  document: Partial<IKnowledgeDocument>,
  config: IKnowledgeDocument['parserConfig'],
  selection: KnowledgeParserSelection | undefined
): IKnowledgeDocument['parserConfig'] {
  if (document.sourceConfig || !isRecordSpreadsheetFormat(knowledgeDocumentFileType(document)) || !selection) {
    return config
  }
  const interpretation = isDocumentParser(selection.transformerType)
    ? 'form_document'
    : isDocumentParser(document.parserConfig?.transformerType)
      ? 'records'
      : (config.spreadsheet?.interpretation ?? 'records')
  return {
    ...config,
    spreadsheet: {
      ...config.spreadsheet,
      interpretation,
      ...(config.spreadsheet?.contextUnit
        ? {
            contextUnit:
              interpretation === 'records'
                ? 'row'
                : config.spreadsheet.contextUnit === 'row'
                  ? 'workbook'
                  : config.spreadsheet.contextUnit
          }
        : {})
    }
  }
}
