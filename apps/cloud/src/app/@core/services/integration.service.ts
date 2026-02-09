import { inject, Injectable } from '@angular/core'
import { API_PREFIX, OrganizationBaseCrudService } from '@metad/cloud/state'
import { IIntegration, IntegrationFeatureEnum, TIntegrationProvider } from '@metad/contracts'
import { TSelectOption } from '@metad/ocap-angular/core'
import { NGXLogger } from 'ngx-logger'

const API_INTEGRATION = API_PREFIX + '/integration'

@Injectable({ providedIn: 'root' })
export class IntegrationService extends OrganizationBaseCrudService<IIntegration> {
  readonly #logger = inject(NGXLogger)

  constructor() {
    super(API_INTEGRATION)
  }

  test(integration: Partial<IIntegration>) {
    return this.httpClient.post(this.apiBaseUrl + `/test`, integration)
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