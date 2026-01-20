import { CommonModule } from '@angular/common'
import { Component, effect, inject } from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { attrModel } from '@metad/core'
import { TranslateModule } from '@ngx-translate/core'
import { of, switchMap } from 'rxjs'
import { XpertStudioApiService } from '../../domain'
import { linkedXpertFeaturesModel } from '../types'
import { TSandboxProvider } from '@cloud/app/@core'

@Component({
  selector: 'xpert-studio-features-sandbox',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  templateUrl: './sandbox.component.html',
  styleUrl: './sandbox.component.scss'
})
export class XpertStudioFeaturesSandboxComponent {
  readonly apiService = inject(XpertStudioApiService)

  readonly features = linkedXpertFeaturesModel(this.apiService)
  readonly sandbox = attrModel(this.features, 'sandbox')
  readonly enabled = attrModel(this.sandbox, 'enabled')
  readonly provider = attrModel(this.sandbox, 'provider')

  readonly providers = toSignal<TSandboxProvider[], TSandboxProvider[]>(
    toObservable(this.enabled).pipe(
      switchMap((enabled) =>
        enabled ? this.apiService.xpertAPI.getSandboxProviders() : of([])
      )
    ),
    { initialValue: [] }
  )

  constructor() {
    effect(() => {
      if (!this.enabled()) {
        return
      }
      const providers = this.providers()
      const current = this.provider()
      if (providers.length && (!current || !providers.some((item) => item.type === current))) {
        this.provider.set(providers[0].type)
      }
    })
  }

  selectProvider(type: string) {
    this.provider.set(type)
  }

  isSelected(type: string) {
    return this.provider() === type
  }
}
