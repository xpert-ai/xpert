import { inject, Injectable } from "@angular/core"
import { API_PREFIX } from "./constants"
import { IPlugin, PluginMeta } from "./types"
import { OrganizationBaseCrudService } from "./organization-base-crud.service"

const API_BASE = API_PREFIX + '/plugin'

@Injectable({ providedIn: 'root' })
export class PluginAPIService extends OrganizationBaseCrudService<IPlugin> {
  constructor() {
    super(API_BASE)
  }

  getPlugins() {
    return this.httpClient.get<{name: string; meta: PluginMeta; isGlobal: boolean;}[]>(this.apiBaseUrl)
  }

  getByNames(names: string[]) {
    return this.httpClient.post<{name: string; meta: PluginMeta}[]>(`${this.apiBaseUrl}/by-names`, { names })
  }

  uninstall(names: string[]) {
    return this.httpClient.delete<void>(`${this.apiBaseUrl}/uninstall`, { body: { names } })
  }
}

export function injectPluginAPI() {
    return inject(PluginAPIService)
}