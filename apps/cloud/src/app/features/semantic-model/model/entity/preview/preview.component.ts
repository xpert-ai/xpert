import { CdkDrag, CdkDragDrop, DragDropModule, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject, model, signal, ViewChild } from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { nonNullable } from '@metad/core'
import { AnalyticalGridComponent, AnalyticalGridModule } from '@metad/ocap-angular/analytical-grid'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { NgmControlsModule } from '@metad/ocap-angular/controls'
import { DisplayDensity, linkedModel, NgmDensityDirective } from '@metad/ocap-angular/core'
import { NgmEntityModule, PropertyCapacity } from '@metad/ocap-angular/entity'
import { C_MEASURES, DataSettings, Dimension, FilterOperator, getEntityVariables, getEntityParameters, isEntitySet, ISlicer, Measure, PresentationVariant, Syntax, AggregationRole, ParameterProperty } from '@metad/ocap-core'
import { ContentLoaderModule } from '@ngneat/content-loader'
import { TranslateModule } from '@ngx-translate/core'
import { differenceBy, isEmpty } from 'lodash-es'
import { BehaviorSubject, combineLatest, filter, from, map, of, switchMap } from 'rxjs'
import { SemanticModelService } from '../../model.service'
import { ModelEntityService } from '../entity.service'
import { getDropProperty } from '../types'
import { CdkDragDropContainers } from '../../types'
import { derivedAsync } from 'ngxtension/derived-async'
import { getErrorMessage } from '@cloud/app/@core'
import { MatIconModule } from '@angular/material/icon'
import { MatButtonModule } from '@angular/material/button'
import { MatTooltipModule } from '@angular/material/tooltip'
import { MatExpansionModule } from '@angular/material/expansion'
import { Dialog } from '@angular/cdk/dialog'
import { ExplainComponent } from '@metad/story/story'
import { MatSlideToggleModule } from '@angular/material/slide-toggle'
import { NgmPresentationComponent } from '@metad/ocap-angular/selection'
import { NgmParameterComponent } from '@metad/ocap-angular/parameter'

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'pac-model-entity-preview',
  templateUrl: './preview.component.html',
  styleUrls: ['./preview.component.scss'],
  host: {
    class: 'pac-model-entity-preview'
  },
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    ContentLoaderModule,
    DragDropModule,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
    MatExpansionModule,
    MatSlideToggleModule,

    NgmCommonModule,
    AnalyticalGridModule,
    NgmControlsModule,
    NgmEntityModule,
    NgmDensityDirective,
    NgmPresentationComponent,
    NgmParameterComponent
  ]
})
export class ModelEntityPreviewComponent {
  DisplayDensity = DisplayDensity
  Syntax = Syntax
  propertyCapacities = [
    PropertyCapacity.Dimension,
    PropertyCapacity.MeasureGroup,
    PropertyCapacity.Measure,
    PropertyCapacity.Order,
    PropertyCapacity.MeasureAttributes
  ]

  readonly modelService = inject(SemanticModelService)
  readonly entityService = inject(ModelEntityService)
  readonly #dialog = inject(Dialog)

  @ViewChild(AnalyticalGridComponent) grid!: AnalyticalGridComponent<any>

  private rows$ = new BehaviorSubject<Array<Dimension | Measure>>([...(this.entityService.preview?.rows ?? [])])
  get rows() {
    return this.rows$.value
  }
  set rows(value) {
    this.rows$.next(value)
  }

  get columns() {
    return this.columns$.value
  }
  set columns(value) {
    this.columns$.next(value)
  }
  readonly columns$ = new BehaviorSubject<Array<Dimension | Measure>>([
    ...(this.entityService.preview?.columns ?? [])
  ])

  get slicers() {
    return this.slicers$.value
  }
  set slicers(value) {
    this.slicers$.next(value)
  }
  readonly slicers$ = new BehaviorSubject<ISlicer[]>([...(this.entityService.preview?.slicers ?? [])])

  readonly variables = model<{ [name: string]: ISlicer | null }>({})

  reverse = false

  // readonly entityError = toSignal(this.entityService.entityError$)

  private refresh$ = new BehaviorSubject<boolean | null>(null)

  readonly analytics$ = combineLatest([
    this.refresh$.pipe(switchMap((refresh) => (this.manualRefresh ? from([refresh, false]) : of(refresh)))),
    this.rows$,
    this.columns$,
    this.slicers$,
    toObservable(this.variables)
  ]).pipe(
    filter(([refresh, rows, columns]) => {
      return (!this.manualRefresh || refresh) && (!isEmpty(rows) || !isEmpty(columns))
    }),
    map(([, rows, columns, slicers, variables]) => {
      slicers = (slicers?.filter(Boolean) ?? []).map((item) => ({ ...item }))
      slicers.push(
        ...Object.keys(variables)
          .map((name) =>
            variables[name]?.members?.length
              ? { ...variables[name], dimension: { ...variables[name].dimension, parameter: name } }
              : null
          )
          .filter(nonNullable)
      )
      return this.reverse
        ? {
            rows: [...columns],
            columns: [...rows],
            slicers: [...slicers]
          }
        : {
            rows: [...rows],
            columns: [...columns],
            slicers: [...slicers]
          }
    })
  )

  manualRefresh = false
  entities = []

  readonly analytics = toSignal(this.analytics$)

  private readonly modelKey = toSignal(this.modelService.model$.pipe(map((model) => model.key ?? model.name)))
  private readonly cubeName = toSignal(
    this.entityService.cube$.pipe(
      map((cube) => cube?.name),
      filter(nonNullable)
    )
  )

  readonly modelType = toSignal(this.modelService.modelType$)
  readonly dialect = this.modelService.dialect

  readonly dataSettings = computed(() => ({
    dataSource: this.modelKey(),
    entitySet: this.cubeName()
  }))

  readonly presentationVariant = model<PresentationVariant>({
    maxItems: 1000
  })

  readonly analyticsDataSettings = computed(() => ({
    ...this.dataSettings(),
    analytics: this.analytics(),
    selectionVariant: {
      selectOptions: this.analytics()?.slicers,
    },
    presentationVariant: this.presentationVariant()
  } as DataSettings))

  readonly #entityType = derivedAsync(() => {
    const cubeName = this.cubeName()
    return cubeName ? this.modelService.dataSource$.pipe(
      filter(nonNullable),
      switchMap((dataSource) => dataSource.selectEntitySet(cubeName)),
      map((result) => isEntitySet(result) ? {entityType: result.entityType} : {error: getErrorMessage(result)})
    ) : of(null)
  })
  
  readonly entityType = computed(() => this.#entityType()?.entityType)
  readonly entityError = computed(() => this.#entityType()?.error)

  readonly variableList = computed(() => getEntityVariables(this.entityType()))
  readonly parameters = computed(() => getEntityParameters(this.entityType()).filter(({role}) => role !== AggregationRole.variable))

  readonly explains = signal<any[]>([])

  constructor() {
    effect(() => {
      this.variableList().forEach((variable) => {
        if (!this.variables[variable.name]?.members?.length && variable.defaultLow) {
          const members = [
            {
              key: variable.defaultLow,
              caption: variable.defaultLowCaption
            }
          ]

          if (variable.defaultHigh) {
            members.push({
              key: variable.defaultHigh,
              caption: variable.defaultHighCaption
            })
          }
          this.variables.update((state) => ({
            ...state,
            [variable.name]: {
              dimension: {
                dimension: variable.referenceDimension,
                hierarchy: variable.referenceHierarchy,
                parameter: variable.name
              },
              members,
              operator: variable.defaultHigh ? FilterOperator.BT : null
            }
          }))
        }
      })
    }, { allowSignalWrites: true })
  }

  onVariable(name: string, event: ISlicer | null) {
    this.variables.update((state) => ({ ...state, [name]: event }))
  }

  trackByIndex(index: number, el: any): number {
    return index
  }

  refresh() {
    this.refresh$.next(true)
    this.grid.refresh(true)
  }

  onRowChange(event, i: number) {
    const rows = [...this.rows]
    rows[i] = event
    this.rows = rows
  }
  onColumnChange(event, i: number) {
    const columns = [...this.columns]
    columns[i] = event
    this.columns = columns
  }
  onSlicerChange(event: ISlicer, i: number) {
    const filters = [...this.slicers]
    filters[i] = event
    this.slicers = filters
  }

  trackByDim(i: number, item: any) {
    return item?.dimension?.dimension
  }

  removeRow(index: number) {
    this.rows.splice(index, 1)
    this.rows = this.rows
  }

  removeColumn(index: number) {
    this.columns.splice(index, 1)
    this.columns = this.columns
  }

  removeSlicer(i: number) {
    const filters = [...this.slicers]
    filters.splice(i, 1)
    this.slicers = filters
  }

  newSlicer() {
    this.slicers = [...this.slicers, null]
  }

  add(type: 'columns' | 'rows') {
    if (type === 'columns') {
      this.columns = [...this.columns, {}]
    } else if (type === 'rows') {
      this.rows = [...this.rows, {}]
    }
  }

  dropRowsPredicate(item: CdkDrag<any>) {
    return (
      // dimensions
      item.dropContainer.id === CdkDragDropContainers.Dimensions ||
      item.dropContainer.id === CdkDragDropContainers.Measures ||
      item.dropContainer.id === CdkDragDropContainers.CalculatedMembers ||
      item.dropContainer.id === CdkDragDropContainers.Calculations
    )
  }

  dropSlicersPredicate(item: CdkDrag<any>) {
    return (
      // dimensions
      item.dropContainer.id === CdkDragDropContainers.Dimensions
    )
  }

  drop(event: CdkDragDrop<unknown[]>) {
    const dialect = this.dialect()

    const data = event.item.data
    if (event.previousContainer === event.container) {
      if (event.previousContainer.id === 'property-modeling-rows') {
        moveItemInArray(this.rows, event.previousIndex, event.currentIndex)
      } else if (event.previousContainer.id === 'property-modeling-columns') {
        moveItemInArray(this.columns, event.previousIndex, event.currentIndex)
      }
    } else {
      if (event.previousContainer.id === 'list-dimensions') {
        const item = getDropProperty(event, this.modelType(), this.dialect())

        if (event.container.id === 'property-modeling-rows') {
          const rows = differenceBy(this.rows, [item], 'dimension')
          rows.splice(event.currentIndex, 0, item)
          this.rows = rows
        } else if (event.container.id === 'property-modeling-columns') {
          const columns = differenceBy(this.columns, [item], 'dimension')
          columns.splice(event.currentIndex, 0, item)
          this.columns = columns
        } else if (event.container.id === 'property-modeling-slicers') {
          this.slicers = [
            ...this.slicers,
            {
              dimension: item,
              members: []
            }
          ]
        }
      } else if (
        event.previousContainer.id === CdkDragDropContainers.Measures ||
        event.previousContainer.id === CdkDragDropContainers.CalculatedMembers ||
        event.previousContainer.id === CdkDragDropContainers.Calculations
      ) {
        let rows = null
        if (event.container.id === 'property-modeling-rows') {
          rows = [...this.rows]
        } else if (event.container.id === 'property-modeling-columns') {
          rows = [...this.columns]
        }

        if (rows) {
          const index = rows.findIndex((row) => row.dimension === C_MEASURES && row.measure === data.name)
          if (index > -1) {
            // rows.splice(index, 1)
          } else {
            rows.splice(event.currentIndex, 0, {
              dimension: C_MEASURES,
              measure: data.name
            })
          }
        }

        if (event.container.id === 'property-modeling-rows') {
          this.rows = rows
        } else if (event.container.id === 'property-modeling-columns') {
          this.columns = rows
        }
      } else if (event.previousContainer.id === 'property-modeling-rows') {
        if (event.container.id === 'property-modeling-columns') {
          transferArrayItem(event.previousContainer.data, event.container.data, event.previousIndex, event.currentIndex)
        } else if (event.container.id === 'property-modeling-slicers') {
          const moves = this.rows.splice(event.previousIndex, 1)
          this.slicers.splice(event.currentIndex, 0, ...moves.map((dimension) => ({ dimension })))
        }
      } else if (event.previousContainer.id === 'property-modeling-columns') {
        if (event.container.id === 'property-modeling-rows') {
          transferArrayItem(event.previousContainer.data, event.container.data, event.previousIndex, event.currentIndex)
        } else if (event.container.id === 'property-modeling-slicers') {
          const moves = this.columns.splice(event.previousIndex, 1)
          this.slicers.splice(event.currentIndex, 0, ...moves.map((dimension) => ({ dimension })))
        }
      } else if (event.previousContainer.id === 'property-modeling-slicers') {
        if (event.container.id === 'property-modeling-rows') {
          const moves = this.slicers.splice(event.previousIndex, 1)
          this.rows.splice(event.currentIndex, 0, ...moves.map((slicer) => slicer.dimension))
        } else if (event.container.id === 'property-modeling-columns') {
          const moves = this.slicers.splice(event.previousIndex, 1)
          this.columns.splice(event.currentIndex, 0, ...moves.map((slicer) => slicer.dimension))
        }
      }
    }
  }

  setExplains(items: unknown[]) {
    this.explains.set(items)
  }

  openExplain() {
    this.#dialog.open(ExplainComponent, {
      data: this.explains()
    })
  }

  ngOnDestroy() {
    this.entityService.setPreview({
      rows: this.rows,
      columns: this.columns,
      slicers: this.slicers
    })
  }
}
