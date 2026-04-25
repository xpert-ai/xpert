import { HttpClient } from '@angular/common/http'
import { inject, Injectable } from '@angular/core'
import { API_PREFIX } from '@xpert-ai/cloud/state'
import { EventSourceMessage } from '@microsoft/fetch-event-source'
import { Observable } from 'rxjs'
import {
  ISandboxManagedService,
  TSandboxManagedServiceLogs,
  TSandboxManagedServicePreviewSession,
  TSandboxManagedServiceStartInput
} from '@xpert-ai/contracts'
import { injectFetchEventSource } from './fetch-event-source'
import { injectApiBaseUrl } from '../providers'
import { appendOrganizationIdQueryParam, createOptionalQueryParams } from './query-params'

@Injectable({
  providedIn: 'root'
})
export class SandboxService {
  private http = inject(HttpClient)
  readonly fetchEventSource = injectFetchEventSource()
  readonly baseUrl = injectApiBaseUrl() + API_PREFIX + '/sandbox'

  uploadFile(file: File, params: { workspace: string; conversationId: string; path: string; organizationId?: string }) {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('workspace', params.workspace)
    formData.append('conversationId', params.conversationId)
    formData.append('path', params.path)

    return this.http.post<{ url: string; filePath: string }>(`${this.baseUrl}/file`, formData, {
      params: appendOrganizationIdQueryParam(null, params.organizationId)
    })
  }

  terminal(
    data: { cmd: string },
    params: { projectId?: string | null; conversationId: string; organizationId?: string }
  ): Observable<EventSourceMessage> {
    return this.fetchEventSource(
      {
        url: this.baseUrl + `/terminal`,
        method: 'POST',
        params: params
      },
      JSON.stringify(data)
    )
  }

  listManagedServices(conversationId: string, organizationId?: string) {
    return this.http.get<ISandboxManagedService[]>(`${this.baseUrl}/conversations/${conversationId}/services`, {
      params: appendOrganizationIdQueryParam(null, organizationId)
    })
  }

  startManagedService(conversationId: string, input: TSandboxManagedServiceStartInput, organizationId?: string) {
    return this.http.post<ISandboxManagedService>(`${this.baseUrl}/conversations/${conversationId}/services/start`, input, {
      params: appendOrganizationIdQueryParam(null, organizationId)
    })
  }

  getManagedServiceLogs(conversationId: string, serviceId: string, tail?: number, organizationId?: string) {
    return this.http.get<TSandboxManagedServiceLogs>(
      `${this.baseUrl}/conversations/${conversationId}/services/${serviceId}/logs`,
      {
        params: createOptionalQueryParams({
          ...(tail ? { tail } : {}),
          organizationId
        })
      }
    )
  }

  stopManagedService(conversationId: string, serviceId: string, organizationId?: string) {
    return this.http.post<ISandboxManagedService>(
      `${this.baseUrl}/conversations/${conversationId}/services/${serviceId}/stop`,
      {},
      {
        params: appendOrganizationIdQueryParam(null, organizationId)
      }
    )
  }

  restartManagedService(conversationId: string, serviceId: string, organizationId?: string) {
    return this.http.post<ISandboxManagedService>(
      `${this.baseUrl}/conversations/${conversationId}/services/${serviceId}/restart`,
      {},
      {
        params: appendOrganizationIdQueryParam(null, organizationId)
      }
    )
  }

  createManagedServicePreviewSession(conversationId: string, serviceId: string, organizationId?: string) {
    return this.http.post<TSandboxManagedServicePreviewSession>(
      `${this.baseUrl}/conversations/${conversationId}/services/${serviceId}/preview-session`,
      {},
      {
        params: appendOrganizationIdQueryParam(null, organizationId),
        withCredentials: true
      }
    )
  }
}
