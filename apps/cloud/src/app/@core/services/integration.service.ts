import { inject, Injectable } from '@angular/core'
import { API_PREFIX, OrganizationBaseCrudService } from '@metad/cloud/state'
import { IIntegration, IntegrationFeatureEnum, TIntegrationProvider } from '@metad/contracts'
import { TSelectOption } from '@metad/ocap-angular/core'
import { Observable } from 'rxjs'

const API_INTEGRATION = API_PREFIX + '/integration'

export interface IntegrationTestProbe {
  connected?: boolean
  state?: string
  lastError?: string | null
  checkedAt?: number | null
}

export interface IntegrationTestResult {
  webhookUrl?: string
  mode?: string
  warnings?: string[]
  probe?: IntegrationTestProbe
}

export type IntegrationTestFormPatch = Partial<
  Pick<IIntegration, 'name' | 'avatar' | 'description' | 'slug' | 'provider' | 'options' | 'features'>
>

export type IntegrationTestResponse = IntegrationTestResult & IntegrationTestFormPatch

export function normalizeIntegrationTestResult(
  result?: Partial<IntegrationTestResponse> | null
): IntegrationTestResult | null {
  if (!result) {
    return null
  }

  const normalized: IntegrationTestResult = {}

  if (result.webhookUrl !== undefined) {
    normalized.webhookUrl = result.webhookUrl
  }
  if (result.mode !== undefined) {
    normalized.mode = result.mode
  }
  if (Array.isArray(result.warnings)) {
    normalized.warnings = [...result.warnings]
  }
  if (result.probe) {
    normalized.probe = {
      connected: result.probe.connected,
      state: result.probe.state,
      lastError: result.probe.lastError ?? null,
      checkedAt: result.probe.checkedAt ?? null
    }
  }

  return Object.keys(normalized).length ? normalized : null
}

export function pickIntegrationTestFormPatch(
  result?: Partial<IntegrationTestResponse> | null
): IntegrationTestFormPatch {
  if (!result) {
    return {}
  }

  const patch: IntegrationTestFormPatch = {}

  if (result.name !== undefined) {
    patch.name = result.name
  }
  if (result.avatar !== undefined) {
    patch.avatar = result.avatar
  }
  if (result.description !== undefined) {
    patch.description = result.description
  }
  if (result.slug !== undefined) {
    patch.slug = result.slug
  }
  if (result.provider !== undefined) {
    patch.provider = result.provider
  }
  if (result.options !== undefined) {
    patch.options = result.options
  }
  if (result.features !== undefined) {
    patch.features = result.features
  }

  return patch
}

@Injectable({ providedIn: 'root' })
export class IntegrationService extends OrganizationBaseCrudService<IIntegration> {
  constructor() {
    super(API_INTEGRATION)
  }

  test(integration: Partial<IIntegration>): Observable<IntegrationTestResponse> {
    // return this.httpClient.post(API_PREFIX + `/${integration.provider}/test`, integration)
    return this.httpClient.post<IntegrationTestResponse>(API_INTEGRATION + '/test', integration)
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
}

export function injectIntegrationAPI() {
  return inject(IntegrationService)
}
