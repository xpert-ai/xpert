import { cloneDeep } from 'lodash-es'
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
  const tree = cloneDeep(items)
  const node = findFileTreeNode(tree, filePath)
  if (node) {
    Object.assign(node, updater(node))
  }
  return tree
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

function compareFileTreeItems(a: TFileDirectory, b: TFileDirectory) {
  if (!!a.hasChildren !== !!b.hasChildren) {
    return a.hasChildren ? -1 : 1
  }

  return (a.filePath || '').localeCompare(b.filePath || '')
}

function findFileTreeNode(items: FileTreeNode[], filePath: string): FileTreeNode | undefined {
  for (const item of items ?? []) {
    if ((item.fullPath || item.filePath) === filePath) {
      return item
    }
    if (Array.isArray(item.children)) {
      const found = findFileTreeNode(item.children as FileTreeNode[], filePath)
      if (found) {
        return found
      }
    }
  }
  return undefined
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
