import { ChangeDetectionStrategy, Component, input } from '@angular/core'
import { ExtensionHostOutletComponent } from 'apps/cloud/src/app/@shared/view-extension'

@Component({
  standalone: true,
  selector: 'pac-settings-integration-extension-view',
  imports: [ExtensionHostOutletComponent],
  template: `
    <div class="p-4">
      <xp-extension-host-outlet
        mode="single-view"
        hostType="integration"
        [hostId]="hostId()"
        slot="detail.main_tabs"
        [viewKey]="viewKey()"
      />
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class IntegrationExtensionViewComponent {
  readonly hostId = input.required<string>()
  readonly viewKey = input.required<string>()
}
