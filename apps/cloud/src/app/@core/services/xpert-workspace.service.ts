import { inject, Injectable } from '@angular/core'
import { OrganizationBaseCrudService, PaginationParams, toHttpParams } from '@metad/cloud/state'
import { NGXLogger } from 'ngx-logger'
import { BehaviorSubject, switchMap } from 'rxjs'
import { API_XPERT_WORKSPACE } from '../constants/app.constants'
import { IUser, IXpertWorkspace } from '../types'

@Injectable({ providedIn: 'root' })
export class XpertWorkspaceService extends OrganizationBaseCrudService<IXpertWorkspace> {
  readonly #logger = inject(NGXLogger)

  readonly #refresh = new BehaviorSubject<void>(null)

  constructor() {
    super(API_XPERT_WORKSPACE)
  }

  getAllMy(params?: PaginationParams<IXpertWorkspace>) {
    return this.selectOrganizationId().pipe(
      switchMap(() =>
        this.#refresh.pipe(
          switchMap(() =>
            this.httpClient.get<{ items: IXpertWorkspace[] }>(this.apiBaseUrl + `/my`, { params: toHttpParams(params) })
          )
        )
      )
    )
  }

  getMembers(id: string) {
    return this.httpClient.get<IUser[]>(this.apiBaseUrl + `/${id}/members`)
  }

  updateMembers(id: string, members: string[]) {
    return this.httpClient.put<IXpertWorkspace>(this.apiBaseUrl + `/${id}/members`, members)
  }

  archive(id: string) {
    return this.httpClient.post<IXpertWorkspace>(this.apiBaseUrl + `/${id}/archive`, {})
  }

  refresh() {
    this.#refresh.next()
  }
}

export class XpertWorkspaceBaseCrudService<T> extends OrganizationBaseCrudService<T> {
  getAllByWorkspace(id: string, options?: PaginationParams<T>, published?: boolean) {
    let params = toHttpParams(options)
    if (published) {
      params = params.append('published', published)
    }
    return this.httpClient.get<{ items: T[] }>(`${this.apiBaseUrl}/by-workspace/${id}`, {
      params
    })
  }
}

export function injectWorkspaceService() {
  return inject(XpertWorkspaceService)
}
