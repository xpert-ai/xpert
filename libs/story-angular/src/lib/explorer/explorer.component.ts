import { CdkDrag, CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop'
import { CommonModule } from '@angular/common'
import {
  Component,
  ElementRef,
  EventEmitter,
  HostBinding,
  Input,
  Output,
  TemplateRef,
  ViewChild,
  computed,
  effect,
  inject,
  signal
} from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatButtonToggleModule } from '@angular/material/button-toggle'
import { MatDividerModule } from '@angular/material/divider'
import { MatTooltipModule } from '@angular/material/tooltip'
import { MatTabsModule } from '@angular/material/tabs'
import { MatRadioModule } from '@angular/material/radio'
import { nonBlank } from '@metad/core'
import { AnalyticalCardModule } from '@metad/ocap-angular/analytical-card'
import { AnalyticalGridModule } from '@metad/ocap-angular/analytical-grid'
import { NgmMemberTreeComponent } from '@metad/ocap-angular/controls'
import { DisplayDensity, NgmDSCoreService, NgmThemeService, OcapCoreModule } from '@metad/ocap-angular/core'
import { EntityCapacity, NgmEntityPropertyComponent, PropertyCapacity } from '@metad/ocap-angular/entity'
import { NgmChartPropertyComponent, NgmChartSettingsComponent, NgmSchemaChartTypeComponent } from '@metad/story/widgets/analytical-card'
import { NgmGridSettingsComponent } from '@metad/story/widgets/analytical-grid'
import {
  CHARTS,
  C_MEASURES,
  ChartAnnotation,
  ChartOrient,
  ChartTypeEnum,
  DataSettings,
  Dimension,
  DisplayBehaviour,
  FilterSelectionType,
  ISlicer,
  Measure,
  assignDeepOmitBlank,
  cloneDeep,
  getChartType,
  getEntityDimensions,
  getEntityLevel,
  getEntityMeasures,
  getEntityProperty,
  isSlicer,
  isString,
  isTimeRangesSlicer,
  nonNullable,
  omit,
  pick,
  uniqBy
} from '@metad/ocap-core'
import { NxStoryService, WidgetComponentType } from '@metad/story/core'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { combineLatestWith, filter, map, startWith, switchMap } from 'rxjs/operators'
import { MatIconModule } from '@angular/material/icon'
import { NgmSearchComponent, ResizerModule } from '@metad/ocap-angular/common'
import { firstValueFrom } from 'rxjs'
import { ExplainComponent, injectCalclatedMeasureCommand } from '@metad/story/story'
import { Dialog, DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { CdkListboxModule } from '@angular/cdk/listbox'


@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    CdkListboxModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatDividerModule,
    MatTooltipModule,
    MatIconModule,
    MatTabsModule,
    MatRadioModule,
    DragDropModule,
    OcapCoreModule,
    NgmMemberTreeComponent,
    AnalyticalCardModule,
    AnalyticalGridModule,
    ResizerModule,
    NgmEntityPropertyComponent,
    NgmSearchComponent,
    NgmChartSettingsComponent,
    NgmChartPropertyComponent,
    NgmSchemaChartTypeComponent,
    NgmGridSettingsComponent
  ],
  selector: 'ngm-story-explorer',
  templateUrl: 'explorer.component.html',
  styleUrls: ['explorer.component.scss'],
})
export class StoryExplorerComponent {
  EntityCapacity = EntityCapacity
  DisplayDensity = DisplayDensity
  PropertyCapacity = PropertyCapacity
  ComponentType = WidgetComponentType
  FilterSelectionType = FilterSelectionType

  @HostBinding('class.ngm-story-explorer') isStoryExplorerComponent = true

  private readonly dsCoreService = inject(NgmDSCoreService)
  private readonly translateService = inject(TranslateService)
  readonly #storyService? = inject(NxStoryService, { optional: true })
  readonly themeService = inject(NgmThemeService)
  readonly #data = inject<{data: any}>(DIALOG_DATA, { optional: true })
  readonly #dialogRef = inject(DialogRef, { optional: true })
  readonly #dialog = inject(Dialog)

  @Input()
  get data() {
    return this._data()
  }
  set data(value: any) {
    this._data.set(value)
    if (value) {
      const chartAnnotation = value?.dataSettings?.chartAnnotation
      const analytics = value?.dataSettings?.analytics
      if (chartAnnotation) {
        const component = {
          component: WidgetComponentType.AnalyticalCard,
          label: '' as ChartTypeEnum,
          dataSettings: value.dataSettings
        }
        try {
          component.label = getChartType(chartAnnotation.chartType)?.label as ChartTypeEnum
        } catch(err) {
          console.error(err)
        }
        this.component.set(component)
        this.rows.set(chartAnnotation.dimensions)
        this.columns.set(chartAnnotation.measures)
        this._dimensions.set(chartAnnotation.dimensions?.map((d) => pick(d, 'dimension', 'hierarchy')) ?? [])
        this._chartSettings.set({
          chartOptions: value.chartOptions,
          chartSettings: value.chartSettings
        })
        this.visualPanel = 'visual'
        this.view = 'chart'
      } else if (analytics) {
        this.component.set({
          label: null,
          component: WidgetComponentType.AnalyticalGrid,
          dataSettings: value.dataSettings
        })

        this.rows.set(analytics.rows)
        this.columns.set(analytics.columns)
        this._dimensions.set(
          [...analytics.rows, ...analytics.columns].filter((d) => d.dimension !== C_MEASURES).map((d) => pick(d, 'dimension', 'hierarchy'))
        )
        this.gridSettings = {
          options: value.options
        }
        this.visualPanel = 'options'
        this.view = 'table'
      }

      const dimensions = [...this._dimensions()]
      const slicers: ISlicer[] = [...(value.slicers ?? []), ...(value.dataSettings?.selectionVariant?.selectOptions ?? [])]
      if (slicers.length) {
        // Set slicers from selectionVariant
        this.slicers.set(
          slicers.reduce((acc, curr) => {
            if (!curr.dimension) {
              return acc
            }
            acc[curr.dimension.parameter || curr.dimension.dimension] = curr
            return acc
          }, {} as Record<string, ISlicer>)
        )
        // Udpate dimensions
        dimensions.push(...slicers
          .filter((slicer) => !!slicer.dimension && !slicer.dimension.parameter)
          .map((slicer) => pick(slicer.dimension, 'dimension', 'hierarchy') as Dimension)
          .filter((d) => d.dimension))
      }
      this._dimensions.set(uniqBy(dimensions, 'dimension'))
    }
  }
  private readonly _data = signal<{ dataSettings: DataSettings; chartAnnotation: ChartAnnotation }>(null)

  @Output() closed = new EventEmitter<any>()

  @ViewChild('addDimensionsTempl') addDimensionsTempl: TemplateRef<ElementRef>

  private dialogRef: DialogRef<ElementRef<any>, any>

  measureSearch = new FormControl('')

  readonly i18n = toSignal(this.translateService.stream('Story.Explorer'))
  readonly _dimensionsCache = signal<string[]>([])
  private _dimensions = signal<Dimension[]>([])
  dimensions = signal<{ dimension: Dimension; caption: string; hierarchies: Dimension[] }[]>([])

  readonly entityType = toSignal(
    toObservable(this._data).pipe(
      filter(nonNullable),
      map(({ dataSettings }) => dataSettings),
      filter((dataSettings) => !!(dataSettings?.dataSource && dataSettings?.entitySet)),
      switchMap((dataSettings) =>
        this.dsCoreService
          .selectEntitySet(dataSettings.dataSource, dataSettings.entitySet)
          .pipe(map(({ entityType }) => entityType))
      )
    )
  )
  readonly dimensionList = computed(() => {
    return getEntityDimensions(this.entityType())
  })
  readonly measureList = toSignal(
    toObservable(this.entityType).pipe(
      map(getEntityMeasures),
      combineLatestWith(this.measureSearch.valueChanges.pipe(startWith(''))),
      map(([measures, search]) => {
        return search
          ? measures.filter(
              (measure) =>
                measure.name.toLowerCase().includes(search.toLowerCase()) ||
                measure.caption.toLowerCase().includes(search.toLowerCase())
            )
          : measures
      })
    )
  )

  readonly dataSettings = computed<DataSettings>(() => {
    return pick(this.data?.dataSettings, 'dataSource', 'entitySet') as DataSettings
  })
  readonly dataSettingsChart = computed(() => {
    const chartAnnotation = assignDeepOmitBlank(
      {
        ...cloneDeep(
          omit(
            this.component()?.dataSettings?.chartAnnotation ?? this.data?.chartAnnotation ?? {},
            'dimensions',
            'measures'
          )
        )
      },
      {
        dimensions: this.rows().map((row) => ({
          ...row
        })),
        measures: [...this.columns()]
      },
      5
    )

    chartAnnotation.dimensions = chartAnnotation.dimensions.filter((d) => d.dimension)
    chartAnnotation.measures = chartAnnotation.measures.filter((d) => d.dimension)

    return {
      ...(this.data?.dataSettings ?? {}),
      chartAnnotation,
      selectionVariant: {
        selectOptions: Object.values(this.slicers())
          .map((slicer) => slicer)
          .filter((slicer) => isTimeRangesSlicer(slicer) || isSlicer(slicer))
      }
    }
  })
  readonly chartOptions = signal({
    legend: {
      show: true
    }
  })
  readonly chartTitle = computed(() => {
    let title = ''
    title += this.columns().map((column) => {
      const property = getEntityProperty(this.entityType(), column)
      return property?.caption
    }).filter(nonBlank).join(` ${this.i18n()?.And ?? 'and'} `)
    
    const by = this.rows().map((row) => {
      const property = getEntityLevel(this.entityType(), row)
      return property?.caption
    }).filter(nonBlank).join(` ${this.i18n()?.And ?? 'and'} `)

    if (by) {
      title += ` ${this.i18n()?.By ?? 'by'} (${by})`
    }
    return title
  })
  
  readonly dataSettingsGrid = computed(() => {
    const analytics = {
      ...(this.data?.analytics ?? {}),
      rows: this.rows(),
      columns: [...this.columns()]
    }

    return {
      ...(this.data?.dataSettings ?? {}),
      analytics,
      selectionVariant: {
        selectOptions: Object.values(this.slicers())
          .map((slicer) => slicer)
          .filter(nonNullable)
          .filter((slicer) => slicer?.members?.length)
      }
    } as DataSettings
  })

  readonly rows = signal<Dimension[]>([])
  readonly columns = signal<(Dimension | Measure)[]>([])
  readonly slicers = signal<{ [name: string]: ISlicer }>({})
  readonly component = signal({
    label: ChartTypeEnum.Bar,
    component: WidgetComponentType.AnalyticalCard,
    dataSettings: {
      chartAnnotation: {
        chartType: {
          type: ChartTypeEnum.Bar,
          orient: ChartOrient.horizontal
        },
        dimensions: [{}],
        measures: [{}]
      }
    } as DataSettings
  })
  readonly chartType = computed(() => {
    return this.component()?.dataSettings?.chartAnnotation?.chartType
  })

  get chartTypeChartOptions() {
    return this.component()?.dataSettings?.chartAnnotation?.chartType?.chartOptions
  }
  set chartTypeChartOptions(value) {
    this.component.set({
      ...this.component(),
      dataSettings: {
        ...this.component().dataSettings,
        chartAnnotation: {
          ...this.component().dataSettings.chartAnnotation,
          chartType: {
            ...this.component().dataSettings.chartAnnotation.chartType,
            chartOptions: value
          }
        }
      }
    })
  }

  view: 'table' | 'chart' = 'table'
  visualPanel: 'visual' | 'options' = 'visual'
  charts = CHARTS.map((item) => cloneDeep(item) as any)

  get chartSettings() {
    return this._chartSettings()
  }
  set chartSettings(value) {
    this._chartSettings.set(value)
  }
  private _chartSettings = signal<{ chartSettings?: any; chartOptions?: any }>({})

  get gridSettings() {
    return this._gridSettings()
  }
  set gridSettings(value) {
    this._gridSettings.set(value)
  }
  private _gridSettings = signal<{ options?: any }>({options: {
    showToolbar: true,
    paging: true,
    pageSize: 20,
    sticky: true,
    sortable: true
  }})

  readonly dimensionCapacities = computed(() => {
    if (this.component().component === WidgetComponentType.AnalyticalCard) {
      return [
        PropertyCapacity.Dimension,
        PropertyCapacity.Order,
        PropertyCapacity.DimensionChart
      ]
    } else {
      return [
        PropertyCapacity.Dimension,
        PropertyCapacity.Order,
      ]
    }
  })
  readonly measureCapacities = computed(() => {
    if (this.component().component === WidgetComponentType.AnalyticalCard) {
      return [
        PropertyCapacity.Measure,
        PropertyCapacity.Order,
        PropertyCapacity.MeasureAttributes,
        PropertyCapacity.MeasureStyle,
        PropertyCapacity.MeasureStyleRole,
        PropertyCapacity.MeasureStyleShape,
        PropertyCapacity.MeasureStylePalette,
        PropertyCapacity.MeasureStylePalettePattern,
        PropertyCapacity.MeasureStyleReferenceLine,
        PropertyCapacity.MeasureStyleChartOptions
      ]
    } else {
      return [
        PropertyCapacity.Measure,
        PropertyCapacity.Order,
        PropertyCapacity.MeasureAttributes,
        PropertyCapacity.MeasureStylePalette,
        PropertyCapacity.MeasureStyleGridBar
      ]
    }
  })

  explains = signal<any[]>([])

  /**
  |--------------------------------------------------------------------------
  | Copilot
  |--------------------------------------------------------------------------
  */
  #calcMeasureCommand = this.#storyService ? injectCalclatedMeasureCommand(this.dataSettings(), this.#storyService, async (calculation) => {
    console.log(calculation)
  }) : null

  constructor() {
    effect(
      () => {
        if (this.entityType()) {
          this.dimensions.set(this._dimensions().map((d) => {
            const property = getEntityProperty(this.entityType(), d)
            return {
              dimension: {
                dimension: d.dimension,
                hierarchy: d.hierarchy,
                displayBehaviour: DisplayBehaviour.descriptionOnly
              },
              caption: property.caption,
              hierarchies: property.hierarchies.map((hierarchy) => ({
                dimension: d.dimension,
                hierarchy: hierarchy.name,
                caption: hierarchy.caption
              }))
            }
          }))
        }
      },
      { allowSignalWrites: true }
    )

    if (this.#data?.data) {
      this.data = this.#data.data
    }
  }

  back() {
    this.closed.emit()
    this.#dialogRef?.close()
  }

  trackByDim(index, item) {
    return item?.dimension?.dimension
  }

  trackByIndex(index, item) {
    return index
  }

  setHierarchy(dimension: string, hierarchy: string | null) {
    const dimensions = [...this.dimensions()]
    const index = dimensions.findIndex((d) => d.dimension.dimension === dimension)
    dimensions[index] = {
      ...dimensions[index],
      dimension: {
        ...dimensions[index].dimension,
        hierarchy
      }
    }
    // Update dimensions
    this.dimensions.set(dimensions)
  }

  toggleHierarchy(dimension: string, hierarchy: string | null) {
    // Clear slicers for the dimension
    this.slicers.set({
      ...this.slicers(),
      [dimension]: {}
    })

    this.setHierarchy(dimension, hierarchy)
  }

  dropRowPredicate(item: CdkDrag<Dimension>) {
    return item.dropContainer.id === 'ngm-story-explorer__drop-list-dimensions'
  }

  dropRow(event: CdkDragDrop<Dimension[]>) {
    const items = [...this.rows()]
    if (event.previousContainer === event.container) {
      moveItemInArray(items, event.previousIndex, event.currentIndex)
    } else {
      items.splice(
        event.currentIndex,
        0,
        isString(event.item.data.dimension) ? { ...event.item.data } : { ...event.item.data.dimension }
      )
    }
    this.rows.set(items)
  }

  removeRow(i: number) {
    const items = [...this.rows()]
    items.splice(i, 1)
    this.rows.set(items)
  }

  dropColumnPredicate(item: CdkDrag<Dimension>) {
    return item.dropContainer.id === 'ngm-story-explorer__drop-list-measures'
  }

  dropColumn(event: CdkDragDrop<(Dimension | Measure)[]>) {
    const items = [...this.columns()]
    if (event.previousContainer === event.container) {
      moveItemInArray(items, event.previousIndex, event.currentIndex)
    } else {
      items.splice(event.currentIndex, 0, {
        dimension: C_MEASURES,
        measure: event.item.data.name,
        caption: event.item.data.caption
      })
    }
    this.columns.set(items)
  }

  removeColumn(i: number) {
    const items = [...this.columns()]
    items.splice(i, 1)
    this.columns.set(items)
  }

  onRowChange(row: Dimension, i: number) {
    this.rows.set([...this.rows().slice(0, i), row, ...this.rows().slice(i + 1)])
  }

  onColumnChange(row: Dimension, i: number) {
    this.columns.set([...this.columns().slice(0, i), row, ...this.columns().slice(i + 1)])
  }

  onSlicersChange(slicer: ISlicer, dimension: string) {
    // Set slicer for the dimension
    this.slicers.set({
      ...this.slicers(),
      [dimension]: slicer
    })
  }

  createWidget(widget: any) {
    this.component.set(widget)
    if (this.component().component === WidgetComponentType.AnalyticalCard) {
      this.view = 'chart'
    }
  }

  addDimensionToCache(event: string[]) {
    this._dimensionsCache.set([...event])
  }

  openDimensions() {
    this._dimensionsCache.set(this._dimensions().map((d) => d.dimension))
    this.dialogRef = this.#dialog.open(this.addDimensionsTempl,)
  }

  addDimensions() {
    // Add new dimensions
    this._dimensionsCache().forEach((dimension) => {
      const index = this._dimensions().findIndex((d) => d.dimension === dimension)
      if (index === -1) {
        this._dimensions.set([
          ...this._dimensions(),
          {
            dimension,
            hierarchy: null
          }
        ])
      }
    })
    // Remove dimensions
    this._dimensions().forEach((dimension) => {
      const index = this._dimensionsCache().findIndex((d) => d === dimension.dimension)
      if (index === -1) {
        this._dimensions.set(this._dimensions().filter((d) => d.dimension !== dimension.dimension))
        this.slicers.set(omit(this.slicers(), dimension.dimension))
      }
    })
    this.dialogRef.close()
  }

  moveDimension(event: CdkDragDrop<any[]>) {
    const items = [...this.dimensions()]
    if (event.previousContainer === event.container) {
      moveItemInArray(items, event.previousIndex, event.currentIndex)
      this.dimensions.set(items)
    }
  }

  closeDimensions() {
    this.dialogRef.close()
  }

  setExplains(explains: any[]) {
    this.explains.set(explains)
  }

  async openExplain() {
    await firstValueFrom(this.#dialog.open(ExplainComponent, {
      data: [...(this.explains() ?? []), {slicers: this.slicers()}]}
    ).closed)
  }

  close() {
    const result = this.component().component === WidgetComponentType.AnalyticalCard ?
      {
        dataSettings: this.dataSettingsChart(),
        chartSettings: this.chartSettings?.chartSettings,
        chartOptions: this.chartSettings?.chartOptions,
      } : {
        dataSettings:this.dataSettingsGrid(),
        options: this.gridSettings?.options,
      }
    this.closed.emit(result)
    this.#dialogRef?.close(result)
  }
}
