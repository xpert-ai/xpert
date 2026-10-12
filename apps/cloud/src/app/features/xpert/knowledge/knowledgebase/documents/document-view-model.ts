import { format } from 'date-fns/format'
import { IKnowledgeDocument, KBDocumentStatusEnum, KDocumentSourceType } from '../../../../../@core'
export const REFRESH_DEBOUNCE_TIME = 5000

export const SELECT_COLUMN_WIDTH = 48

export const ACTIONS_COLUMN_WIDTH = 88

export const DOCUMENT_INSPECTOR_DEFAULT_WIDTH = 440

export const DOCUMENT_INSPECTOR_MIN_WIDTH = 360

export const DOCUMENT_INSPECTOR_MAX_WIDTH = 720

export const DOCUMENT_COLUMNS_STORAGE_KEY = 'xpert.knowledge.documents.table.columns.v3'

export type DocumentTableColumnKey =
  | 'name'
  | 'tagAssignments'
  | 'type'
  | 'contents'
  | 'createdAtRelative'
  | 'disabled'
  | 'processMsg'
  | 'progress'

export type DocumentTableSortDirection = 'asc' | 'desc' | ''

export type DocumentStatusFilter = 'all' | 'errors' | 'processing'

export type DocumentProcessStage = 'transform' | 'split' | 'index'

export type DocumentProcessStageState = 'complete' | 'active' | 'error' | 'pending'

export const DOCUMENT_PROCESS_STAGES: DocumentProcessStage[] = ['transform', 'split', 'index']

export const DOCUMENT_PROCESS_STAGE_DEFAULT_LABELS: Record<DocumentProcessStageState, string> = {
  complete: 'Complete',
  active: 'Processing',
  error: 'Failed',
  pending: 'Pending'
}

export type ActiveDocumentTableSortState = DocumentTableSortState & {
  active: DocumentTableColumnKey
  direction: Exclude<DocumentTableSortDirection, ''>
}

export interface DocumentTableColumn {
  key: DocumentTableColumnKey
  labelKey: string
  defaultLabel: string
  width: number
  minWidth: number
  maxWidth?: number
  visible: boolean
  hideable: boolean
  sortable: boolean
  resizable: boolean
}

export interface DocumentTableSortState {
  active: DocumentTableColumnKey | null
  direction: DocumentTableSortDirection
}

export interface FolderChildCount {
  documentCount: number
  folderCount: number
}

export interface FolderBrowserNode {
  document: IKnowledgeDocument
  children: FolderBrowserNode[]
}

export interface MoveFolderOption {
  id: string
  name: string
  path: string
  depth: number
}

export const DEFAULT_DOCUMENT_COLUMNS: DocumentTableColumn[] = [
  {
    key: 'name',
    labelKey: 'XP.KEY_WORDS.Name',
    defaultLabel: 'Name',
    width: 300,
    minWidth: 180,
    visible: true,
    hideable: false,
    sortable: true,
    resizable: true
  },
  {
    key: 'tagAssignments',
    labelKey: 'XP.KEY_WORDS.Tags',
    defaultLabel: 'Tags',
    width: 240,
    minWidth: 160,
    visible: true,
    hideable: true,
    sortable: false,
    resizable: true
  },
  {
    key: 'type',
    labelKey: 'XP.KEY_WORDS.Type',
    defaultLabel: 'Type',
    width: 96,
    minWidth: 80,
    visible: false,
    hideable: true,
    sortable: true,
    resizable: true
  },
  {
    key: 'contents',
    labelKey: 'XP.Knowledgebase.FolderContents',
    defaultLabel: 'Contents',
    width: 164,
    minWidth: 148,
    visible: true,
    hideable: true,
    sortable: false,
    resizable: true
  },
  {
    key: 'createdAtRelative',
    labelKey: 'XP.KEY_WORDS.Created At',
    defaultLabel: 'Created At',
    width: 148,
    minWidth: 128,
    visible: true,
    hideable: true,
    sortable: true,
    resizable: true
  },
  {
    key: 'disabled',
    labelKey: 'XP.KEY_WORDS.Enabled',
    defaultLabel: 'Enabled',
    width: 88,
    minWidth: 76,
    visible: false,
    hideable: true,
    sortable: true,
    resizable: true
  },
  {
    key: 'processMsg',
    labelKey: 'XP.KEY_WORDS.Message',
    defaultLabel: 'Message',
    width: 220,
    minWidth: 160,
    visible: false,
    hideable: true,
    sortable: true,
    resizable: true
  },
  {
    key: 'progress',
    labelKey: 'XP.Knowledgebase.ParsingProgress',
    defaultLabel: 'Parsing Progress',
    width: 116,
    minWidth: 104,
    visible: true,
    hideable: true,
    sortable: true,
    resizable: true
  }
]

export const SORT_VALUE_BY_COLUMN: Record<DocumentTableColumnKey, (document: IKnowledgeDocument) => unknown> = {
  name: (document) => document.name,
  tagAssignments: () => '',
  type: (document) => document.type,
  contents: () => '',
  createdAtRelative: (document) => document.updatedAt ?? document.createdAt,
  disabled: (document) => (document.disabled ? 0 : 1),
  processMsg: (document) => document.processMsg,
  progress: (document) => document.progress
}

export function getOriginalFileName(doc: IKnowledgeDocument) {
  return doc.name || `${doc.id}.${doc.type || 'download'}`
}

export function getOriginalFilesZipName(knowledgebaseName?: string) {
  const baseName = (knowledgebaseName || 'knowledge-documents').replace(/[\\/:*?"<>|]+/g, '_')
  return `${baseName}-original-files.zip`
}

export function normalizeMoveFolderPath(value?: string | null) {
  return (value ?? '').replace(/\\/g, '/').split('/').filter(Boolean).join('/')
}

export function buildFolderBrowserTree(items: IKnowledgeDocument[], rootId: string | null) {
  if (!rootId) {
    return []
  }

  const nodeById = new Map<string, FolderBrowserNode>(
    items.map((document) => [document.id, { document, children: [] }])
  )
  const roots: FolderBrowserNode[] = []
  for (const node of nodeById.values()) {
    const parentId = node.document.parent?.id
    if (parentId === rootId || !parentId) {
      roots.push(node)
      continue
    }
    const parent = nodeById.get(parentId)
    if (parent) {
      parent.children.push(node)
    }
  }

  const sortNodes = (nodes: FolderBrowserNode[]) => {
    nodes.sort((left, right) => {
      const leftFolder = left.document.sourceType === KDocumentSourceType.FOLDER ? 0 : 1
      const rightFolder = right.document.sourceType === KDocumentSourceType.FOLDER ? 0 : 1
      return leftFolder - rightFolder || left.document.name.localeCompare(right.document.name)
    })
    nodes.forEach((node) => sortNodes(node.children))
  }
  sortNodes(roots)
  return roots
}

export function mergeFolderBrowserItems(current: IKnowledgeDocument[], incoming: IKnowledgeDocument[]) {
  const byId = new Map(current.map((document) => [document.id, document]))
  incoming.forEach((document) => byId.set(document.id, document))
  return [...byId.values()]
}

export function withSetValue(values: Set<string>, value: string) {
  const next = new Set(values)
  next.add(value)
  return next
}

export function withoutSetValue(values: Set<string>, value: string) {
  const next = new Set(values)
  next.delete(value)
  return next
}

export function isSystemManagedDocument(doc: IKnowledgeDocument) {
  const metadata = doc.metadata
  return !!metadata && typeof metadata === 'object' && metadata['systemManaged'] === true
}

export function triggerOriginalFileDownload(blob: Blob, fileName: string) {
  const anchor = document.createElement('a')
  const objectUrl = URL.createObjectURL(blob)
  anchor.href = objectUrl
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(objectUrl)
}

export function createDefaultDocumentColumns() {
  return DEFAULT_DOCUMENT_COLUMNS.map((column) => ({ ...column }))
}

export function loadDocumentColumns(): DocumentTableColumn[] {
  if (typeof localStorage === 'undefined') {
    return createDefaultDocumentColumns()
  }

  try {
    const saved = JSON.parse(localStorage.getItem(DOCUMENT_COLUMNS_STORAGE_KEY) ?? '[]') as Array<
      Partial<DocumentTableColumn> & Pick<DocumentTableColumn, 'key'>
    >
    const defaultsByKey = new Map(DEFAULT_DOCUMENT_COLUMNS.map((column) => [column.key, column]))
    const restored = saved
      .map((column) => {
        const defaults = defaultsByKey.get(column.key)
        if (!defaults) {
          return null
        }
        defaultsByKey.delete(column.key)
        return {
          ...defaults,
          visible: defaults.hideable ? (column.visible ?? defaults.visible) : true,
          width: normalizeColumnWidth(Number(column.width ?? defaults.width), defaults)
        }
      })
      .filter((column): column is DocumentTableColumn => !!column)

    // Add the new display column beside the name without resetting existing preferences.
    const tagsColumn = defaultsByKey.get('tagAssignments')
    const nameIndex = restored.findIndex((column) => column.key === 'name')
    if (tagsColumn && nameIndex >= 0) {
      restored.splice(nameIndex + 1, 0, { ...tagsColumn })
      defaultsByKey.delete('tagAssignments')
    }

    return [...restored, ...Array.from(defaultsByKey.values(), (column) => ({ ...column }))]
  } catch {
    return createDefaultDocumentColumns()
  }
}

export function saveDocumentColumns(columns: DocumentTableColumn[]) {
  if (typeof localStorage === 'undefined') {
    return
  }

  try {
    localStorage.setItem(
      DOCUMENT_COLUMNS_STORAGE_KEY,
      JSON.stringify(columns.map(({ key, visible, width }) => ({ key, visible, width })))
    )
  } catch {
    // Column customization is progressive enhancement; storage failures must not block document management.
  }
}

export function normalizeColumnWidth(width: number, column: Pick<DocumentTableColumn, 'minWidth' | 'maxWidth'>) {
  const maxWidth = column.maxWidth ?? Number.POSITIVE_INFINITY
  return Math.min(Math.max(Math.round(width), column.minWidth), maxWidth)
}

export function normalizeDocumentInspectorWidth(width: number, maxWidth: number) {
  return Math.min(Math.max(Math.round(width), DOCUMENT_INSPECTOR_MIN_WIDTH), maxWidth)
}

export function compareDocumentSortValues(
  a: IKnowledgeDocument,
  b: IKnowledgeDocument,
  sortState: ActiveDocumentTableSortState
) {
  const getSortValue = SORT_VALUE_BY_COLUMN[sortState.active]
  const direction = sortState.direction === 'desc' ? -1 : 1
  const aValue = normalizeSortValue(getSortValue(a))
  const bValue = normalizeSortValue(getSortValue(b))

  if (aValue < bValue) {
    return -1 * direction
  }

  if (aValue > bValue) {
    return direction
  }

  return 0
}

export function normalizeSortValue(value: unknown): number | string {
  if (value instanceof Date) {
    return value.getTime()
  }

  if (typeof value === 'string') {
    const timestamp = Date.parse(value)
    return Number.isNaN(timestamp) ? value.toLocaleLowerCase() : timestamp
  }

  if (typeof value === 'number') {
    return value
  }

  if (typeof value === 'boolean') {
    return value ? 1 : 0
  }

  return ''
}

export function isDocumentProcessing(status?: KBDocumentStatusEnum) {
  if (!status) {
    return false
  }

  return [
    KBDocumentStatusEnum.WAITING,
    KBDocumentStatusEnum.VALIDATE,
    KBDocumentStatusEnum.RUNNING,
    KBDocumentStatusEnum.TRANSFORMED,
    KBDocumentStatusEnum.SPLITTED,
    KBDocumentStatusEnum.UNDERSTOOD,
    KBDocumentStatusEnum.EMBEDDING
  ].includes(status)
}

export function documentStatusSuffix(status?: KBDocumentStatusEnum) {
  switch (status) {
    case KBDocumentStatusEnum.FINISH:
      return 'Finish'
    case KBDocumentStatusEnum.ERROR:
      return 'Error'
    case KBDocumentStatusEnum.WAITING:
      return 'Waiting'
    case KBDocumentStatusEnum.RUNNING:
    case KBDocumentStatusEnum.VALIDATE:
      return 'Running'
    case KBDocumentStatusEnum.TRANSFORMED:
      return 'Transformed'
    case KBDocumentStatusEnum.SPLITTED:
      return 'Splitted'
    case KBDocumentStatusEnum.UNDERSTOOD:
      return 'Understood'
    case KBDocumentStatusEnum.EMBEDDING:
      return 'Embedding'
    default:
      return 'NotStart'
  }
}

export function documentStatusDefaultLabel(status?: KBDocumentStatusEnum) {
  switch (status) {
    case KBDocumentStatusEnum.FINISH:
      return 'Complete'
    case KBDocumentStatusEnum.ERROR:
      return 'Error'
    case KBDocumentStatusEnum.WAITING:
      return 'Queued'
    case KBDocumentStatusEnum.RUNNING:
    case KBDocumentStatusEnum.VALIDATE:
      return 'Processing'
    case KBDocumentStatusEnum.TRANSFORMED:
      return 'Transformed'
    case KBDocumentStatusEnum.SPLITTED:
      return 'Splitting'
    case KBDocumentStatusEnum.UNDERSTOOD:
      return 'Understanding'
    case KBDocumentStatusEnum.EMBEDDING:
      return 'Indexing'
    default:
      return 'Not started'
  }
}

export function resolveProcessStageState(
  status: KBDocumentStatusEnum | undefined,
  stage: DocumentProcessStage
): DocumentProcessStageState {
  if (status === KBDocumentStatusEnum.ERROR) {
    return stage === 'transform' ? 'error' : 'pending'
  }

  const order: Record<DocumentProcessStage, number> = { transform: 0, split: 1, index: 2 }
  const activeStage =
    status === KBDocumentStatusEnum.FINISH
      ? 3
      : [KBDocumentStatusEnum.SPLITTED, KBDocumentStatusEnum.UNDERSTOOD, KBDocumentStatusEnum.EMBEDDING].includes(
            status
          )
        ? 2
        : status === KBDocumentStatusEnum.TRANSFORMED
          ? 1
          : 0
  const stageOrder = order[stage]
  return activeStage > stageOrder
    ? 'complete'
    : activeStage === stageOrder && isDocumentProcessing(status)
      ? 'active'
      : 'pending'
}

export function formatDocumentSize(value: unknown) {
  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) {
      return value
    }
    value = numeric
  }

  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return '-'
  }

  if (value < 1024) {
    return `${value} B`
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`
  }
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

export function formatDocumentTimestamp(value: Date | string | null | undefined) {
  if (!value) {
    return '-'
  }

  const timestamp = new Date(value)
  return Number.isNaN(timestamp.getTime()) ? '-' : format(timestamp, 'yyyy-MM-dd HH:mm:ss')
}
