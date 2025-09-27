import { HttpEventType, HttpParams } from '@angular/common/http'
import { inject, Injectable, signal } from '@angular/core'
import { DocumentInterface } from '@langchain/core/documents'
import { MaxMarginalRelevanceSearchOptions, VectorStoreInterface } from '@langchain/core/vectorstores'
import { _TFile, API_PREFIX, DocumentMetadata, IDocumentChunkerProvider, IDocumentProcessorProvider, IDocumentSourceProvider, IDocumentUnderstandingProvider, IKnowledgebase, IKnowledgebaseTask, IStorageFile, PaginationParams, toHttpParams } from '@metad/cloud/state'
import { NGXLogger } from 'ngx-logger'
import { catchError, shareReplay, switchMap, tap } from 'rxjs/operators'
import { XpertWorkspaceBaseCrudService } from './xpert-workspace.service'
import { getErrorMessage } from '../types'
import { of } from 'rxjs'

const API_KNOWLEDGEBASE = API_PREFIX + '/knowledgebase'

@Injectable({ providedIn: 'root' })
export class KnowledgebaseService extends XpertWorkspaceBaseCrudService<IKnowledgebase> {
  readonly #logger = inject(NGXLogger)

  // Package into hot stream + cache the last value
  readonly documentSourceStrategies$ = this.getDocumentSourceStrategies().pipe(shareReplay(1))
  readonly documentTransformerStrategies$ = this.getDocumentTransformerStrategies().pipe(shareReplay(1))
  readonly understandingStrategies$ = this.getUnderstandingStrategies().pipe(shareReplay(1))
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

  getUnderstandingStrategies() {
    return this.httpClient.get<{meta: IDocumentUnderstandingProvider; requireVisionModel: boolean}[]>(this.apiBaseUrl + '/understanding/strategies')
  }

  getDocumentSourceStrategies() {
    return this.httpClient.get<{meta: IDocumentSourceProvider; integration: {service: string}}[]>(this.apiBaseUrl + '/source/strategies')
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

  // Pipeline
  getTask(id: string, taskId: string) {
    return this.httpClient.get<IKnowledgebaseTask>(this.apiBaseUrl + `/${id}/task/${taskId}`)
  }

  uploadFile(id: string, file: File, path = '') {
    const formData = new FormData()
    formData.append('file', file)
    return this.httpClient.post<_TFile>(this.apiBaseUrl + `/${id}/file`, formData, {
      observe: 'events',
      reportProgress: true
    })
  }
}

export class KnowledgeFileUploader {

  readonly progress = signal<number>(0)
  readonly storageFile = signal<_TFile>(null)
  readonly uploadedUrl = signal<string | null>(null)

  readonly error = signal<string>(null)

  constructor(
    private readonly knowledgebaseId: string,
    private readonly kbAPI: KnowledgebaseService,
    public readonly file: File,
    private readonly path = ''
  ) {}

  upload() {
    this.kbAPI.uploadFile(this.knowledgebaseId, this.file, this.path).pipe(
      tap((event) => {
        switch (event.type) {
          case HttpEventType.UploadProgress:
            this.progress.set((event.loaded / event.total) * 100)
            break
          case HttpEventType.Response:
            this.progress.set(100)
            this.storageFile.set(event.body)
            this.uploadedUrl.set(event.body.url); // Assuming response contains URL
            break
        }
      }),
      catchError((error) => {
        this.error.set(getErrorMessage(error))
        return of(null)
      })
    ).subscribe()
  }

}