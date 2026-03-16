import { coerceBooleanProperty } from '@angular/cdk/coercion'
import { SelectionModel } from '@angular/cdk/collections'
import { CommonModule } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  isSignal,
  output,
  signal
} from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms'

import {
  ZardButtonComponent,
  type ZardPageEvent,
  ZardIconComponent,
  ZardInputDirective,
  ZardCheckboxComponent,
  ZardPaginatorComponent,
  ZardTableImports,
  ZardTooltipImports,
  type ZardTableSortDirection
} from '@xpert-ai/headless-ui'
import { DisplayDensity, OcapCoreModule } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import get from 'lodash-es/get'
import { TableColumn } from '../types'
import {
  displayDensityToTableSize,
  filterTableRowsByColumn,
  paginateTableRows,
  parseTableWidthToPx,
  sortTableRows,
  type TableSortState
} from '../table.utils'

const SELECT_COLUMN_WIDTH = 56
const DEFAULT_STICKY_START_WIDTH = 180
const DEFAULT_STICKY_END_WIDTH = 128

/**
 * @deprecated use tailwindcss
 */
@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'ngm-table',
  templateUrl: './table.component.html',
  styleUrls: [`table.component.scss`],
  host: {
    class: 'ngm-table'
  },
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ZardCheckboxComponent,
    ...ZardTableImports,
    ZardPaginatorComponent,
    ZardIconComponent,
    ZardButtonComponent,
    ...ZardTooltipImports,
    ZardInputDirective,
    TranslateModule,

    //OCAP Modules
    OcapCoreModule
  ]
})
export class NgmTableComponent {
  isSignal = isSignal

  /**
  |--------------------------------------------------------------------------
  | Inputs and Outputs
  |--------------------------------------------------------------------------
  */
  readonly data = input<Array<unknown>>([])

  readonly columns = input<Array<TableColumn>>(null)

  readonly paging = input<boolean, boolean | string>(false, {
    transform: coerceBooleanProperty
  })

  readonly pageSizeOptions = input<number[]>([20, 50, 100])

  readonly grid = input<boolean, boolean | string>(false, {
    transform: coerceBooleanProperty
  })

  readonly selectable = input<boolean, boolean | string>(false, {
    transform: coerceBooleanProperty
  })

  readonly displayDensity = input<DisplayDensity | string>(DisplayDensity.compact)

  /**
   * A cell or row was selected.
   */
  readonly rowSelectionChanging = output<any[]>()

  /**
  |--------------------------------------------------------------------------
  | Signals
  |--------------------------------------------------------------------------
  */
  readonly searchControl = new FormControl<string>('', { nonNullable: true })
  readonly displayedColumns = computed<string[]>(() => {
    const columns = this.columns() ?? []
    const displayedColumns = columns.map(({ name }) => name)
    return this.selectable() ? ['select', ...displayedColumns] : displayedColumns
  })
  readonly tableSize = computed(() => displayDensityToTableSize(this.displayDensity()))
  readonly processedRows = computed(() => {
    let rows = [...(this.data() as any[])]
    rows = filterTableRowsByColumn(rows, this.searchingColumn(), this.searchValue())
    rows = sortTableRows(rows, this.sortState())
    return rows
  })
  readonly rows = computed(() =>
    this.paging() ? paginateTableRows(this.processedRows(), this.pageIndex(), this.pageSize()) : this.processedRows()
  )
  readonly stickyStartOffsets = computed(() => {
    const offsets = new Map<string, number>()
    let offset = this.selectable() ? SELECT_COLUMN_WIDTH : 0

    for (const column of this.columns() ?? []) {
      if (column.sticky) {
        offsets.set(column.name, offset)
        offset += parseTableWidthToPx(column.width, DEFAULT_STICKY_START_WIDTH)
      }
    }

    return offsets
  })
  readonly stickyEndOffsets = computed(() => {
    const offsets = new Map<string, number>()
    let offset = 0

    for (const column of [...(this.columns() ?? [])].reverse()) {
      if (column.stickyEnd) {
        offsets.set(column.name, offset)
        offset += parseTableWidthToPx(column.width, DEFAULT_STICKY_END_WIDTH)
      }
    }

    return offsets
  })

  readonly searchValue = signal('')
  readonly searchingColumn = signal<string | null>(null)
  readonly sortState = signal<TableSortState>({ active: null, direction: '' })
  readonly pageIndex = signal(0)
  readonly pageSize = signal(20)
  readonly selection = new SelectionModel<any>(true, [])

  readonly #searchValueSub = this.searchControl.valueChanges.subscribe((value) => {
    this.searchValue.set(value ?? '')
    this.pageIndex.set(0)
  })

  constructor() {
    this.selection.changed.pipe(takeUntilDestroyed()).subscribe(() => {
      this.rowSelectionChanging.emit(this.selection.selected)
    })

    effect(
      () => {
        const pageSizeOptions = this.pageSizeOptions()
        if (!pageSizeOptions?.length) {
          this.pageSize.set(20)
          return
        }

        if (!pageSizeOptions.includes(this.pageSize())) {
          this.pageSize.set(pageSizeOptions[0])
        }
      },
      { allowSignalWrites: true }
    )

    effect(
      () => {
        const pageSize = this.pageSize()
        const processedRows = this.processedRows()
        const maxPageIndex = pageSize > 0 ? Math.max(Math.ceil(processedRows.length / pageSize) - 1, 0) : 0
        if (this.pageIndex() > maxPageIndex) {
          this.pageIndex.set(maxPageIndex)
        }
      },
      { allowSignalWrites: true }
    )
  }

  _context(data: Record<string, unknown>, column: TableColumn) {
    return {
      ...data,
      $implicit: get(data, column.name)
    }
  }

  getValue(row: any, name: string) {
    return get(row, name)
  }

  escapeSearching(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      this.searchingColumn.set(null)
      this.searchControl.setValue('')
    }
  }

  toggleSearchingColumn(columnName: string) {
    const nextColumn = this.searchingColumn() === columnName ? null : columnName
    this.searchingColumn.set(nextColumn)
    this.searchControl.setValue('')
  }

  onSortChange(columnName: string, direction: ZardTableSortDirection) {
    this.sortState.set({
      active: direction ? columnName : null,
      direction
    })
    this.pageIndex.set(0)
  }

  onPage(event: ZardPageEvent) {
    this.pageIndex.set(event.pageIndex)
    this.pageSize.set(event.pageSize)
  }

  sortDirection(columnName: string): ZardTableSortDirection {
    const sortState = this.sortState()
    return sortState.active === columnName ? sortState.direction : ''
  }

  stickyStartOffset(columnName: string) {
    return this.stickyStartOffsets().get(columnName) ?? null
  }

  stickyEndOffset(columnName: string) {
    return this.stickyEndOffsets().get(columnName) ?? null
  }

  stickyZIndex(column: Pick<TableColumn, 'sticky' | 'stickyEnd'> | undefined, isHeader = false) {
    if (column?.sticky || column?.stickyEnd) {
      return isHeader ? 5 : 4
    }

    return isHeader ? 3 : 1
  }

  /** Whether the number of selected elements matches the total number of rows. */
  isAllSelected() {
    const numSelected = this.selection.selected.length
    const numRows = this.rows().length
    return numSelected === numRows
  }

  /** Selects all rows if they are not all selected; otherwise clear selection. */
  toggleAllRows() {
    if (this.isAllSelected()) {
      this.selection.clear()
      return
    }

    this.selection.select(...this.rows())
  }

  /** The label for the checkbox on the passed row */
  checkboxLabel(row?: any): string {
    if (!row) {
      return `${this.isAllSelected() ? 'deselect' : 'select'} all`
    }
    return `${this.selection.isSelected(row) ? 'deselect' : 'select'} row ${row.position + 1}`
  }
}
