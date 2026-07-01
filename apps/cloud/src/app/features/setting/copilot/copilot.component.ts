import { AsyncPipe } from '@angular/common'
import { Component, computed, inject } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { RouterModule } from '@angular/router'
import { AiFeatureEnum, RequestScopeLevel, Store } from '@xpert-ai/cloud/state'
import { TranslateModule } from '@ngx-translate/core'
import { ToastrService, routeAnimations } from '../../../@core'
import { TranslationBaseComponent } from '../../../@shared/language'
import { SharedUiModule } from '../../../@shared/ui.module'

@Component({
  standalone: true,
  selector: 'pac-settings-copilot',
  templateUrl: './copilot.component.html',
  styleUrls: ['./copilot.component.scss'],
  imports: [AsyncPipe, RouterModule, TranslateModule, SharedUiModule],
  animations: [routeAnimations]
})
export class CopilotComponent extends TranslationBaseComponent {
  readonly #store = inject(Store)
  readonly _toastrService = inject(ToastrService)
  readonly featureContextHydrated = toSignal(this.#store.featureContextHydrated$, {
    initialValue: this.#store.featureContextHydrated
  })
  readonly activeScope = toSignal(this.#store.selectActiveScope(), {
    initialValue: this.#store.activeScope
  })
  readonly isTenantScope = computed(() => this.activeScope().level === RequestScopeLevel.TENANT)
  readonly monitoringEnabled = computed(
    () =>
      !this.featureContextHydrated() ||
      this.isTenantScope() ||
      this.hasFeatureEnabled(AiFeatureEnum.FEATURE_COPILOT_MONITORING)
  )

  hasFeatureEnabled(feature: AiFeatureEnum) {
    return this.#store.hasFeatureEnabled(feature)
  }
}
