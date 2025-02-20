import { coerceBooleanProperty } from '@angular/cdk/coercion'
import { SelectionModel } from '@angular/cdk/collections'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, effect, forwardRef, input, Input, model, OnInit, TemplateRef, ViewChild } from '@angular/core'
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR, ReactiveFormsModule } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatCheckboxModule } from '@angular/material/checkbox'
import { MatIconModule } from '@angular/material/icon'
import { MatInputModule } from '@angular/material/input'
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator'
import { MatSort, MatSortModule } from '@angular/material/sort'
import { MatTableDataSource, MatTableModule } from '@angular/material/table'
import { DensityDirective, DisplayDensity } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import get from 'lodash-es/get'
import { NgmSearchComponent } from '../../search/search.component'

export type SelectionTableColumn = {
  value: string
  label: string
  cellTemplate?: TemplateRef<any>
  type?: 'boolean' | 'string' | 'number' | 'date'
  sticky?: boolean
}

/**
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
    MatCheckboxModule,
    MatTableModule,
    MatPaginatorModule,
    MatIconModule,
    MatButtonModule,
    MatSortModule,
    MatInputModule,
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
  
  @Input() displayDensity: DisplayDensity | string = DisplayDensity.comfortable
  readonly data = input<Array<any>>()
  readonly key = input.required<string>()

  @Input() columns: SelectionTableColumn[]

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

  @ViewChild(MatPaginator) paginator?: MatPaginator
  @ViewChild(MatSort) sort: MatSort

  displayedColumns: string[]

  selection = new SelectionModel<any>(false, [], true, (a, b) => {
    return a[this.key()] === b[this.key()]
  })

  dataSource = new MatTableDataSource([])
  readonly searchText = model('')

  constructor() {
    effect(() => {
      this.dataSource.data = this.data() || []
    }, { allowSignalWrites: true })
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
    this.displayedColumns = ['select', ...this.columns.map(({ value }) => value)]
    this.selection.changed.subscribe(() => {
      if (this.multiple) {
        this.onChange(this.selection.selected)
      } else {
        this.onChange(this.selection.selected[0])
      }
    })
  }

  ngAfterViewInit() {
    this.dataSource.paginator = this.paginator
    this.dataSource.sort = this.sort
    // If the user changes the sort order, reset back to the first page.
    this.sort?.sortChange.subscribe((sort) => {
      if (this.paginator) {
        this.paginator.pageIndex = 0
      }
    })
  }

  writeValue(obj: any): void {
    if (obj) {
      this.selection.select(obj)
    } else {
      this.selection.clear()
    }
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
    this.dataSource.filter = filterValue.trim().toLowerCase()
    if (this.dataSource.paginator) {
      this.dataSource.paginator.firstPage()
    }
  }

  _context(data: Record<string, unknown>, column) {
    return {
      ...data,
      $implicit: get(data, column.name)
    }
  }

  onChangeRow(row) {
    this.selection.toggle(row)
  }
}
