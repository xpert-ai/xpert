import { RecursiveHierarchyType, TreeNodeInterface } from '@xpert-ai/ocap-core'
import { assign, isEmpty } from 'lodash-es'


export function hierarchize<T>(
  items: Array<T>,
  recursiveHierarchy: RecursiveHierarchyType,
  options?: {
    compositeKeys?: string[]
    valueProperty?: string
    startLevel?: number
  }
): {treeNodes: Array<TreeNodeInterface<T>>, index?: any} {
  const root = []
  const results = {} as Record<string, TreeNodeInterface<T>>
  items?.forEach((item) => {
    const itemKey = item[recursiveHierarchy.valueProperty] + (options?.compositeKeys?.map((key) => item[key]).join('/') ?? '')
    if (!results[itemKey]) {
      results[itemKey] = {
        children: []
      } as TreeNodeInterface<T>
    }
    assign(results[itemKey], {
      key: itemKey,
      label: item[recursiveHierarchy.labelProperty],
      title: item[recursiveHierarchy.labelProperty],
      name: item[recursiveHierarchy.labelProperty],
      raw: item
    })

    if (options?.valueProperty) {
      results[itemKey].value = item[options.valueProperty]
    }

    const parentKey = item[recursiveHierarchy.parentNodeProperty] + (options?.compositeKeys?.map((key) => item[key]).join('/') ?? '')
    if (parentKey) {
      if (results[parentKey]) {
        results[parentKey].children.push(results[itemKey])
      } else {
        results[parentKey] = {
          children: [results[itemKey]]
        } as TreeNodeInterface<T>
      }
      results[itemKey].parent = results[parentKey];
      (results[itemKey].raw as any).parent = results[parentKey]
    } else {
      results[itemKey].level = 0
      root.push(results[itemKey])
    }
  })

  Object.values(results).forEach((node) => {
    if (isEmpty(node.children)) {
      node.isLeaf = true
      node.children = null
    }
    if (!node.raw) {
      root.push(...node.children)
    }
  })

  root.forEach((item) => setLevel(item, 0))

  if (options?.startLevel > 0) {
    const items = []
    root.map((item) => {
      items.push(...getTreeLevel(item, options.startLevel))
    })
    return {treeNodes: items}
  }
  return {treeNodes: root, index: results}
}

function setLevel<T>(item: TreeNodeInterface<T>, level: number) {
  item.level = level
  if (item.children) {
    item.children.forEach((item) => setLevel(item, level + 1))
  }
}

function getTreeLevel<T>(item: TreeNodeInterface<T>, level: number) {
  if (item.level === level - 1) {
    return item.children ?? []
  }

  const items = []
  item.children?.map((item) => {
    items.push(...getTreeLevel(item, level))
  })
  return items
}