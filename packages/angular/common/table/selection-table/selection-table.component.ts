import { coerceBooleanProperty } from '@angular/cdk/coercion'
import { SelectionModel } from '@angular/cdk/collections'
import { CommonModule } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  forwardRef,
  inject,
  input,
  Input,
  computed,
  model,
  OnInit,
  TemplateRef,
  signal
} from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR, ReactiveFormsModule } from '@angular/forms'

import {
  type ZardPageEvent,
  ZardCheckboxComponent,
  ZardPaginatorComponent,
  ZardTableImports,
  type ZardTableSortDirection
} from '@xpert-ai/headless-ui'
import { DensityDirective, DisplayDensity } from '@xpert-ai/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import get from 'lodash-es/get'
import { NgmSearchComponent } from '../../search/search.component'
import {
  displayDensityToTableSize,
  filterTableRowsByColumns,
  paginateTableRows,
  parseTableWidthToPx,
  sortTableRows,
  type TableSortState
} from '../table.utils'

export type SelectionTableColumn = {
  value: string
  label: string
  cellTemplate?: TemplateRef<any>
  type?: 'boolean' | 'string' | 'number' | 'date'
  sticky?: boolean
}

/**
 * @deprecated use headless components instead
 */
@Component({
  standalone: true,
  selector: 'ngm-selection-table',
  templateUrl: './selection-table.component.html',
  styleUrls: ['./selection-table.component.scss'],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    ZardCheckboxComponent,
    ...ZardTableImports,
    ZardPaginatorComponent,
    DensityDirective,
    NgmSearchComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => NgmSelectionTableComponent),
      multi: true
    }
  ]
})
export class NgmSelectionTableComponent implements OnInit, ControlValueAccessor {
  get = get
  readonly defaultPageSizeOptions = [10, 20, 50, 100]
  private readonly destroyRef = inject(DestroyRef)

  readonly displayDensity = input<DisplayDensity | string>(DisplayDensity.comfortable)
  readonly data = input<Array<any>>()
  readonly key = input.required<string>()

  readonly columns = input<SelectionTableColumn[]>([])

  @Input() get multiple() {
    return this._multiple
  }
  set multiple(value: boolean | string) {
    this._multiple = coerceBooleanProperty(value)
  }
  private _multiple = false

  @Input() get grid() {
    return this._grid
  }
  set grid(value: string | boolean) {
    this._grid = coerceBooleanProperty(value)
  }
  private _grid = false

  @Input() disabled = false

  readonly displayedColumns = computed(() => ['select', ...this.columns().map(({ value }) => value)])
  readonly tableSize = computed(() => displayDensityToTableSize(this.displayDensity()))
  readonly filteredRows = computed(() =>
    filterTableRowsByColumns(this.data() ?? [], this.columns().map(({ value }) => value), this.searchText())
  )
  readonly rows = computed(() => paginateTableRows(sortTableRows(this.filteredRows(), this.sortState()), this.pageIndex(), this.pageSize()))
  readonly stickyOffsets = computed(() => {
    const offsets = new Map<string, number>()
    let offset = 56

    for (const column of this.columns()) {
      if (column.sticky) {
        offsets.set(column.value, offset)
        offset += parseTableWidthToPx(null, 180)
      }
    }

    return offsets
  })

  selection = new SelectionModel<any>(false, [], true, (a, b) => {
    return a[this.key()] === b[this.key()]
  })

  readonly searchText = model('')
  readonly sortState = signal<TableSortState>({ active: null, direction: '' })
  readonly pageIndex = signal(0)
  readonly pageSize = signal(this.defaultPageSizeOptions[0])

  constructor() {
    effect(
      () => {
        const rows = this.filteredRows()
        const maxPageIndex = Math.max(Math.ceil(rows.length / this.pageSize()) - 1, 0)
        if (this.pageIndex() > maxPageIndex) {
          this.pageIndex.set(maxPageIndex)
        }
      }
    )
  }

  /**
   * Invoked when the model has been changed
   */
  onChange: (_: any) => void = (_: any) => {}
  /**
   * Invoked when the model has been touched
   */
  onTouched: () => void = () => {}

  ngOnInit(): void {
    if (this.multiple) {
      this.selection = new SelectionModel<any>(true, [], true, (a, b) => {
        return a[this.key()] === b[this.key()]
      })
    }
    this.selection.changed.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      if (this.multiple) {
        this.onChange(this.selection.selected)
      } else {
        this.onChange(this.selection.selected[0])
      }
    })
  }

  writeValue(obj: any): void {
    this.selection.clear()

    if (!obj) {
      return
    }

    if (this.multiple && Array.isArray(obj)) {
      this.selection.select(...obj)
      return
    }

    this.selection.select(obj)
  }
  registerOnChange(fn: any): void {
    this.onChange = fn
  }
  registerOnTouched(fn: any): void {
    this.onTouched = fn
  }
  setDisabledState?(isDisabled: boolean): void {
    this.disabled = isDisabled
  }

  applyFilter(filterValue: string) {
    this.searchText.set(filterValue?.trim().toLowerCase() ?? '')
    this.pageIndex.set(0)
  }

  _context(data: Record<string, unknown>, column) {
    return {
      ...data,
      $implicit: get(data, column.value)
    }
  }

  onChangeRow(row) {
    if (this.disabled) {
      return
    }
    this.selection.toggle(row)
  }

  onSortChange(columnName: string, direction: ZardTableSortDirection) {
    this.sortState.set({
      active: direction ? columnName : null,
      direction
    })
    this.pageIndex.set(0)
  }

  sortDirection(columnName: string): ZardTableSortDirection {
    const sortState = this.sortState()
    return sortState.active === columnName ? sortState.direction : ''
  }

  onPage(event: ZardPageEvent) {
    this.pageIndex.set(event.pageIndex)
    this.pageSize.set(event.pageSize)
  }

  stickyOffset(columnName: string) {
    return this.stickyOffsets().get(columnName) ?? null
  }
}
