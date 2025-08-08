import { FlatTreeControl } from '@angular/cdk/tree'
import { MatTreeFlatDataSource, MatTreeFlattener } from '@angular/material/tree'
import { Indicator } from '@metad/cloud/state'
import { FlatTreeNode, TreeNodeInterface, isString, omitBlank } from '@metad/ocap-core'
import { DefaultCollection, ICollection } from '../../@core'


export type ProjectIndicatorsState = {
  indicators: Indicator[]
}

export const NewIndicatorCodePlaceholder = 'new'

export function collectionId(collection: ICollection | string) {
  collection = isString(collection) ? collection : collection?.id
  return collection === DefaultCollection.id ? null : collection
}

export function treeDataSourceFactory() {
  const transformer = (node: TreeNodeInterface<any>, level: number): FlatTreeNode<any> => {
    return {
      expandable: !!node.children && node.children.length > 0,
      key: node.key,
      caption: node.label,
      value: node.value,
      level: level,
      childrenCardinality: node.children?.length,
      raw: node.raw
    }
  }
  const treeControl = new FlatTreeControl<FlatTreeNode<any>>(
    (node) => node.level,
    (node) => node.expandable
  )
  const treeFlattener = new MatTreeFlattener(
    transformer,
    (node) => node.level,
    (node) => node.expandable,
    (node) => node.children
  )
  const dataSource = new MatTreeFlatDataSource(treeControl, treeFlattener)

  return {
    dataSource,
    treeControl
  }
}
