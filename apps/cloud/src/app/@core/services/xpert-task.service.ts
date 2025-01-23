import { inject, Injectable } from '@angular/core'
import { API_PREFIX, OrganizationBaseCrudService } from '@metad/cloud/state'
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

  schedule(id: string) {
    return this.httpClient.put(this.apiBaseUrl + `/${id}/schedule`, {})
  }
  
  pause(id: string) {
    return this.httpClient.put(this.apiBaseUrl + `/${id}/pause`, {})
  }
}
