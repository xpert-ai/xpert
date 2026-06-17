import { inject, Injectable } from '@angular/core'
import { HttpParams } from '@angular/common/http'
import { API_PREFIX, OrganizationBaseCrudService, PaginationParams, toHttpParams } from '@xpert-ai/cloud/state'
import { NGXLogger } from 'ngx-logger'
import { IXpertTask, TXpertTaskScheduleCapabilities } from '../types'

@Injectable({ providedIn: 'root' })
export class XpertTaskService extends OrganizationBaseCrudService<IXpertTask> {
  readonly #logger = inject(NGXLogger)

  constructor() {
    super(API_PREFIX + `/xpert-task`)
  }

  getByIds(ids: string[]) {
    return this.httpClient.get<{ items: IXpertTask[]; total: number }>(this.apiBaseUrl + `/by-ids`, {
      params: {
        ids: ids.join(',')
      }
    })
  }

  total(options?: PaginationParams<IXpertTask>) {
    return this.httpClient.get<number>(this.apiBaseUrl + `/total`, { params: toHttpParams(options) })
  }

  getScheduleCapabilities(xpertId: string, agentKey?: string) {
    const params = agentKey ? new HttpParams().set('agentKey', agentKey) : undefined
    return this.httpClient.get<TXpertTaskScheduleCapabilities>(this.apiBaseUrl + `/schedule/capabilities/${xpertId}`, {
      params
    })
  }

  schedule(id: string, entity?: Partial<IXpertTask>) {
    return this.httpClient.put(this.apiBaseUrl + `/${id}/schedule`, entity)
  }

  pause(id: string) {
    return this.httpClient.put(this.apiBaseUrl + `/${id}/pause`, {})
  }

  archive(id: string) {
    return this.httpClient.put(this.apiBaseUrl + `/${id}/archive`, {})
  }

  test(id: string) {
    return this.httpClient.post(this.apiBaseUrl + `/${id}/test`, {})
  }
}
