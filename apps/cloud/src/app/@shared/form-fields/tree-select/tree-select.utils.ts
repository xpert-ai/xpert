import { DisplayBehaviour } from '@xpert-ai/headless-ui'

export interface TreeNodeInterface<T = unknown> {
  key?: string
  label?: string
  caption?: string
  title?: string
  name?: string
  value?: unknown
  level?: number
  isLeaf?: boolean
  raw?: T
  children?: TreeNodeInterface<T>[]
  parent?: TreeNodeInterface<T>
}

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
  return text ? String(text) : node.key ? String(node.key) : ''
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
  const normalizedSearchTerm = searchTerm?.trim().toLowerCase()
  if (!normalizedSearchTerm) {
    return treeNodes ?? []
  }

  const keywords = normalizedSearchTerm.split(/\s+/).filter(Boolean)
  const match = (value: unknown) => {
    if (value === null || value === undefined) {
      return false
    }

    const candidate = String(value).toLowerCase()
    return keywords.some((keyword) => {
      if (!keyword.includes('*')) {
        return candidate.includes(keyword)
      }

      const pattern = keyword.replace(/[-/\\^$+?.()|[\]{}]/g, '\\$&').replace(/\*/g, '.*')
      return new RegExp(`^${pattern}$`).test(candidate)
    })
  }

  const visit = (nodes: TreeNodeInterface<T>[]): TreeNodeInterface<T>[] =>
    nodes.reduce<TreeNodeInterface<T>[]>((result, node) => {
      const children = visit(node.children ?? [])
      const matches =
        match(node.label) ||
        match(node.caption) ||
        (displayBehaviour !== DisplayBehaviour.descriptionOnly && match(node.key))

      if (children.length) {
        result.push({ ...node, children })
      } else if (matches) {
        const { children: _children, ...leaf } = node
        result.push(leaf)
      }

      return result
    }, [])

  return visit(treeNodes ?? [])
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
