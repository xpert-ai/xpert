import { HttpClient } from '@angular/common/http'
import { inject, Injectable } from '@angular/core'
import { API_PREFIX } from '@metad/cloud/state'
import { EventSourceMessage } from '@microsoft/fetch-event-source'
import { Observable } from 'rxjs'
import { injectFetchEventSource } from './fetch-event-source'
import { injectApiBaseUrl } from '../providers'

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
    params: { projectId: string; conversationId: string }
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
}
