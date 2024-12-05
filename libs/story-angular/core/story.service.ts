import { BreakpointObserver, Breakpoints, BreakpointState } from '@angular/cdk/layout'
import { computed, inject, Inject, Injectable, Injector, Optional, signal } from '@angular/core'
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop'
import { MatDialog } from '@angular/material/dialog'
import { MatSnackBar } from '@angular/material/snack-bar'
import { ID, IStoryTemplate, StoryTemplateType } from '@metad/contracts'
import {
  createSubStore,
  dirtyCheckWith,
  getErrorMessage,
  Intent,
  isNotEmpty,
  markdownModelCube,
  nonNullable,
  NxCoreService,
  write
} from '@metad/core'
import { CdkConfirmUniqueComponent } from '@metad/ocap-angular/common'
import { NgmDSCoreService, NgmOcapCoreService } from '@metad/ocap-angular/core'
import { EntitySelectDataType, EntitySelectResultType, NgmEntityDialogComponent } from '@metad/ocap-angular/entity'
import {
  AggregationRole,
  assignDeepOmitBlank,
  C_MEASURES,
  CalculationProperty,
  DataSettings,
  DataSourceSettings,
  DeepPartial,
  EntityType,
  isEntityType,
  isMeasureControlProperty,
  isRestrictedMeasureProperty,
  MeasureControlProperty,
  mergeEntitySets,
  ParameterProperty,
  Property,
  Schema
} from '@metad/ocap-core'
import { createStore, Query, select, Store, withProps } from '@ngneat/elf'
import { stateHistory } from '@ngneat/elf-state-history'
import { TranslateService } from '@ngx-translate/core'
import { cloneDeep, findKey, includes, isEmpty, isEqual, negate, omit, some, sortBy } from 'lodash-es'
import { NGXLogger } from 'ngx-logger'
import { derivedAsync } from 'ngxtension/derived-async'
import { combineLatest, firstValueFrom, Observable, of, Subject } from 'rxjs'
import {
  delayWhen,
  distinctUntilChanged,
  filter,
  map,
  share,
  shareReplay,
  switchMap,
  tap,
  withLatestFrom
} from 'rxjs/operators'
import { NX_STORY_STORE, NxStoryStore } from './story-store.service'
import {
  cssStyle,
  FlexLayout,
  MoveDirection,
  Story,
  StoryEvent,
  StoryEventType,
  StoryFilterBar,
  StoryOptions,
  StoryPoint,
  StoryPointState,
  StoryPointStyling,
  StoryPointType,
  StoryPreferences,
  StoryState,
  StoryWidget,
  uuid,
  WIDGET_INIT_POSITION,
  WidgetComponentType
} from './types'
import { convertStoryModel2DataSource, getSemanticModelKey } from './utils'
import { Dialog } from '@angular/cdk/dialog'

@Injectable()
export class NxStoryService {
  readonly #translate = inject(TranslateService)
  readonly #ocapService? = inject(NgmOcapCoreService, { optional: true })
  readonly #dialog = inject(Dialog)

  /**
  |--------------------------------------------------------------------------
  | Store
  |--------------------------------------------------------------------------
  */
  readonly store = createStore({ name: 'story' }, withProps<StoryState>({ story: null, points: [] }))
  readonly pristineStore = createStore({ name: 'story_pristine' }, withProps<StoryState>({ story: null, points: [] }))
  readonly #stateHistory = stateHistory<Store, StoryState>(
    createSubStore(this.store, { properties: ['story'], name: 'sub_story' }, withProps<Story>(null)),
    {
      comparatorFn: negate(isEqual)
    }
  )
  /**
   * Dirty check for whole story
   */
  readonly dirtyCheckResult = dirtyCheckWith(this.store, this.pristineStore, {
    watchProperty: ['story'],
    comparator: negate(isEqual)
    // comparator: debugDirtyCheckComparator
  })
  readonly pageDirty = toSignal(this.store.pipe(select((state) => state.points?.some((item) => item.dirty))))
  readonly dirty = computed(() => this.dirtyCheckResult.dirty() || this.pageDirty())
  readonly dirty$ = toObservable(this.dirty)

  readonly storySaving = signal(false)
  readonly pageSaving = toSignal(this.store.pipe(select((state) => state.points?.some((item) => item.saving))))
  readonly saving = computed(() => this.storySaving() || this.pageSaving())

  private saved$ = new Subject<void>()
  private readonly refresh$ = new Subject<boolean>()

  /**
  |--------------------------------------------------------------------------
  | Observables
  |--------------------------------------------------------------------------
  */
  /**
   * 当前运行环境是否为移动端
   */
  readonly mediaMatcher$ = combineLatest(
    Object.keys(Breakpoints).map((name) => {
      return this.breakpointObserver
        .observe([Breakpoints[name]])
        .pipe(map((state: BreakpointState) => [name, state.matches]))
    })
  ).pipe(map((breakpoints) => breakpoints.filter((item) => item[1]).map((item) => item[0])))
  public readonly isMobile$ = this.mediaMatcher$.pipe(
    map((values) => some(['XSmall', 'Small', 'HandsetPortrait'], (el) => includes(values, el))),
    distinctUntilChanged(),
    shareReplay(1)
  )

  readonly story$ = this.select((state) => state.story)
  readonly id$ = this.select((state) => state.story?.id)
  readonly storySignal = toSignal(this.select((state) => state.story))
  readonly creatingWidgetSignal = toSignal(this.select((state) => state.creatingWidget))

  // Story options merge template
  public readonly storyOptions$: Observable<StoryOptions> = this.story$.pipe(
    filter((story) => Boolean(story?.id)),
    map((story) => story?.options),
    distinctUntilChanged(isEqual),
    shareReplay(1)
  )
  readonly storyOptions = toSignal(this.storyOptions$)

  // 语言代码
  readonly locale$ = this.storyOptions$.pipe(
    map((options) => options?.locale),
    distinctUntilChanged()
  )
  readonly preferences$: Observable<StoryPreferences> = this.storyOptions$.pipe(
    map((options) => options?.preferences),
    distinctUntilChanged()
  )
  readonly preferences = toSignal(this.preferences$)
  readonly advancedStyle$ = this.storyOptions$.pipe(
    map((options) => options?.advancedStyle),
    distinctUntilChanged()
  )
  readonly echartsTheme$ = this.storyOptions$.pipe(
    map((options) => options?.echartsTheme),
    distinctUntilChanged()
  )
  // readonly appearance$ = this.preferences$.pipe(map((preferences) => preferences?.story?.appearance))
  readonly displayDensity$ = this.preferences$.pipe(map((preferences) => preferences?.story?.displayDensity))

  // 全局固定过滤条件
  public readonly filters$ = this.storyOptions$.pipe(
    map((options) => options?.filters),
    distinctUntilChanged()
  )
  // Default data settings
  readonly defaultDataSettings = computed(() => this.storyOptions()?.defaultDataSettings)
  readonly defaultModelCubePrompt = derivedAsync(() => {
    const dataSettings = this.defaultDataSettings()
    if (dataSettings) {
      return this.selectEntityType({ dataSource: dataSettings.dataSource, entitySet: dataSettings.entities[0] }).pipe(
        map((cube) => markdownModelCube({ modelId: dataSettings.modelId, dataSource: dataSettings.dataSource, cube }))
      )
    }
    return null
  })

  readonly storyModel$ = this.select((state) => state.story.model)
  readonly storyModels$ = combineLatest([this.storyModel$, this.select((state) => state.story.models)]).pipe(
    map(([model, models]) => {
      const _models = [...(models ?? [])]
      if (model && !some(_models, { id: model.id })) {
        _models.push(model)
      }
      return _models
    })
  )

  readonly storyModelsOptions$ = this.storyModels$.pipe(
    map((models) =>
      models.map((model) => ({
        value: model.id,
        key: model.key,
        caption: model.name
      }))
    )
  )

  // Convert semantic models into data sources
  readonly dataSourceOptions$ = this.storyModels$.pipe(
    map((models) => models.map((model) => convertStoryModel2DataSource(model))),
    takeUntilDestroyed(),
    shareReplay(1)
  )

  readonly dataSources = toSignal(this.storyModelsOptions$)

  readonly schemas$ = combineLatest([
    this.select((state) => state.story.schema),
    this.select((state) => state.story.schemas)
  ]).pipe(
    map(([schema, schemas]: [any, Story['schemas']]) => {
      const model = this.get((state) => state.story.model)
      schemas = cloneDeep(schemas) ?? {}
      if (schema && model) {
        const newSchema = schemas[getSemanticModelKey(model)]
        schemas[getSemanticModelKey(model)] = assignDeepOmitBlank(newSchema, schema)
      }
      return schemas
    }),
    takeUntilDestroyed(),
    shareReplay(1)
  )

  /**
   * @deprecated use signal `themeName`
   */
  public readonly themeName$ = this.storyOptions$.pipe(
    map((options) => options?.preferences?.story?.themeName),
    distinctUntilChanged()
  )
  readonly themeName = toSignal(this.storyOptions$.pipe(map((options) => options?.preferences?.story?.themeName)))

  public readonly editable$ = this.select((state) => state.editable)
  readonly editable = toSignal(this.select((state) => state.editable))
  public readonly currentPageKey$ = this.select((state) => state.currentPageKey)
  public readonly currentPageKey = toSignal(this.select((state) => state.currentPageKey))

  public readonly pageStates$ = this.select((state) => state.points).pipe(filter(nonNullable))
  readonly pageStates = toSignal(this.pageStates$)
  readonly storyPoints = toSignal(this.select((state) => state.story?.points))
  readonly points = computed(() =>
    this.storyPoints()?.filter((item) => !this.pageStates().some((state) => state.removed && state.key === item.key))
  )

  readonly displayPoints = computed(() => {
    const points = this.points()
    const editable = this.editable()
    const currentPageKey = this.currentPageKey()

    return sortBy(points?.filter((item) => editable || !item.hidden || item.key === currentPageKey) || [], 'index')
  })
  readonly displayPoints$ = toObservable(this.displayPoints)

  public readonly isEmpty$ = this.pageStates$.pipe(map((points) => isEmpty(points)))

  public readonly currentPage$ = combineLatest([this.currentPageKey$, this.pageStates$]).pipe(
    map(([currentPageKey, pageStates]) => pageStates.find((pageState) => pageState.key === currentPageKey))
  )

  readonly copySelectedWidget$ = this.select((state) => state.copySelectedWidget)

  /**
   * @deprecated use Signal {@link isAuthenticated} instead
   */
  public readonly isAuthenticated$ = this.select((state) => state.isAuthenticated)
  readonly isAuthenticated = toSignal(this.select((state) => state.isAuthenticated))
  public readonly isPanMode$ = this.select((state) => state.isPanMode)
  readonly isPanMode = toSignal(this.select((state) => state.isPanMode))

  // FilterBar merge with global appearance
  // public readonly filterBar$ = combineLatest([this.appearance$, this.select((state) => state.story?.filterBar)]).pipe(
  //   map(([appearance, filterBar]) => {
  //     return filterBar
  //       ? merge(
  //           {
  //             styling: {
  //               appearance
  //             }
  //           },
  //           filterBar
  //         )
  //       : null
  //   }),
  //   shareReplay(1)
  // )

  // toolbar events
  private _storyEvent$ = new Subject<StoryEvent>()
  public readonly creatingWidget$ = this.select((state) => state.creatingWidget)
  public save$ = new Subject<void>()

  /**
   * Story page size: emulated device size when in desktop device,
   * but not emulated when in mobile device or editing mode (that provided by actual device size).
   */
  readonly storySizeStyles$ = combineLatest([
    this.editable$,
    this.isMobile$,
    this.storyOptions$.pipe(map((options) => options?.emulatedDevice))
  ]).pipe(
    map(([editable, isMobile, emulatedDevice]) => {
      if (editable || isMobile) {
        return {
          width: null,
          height: null
        }
      } else {
        return {
          width: emulatedDevice?.width ? emulatedDevice.width + 'px' : null,
          height: emulatedDevice?.height ? emulatedDevice.height + 'px' : null
        }
      }
    })
  )

  readonly modelCubes$ = this.storyModelsOptions$.pipe(
    switchMap((dataSources) =>
      combineLatest(
        dataSources.map((option) =>
          this.selectDataSource(option.key).pipe(switchMap((dataSource) => dataSource.discoverMDCubes()))
        )
      ).pipe(map((cubess) => cubess.map((cubes, index) => ({ ...dataSources[index], cubes }))))
    ),
    shareReplay(1)
  )

  /**
  |--------------------------------------------------------------------------
  | Signals
  |--------------------------------------------------------------------------
  */
  readonly currentPageIndex = computed(() =>
    this.displayPoints()?.findIndex((item) => item.key === this.currentPageKey())
  )
  readonly currentPageState = computed(() => this.pageStates()?.find((item) => item.key === this.currentPageKey()))
  readonly currentStoryPoint = computed(() => this.storyPoints()?.find((point) => point.key === this.currentPageKey()))
  readonly currentPageWidgets = computed(() => this.currentStoryPoint()?.widgets)
  readonly currentWidget = toSignal(this.select((state) => state.currentWidget))

  /**
  |--------------------------------------------------------------------------
  | Subscriptions (effect)
  |--------------------------------------------------------------------------
  */
  private dataSourceSub = combineLatest([this.dataSourceOptions$, this.locale$])
    .pipe(withLatestFrom(this.schemas$), takeUntilDestroyed())
    .subscribe(([[dataSources, locale], schemas]) => {
      for (let dataSource of dataSources) {
        if (locale) {
          dataSource = {
            ...dataSource,
            settings: {
              ...(dataSource.settings ?? {}),
              language: locale
            } as DataSourceSettings
          }
        }

        // 2. Story 级别的 Schema 合并
        if (schemas?.[dataSource.name]) {
          const schema = schemas?.[dataSource.name] as Record<string, EntityType>
          dataSource = {
            ...dataSource,
            schema: {
              ...(dataSource.schema ?? {}),
              entitySets: mergeEntitySets(
                dataSource.schema?.entitySets,
                // 向后兼容，需要重构 dataSource.schema.entitySets
                Object.values(schema).reduce((acc, cur) => {
                  acc[cur.name as string] = {
                    name: cur.name as string,
                    entityType: cur
                  }
                  return acc
                }, {})
              )
            } as Schema
          }
        }

        this.logger?.debug(`[StoryService] register model`, dataSource.name)
        this.dsCoreService.registerModel(dataSource)
      }
    })
  // 对于一次性异步任务部分改造成 async await 的方式
  private schemaSub = this.schemas$.pipe(filter(nonNullable)).subscribe(async (schemas) => {
    for await (const name of Object.keys(schemas)) {
      const schema = schemas[name]
      const dataSource = await firstValueFrom(this.dsCoreService.getDataSource(name))
      dataSource.setSchema({
        ...dataSource.options.schema,
        //mergeEntitySets(dataSource.options.schema?.entitySets,
        entitySets:
          // 向后兼容
          Object.values(schema).reduce((acc, cur) => {
            acc[cur.name] = {
              name: cur.name,
              entityType: cur
            }
            return acc
          }, {}) // )
      })
    }
  })
  // 是否迁移回 storyService 中来, 不通过 core service
  private storyUpdateEventSub = this.#ocapService
    ?.onEntityUpdate()
    .pipe(takeUntilDestroyed())
    .subscribe(({ type, dataSettings, parameter, property }) => {
      this.logger?.debug(`[StoryService] add calculation | type: '${type}'`, dataSettings, parameter, property)
      if (type === 'Parameter') {
        this.upsertParamter({ dataSettings, parameter })
      } else {
        this.addCalculationMeasure({ dataSettings, calculation: property })
      }
    })

  constructor(
    private dsCoreService: NgmDSCoreService,
    private coreService: NxCoreService,
    protected injector: Injector,
    public breakpointObserver: BreakpointObserver,
    @Optional()
    @Inject(NX_STORY_STORE)
    private storyStore?: NxStoryStore,
    @Optional() protected logger?: NGXLogger,
    @Optional() private _snackBar?: MatSnackBar,
    @Optional() private _dialog?: MatDialog
  ) {}

  onSaved() {
    return this.saved$
  }

  /**
   * Init story state
   *
   * @param story
   * @param fetched Widgets fetched
   */
  setStory(story: Story, options = { fetched: false }) {
    this.logger?.debug(`[Story] [StoryService] init story`, story)

    const { fetched } = options
    this.store.update((state) => ({
      ...state,
      story: cloneDeep(story),
      points: story.points.map((item) => ({
        id: item.id,
        key: item.key,
        fetched
        // storyPoint: cloneDeep(item)
      }))
    }))
    this.pristineStore.update(() => ({
      story: cloneDeep(story),
      points: []
    }))
  }

  /**
   * Trigger DirtyCheckQuery to check state dirty then call the actual save method `_saveStory`
   */
  saveStory() {
    // this.dirtyCheckQuery.reset()
    // Start saving
    const pristineStory = this.pristineStore.query((state) => state.story)
    const currentStory = this.store.query((state) => state.story)
    // 0. Start saving story
    this.storySaving.set(true)
    // 1. To start saving story points and widgets
    this.save$.next()
    // 2. Saving story main info
    const saveStoryReq = this._saveStory(pristineStory, currentStory).pipe(share())
    // 3. Notify message and reset story when stop saving
    saveStoryReq
      .pipe(delayWhen(() => toObservable(this.saving, { injector: this.injector }).pipe(filter((saving) => !saving))))
      .subscribe({
        next: (result) => {
          if (result) {
            const successMessage = this.getTranslation('Story.Story.SaveSuccess', 'Save success')
            this._snackBar.open(successMessage, '', {
              duration: 2000
            })
          }
          this.resetStory()
        },
        error: (error) => {
          const errorMessage = this.getTranslation('Story.Story.SaveFailed', 'Save failed')
          this._snackBar.open(errorMessage, getErrorMessage(error.statusText), {
            duration: 2000
          })
        }
      })
    // 4. Stop saving status of story main info
    saveStoryReq.subscribe({
      next: () => {
        this.storySaving.set(false)
      },
      error: () => {
        this.storySaving.set(false)
      }
    })
  }

  resetStory() {
    this.pristineStore.update((state) => ({
      ...state,
      story: cloneDeep(this.store.getValue().story)
    }))
  }

  undo() {
    this.#stateHistory.undo()
  }

  redo() {
    this.#stateHistory.redo()
  }

  refresh(force = false) {
    this.refresh$.next(force)
  }

  onRefresh() {
    return this.refresh$.asObservable()
  }

  readonly setAuthenticated = this.updater((state, isAuthenticated: boolean) => {
    state.isAuthenticated = isAuthenticated
  })

  getTranslation(prefix: string, text: string, params?: Record<string, unknown>) {
    return this.#translate.instant(prefix, { Default: text, ...params })
  }

  getDefaultDataSource() {
    const story = this.storySignal()
    const defaultModel = story.models?.[0]
    return {
      dataSource: defaultModel?.key,
      entitySet: defaultModel?.cube
    }
  }

  /**
  |--------------------------------------------------------------------------
  | Selectors
  |--------------------------------------------------------------------------
  */
  get<R>(fn?: Query<StoryState, R>) {
    return this.store.query(fn ?? ((state) => state as R))
  }
  select<R>(fn: (state: StoryState) => R) {
    return this.store.pipe(
      filter((state) => !!state.story),
      select(fn)
    )
  }
  updater<ProvidedType = void, OriginType = ProvidedType>(
    fn: (state: StoryState, ...params: OriginType[]) => StoryState | void
  ) {
    return (...params: OriginType[]) => {
      this.store.update(write((state) => fn(state, ...params)))
    }
  }
  patchState(state: Partial<StoryState>) {
    this.store.update((s) => ({ ...s, ...state }))
  }

  selectBreakpoint() {
    return this.breakpointObserver.observe([Breakpoints.XSmall, Breakpoints.HandsetPortrait])
  }

  selectDataSource(name: string) {
    return this.dsCoreService.getDataSource(name)
  }

  /**
   * 监听某个 Entity Type
   */
  selectEntityType({ dataSource, entitySet }: { dataSource: string; entitySet: string }): Observable<EntityType> {
    return this.selectDataSource(dataSource).pipe(
      switchMap((dataSource) => dataSource.selectEntityType(entitySet).pipe(filter(isEntityType)))
    )
  }

  /**
   * Select entity type for widget by widget key
   *
   * @param widgetKey
   * @returns
   */
  selectWidgetEntityType(widgetKey: string) {
    const widget = this.store.query((state) => {
      let widget: StoryWidget = null
      for (const point of state.story.points) {
        widget = point.widgets?.find((widget) => widget.key === widgetKey)
        if (widget) {
          return widget
        }
      }
      return null
    })

    if (!widget) {
      throw new Error(`Widget '${widgetKey}' not found`)
    }
    const { dataSource, entitySet } = widget.dataSettings ?? {}
    if (!dataSource || !entitySet) {
      throw new Error(`Widget '${widgetKey}' data settings not found`)
    }
    return this.selectEntityType({ dataSource, entitySet })
  }

  selectWidget(pointId: ID, widgetId: ID) {
    return this.story$.pipe(
      select((story) => story.points?.find((item) => item.id === pointId)),
      select((point) => point?.widgets?.find((item) => item.id === widgetId))
    )
  }

  selectPointEvent(pointKey: ID) {
    return this._storyEvent$.pipe(filter(({ key }) => key === pointKey))
  }

  selectEntitySchemaProperty<T>(dataSource: string, entitySet: string, key: string) {
    return this.schemas$.pipe(
      map((schemas) => schemas?.[dataSource]),
      map((schemas) => schemas?.[entitySet]),
      map<EntityType, T>(
        (schema) => Object.values(schema?.properties ?? {}).find((property) => property.__id__ === key) as T
      )
    )
  }

  /**
  |--------------------------------------------------------------------------
  | Actions
  |--------------------------------------------------------------------------
  */
  public sendIntent(intent: Intent) {
    this.coreService.sendIntent(intent)
  }

  public onIntent() {
    return this.coreService.onIntent()
  }

  setCurrentIndex(index: number) {
    const displayPoints = this.displayPoints()
    this.setCurrentPageKey(displayPoints[index]?.key)
  }

  /**
   * 设置当前页面
   */
  readonly setCurrentPageKey = this.updater((state, key: ID) => {
    state.currentPageKey = key
  })

  /**
   * New story page
   *
   * @param page
   */
  async newStoryPage(page: Partial<StoryPoint>) {
    const name =
      page.name ||
      (await firstValueFrom(
        this.#dialog
          .open<string>(CdkConfirmUniqueComponent, {
            data: {
              title: this.getTranslation('Story.Story.NewPageName', 'New Page Name')
            }
          })
          .closed
      ))
    if (name) {
      const key = page.key ?? uuid()
      const _page = {
        ...page,
        type: page.type ?? StoryPointType.Canvas,
        key,
        name,
        storyId: this.storySignal().id,
        // Add widgets
        widgets:
          page.widgets?.map((widget) => ({
            ...widget,
            key: widget.key ?? uuid()
          })) ?? []
      }

      this.addStoryPage(_page)
      this.setCurrentPageKey(key)

      return _page
    }
  }

  /**
   * Add page into story internal
   */
  private readonly addStoryPage = this.updater((state, input: StoryPoint) => {
    state.points ??= []
    state.points.push({
      id: null,
      key: input.key,
      fetched: true
    })

    state.story.points ??= []
    state.story.points.push({
      ...input,
      index: input.index ?? state.points.length
    })
  })

  /**
   * Delete story point by key in local state
   */
  readonly #removeStoryPoint = this.updater((state, key: ID) => {
    state.points = state.points.filter((pointState) => pointState.key !== key)
    state.story.points = state.story.points.filter((item) => item.key !== key)
  })

  /**
   * Set the removed flag of a story point
   */
  readonly #deleteStoryPoint = this.updater((state, key: ID) => {
    // Mark the point state as removed
    const index = state.points.findIndex((pointState) => pointState.key === key)
    if (index > -1) {
      if (state.points[index].id) {
        state.points[index].removed = true
      } else {
        state.points.splice(index, 1)
      }
    }

    // Delete story point in story
    const _index = state.story.points.findIndex((item) => item.key === key)
    if (_index > -1) {
      state.story.points.splice(_index, 1)
    }
  })

  /**
   * Remove a story point by key
   *
   * @param key
   */
  deleteStoryPoint(key: string) {
    const displayPoints = this.displayPoints()
    this.#deleteStoryPoint(key)
    const index = displayPoints.findIndex((item) => item.key === key)
    this.patchState({
      currentPageKey: displayPoints[index > 0 ? index - 1 : 1]?.key
    })
  }

  hideStoryPage(key: string) {
    const displayPoints = this.displayPoints()

    this.toggleStoryPointHidden(key)

    const index = displayPoints.findIndex((item) => item.key === key)
    this.patchState({
      currentPageKey: displayPoints[index > 0 ? index - 1 : 1]?.key
    })
  }

  readonly toggleStoryPointHidden = this.updater((state, key: string) => {
    const storyPoint = state.story.points.find((item) => item.key === key)
    if (storyPoint) {
      storyPoint.hidden = !storyPoint.hidden
    }
  })

  readonly setCurrentWidget = this.updater((state, widget: StoryWidget) => {
    state.currentWidget = widget
  })

  /**
   * Udpate story widget by pageKey and widgetId
   */
  readonly updateWidget = this.updater(
    (
      state,
      { pageKey, widgetKey, widget }: { pageKey?: string; widgetKey: string; widget: DeepPartial<StoryWidget> }
    ) => {
      const pointKey = pageKey ?? state.currentPageKey
      const currentPage = state.story.points.find((item) => item.key === pointKey)
      const index = currentPage.widgets.findIndex((item) => item.key === widgetKey)
      if (index > -1) {
        // this.logger.debug(`[StoryService] update widget before:`, cloneDeep(currentPage.widgets[index]))
        // this.logger.debug(`[StoryService] update widget value:`, cloneDeep(widget))
        currentPage.widgets[index] = assignDeepOmitBlank(currentPage.widgets[index], widget, 10)
        // this.logger.debug(`[StoryService] update widget after:`, cloneDeep(currentPage.widgets[index]))
      } else {
        throw new Error(
          this.getTranslation(
            'Story.Story.WidgetNotExistInPage',
            `Widget '${widgetKey}' does not exist in page '${pointKey}'`
          )
        )
      }
    }
  )

  createStoryWidget(event: DeepPartial<StoryWidget>) {
    const currentPageKey = this.currentPageKey()

    if (!currentPageKey || !this.currentStoryPoint()) {
      throw new Error(this.getTranslation('Story.Story.CurrentPageNotExist', `Current page does not exist`))
    }

    const { dataSource, entitySet } = this.getDefaultDataSource()
    this._storyEvent$.next({
      key: currentPageKey,
      type: StoryEventType.CREATE_WIDGET,
      data: {
        ...event,
        dataSettings: {
          dataSource,
          entitySet,
          ...(event.dataSettings ?? {})
        }
      }
    })
  }

  readonly copyWidget = this.updater((state, widget?: StoryWidget) => {
    const currentWidget: StoryWidget = cloneDeep(widget ?? state.currentWidget)
    state.copySelectedWidget = {
      ...currentWidget,
      position: {
        ...currentWidget.position,
        x: 0,
        y: 0
      }
    }
  })

  readonly duplicateWidget = this.updater((state) => {
    this.copyWidgetTo({ pointKey: state.currentPageKey })
  })

  readonly clearCopy = this.updater((state) => {
    state.copySelectedWidget = null
  })

  readonly setEditable = this.updater((state, editable: boolean) => {
    state.editable = editable
  })

  /**
   * 保存故事: 1. 故事变化; 2. 创建删除故事点;
   * 其他的变化由 StoryPoint 服务进行保存.
   *
   * @param pristine
   * @param current
   * @returns
   */
  private _saveStory(pristine: Story, current: Story): Observable<any> {
    const updates: Observable<void>[] = []
    // update story
    if (!isEqual({ ...pristine, points: [] }, { ...current, points: [] })) {
      updates.push(this.storyStore.updateStory(current))
    }

    this.get((state) => state.points)
      .filter((state) => state.removed && state.id)
      .forEach((state) => {
        // delete point
        updates.push(
          this.storyStore.removeStoryPoint(pristine.id, state.id).pipe(
            tap({
              next: () => {
                // Delete story point in local state
                this.#removeStoryPoint(state.key)
              },
              error: (error) => {
                this._snackBar.open('删除失败', error.status, {
                  duration: 2000
                })
              }
            })
          )
        )
      })

    if (isNotEmpty(updates)) {
      return combineLatest(updates)
    }

    return of(null)
  }

  // actions for calculation measure
  readonly addCalculationMeasure = this.updater(
    (
      state,
      {
        dataSettings,
        calculation,
        entityCaption
      }: { dataSettings: DataSettings; calculation: CalculationProperty & { options?: any }; entityCaption?: string }
    ) => {
      const properties = getOrInitEntityType(
        state,
        dataSettings.dataSource,
        dataSettings.entitySet,
        entityCaption
      ).properties

      const originName = findKey(properties, (o) => o.__id__ === calculation.__id__)
      if (originName) {
        delete properties[originName]
      }

      // 是否都是 measure 有没有其他情况, Calculated Set 是否在此?
      properties[calculation.name] = {
        ...omit(calculation, 'options'),
        role: AggregationRole.measure,
        dataType: 'number',
        visible: true
      }

      const property = properties[calculation.name]

      if (isMeasureControlProperty(calculation)) {
        properties[calculation.name] = {
          ...omit(calculation, 'options'),
          role: AggregationRole.measure,
          dataType: 'number',
          // 默认第一个 Measure
          value: calculation.value ?? calculation.availableMembers[0]?.value
        } as MeasureControlProperty

        // New calculation measure control to create input control for it
        if (!originName) {
          this.createMeasureControlWidget({ dataSettings, name: calculation.name })
        }
      }

      if (isRestrictedMeasureProperty(property)) {
        // Create Input Control for RestrictedMeasure
        property.dimensions?.forEach((dimension) => {
          if (dimension.name && !originName) {
            // create dimension input control
            this.createInputControlWidget({
              dataSource: dataSettings.dataSource,
              entitySet: dataSettings.entitySet,
              dimension: dimension
            })
          }
        })
      }
    }
  )

  /**
   * 更新计算度量属性, 常被用在诸如 Measure Input Control 等字段
   */
  readonly updateCalculationMeasure = this.updater(
    (
      state,
      {
        dataSettings,
        calculation,
        entityCaption
      }: { dataSettings: DataSettings; calculation: Partial<CalculationProperty>; entityCaption?: string }
    ) => {
      // Find the measure entity position in story schema
      const properties = getOrInitEntityType(
        state,
        dataSettings.dataSource,
        dataSettings.entitySet,
        entityCaption
      ).properties

      const originName = findKey(properties, (o) => o.__id__ === calculation.__id__)
      let originProperty = {} as Property
      if (originName) {
        originProperty = properties[originName]
        delete properties[originName]
      }
      properties[calculation.name ?? originProperty.name] = {
        ...originProperty,
        ...calculation
      } as Property
    }
  )

  /**
   * 如何安全地删除计算成员， 保证使用到的地方都被提醒到？
   */
  readonly removeCalculation = this.updater(
    (state, { dataSettings, name }: { dataSettings: DataSettings; name: string }) => {
      // Find the measure entity position in story schema
      const properties = getOrInitEntityType(state, dataSettings.dataSource, dataSettings.entitySet).properties
      delete properties[name]
    }
  )

  /**
   * 更新或者创建 Entity Parameter
   */
  readonly upsertParamter = this.updater(
    (
      state,
      {
        dataSettings,
        parameter,
        entityCaption
      }: { dataSettings: DataSettings; parameter: Partial<ParameterProperty>; entityCaption?: string }
    ) => {
      const parameters = getOrInitEntityParameters(
        state,
        dataSettings.dataSource,
        dataSettings.entitySet,
        entityCaption
      )
      const key = findKey(parameters, (o) => o.__id__ === parameter.__id__)
      let origin = {} as ParameterProperty
      if (key) {
        origin = parameters[key]
        delete parameters[key]
      }
      parameters[parameter.name ?? origin.name] = {
        ...origin,
        ...parameter
      }

      if (!key) {
        this._createInputControlWidget(state, {
          ...dataSettings,
          dimension: {
            dimension: parameter.name
          }
        })
      }
    }
  )

  readonly removeEntityParameter = this.updater(
    (state, { dataSource, entity, parameter }: { dataSource: string; entity: string; parameter: string }) => {
      const parameters = getOrInitEntityParameters(state, dataSource, entity)
      const key = findKey(parameters, (o) => o.name === parameter)
      if (key) {
        delete parameters[key]
      }
    }
  )

  /**
   * 创建 dimension 的 Input Control
   */
  readonly createInputControlWidget = this.updater((state, dataSettings: DataSettings) => {
    this._createInputControlWidget(state, dataSettings)
  })

  private _createInputControlWidget(state: StoryState, { dataSource, entitySet, dimension }: DataSettings) {
    const storyPoint = state.story.points.find((item) => item.key === state.currentPageKey)
    storyPoint.widgets.push({
      key: uuid(),
      storyId: state.story.id,
      pointId: storyPoint.id,
      name: dimension.name,
      title: dimension.name,
      component: WidgetComponentType.InputControl,
      position: { x: 0, y: 0, ...WIDGET_INIT_POSITION },
      dataSettings: {
        dataSource,
        entitySet,
        dimension
      },
      options: {
        dimension
      }
    } as StoryWidget)
  }

  getCurrentWidget(widgetKey?: string) {
    const state = this.get<StoryState>()
    let widget: StoryWidget
    if (widgetKey) {
      widget = findStoryWidget(state, widgetKey)
      if (!widget) {
        throw new Error(`Can't found widget '${widgetKey}'`)
      }
    } else if (state.currentWidget) {
      widget = state.currentWidget
    } else {
      throw new Error(`Please select an widget!`)
    }
    return widget
  }

  /**
   * Copy widget to this or another page
   */
  copyWidgetTo(orign: { name?: string; widgetKey?: ID; pointKey: ID }) {
    const { name, pointKey, widgetKey } = orign
    const widget: StoryWidget = this.getCurrentWidget(widgetKey)

    this.pasteWidget({ widget, pointKey, name })

    this.setCurrentPageKey(pointKey)
  }

  /**
   * Copy the widget to a new page
   *
   * @param type
   * @param widgetKey
   */
  async copyWidgetToNewPage(type: StoryPointType, widgetKey?: string) {
    const point = await this.newStoryPage({
      type
    })
    if (point) {
      this.copyWidgetTo({ pointKey: point.key, widgetKey })
    }
  }

  /**
   * Move widget to another page
   */
  public readonly moveWidgetTo = this.updater((state, params: { widget: { pointKey: ID; key: ID }; pointKey: ID }) => {
    const { widget, pointKey } = params
    const toPageState = state.points.find((item) => item.key === pointKey)
    const fromPage = state.story.points.find((item) => item.key === widget.pointKey)
    if (fromPage && toPageState) {
      const index = fromPage.widgets.findIndex((item) => item.key === widget.key)
      if (index > -1) {
        const widgets = fromPage.widgets.splice(index, 1)

        // Cache moved widgets in the target page states
        toPageState.pasteWidgets = toPageState.pasteWidgets ?? []
        toPageState.pasteWidgets.push({
          ...widgets[0],
          position: {
            ...widgets[0].position,
            x: 0,
            y: 0
          }
        })
      }
    }
  })

  /**
   * Move widget to new page
   *
   * @param pointKey
   * @param widgetKey
   * @param type
   */
  async moveWidgetToNewPage(pointKey: ID, widgetKey: ID, type: StoryPointType) {
    const point = await this.newStoryPage({ type })
    if (point) {
      this.moveWidgetTo({ pointKey: point.key, widget: { pointKey, key: widgetKey } })
    }
  }

  readonly duplicateStoryPoint = this.updater((state, key: string) => {
    const index = state.story.points.findIndex((item) => item.key === key)
    const storyPointState = state.story.points[index]

    const newKey = uuid()
    if (storyPointState) {
      const newStoryPointState = cloneDeep(storyPointState)
      newStoryPointState.key = newKey
      newStoryPointState.id = null
      newStoryPointState.widgets?.forEach((widget) => {
        widget.id = null
        widget.pointId = null
      })
      // newStoryPointState.dirty = true
      state.story.points.splice(index + 1, 0, newStoryPointState)
    }

    // duplicate point state
    const pointState = state.points.find((item) => item.key === key)
    if (pointState) {
      state.points.splice(index + 1, 0, {
        key: newKey,
        id: null,
        fetched: true
      })
    }
  })

  removeCurrentWidget() {
    const currentPageKey = this.currentPageKey()
    const currentWidget = this.currentWidget()

    this._storyEvent$.next({
      key: currentPageKey,
      type: StoryEventType.REMOVE_WIDGET,
      data: currentWidget?.key
    })
  }

  /**
   * 移动页面， 左一个、右一个、第一个、最后一个
   */
  readonly move = this.updater((state, { direction, key }: { direction: MoveDirection; key: ID }) => {
    const points = sortBy(state.story.points, (o) => o.index)
    const index = points.findIndex((item) => item.key === key)
    if (index > -1) {
      let swapTarget
      switch (direction) {
        case 'right':
          swapTarget = points[index + 1]
          if (swapTarget) {
            points[index + 1] = points[index]
            points[index] = swapTarget
          }
          break
        case 'left':
          swapTarget = points[index - 1]
          if (swapTarget) {
            points[index - 1] = points[index]
            points[index] = swapTarget
          }
          break
        case 'first':
          swapTarget = points.splice(index, 1)
          points.splice(0, 0, ...swapTarget)
          break
        case 'last':
          swapTarget = points.splice(index, 1)
          points.push(...swapTarget)
          break
      }

      // Reorder index
      points.forEach((item, i) => {
        if (item) {
          item.index = i
        } else {
          // console.warn(cloneDeep(item))
        }
      })
    }
  })

  async saveStoryPoint(key: string) {
    this._storyEvent$.next({
      key,
      type: StoryEventType.SAVE,
      data: {}
    })
  }

  readonly pasteWidget = this.updater(
    (state, { name, widget, pointKey }: { name?: string; widget?: StoryWidget; pointKey?: ID }) => {
      const pageKey = pointKey ?? state.currentPageKey
      const point = state.story.points.find((item) => item.key === pageKey)

      widget = cloneDeep(widget || state.copySelectedWidget)

      if (name) {
        widget.name = name
        widget.title = name
      }
      widget.id = null
      widget.key = uuid()
      widget.storyId = state.story.id
      widget.pointId = point.id
      widget.position = { ...widget.position, x: 0, y: 0 }

      const pointState = state.points.find((item) => item.key === point.key)

      if (!pointState.fetched) {
        pointState.pasteWidgets = pointState.pasteWidgets ?? []
        pointState.pasteWidgets.push(widget)
      } else {
        point.widgets.push(widget)
      }
    }
  )

  /**
   * 创建度量控制器
   */
  readonly createMeasureControlWidget = this.updater((state, { dataSettings, name }: Partial<StoryWidget>) => {
    // Get current page state
    const storyPoint = state.story.points.find((item) => item.key === state.currentPageKey)
    storyPoint.widgets.push({
      key: uuid(),
      storyId: state.story.id,
      pointId: storyPoint.id,
      name,
      title: name,
      component: WidgetComponentType.InputControl,
      position: { x: 0, y: 0, ...WIDGET_INIT_POSITION },
      dataSettings,
      options: {
        dimension: {
          dimension: C_MEASURES,
          measure: name
        }
      }
    } as StoryWidget)
  })

  // Gesture Actions
  async swipe(dir: 'left' | 'right', loop = false) {
    const currentIndex = this.currentPageIndex()
    const displayPoints = this.displayPoints()
    let index = 0
    if (dir === 'left') {
      index = Math.max(currentIndex - 1, 0)
      if (index === currentIndex) {
        index = loop ? displayPoints.length - 1 : currentIndex
      }
    } else {
      index = Math.min(currentIndex + 1, displayPoints.length - 1)
      if (index === currentIndex) {
        index = loop ? 0 : currentIndex
      }
    }
    this.setCurrentPageKey(displayPoints[index]?.key)
  }

  // Updaters for copilot actions
  readonly updateStory = this.updater((state, story: Partial<Story>) => {
    state.story = {
      ...state.story,
      ...story
    }
  })

  readonly updateStoryFilterBar = this.updater((state, filterBar: Partial<StoryFilterBar>) => {
    state.story.filterBar = {
      ...(state.story.filterBar ?? {}),
      ...filterBar
    }
  })

  readonly updateStoryOptions = this.updater((state, options: Partial<StoryOptions>) => {
    state.story.options = {
      ...(state.story.options || {}),
      ...options
    }
  })

  readonly updateStoryPreferences = this.updater((state, preferences: Partial<StoryPreferences>) => {
    state.story.options = state.story.options ?? {}
    state.story.options.preferences = {
      ...(state.story.options?.preferences || {}),
      ...preferences
    }
  })

  readonly mergeStoryPreferences = this.updater((state, preferences: Partial<StoryPreferences>) => {
    state.story.options = state.story.options ?? {}
    state.story.options.preferences = assignDeepOmitBlank(
      state.story.options?.preferences ?? {},
      preferences,
      Number.MAX_SAFE_INTEGER
    )
  })

  updateCurrentPageState<ProvidedType = void, OriginType = ProvidedType>(
    fn: (state: StoryPointState, ...params: OriginType[]) => StoryPointState | void
  ) {
    return (...params: OriginType[]) => {
      this.store.update(
        write((state) => {
          const currentPageKey = state.currentPageKey
          const currentPageIndex = state.points.findIndex((item) => item.key === currentPageKey)
          const result = fn(state.points[currentPageIndex], ...params)
          if (result) {
            state.points[currentPageIndex] = result
          }
        })
      )
    }
  }

  readonly resetZoom = this.updateCurrentPageState((state) => {
    state.scale = null
  })

  readonly zoomIn = this.updateCurrentPageState((state) => {
    state.scale = (state.scale ?? 100) + 10
  })

  readonly zoomOut = this.updateCurrentPageState((state) => {
    state.scale = (state.scale ?? 100) - 10
  })

  readonly setZoom = this.updateCurrentPageState((state, scale: number) => {
    state.scale = scale
  })

  /**
   * Apply template to story
   */
  readonly applyTemplate = this.updater((state, template: IStoryTemplate) => {
    state.story.templateId = template.id
    // Apply theme
    state.story.options = assignDeepOmitBlank(
      state.story.options,
      template?.options?.story?.options,
      Number.MAX_SAFE_INTEGER
    )
    // Apply template
    if (template.type === StoryTemplateType.Template) {
      // Clear all story points
      state.story.points = template.options.pages?.map((item) => {
        return {
          ...item,
          storyId: state.story.id,
          id: null
        } as StoryPoint
      })

      // create story points states
      state.points = template.options.pages?.map((item) => {
        return {
          id: null,
          fetched: true,
          dirty: true,
          key: item.key
        }
      })

      this.setCurrentPageKey(state.points[0]?.key)
    }
  })

  readonly setCreatingWidget = this.updater((state, creatingWidget: Partial<StoryWidget>) => {
    state.creatingWidget = creatingWidget
  })

  readonly updateStoryStyles = this.updater((state, styles: cssStyle) => {
    state.story.options = {
      ...(state.story.options ?? {}),
      preferences: {
        ...(state.story.options?.preferences ?? ({} as StoryPreferences)),
        story: {
          ...(state.story.options?.preferences?.story ?? ({} as StoryPreferences['story'])),
          styling: {
            ...(state.story.options?.preferences?.story?.styling ?? {}),
            ...styles
          }
        }
      }
    }
  })

  readonly updateWidgetStyles = this.updater((state, styles: cssStyle) => {
    state.story.options = {
      ...(state.story.options ?? {}),
      preferences: {
        ...(state.story.options?.preferences ?? ({} as StoryPreferences)),
        widget: {
          ...(state.story.options?.preferences?.widget ?? ({} as StoryPreferences['widget'])),
          ...styles
        }
      }
    }
  })

  readonly updateStoryPointStyles = this.updater((state, styles: cssStyle) => {
    const currentPageKey = state.currentPageKey
    const currentPageIndex = state.story.points.findIndex((item) => item.key === currentPageKey)
    state.story.points[currentPageIndex].styling ??= {} as StoryPointStyling
    state.story.points[currentPageIndex].styling.canvas = {
      ...(state.story.points[currentPageIndex].styling.canvas ?? {}),
      ...styles
    }
  })

  /**
   * Pick a default cube
   */
  async openDefultDataSettings(): Promise<EntitySelectResultType> {
    const dataSources = this.dataSources()

    const result = await firstValueFrom<EntitySelectResultType>(
      this._dialog
        .open<NgmEntityDialogComponent, EntitySelectDataType, EntitySelectResultType>(NgmEntityDialogComponent, {
          data: {
            dataSources,
            dsCoreService: this.dsCoreService
          }
        })
        .afterClosed()
    )
    if (result) {
      // this.patchState({
      //   defaultDataSettings: result
      // })
      this.updateStoryOptions({
        defaultDataSettings: result
      })
    }
    return result
  }

  translate(key: string | string[], params?: Record<string, string>) {
    return this.#translate.instant(key, params)
  }
}

function defaultResponsive() {
  return {
    key: uuid(),
    type: 0,
    direction: 'column',
    styles: {
      'max-width': '100%'
    },
    children: [
      {
        key: uuid(),
        type: 0,
        direction: 'row',
        styles: {
          'max-width': '100%'
        },
        children: [
          {
            key: uuid(),
            type: 0,
            direction: 'row',
            styles: {
              'flex-direction': 'row',
              'flex-wrap': 'wrap',
              'align-content': 'flex-start',
              'flex-basis': '50%',
              'max-width': '50%'
            }
          },
          {
            key: uuid(),
            type: 0,
            styles: {
              'flex-direction': 'row',
              'flex-wrap': 'wrap',
              'flex-basis': '50%',
              'max-width': '50%'
            }
          }
        ]
      },
      {
        key: uuid(),
        type: 0,
        direction: 'row',
        styles: {
          'flex-direction': 'row',
          'flex-wrap': 'wrap'
        }
      }
    ]
  } as FlexLayout
}

export function findStoryWidget(state: StoryState, key: ID) {
  let widget: StoryWidget
  state.story.points.find((point) => {
    return point.widgets?.find((item) => {
      if (item.key === key) {
        widget = item
        return true
      }
      return false
    })
  })

  return widget
}

function getOrInitEntityParameters(state: StoryState, dataSource: string, entity: string, caption?: string) {
  const entityType = getOrInitEntityType(state, dataSource, entity, caption)
  entityType.parameters = entityType.parameters ?? {}
  return entityType.parameters
}

function getOrInitEntityType(state: StoryState, dataSource: string, entity: string, caption?: string) {
  const schemas = (state.story.schemas = state.story.schemas ?? {})
  const schema = (schemas[dataSource] = schemas[dataSource] ?? {})
  const entityType = (schema[entity] = schema[entity] ?? {
    name: entity,
    caption: caption,
    properties: {}
  })
  return entityType
}
