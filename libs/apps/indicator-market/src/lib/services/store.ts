import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop'
import { Injectable, computed, inject, signal } from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import {
  BusinessAreasService,
  IndicatorAppService,
  IndicatorsService,
  SemanticModelServerService,
  convertIndicatorResult,
  convertNewSemanticModelResult
} from '@metad/cloud/state'
import { nonNullable } from '@metad/core'
import { IBusinessAreaUser, IComment, IIndicatorApp, ISemanticModel, TimeGranularity } from '@metad/contracts'
import { NgmDSCoreService } from '@metad/ocap-angular/core'
import { ComponentStore } from '@metad/store'
import { StoryModel, convertStoryModel2DataSource } from '@metad/story/core'
import { EntityAdapter, EntityState, Update, createEntityAdapter } from '@ngrx/entity'
import { assign, includes, indexOf, isEmpty, isEqual, sortBy, uniq } from 'lodash-es'
import { BehaviorSubject, Observable, Subject, combineLatest, firstValueFrom } from 'rxjs'
import { debounceTime, distinctUntilChanged, filter, map, startWith, switchMap, tap } from 'rxjs/operators'
import { IndicatorState, IndicatorTagEnum, LookbackDefault } from '../types'
import { TranslateService } from '@ngx-translate/core'

type DataSources = {
  [id: string]: {
    name: string
    semanticModel: ISemanticModel
  }
}

export interface IndicatorStoreState extends EntityState<IndicatorState> {
  /**
   * Is the store initialized, then all changes should upload to the server
   */
  initialized: boolean
  dataSources: DataSources
  currentPage: number

  locale?: string

  businessAreas: Record<string, IBusinessAreaUser>
  app: IIndicatorApp
}

export function selectIndicatorId(a: IndicatorState): string {
  //In this case this would be optional since primary key is id
  return a.id
}

export function sortByName(a: IndicatorState, b: IndicatorState): number {
  return a.code.localeCompare(b.code)
}

export const adapter: EntityAdapter<IndicatorState> = createEntityAdapter<IndicatorState>({
  selectId: selectIndicatorId,
  sortComparer: sortByName
})

export const initialState: IndicatorStoreState = adapter.getInitialState({
  initialized: false,
  dataSources: {},
  currentPage: 1,
  tag: IndicatorTagEnum.UNIT,
  businessAreas: {},
  app: null
})
const { selectAll } = adapter.getSelectors()

@Injectable()
export class IndicatorsStore extends ComponentStore<IndicatorStoreState> {
  readonly #iAppService = inject(IndicatorAppService)
  readonly #translate = inject(TranslateService)

  private pageSize = 10

  get dataSources() {
    return this.get((state) => state.dataSources)
  }

  get locale() {
    return this.get((state) => state.locale)
  }
  set locale(value) {
    this.patchState({ locale: value })
  }

  private refresh$ = new Subject<boolean>()

  // TODO distinctUntilChanged 需要找到原因
  public readonly all$: Observable<IndicatorState[]> = this.select(selectAll).pipe(distinctUntilChanged(isEqual))

  /**
  |--------------------------------------------------------------------------
  | Signals
  |--------------------------------------------------------------------------
  */
  readonly initialized = toSignal(this.select((state) => state.initialized))
  readonly appState = toSignal(this.select((state) => state.app))
  readonly appOptions = computed(() => this.appState()?.options)
  readonly timeGranularity = computed(() => this.appOptions()?.timeGranularity ?? TimeGranularity.Month)
  readonly lookback = computed(() => this.appOptions()?.lookback?.[this.timeGranularity()] ?? LookbackDefault[this.timeGranularity()])
  readonly tagType = computed(() => this.appOptions()?.tagType ?? IndicatorTagEnum.UNIT)
  readonly detailPeriods = computed(() => this.appOptions()?.detailPeriods)
  
  readonly currentIndicator = signal<string | null>(null)
  readonly favorites = toSignal(this.select((state) => state.app?.options?.favorites))
  readonly sortedIndicators$ = toSignal(combineLatest([this.all$, this.select((state) => state.app?.options ?? {})]).pipe(
    map(([indicators, { favorites, order }]) => {
      const favIndicators = (favorites ?? []).map((id) => {
        const indicator = indicators.find((item) => item.id === id)
        return indicator ? {
          ...indicator,
          favour: true,
        } : null
      }).filter(nonNullable)
      const subIndicators = indicators.filter((item) => !favorites?.includes(item.id))

      if (order) {
        return [
          ...sortBy(favIndicators, (obj) => indexOf(order, obj.id)),
          ...sortBy(subIndicators, (obj) => indexOf(order, obj.id))
        ]
      }

      return [...favIndicators, ...subIndicators]
    })
  ))

  readonly firstIndicator = computed(() => this.sortedIndicators$()[0] ?? null)

  readonly currentLang = toSignal(this.#translate.onLangChange.pipe(map((event) => event.lang), startWith(this.#translate.currentLang)))
  readonly isEmpty = toSignal(this.select((state) => !state.ids.length))
  readonly searchText = new BehaviorSubject('')
  readonly indicators$ = combineLatest([
    toObservable(this.sortedIndicators$),
    this.searchText.pipe(debounceTime(500), map((text) => text?.trim().toLowerCase()))
  ]).pipe(map(([indicators, text]) => {
    if (text) {
      return indicators.filter(
        (indicator) => includes(indicator.name.toLowerCase(), text) || includes(indicator.code.toLowerCase(), text)
      )
    }
    return indicators
  }))
  
  /**
  |--------------------------------------------------------------------------
  | Observables
  |--------------------------------------------------------------------------
  */
  readonly currentIndicator$ = combineLatest([toObservable(this.currentIndicator), this.all$]).pipe(
    map(([id, indicators]) => indicators.find((item) => item.id === id)),
    distinctUntilChanged()
  )

  /**
  |--------------------------------------------------------------------------
  | Subscribers (effects)
  |--------------------------------------------------------------------------
  */
  #appStateSub = this.select((state) => state.app?.options).pipe(
    distinctUntilChanged(isEqual),
    filter(() => this.initialized()),
    switchMap(() => this.#iAppService.upsert(this.appState()))
  ).subscribe()

  constructor(
    private modelsService: SemanticModelServerService,
    private indicatorService: IndicatorsService,
    private businessAreaService: BusinessAreasService,
    private ngmDSCore: NgmDSCoreService
  ) {
    super(adapter.setAll([], initialState) as IndicatorStoreState)
  }

  /**
   * Fetch detailed information of all required semantic models at once.
   */
  readonly fetchSemanticModel = this.effect((models$: Observable<string[]>) => {
    return models$.pipe(
      switchMap((ids) =>
        combineLatest(
          ids.map((id) =>
            this.modelsService
              .getById(id, {relations: ['dataSource', 'dataSource.type', 'indicators']})
              .pipe(map(convertNewSemanticModelResult))
          )
        )
      ),
      tap((storyModels: StoryModel[]) => {
        const dataSources = {}
        storyModels.forEach((storyModel) => {
          const dataSource = convertStoryModel2DataSource(storyModel)
          this.ngmDSCore.registerModel(dataSource)

          dataSources[storyModel.id] = {
            modelId: storyModel.id,
            name: dataSource.name,
            semanticModel: storyModel
          }
        })

        this.updateDataSources(dataSources)
      })
    )
  })

  readonly updateDataSources = this.updater((state, dataSources: DataSources) => {
    const updates = state.ids
      .map((id) => state.entities[id])
      .filter((indicator) => !indicator.dataSettings && dataSources[indicator.modelId])
      .map((indicator) => ({
        id: indicator.id,
        changes: {
          dataSettings: {
            dataSource: dataSources[indicator.modelId].name,
            entitySet: indicator.entity
          }
        }
      }))

    assign(state, adapter.updateMany(updates, state))
    state.dataSources = {
      ...state.dataSources,
      ...dataSources
    }
  })

  readonly setIndicators = this.updater((state, indicators: IndicatorState[]) => {
    assign(state, adapter.setAll(indicators, state))
  })

  readonly updateIndicators = this.updater((state, indicators: Array<Update<IndicatorState>>) => {
    assign(state, adapter.updateMany(indicators, state))
  })

  readonly fetchPage = this.updater((state, page: number) => {
    if (page > state.currentPage) {
      state.currentPage = page
    }
  })

  readonly updateIndicator = this.updater((state, update: Update<IndicatorState>) => {
    assign(state, adapter.updateOne(update, state))
  })

  readonly resetData = this.updater((state) => {
    state.ids.forEach((id) => {
      state.entities[id].initialized = false
    })
  })

  updateSearch(value: string) {
    this.searchText.next(value)
  }

  init() {
    this.setState(adapter.setAll([], initialState))
  }

  /**
   * Get all indicators that the current user has permission to view data for.
   */
  fetchAll() {
    combineLatest([
      this.#iAppService.getMy().pipe(map((apps) => apps[apps.length - 1])),
      this.indicatorService.getApp(['comments'])
    ]).subscribe(([indicatorApp, indicators]) => {
      this.patchState({
        app: indicatorApp
      })

      const items = indicators?.filter((item) => item.modelId && item.entity).map(convertIndicatorResult)

      // Fetch semantic models details
      const models = uniq(items.map((item) => item.modelId)).filter((id) => !!id && !this.dataSources[id])
      if (!isEmpty(models)) {
        this.fetchSemanticModel(models)
      }

      this.setIndicators(items as IndicatorState[])

      this.patchState({
        initialized: true
      })
    })
  }

  async getBusinessAreaUser(id: string) {
    const user = this.get((state) => state.businessAreas)[id]
    if (!user) {
      const user = await firstValueFrom(this.businessAreaService.getMeInBusinessArea(id))
      this.updater((state, user: IBusinessAreaUser) => {
        state.businessAreas[id] = user
      })(user)
    }

    return this.get((state) => state.businessAreas)[id]
  }

  selectIndicator(id: string) {
    return this.select((state) => state.entities[id])
  }

  addComment(comment: IComment) {
    const comments = this.get((state) => state.entities[comment.indicatorId]?.comments)
    this.updateIndicator({
      id: comment.indicatorId,
      changes: {
        comments: [...comments, comment]
      }
    })
  }

  removeComment(comment: IComment) {
    const comments = this.get((state) => state.entities[comment.indicatorId]?.comments)
    this.updateIndicator({
      id: comment.indicatorId,
      changes: {
        comments: comments.filter((item) => item.id !== comment.id)
      }
    })
  }

  onRefresh() {
    return this.refresh$.asObservable()
  }

  refresh(force = false) {
    this.refresh$.next(force)
  }

  /**
   * Update the order of the indicators
   */
  updateOrders = this.updater((state, indicators: string[]) => {
    const app = state.app ?? {}
    state.app = {
      ...app,
      options: {
        ...(app.options ?? {}),
        order: indicators
      }
    }
  })

  /**
   * Drag and drop to reorder and save to the server
   */
  order(event: CdkDragDrop<IndicatorState[]>) {
    const indicators = this.sortedIndicators$().map(({ id }) => id) as string[]
    moveItemInArray(indicators, event.previousIndex, event.currentIndex)
    this.updateOrders(indicators)
  }

  private addFavorite = this.updater((state, id: string) => {
    const options = this.getOrInitAppOptions(state)
    options.favorites ??= []
    if (!options.favorites?.includes(id)) {
      options.favorites.push(id)
    }
  })

  private removeFavorite = this.updater((state, id: string) => {
    const options = this.getOrInitAppOptions(state)
    options.favorites = options.favorites?.filter((_) => _ !== id) ?? []
  })

  createFavorite(indicator: IndicatorState) {
    this.addFavorite(indicator.id)
  }

  deleteFavorite(indicator: IndicatorState) {
    this.removeFavorite(indicator.id)
  }

  updateTimeGranularity = this.updater((state, timeGranularity: TimeGranularity) => {
    const options = this.getOrInitAppOptions(state)
    options.timeGranularity = timeGranularity
  })

  updateLookback = this.updater((state, lookback: number) => {
    const options = this.getOrInitAppOptions(state)
    options.lookback ??= { ...LookbackDefault }
    options.lookback[this.timeGranularity()] = lookback
  })

  toggleDetailPeriods = this.updater((state, name: string) => {
    const options = this.getOrInitAppOptions(state)
    options.detailPeriods = options.detailPeriods === name ? null : name
  })

  /**
   * Switch the tag type
   */
  readonly toggleTag = this.updater((state) => {
    const tagType = this.tagType()
    const options = this.getOrInitAppOptions(state)

    if (IndicatorTagEnum[tagType + 1]) {
      options.tagType = tagType + 1
    } else {
      options.tagType = IndicatorTagEnum[IndicatorTagEnum[0]] // Ensure to start from 0
    }
  })

  getOrInitAppOptions(state: IndicatorStoreState) {
    state.app ??= {}
    state.app.options ??= {}
    return state.app.options
  }
}
