import { coerceBooleanProperty } from '@angular/cdk/coercion'
import { SelectionModel } from '@angular/cdk/collections'
import { CommonModule } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  HostListener,
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
import { DisplayDensity, OcapCoreModule } from '@xpert-ai/ocap-angular/core'
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
const DEFAULT_COLUMN_WIDTH = 160
const DEFAULT_MIN_COLUMN_WIDTH = 80

interface ColumnResizeState {
  columnName: string
  startX: number
  startWidth: number
}

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
    if(!Array.isArray(this.data())){
      return [];
    }
    let rows = [...(this.data() as any[])]
    rows = filterTableRowsByColumn(rows, this.searchingColumn(), this.searchValue())
    rows = sortTableRows(rows, this.sortState())
    return rows
  })
  readonly rows = computed(() =>
    this.paging() ? paginateTableRows(this.processedRows(), this.pageIndex(), this.pageSize()) : this.processedRows()
  )
  readonly tableMinWidth = computed(() => {
    const columns = this.columns() ?? []
    const selectionWidth = this.selectable() ? SELECT_COLUMN_WIDTH : 0
    return columns.reduce((width, column) => width + this.columnWidthPx(column, DEFAULT_COLUMN_WIDTH), selectionWidth)
  })
  readonly stickyStartOffsets = computed(() => {
    const offsets = new Map<string, number>()
    let offset = this.selectable() ? SELECT_COLUMN_WIDTH : 0

    for (const column of this.columns() ?? []) {
      if (column.sticky) {
        offsets.set(column.name, offset)
        offset += this.columnWidthPx(column, DEFAULT_COLUMN_WIDTH)
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
        offset += this.columnWidthPx(column, DEFAULT_COLUMN_WIDTH)
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
  readonly resizedWidths = signal(new Map<string, number>())
  readonly resizingColumn = signal<string | null>(null)

  #activeResize: ColumnResizeState | null = null

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
      }
    )

    effect(
      () => {
        const pageSize = this.pageSize()
        const processedRows = this.processedRows()
        const maxPageIndex = pageSize > 0 ? Math.max(Math.ceil(processedRows.length / pageSize) - 1, 0) : 0
        if (this.pageIndex() > maxPageIndex) {
          this.pageIndex.set(maxPageIndex)
        }
      }
    )
  }

  _context(data: unknown, column: TableColumn) {
    const context =
      data && typeof data === 'object'
        ? ({ ...(data as Record<string, unknown>) } satisfies Record<string, unknown>)
        : {}

    return {
      ...context,
      $implicit: get(data, column.name)
    }
  }

  getValue(row: any, name: string) {
    return get(row, name)
  }

  displayValue(row: unknown, column: TableColumn): unknown {
    const value = this.getValue(row, column.name)
    return column.pipe ? column.pipe(value) : value
  }

  cellTitle(row: unknown, column: TableColumn): string | null {
    if (this.hasCellTemplate(column)) {
      return null
    }

    return this.titleValue(this.displayValue(row, column))
  }

  contentClass(column: TableColumn) {
    const shouldClamp = this.shouldClampContent(column)
    return [
      'block min-w-0 max-w-full',
      shouldClamp ? 'overflow-hidden' : '',
      !this.hasCellTemplate(column) && shouldClamp ? 'text-ellipsis' : '',
      column.contentClass ?? ''
    ]
  }

  columnWidth(column: Pick<TableColumn, 'name' | 'width'>): string | null {
    return `${this.columnWidthPx(column, DEFAULT_COLUMN_WIDTH)}px`
  }

  columnMaxWidth(column: Pick<TableColumn, 'name' | 'maxWidth'>): string | null {
    if (this.resizedWidths().has(column.name)) {
      return null
    }

    return column.maxWidth || null
  }

  canResizeColumn(column: Pick<TableColumn, 'resizable'>) {
    return column.resizable !== false
  }

  startColumnResize(event: MouseEvent, column: TableColumn, headerCell: unknown) {
    if (event.button !== 0 || !this.canResizeColumn(column)) {
      return
    }

    event.preventDefault()
    event.stopPropagation()

    const element = this.resolveHeaderCell(event, headerCell)
    if (!element) {
      return
    }

    this.#activeResize = {
      columnName: column.name,
      startX: event.clientX,
      startWidth: this.measureColumnWidth(element, column)
    }

    this.resizingColumn.set(column.name)

    if (typeof document !== 'undefined') {
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    }
  }

  @HostListener('document:mousemove', ['$event'])
  onDocumentMouseMove(event: MouseEvent) {
    if (!this.#activeResize) {
      return
    }

    const activeColumnName = this.#activeResize.columnName
    const column = this.columns()?.find(({ name }) => name === activeColumnName)
    if (!column) {
      this.stopColumnResize()
      return
    }

    const width = this.clampColumnWidth(column, this.#activeResize.startWidth + event.clientX - this.#activeResize.startX)
    this.resizedWidths.update((widths) => {
      const nextWidths = new Map(widths)
      nextWidths.set(column.name, width)
      return nextWidths
    })
  }

  @HostListener('document:mouseup')
  @HostListener('window:blur')
  stopColumnResize() {
    if (!this.#activeResize) {
      return
    }

    this.#activeResize = null
    this.resizingColumn.set(null)

    if (typeof document !== 'undefined') {
      document.body.style.removeProperty('cursor')
      document.body.style.removeProperty('user-select')
    }
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

  private clampColumnWidth(column: Pick<TableColumn, 'minWidth' | 'maxWidth'>, width: number) {
    const minWidth = parseTableWidthToPx(column.minWidth, DEFAULT_MIN_COLUMN_WIDTH)
    return Math.max(minWidth, width)
  }

  private columnWidthPx(column: Pick<TableColumn, 'name' | 'width' | 'minWidth'>, fallback: number) {
    const resizedWidth = this.resizedWidths().get(column.name)
    if (resizedWidth !== undefined) {
      return resizedWidth
    }

    const configuredWidth = parseTableWidthToPx(column.width, fallback)
    const minWidth = parseTableWidthToPx(column.minWidth, 0)
    return Math.max(configuredWidth, minWidth)
  }

  private hasCellTemplate(column: Pick<TableColumn, 'cellTemplate'>) {
    return isSignal(column.cellTemplate) || !!column.cellTemplate
  }

  private measureColumnWidth(headerCell: HTMLElement, column: Pick<TableColumn, 'name' | 'width' | 'minWidth'>) {
    const rectWidth = headerCell.getBoundingClientRect().width
    if (rectWidth > 0) {
      return rectWidth
    }

    const configuredWidth = this.columnWidthPx(column, 0)
    if (configuredWidth > 0) {
      return configuredWidth
    }

    const computedWidth =
      typeof getComputedStyle === 'function' ? parseTableWidthToPx(getComputedStyle(headerCell).width, 0) : 0

    if (computedWidth > 0) {
      return computedWidth
    }

    return parseTableWidthToPx(column.minWidth, DEFAULT_COLUMN_WIDTH)
  }

  private resolveHeaderCell(event: MouseEvent, headerCell: unknown) {
    if (headerCell instanceof HTMLElement) {
      return headerCell
    }

    if (event.currentTarget instanceof HTMLElement) {
      const closestHeader = event.currentTarget.closest('th')
      if (closestHeader instanceof HTMLElement) {
        return closestHeader
      }
    }

    return null
  }

  private shouldClampContent(column: Pick<TableColumn, 'name' | 'width' | 'maxWidth' | 'cellTemplate'>) {
    if (this.hasCellTemplate(column)) {
      return false
    }

    return this.columnWidth(column) !== null || !!column.maxWidth
  }

  private titleValue(value: unknown): string | null {
    if (value === null || value === undefined) {
      return null
    }

    if (typeof value === 'string') {
      return value || null
    }

    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
      return String(value)
    }

    if (value instanceof Date) {
      return value.toISOString()
    }

    return null
  }
}
