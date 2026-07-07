import { HttpClient } from '@angular/common/http'
import { inject, Injectable } from '@angular/core'
import type {
  ConnectorDefinition,
  ConnectorInstance,
  ConnectorOAuthStatusResponse,
  ConnectorOAuthStartRequest,
  ConnectorOAuthStartResponse,
  ConnectorSelectOption
} from '@xpert-ai/plugin-sdk'
import { API_CONNECTOR } from '../constants/app.constants'

@Injectable({ providedIn: 'root' })
export class XpertConnectorService {
  readonly #http = inject(HttpClient)

  list(workspaceId: string) {
    return this.#http.get<ConnectorInstance[]>(`${API_CONNECTOR}/${workspaceId}`)
  }

  definitions(workspaceId: string) {
    return this.#http.get<ConnectorDefinition[]>(`${API_CONNECTOR}/${workspaceId}/definitions`)
  }

  selectOptions(workspaceId: string, provider: string) {
    return this.#http.get<ConnectorSelectOption[]>(`${API_CONNECTOR}/${workspaceId}/select-options`, {
      params: { provider }
    })
  }

  connect(workspaceId: string, provider: string, input: ConnectorOAuthStartRequest) {
    return this.#http.post<ConnectorOAuthStartResponse>(
      `${API_CONNECTOR}/${workspaceId}/${provider}/connect`,
      input
    )
  }

  pollAuthorization(workspaceId: string, connectorId: string) {
    return this.#http.get<ConnectorOAuthStatusResponse>(
      `${API_CONNECTOR}/${workspaceId}/${connectorId}/authorization-status`
    )
  }

  disconnect(workspaceId: string, connectorId: string) {
    return this.#http.delete<void>(`${API_CONNECTOR}/${workspaceId}/${connectorId}`)
  }
}
