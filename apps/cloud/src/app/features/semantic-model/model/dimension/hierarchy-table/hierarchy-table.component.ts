import { Component, afterNextRender, booleanAttribute, effect, input, signal, viewChild } from '@angular/core'
import { MatPaginator, MatPaginatorDefaultOptions } from '@angular/material/paginator'
import { MatTableDataSource } from '@angular/material/table'
import { NgmDisplayBehaviourComponent, TableColumn } from '@metad/ocap-angular/common'
import { DisplayDensity } from '@metad/ocap-angular/core'
import { DisplayBehaviour } from '@metad/ocap-core'
import { serializeMemberCaption } from '@metad/ocap-sql'
import { findIndex, get } from 'lodash-es'
import { HierarchyTableDataType } from '../types'
import { MaterialModule } from 'apps/cloud/src/app/@shared/material.module'
import { SharedModule } from 'apps/cloud/src/app/@shared/shared.module'

type LevelTableColumn = TableColumn & { captionName: string }

@Component({
  standalone: true,
  selector: 'ngm-hierarchy-table',
  templateUrl: 'hierarchy-table.component.html',
  styleUrls: ['hierarchy-table.component.scss'],
  host: {
    class: 'ngm-hierarchy-table'
  },
  providers: [],
  imports: [SharedModule, MaterialModule, NgmDisplayBehaviourComponent]
})
export class HierarchyTableComponent<T> {
  /**
  |--------------------------------------------------------------------------
  | Inputs and Outputs
  |--------------------------------------------------------------------------
  */
  readonly columns = input<LevelTableColumn[], TableColumn[]>(null, {
    transform: (columns) => {
      return columns.map((column) => ({
        ...column,
        captionName: serializeMemberCaption(column.name)
      }))
    }
  })
  readonly data = input<HierarchyTableDataType<T>[]>()
  readonly displayDensity = input<DisplayDensity | string>()
  readonly displayBehaviour = input<DisplayBehaviour | string>(DisplayBehaviour.auto)
  readonly paging = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })
  readonly pageSizeOptions = input<MatPaginatorDefaultOptions['pageSizeOptions']>([100, 200, 500, 1000])

  /**
  |--------------------------------------------------------------------------
  | Child Components
  |--------------------------------------------------------------------------
  */
  readonly paginator = viewChild(MatPaginator)

  /**
  |--------------------------------------------------------------------------
  | Signals
  |--------------------------------------------------------------------------
  */
  readonly _data = signal<HierarchyTableDataType<T>[]>([])
  readonly displayedColumns = signal<string[]>([])

  readonly dataSource = new MatTableDataSource<any>()

  constructor() {
    afterNextRender(() => {
      this.dataSource.paginator = this.paginator()
    })

    effect(
      () => {
        const data = this.data()
        if (data) {
          this._data.set([...data])
          const root = data[0]
          if (root.levelNumber === 0) {
            this.expandNode(root)
          }
        }
      },
      { allowSignalWrites: true }
    )

    effect(
      () => {
        this.displayedColumns.set([
          'levelNumber',
          ...this.columns().map((column) => column.name),
          'childrenCardinality'
        ])
      },
      { allowSignalWrites: true }
    )

    effect(
      () => {
        this.dataSource.data = this._data()
      },
      { allowSignalWrites: true }
    )
  }

  getValue(row: any, name: string) {
    return get(row, name)
  }

  /**
   * Toggle dimension member node expansion state
   */
  toggleNode(node: HierarchyTableDataType<T>) {
    if (node.expanded) {
      this._data.update((rows) => {
        // Close all children
        const fromIndex = rows.indexOf(node)
        const toIndex = findIndex(rows, (row) => row.levelNumber <= node.levelNumber, fromIndex + 1)
        rows.splice(fromIndex + 1, (toIndex > -1 ? toIndex : rows.length) - fromIndex - 1)
        rows[fromIndex] = { ...node, expanded: false }
        return [...rows]
      })
    } else {
      this.expandNode(node)
    }
  }

  expandNode(node: HierarchyTableDataType<T>) {
    if (node.expanded) {
      return
    }
    this._data.update((rows) => {
      const index = rows.indexOf(node)
      if (index === -1) {
        return rows
      }

      rows[index] = { ...node, expanded: true }

      // Open children and set them to not expanded
      rows.splice(index + 1, 0, ...node.children.map((child) => ({ ...child, expanded: false })))
      return [...rows]
    })
  }
}
