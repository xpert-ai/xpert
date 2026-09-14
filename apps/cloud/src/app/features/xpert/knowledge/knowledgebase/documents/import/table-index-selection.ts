import { KnowledgeTableDefinition } from '@xpert-ai/contracts'

/** Header labels may change; parser-owned table/column identities must retain the selection. */
export function remapTableIndexedFields(
  fields: string[],
  before: KnowledgeTableDefinition[],
  after: KnowledgeTableDefinition[]
): string[] | null {
  const selected = new Map<string, Set<string>>()
  const found = new Set<string>()
  for (const table of before) {
    const columns = table.columns.filter((column) => fields.includes(column.key))
    selected.set(table.tableId, new Set(columns.map((column) => column.columnId)))
    columns.forEach((column) => found.add(column.key))
  }
  if (fields.some((field) => !found.has(field))) return null

  const mapped = new Set<string>()
  for (const [tableId, columnIds] of selected) {
    const table = after.find((table) => table.tableId === tableId)
    for (const columnId of columnIds) {
      const column = table?.columns.find((column) => column.columnId === columnId)
      if (!column) return null
      mapped.add(column.key)
    }
  }
  // indexedFields is shared across sheets. A new key must not also enable an unselected column.
  for (const table of after) {
    if (table.columns.some((column) => mapped.has(column.key) && !selected.get(table.tableId)?.has(column.columnId))) {
      return null
    }
  }
  return [...mapped]
}
