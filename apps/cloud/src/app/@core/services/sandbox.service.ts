import { HttpClient, HttpParams } from '@angular/common/http'
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
import { toParams } from '@xpert-ai/core'

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
      params: appendOrganizationId(null, params.organizationId)
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
      params: appendOrganizationId(null, organizationId)
    })
  }

  startManagedService(conversationId: string, input: TSandboxManagedServiceStartInput, organizationId?: string) {
    return this.http.post<ISandboxManagedService>(`${this.baseUrl}/conversations/${conversationId}/services/start`, input, {
      params: appendOrganizationId(null, organizationId)
    })
  }

  getManagedServiceLogs(conversationId: string, serviceId: string, tail?: number, organizationId?: string) {
    return this.http.get<TSandboxManagedServiceLogs>(
      `${this.baseUrl}/conversations/${conversationId}/services/${serviceId}/logs`,
      {
        params: toParams({
          ...(tail ? { tail } : {}),
          ...(organizationId ? { organizationId } : {})
        })
      }
    )
  }

  stopManagedService(conversationId: string, serviceId: string, organizationId?: string) {
    return this.http.post<ISandboxManagedService>(
      `${this.baseUrl}/conversations/${conversationId}/services/${serviceId}/stop`,
      {},
      {
        params: appendOrganizationId(null, organizationId)
      }
    )
  }

  restartManagedService(conversationId: string, serviceId: string, organizationId?: string) {
    return this.http.post<ISandboxManagedService>(
      `${this.baseUrl}/conversations/${conversationId}/services/${serviceId}/restart`,
      {},
      {
        params: appendOrganizationId(null, organizationId)
      }
    )
  }

  createManagedServicePreviewSession(conversationId: string, serviceId: string, organizationId?: string) {
    return this.http.post<TSandboxManagedServicePreviewSession>(
      `${this.baseUrl}/conversations/${conversationId}/services/${serviceId}/preview-session`,
      {},
      {
        params: appendOrganizationId(null, organizationId),
        withCredentials: true
      }
    )
  }
}

function appendOrganizationId(params: HttpParams | null, organizationId?: string) {
  if (!organizationId) {
    return params ?? undefined
  }

  return (params ?? new HttpParams()).set('organizationId', organizationId)
}
