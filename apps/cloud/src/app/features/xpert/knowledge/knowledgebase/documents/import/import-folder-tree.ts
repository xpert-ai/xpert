import type { IKnowledgeDocument } from '@xpert-ai/contracts'
import type { TreeNodeInterface } from '@cloud/app/@shared/form-fields/tree-select/tree-select.utils'

export const IMPORT_ROOT_FOLDER = 'import-root-folder'
type ImportFolder = Pick<IKnowledgeDocument, 'id' | 'name'> & {
  parent?: Pick<IKnowledgeDocument, 'id'> | null
}

export function buildImportFolderTree(folders: ImportFolder[], rootLabel: string): TreeNodeInterface<ImportFolder>[] {
  const sorted = [...folders].sort((left, right) => left.name.localeCompare(right.name))
  const byId = new Map(sorted.map((folder) => [folder.id, folder]))
  const children = new Map<string | null, ImportFolder[]>()
  for (const folder of sorted) {
    const parentId = folder.parent?.id
    const parent = parentId && parentId !== folder.id && byId.has(parentId) ? parentId : null
    children.set(parent, [...(children.get(parent) ?? []), folder])
  }

  const visited = new Set<string>()
  const visit = (folder: ImportFolder): TreeNodeInterface<ImportFolder>[] => {
    if (visited.has(folder.id)) return []
    visited.add(folder.id)
    return [
      { key: folder.id, caption: folder.name, raw: folder, children: (children.get(folder.id) ?? []).flatMap(visit) }
    ]
  }
  const roots = (children.get(null) ?? []).flatMap(visit)
  // Keep incomplete or cyclic historical hierarchies selectable without recursive loops.
  roots.push(...sorted.filter((folder) => !visited.has(folder.id)).flatMap(visit))
  return [{ key: IMPORT_ROOT_FOLDER, caption: rootLabel, children: roots }]
}
