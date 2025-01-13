import { HttpClient } from '@angular/common/http'
import { inject, Injectable } from '@angular/core'
import { toHttpParams } from '@metad/cloud/state'
import { ICopilotOrganization, ICopilotUser, OrderTypeEnum } from '@metad/contracts'
import { NGXLogger } from 'ngx-logger'
import { map } from 'rxjs'
import { API_COPILOT_ORGANIZATION, API_COPILOT_USER } from '../constants/app.constants'

@Injectable({ providedIn: 'root' })
export class CopilotUsageService {
  readonly #logger = inject(NGXLogger)
  readonly httpClient = inject(HttpClient)

  getOrgUsages() {
    return this.httpClient
      .get<{ items: ICopilotOrganization[] }>(API_COPILOT_ORGANIZATION, {
        params: toHttpParams({
          relations: ['organization'],
          order: {
            updatedAt: OrderTypeEnum.DESC
          }
        })
      })
      .pipe(map(({ items }) => items))
  }

  getUserUsages() {
    return this.httpClient
      .get<{ items: ICopilotUser[] }>(API_COPILOT_USER, {
        params: toHttpParams({
          relations: ['user', 'org'],
          order: {
            updatedAt: OrderTypeEnum.DESC
          }
        })
      })
      .pipe(map(({ items }) => items))
  }

  renewOrgLimit(id: string, tokenLimit: number) {
    return this.httpClient.post<ICopilotOrganization>(API_COPILOT_ORGANIZATION + `/${id}/renew`, { tokenLimit })
  }

  renewUserLimit(id: string, tokenLimit: number) {
    return this.httpClient.post<ICopilotUser>(API_COPILOT_USER + `/${id}/renew`, { tokenLimit })
  }
}
