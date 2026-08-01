import { HttpClient, HttpParams } from '@angular/common/http'
import { inject, Injectable } from '@angular/core'
import { Store } from '@cloud/app/@core/state'
import {
  IModelAccessAdminQuery,
  IModelAccessCatalog,
  IModelAccessEvent,
  IModelAccessRequest,
  IPagination,
  IUserModelGrant,
  TModelAccessRequestApproveInput,
  TModelAccessRequestCreateInput,
  TModelAccessRequestRejectInput,
  TModelAccessRequestWithdrawInput,
  TUserModelGrantExtendInput,
  TUserModelGrantRevokeInput,
  UserModelGrantStatusEnum
} from '@xpert-ai/contracts'
import { shareReplay, switchMap, tap } from 'rxjs'
import { API_MODEL_ACCESS } from '../constants/app.constants'
import { CopilotServerService } from './copilot-server.service'

@Injectable({ providedIn: 'root' })
export class ModelAccessService {
  readonly #http = inject(HttpClient)
  readonly #copilotServer = inject(CopilotServerService)
  readonly #store = inject(Store)
  #expirationRefreshTimer?: ReturnType<typeof setTimeout>

  readonly #scopeRefresh$ = this.#copilotServer.refresh$.pipe(switchMap(() => this.#store.selectOrganizationId()))

  readonly catalog$ = this.#scopeRefresh$.pipe(
    switchMap(() => this.#http.get<IModelAccessCatalog>(`${API_MODEL_ACCESS}/catalog`)),
    tap((catalog) => this.scheduleExpirationRefresh(catalog)),
    shareReplay({ bufferSize: 1, refCount: true })
  )

  readonly myRequests$ = this.#scopeRefresh$.pipe(
    switchMap(() => this.#http.get<IModelAccessRequest[]>(`${API_MODEL_ACCESS}/requests/my`)),
    shareReplay({ bufferSize: 1, refCount: true })
  )

  readonly myGrants$ = this.#scopeRefresh$.pipe(
    switchMap(() => this.#http.get<IUserModelGrant[]>(`${API_MODEL_ACCESS}/grants/my`)),
    shareReplay({ bufferSize: 1, refCount: true })
  )

  createRequest(input: TModelAccessRequestCreateInput) {
    return this.#http.post<IModelAccessRequest>(`${API_MODEL_ACCESS}/requests`, input).pipe(tap(() => this.refresh()))
  }

  withdrawRequest(id: string, input: TModelAccessRequestWithdrawInput = {}) {
    return this.#http
      .post<IModelAccessRequest>(`${API_MODEL_ACCESS}/requests/${id}/withdraw`, input)
      .pipe(tap(() => this.refresh()))
  }

  getAdminRequests(query?: IModelAccessAdminQuery) {
    return this.#http.get<IPagination<IModelAccessRequest>>(`${API_MODEL_ACCESS}/admin/requests`, {
      params: this.toParams(query)
    })
  }

  getAdminGrants(query?: IModelAccessAdminQuery) {
    return this.#http.get<IPagination<IUserModelGrant>>(`${API_MODEL_ACCESS}/admin/grants`, {
      params: this.toParams(query)
    })
  }

  getAdminEvents(query?: IModelAccessAdminQuery) {
    return this.#http.get<IPagination<IModelAccessEvent>>(`${API_MODEL_ACCESS}/admin/events`, {
      params: this.toParams(query)
    })
  }

  approveRequest(id: string, input: TModelAccessRequestApproveInput) {
    return this.#http
      .post<IUserModelGrant | null>(`${API_MODEL_ACCESS}/admin/requests/${id}/approve`, input)
      .pipe(tap(() => this.refresh()))
  }

  rejectRequest(id: string, input: TModelAccessRequestRejectInput) {
    return this.#http
      .post<IModelAccessRequest>(`${API_MODEL_ACCESS}/admin/requests/${id}/reject`, input)
      .pipe(tap(() => this.refresh()))
  }

  extendGrant(id: string, input: TUserModelGrantExtendInput) {
    return this.#http
      .post<IUserModelGrant>(`${API_MODEL_ACCESS}/admin/grants/${id}/extend`, input)
      .pipe(tap(() => this.refresh()))
  }

  revokeGrant(id: string, input: TUserModelGrantRevokeInput) {
    return this.#http
      .post<IUserModelGrant>(`${API_MODEL_ACCESS}/admin/grants/${id}/revoke`, input)
      .pipe(tap(() => this.refresh()))
  }

  refresh() {
    this.#copilotServer.refresh()
  }

  formatValidUntil(value: Date | string) {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) {
      return String(value)
    }
    return new Intl.DateTimeFormat(this.#store.preferredLanguage || undefined, {
      dateStyle: 'medium',
      timeStyle: 'medium',
      timeZone: this.tenantTimeZone()
    }).format(date)
  }

  private tenantTimeZone() {
    const timeZone = this.#store.user?.organizations?.find((membership) => membership.organization?.isDefault)
      ?.organization?.timeZone
    if (!timeZone) {
      return 'UTC'
    }
    try {
      new Intl.DateTimeFormat('en-US', { timeZone }).format()
      return timeZone
    } catch {
      return 'UTC'
    }
  }

  private scheduleExpirationRefresh(catalog: IModelAccessCatalog) {
    if (this.#expirationRefreshTimer) {
      clearTimeout(this.#expirationRefreshTimer)
      this.#expirationRefreshTimer = undefined
    }
    const now = Date.now()
    const nextExpiration = catalog.items
      .map((item) =>
        item.grant?.status === UserModelGrantStatusEnum.Active && item.grant.validUntil
          ? new Date(item.grant.validUntil).getTime()
          : Number.NaN
      )
      .filter((value) => Number.isFinite(value) && value > now)
      .sort((left, right) => left - right)[0]
    if (!nextExpiration) {
      return
    }
    const maxTimerDelay = 2_147_483_647
    this.#expirationRefreshTimer = setTimeout(
      () => this.refresh(),
      Math.min(Math.max(nextExpiration - now + 250, 250), maxTimerDelay)
    )
  }

  private toParams(query?: IModelAccessAdminQuery) {
    let params = new HttpParams()
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined && value !== null && value !== '') {
        params = params.set(key === 'take' || key === 'skip' ? `$${key}` : key, String(value))
      }
    }
    return params
  }
}
