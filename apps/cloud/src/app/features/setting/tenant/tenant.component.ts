import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FeatureEnum, PermissionsEnum, Store, routeAnimations } from '../../../@core'

@Component({
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'pac-settings-tenant',
  templateUrl: 'tenant.component.html',
  animations: [routeAnimations],
  styles: [
    `
      :host {
        max-width: 100%;
        max-height: 100%;
        display: flex;
        flex-direction: column;
        flex: 1;
      }
    `
  ]
})
export class PACTenantComponent {
  private readonly store = inject(Store)
  readonly featureContextHydrated = toSignal(this.store.featureContextHydrated$, {
    initialValue: this.store.featureContextHydrated
  })
  readonly canViewCustomSmtp = computed(() => {
    const featureContextHydrated = this.featureContextHydrated()

    return (
      this.store.hasPermission(PermissionsEnum.CUSTOM_SMTP_VIEW) &&
      (!featureContextHydrated || this.store.hasFeatureEnabled(FeatureEnum.FEATURE_SMTP))
    )
  })
}
