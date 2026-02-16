import { ChangeDetectorRef, Component, Input, OnInit, Optional } from '@angular/core'
import { AbstractStoryWidget, IStoryWidget, Semantic, WidgetService } from '@metad/core'
import { getEntityProperty, getPropertyName, isDimension, RecursiveHierarchyType } from '@metad/ocap-core'
import { NxSettingsPanelService } from '@metad/story/designer'
import { Parser } from 'expr-eval'
import { IColumnSelectionEventArgs } from 'igniteui-angular'
import { assign, isArray, isEmpty, isEqual, isNil, merge } from 'lodash-es'
import {
  BehaviorSubject,
  combineLatest,
  distinctUntilChanged,
  EMPTY,
  map,
  Observable,
  pluck,
  switchMap,
  tap,
  withLatestFrom
} from 'rxjs'
import { PivotGridDataService } from './pivot-grid-data.service'
import { NxSmartGridOptions, PivotGridColumn, PIVOT_GRID_MENUS, WidgetDesignerType } from './types'
import { NgmAppearance } from '@metad/ocap-angular/core'
import { TreeGridGroupingPipe } from './tree-grid-grouping.pipe'

@UntilDestroy()
@Component({
  standalone: false,
  selector: 'pac-widget-pivot-grid',
  templateUrl: './pivot-grid.component.html',
  styleUrls: ['./pivot-grid.component.scss'],
  host: {
    class: 'pac-widget-pivot-grid'
  },
  providers: [PivotGridDataService]
})
export class PACWidgetPivotGridComponent
  extends AbstractStoryWidget<NxSmartGridOptions>
  implements OnInit, IStoryWidget<NxSmartGridOptions>
{
  isArray = isArray

  @Input() styling: {
    appearance: NgmAppearance
  }

  readonly analytics$ = this.dataSettings$.pipe(pluck('analytics'), distinctUntilChanged(isEqual))
  readonly columnsOption$ = this.options$.pipe(pluck('columns'))

  private _rows$ = new BehaviorSubject<Array<PivotGridColumn>>([])
  public readonly rows$ = combineLatest([this._rows$, this.columnsOption$]).pipe(
    map(([rows, columns]) => {
      rows.forEach((row) => {
        const column = isArray(columns) ? columns.find((col) => col.name === row.name) : columns?.[row.name]
        if (column) {
          assign(row, column)
          // if (column.groupable && column.property.role !== 'measure') {
          //   row.groupable = true
          // }
          if (column.semantic) {
            const semantic = isArray(column.semantic) ? column.semantic : [column.semantic]
            semantic.forEach((item) => {
              row.cellClasses = merge(row.cellClasses, this.resolveSemanticClasses(item, column.name))
            })
          }
        }
      })

      console.warn(rows, columns)

      return rows
    })
  )

  public readonly columns$ = combineLatest([this.dataService.selectResult(), this.options$]).pipe(
    map(([result, options]) => {
      return result.schema.columns.map((column) => {
        return merge(column, options?.column, options?.columns?.[column.name]) as any
      })
    }),
    tap((columns) => console.log(columns))
  )

  // hierarchy
  recursiveHierarchy: RecursiveHierarchyType

  groupsExpanded: boolean
  collapsible = true

  readonly localData$ = this.dataService.selectResult().pipe(
    withLatestFrom(this.analytics$),
    map(([result, analytics]) => {
      console.warn(`story table result`, result, `analytics annotation`, analytics)

      if (result.error) {
        console.error(result.error)
      } else {
        if (analytics.rows.length > 1) {
          const groupingPipe = new TreeGridGroupingPipe()
          const data = groupingPipe.transform(
            result.data,
            analytics.rows.map(getPropertyName),
            [],
            '__groupColumnKey__',
            'id',
            'children'
          )
          // console.warn(data)
        }

        // const hierarchy = getRowHierarchy(analytics.rows, result.schema?.analytics)

        this.recursiveHierarchy = result.schema.recursiveHierarchy

        const entityType = this.dataService.getEntityType()

        let rows = []
        analytics.rows.forEach((item) => {
          // console.warn(item)
          const property = getEntityProperty(entityType, item)
          const column: any = {
            ...property
          }
          if (isDimension(item) && !isEmpty(item.properties)) {
            column.columns = []
            column.columns.push({ isSummary: true, ...getEntityProperty(entityType, item) })
            column.columns.push({ isSummary: false, ...getEntityProperty(entityType, item) })
            item.properties.forEach((name) => {
              column.columns.push({ isSummary: false, name, label: name })
            })
          }
          rows.push(column)
        })

        if (isNil(result.schema.rows)) {
          rows = result.schema.columns
        } else {
          // this.columnHeader = result.schema.columns.map((col) => ({ ...col })) // dataType: GridColumnDataType.Percent
        }

        this._rows$.next(rows)

        return result.data
      }

      return null
    })
  )

  constructor(
    private readonly dataService: PivotGridDataService,
    private readonly _cdr: ChangeDetectorRef,
    @Optional()
    protected readonly widgetService?: WidgetService,
    @Optional()
    private readonly settingsService?: NxSettingsPanelService
  ) {
    super(widgetService)
  }

  ngOnInit(): void {
    this.dataService.loading$.subscribe((status) => {
      this.isLoading$.next(status)
      if (status) {
        // 当 columnHeader 列个数不同变化时会出现多余列的 bug 所以在请求下一次数据之前讲列配置清空
        // this.columnHeader = null
        this._cdr.detectChanges()
      }
    })

    this.dataService.onAfterServiceInit().subscribe((value) => {
      this.refresh()
    })

    this.dataSettings$.pipe(untilDestroyed(this)).subscribe((dataSettings) => {
      this.dataService.dataSettings = dataSettings
      // 顺便赋值 filterContainer 以后弃用 filterContainer
      // this.dataService.filterContainer = this.filterContainer
    })
    this.analytics$.pipe(untilDestroyed(this)).subscribe((analytics) => (this.dataService.analytics = analytics))
    this.selectionVariant$
      .pipe(untilDestroyed(this))
      .subscribe((selectionVariant) => (this.dataService.selectionVariant = selectionVariant))

    // this.select(analytics$, this.selectionVariant$, (analytics, selectionVariant) => {
    //   this.dataService.options = {
    //     analytics,
    //     selectionVariant,
    //   }
    // })

    this.widgetService?.setMenus(PIVOT_GRID_MENUS)
    this.widgetService?.onMenuClick().subscribe((menu) => {
      if (menu.key === 'swapAxis') {
        this.swapAxis()
      } else {
        console.warn(menu)
      }
    })
  }

  refresh() {
    this.dataService.refresh()
  }

  trackByName(index: number, item: any) {
    return item.name
  }

  onSelection(event) {
    console.group('on grid selection')
    console.warn(event.cell.rowData)
    console.warn(event.cell.column.field)

    console.groupEnd()
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

  readonly onColumnSelectionChanging = this.effect((origin$: Observable<IColumnSelectionEventArgs>) => {
    return origin$.pipe(
      switchMap((event) => {
        const newSelection = event.newSelection[0]
        if (newSelection) {
          event.event.stopPropagation()
          return this.settingsService
            ?.openDesigner(
              WidgetDesignerType.GridColumn,
              this.options.columns?.[newSelection] ?? {name: newSelection},
              `${this.key}/${newSelection}`
            )
            .pipe(tap((options) => this.updateColumnOptions({ key: newSelection, options })))
        }
        return EMPTY
      })
    )
  })

  readonly updateColumnOptions = this.updater(
    (state, { key, options }: { key: string; options: Record<string, unknown> }) => {
      state.options.columns = state.options?.columns ?? {}
      state.options.columns[key] = options
    }
  )

  readonly swapAxis = this.updater((state) => {
    const columns = state.dataSettings.analytics.columns
    state.dataSettings.analytics.columns = state.dataSettings.analytics.rows
    state.dataSettings.analytics.rows = columns
  })
}
