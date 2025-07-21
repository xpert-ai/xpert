import { computed, DestroyRef, inject, Injectable } from '@angular/core'
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop'
import { getSQLSourceName, getXmlaSourceName, ISemanticModel, registerModel } from '@cloud/app/@core'
import { convertNewSemanticModelResult, extractSemanticModelDraft, NgmSemanticModel, TSemanticModel } from '@metad/cloud/state'
import { dirtyCheckWith, nonNullable } from '@metad/core'
import { NgmDSCoreService } from '@metad/ocap-angular/core'
import { WasmAgentService } from '@metad/ocap-angular/wasm-agent'
import { DataSource, Dimension, EntityType, isEntityType, PropertyHierarchy, wrapHierarchyValue } from '@metad/ocap-core'
import { getSemanticModelKey } from '@metad/story/core'
import { createStore, select, Store, withProps } from '@ngneat/elf'
import { stateHistory } from '@ngneat/elf-state-history'
import { cloneDeep, isEqual, negate, omit } from 'lodash-es'
import { BehaviorSubject, from, Observable } from 'rxjs'
import {
  combineLatestWith,
  debounceTime,
  distinctUntilChanged,
  filter,
  map,
  shareReplay,
  switchMap,
  take,
  tap
} from 'rxjs/operators'
import { injectI18nService } from '../i18n'
import { MODEL_TYPE, MODEL_DEBOUNCE_TIME, SemanticModelState } from './types'

@Injectable()
export class ModelStudioService {
  readonly dsCoreService = inject(NgmDSCoreService)
  private readonly destroyRef = inject(DestroyRef)
  readonly wasmAgent = inject(WasmAgentService)
  readonly i18nService = injectI18nService()

  /**
   |--------------------------------------------------------------------------
   | Store
   |--------------------------------------------------------------------------
   */
  readonly store = createStore({ name: 'semantic_model' }, withProps<SemanticModelState>({ model: null, draft: null }))
  readonly pristineStore = createStore(
    { name: 'semantic_model_pristine' },
    withProps<SemanticModelState>({ model: null, draft: null })
  )
  readonly #stateHistory = stateHistory<Store, SemanticModelState>(this.store, {
    comparatorFn: negate(isEqual)
  })
  /**
   * Dirty check for whole model
   */
  readonly dirtyCheckResult = dirtyCheckWith(this.store, this.pristineStore, {
    comparator: (a, b) => !isEqual(a.draft, b.draft)
  })

  /**
   * Original data source:
   * - Used in MDX Model to directly calculate database information
   * - Equivalent to dataSource in SQL Model
   */
  readonly originalDataSource$ = new BehaviorSubject<DataSource>(null)
  readonly dataSource$ = new BehaviorSubject<DataSource>(null)

  readonly model$ = this.store.pipe(
    select((state) => state.model),
    filter(nonNullable)
  )
  readonly semanticModelKey$ = this.model$.pipe(
    filter(nonNullable),
    map(getSemanticModelKey),
    filter(nonNullable),
    distinctUntilChanged()
  )
  readonly refreshDBTables$ = new BehaviorSubject<boolean>(false)

  readonly draft$ = this.store.pipe(select((state) => state.draft))

  readonly model = toSignal(this.store.pipe(select((state) => state.model))) 
  readonly modelType = computed(() => {
    const model = this.model()
    if (model.type === 'XMLA') {
      if (model.dataSource.type.protocol?.toUpperCase() !== 'XMLA') {
        return MODEL_TYPE.OLAP
      } else {
        return MODEL_TYPE.XMLA
      }
    }
    // todo 其他情况
    return MODEL_TYPE.SQL
  })
  
  readonly draft = toSignal(this.store.pipe(select((state) => state.draft)), { initialValue: null })
  readonly checklist = computed(() => this.draft()?.checklist)
  readonly hierarchies = computed<PropertyHierarchy[]>(() => this.draft()?.settings?.hierarchies)

  constructor() {
    this.semanticModelKey$
      .pipe(
        filter(nonNullable),
        switchMap((key) => this.dsCoreService.getDataSource(key)),
        // 先清 DataSource 缓存再进行后续
        switchMap((dataSource) =>
          from(this.modelType() === MODEL_TYPE.OLAP ? dataSource.clearCache() : [true]).pipe(map(() => dataSource))
        ),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(this.dataSource$)
    this.model$
      .pipe(
        filter(nonNullable),
        filter((model) => nonNullable(model.key)),
        distinctUntilChanged((a, b) => a.key === b.key),
        switchMap((model) => {
          const modelKey = getSemanticModelKey(model)
          if (model.type === 'XMLA') {
            if (model.dataSource?.type?.protocol?.toUpperCase() === 'SQL') {
              return this.dsCoreService.getDataSource(getSQLSourceName(modelKey))
            } else {
              return this.dsCoreService.getDataSource(getXmlaSourceName(modelKey))
            }
          }
          return this.dsCoreService.getDataSource(modelKey)
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(this.originalDataSource$)
    // @todo There are unnecessary registration actions, which need to be refactored
    this.draft$
      .pipe(filter(nonNullable), debounceTime(MODEL_DEBOUNCE_TIME), takeUntilDestroyed(this.destroyRef))
      .subscribe((draft) => {
        console.log('Draft Updated:', draft)
        this.registerModel(draft)
      })
  }

  /**
   * Initialize the entire state service using the semantic model
   * @param model original record in database
   */
  initModel(model: ISemanticModel) {
    const semanticModel = convertNewSemanticModelResult(model)
    const draft = model.draft ?? extractSemanticModelDraft(model)
    this.store.update(() => ({ model: semanticModel, draft: { ...draft, roles: draft.roles ?? [] } }))
    this.pristineStore.update(() => ({ model: cloneDeep(semanticModel), draft: cloneDeep(this.store.value.draft) }))
  }

  /**
   * Register current model into ocap framwork
   */
  registerModel(draft: any) {
    const model = this.model()
    const draftModel = {...model, ...draft}
    // Not contain indicators when building model
    registerModel(omit(draftModel, 'indicators') as any, true, this.dsCoreService, this.wasmAgent)
  }

  selectDBTables(refresh = null) {
    return this.originalDataSource$.pipe(
      filter(nonNullable),
      take(1),
      combineLatestWith(this.refreshDBTables$),
      switchMap(([dataSource, _refresh]) => dataSource.discoverDBTables(refresh ?? _refresh))
    )
  }
  private _originalEntityTypes = new Map<string, Observable<EntityType>>()
  /**
   * Get the type definition of the original table entity
   * for example, when getting the original Cube information from the xmla interface
   *
   * @param entityName
   * @returns
   */
  selectOriginalEntityType(entity: string) {
    if (!this._originalEntityTypes.get(entity)) {
      this._originalEntityTypes.set(
        entity,
        this.originalDataSource$.pipe(
          filter(nonNullable),
          take(1),
          switchMap((dataSource) => dataSource.selectEntityType(entity).pipe(filter(isEntityType))),
          takeUntilDestroyed(this.destroyRef),
          shareReplay(1)
        )
      )
    }
    return this._originalEntityTypes.get(entity)
  }

  /**
   * Get the field list of the original table entity
   *
   * @param entityName
   * @returns
   */
  selectOriginalEntityProperties(entityName: string) {
    return this.selectOriginalEntityType(entityName).pipe(
      map((entityType) => {
        const properties = entityType?.properties
        if (properties) {
          return Object.values(properties)
        }
        return []
      })
    )
  }

  selectOriginalMembers(entity: string, dimension: Dimension) {
    return this.originalDataSource$.pipe(
      filter(nonNullable),
      take(1),
      switchMap((dataSource) => dataSource.selectMembers(entity, dimension)),
      map((members) =>
        members.map((member) => ({
          ...member,
          memberKey: wrapHierarchyValue(dimension.hierarchy, member.memberKey)
        }))
      ),
      takeUntilDestroyed(this.destroyRef)
    )
  }

  readonly tablesSelectOptions$ = this.selectDBTables().pipe(
    map((dbTables) => {
      const tables = dbTables
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((table) => ({
          value: table.name,
          key: table.name,
          caption: table.caption
        }))
      tables.splice(0, 0, {
        value: null,
        key: null,
        caption: this.i18nService.instant('PAC.MODEL.SCHEMA.COMMON.None', { Default: 'None' }) ?? 'None'
      })
      return tables
    }),
    takeUntilDestroyed(),
    shareReplay(1)
  )
}
