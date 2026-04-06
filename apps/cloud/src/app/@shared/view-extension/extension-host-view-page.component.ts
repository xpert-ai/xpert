import { Component, inject } from '@angular/core'
import { ActivatedRoute } from '@angular/router'
import { injectParams } from 'ngxtension/inject-params'
import { ExtensionHostOutletComponent } from './extension-host-outlet.component'

@Component({
  standalone: true,
  selector: 'xp-extension-host-view-page',
  imports: [ExtensionHostOutletComponent],
  template: `
    @if (hostType && slot && hostId() && viewKey()) {
      <xp-extension-host-outlet
        mode="single-view"
        [hostType]="hostType"
        [hostId]="hostId()"
        [slot]="slot"
        [viewKey]="viewKey()"
      />
    }
  `
})
export class ExtensionHostViewPageComponent {
  readonly #route = inject(ActivatedRoute)
  readonly hostId = injectParams('id')
  readonly viewKey = injectParams('viewKey')

  readonly hostType = this.#route.snapshot.data['hostType'] as string
  readonly slot = this.#route.snapshot.data['slot'] as string
}
