import { HttpClient, HttpParams } from '@angular/common/http'
import { inject, Injectable } from '@angular/core'
import {
  PluginApplicationUpdateInput,
  PluginApplicationUpdateProgress,
  PluginApplicationScope,
  getPluginApplicationScopes,
  PluginApplicationCatalogItem,
  PluginApplicationDetail,
  PluginApplicationInitializeInput,
  PluginApplicationSetupInput,
  PluginApplicationBindToolsetInput,
  PluginApplicationStatusSummary
} from '@xpert-ai/contracts'
import { API_PREFIX } from '@cloud/app/@core/state'
import { forkJoin, map, tap } from 'rxjs'
import { XpertWorkspaceService } from './xpert-workspace.service'
import { XpertAPIService } from './xpert.service'

/** Typed client for the host-governed plugin application control plane. */
@Injectable({ providedIn: 'root' })
export class PluginApplicationService {
  readonly #http = inject(HttpClient)
  readonly #workspaces = inject(XpertWorkspaceService)
  readonly #xperts = inject(XpertAPIService)

  getStatuses(installationScope?: PluginApplicationScope) {
    return this.#http.get<PluginApplicationStatusSummary[]>(`${API_PREFIX}/plugin-applications/status`, {
      params: this.scopeParams(installationScope)
    })
  }

  getCatalog() {
    const url = `${API_PREFIX}/plugin-applications/catalog`
    return forkJoin([
      this.#http.get<PluginApplicationCatalogItem[]>(url),
      this.#http.get<PluginApplicationCatalogItem[]>(url, { params: this.scopeParams('personal') })
    ]).pipe(
      map(([defaults, personal]) =>
        defaults.map((item) =>
          getPluginApplicationScopes(item.application.config.scope).includes('personal')
            ? (personal.find((candidate) => candidate.application.id === item.application.id) ?? item)
            : item
        )
      )
    )
  }

  getDetail(pluginName: string, appName: string, installationScope?: PluginApplicationScope) {
    const params = this.scopeParams(installationScope).set('pluginName', pluginName).set('appName', appName)
    return this.#http.get<PluginApplicationDetail>(`${API_PREFIX}/plugin-applications/detail`, { params })
  }

  private scopeParams(installationScope?: PluginApplicationScope) {
    return installationScope ? new HttpParams().set('installationScope', installationScope) : new HttpParams()
  }

  getUpdateProgress(input: PluginApplicationSetupInput) {
    const params = this.scopeParams(input.installationScope)
      .set('pluginName', input.pluginName)
      .set('appName', input.appName)
    return this.#http.get<PluginApplicationUpdateProgress | null>(`${API_PREFIX}/plugin-applications/update`, {
      params
    })
  }

  updateApplication(input: PluginApplicationUpdateInput) {
    return this.#http.post<PluginApplicationUpdateProgress>(`${API_PREFIX}/plugin-applications/update`, input).pipe(
      tap((release) => {
        if (release.status === 'completed') {
          this.#workspaces.refresh()
          this.#xperts.refresh()
        }
      })
    )
  }

  initialize(input: PluginApplicationInitializeInput) {
    return this.#http.post<PluginApplicationStatusSummary>(`${API_PREFIX}/plugin-applications/initialize`, input).pipe(
      tap((status) => {
        if (status.status === 'ready') {
          this.#workspaces.refresh()
          this.#xperts.refresh()
        }
      })
    )
  }

  prepare(input: PluginApplicationSetupInput) {
    return this.#http.post<PluginApplicationStatusSummary>(`${API_PREFIX}/plugin-applications/prepare`, input)
  }

  bindToolset(input: PluginApplicationBindToolsetInput) {
    return this.#http.post<PluginApplicationStatusSummary>(`${API_PREFIX}/plugin-applications/bind-toolset`, input)
  }

  discardConfiguration(input: PluginApplicationSetupInput) {
    return this.#http
      .post<PluginApplicationStatusSummary>(`${API_PREFIX}/plugin-applications/discard-configuration`, input)
      .pipe(tap(() => this.#workspaces.refresh()))
  }
}
