import { Inject, Injectable, InjectionToken } from '@angular/core'
import { TimeGranularity } from '@metad/ocap-core'
import { ComponentStore } from '@metad/store'
import { combineLatest, Observable, Subject } from 'rxjs'
import { map, pairwise, shareReplay } from 'rxjs/operators'
import { Intent, QuerySettings } from '../models/index'

export const NX_THEME_DEFAULT = 'default'

export interface NxThemeOptions {
  name: string
}

export const NX_THEME_OPTIONS = new InjectionToken<NxThemeOptions>('Xpert Theme Options', {
  providedIn: 'root',
  factory: NX_THEME_OPTIONS_FACTORY
})

export function NX_THEME_OPTIONS_FACTORY() {
  return {
    name: NX_THEME_DEFAULT
  }
}

export interface NxCoreState {
  themeName: string
  today: Date
  timeGranularity: TimeGranularity
}

/**
 * @deprecated use NgmOcapCoreService instead
 */
@Injectable()
export class NxCoreService extends ComponentStore<NxCoreState> {

  // readonly ocapCoreService = inject(NgmOcapCoreService)

  private _intent$ = new Subject<Intent>()

  /**
   * Theme name for charts 
   */
  public readonly themeName$ = this.select((state) => state.themeName)
  private themeChanges$: Observable<any> = this.themeName$.pipe(
    pairwise(),
    map(([previous, current]) => ({
      previous,
      name: current
    })),
    shareReplay(1)
  )

  // public chartLibrary$ = new BehaviorSubject<{
  //   lib: NxChartLibrary
  //   registerTheme: (name, theme) => void
  // }>(null)

  public readonly store: ComponentStore<{ query?: QuerySettings }> = new ComponentStore({})

  readonly query$ = this.store.select((state) => state.query)

  readonly updateQuery = this.store.updater((state, query: QuerySettings) => ({ ...state, query }))

  // /**
  //  * 接收各组件创建修改计算字段的事件, 发给如 Story 组件进行实际更新
  //  * 暂时使用这种间接的方式
  //  */
  // public readonly storyUpdateEvent$ = new Subject<{
  //   type: 'Parameter' | 'Calculation'
  //   dataSettings: DataSettings
  //   parameter?: ParameterProperty
  //   property?: CalculationProperty
  // }>()

  public readonly timeGranularity$ = this.select((state) => state.timeGranularity)
  public readonly currentTime$ = combineLatest([this.select((state) => state.today), this.timeGranularity$]).pipe(
    map(([today, timeGranularity]) => ({ today, timeGranularity }))
  )
  constructor(
    @Inject(NX_THEME_OPTIONS) protected options: NxThemeOptions,
    // @Inject(NX_DATE_VARIABLES) protected dateVariables: DateVariable[]
  ) // @Optional() @Inject(NX_COLOR_CHROMATIC) private chromatics?: Array<ColorScheme>,
  // @Optional()
  // private _logger?: NGXLogger
  {
    super({ themeName: NX_THEME_DEFAULT, timeGranularity: TimeGranularity.Month } as NxCoreState)

    this.changeTheme(options?.name || NX_THEME_DEFAULT)
  }

  public sendIntent(intent: Intent) {
    this._intent$.next(intent)
  }

  public onIntent() {
    return this._intent$
  }

  /**
   * Change current application theme
   *
   * @param name 名称
   */
  changeTheme(name: string): void {
    this.patchState({ themeName: name })
  }

  /**
   * Triggered when current theme is changed
   */
  onThemeChange(): Observable<any> {
    return this.themeChanges$
  }

  getTheme() {
    return this.get((state) => state.themeName)
    // return this.theme$.getValue()
  }

  // /**
  //  * @deprecated use NgmOcapCoreService instead
  //  */
  // getDateVariables() {
  //   return this.ocapCoreService.getDateVariables()
  // }

  // execDateVariables(id: string): Date | [Date, Date] {
  //   const dateVariable = this.dateVariables.find((item) => item.id === id)
  //   if (!dateVariable) {
  //     try {
  //       return new Date(id)
  //     } catch (err) {
  //       throw new Error(`Can't found date variable or date '${id}'`)
  //     }
  //   }

  //   return dateVariable.useFactory(dateVariable.deps?.map((dep) => this.execDateVariables(dep)))
  // }
  
}
