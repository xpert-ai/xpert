import { inject, Injectable } from '@angular/core'
import { API_PREFIX, OrganizationBaseCrudService } from '@metad/cloud/state'
import { IIntegration, IntegrationFeatureEnum, TIntegrationProvider } from '@metad/contracts'
import { TSelectOption } from '@metad/ocap-angular/core'
import { Observable } from 'rxjs'

const API_INTEGRATION = API_PREFIX + '/integration'

export type IntegrationViewTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

export type IntegrationViewItemType = 'text' | 'boolean' | 'datetime' | 'paragraph' | 'badge'

export interface IntegrationViewItem {
  key: string
  type: IntegrationViewItemType
  label?: string
  value: string | number | boolean | null
  emphasis?: boolean
}

export interface IntegrationAction {
  key: string
  label: string
  variant: 'flat' | 'stroked' | 'raised'
  color?: 'primary' | 'warn' | 'default'
  requiresSaved?: boolean
  hiddenWhenDirty?: boolean
  confirmText?: string
}

export interface IntegrationViewSection {
  key: string
  title: string
  tone: IntegrationViewTone
  items?: IntegrationViewItem[]
  messages?: string[]
  actions?: IntegrationAction[]
}

export interface IntegrationTestView {
  webhookUrl?: string
  mode?: string
  sections: IntegrationViewSection[]
}

export interface IntegrationRuntimeView {
  supported: boolean
  state?: string
  connected?: boolean
  sections: IntegrationViewSection[]
  actions?: IntegrationAction[]
}

@Injectable({ providedIn: 'root' })
export class IntegrationService extends OrganizationBaseCrudService<IIntegration> {
  constructor() {
    super(API_INTEGRATION)
  }

  test(integration: Partial<IIntegration>): Observable<IntegrationTestView> {
    return this.httpClient.post<IntegrationTestView>(API_INTEGRATION + '/test', integration)
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

  getRuntimeView(id: string) {
    return this.httpClient.get<IntegrationRuntimeView>(`${API_INTEGRATION}/${id}/runtime`)
  }

  runRuntimeAction(id: string, action: string, payload?: unknown) {
    return this.httpClient.post<IntegrationRuntimeView>(`${API_INTEGRATION}/${id}/runtime/action`, { action, payload })
  }
}

export function injectIntegrationAPI() {
  return inject(IntegrationService)
}
