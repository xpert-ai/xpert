import { coerceBooleanProperty } from '@angular/cdk/coercion'
import { FlatTreeControl } from '@angular/cdk/tree'
import { Component, Input, OnChanges, OnInit, signal, SimpleChanges, TemplateRef } from '@angular/core'
import { MatTreeFlatDataSource, MatTreeFlattener } from '@angular/material/tree'
import { DisplayDensity } from '@metad/ocap-angular/core'
import { FlatTreeNode, Property, TreeNodeInterface } from '@metad/ocap-core'
import { displayDensityToTableSize, parseTableWidthToPx } from '../table/table.utils'

export type TreeTableColumn = Property & {
  cellTemplate?: TemplateRef<any>,
  pipe?: (value: any) => any;
  width?: string
  sticky?: boolean
  stickyEnd?: boolean
}

/**
 * @deprecated use headless components instead
 */
@Component({
  selector: 'ngm-tree-table',
  templateUrl: 'tree-table.component.html',
  styleUrls: ['tree-table.component.scss'],
  standalone: false,
  host: {
    'class': 'ngm-tree-table'
  }
})
export class TreeTableComponent<T> implements OnInit, OnChanges {
  @Input() data: TreeNodeInterface<T>[]
  @Input() columns: Array<TreeTableColumn>
  @Input() nameLabel: string
  @Input() nameCellTemplate: TemplateRef<any>
  @Input() displayDensity: DisplayDensity
  @Input() initialLevel: number

  @Input() get striped() {
    return this._striped
  }
  set striped(value) {
    this._striped = coerceBooleanProperty(value)
  }
  private _striped = false

  @Input() get grid() {
    return this._grid
  }
  set grid(value) {
    this._grid = coerceBooleanProperty(value)
  }
  private _grid = false

  @Input() get stickyHeaders() {
    return this._stickyHeaders
  }
  set stickyHeaders(value: string | boolean) {
    this._stickyHeaders = coerceBooleanProperty(value)
  }
  private _stickyHeaders = false

  treeNodePadding = 40
  displayedColumns = ['name']
  readonly visibleNodes = signal<FlatTreeNode<T>[]>([])

  private transformer = (node: TreeNodeInterface<T>, level: number): FlatTreeNode<T> => {
    return {
      expandable: !!node.children && node.children.length > 0,
      key: node.key,
      name: node.name,
      label: node.label,
      caption: node.caption,
      value: node.value,
      level: level,
      raw: node.raw
    }
  }

  treeControl = new FlatTreeControl<FlatTreeNode<T>>(
    (node) => node.level,
    (node) => node.expandable
  )

  treeFlattener = new MatTreeFlattener(
    this.transformer,
    (node) => node.level,
    (node) => node.expandable,
    (node) => node.children
  )

  dataSource = new MatTreeFlatDataSource(this.treeControl, this.treeFlattener)

  unfold = false
  ngOnInit() {
    //
  }

  ngOnChanges({ data, columns, displayDensity }: SimpleChanges): void {
    if (data?.currentValue) {
      this.dataSource.data = this.data

      if (this.initialLevel) {
        this.treeControl.dataNodes.forEach((node) => {
          const level = this.treeControl.getLevel(node)
          if (level < this.initialLevel) {
            this.treeControl.expand(node)
          }
        })
      }

      this.updateVisibleNodes()
    }

    if (columns?.currentValue) {
      this.displayedColumns = ['name', ...columns.currentValue.map((column) => column.name)]
    }

    if (displayDensity) {
      if (displayDensity.currentValue === DisplayDensity.compact) {
        this.treeNodePadding = 24
      } else if (displayDensity.currentValue === DisplayDensity.cosy) {
        this.treeNodePadding = 30
      } else {
        this.treeNodePadding = 40
      }
    }
  }

  hasChild = (_: number, node: FlatTreeNode<T>) => node.expandable

  get tableSize() {
    return displayDensityToTableSize(this.displayDensity)
  }

  stickyStartOffset(columnName: string) {
    let offset = 0
    for (const column of this.columns ?? []) {
      if (column.name === columnName) {
        return offset
      }

      if (column.sticky) {
        offset += parseTableWidthToPx(column.width, 180)
      }
    }

    return null
  }

  stickyEndOffset(columnName: string) {
    let offset = 0
    for (const column of [...(this.columns ?? [])].reverse()) {
      if (column.name === columnName) {
        return offset
      }

      if (column.stickyEnd) {
        offset += parseTableWidthToPx(column.width, 160)
      }
    }

    return null
  }

  toggleNode(node: FlatTreeNode<T>) {
    this.treeControl.toggle(node)
    this.updateVisibleNodes()
  }

  toggleUnfold() {
    this.unfold = !this.unfold
    if (this.unfold) {
      this.treeControl.expandAll()
    } else {
      this.treeControl.collapseAll()
    }
    this.updateVisibleNodes()
  }

  private updateVisibleNodes() {
    const expandedAncestors: boolean[] = []
    const visibleNodes: FlatTreeNode<T>[] = []

    for (const node of this.treeControl.dataNodes ?? []) {
      const isVisible = node.level === 0 || expandedAncestors.slice(0, node.level).every(Boolean)
      if (isVisible) {
        visibleNodes.push(node)
      }

      expandedAncestors[node.level] = this.treeControl.isExpanded(node)
      expandedAncestors.length = node.level + 1
    }

    this.visibleNodes.set(visibleNodes)
  }
}
