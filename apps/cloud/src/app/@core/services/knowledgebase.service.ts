import { HttpParams } from '@angular/common/http'
import { inject, Injectable } from '@angular/core'
import { DocumentInterface } from '@langchain/core/documents'
import { MaxMarginalRelevanceSearchOptions, VectorStoreInterface } from '@langchain/core/vectorstores'
import { API_PREFIX, DocumentMetadata, IDocumentChunkerProvider, IDocumentProcessorProvider, IDocumentSourceProvider, IDocumentUnderstandingProvider, IKnowledgebase, PaginationParams, toHttpParams } from '@metad/cloud/state'
import { NGXLogger } from 'ngx-logger'
import { shareReplay, switchMap } from 'rxjs/operators'
import { XpertWorkspaceBaseCrudService } from './xpert-workspace.service'

const API_KNOWLEDGEBASE = API_PREFIX + '/knowledgebase'

@Injectable({ providedIn: 'root' })
export class KnowledgebaseService extends XpertWorkspaceBaseCrudService<IKnowledgebase> {
  readonly #logger = inject(NGXLogger)

  // Package into hot stream + cache the last value
  readonly documentSourceStrategies$ = this.getDocumentSourceStrategies().pipe(shareReplay(1))
  readonly documentTransformerStrategies$ = this.getDocumentTransformerStrategies().pipe(shareReplay(1))
  readonly imageUnderstandingStrategies$ = this.getImageUnderstandingStrategies().pipe(shareReplay(1))
  readonly textSplitterStrategies$ = this.getTextSplitterStrategies().pipe(shareReplay(1))

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
    return this.httpClient.get<IDocumentChunkerProvider[]>(this.apiBaseUrl + '/text-splitter/strategies')
  }

  getDocumentTransformerStrategies() {
    return this.httpClient.get<IDocumentProcessorProvider[]>(this.apiBaseUrl + '/transformer/strategies')
  }

  getImageUnderstandingStrategies() {
    return this.httpClient.get<IDocumentUnderstandingProvider[]>(this.apiBaseUrl + '/image-understanding/strategies')
  }

  getDocumentSourceStrategies() {
    return this.httpClient.get<IDocumentSourceProvider[]>(this.apiBaseUrl + '/source/strategies')
  }

  test(id: string, options: { query: string; k: number; score: number; filter?: Record<string, unknown> }) {
    return this.httpClient.post<DocumentInterface<DocumentMetadata>[]>(
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

  createPipeline(id: string) {
    return this.httpClient.post<IKnowledgebase>(this.apiBaseUrl + `/${id}/pipeline`, {})
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
