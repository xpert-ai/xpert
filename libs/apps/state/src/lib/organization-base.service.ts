import { inject } from '@angular/core'
import { distinctUntilChanged, map } from 'rxjs/operators'
import { Store } from './store.service'

/**
 * @deprecated use OrganizationBaseCrudService
 */
export class OrganizationBaseService {
  protected store = inject(Store)

  private readonly organizationId$ = this.store.selectOrganizationId().pipe(
    map((organizationId) => organizationId ?? null),
    distinctUntilChanged()
  )

  selectOrganizationId() {
    return this.organizationId$
  }
}
