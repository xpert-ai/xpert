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
import { toParams } from '@xpert-ai/core'

@Injectable({
  providedIn: 'root'
})
export class SandboxService {
  private http = inject(HttpClient)
  readonly fetchEventSource = injectFetchEventSource()
  readonly baseUrl = injectApiBaseUrl() + API_PREFIX + '/sandbox'

  uploadFile(file: File, params: { workspace: string; conversationId: string; path: string }) {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('workspace', params.workspace)
    formData.append('conversationId', params.conversationId)
    formData.append('path', params.path)

    return this.http.post<{ url: string; filePath: string }>(`${this.baseUrl}/file`, formData)
  }

  terminal(
    data: { cmd: string },
    params: { projectId?: string | null; conversationId: string }
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

  listManagedServices(conversationId: string) {
    return this.http.get<ISandboxManagedService[]>(`${this.baseUrl}/conversations/${conversationId}/services`)
  }

  startManagedService(conversationId: string, input: TSandboxManagedServiceStartInput) {
    return this.http.post<ISandboxManagedService>(`${this.baseUrl}/conversations/${conversationId}/services/start`, input)
  }

  getManagedServiceLogs(conversationId: string, serviceId: string, tail?: number) {
    return this.http.get<TSandboxManagedServiceLogs>(
      `${this.baseUrl}/conversations/${conversationId}/services/${serviceId}/logs`,
      {
        params: toParams({
          ...(tail ? { tail } : {})
        })
      }
    )
  }

  stopManagedService(conversationId: string, serviceId: string) {
    return this.http.post<ISandboxManagedService>(
      `${this.baseUrl}/conversations/${conversationId}/services/${serviceId}/stop`,
      {}
    )
  }

  restartManagedService(conversationId: string, serviceId: string) {
    return this.http.post<ISandboxManagedService>(
      `${this.baseUrl}/conversations/${conversationId}/services/${serviceId}/restart`,
      {}
    )
  }

  createManagedServicePreviewSession(conversationId: string, serviceId: string) {
    return this.http.post<TSandboxManagedServicePreviewSession>(
      `${this.baseUrl}/conversations/${conversationId}/services/${serviceId}/preview-session`,
      {},
      {
        withCredentials: true
      }
    )
  }
}
