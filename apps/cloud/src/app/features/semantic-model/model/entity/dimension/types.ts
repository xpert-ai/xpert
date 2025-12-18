import { AggregationRole, PropertyDimension } from '@metad/ocap-core'

/**
 * Node for Property item
 */
export class TreeItemNode<T = any> {
  children?: TreeItemNode[]
  id: string
  name: string
  caption: string
  role: AggregationRole
  raw: T
}

/** Flat Property item node with expandable and level information */
export class TreeItemFlatNode<T = any> {
  id: string
  name: string
  caption: string
  level: number
  expandable: boolean
  role: AggregationRole
  raw: T
}

export function mapDimensionToTreeItemNode(dimension: PropertyDimension) {
  return {
    id: dimension.__id__,
    role: AggregationRole.dimension,
    caption: dimension.caption,
    visible: dimension.visible,
    name: dimension.name,
    raw: dimension,
    children: dimension.hierarchies?.map((hierarchy) => {
      return {
        name: hierarchy.name,
        caption: hierarchy.caption,
        dimension: dimension.name,
        id: hierarchy.__id__,
        role: AggregationRole.hierarchy,
        raw: hierarchy,
        children: hierarchy.levels?.map((level) => {
          return {
            name: level.name,
            dimension: dimension.name,
            hierarchy: hierarchy.name,
            id: level.__id__,
            role: AggregationRole.level,
            caption: level.caption,
            children: null,
            raw: level
          }
        })
      }
    })
  } as TreeItemNode
}