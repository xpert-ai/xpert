import { inject, Injectable } from '@angular/core'
import { API_PREFIX, OrganizationBaseCrudService } from '@cloud/app/@core/state'
import type { CreateBusinessAreaInput, IBusinessArea, UpdateBusinessAreaInput } from '@xpert-ai/contracts'

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
}

export function injectBusinessAreaAPI() {
  return inject(BusinessAreaService)
}
