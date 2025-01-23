import { FlatTreeControl } from '@angular/cdk/tree'
import { inject } from '@angular/core'
import { MatTreeFlatDataSource, MatTreeFlattener } from '@angular/material/tree'
import { Indicator, SemanticModelServerService, convertNewSemanticModelResult } from '@metad/cloud/state'
import { FlatTreeNode, TreeNodeInterface, isString, omitBlank } from '@metad/ocap-core'
import { pick } from 'lodash-es'
import { map } from 'rxjs/operators'
import { DefaultCollection, ICollection, IIndicator } from '../../@core'
import { INDICATOR_COLUMNS } from '../indicator/types'


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

export function exportIndicator(indicator: IIndicator) {
  const fieldNames = INDICATOR_COLUMNS.map(({ name }) => name)
  return {
    ...pick<IIndicator>(indicator, fieldNames),
    // don't export system fields of tags
    tags: indicator.tags?.map((tag) => omitBlank(pick(tag, 'name', 'description', 'category', 'color')))
  }
}

export function injectFetchModelDetails() {
  const modelsService = inject(SemanticModelServerService)
  return (id: string) => {
    return modelsService
      .getById(id, {relations: ['dataSource', 'dataSource.type', 'indicators']})
      .pipe(map((model) => convertNewSemanticModelResult(model)))
  }
}
