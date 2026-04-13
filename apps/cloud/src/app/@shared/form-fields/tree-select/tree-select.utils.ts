import { DisplayBehaviour, filterTreeNodes, TreeNodeInterface } from '@xpert-ai/ocap-core'

export type TreeSelectTextNode = {
  key?: string | null
  label?: string | null
  caption?: string | null
}

export type TreeSelectExpandableNode = {
  key: string
  level: number
}

export function findTreeSelectNode<T>(
  treeNodes: TreeNodeInterface<T>[] | null | undefined,
  key: unknown
): TreeNodeInterface<T> | null {
  const normalizedKey = normalizeTreeSelectValue(key)

  if (!normalizedKey) {
    return null
  }

  const visit = (node: TreeNodeInterface<T>): TreeNodeInterface<T> | null => {
    if (normalizeTreeSelectValue(node?.key) === normalizedKey) {
      return node
    }

    for (const child of node?.children ?? []) {
      const result = visit(child)
      if (result) {
        return result
      }
    }

    return null
  }

  for (const node of treeNodes ?? []) {
    const result = visit(node)
    if (result) {
      return result
    }
  }

  return null
}

export function displayTreeSelectText(node: TreeSelectTextNode | null | undefined) {
  if (!node) {
    return ''
  }

  const text = node.caption || node.label
  return text ? String(text) : (node.key ? String(node.key) : '')
}

export function normalizeTreeSelectValue(value: unknown): string | null {
  if (Array.isArray(value)) {
    return normalizeTreeSelectValue(value[0])
  }

  return value === null || value === undefined || value === '' ? null : String(value)
}

export function filterTreeSelectNodes<T>(
  treeNodes: TreeNodeInterface<T>[] | null | undefined,
  searchTerm: string | null | undefined,
  displayBehaviour: DisplayBehaviour | string
) {
  return (
    filterTreeNodes(treeNodes ?? [], searchTerm ?? '', {
      considerKey: displayBehaviour !== DisplayBehaviour.descriptionOnly
    }) ?? []
  )
}

export function getInitialExpandedKeys(
  nodes: TreeSelectExpandableNode[],
  initialLevel: number | null | undefined,
  searchTerm: string | null | undefined
) {
  if (searchTerm?.trim()) {
    return nodes.map((node) => node.key)
  }

  if (initialLevel === null || initialLevel === undefined || Number.isNaN(initialLevel)) {
    return []
  }

  return nodes.filter((node) => node.level < initialLevel).map((node) => node.key)
}
