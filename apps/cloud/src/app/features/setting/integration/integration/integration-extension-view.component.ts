import { ChangeDetectionStrategy, Component, input } from '@angular/core'
import { ExtensionHostOutletComponent } from 'apps/cloud/src/app/@shared/view-extension'

@Component({
  standalone: true,
  selector: 'pac-settings-integration-extension-view',
  imports: [ExtensionHostOutletComponent],
  template: `
    <xp-extension-host-outlet
      class="block h-full min-h-0 overflow-hidden"
      mode="single-view"
      hostType="integration"
      [hostId]="hostId()"
      slot="detail.main_tabs"
      [viewKey]="viewKey()"
      [fillAvailableHeight]="true"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class IntegrationExtensionViewComponent {
  readonly hostId = input.required<string>()
  readonly viewKey = input.required<string>()
}
