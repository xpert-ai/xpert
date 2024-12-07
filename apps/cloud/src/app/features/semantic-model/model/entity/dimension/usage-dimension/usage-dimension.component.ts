import { FlatTreeControl } from '@angular/cdk/tree'
import { CommonModule } from '@angular/common'
import { Component, effect, inject, input, output } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatTreeFlatDataSource, MatTreeFlattener } from '@angular/material/tree'
import { NxActionStripModule } from '@metad/components/action-strip'
import { NgmEntityPropertyComponent } from '@metad/ocap-angular/entity'
import {
  AggregationRole,
  assign,
  DimensionUsage,
  DisplayBehaviour,
  isNil,
  isVisible,
  omit,
  PropertyAttributes,
  PropertyDimension
} from '@metad/ocap-core'
import { MaterialModule } from 'apps/cloud/src/app/@shared/material.module'
import { ModelDesignerType } from '../../../types'
import { ModelEntityService } from '../../entity.service'
import { mapDimensionToTreeItemNode, TreeItemFlatNode, TreeItemNode } from '../types'

@Component({
  standalone: true,
  selector: 'pac-usage-dimension',
  templateUrl: 'usage-dimension.component.html',
  styleUrl: 'usage-dimension.component.scss',
  host: {
    class: 'pac-usage-dimension'
  },
  imports: [CommonModule, FormsModule, MaterialModule, NgmEntityPropertyComponent, NxActionStripModule]
})
export class UsageDimensionComponent {
  AGGREGATION_ROLE = AggregationRole
  isVisible = isVisible

  readonly cubeState = inject(ModelEntityService)

  readonly dimension = input<PropertyDimension>()
  readonly displayBehaviour = input<DisplayBehaviour>()
  readonly usage = input<DimensionUsage>()

  readonly toDimension = output()
  readonly delete = output<string>()

  /** The selection for checklist */
  flatNodeMap = new Map<TreeItemFlatNode, TreeItemNode>()
  nestedNodeMap = new Map<TreeItemNode, TreeItemFlatNode>()

  transformer = (node: TreeItemNode, level: number) => {
    const existingNode = this.nestedNodeMap.get(node)
    const flatNode = existingNode && existingNode.name === node.name ? existingNode : new TreeItemFlatNode()
    // 复制属性
    assign(flatNode, omit(node, 'children'))
    flatNode.level = level
    flatNode.expandable = !!node.children?.length

    this.flatNodeMap.set(flatNode, node)
    this.nestedNodeMap.set(node, flatNode)
    return flatNode
  }
  hasChild = (_: number, _nodeData: TreeItemFlatNode) => _nodeData.expandable
  getLevel = (node: TreeItemFlatNode) => node.level
  getChildren = (node: TreeItemNode): TreeItemNode[] => node.children
  isExpandable = (node: TreeItemFlatNode) => node.expandable
  treeFlattener: MatTreeFlattener<TreeItemNode, TreeItemFlatNode, string> = new MatTreeFlattener(
    this.transformer,
    this.getLevel,
    this.isExpandable,
    this.getChildren
  )
  treeControl = new FlatTreeControl<TreeItemFlatNode, string>(this.getLevel, this.isExpandable, {
    trackBy: (dataNode: TreeItemFlatNode) => dataNode.id
  })
  dataSource: MatTreeFlatDataSource<TreeItemNode, TreeItemFlatNode, string> = new MatTreeFlatDataSource(
    this.treeControl,
    this.treeFlattener
  )

  constructor() {
    this.dataSource.data = []

    effect(() => {
      if (this.dimension()) {
        this.dataSource.data = [mapDimensionToTreeItemNode(this.dimension())]
      }
    })
  }

  isSelected(node: PropertyAttributes) {
    if (node.role === AggregationRole.dimension) {
      return this.cubeState.isSelectedProperty(ModelDesignerType.dimensionUsage, this.usage().__id__)
    }
  }

  onSelect(node: PropertyAttributes) {
    if (node.role === AggregationRole.dimension) {
      this.cubeState.setSelectedProperty(ModelDesignerType.dimensionUsage, this.usage().__id__)
    }
  }

  addNewItem(event, node: TreeItemFlatNode) {
    event.stopPropagation()
    if (!isNil(node)) {
      this.treeControl.expand(node)
      //   this.newItem.emit({ id: node.id, role: node?.role })
    }
  }

  onDelete(event: MouseEvent, node: TreeItemFlatNode) {
    event.stopPropagation()
    this.delete.emit(this.usage().__id__)
  }
}
