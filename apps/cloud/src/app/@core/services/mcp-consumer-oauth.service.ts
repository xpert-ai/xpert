import { HttpClient, HttpParams } from '@angular/common/http'
import { inject, Injectable } from '@angular/core'
import type { IMcpConsumerOAuthStatus } from '@xpert-ai/contracts'
import { API_MCP_CONSUMER_OAUTH } from '../constants/app.constants'

@Injectable({ providedIn: 'root' })
export class McpConsumerOAuthClientService {
  private readonly http = inject(HttpClient)

  authorize(workspaceId: string, toolsetId: string, serverName: string) {
    return this.http.post<IMcpConsumerOAuthStatus>(
      `${API_MCP_CONSUMER_OAUTH}/${encodeURIComponent(workspaceId)}/${encodeURIComponent(toolsetId)}/authorize`,
      { serverName }
    )
  }

  status(workspaceId: string, toolsetId: string, serverName: string) {
    return this.http.get<IMcpConsumerOAuthStatus>(
      `${API_MCP_CONSUMER_OAUTH}/${encodeURIComponent(workspaceId)}/${encodeURIComponent(toolsetId)}/status`,
      { params: new HttpParams().set('serverName', serverName) }
    )
  }

  disconnect(workspaceId: string, toolsetId: string, serverName: string) {
    return this.http.delete<IMcpConsumerOAuthStatus>(
      `${API_MCP_CONSUMER_OAUTH}/${encodeURIComponent(workspaceId)}/${encodeURIComponent(toolsetId)}`,
      { params: new HttpParams().set('serverName', serverName) }
    )
  }
}
