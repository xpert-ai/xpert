import { HttpClient } from '@angular/common/http'
import { inject, Injectable } from '@angular/core'
import type { SetupPluginCatalogQuery, SetupPluginCatalogResponse, SetupPluginsResponse } from '@xpert-ai/contracts'
import { API_PREFIX } from '../state/constants'

@Injectable({ providedIn: 'root' })
export class SetupPluginsService {
  readonly #http = inject(HttpClient)
  status() {
    return this.#http.get<SetupPluginsResponse>(`${API_PREFIX}/system/setup/plugins`)
  }
  catalog(query: SetupPluginCatalogQuery) {
    const params = Object.fromEntries(
      Object.entries(query)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => [key, String(value)])
    )
    return this.#http.get<SetupPluginCatalogResponse>(`${API_PREFIX}/system/setup/plugins/catalog`, { params })
  }

  start(plugins: string[], importDefaultAgentPlugins = true) {
    return this.#http.post<SetupPluginsResponse>(`${API_PREFIX}/system/setup/plugins`, {
      plugins,
      importDefaultAgentPlugins
    })
  }
}
