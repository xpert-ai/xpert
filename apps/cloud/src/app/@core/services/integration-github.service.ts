import { HttpClient } from '@angular/common/http'
import { inject, Injectable } from '@angular/core'
import { API_PREFIX, Repository, TRepositoryReturn } from '@metad/cloud/state'
import { NGXLogger } from 'ngx-logger'

const API_INTEGRATION = API_PREFIX + '/github'

@Injectable({ providedIn: 'root' })
export class IntegrationGitHubService {
  readonly #logger = inject(NGXLogger)
  readonly #httpClient = inject(HttpClient)

  getRepositories(integrationId: string, installationId: string, page: number, perPage: number) {
    return this.#httpClient.get<TRepositoryReturn>(`${API_INTEGRATION}/${integrationId}/repositories`, {
      params: { installationId, page, perPage }
    })
  }
}

export function injectGitHubAPI() {
  return inject(IntegrationGitHubService)
}
