import { inject, Injectable } from '@angular/core'
import {
  IChatConversation,
  IXpert,
  OrganizationBaseCrudService,
  PaginationParams,
  toHttpParams
} from '@metad/cloud/state'
import { NGXLogger } from 'ngx-logger'
import { BehaviorSubject, switchMap } from 'rxjs'
import { API_XPERT_PROJECT } from '../constants/app.constants'
import { IXpertProject } from '../types'

@Injectable({ providedIn: 'root' })
export class XpertProjectService extends OrganizationBaseCrudService<IXpertProject> {
  readonly #logger = inject(NGXLogger)

  readonly #refresh = new BehaviorSubject<void>(null)

  constructor() {
    super(API_XPERT_PROJECT)
  }

  getAllMy(params?: PaginationParams<IXpertProject>) {
    return this.selectOrganizationId().pipe(
      switchMap(() =>
        this.#refresh.pipe(
          switchMap(() =>
            this.httpClient.get<{ items: IXpertProject[] }>(this.apiBaseUrl + `/my`, { params: toHttpParams(params) })
          )
        )
      )
    )
  }

  getXperts(id: string, params: PaginationParams<IXpertProject>) {
    return this.httpClient.get<{ items: IXpert[]; total: number }>(this.apiBaseUrl + `/${id}/xperts`, {
      params: toHttpParams(params)
    })
  }

  addXpert(id: string, xpertId: string) {
    return this.httpClient.put(this.apiBaseUrl + `/${id}/xperts/${xpertId}`, {})
  }

  removeXpert(id: string, xpertId: string) {
    return this.httpClient.delete(this.apiBaseUrl + `/${id}/xperts/${xpertId}`)
  }

  getConversations(id: string) {
    return this.httpClient.get<{ items: IChatConversation[]; total: number }>(this.apiBaseUrl + `/${id}/conversations`)
  }
}

export function injectProjectService() {
  return inject(XpertProjectService)
}
