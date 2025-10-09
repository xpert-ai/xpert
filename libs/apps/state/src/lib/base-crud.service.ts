import { HttpClient } from '@angular/common/http'
import { inject } from '@angular/core'
import { PaginationParams } from '@metad/contracts'
import { toParams } from '@metad/core'
import { Store } from './store.service'
import { distinctUntilChanged, map, switchMap } from 'rxjs/operators'


export abstract class BaseCrudService<T> {
  protected readonly httpClient = inject(HttpClient)

  constructor(protected apiBaseUrl: string) {}

  getAll(options?: PaginationParams<T>) {
    return this.httpClient.get<{ items: T[]; total: number }>(this.apiBaseUrl, { params: toParams(options) })
  }

  getMyAll(options?: PaginationParams<T>) {
    return this.httpClient.get<{ items: T[]; total: number }>(this.apiBaseUrl + '/my', { params: toParams(options) })
  }

  getById(id: string, options?: { select?: (keyof T)[]; relations?: string[] }) {
    return this.httpClient.get<T>(this.apiBaseUrl + `/${id}`, { params: toParams(options) })
  }

  create(entity: Partial<T>) {
    return this.httpClient.post<T>(this.apiBaseUrl, entity)
  }

  update(id: string, entity: Partial<T>) {
    return this.httpClient.put(`${this.apiBaseUrl}/${id}`, entity)
  }

  upsert(entity: Partial<T>) {
    if (entity['id']) {
      return this.update(entity['id'], entity)
    } else {
      return this.create(entity)
    }
  }

  delete(id: string) {
    return this.httpClient.delete(`${this.apiBaseUrl}/${id}`)
  }

  softDelete(id: string) {
    return this.httpClient.delete(`${this.apiBaseUrl}/${id}/soft`)
  }

  softRecover(id: string) {
    return this.httpClient.put(`${this.apiBaseUrl}/${id}/recover`, {})
  }
}


export class BaseOrgCrudService<T> extends BaseCrudService<T> {
  protected store = inject(Store)

  private readonly organizationId$ = this.store.selectedOrganization$.pipe(
    map((org) => org?.id),
    distinctUntilChanged()
  )

  selectOrganizationId() {
    return this.organizationId$
  }

  getOneById(id: string, options?: PaginationParams<T>) {
    return this.selectOrganizationId().pipe(
      switchMap(() => this.httpClient.get<T>(this.apiBaseUrl + '/' + id, { params: toParams(options) }))
    )
  }

  getAllInOrg(options?: PaginationParams<T>) {
    return this.selectOrganizationId().pipe(switchMap(() => super.getAll(options)))
  }
}
