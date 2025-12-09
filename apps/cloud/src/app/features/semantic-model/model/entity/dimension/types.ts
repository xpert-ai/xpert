import { AggregationRole, PropertyDimension } from '@metad/ocap-core'

/**
 * Node for Property item
 */
export class TreeItemNode<T = any> {
  children?: TreeItemNode[]
  id: string
  name: string
  label: string
  role: AggregationRole
  raw: T
}

/** Flat Property item node with expandable and level information */
export class TreeItemFlatNode<T = any> {
  id: string
  name: string
  label: string
  level: number
  expandable: boolean
  role: AggregationRole
  raw: T
}

export function mapDimensionToTreeItemNode(dimension: PropertyDimension) {
  return {
    id: dimension.__id__,
    role: AggregationRole.dimension,
    label: dimension.caption,
    visible: dimension.visible,
    name: dimension.name,
    raw: dimension,
    children: dimension.hierarchies?.map((hierarchy) => {
      return {
        name: hierarchy.name,
        label: hierarchy.caption,
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
            label: level.caption,
            children: null,
            raw: level
          }
        })
      }
    })
  } as TreeItemNode
}