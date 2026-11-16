import { Component, inject } from '@angular/core'
import { ExtensionHostOutletComponent } from '../../../../@shared/view-extension'
import { XpertComponent } from '../xpert.component'

@Component({
  standalone: true,
  imports: [ExtensionHostOutletComponent],
  host: { class: 'flex h-full min-h-0 min-w-0 flex-col' },
  template: ` @if (assistantId(); as id) {
    <xp-extension-host-outlet
      class="min-h-0 flex-1"
      mode="single-view"
      hostType="assistant-studio"
      [hostId]="id"
      slot="assistant.studio.memory"
      viewKey="platform.xpert-memory__memory"
      [fillAvailableHeight]="true"
    />
  }`
})
export class MemoryLibraryComponent {
  readonly assistantId = inject(XpertComponent).paramId
}
