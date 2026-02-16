import { formatDate, formatNumber } from '@angular/common'
import {
  Component,
  EventEmitter,
  HostListener,
  Inject,
  Input,
  LOCALE_ID,
  OnInit,
  Optional,
  Output,
  ViewChild
} from '@angular/core'
import { Semantics } from '@metad/ocap-core'
import {
  AbstractStoryWidget,
  Intent,
  IStoryWidget,
  NxCoreService,
  NxSmartTableDataService,
  Semantic,
  TableColumn,
  WidgetService
} from '@metad/core'
import { NxSettingsPanelService } from '@metad/story/designer'
import { isDate } from 'date-fns'
import { Parser } from 'expr-eval'
import {
  IColumnSelectionEventArgs,
  IGridEditEventArgs,
  IgxGridBaseDirective,
  IgxGridComponent,
  IRowDataEventArgs,
  IRowDragEndEventArgs,
  IRowDragStartEventArgs
} from 'igniteui-angular'
import { isArray, merge } from 'lodash-es'
import { BehaviorSubject, combineLatest, EMPTY, Observable } from 'rxjs'
import { map, switchMap, tap } from 'rxjs/operators'
import { NxGridSelectionSummary, NX_GRID_SELECTION_SUMMARY } from './selection-summary.service'
import { NxSmartGridOptions, NX_SMART_GRID_DEFAULT_OPTIONS, WidgetDesignerType } from './types'

@Component({
  standalone: false,
  selector: 'pac-widget-smart-grid',
  templateUrl: './smart-grid.component.html',
  styleUrls: ['./smart-grid.component.scss'],
  providers: [NxSmartTableDataService]
})
export class StoryWidgetSmartGridComponent
  extends AbstractStoryWidget<NxSmartGridOptions>
  implements OnInit, IStoryWidget<NxSmartGridOptions>
{
  Semantics = Semantics

  @Input() useLocalData: boolean
  @Input() get data(): any[] {
    return this._data.getValue()
  }
  set data(value) {
    this._data.next(value)
  }
  _data = new BehaviorSubject(null)

  @Input() get columns(): Partial<TableColumn>[] {
    return this._columns$.getValue()
  }
  set columns(value) {
    this._columns$.next(value)
  }

  @Output() rowDragStart = new EventEmitter<IRowDragStartEventArgs>()
  @Output() rowDragEnd = new EventEmitter<IRowDragEndEventArgs>()
  @Output() onRowDeleted = new EventEmitter<IRowDataEventArgs>()
  @Output() rowEditEnter = new EventEmitter<IGridEditEventArgs>()
  @Output() rowEditDone = new EventEmitter<IGridEditEventArgs>()
  @Output() rowActionClick = new EventEmitter<any>()

  @Output() columnSelectionChange = new EventEmitter<IColumnSelectionEventArgs>()

  @ViewChild('grid', { read: IgxGridComponent, static: true })
  public grid: IgxGridBaseDirective

  // localData = []
  _columns$ = new BehaviorSubject<Partial<TableColumn>[]>([])
  // @todo 暂时使用 NxProperty 类型， 考虑更换成 TableColumn 类型
  columns$ = new BehaviorSubject<Partial<TableColumn>[]>([])

  // states for ContextMenu
  contextmenu = false
  public contextmenuX = 0
  public contextmenuY = 0
  public clickedCell = null

  public selectionSummaries = []
  constructor(
    public dataService: NxSmartTableDataService<any>,
    public coreService: NxCoreService,
    @Inject(NX_GRID_SELECTION_SUMMARY)
    public selectionSummary: NxGridSelectionSummary,
    @Optional()
    @Inject(NX_SMART_GRID_DEFAULT_OPTIONS)
    protected _defaultOptions: NxSmartGridOptions,

    @Optional()
    protected readonly widgetService?: WidgetService,
    @Optional()
    private readonly settingsService?: NxSettingsPanelService
  ) {
    super(widgetService)
    this.options = _defaultOptions
  }

  ngOnInit() {
    if (!this.useLocalData) {
      this.selectOptions$.pipe(untilDestroyed(this)).subscribe(selectOptions => {
        this.dataService.selectionVariant = {selectOptions}
        this.refresh()
      })
      
      this.dataSettings$.pipe(untilDestroyed(this)).subscribe(dataSettings => this.dataService.dataSettings = dataSettings)
      this.dataService.loading$.pipe(untilDestroyed(this)).subscribe((loading) => (this.grid.isLoading = loading))
      this.dataService.onChange().pipe(untilDestroyed(this)).subscribe(this._data)
      this.dataService.columns$.pipe(untilDestroyed(this)).subscribe(this._columns$)

      this.dataService.entityType$.pipe(untilDestroyed(this)).subscribe(() => {
        // 刷新数据总在初始化后
        this.refresh()
      })

      this.dataService.onAfterServiceInit().pipe(untilDestroyed(this)).subscribe(() => {
        this.dataService.refresh()
      })
    }

    combineLatest([
      this._columns$,
      this.options$
    ]).pipe(
        map(([columns, options]) => {
          return columns?.map((column) => {
            column = {
              ...column,
              type: column.type ?? column.dataType,
              filterable: column.filterable ?? options.allowFiltering,
              selectable: this.editable || (column.selectable ?? options.column?.selectable),
              groupable: column.groupable ?? (options.groupable && column.property.role !== 'measure')
            }

            column = merge(column, options?.column, options?.columns?.[column.name])
            if (column.semantic) {
              const semantic = isArray(column.semantic) ? column.semantic : [column.semantic]
              semantic.forEach((item) => {
                column.cellClasses = merge(column.cellClasses, this.resolveSemanticClasses(item, column.name))
              })
            }

            if (column.intent) {
              column.cellClasses = merge(column.cellClasses, {
                'ngm-navigation': true,
                'ngm-navigation--intent': true
              })
            }
            return column
          })
        }),
        tap((columns) => console.warn(columns))
      )
      .subscribe(this.columns$)
  }

  refresh() {
    this._data.next([])
    this.dataService.refresh()
  }

  public isDate(value: any) {
    if (value instanceof Date) {
      return true
    } else {
      return false
    }
  }

  formatValueText(fieldName, value) {
    const columns = this.columns$.getValue()
    const column = columns?.find((item) => item.name === fieldName)
    if (column?.text) {
      const text = this.data?.find((data) => data[fieldName] === value)?.[column?.text.name]
      return `${value}(${text})`
    }
    return value
  }

  /**
   * @hidden
   */
  private resolveSemanticClasses(semantic: Semantic, columnName: string): any {
    const classes = {}
    const baseClass = 'ngm-semantic'
    const parser = new Parser()
    const styles = semantic.style || ''
    Object.keys(semantic.expression).forEach((key) => {
      const expression = semantic.expression[key].replace(/\{Value\}/g, '__x__')
      const expr = parser.parse(expression)
      styles.split(' ').forEach((style) => {
        const className = style ? `${baseClass}--${key}--${style}` : `${baseClass}--${key}`
        classes[className] = (rowData: any, columnKey: any): boolean => {
          return expr.evaluate({ ...rowData, __x__: rowData[columnName] })
        }
      })
    })

    return classes
  }

  getColumn(name) {
    const columns = this.columns$.getValue()
    return columns?.find((column) => column.name === name)
  }

  onCellClick(eventArgs: any) {
    if (eventArgs.cell?.column.field) {
      const column = this.getColumn(eventArgs.cell?.column.field)
      if (column?.intent) {
        // eventArgs.event.preventDefault()
        const intent: Intent = {
          semanticObject: column?.intent.semanticObject,
          action: column?.intent.action,
          parameters: {}
        }

        column?.intent.mapping?.forEach(({ localProperty, semanticObjectProperty }) => {
          intent.parameters[semanticObjectProperty] = eventArgs.cell?.rowData[localProperty]
        })
        this.coreService.sendIntent(intent)
      }
    }
  }

  openContextMenu(cell) {
    //
  }

  @HostListener('window:click', ['$event'])
  public disableContextMenu(eventArgs) {
    if (this.contextmenu) {
      this.contextmenu = false
    }
  }

  public calculateSummary() {
    if (this.options?.showSelectionSummary) {
      this.selectionSummaries = this.selectionSummary.operate(this.toArray(this.grid.getSelectedData()))
    }
  }

  public toArray(data) {
    let result = []
    data.forEach((rec) => (result = result.concat(Object.values(rec))))
    return result
  }

  public format(value: any) {
    if (typeof value === 'number') {
      return formatNumber(value, this.locale)
    } else if (isDate(value)) {
      return formatDate(value, 'mediumDate', this.locale)
    }
    return value
  }

  public openSingleRowChart(cell: any) {
    //
  }

  _onRowDragStart(event) {
    this.rowDragStart.emit(event)
  }
  _onRowDragEnd(event) {
    this.rowDragEnd.emit(event)
  }
  _onRowDeleted(event) {
    this.onRowDeleted.emit(event)
  }

  // onColumnSelectionChanging(event: any) {
  //   console.log(event)
  //   this.calculateSummary()
  //   this.columnSelectionChange.emit(event)
  // }

  readonly onColumnSelectionChanging = this.effect((origin$: Observable<IColumnSelectionEventArgs>) => {
    return origin$.pipe(
      switchMap((event) => {
        const newSelection = event.newSelection[0]
        if (newSelection) {
          event.event.stopPropagation()
          return this.settingsService?.openDesigner(
            WidgetDesignerType.SmartGridColumn,
            this.options.columns?.[newSelection],
            `${this.key}/${newSelection}`
          )
          .pipe(
            tap((options) => this.updateColumnOptions({key: newSelection, options}))
          )
        }
        return EMPTY
      })
    )
  })

  _rowEditEnter(event) {
    this.rowEditEnter.emit(event)
  }

  _rowEditDone(event) {
    this.rowEditDone.emit(event)
  }

  _onRowActionClick(event) {
    this.rowActionClick.emit(event)
  }

  readonly updateColumnOptions = this.updater((state, { key, options }: { key: string; options: Record<string, unknown> }) => {
    state.options.columns = state.options?.columns || {}
    state.options.columns[key] = options
  })
}
