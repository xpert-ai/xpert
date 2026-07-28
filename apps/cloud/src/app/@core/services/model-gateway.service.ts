import { HttpClient, HttpParams } from '@angular/common/http'
import { inject, Injectable } from '@angular/core'
import {
  IModelAccessRequest,
  IModelGatewayAdminQuery,
  IModelGatewayAdminSettings,
  IModelGatewayApiKey,
  IModelGatewayApiKeyCreated,
  IModelGatewayCall,
  IModelGatewayCallBody,
  IModelGatewayCatalog,
  IPagination,
  IUserModelGrant,
  TModelGatewayApiKeyCreateInput,
  TModelGatewayApiKeyRevokeInput,
  TModelGatewayExternalRequestCreateInput,
  TModelGatewaySettingsUpdateInput
} from '@xpert-ai/contracts'
import { API_MODEL_GATEWAY } from '../constants/app.constants'

@Injectable({ providedIn: 'root' })
export class ModelGatewayService {
  readonly #http = inject(HttpClient)

  getCatalog() {
    return this.#http.get<IModelGatewayCatalog>(`${API_MODEL_GATEWAY}/catalog`)
  }

  createRequest(input: TModelGatewayExternalRequestCreateInput) {
    return this.#http.post<IModelAccessRequest | IUserModelGrant>(`${API_MODEL_GATEWAY}/requests`, input)
  }

  getMyRequests() {
    return this.#http.get<IModelAccessRequest[]>(`${API_MODEL_GATEWAY}/requests/my`)
  }

  withdrawRequest(id: string, reason?: string | null) {
    return this.#http.post<IModelAccessRequest>(`${API_MODEL_GATEWAY}/requests/${id}/withdraw`, { reason })
  }

  getMyGrants() {
    return this.#http.get<IUserModelGrant[]>(`${API_MODEL_GATEWAY}/grants/my`)
  }

  getMyKeys() {
    return this.#http.get<IModelGatewayApiKey[]>(`${API_MODEL_GATEWAY}/keys`)
  }

  createKey(input: TModelGatewayApiKeyCreateInput) {
    return this.#http.post<IModelGatewayApiKeyCreated>(`${API_MODEL_GATEWAY}/keys`, input)
  }

  revokeMyKey(id: string, input: TModelGatewayApiKeyRevokeInput = {}) {
    return this.#http.post<IModelGatewayApiKey>(`${API_MODEL_GATEWAY}/keys/${id}/revoke`, input)
  }

  getMyCalls(take = 20, skip = 0) {
    return this.#http.get<IPagination<IModelGatewayCall>>(`${API_MODEL_GATEWAY}/calls/my`, {
      params: this.paginationParams(take, skip)
    })
  }

  getSettings() {
    return this.#http.get<IModelGatewayAdminSettings>(`${API_MODEL_GATEWAY}/admin/settings`)
  }

  updateSettings(input: TModelGatewaySettingsUpdateInput) {
    return this.#http.put<IModelGatewayAdminSettings>(`${API_MODEL_GATEWAY}/admin/settings`, input)
  }

  getAdminKeys(query?: IModelGatewayAdminQuery) {
    return this.#http.get<IPagination<IModelGatewayApiKey>>(`${API_MODEL_GATEWAY}/admin/keys`, {
      params: this.toParams(query)
    })
  }

  revokeAdminKey(id: string, input: TModelGatewayApiKeyRevokeInput = {}) {
    return this.#http.post<IModelGatewayApiKey>(`${API_MODEL_GATEWAY}/admin/keys/${id}/revoke`, input)
  }

  getAdminCalls(query?: IModelGatewayAdminQuery) {
    return this.#http.get<IPagination<IModelGatewayCall>>(`${API_MODEL_GATEWAY}/admin/calls`, {
      params: this.toParams(query)
    })
  }

  getAdminCallBody(id: string) {
    return this.#http.get<IModelGatewayCallBody>(`${API_MODEL_GATEWAY}/admin/calls/${id}/body`)
  }

  private paginationParams(take: number, skip: number) {
    return new HttpParams().set('$take', take).set('$skip', skip)
  }

  private toParams(query?: IModelGatewayAdminQuery) {
    let params = new HttpParams()
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined && value !== null && value !== '') {
        params = params.set(key === 'take' || key === 'skip' ? `$${key}` : key, String(value))
      }
    }
    return params
  }
}
