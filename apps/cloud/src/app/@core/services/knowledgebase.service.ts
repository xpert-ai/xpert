import { HttpClient, HttpParams } from '@angular/common/http'
import { inject, Injectable } from '@angular/core'
import { DocumentInterface } from '@langchain/core/documents'
import { MaxMarginalRelevanceSearchOptions, VectorStoreInterface } from '@langchain/core/vectorstores'
import { API_PREFIX, I18nObject, IKnowledgebase, PaginationParams, toHttpParams } from '@metad/cloud/state'
import { NGXLogger } from 'ngx-logger'
import { switchMap } from 'rxjs/operators'
import { XpertWorkspaceBaseCrudService } from './xpert-workspace.service'

const API_KNOWLEDGEBASE = API_PREFIX + '/knowledgebase'

@Injectable({ providedIn: 'root' })
export class KnowledgebaseService extends XpertWorkspaceBaseCrudService<IKnowledgebase> {
  readonly #logger = inject(NGXLogger)

  constructor() {
    super(API_KNOWLEDGEBASE)
  }

  getMyAllInOrg(options?: PaginationParams<IKnowledgebase>) {
    return this.selectOrganizationId().pipe(
      switchMap(() =>
        this.httpClient.get<{ items: IKnowledgebase[]; total: number }>(this.apiBaseUrl + '/my', {
          params: toHttpParams(options)
        })
      )
    )
  }
  getAllByPublicInOrg(options?: PaginationParams<IKnowledgebase>) {
    return this.selectOrganizationId().pipe(
      switchMap(() =>
        this.httpClient.get<{ items: IKnowledgebase[]; total: number }>(this.apiBaseUrl + '/public', {
          params: toHttpParams(options)
        })
      )
    )
  }

  getTextSplitterStrategies() {
    return this.httpClient.get<{ name: string; label: I18nObject; description?: I18nObject; configSchema?: any; icon: any; helpUrl: string }[]>(this.apiBaseUrl + '/text-splitter/strategies')
  }

  getDocumentTransformerStrategies() {
    return this.httpClient.get<{ name: string; label: I18nObject; description?: I18nObject; configSchema?: any; icon: any; helpUrl: string }[]>(this.apiBaseUrl + '/transformer/strategies')
  }

  getDocumentSourceStrategies() {
    return this.httpClient.get<{ name: string; label: I18nObject; description?: I18nObject; configSchema?: any; icon: any; helpUrl: string }[]>(this.apiBaseUrl + '/source/strategies')
  }

  test(id: string, options: { query: string; k: number; score: number; filter?: Record<string, unknown> }) {
    return this.httpClient.post<{ doc: DocumentInterface; score: number; relevanceScore?: number }[]>(
      this.apiBaseUrl + '/' + id + '/test',
      options
    )
  }

  similaritySearch(
    query: string,
    options: { k?: number; filter?: VectorStoreInterface['FilterType']; role: string; score: number }
  ) {
    return this.httpClient.post<DocumentInterface[]>(`${this.apiBaseUrl}/similarity-search`, { query, options })
  }

  maxMarginalRelevanceSearch(
    query: string,
    options: MaxMarginalRelevanceSearchOptions<VectorStoreInterface['FilterType']> & {
      role: string
    }
  ) {
    return this.httpClient.post<DocumentInterface[]>(`${this.apiBaseUrl}/mmr-search`, { query, options })
  }

  createExternal(entity: Partial<IKnowledgebase>) {
    return this.httpClient.post<IKnowledgebase>(this.apiBaseUrl + '/external', entity)
  }

  getStatisticsKnowledgebases(timeRange: string[]) {
    return this.httpClient.get<number>(
      this.apiBaseUrl + `/statistics/knowledgebases`, {
      params: this.timeRangeToParams(new HttpParams(), timeRange)
    })
  }

  timeRangeToParams(params: HttpParams, timeRange: string[]) {
    if (timeRange[0]) {
      params = params.set('start', timeRange[0])
    }
    if (timeRange[1]) {
      params = params.set('end', timeRange[1])
    }
    return params
  }
}
