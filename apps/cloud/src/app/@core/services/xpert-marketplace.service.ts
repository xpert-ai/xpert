import { HttpClient, HttpParams } from '@angular/common/http'
import { inject, Injectable } from '@angular/core'
import {
  IXpertAccessRequest,
  IXpertMarketplaceItem,
  IXpertMarketplaceListResponse,
  TXpertAccessRequestCreateInput,
  TXpertAccessRequestDecisionInput,
  TXpertMarketplaceQuery
} from '../types'
import { API_XPERT_ACCESS_REQUESTS, API_XPERT_MARKETPLACE } from '../constants/app.constants'

@Injectable({ providedIn: 'root' })
export class XpertMarketplaceService {
  readonly #httpClient = inject(HttpClient)

  findMarketplace(query?: TXpertMarketplaceQuery) {
    return this.#httpClient.get<IXpertMarketplaceListResponse>(API_XPERT_MARKETPLACE, {
      params: this.toParams(query)
    })
  }

  getMarketplaceItem(id: string) {
    return this.#httpClient.get<IXpertMarketplaceItem>(`${API_XPERT_MARKETPLACE}/${id}`)
  }

  requestAccess(id: string, input: TXpertAccessRequestCreateInput) {
    return this.#httpClient.post<IXpertAccessRequest>(`${API_XPERT_MARKETPLACE}/${id}/access-requests`, input)
  }

  findMyRequests() {
    return this.#httpClient.get<IXpertAccessRequest[]>(`${API_XPERT_ACCESS_REQUESTS}/my`)
  }

  findReviewableRequests() {
    return this.#httpClient.get<IXpertAccessRequest[]>(`${API_XPERT_ACCESS_REQUESTS}/reviewable`)
  }

  approveRequest(id: string, input: TXpertAccessRequestDecisionInput) {
    return this.#httpClient.put<IXpertAccessRequest>(`${API_XPERT_ACCESS_REQUESTS}/${id}/approve`, input)
  }

  rejectRequest(id: string, input: TXpertAccessRequestDecisionInput) {
    return this.#httpClient.put<IXpertAccessRequest>(`${API_XPERT_ACCESS_REQUESTS}/${id}/reject`, input)
  }

  private toParams(query?: TXpertMarketplaceQuery) {
    let params = new HttpParams()
    if (!query) {
      return params
    }

    const append = (key: string, value?: string | number | null) => {
      if (value != null && `${value}`.trim()) {
        params = params.set(key, `${value}`)
      }
    }
    const appendList = (key: string, value?: string[]) => {
      if (value?.length) {
        params = params.set(key, value.join(','))
      }
    }

    append('search', query.search)
    appendList('businessCategories', query.businessCategories)
    appendList('capabilityTags', query.capabilityTags)
    appendList('collaborationModes', query.collaborationModes)
    appendList('technicalCategories', query.technicalCategories)
    append('status', query.status)
    append('sort', query.sort)
    append('skip', query.skip)
    append('take', query.take)

    return params
  }
}
