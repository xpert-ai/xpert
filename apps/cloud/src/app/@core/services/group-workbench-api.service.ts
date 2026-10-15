import { HttpClient } from '@angular/common/http'
import { inject, Injectable } from '@angular/core'
import { API_PREFIX } from '@cloud/app/@core/state'
import { injectApiBaseUrl } from '../providers'

export interface GroupWorkbenchContext {
  assistantId: string
  conversationId: string
  projectId: string | null
}

@Injectable({ providedIn: 'root' })
export class GroupWorkbenchApiService {
  private readonly httpClient = inject(HttpClient)
  private readonly baseUrl = `${injectApiBaseUrl()}${API_PREFIX}/ai/groups`

  getContext(groupId: string) {
    return this.httpClient.get<GroupWorkbenchContext>(`${this.workbenchUrl(groupId)}/context`)
  }

  getViewHostUrl(groupId: string, hostType: string, hostId: string) {
    return `${this.workbenchUrl(groupId)}/${encodeURIComponent(hostType)}/${encodeURIComponent(hostId)}`
  }

  private workbenchUrl(groupId: string) {
    return `${this.baseUrl}/${encodeURIComponent(groupId)}/workbench`
  }
}
