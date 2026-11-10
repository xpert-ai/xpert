import { Component, inject } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { map } from 'rxjs'
import { PROJECT_CONFIGURATION_VIEW } from '@xpert-ai/contracts'
import { Store } from '../../@core'
import { ExtensionHostOutletComponent } from '../../@shared/view-extension/extension-host-outlet.component'
import { XpertProjectFacade } from './project.facade'

@Component({
  standalone: true,
  selector: 'xp-project-config',
  imports: [ExtensionHostOutletComponent],
  host: { class: 'block h-full min-h-0' },
  template: `@if (facade.project()?.id; as projectId) {
    <xp-extension-host-outlet
      hostType="project"
      [hostId]="projectId"
      [runtimeUserId]="userId()"
      slot="project.configuration"
      [viewKey]="viewKey"
      [fillAvailableHeight]="true"
      mode="single-view"
    />
  }`
})
export class XpertProjectConfigComponent {
  readonly facade = inject(XpertProjectFacade)
  readonly viewKey = PROJECT_CONFIGURATION_VIEW
  readonly userId = toSignal(inject(Store).user$.pipe(map((user) => user?.id ?? null)), { initialValue: null })
}
