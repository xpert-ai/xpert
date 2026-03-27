import { DOCUMENT } from '@angular/common'
import { TestBed } from '@angular/core/testing'
import { BehaviorSubject, of, Subject } from 'rxjs'
import { BreakpointObserver } from '@angular/cdk/layout'
import { TranslateService } from '@ngx-translate/core'
import { ThemesEnum, normalizeTheme } from '@metad/ocap-angular/core'
import { Store } from '@metad/cloud/state'
import { AppService } from './app.service'
import { I18nService } from './@shared/i18n'

class MockStore {
  private preferredThemeSubject = new BehaviorSubject<ThemesEnum>(ThemesEnum.default)
  readonly preferredTheme$ = this.preferredThemeSubject.asObservable()

  private preferredLanguageSubject = new BehaviorSubject<string | null>(null)
  readonly preferredLanguage$ = this.preferredLanguageSubject.asObservable()

  readonly user$ = of(null)
  readonly featureOrganizations$ = of([])
  readonly tenantSettings$ = of(null)

  get preferredTheme() {
    return this.preferredThemeSubject.value
  }

  set preferredTheme(preferredTheme: ThemesEnum) {
    this.preferredThemeSubject.next(normalizeTheme(preferredTheme))
  }

  get preferredLanguage() {
    return this.preferredLanguageSubject.value
  }

  set preferredLanguage(language: string | null) {
    this.preferredLanguageSubject.next(language)
  }

  hasFeatureEnabled() {
    return false
  }
}

class MockTranslateService {
  currentLang = 'en'
  readonly onLangChange = new Subject<{ lang: string }>()

  setDefaultLang(lang: string) {
    this.currentLang = lang
  }

  use(lang: string) {
    this.currentLang = lang
    return of(lang)
  }
}

class MatchMediaController {
  private matches = false
  private listeners = new Set<(event: { matches: boolean }) => void>()

  install(initialMatches = false) {
    this.matches = initialMatches
    const controller = this

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: jest.fn().mockImplementation(() => ({
        get matches() {
          return controller.matches
        },
        media: '(prefers-color-scheme: dark)',
        onchange: null,
        addEventListener: (_event: string, listener: (event: { matches: boolean }) => void) => {
          this.listeners.add(listener)
        },
        removeEventListener: (_event: string, listener: (event: { matches: boolean }) => void) => {
          this.listeners.delete(listener)
        }
      }))
    })
  }

  setDark(matches: boolean) {
    this.matches = matches
    for (const listener of this.listeners) {
      listener({ matches })
    }
  }
}

describe('AppService', () => {
  let service: AppService
  let store: MockStore
  let matchMediaController: MatchMediaController

  const setup = (initialDark = false) => {
    TestBed.resetTestingModule()

    matchMediaController = new MatchMediaController()
    matchMediaController.install(initialDark)

    TestBed.configureTestingModule({
      providers: [
        AppService,
        { provide: DOCUMENT, useValue: document },
        { provide: Store, useClass: MockStore },
        { provide: I18nService, useValue: { preferredLanguage$: of('en') } },
        { provide: TranslateService, useClass: MockTranslateService },
        {
          provide: BreakpointObserver,
          useValue: {
            observe: jest.fn().mockReturnValue(of({ matches: false }))
          }
        }
      ]
    })

    store = TestBed.inject(Store) as unknown as MockStore
    service = TestBed.inject(AppService)
  }

  it('follows system theme when preferred theme is default', () => {
    setup(true)

    expect(service.theme$().preferredTheme).toBe(ThemesEnum.default)
    expect(service.theme$().primary).toBe(ThemesEnum.dark)

    matchMediaController.setDark(false)

    expect(service.theme$().primary).toBe(ThemesEnum.light)
    expect(store.preferredTheme).toBe(ThemesEnum.default)
  })

  it('keeps explicit theme selection when system theme changes', () => {
    setup()

    store.preferredTheme = ThemesEnum.light
    expect(service.theme$().primary).toBe(ThemesEnum.light)

    matchMediaController.setDark(true)
    expect(service.theme$().primary).toBe(ThemesEnum.light)

    store.preferredTheme = ThemesEnum.dark
    expect(service.theme$().primary).toBe(ThemesEnum.dark)

    matchMediaController.setDark(false)
    expect(service.theme$().primary).toBe(ThemesEnum.dark)
  })
})
