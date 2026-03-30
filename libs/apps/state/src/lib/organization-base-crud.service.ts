import { inject } from '@angular/core'
import { distinctUntilChanged, map, switchMap } from 'rxjs/operators'
import { CrudService, PaginationParams, toHttpParams } from './crud.service'
import { Store } from './store.service'

export class OrganizationBaseCrudService<T> extends CrudService<T> {
  protected store = inject(Store)

  private readonly organizationId$ = this.store.selectOrganizationId().pipe(
    map((organizationId) => organizationId ?? null),
    distinctUntilChanged()
  )

  selectOrganizationId() {
    return this.organizationId$
  }

  getOneById(id: string, options?: PaginationParams<T>) {
    return this.selectOrganizationId().pipe(
      switchMap(() => this.httpClient.get<T>(this.apiBaseUrl + '/' + id, { params: toHttpParams(options) }))
    )
  }

  getAllInOrg(options?: PaginationParams<T>) {
    return this.selectOrganizationId().pipe(switchMap(() => super.getAll(options)))
  }
}
