import { TFileDirectory } from '../../../@core'

export type FileTreeNode = TFileDirectory & {
  expanded?: boolean
  level?: number
  levels?: number[]
}

export function prepareFileTree(items: TFileDirectory[]): FileTreeNode[] {
  return [...(items ?? [])]
    .sort(compareFileTreeItems)
    .map((item) => ({
      ...item,
      expanded: false,
      children: Array.isArray(item.children) ? prepareFileTree(item.children) : item.children
    }))
}

export function flattenFileTree(items: FileTreeNode[], level = 0): FileTreeNode[] {
  return (items ?? []).reduce((acc: FileTreeNode[], item) => {
    acc.push({
      ...item,
      level,
      levels: new Array(level).fill(null)
    })

    if (item.expanded && Array.isArray(item.children) && item.children.length) {
      acc.push(...flattenFileTree(item.children as FileTreeNode[], level + 1))
    }

    return acc
  }, [])
}

export function updateFileTreeNode(
  items: FileTreeNode[],
  filePath: string,
  updater: (node: FileTreeNode) => FileTreeNode
): FileTreeNode[] {
  let changed = false
  const next = (items ?? []).map((item) => {
    const currentPath = fileTreeNodePath(item)
    if (currentPath === filePath) {
      const updated = updater(item)
      changed = changed || updated !== item
      return updated
    }

    if (!Array.isArray(item.children)) {
      return item
    }

    const children = updateFileTreeNode(item.children as FileTreeNode[], filePath, updater)
    if (children === item.children) {
      return item
    }

    changed = true
    return {
      ...item,
      children
    }
  })

  return changed ? next : items
}

export function removeFileTreeNode(items: FileTreeNode[], filePath: string): FileTreeNode[] {
  let changed = false
  const next = (items ?? []).reduce((acc: FileTreeNode[], item) => {
    const currentPath = fileTreeNodePath(item)
    if (currentPath === filePath) {
      changed = true
      return acc
    }

    if (!Array.isArray(item.children)) {
      acc.push(item)
      return acc
    }

    const children = removeFileTreeNode(item.children as FileTreeNode[], filePath)
    if (children === item.children) {
      acc.push(item)
      return acc
    }

    acc.push({
      ...item,
      children
    })
    changed = true

    return acc
  }, [])

  return changed ? next : items
}

export function findPreferredFile(
  items: FileTreeNode[],
  isEditable: (filePath: string) => boolean
): FileTreeNode | null {
  const files = collectFileTreeFiles(items)
  return (
    files.find((item) => (item.filePath || '').toLowerCase() === 'skill.md') ||
    files.find((item) => isEditable((item.fullPath || item.filePath) ?? '')) ||
    files[0] ||
    null
  )
}

export function mergeFileTreeState(previous: FileTreeNode[], next: FileTreeNode[]): FileTreeNode[] {
  const previousMap = new Map((previous ?? []).map((item) => [fileTreeNodePath(item), item] as const))
  let changed = (previous ?? []).length !== (next ?? []).length

  const merged = (next ?? []).map((item, index) => {
    const currentPath = fileTreeNodePath(item)
    const previousItem = currentPath ? previousMap.get(currentPath) : undefined
    const nextChildren = resolveMergedChildren(previousItem, item)
    const mergedItem: FileTreeNode = {
      ...item,
      expanded: previousItem?.expanded ?? item.expanded,
      children: nextChildren
    }

    const result = previousItem && areFileTreeNodesEquivalent(previousItem, mergedItem) ? previousItem : mergedItem
    changed = changed || result !== previous[index]
    return result
  })

  return changed ? merged : previous
}

export function collectExpandedDirectoryPaths(items: FileTreeNode[]): string[] {
  return (items ?? []).reduce((acc: string[], item) => {
    if (!item.hasChildren || !item.expanded) {
      return acc
    }

    const currentPath = fileTreeNodePath(item)
    if (currentPath) {
      acc.push(currentPath)
    }

    if (Array.isArray(item.children)) {
      acc.push(...collectExpandedDirectoryPaths(item.children as FileTreeNode[]))
    }

    return acc
  }, [])
}

function compareFileTreeItems(a: TFileDirectory, b: TFileDirectory) {
  if (!!a.hasChildren !== !!b.hasChildren) {
    return a.hasChildren ? -1 : 1
  }

  return (a.filePath || '').localeCompare(b.filePath || '')
}

function collectFileTreeFiles(items: FileTreeNode[]): FileTreeNode[] {
  return (items ?? []).reduce((acc: FileTreeNode[], item) => {
    if (item.hasChildren) {
      acc.push(...collectFileTreeFiles((item.children as FileTreeNode[]) ?? []))
    } else {
      acc.push(item)
    }
    return acc
  }, [])
}

function fileTreeNodePath(item: FileTreeNode | TFileDirectory | null | undefined) {
  return item?.fullPath || item?.filePath || ''
}

function resolveMergedChildren(previousItem: FileTreeNode | undefined, item: FileTreeNode) {
  if (Array.isArray(item.children)) {
    return mergeFileTreeState(
      Array.isArray(previousItem?.children) ? (previousItem.children as FileTreeNode[]) : [],
      item.children as FileTreeNode[]
    )
  }

  if (previousItem?.expanded && Array.isArray(previousItem.children)) {
    return previousItem.children
  }

  return item.children
}

function areFileTreeNodesEquivalent(previous: FileTreeNode, next: FileTreeNode) {
  const previousKeys = comparableFileTreeNodeKeys(previous)
  const nextKeys = comparableFileTreeNodeKeys(next)

  if (previousKeys.length !== nextKeys.length) {
    return false
  }

  const nextKeySet = new Set(nextKeys)
  if (!previousKeys.every((key) => nextKeySet.has(key))) {
    return false
  }

  return previousKeys.every((key) => {
    const nodeKey = key as keyof FileTreeNode
    return previous[nodeKey] === next[nodeKey]
  })
}

function comparableFileTreeNodeKeys(item: FileTreeNode) {
  return Object.keys(item).filter((key) => key !== 'level' && key !== 'levels')
}
