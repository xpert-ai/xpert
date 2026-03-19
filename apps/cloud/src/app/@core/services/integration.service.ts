import { inject, Injectable } from '@angular/core'
import { API_PREFIX, OrganizationBaseCrudService } from '@metad/cloud/state'
import { IIntegration, IntegrationFeatureEnum, TIntegrationProvider } from '@metad/contracts'
import { TSelectOption } from '@metad/ocap-angular/core'
import { NGXLogger } from 'ngx-logger'
import { Observable } from 'rxjs'

const API_INTEGRATION = API_PREFIX + '/integration'

export interface IntegrationTestResult {
  webhookUrl?: string
  mode?: string
  capabilities?: Record<string, boolean>
  warnings?: string[]
  probe?: {
    connectionMode: 'webhook' | 'long_connection'
    connected: boolean
    state: 'connected' | 'failed'
    checkedAt: number
    endpointValidated: boolean
    lastError?: string | null
    recoverable?: boolean
  }
}

export interface LarkRuntimeStatus {
  integrationId: string
  connectionMode: 'webhook' | 'long_connection'
  connected: boolean
  state: 'idle' | 'connecting' | 'connected' | 'retrying' | 'unhealthy'
  ownerInstanceId?: string | null
  lastConnectedAt?: number | null
  lastError?: string | null
  failureCount?: number
  nextReconnectAt?: number | null
  disabledReason?: string | null
  capabilities?: Record<string, boolean>
}

@Injectable({ providedIn: 'root' })
export class IntegrationService extends OrganizationBaseCrudService<IIntegration> {
  readonly #logger = inject(NGXLogger)

  constructor() {
    super(API_INTEGRATION)
  }

  test(integration: Partial<IIntegration>): Observable<IntegrationTestResult> {
    // return this.httpClient.post(API_PREFIX + `/${integration.provider}/test`, integration)
    return this.httpClient.post<IntegrationTestResult>(API_INTEGRATION + '/test', integration)
  }

  selectOptions(options: {provider?: string; features?: IntegrationFeatureEnum[]}) {
    const params = {}
    if (options.provider) {
      params['provider'] = options.provider
    }
    if (options.features) {
      params['features'] = options.features.join(',')
    }

    return this.httpClient.get<TSelectOption<string>[]>(this.apiBaseUrl + '/select-options', { params })
  }

  getProviders() {
    return this.httpClient.get<TIntegrationProvider[]>(this.apiBaseUrl + '/providers')
  }

  getLarkRuntimeStatus(id: string) {
    return this.httpClient.get<LarkRuntimeStatus>(`${API_PREFIX}/lark/${id}/runtime-status`)
  }

  reconnectLarkRuntimeStatus(id: string) {
    return this.httpClient.post<LarkRuntimeStatus>(`${API_PREFIX}/lark/${id}/runtime-status/reconnect`, {})
  }
}

export function injectIntegrationAPI() {
  return inject(IntegrationService)
}
