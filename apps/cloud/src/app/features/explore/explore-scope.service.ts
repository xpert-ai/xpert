import { Dialog } from '@angular/cdk/dialog'
import { computed, inject, Injectable } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { RequestScopeLevel, ScopeService, Store } from '@cloud/app/@core'
import { firstValueFrom } from 'rxjs'
import { ExploreScopeDialogComponent, ExploreScopeSelection } from './explore-scope-dialog.component'

/** Reuses the app's scope transition; selecting a scope never initializes resources. */
@Injectable({ providedIn: 'root' })
export class ExploreScopeService {
  readonly #store = inject(Store)
  readonly #scope = inject(ScopeService)
  readonly #dialog = inject(Dialog)
  readonly #user = toSignal(this.#store.user$, { initialValue: this.#store.user })
  readonly activeScope = this.#scope.activeScope
  readonly isTenant = computed(() => this.activeScope().level === RequestScopeLevel.TENANT)
  readonly organizationName = computed(() => {
    this.activeScope()
    return this.#store.selectedOrganization?.name ?? ''
  })
  readonly key = computed(() => {
    const scope = this.activeScope()
    return `${this.#user()?.id}:${this.#user()?.tenantId}:${scope.level}:${scope.level === RequestScopeLevel.ORGANIZATION ? scope.organizationId : ''}`
  })

  async choose(organizationOnly = false) {
    const selection = await firstValueFrom(
      this.#dialog.open<ExploreScopeSelection>(ExploreScopeDialogComponent, {
        data: { allowTenant: !organizationOnly && this.#scope.canUseTenantScope() },
        backdropClass: 'backdrop-blur-xs-black',
        panelClass: 'xp-overlay-pane-dialog',
        maxWidth: 'calc(100vw - 32px)'
      }).closed
    )
    if (!selection) return false
    return selection.kind === 'tenant'
      ? this.#scope.switchToTenant()
      : this.#scope.switchToOrganization(selection.organization)
  }
}
