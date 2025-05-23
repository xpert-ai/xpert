import { CommonModule } from '@angular/common'
import { Component, inject } from '@angular/core'
import { Router } from '@angular/router'
import { I18nService } from '@cloud/app/@shared/i18n'
import { UsersService } from '@metad/cloud/state'
import { OverlayAnimation1 } from '@metad/core'
import { ThemesEnum } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { injectHelpWebsite, injectToastr, LANGUAGES, Store } from '../../../@core'
import { AppService } from '../../../app.service'
import { DialogRef } from '@angular/cdk/dialog'
import { environment } from '@cloud/environments/environment'

@Component({
  standalone: true,
  imports: [CommonModule, TranslateModule],
  selector: 'pac-header-about',
  templateUrl: './about.component.html',
  styleUrl: 'about.component.scss',
  animations: [OverlayAnimation1]
})
export class HeaderAboutComponent {
  languages = LANGUAGES
  ThemesEnum = ThemesEnum
  Version = environment.version

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
