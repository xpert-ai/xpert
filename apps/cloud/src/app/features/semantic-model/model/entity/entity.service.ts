import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop'
import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core'
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop'
import { ActivatedRoute, Router } from '@angular/router'
import { nonNullable } from '@metad/core'
import { effectAction } from '@metad/ocap-angular/core'
import {
  AggregationRole,
  C_MEASURES,
  CalculatedMember,
  Cube,
  DimensionUsage,
  EntityProperty,
  EntityType,
  Property,
  PropertyAttributes,
  PropertyDimension,
  PropertyHierarchy,
  PropertyLevel,
  PropertyMeasure,
  Table,
  getHierarchyById,
  getLevelById,
  isEntitySet,
  isNil,
  nonBlank
} from '@metad/ocap-core'
import { NxSettingsPanelService } from '@metad/story/designer'
import { select, withProps } from '@ngneat/elf'
import { uuid } from 'apps/cloud/src/app/@core'
import { assign, isEqual, negate, omit, omitBy } from 'lodash-es'
import {
  EMPTY,
  Observable,
  Subject,
  combineLatest,
  debounceTime,
  distinctUntilChanged,
  filter,
  map,
  shareReplay,
  switchMap,
  tap,
  withLatestFrom
} from 'rxjs'
import { createSubStore, dirtyCheckWith, write } from '../../store'
import { SemanticModelService } from '../model.service'
import { DEBOUNCE_TIME, EntityPreview, MODEL_TYPE, ModelDesignerType } from '../types'
import { CubeDimensionType, CubeEventType, newDimensionFromColumn, newDimensionFromTable } from './types'
import { injectI18nService } from '@cloud/app/@shared/i18n'

/**
 * State servcie for Cube
 */
@Injectable()
export class ModelEntityService {
  #modelService = inject(SemanticModelService)
  #settingsService = inject(NxSettingsPanelService)
  #router = inject(Router)
  #route = inject(ActivatedRoute)
  #destroyRef = inject(DestroyRef)
  readonly i18n = injectI18nService()

  /**
  |--------------------------------------------------------------------------
  | Store
  |--------------------------------------------------------------------------
  */
  readonly store = createSubStore(
    this.#modelService.store,
    { name: 'semantic_model_cube', arrayKey: '__id__' },
    withProps<Cube>(null)
  )
  readonly pristineStore = createSubStore(
    this.#modelService.pristineStore,
    { name: 'semantic_model_cube_pristine', arrayKey: '__id__' },
    withProps<Cube>(null)
  )
  readonly dirtyCheckResult = dirtyCheckWith(this.store, this.pristineStore, { comparator: negate(isEqual) })
  readonly dirty$ = toObservable(this.dirtyCheckResult.dirty)

  readonly entityName$ = this.store.pipe(
    select((state) => state.name),
    filter(nonNullable)
  )
  public readonly cube$ = this.store.pipe(select((state) => state))
  readonly cubeName = toSignal(
    this.cube$.pipe(
      map((cube) => cube?.name),
      filter(nonNullable)
    )
  )

  readonly _preview = signal(null)
  get preview() {
    return this._preview()
  }

  readonly queryLab = signal<{
    statement?: string
  }>({})
  set statement(value) {
    this.queryLab.update((state) => ({
      ...state,
      statement: value
    }))
  }

  /**
   * Table fields for dimension role
   */
  readonly tableDimensions = signal<Property[] | null>(null)
  /**
   * Table fields for measure role
   */
  readonly tableMeasures = signal<Property[] | null>(null)

  /**
   * @deprecated use `fact`
   */
  readonly tables$ = this.cube$.pipe(map((cube) => cube?.tables))
  /**
   * Fact table or fact view name
   */
  readonly factName$ = this.cube$.pipe(map((cube) => {
      if (cube.fact?.type === 'table') {
        return cube.fact.table?.name
      } else if (cube.fact?.type === 'view') {
        return cube.fact.view?.alias
      } else {
        return cube?.tables?.[0]?.name
      }
    })
  )
   /**
   * Original Fact table fields
   */
  readonly factFields$ = this.factName$.pipe(
    filter(nonBlank),
    switchMap((table) => this.#modelService.selectOriginalEntityProperties(table)),
    map((properties) => [
      {
        value: null,
        key: null,
        caption: this.i18n.translate('PAC.KEY_WORDS.None', { Default: 'None' })
      },
      ...properties.map((property) => ({
        value: property.name,
        key: property.name,
        caption: property.caption
      }))
    ]),
    shareReplay(1)
  )
  readonly entityType$ = this.entityName$.pipe(
    switchMap((name) => this.#modelService.selectEntityType(name)),
    takeUntilDestroyed(),
    shareReplay(1)
  )

  readonly entitySet$ = this.entityName$.pipe(
    switchMap((entity) => this.#modelService.selectEntitySet(entity)),
    takeUntilDestroyed(),
    shareReplay(1)
  )

  readonly entityError$ = this.entitySet$.pipe(
    map((error) => (isEntitySet(error) ? null : error)),
    takeUntilDestroyed(),
    shareReplay(1)
  )

  readonly originalEntityType$ = this.entityName$.pipe(
    switchMap((name) => this.#modelService.selectOriginalEntityType(name)),
    takeUntilDestroyed(),
    shareReplay(1)
  )

  readonly measures$ = this.cube$.pipe(map((cube) => cube?.measures))
  readonly calculatedMembers$ = this.cube$.pipe(map((cube) => cube?.calculatedMembers))

  /**
  |--------------------------------------------------------------------------
  | Signals
  |--------------------------------------------------------------------------
  */
  readonly statement$ = computed(() => this.queryLab().statement)
  readonly modelType = toSignal(this.#modelService.modelType$)
  readonly entityType = toSignal(this.entityType$)
  readonly cube = toSignal(this.cube$)
  readonly selectedProperty = signal<string>(null)

  readonly dimensionUsages = toSignal(this.cube$.pipe(map((cube) => cube?.dimensionUsages)))
  readonly dimensions = toSignal(this.cube$.pipe(map((cube) => cube?.dimensions)))
  readonly measures = toSignal(this.cube$.pipe(map((cube) => cube?.measures)))
  readonly calculatedMembers = toSignal(this.cube$.pipe(map((cube) => cube?.calculatedMembers)))
  readonly variables = toSignal(this.cube$.pipe(map((cube) => cube?.variables)))
  readonly sharedDimensions = toSignal(this.#modelService.sharedDimensions$)

  readonly dimensionUsages$ = toObservable(this.dimensionUsages)
  /**
   * @deprecated use signal `dimensions` instead
   */
  readonly cubeDimensions$ = toObservable(this.dimensions)
  readonly cubeDimensions = computed<CubeDimensionType[]>(() => {
    const dimensionUsages = this.dimensionUsages()
    const sharedDimensions = this.sharedDimensions()
    const dimensions = this.dimensions()
    return [...(dimensionUsages?.map((usage) => {
      const dimension = sharedDimensions?.find((d) => d.name === usage.source)
      if (dimension) {
        return {
          ...dimension,
          __id__: usage.__id__,
          name: usage.name,
          caption: usage.caption,
          isUsage: true
        }
      }
    }) ?? []), ...(dimensions ?? [])]
  })

  /**
  |--------------------------------------------------------------------------
  | Events
  |--------------------------------------------------------------------------
  */
  /**
   * Events
   */
  readonly event$ = new Subject<CubeEventType>()

  /**
  |--------------------------------------------------------------------------
  | Subscriptions (effect)
  |--------------------------------------------------------------------------
  */
  private _cubeSub = this.cube$.pipe(filter(Boolean), debounceTime(DEBOUNCE_TIME), takeUntilDestroyed()).subscribe((cube) => {
    this.#modelService.updateDataSourceSchemaCube(cube)
  })

  private selectedSub = toObservable(this.selectedProperty)
    .pipe(
      switchMap((typeAndId) => {
        if (!this.cube()) {
          return EMPTY
        }

        // Decode property type and key
        const [type, key] = typeAndId?.split('#') ?? [ModelDesignerType.cube, this.cube().__id__]

        return this.#settingsService
          .openDesigner(
            ModelDesignerType[type] + (this.modelType() === MODEL_TYPE.XMLA ? 'Attributes' : ''),
            combineLatest([
              this.cube$,
              this.selectByTypeAndId(ModelDesignerType[type], key)
                .pipe
                // filter(Boolean) // 过滤已经被删除的等情况
                ()
            ]).pipe(
              map(([cube, modeling]) => ({
                cube,
                id: key,
                modeling
              })),
              distinctUntilChanged(isEqual)
            ),
            key
          )
          .pipe(
            distinctUntilChanged(isEqual),
            tap((result) =>
              this.updateCubeProperty({
                id: key,
                type: ModelDesignerType[type],
                model: result.modeling
              })
            )
          )
      }),
      takeUntilDestroyed()
    )
    .subscribe()

  constructor() {
    effect(
      () => {
        this.#modelService.updateDirty(this.cube().__id__, this.dirtyCheckResult.dirty())
      },
      { allowSignalWrites: true }
    )
  }

  public init(entity: string) {
    const state = this.store.connect(['draft', 'schema', 'cubes', entity]).getValue()
    if (!state.__id__) {
      this.#router.navigate(['../404'], { relativeTo: this.#route })
      return
    }
    this.pristineStore.connect(['draft', 'schema', 'cubes', entity])
  }

  query(statement: string) {
    return this.#modelService.dataSource$.value.query({ statement })
  }

  updater<ProvidedType = void, OriginType = ProvidedType>(fn: (state: Cube, ...params: OriginType[]) => Cube | void) {
    return (...params: OriginType[]) => {
      this.store.update(write((state) => fn(state, ...params)))
    }
  }

  readonly updateCube = this.updater((state, cube: Partial<Cube>) => {
    return {
      ...state,
      ...cube
    }
  })

  readonly setExpression = this.updater((state, expression: string) => {
    state.expression = expression
  })

  readonly addCubeTable = this.updater((state, table: Table) => {
    table.__id__ = table.__id__ ?? uuid()
    state.tables = state.tables ?? []
    state.tables.push(table)
  })

  readonly removeCubeTable = this.updater((state, table: Table) => {
    // 有的情况下 table.__id__ 会为空，这时候就用 name 去删除
    const index = state.tables?.findIndex((item) =>
      item.__id__ ? item.__id__ === table.__id__ : item.name === table.name
    )
    if (index > -1) {
      state.tables.splice(index, 1)
    }
  })

  readonly changeTableJoinType = this.updater(
    (state, { table, type }: { table: Table; type: Table['join']['type'] }) => {
      const _table = findTableById(state, table.__id__)
      _table.join.type = type
    }
  )

  readonly addCubeTableJoin = this.updater((state, table: Table) => {
    const _table = findTableById(state, table.__id__)
    _table.join.fields = _table.join.fields ?? []
    _table.join.fields.push({
      leftKey: null,
      rightKey: null
    })
  })

  readonly removeJoinField = this.updater((state, { table, index }: { table: Table; index: number }) => {
    const _table = findTableById(state, table.__id__)
    _table.join.fields.splice(index, 1)
  })

  readonly changeJoinLeftKey = this.updater(
    (state, { table, index, key }: { table: Table; index: number; key: string }) => {
      const _table = findTableById(state, table.__id__)
      _table.join.fields[index].leftKey = key
    }
  )

  readonly changeJoinRightKey = this.updater(
    (state, { table, index, key }: { table: Table; index: number; key: string }) => {
      const _table = findTableById(state, table.__id__)
      _table.join.fields[index].rightKey = key
    }
  )

  /**
   * 通过 ID 更新 EntityType 单个 property
   */
  // readonly updateEntityProperty = this.updater((state, { id, property }: { id: string; property: Property }) => {
  //   state.entityType = state.entityType || { name: state.name, visible: true, properties: {} }
  //   // step 1. 通过 id 查找
  //   const keyValue = Object.entries(state.entityType.properties).find(([key, value]) => value.__id__ === id)
  //   if (keyValue) {
  //     delete state.entityType.properties[keyValue[0]]
  //     state.entityType.properties[property.name] = {
  //       ...keyValue[1],
  //       ...property,
  //       __id__: id
  //     }
  //   } else {
  //     state.entityType.properties[property.name] = {
  //       ...property,
  //       __id__: id
  //     }
  //   }
  // })

  // Crud for dimension measure and calculated measure
  /**
   * New dimension
   * * blank
   * * from source table column
   */
  readonly newDimension = this.updater(
    (state, event?: { index: number; table?: { name: string; caption: string }; column?: PropertyAttributes }) => {
      state.dimensions = state.dimensions ?? []
      if (event) {
        const isOlap = this.modelType() === MODEL_TYPE.OLAP
        if (event.table) {
          state.dimensions.splice(
            event.index,
            0,
            newDimensionFromTable(state.dimensions, event.table.name, event.table.caption, isOlap)
          )
        } else if (event.column) {
          state.dimensions.splice(event.index, 0, newDimensionFromColumn(event.column, isOlap))
        }
      } else if (!state.dimensions.find((item) => item.name === '')) {
        state.dimensions.push({
          __id__: uuid(),
          name: ''
        } as PropertyDimension)
      }
    }
  )

  readonly insertDimension = this.updater((state, {index, dimension}: {index?: number; dimension: PropertyDimension}) => {
    state.dimensions = state.dimensions ?? []
    if (isNil(index)) {
      state.dimensions.push(
        {
          __id__: uuid(),
          ...dimension,
        }
      )
    } else {
      state.dimensions.splice(
        index,
        0,
        {
          __id__: uuid(),
          ...dimension,
        }
      )
    }
  })

  /**
   * @deprecated use insertDimension
   */
  readonly addDimension = this.updater((state, dimension: PropertyDimension) => {
    state.dimensions = state.dimensions ?? []
    state.dimensions.push({
      __id__: uuid(),
      ...dimension
    } as PropertyDimension)
  })

  readonly newDimensionUsage = this.updater((state, { index, usage }: { index: number; usage: DimensionUsage }) => {
    state.dimensionUsages = state.dimensionUsages ?? []
    state.dimensionUsages.splice(Math.min(index, state.dimensionUsages.length), 0, {
      ...usage,
      __id__: uuid()
    })
  })

  readonly newHierarchy = this.updater((state, { id, name }: { id: string; name: string }) => {
    const dimension = state.dimensions.find((item) => item.__id__ === id)
    if (dimension) {
      dimension.hierarchies ??= []
      // Check if the entry already exists or up to two initial entries
      if (name ? !dimension.hierarchies?.some((item) => item.name === name) : dimension.hierarchies?.filter((_) => !_.name).length <= 1) {
        dimension.hierarchies.push({
          __id__: uuid(),
          name,
          hasAll: true,
          visible: true,
        } as PropertyHierarchy)
      }
    }
  })

  readonly newLevel = this.updater(
    (
      state,
      {
        id,
        index,
        name,
        column,
        caption
      }: { id: string; index?: number; name: string; column?: string; caption?: string }
    ) => {
      const hierarchy = getHierarchyById(state, id)
      // Check if the new entry already exists
      if (hierarchy && !hierarchy.levels?.find((item) => item.name === name)) {
        hierarchy.levels = hierarchy.levels ?? []
        hierarchy.levels.splice(index ?? hierarchy.levels.length, 0, {
          __id__: uuid(),
          name,
          column,
          caption
        } as PropertyLevel)
      }
    }
  )

  readonly newMeasure = this.updater((state, event?: { index: number; column?: string }) => {
    state.measures = state.measures ?? []
    if (event) {
      state.measures.splice(event.index, 0, {
        __id__: uuid(),
        name: event.column,
        column: event.column,
        aggregator: 'sum',
        visible: true
      })
    } else if (!state.measures.find((item) => item.name === '')) {
      state.measures.push({
        __id__: uuid(),
        name: '',
        aggregator: 'sum',
        visible: true
      } as PropertyMeasure)
    }
  })

  readonly moveItemInMeasures = this.updater((state, event: CdkDragDrop<any[]>) => {
    moveItemInArray(state.measures, event.previousIndex, event.currentIndex)
  })

  /**
   * Create a new calculated measure using column of table
   */
  readonly newCalculatedMeasure = this.updater((state, event?: { index: number; column?: string }) => {
    state.calculatedMembers = state.calculatedMembers ?? []
    if (event) {
      // 拖拽来的表字段
      state.calculatedMembers.splice(event.index, 0, {
        __id__: uuid(),
        name: event.column,
        formula: event.column,
        aggregator: 'sum',
        visible: true // default visible
      })
    } else if (!state.calculatedMembers.find((item) => item.name === '')) {
      // 插入到第一个
      state.calculatedMembers.splice(0, 0, {
        __id__: uuid(),
        name: '',
        dimension: C_MEASURES,
        formula: null,
        visible: true // default visible
      })
    }
  })

  readonly addCalculatedMeasure = this.updater((state, calculatedMember: Partial<CalculatedMember>) => {
    state.calculatedMembers = state.calculatedMembers ?? []
    state.calculatedMembers.push({
      ...calculatedMember,
      __id__: calculatedMember.__id__ ?? uuid()
    } as CalculatedMember)
  })

  readonly upsertCalculatedMeasure = this.updater((state, calculatedMember: CalculatedMember) => {
    state.calculatedMembers = state.calculatedMembers ?? []
    const index = state.calculatedMembers.findIndex((item) => item.__id__ === calculatedMember.__id__)
    if (index > -1) {
      state.calculatedMembers[index] = calculatedMember
    } else {
      state.calculatedMembers.push(calculatedMember)
    }
  })

  readonly deleteDimensionUsage = this.updater((state, id: string) => {
    const index = state.dimensionUsages.findIndex((item) => item.__id__ === id)
    if (index > -1) {
      state.dimensionUsages.splice(index, 1)
    }
  })

  /**
   * 删除维度及维度下的字段
   */
  readonly deleteDimensionProperty = this.updater((state, id: string) => {
    // 所在的数组
    let parent = null
    // 所在数组的索引位置
    let index = null

    state.dimensionUsages?.find((usage, i) => {
      if (usage.__id__ === id) {
        parent = state.dimensionUsages
        index = i
        return true
      }
      return false
    })

    if (!parent) {
      state.dimensions?.find((dim, i) => {
        if (dim.__id__ === id) {
          parent = state.dimensions
          index = i
          return true
        }

        return !!dim.hierarchies?.find((hier, j) => {
          if (hier.__id__ === id) {
            parent = dim.hierarchies
            index = j
            return true
          }

          return !!hier.levels?.find((level, k) => {
            if (level.__id__ === id) {
              parent = hier.levels
              index = k
              return true
            }
            return false
          })
        })
      })
    }

    // 从 id 所在数组索引处删除该节点 Node
    if (parent) {
      this.setSelectedProperty(null)
      parent.splice(index, 1)
    }
  })

  readonly deleteMeasure = this.updater((state, id: string) => {
    const index = state.measures.findIndex((item) => item.__id__ === id)
    if (index > -1) {
      this.setSelectedProperty(null)
      state.measures.splice(index, 1)
    }
  })

  readonly deleteCalculatedMember = this.updater((state, id: string) => {
    const index = state.calculatedMembers.findIndex((item) => item.__id__ === id)
    if (index > -1) {
      this.setSelectedProperty(null)
      state.calculatedMembers.splice(index, 1)
    }
  })

  // 调整元素之间的顺序方法们
  readonly moveItemInCalculatedMember = this.updater((state, event: CdkDragDrop<Partial<CalculatedMember>[]>) => {
    moveItemInArray(state.calculatedMembers, event.previousIndex, event.currentIndex)
  })
  readonly moveItemInDimensions = this.updater((state, event: CdkDragDrop<CalculatedMember[]>) => {
    if (
      !event.item.data.isUsage &&
      (event.item.data.role === AggregationRole.level || event.item.data.role === AggregationRole.hierarchy)
    ) {
      const dimension = state.dimensions?.find((dimension) => dimension.name === event.item.data.dimension)
      if (dimension) {
        if (event.item.data.role === AggregationRole.level) {
          // Level
          const hierarchy = dimension.hierarchies.find((hierarchy) => hierarchy.name === event.item.data.hierarchy)
          const fromIndex = hierarchy.levels.findIndex((item) => item.__id__ === event.item.data.__id__)
          moveItemInArray(
            hierarchy.levels,
            fromIndex,
            Math.max(Math.min(fromIndex + event.currentIndex - event.previousIndex, hierarchy.levels.length - 1), 0)
          )
        } else {
          // Hierarchy
          const fromIndex = dimension.hierarchies.findIndex((item) => item.__id__ === event.item.data.__id__)
          moveItemInArray(
            dimension.hierarchies,
            fromIndex,
            Math.max(
              Math.min(fromIndex + event.currentIndex - event.previousIndex, dimension.hierarchies.length - 1),
              0
            )
          )
        }
      }
    } else if (event.item.data.role === AggregationRole.dimension) {
      // Dimension or Dimension Usage
      if (event.item.data.isUsage) {
        // Dimension Usage
        const fromIndex = state.dimensionUsages.findIndex((usage) => usage.__id__ === event.item.data.__id__)
        moveItemInArray(
          state.dimensionUsages,
          fromIndex,
          Math.max(Math.min(fromIndex + event.currentIndex - event.previousIndex, state.dimensionUsages.length - 1), 0)
        )
      } else {
        // Dimension
        const fromIndex = state.dimensions.findIndex((usage) => usage.__id__ === event.item.data.__id__)
        moveItemInArray(
          state.dimensions,
          fromIndex,
          Math.max(Math.min(fromIndex + event.currentIndex - event.previousIndex, state.dimensions.length - 1), 0)
        )
      }
    }
  })

  /**
   * Set selected property name to open designer panel
   */
  setSelectedProperty(type: string, key?: string): void {
    if (key) {
      this.selectedProperty.set(`${type}#${key}`)
    } else {
      this.selectedProperty.set(type)
    }
  }
  toggleSelectedProperty(type: string, key: string) {
    const selected = key ? `${type}#${key}` : type
    this.selectedProperty.update((state) => state === selected ? null : selected)
  }
  isSelectedProperty(type: string, key: string) {
    const [_type, _key] = this.selectedProperty()?.split('#') ?? []
    return _type === type && _key === key
  }

  selectCalculatedMember<T>(id: string): Observable<CalculatedMember> {
    return this.selectByTypeAndId(ModelDesignerType.calculatedMember, id)
  }
  setCalculatedMember(member: CalculatedMember) {
    this.updateCubeProperty({ id: member.__id__, type: ModelDesignerType.calculatedMember, model: member })
  }

  selectDimension(id: string) {
    return this.cube$.pipe(
      map((cube) => cube?.dimensions),
      map((dimensions) => dimensions?.find((item) => item.__id__ === id))
    )
  }

  selectByTypeAndId<T>(type: ModelDesignerType, id: string): Observable<any> {
    return this.cube$.pipe(
      map((cube) => {
        if (type === ModelDesignerType.cube) {
          return cube
        }
        if (type === ModelDesignerType.dimensionUsage) {
          return cube.dimensionUsages.find((item) => item.__id__ === id)
        }

        if (type === ModelDesignerType.calculatedMember) {
          return cube.calculatedMembers?.find((item) => item.__id__ === id)
        }
        if (type === ModelDesignerType.dimension) {
          let dim = cube.dimensions?.find((item) => item.__id__ === id)
          if (dim) {
            return omit(dim, ['hierarchies'])
          }
        }
        if (type === ModelDesignerType.hierarchy) {
          const hierarchy = getHierarchyById(cube, id)
          let dimension = cube.dimensions?.find((item) => item.name === hierarchy.dimension)
          return {
            hierarchy: omit(hierarchy, ['levels']),
            dimension: omit(dimension, ['hierarchies'])
          }
        }
        if (type === ModelDesignerType.level) {
          return getLevelById(cube, id) ?? { __id__: id }
        }

        if (type === ModelDesignerType.measure) {
          return cube.measures?.find((item) => item.__id__ === id)
        }

        return null
      })
    )
  }

  readonly updateCubeProperty = this.updater(
    (state, { id, type, model }: { id: string; type: ModelDesignerType; model: any }) => {
      if (type === ModelDesignerType.cube) {
        assign(state, omitBy(model, ['__id__', 'name']))
      }

      if (type === ModelDesignerType.dimensionUsage) {
        const index = state.dimensionUsages.findIndex((item) => item.__id__ === id)
        state.dimensionUsages[index] = {
          ...state.dimensionUsages[index],
          ...model
        }
      }
      if (type === ModelDesignerType.calculatedMember) {
        const index = state.calculatedMembers.findIndex((item) => item.__id__ === id)
        state.calculatedMembers[index] = {
          ...state.calculatedMembers[index],
          ...model
        }
      }
      if (type === ModelDesignerType.dimension) {
        state.dimensions = state.dimensions ?? []
        const index = state.dimensions.findIndex((item) => item.__id__ === id)
        if (index > -1) {
          state.dimensions[index] = {
            ...state.dimensions[index],
            ...model
          }
        } else {
          // 都找不到 id 了为什么要 push 进来 ？？？
          state.dimensions.push({
            ...model,
            __id__: id
          })
        }
      }
      if (type === ModelDesignerType.hierarchy) {
        const hierarchy = getHierarchyById(state, id)
        const dimension = state.dimensions.find((item) => item.name === hierarchy.dimension)
        assign(hierarchy, model.hierarchy)
        assign(dimension, model.dimension)
      }
      if (type === ModelDesignerType.level) {
        const level = getLevelById(state, id)
        assign(level, model)
      }

      if (type === ModelDesignerType.measure) {
        const index = state.measures?.findIndex((item) => item.__id__ === id)
        if (index > -1) {
          state.measures[index] = {
            ...state.measures[index],
            ...model
          }
        } else {
          state.measures = state.measures ?? []
          state.measures.push({
            ...model,
            __id__: uuid()
          })
        }
      }

      if (type === ModelDesignerType.variable) {
        const index = state.variables?.findIndex((item) => item.__id__ === id)
        if (index > -1) {
          state.variables[index] = {
            ...state.variables[index],
            ...model
          }
        } else {
          state.variables = state.variables ?? []
          state.variables.push({
            ...model,
            __id__: uuid()
          })
        }
      }
    }
  )

  readonly deleteCubeProperty = this.updater(
    (state, { id, type, }: { id: string; type: ModelDesignerType; }) => {
      switch(type) {
        case ModelDesignerType.variable: {
          state.variables = state.variables?.filter((_) => _.__id__ !== id)
        }
      }
    })

  readonly navigateDimension = effectAction((origin$: Observable<string>) => {
    return origin$.pipe(
      withLatestFrom(this.cube$.pipe(map((cube) => cube?.dimensionUsages))),
      tap(([id, dimensionUsages]) => {
        this.#modelService.navigateDimension(dimensionUsages?.find((item) => item.__id__ === id)?.source)
      })
    )
  })

  /**
   * Navigate to calculation member page by key
   *
   * @param key
   */
  navigateCalculation(key: string) {
    this.#router.navigate(['calculation', key], { relativeTo: this.#route })
  }

  setPreview(preview: EntityPreview) {
    this._preview.set(preview)
  }
}

function findTableById(state, id) {
  return state.tables.find(({ __id__ }) => __id__ === id)
}

/**
 * 验证维度定义信息相对于运行时信息是否合法
 *
 * @param dimension
 * @param rtDimensions
 */
function validateDimension(dimension: PropertyDimension, rtDimensions: PropertyDimension[]) {
  return !rtDimensions.find((item) => item.name === dimension.name || item.name === dimension.column)
    ? `Can't found column for dimension '${dimension.name}'`
    : null
}

export function getEntityPropertyById(entityType: EntityType, id: string): EntityProperty {
  return Object.values(entityType?.properties ?? {}).reduce(
    (prev, dimension) =>
      prev ??
      (dimension.__id__ === id
        ? dimension
        : dimension.hierarchies?.reduce(
            (prev, hierarchy) =>
              prev ??
              (hierarchy.__id__ === id
                ? hierarchy
                : hierarchy.levels?.reduce((prev, level) => prev ?? (level.__id__ === id ? level : null), null)),
            null
          )),
    null
  )
}
