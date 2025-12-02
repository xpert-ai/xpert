import { FocusableOption, FocusMonitor, FocusOrigin } from '@angular/cdk/a11y'
import { coerceBooleanProperty } from '@angular/cdk/coercion'
import { DataSource } from '@angular/cdk/collections'
import { FlatTreeControl } from '@angular/cdk/tree'
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  effect,
  ElementRef,
  EventEmitter,
  HostBinding,
  HostListener,
  inject,
  input,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  signal,
  SimpleChanges,
  ViewChild
} from '@angular/core'
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop'
import { MatPaginator } from '@angular/material/paginator'
import { MatSort, SortDirection } from '@angular/material/sort'
import { MatTreeFlatDataSource, MatTreeFlattener } from '@angular/material/tree'
import { csvDownload, DisplayDensity, NgmAppearance } from '@metad/ocap-angular/core'
import {
  AggregationRole,
  assign,
  assignDeepOmitBlank,
  C_MEASURES,
  C_MEASURES_CAPTION,
  compact,
  DataSettings,
  Dimension,
  DisplayBehaviour,
  displayByBehaviour,
  EntityType,
  FlatTreeNode,
  getDimensionMemberCaption,
  getEntityHierarchy,
  getEntityProperty,
  getEntityProperty2,
  getHierarchyProperty,
  getPropertyHierarchy,
  hierarchize,
  IMember,
  isDimension,
  isEqual,
  ISlicer,
  isMeasure,
  isNil,
  isNumber,
  isPropertyMeasure,
  isString,
  Measure,
  mergeOptions,
  negate,
  omit,
  pick,
  PivotColumn,
  PrimitiveType,
  PropertyMeasure,
  TreeNodeInterface,
  uniqBy,
  wrapBrackets
} from '@metad/ocap-core'
import { SlicersCapacity } from '@metad/ocap-angular/selection'
import { TranslateService } from '@ngx-translate/core'
import { maxBy, minBy, orderBy, unionBy } from 'lodash-es'
import { BehaviorSubject, combineLatest, firstValueFrom, Observable, of } from 'rxjs'
import { combineLatestWith, debounceTime, filter, map, shareReplay, withLatestFrom } from 'rxjs/operators'
import { NgmAnalyticsBusinessService } from './analytics.service'
import { getChromaticScale, getContrastYIQ } from './chromatics'
import { NgmFlatTableDataSource } from './flat-data-source'
import {
  AnalyticalGridColumn,
  AnalyticalGridColumnOptions,
  AnalyticalGridOptions,
  filterArray,
  IColumnSelectionEventArgs,
  moveLeft,
  moveRight,
  resolveSemanticClasses,
  VisualMap
} from './types'
import { NgmTreeFlatDataSource } from './tree-flat-data-source'


@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'ngm-analytical-grid',
  templateUrl: 'analytical-grid.component.html',
  styleUrls: ['analytical-grid.component.scss'],
  host: {
    '[attr.tabindex]': 'disabled ? -1 : 0',
    '[attr.disabled]': 'disabled || null',
    '[attr.aria-disabled]': 'disabled.toString()',
    class: 'ngm-analytical-grid mat-focus-indicator'
  },
  providers: [
    NgmAnalyticsBusinessService,
  ]
})
export class AnalyticalGridComponent<T> implements OnChanges, AfterViewInit, OnDestroy, FocusableOption {
  AggregationRole = AggregationRole
  C_MEASURES = C_MEASURES
  eSlicersCapacity = SlicersCapacity
  isNil = isNil

  public readonly analyticsService = inject(NgmAnalyticsBusinessService)

  private _disabled = false

  get disabled(): boolean {
    return this._disabled
  }
  set disabled(value: any) {
    this._disabled = coerceBooleanProperty(value)
  }

  @Input() title: string
  @Input() get dataSettings(): DataSettings {
    return this._dataSettings()
  }
  set dataSettings(value) {
    this._dataSettings.set(value)
  }
  private readonly _dataSettings = signal<DataSettings>(null, { equal: isEqual })

  readonly options = input<AnalyticalGridOptions>()

  @Input() appearance: NgmAppearance
  @Input() styling: any


  readonly columns = input<Record<string, AnalyticalGridColumnOptions>>({})
  readonly _columns$ = toObservable(this.columns)

  @Input() get slicers() {
    return this._slicers()
  }
  set slicers(value) {
    this._slicers.set(value)
  }
  private readonly _slicers = signal<ISlicer[]>([], {equal: isEqual})

  @Output() columnSelectionChanging = new EventEmitter<IColumnSelectionEventArgs>()
  @Output() slicersChanging = new EventEmitter<ISlicer[]>()
  @Output() explain = new EventEmitter<any[]>()
  @Output() entityTypeChange = new EventEmitter<EntityType>()

  @ViewChild(MatPaginator)
  set paginator(v: MatPaginator) {
    this._paginator.set(v)
  }
  private readonly _paginator = signal<MatPaginator>(null)

  @ViewChild(MatSort) sort: MatSort

  readonly showToolbar = computed(() => isNil(this.options()?.showToolbar) || this.options().showToolbar)

  // Inner states
  readonly tablesConfig = signal<{rowAxes?: AnalyticalGridColumn[]; columnAxes?: AnalyticalGridColumn[]; pivotColumns?: AnalyticalGridColumn[][];
      matHeaders: string[];
      matRestHeaders: string[][];
      matRowColumns?: string[]
    }[]>([])
  matSortActive = ''
  matSortDirection: SortDirection
  selected: {
    prevI: number | string
    prevColumn: number | string
    i: number | string
    prevRow?: {
      [key: string]: PrimitiveType
    };
    rowMembers?: {
      [key: string]: PrimitiveType
    };
    column: AnalyticalGridColumn;
    columnMembers?: {
      [key: string]: AnalyticalGridColumn
    };
  } = {
    prevI: null,
    prevColumn: null,
    i: null,
    column: null
  }
  virtualScrollItemSize = 48

  // Flat Table
  flatDataSource = new NgmFlatTableDataSource([])
  // isRowHierarchy = false
  rowRecursiveHierarchy = null
  readonly rowTreeProperty = signal<string>(null)
  // Unfold indicator for row treeControl
  rowUnfold = false
  columnUnfold = false
  private _data$ = new BehaviorSubject<any[]>([])
  get dimensionFilters() {
    return this._dimensionFilters$.value
  }
  set dimensionFilters(filters) {
    this._dimensionFilters$.next(filters)
  }
  private _dimensionFilters$ = new BehaviorSubject<{ [name: string]: string[] }>({})
  public readonly filteredData$ = combineLatest([this._data$, this._dimensionFilters$]).pipe(
    map(([data, filters]) => {
      if (filters) {
        return filterArray(data, filters)
      }

      return [...data]
    })
  )
  get dataSource(): DataSource<any> {
    return this.rowTreeProperty() ? this.rowDataSource : this.flatDataSource
  }

  treeNodePadding = 16
  /**
   * Row column configuration
   */
  private rowAxes: AnalyticalGridColumn[] = []
  /**
   * First header line of pivot columns
   */
  // matHeaders: string[] = []
  /**
   * Rest header lines of pivot columns
   */
  // matRestHeaders = []
  private columnAxes = []
  /**
   * Header columns for body
   */
  // matRowColumns: string[] = []
  /**
   * Pivot column total row count
   */
  pivotColumnRowCount = 0
  /**
   * Column configuration
   */
  get pivotColumns() {
    return this._pivotColumns$.value
  }
  set pivotColumns(value) {
    this._pivotColumns$.next(value)
  }
  private _pivotColumns$ = new BehaviorSubject<AnalyticalGridColumn[][]>([])

  private cellColumns$ = new BehaviorSubject<AnalyticalGridColumn[]>([])

  public readonly isLoading$ = this.analyticsService.loading$ //.pipe(map(() => true))
  public readonly error$ = this.analyticsService.selectResult().pipe(map((result) => result.error))
  public readonly data$ = this.analyticsService.selectResult().pipe(map((result) => result.data))

  readonly rowAxes$: Observable<AnalyticalGridColumn[]> = this.analyticsService.analytics$.pipe(
      map((analytics) => {
        const columns: AnalyticalGridColumn[] = []
        const measures = {
            name: C_MEASURES,
            dimension: C_MEASURES,
            caption: this.translateService.instant('Ngm.Common.Measures', { Default: 'Measures' }),
            members: []
          } as AnalyticalGridColumn
        analytics.rows?.forEach((column) => {
          if (isDimension(column)) {
            columns.push({
              ...column,
              name: column.dimension === C_MEASURES ? wrapBrackets(C_MEASURES) : column.property?.name,
              caption: column.caption || (column.dimension === C_MEASURES ? C_MEASURES : (column.property?.caption ?? column.name)),
              memberCaption: getDimensionMemberCaption(column, this.entityType()) ||
                (column.dimension === C_MEASURES ? C_MEASURES_CAPTION : column.name),
              displayBehaviour: column.displayBehaviour ?? DisplayBehaviour.descriptionOnly
            } as AnalyticalGridColumn)
            // Properties
            column.properties?.forEach((name) => {
              const hierarchy = getEntityHierarchy(this.entityType(), pick(column, 'dimension', 'hierarchy'))
              const property = getHierarchyProperty(hierarchy, name)
              if (property) {
                columns.push({
                  name: name,
                  caption: property.caption,
                  memberCaption: name,
                  displayBehaviour: DisplayBehaviour.descriptionOnly,
                  property
                } as AnalyticalGridColumn)
              }
            })
          } else if (isMeasure(column)) {
            measures.members.push(column as any)
          }
        })

        if (measures.members.length) {
          columns.push(measures)
        }

        return unionBy(columns.filter((_) => _.name), 'name')
      }),
      combineLatestWith(this._columns$),
      map(([_columns, _columnsOptions]) => {
        return _columns.map((column) => {
          return this.mergeColumnOptions(column, column.name, _columnsOptions)
        })
      }),
      takeUntilDestroyed(),
      shareReplay(1)
    )

  readonly columnAxes$: Observable<AnalyticalGridColumn[]> = this.analyticsService.selectResult().pipe(
    filter(({ error }) => !error),
    withLatestFrom(this.analyticsService.selectEntityType()),
    map(([{ schema }, entityType]) => {
      return schema.columnAxes?.map((dimension) => {
        const property = isMeasure(dimension)
          ? getEntityProperty(entityType, dimension)
          : getEntityHierarchy(entityType, dimension)
        const measureCaption = this.getTranslation('Ngm.Common.Measures', { Default: 'Measures' })
        return {
          ...dimension,
          caption: isMeasure(dimension) ? measureCaption : property.caption
        } as AnalyticalGridColumn
      })
    })
  )

  readonly analytics = toSignal(this.analyticsService.analytics$)

  private querySchemaColumns = []
  public readonly querySchemaColumns$ = new BehaviorSubject([])

  // for Tree Table
  public columnTreeControl = new FlatTreeControl<AnalyticalGridColumn>(
    (node) => node.treeLevel,
    (node) => node.expandable
  )
  public readonly columnsDataSource = new MatTreeFlatDataSource(
    this.columnTreeControl,
    new MatTreeFlattener(
      (node: TreeNodeInterface<PivotColumn>, level: number): AnalyticalGridColumn => {
        return {
          ...omit(node.raw, 'label'),
          expandable: node.raw.childrenCardinality > 0,
          caption: node.caption,
          treeLevel: level,
          colspan: node.raw.columns?.length || 1
        }
      },
      (node) => node.treeLevel,
      (node) => node.expandable,
      (node) => node.children
    ),
    []
  )

  public rowTreeControl = new FlatTreeControl<FlatTreeNode<T>>(
    (node) => node.level,
    (node) => node.expandable
  )
  // public readonly rowDataSource = new MatTreeFlatDataSource(
  public readonly rowDataSource = new NgmTreeFlatDataSource(
    this.rowTreeControl,
    new MatTreeFlattener(
      (node: TreeNodeInterface<T>, level: number): FlatTreeNode<T> => {
        return {
          ...(node.raw ?? node),
          expandable: node.children?.length > 0,
          key: node.key,
          name: node.name,
          caption: node.caption,
          level: level
        }
      },
      (node) => node.level,
      (node) => node.expandable,
      (node) => node.children
    ),
    []
  )

  public readonly entityType = signal<EntityType>(null)
  /**
   * VisualMap for measures
   */
  visualMaps: Record<string, Partial<VisualMap>> = {}
  /**
  |--------------------------------------------------------------------------
  | Subscriptions (effect)
  |--------------------------------------------------------------------------
  */
  private entityTypeSub = this.analyticsService
    .selectEntityType()
    .pipe(takeUntilDestroyed())
    .subscribe((entityType) => {
      this.entityTypeChange.emit(entityType)
      this.entityType.set(entityType)
    })
  // refresh
  private refreshSub = this.analyticsService
    .onAfterServiceInit()
    .pipe(takeUntilDestroyed())
    .subscribe(() => {
      this.refresh()
    })

  // Calc Visual Maps from measures
  private visualMapSub = this.analyticsService.analytics$.pipe(takeUntilDestroyed()).subscribe({
    next: (analytics) => {
      this.visualMaps = [...(analytics.columns ?? []), ...(analytics.rows ?? [])].reduce<typeof this.visualMaps>((visualMaps, dimension) => {
        if (isMeasure(dimension) && (dimension.palette?.name || dimension.palette?.colors?.length)) {
          if (dimension.measure) {
            visualMaps[dimension.measure] = dimension
          } else if (dimension.members) {
            dimension.members.filter(isString).forEach((measure) => {
              visualMaps[measure] = {
                ...dimension,
                measure
              }
            })
          }
        }
        return visualMaps
      }, {})
    }
  })
  private explainSub = combineLatest([this.analyticsService.dataSettings$, this.analyticsService.selectResult()])
    .pipe(takeUntilDestroyed())
    .subscribe(([dataSettings, queryReturn]) => {
      this.explain.emit([dataSettings, queryReturn])
    })
  // columns tree results
  private pivotColumnsSub = this.columnsDataSource
    .connect({ viewChange: of() })
    .pipe(takeUntilDestroyed())
    .subscribe((columns) => {
      const levels = [[]]
      columns.forEach((pivotCol) => {
        let pivotcolspan = 0
        let isCell: boolean
        if (pivotCol.columns?.length) {
          levels[1] = levels[1] ?? []
          pivotCol.columns.forEach((subCol) => {
            let colspan = 1
            // Supports columns up to 3 levels deep
            if (subCol.columns?.length) {
              levels[2] = levels[2] ?? []
              levels[2].push(
                ...subCol.columns.map((item) => ({
                  ...item,
                  parent: subCol
                }))
              )
              colspan = subCol.columns.length
            } else {
              subCol.isCell = true
            }
            levels[1].push({
              ...subCol,
              parent: pivotCol,
              colspan
            })
            pivotcolspan += colspan
          })
        } else {
          pivotcolspan = 1
          isCell = true
        }

        pivotCol.colspan = pivotcolspan
        pivotCol.isCell = isCell
        if (pivotCol.isCell) {
          pivotCol.measure = pivotCol.name
        }
        levels[0].push(
          pivotCol
        )
      })

      this.pivotColumns = levels
    })
  // set columnsDataSource
  private querySchemaColumnsSub = this.querySchemaColumns$.pipe(takeUntilDestroyed()).subscribe((columns) => {
      const treeDataNodes = columns.length
        ? hierarchize(columns, {
            valueProperty: 'uniqueName',
            parentNodeProperty: 'parentUniqueName',
            labelProperty: 'caption'
          })
        : []

      this.columnsDataSource.data = treeDataNodes
      // Expand initial column level after data initialization
      if (this.options()?.initialColumnLevel > 0) {
        this.columnTreeControl.dataNodes.forEach((node) => {
          const level = this.columnTreeControl.getLevel(node)
          if (level < this.options().initialColumnLevel) {
            this.columnTreeControl.expand(node)
          }
        })
      }
    })
  // columns tree data
  private schemaColumnsSub = this.analyticsService
    .selectResult()
    .pipe(
      filter(({ error }) => !error),
      debounceTime(100),
      withLatestFrom(
        this.analyticsService.analytics$.pipe(map(({ columns }) => columns)),
        this.analyticsService.selectEntityType()
      ),
      combineLatestWith(this._columns$),
      takeUntilDestroyed()
    )
    .subscribe(([[result, _columns, entityType], _columnsOptions]) => {
      // Reset Max/Min value for visualMaps
      Object.keys(this.visualMaps).forEach((name) => {
        this.visualMaps[name].maxValue = null
        this.visualMaps[name].minValue = null
      })
      const cellColumns = []
      const querySchemaColumns = result.schema?.columns?.map((item) => {
        const column = this.characteristicValue(
          this.mergeColumnOptions(item as any, item.name, _columnsOptions, _columns, entityType),
          result.data
        )

        if (!column.columns?.length) {
          cellColumns.push(column)
        }
        return {
          ...result.schema.columnAxes[0],
          ...column,
          columns: item.columns?.map((item) => {
            const column = this.characteristicValue(
              this.mergeColumnOptions(item as any, item.measure, _columnsOptions, _columns, entityType),
              result.data
            )
            if (!column.columns?.length) {
              cellColumns.push(column)
            }
            return {
              ...result.schema.columnAxes[1],
              ...column,
              columns: item.columns?.map((item) => {
                const column = this.characteristicValue(
                  this.mergeColumnOptions(item as any, item.measure, _columnsOptions, _columns, entityType),
                  result.data
                )
                if (!column.columns?.length) {
                  cellColumns.push(column)
                }
                return {
                  ...result.schema.columnAxes[2],
                  ...column,
                }
              })
            }
          })
        }
      })

      this.cellColumns$.next(cellColumns)
      this.querySchemaColumns = querySchemaColumns
      this.querySchemaColumns$.next(querySchemaColumns ? [...querySchemaColumns] : [])
    })

  private _pivotColumnsSub = this._pivotColumns$
    .pipe(withLatestFrom(this.rowAxes$, this.columnAxes$))
    .subscribe(([levels, rowAxes, columnAxes]) => {
      this.rowAxes = rowAxes
      this.columnAxes = columnAxes
      const pivotColumnNames = levels.map((item) => item.map((column) => column.name))
      // Pivot column total row count
      this.pivotColumnRowCount = pivotColumnNames.length

      const rowColumns = rowAxes.map((row) => row.name)
      let matHeaders = []
      let matRestHeaders = []
      if (this.pivotColumnRowCount > 1) {
        // First row columns
        matHeaders = compact([...rowColumns, columnAxes[0].dimension, ...pivotColumnNames[0]])
        // Remaining rows
        matRestHeaders = pivotColumnNames
          .slice(1)
          .map((columns, index) => compact([columnAxes[index + 1].dimension, ...columns]))
      } else {
        // First row columns
        matHeaders = compact([...rowColumns, ...pivotColumnNames[0]])
      }

      this.tablesConfig.set([{
        rowAxes: this.rowAxes,
        columnAxes: this.columnAxes,
        pivotColumns: this.pivotColumns,
        matHeaders,
        matRestHeaders,
        matRowColumns: compact(
          rowColumns.length
            ? [...rowColumns, ...pivotColumnNames[pivotColumnNames.length - 1]]
            : [
              // columnAxes[columnAxes.length - 1]?.dimension, 
              ...pivotColumnNames[pivotColumnNames.length - 1]
            ]
          )
      }])

      this.cdr.detectChanges()
    })
  
  // Flat data to tree dataSource
  private filteredTreeDataSub = this.filteredData$
      .pipe(
        filter(() => this.rowRecursiveHierarchy),
        withLatestFrom(this.rowAxes$),
        takeUntilDestroyed()
      )
      .subscribe({
        next: ([data, rows]) => {
          const compositeKeys = rows
            .map((row: AnalyticalGridColumn) => row.name)
            .filter((key: string) => key !== this.rowRecursiveHierarchy.valueProperty)
          this.rowDataSource.data = hierarchize<T>(data as T[], this.rowRecursiveHierarchy, { compositeKeys })
          // Initial row depth after data initialization
          if (this.options()?.initialRowLevel > 0) {
            this.rowTreeControl.dataNodes.forEach((node) => {
              const level = this.rowTreeControl.getLevel(node)
              if (level < this.options().initialRowLevel) {
                this.rowTreeControl.expand(node)
              }
            })
          }

          this.cdr.detectChanges()
        }
      })
  // table data
  private dataSub = this.analyticsService
    .selectResult()
    .pipe(
      filter(({ error }) => !error),
      debounceTime(200),
      withLatestFrom(this.cellColumns$),
      takeUntilDestroyed()
    )
    .subscribe(([{ data, schema }, columns]) => {
      if (schema?.recursiveHierarchy) {
        this.rowRecursiveHierarchy = schema.recursiveHierarchy
        this.rowTreeProperty.set(schema.rowHierarchy)
      } else {
        this.rowRecursiveHierarchy = null
        this.rowTreeProperty.set(null)
      }

      // Transform Cell data format
      // copy data
      data = data.map((item: any) => ({ ...item }))
      columns.forEach((column) => {
        data.forEach((row) => {
          row[column.name] = {
            value: row[column.name],
            ...this.calcCellStyles(column, row),
            classes: this.calcCellClasses(column, row)
          }
        })
      })

      this._data$.next(data)
    })
  private filteredFlatDataSub = this.filteredData$.pipe(
      filter(() => !this.rowRecursiveHierarchy),
      takeUntilDestroyed()
    ).subscribe((data) => {
      this.flatDataSource.data = data
    })
  

  constructor(
    private translateService: TranslateService,
    private cdr: ChangeDetectorRef,
    private _focusMonitor: FocusMonitor,
    public elementRef: ElementRef<HTMLElement>
  ) {
    effect(
      () => {
        const slicers = this._slicers()
        if (this.dataSettings) {
          const dataSettings = {
            ...this.dataSettings,
            selectionVariant: {
              ...(this.dataSettings.selectionVariant ?? {}),
              selectOptions: [
                ...(this.dataSettings.selectionVariant?.selectOptions ?? []),
              ]
            }
          }

          if (slicers) {
            dataSettings.selectionVariant.selectOptions.push(
              ...slicers
            )
          }
          this.analyticsService.dataSettings = dataSettings
        }
      },
      { allowSignalWrites: true }
    )

    effect(() => {
      if (this._paginator()) {
        if (this.rowTreeProperty()) {
          this.flatDataSource.paginator = null
          this.rowDataSource.paginator = this._paginator()
        } else {
          this.flatDataSource.paginator = this._paginator()
          this.rowDataSource.paginator = null
        }
      } else {
        this.flatDataSource.paginator = null
        this.rowDataSource.paginator = null
      }
    },
    { allowSignalWrites: true }
    )
  }

  /** Focuses the button. */
  focus(origin?: FocusOrigin, options?: FocusOptions): void {
    if (origin) {
      this._focusMonitor.focusVia(this._getHostElement(), origin, options)
    } else {
      this._getHostElement().focus(options)
    }
  }
  _getHostElement() {
    return this.elementRef.nativeElement
  }

  ngOnChanges({ appearance }: SimpleChanges) {
    if (appearance) {
      if (this.appearance?.displayDensity === DisplayDensity.compact) {
        this.virtualScrollItemSize = 30
      } else if (this.appearance?.displayDensity === DisplayDensity.cosy) {
        this.virtualScrollItemSize = 36
      } else {
        this.virtualScrollItemSize = 48
      }
    }
  }

  ngAfterViewInit(): void {
    this.flatDataSource.sort = this.sort
    this._focusMonitor.monitor(this.elementRef, true)
  }

  refresh(force?: boolean) {
    this.analyticsService.refresh(force)
  }

  /**
   * Merge origin column and column options properties to table column
   *
   * @param column
   * @param columnName
   * @param _columnsOptions
   * @param _columns
   * @returns
   */
  mergeColumnOptions(
    column: AnalyticalGridColumn,
    columnName: string,
    _columnsOptions: Record<string, AnalyticalGridColumnOptions>,
    _columns?: Array<Dimension | Measure>,
    entityType?: EntityType
  ) {
    const property = getEntityProperty(entityType, columnName)
    if (isPropertyMeasure(property)) {
      const formatting = (<PropertyMeasure>property).formatting ?? {}
      column = {
        ...column,
        formatting: assignDeepOmitBlank(formatting, column.formatting)
      }
    }
    const originColumn = _columns?.filter(isMeasure).find((item) => item.measure === columnName)
    if (originColumn) {
      mergeOptions(column, originColumn)
    }
    const options = _columnsOptions?.[column.name]
    if (options) {
      mergeOptions(column, options)

      if (options.semantic) {
        const semantic = Array.isArray(options.semantic) ? options.semantic : [options.semantic]
        semantic.forEach((_semantic) => {
          column.cellClasses = assign(column.cellClasses, resolveSemanticClasses(_semantic, column.name))
        })
      }
    }

    if (!column.formatting?.digitsInfo && isNumber(column.formatting?.decimal)) {
      column.formatting = {
        ...column.formatting,
        digitsInfo: `0.${column.formatting.decimal}-${column.formatting.decimal}`
      }
    }

    return column
  }

  characteristicValue(column: AnalyticalGridColumn, data: any[]) {
    if (!column.columns?.length && column.measure && (column.bar || this.visualMaps[column.measure])) {
      column.minValue = minBy(data, column.name)?.[column.name]
      column.maxValue = maxBy(data, column.name)?.[column.name]
      if (this.visualMaps[column.measure]) {
        if (
          !isNil(column.minValue) &&
          (isNil(this.visualMaps[column.measure].minValue) ||
            column.minValue < this.visualMaps[column.measure].minValue)
        ) {
          this.visualMaps[column.measure].minValue = column.minValue
        }
        if (
          !isNil(column.maxValue) &&
          (isNil(this.visualMaps[column.measure].maxValue) ||
            column.maxValue > this.visualMaps[column.measure].maxValue)
        ) {
          this.visualMaps[column.measure].maxValue = column.maxValue
        }
      }
    }

    return column
  }

  isRowSelected(row: T, i: number) {
    return this.selected.i === i && this.selected.rowMembers && !Object.keys(this.selected.rowMembers).some((name) => this.selected.rowMembers[name] !== row[name])
  }
  isRowCell(element: T, column: AnalyticalGridColumn, j: number) {
    return isMeasure(this.selected.column) ?
      this.selected.rowMembers?.[column.name] === element[column.name]
      : this.selected.column?.name === column.name
  }

  selectRow(i: number, row: any) {
    const rowMembers = this.rowAxes.reduce((acc, column) => {
      acc[column.name] = row[column.name]
      return acc
    }, {})

    if (this.selected.i === i && isEqual(rowMembers, this.selected.rowMembers) && this.selected.prevColumn === this.selected.column.name) {
      this.selected.i = null
      this.selected.rowMembers = null
      this.selected.column = null
      this.selected.columnMembers = null
      this.unlinkAnalysis()
    } else {
      this.selected.prevI = this.selected.i
      this.selected.i = i
      this.selected.rowMembers = rowMembers

      let slicers = []
      // When a measure cell is selected, use the row dimension members as slicers
      if (isMeasure(this.selected.column)) {
        slicers = [
          ...this.rowAxes.map((column) => {
            return {
              dimension: {
                dimension: column.dimension,
                hierarchy: column.hierarchy
              },
              members: [
                {
                  key: row[getPropertyHierarchy(column)],
                  caption: row[column.memberCaption],
                  value: row[getPropertyHierarchy(column)]
                }
              ]
            }
          }),
          ...Object.values(this.selected.columnMembers).filter(negate(isMeasure)).map((column) => ({
            dimension: {
              dimension: column.dimension,
              hierarchy: column.hierarchy
            },
            members: [
              column.member
            ]
          }))
        ]
      } else {
        // When a row member is selected, use the row cell member as a slicer
        const column = this.selected.column
        slicers = [
          {
            dimension: {
              dimension: column.dimension,
              hierarchy: column.hierarchy
            },
            members: [
              {
                key: row[getPropertyHierarchy(column)],
                caption: row[column.memberCaption],
                value: row[getPropertyHierarchy(column)]
              }
            ]
          }
        ]
      }
      // Emit slicers for linked analysis
      this.onLinkAnalysis(slicers)
    }
  }

  selectCell(column: AnalyticalGridColumn) {
    this.selected.prevColumn = this.selected.column?.name
    this.selected.column = column

    this.selected.columnMembers = {}
    while(column) {
      this.selected.columnMembers[column.name] = column
      column = column.parent
    }
  }

  onClickColumnHeader(event, column: AnalyticalGridColumn) {
    if (this.options()?.selectable) {
      event.stopPropagation()
      event.preventDefault()
      if (this.selected.column?.name === column.name) {
        this.selected.column = null
        this.columnSelectionChanging.emit({
          owner: this,
          newSelection: []
        })
      } else {
        this.selected.column = column
        this.columnSelectionChanging.emit({
          owner: this,
          newSelection: [this.selected.column]
        })
      }
    }
  }

  toggleColumnTree(column: AnalyticalGridColumn) {
    const member = this.columnTreeControl.dataNodes.find((item) => item.name === column.name)
    this.columnTreeControl.toggle(member)
  }

  toggleRowUnfold(event) {
    event.stopPropagation()
    this.rowUnfold = !this.rowUnfold
    if (this.rowUnfold) {
      this.rowTreeControl.expandAll()
    } else {
      this.rowTreeControl.collapseAll()
    }
  }

  toggleColumnUnfold(event) {
    event.stopPropagation()
    this.columnUnfold = !this.columnUnfold
    if (this.columnUnfold) {
      this.columnTreeControl.expandAll()
    } else {
      this.columnTreeControl.collapseAll()
    }
  }

  toggleRowTree(event, row) {
    event.preventDefault()
    event.stopPropagation()
    this.rowTreeControl.toggle(row)
  }

  onFilterSelectAll(event, column: AnalyticalGridColumn, members: IMember[]) {
    if (event.checked) {
      column._selections = members.map(({ value }) => value as string)
    } else {
      column._selections = []
    }
  }

  allFiltering(column: AnalyticalGridColumn, members: IMember[]) {
    return column._selections?.length === members?.length
  }

  someFiltering(column: AnalyticalGridColumn, members: IMember[]) {
    return !!(column._selections?.length && column._selections.length < members?.length)
  }

  onFilterApply(column: AnalyticalGridColumn, members: IMember[]) {
    if (this.allFiltering(column, members)) {
      column.selections = []
    } else {
      column.selections = [...column._selections]
    }

    if (column.selections.length) {
      this.dimensionFilters = {
        ...this.dimensionFilters,
        [column.name]: column.selections
      }
    } else {
      this.dimensionFilters = omit(this.dimensionFilters, column.name)
    }

    this.cdr.detectChanges()
  }

  moveLeft(name: string) {
    this.tablesConfig.update((tables) => {
      return tables.map((table) => {
        table.matHeaders = moveLeft(table.matHeaders, name)
        table.matRowColumns = moveLeft(table.matRowColumns, name)
        return {...table}
      })
    })
    // this.matHeaders = moveLeft(this.matHeaders, name)
    // this.matRowColumns = moveLeft(this.matRowColumns, name)
  }

  moveRight(name: string) {
    this.tablesConfig.update((tables) => {
      return tables.map((table) => {
        table.matHeaders = moveRight(table.matHeaders, name)
        table.matRowColumns = moveRight(table.matRowColumns, name)
        return {...table}
      })
    })
    // this.matHeaders = moveRight(this.matHeaders, name)
    // this.matRowColumns = moveRight(this.matRowColumns, name)
  }

  onColumnMemberSearch(column, text: string) {
    this._columnMembers.get(column.name).search.next(text)
  }

  calcCellClasses(column: AnalyticalGridColumn, row: any) {
    return Object.entries(column.cellClasses ?? {}).reduce((cellClasses, [name, fun]) => {
      try {
        cellClasses[name] = typeof fun === 'string' ? fun : fun(row, column.name)
      } catch (err) {
        // ignore unnecessary calculation
      }
      return cellClasses
    }, {})
  }

  calcCellStyles(column: AnalyticalGridColumn, row: any) {
    const styles: any = {
      cellStyles: {},
      barStyles: {}
    }

    const visualStyles = this.calcHeatmapColor(column, row)

    if (column.bar) {
      styles.barStyles = {
        ...visualStyles
      }
      styles.cellStyles = {
        color: visualStyles.color,
        textAlign: 'left'
      }
      if (isNumber(row[column.name])) {
        if (row[column.name] > 0) {
          if (column.minValue > 0) {
            styles.barStyles['width'] =
              ((row[column.name] - column.minValue) / (column.maxValue - column.minValue)) * 100 + '%'
          } else {
            styles.barStyles['width'] = ((row[column.name] - 0) / (column.maxValue - column.minValue)) * 100 + '%'
            styles.barStyles['left'] = ((0 - column.minValue) / (column.maxValue - column.minValue)) * 100 + '%'
          }
        } else {
          styles.barStyles['width'] = ((0 - row[column.name]) / (column.maxValue - column.minValue)) * 100 + '%'
          styles.barStyles['left'] =
            ((row[column.name] - column.minValue) / (column.maxValue - column.minValue)) * 100 + '%'
          styles.barClasses = 'bar-negative'
        }
      }
    } else {
      styles.cellStyles = {
        ...visualStyles
      }
    }
    return styles
  }

  calcHeatmapColor(column: AnalyticalGridColumn, row: any) {
    const styles: any = {}
    const visualMap = this.visualMaps[column.measure]
    if (!isNil(visualMap) && isNumber(row[column.name])) {
      let backgroundColor = null
      if (visualMap.palette.colors?.length) {
        const size = visualMap.palette.colors.length
        const index = Math.ceil(
          ((row[column.name] - visualMap.minValue) / (visualMap.maxValue - visualMap.minValue)) * size
        )
        backgroundColor = visualMap.palette.colors[index === 0 ? index : index - 1]
      } else {
        const colorFun = getChromaticScale(visualMap.palette.name, [0, 100], visualMap.palette.reverse)
        backgroundColor = colorFun(
          Math.ceil(((row[column.name] - visualMap.minValue) / (visualMap.maxValue - visualMap.minValue)) * 100)
        )
      }

      styles['background-color'] = backgroundColor
      styles['color'] = getContrastYIQ(backgroundColor)
    }

    return styles
  }

  calcBar(column: AnalyticalGridColumn, row: any) {
    const styles = {}
    if (column.bar && isNumber(row[column.name])) {
      const percent = Math.ceil(((row[column.name] - column.minValue) / (column.maxValue - column.minValue)) * 100)
      styles['width'] = percent + '%'
    }
    return styles
  }

  toggleColumnOrder(index: number) {
    const columnLevel = this.columnAxes[index]
    columnLevel.sortDirection = columnLevel.sortDirection
      ? columnLevel.sortDirection === 'asc'
        ? 'desc'
        : null
      : 'asc'

    // Default: supports the first two dimensions, the last dimension is the measurement dimension
    let querySchemaColumns = this.columnAxes[0].sortDirection
      ? orderBy(this.querySchemaColumns, 'name', this.columnAxes[0].sortDirection)
      : [...this.querySchemaColumns]

    if (this.columnAxes[1].sortDirection) {
      querySchemaColumns = querySchemaColumns.map((item) => ({
        ...item,
        columns: orderBy(item.columns, 'name', this.columnAxes[1].sortDirection)
      }))
    }

    this.querySchemaColumns$.next(querySchemaColumns)
  }

  private _columnMembers = new Map<
    string,
    { members: Observable<IMember[]>; filteredMembers: Observable<IMember[]>; search: BehaviorSubject<string> }
  >()

  subscribeColumnMembers(column: any): Observable<IMember[]> {
    if (!this._columnMembers.get(column.name)) {
      const search = new BehaviorSubject<string>(null)
      const members = this._data$.pipe(
        combineLatestWith(this._dimensionFilters$.pipe(map((filters) => omit(filters, column.name)))),
        map(([data, filters]) =>
          uniqBy(filterArray(data as any[], filters), column.name).map((item) => ({
            key: item[column.name],
            value: item[column.name],
            label: item[column.name] ? item[column.memberCaption] : '(Blanks)',
            caption: item[column.name] ? item[column.memberCaption] : '(Blanks)'
          }))
        ),
        shareReplay(1)
      )
      this._columnMembers.set(column.name, {
        members,
        filteredMembers: members.pipe(
          combineLatestWith(search),
          map(([members, text]) => {
            text = text?.trim().toLowerCase()
            if (text) {
              return members.filter(({ key, caption }) => caption?.toLowerCase().includes(text.toLowerCase()))
            }

            return members
          }),
          shareReplay(1)
        ),
        search
      })
    }

    return this._columnMembers.get(column.name).members
  }

  subscribeColumnFilteredMembers(column: AnalyticalGridColumn) {
    return this._columnMembers.get(column.name).filteredMembers
  }

  async downloadData() {
    const result = await firstValueFrom(this.analyticsService.selectResult())
    downloadData(this.title || 'data', this.analytics(), this.entityType(), result.data)
  }

  treeData = toSignal(this.rowDataSource.connect({ viewChange: of({ start: 0, end: Number.MAX_SAFE_INTEGER }) }))
  flatData = toSignal(this.flatDataSource.connect())
  
  copy(selected: typeof this.selected) {
    const treeData = this.treeData()
    const flatData = this.flatData()
    try {
      let text = null
      if (selected.column) {
        let rows = treeData.length ? treeData : flatData
        if (!isNil(selected.i)) {
          rows = [rows[selected.i]]
        }
        text = rows.map((rowMember) => {
          if (isMeasure(selected.column)) {
            return (rowMember[selected.column.name] as {value: number})?.value
          }
          return displayByBehaviour({
            key: rowMember[selected.column.hierarchy || selected.column.dimension],
            caption: rowMember[selected.column.memberCaption],
          }, selected.column.displayBehaviour ?? DisplayBehaviour.descriptionOnly)
        }).join('\r\n')
      }
      if (text) {
        navigator.clipboard.writeText(text).catch(() => {
          console.error('Unable to copy cell')
        })
      }
    } catch (err) {
      // Unable get cell value
    }
  }

  /**
   * Linked analysis, output selected slicers on table cell
   *
   * @param slicers
   */
  onLinkAnalysis(slicers: ISlicer[]) {
    this.slicersChanging.emit(slicers)
  }

  unlinkAnalysis() {
    this.onLinkAnalysis([])
  }

  getTranslation(keyWord: string, params?: any) {
    return this.translateService.instant(keyWord, params)
  }

  @HostBinding('class.striped')
  get _isStriped() {
    return this.options()?.strip
  }

  @HostBinding('class.ngm-with-toolbar')
  get _withToolbar() {
    return this.options()?.showToolbar
  }

  @HostListener('document:keydown', ['$event'])
  keyUpEvent(event: KeyboardEvent) {
    // Support both Ctrl+C (Windows/Linux) and Cmd+C (macOS)
    const isCopy =
      (event.ctrlKey && event.key === 'c') ||
      (event.metaKey && event.key === 'c')
    // Copy when element is focused
    if (isCopy && this._getHostElement() === document.activeElement) {
      this.copy(this.selected)
    }
  }

  ngOnDestroy() {
    this._focusMonitor.stopMonitoring(this.elementRef)
  }
}


function downloadData(fileName: string, analytics: DataSettings['analytics'], entityType: EntityType, data: any[]) {
  const fields = [...analytics.rows, ...analytics.columns].map((item) => {
    const property = getEntityProperty2(entityType, item)
    if (isDimension(item)) {
      return {
          key: property.name,
          label: property.caption || property.name,
          caption: getDimensionMemberCaption(item, entityType)
        } 
    }
    return {
      key: property.name,
      label: property.caption || property.name,
    }
  })
  const items = []
  for (const item of data) {
    const row = {}
    for (const field of fields) {
      if (field.caption) {
        row[field.label] = item[field.caption]
      } else {
        row[field.label] = item[field.key]
      }
    }
    items.push(row)
  }

  csvDownload(items, fileName + '.csv', ',')
}