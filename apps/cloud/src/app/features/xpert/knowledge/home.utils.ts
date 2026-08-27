import { IKnowledgebase, IKnowledgeDocument, KDocumentSourceType, KnowledgebasePermission } from '../../../@core'

export type KnowledgeDocumentEditorKind = 'markdown' | 'spreadsheet' | 'docx'

export function mergeKnowledgebases(...groups: IKnowledgebase[][]) {
  const items = new Map<string, IKnowledgebase>()
  groups.flat().forEach((item) => {
    if (item?.id) {
      items.set(item.id, item)
    }
  })
  return [...items.values()]
}

export function splitKnowledgebases(items: IKnowledgebase[]) {
  return {
    personal: items.filter((item) => !item.permission || item.permission === KnowledgebasePermission.Private),
    team: items.filter(
      (item) =>
        item.permission === KnowledgebasePermission.Organization || item.permission === KnowledgebasePermission.Public
    )
  }
}

export function isKnowledgeFolder(document: Pick<IKnowledgeDocument, 'sourceType'>) {
  return document.sourceType === KDocumentSourceType.FOLDER
}

export function knowledgeDocumentExtension(document: Pick<IKnowledgeDocument, 'name' | 'type'>) {
  const nameExtension = document.name?.split('.').pop()?.toLowerCase()
  return (nameExtension || document.type || '').toLowerCase()
}

export function knowledgeDocumentEditorKind(
  document: Pick<IKnowledgeDocument, 'name' | 'type' | 'sourceType'>
): KnowledgeDocumentEditorKind | null {
  if (isKnowledgeFolder(document)) {
    return null
  }

  switch (knowledgeDocumentExtension(document)) {
    case 'md':
    case 'markdown':
    case 'mdx':
    case 'txt':
      return 'markdown'
    case 'csv':
    case 'xls':
    case 'xlsx':
      return 'spreadsheet'
    case 'docx':
      return 'docx'
    default:
      return null
  }
}

export function ensureFileExtension(name: string, extension: string, acceptedExtensions = [extension]) {
  const trimmed = name.trim()
  const currentExtension = trimmed.split('.').pop()?.toLowerCase()
  return acceptedExtensions.includes(currentExtension ?? '') ? trimmed : `${trimmed}.${extension}`
}

export async function createBlankSpreadsheetFile(name: string) {
  const XLSX = await import('xlsx')
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([]), 'Sheet1')
  const data: unknown = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })
  const blobPart = data instanceof ArrayBuffer ? data : new Blob([data as any])
  return new File([blobPart], name, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  })
}

export async function createBlankDocxFile(name: string) {
  const { createDocx, createEmptyDocument } = await import('@eigenpal/docx-editor-core')
  const buffer = await createDocx(createEmptyDocument())
  return new File([buffer], name, {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  })
}
