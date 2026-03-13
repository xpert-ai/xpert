import { coerceBooleanProperty } from '@angular/cdk/coercion'
import { SelectionModel } from '@angular/cdk/collections'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { CommonModule } from '@angular/common'
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Injector,
  afterNextRender,
  effect,
  inject,
  input,
  isSignal,
  output,
  runInInjectionContext,
  signal,
  viewChild
} from '@angular/core'
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms'

import {
  ZardButtonComponent,
  ZardIconComponent,
  ZardInputDirective,
  ZardCheckboxComponent,
  ZardPaginatorComponent,
  type ZardPaginatorLike
} from '@xpert-ai/headless-ui'
import { MatSort, MatSortModule } from '@angular/material/sort'
import { MatTableDataSource, MatTableModule } from '@angular/material/table'
import { DisplayDensity, OcapCoreModule } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import get from 'lodash-es/get'
import { TableColumn } from '../types'

type PagedTableDataSource<T> = Omit<MatTableDataSource<T>, 'paginator'> & {
  paginator: ZardPaginatorLike | null
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
    DragDropModule,
    FormsModule,
    ReactiveFormsModule,
    ZardCheckboxComponent,
    MatTableModule,
    ZardPaginatorComponent,
    ZardIconComponent,
    ZardButtonComponent,
    MatSortModule,
    ZardInputDirective,
    TranslateModule,

    //OCAP Modules
    OcapCoreModule
  ]
})
export class NgmTableComponent {
  readonly #injector = inject(Injector)
  readonly #cdr = inject(ChangeDetectorRef)

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
  | Child Components
  |--------------------------------------------------------------------------
  */
  readonly paginator = viewChild(ZardPaginatorComponent)
  readonly sort = viewChild(MatSort)

  /**
  |--------------------------------------------------------------------------
  | Signals
  |--------------------------------------------------------------------------
  */
  readonly displayedColumns = signal<string[]>([])

  dataSource = new MatTableDataSource<any>() as PagedTableDataSource<any>

  searchControl = new FormControl<string>('')
  searchingColumn = ''
  selection = new SelectionModel<any>(true, [])

  readonly #searchValueSub = this.searchControl.valueChanges.subscribe((value) => {
    this.dataSource.filter = value
  })

  constructor() {
    this.selection.changed.subscribe(() => {
      this.#cdr.detectChanges()
      this.rowSelectionChanging.emit(this.selection.selected)
    })

    afterNextRender(() => {
      this.dataSource.paginator = this.paginator() ?? null
      this.dataSource.sort = this.sort()
      // If the user changes the sort order, reset back to the first page.
      this.sort()?.sortChange.subscribe((sort) => {
        if (this.paginator()) {
          this.paginator().pageIndex = 0
        }
      })

      this.dataSource.filterPredicate = (data: any, filter: string): boolean => {
        // Transform the data into a lowercase string of all property values.
        const dataStr = ('' + data[this.searchingColumn]).toLowerCase()

        // Transform the filter by converting it to lowercase and removing whitespace.
        const transformedFilter = filter.trim().toLowerCase()

        return dataStr.indexOf(transformedFilter) != -1
      }

      runInInjectionContext(this.#injector, () => {
        effect(
          () => {
            this.dataSource.data = this.data()
          },
          { allowSignalWrites: true }
        )
      })
    })

    effect(
      () => {
        const columns = this.columns()
        if (columns) {
          this.displayedColumns.set(columns.map(({ name }) => name))
          if (this.selectable()) {
            this.displayedColumns.update((columns) => {
              columns.unshift('select')
              return [...columns]
            })
          }
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

  escapeSearching(event) {
    if (event.key === 'Escape') {
      this.searchingColumn = ''
      this.searchControl.setValue('')
    }
  }

  /** Whether the number of selected elements matches the total number of rows. */
  isAllSelected() {
    const numSelected = this.selection.selected.length
    const numRows = this.dataSource.data.length
    return numSelected === numRows
  }

  /** Selects all rows if they are not all selected; otherwise clear selection. */
  toggleAllRows() {
    if (this.isAllSelected()) {
      this.selection.clear()
      return
    }

    this.selection.select(...this.dataSource.data)
  }

  /** The label for the checkbox on the passed row */
  checkboxLabel(row?: any): string {
    if (!row) {
      return `${this.isAllSelected() ? 'deselect' : 'select'} all`
    }
    return `${this.selection.isSelected(row) ? 'deselect' : 'select'} row ${row.position + 1}`
  }
}
