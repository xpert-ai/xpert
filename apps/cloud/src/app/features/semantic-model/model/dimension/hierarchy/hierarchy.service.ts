import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop'
import { Injectable, computed, effect, inject } from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { nonNullable } from '@metad/core'
import { effectAction } from '@metad/ocap-angular/core'
import { EntityService, PropertyHierarchy, PropertyLevel, Table } from '@metad/ocap-core'
import { allLevelCaption, allLevelName, allMemberCaption, allMemberName } from '@metad/ocap-sql'
import { NxSettingsPanelService } from '@metad/story/designer'
import { select, withProps } from '@ngneat/elf'
import { ToastrService, uuid } from 'apps/cloud/src/app/@core'
import { assign, cloneDeep, isEqual, isNumber, negate, omit } from 'lodash-es'
import { NGXLogger } from 'ngx-logger'
import { Observable, distinctUntilChanged, filter, map, shareReplay, switchMap, tap, withLatestFrom } from 'rxjs'
import { createSubStore, dirtyCheckWith, write } from '../../../store'
import { SemanticModelService } from '../../model.service'
import { ModelDesignerType } from '../../types'
import { ModelDimensionService } from '../dimension.service'

@Injectable()
export class ModelHierarchyService {
  readonly dimensionService = inject(ModelDimensionService)
  private readonly toastrService = inject(ToastrService)
  private readonly modelService = inject(SemanticModelService)
  private readonly settingsService = inject(NxSettingsPanelService)
  private readonly logger? = inject(NGXLogger, { optional: true })

  /**
  |--------------------------------------------------------------------------
  | Store
  |--------------------------------------------------------------------------
  */
  readonly store = createSubStore(
    this.dimensionService.store,
    { name: 'semantic_model_hierarchy', arrayKey: '__id__' },
    withProps<PropertyHierarchy>(null)
  )
  readonly pristineStore = createSubStore(
    this.dimensionService.pristineStore,
    { name: 'semantic_model_hierarchy_pristine', arrayKey: '__id__' },
    withProps<PropertyHierarchy>(null)
  )
  readonly dirtyCheckResult = dirtyCheckWith(this.store, this.pristineStore, { comparator: negate(isEqual) })
  readonly hierarchy$ = this.store.pipe(
    select((state) => state),
    filter(nonNullable)
  )
  readonly levels$ = this.store.pipe(select((state) => state?.levels))
  public readonly name$ = this.hierarchy$.pipe(map((hierarchy) => hierarchy?.name))
  public readonly caption$ = this.hierarchy$.pipe(map((hierarchy) => hierarchy?.caption))
  public readonly tables$ = this.hierarchy$.pipe(map((hierarchy) => hierarchy?.tables))
  readonly tableName$ = this.hierarchy$.pipe(
    map((hierarchy) => hierarchy.primaryKeyTable ?? hierarchy.tables?.[0]?.name)
  )

  // Signals
  readonly hierarchy = toSignal(this.hierarchy$)
  readonly dialect = this.modelService.dialect
  readonly dimensionName = toSignal(this.parentService.name$)
  readonly sharedDimensions = toSignal(this.modelService.dimensions$)
  readonly hasAll = toSignal(this.hierarchy$.pipe(map((hierarchy) => hierarchy?.hasAll)))
  readonly allMemberName = toSignal(this.hierarchy$.pipe(map(allMemberName)))
  readonly allMemberCaption = toSignal(this.hierarchy$.pipe(map(allMemberCaption)))
  readonly allLevelCaption = computed(() =>
    this.hierarchy() ? allLevelCaption({ ...this.hierarchy(), dimension: this.dimensionName() }) : null
  )
  readonly allLevelName = computed(() =>
    this.hierarchy() ? allLevelName({ ...this.hierarchy(), dimension: this.dimensionName() }, this.dialect()) : null
  )

  readonly modeling = computed(() => {
    const hierarchy = this.hierarchy()
    const dimension = this.parentService.dimension()
    return {
      modeling: {
        hierarchy,
        dimension: omit(dimension, ['hierarchies'])
      },
      hierarchies: dimension?.hierarchies,
      dimensions: this.sharedDimensions()?.filter((item) => item.__id__ !== dimension.__id__)
    }
  })

  readonly modeling$ = toObservable(this.modeling).pipe(distinctUntilChanged(isEqual))

  public entityService$: Observable<EntityService<unknown>> = this.tableName$.pipe(
    filter((value) => !!value),
    switchMap((table) => this.modelService.selectOriginalEntityService(table)),
    shareReplay(1)
  )

  public entityType$ = this.tableName$.pipe(
    switchMap((tableName) => this.modelService.selectOriginalEntityType(tableName)),
    shareReplay(1)
  )

  /**
   * Currently selected column
   */
  column: string

  constructor(private parentService: ModelDimensionService) {
    effect(
      () => {
        this.dimensionService.updateDirty(this.store.value.__id__, this.dirtyCheckResult.dirty())
      },
      { allowSignalWrites: true }
    )
  }

  public init(id: string) {
    this.store.connect(['hierarchies', id])
    this.pristineStore.connect(['hierarchies', id])
    this.parentService.setCurrentHierarchy(id)
  }

  /**
   * Update Hierarchy state
   *
   * There should be a better way to solve the problem of null value coverage
   */
  updateHierarchy(hierarchy: Partial<PropertyHierarchy>) {
    this.store.update(
      write((state) => {
        Object.keys(state).forEach((key) => {
          if (key !== 'levels') {
            state[key] = hierarchy[key] ?? state[key]
          }
        })
        assign(state, hierarchy)
      })
    )
  }

  setupDesigner = effectAction((origin$: Observable<void>) => {
    return origin$.pipe(
      withLatestFrom(this.hierarchy$),
      switchMap(([, hierarchy]) => {
        return this.settingsService.openDesigner(ModelDesignerType.hierarchy, this.modeling$, hierarchy.__id__)
      }),
      tap((model: any) => {
        this.updateHierarchy(model.modeling?.hierarchy)
        this.parentService.update(model.modeling?.dimension)
      })
    )
  })

  setupLevelDesigner = effectAction((origin$: Observable<string | number>) => {
    return origin$.pipe(
      withLatestFrom(this.hierarchy$),
      switchMap(([id, state]) => {
        // this.column = column
        const level = isNumber(id) ? state.levels[id] : state.levels.find((level) => level.__id__ === id)
        const model = {
          hierarchy: state,
          modeling: cloneDeep(level)
        }
        // const id = model.modeling.__id__
        return this.settingsService.openDesigner(ModelDesignerType.level, model, id).pipe(
          tap(({ modeling }: any) => {
            if (modeling.name) {
              this.updateLevel({
                ...modeling,
                __id__: id
              })
            }
          })
        )
      })
    )
  })

  updater<ProvidedType = void, OriginType = ProvidedType>(
    fn: (state: PropertyHierarchy, ...params: OriginType[]) => PropertyHierarchy | void
  ) {
    return (...params: OriginType[]) => {
      this.store.update(write((state) => fn(state, ...params)))
    }
  }

  readonly setTables = this.updater((state, tables: Table[]) => {
    if (!isEqual(state?.tables, tables)) {
      state.tables = tables
    }
  })

  readonly appendTable = this.updater((state, name: string) => {
    state.tables = state.tables ?? []
    const _index = state.tables.findIndex((item) => item.name === name)
    if (_index < 0) {
      const table: Table = { name }
      if (state.tables.length > 0) {
        table.join = {
          type: 'Inner',
          fields: []
        }
      }
      state.tables.push(table)
    }
  })

  readonly removeTable = this.updater((state, name: string) => {
    const index = state.tables.findIndex((item) => item.name === name)
    if (index > -1) {
      state.tables.splice(index, 1)
    }
  })

  readonly moveItemInTables = this.updater((state, { previousIndex, currentIndex }: CdkDragDrop<Table[]>) => {
    moveItemInArray(state.tables, previousIndex, currentIndex)
  })

  readonly appendLevel = this.updater((state, { name, table }: PropertyLevel) => {
    state.levels = state.levels ?? []
    const index = state.levels.findIndex((level) => level.column === name)
    if (index < 0) {
      state.levels.push({
        __id__: uuid(),
        name,
        column: name,
        table
      })
    } else {
      const primaryTable = state.primaryKeyTable || state.tables[0]?.name
      // The fields are the same and the tables are the same
      const index = state.levels.findIndex(
        (level) => level.column === name && (!level.table ? primaryTable === table : level.table === table)
      )

      if (index < 0) {
        state.levels.push({
          __id__: uuid(),
          name: `${name} (${table})`,
          column: name,
          table
        })
      } else {
        this.toastrService.error('PAC.MODEL.DIMENSION.SameLevelAlreadyExists', '', {
          Default: 'The same level already exists'
        })
      }
    }
  })

  readonly moveLevelInArray = this.updater((state, { previousIndex, currentIndex }: CdkDragDrop<PropertyLevel[]>) => {
    moveItemInArray(state.levels, previousIndex, currentIndex)
  })

  readonly removeLevel = this.updater((state, id: string) => {
    const index = state.levels.findIndex((item) => item.__id__ === id)
    if (index > -1) {
      state.levels.splice(index, 1)
    }
  })

  readonly updateLevel = this.updater((state, model: PropertyLevel) => {
    const index = state.levels?.findIndex((level) => level.__id__ === model.__id__)
    if (index >= 0) {
      // state.levels[level] = assign(state.levels[level], model)
      state.levels[index] = model
    } else {
      state.levels = state.levels ?? []
      state.levels.push(model)
    }
  })

  readonly removeCurrentLevel = this.updater((state) => {
    const index = state.levels?.findIndex((level) => level.column === this.column)
    if (index >= 0) {
      state.levels.splice(index, 1)
    }
  })
}
