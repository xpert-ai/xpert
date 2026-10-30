import { XpDialogFrameImports, ZardButtonComponent } from '@xpert-ai/headless-ui'
import { Component, inject } from '@angular/core'
import { Router } from '@angular/router'
import { I18nService } from '@cloud/app/@shared/i18n'
import { UsersService } from '@cloud/app/@core/state'
import { ThemesEnum } from '@xpert-ai/headless-ui'
import { TranslateModule } from '@ngx-translate/core'
import { injectHelpWebsite, injectToastr, LANGUAGES, Store } from '../../../@core'
import { AppService } from '../../../app.service'
import { DialogRef } from '@angular/cdk/dialog'
import { WebUpdateService } from '../../../@core/services/web-update/web-update.service'
import { environment } from '@cloud/environments/environment'

@Component({
  standalone: true,
  imports: [...XpDialogFrameImports, ZardButtonComponent, TranslateModule],
  selector: 'xp-header-about',
  templateUrl: './about.component.html'
})
export class HeaderAboutComponent {
  languages = LANGUAGES
  ThemesEnum = ThemesEnum
  Version = environment.version
  readonly webUpdate = inject(WebUpdateService)

  constructor() {
    void this.webUpdate.check()
  }

  readonly #dialogRef = inject(DialogRef)
  readonly store = inject(Store)
  readonly appService = inject(AppService)
  readonly userService = inject(UsersService)
  readonly router = inject(Router)
  readonly #i18n = inject(I18nService)
  readonly #toastr = injectToastr()
  readonly helpWebsite = injectHelpWebsite()

  close() {
    this.#dialogRef.close()
  }
}
