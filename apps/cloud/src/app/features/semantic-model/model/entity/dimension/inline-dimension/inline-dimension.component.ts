import { FlatTreeControl } from '@angular/cdk/tree'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { CommonModule } from '@angular/common'
import { Component, effect, inject, input, output } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatIconModule } from '@angular/material/icon'
import { MatTooltipModule } from '@angular/material/tooltip'
import { MatTreeFlatDataSource, MatTreeFlattener, MatTreeModule } from '@angular/material/tree'
import { NgmEntityPropertyComponent } from '@metad/ocap-angular/entity'
import {
  AggregationRole,
  assign,
  DisplayBehaviour,
  isNil,
  isVisible,
  omit,
  PropertyDimension
} from '@metad/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import { ModelEntityService } from '../../entity.service'
import { mapDimensionToTreeItemNode, TreeItemFlatNode, TreeItemNode } from '../types'


@Component({
  standalone: true,
  selector: 'pac-inline-dimension',
  templateUrl: 'inline-dimension.component.html',
  styleUrl: 'inline-dimension.component.scss',
  host: {
    class: 'pac-inline-dimension'
  },
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    DragDropModule,
    MatTreeModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    NgmEntityPropertyComponent
  ]
})
export class InlineDimensionComponent {
  eAggregationRole = AggregationRole
  isVisible = isVisible

  readonly cubeState = inject(ModelEntityService)

  readonly dimension = input<PropertyDimension>()
  readonly displayBehaviour = input<DisplayBehaviour>()
  readonly readonly = input<boolean>()

  readonly delete = output<string>()
  readonly newItem = output<{ id: string; role: AggregationRole }>()

  /** The selection for checklist */
  readonly flatNodeMap = new Map<TreeItemFlatNode, TreeItemNode>()
  readonly nestedNodeMap = new Map<TreeItemNode, TreeItemFlatNode>()

  transformer = (node: TreeItemNode, level: number) => {
    const existingNode = this.nestedNodeMap.get(node)
    const flatNode = existingNode && existingNode.name === node.name ? existingNode : new TreeItemFlatNode()
    // Copy attribute
    assign(flatNode, omit(node, 'children'))
    flatNode.level = level
    flatNode.expandable = !!node.children?.length
    flatNode.raw = node.raw

    this.flatNodeMap.set(flatNode, node)
    this.nestedNodeMap.set(node, flatNode)
    return flatNode
  }
  hasChild = (_: number, _nodeData: TreeItemFlatNode) => _nodeData.expandable
  getLevel = (node: TreeItemFlatNode) => node.level
  getChildren = (node: TreeItemNode): TreeItemNode[] => node.children
  isExpandable = (node: TreeItemFlatNode) => node.expandable
  readonly treeFlattener: MatTreeFlattener<TreeItemNode, TreeItemFlatNode, string> = new MatTreeFlattener(
    this.transformer,
    this.getLevel,
    this.isExpandable,
    this.getChildren
  )
  readonly treeControl = new FlatTreeControl<TreeItemFlatNode, string>(this.getLevel, this.isExpandable, {
    trackBy: (dataNode: TreeItemFlatNode) => dataNode.id
  })
  readonly dataSource: MatTreeFlatDataSource<TreeItemNode, TreeItemFlatNode, string> = new MatTreeFlatDataSource(
    this.treeControl,
    this.treeFlattener
  )

  constructor() {
    this.dataSource.data = []

    effect(() => {
      if (this.dimension()) {
        this.dataSource.data = [mapDimensionToTreeItemNode(this.dimension())]

        console.log(this.dataSource.data)
      }
    })
  }

  isSelected(node: TreeItemFlatNode) {
    return this.cubeState.isSelectedProperty(node.role, node.id)
  }

  /**
   * Click node to open attribute editor.
   * 
   * @param node 
   */
  onSelect(node: TreeItemFlatNode) {
    this.cubeState.setSelectedProperty(node.role, node.id)
  }

  addNewItem(event: MouseEvent, node: TreeItemFlatNode) {
    event.stopPropagation()
    if (!isNil(node)) {
      this.treeControl.expand(node)
      this.newItem.emit({ id: node.id, role: node?.role })
    }
  }

  onDelete(event: MouseEvent, node: TreeItemFlatNode) {
    event.stopPropagation()
    this.delete.emit(node.id)
  }
}
