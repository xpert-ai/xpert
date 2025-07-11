import { inject, Injectable } from '@angular/core'
import { API_PREFIX, OrganizationBaseCrudService, PaginationParams, toHttpParams } from '@metad/cloud/state'
import { NGXLogger } from 'ngx-logger'
import { IXpertTask } from '../types'

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
