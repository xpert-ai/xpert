import { Inject, Injectable, InjectionToken } from '@angular/core'
import { ComponentStore } from '@xpert-ai/store'
import { Observable } from 'rxjs'
import { map, pairwise, shareReplay } from 'rxjs/operators'

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
}

@Injectable()
export class NxCoreService extends ComponentStore<NxCoreState> {
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

  constructor(
    @Inject(NX_THEME_OPTIONS) protected options: NxThemeOptions
    // @Inject(NX_DATE_VARIABLES) protected dateVariables: DateVariable[]
  ) {
    // @Optional() @Inject(NX_COLOR_CHROMATIC) private chromatics?: Array<ColorScheme>,
    // @Optional()
    // private _logger?: NGXLogger
    super({ themeName: NX_THEME_DEFAULT })

    this.changeTheme(options?.name || NX_THEME_DEFAULT)
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
