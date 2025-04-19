import { BreakpointObserver, Breakpoints, BreakpointState } from '@angular/cdk/layout'
import { DOCUMENT } from '@angular/common'
import { computed, inject, Injectable, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { DateAdapter } from '@angular/material/core'
import { prefersColorScheme, ThemesEnum } from '@metad/ocap-angular/core'
import { nonNullable } from '@metad/ocap-core'
import { ComponentStore } from '@metad/store'
import { TranslateService } from '@ngx-translate/core'
import { includes, some } from 'lodash-es'
import { combineLatest } from 'rxjs'
import { filter, map, shareReplay, startWith } from 'rxjs/operators'
import { LanguagesEnum, mapDateLocale, MenuCatalog, navigatorLanguage, Store } from './@core'
import { I18nService } from './@shared/i18n'

export interface PACAppState {
  insight: boolean
  navigation: {
    catalog?: MenuCatalog
    id?: string | boolean
    label?: string
    icon?: string
  }
  dark: boolean
  zIndexs: number[]
}

@Injectable({
  providedIn: 'root'
})
export class AppService extends ComponentStore<PACAppState> {
  readonly translate = inject(TranslateService)
  readonly #i18n = inject(I18nService)
  readonly #document = inject(DOCUMENT)

  readonly tenantSettings = toSignal(this.store.tenantSettings$)
  readonly lang = toSignal<LanguagesEnum>(
    this.translate.onLangChange.pipe(
      map((event) => event.lang as LanguagesEnum),
      startWith(this.translate.currentLang as LanguagesEnum)
    )
  )
  readonly title = computed(() => {
    const lang = this.lang()
    return (
      this.tenantSettings() && (this.tenantSettings()['tenant_title_' + lang] || this.tenantSettings()['tenant_title'])
    )
  })
  /**
   * @deprecated use signal {@link isAuthenticated} instead
   */
  public isAuthenticated$ = this.store.user$.pipe(map((user) => !!user))
  public isAuthenticated = toSignal(this.store.user$.pipe(map((user) => !!user)))
  public readonly fullscreenIndex$ = this.select((state) => state.zIndexs[state.zIndexs.length - 1])
  public insight$ = this.select((state) => state.insight)
  public catalog$ = this.select((state) => state.navigation?.catalog)
  public navigation$ = this.select((state) => state.navigation)

  readonly mediaMatcher$ = combineLatest(
    Object.keys(Breakpoints).map((name) => {
      return this.breakpointObserver
        .observe([Breakpoints[name]])
        .pipe(map((state: BreakpointState) => [name, state.matches]))
    })
  ).pipe(map((breakpoints) => breakpoints.filter((item) => item[1]).map((item) => item[0])))

  /**
   * @deprecated use signal {@link isMobile} instead
   */
  public readonly isMobile$ = this.mediaMatcher$.pipe(
    map((values) => some(['XSmall', 'Small', 'HandsetPortrait'], (el) => includes(values, el))),
    shareReplay(1)
  )
  readonly isMobile = toSignal(
    this.mediaMatcher$.pipe(map((values) => some(['XSmall', 'Small', 'HandsetPortrait'], (el) => includes(values, el))))
  )

  public readonly isDark$ = this.select((state) => state.dark)

  public readonly copilotEnabled$ = this.store.featureOrganizations$.pipe(
    map(() => this.store.hasFeatureEnabled('FEATURE_COPILOT' as any))
  )

  readonly preferredTheme$ = toSignal(this.store.preferredTheme$)
  readonly systemColorScheme$ = toSignal(prefersColorScheme())

  readonly theme$ = computed(() => {
    let preferredTheme = this.preferredTheme$()
    const systemColorScheme = this.systemColorScheme$()
    if (preferredTheme === ThemesEnum.system || !preferredTheme) {
      preferredTheme = systemColorScheme
    }

    const [primary, color] = preferredTheme.split('-')

    return {
      preferredTheme,
      primary,
      color
    }
  })

  // In a data project
  readonly inProject = signal(false)
  // In a xpert workspace
  readonly inWorkspace = signal(false)

  // Obserables
  readonly preferredLanguage$ = this.#i18n.preferredLanguage$

  constructor(
    private store: Store,
    private breakpointObserver: BreakpointObserver,
    private _adapter: DateAdapter<any>
  ) {
    super({ navigation: {}, zIndexs: [] } as PACAppState)

    this.translate.setDefaultLang('en')
    // the lang to use, if the lang isn't available, it will use the current loader to get them
    this.translate.use(this.store.preferredLanguage || navigatorLanguage())

    this.#document.documentElement.lang = this.translate.currentLang

    this.store.preferredLanguage$
      .pipe(filter(nonNullable), startWith(this.translate.currentLang))
      .subscribe((language) => {
        this.translate.use(language)
        this.#document.documentElement.lang = language
        this._adapter.setLocale(mapDateLocale(language))
      })
  }

  public toggleInsight = this.updater((state) => {
    state.insight = !state.insight
  })

  public setCatalog = this.updater((state, { catalog, id, label, icon }: PACAppState['navigation']) => {
    state.navigation.catalog = catalog
    state.navigation.id = id
    state.navigation.label = label
    state.navigation.icon = icon

    if (!id) {
      state.navigation.id = null
      state.navigation.label = null
    }
  })

  public setNavigation = this.updater((state, navigation: PACAppState['navigation']) => {
    state.navigation = navigation
  })

  public setDark = this.updater((state, dark: boolean) => {
    state.dark = dark
  })

  public toggleDark = this.updater((state) => {
    state.dark = !state.dark
  })

  public requestFullscreen = this.updater((state, zIndex: number) => {
    if (state.zIndexs[state.zIndexs.length - 1] >= zIndex) {
      state.zIndexs.pop()
    }
    state.zIndexs.push(zIndex)

    // if (screenfull.isEnabled) {
    //   screenfull.request();
    // }
  })

  public exitFullscreen = this.updater((state, zIndex: number) => {
    const index = state.zIndexs.findIndex((item) => item >= zIndex)
    if (index > -1) {
      state.zIndexs.splice(index)
    }

    // if (screenfull.isEnabled) {
    //   screenfull.exit()
    // }
  })
}
