import { Component, booleanAttribute, computed, effect, input, signal } from '@angular/core'
import { ZardButtonComponent, ZardIconComponent, ZardPaginatorComponent, type ZardPageEvent, ZardTableImports } from '@xpert-ai/headless-ui'

import { NgmDisplayBehaviourComponent, TableColumn } from '@metad/ocap-angular/common'
import { DensityDirective, DisplayDensity } from '@metad/ocap-angular/core'
import { DisplayBehaviour } from '@metad/ocap-core'
import { serializeMemberCaption } from '@metad/ocap-sql'
import { findIndex, get } from 'lodash-es'
import { HierarchyTableDataType } from '../types'
import { CommonModule } from '@angular/common'
import { TranslateModule } from '@ngx-translate/core'

type LevelTableColumn = TableColumn & { captionName: string }
const DEFAULT_PAGE_SIZE_OPTIONS = [100, 200, 500, 1000]

@Component({
  standalone: true,
  selector: 'ngm-hierarchy-table',
  templateUrl: 'hierarchy-table.component.html',
  styleUrls: ['hierarchy-table.component.scss'],
  host: {
    class: 'ngm-hierarchy-table'
  },
  providers: [],
  imports: [
    CommonModule,
    ...ZardTableImports,
    ZardIconComponent,
    ZardButtonComponent,
    ZardPaginatorComponent,
    TranslateModule,
    DensityDirective,
    NgmDisplayBehaviourComponent
  ]
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
  readonly pageSizeOptions = input<number[]>([100, 200, 500, 1000])

  /**
  |--------------------------------------------------------------------------
  | Signals
  |--------------------------------------------------------------------------
  */
  readonly _data = signal<HierarchyTableDataType<T>[]>([])
  readonly displayedColumns = signal<string[]>([])
  readonly pageIndex = signal(0)
  readonly pageSize = signal(DEFAULT_PAGE_SIZE_OPTIONS[0])
  readonly rows = computed(() => {
    const data = this._data()
    if (!this.paging()) {
      return data
    }

    const start = this.pageIndex() * this.pageSize()
    return data.slice(start, start + this.pageSize())
  })
  readonly tableSize = computed(() => {
    switch (this.displayDensity()) {
      case DisplayDensity.comfortable:
        return 'comfortable'
      case DisplayDensity.compact:
        return 'compact'
      default:
        return 'default'
    }
  })

  constructor() {
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
      }
    )

    effect(
      () => {
        this.displayedColumns.set([
          'levelNumber',
          ...this.columns().map((column) => column.name),
          'childrenCardinality'
        ])
      }
    )

    effect(
      () => {
        const pageSizeOptions = this.pageSizeOptions()
        if (!pageSizeOptions?.length) {
          this.pageSize.set(DEFAULT_PAGE_SIZE_OPTIONS[0])
          return
        }

        if (!pageSizeOptions.includes(this.pageSize())) {
          this.pageSize.set(pageSizeOptions[0])
        }
      }
    )

    effect(
      () => {
        const maxPageIndex = Math.max(Math.ceil(this._data().length / this.pageSize()) - 1, 0)
        if (this.pageIndex() > maxPageIndex) {
          this.pageIndex.set(maxPageIndex)
        }
      }
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

  onPage(event: ZardPageEvent) {
    this.pageIndex.set(event.pageIndex)
    this.pageSize.set(event.pageSize)
  }
}
