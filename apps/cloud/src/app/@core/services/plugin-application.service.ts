import { HttpClient, HttpParams } from '@angular/common/http'
import { inject, Injectable } from '@angular/core'
import {
  PluginApplicationCatalogItem,
  PluginApplicationDetail,
  PluginApplicationInitializeInput,
  PluginApplicationStatusSummary
} from '@xpert-ai/contracts'
import { API_PREFIX } from '@cloud/app/@core/state'

/** Typed client for the host-governed plugin application control plane. */
@Injectable({ providedIn: 'root' })
export class PluginApplicationService {
  readonly #http = inject(HttpClient)

  getStatuses() {
    return this.#http.get<PluginApplicationStatusSummary[]>(`${API_PREFIX}/plugin-applications/status`)
  }

  getCatalog() {
    return this.#http.get<PluginApplicationCatalogItem[]>(`${API_PREFIX}/plugin-applications/catalog`)
  }

  getDetail(pluginName: string, appName: string) {
    const params = new HttpParams().set('pluginName', pluginName).set('appName', appName)
    return this.#http.get<PluginApplicationDetail>(`${API_PREFIX}/plugin-applications/detail`, { params })
  }

  initialize(input: PluginApplicationInitializeInput) {
    return this.#http.post<PluginApplicationStatusSummary>(`${API_PREFIX}/plugin-applications/initialize`, input)
  }
}
