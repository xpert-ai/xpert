import { CdkDrag, CdkDragDrop, CdkDragRelease, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop'
import { CommonModule } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  HostBinding,
  Injector,
  computed,
  effect,
  inject,
  model,
  output,
  signal
} from '@angular/core'
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { nonBlank } from '@metad/core'
import { injectConfirmOptions, NgmCommonModule, SplitterType } from '@metad/ocap-angular/common'
import { effectAction } from '@metad/ocap-angular/core'
import { NgmEntityPropertyComponent } from '@metad/ocap-angular/entity'
import {
  AggregationRole,
  Join,
  Property,
  PropertyDimension,
  PropertyHierarchy,
  PropertyLevel,
  PropertyMeasure,
  Table,
  getEntityDimensions,
  getEntityMeasures,
  pick
} from '@metad/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import { ToastrService, uuid } from 'apps/cloud/src/app/@core'
import { isEmpty, values } from 'lodash-es'
import { NGXLogger } from 'ngx-logger'
import { derivedAsync } from 'ngxtension/derived-async'
import { Observable, combineLatest, firstValueFrom } from 'rxjs'
import { filter, map, shareReplay, switchMap, tap, withLatestFrom } from 'rxjs/operators'
import { SemanticModelService } from '../../model.service'
import { CdkDragDropContainers, MODEL_TYPE } from '../../types'
import { ModelEntityService } from '../entity.service'
import { newDimensionFromColumn } from '../types'
import { MatIconModule } from '@angular/material/icon'
import { MatTooltipModule } from '@angular/material/tooltip'
import { MatCheckboxModule } from '@angular/material/checkbox'
import { injectI18nService } from '@cloud/app/@shared/i18n'


@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Default,
  selector: 'pac-model-cube-fact',
  templateUrl: './fact.component.html',
  styleUrls: ['./fact.component.scss'],
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    MatIconModule,
    MatTooltipModule,
    MatCheckboxModule,
    NgmCommonModule,
    NgmEntityPropertyComponent,
  ]
})
export class ModelCubeFactComponent {
  @HostBinding('class.pac-model-cube-structure') _isModelCubeStructure = true
  SplitterType = SplitterType

  public modelService = inject(SemanticModelService)
  public entityService = inject(ModelEntityService)
  private readonly _toastrService = inject(ToastrService)
  private readonly _destroyRef = inject(DestroyRef)
  readonly #logger = inject(NGXLogger)
  readonly injector = inject(Injector)
  readonly confirmOptions = injectConfirmOptions()
  readonly i18n = injectI18nService()

  // Outputs
  readonly close = output<void>()

  /**
  |--------------------------------------------------------------------------
  | Signals
  |--------------------------------------------------------------------------
  */
  readonly dimensions = signal<Property[]>([])
  readonly measures = signal<Property[]>([])
  readonly allVisible = signal(false)
  readonly loading = signal(false)
  readonly search = model<string>()
  

  readonly visibleIndeterminate = computed(
    () =>
      (this.dimensions().some((item) => item.visible) || this.measures().some((item) => item.visible)) &&
      !this.allVisible()
  )
  readonly visibleEmpty = computed(
    () => !(this.dimensions().some((item) => item.visible) || this.measures().some((item) => item.visible))
  )

  readonly isXmla$ = this.modelService.modelType$.pipe(filter((modelType) => modelType === MODEL_TYPE.XMLA))
  readonly isXmla = toSignal(this.isXmla$)
  readonly isSQLSource = toSignal(this.modelService.isSQLSource$)

  readonly cube$ = this.entityService.cube$
  readonly tables$ = this.entityService.tables$
  readonly factTable$ = this.cube$.pipe(map((cube) => {
    if (cube?.fact?.type === 'table') {
      return cube.fact.table?.name
    } else if (cube?.fact?.type === 'view') {
      return cube.fact.view?.alias
    } else {
      return cube.tables?.[0]?.name
    }
  }))

  readonly fectTableFields = derivedAsync(() => {
    return this.factTable$.pipe(
      filter(nonBlank),
      switchMap((tableName) => {
        this.loading.set(true)
        return this.modelService.selectOriginalEntityProperties(tableName).pipe(
          tap(() => this.loading.set(false))
        )
      })
    )
  })
  readonly fectTableFieldOptions = computed(() =>
    this.fectTableFields()?.map((property) => ({
      key: property.name,
      value: property,
      caption: property.caption
    }))
  )

  private _tableTypes = {}

  // Subscribers
  private _originEntityTypeSub$ = this.isXmla$.pipe(
    switchMap(() => {
      this.loading.set(true)
      return this.entityService.originalEntityType$.pipe(
        tap(() => this.loading.set(false)),
      )
    }),
    filter(() => isEmpty(this.dimensions()) && isEmpty(this.measures())),
    takeUntilDestroyed()
  ).subscribe((entityType) => {
    this.dimensions.set(
      structuredClone(getEntityDimensions(entityType).map((item) => ({ ...item, dataType: 'dimension' })))
    )
    this.measures.set(structuredClone(getEntityMeasures(entityType).map((item) => ({ ...item, dataType: 'measure' }))))
  })

  constructor() {
    effect(
      () => {
        const properties = this.fectTableFields()
        const dimensions = this.entityService.tableDimensions()
        const measures = this.entityService.tableMeasures()

        if (isEmpty(dimensions) && isEmpty(measures) && properties) {
          this.dimensions.set(
            dimensions ??
              properties.filter(
                (item) => item.role === AggregationRole.dimension && item.dataType?.toLowerCase() !== 'numeric'
              )
          )

          this.measures.set(
            measures ??
              properties.filter(
                (item) => item.role === AggregationRole.measure || item.dataType?.toLowerCase() === 'numeric'
              )
          )
        }
      },
      { allowSignalWrites: true }
    )
  }

  toggleDimVisible(property: Property, visible: boolean) {
    this.dimensions.update((dimensions) => {
      const index = dimensions.findIndex((item) => item === property)
      dimensions[index].visible = visible
      return [...dimensions]
    })
  }

  toggleMeasureVisible(property: Property, visible: boolean) {
    this.measures.update((measures) => {
      const index = measures.findIndex((item) => item === property)
      measures[index].visible = visible
      return [...measures]
    })
  }

  dropEnterPredicate(item: CdkDrag<any>) {
    return item.dropContainer.id === 'list-table-measures' || item.dropContainer.id === 'list-table-dimensions'
  }

  async dropProperty(event: CdkDragDrop<Property[]>) {
    if (
      (event.previousContainer.id === 'list-table-dimensions' && event.container.id === 'list-table-measures') ||
      (event.previousContainer.id === 'list-table-measures' && event.container.id === 'list-table-dimensions')
    ) {
      transferArrayItem(event.previousContainer.data, event.container.data, event.previousIndex, event.currentIndex)
    } else if (event.previousContainer === event.container) {
      moveItemInArray(event.container.data, event.previousIndex, event.currentIndex)
    }
  }

  onDragReleased(event: CdkDragRelease) {
    this.modelService.dragReleased$.next(event.source.dropContainer._dropListRef)
  }

  async confirmOverwriteCube() {
    if (
      !this.dimensions().filter((item) => item.visible).length &&
      !this.measures().filter((item) => item.visible).length
    ) {
      this._toastrService.warning('PAC.MODEL.ENTITY.PleaseSelectFields', { Default: 'Please select fields!' })
      return false
    }

    const cube = await firstValueFrom(this.entityService.cube$)
    if (cube.dimensions?.length || cube.measures?.length) {
      return await firstValueFrom(
        this._toastrService.confirm({
          code: 'PAC.MODEL.ENTITY.ConfirmOverwriteCube',
          params: {
            Default: 'The cube configured. Confirm overwrite?'
          }
        })
      )
    }

    return true
  }

  /**
   * 由数据库表字段生成 Schema cube 定义
   */
  async generate() {
    if (!(await this.confirmOverwriteCube())) {
      return
    }

    const modelType = await firstValueFrom(this.modelService.modelType$)

    const dimensions = this.dimensions()
      .filter((item) => item.visible)
      // Xmla 数据源的直接同步，sql 数据源的 1 生成 olap 维度 2 生成 sql 维度
      .map((item) =>
        modelType === MODEL_TYPE.XMLA
          ? { ...item, __id__: uuid() }
          : newDimensionFromColumn(item, modelType === MODEL_TYPE.OLAP)
      )

    const measures = this.measures()
      .filter((item) => item.visible)
      .map((measure) => {
        return {
          __id__: uuid(),
          name: measure.name,
          caption: measure.caption,
          column: measure.name,
          aggregator: 'sum',
          visible: true
        } as PropertyMeasure
      })

    // Set cube defination
    this.entityService.updateCube({
      dimensions,
      measures
    })
    // Save current meta from data source
    this.entityService.tableDimensions.set(this.dimensions())
    this.entityService.tableMeasures.set(this.measures())
  }

  createDimension() {
    const levels = this.dimensions().filter((item) => item.visible)
    this.confirmOptions<{name: string; caption: string;}>({
      information: this.i18n.translate('PAC.MODEL.ENTITY.CreateDimension', {Default: 'Create an dimension'}),
      formFields: [
        {
          key: 'name',
          type: 'input',
          defaultValue: levels.length === 1 ? levels[0].name : '',
          props: {
            label: this.i18n.translate('PAC.KEY_WORDS.Name', {Default: 'Name'}),
            required: true
          }
        },
        {
          key: 'caption',
          type: 'input',
          defaultValue: levels.length === 1 ? levels[0].caption : '',
          props: {
            label: this.i18n.translate('PAC.KEY_WORDS.Caption', {Default: 'Caption'}),
          }
        }
      ]
    }).subscribe({
      next: (value) => {
        if (value) {
          // Add new dimension using fields as levels
          this.entityService.insertDimension({
            dimension: {
              __id__: uuid(),
              name: value.name,
              caption: value.caption,
              hierarchies: [
                {
                  __id__: uuid(),
                  name: '',
                  hasAll: true,
                  levels: levels.map((property) => ({
                    __id__: uuid(),
                    name: property.name,
                    caption: property.caption,
                    column: property.name
                  }))
                }
              ]
            }
          })
          // Deselect all fields
          this.toggleVisibleAll(false)
          // Emit dimension created event
          this.entityService.event$.next({ type: 'dimension-created' })
        }
      }
    })
  }

  /**
   * Synchronize Cube definitions from XMLA data sources to local schema for enhancement
   */
  async sync() {
    if (!(await this.confirmOverwriteCube())) {
      return
    }

    const dimensions = this.dimensions()
      .filter((item) => item.visible)
      .map((dim) => {
        const dimension = pick(dim, '__id__', 'name', 'caption') as PropertyDimension
        if (dim.hierarchies) {
          dimension.hierarchies = dim.hierarchies.map((hier) => {
            const hierarchy = pick(hier, '__id__', 'name', 'caption') as PropertyHierarchy
            if (hier.levels) {
              hierarchy.levels = hier.levels.map((l) => {
                const level = pick(l, '__id__', 'name', 'caption') as PropertyLevel
                return level
              })
            }
            return hierarchy
          })
        }
        return dimension
      })

    const measures = this.measures()
      .filter((item) => item.visible)
      .map(
        (measure) =>
          ({
            ...pick(measure, 'name', 'caption'),
            __id__: uuid()
          } as PropertyMeasure)
      )

    // Set cube defination
    this.entityService.updateCube({
      dimensions,
      measures
    })
    // Emit dimension created event
    this.entityService.event$.next({ type: 'dimension-created' })

    // Save current meta from data source: @todo Why???
    this.entityService.tableDimensions.set(this.dimensions())
    this.entityService.tableMeasures.set(this.measures())
  }

  toggleVisibleAll(visible: boolean) {
    this.dimensions.update((dimensions) => dimensions.map((item) => ({ ...item, visible })))
    this.measures.update((measures) => measures.map((item) => ({ ...item, visible })))
  }

  selectTableType(table: Table) {
    if (!this._tableTypes[table?.name]) {
      this._tableTypes[table?.name] = this.modelService.selectOriginalEntityType(table?.name).pipe(
        map((entityType) =>
          values(entityType?.properties).map((property) => ({
            value: property,
            key: property.name,
            caption: property.caption
          }))
        ),
        takeUntilDestroyed(this._destroyRef),
        shareReplay(1)
      )
    }
    return this._tableTypes[table?.name]
  }

  readonly drop = effectAction((event$: Observable<CdkDragDrop<Table[]>>) => {
    return event$.pipe(
      withLatestFrom(this.tables$),
      tap(([event, tables]) => {
        if (event.previousContainer === event.container) {
          moveItemInArray(event.container.data, event.previousIndex, event.currentIndex)
        } else if (event.previousContainer.id === CdkDragDropContainers.Tables) {
          const name = event.item.data.name
          this.entityService.addCubeTable(
            isEmpty(tables)
              ? { name }
              : {
                  name,
                  join: {
                    type: 'Inner',
                    fields: [
                      {
                        leftKey: null,
                        rightKey: null
                      }
                    ]
                  }
                }
          )
        }
      })
    )
  })

}
