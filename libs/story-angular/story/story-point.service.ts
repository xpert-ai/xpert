import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop'
import { DestroyRef, Inject, Injectable, Optional, effect, inject } from '@angular/core'
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop'
import { MatSnackBar } from '@angular/material/snack-bar'
import { createSubStore, dirtyCheckWith, isNotEmpty, isNotEqual, write } from '@metad/core'
import { effectAction } from '@metad/ocap-angular/core'
import { ISlicer, isAdvancedFilter, isTimeRangesSlicer, nonNullable } from '@metad/ocap-core'
import {
  ID,
  LinkedAnalysisEvent,
  LinkedInteractionApplyTo,
  NX_STORY_FEED,
  NX_STORY_STORE,
  NxStoryFeedService,
  NxStoryService,
  NxStoryStore,
  StoryEventType,
  StoryPoint,
  StoryPointState,
  StoryPointType,
  StoryWidget,
  WIDGET_INIT_POSITION,
  uuid
} from '@metad/story/core'
import { FlexItemType, FlexLayout } from '@metad/story/responsive'
import { ISmartFilterBarOptions } from '@metad/story/widgets/filter-bar'
import { select, withProps } from '@ngneat/elf'
import { TranslateService } from '@ngx-translate/core'
import { GridsterConfig } from 'angular-gridster2'
import { assign, cloneDeep, compact, isEmpty, isEqual, isNil, merge, negate, omit, sortBy } from 'lodash-es'
import { NGXLogger } from 'ngx-logger'
import { EMPTY, Observable, combineLatest, firstValueFrom, of } from 'rxjs'
import {
  catchError,
  combineLatestWith,
  distinctUntilChanged,
  filter,
  map,
  switchMap,
  tap,
  withLatestFrom
} from 'rxjs/operators'

/**
 * 状态中 StoryPoint 与 Widgets 分开控制修改状态
 *
 */
@Injectable()
export class NxStoryPointService {
  readonly #storyService = inject(NxStoryService)
  readonly destroyRef = inject(DestroyRef)

  /**
  |--------------------------------------------------------------------------
  | Store
  |--------------------------------------------------------------------------
  */
  readonly store = createSubStore(
    this.#storyService.store,
    { name: 'story_point', arrayKey: 'key' },
    withProps<StoryPoint>(null)
  )
  readonly stateStore = createSubStore(
    this.#storyService.store,
    { name: 'story_point_state', arrayKey: 'key' },
    withProps<StoryPointState>(null)
  )
  readonly pristineStore = createSubStore(
    this.#storyService.pristineStore,
    { name: 'story_point_pristine', arrayKey: 'key' },
    withProps<StoryPoint>(null)
  )
  readonly dirtyCheckResult = dirtyCheckWith(this.store, this.pristineStore, {
    comparator: negate(isEqual)
    // comparator: debugDirtyCheckComparator
  })
  readonly dirty$ = toObservable(this.dirtyCheckResult.dirty)

  get storyPoint() {
    return this.store.getValue()
  }
  readonly storyPoint$ = this.store
  readonly widgets$ = this.select((state) => state.widgets)
  readonly widgets = toSignal(this.widgets$)

  /**
  |--------------------------------------------------------------------------
  | Observables
  |--------------------------------------------------------------------------
  */
  public readonly linkedAnalysis$ = this.select2((state) => state.linkedAnalysis)

  readonly active$ = this.select2((state) => state.active)
  readonly fetched$ = this.select2((state) => state.fetched)

  public readonly isEmpty$ = this.widgets$.pipe(
    combineLatestWith(this.fetched$),
    map(([widgets, fetched]) => fetched && isEmpty(widgets))
  )
  readonly gridOptions$ = this.select((state) => state.gridOptions)
  public readonly allowMultiLayer$ = this.gridOptions$.pipe(
    map((gridOptions) => gridOptions?.allowMultiLayer),
    distinctUntilChanged()
  )
  readonly styling$ = this.select((state) => state.styling)
  readonly scaleStyles$ = this.stateStore.pipe(
    select((state) => state?.scale),
    distinctUntilChanged(),
    map((scale) => {
      return scale
        ? {
            transform: `scale(${scale / 100})`,
            'transform-origin': 'left top'
          }
        : {}
    })
  )

  public filters$: Observable<Array<ISlicer>> = this.select((state) => state.filters).pipe(
    distinctUntilChanged((x, y) => JSON.stringify(x) === JSON.stringify(y))
  )

  readonly currentWidget$ = combineLatest([
    this.widgets$,
    this.stateStore.pipe(select((state) => state.currentWidgetKey))
  ]).pipe(select(([widgets, key]) => widgets?.find((item) => item.key === key)))

  readonly responsive$ = this.select((state) => state?.responsive)

  /**
  |--------------------------------------------------------------------------
  | Subscriptions (effect)
  |--------------------------------------------------------------------------
  */
  private currentWidgetSub = this.currentWidget$.pipe(takeUntilDestroyed()).subscribe((widget) => {
    this.#storyService.setCurrentWidget(widget)
  })

  // 监听故事的保存事件通知: 进行故事点和部件的保存
  private saveSub = this.#storyService.save$
    .pipe(
      withLatestFrom(this.dirty$),
      filter(([, dirty]) => dirty),
      takeUntilDestroyed()
    )
    .subscribe(() => {
      this.save()
    })
  constructor(
    @Inject(NX_STORY_STORE)
    private readonly storyStore: NxStoryStore,
    @Optional()
    @Inject(NX_STORY_FEED)
    private feedService?: NxStoryFeedService,
    @Optional() private _snackBar?: MatSnackBar,
    @Optional() protected logger?: NGXLogger,
    @Optional() private translateService?: TranslateService
  ) {
    effect(
      () => {
        this.stateStore.update((state) => {
          return {
            ...state,
            dirty: this.dirtyCheckResult.dirty()
          }
        })
      },
      { allowSignalWrites: true }
    )
  }

  readonly init = effectAction((key$: Observable<ID>) => {
    return key$.pipe(
      tap((key: ID) => {
        this.store.connect(['story', 'points', key])
        this.stateStore.connect(['points', key])
        this.pristineStore.connect(['story', 'points', key])
      }),
      switchMap((key: ID) => {
        return this.#storyService.selectPointEvent(key).pipe(
          tap((event) => {
            if (event.type === StoryEventType.CREATE_WIDGET) {
              this.createWidget(event.data)
            } else if (event.type === StoryEventType.PASTE_WIDGET) {
              this.pasteWidget(event.data)
            } else if (event.type === StoryEventType.SAVE) {
              this.save()
            } else if (event.type === StoryEventType.REMOVE_WIDGET) {
              this.removeWidget(event.data)
            }
          }),
          takeUntilDestroyed(this.destroyRef)
        )
      })
    )
  })

  async fetchStoryPoint() {
    const storyPoint = this.storyPoint
    const token = this.#storyService.store.query((state) => state.token)
    const point = await firstValueFrom(this.storyStore.getStoryPoint(storyPoint.storyId, storyPoint.id, { token }))
    this.initWidgets(point.widgets)

    this.stateStore.update((state) => ({
      ...state,
      fetched: true
    }))
  }

  async active(active: boolean) {
    this.stateStore.update((state) => ({ ...state, active }))
    const fetched = await firstValueFrom(this.fetched$)
    if (active && !fetched) {
      await this.fetchStoryPoint()
    }

    this._applyPastedWidgets()
  }

  save() {
    const pristinePoint = this.pristineStore.getValue()
    const currentPoint = this.store.getValue()

    this.patchState({ saving: true })

    this._save(pristinePoint, currentPoint).subscribe((result) => {
      this.patchState({ saving: false })
      this.pristineStore.update(() => cloneDeep(this.store.getValue()))
    })
  }

  patchState(state: Partial<StoryPointState>) {
    this.stateStore.update((s) => ({ ...s, ...state }))
  }

  updater<ProvidedType = void, OriginType = ProvidedType>(
    fn: (state: StoryPointState, ...params: OriginType[]) => StoryPointState | void
  ) {
    return (...params: OriginType[]) => {
      this.stateStore.update(write((state) => fn(state, ...params)))
    }
  }

  updater2<ProvidedType = void, OriginType = ProvidedType>(
    fn: (state: StoryPoint, ...params: OriginType[]) => StoryPoint | void
  ) {
    return (...params: OriginType[]) => {
      this.store.update(write((state) => fn(state, ...params)))
    }
  }

  select<R>(fn: (state: StoryPoint) => R) {
    return this.store.pipe(select(fn))
  }
  select2<R>(fn: (state: StoryPointState) => R) {
    return this.stateStore.pipe(select(fn))
  }

  initWidgets(widgets: Array<StoryWidget>) {
    // 对组件排序, 在移动端展示效果
    sortBy(widgets, 'index')
    this.store.update(
      write((state) => {
        state.widgets = widgets
      })
    )
    this.pristineStore.update(
      write((state) => {
        state.widgets = widgets
      })
    )
  }

  clearPastedWidgets() {
    this.stateStore.update((state) => ({
      ...state,
      pasteWidgets: []
    }))
  }

  private _applyPastedWidgets = this.updater2((state) => {
    const pasteWidgets = this.stateStore.getValue().pasteWidgets
    if (isNotEmpty(pasteWidgets) && this.stateStore.query((state) => state.fetched)) {
      state.widgets.push(
        ...pasteWidgets.map((item) => ({
          ...item,
          // Apply this point id and story id
          storyId: state.storyId,
          pointId: state.id
        }))
      )
      this.clearPastedWidgets()
    }
  })

  /**
   * 不同的组件发出相同维度的切片器如何覆盖 ？
   */
  readonly sendLinkedAnalysis = this.updater((state, event: LinkedAnalysisEvent) => {
    state.linkedAnalysis = state.linkedAnalysis ?? {}
    state.linkedAnalysis[event.originalWidget] = event
  })

  /**
   * Subscribe slicers from other widget by widget key
   *
   * @param widgetKey
   * @returns
   */
  selectLinkedAnalysis(widgetKey: string) {
    return this.linkedAnalysis$.pipe(
      filter(nonNullable),
      map((linkedAnalysis) => {
        const slicers = []
        const events = Object.values(linkedAnalysis).filter((event: any) => {
          return (
            !isEmpty(
              event.slicers?.filter((slicer) =>
                isTimeRangesSlicer(slicer) ||
                (isAdvancedFilter(slicer) ? !isEmpty(slicer?.children) : !isEmpty(slicer?.members))
              )
            ) &&
            (isNil(event.linkedWidgets)
              ? event.originalWidget !== widgetKey
              : !!event.linkedWidgets?.find((key) => key === widgetKey))
          )
        })
        for (let i = events.length - 1; i >= 0; i--) {
          const event = events[i] as any
          event.slicers.forEach((slicer) => {
            if (!slicers.find((item) => item.dimension?.dimension === slicer.dimension?.dimension)) {
              slicers.push(slicer)
            }
          })
        }

        return slicers
      }),
      takeUntilDestroyed(this.destroyRef)
    )
  }

  readonly updateGridOptions = this.updater2((state, options: GridsterConfig) => {
    state.gridOptions = assign({}, state.gridOptions, options)
  })

  readonly updatePoint = this.updater2((state, point: Partial<StoryPoint>) => {
    assign(state, point)
  })

  readonly setCurrentWidgetId = this.updater((state, key: ID) => {
    state.currentWidgetKey = key
  })
  readonly setCurrentFlexLayoutKey = this.updater((state, key: ID) => {
    state.currentFlexLayoutKey = key
  })

  // for widget actions
  /**
   * Create new widget
   */
  readonly createWidget = this.updater2((state, input: Partial<StoryWidget>) => {
    const states = this.stateStore.getValue()
    const key = input.key ?? uuid()
    const widget = {
      ...input,
      key,
      storyId: state.storyId,
      pointId: state.id,
    } as StoryWidget

    if (state.type === StoryPointType.Responsive) {
      if (states.currentFlexLayoutKey) {
        const flexLayout = findFlexLayout(state.responsive, states.currentFlexLayoutKey)
        flexLayout.children = flexLayout.children || []
        flexLayout.children.push({
          key: uuid(),
          type: FlexItemType.Widget,
          widgetKey: widget.key
        })
        state.widgets.push(widget)
      } else {
        throw new Error(`未选中区域`)
      }
    } else {
      widget.position = widget.position ?? {
        ...WIDGET_INIT_POSITION,
        x: 0,
        y: 0
      }
      if (state.gridOptions?.allowMultiLayer) {
        widget.position.layerIndex = state.widgets.length
      }
      state.widgets.push(widget)
    }

    // Add new widget to linked analysis which connect newly
    state.widgets.forEach((item) => {
      if (
        item.linkedAnalysis?.interactionApplyTo === LinkedInteractionApplyTo.OnlySelectedWidgets &&
        item.linkedAnalysis?.connectNewly
      ) {
        item.linkedAnalysis.linkedWidgets = item.linkedAnalysis.linkedWidgets || []
        item.linkedAnalysis.linkedWidgets.push(widget.key)
      }
    })
  })

  readonly setWidget = this.updater2((state, [index, widget]: [number, StoryWidget]) => {
    state.widgets[index] = widget
  })

  readonly updateWidget = this.updater2((state, widget: Partial<StoryWidget>) => {
    const index = state.widgets.findIndex((item) => item.key === widget.key)
    if (index >= 0) {
      state.widgets[index] = {
        ...state.widgets[index],
        ...widget
      }
    }
  })

  /**
   * @deprecated hardcode for AnalyticalCard component
   */
  readonly updateWidgetChartOptions = this.updater2((state, widget: Partial<StoryWidget>) => {
    const index = state.widgets.findIndex((item) => item.key === widget.key)
    if (index >= 0) {
      state.widgets[index] = {
        ...state.widgets[index],
        chartOptions: merge({}, (<any>state.widgets[index]).chartOptions, (<any>widget).chartOptions)
      } as StoryWidget
    }
  })

  readonly updateWidgetLayer = this.updater2((state, widget: Partial<StoryWidget>) => {
    const index = state.widgets.findIndex((item) => item.key === widget.key)
    if (index >= 0) {
      state.widgets[index].position = {
        ...state.widgets[index].position,
        ...widget.position
      }
    }
  })

  readonly removeWidget = this.updater2((state, key: ID) => {
    state.widgets = state.widgets.filter((item) => item.key !== key)
  })

  getTranslation(code: string, text: string, params?) {
    return this.translateService.instant(code, { Default: text, ...(params ?? {}) })
  }

  pasteWidget(widget: StoryWidget) {
    const current = this.store.getValue()
    widget.key = uuid()
    widget.storyId = current.storyId
    widget.pointId = current.id

    this.stateStore.update((state) => ({
      ...state,
      pasteWidgets: [...(state.pasteWidgets ?? []), widget]
    }))

    this._applyPastedWidgets()
  }

  readonly moveWidgetInArray = this.updater2((state, event: CdkDragDrop<string[]>) => {
    moveItemInArray(state.widgets, event.previousIndex, event.currentIndex)
    state.widgets.forEach((item, i) => (item.index = i))
  })

  /**
   * 保存故事点变化
   */
  private _save(pristine: StoryPoint, current: StoryPoint) {
    let update: Observable<StoryPoint>
    // New point
    if (!current.id) {
      update = this.storyStore.createStoryPoint(current).pipe(
        tap((result) => {
          this.updatePoint({ id: result.id })
          this.stateStore.update((state) => ({ ...state, id: result.id }))
        })
      )
    } else if (isNotEqual({ ...pristine, widgets: null }, { ...current, widgets: null })) {
      // update story point
      update = this.storyStore.updateStoryPoint(current).pipe(map(() => current))
    } else {
      update = of(null)
      // this.widgetsDirtyQuery.reset()
    }

    return update.pipe(
      tap((point) => {
        if (point) {
          const saveSuccess = this.getTranslation('Story.StoryPoint.SaveSuccess', 'Story page save success')
          this._snackBar.open(saveSuccess, '', {
            duration: 2000
          })
        }

        // this.widgetsDirtyQuery.reset()
      }),
      catchError((err, cah) => {
        const storyPointSaveFail = this.getTranslation('Story.StoryPoint.SaveFailed', 'Story page save failed')
        this._snackBar.open(storyPointSaveFail, err.status, {
          duration: 2000
        })
        return EMPTY
      }),
      switchMap(() => {
        return this._saveWidgets(pristine?.widgets, current.widgets)
      })
    )
  }

  /**
   * 保存部件变化
   *
   * @param pristine
   * @param current
   * @returns
   */
  private _saveWidgets(pristine: StoryWidget[], current: StoryWidget[]) {
    if (current) {
      // 删除 Widgets
      const removes = compact(
        pristine?.map((widget) => {
          const currentWidget = current.find((item) => item.key === widget.key)
          if (isNil(currentWidget)) {
            return this.storyStore.removeStoryWidget(widget.storyId, widget.pointId, widget.id).pipe(
              tap(() => {
                pristine = pristine.filter((item) => item.id !== widget.id)
              })
            )
          }
          return null
        })
      )

      // 更新/创建 Widgets
      const updates = compact(
        current.map((widget, index) => {
          const pristineWidget = pristine?.find((item) => item.key === widget.key)
          if (pristineWidget) {
            if (isNotEqual(widget, pristineWidget)) {
              // update widget
              const update = cloneDeep(widget)
              return this.storyStore.updateStoryWidget(update).pipe(
                catchError((err) => {
                  const widgetUpdateFail = this.getTranslation('Story.Widget.UpdateFailed', 'Widget update failed')
                  this._snackBar.open(widgetUpdateFail, err.status, {
                    duration: 2000
                  })
                  return EMPTY
                })
              )
            }
          } else {
            // create widget
            return this.storyStore
              .createStoryWidget({
                ...widget,
                pointId: this.storyPoint.id
              })
              .pipe(
                tap((result) => {
                  this.setWidget([index, result])
                })
              )
          }
          return null
        })
      )

      const requests = [...removes, ...updates]
      if (isNotEmpty(requests)) {
        return combineLatest(requests).pipe(
          tap(() => {
            const widgetSaveSuccess = this.getTranslation('Story.Widget.SaveSuccess', 'Widget save success')
            this._snackBar.open(widgetSaveSuccess, '', {
              duration: 2000
            })
          })
        )
      }
    }

    return of(true)
  }

  readonly toggleFullscreen = this.updater2((state, { key, fullscreen }: { key: ID; fullscreen: boolean }) => {
    const widget = state.widgets.find((item) => item.key === key)
    widget.fullscreen = fullscreen
    this.stateStore.update((state) => ({
      ...state,
      fullscreen
    }))
  })

  readonly removeFlexLayout = this.updater2((state, key: string) => {
    const flexLayout = removeFlexLayout(state.responsive, key)
    if (flexLayout?.widgetKey) {
      this.removeWidget(flexLayout.widgetKey)
    }
  })

  /**
   * 根据输入结构重构状态中的结构
   */
  readonly refactFlexLayout = this.updater2((state, flexLayout: FlexLayout) => {
    refactFlexLayout(state.responsive, flexLayout)
    // 清理不再被 Layout 引用到的 Widgets
    state.widgets = state.widgets.filter((item) => findFlexLayoutByWidgetKey(state.responsive, item.key))
  })

  /**
   * 只更新输入的本节点属性
   */
  readonly updateFlexLayout = this.updater2((state, flexLayout: Partial<FlexLayout>) => {
    const item = findFlexLayout(state.responsive, flexLayout.key)
    if (item) {
      assign(item, omit(flexLayout, ['template', 'templateContext']))
    }
  })

  readonly setFilterBarOptions = this.updater2((state, options: ISmartFilterBarOptions) => {
    state.filterBar.options = options
  })

  // get methods
  findFlexLayout(key: ID) {
    return this.store.query((state) => findFlexLayout(state.responsive, key))
  }

  findWidget(key: ID) {
    return this.store.query((state) => state.widgets?.find((item) => item.key === key))
  }
}

function removeFlexLayout(flexLayout: FlexLayout, key: ID) {
  const index = flexLayout.children?.findIndex((item) => item.key === key)
  if (index > -1) {
    return flexLayout.children.splice(index, 1)[0]
  } else {
    return flexLayout.children?.find((item) => {
      return removeFlexLayout(item, key)
    })
  }
}

function findFlexLayout(flexLayout: FlexLayout, key: ID): FlexLayout {
  if (flexLayout?.key === key) {
    return flexLayout
  } else {
    return flexLayout?.children?.reduce(
      (accumulator, currentValue) => (accumulator ? accumulator : findFlexLayout(currentValue, key)),
      null
    )
  }
}

function findFlexLayoutByWidgetKey(flexLayout: FlexLayout, widgetKey: ID): FlexLayout {
  if (flexLayout?.widgetKey === widgetKey) {
    return flexLayout
  } else {
    return flexLayout?.children?.reduce(
      (accumulator, currentValue) => (accumulator ? accumulator : findFlexLayoutByWidgetKey(currentValue, widgetKey)),
      null
    )
  }
}

function refactFlexLayout(source: FlexLayout, target: FlexLayout) {
  const item = findFlexLayout(source, target.key) || omit(target, ['template', 'templateContext'])
  item.children = target.children?.map((child) => refactFlexLayout(source, child))
  return item
}
