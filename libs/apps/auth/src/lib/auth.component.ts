import { CommonModule, Location } from '@angular/common'
import { Component, computed, inject } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { Store } from '@xpert-ai/cloud/state'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { map, startWith } from 'rxjs/operators'
import { PacAuthService } from './services/auth.service'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { RouterModule } from '@angular/router'
import { ZardSelectImports } from '@xpert-ai/headless-ui'

@Component({
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    ...ZardSelectImports,
  ],
  selector: 'pac-auth',
  styleUrls: ['./auth.component.scss'],
  templateUrl: './auth.component.html',
  host: {
    class: 'pac-auth',
  }
})
export class PacAuthComponent {
  readonly #translate = inject(TranslateService)
  protected auth = inject(PacAuthService)
  protected store = inject(Store)
  protected location = inject(Location)

  readonly tenantSettings = toSignal(this.store.tenantSettings$)
  readonly language = toSignal(this.#translate.onLangChange.pipe(
    startWith(this.#translate.defaultLang),
    map(() => this.#translate.currentLang))
  )
  readonly title = computed(() => {
    const langTitle = `tenant_title_${this.language()}`
    return this.tenantSettings()?.[langTitle] || this.tenantSettings()?.tenant_title
  })

  token = ''

  // showcase of how to use the onAuthenticationChange method
  links = [
    {
      title: '帮助',
      href: ''
    },
    {
      title: '隐私',
      href: ''
    },
    {
      title: '条款',
      href: ''
    }
  ]

  back() {
    this.location.back()
    return false
  }

  onLanguage(value) {
    this.store.preferredLanguage = value
  }
}
