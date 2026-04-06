import { HttpClient, HttpParams } from '@angular/common/http'
import { inject, Injectable } from '@angular/core'
import { API_PREFIX } from '@metad/cloud/state'
import {
  XpertExtensionViewManifest,
  XpertViewActionResult,
  XpertViewDataResult,
  XpertViewQuery
} from '@metad/contracts'
import { injectApiBaseUrl } from '../providers'

@Injectable({ providedIn: 'root' })
export class ViewExtensionApiService {
  private readonly httpClient = inject(HttpClient)
  private readonly apiBaseUrl = injectApiBaseUrl()
  private readonly baseUrl = `${this.apiBaseUrl}${API_PREFIX}/view-hosts`

  getSlotViews(hostType: string, hostId: string, slot: string) {
    return this.httpClient.get<XpertExtensionViewManifest[]>(
      `${this.baseUrl}/${encodeURIComponent(hostType)}/${encodeURIComponent(hostId)}/slots/${encodeURIComponent(slot)}/views`
    )
  }

  getViewData(hostType: string, hostId: string, viewKey: string, query: XpertViewQuery = {}) {
    let params = new HttpParams()

    if (query.page) {
      params = params.set('page', String(query.page))
    }
    if (query.pageSize) {
      params = params.set('pageSize', String(query.pageSize))
    }
    if (query.cursor) {
      params = params.set('cursor', query.cursor)
    }
    if (query.search) {
      params = params.set('search', query.search)
    }
    if (query.sortBy) {
      params = params.set('sortBy', query.sortBy)
    }
    if (query.sortDirection) {
      params = params.set('sortDirection', query.sortDirection)
    }
    if (query.selectionId) {
      params = params.set('selectionId', query.selectionId)
    }
    if (query.filters?.length) {
      params = params.set('filters', JSON.stringify(query.filters))
    }

    return this.httpClient.get<XpertViewDataResult>(
      `${this.baseUrl}/${encodeURIComponent(hostType)}/${encodeURIComponent(hostId)}/views/${encodeURIComponent(viewKey)}/data`,
      { params }
    )
  }

  executeAction(hostType: string, hostId: string, viewKey: string, actionKey: string, body: { targetId?: string }) {
    return this.httpClient.post<XpertViewActionResult>(
      `${this.baseUrl}/${encodeURIComponent(hostType)}/${encodeURIComponent(hostId)}/views/${encodeURIComponent(viewKey)}/actions/${encodeURIComponent(actionKey)}`,
      body
    )
  }
}

export function injectViewExtensionApi() {
  return inject(ViewExtensionApiService)
}
