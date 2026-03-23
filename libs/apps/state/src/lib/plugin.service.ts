import { inject, Injectable } from '@angular/core'
import { API_PREFIX } from './constants'
import { IPlugin, IPluginConfiguration, IPluginDescriptor } from './types'
import { OrganizationBaseCrudService } from './organization-base-crud.service'

const API_BASE = API_PREFIX + '/plugin'

@Injectable({ providedIn: 'root' })
export class PluginAPIService extends OrganizationBaseCrudService<IPlugin> {
  constructor() {
    super(API_BASE)
  }

  getPlugins() {
    return this.httpClient.get<IPluginDescriptor[]>(this.apiBaseUrl)
  }

  getByNames(names: string[]) {
    return this.httpClient.post<IPluginDescriptor[]>(`${this.apiBaseUrl}/by-names`, { names })
  }

  getConfiguration(pluginName: string) {
    return this.httpClient.post<IPluginConfiguration>(`${this.apiBaseUrl}/configuration`, { pluginName })
  }

  saveConfiguration(pluginName: string, config: Record<string, any>) {
    return this.httpClient.put<IPluginConfiguration>(`${this.apiBaseUrl}/configuration`, { pluginName, config })
  }

  update(pluginName: string) {
    return this.httpClient.post<{
      success: boolean
      updated: boolean
      previousVersion?: string
      currentVersion?: string
      latestVersion?: string
    }>(`${this.apiBaseUrl}/update`, { pluginName })
  }

  uninstall(names: string[]) {
    return this.httpClient.delete<void>(`${this.apiBaseUrl}/uninstall`, { body: { names } })
  }
}

export function injectPluginAPI() {
  return inject(PluginAPIService)
}
