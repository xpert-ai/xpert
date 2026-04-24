import { inject, Injectable } from '@angular/core'
import { OrganizationBaseCrudService, PaginationParams, toHttpParams } from '@xpert-ai/cloud/state'
import { NGXLogger } from 'ngx-logger'
import { BehaviorSubject, switchMap } from 'rxjs'
import { API_XPERT_WORKSPACE } from '../constants/app.constants'
import { IUser, IXpertWorkspace, TXpertWorkspaceVisibility } from '../types'

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

  getMyDefault() {
    return this.selectOrganizationId().pipe(
      switchMap(() => this.httpClient.get<IXpertWorkspace | null>(this.apiBaseUrl + `/my/default`))
    )
  }

  setMyDefault(id: string) {
    return this.httpClient.post<IXpertWorkspace>(this.apiBaseUrl + `/${id}/default`, {})
  }

  isTenantShared(workspace?: Pick<IXpertWorkspace, 'isTenantShared' | 'settings'> | null) {
    return workspace?.isTenantShared ?? workspace?.settings?.access?.visibility === 'tenant-shared'
  }

  canRead(workspace?: Pick<IXpertWorkspace, 'capabilities'> | null) {
    return workspace?.capabilities?.canRead ?? true
  }

  canRun(workspace?: Pick<IXpertWorkspace, 'capabilities'> | null) {
    return workspace?.capabilities?.canRun ?? true
  }

  canWrite(workspace?: Pick<IXpertWorkspace, 'capabilities'> | null) {
    return workspace?.capabilities?.canWrite ?? true
  }

  canManage(workspace?: Pick<IXpertWorkspace, 'capabilities'> | null) {
    return workspace?.capabilities?.canManage ?? true
  }

  getMembers(id: string) {
    return this.httpClient.get<IUser[]>(this.apiBaseUrl + `/${id}/members`)
  }

  updateMembers(id: string, members: string[]) {
    return this.httpClient.put<IXpertWorkspace>(this.apiBaseUrl + `/${id}/members`, members)
  }

  updateVisibility(id: string, visibility: TXpertWorkspaceVisibility) {
    return this.httpClient.put<IXpertWorkspace>(this.apiBaseUrl + `/${id}/visibility`, { visibility })
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
