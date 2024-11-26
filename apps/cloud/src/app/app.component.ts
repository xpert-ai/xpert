import { Platform } from '@angular/cdk/platform'
import { DOCUMENT } from '@angular/common'
import { ChangeDetectionStrategy, Component, Inject, Renderer2, effect } from '@angular/core'
import { DateFnsAdapter, MAT_DATE_FNS_FORMATS } from '@angular/material-date-fns-adapter'
import { DateAdapter, MAT_DATE_FORMATS } from '@angular/material/core'
import { MatIconRegistry } from '@angular/material/icon'
import { DomSanitizer, Title } from '@angular/platform-browser'
import { nonBlank, nonNullable } from '@metad/core'
import { TranslateService } from '@ngx-translate/core'
import { NGXLogger } from 'ngx-logger'
import { filter, startWith } from 'rxjs/operators'
import {
  ICONS,
  LanguagesService,
  PACThemeService,
  Store,
  UpdateService,
  mapDateLocale,
  navigatorLanguage
} from './@core'
import { AppService } from './app.service'

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'pac-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  providers: [
    {
      provide: DateAdapter,
      useClass: DateFnsAdapter
    },
    { provide: MAT_DATE_FORMATS, useValue: MAT_DATE_FNS_FORMATS }
  ]
})
export class AppComponent {
  readonly isMobile$ = this.appService.isMobile

  constructor(
    private store: Store,
    public readonly appService: AppService,
    public readonly updateService: UpdateService,
    private readonly themeService: PACThemeService,
    private readonly languagesService: LanguagesService,
    private translate: TranslateService,
    private logger: NGXLogger,
    @Inject(DOCUMENT)
    private document: Document,
    private renderer: Renderer2,
    private matIconRegistry: MatIconRegistry,
    private domSanitizer: DomSanitizer,
    private platform: Platform,
    private title: Title,
    private _adapter: DateAdapter<any>
  ) {
    translate.setDefaultLang('en')
    // the lang to use, if the lang isn't available, it will use the current loader to get them
    translate.use(this.store.preferredLanguage || navigatorLanguage())
    this.document.documentElement.lang = translate.currentLang

    this.store.preferredLanguage$.pipe(filter(nonNullable), startWith(translate.currentLang)).subscribe((language) => {
      this.translate.use(language)
      this.document.documentElement.lang = language
      this._adapter.setLocale(mapDateLocale(language))
    })

    // this.translate.stream('PAC.Title').subscribe((title) => this.title.setTitle(title))

    ICONS.forEach((icon) => {
      this.matIconRegistry.addSvgIcon(icon.name, this.domSanitizer.bypassSecurityTrustResourceUrl(icon.resourceUrl))
    })

    effect(() => {
      const isMobile = this.isMobile$()
      // const { preferredTheme, primary } = this.appService.theme$()

      // const theme = `ngm-theme-${preferredTheme} ${primary} ${preferredTheme}`

      // for body's class
      const body = this.document.getElementsByTagName('body')[0]
      // const bodyThemeRemove = Array.from(body.classList).filter(
      //   (item: string) => item.includes('-theme') || item.startsWith('light') || item.startsWith('dark')
      // )
      // if (bodyThemeRemove.length) {
      //   body.classList.remove(...bodyThemeRemove)
      // }
      // theme
      //   .split(' ')
      //   .filter(nonBlank)
      //   .forEach((value) => {
      //     this.renderer.addClass(body, value)
      //   })

      // for mobile
      if (isMobile && (this.platform.IOS || this.platform.ANDROID)) {
        this.renderer.addClass(body, 'mobile')
      } else {
        body.classList.remove('mobile')
      }

      // for <meta name="theme-color" content="white" />
      // const themeColorMeta = document.querySelector('meta[name="theme-color"]')
      // if (themeColorMeta) {
      //   themeColorMeta.setAttribute('content', primary === 'dark' ? 'black' : '#f5f5f5')
      // }
    })

    effect(() => {
      const title = this.appService.title()
      if (title) {
        this.title.setTitle(title)
      }
    })
  }
}
