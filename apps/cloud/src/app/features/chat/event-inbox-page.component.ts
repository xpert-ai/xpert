import { Component, computed, inject } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { TranslateModule } from '@ngx-translate/core'
import { EVENT_INBOX_VIEW_KEY, USER_EVENT_INBOX_SLOT } from '@xpert-ai/contracts'
import { Store } from '../../@core'
import { ExtensionHostOutletComponent } from '../../@shared/view-extension'

@Component({
  standalone: true,
  imports: [ExtensionHostOutletComponent, TranslateModule],
  host: { class: 'block h-full min-h-0 w-full' },
  template: `
    @for (scope of scopes(); track scope) {
      <xp-extension-host-outlet
        mode="single-view"
        hostType="user"
        hostId="me"
        [slot]="slot"
        [viewKey]="viewKey"
        [fillAvailableHeight]="true"
      />
    } @empty {
      @if (user() && !org()) {
        <p role="status" class="p-4 text-sm text-text-secondary">
          {{ 'XP.Scope.SelectOrganization' | translate: { Default: 'Select an organization' } }}
        </p>
      }
    }
  `
})
export class EventInboxPageComponent {
  private readonly store = inject(Store)
  protected readonly user = toSignal(this.store.user$)
  protected readonly org = toSignal(this.store.selectOrganizationId())
  readonly scopes = computed(() =>
    this.org() && this.user()?.id ? [JSON.stringify([this.user()?.tenantId, this.user()?.id, this.org()])] : []
  )
  readonly slot = USER_EVENT_INBOX_SLOT
  readonly viewKey = EVENT_INBOX_VIEW_KEY
}
