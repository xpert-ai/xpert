import { HttpClient, HttpParams } from '@angular/common/http'
import { inject, Injectable } from '@angular/core'
import type {
  ConnectorConnectRequest,
  ConnectorConnectResponse,
  ConnectorBinding,
  ConnectorBindingCreateRequest,
  ConnectorInstance,
  ConnectorOAuthStatusResponse,
  ConnectorPersonalAccountInstance,
  ConnectorRuntimeOptions,
  ConnectorScopeType,
  ConnectorSelectOption,
  ConnectorStrategyDefinition
} from '@xpert-ai/plugin-sdk'
import { API_CONNECTOR } from '../constants/app.constants'

@Injectable({ providedIn: 'root' })
export class XpertConnectorService {
  readonly #http = inject(HttpClient)

  list(workspaceId: string) {
    return this.#http.get<ConnectorInstance[]>(`${API_CONNECTOR}/${workspaceId}`)
  }

  definitions(workspaceId: string) {
    return this.#http.get<ConnectorStrategyDefinition[]>(`${API_CONNECTOR}/${workspaceId}/definitions`)
  }

  selectOptions(workspaceId: string, provider: string) {
    return this.#http.get<ConnectorSelectOption[]>(`${API_CONNECTOR}/${workspaceId}/select-options`, {
      params: { provider }
    })
  }

  connect(workspaceId: string, provider: string, input: ConnectorConnectRequest) {
    return this.#http.post<ConnectorConnectResponse>(`${API_CONNECTOR}/${workspaceId}/${provider}/connect`, input)
  }

  pollAuthorization(workspaceId: string, connectorId: string) {
    return this.#http.get<ConnectorOAuthStatusResponse>(
      `${API_CONNECTOR}/${workspaceId}/${connectorId}/authorization-status`
    )
  }

  disconnect(workspaceId: string, connectorId: string) {
    return this.#http.delete<void>(`${API_CONNECTOR}/${workspaceId}/${connectorId}`)
  }

  cancelAuthorization(workspaceId: string, connectorId: string) {
    return this.#http.post<void>(`${API_CONNECTOR}/${workspaceId}/${connectorId}/cancel-authorization`, {})
  }

  listBindings(scopeType: ConnectorScopeType, scopeId: string) {
    return this.#http.get<ConnectorBinding[]>(`${API_CONNECTOR}/bindings`, {
      params: { scopeType, scopeId }
    })
  }

  scopedDefinitions(scopeType: ConnectorScopeType, scopeId: string) {
    return this.#http.get<ConnectorStrategyDefinition[]>(`${API_CONNECTOR}/definitions`, {
      params: { scopeType, scopeId }
    })
  }

  createBinding(input: ConnectorBindingCreateRequest) {
    return this.#http.post<ConnectorBinding>(`${API_CONNECTOR}/bindings`, input)
  }

  deleteBinding(bindingId: string) {
    return this.#http.delete<void>(`${API_CONNECTOR}/bindings/${bindingId}`)
  }

  connectBinding(bindingId: string, input: ConnectorConnectRequest & { xpertId?: string }) {
    return this.#http.post<ConnectorConnectResponse>(`${API_CONNECTOR}/bindings/${bindingId}/connect`, input)
  }

  bindingAuthorizationStatus(bindingId: string, xpertId?: string) {
    const params = xpertId ? new HttpParams().set('xpertId', xpertId) : undefined
    return this.#http.get<ConnectorOAuthStatusResponse>(`${API_CONNECTOR}/bindings/${bindingId}/authorization-status`, {
      params
    })
  }

  cancelBindingAuthorization(bindingId: string, xpertId?: string) {
    return this.#http.post<void>(`${API_CONNECTOR}/bindings/${bindingId}/cancel-authorization`, {
      ...(xpertId ? { xpertId } : {})
    })
  }

  consentToBinding(bindingId: string, xpertId?: string) {
    return this.#http.post<ConnectorBinding>(`${API_CONNECTOR}/bindings/${bindingId}/consent`, {
      ...(xpertId ? { xpertId } : {})
    })
  }

  runtimeOptions(xpertId: string, projectId?: string | null) {
    let params = new HttpParams().set('xpertId', xpertId)
    if (projectId) {
      params = params.set('projectId', projectId)
    }
    return this.#http.get<ConnectorRuntimeOptions>(`${API_CONNECTOR}/runtime-options`, { params })
  }

  personalAccounts() {
    return this.#http.get<ConnectorPersonalAccountInstance[]>(`${API_CONNECTOR}/personal-accounts`)
  }

  disconnectPersonalAccount(accountId: string) {
    return this.#http.delete<void>(`${API_CONNECTOR}/personal-accounts/${accountId}`)
  }
}
