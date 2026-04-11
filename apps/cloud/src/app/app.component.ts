import { Platform } from '@angular/cdk/platform'
import { DOCUMENT } from '@angular/common'
import { ChangeDetectionStrategy, Component, Inject, Renderer2, effect } from '@angular/core'
import { Title } from '@angular/platform-browser'
import { AppService } from './app.service'

const LEGACY_THEME_CLASSES = ['default', 'light', 'dark', 'thin', 'system', 'dark-green']

@Component({
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'pac-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  providers: []
})
export class AppComponent {
  readonly isMobile$ = this.appService.isMobile

  constructor(
    public readonly appService: AppService,
    @Inject(DOCUMENT)
    private document: Document,
    private renderer: Renderer2,
    private platform: Platform,
    private title: Title,
  ) {
    effect(() => {
      const isMobile = this.isMobile$()
      const { primary } = this.appService.theme$()
      const root = this.document.documentElement

      root.dataset.theme = primary

      const rootThemeClasses = Array.from(root.classList).filter((item: string) => LEGACY_THEME_CLASSES.includes(item))
      if (rootThemeClasses.length) {
        root.classList.remove(...rootThemeClasses)
      }

      const body = this.document.getElementsByTagName('body')[0]
      const bodyThemeClasses = Array.from(body.classList).filter(
        (item: string) => item.startsWith('ngm-theme-') || LEGACY_THEME_CLASSES.includes(item)
      )

      if (bodyThemeClasses.length) {
        body.classList.remove(...bodyThemeClasses)
      }

      // for mobile
      if (isMobile && (this.platform.IOS || this.platform.ANDROID)) {
        this.renderer.addClass(body, 'mobile')
      } else {
        body.classList.remove('mobile')
      }
    })

    effect(() => {
      const title = this.appService.title()
      if (title) {
        this.title.setTitle(title)
      }
    })
  }
}
