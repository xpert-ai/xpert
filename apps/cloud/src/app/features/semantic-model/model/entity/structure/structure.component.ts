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
  signal
} from '@angular/core'
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { NxCoreService, nonBlank } from '@metad/core'
import { NgmCommonModule, SplitterType } from '@metad/ocap-angular/common'
import { effectAction } from '@metad/ocap-angular/core'
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
import { TranslationBaseComponent } from 'apps/cloud/src/app/@shared/language'
import { isEmpty, values } from 'lodash-es'
import { NGXLogger } from 'ngx-logger'
import { derivedAsync } from 'ngxtension/derived-async'
import { Observable, combineLatest, firstValueFrom } from 'rxjs'
import { filter, map, shareReplay, switchMap, tap, withLatestFrom } from 'rxjs/operators'
import { SemanticModelService } from '../../model.service'
import { CdkDragDropContainers, MODEL_TYPE } from '../../types'
import { ModelEntityService } from '../entity.service'
import { ERComponent } from '../er'
import { newDimensionFromColumn } from '../types'

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Default,
  selector: 'pac-model-structure',
  templateUrl: './structure.component.html',
  styleUrls: ['./structure.component.scss'],
  imports: [CommonModule, FormsModule, TranslateModule, NgmCommonModule, ERComponent]
})
export class ModelEntityStructureComponent extends TranslationBaseComponent {
  @HostBinding('class.pac-model-cube-structure') _isModelCubeStructure = true
  SplitterType = SplitterType

  public coreService = inject(NxCoreService)
  public modelService = inject(SemanticModelService)
  public entityService = inject(ModelEntityService)
  private readonly _toastrService = inject(ToastrService)
  private readonly _destroyRef = inject(DestroyRef)
  readonly #logger = inject(NGXLogger)
  readonly injector = inject(Injector)

  /**
  |--------------------------------------------------------------------------
  | Signals
  |--------------------------------------------------------------------------
  */
  readonly dimensions = signal<Property[]>([])
  readonly measures = signal<Property[]>([])
  readonly allVisible = signal(false)
  readonly loading = signal(false)
  readonly fectTableFields = derivedAsync(() => {
    return this.factTable$.pipe(
      map((table) => table?.name),
      filter(nonBlank),
      switchMap((tableName) => {
        this.loading.set(true)
        return this.modelService.selectOriginalEntityProperties(tableName).pipe(tap(() => this.loading.set(false)))
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

  readonly visibleIndeterminate = computed(
    () =>
      (this.dimensions().some((item) => item.visible) || this.measures().some((item) => item.visible)) &&
      !this.allVisible()
  )
  readonly visibleEmpty = computed(
    () => !(this.dimensions().some((item) => item.visible) || this.measures().some((item) => item.visible))
  )

  public readonly isXmla$ = this.modelService.modelType$.pipe(filter((modelType) => modelType === MODEL_TYPE.XMLA))
  public readonly isSQLSource$ = this.modelService.isSQLSource$

  public readonly tables$ = this.entityService.tables$
  public readonly factTable$ = this.tables$.pipe(map((tables) => tables?.[0]))

  options$ = combineLatest([this.modelService.wordWrap$, this.coreService.onThemeChange()]).pipe(
    map(([wordWrap, { name }]) => ({
      wordWrap,
      theme: name === 'default' ? 'vs' : `vs-${name}`
    }))
  )

  public readonly expression = toSignal(this.entityService.cube$.pipe(map((cube) => cube?.expression)))

  private _tableJoins = {}
  private _tableTypes = {}

  // Subscribers
  private _originEntityTypeSub$ = this.isXmla$
    .pipe(
      switchMap(() => {
        this.loading.set(true)
        return this.entityService.originalEntityType$.pipe(tap(() => this.loading.set(false)))
      }),
      filter(() => isEmpty(this.dimensions()) && isEmpty(this.measures())),
      takeUntilDestroyed()
    )
    .subscribe((entityType) => {
      this.dimensions.set(
        structuredClone(getEntityDimensions(entityType).map((item) => ({ ...item, dataType: 'dimension' })))
      )
      this.measures.set(
        structuredClone(getEntityMeasures(entityType).map((item) => ({ ...item, dataType: 'measure' })))
      )
    })

  constructor() {
    super()

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
    return item.dropContainer.id === CdkDragDropContainers.FactTableMeasures || item.dropContainer.id === CdkDragDropContainers.FactTableDimensions
  }

  async dropProperty(event: CdkDragDrop<Property[]>) {
    if (
      (event.previousContainer.id === CdkDragDropContainers.FactTableDimensions && event.container.id === CdkDragDropContainers.FactTableMeasures) ||
      (event.previousContainer.id === CdkDragDropContainers.FactTableMeasures && event.container.id === CdkDragDropContainers.FactTableDimensions)
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
   * Generate Schema cube definition from database table fields
   */
  async generate() {
    if (!(await this.confirmOverwriteCube())) {
      return
    }

    const modelType = await firstValueFrom(this.modelService.modelType$)

    const dimensions = this.dimensions()
      .filter((item) => item.visible)
      // Direct synchronization of Xmla data source, 1 Generate olap dimension 2 Generate sql dimension for sql data source
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

  async createDimension() {
    const levels = this.dimensions().filter((item) => item.visible)
    // Add new dimension using fields as levels
    this.entityService.addDimension({
      __id__: uuid(),
      name: '',
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
    })
    // Deselect all fields
    this.toggleVisibleAll(false)
    // Emit dimension created event
    this.entityService.event$.next({ type: 'dimension-created' })
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
          }) as PropertyMeasure
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

  selectTableJoin(table: Table) {
    if (!this._tableJoins[table.__id__]) {
      this._tableJoins[table.__id__] = this.tables$.pipe(
        map((tables) => tables.find(({ __id__ }) => __id__ === table.__id__)?.join),
        takeUntilDestroyed(this._destroyRef),
        shareReplay(1)
      )
    }
    return this._tableJoins[table.__id__] as Observable<Join>
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

  changeExpression(value) {
    this.entityService.setExpression(value)
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

  removeTable(table: Table) {
    this.entityService.removeCubeTable(table)
  }

  changeJoinType(table: Table, type) {
    this.entityService.changeTableJoinType({ table, type })
  }

  addJoinField(table: Table) {
    this.entityService.addCubeTableJoin(table)
  }

  removeJoinField(table: Table, index: number) {
    this.entityService.removeJoinField({ table, index })
  }

  changeLeftKey(table: Table, index: number, key: string) {
    this.entityService.changeJoinLeftKey({ table, index, key: key as string })
  }

  changeRightKey(table: Table, index: number, key: string) {
    this.entityService.changeJoinRightKey({ table, index, key: key as string })
  }
}
