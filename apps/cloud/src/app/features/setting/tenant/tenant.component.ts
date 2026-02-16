import { ChangeDetectionStrategy, Component } from '@angular/core'
import { routeAnimations } from '../../../@core'

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
export class PACTenantComponent {}
