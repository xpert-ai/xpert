import { inject, Injectable } from '@angular/core'
import { API_PREFIX, OrganizationBaseCrudService } from '@cloud/app/@core/state'
import type { CreateBusinessAreaInput, IBusinessArea, UpdateBusinessAreaInput } from '@xpert-ai/contracts'
import type {
  IBusinessAreaAccess,
  IBusinessAreaAccessGrant,
  IBusinessAreaGrantCandidates,
  TBusinessAreaGrantInput
} from '@xpert-ai/contracts'

const API_BUSINESS_AREA = API_PREFIX + '/business-area'

@Injectable({ providedIn: 'root' })
export class BusinessAreaService extends OrganizationBaseCrudService<IBusinessArea> {
  constructor() {
    super(API_BUSINESS_AREA)
  }

  override create(input: CreateBusinessAreaInput) {
    return this.httpClient.post<IBusinessArea>(this.apiBaseUrl, input)
  }

  override update(id: string, input: UpdateBusinessAreaInput) {
    return this.httpClient.put<IBusinessArea>(`${this.apiBaseUrl}/${id}`, input)
  }

  access(id: string, userId?: string) {
    return this.httpClient.get<IBusinessAreaAccess>(`${this.apiBaseUrl}/${id}/access`, {
      params: userId ? { userId } : {}
    })
  }
  grants(id: string) {
    return this.httpClient.get<IBusinessAreaAccessGrant[]>(`${this.apiBaseUrl}/${id}/grants`)
  }
  grantCandidates(id: string) {
    return this.httpClient.get<IBusinessAreaGrantCandidates>(`${this.apiBaseUrl}/${id}/access/candidates`)
  }
  grant(id: string, input: TBusinessAreaGrantInput) {
    return this.httpClient.put<IBusinessAreaAccessGrant>(`${this.apiBaseUrl}/${id}/grants`, input)
  }
  revoke(id: string, grantId: string) {
    return this.httpClient.delete(`${this.apiBaseUrl}/${id}/grants/${grantId}`)
  }
  groupGrants(groupId: string) {
    return this.httpClient.get<IBusinessAreaAccessGrant[]>(`${this.apiBaseUrl}/access/groups/${groupId}`)
  }
}

export function injectBusinessAreaAPI() {
  return inject(BusinessAreaService)
}
