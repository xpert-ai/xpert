import { KBDocumentCategoryEnum, type IKnowledgeDocument } from './knowledge-doc.model'
import type { IDocChunkMetadata, IKnowledgeDocumentChunk } from './knowledge-doc-chunk.model'

/** Parser-owned identities and coordinates; generated descriptions never redefine these fields. */
export interface KnowledgeTableColumn {
  columnId: string
  key: string
  label: string
  column: number
  /** Certified from all nonempty source cells by the parser, never inferred by the model. */
  valueType?: 'boolean'
}

export interface KnowledgeTableDefinition {
  tableId: string
  sheetName: string
  range: string
  headerRow?: number
  rowCount: number
  columns: KnowledgeTableColumn[]
}

export interface KnowledgeTableSource extends KnowledgeTableDefinition {
  /** Bounded parser samples. Keys are columnId values, not generated labels. */
  samples: Array<{ rowNumber: number; values: { [columnId: string]: string | number | boolean | null } }>
}

export interface KnowledgeTableColumnDescription extends KnowledgeTableColumn {
  description: string
  unit?: string
  valueMeanings?: string
}

export interface KnowledgeTableResult extends Omit<KnowledgeTableDefinition, 'columns'> {
  summary: string
  columns: KnowledgeTableColumnDescription[]
}

export interface KnowledgeTableMetadata {
  schemaVersion: 1
  status: 'generating' | 'generated' | 'ready' | 'failed' | 'skipped'
  reason?: 'missing_model' | 'no_data' | 'unsupported'
  inputHash: string
  /** Full parsed source fingerprint, independent of the bounded model samples. */
  sourceFingerprint?: string
  /** Successful column batches can be resumed independently of the displayed structure. */
  completedColumns?: { [tableId: string]: string[] }
  /** Model-selected ISO 639 language, reused across batches and retries. */
  language?: string
  generationId: string
  resultHash?: string
  appliedResultHash?: string
  updatedAt: string
  error?: string
  tables: KnowledgeTableResult[]
}

/** Compact retrieval-only view of the published generation. Source row content stays unchanged. */
export interface KnowledgeTableContext {
  tableId: string
  resultHash: string
  sheetName: string
  summary: string
  columns: Array<Pick<KnowledgeTableColumnDescription, 'columnId' | 'key' | 'description' | 'unit' | 'valueMeanings'>>
}

export interface KnowledgeTablePreview {
  tables: KnowledgeTableDefinition[]
  chunks: IKnowledgeDocumentChunk<IDocChunkMetadata>[]
}

export function isNativeKnowledgeTableDocument(
  document: Pick<Partial<IKnowledgeDocument>, 'category' | 'type' | 'parserConfig' | 'sourceConfig'>
): boolean {
  const type = document.type?.replace(/^\./, '').toLowerCase()
  return (
    document.category === KBDocumentCategoryEnum.Sheet &&
    ['csv', 'xls', 'xlsx', 'vnd.ms-excel', 'vnd.openxmlformats-officedocument.spreadsheetml.sheet'].includes(
      type ?? ''
    ) &&
    !document.sourceConfig &&
    document.parserConfig?.spreadsheet?.interpretation !== 'form_document' &&
    (!document.parserConfig?.transformerType || document.parserConfig.transformerType === 'default')
  )
}

/** Parse persisted JSON at the read boundary before using the shared result contract. */
export function isKnowledgeTableMetadata(value: unknown): value is KnowledgeTableMetadata {
  return (
    !!value &&
    typeof value === 'object' &&
    'schemaVersion' in value &&
    value.schemaVersion === 1 &&
    'status' in value &&
    typeof value.status === 'string' &&
    ['generating', 'generated', 'ready', 'failed', 'skipped'].includes(value.status) &&
    'inputHash' in value &&
    typeof value.inputHash === 'string' &&
    (!('sourceFingerprint' in value) ||
      value.sourceFingerprint === undefined ||
      typeof value.sourceFingerprint === 'string') &&
    (!('language' in value) ||
      value.language === undefined ||
      (typeof value.language === 'string' && /^[a-z]{2,3}$/.test(value.language))) &&
    'generationId' in value &&
    typeof value.generationId === 'string' &&
    'updatedAt' in value &&
    typeof value.updatedAt === 'string' &&
    (!('resultHash' in value) || value.resultHash === undefined || typeof value.resultHash === 'string') &&
    (!('appliedResultHash' in value) ||
      value.appliedResultHash === undefined ||
      typeof value.appliedResultHash === 'string') &&
    (!('error' in value) || value.error === undefined || typeof value.error === 'string') &&
    (!('completedColumns' in value) ||
      value.completedColumns === undefined ||
      (!!value.completedColumns &&
        typeof value.completedColumns === 'object' &&
        !Array.isArray(value.completedColumns) &&
        Object.values(value.completedColumns).every(
          (columns) => Array.isArray(columns) && columns.every((column) => typeof column === 'string')
        ))) &&
    (!('reason' in value) ||
      value.reason === undefined ||
      value.reason === 'missing_model' ||
      value.reason === 'no_data' ||
      value.reason === 'unsupported') &&
    'tables' in value &&
    Array.isArray(value.tables) &&
    value.tables.every(isKnowledgeTableResult)
  )
}

function isKnowledgeTableResult(value: unknown): value is KnowledgeTableResult {
  return (
    !!value &&
    typeof value === 'object' &&
    'tableId' in value &&
    typeof value.tableId === 'string' &&
    'sheetName' in value &&
    typeof value.sheetName === 'string' &&
    'range' in value &&
    typeof value.range === 'string' &&
    'rowCount' in value &&
    typeof value.rowCount === 'number' &&
    Number.isSafeInteger(value.rowCount) &&
    value.rowCount >= 0 &&
    (!('headerRow' in value) ||
      value.headerRow === undefined ||
      (typeof value.headerRow === 'number' && Number.isSafeInteger(value.headerRow))) &&
    'summary' in value &&
    typeof value.summary === 'string' &&
    'columns' in value &&
    Array.isArray(value.columns) &&
    value.columns.every(isKnowledgeTableColumnDescription)
  )
}

function isKnowledgeTableColumnDescription(value: unknown): value is KnowledgeTableColumnDescription {
  return (
    !!value &&
    typeof value === 'object' &&
    (!('valueType' in value) || value.valueType === undefined || value.valueType === 'boolean') &&
    'columnId' in value &&
    typeof value.columnId === 'string' &&
    'key' in value &&
    typeof value.key === 'string' &&
    'label' in value &&
    typeof value.label === 'string' &&
    'column' in value &&
    typeof value.column === 'number' &&
    Number.isSafeInteger(value.column) &&
    value.column > 0 &&
    'description' in value &&
    typeof value.description === 'string' &&
    (!('unit' in value) || value.unit === undefined || typeof value.unit === 'string') &&
    (!('valueMeanings' in value) || value.valueMeanings === undefined || typeof value.valueMeanings === 'string')
  )
}
