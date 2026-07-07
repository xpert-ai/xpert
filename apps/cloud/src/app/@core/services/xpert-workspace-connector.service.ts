import { HttpClient } from '@angular/common/http'
import { inject, Injectable } from '@angular/core'
import type {
  ConnectorAppIntegrationSelectOption,
  ConnectorDefinition,
  ConnectorInstance,
  ConnectorOAuthStatusResponse,
  ConnectorOAuthStartRequest,
  ConnectorOAuthStartResponse,
  ConnectorSelectOption
} from '@xpert-ai/plugin-sdk'
import { API_XPERT_WORKSPACE } from '../constants/app.constants'

@Injectable({ providedIn: 'root' })
export class XpertWorkspaceConnectorService {
  readonly #http = inject(HttpClient)

  list(workspaceId: string) {
    return this.#http.get<ConnectorInstance[]>(`${API_XPERT_WORKSPACE}/${workspaceId}/connectors`)
  }

  definitions(workspaceId: string) {
    return this.#http.get<ConnectorDefinition[]>(`${API_XPERT_WORKSPACE}/${workspaceId}/connectors/definitions`)
  }

  selectOptions(workspaceId: string, provider: string) {
    return this.#http.get<ConnectorSelectOption[]>(`${API_XPERT_WORKSPACE}/${workspaceId}/connectors/select-options`, {
      params: { provider }
    })
  }

  appIntegrationSelectOptions(workspaceId: string, provider: string) {
    return this.#http.get<ConnectorAppIntegrationSelectOption[]>(
      `${API_XPERT_WORKSPACE}/${workspaceId}/connectors/${provider}/app-integrations/select-options`
    )
  }

  connect(workspaceId: string, provider: string, input: ConnectorOAuthStartRequest) {
    return this.#http.post<ConnectorOAuthStartResponse>(
      `${API_XPERT_WORKSPACE}/${workspaceId}/connectors/${provider}/connect`,
      input
    )
  }

  pollAuthorization(workspaceId: string, connectorId: string) {
    return this.#http.get<ConnectorOAuthStatusResponse>(
      `${API_XPERT_WORKSPACE}/${workspaceId}/connectors/${connectorId}/authorization-status`
    )
  }

  disconnect(workspaceId: string, connectorId: string) {
    return this.#http.delete<void>(`${API_XPERT_WORKSPACE}/${workspaceId}/connectors/${connectorId}`)
  }
}
