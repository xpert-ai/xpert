import { HttpClient, HttpParams } from '@angular/common/http'
import { inject, Injectable } from '@angular/core'
import { PaginationParams, toHttpParams } from '@xpert-ai/cloud/state'
import {
  ICopilotOrganization,
  ICopilotUsageGroupKey,
  ICopilotUsageQuery,
  ICopilotUsageSummary,
  ICopilotUsageTotals,
  ICopilotUser,
  ICopilotUserUsageSummary,
  OrderTypeEnum,
  TCopilotQuotaAdjustInput,
  TCopilotQuotaRenewInput
} from '@xpert-ai/contracts'
import { API_COPILOT_ORGANIZATION, API_COPILOT_USAGE, API_COPILOT_USER } from '../constants/app.constants'

type UsageQueryParams = ICopilotUsageQuery &
  Partial<Pick<PaginationParams<ICopilotUsageSummary>, 'order' | 'skip' | 'take'>>

@Injectable({ providedIn: 'root' })
export class CopilotUsageService {
  readonly httpClient = inject(HttpClient)

  getUsageSummaries(params: PaginationParams<ICopilotUsageSummary> & ICopilotUsageQuery) {
    return this.httpClient.get<{ items: ICopilotUsageSummary[]; total?: number }>(API_COPILOT_USAGE + '/summary', {
      params: this.toUsageHttpParams({
        order: {
          updatedAt: OrderTypeEnum.DESC
        },
        ...(params ?? {})
      })
    })
  }

  getUsageTotals(params: ICopilotUsageQuery) {
    return this.httpClient.get<ICopilotUsageTotals[]>(API_COPILOT_USAGE + '/totals', {
      params: this.toUsageHttpParams(params)
    })
  }

  getUsageDetails(groupKey: ICopilotUsageGroupKey) {
    return this.httpClient.post<ICopilotUser[]>(API_COPILOT_USAGE + '/details', groupKey)
  }

  adjustQuota(input: TCopilotQuotaAdjustInput) {
    return this.httpClient.post<ICopilotUsageSummary | null>(API_COPILOT_USAGE + '/quota/adjust', input)
  }

  renewQuota(input: TCopilotQuotaRenewInput) {
    return this.httpClient.post<ICopilotUsageSummary | null>(API_COPILOT_USAGE + '/quota/renew', input)
  }

  getOrgUsages(params: PaginationParams<ICopilotOrganization>) {
    return this.httpClient.get<{ items: ICopilotOrganization[]; total?: number }>(API_COPILOT_ORGANIZATION, {
      params: toHttpParams({
        relations: ['organization'],
        order: {
          updatedAt: OrderTypeEnum.DESC
        },
        ...(params ?? {})
      })
    })
  }

  getUserUsages(options: PaginationParams<ICopilotUser>) {
    return this.httpClient.get<{ items: ICopilotUser[]; total?: number }>(API_COPILOT_USER, {
      params: toHttpParams({
        ...options,
        relations: ['user', 'org'],
        order: {
          updatedAt: OrderTypeEnum.DESC
        }
      })
    })
  }

  getUserUsageSummaries(options: PaginationParams<ICopilotUserUsageSummary>) {
    return this.httpClient.get<{ items: ICopilotUserUsageSummary[]; total?: number }>(API_COPILOT_USER + '/summary', {
      params: toHttpParams({
        ...options,
        order: {
          updatedAt: OrderTypeEnum.DESC
        }
      })
    })
  }

  getUserUsageDetails(item: ICopilotUserUsageSummary) {
    return this.httpClient.post<ICopilotUser[]>(API_COPILOT_USER + '/summary/details', item.groupKey)
  }

  renewOrgLimit(id: string, tokenLimit: number, priceLimit: number) {
    return this.httpClient.post<ICopilotOrganization>(API_COPILOT_ORGANIZATION + `/${id}/renew`, {
      tokenLimit,
      priceLimit
    })
  }

  renewUserLimit(id: string, tokenLimit: number, priceLimit: number) {
    return this.httpClient.post<ICopilotUser>(API_COPILOT_USER + `/${id}/renew`, { tokenLimit, priceLimit })
  }

  renewUserUsageSummary(item: ICopilotUserUsageSummary, tokenLimit: number) {
    return this.httpClient.post<ICopilotUserUsageSummary>(API_COPILOT_USER + '/summary/renew', {
      ...item.groupKey,
      tokenLimit
    })
  }

  private toUsageHttpParams(params?: UsageQueryParams) {
    let httpParams = new HttpParams()
    const append = (key: string, value: unknown) => {
      if (value !== undefined && value !== null && value !== '') {
        httpParams = httpParams.set(key, typeof value === 'string' ? value : JSON.stringify(value))
      }
    }

    append('dimension', params?.dimension)
    append('start', params?.start)
    append('end', params?.end)
    append('provider', params?.provider)
    append('model', params?.model)
    append('userId', params?.userId)
    append('organizationId', params?.organizationId)
    append('currency', params?.currency)
    append('$take', params?.take)
    append('$skip', params?.skip)
    append('$order', params?.order)

    return httpParams
  }
}
