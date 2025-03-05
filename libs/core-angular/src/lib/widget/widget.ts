import { FocusOrigin, FocusableOption } from '@angular/cdk/a11y'
import { AfterViewInit, DestroyRef, Directive, EventEmitter, HostBinding, Input, Output, OutputEmitterRef, computed, inject, output, signal } from '@angular/core'
import { DisplayDensity, NgmAppearance } from '@metad/ocap-angular/core'
import {
  DataSettings,
  Dimension,
  EntityType,
  IAdvancedFilter,
  IFilter,
  ISlicer,
  OrderBy,
  PresentationVariant,
  SelectionVariant,
  getPropertyName,
} from '@metad/ocap-core'
import { ComponentStore } from '@metad/store'
import { TranslateService } from '@ngx-translate/core'
import { cloneDeep, isEmpty, isEqual, isNil } from 'lodash-es'
import {
  BehaviorSubject,
  Observable,
  combineLatest,
  combineLatestWith,
  distinctUntilChanged,
  filter,
  map,
  merge,
  of,
  withLatestFrom
} from 'rxjs'
import { createEventEmitter, isNotEmpty, nonNullable } from '../helpers'
import { IFilterChange } from '../models/index'
import { WidgetMenu, WidgetMenuType, WidgetService } from './widget.service'
import { NxCoreService } from '../services'
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop'
import { coerceBooleanProperty } from '@angular/cdk/coercion'
import { replaceParameters } from './types'

export const DEFAULT_DIGITS_INFO = '1.0-1'

export interface WidgetData {
  data: Array<any>
  entityType: EntityType
  schema: {
    rows: Array<Dimension>
    columns: Array<Dimension>
  }
}

/**
 * 所有可使用在 Story 组件里的 Widget 必须实现此接口类型
 */
export interface IStoryWidget<T> extends IFilterChange, FocusableOption {
  /**
   * (内部生成)组件的唯一 ID
   */
  key?: string
  /**
   * 数据源配置
   */
  dataSettings?: DataSettings
  /**
   * 组件选项配置
   */
  options: T
  /**
   * 国家语言代码
   */
  locale?: string
  /**
   * 组件配置内部改变事件
   */
  optionsChange?: EventEmitter<T> | Observable<T>
  dataSettingsChange?: EventEmitter<DataSettings> | Observable<DataSettings>

  slicers?: ISlicer[]
  slicersChange: OutputEmitterRef<ISlicer[]>

  linkSlicersChange: OutputEmitterRef<ISlicer[]>

  /**
   * 是否可编辑状态
   */
  editable: boolean

  /**
   * 组件配置内部数据改变事件
   */
  dataChange?: EventEmitter<WidgetData>
}

export interface StoryWidgetState<T> {
  title: string
  dataSettings: DataSettings
  options: T
  selectionVariant: SelectionVariant
  presentationVariant: PresentationVariant
  slicers: ISlicer[]
  // styling: S
  rank?: number
}

export interface StoryWidgetStyling {
  appearance: NgmAppearance
  [key: string]: unknown
}

/**
 * Story 组件的公共父类
 *
 * * T: Options type
 * * S: State type
 *
 * `dataSettings` 和 `options` 属性需要将变化发出 (为了返回给 Widget 进行存储, 即实现在 Widget 组件本身也能修改属性值并进行保存)
 *
 */
@Directive()
export class AbstractStoryWidget<T, S extends StoryWidgetState<T> = StoryWidgetState<T>, SY extends StoryWidgetStyling = StoryWidgetStyling>
  extends ComponentStore<S>
  implements IStoryWidget<T>, FocusableOption, AfterViewInit
{
  protected readonly translateService? = inject(TranslateService, {optional: true})
  protected readonly widgetService? = inject(WidgetService, {optional: true, skipSelf: true})
  protected readonly coreService = inject(NxCoreService)
  protected readonly destroyRef = inject(DestroyRef)

  @Input() key: string
  /**
   * Title
   */
  @Input() get title(): string {
    return this._titled()
  }
  set title(value: string) {
    this._title.set(value)
  }
  private readonly _title = signal<string>(null)
  private readonly _titled = computed(() => replaceParameters(this._title(), this.entityType()))

  /**
   * Data Settings
   */
  @Input() get dataSettings(): DataSettings {
    return this.get((state) => state.dataSettings)
  }
  set dataSettings(value) {
    this.patchState({
      dataSettings: value,
      selectionVariant: value?.selectionVariant,
      presentationVariant: value?.presentationVariant
    } as S)
  }
  public _dataSettings$ = this.select((state) => state.dataSettings)
  public readonly dataSettingsSignal = toSignal<DataSettings>(this._dataSettings$)

  /**
   * Component Options
   */
  @Input() get options(): T {
    return this.get((state) => state.options)
  }
  set options(value) {
    this._options$.next(cloneDeep(value))
  }
  private _options$ = new BehaviorSubject(null)
  /**
   * @deprecated use optionsSignal
   */
  public options$ = this.select((state) => state.options).pipe(filter(nonNullable))
  public readonly optionsSignal = toSignal<T>(this.options$, {initialValue: null})

  @Input() get styling(): SY {
    return this.styling$()
  }
  set styling(value) {
    this.styling$.set(value)
  }
  readonly styling$ = signal<SY>(null)

  /**
   * Language Locale
   */
  @Input() get locale(): string {
    return this.locale$.value
  }
  set locale(value) {
    this.locale$.next(value)
  }
  protected locale$ = new BehaviorSubject<string>(null)

  /**
   * @deprecated use editableSignal
   * 
   * Editable
   */
  @HostBinding('class.editable')
  @Input()
  public get editable(): boolean {
    return this.editableSignal()
  }
  set editable(value: string | boolean) {
    this.editableSignal.set(coerceBooleanProperty(value))
  }
  public readonly editableSignal = signal(false)
  public readonly editable$ = toObservable(this.editableSignal)

  /**
   * Selected Members Filters
   */
  @Input() get slicers(): ISlicer[] {
    return this.slicers$.value
  }
  set slicers(value) {
    this.slicers$.next(value)
  }
  public readonly slicers$ = new BehaviorSubject([])

  @Input() get pin(): boolean {
    return this._pin()
  }
  set pin(value: string | boolean) {
    this._pin.set(coerceBooleanProperty(value))
  }
  protected readonly _pin = signal(false)
  protected readonly pin$ = toObservable(this._pin)

  /**
   * @deprecated use linkSlicersChange
   */
  // @Output() slicersChange = new EventEmitter<Array<ISlicer | IAdvancedFilter>>()
  @Output() optionsChange = createEventEmitter(
    this.options$.pipe(
      withLatestFrom(this._options$),
      filter(([otions, _options]) => !isEqual(otions, _options)),
      map(([otions]) => otions)
    )
  )
  @Output() dataSettingsChange = createEventEmitter(this._dataSettings$)
  readonly explain = output<any[]>()
  readonly slicersChange = output<(ISlicer | IAdvancedFilter)[]>()
  readonly linkSlicersChange = output<(ISlicer | IAdvancedFilter)[]>()

  dataChange?: EventEmitter<WidgetData>
  filterChange?: EventEmitter<IFilter[]>

  disabled?: boolean

  public readonly entityType = signal<EntityType>(null)

  /**
   * @deprecated 为什么在这里定义 loading 状态管理 ？
   */
  public readonly isLoading$ = new BehaviorSubject<boolean>(false)

  // State Query
  public readonly _selectionVariant$ = this.select((state) => state.selectionVariant)
  public readonly presentationVariant$ = combineLatest([
    this.select((state) => state.presentationVariant),
    this.select((state) => state.rank)
  ]).pipe(
    map(([presentationVariant, rank]) => {
      if (isNil(presentationVariant) && isNil(rank)) {
        /**
         * @todo 因为 ocap core 里有 bug， 会忽略 nil 的值， 不能对旧值覆盖， 所以得用 empty object
         */
        return {}
      }

      presentationVariant = {
        ...(presentationVariant ?? {}),
        maxItems: rank ?? presentationVariant.maxItems
      }
      return presentationVariant
    })
  )

  public readonly selectOptions$ = merge(
    this.select((state) => state.slicers),
    combineLatest([
      this._selectionVariant$.pipe(
        map((selectionVariant: SelectionVariant) => selectionVariant?.selectOptions as unknown as ISlicer[])
      ),
      this.slicers$
    ]).pipe(
      combineLatestWith(this.pin$),
      filter(([, pin]) => !pin),
      map(([[selectOptions, slicers]]) => {
        const results = [...(slicers ?? [])]
        selectOptions?.forEach((options) => {
          if (!results.find((item) => getPropertyName(item?.dimension) === getPropertyName(options.dimension))) {
            results.push(options)
          }
        })
        return results
      })
    )
  ).pipe(
    distinctUntilChanged(isEqual),
  )

  public readonly hasSlicers$ = this.selectOptions$.pipe(map((selectOptions) => !isEmpty(selectOptions)))

  public readonly selectionVariant$ = combineLatest([this._selectionVariant$, this.selectOptions$]).pipe(
    map(([selectionVariant, selectOptions]) => ({ ...(selectionVariant ?? {}), selectOptions }))
  )

  public readonly dataSettings$ = combineLatest([
    this._dataSettings$,
    this._selectionVariant$,
    this.presentationVariant$
  ]).pipe(
    map(([dataSettings, selectionVariant, presentationVariant]) => {
      return {
        ...(dataSettings ?? {}),
        selectionVariant,
        presentationVariant
      } as DataSettings
    })
  )

  public readonly menuClick$ = this.widgetService?.onMenuClick()

  // State updaters
  readonly setSelectOptions = this.updater((state, slicers: ISlicer[]) => {
    if (slicers) {
      state.slicers = [...slicers]
      this.slicersChange.emit(state.slicers)
    }
  })

  readonly orderBy = this.updater((state, orderBy: OrderBy) => {
    state.presentationVariant = state.presentationVariant ?? {}
    state.presentationVariant.sortOrder = state.presentationVariant.sortOrder ?? []
    const index = state.presentationVariant.sortOrder.findIndex((item) => item.by === orderBy.by)
    if (index > -1) {
      if (orderBy.order) {
        state.presentationVariant.sortOrder[index].order = orderBy.order
      } else {
        state.presentationVariant.sortOrder.splice(index, 1)
      }
    } else if (orderBy.order) {
      state.presentationVariant.sortOrder.push(orderBy)
    }
  })

  readonly rank = this.updater((state, rank: number) => {
    state.rank = rank
  })

  readonly updateOptions = this.updater((state, options: Partial<T>) => {
    state.options = {
      ...state.options,
      ...options
    }
  })

  /**
  |--------------------------------------------------------------------------
  | Subscriptions (effect)
  |--------------------------------------------------------------------------
  */
  private refreshSub = this.widgetService?.onRefresh().subscribe((force) => this.refresh(force))

  constructor() {
    super({} as S)

    this._options$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((options) => this.patchState({ options } as S))

    this.widgetService?.onMenuClick().subscribe((menu) => {
      if (menu.key === 'refresh') {
        this.refresh(true)
      } else if (menu.action === 'rank') {
        this.rank(menu.selected ? (menu.value as number) : null)
      }
    })
  }

  ngAfterViewInit(): void {
    this.selectMenus()
      .pipe(
        combineLatestWith(this.dataSettings$, this.presentationVariant$),
        map(([menus, dataSettings, presentationVariant]) => {
          const WIDGET = this.getTranslation('NgCore.Widget')
          const rank = presentationVariant?.maxItems
          if (
            dataSettings?.dataSource &&
            dataSettings?.entitySet &&
            (isNotEmpty(dataSettings?.chartAnnotation?.dimensions) || isNotEmpty(dataSettings?.analytics?.rows))
          ) {
            menus = [
              {
                key: 'rank',
                icon: 'military_tech',
                name: WIDGET?.Rank ?? 'Rank',
                type: WidgetMenuType.Menus,
                menus: [5, 10, 20, 50].map((value) => ({
                  key: `rank_${value}`,
                  icon: 'done',
                  name: `${WIDGET?.Top ?? 'Top'} ${value}`,
                  action: 'rank',
                  type: WidgetMenuType.Toggle,
                  selected: value === rank,
                  value
                }))
              },
              ...menus
            ]
          }
          return [...menus]
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((widgetMenus) => {
        this.widgetService?.setMenus(widgetMenus)
      })
  }

  focus(origin?: FocusOrigin): void {
    //
  }

  getLabel?(): string {
    return this.key
  }

  /**
   * 子类对 Refresh 逻辑进行增强
   *
   * @returns
   */
  refresh(force = false) {
    //
  }

  /**
   * 子类对 Menus 菜单的增强
   *
   * @returns
   */
  selectMenus(): Observable<WidgetMenu[]> {
    return of([])
  }

  translate(key: string) {
    return this.translateService?.stream(key).pipe(takeUntilDestroyed(this.destroyRef)) ?? of(null)
  }

  getTranslation(code: string, text?: any, params?: any) {
    return this.translateService?.instant(code, { Default: text, ...(params ?? {}) })
  }

  setExplains(items: unknown[]) {
    this.widgetService?.explains.set(items)
    this.explain.emit(items)
  }

  @HostBinding('class.ngm-density__comfortable')
  get densityCosy(): boolean {
    return this.styling?.appearance?.displayDensity === DisplayDensity.comfortable
  }

  @HostBinding('class.ngm-density__compact')
  get densityCompact(): boolean {
    return this.styling?.appearance?.displayDensity === DisplayDensity.compact
  }

  @HostBinding('class.ngm-density__cosy')
  get densityComfortable(): boolean {
    return this.styling?.appearance?.displayDensity === DisplayDensity.cosy
  }
}
