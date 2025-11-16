import { Annotation, PropertyName } from '../types'
import { assign, isEmpty, omit } from '../utils'

/**
 * [Hierarchy Vocabulary](https://github.com/SAP/odata-vocabularies/blob/master/vocabularies/Hierarchy.md)
 */
export interface RecursiveHierarchyType extends Annotation {
  parentNodeProperty: PropertyName // Property holding the parent hierarchy node value
  /**
   * TODO 意思应该是指被子节点`parentNodeProperty`引用的唯一键字段
   */
  externalKeyProperty?: PropertyName // Property holding the external key value for a node
  valueProperty: PropertyName // Property for whose values the hierarchy is defined
  labelProperty?: PropertyName
  levelProperty?: PropertyName
  /**
   * Property holding the number of descendants of a node
   * The descendant count of a node is the number of its descendants in the hierarchy structure of the result considering
   * only those nodes matching any specified $filter and $search. A property holding descendant counts has an integer data type.
   */
  descendantCountProperty?: PropertyName
  /**
   * Property holding the drill state of a node
   * The drill state is indicated by one of the following string values: collapsed, expanded, leaf.
   * For an expanded node, its children are included in the result collection. For a collapsed node,
   * the children are included in the entity set, but they are not part of the result collection.
   * Retrieving them requires a relaxed filter expression or a separate request filtering on the parent node ID with the ID of
   * the collapsed node.
   * A leaf does not have any child in the entity set.
   */
  drillStateProperty?: PropertyName
  /**
   * Property holding the sibling rank of a node
   * The sibling rank of a node is the index of the node in the sequence of all nodes with the same parent created by preorder traversal of
   * the hierarchy structure after evaluating the $filter expression in the request excluding any conditions on key properties.
   * The first sibling is at position 0.
   */
  siblingRankProperty?: PropertyName

  /**
   * Property holding the preorder rank of a node
   * The preorder rank of a node expresses its position in the sequence of nodes created from preorder traversal of
   * the hierarchy structure after evaluating the $filter expression in the request excluding any conditions on key properties.
   * The first node in preorder traversal has rank 0.
   */
  preorderRankProperty?: PropertyName

  memberTypeProperty?: PropertyName
}

/**
 * RecursiveHierarchy 类型的数据与 RecursiveHierarchy Annotation 绑定一起的类型
 */
export interface RecursiveHierarchyData<T> {
  data: Array<TreeNodeInterface<T>>
  recursiveHierarchy: RecursiveHierarchyType
}
export interface TreeNodeInterface<T> {
  /**
   * The memebr key (id) for tree node
   */
  key: string
  /**
   * The member label for tree node
   */
  caption: string
  /**
   * @deprecated use `caption`
   * caption
   */
  label?: string
  /**
   * @deprecated use `caption`
   */
  name?: string
  /**
   * @deprecated use `caption`
   */
  title?: string

  raw: T
  value?: number
  level?: number
  expand?: boolean
  children?: TreeNodeInterface<T>[]
  parent?: TreeNodeInterface<T>
  isLeaf?: boolean
}

/**
 * Flat node type for tree structure
 */
export interface FlatTreeNode<T> {
  key: string
  caption: string
  /**
   * @deprecated use `caption`
   */
  name?: string
  /**
   * @deprecated use `caption`
   */
  label?: string
  value?: number
  level: number
  expandable?: boolean
  childrenCardinality?: number
  raw?: T
}

export function hierarchize<T>(
  items: Array<T>,
  recursiveHierarchy: RecursiveHierarchyType,
  options?: {
    compositeKeys?: string[]
    valueProperty?: string
    startLevel?: number
    onlyLeaves?: boolean
    memberCaption?: string
  }
): Array<TreeNodeInterface<T>> {
  const root = []
  const results = {} as Record<string, TreeNodeInterface<T>>
  items?.forEach((item) => {
    const itemKey = item[recursiveHierarchy.valueProperty] + (options?.compositeKeys?.map((key) => item[key]).join('/') ?? '')
    if (!results[itemKey]) {
      results[itemKey] = {
        children: []
      } as TreeNodeInterface<T>
    }
    if (options?.memberCaption) {
      assign(results[itemKey], {
        key: itemKey,
        [options?.memberCaption ?? 'label']: item[recursiveHierarchy.labelProperty],
        caption: item[recursiveHierarchy.labelProperty],
        raw: item
      })
    } else {
      assign(results[itemKey], {
        key: itemKey,
        label: item[recursiveHierarchy.labelProperty],
        title: item[recursiveHierarchy.labelProperty],
        name: item[recursiveHierarchy.labelProperty],
        caption: item[recursiveHierarchy.labelProperty],
        raw: item
      })
    }

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
    } else {
      results[itemKey].level = 0
      root.push(results[itemKey])
    }
  })

  Object.values(results).forEach((node) => {
    if (isEmpty(node.children)) {
      node.isLeaf = true
      node.children = null
    } else if (!node.raw) {
      root.push(...node.children)
    }
  })

  if (options?.onlyLeaves) {
    return Object.values(results).filter((node) => node.isLeaf)
  }

  root.forEach((item) => setLevel(item, 0))

  if (options?.startLevel > 0) {
    const items = []
    root.map((item) => {
      items.push(...getTreeLevel(item, options.startLevel))
    })
    return items
  }
  return root
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

/**
 * Filters a tree-structured array based on a given text query.
 *
 * ### Matching logic
 * - If the keyword contains `*`, wildcard mode is automatically enabled:
 *   - `st*` → matches strings starting with "st"
 *   - `*st` → matches strings ending with "st"
 *   - `*st*` → matches strings containing "st"
 * - If there is **no `*`**, performs normal case-insensitive substring matching.
 * - Supports multiple space-separated keywords (logical OR).
 * - Trims extra spaces automatically.
 *
 * @template T The type of the node data.
 * @param array The tree-structured array.
 * @param text The filter text. Supports multiple keywords and optional * wildcard.
 * @param options Additional options:
 *   - `considerKey`: Whether to also match against the node's `key`.
 * @returns A filtered tree array containing only nodes that match the query.
 */
export function filterTreeNodes<T = any>(
  array: TreeNodeInterface<T>[],
  text: string,
  options?: { considerKey?: boolean }
) {
  text = text?.trim().toLowerCase()
  if (!text) return array

  // Split text into keywords (ignore extra spaces)
  const keywords = text.split(/\s+/).filter(Boolean)

  /**
   * Matches a given string against any keyword.
   * Automatically switches to wildcard matching if '*' is present.
   */
  const match = (value: string) => {
    if (!value) return false
    const val = value.toLowerCase()

    // Return true if ANY keyword matches
    return keywords.some((word) => {
      if (word.includes('*')) {
        // Wildcard mode: convert * to regex pattern
        const pattern = word
          .replace(/[-/\\^$+?.()|[\]{}]/g, '\\$&') // escape regex chars
          .replace(/\*/g, '.*')
        const regex = new RegExp(`^${pattern}$`)
        return regex.test(val)
      } else {
        // Normal substring matching
        return val.includes(word)
      }
    })
  }

  /**
   * Recursively traverses and filters tree nodes.
   */
  const getNodes = (result: TreeNodeInterface<T>[], object: TreeNodeInterface<T>) => {
    const contains =
      match(object.label) ||
      (options?.considerKey && match(`${object.key}`))

    const children = object.children?.reduce(getNodes, [])
    if (children?.length) {
      result.push({ ...object, children })
    } else if (contains) {
      result.push(omit(object, 'children'))
    }
    return result
  }

  return array.reduce(getNodes, [])
}

export function findTreeNode<T = any>(array: TreeNodeInterface<T>[], key: string) {
  const getNodes = (result: TreeNodeInterface<T>, object: TreeNodeInterface<T>) => {
    if (result) {
      return result
    }

    if (object?.key === key) {
      return object
    }

    return object.children?.reduce(getNodes, null)
  }

  return array?.reduce(getNodes, null)
}
