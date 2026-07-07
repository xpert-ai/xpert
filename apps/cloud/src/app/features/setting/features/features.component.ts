import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { RouterOutlet } from '@angular/router'
import { RequestScopeLevel } from '@xpert-ai/contracts'
import { TranslateModule } from '@ngx-translate/core'
import { FeatureService, Store, injectToastr } from '../../../@core/services'
import { getErrorMessage } from '../../../@core/types'
import { NgmSpinComponent } from '@xpert-ai/ocap-angular/common'

@Component({
  standalone: true,
  imports: [RouterOutlet, TranslateModule, NgmSpinComponent],
  providers: [FeatureService],
  selector: 'pac-features',
  templateUrl: './features.component.html',
  styleUrls: ['./features.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PACFeaturesComponent {
  readonly #store = inject(Store)
  readonly #featureService = inject(FeatureService)
  readonly #toastr = injectToastr()

  readonly loading = signal(false)
  readonly activeScope = toSignal(this.#store.selectActiveScope(), {
    initialValue: this.#store.activeScope
  })
  readonly canUpgrade = computed(() => this.activeScope().level === RequestScopeLevel.TENANT)

  upgrade() {
    if (!this.canUpgrade()) {
      return
    }

    this.loading.set(true)
    this.#featureService.upgrade().subscribe({
      next: () => {
        this.#featureService.notifyFeatureDefinitionsRefreshed()
        this.loading.set(false)
        this.#toastr.success('PAC.Messages.UpdatedSuccessfully', { Default: 'Updated successfully' })
      },
      error: (err) => {
        this.loading.set(false)
        this.#toastr.error(getErrorMessage(err))
      }
    })
  }
}
