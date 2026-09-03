import { HttpParams } from '@angular/common/http'
import { inject, Injectable } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { OrganizationBaseCrudService, PaginationParams, toHttpParams } from '@cloud/app/@core/state'
import { NGXLogger } from 'ngx-logger'
import { BehaviorSubject, Observable, combineLatest, distinctUntilChanged, map, of, shareReplay, switchMap } from 'rxjs'
import { API_XPERT_WORKSPACE } from '../constants/app.constants'
import { IUser, IXpertWorkspace, TXpertWorkspaceAccessPurpose, TXpertWorkspaceVisibility } from '../types'

export type XpertWorkspaceRequestOptions = {
  purpose?: TXpertWorkspaceAccessPurpose
}

@Injectable({ providedIn: 'root' })
export class XpertWorkspaceService extends OrganizationBaseCrudService<IXpertWorkspace> {
  readonly #logger = inject(NGXLogger)

  readonly #refresh = new BehaviorSubject<void>(null)
  readonly #myWorkspaceRequests = new Map<string, Observable<{ items: IXpertWorkspace[] }>>()
  readonly #workspaceScope = combineLatest([this.store.user$, this.selectOrganizationId()]).pipe(
    map(([user, organizationId]) => ({ userId: user?.id ?? null, organizationId: organizationId ?? null })),
    distinctUntilChanged(
      (previous, current) => previous.userId === current.userId && previous.organizationId === current.organizationId
    )
  )

  constructor() {
    super(API_XPERT_WORKSPACE)
    this.#workspaceScope.pipe(takeUntilDestroyed()).subscribe(() => this.#myWorkspaceRequests.clear())
  }

  getAllMy(params?: PaginationParams<IXpertWorkspace>, options?: XpertWorkspaceRequestOptions) {
    const httpParams = appendWorkspaceRequestOptions(toHttpParams(params), options)
    const key = httpParams.toString()
    return this.#workspaceScope.pipe(
      switchMap(({ userId }) =>
        userId
          ? this.#refresh.pipe(
              switchMap(() => {
                let request = this.#myWorkspaceRequests.get(key)
                if (!request) {
                  // The sidebar and routed workspace pages share the same request and result.
                  request = this.httpClient
                    .get<{ items: IXpertWorkspace[] }>(this.apiBaseUrl + '/my', {
                      params: httpParams
                    })
                    .pipe(shareReplay({ bufferSize: 1, refCount: true }))
                  this.#myWorkspaceRequests.set(key, request)
                }
                return request
              })
            )
          : of({ items: [] })
      )
    )
  }

  getMyDefault(options?: XpertWorkspaceRequestOptions) {
    return this.selectOrganizationId().pipe(
      switchMap(() =>
        this.httpClient.get<IXpertWorkspace | null>(this.apiBaseUrl + `/my/default`, {
          params: appendWorkspaceRequestOptions(null, options)
        })
      )
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
    this.#myWorkspaceRequests.clear()
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

function appendWorkspaceRequestOptions(
  params: ReturnType<typeof toHttpParams>,
  options?: XpertWorkspaceRequestOptions
) {
  let nextParams = params ?? new HttpParams()
  if (options?.purpose) {
    nextParams = nextParams.append('purpose', options.purpose)
  }
  return nextParams
}
