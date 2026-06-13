import { inject, Injectable } from '@angular/core'
import { HttpParams } from '@angular/common/http'
import { API_PREFIX } from './constants'
import {
  IPlugin,
  IPluginConfiguration,
  IPluginComponentDefinition,
  IPluginResourceComponentState,
  IPluginResourceInstallResult,
  IPluginDescriptor,
  IPluginInstallInput,
  IPluginInstallResult,
  IPluginLatestVersionStatus,
  IPluginUpdateResult,
  PluginResourceInstallWorkspaceInput,
  PluginResourceInstallXpertInput,
  PluginComponentType
} from './types'
import { OrganizationBaseCrudService } from './organization-base-crud.service'

const API_BASE = API_PREFIX + '/plugin'

export type IPluginMarketplaceSourceType = 'url' | 'github' | 'git'
export type IPluginMarketplaceSourceResponseType = IPluginMarketplaceSourceType | 'platform'
export type IPluginMarketplaceRegistrySection = 'marketplace' | 'official' | 'partner' | 'community'

export interface IPluginMarketplaceSource {
  id: string
  name: string
  type: IPluginMarketplaceSourceResponseType
  url: string
  ref?: string | null
  sparsePath?: string | null
  enabled: boolean
  priority: number
  lastIndexStatus?: string | null
  lastIndexedAt?: string | null
  lastIndexError?: string | null
  builtin?: boolean
}

export interface IPluginMarketplaceSourceInput {
  name?: string
  type: IPluginMarketplaceSourceType
  url: string
  ref?: string | null
  sparsePath?: string | null
  enabled?: boolean
  priority?: number
}

export interface IPluginMarketplaceRegistryItem {
  id: string
  packageName: string
  version?: string | null
  displayName: string
  description: string
  category: string
  author: string
  icon?: unknown
  keywords: string[]
  homepage?: string | null
  repository?: unknown
  targetApps: string[]
  targetAppMeta: Record<string, unknown>
  enabled: boolean
  priority: number
  section: IPluginMarketplaceRegistrySection
  downloads?: Record<string, unknown> | null
  downloadsStatus?: string | null
  downloadsUpdatedAt?: string | null
  downloadsError?: string | null
  createdAt?: string | null
  updatedAt?: string | null
}

export interface IPluginMarketplaceRegistryItemInput {
  packageName?: string
  version?: string | null
  displayName?: string
  description?: string
  category?: string
  author?: string
  icon?: unknown
  keywords?: string[]
  homepage?: string | null
  repository?: unknown
  targetApps?: string[]
  targetAppMeta?: Record<string, unknown> | null
  enabled?: boolean
  priority?: number
  section?: IPluginMarketplaceRegistrySection
}

export interface IPluginMarketplaceResponse {
  updatedAt: string | null
  total: number
  items: any[]
  sources: IPluginMarketplaceSource[]
  official?: string[]
  partner?: string[]
  community?: string[]
  errors?: Array<{ sourceId: string; sourceName: string; message: string }>
}

@Injectable({ providedIn: 'root' })
export class PluginAPIService extends OrganizationBaseCrudService<IPlugin> {
  constructor() {
    super(API_BASE)
  }

  getPlugins() {
    return this.httpClient.get<IPluginDescriptor[]>(this.apiBaseUrl)
  }

  getPluginComponents(pluginName: string) {
    return this.httpClient.get<{ items: IPluginComponentDefinition[] }>(
      `${this.apiBaseUrl}/${encodeURIComponent(pluginName)}/components`
    )
  }

  getPluginResourceStates(
    pluginName: string,
    params:
      | { target: 'workspace'; workspaceId: string }
      | { target: 'xpert'; workspaceId?: string; xpertId: string; agentKey?: string }
  ) {
    let httpParams = new HttpParams().set('target', params.target)
    if (params.workspaceId) {
      httpParams = httpParams.set('workspaceId', params.workspaceId)
    }
    if (params.target === 'xpert') {
      httpParams = httpParams.set('xpertId', params.xpertId)
      if (params.agentKey) {
        httpParams = httpParams.set('agentKey', params.agentKey)
      }
    }

    return this.httpClient.get<{ items: IPluginResourceComponentState[] }>(
      `${this.apiBaseUrl}/${encodeURIComponent(pluginName)}/resources/state`,
      {
        params: httpParams
      }
    )
  }

  installResourcesToWorkspace(pluginName: string, input: PluginResourceInstallWorkspaceInput) {
    return this.httpClient.post<IPluginResourceInstallResult>(
      `${this.apiBaseUrl}/${encodeURIComponent(pluginName)}/resources/install-workspace`,
      input
    )
  }

  installResourcesToXpert(pluginName: string, input: PluginResourceInstallXpertInput) {
    return this.httpClient.post<IPluginResourceInstallResult>(
      `${this.apiBaseUrl}/${encodeURIComponent(pluginName)}/resources/install-xpert`,
      input
    )
  }

  getMarketplace(params?: { targetApp?: string; sourceId?: string; search?: string }) {
    let httpParams = new HttpParams()
    if (params?.targetApp) {
      httpParams = httpParams.set('targetApp', params.targetApp)
    }
    if (params?.sourceId) {
      httpParams = httpParams.set('sourceId', params.sourceId)
    }
    if (params?.search) {
      httpParams = httpParams.set('search', params.search)
    }

    return this.httpClient.get<IPluginMarketplaceResponse>(`${this.apiBaseUrl}/marketplace`, {
      params: httpParams
    })
  }

  getMarketplaceSources() {
    return this.httpClient.get<{ items: IPluginMarketplaceSource[] }>(`${this.apiBaseUrl}/marketplace/sources`)
  }

  createMarketplaceSource(input: IPluginMarketplaceSourceInput) {
    return this.httpClient.post<IPluginMarketplaceSource>(`${this.apiBaseUrl}/marketplace/sources`, input)
  }

  refreshMarketplaceSource(sourceId: string) {
    return this.httpClient.post<IPluginMarketplaceSource>(
      `${this.apiBaseUrl}/marketplace/sources/${encodeURIComponent(sourceId)}/refresh`,
      {}
    )
  }

  refreshMarketplaceSources() {
    return this.httpClient.post<{
      items: Array<IPluginMarketplaceSource & { total?: number }>
      errors?: Array<{ sourceId: string; sourceName: string; message: string }>
    }>(`${this.apiBaseUrl}/marketplace/sources/refresh`, {})
  }

  getMarketplaceRegistryItems() {
    return this.httpClient.get<{ items: IPluginMarketplaceRegistryItem[] }>(`${this.apiBaseUrl}/marketplace/registry`)
  }

  createMarketplaceRegistryItem(input: IPluginMarketplaceRegistryItemInput) {
    return this.httpClient.post<IPluginMarketplaceRegistryItem>(`${this.apiBaseUrl}/marketplace/registry`, input)
  }

  updateMarketplaceRegistryItem(id: string, input: IPluginMarketplaceRegistryItemInput) {
    return this.httpClient.put<IPluginMarketplaceRegistryItem>(
      `${this.apiBaseUrl}/marketplace/registry/${encodeURIComponent(id)}`,
      input
    )
  }

  deleteMarketplaceRegistryItem(id: string) {
    return this.httpClient.delete<{ success: boolean }>(
      `${this.apiBaseUrl}/marketplace/registry/${encodeURIComponent(id)}`
    )
  }

  install(input: IPluginInstallInput) {
    return this.httpClient.post<IPluginInstallResult>(this.apiBaseUrl, input)
  }

  installArchive(file: File, config?: Record<string, any>) {
    const formData = new FormData()
    formData.append('file', file, file.name || 'plugin-archive')
    if (config) {
      formData.append('config', JSON.stringify(config))
    }

    return this.httpClient.post<IPluginInstallResult>(`${this.apiBaseUrl}/archive`, formData)
  }

  getByNames(names: string[]) {
    return this.httpClient.post<IPluginDescriptor[]>(`${this.apiBaseUrl}/by-names`, { names })
  }

  getLatestVersions(names?: string[]) {
    return this.httpClient.post<IPluginLatestVersionStatus[]>(`${this.apiBaseUrl}/latest-versions`, {
      ...(names?.length ? { names } : {})
    })
  }

  getConfiguration(pluginName: string) {
    return this.httpClient.post<IPluginConfiguration>(`${this.apiBaseUrl}/configuration`, { pluginName })
  }

  saveConfiguration(pluginName: string, config: Record<string, any>) {
    return this.httpClient.put<IPluginConfiguration>(`${this.apiBaseUrl}/configuration`, { pluginName, config })
  }

  update(pluginName: string) {
    return this.httpClient.post<IPluginUpdateResult>(`${this.apiBaseUrl}/update`, { pluginName })
  }

  refresh(pluginName: string) {
    return this.httpClient.post<IPluginInstallResult>(`${this.apiBaseUrl}/refresh`, { pluginName })
  }

  uninstall(names: string[], organizationId?: string) {
    return this.httpClient.delete<void>(`${this.apiBaseUrl}/uninstall`, {
      body: { names, ...(organizationId ? { organizationId } : {}) }
    })
  }
}

export function injectPluginAPI() {
  return inject(PluginAPIService)
}
