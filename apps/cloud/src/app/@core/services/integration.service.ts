import { inject, Injectable } from '@angular/core'
import { API_PREFIX, OrganizationBaseCrudService } from '@metad/cloud/state'
import { IIntegration } from '@metad/contracts'
import { NGXLogger } from 'ngx-logger'

const API_INTEGRATION = API_PREFIX + '/integration'

@Injectable({ providedIn: 'root' })
export class IntegrationService extends OrganizationBaseCrudService<IIntegration> {
  readonly #logger = inject(NGXLogger)

  constructor() {
    super(API_INTEGRATION)
  }

  test(integration: Partial<IIntegration>) {
    return this.httpClient.post(API_PREFIX + `/${integration.provider}/test`, integration)
  }
}

export function injectIntegrationAPI() {
  return inject(IntegrationService)
}