import { ComponentStore } from '@metad/store'
import {
  BehaviorSubject,
  catchError,
  combineLatestWith,
  debounce,
  delayWhen,
  distinctUntilChanged,
  filter,
  firstValueFrom,
  interval,
  map,
  Observable,
  of,
  ReplaySubject,
  shareReplay,
  switchMap,
  takeUntil,
  tap
} from 'rxjs'
import { PeriodFunctions, PresentationVariant, SelectionVariant } from '../annotations'
import { DataSettings } from '../data-settings'
import { DataSourceOptions } from '../data-source'
import { DSCoreService } from '../ds-core.service'
import { EntityService } from '../entity'
import { EntityType, getEntityProperty, Property, QueryReturn } from '../models'
import { Annotation, AnnotationTerm, Dimension, Measure, QueryOptions, uuid } from '../types'
import { isNil, nonNullable, omitBy } from '../utils'


export interface EntityBusinessState {
  dataSettings: DataSettings
  selectionVariant?: SelectionVariant
  presentationVariant?: PresentationVariant
  dataSourceOptions: DataSourceOptions
}

export class EntityBusinessService<
  T,
  State extends EntityBusinessState = EntityBusinessState
> extends ComponentStore<State> {
  protected __id__: string
  get dataSettings() {
    return this.get((state) => state.dataSettings)
  }
  set dataSettings(value) {
    /**
     * @todo Why omit nil property, Isn't it supposed to be cover the property?
     */
    const state = omitBy(
      {
        dataSettings: value,
        selectionVariant: value.selectionVariant,
        presentationVariant: value.presentationVariant
      },
      isNil
    )
    this.patchState(state as Partial<State>)
  }
  public readonly dataSettings$ = this.select((state) => state.dataSettings)
  readonly _dataSource$ = this.dataSettings$.pipe(
    map((dataSettings) => dataSettings?.dataSource),
    distinctUntilChanged()
  )
  readonly entitySet$ = this.dataSettings$.pipe(
    map((dataSettings) => dataSettings?.entitySet),
    distinctUntilChanged()
  )

  get selectionVariant() {
    return this.get((state) => state.selectionVariant)
  }
  set selectionVariant(value) {
    this.patchState({ selectionVariant: value } as State)
  }
  get presentationVariant() {
    return this.get((state) => state.presentationVariant)
  }
  set presentationVariant(value) {
    this.patchState({ presentationVariant: value } as State)
  }
  public readonly presentationVariant$ = this.select((state) => state.presentationVariant)

  get slicers() {
    return this.selectionVariant?.selectOptions
  }
  set slicers(value) {
    this.selectionVariant = {
      ...(this.selectionVariant ?? {}),
      selectOptions: value
    }
  }

  private _initialise$ = new BehaviorSubject<boolean>(null)
  readonly initialise$ = this._initialise$.asObservable().pipe(filter((initialised) => initialised))

  // is loading status
  public loading$ = new BehaviorSubject<boolean>(null)
  protected result$ = new BehaviorSubject<QueryReturn<T>>(null)

  public readonly dataSource$ = this._dataSource$.pipe(
    filter(Boolean),
    switchMap((name) => this.dsCoreService.getDataSource(name)),
    tap((dataSource) => {
      this.patchState({ dataSourceOptions: dataSource.options } as State)
    }),
    shareReplay(1)
  )
  
  get entityService(): EntityService<T> {
    return this.entityService$.value
  }
  protected entityService$ = new BehaviorSubject<EntityService<T>>(null)

  // 内部错误
  public internalError$ = new ReplaySubject<any>()
  protected refresh$ = new ReplaySubject<void | boolean>()

  /**
   * @deprecated use `getEntityType` or `selectEntityType` method
   */
  entityType: EntityType

  constructor(public dsCoreService: DSCoreService) {
    super({} as State)

    this.__id__ = uuid()

    // 公用的刷新数据逻辑
    // 如果想改变逻辑可以重写 query 方法
    this.refresh$
      .pipe(
        delayWhen(() => this.initialise$),
        debounce(() => interval(100)),
        combineLatestWith(this.dataSource$.pipe(switchMap((dataSource) => dataSource.selectOptions()), map((options) => options.parameters?.[this.dataSettings.entitySet]), distinctUntilChanged())),
        tap(() => this.loading$.next(true)),
        switchMap(([force, parameters]) => {
          try {
            return this.selectQuery({ force, parameters }).pipe(
              tap((result) => {
                if (result.error) {
                  this.internalError$.next(result.error)
                }
              }),
              // 避免出错后 refresh$ 的订阅自动取消
              catchError((err) => {
                console.error(err)
                this.internalError$.next(err.message)
                return of({ error: err.message })
              })
            )
          } catch (err: any) {
            console.error(err)
            this.internalError$.next(err.message)
            return of({ error: err.message })
          }
        }),
        // // 避免出错后 refresh$ 的订阅自动取消
        // catchError((err) => {
        //   this.internalError$.next(err)
        //   return of({ error: err })
        // }),
        tap(() => {
          this.loading$.next(false)
          // this.internalError$.next('')
        }),
        takeUntil(this.destroySubject$)
      )
      .subscribe(this.result$)

    this.entitySet$
      .pipe(
        filter((entity) => !!entity),
        switchMap((entity) =>
          this.dataSource$.pipe(
            filter((value) => !!value),
            map((dataSource) => dataSource.createEntityService<T>(entity))
          )
        ),
        takeUntil(this.destroySubject$)
      )
      .subscribe(async (entityService) => {
        this.entityService?.onDestroy()
        this.entityService$.next(entityService)
        this._initialise$.next(false)
        try {
          this.entityType = await firstValueFrom(entityService.selectEntityType())
          this._initialise$.next(true)
        } catch (err) {
          this._initialise$.next(false)
        }
      })
  }

  /**
   * @experiment 使用 async await 方式作为 getXXX method 的异步处理方式; 用 Observable 作为 selectXXX method 的异步处理方式;
   * 
   * @returns 
   */
  async getEntityType() {
    return await firstValueFrom(this.selectEntityType())
  }

  /**
   * @experiment 使用 async await 方式作为 getXXX method 的异步处理方式
   * 
   * @returns 
   */
  async getProperty(name: Dimension | Measure | string) {
    return getEntityProperty(await this.getEntityType(), name)
  }

  selectEntityType() {
    return this.entityService$.pipe(filter((value) => !!value), switchMap((entityService) => entityService.selectEntityType()))
  }

  query(options?: QueryOptions): Observable<QueryReturn<T>> {
    return this.selectQuery(options)
  }

  /**
   * If you change the query conditions and logic first, you can override this method in the subclass
   *
   * @param options `QueryOptions`
   */
  selectQuery(options?: QueryOptions): Observable<QueryReturn<T>> {
    if (!this.entityService) {
      throw new Error(`Should provide attribute 'dataSettings' to create entity service`)
    }

    // if (
    //   isEmpty(options?.statement) &&
    //   isEmpty(options?.selects) &&
    //   isEmpty(options?.columns) &&
    //   isEmpty(options?.rows)
    // ) {
    //   return of({ results: [] })
    // }

    options = options ?? {}
    const presentationVariant = this.presentationVariant
    // Selects
    if (presentationVariant?.requestAtLeast) {
      options.selects = options.selects || []
      options.selects.push(...presentationVariant.requestAtLeast)
    }

    // OrderBys
    if (presentationVariant?.sortOrder) {
      options.orderbys = options.orderbys || []
      options.orderbys.push(...presentationVariant.sortOrder.filter(nonNullable))
    }

    // Top
    if (!isNil(presentationVariant?.maxItems)) {
      options.paging = options.paging || {}
      options.paging.top = presentationVariant.maxItems
    }

    // Skip
    if (!isNil(presentationVariant?.skip)) {
      options.paging = options.paging || {}
      options.paging.skip = presentationVariant.skip
    }

    options = this.calculateFilters(options)

    return this.entityService.selectQuery(options)
  }

  refresh(force?: boolean) {
    this.refresh$.next(force)
  }

  selectResult() {
    return this.result$.pipe(filter(nonNullable))
  }

  calculateFilters(queryOptions?: QueryOptions) {
    return queryOptions
  }

  getAnnotation<AT extends Annotation>(term: AnnotationTerm, qualifier?: string) {
    return this.entityService.getAnnotation<AT>(term, qualifier)
  }

  getCalculatedMember(measure: string, type: PeriodFunctions, calendar?: string): Property {
    return this.entityService.getCalculatedMember(measure, type, calendar)
  }

  getIndicator(idOrCode: string) {
    return this.entityService.getIndicator(idOrCode)
  }
}
