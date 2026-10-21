import { Injectable, inject } from '@angular/core'
import { HttpClient } from '@angular/common/http'
import type {
  AnalyticsConfigurableProvider,
  AnalyticsDefinitionCreate,
  AnalyticsDefinitionPublish,
  AnalyticsSourceSummary,
  IAnalyticsDefinition,
  IAnalyticsDefinitionVersion,
  JSONValue
} from '@xpert-ai/contracts'
import { API_PREFIX } from '../state/constants'
export interface DefinitionPage {
  items: IAnalyticsDefinition[]
  total: number
  page: number
  pageSize: number
}
export interface DefinitionVersionResult {
  definition: IAnalyticsDefinition
  version: IAnalyticsDefinitionVersion
}
@Injectable({ providedIn: 'root' })
export class AnalyticsDefinitionsService {
  private readonly http = inject(HttpClient)
  private readonly url = `${API_PREFIX}/analytics/definitions`
  providers() {
    return this.http.get<AnalyticsConfigurableProvider[]>(`${this.url}/providers`)
  }
  list(page: number) {
    return this.http.get<DefinitionPage>(this.url, { params: { page, pageSize: 50 } })
  }
  version(id: string, versionId: string) {
    return this.http.get<DefinitionVersionResult>(`${this.url}/${id}/versions/${versionId}`)
  }
  history(id: string, page: number) {
    return this.http.get<{ items: Omit<IAnalyticsDefinitionVersion, 'options'>[]; total: number }>(
      `${this.url}/${id}/versions`,
      { params: { page, pageSize: 50 } }
    )
  }
  validate(input: AnalyticsDefinitionCreate) {
    return this.http.post<{ options: Record<string, JSONValue> }>(`${this.url}/validate`, input)
  }
  create(input: AnalyticsDefinitionCreate) {
    return this.http.post<DefinitionVersionResult>(this.url, input)
  }
  publish(id: string, input: AnalyticsDefinitionPublish) {
    return this.http.post<DefinitionVersionResult>(`${this.url}/${id}/versions`, input)
  }
  status(id: string, status: IAnalyticsDefinition['status']) {
    return this.http.patch<IAnalyticsDefinition>(`${this.url}/${id}`, { status })
  }
  sources() {
    return this.http.get<AnalyticsSourceSummary[]>(`${API_PREFIX}/analytics/sources`)
  }
}
