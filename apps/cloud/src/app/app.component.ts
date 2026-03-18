import { Platform } from '@angular/cdk/platform'
import { DOCUMENT } from '@angular/common'
import { ChangeDetectionStrategy, Component, Inject, Renderer2, effect } from '@angular/core'
import { Title } from '@angular/platform-browser'
import { AppService } from './app.service'
import { ThemesEnum } from '@metad/ocap-angular/core'

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
      const { preferredTheme, primary } = this.appService.theme$()
      const theme = `ngm-theme-${preferredTheme} ${primary} ${preferredTheme}`

      // for body's class
      const body = this.document.getElementsByTagName('body')[0]
      const bodyThemeClasses = Array.from(body.classList).filter(
        (item: string) => item.includes('-theme') || item in ThemesEnum
      )

      if (bodyThemeClasses.length) {
        body.classList.remove(...bodyThemeClasses)
      }
      theme
        .split(' ')
        .filter(Boolean)
        .forEach((value) => {
          this.renderer.addClass(body, value)
        })

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
