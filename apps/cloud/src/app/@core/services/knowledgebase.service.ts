import { HttpEventType, HttpParams } from '@angular/common/http'
import { inject, Injectable, signal } from '@angular/core'
import { DocumentInterface } from '@langchain/core/documents'
import { MaxMarginalRelevanceSearchOptions, VectorStoreInterface } from '@langchain/core/vectorstores'
import {
  _TFile,
  API_PREFIX,
  DocumentMetadata,
  IDocumentChunkerProvider,
  IDocumentProcessorProvider,
  IDocumentSourceProvider,
  IDocumentUnderstandingProvider,
  IKnowledgebase,
  IKnowledgebaseTask,
  IKnowledgeDocument,
  PaginationParams,
  toHttpParams
} from '@metad/cloud/state'
import { NGXLogger } from 'ngx-logger'
import { BehaviorSubject, interval, of } from 'rxjs'
import { catchError, filter, shareReplay, switchMap, takeWhile, tap } from 'rxjs/operators'
import { getErrorMessage, uuid } from '../types'
import { XpertWorkspaceBaseCrudService } from './xpert-workspace.service'

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
    return this.httpClient.get<{ meta: IDocumentUnderstandingProvider; requireVisionModel: boolean }[]>(
      this.apiBaseUrl + '/understanding/strategies'
    )
  }

  getDocumentSourceStrategies() {
    return this.httpClient.get<{ meta: IDocumentSourceProvider; integration: { service: string } }[]>(
      this.apiBaseUrl + '/source/strategies'
    )
  }

  test(id: string, options: { query: string; k: number; score: number; filter?: Record<string, unknown> }) {
    return this.httpClient.post<DocumentInterface<DocumentMetadata>[]>(this.apiBaseUrl + '/' + id + '/test', options)
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
    return this.httpClient.get<number>(this.apiBaseUrl + `/statistics/knowledgebases`, {
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
  getTask(id: string, taskId: string, params?: PaginationParams<IKnowledgebaseTask>) {
    return this.httpClient.get<IKnowledgebaseTask>(this.apiBaseUrl + `/${id}/task/${taskId}`, {
      params: params ? toHttpParams(params) : null
    })
  }

  createTask(id: string, task: Partial<IKnowledgebaseTask>) {
    return this.httpClient.post<IKnowledgebaseTask>(this.apiBaseUrl + `/${id}/task`, task)
  }

  processTask(id: string, taskId: string, body: { sources?: { [key: string]: { documents: string[] } }; stage: 'preview'| 'prod';  options?: any }) {
    return this.httpClient.post<IKnowledgebaseTask>(this.apiBaseUrl + `/${id}/task/${taskId}/process`, body)
  }

  /**
   * 
   * @param taskId 
   * @param period 每 2 秒轮询一次
   * @returns 
   */
  pollTaskStatus(id: string, taskId: string, period = 2000) {
    return interval(period).pipe( 
      switchMap(() => this.getTask(id, taskId)),
      tap((res) => console.log('Current status:', res.status)),
      takeWhile((res) => res.status === 'pending' || res.status === 'running', true) // true 表示包含 'done' 的最后一次
    )
  }

  uploadFile(id: string, file: File, parentId = '') {
    const formData = new FormData()
    formData.append('file', file)
    if (parentId) {
      formData.append('parentId', parentId)
    }
    return this.httpClient.post<_TFile>(this.apiBaseUrl + `/${id}/file`, formData, {
      observe: 'events',
      reportProgress: true
    })
  }

  previewFile(id: string, name: string) {
    return this.httpClient.get<DocumentInterface>(this.apiBaseUrl + `/${id}/file/${encodeURIComponent(name)}/preview`)
  }
}

/**
 * Helper class to upload a file to knowledgebase with progress tracking
 */
export class KnowledgeFileUploader {
  readonly progress = signal<number>(0)
  readonly document = signal<Partial<IKnowledgeDocument>>(null)
  readonly uploadedUrl = signal<string | null>(null)
  readonly document$ = new BehaviorSubject<Partial<IKnowledgeDocument> | null>(null)

  readonly status = signal<'pending' | 'uploading' | 'done' | 'error'>('pending')
  readonly error = signal<string>(null)

  readonly preview$ = this.document$.pipe(
    filter((doc) => !!doc?.filePath),
    switchMap((doc) => this.kbAPI.previewFile(this.knowledgebaseId, doc.filePath)),
    catchError((error) => {
      console.error('Failed to load preview', error)
      return of(null)
    }),
    shareReplay(1)
  )

  constructor(
    private readonly knowledgebaseId: string,
    private readonly kbAPI: KnowledgebaseService,
    public readonly file: File,
    private readonly parentId = ''
  ) {}

  upload() {
    this.status.set('uploading')
    this.error.set(null)
    this.kbAPI
      .uploadFile(this.knowledgebaseId, this.file, this.parentId)
      .pipe(
        tap((event) => {
          switch (event.type) {
            case HttpEventType.UploadProgress:
              this.progress.set((event.loaded / event.total) * 100)
              break
            case HttpEventType.Response:
              this.progress.set(100)
              this.document$.next({
                ...event.body,
                id: uuid(),
                name: this.file.name,
                size: `${this.file.size}`,
                type: this.file.type?.split('/').pop() || 'unknown'
              })
              this.document.set(this.document$.value)
              this.uploadedUrl.set(event.body.fileUrl) // Assuming response contains URL
              this.status.set('done')
              break
          }
        }),
        catchError((error) => {
          this.status.set('error')
          this.error.set(getErrorMessage(error))
          return of(null)
        })
      )
      .subscribe()
  }

  formatSize(): string {
    const size = this.file.size
    if (!size) return ''
    if (size < 1024) return `${size}B`
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)}KB`
    return `${(size / (1024 * 1024)).toFixed(1)}MB`
  }
}
